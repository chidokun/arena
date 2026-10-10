/**
 * Phòng ô ăn quan: hai ghế, hai người chơi lần lượt nối nước đi (±số ô) vào nhật ký `g:<ván>`; ai cũng tự dựng lại ván
 * bằng `replay` nên không cần ai "phán" thắng thua. Người đi trước (giữ dãy ô 1–5) đổi mỗi ván.
 * Người chơi mất kết nối quá lâu giữa ván bị xử thua.
 */
import { normOptions, replay, type Move, type OaqOptions, type OaqState } from "../games/oanquan";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

const FORFEIT_MS = 30000;

export type OaqMatch = {
  round: number;
  /** Nhật ký nước đi — bàn chơi dựng lại bàn trước nước cuối để diễn cảnh rải quân. */
  moves: Move[];
  state: OaqState;
  /** lineup[0] giữ dãy ô 1–5 và đi trước, lineup[1] giữ dãy ô 7–11. */
  lineup: SeatView[];
  mySide: 0 | 1 | 2;
  myTurn: boolean;
  result?: Result;
};

export type OaqView = {
  opts: OaqOptions;
  /** Ván hiện tại hoặc vừa xong; undefined khi chưa đấu ván nào. */
  match?: OaqMatch;
  /** Số ván thắng của từng người, cộng dồn trong phòng. */
  wins: Record<string, number>;
  draws: number;
};

export class OAnQuanRoom extends RoomSession<OaqView> {
  readonly game = "oanquan";

  private movesOf(m: Meta): Move[] {
    const list = this.gossip.get<{ moves?: unknown }>(`g:${m.round}`)?.moves;
    return Array.isArray(list) ? (list as Move[]) : [];
  }

  private gameOf(m: Meta) {
    const moves = this.movesOf(m);
    const state = replay(moves, normOptions(m.opts));
    let result: Result | undefined;
    if (state.over) result = state.winner ? { round: m.round, winner: m.lineup[state.winner - 1] ?? null, loser: m.lineup[2 - state.winner], reason: "points" } : { round: m.round, winner: null, reason: "draw" };
    else {
      const quitter = m.lineup.find((u) => this.gossip.get(`x:${m.round}:${u}`));
      if (quitter) result = { round: m.round, winner: m.lineup.find((u) => u !== quitter) ?? null, loser: quitter, reason: "resign" };
      else if (m.result?.round === m.round) result = m.result;
    }
    return { moves, state, result };
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

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): OaqView {
    const tally = { opts: normOptions(m.opts), wins: m.wins ?? {}, draws: m.draws ?? 0 };
    if (!(m.round > 0 && m.lineup.length === 2)) return tally;
    const g = this.gameOf(m);
    const mySide = (m.lineup.indexOf(this.me) + 1) as 0 | 1 | 2;
    return {
      ...tally,
      match: {
        round: m.round,
        moves: g.moves,
        state: g.state,
        lineup: m.lineup.map(seatOf),
        mySide,
        myTurn: m.status === "playing" && !g.result && mySide > 0 && g.state.turn === mySide,
        result: g.result,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    if (!r.winner) return `Ván ${r.round} hoà`;
    const why = r.reason === "resign" ? " (đối thủ xin thua)" : r.reason === "leave" ? " (đối thủ rời trận)" : r.reason === "kick" ? " (đối thủ bị mời ra)" : "";
    return `${name(r.winner)} thắng ván ${r.round}${why}`;
  }

  /** Bốc ô `at` của mình rải theo chiều `dir` (1: chỉ số tăng, -1: giảm). */
  sow(at: number, dir: 1 | -1) {
    const m = this.meta();
    if (!m || !this.store.get().game?.match?.myTurn) return;
    const next = [...this.movesOf(m), at * dir];
    if (replay(next, normOptions(m.opts)).count !== next.length) return;
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
