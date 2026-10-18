/**
 * Phòng Nối Thú Kawaii: không giới hạn ghế, một người cũng chơi được. Bắt đầu ván, chủ phòng chốt đội hình và `meta.kw`
 * (seed, cỡ bàn, chế độ, giờ lộ bàn) — mọi máy tự sinh cùng một bàn từ seed. Người chơi chỉ nối nước của mình vào
 * `m:<ván>:<uid>`; máy chủ phòng xét các nước mới theo thứ tự mình thấy (`judge`) rồi ghi bàn chung `g:<ván>` — ai nối
 * được cặp nào, điểm, các lần bàn tự xáo, người thắng đều suy ra tất định từ bàn chung.
 *
 * Cùng giải đề: cả phòng chung một bàn, không tính giờ — dọn sạch bàn là hết ván. Đối kháng: mỗi người một bàn, bàn của
 * mình dựng thẳng từ nước của mình (`ownGame`) nên không phải chờ chủ phòng; chủ phòng ghi giờ từng người dọn xong.
 * Người xong đầu tiên thắng ngay, những người còn lại dọn tiếp — ván xong khi mọi người đã xong (hoặc người chưa xong
 * đều đã rời đi). Xin gợi ý bị khoá tay tại máy mình.
 */
import {
  COUNTDOWN_MS,
  deskOf,
  emptyBoard,
  findMove,
  findPath,
  HINT_LOCK_MS,
  judge,
  MIN_PLAYERS,
  normOptions,
  optimistic,
  ownGame,
  replay,
  stamp,
  type Board,
  type KwOptions,
  type KwRound,
  type KwState,
  type Mode,
  type Point,
  type SizeKey,
} from "../games/kawaii";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

/** Cả đội hình mất kết nối chừng này thì dừng ván. */
const ABANDON_MS = 60000;
/** Đối kháng đã có người thắng: những người chưa xong đều mất kết nối chừng này thì kết thúc ván. */
const QUIT_MS = 20000;

export type KwMatch = {
  round: number;
  size: SizeKey;
  mode: Mode;
  lineup: SeatView[];
  /** Thứ tự của mình trong đội hình; -1 nếu chỉ xem. */
  me: number;
  state: KwState;
  /**
   * Bàn mình chơi — cùng giải đề: bàn chung, bỏ đi các cặp mình vừa nối đang chờ chủ phòng ghi nhận; đối kháng: bàn
   * riêng dựng từ nước của mình. Người xem: bàn chung (đối kháng: bàn người đầu đội hình).
   */
  tiles: number[];
  /** Số lần xáo của bàn mình chơi — gửi kèm nước nối. */
  shuffles: number;
  /** Số ô còn trên bàn mình chơi. */
  left: number;
  /** Cùng giải đề: các cặp mình vừa nối, đang chờ chủ phòng ghi nhận. */
  pending: [number, number][];
  /** Đối kháng: mình đã dọn sạch bàn của mình (trên máy mình — chủ phòng có thể chưa kịp ghi nhận). */
  cleared: boolean;
  /** Đối kháng: số lần mình xin gợi ý (trên máy mình). */
  hints: number;
  /** Giờ máy mình lúc lộ bàn (hết đếm ngược). */
  opensAt: number;
  /** Đối kháng: khoá tay tới lúc này (giờ máy mình). */
  lockedUntil: number;
  /** Đối kháng: thời gian từng người dọn xong (theo thứ tự đội hình); null nếu chưa xong. */
  fin: (number | null)[];
  result?: Result;
};

export type KwView = {
  /** Luật cho ván tới. */
  opts: KwOptions;
  /** Ván hiện tại hoặc vừa xong; undefined khi chưa chơi ván nào. */
  match?: KwMatch;
};

export class KawaiiRoom extends RoomSession<KwView> {
  readonly game = "kawaii";
  /** Trạng thái dựng gần nhất — nhật ký chỉ dài thêm nên dựng tiếp từ đây thay vì từ đầu. */
  private cache: { round: number; seed: number; tail: string; state: KwState } | null = null;
  /** Đối kháng: bàn của mình dựng gần nhất từ nước của mình — nhật ký của mình chỉ dài thêm nên dựng tiếp từ đây. */
  private own: { round: number; seed: number; tail: string; state: KwState } | null = null;
  private opened = { round: -1, at: 0 };
  private lock = { round: -1, until: 0 };
  /** Đã báo tới lần xáo bàn thứ mấy của ván nào. */
  private told = { round: -1, shuffles: 0 };
  /** Đã báo người về nhất của ván nào (đối kháng). */
  private hailed = -1;

