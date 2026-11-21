import {
  COUNTDOWN_MS,
  emptyBoard,
  judge,
  LOCK_MS,
  makePuzzle,
  normOptions,
  replay,
  solvedBy,
  stamp,
  standable,
  type Board,
  type Entry,
  type GdOptions,
  type GdRound,
  type GdState,
  type Level,
  type Mode,
  type Move,
  type Puzzle,
  type Theme,
} from "../games/grid-detective";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

const ABANDON_MS = 60000;
const QUIT_MS = 20000;

export type GdMatch = {
  round: number;
  level: Level;
  mode: Mode;
  theme: Theme;
  puzzle: Puzzle;
  lineup: SeatView[];
  me: number;
  state: GdState;
  log: Entry[];
  /** Cùng phá án: quân mình đã đặt đúng nhưng chủ phòng chưa ghi nhận (hiện mờ cho đỡ trễ). */
  pending: [token: number, cell: number][];
  /** Đối kháng: mình đã nộp đúng (chủ phòng chưa ghi nhận cũng tính). */
  solved: boolean;
  /** Cùng phá án: mình đã dùng lượt buộc tội. */
  accused: boolean;
  opensAt: number;
  lockedUntil: number;
  time?: number;
  fin: (number | null)[];
  result?: Result;
};

export type GdView = {
  opts: GdOptions;
  match?: GdMatch;
};

export class GridDetectiveRoom extends RoomSession<GdView> {
  readonly game = "grid-detective";
  private cache: { seed: number; level: Level; theme: Theme; puzzle: Puzzle } | null = null;
  private opened = { round: -1, at: 0 };
  private lock = { round: -1, until: 0 };
  private hailed = -1;

  private puzzleOf(gd: GdRound) {
    const c = this.cache;
    if (c?.seed === gd.seed && c.level === gd.level && c.theme === gd.theme) return c.puzzle;
    const puzzle = makePuzzle(gd.seed, gd.level, gd.theme);
    this.cache = { seed: gd.seed, level: gd.level, theme: gd.theme, puzzle };
    return puzzle;
  }

  private board(m: Meta): Board {
    const b = this.gossip.get<Board>(`g:${m.round}`);
    return b && Array.isArray(b.log) && Array.isArray(b.seen) ? b : emptyBoard(m.lineup.length);
  }

  private movesOf(m: Meta, uid: string): unknown[] {
    const list = this.gossip.get<{ moves?: unknown }>(`m:${m.round}:${uid}`)?.moves;
    return Array.isArray(list) ? list : [];
  }

  private stateOf(m: Meta, gd: GdRound) {
    return replay(this.puzzleOf(gd), gd.mode, m.lineup.length, this.board(m).log);
  }

  // Đếm ngược tối đa một nhịp để máy chậm giờ không phải chờ lâu hơn.
  private opensAt(m: Meta, gd: GdRound) {
    if (this.opened.round !== m.round) {
      const now = Date.now();
      this.opened = { round: m.round, at: gd.t0 <= now ? gd.t0 : now + Math.min(COUNTDOWN_MS, gd.t0 - now) };
    }
    return this.opened.at;
  }

  protected begin(m: Meta) {
    const lineup = m.players.filter((u) => this.isOnline(u));
    if (!lineup.length) return false;
    m.lineup = lineup;
    m.gd = { ...normOptions(m.opts), seed: crypto.getRandomValues(new Uint32Array(1))[0], t0: Date.now() + COUNTDOWN_MS };
    return true;
  }

  protected outcome(m: Meta): Result | undefined {
    if (!m.gd) return { round: m.round, winner: null, winners: [], reason: "stop" };
    const s = this.stateOf(m, m.gd);
    if (!s.over) return;
    const winners = s.winners.map((k) => m.lineup[k]);
    return { round: m.round, winner: winners.length === 1 ? winners[0] : null, winners, reason: "solve" };
  }

