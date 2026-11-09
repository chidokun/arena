// Chủ phòng đóng vai máy chủ của trận: giữ đồng hồ (giờ mở từng câu), chốt câu trả lời của từng người vào `g:<ván>` và
// chuyển câu. Người chơi chỉ phát bản nháp `m:<ván>:<uid>` của câu đang chơi. Ngân hàng câu hỏi nằm trong bản build nên ai
// mở công cụ dev vẫn tra được — chỉ giao diện giữ kín: đáp án và câu trả lời của người khác chỉ hiện khi câu đã đóng
// (mở DevTools giữa ván thì bị xử thua như mọi game khác).
import {
  COUNTDOWN_MS,
  CROWN,
  firstOfRound,
  GRID_GOAL,
  gridFinds,
  gridHas,
  itemOf,
  letterOrder,
  limitOf,
  makePlan,
  mark,
  MAX_PLAYERS,
  NO_ROUNDS,
  normOptions,
  normSub,
  optionOrder,
  pathWord,
  placeOf,
  rng,
  ROUNDS,
  standings,
  TB,
  tieSurvivors,
  TIEBREAK,
  tokenOrder,
  topTie,
  totalOf,
  validPath,
  type Find,
  type Item,
  type Mark,
  type Row,
  type Rounds,
  type Stage,
  type Sub,
  type VtOptions,
  type VtRound,
} from "../games/vua-tieng-viet";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

// Im lặng quá lâu thì cả phòng thôi chờ người đó (đồng hồ vẫn chạy, quay lại vẫn chơi tiếp được).
const AWAY_MS = 20000;
// Hết giờ thì chủ phòng chờ thêm chút (lệch đồng hồ, tin còn trên đường) rồi mới đóng câu.
const GRACE_MS = 1500;
// Thời gian trả lời người chơi tự khai không được nhanh hơn lúc chủ phòng nhận được quá chừng này.
const LAG_MS = 1500;
const INTRO_MS = 3500;
const USED_MAX = 300;

/** Bản nháp của câu đang chơi (chỉ chủ nhân ghi được): `lk` đã chốt, `nx` đã đọc xong lời giải. */
type Draft = { q: number; a?: number | string | number[]; t?: number; lk?: boolean; nx?: boolean; f?: Find[] };
/** Câu trả lời đã chốt, theo câu rồi theo người. */
type Board = Record<string, Record<string, Sub>>;

// Ghép từ: 3 giây là sang câu (thêm 2 giây khi bật giải thích nghĩa).
export const revealMs = (explain: boolean, kind: Item["kind"]) => (kind === "grid" ? 9000 : kind === "scramble" ? (explain ? 5000 : 3000) : explain ? 8000 : 4500);

export type VtSeat = {
  seat: SeatView;
  out: boolean;
  away: boolean;
  /** Đang tham gia câu hiện tại (câu hỏi phụ chỉ có nhóm hoà). */
  on: boolean;
  /** Đã chốt câu hiện tại. */
  locked: boolean;
  next: boolean;
  total: number;
  rounds: Rounds;
  hits: number;
};

export type VtPast = { i: number; id: string; r: number; marks: Record<string, Mark>; subs: Record<string, Sub> };

export type VtMatch = {
  round: number;
  seed: number;
  opts: VtOptions;
  total: number;
  i: number;
  /** Vòng (0–4, `TB` = câu hỏi phụ), thứ tự trong vòng và số câu của vòng. */
  r: number;
  k: number;
  n: number;
  stage: Stage;
  item: Item;
  /** Thứ tự bày phương án / thẻ tiếng / thẻ chữ. */
  order: number[];
  lineup: VtSeat[];
  me: number;
  /** Mình đang được trả lời câu này. */
  playing: boolean;
  opensAt: number;
  /** Lúc câu mở và hạn chót theo giờ máy mình (0 nếu chưa tới lúc trả lời). */
  askAt: number;
  deadline: number;
  limit: number;
  revealAt: number;
  revealMs: number;
  solo: boolean;
  mine: { sub: Sub | null; draft: Draft | null };
  /** Câu trả lời và kết quả của cả phòng — chỉ có khi câu đã đóng. */
  subs: Record<string, Sub> | null;
  marks: Record<string, Mark> | null;
  past: VtPast[];
  tbs: string[][];
  rows: Row[] | null;
  result?: Result;
};

