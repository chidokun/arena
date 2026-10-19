// Người chơi mất kết nối quá lâu (hoặc bị mời ra) bị loại như đạp mìn, để người còn lại không phải chờ.
import {
  chordCells,
  COUNTDOWN_MS,
  emptyBoard,
  HIDDEN,
  judge,
  makeLayout,
  MIN_PLAYERS,
  normOptions,
  optimistic,
  replay,
  SIZES,
  type Board,
  type Layout,
  type MsOptions,
  type MsRound,
  type MsState,
  type SizeKey,
} from "../games/minesweeper";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

const ABANDON_MS = 60000;
// Đủ lâu để tải lại trang không bị loại oan.
const QUIT_MS = 30000;

const flagKey = (id: string) => `arena:ms-flags:${id}`;
const layoutKey = (ms: MsRound) => `${ms.seed}:${ms.size}:${ms.mines}`;

export type MsMatch = {
  round: number;
  size: SizeKey;
  mines: number;
  layout: Layout;
  lineup: SeatView[];
  me: number;
  state: MsState;
  view: MsState;
  flags: number[];
  opensAt: number;
  time?: number;
  result?: Result;
};

export type MsView = {
  opts: MsOptions;
  match?: MsMatch;
};

export class MinesweeperRoom extends RoomSession<MsView> {
  readonly game = "minesweeper";
  private lay: { key: string; layout: Layout } | null = null;
  // Nhật ký chỉ dài thêm nên dựng tiếp từ trạng thái gần nhất thay vì từ đầu.
  private cache: { round: number; key: string; tail: string; state: MsState } | null = null;
  private opened = { round: -1, at: 0 };
  private told = { round: -1, out: 0 };
  private flags = { round: -1, cells: new Set<number>() };

  private layoutOf(ms: MsRound) {
    const key = layoutKey(ms);
    if (this.lay?.key !== key) this.lay = { key, layout: makeLayout(ms) };
    return this.lay.layout;
  }

  private board(m: Meta): Board {
    const b = this.gossip.get<Board>(`g:${m.round}`);
    return b && Array.isArray(b.log) && Array.isArray(b.seen) ? b : emptyBoard(m.lineup.length);
  }

  private movesOf(m: Meta, uid: string): unknown[] {
    const list = this.gossip.get<{ moves?: unknown }>(`m:${m.round}:${uid}`)?.moves;
    return Array.isArray(list) ? list : [];
  }

  private stateOf(m: Meta, ms: MsRound) {
    const log = this.board(m).log;
    const key = layoutKey(ms);
    const c = this.cache;
    // Chỉ dựng tiếp khi nhật ký mới vẫn bắt đầu bằng phần đã dựng (chủ phòng mới tiếp quản có thể ghi khác đi).
    const same = c && c.round === m.round && c.key === key && c.state.count <= log.length && c.tail === JSON.stringify(log[c.state.count - 1]);
    const state = replay(this.layoutOf(ms), m.lineup.length, log, same ? c.state : undefined);
    this.cache = { round: m.round, key, tail: JSON.stringify(log[state.count - 1]), state };
    return state;
  }

  private opensAt(m: Meta, ms: MsRound) {
    if (this.opened.round !== m.round) {
      const now = Date.now();
      this.opened = { round: m.round, at: ms.t0 <= now ? ms.t0 : now + Math.min(COUNTDOWN_MS, ms.t0 - now) };
    }
    return this.opened.at;
  }

  private flagsOf(round: number) {
    if (this.flags.round !== round) {
      let cells: number[] = [];
      try {
        const raw = JSON.parse(sessionStorage.getItem(flagKey(this.id)) ?? "null");
        if (raw?.round === round && Array.isArray(raw.cells)) cells = raw.cells.filter(Number.isInteger);
      } catch {}
      this.flags = { round, cells: new Set(cells) };
    }
    return this.flags.cells;
  }

  protected begin(m: Meta) {
    const lineup = m.players.filter((u) => this.isOnline(u));
    if (lineup.length < MIN_PLAYERS) return false;
    m.lineup = lineup;
    m.ms = { ...normOptions(m.opts), seed: crypto.getRandomValues(new Uint32Array(1))[0], t0: Date.now() + COUNTDOWN_MS };
    return true;
  }

  protected outcome(m: Meta): Result | undefined {
    if (!m.ms) return { round: m.round, winner: null, winners: [], reason: "stop" };
    const s = this.stateOf(m, m.ms);
    if (!s.over) return;
    if (!s.cleared) return { round: m.round, winner: null, winners: [], reason: "boom" };
    const winners = s.winners.map((k) => m.lineup[k]);
    const reason = s.alive.filter(Boolean).length > 1 ? "points" : "solve";
    return { round: m.round, winner: winners.length === 1 ? winners[0] : null, winners, reason };
  }

  protected hostPlay(m: Meta) {
    const ms = m.ms!;
    const lay = this.layoutOf(ms);
    const prev = this.board(m);
    const s = this.stateOf(m, ms);
    const gone = m.lineup.flatMap((u, k) => (s.alive[k] && (this.cheated(m, u) || (u !== this.me && (m.kicked.includes(u) || this.silentFor(u) >= QUIT_MS))) ? [k] : []));
    const judged = judge(
      lay,
      m.lineup.map((u) => this.movesOf(m, u)),
      prev,
      s,
      gone,
    );
    let next = judged;
    if (judged && judged.time == null && replay(lay, m.lineup.length, judged.log, s).over) next = { ...judged, time: Math.max(0, Date.now() - ms.t0) };
    if (next) this.gossip.set(`g:${m.round}`, next);
    if (m.lineup.every((u) => u !== this.me && this.silentFor(u) >= ABANDON_MS)) {
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
    }
  }