  private cutShort(m: Meta): Result {
    const s = m.gd ? this.stateOf(m, m.gd) : undefined;
    if (m.gd?.mode === "race" && s?.winners.length) return { round: m.round, winner: m.lineup[s.winners[0]], winners: [m.lineup[s.winners[0]]], reason: "solve" };
    return { round: m.round, winner: null, winners: [], reason: "stop" };
  }

  protected hostPlay(m: Meta) {
    const gd = m.gd!;
    const puzzle = this.puzzleOf(gd);
    const judged = judge(
      puzzle,
      gd.mode,
      m.lineup.map((u) => (this.cheated(m, u) ? [] : this.movesOf(m, u))),
      this.board(m),
    );
    const board = judged ?? this.board(m);
    const s = replay(puzzle, gd.mode, m.lineup.length, board.log);
    const next = stamp(board, s, Math.max(0, Date.now() - gd.t0)) ?? judged;
    if (next) this.gossip.set(`g:${m.round}`, next);
    if (s.over) return;
    const gone = (u: string) => this.cheated(m, u) || (u !== this.me && this.silentFor(u) >= QUIT_MS);
    const quit = gd.mode === "race" && s.winners.length > 0 && m.lineup.every((u, k) => s.finished.includes(k) || gone(u));
    if (quit || m.lineup.every((u) => u !== this.me && this.silentFor(u) >= ABANDON_MS)) {
      m.status = "ended";
      m.result = this.cutShort(m);
    }
  }

  protected watch(m: Meta) {
    const gd = m.gd;
    if (!gd || m.status !== "playing" || this.hailed === m.round) return;
    const s = this.stateOf(m, gd);
    const p = this.puzzleOf(gd);
    // Id cố định theo ván: tải lại trang (khung chat khôi phục từ snapshot) không báo lặp.
    if (gd.mode === "race") {
      const first = s.winners[0];
      // Ván xong luôn (vd. chơi một mình) thì câu báo kết quả ván là đủ.
      if (first == null || s.over) return;
      this.hailed = m.round;
      const text = `🔎 ${this.nameOf(m.lineup[first])} phá án đầu tiên — thắng ván ${m.round}! Mọi người tiếp tục tìm ra thủ phạm nhé.`;
      this.pushChat({ id: `gd-win:${m.round}`, uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true });
      return;
    }
    if (s.accuser < 0) return;
    this.hailed = m.round;
    const text = `🔎 ${this.nameOf(m.lineup[s.accuser])} đã chỉ đúng ${p.tokens[p.culprit].name} là thủ phạm (+2 điểm)!`;
    this.pushChat({ id: `gd-accuse:${m.round}`, uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true });
  }

