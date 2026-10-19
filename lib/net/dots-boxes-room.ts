import { normOptions, replay, type DotsState, type Move } from "../games/dots-boxes";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

const FORFEIT_MS = 30000;

export type DotsMatch = {
  round: number;
  state: DotsState;
  lineup: SeatView[];
  myMark: 0 | 1 | 2;
  myTurn: boolean;
  result?: Result;
};

export type DotsView = {
  size: number;
  match?: DotsMatch;
  wins: Record<string, number>;
  draws: number;
};

export class DotsBoxesRoom extends RoomSession<DotsView> {
  readonly game = "dots-boxes";

  private movesOf(m: Meta): Move[] {
    const list = this.gossip.get<{ moves?: unknown }>(`g:${m.round}`)?.moves;
    return Array.isArray(list) ? (list as Move[]) : [];
  }

  private sizeOf(m: Meta) {
    return m.dbSize ?? normOptions(m.opts).size;
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
    if (!gone) return;
    m.status = "ended";
    m.result = { round: m.round, winner: m.lineup.find((u) => u !== gone) ?? null, loser: gone, reason: "leave" };
  }

  protected onKick(m: Meta, uid: string, reason: "kick" | "cheat" = "kick") {
    if (m.status === "playing" && m.lineup.includes(uid)) {
      m.status = "ended";
      m.result = { round: m.round, winner: m.lineup.find((u) => u !== uid) ?? null, loser: uid, reason };
    }
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): DotsView {
    const tally = { size: normOptions(m.opts).size, wins: m.wins ?? {}, draws: m.draws ?? 0 };
    if (!(m.round > 0 && m.lineup.length === 2)) return tally;
    const g = this.gameOf(m);
    const myMark = (m.lineup.indexOf(this.me) + 1) as 0 | 1 | 2;
    return {
      ...tally,
      match: {
        round: m.round,
        state: g.state,
        lineup: m.lineup.map(seatOf),
        myMark,
        myTurn: m.status === "playing" && !g.result && myMark > 0 && g.state.turn === myMark,
        result: g.result,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    if (!r.winner) return `Ván ${r.round} hoà`;
    const why = r.reason === "resign" ? " (đối thủ xin thua)" : r.reason === "leave" ? " (đối thủ rời trận)" : r.reason === "kick" ? " (đối thủ bị mời ra)" : r.reason === "cheat" ? " (đối thủ gian lận)" : "";
    return `${name(r.winner)} thắng ván ${r.round}${why}`;
  }

  draw(line: number) {
    const m = this.meta();
    if (!m || !this.store.get().game?.match?.myTurn) return;
    const next = [...this.movesOf(m), line];
    if (replay(this.sizeOf(m), next).count !== next.length) return;
    this.gossip.set(`g:${m.round}`, { moves: next });
    this.react();
  }

  setSize(size: number) {
    this.hostEdit((m) => {
      if (m.status === "playing" || normOptions({ size }).size !== size || normOptions(m.opts).size === size) return false;
      m.opts = { ...m.opts, size };
    });
  }

  resign() {
    const m = this.meta();
    if (!m || m.status !== "playing" || !m.lineup.includes(this.me)) return;
    this.gossip.set(`x:${m.round}:${this.me}`, { resign: true });
    this.react();
  }
}