export type VtView = { opts: VtOptions; used: number; match?: VtMatch };

export class VuaTiengVietRoom extends RoomSession<VtView> {
  readonly game = "vua-tieng-viet";
  private opened = { round: -1, at: 0 };
  private seen = { key: "", at: 0 };
  private told = { round: -1, key: "" };

  private itemAt(vt: VtRound, i: number) {
    const id = i < vt.qs.length ? vt.qs[i] : vt.tbq[i - vt.qs.length];
    return id ? itemOf(id) : undefined;
  }

  private board(m: Meta): Board {
    const b = this.gossip.get<Board>(`g:${m.round}`);
    return b && typeof b === "object" ? structuredClone(b) : {};
  }

  private draftOf(m: Meta, uid: string): Draft | undefined {
    const d = this.gossip.get<Draft>(`m:${m.round}:${uid}`);
    return d && typeof d === "object" && d.q === m.vt?.i ? d : undefined;
  }

  private out(m: Meta, uid: string) {
    return m.kicked.includes(uid) || this.cheated(m, uid);
  }

  private away(uid: string) {
    return uid !== this.me && this.silentFor(uid) >= AWAY_MS;
  }

  private waitFor(m: Meta, uid: string) {
    return !this.out(m, uid) && !this.away(uid);
  }

  /** Ai được trả lời câu hiện tại: câu chính thì cả đội hình, câu hỏi phụ thì nhóm đang hoà. */
  private takers(m: Meta) {
    const vt = m.vt!;
    const k = vt.i - vt.qs.length;
    return k >= 0 ? (vt.tbs[k] ?? []) : m.lineup;
  }

  private local(at: number, ms: number) {
    const now = Date.now();
    return at <= now ? at : now + Math.min(ms, at - now);
  }

  private opensAt(m: Meta) {
    if (this.opened.round !== m.round) this.opened = { round: m.round, at: this.local(m.vt!.t0, COUNTDOWN_MS) };
    return this.opened.at;
  }

  /** Mốc vào giai đoạn hiện tại theo giờ máy mình: đồng hồ hai máy khớp nhau thì dùng giờ chủ phòng, lệch nhiều thì tính từ lúc thấy. */
  private stageAt(m: Meta, span: number) {
    const vt = m.vt!;
    const key = `${m.round}:${vt.i}:${vt.stage}`;
    if (this.seen.key !== key) {
      const now = Date.now();
      this.seen = { key, at: vt.at >= now - span - 3000 && vt.at <= now + 3000 ? vt.at : now };
    }
    return Math.max(this.seen.at, this.opensAt(m));
  }

  protected tidy(m: Meta) {
    const opts = normOptions(m.opts);
    if (JSON.stringify(m.opts) !== JSON.stringify(opts)) m.opts = opts;
  }

  protected begin(m: Meta) {
    const opts = normOptions(m.opts);
    const players = m.players.filter((u) => this.isOnline(u)).slice(0, MAX_PLAYERS);
    if (!players.length) return false;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const used = m.vtUsed ?? [];
    const { qs, tbq } = makePlan(opts, used, rng(seed));
    if (qs.length !== totalOf(opts.counts)) return false;
    const t0 = Date.now() + COUNTDOWN_MS;
    m.lineup = players;
    m.vt = { ...opts, seed, qs, tbq, i: 0, stage: "intro", at: t0, t0, tbs: [] };
    m.vtUsed = [...used.filter((id) => !qs.includes(id)), ...qs].slice(-USED_MAX);
    return true;
  }