  /** Bàn chơi chỉ đọc nước đi `m:` của chính mình — của người khác thì chủ phòng đã gộp vào bàn chung `g:`. */
  protected viewKey(k: string) {
    return !k.startsWith("m:") || k.endsWith(`:${this.me}`);
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): GdView {
    const opts = normOptions(m.opts);
    const gd = m.gd;
    if (!gd || !m.round || !m.lineup.length) return { opts };
    const puzzle = this.puzzleOf(gd);
    const board = this.board(m);
    const state = replay(puzzle, gd.mode, m.lineup.length, board.log);
    const me = m.lineup.indexOf(this.me);
    const pending: [number, number][] = [];
    let solved = me >= 0 && state.finished.includes(me);
    let accused = me >= 0 && state.accused[me];
    if (me >= 0) {
      for (const mv of this.movesOf(m, this.me) as Move[]) {
        if (!Array.isArray(mv)) continue;
        if (mv[0] === "p" && state.placed[mv[1]] < 0 && puzzle.solution[mv[1]] === mv[2] && !pending.some(([t]) => t === mv[1])) pending.push([mv[1], mv[2]]);
        if (mv[0] === "s" && Array.isArray(mv[1]) && solvedBy(puzzle, mv[1])) solved = true;
        if (mv[0] === "a") accused = true;
      }
    }
    return {
      opts,
      match: {
        round: m.round,
        level: gd.level,
        mode: gd.mode,
        theme: gd.theme,
        puzzle,
        lineup: m.lineup.map(seatOf),
        me,
        state,
        log: board.log,
        pending,
        solved,
        accused,
        opensAt: this.opensAt(m, gd),
        lockedUntil: this.lock.round === m.round ? this.lock.until : 0,
        time: board.time,
        fin: Array.from({ length: m.lineup.length }, (_, k) => board.fin?.[k] ?? null),
        result: m.status === "ended" && m.result?.round === m.round ? m.result : undefined,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    const w = r.winners ?? [];
    if (r.reason !== "solve" || !w.length) return `Ván ${r.round} dừng giữa chừng`;
    if (this.meta()?.gd?.mode === "race") return `Ván ${r.round} kết thúc — ${name(w[0])} phá án nhanh nhất!`;
    return w.length > 1 ? `${w.map(name).join(", ")} đồng hạng nhất ván ${r.round}` : `${name(w[0])} nhiều điểm nhất — thắng ván ${r.round}!`;
  }

  private playable() {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || m.status !== "playing" || !g || g.round !== m.round || g.me < 0 || g.state.over) return null;
    const now = Date.now();
    if (now < g.opensAt || now < g.lockedUntil) return null;
    return { m, g, now };
  }

  private post(m: Meta, mv: Move) {
    this.gossip.set(`m:${m.round}:${this.me}`, { moves: [...this.movesOf(m, this.me), mv] });
  }

  // Máy nào cũng có lời giải nên trả về "right" / "wrong" ngay để giao diện phản hồi.
  /** Cùng phá án: đặt một quân. */
  place(token: number, cell: number): "right" | "wrong" | null {
    const x = this.playable();
    if (!x || x.g.mode !== "coop") return null;
    const { m, g } = x;
    if (!Number.isInteger(token) || token < 0 || token >= g.puzzle.n || g.state.placed[token] >= 0 || g.pending.some(([t]) => t === token)) return null;
    if (!standable(g.puzzle, cell) || g.state.placed.includes(cell) || g.pending.some(([, c]) => c === cell)) return null;
    this.post(m, ["p", token, cell]);
    this.react();
    return g.puzzle.solution[token] === cell ? "right" : "wrong";
  }

  /** Cùng phá án: dùng lượt buộc tội duy nhất. */
  accuse(suspect: number): "right" | "wrong" | null {
    const x = this.playable();
    if (!x || x.g.mode !== "coop" || x.g.accused || x.g.state.accuser >= 0) return null;
    if (!Number.isInteger(suspect) || suspect < 1 || suspect >= x.g.puzzle.n) return null;
    this.post(x.m, ["a", suspect]);
    this.react();
    return suspect === x.g.puzzle.culprit ? "right" : "wrong";
  }

  /** Đối kháng: nộp cả bàn. Sai thì khoá tay. */
  submit(cells: number[]): "right" | "wrong" | null {
    const x = this.playable();
    if (!x || x.g.mode !== "race" || x.g.solved) return null;
    const { m, g, now } = x;
    if (cells.length !== g.puzzle.n || cells.some((c) => !Number.isInteger(c) || c < 0 || c >= g.puzzle.n * g.puzzle.n)) return null;
    this.post(m, ["s", cells.slice()]);
    const right = solvedBy(g.puzzle, cells);
    if (!right) {
      this.lock = { round: m.round, until: now + LOCK_MS };
      // Khoá tay (`lockedUntil`) chỉ nằm trên máy mình.
      this.gameStore.invalidate();
    }
    this.react();
    return right ? "right" : "wrong";
  }

  setOptions(next: Partial<GdOptions>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const opts = normOptions({ ...normOptions(m.opts), ...next });
      if (JSON.stringify(opts) === JSON.stringify(normOptions(m.opts))) return false;
      m.opts = { ...m.opts, ...opts };
    });
  }

  stop() {
    this.hostEdit((m) => {
      if (m.status !== "playing") return false;
      m.status = "ended";
      m.result = this.cutShort(m);
    });
  }
}
