/**
 * Phòng Vẽ Đoán. Máy chủ phòng điều hành (luật thuần ở `lib/games/draw-guess.ts`): bốc ba từ cho người vẽ, chấm lời
 * đoán, mở gợi ý, cộng điểm. Ai trong phòng cũng nhận được mọi bản ghi gossip nên từ khoá và lời đoán được niêm phong
 * (`seal.ts`) giữa từng người và chủ phòng:
 *
 *   meta.dw          — phần công khai: thứ tự vẽ, lượt, giai đoạn, hạn chót, khung đáp án, ai đoán đúng, điểm.
 *   meta.dwUsed      — mã các từ đã chơi trong phòng — không bốc lại.
 *   s:<ván>:<uid>    — chủ phòng gửi riêng: người vẽ nhận ba từ để chọn; người đoán nhận những lời đoán gần đúng, và
 *                      đáp án khi đã đoán đúng.
 *   v:<ván>:<uid>    — người vẽ chọn từ thứ mấy (chỉ số — vô nghĩa với ai không có bộ từ).
 *   a:<ván>:<uid>    — các lời đoán của mình trong lượt, niêm phong gửi chủ phòng.
 *   g:<ván>          — lời đoán sai của lượt hiện tại, chủ phòng công khai; mọi máy chép vào khung chat.
 *   d:<ván>:<lượt>.<trang>:<uid> — tranh của người vẽ: các thao tác (nét, đổ màu, hoàn tác, xoá), `PAGE` thao tác mỗi
 *                      trang — trang đầy không đổi nữa nên mỗi lần vẽ chỉ gửi lại trang cuối. Hết lượt thì mọi máy dọn.
 *
 * Nét đang vẽ dở đi theo kênh rumor `ink` (chỉ phần điểm mới, vài chục lần mỗi giây) để người xem thấy nét chạy ngay;
 * vẽ xong nét mới ghi vào trang. Lời đoán gõ trong khung chat: đang lượt vẽ thì tin của người đoán là lời đoán (máy mình
 * hiện ngay, máy người khác thấy khi chủ phòng chấm sai); người đã biết đáp án không nhắn được tin có đáp án.
 *
 * Bí mật của lượt chỉ nằm trên máy chủ phòng (sessionStorage — tải lại trang vẫn giữ); chủ phòng mất kết nối thì người
 * kế nhiệm dừng lượt đang dở (không có đáp án) rồi điều hành tiếp từ lượt sau.
 */
import {
  GUESS_LEN,
  GUESS_MAX,
  H,
  leaks,
  MAX_OPS,
  MAX_POINTS,
  MIN_PLAYERS,
  newMatch,
  normOptions,
  PAGE,
  parseOp,
  standings,
  tick,
  totalTurns,
  W,
  winnersOf,
  wordOf,
  type DwOptions,
  type DwPublic,
  type Feed,
  type Hit,
  type HostState,
  type Op,
  type Secret,
  type Stroke,
} from "../games/draw-guess";
import { TIERS } from "../games/draw-guess-words";
import type { Profile } from "../identity";
import type { Rumor } from "./gossip";
import type { Lobby, RoomAd } from "./lobby";
import { RoomSession, type ChatMsg, type Member, type Meta, type Result, type SeatView, type StickerId } from "./room";
import { Keyring, type KeyStore } from "./seal";
import type { Channel } from "./wire";

/** Người chơi mất kết nối chừng này thì không còn tính trong ván; còn dưới hai người thì dừng ván. */
const LEFT_MS = 60000;

const hostKey = (id: string) => `arena:dw:${id}`;
const mineKey = (id: string) => `arena:dw:${id}:mine`;
const keyKey = (uid: string) => `arena:key:${uid}`;

function sessionStore(key: string): KeyStore {
  return {
    get: () => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (v) => {
      try {
        sessionStorage.setItem(key, v);
      } catch {}
    },
  };
}

/** Hộp chủ phòng gửi riêng: người vẽ nhận ba từ để chọn; người đoán nhận lời đoán gần đúng và đáp án khi đã đúng. */
type Private = { turn: number; choices?: string[]; near?: number[]; word?: string };
/** Hộp lời đoán gửi chủ phòng. */
type Guesses = { turn: number; list: string[] };
/** Người vẽ chọn từ. */
type Pick = { turn: number; pick: number };
/** Gói nét đang vẽ dở: ván, lượt, thao tác thứ mấy, từ điểm thứ mấy, màu, cỡ, các điểm mới. */
type Ink = { r: number; t: number; n: number; o: number; c: number; z: number; p: number[] };