  /** Chốt câu trả lời: thời gian tự khai không được sớm hơn lúc chủ phòng nhận quá `LAG_MS`. */
  private freeze(item: Item, d: Draft | undefined, limit: number, elapsed: number, locked: boolean): Sub {
    if (item.kind === "grid") {
      const s = normSub(item, d, limit);
      if (locked && s.f?.length) {
        const last = s.f.reduce((a, b) => (b.t > a.t ? b : a));
        last.t = Math.min(limit, Math.max(last.t, elapsed - LAG_MS));
      }
      return { ...s, t: locked ? Math.min(limit, Math.max(s.t, elapsed - LAG_MS)) : limit };
    }
    if (!locked) return { t: limit };
    const s = normSub(item, d, limit);
    return { ...s, t: Math.min(limit, Math.max(s.t, elapsed - LAG_MS)) };
  }

  protected hostPlay(m: Meta) {
    const vt = m.vt!;
    const now = Date.now();
    if (now < vt.t0) return;
    if (vt.stage === "intro") {
      if (now >= vt.at + INTRO_MS) {
        vt.stage = "ask";
        vt.at = now;
      }
      return;
    }
    const item = this.itemAt(vt, vt.i);
    if (!item) {
      vt.stage = "done";
      return;
    }
    const who = this.takers(m);
    if (vt.stage === "ask") {
      const limit = limitOf(placeOf(vt.counts, vt.i).r);
      const b = this.board(m);
      const subs = (b[vt.i] ??= {});
      const late = now >= vt.at + limit + GRACE_MS;
      let dirty = false;
      for (const u of who) {
        if (subs[u]) continue;
        const d = this.draftOf(m, u);
        // Chốt sau hạn chót (theo giờ người chơi tự khai) thì coi như chưa trả lời.
        if (d?.lk && !(Number(d.t) > limit)) subs[u] = this.freeze(item, d, limit, now - vt.at, true);
        else if (late) subs[u] = this.freeze(item, d, limit, now - vt.at, false);
        else continue;
        dirty = true;
      }
      if (who.every((u) => subs[u] || !this.waitFor(m, u))) {
        for (const u of who) if (!subs[u]) subs[u] = this.freeze(item, this.draftOf(m, u), limit, now - vt.at, false);
        dirty = true;
        vt.stage = "reveal";
        vt.at = now;
      }
      if (dirty) this.gossip.set(`g:${m.round}`, b);
    } else if (vt.stage === "reveal") {
      const ready = who.every((u) => this.draftOf(m, u)?.nx || !this.waitFor(m, u));
      const timeUp = m.lineup.length > 1 && now >= vt.at + revealMs(vt.explain, item.kind);
      if (ready || timeUp) this.advance(m);
    }
  }

  /** Sang câu sau; hết câu chính mà ngôi đầu đang hoà thì vào câu hỏi phụ. */
  private advance(m: Meta) {
    const vt = m.vt!;
    const total = vt.qs.length;
    const now = Date.now();
    const go = (i: number, stage: Stage) => {
      vt.i = i;
      vt.stage = stage;
      vt.at = now;
    };
    if (vt.i < total - 1) return go(vt.i + 1, firstOfRound(vt.counts, vt.i + 1) ? "intro" : "ask");
    const b = this.board(m);
    if (vt.i === total - 1) {
      const tied = m.lineup.length > 1 ? topTie(this.rows(m, b, false)).filter((u) => !this.out(m, u)) : [];
      if (tied.length > 1 && vt.tbq.length) {
        vt.tbs = [tied];
        return go(total, "intro");
      }
      return go(vt.i, "done");
    }
    const k = vt.i - total;
    const group = vt.tbs[k] ?? [];
    const rest = tieSurvivors(this.itemAt(vt, vt.i)!, group, b[vt.i] ?? {}).filter((u) => !this.out(m, u));
    const left = rest.length ? rest : group;
    if (left.length > 1 && k + 1 < vt.tbq.length) {
      vt.tbs = [...vt.tbs, left];
      return go(vt.i + 1, "ask");
    }
    vt.kings = left;
    go(vt.i, "done");
  }

