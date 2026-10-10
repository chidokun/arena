/**
 * Gossip store: bảng khoá–giá trị được nhân bản giữa các peer, hội tụ cuối cùng (eventual consistency).
 *
 * - Mỗi bản ghi mang phiên bản (c, w): c là đồng hồ Lamport, w là uid người ghi. Bản ghi "mới hơn" thắng
 *   (last-writer-wins), hoà thì so w — mọi peer áp cùng một quy tắc nên cùng hội tụ về một trạng thái.
 * - Lan truyền theo hai đường:
 *   1. Đẩy nóng (rumor mongering): bản ghi vừa đổi được đẩy ngay cho peer kề; peer nào thấy mới thì đẩy
 *      tiếp cho `fanout` peer ngẫu nhiên, tối đa MAX_HOPS bước.
 *   2. Chống phân kỳ (anti-entropy push–pull): mỗi chu kỳ gửi bản tóm tắt phiên bản (digest) tới `fanout`
 *      peer ngẫu nhiên; bên nhận trả phần mình mới hơn và xin phần mình còn thiếu. Nhờ vậy cả khi lưới
 *      WebRTC không đủ cặp (NAT chặn) trạng thái vẫn đi vòng qua peer trung gian.
 * - Tin phát tán một lần (chat, sticker) đi theo kênh "rumor" ngập lụt có khử trùng lặp theo id.
 */

export type Entry<V = unknown> = { k: string; v: V; c: number; w: string };
export type Digest = Record<string, [number, string]>;

export type WireKind = "dig" | "dlt" | "req" | "rum";

/** Lớp vận chuyển tối thiểu gossip cần; Trystero hoặc bộ giả lập trong test đều đáp ứng được. */
export interface Wire {
  peers(): string[];
  send(kind: WireKind, data: unknown, to?: string | string[]): void;
  on(kind: WireKind, fn: (data: unknown, from: string) => void): void;
  onPeerJoin(fn: (peer: string) => void): void;
}

export type Rumor<P = unknown> = { id: string; t: string; p: P };

type DeltaMsg = { e: Entry[]; h: number };
type RumorMsg = Rumor & { h: number; d?: 1 };

const MAX_HOPS = 3;
const RUMOR_HOPS = 6;
const SEEN_LIMIT = 2000;

export function isNewer(a: { c: number; w: string }, b?: { c: number; w: string }) {
  if (!b) return true;
  return a.c > b.c || (a.c === b.c && a.w > b.w);
}

function isEntry(x: unknown): x is Entry {
  const e = x as Entry;
  return !!e && typeof e.k === "string" && typeof e.c === "number" && Number.isFinite(e.c) && typeof e.w === "string";
}

