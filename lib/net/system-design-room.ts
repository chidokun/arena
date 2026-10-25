import {
  COUNTDOWN_MS,
  emptyDesign,
  makeProblem,
  normDesign,
  normProblem,
  standings,
  winnersOf,
  type Design,
  type Problem,
  type Standing,
} from "../games/system-design";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

// Rớt mạng quá lâu giữa ván thì bị loại; đủ dài để tải lại trang.
const QUIT_MS = 20000;
// Hết giờ thì máy ai nấy tự chốt; chủ phòng chờ thêm chút (lệch đồng hồ, tin còn trên đường) rồi mới chốt hộ.
const GRACE_MS = 5000;
const SAVE_MS = 600;
// Mọi người đã đọc đề: cảnh chuẩn bị thiết kế đếm ngược chừng này rồi mới mở bàn.
export const PREP_MS = 3000;

// Bản nháp của từng người (`m:<ván>:<uid>`, chỉ chủ nhân ghi được); `read` là lúc xác nhận đã đọc đề, `lock` là lúc chốt,
// `auto` là máy tự chốt khi hết giờ.
type Draft = { d?: unknown; read?: number; lock?: number; auto?: boolean };
// Thiết kế đã chốt do chủ phòng ghi nhận (`g:<ván>`): đã chốt thì không đổi được nữa, kể cả khi bản nháp đổi sau đó.
type Board = { d: Record<string, unknown>; auto: string[]; out: string[] };

export type SxSeat = { seat: SeatView; read: boolean; locked: boolean; out: boolean; auto: boolean };

export type SxFinal = { designs: Record<string, Design>; rows: Standing[] };

// Mọi người chốt xong thì cả phòng xem load test chạy lại trên sơ đồ trước khi lộ kết quả: đếm ngược `intro`, mỗi mức tải
// `tick`, dừng ở mức cuối `hold` rồi mới công bố. Tốc độ theo số mức của thiết kế trụ lâu nhất để ván nào cũng chạy ~8 giây.
// `hold` đủ dài cho vụ nổ của thiết kế gục cuối cùng diễn xong rồi mới hiện cảnh kết quả.
export const PLAY_INTRO_MS = 3000;
const PLAY_HOLD_MS = 2000;

export function playbackOf(final: SxFinal) {
  const levels = Math.max(1, ...final.rows.map((r) => r.sim?.levels.length ?? 0));
  const tick = Math.min(320, Math.max(110, Math.round(8000 / levels)));
  return { intro: PLAY_INTRO_MS, levels, tick, total: PLAY_INTRO_MS + levels * tick + PLAY_HOLD_MS };
}

export type SxMatch = {
  round: number;
  problem: Problem;
  // Lúc lộ đề cho mọi người đọc (sau cảnh bắt đầu ván).
  readAt: number;
  // Lúc mở bàn thiết kế; 0 = còn đang chờ mọi người xác nhận đã đọc đề.
  opensAt: number;
  // 0 = không giới hạn.
  endsAt: number;
  lineup: SxSeat[];
  me: number;
  locked: boolean;
  final?: SxFinal;
  // Lúc máy này bắt đầu phát lại load test; 0 = vào phòng / tải lại trang khi ván đã xong — xem kết quả luôn.
  playAt: number;
  result?: Result;
};

export type SxView = { problem: Problem; match?: SxMatch };

export class SystemDesignRoom extends RoomSession<SxView> {
  readonly game = "system-design";
  private mine: { round: number; d: Design; lock: boolean; auto?: boolean } | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private opened = { round: -1, at: 0 };
  private readOpen = { round: -1, at: 0 };
  private readRound = -1;
  private ranked: { key: string; final: SxFinal } | null = null;
  private sawLive = -1;
  private play = { round: -1, at: 0 };
  private told = -1;