  /** Kết quả từng câu chính đã đóng. */
  private past(m: Meta, b: Board): VtPast[] {
    const vt = m.vt!;
    const total = vt.qs.length;
    const closed = vt.stage === "done" || vt.i >= total ? total : vt.stage === "reveal" ? vt.i + 1 : vt.i;
    const out: VtPast[] = [];
    for (let i = 0; i < closed; i++) {
      const item = itemOf(vt.qs[i]);
      if (!item) continue;
      const r = placeOf(vt.counts, i).r;
      const subs = b[i] ?? {};
      out.push({ i, id: item.id, r, subs, marks: Object.fromEntries(m.lineup.map((u) => [u, mark(item, r, subs[u])])) });
    }
    return out;
  }

  private rows(m: Meta, b: Board, withKings = true): Row[] {
    const past = this.past(m, b);
    const list = m.lineup
      .filter((u) => !this.cheated(m, u))
      .map((uid) => {
        const rounds = NO_ROUNDS();
        let hits = 0;
        for (const p of past) {
          rounds[p.r] += p.marks[uid].pts;
          hits += p.marks[uid].hits;
        }
        return { uid, rounds, total: rounds.reduce((s, x) => s + x, 0), hits };
      });
    const rows = standings(list, withKings ? m.vt?.kings : undefined);
    return [...rows, ...m.lineup.filter((u) => this.cheated(m, u)).map((uid): Row => ({ uid, rounds: NO_ROUNDS(), total: 0, hits: 0, rank: 0 }))];
  }

  protected outcome(m: Meta): Result | undefined {
    const vt = m.vt;
    if (!vt) return { round: m.round, winner: null, winners: [], reason: "stop" };
    if (m.lineup.every((u) => this.out(m, u))) return { round: m.round, winner: null, winners: [], reason: m.lineup.some((u) => this.cheated(m, u)) ? "cheat" : "stop" };
    if (vt.stage !== "done") return;
    const winners = this.rows(m, this.board(m))
      .filter((r) => r.king && r.rank === 1)
      .map((r) => r.uid);
    return { round: m.round, winner: winners.length === 1 ? winners[0] : null, winners, reason: "points" };
  }

  protected watch(m: Meta) {
    const vt = m.vt;
    if (!vt || m.status !== "playing") return;
    const key = `${vt.i}:${vt.stage}`;
    // Vào giữa ván thì không rao lại diễn biến cũ (tải lại trang thì khung chat đã khôi phục từ snapshot).
    if (this.told.round !== m.round) this.told = { round: m.round, key: vt.i === 0 && vt.stage === "intro" ? "" : key };
    if (key === this.told.key) return;
    this.told.key = key;
    if (vt.stage !== "intro") return;
    const r = placeOf(vt.counts, vt.i).r;
    if (r < TB) this.say(`vt-round:${m.round}:${r}`, `${ROUNDS[r].emoji} Vòng ${r + 1} · ${ROUNDS[r].name} — ${vt.counts[r]} ${r === CROWN ? "thử thách" : "câu"}`);
    else {
      const names = (vt.tbs[0] ?? []).map((u) => (u === this.me ? "Bạn" : this.nameOf(u))).join(", ");
      this.say(`vt-tb:${m.round}`, `${TIEBREAK.emoji} Hoà điểm ở ngôi đầu! ${names} bước vào câu hỏi phụ.`);
    }
  }

  private say(id: string, text: string) {
    this.pushChat({ id, uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true });
  }