  private board(m: Meta): Board {
    const b = this.gossip.get<Board>(`g:${m.round}`);
    return b && Array.isArray(b.log) && Array.isArray(b.seen) ? b : emptyBoard(m.lineup.length);
  }

  private movesOf(m: Meta, uid: string): unknown[] {
    const list = this.gossip.get<{ moves?: unknown }>(`m:${m.round}:${uid}`)?.moves;
    return Array.isArray(list) ? list : [];
  }

  private stateOf(m: Meta, kw: KwRound) {
    const log = this.board(m).log;
    const c = this.cache;
    // Chỉ dựng tiếp khi nhật ký mới vẫn bắt đầu bằng phần đã dựng (chủ phòng mới tiếp quản có thể ghi khác đi).
    const same = c && c.round === m.round && c.seed === kw.seed && c.state.count <= log.length && c.tail === JSON.stringify(log[c.state.count - 1]);
    const state = replay(kw, m.lineup.length, log, same ? c.state : undefined);
    this.cache = { round: m.round, seed: kw.seed, tail: JSON.stringify(log[state.count - 1]), state };
    return state;
  }

  /** Đối kháng: bàn của mình dựng từ nước của mình. */
  private ownOf(m: Meta, kw: KwRound) {
    const moves = this.movesOf(m, this.me);
    const c = this.own;
    const same = c && c.round === m.round && c.seed === kw.seed && c.state.count <= moves.length && c.tail === JSON.stringify(moves[c.state.count - 1]);
    const state = ownGame(kw, moves, same ? c.state : undefined);
    this.own = { round: m.round, seed: kw.seed, tail: JSON.stringify(moves[state.count - 1]), state };
    return state;
  }

  /**
   * Giờ máy mình lúc lộ bàn: lần đầu thấy ván thì đếm ngược phần còn lại theo giờ chủ phòng, tối đa một nhịp đếm ngược;
   * vào giữa ván (tải lại trang) thì chơi ngay.
   */
  private opensAt(m: Meta, kw: KwRound) {
    if (this.opened.round !== m.round) {
      const now = Date.now();
      this.opened = { round: m.round, at: kw.t0 <= now ? kw.t0 : now + Math.min(COUNTDOWN_MS, kw.t0 - now) };
    }
    return this.opened.at;
  }

  // ---------- luật ----------

  protected begin(m: Meta) {
    const lineup = m.players.filter((u) => this.isOnline(u));
    if (lineup.length < MIN_PLAYERS) return false;
    m.lineup = lineup;
    m.kw = { ...normOptions(m.opts), seed: crypto.getRandomValues(new Uint32Array(1))[0], t0: Date.now() + COUNTDOWN_MS };
    return true;
  }

  protected outcome(m: Meta): Result | undefined {
    if (!m.kw) return { round: m.round, winner: null, winners: [], reason: "stop" };
    const s = this.stateOf(m, m.kw);
    if (!s.over) return;
    const winners = s.winners.map((k) => m.lineup[k]);
    return { round: m.round, winner: winners.length === 1 ? winners[0] : null, winners, reason: "points" };
  }

  /** Kết quả khi ván kết thúc sớm (bị dừng, người chơi bỏ đi): đối kháng đã có người xong thì người đó vẫn thắng. */
  private cutShort(m: Meta): Result {
    const s = m.kw ? this.stateOf(m, m.kw) : undefined;
    const first = s?.mode === "race" ? s.winners[0] : undefined;
    if (first != null) return { round: m.round, winner: m.lineup[first], winners: [m.lineup[first]], reason: "points" };
    return { round: m.round, winner: null, winners: [], reason: "stop" };
  }

