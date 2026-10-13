/**
 * Phòng Nối Thú Kawaii: không giới hạn ghế, một người cũng chơi được. Bắt đầu ván, chủ phòng chốt đội hình và `meta.kw`
 * (seed, cỡ bàn, giờ lộ bàn) — mọi máy tự sinh cùng một bàn từ seed. Người chơi chỉ nối nước của mình vào `m:<ván>:<uid>`;
 * máy chủ phòng xét các nước mới theo thứ tự mình thấy (`judge`) rồi ghi bàn chung `g:<ván>` — ai nối được cặp nào, điểm,
 * các lần bàn tự xáo, người thắng đều suy ra tất định từ bàn chung. Không tính giờ: dọn sạch bàn là hết ván.
 */
import {
  COUNTDOWN_MS,
  emptyBoard,
  findMove,
  findPath,
  judge,
  MIN_PLAYERS,
  normOptions,
  optimistic,
  replay,
  type Board,
  type KwOptions,
  type KwRound,
  type KwState,
  type Point,
  type SizeKey,
} from "../games/kawaii";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

/** Cả đội hình mất kết nối chừng này thì dừng ván. */
const ABANDON_MS = 60000;

export type KwMatch = {
  round: number;
  size: SizeKey;
  lineup: SeatView[];
  /** Thứ tự của mình trong đội hình; -1 nếu chỉ xem. */
  me: number;
  state: KwState;
  /** Bàn mình thấy: bàn chung, bỏ đi các cặp mình vừa nối đang chờ chủ phòng ghi nhận. */
  tiles: number[];
  /** Các cặp mình vừa nối, đang chờ chủ phòng ghi nhận. */
  pending: [number, number][];
  /** Giờ máy mình lúc lộ bàn (hết đếm ngược). */
  opensAt: number;
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
  private opened = { round: -1, at: 0 };
  /** Đã báo tới lần xáo bàn thứ mấy của ván nào. */
  private told = { round: -1, shuffles: 0 };

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

  /** Chủ phòng phân xử các nước mới; cả đội hình bỏ đi thì dừng ván. */
  protected hostPlay(m: Meta) {
    const kw = m.kw!;
    const next = judge(
      kw,
      m.lineup.map((u) => this.movesOf(m, u)),
      this.board(m),
      this.stateOf(m, kw),
    );
    if (next) this.gossip.set(`g:${m.round}`, next);
    if (m.lineup.every((u) => u !== this.me && this.silentFor(u) >= ABANDON_MS)) {
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
    }
  }

  /** Mọi máy: bàn tự xáo vì hết nước nối thì báo vào khung chat. */
  protected watch(m: Meta) {
    if (!m.kw || m.status !== "playing") return;
    const s = this.stateOf(m, m.kw);
    if (this.told.round !== m.round) this.told = { round: m.round, shuffles: s.taken.length ? 0 : s.shuffles };
    for (let n = this.told.shuffles + 1; n <= s.shuffles; n++) {
      // Id cố định theo ván và lần xáo: tải lại trang (khung chat khôi phục từ snapshot) không báo lặp.
      this.pushChat({ id: `kw-shuffle:${m.round}:${n}`, uid: "", name: "", avatar: "", color: "", at: Date.now(), text: "🔀 Hết cặp nối được — bàn tự xáo lại!", system: true });
    }
    this.told.shuffles = Math.max(this.told.shuffles, s.shuffles);
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): KwView {
    const opts = normOptions(m.opts);
    const kw = m.kw;
    if (!kw || !m.round || !m.lineup.length) return { opts };
    const state = this.stateOf(m, kw);
    const me = m.lineup.indexOf(this.me);
    const live = m.status === "playing" && !state.over;
    const mine = me >= 0 && live ? this.movesOf(m, this.me).slice(this.board(m).seen[me] ?? 0) : [];
    const { tiles, pairs } = optimistic(state, mine);
    return {
      opts,
      match: {
        round: m.round,
        size: kw.size,
        lineup: m.lineup.map(seatOf),
        me,
        state,
        tiles,
        pending: pairs,
        opensAt: this.opensAt(m, kw),
        result: m.status === "ended" && m.result?.round === m.round ? m.result : undefined,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    const w = r.winners ?? [];
    if (r.reason !== "points" || !w.length) return `Ván ${r.round} dừng giữa chừng`;
    if (w.length > 1) return `${w.map(name).join(", ")} đồng hạng nhất ván ${r.round}`;
    if (this.meta()?.lineup.length === 1) return `${name(w[0])} dọn sạch bàn ván ${r.round}!`;
    return `${name(w[0])} nhiều điểm nhất — thắng ván ${r.round}!`;
  }

  // ---------- hành động ----------

  /** Ván đang chơi mà mình là người chơi và bàn đã lộ. */
  private playable() {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || m.status !== "playing" || !g || g.round !== m.round || g.me < 0 || g.state.over || Date.now() < g.opensAt) return null;
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
    if (path) this.push(p.m, [a, b, p.g.state.shuffles]);
    return path;
  }

  /** Xin gợi ý (bị trừ điểm): trả về một cặp nối được trên bàn mình đang thấy, null nếu chưa có. */
  hint(): [number, number] | null {
    const p = this.playable();
    if (!p) return null;
    const pair = findMove(p.g.tiles, p.g.state.w, p.g.state.h);
    if (pair) this.push(p.m, [-1]);
    return pair;
  }

  /** Chủ phòng đổi cỡ bàn cho ván tới. */
  setOptions(next: Partial<KwOptions>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const opts = normOptions({ ...normOptions(m.opts), ...next });
      if (opts.size === normOptions(m.opts).size) return false;
      m.opts = { ...m.opts, ...opts };
    });
  }

  /** Chủ phòng dừng ván giữa chừng: không tính ai thắng. */
  stop() {
    this.hostEdit((m) => {
      if (m.status !== "playing") return false;
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
    });
  }
}