export type GuessState = "wait" | "wrong" | "near" | "right";

export type DwMatch = {
  round: number;
  pub: DwPublic;
  /** Thứ tự vẽ. */
  lineup: SeatView[];
  role: "drawer" | "guesser" | "watcher";
  /** Từ khoá mình biết: người vẽ (đã chọn), người đã đoán đúng; ai cũng biết lúc lộ đáp án. */
  word?: string;
  /** Người vẽ, lúc chọn từ: ba từ dễ, vừa, khó. */
  choices?: string[];
  /** Tranh của lượt hiện tại. */
  ops: Op[];
  /** Mình đang được vẽ. */
  canDraw: boolean;
  /** Lời đoán của mình trong lượt và kết quả chấm. */
  guesses: { text: string; state: GuessState }[];
  hit?: Hit;
  /** Hạn chót của giai đoạn theo giờ máy mình. */
  deadline: number;
  result?: Result;
};

export type DwView = {
  opts: DwOptions;
  match?: DwMatch;
  /** Người trong ghế mà máy chưa có khoá niêm phong — chưa bắt đầu được. */
  unkeyed: string[];
  words: { used: number; total: number };
};

export class DrawGuessRoom extends RoomSession<DwView> {
  readonly game = "draw-guess";
  private keys: Keyring | null = null;
  /** Bí mật của lượt (chỉ có ở máy chủ phòng). */
  private secret: Secret | null = null;
  private secretSaved = "";
  /** Hộp niêm phong đã mở: của mình (`s:`), và chủ phòng mở hộp lời đoán (`a:`). */
  private opened = new Map<string, { c: number; w: string; peer: string; v: unknown }>();
  private opening = new Set<string>();
  /** Chủ phòng: chữ ký nội dung hộp đã gửi từng người, và các hộp đang niêm phong. */
  private boxSig = new Map<string, string>();
  private boxBusy = new Set<string>();
  /** Lời đoán của mình trong lượt hiện tại. */
  private mine: Guesses & { round: number } = { round: -1, turn: -1, list: [] };
  private mineSeal = { busy: false, sig: "" };
  private ops = { sig: "", list: [] as Op[] };
  /** Nét người vẽ đang vẽ dở (theo thứ tự thao tác), nhận qua rumor. */
  private ink = { key: "", strokes: new Map<number, Stroke>() };
  private inkFns = new Set<() => void>();
  private stageSeen = { key: "", at: 0 };
  private heard = "";
  /** Id các câu đã rao trong lượt — tin cũ trôi khỏi khung chat cũng không rao lại. */
  private said = { key: "", ids: new Set<string>() };

  constructor(id: string, me: string, profile: Profile, lobby: Lobby, channel: Channel) {
    super(id, me, profile, lobby, channel);
    try {
      const raw = sessionStorage.getItem(hostKey(id));
      if (raw) this.secret = JSON.parse(raw) as Secret;
      const mine = sessionStorage.getItem(mineKey(id));
      if (mine) this.mine = JSON.parse(mine) as typeof this.mine;
    } catch {}
    void Keyring.create(sessionStore(keyKey(me))).then((k) => {
      this.keys = k;
      this.refresh();
      this.react();
    });
    this.gossip.onChange((keys) => {
      for (const k of keys) if (k.startsWith("s:") || k.startsWith("a:")) this.unseal(k);
    });
    this.gossip.onRumor((r) => this.receiveInk(r));
  }

  protected memberExtra(): Partial<Member> {
    return this.keys ? { key: this.keys.pub } : {};
  }

  private keyOf(uid: string) {
    return this.gossip.get<Member>(`p:${uid}`)?.key;
  }

  /** Ván đang chơi (meta.dw khớp ván hiện tại). */
  private livePub(m = this.meta()) {
    const pub = m?.dw;
    if (!m || m.status !== "playing" || !pub || pub.round !== m.round) return null;
    return { m, pub };
  }

  // ---------- niêm phong ----------