  /**
   * Chủ phòng phân xử các nước mới và ghi giờ dọn xong (đối kháng) — người bị xử thua vì gian lận không được nối thêm.
   * Cả đội hình bỏ đi thì dừng ván; đối kháng đã có người thắng mà những người chưa xong đều bỏ đi (hoặc gian lận) thì
   * kết thúc ván.
   */
  protected hostPlay(m: Meta) {
    const kw = m.kw!;
    const judged = judge(
      kw,
      m.lineup.map((u) => (this.cheated(m, u) ? [] : this.movesOf(m, u))),
      this.board(m),
      this.stateOf(m, kw),
    );
    if (judged) this.gossip.set(`g:${m.round}`, judged);
    const s = this.stateOf(m, kw);
    const timed = stamp(this.board(m), s, Math.max(0, Date.now() - kw.t0));
    if (timed) this.gossip.set(`g:${m.round}`, timed);
    if (s.over) return;
    const gone = (u: string) => this.cheated(m, u) || (u !== this.me && this.silentFor(u) >= QUIT_MS);
    const quit = s.mode === "race" && s.winners.length > 0 && m.lineup.every((u, k) => s.finished.includes(k) || gone(u));
    if (quit || m.lineup.every((u) => u !== this.me && this.silentFor(u) >= ABANDON_MS)) {
      m.status = "ended";
      m.result = this.cutShort(m);
    }
  }

  /**
   * Mọi máy: bàn tự xáo vì hết nước nối thì báo vào khung chat — cùng giải đề là bàn chung, đối kháng là bàn của mình;
   * đối kháng có người về nhất thì báo luôn.
   */
  protected watch(m: Meta) {
    if (!m.kw || m.status !== "playing") return;
    const s = this.stateOf(m, m.kw);
    const me = m.lineup.indexOf(this.me);
    const race = s.mode === "race";
    // Đối kháng: người xem không có bàn riêng nên không báo xáo.
    const shuffles = !race ? s.desks[0].shuffles : me >= 0 ? this.ownOf(m, m.kw).desks[0].shuffles : 0;
    if (this.told.round !== m.round) this.told = { round: m.round, shuffles: (race ? this.ownOf(m, m.kw).count : s.taken.length) ? 0 : shuffles };
    for (let n = this.told.shuffles + 1; n <= shuffles; n++) {
      // Id cố định theo ván và lần xáo: tải lại trang (khung chat khôi phục từ snapshot) không báo lặp.
      const text = race ? "🔀 Bàn của bạn hết cặp nối được — tự xáo lại!" : "🔀 Hết cặp nối được — bàn tự xáo lại!";
      this.pushChat({ id: `kw-shuffle:${m.round}:${n}`, uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true });
    }
    this.told.shuffles = Math.max(this.told.shuffles, shuffles);

    const first = s.winners[0];
    // Ván xong luôn (vd. chơi một mình) thì câu báo kết quả ván là đủ.
    if (!race || first == null || s.over || this.hailed === m.round) return;
    this.hailed = m.round;
    // Id cố định theo ván: tải lại trang không báo lặp.
    const text = `🏆 ${this.nameOf(m.lineup[first])} dọn sạch bàn đầu tiên — thắng ván ${m.round}! Mọi người tiếp tục hoàn tất ván nhé.`;
    this.pushChat({ id: `kw-win:${m.round}`, uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true });
  }