  private board(m: Meta): Board {
    const b = this.gossip.get<Partial<Board>>(`g:${m.round}`);
    return {
      d: b?.d && typeof b.d === "object" ? { ...b.d } : {},
      auto: Array.isArray(b?.auto) ? [...b.auto] : [],
      out: Array.isArray(b?.out) ? [...b.out] : [],
    };
  }

  private draftOf(m: Meta, uid: string): Draft | undefined {
    const v = this.gossip.get<Draft>(`m:${m.round}:${uid}`);
    return v && typeof v === "object" ? v : undefined;
  }

  private complete(m: Meta, b: Board) {
    return m.lineup.every((u) => u in b.d || b.out.includes(u));
  }

  // Giả lập mọi thiết kế một lần cho mỗi bảng chốt; máy nào cũng tự tính được và ra cùng kết quả.
  private final(m: Meta, b: Board): SxFinal {
    const key = `${m.round}:${JSON.stringify(b)}:${JSON.stringify(m.cheats ?? [])}`;
    if (this.ranked?.key === key) return this.ranked.final;
    const p = m.sx!.p;
    const designs: Record<string, Design> = {};
    for (const u of m.lineup) if (u in b.d) designs[u] = normDesign(b.d[u], p);
    const rows = standings(
      p,
      m.lineup.map((u) => ({ uid: u, design: designs[u] ?? null, out: b.out.includes(u) || this.cheated(m, u), auto: b.auto.includes(u) })),
    );
    const final = { designs, rows };
    this.ranked = { key, final };
    return final;
  }

  // Mốc theo đồng hồ chủ phòng; máy chậm / nhanh giờ thì đếm ngược tối đa `ms` kể từ lúc máy này thấy mốc.
  private local(at: number, ms: number) {
    const now = Date.now();
    return at <= now ? at : now + Math.min(ms, at - now);
  }

  private readAt(m: Meta) {
    if (this.readOpen.round !== m.round) this.readOpen = { round: m.round, at: this.local(m.sx!.t0, COUNTDOWN_MS) };
    return this.readOpen.at;
  }

  private opensAt(m: Meta) {
    const go = m.sx!.go;
    if (!go) return 0;
    if (this.opened.round !== m.round) this.opened = { round: m.round, at: this.local(go, PREP_MS) };
    return this.opened.at;
  }

  private endsAt(m: Meta) {
    const t = m.sx!.p.time;
    const open = this.opensAt(m);
    return t && open ? open + t * 1000 : 0;
  }

  private hasRead(m: Meta, uid: string) {
    return !!m.sx?.read?.includes(uid) || (uid === this.me && this.readRound === m.round) || !!this.draftOf(m, uid)?.read;
  }

  protected tidy(m: Meta) {
    const raw = (m.opts as { problem?: unknown }).problem;
    if (raw !== undefined) m.sxq = normProblem(raw);
    else if (!m.sxq) m.sxq = makeProblem(crypto.getRandomValues(new Uint32Array(1))[0]);
    const { mode, time, target, budget } = m.sxq;
    const opts = { mode, time, target, budget };
    if (JSON.stringify(m.opts) !== JSON.stringify(opts)) m.opts = opts;
  }

  protected begin(m: Meta) {
    const lineup = m.players.filter((u) => this.isOnline(u));
    if (!lineup.length || !m.sxq) return false;
    m.lineup = lineup;
    m.sx = { p: m.sxq, t0: Date.now() + COUNTDOWN_MS, end: 0, read: [] };
    return true;
  }

  protected outcome(m: Meta): Result | undefined {
    if (!m.sx) return { round: m.round, winner: null, winners: [], reason: "stop" };
    const b = this.board(m);
    if (!this.complete(m, b)) return;
    const winners = winnersOf(this.final(m, b).rows);
    return { round: m.round, winner: winners.length === 1 ? winners[0] : null, winners, reason: "points" };
  }