  /** Mở hộp: của chủ phòng gửi mình (`s:<ván>:<mình>`), hoặc — chủ phòng — hộp lời đoán của từng người (`a:`). */
  private unseal(k: string) {
    const m = this.meta();
    if (!this.keys || !m || this.opening.has(k)) return;
    const [kind, r, uid] = k.split(":");
    if (Number(r) !== m.round) return;
    if (kind === "s" && uid !== this.me) return;
    if (kind === "a" && m.host !== this.me) return;
    const peer = this.keyOf(kind === "s" ? m.host : uid);
    const e = this.gossip.entry<unknown>(k);
    const cur = this.opened.get(k);
    if (!peer || !e || typeof e.v !== "string") {
      if (cur) {
        this.opened.delete(k);
        this.store.invalidate();
      }
      return;
    }
    if (cur && cur.c === e.c && cur.w === e.w && cur.peer === peer) return;
    const keys = this.keys;
    this.opening.add(k);
    void keys.open(peer, k, e.v).then((v) => {
      this.opening.delete(k);
      this.opened.set(k, { c: e.c, w: e.w, peer, v });
      this.react();
      // Bản ghi có thể đã đổi trong lúc đang mở.
      this.unseal(k);
    });
  }

  private privateOf(m: Meta, pub: DwPublic): Private | undefined {
    const v = this.opened.get(`s:${m.round}:${this.me}`)?.v as Private | null | undefined;
    return v && v.turn === pub.turn ? v : undefined;
  }

  /** Chủ phòng: lời đoán (đã mở hộp) của một người trong ván. */
  private inboxOf(m: Meta, uid: string): Guesses | undefined {
    const v = this.opened.get(`a:${m.round}:${uid}`)?.v as Guesses | null | undefined;
    return v && Number.isInteger(v.turn) && Array.isArray(v.list) ? v : undefined;
  }

  /** Chủ phòng: nội dung hộp riêng cho từng người theo bí mật của lượt. */
  private privates(pub: DwPublic): Map<string, Private> {
    const out = new Map<string, Private>();
    const s = this.secret;
    if (!s || s.round !== pub.round || s.turn !== pub.turn || (pub.phase !== "pick" && pub.phase !== "draw")) return out;
    out.set(pub.drawer, { turn: pub.turn, choices: s.choices.map((id) => wordOf(id) ?? "") });
    const word = s.word !== undefined ? wordOf(s.word) : undefined;
    for (const u of pub.order) {
      if (u === pub.drawer) continue;
      const near = s.near[u];
      const hit = pub.hits.some((h) => h.u === u);
      if (near?.length || hit) out.set(u, { turn: pub.turn, ...(near?.length ? { near } : {}), ...(hit && word ? { word } : {}) });
    }
    return out;
  }

  /** Chủ phòng: gửi lại hộp riêng của người nào có nội dung mới (bộ từ, lời đoán gần đúng, đáp án khi đã đúng). */
  private publishSecrets(m: Meta) {
    const live = this.livePub(m);
    const keys = this.keys;
    if (!live || !keys) return;
    const round = m.round;
    for (const [uid, box] of this.privates(live.pub)) {
      // Hộp của chính mình thì đọc thẳng bí mật, không cần niêm phong.
      if (uid === this.me || this.boxBusy.has(uid)) continue;
      const peer = this.keyOf(uid);
      const sig = JSON.stringify([round, peer, box]);
      if (!peer || this.boxSig.get(uid) === sig) continue;
      const k = `s:${round}:${uid}`;
      this.boxBusy.add(uid);
      void keys.seal(peer, k, box).then(
        (sealed) => {
          this.boxBusy.delete(uid);
          if (this.meta()?.round !== round) return;
          this.gossip.set(k, sealed);
          this.boxSig.set(uid, sig);
          this.react();
        },
        () => this.boxBusy.delete(uid),
      );
    }
  }

  /** Gửi (lại) hộp lời đoán của mình cho chủ phòng — khi có lời đoán mới hoặc chủ phòng đổi khoá. */
  private flushGuesses(m: Meta) {
    const keys = this.keys;
    const peer = this.keyOf(m.host);
    const g = this.mine;
    if (!keys || !peer || this.mineSeal.busy || g.round !== m.round || !g.list.length) return;
    const sig = JSON.stringify([peer, g.round, g.turn, g.list]);
    if (sig === this.mineSeal.sig) return;
    const k = `a:${m.round}:${this.me}`;
    this.mineSeal.busy = true;
    void keys.seal(peer, k, { turn: g.turn, list: g.list } satisfies Guesses).then(
      (sealed) => {
        this.mineSeal.busy = false;
        if (this.meta()?.round !== m.round) return;
        this.gossip.set(k, sealed);
        this.mineSeal.sig = sig;
        this.react();
      },
      () => {
        this.mineSeal.busy = false;
      },
    );
  }

