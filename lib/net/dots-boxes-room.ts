import { normOptions, PASS, replay, type DotsState, type Move } from "../games/dots-boxes";
import { RoomSession, START_COUNTDOWN_MS, type Meta, type Result, type SeatView } from "./room";

const FORFEIT_MS = 30000;
// Chủ phòng chờ thêm chút sau hạn chót mới cắt lượt: người đang đi thấy nước trước muộn hơn (độ trễ mạng), nên đồng hồ
// trên máy họ về 0 sau máy chủ phòng.
const GRACE_MS = 1000;

export type DotsMatch = {
  round: number;
  state: DotsState;
  lineup: SeatView[];
  myMark: 0 | 1 | 2;
  myTurn: boolean;
  /** Giây tối đa mỗi lượt của ván này (0 là không giới hạn) và hạn chót lượt hiện tại theo giờ máy mình. */
  limit: number;
  deadline: number;
  result?: Result;
};

export type DotsView = {
  size: number;
  turn: number;
  match?: DotsMatch;
  wins: Record<string, number>;
  draws: number;
};

export class DotsBoxesRoom extends RoomSession<DotsView> {
  readonly game = "dots-boxes";
  // Mỗi máy tự bấm giờ từ lúc thấy nước cuối, nên không phụ thuộc đồng hồ các máy có khớp nhau hay không.
  private idle = { key: "", since: 0 };
  private seen = { round: 0, n: 0 };

  private movesOf(m: Meta): Move[] {
    const list = this.gossip.get<{ moves?: unknown }>(`g:${m.round}`)?.moves;
    return Array.isArray(list) ? (list as Move[]) : [];
  }

  private sizeOf(m: Meta) {
    return m.dbSize ?? normOptions(m.opts).size;
  }

  private turnOf(m: Meta) {
    return m.dbTurn ?? normOptions(m.opts).turn;
  }

  private deadlineOf(m: Meta, moves: number) {
    const limit = this.turnOf(m);
    if (!limit) return 0;
    const key = `${m.round}:${moves}`;
    if (this.idle.key !== key) this.idle = { key, since: Date.now() };
    return this.idle.since + (moves ? 0 : START_COUNTDOWN_MS) + limit * 1000;
  }

  private gameOf(m: Meta) {
    const state = replay(this.sizeOf(m), this.movesOf(m));
    let result: Result | undefined;
    if (state.winner) result = { round: m.round, winner: m.lineup[state.winner - 1] ?? null, loser: m.lineup[2 - state.winner], reason: "points" };
    else if (state.draw) result = { round: m.round, winner: null, reason: "draw" };
    else {
      const quitter = m.lineup.find((u) => this.gossip.get(`x:${m.round}:${u}`));
      if (quitter) result = { round: m.round, winner: m.lineup.find((u) => u !== quitter) ?? null, loser: quitter, reason: "resign" };
      else if (m.result?.round === m.round) result = m.result;
    }
    return { state, result };
  }

  protected begin(m: Meta) {
    if (m.players.length !== m.seats || m.players.some((u) => !this.isOnline(u))) return false;
    m.lineup = m.round % 2 === 1 ? [...m.players] : [...m.players].reverse();
    m.dbSize = normOptions(m.opts).size;
    m.dbTurn = normOptions(m.opts).turn;
    return true;
  }

  // Cộng bảng thắng ở đây vì mọi đường kết thúc ván đều đi qua `tidy`.
  protected tidy(m: Meta) {
    if (m.status !== "ended" || !m.result || m.result.round <= (m.scored ?? 0)) return;
    m.scored = m.result.round;
    if (m.result.winner) m.wins = { ...m.wins, [m.result.winner]: (m.wins?.[m.result.winner] ?? 0) + 1 };
    else m.draws = (m.draws ?? 0) + 1;
  }

  protected outcome(m: Meta) {
    return this.gameOf(m).result;
  }

  protected hostPlay(m: Meta) {
    const gone = m.lineup.find((u) => u !== this.me && this.silentFor(u) >= FORFEIT_MS);
    if (gone) {
      m.status = "ended";
      m.result = { round: m.round, winner: m.lineup.find((u) => u !== gone) ?? null, loser: gone, reason: "leave" };
      return;
    }
    const moves = this.movesOf(m);
    const deadline = this.deadlineOf(m, moves.length);
    if (deadline && Date.now() >= deadline + GRACE_MS && !this.gameOf(m).result) this.append(m, [...moves, PASS]);
  }

  protected watch(m: Meta) {
    if (m.round <= 0 || m.lineup.length !== 2) return;
    const n = this.movesOf(m).length;
    if (this.seen.round === m.round && n > this.seen.n) {
      const { state } = this.gameOf(m);
      if (state.passed) this.system(`⏰ ${this.nameOf(m.lineup[state.passed - 1])} hết giờ — mất lượt`);
    }
    this.seen = { round: m.round, n };
  }

  protected onKick(m: Meta, uid: string, reason: "kick" | "cheat" = "kick") {
    if (m.status === "playing" && m.lineup.includes(uid)) {
      m.status = "ended";
      m.result = { round: m.round, winner: m.lineup.find((u) => u !== uid) ?? null, loser: uid, reason };
    }
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): DotsView {
    const opts = normOptions(m.opts);
    const tally = { size: opts.size, turn: opts.turn, wins: m.wins ?? {}, draws: m.draws ?? 0 };
    if (!(m.round > 0 && m.lineup.length === 2)) return tally;
    const g = this.gameOf(m);
    const myMark = (m.lineup.indexOf(this.me) + 1) as 0 | 1 | 2;
    const live = m.status === "playing" && !g.result;
    return {
      ...tally,
      match: {
        round: m.round,
        state: g.state,
        lineup: m.lineup.map(seatOf),
        myMark,
        myTurn: live && myMark > 0 && g.state.turn === myMark,
        limit: this.turnOf(m),
        deadline: live ? this.deadlineOf(m, this.movesOf(m).length) : 0,
        result: g.result,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    if (!r.winner) return `Ván ${r.round} hoà`;
    const why = r.reason === "resign" ? " (đối thủ xin thua)" : r.reason === "leave" ? " (đối thủ rời trận)" : r.reason === "kick" ? " (đối thủ bị mời ra)" : r.reason === "cheat" ? " (đối thủ gian lận)" : "";
    return `${name(r.winner)} thắng ván ${r.round}${why}`;
  }

  private append(m: Meta, next: Move[]) {
    if (replay(this.sizeOf(m), next).count !== next.length) return;
    this.gossip.set(`g:${m.round}`, { moves: next });
    this.react();
  }

  draw(line: number) {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || !g?.myTurn || line < 0 || (g.deadline && Date.now() >= g.deadline)) return;
    this.append(m, [...this.movesOf(m), line]);
  }

  setSize(size: number) {
    this.hostEdit((m) => {
      if (m.status === "playing" || normOptions({ size }).size !== size || normOptions(m.opts).size === size) return false;
      m.opts = { ...m.opts, size };
    });
  }

  setTurn(turn: number) {
    this.hostEdit((m) => {
      if (m.status === "playing" || normOptions({ turn }).turn !== turn || normOptions(m.opts).turn === turn) return false;
      m.opts = { ...m.opts, turn };
    });
  }

  resign() {
    const m = this.meta();
    if (!m || m.status !== "playing" || !m.lineup.includes(this.me)) return;
    this.gossip.set(`x:${m.round}:${this.me}`, { resign: true });
    this.react();
  }
}