function sample<T>(list: T[], n: number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export type GossipOptions = {
  fanout?: number;
  intervalMs?: number;
  /** Từ chối bản ghi không hợp lệ (vd. ghi đè khoá của người khác). Phải tất định để mọi peer hội tụ. */
  accept?: (e: Entry) => boolean;
};

export type Snapshot = { clock: number; entries: Entry[] };

export class Gossip {
  private map = new Map<string, Entry>();
  private tombs = new Map<string, { c: number; w: string }>();
  private clock = 0;
  private seen = new Set<string>();
  private seenOrder: string[] = [];
  private rumorSeq = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private changeFns = new Set<(keys: string[], remote: boolean) => void>();
  private rumorFns = new Set<(r: Rumor, from: string | null, replayed: boolean) => void>();
  private readonly fanout: number;
  private readonly intervalMs: number;
  private readonly accept: (e: Entry) => boolean;

  readonly self: string;
  private wire: Wire;

  constructor(self: string, wire: Wire, opts: GossipOptions = {}) {
    this.self = self;
    this.wire = wire;
    this.fanout = opts.fanout ?? 3;
    this.intervalMs = opts.intervalMs ?? 1000;
    this.accept = opts.accept ?? (() => true);
    wire.on("dig", (d, from) => this.onDigest(d as Digest, from));
    wire.on("dlt", (d, from) => {
      const m = d as DeltaMsg;
      if (m && Array.isArray(m.e)) this.merge(m.e, from, m.h ?? MAX_HOPS);
    });
    wire.on("req", (d, from) => {
      if (!Array.isArray(d)) return;
      const e = (d as string[]).map((k) => this.map.get(k)).filter((x): x is Entry => !!x);
      if (e.length) wire.send("dlt", { e, h: MAX_HOPS } satisfies DeltaMsg, from);
    });
    wire.on("rum", (d, from) => this.handleRumor(d as RumorMsg, from));
    // Peer mới vào: đồng bộ ngay thay vì chờ chu kỳ kế tiếp.
    wire.onPeerJoin((peer) => wire.send("dig", this.digest(), peer));
  }

  start() {
    if (!this.timer) this.timer = setInterval(() => this.tick(), this.intervalMs);
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ---------- đọc ----------

  get<V>(k: string): V | undefined {
    return this.map.get(k)?.v as V | undefined;
  }

  entry<V>(k: string): Entry<V> | undefined {
    return this.map.get(k) as Entry<V> | undefined;
  }

  /** Các bản ghi có khoá bắt đầu bằng `prefix`, bỏ qua bản ghi đã xoá (giá trị null). */
  scan<V>(prefix: string): Entry<V>[] {
    const out: Entry<V>[] = [];
    for (const e of this.map.values()) if (e.k.startsWith(prefix) && e.v != null) out.push(e as Entry<V>);
    return out;
  }

  size() {
    return this.map.size;
  }

  // ---------- ghi ----------

  /** Ghi một khoá. `eager=false` cho dữ liệu nhịp tim: chỉ lan qua chu kỳ anti-entropy để đỡ ồn mạng. */
  set<V>(k: string, v: V, eager = true): Entry<V> {
    const prev = this.map.get(k);
    const tomb = this.tombs.get(k);
    this.clock = Math.max(this.clock, prev?.c ?? 0, tomb?.c ?? 0) + 1;
    const e: Entry<V> = { k, v, c: this.clock, w: this.self };
    this.map.set(k, e);
    this.tombs.delete(k);
    this.emit([k], false);
    if (eager) this.wire.send("dlt", { e: [e], h: 0 } satisfies DeltaMsg);
    return e;
  }

  remove(k: string) {
    if (this.map.has(k)) this.set(k, null);
  }

  /** Gỡ hẳn khoá khỏi bộ nhớ cục bộ (dọn rác) và nhớ phiên bản để bản cũ không quay lại qua anti-entropy. */
  prune(k: string) {
    const e = this.map.get(k);
    if (!e) return;
    this.tombs.set(k, { c: e.c, w: e.w });
    this.map.delete(k);
  }

  // ---------- hợp nhất ----------

  merge(list: unknown[], from: string | null, hops: number): string[] {
    const changed: Entry[] = [];
    for (const raw of list) {
      if (!isEntry(raw)) continue;
      const e = raw;
      if (e.c > this.clock) this.clock = e.c;
      const tomb = this.tombs.get(e.k);
      if (tomb && !isNewer(e, tomb)) continue;
      if (!isNewer(e, this.map.get(e.k))) continue;
      if (!this.accept(e)) continue;
      this.map.set(e.k, { k: e.k, v: e.v, c: e.c, w: e.w });
      this.tombs.delete(e.k);
      changed.push(e);
    }
    if (!changed.length) return [];
    this.emit(
      changed.map((e) => e.k),
      true,
    );
    if (hops < MAX_HOPS) {
      const targets = sample(
        this.wire.peers().filter((p) => p !== from),
        this.fanout,
      );
      if (targets.length) this.wire.send("dlt", { e: changed, h: hops + 1 } satisfies DeltaMsg, targets);
    }
    return changed.map((e) => e.k);
  }

  digest(): Digest {
    const d: Digest = {};
    for (const e of this.map.values()) d[e.k] = [e.c, e.w];
    return d;
  }

  /** Một vòng anti-entropy: gửi digest tới vài peer ngẫu nhiên. */
  tick() {
    const targets = sample(this.wire.peers(), this.fanout);
    if (targets.length) this.wire.send("dig", this.digest(), targets);
  }

  private onDigest(d: Digest, from: string) {
    if (!d || typeof d !== "object") return;
    const give: Entry[] = [];
    const want: string[] = [];
    for (const e of this.map.values()) {
      const theirs = d[e.k];
      if (!theirs || isNewer(e, { c: theirs[0], w: theirs[1] })) give.push(e);
    }
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (!Array.isArray(v)) continue;
      const theirs = { c: Number(v[0]), w: String(v[1]) };
      if (theirs.c > this.clock) this.clock = theirs.c;
      const tomb = this.tombs.get(k);
      if (tomb && !isNewer(theirs, tomb)) continue;
      if (isNewer(theirs, this.map.get(k))) want.push(k);
    }
    if (give.length) this.wire.send("dlt", { e: give, h: MAX_HOPS } satisfies DeltaMsg, from);
    if (want.length) this.wire.send("req", want, from);
  }

  // ---------- rumor: tin phát tán một lần ----------

  /** Phát một tin tới mọi người trong lưới (ngập lụt có khử trùng lặp). Trả về tin đã phát. */
  broadcast<P>(t: string, p: P): Rumor<P> {
    const id = `${this.self}:${Date.now().toString(36)}:${(this.rumorSeq++).toString(36)}`;
    this.markSeen(id);
    const r: Rumor<P> = { id, t, p };
    this.wire.send("rum", { ...r, h: 0 } satisfies RumorMsg);
    return r;
  }

  /** Gửi lại các tin cũ cho một peer (vd. lịch sử chat cho người mới vào), không lan tiếp. */
  replay(list: Rumor[], to: string) {
    for (const r of list) this.wire.send("rum", { ...r, h: RUMOR_HOPS, d: 1 } satisfies RumorMsg, to);
  }

  /** `replayed`: tin cũ được gửi lại (`replay`), không phải tin vừa phát. */
  onRumor(fn: (r: Rumor, from: string | null, replayed: boolean) => void) {
    this.rumorFns.add(fn);
    return () => this.rumorFns.delete(fn);
  }

  private markSeen(id: string) {
    this.seen.add(id);
    this.seenOrder.push(id);
    if (this.seenOrder.length > SEEN_LIMIT) this.seen.delete(this.seenOrder.shift()!);
  }

  private handleRumor(m: RumorMsg, from: string) {
    if (!m || typeof m.id !== "string" || typeof m.t !== "string" || this.seen.has(m.id)) return;
    this.markSeen(m.id);
    const r: Rumor = { id: m.id, t: m.t, p: m.p };
    for (const fn of this.rumorFns) fn(r, from, !!m.d);
    const h = m.h ?? RUMOR_HOPS;
    if (!m.d && h < RUMOR_HOPS) {
      const targets = this.wire.peers().filter((p) => p !== from);
      if (targets.length) this.wire.send("rum", { ...r, h: h + 1 } satisfies RumorMsg, targets);
    }
  }

  // ---------- sự kiện & lưu trữ ----------

  onChange(fn: (keys: string[], remote: boolean) => void) {
    this.changeFns.add(fn);
    return () => this.changeFns.delete(fn);
  }

  private emit(keys: string[], remote: boolean) {
    for (const fn of this.changeFns) fn(keys, remote);
  }

  snapshot(): Snapshot {
    return { clock: this.clock, entries: [...this.map.values()] };
  }

  restore(s: Snapshot) {
    if (!s || !Array.isArray(s.entries)) return;
    this.clock = Math.max(this.clock, Number(s.clock) || 0);
    this.merge(s.entries, null, MAX_HOPS);
  }
}

/**
 * Bộ phát hiện lỗi kiểu nhịp tim (heartbeat): mỗi peer định kỳ ghi `hb` = giờ máy mình vào bản ghi hiện diện;
 * peer khác ghi lại *giờ cục bộ* lúc thấy `hb` tăng. Quá `timeoutMs` không tăng thì coi như đã rời —
 * không phụ thuộc đồng hồ giữa các máy lệch nhau.
 */
export class Liveness {
  private seen = new Map<string, { hb: number; at: number; left: boolean }>();

  private timeoutMs: number;
  private now: () => number;

  constructor(timeoutMs = 10000, now: () => number = () => Date.now()) {
    this.timeoutMs = timeoutMs;
    this.now = now;
  }

  observe(id: string, hb: number, left = false) {
    const cur = this.seen.get(id);
    const now = this.now();
    if (left) {
      this.seen.set(id, { hb, at: 0, left: true });
      return;
    }
    if (!cur) {
      // Lần đầu thấy: bản ghi quá cũ theo đồng hồ của chính người ghi (nới rộng vì lệch giờ) thì coi như đã chết.
      const stale = Date.now() - hb > this.timeoutMs * 3;
      this.seen.set(id, { hb, at: stale ? 0 : now, left: false });
    } else if (hb > cur.hb) {
      this.seen.set(id, { hb, at: now, left: false });
    }
  }

  alive(id: string) {
    const s = this.seen.get(id);
    return !!s && !s.left && this.now() - s.at < this.timeoutMs;
  }

  /** Bao lâu (ms) kể từ lần cuối thấy còn sống; Infinity nếu chưa từng thấy. */
  silentFor(id: string) {
    const s = this.seen.get(id);
    if (!s) return Infinity;
    return s.left || s.at === 0 ? Infinity : this.now() - s.at;
  }

  forget(id: string) {
    this.seen.delete(id);
  }
}