  protected hostPlay(m: Meta) {
    const sx = m.sx!;
    const now = Date.now();
    const b = this.board(m);
    let dirty = false;
    for (const u of m.lineup) {
      if (u in b.d || b.out.includes(u)) continue;
      const draft = this.draftOf(m, u);
      if (this.cheated(m, u) || m.kicked.includes(u)) b.out.push(u);
      else if (draft?.lock && sx.go) {
        b.d[u] = normDesign(draft.d, sx.p);
        if (draft.auto) b.auto.push(u);
      } else if (u !== this.me && this.silentFor(u) >= QUIT_MS) b.out.push(u);
      else if (sx.end && now >= sx.end + GRACE_MS && (u === this.me || this.isOnline(u))) {
        b.d[u] = normDesign(u === this.me && this.mine?.round === m.round ? this.mine.d : draft?.d, sx.p);
        b.auto.push(u);
      } else continue;
      dirty = true;
    }
    if (dirty) this.gossip.set(`g:${m.round}`, b);
    if (sx.go) return;
    // Ghi nhận ai đã xác nhận đọc đề; người còn trong ván đều xác nhận thì mở cảnh chuẩn bị rồi bàn thiết kế.
    const read = m.lineup.filter((u) => !b.out.includes(u) && this.hasRead(m, u));
    if (read.length !== (sx.read ?? []).length) sx.read = read;
    const left = m.lineup.filter((u) => !b.out.includes(u) && !this.cheated(m, u));
    if (left.length && left.every((u) => read.includes(u))) {
      sx.go = now + PREP_MS;
      sx.end = sx.p.time ? sx.go + sx.p.time * 1000 : 0;
    }
  }

  protected watch(m: Meta) {
    if (m.status === "playing") this.sawLive = m.round;
    this.tellVerdict(m);
    // Hết giờ thì tự chốt thiết kế đang có, kể cả khi bàn chơi không mở.
    if (m.status !== "playing" || !m.sx || !m.lineup.includes(this.me) || this.lockedIn(m)) return;
    const end = this.endsAt(m);
    if (end && Date.now() >= end) this.lock(true);
  }

  // Máy này chứng kiến ván đang chơi rồi mới xong thì phát lại load test; vào giữa chừng / tải lại trang thì thôi.
  private playAt(m: Meta) {
    if (this.play.round !== m.round) this.play = { round: m.round, at: this.sawLive === m.round ? Date.now() : 0 };
    return this.play.at;
  }

  // Câu báo người thắng đợi phát lại load test xong mới lên khung chat, để không lộ kết quả trước. Id cố định theo ván:
  // tải lại trang (chat khôi phục từ snapshot) không báo lặp.
  private tellVerdict(m: Meta) {
    const r = m.result;
    if (m.status !== "ended" || !m.sx || r?.round !== m.round || r.reason === "stop" || this.told === m.round) return;
    const b = this.board(m);
    if (!this.complete(m, b)) return;
    const at = this.playAt(m);
    if (at && Date.now() < at + playbackOf(this.final(m, b)).total) return;
    this.told = m.round;
    const w = r.winners ?? [];
    const name = (u: string) => this.nameOf(u);
    const text = !w.length
      ? `📉 Ván ${r.round}: không thiết kế nào vượt quality gate — không ai thắng`
      : w.length > 1
        ? `🤝 ${w.map(name).join(", ")} đồng hạng nhất ván ${r.round}`
        : `🏆 ${name(w[0])} có thiết kế tốt nhất — thắng ván ${r.round}!`;
    this.pushChat({ id: `sx-verdict:${m.round}`, uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true });
  }

  protected stopped() {
    if (this.saveTimer) this.save();
  }

  /** Bàn chơi chỉ cần bản nháp của chính mình; của người khác thì đợi chủ phòng ghi nhận lúc chốt. */
  protected viewKey(k: string) {
    return !k.startsWith("m:") || k.endsWith(`:${this.me}`);
  }