  private saveSecret(s: Secret | null) {
    this.secret = s;
    const raw = JSON.stringify(s);
    if (raw === this.secretSaved) return;
    this.secretSaved = raw;
    try {
      sessionStorage.setItem(hostKey(this.id), raw);
    } catch {}
  }

  // ---------- tranh ----------

  /** Các thao tác của tranh lượt hiện tại, đọc từ các trang liên tiếp của người vẽ (nhớ theo phiên bản trang). */
  private opsOf(m: Meta, pub: DwPublic): Op[] {
    const pages: unknown[][] = [];
    const vers: string[] = [];
    for (let k = 0; ; k++) {
      const e = this.gossip.entry<unknown>(`d:${m.round}:${pub.turn}.${k}:${pub.drawer}`);
      if (!e || !Array.isArray(e.v)) break;
      pages.push(e.v);
      vers.push(`${e.c}.${e.w}`);
      // Trang chưa đầy là trang cuối: trang sau (nếu đã tới trước) phải chờ trang này cập nhật xong mới nối được.
      if (e.v.length < PAGE) break;
    }
    const sig = `${m.round}:${pub.turn}:${pub.drawer}:${vers.join(",")}`;
    if (sig === this.ops.sig) return this.ops.list;
    const list: Op[] = [];
    outer: for (const page of pages)
      for (const raw of page.slice(0, PAGE)) {
        const op = parseOp(raw);
        if (!op || list.length >= MAX_OPS) break outer;
        list.push(op);
      }
    this.ops = { sig, list };
    return list;
  }

  /** Nét đang vẽ dở của người vẽ (thao tác thứ n → nét), để vẽ lên lớp trên của tranh. */
  liveInk(): ReadonlyMap<number, Stroke> {
    return this.ink.strokes;
  }

  /** Gọi lại mỗi khi nét đang vẽ dở thay đổi. */
  onInk(fn: () => void) {
    this.inkFns.add(fn);
    return () => {
      this.inkFns.delete(fn);
    };
  }

  /** Nhận gói nét vẽ dở của người vẽ qua rumor. */
  private receiveInk(x: Rumor) {
    if (x.t !== "ink") return;
    const live = this.livePub();
    const d = x.p as Ink;
    // Id rumor bắt đầu bằng uid người phát.
    const from = x.id.slice(0, x.id.indexOf(":"));
    if (!live || live.pub.phase !== "draw" || from !== live.pub.drawer || from === this.me || !d) return;
    if (d.r !== live.m.round || d.t !== live.pub.turn || !Number.isInteger(d.n) || !Number.isInteger(d.o) || d.o < 0) return;
    if (!Array.isArray(d.p) || d.p.length % 2 || d.p.length > MAX_POINTS * 2) return;
    if (!d.p.every((v, i) => Number.isInteger(v) && v >= 0 && v <= (i % 2 ? H : W))) return;
    this.syncLive(live.m, live.pub);
    if (d.n < this.opsOf(live.m, live.pub).length) return;
    const cur = this.ink.strokes.get(d.n);
    const head = cur && d.o > 0 ? cur.p.slice(0, d.o * 2) : [];
    const stroke = parseOp({ c: d.c, z: d.z, p: [...head, ...d.p].slice(0, MAX_POINTS * 2) });
    if (!stroke || !("c" in stroke)) return;
    this.ink.strokes.set(d.n, stroke);
    for (const fn of this.inkFns) fn();
  }

  /** Bỏ nét dở của lượt khác và nét đã ghi vào tranh. */
  private syncLive(m: Meta, pub: DwPublic) {
    const key = `${m.round}:${pub.turn}`;
    let changed = false;
    if (this.ink.key !== key) {
      this.ink = { key, strokes: new Map() };
      changed = true;
    }
    const done = this.opsOf(m, pub).length;
    for (const n of this.ink.strokes.keys())
      if (n < done) {
        this.ink.strokes.delete(n);
        changed = true;
      }
    if (changed) for (const fn of this.inkFns) fn();
  }