  protected adExtra(m: Meta) {
    return m.status === "playing" ? { players: m.lineup.length } : {};
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): VtView {
    const opts = normOptions(m.opts);
    const base: VtView = { opts, used: m.vtUsed?.length ?? 0 };
    const vt = m.vt;
    if (!vt || !m.round || !m.lineup.length) return base;
    const item = this.itemAt(vt, vt.i);
    if (!item) return base;
    const b = this.board(m);
    const live = m.status === "playing";
    const { r, k, n } = placeOf(vt.counts, vt.i);
    const limit = limitOf(r);
    const who = this.takers(m);
    const closed = vt.stage === "reveal" || vt.stage === "done" || !live;
    const asking = live && vt.stage === "ask";
    const askAt = asking ? this.stageAt(m, limit) : 0;
    const revealAt = live && vt.stage === "reveal" ? this.stageAt(m, 30000) : 0;
    const subs = b[vt.i] ?? {};
    const past = this.past(m, b);
    const rows = this.rows(m, b);
    const byUid = new Map(rows.map((x) => [x.uid, x]));
    const draft = live ? (this.draftOf(m, this.me) ?? null) : null;
    const order = item.kind === "mc" ? optionOrder(vt.seed, item.id) : item.kind === "order" ? tokenOrder(vt.seed, item) : item.kind === "scramble" ? letterOrder(vt.seed, item) : [];
    const ended = m.status === "ended" && m.result?.round === m.round;
    return {
      ...base,
      match: {
        round: m.round,
        seed: vt.seed,
        opts: normOptions(vt),
        total: vt.qs.length,
        i: vt.i,
        r,
        k,
        n,
        stage: vt.stage,
        item,
        order,
        lineup: m.lineup.map((u) => {
          const row = byUid.get(u);
          const d = this.draftOf(m, u);
          return {
            seat: seatOf(u),
            out: this.out(m, u),
            away: live && this.away(u),
            on: who.includes(u),
            locked: !!subs[u] || !!d?.lk,
            next: vt.stage === "reveal" && !!d?.nx,
            total: row?.total ?? 0,
            rounds: row?.rounds ?? NO_ROUNDS(),
            hits: row?.hits ?? 0,
          };
        }),
        me: m.lineup.indexOf(this.me),
        playing: live && who.includes(this.me) && !this.out(m, this.me),
        opensAt: this.opensAt(m),
        askAt,
        deadline: askAt ? askAt + limit : 0,
        limit,
        revealAt,
        revealMs: revealMs(vt.explain, item.kind),
        solo: m.lineup.length === 1,
        mine: { sub: subs[this.me] ?? null, draft },
        subs: closed ? subs : null,
        marks: closed ? Object.fromEntries(who.map((u) => [u, mark(item, r, subs[u])])) : null,
        past,
        tbs: vt.tbs,
        rows: vt.stage === "done" || ended ? rows : null,
        result: ended ? m.result : undefined,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    if (r.reason === "cheat") return `Ván ${r.round} dừng — người chơi bị xử thua vì gian lận`;
    if (r.reason !== "points") return `Ván ${r.round} dừng giữa chừng`;
    const m = this.meta();
    const rows = m?.vt ? this.rows(m, this.board(m)) : [];
    const pts = rows[0] ? ` với ${rows[0].total.toLocaleString("vi-VN")} điểm` : "";
    if (m && m.lineup.length === 1) return `👑 ${name(m.lineup[0])} hoàn thành ${m.vt?.qs.length ?? ""} câu${pts}`;
    const w = r.winners ?? [];
    if (!w.length) return `Ván ${r.round} kết thúc`;
    return w.length > 1 ? `🤝 ${w.map(name).join(", ")} cùng là Đồng Vua ván ${r.round}${pts}` : `👑 ${name(w[0])} là Vua Tiếng Việt ván ${r.round}${pts}!`;
  }

  // ——— Thao tác của người chơi ———

  private active() {
    const m = this.meta();
    const vt = m?.vt;
    if (!m || !vt || m.status !== "playing" || this.out(m, this.me) || !this.takers(m).includes(this.me)) return null;
    if (Date.now() < this.opensAt(m)) return null;
    return m;
  }

  private save(m: Meta, d: Draft) {
    this.gossip.set(`m:${m.round}:${this.me}`, d, true);
    this.gameStore.invalidate();
    this.react();
  }

  private elapsed(m: Meta) {
    return Math.max(0, Date.now() - this.stageAt(m, limitOf(placeOf(m.vt!.counts, m.vt!.i).r)));
  }

  /** Chốt câu trả lời (ghép từ: thứ tự thẻ chữ, -1 là khoảng trắng; trắc nghiệm: chỉ số gốc của phương án; giải nghĩa: chữ gõ; xâu chuỗi: thứ tự thẻ). Mỗi câu một lần. */
  answer(a: number | string | number[]) {
    const m = this.active();
    if (!m || m.vt!.stage !== "ask") return;
    const vt = m.vt!;
    const item = this.itemAt(vt, vt.i);
    if (!item || item.kind === "grid" || this.draftOf(m, this.me)?.lk || this.board(m)[vt.i]?.[this.me]) return;
    const t = this.elapsed(m);
    if (t > limitOf(placeOf(vt.counts, vt.i).r)) return;
    this.save(m, { q: vt.i, a, t, lk: true });
  }

  /** Nối một đường trong lưới: trả về kết quả để giao diện báo ngay. */
  find(p: number[]): { kind: "ok" | "dup" | "bad"; word: string; count: number } | null {
    const m = this.active();
    if (!m || m.vt!.stage !== "ask") return null;
    const vt = m.vt!;
    const item = this.itemAt(vt, vt.i);
    if (!item || item.kind !== "grid" || !validPath(p) || this.board(m)[vt.i]?.[this.me]) return null;
    const d: Draft = { ...(this.draftOf(m, this.me) ?? { q: vt.i }), q: vt.i };
    if (d.lk) return null;
    const word = pathWord(item, p);
    const have = gridFinds(item, d.f);
    if (!gridHas(item, word)) return { kind: "bad", word, count: have.length };
    if (have.some((x) => x.w === word)) return { kind: "dup", word, count: have.length };
    const t = this.elapsed(m);
    if (t > limitOf(placeOf(vt.counts, vt.i).r)) return null;
    d.f = [...(d.f ?? []), { p, t }];
    const count = have.length + 1;
    if (count >= GRID_GOAL) {
      d.lk = true;
      d.t = t;
    }
    this.save(m, d);
    return { kind: "ok", word, count };
  }

  /** Đã đọc xong đáp án — đủ người bấm thì sang câu sau. */
  proceed() {
    const m = this.active();
    if (!m || m.vt!.stage !== "reveal") return;
    const d = this.draftOf(m, this.me) ?? { q: m.vt!.i };
    if (d.nx) return;
    this.save(m, { ...d, nx: true });
  }

  /** Chủ phòng cho cả phòng sang câu sau / bỏ qua phần giới thiệu vòng. */
  skip() {
    this.hostEdit((m) => {
      const vt = m.vt;
      if (m.status !== "playing" || !vt) return false;
      if (vt.stage === "intro") {
        vt.stage = "ask";
        vt.at = Date.now();
        return;
      }
      if (vt.stage !== "reveal") return false;
      this.advance(m);
    });
  }

  setOptions(next: Partial<VtOptions>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const cur = normOptions(m.opts);
      const opts = normOptions({ ...cur, ...next });
      if (JSON.stringify(opts) === JSON.stringify(cur)) return false;
      m.opts = opts;
    });
  }

  resetUsed() {
    this.hostEdit((m) => {
      if (!m.vtUsed?.length) return false;
      m.vtUsed = [];
    });
  }

  /** Báo lỗi câu hỏi: nhắn vào khung chat để cả phòng biết (không đổi điểm giữa trận). */
  reportIssue(id: string, note: string) {
    const text = `🚩 Báo lỗi câu ${id}${note ? `: ${note}` : ""}`;
    this.send({ text });
  }

  stop() {
    this.hostEdit((m) => {
      if (m.status !== "playing") return false;
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
    });
  }
}
