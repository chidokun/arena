import { normOptions, replay, type CaroOptions, type CaroState, type Move } from "../games/caro";
import { RoomSession, START_COUNTDOWN_MS, type Meta, type Result, type SeatView } from "./room";

const FORFEIT_MS = 30000;
// Chủ phòng chờ thêm chút sau hạn chót mới xử thua: người đang đi thấy nước trước muộn hơn (độ trễ mạng), nên đồng hồ
// trên máy họ về 0 sau máy chủ phòng.
const GRACE_MS = 1000;

export type CaroMatch = {
  round: number;
  state: CaroState;
  lineup: SeatView[];
  myMark: 0 | 1 | 2;
  myTurn: boolean;
  /** Luật của ván này (`opts.turn` là giây tối đa mỗi lượt, 0 là không giới hạn) và hạn chót lượt hiện tại theo giờ máy mình. */
  opts: CaroOptions;
  deadline: number;
  result?: Result;
};

export type CaroView = {
  /** Luật cho ván tới — chủ phòng đổi được giữa các ván. */
  opts: CaroOptions;
  match?: CaroMatch;
  wins: Record<string, number>;
  draws: number;
};

export class CaroRoom extends RoomSession<CaroView> {
  readonly game = "caro";
  // Mỗi máy tự bấm giờ từ lúc thấy nước cuối, nên không phụ thuộc đồng hồ các máy có khớp nhau hay không.
  private idle = { key: "", since: 0 };

  private movesOf(m: Meta): Move[] {
    const list = this.gossip.get<{ moves?: unknown }>(`g:${m.round}`)?.moves;
    return Array.isArray(list) ? (list as Move[]) : [];
  }

  private rulesOf(m: Meta) {
    return m.cr ?? normOptions(m.opts);
  }

  private deadlineOf(m: Meta, moves: number) {
    const limit = this.rulesOf(m).turn;
    if (!limit) return 0;
    const key = `${m.round}:${moves}`;
    if (this.idle.key !== key) this.idle = { key, since: Date.now() };
    return this.idle.since + (moves ? 0 : START_COUNTDOWN_MS) + limit * 1000;
  }

  private gameOf(m: Meta) {
    const moves = this.movesOf(m);
    const state = replay(moves, this.rulesOf(m));
    let result: Result | undefined;
    // Nước đi tới sau khi chủ phòng đã xử thua vì hết giờ thì không tính.
    if (m.result?.round === m.round && m.result.reason === "timeout") result = m.result;
    else if (state.winner) result = { round: m.round, winner: m.lineup[state.winner - 1] ?? null, loser: m.lineup[2 - state.winner], reason: "line" };
    else if (state.draw) result = { round: m.round, winner: null, reason: "draw" };
    else {
      const quitter = m.lineup.find((u) => this.gossip.get(`x:${m.round}:${u}`));
      if (quitter) result = { round: m.round, winner: m.lineup.find((u) => u !== quitter) ?? null, loser: quitter, reason: "resign" };
      else if (m.result?.round === m.round) result = m.result;
    }
    return { state, moves, result };
  }

  protected begin(m: Meta) {
    if (m.players.length !== m.seats || m.players.some((u) => !this.isOnline(u))) return false;
    m.lineup = m.round % 2 === 1 ? [...m.players] : [...m.players].reverse();
    m.cr = normOptions(m.opts);
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
    const g = this.gameOf(m);
    const deadline = this.deadlineOf(m, g.moves.length);
    if (!deadline || Date.now() < deadline + GRACE_MS || g.result) return;
    const late = m.lineup[g.state.turn - 1];
    m.status = "ended";
    m.result = { round: m.round, winner: m.lineup.find((u) => u !== late) ?? null, loser: late, reason: "timeout" };
  }

  protected onKick(m: Meta, uid: string, reason: "kick" | "cheat" = "kick") {
    if (m.status === "playing" && m.lineup.includes(uid)) {
      m.status = "ended";
      m.result = { round: m.round, winner: m.lineup.find((u) => u !== uid) ?? null, loser: uid, reason };
    }
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): CaroView {
    const opts = normOptions(m.opts);
    const tally = { wins: m.wins ?? {}, draws: m.draws ?? 0 };
    if (!(m.round > 0 && m.lineup.length === 2)) return { opts, ...tally };
    const g = this.gameOf(m);
    const myMark = (m.lineup.indexOf(this.me) + 1) as 0 | 1 | 2;
    const live = m.status === "playing" && !g.result;
    return {
      opts,
      ...tally,
      match: {
        round: m.round,
        state: g.state,
        lineup: m.lineup.map(seatOf),
        myMark,
        myTurn: live && myMark > 0 && g.state.turn === myMark,
        opts: this.rulesOf(m),
        deadline: live ? this.deadlineOf(m, g.moves.length) : 0,
        result: g.result,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    if (!r.winner) return `Ván ${r.round} hoà`;
    const why = r.reason === "resign" ? " (đối thủ xin thua)" : r.reason === "leave" ? " (đối thủ rời trận)" : r.reason === "kick" ? " (đối thủ bị mời ra)" : r.reason === "cheat" ? " (đối thủ gian lận)" : r.reason === "timeout" ? " (đối thủ hết giờ)" : "";
    return `${name(r.winner)} thắng ván ${r.round}${why}`;
  }

  move(x: number, y: number) {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || !g?.myTurn || (g.deadline && Date.now() >= g.deadline)) return;
    const next: Move[] = [...this.movesOf(m), [x, y]];
    if (replay(next, this.rulesOf(m)).count !== next.length) return;
    this.gossip.set(`g:${m.round}`, { moves: next });
    this.react();
  }

  setOptions(next: Partial<CaroOptions>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const cur = normOptions(m.opts);
      const opts = normOptions({ ...cur, ...next });
      if (opts.size === cur.size && opts.blockTwoEnds === cur.blockTwoEnds && opts.turn === cur.turn) return false;
      m.opts = { ...m.opts, ...opts };
    });
  }

  resign() {
    const m = this.meta();
    if (!m || m.status !== "playing" || !m.lineup.includes(this.me)) return;
    this.gossip.set(`x:${m.round}:${this.me}`, { resign: true });
    this.react();
  }
}