  private lockedIn(m: Meta) {
    if (this.mine?.round === m.round && this.mine.lock) return true;
    return !!this.draftOf(m, this.me)?.lock || this.me in this.board(m).d;
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): SxView {
    const problem = m.sxq ?? normProblem({});
    const sx = m.sx;
    if (!sx || !m.round || !m.lineup.length) return { problem };
    const b = this.board(m);
    const me = m.lineup.indexOf(this.me);
    const locked = me >= 0 && this.lockedIn(m);
    const ended = m.status === "ended" && m.result?.round === m.round;
    if (m.status === "playing") this.sawLive = m.round;
    const final = ended && this.complete(m, b) ? this.final(m, b) : undefined;
    return {
      problem,
      match: {
        round: m.round,
        problem: sx.p,
        readAt: this.readAt(m),
        opensAt: this.opensAt(m),
        endsAt: this.endsAt(m),
        lineup: m.lineup.map((u) => ({ seat: seatOf(u), read: this.hasRead(m, u), locked: u in b.d || (u === this.me && locked), out: b.out.includes(u) || this.cheated(m, u), auto: b.auto.includes(u) })),
        me,
        locked,
        final,
        playAt: final && m.result?.reason !== "stop" ? this.playAt(m) : 0,
        result: ended ? m.result : undefined,
      },
    };
  }

  // Lúc ván vừa xong chỉ báo bắt đầu chạy tải; ai thắng thì `tellVerdict` báo sau khi phát lại xong.
  protected resultText(r: Result) {
    if (r.reason === "stop") return `Ván ${r.round} dừng giữa chừng`;
    return `🔒 Ván ${r.round}: mọi người đã chốt thiết kế — bắt đầu chạy tải!`;
  }

  /** Thiết kế đang làm dở của mình (để bàn chơi dựng lại sau khi tải trang). */
  myDesign(): Design {
    const m = this.meta();
    if (!m?.sx) return emptyDesign();
    if (this.mine?.round === m.round) return this.mine.d;
    const locked = this.board(m).d[this.me];
    return normDesign(locked ?? this.draftOf(m, this.me)?.d, m.sx.p);
  }

  private canEdit(m: Meta | undefined): m is Meta {
    const open = m?.sx ? this.opensAt(m) : 0;
    return !!m?.sx && m.status === "playing" && m.lineup.includes(this.me) && !this.lockedIn(m) && !!open && Date.now() >= open;
  }

  edit(d: Design) {
    const m = this.meta();
    if (!this.canEdit(m)) return;
    this.mine = { round: m.round, d, lock: false };
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), SAVE_MS);
  }

  private save() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const m = this.meta();
    const mine = this.mine;
    if (!m || !mine || mine.round !== m.round) return;
    this.gossip.set(`m:${m.round}:${this.me}`, mine.lock ? { d: mine.d, lock: Date.now(), ...(mine.auto ? { auto: true } : {}) } : { d: mine.d });
  }

  /** Xác nhận đã đọc kỹ đề; mọi người xác nhận xong thì chủ phòng mới mở bàn thiết kế. */
  markRead() {
    const m = this.meta();
    if (!m?.sx || m.status !== "playing" || !m.lineup.includes(this.me) || m.sx.go || this.hasRead(m, this.me)) return;
    this.readRound = m.round;
    this.gossip.set(`m:${m.round}:${this.me}`, { ...(this.draftOf(m, this.me) ?? {}), read: Date.now() });
    this.gameStore.invalidate();
    this.react();
  }

  lock(auto = false) {
    const m = this.meta();
    if (!m?.sx?.go || m.status !== "playing" || !m.lineup.includes(this.me) || this.lockedIn(m)) return;
    this.mine = { round: m.round, d: this.mine?.round === m.round ? this.mine.d : this.myDesign(), lock: true, auto };
    this.save();
    this.gameStore.invalidate();
    this.react();
  }

  setProblem(p: Problem) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const next = normProblem(p);
      if (JSON.stringify(next) === JSON.stringify(m.sxq)) return false;
      m.sxq = next;
    });
  }

  stop() {
    this.hostEdit((m) => {
      if (m.status !== "playing") return false;
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
    });
  }
}