  protected watch(m: Meta) {
    if (!m.ms || m.status !== "playing") return;
    const s = this.stateOf(m, m.ms);
    // Vào giữa ván (tải lại trang, người mới vào) thì không báo lại chuyện cũ.
    if (this.told.round !== m.round) this.told = { round: m.round, out: s.count ? s.out.length : 0 };
    const say = (id: string, text: string) => this.pushChat({ id, uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true });
    for (let n = this.told.out; n < s.out.length; n++) {
      const k = s.out[n];
      const name = this.nameOf(m.lineup[k]);
      // Id cố định theo ván và người: tải lại trang (khung chat khôi phục từ snapshot) không báo lặp.
      say(`ms-out:${m.round}:${k}`, s.fate[k] === "boom" ? `💥 ${name} đạp mìn — bị loại!` : `🚪 ${name} rời ván — bị loại.`);
    }
    if (s.out.length > this.told.out && !s.over && m.lineup.length > 1) {
      const alive = s.alive.flatMap((a, k) => (a ? [k] : []));
      if (alive.length === 1) say(`ms-last:${m.round}`, `⚠️ Chỉ còn ${this.nameOf(m.lineup[alive[0]])} trụ lại — phải mở hết ô an toàn mới thắng!`);
    }
    this.told.out = s.out.length;
  }

  /** Bàn chơi chỉ đọc nước đi `m:` của chính mình — của người khác thì chủ phòng đã gộp vào bàn chung `g:`. */
  protected viewKey(k: string) {
    return !k.startsWith("m:") || k.endsWith(`:${this.me}`);
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): MsView {
    const opts = normOptions(m.opts);
    const ms = m.ms;
    if (!ms || !m.round || !m.lineup.length) return { opts };
    const layout = this.layoutOf(ms);
    const board = this.board(m);
    const state = this.stateOf(m, ms);
    const me = m.lineup.indexOf(this.me);
    const live = m.status === "playing" && !state.over;
    const mine = me >= 0 && live ? this.movesOf(m, this.me).slice(board.seen[me] ?? 0) : [];
    const view = optimistic(state, layout, me, mine);
    const flags = me >= 0 ? [...this.flagsOf(m.round)].filter((c) => view.by[c] === HIDDEN && view.boom[c] < 0) : [];
    return {
      opts,
      match: {
        round: m.round,
        size: ms.size,
        mines: layout.mines,
        layout,
        lineup: m.lineup.map(seatOf),
        me,
        state,
        view,
        flags,
        opensAt: this.opensAt(m, ms),
        time: board.time,
        result: m.status === "ended" && m.result?.round === m.round ? m.result : undefined,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    const w = r.winners ?? [];
    const solo = this.meta()?.lineup.length === 1;
    if (r.reason === "boom") return solo ? `Đạp mìn rồi — thua ván ${r.round}` : `Ván ${r.round} kết thúc — ai cũng đạp mìn, không ai thắng`;
    if ((r.reason !== "points" && r.reason !== "solve") || !w.length) return `Ván ${r.round} dừng giữa chừng`;
    if (r.reason === "solve") return `${name(w[0])} mở hết bàn — thắng ván ${r.round}!`;
    if (w.length > 1) return `${w.map(name).join(", ")} đồng hạng nhất ván ${r.round}`;
    return `${name(w[0])} nhiều điểm nhất — thắng ván ${r.round}!`;
  }

  private playable() {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || m.status !== "playing" || !g || g.round !== m.round || g.me < 0 || g.view.over || !g.view.alive[g.me] || Date.now() < g.opensAt) return null;
    return { m, g };
  }

  private push(m: Meta, cells: number[]) {
    this.gossip.set(`m:${m.round}:${this.me}`, { moves: [...this.movesOf(m, this.me), ...cells] });
    this.react();
  }

  reveal(c: number): "safe" | "boom" | null {
    const p = this.playable();
    if (!p) return null;
    const { view: s, layout: lay, flags } = p.g;
    let cells: number[];
    if (s.by[c] === HIDDEN) cells = s.boom[c] < 0 && !flags.includes(c) ? [c] : [];
    else cells = chordCells(s, lay, c, new Set(flags));
    if (!cells.length) return null;
    this.push(p.m, cells);
    return cells.some((x) => lay.mine[x]) ? "boom" : "safe";
  }

  toggleFlag(c: number) {
    const p = this.playable();
    if (!p || p.g.view.by[c] !== HIDDEN || p.g.view.boom[c] >= 0) return;
    const cells = this.flagsOf(p.m.round);
    if (cells.has(c)) cells.delete(c);
    else cells.add(c);
    try {
      sessionStorage.setItem(flagKey(this.id), JSON.stringify({ round: p.m.round, cells: [...cells] }));
    } catch {}
    // Cờ cắm chỉ nằm trên máy mình.
    this.gameStore.invalidate();
    this.react();
  }

  setOptions(next: Partial<MsOptions>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const cur = normOptions(m.opts);
      const opts = normOptions({ ...cur, ...(next.size && next.mines == null ? { mines: SIZES[next.size].mines } : {}), ...next });
      if (opts.size === cur.size && opts.mines === cur.mines) return false;
      m.opts = { ...m.opts, ...opts };
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