  /** Bàn chơi chỉ đọc nước đi `m:` của chính mình — của người khác thì chủ phòng đã gộp vào bàn chung `g:`. */
  protected viewKey(k: string) {
    return !k.startsWith("m:") || k.endsWith(`:${this.me}`);
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): KwView {
    const opts = normOptions(m.opts);
    const kw = m.kw;
    if (!kw || !m.round || !m.lineup.length) return { opts };
    const state = this.stateOf(m, kw);
    const board = this.board(m);
    const me = m.lineup.indexOf(this.me);
    const live = m.status === "playing" && !state.over;
    let desk = { tiles: state.desks[0].tiles, shuffles: state.desks[0].shuffles, left: state.desks[0].left };
    let pending: [number, number][] = [];
    let hints = me >= 0 ? state.hints[me] : 0;
    if (state.mode === "race" && me >= 0) {
      const own = this.ownOf(m, kw);
      desk = own.desks[0];
      hints = own.hints[0];
    } else if (state.mode === "race") desk = deskOf(state, 0);
    else if (me >= 0 && live) {
      const o = optimistic(state, this.movesOf(m, this.me).slice(board.seen[me] ?? 0));
      desk = { ...desk, tiles: o.tiles, left: desk.left - o.pairs.length * 2 };
      pending = o.pairs;
    }
    return {
      opts,
      match: {
        round: m.round,
        size: kw.size,
        mode: state.mode,
        lineup: m.lineup.map(seatOf),
        me,
        state,
        tiles: desk.tiles,
        shuffles: desk.shuffles,
        left: desk.left,
        pending,
        cleared: state.mode === "race" && me >= 0 && desk.left <= 0,
        hints,
        opensAt: this.opensAt(m, kw),
        lockedUntil: this.lock.round === m.round ? this.lock.until : 0,
        fin: Array.from({ length: m.lineup.length }, (_, k) => board.fin?.[k] ?? null),
        result: m.status === "ended" && m.result?.round === m.round ? m.result : undefined,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    const w = r.winners ?? [];
    if (r.reason !== "points" || !w.length) return `Ván ${r.round} dừng giữa chừng`;
    if (this.meta()?.kw?.mode === "race" && (this.meta()?.lineup.length ?? 0) > 1) return `Ván ${r.round} kết thúc — ${name(w[0])} về nhất!`;
    if (w.length > 1) return `${w.map(name).join(", ")} đồng hạng nhất ván ${r.round}`;
    if (this.meta()?.lineup.length === 1) return `${name(w[0])} dọn sạch bàn ván ${r.round}!`;
    return `${name(w[0])} nhiều điểm nhất — thắng ván ${r.round}!`;
  }

  // ---------- hành động ----------

  /** Ván đang chơi mà mình là người chơi, bàn đã lộ, mình chưa dọn xong và không bị khoá tay. */
  private playable() {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || m.status !== "playing" || !g || g.round !== m.round || g.me < 0 || g.state.over || g.cleared) return null;
    const now = Date.now();
    if (now < g.opensAt || now < g.lockedUntil) return null;
    return { m, g };
  }

  private push(m: Meta, move: unknown[]) {
    this.gossip.set(`m:${m.round}:${this.me}`, { moves: [...this.movesOf(m, this.me), move] });
    this.react();
  }

  /** Nối hai ô. Trả về đường nối để giao diện diễn ngay, hoặc null nếu không nối được trên bàn mình đang thấy. */
  connect(a: number, b: number): Point[] | null {
    const p = this.playable();
    if (!p) return null;
    const { w, h } = p.g.state;
    const path = findPath(p.g.tiles, w, h, a, b);
    if (path) this.push(p.m, [a, b, p.g.shuffles]);
    return path;
  }

  /**
   * Xin gợi ý (cùng giải đề: bị trừ điểm; đối kháng: bị khoá tay): trả về một cặp nối được trên bàn mình đang thấy,
   * null nếu chưa có.
   */
  hint(): [number, number] | null {
    const p = this.playable();
    if (!p) return null;
    const pair = findMove(p.g.tiles, p.g.state.w, p.g.state.h);
    if (!pair) return null;
    if (p.g.mode === "race") {
      // Khoá tay (`lockedUntil`) chỉ nằm trên máy mình.
      this.lock = { round: p.m.round, until: Date.now() + HINT_LOCK_MS };
      this.gameStore.invalidate();
    }
    this.push(p.m, [-1]);
    return pair;
  }

  /** Chủ phòng đổi luật (cỡ bàn, chế độ) cho ván tới. */
  setOptions(next: Partial<KwOptions>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const opts = normOptions({ ...normOptions(m.opts), ...next });
      if (JSON.stringify(opts) === JSON.stringify(normOptions(m.opts))) return false;
      m.opts = { ...m.opts, ...opts };
    });
  }

  /** Chủ phòng dừng ván giữa chừng: không tính ai thắng, trừ người đã về nhất ở chế độ đối kháng. */
  stop() {
    this.hostEdit((m) => {
      if (m.status !== "playing") return false;
      m.status = "ended";
      m.result = this.cutShort(m);
    });
  }
}