  /** Người vẽ: phát phần điểm mới của nét đang vẽ dở (thao tác thứ `n`, từ điểm thứ `from`). */
  sendInk(n: number, from: number, c: number, z: number, points: number[]) {
    const live = this.livePub();
    if (!live || live.pub.phase !== "draw" || live.pub.drawer !== this.me || !points.length) return;
    this.gossip.broadcast<Ink>("ink", { r: live.m.round, t: live.pub.turn, n, o: from, c, z, p: points });
  }

  /** Số thao tác hiện có của tranh — người vẽ đánh số nét mới theo đây (đọc thẳng gossip, không chờ giao diện). */
  opCount() {
    const live = this.livePub();
    return live ? this.opsOf(live.m, live.pub).length : 0;
  }

  /** Người vẽ: thêm một thao tác vào tranh (nét đã vẽ xong, đổ màu, hoàn tác, xoá). */
  draw(raw: Op): boolean {
    const live = this.livePub();
    const op = parseOp(raw);
    if (!live || !op || live.pub.phase !== "draw" || live.pub.drawer !== this.me) return false;
    const ops = this.opsOf(live.m, live.pub);
    if (ops.length >= MAX_OPS) return false;
    const page = Math.floor(ops.length / PAGE);
    this.gossip.set(`d:${live.m.round}:${live.pub.turn}.${page}:${this.me}`, [...ops.slice(page * PAGE), op]);
    this.react();
    return true;
  }

  // ---------- luật ----------

  protected begin(m: Meta) {
    const players = m.players.filter((u) => this.isOnline(u));
    if (!this.keys || players.length < MIN_PLAYERS || players.some((u) => !this.keyOf(u))) return false;
    const s = newMatch(m.round, players, normOptions(m.opts), m.dwUsed ?? [], { now: Date.now(), rand: Math.random, online: (u) => this.isOnline(u) });
    m.lineup = s.pub.order;
    m.dw = s.pub;
    this.saveSecret(s.secret);
    return true;
  }

  protected outcome(m: Meta): Result | undefined {
    const pub = m.dw;
    if (!pub || pub.round !== m.round) return { round: m.round, winner: null, winners: [], reason: "stop" };
    if (pub.phase !== "over") return;
    const winners = winnersOf(pub);
    return { round: m.round, winner: winners.length === 1 ? winners[0] : null, winners, reason: "points" };
  }

  protected hostPlay(m: Meta) {
    const pub = m.dw!;
    const gone = (u: string) => m.kicked.includes(u) || (u !== this.me && this.silentFor(u) >= LEFT_MS);
    if (pub.order.filter((u) => !gone(u)).length < MIN_PLAYERS) {
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
      return;
    }
    const feed = this.gossip.get<Feed>(`g:${m.round}`);
    const state: HostState = {
      pub,
      secret: this.secret,
      feed: feed && feed.turn === pub.turn && Array.isArray(feed.list) ? feed : { turn: pub.turn, list: [] },
      used: m.dwUsed ?? [],
    };
    const guesses: Record<string, Guesses | undefined> = {};
    for (const u of pub.order) guesses[u] = this.inboxOf(m, u);
    const pick = this.gossip.get<Pick>(`v:${m.round}:${pub.drawer}`);
    const next = tick(state, {
      now: Date.now(),
      rand: Math.random,
      online: (u) => !m.kicked.includes(u) && this.isOnline(u),
      silent: (u) => (m.kicked.includes(u) ? Infinity : u === this.me ? 0 : this.silentFor(u)),
      pick: pick && Number.isInteger(pick.turn) && Number.isInteger(pick.pick) ? pick : undefined,
      guesses,
    });
    if (next === state) return;
    m.dw = next.pub;
    if (next.used !== state.used) m.dwUsed = next.used;
    this.saveSecret(next.secret);
    if (next.feed !== state.feed) this.gossip.set(`g:${m.round}`, next.feed);
  }

  protected adExtra(m: Meta): Partial<RoomAd> {
    return m.status === "playing" ? { players: m.lineup.length } : {};
  }

