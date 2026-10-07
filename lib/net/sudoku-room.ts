/**
 * Phòng Sudoku tranh đấu. Bắt đầu ván, chủ phòng chốt đội hình và `meta.sd` (seed, mức, chế độ) — mọi máy tự sinh
 * cùng một đề từ seed. Người chơi chỉ nối nước điền của mình vào `m:<ván>:<uid>`; máy chủ phòng xét các nước mới theo
 * thứ tự mình thấy (`judge`) rồi ghi bàn chung `g:<ván>` — ai giữ ô nào (cùng giải đề), ai giải ô nào nhanh nhất
 * (đối kháng), điểm, người thắng đều suy ra tất định từ bàn chung. Đề lộ sau một nhịp đếm ngược tính trên giờ máy
 * từng người; điền sai ở chế độ đối kháng bị khoá tay tại máy mình. Đối kháng: người xong đầu tiên thắng ngay, những
 * người còn lại giải tiếp — ván xong khi mọi người đã giải xong (hoặc người chưa xong đều đã rời đi).
 */
import {
  COUNTDOWN_MS,
  emptyBoard,
  judge,
  LOCK_MS,
  makePuzzle,
  normOptions,
  ownBoard,
  replay,
  stamp,
  type Board,
  type Entry,
  type Level,
  type Mode,
  type Puzzle,
  type SudokuOptions,
  type SudokuRound,
  type SudokuState,
} from "../games/sudoku";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

/** Cả đội hình mất kết nối chừng này thì dừng ván. */
const ABANDON_MS = 60000;
/** Đối kháng đã có người thắng: những người chưa xong đều mất kết nối chừng này thì kết thúc ván. */
const QUIT_MS = 20000;

export type SudokuMatch = {
  round: number;
  level: Level;
  mode: Mode;
  puzzle: Puzzle;
  lineup: SeatView[];
  /** Thứ tự của mình trong đội hình; -1 nếu chỉ xem. */
  me: number;
  state: SudokuState;
  /** Các nước chủ phòng đã phân xử, theo thứ tự (để diễn hiệu ứng khi có người vừa giải đúng). */
  log: Entry[];
  /**
   * Bàn mình thấy: số cho sẵn và số đã giải. Đối kháng: người chơi thấy bàn riêng dựng từ nhật ký của mình, người xem
   * thấy mọi ô đã có người giải; cùng giải đề: bàn chung.
   */
  cells: number[];
  /** Cùng giải đề: các ô mình vừa điền đúng, đang chờ chủ phòng ghi nhận. */
  pending: number[];
  /** Giờ máy mình lúc lộ đề (hết đếm ngược). */
  opensAt: number;
  /** Đối kháng: khoá tay tới lúc này (giờ máy mình). */
  lockedUntil: number;
  /** Thời gian giải (ms) chủ phòng đo khi ván xong. */
  time?: number;
  /** Đối kháng: thời gian từng người giải xong (theo thứ tự đội hình); null nếu chưa xong. */
  fin: (number | null)[];
  result?: Result;
};

export type SudokuView = {
  /** Luật cho ván tới. */
  opts: SudokuOptions;
  /** Ván hiện tại hoặc vừa xong; undefined khi chưa chơi ván nào. */
  match?: SudokuMatch;
};

export class SudokuRoom extends RoomSession<SudokuView> {
  readonly game = "sudoku";
  private cache: { seed: number; level: Level; puzzle: Puzzle } | null = null;
  private opened = { round: -1, at: 0 };
  private lock = { round: -1, until: 0 };
  /** Đã báo người về nhất của ván nào (đối kháng). */
  private hailed = -1;

