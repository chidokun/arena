/**
 * Phòng thả cờ 4: hai ghế, hai người chơi lần lượt nối số cột vào nhật ký `g:<ván>`; ai cũng tự dựng lại ván
 * bằng `replay` nên không cần ai "phán" thắng thua. Người đi trước (quân Đỏ) đổi mỗi ván.
 * Người chơi mất kết nối quá lâu giữa ván bị xử thua.
 */
import { replay, type C4State, type Move } from "../games/connect-four";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

const FORFEIT_MS = 30000;

export type C4Match = {
  round: number;
  state: C4State;
  /** lineup[0] cầm quân Đỏ đi trước, lineup[1] cầm quân Vàng. */
  lineup: SeatView[];
  myMark: 0 | 1 | 2;
  myTurn: boolean;
  result?: Result;
};

export type C4View = {
  /** Ván hiện tại hoặc vừa xong; undefined khi chưa đấu ván nào. */
  match?: C4Match;
  /** Số ván thắng của từng người, cộng dồn trong phòng. */
  wins: Record<string, number>;
  draws: number;
};

export class ConnectFourRoom extends RoomSession<C4View> {
  readonly game = "connect-four";

  private movesOf(m: Meta): Move[] {
    const list = this.gossip.get<{ moves?: unknown }>(`g:${m.round}`)?.moves;
    return Array.isArray(list) ? (list as Move[]) : [];
  }

  private gameOf(m: Meta) {
    const state = replay(this.movesOf(m));
    let result: Result | undefined;
    if (state.winner) result = { round: m.round, winner: m.lineup[state.winner - 1] ?? null, loser: m.lineup[2 - state.winner], reason: "line" };
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
    // Luân phiên người đi trước giữa các ván.
    m.lineup = m.round % 2 === 1 ? [...m.players] : [...m.players].reverse();
    return true;
  }

  /** Chủ phòng cộng kết quả ván vừa xong vào bảng thắng (mọi đường kết thúc ván đều đi qua đây). */
  protected tidy(m: Meta) {
    if (m.status !== "ended" || !m.result || m.result.round <= (m.scored ?? 0)) return;
    m.scored = m.result.round;
    if (m.result.winner) m.wins = { ...m.wins, [m.result.winner]: (m.wins?.[m.result.winner] ?? 0) + 1 };
    else m.draws = (m.draws ?? 0) + 1;
  }

  protected outcome(m: Meta) {
    return this.gameOf(m).result;
  }

  /** Người chơi rớt mạng quá lâu giữa ván thì xử thua. */
  protected hostPlay(m: Meta) {
    const gone = m.lineup.find((u) => u !== this.me && this.silentFor(u) >= FORFEIT_MS);
    if (!gone) return;
    m.status = "ended";
    m.result = { round: m.round, winner: m.lineup.find((u) => u !== gone) ?? null, loser: gone, reason: "leave" };
  }

  protected onKick(m: Meta, uid: string) {
    if (m.status === "playing" && m.lineup.includes(uid)) {
      m.status = "ended";
      m.result = { round: m.round, winner: m.lineup.find((u) => u !== uid) ?? null, loser: uid, reason: "kick" };
    }
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): C4View {
    const tally = { wins: m.wins ?? {}, draws: m.draws ?? 0 };
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
    const why = r.reason === "resign" ? " (đối thủ xin thua)" : r.reason === "leave" ? " (đối thủ rời trận)" : r.reason === "kick" ? " (đối thủ bị mời ra)" : "";
    return `${name(r.winner)} thắng ván ${r.round}${why}`;
  }

  drop(col: number) {
    const m = this.meta();
    if (!m || !this.store.get().game?.match?.myTurn) return;
    const next = [...this.movesOf(m), col];
    if (replay(next).count !== next.length) return;
    this.gossip.set(`g:${m.round}`, { moves: next });
    this.react();
  }

  resign() {
    const m = this.meta();
    if (!m || m.status !== "playing" || !m.lineup.includes(this.me)) return;
    this.gossip.set(`x:${m.round}:${this.me}`, { resign: true });
    this.react();
  }
}