  protected watch(m: Meta) {
    for (const k of this.opened.keys()) if (Number(k.split(":")[1]) !== m.round) this.opened.delete(k);
    for (const e of [...this.gossip.scan("s:"), ...this.gossip.scan("a:")]) this.unseal(e.k);
    const live = this.livePub(m);
    if (live) {
      // Tranh của các lượt đã qua: máy nào cũng dọn như nhau.
      for (const e of this.gossip.scan("d:")) {
        const [, r, slot] = e.k.split(":");
        if (Number(r) === m.round && Number(slot.split(".")[0]) < live.pub.turn) this.gossip.prune(e.k);
      }
      this.syncLive(m, live.pub);
      if (m.host === this.me) this.publishSecrets(m);
      if (this.mine.round === m.round && this.mine.turn === live.pub.turn) this.flushGuesses(m);
    }
    this.announce(m);
  }

  // ---------- rao ----------

  /** Đưa một tin vào khung chat đúng một lần mỗi lượt (theo id). */
  private once(id: string, msg: () => Omit<ChatMsg, "id">) {
    if (this.said.ids.has(id)) return;
    this.said.ids.add(id);
    this.pushChat({ id, ...msg() });
  }

  private say(id: string, text: string) {
    this.once(id, () => ({ uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true }));
  }

  /** Rao diễn biến vào khung chat — mỗi máy tự suy ra từ phần công khai, id cố định nên tải lại trang không rao lặp. */
  private announce(m: Meta) {
    const live = this.livePub(m);
    if (!live) return;
    const { pub } = live;
    const r = m.round;
    const t = pub.turn;
    const who = (u: string) => (u === this.me ? "Bạn" : this.nameOf(u));
    if (this.said.key !== `${r}:${t}`) this.said = { key: `${r}:${t}`, ids: new Set() };
    // Lời đoán sai: chép vào khung chat như tin của người đoán (lời đoán của mình đã hiện sẵn, cùng id).
    const feed = this.gossip.get<Feed>(`g:${r}`);
    if (feed && feed.turn === t && Array.isArray(feed.list))
      for (const f of feed.list) {
        if (!f || typeof f.u !== "string" || typeof f.t !== "string") continue;
        this.once(`dw-g:${r}:${t}:${f.u}:${f.i}`, () => {
          const p = this.gossip.get<Member>(`p:${f.u}`);
          return { uid: f.u, name: p?.name ?? "Ai đó", avatar: p?.avatar ?? "", color: p?.color ?? "", at: Date.now(), text: f.t.slice(0, GUESS_LEN) };
        });
      }
    for (const h of pub.hits) this.say(`dw-hit:${r}:${t}:${h.u}`, h.u === this.me ? `🎉 Bạn đoán đúng rồi! +${h.p} điểm` : `✅ ${who(h.u)} đã đoán đúng! +${h.p}`);
    // Lời đoán gần đúng: chỉ máy mình biết.
    const mine = this.mine.round === r && this.mine.turn === t ? this.mine.list : [];
    for (const i of this.privateOf(m, pub)?.near ?? (m.host === this.me && this.secret?.turn === t ? (this.secret.near[this.me] ?? []) : []))
      if (mine[i] !== undefined) this.say(`dw-near:${r}:${t}:${i}`, `🔥 “${mine[i]}” gần đúng rồi!`);
    // Chuyển giai đoạn rao sau cùng: ai vừa đoán đúng hiện trước câu lộ đáp án.
    const key = `${r}:${t}:${pub.phase}`;
    if (key !== this.heard) {
      this.heard = key;
      const n = pub.order.length;
      if (pub.phase === "pick") {
        const lap = pub.rounds > 1 && t % n === 0 ? `🔁 Vòng ${t / n + 1}/${pub.rounds} · ` : "";
        this.say(`dw-pick:${r}:${t}`, `${lap}✏️ Lượt ${t + 1}/${totalTurns(pub)}: ${pub.drawer === this.me ? "tới lượt bạn vẽ — chọn một từ!" : `${who(pub.drawer)} đang chọn từ…`}`);
      } else if (pub.phase === "draw") {
        this.say(`dw-draw:${r}:${t}`, pub.drawer === this.me ? "🖌️ Bắt đầu vẽ! Đừng viết chữ lên tranh nhé." : `🖌️ ${who(pub.drawer)} bắt đầu vẽ — gõ đáp án vào khung chat!`);
      } else if (pub.phase === "show" && pub.last) {
        const l = pub.last;
        const word = l.word ? `“${l.word}”` : "";
        const text =
          l.end === "skip"
            ? `⏭ ${who(l.drawer)} vắng mặt — bỏ qua lượt`
            : l.end === "lost"
              ? "⚠️ Chủ phòng vừa đổi — lượt này bị huỷ"
              : l.end === "away"
                ? `🚪 ${who(l.drawer)} đã rời đi — đáp án là ${word}`
                : l.end === "all"
                  ? `🎯 Cả bàn đã đoán ra! Đáp án là ${word}`
                  : `⏰ Hết giờ! Đáp án là ${word}${l.hits.length ? "" : " — chưa ai đoán ra"}`;
        this.say(`dw-show:${r}:${t}`, text);
      }
    }
  }