  private puzzleOf(sd: SudokuRound) {
    const c = this.cache;
    if (c?.seed === sd.seed && c.level === sd.level) return c.puzzle;
    const puzzle = makePuzzle(sd.seed, sd.level);
    this.cache = { seed: sd.seed, level: sd.level, puzzle };
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

  private stateOf(m: Meta, sd: SudokuRound) {
    return replay(this.puzzleOf(sd), sd.mode, m.lineup.length, this.board(m).log);
  }

  /**
   * Giờ máy mình lúc lộ đề: lần đầu thấy ván thì đếm ngược phần còn lại theo giờ chủ phòng, tối đa một nhịp đếm ngược
   * — máy chậm giờ không phải chờ lâu hơn; vào giữa ván (tải lại trang) thì chơi ngay, đồng hồ tính từ giờ lộ đề.
   */
  private opensAt(m: Meta, sd: SudokuRound) {
    if (this.opened.round !== m.round) {
      const now = Date.now();
      this.opened = { round: m.round, at: sd.t0 <= now ? sd.t0 : now + Math.min(COUNTDOWN_MS, sd.t0 - now) };
    }
    return this.opened.at;
  }

  // ---------- luật ----------

  protected begin(m: Meta) {
    const lineup = m.players.filter((u) => this.isOnline(u));
    if (!lineup.length) return false;
    m.lineup = lineup;
    m.sd = { ...normOptions(m.opts), seed: crypto.getRandomValues(new Uint32Array(1))[0], t0: Date.now() + COUNTDOWN_MS };
    return true;
  }

  protected outcome(m: Meta): Result | undefined {
    if (!m.sd) return { round: m.round, winner: null, winners: [], reason: "stop" };
    const s = this.stateOf(m, m.sd);
    if (!s.over) return;
    const winners = s.winners.map((k) => m.lineup[k]);
    return { round: m.round, winner: winners.length === 1 ? winners[0] : null, winners, reason: "solve" };
  }

  /** Kết quả khi ván kết thúc sớm (bị dừng, người chơi bỏ đi): đối kháng đã có người xong thì người đó vẫn thắng. */
  private cutShort(m: Meta): Result {
    const s = m.sd ? this.stateOf(m, m.sd) : undefined;
    if (m.sd?.mode === "race" && s?.winners.length) return { round: m.round, winner: m.lineup[s.winners[0]], winners: [m.lineup[s.winners[0]]], reason: "solve" };
    return { round: m.round, winner: null, winners: [], reason: "stop" };
  }

  /**
   * Chủ phòng phân xử các nước mới và ghi giờ xong. Cả đội hình bỏ đi thì dừng ván; đối kháng đã có người thắng mà
   * những người chưa xong đều bỏ đi thì kết thúc ván.
   */
  protected hostPlay(m: Meta) {
    const sd = m.sd!;
    const puzzle = this.puzzleOf(sd);
    const judged = judge(
      puzzle,
      sd.mode,
      m.lineup.map((u) => this.movesOf(m, u)),
      this.board(m),
    );
    const board = judged ?? this.board(m);
    const s = replay(puzzle, sd.mode, m.lineup.length, board.log);
    const next = stamp(board, s, Math.max(0, Date.now() - sd.t0)) ?? judged;
    if (next) this.gossip.set(`g:${m.round}`, next);
    if (s.over) return;
    const gone = (u: string) => u !== this.me && this.silentFor(u) >= QUIT_MS;
    const quit = sd.mode === "race" && s.winners.length > 0 && m.lineup.every((u, k) => s.finished.includes(k) || gone(u));
    if (quit || m.lineup.every((u) => u !== this.me && this.silentFor(u) >= ABANDON_MS)) {
      m.status = "ended";
      m.result = this.cutShort(m);
    }
  }

  /** Mọi máy: đối kháng có người về nhất thì báo vào khung chat. */
  protected watch(m: Meta) {
    const sd = m.sd;
    if (!sd || sd.mode !== "race" || m.status !== "playing" || this.hailed === m.round) return;
    const s = this.stateOf(m, sd);
    const first = s.winners[0];
    // Ván xong luôn (vd. chơi một mình) thì câu báo kết quả ván là đủ.
    if (first == null || s.over) return;
    this.hailed = m.round;
    // Id cố định theo ván: tải lại trang (khung chat khôi phục từ snapshot) không báo lặp.
    const text = `🏆 ${this.nameOf(m.lineup[first])} giải xong đầu tiên — thắng ván ${m.round}! Mọi người tiếp tục hoàn tất ván nhé.`;
    this.pushChat({ id: `sd-win:${m.round}`, uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true });
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): SudokuView {
    const opts = normOptions(m.opts);
    const sd = m.sd;
    if (!sd || !m.round || !m.lineup.length) return { opts };
    const puzzle = this.puzzleOf(sd);
    const board = this.board(m);
    const state = replay(puzzle, sd.mode, m.lineup.length, board.log);
    const me = m.lineup.indexOf(this.me);
    const shared = puzzle.givens.map((d, i) => d || (state.owner[i] >= 0 ? puzzle.solution[i] : 0));
    let cells = shared;
    const pending: number[] = [];
    if (me >= 0 && sd.mode === "race") cells = ownBoard(puzzle, this.movesOf(m, this.me)).cells;
    // Đối kháng: người xem cũng chỉ thấy ô nào đã có người giải (tô màu), hết ván mới thấy số.
    else if (sd.mode === "race" && m.status === "playing") cells = puzzle.givens.slice();
    else if (me >= 0) {
      for (const mv of this.movesOf(m, this.me)) {
        if (!Array.isArray(mv)) continue;
        const [i, d] = mv as number[];
        if (!shared[i] && puzzle.solution[i] === d && !pending.includes(i)) pending.push(i);
      }
    }
    return {
      opts,
      match: {
        round: m.round,
        level: sd.level,
        mode: sd.mode,
        puzzle,
        lineup: m.lineup.map(seatOf),
        me,
        state,
        log: board.log,
        cells,
        pending,
        opensAt: this.opensAt(m, sd),
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
    if (this.meta()?.sd?.mode === "race") return `Ván ${r.round} kết thúc — ${name(w[0])} về nhất!`;
    return w.length > 1 ? `${w.map(name).join(", ")} đồng hạng nhất ván ${r.round}` : `${name(w[0])} nhiều điểm nhất — thắng ván ${r.round}!`;
  }

  // ---------- hành động ----------

  /**
   * Điền một số vào ô. Trả về "right" / "wrong" để giao diện phản hồi ngay (máy nào cũng có lời giải), hoặc null nếu
   * không điền được (chưa lộ đề, đang khoá tay, ô đã có số…).
   */
  play(cell: number, digit: number): "right" | "wrong" | null {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || m.status !== "playing" || !g || g.round !== m.round || g.me < 0 || g.state.over) return null;
    const now = Date.now();
    if (now < g.opensAt || now < g.lockedUntil) return null;
    if (!Number.isInteger(digit) || digit < 1 || digit > 9 || g.cells[cell] !== 0 || g.pending.includes(cell)) return null;
    this.gossip.set(`m:${m.round}:${this.me}`, { moves: [...this.movesOf(m, this.me), [cell, digit]] });
    const right = g.puzzle.solution[cell] === digit;
    if (!right && g.mode === "race") this.lock = { round: m.round, until: now + LOCK_MS };
    this.react();
    return right ? "right" : "wrong";
  }

  /** Chủ phòng đổi luật cho ván tới. */
  setOptions(next: Partial<SudokuOptions>) {
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