  // ---------- giao diện ----------

  /** Hạn chót theo giờ máy mình: đồng hồ hai máy khớp nhau thì dùng luôn giờ chủ phòng, lệch nhiều thì tính từ lúc thấy. */
  private deadlineOf(pub: DwPublic) {
    const key = `${pub.round}:${pub.turn}:${pub.phase}:${pub.since}`;
    if (this.stageSeen.key !== key) this.stageSeen = { key, at: Date.now() };
    const at = this.stageSeen.at;
    return at >= pub.since - 3000 && at <= pub.until + 3000 ? pub.until : at + (pub.until - pub.since);
  }

  /** Từ khoá mình đang biết trong lượt (người vẽ, chủ phòng có bộ từ, người đã đoán đúng). */
  private wordFor(m: Meta, pub: DwPublic): { word?: string; choices?: string[] } {
    const own = m.host === this.me && this.secret?.round === pub.round && this.secret.turn === pub.turn ? this.secret : null;
    const box = this.privateOf(m, pub);
    if (pub.drawer === this.me) {
      const choices = own ? own.choices.map((id) => wordOf(id) ?? "") : box?.choices;
      return { choices, word: pub.pick !== undefined ? choices?.[pub.pick] : undefined };
    }
    const hit = pub.hits.some((h) => h.u === this.me);
    if (!hit) return {};
    return { word: own?.word !== undefined ? wordOf(own.word) : box?.word };
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): DwView {
    const opts = normOptions(m.opts);
    const base: DwView = {
      opts,
      unkeyed: m.players.filter((u) => !this.keyOf(u)),
      words: { used: m.dwUsed?.length ?? 0, total: TIERS.reduce((n, t) => n + t.length, 0) },
    };
    const pub = m.dw;
    if (!pub || !m.round || pub.round !== m.round) return base;
    const playing = m.status === "playing";
    const role = !pub.order.includes(this.me) ? "watcher" : pub.drawer === this.me ? "drawer" : "guesser";
    const known = playing ? this.wordFor(m, pub) : {};
    const shown = pub.phase === "show" || pub.phase === "over" || !playing ? (pub.last?.word ?? undefined) : undefined;
    const hit = pub.hits.find((h) => h.u === this.me);
    const near = this.privateOf(m, pub)?.near ?? (m.host === this.me && this.secret?.turn === pub.turn ? this.secret.near[this.me] : undefined) ?? [];
    const feed = this.gossip.get<Feed>(`g:${m.round}`);
    const wrong = new Set(feed?.turn === pub.turn && Array.isArray(feed.list) ? feed.list.filter((f) => f?.u === this.me).map((f) => f.i) : []);
    const mine = this.mine.round === m.round && this.mine.turn === pub.turn ? this.mine.list : [];
    return {
      ...base,
      match: {
        round: m.round,
        pub,
        lineup: pub.order.map(seatOf),
        role,
        word: shown ?? known.word,
        choices: pub.phase === "pick" ? known.choices : undefined,
        ops: this.opsOf(m, pub),
        canDraw: playing && pub.phase === "draw" && pub.drawer === this.me,
        guesses: mine.map((text, i) => ({ text, state: hit?.i === i ? "right" : near.includes(i) ? "near" : wrong.has(i) ? "wrong" : "wait" })),
        hit,
        deadline: this.deadlineOf(pub),
        result: m.status === "ended" && m.result?.round === m.round ? m.result : undefined,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    const w = r.winners ?? [];
    if (r.reason !== "points") return `Ván ${r.round} đã dừng giữa chừng`;
    if (!w.length) return `Ván ${r.round} kết thúc — chưa ai ghi được điểm`;
    const pub = this.meta()?.dw;
    const top = pub ? standings(pub)[0]?.score : undefined;
    return `🏆 ${w.map(name).join(", ")} ${w.length > 1 ? "đồng hạng nhất" : "thắng"} ván ${r.round}${top ? ` với ${top} điểm` : ""}!`;
  }

  // ---------- hành động người chơi ----------

  /** Người vẽ chọn từ thứ `i` (0 dễ, 1 vừa, 2 khó). */
  choose(i: number) {
    const live = this.livePub();
    if (!live || live.pub.phase !== "pick" || live.pub.drawer !== this.me || ![0, 1, 2].includes(i)) return;
    this.gossip.set<Pick>(`v:${live.m.round}:${this.me}`, { turn: live.pub.turn, pick: i });
    this.react();
  }

  /** Gửi một lời đoán (đang lượt vẽ, mình là người đoán chưa đoán đúng). Trả về false nếu không gửi được. */
  guess(text: string): boolean {
    const live = this.livePub();
    const t = text.trim().slice(0, GUESS_LEN);
    if (!live || !t || live.pub.phase !== "draw" || !live.pub.order.includes(this.me) || live.pub.drawer === this.me) return false;
    if (live.pub.hits.some((h) => h.u === this.me)) return false;
    const { m, pub } = live;
    if (this.mine.round !== m.round || this.mine.turn !== pub.turn) this.mine = { round: m.round, turn: pub.turn, list: [] };
    if (this.mine.list.length >= GUESS_MAX) {
      this.say(`dw-max:${m.round}:${pub.turn}`, `✋ Mỗi lượt đoán tối đa ${GUESS_MAX} lần`);
      return false;
    }
    const i = this.mine.list.length;
    this.mine = { ...this.mine, list: [...this.mine.list, t] };
    try {
      sessionStorage.setItem(mineKey(this.id), JSON.stringify(this.mine));
    } catch {}
    const p = this.gossip.get<Member>(`p:${this.me}`);
    this.pushChat({ id: `dw-g:${m.round}:${pub.turn}:${this.me}:${i}`, uid: this.me, name: p?.name ?? "", avatar: p?.avatar ?? "", color: p?.color ?? "", at: Date.now(), text: t, local: true });
    this.flushGuesses(m);
    this.react();
    return true;
  }

  /** Đang lượt vẽ: tin của người đoán là lời đoán; người đã biết đáp án không được nhắn đáp án. */
  send(content: { text: string } | { sticker: StickerId }) {
    const live = this.livePub();
    if ("text" in content && live && (live.pub.phase === "pick" || live.pub.phase === "draw")) {
      const { m, pub } = live;
      const guesser = pub.phase === "draw" && pub.order.includes(this.me) && pub.drawer !== this.me && !pub.hits.some((h) => h.u === this.me);
      if (guesser) {
        this.guess(content.text);
        return;
      }
      const { word, choices } = this.wordFor(m, pub);
      if ((word ? [word] : (choices ?? [])).some((w) => leaks(content.text, w))) {
        this.system("🤫 Tin nhắn có đáp án nên chưa được gửi — đừng làm lộ đáp án nhé!");
        return;
      }
    }
    super.send(content);
  }

  // ---------- hành động chủ phòng ----------

  setOptions(patch: Partial<DwOptions>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const next = normOptions({ ...normOptions(m.opts), ...patch });
      if (JSON.stringify(next) === JSON.stringify(normOptions(m.opts))) return false;
      m.opts = next;
    });
  }

  /** Xoá đánh dấu các từ đã chơi để bốc lại từ đầu. */
  resetWords() {
    this.hostEdit((m) => {
      if (!m.dwUsed?.length) return false;
      delete m.dwUsed;
    });
  }

  /** Dừng ván giữa chừng: không tính ai thắng. */
  stop() {
    this.hostEdit((m) => {
      if (m.status !== "playing") return false;
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
    });
  }

  /** Đang chọn từ / đang vẽ thì không nhường chủ phòng: từ khoá của lượt chỉ nằm trên máy chủ phòng. */
  makeHost(uid: string) {
    const live = this.livePub();
    if (live && (live.pub.phase === "pick" || live.pub.phase === "draw")) {
      this.system("Chờ hết lượt vẽ này rồi hãy nhường chủ phòng — từ khoá của lượt chỉ nằm trên máy chủ phòng.");
      return;
    }
    super.makeHost(uid);
  }
}
