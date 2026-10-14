/**
 * Phòng cờ vua: hai ghế, người cầm quân Trắng đi trước (đổi bên mỗi ván). Hai người chơi lần lượt nối nước đi vào
 * nhật ký `g:<ván>`; ai cũng tự dựng lại ván bằng `replay` nên không cần ai "phán" thắng thua. Xin hoà ghi vào
 * `v:<ván>:<uid>` kèm số nước lúc xin — cả hai cùng xin ở một nước thì hoà; đi tiếp một nước là lời xin hết hiệu lực.
 * Người chơi mất kết nối quá lâu giữa ván bị xử thua.
 */
import { replay, type ChessState, type Move, type Side } from "../games/chess";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

const FORFEIT_MS = 30000;

export type ChessMatch = {
  round: number;
  state: ChessState;
  /** lineup[0] cầm quân Trắng, lineup[1] cầm quân Đen. */
  lineup: SeatView[];
  mySide: 0 | Side;
  myTurn: boolean;
  /** Bên nào đang xin hoà ở nước hiện tại. */
  offers: Side[];
  result?: Result;
};

export type ChessView = {
  /** Ván hiện tại hoặc vừa xong; undefined khi chưa đấu ván nào. */
  match?: ChessMatch;
  /** Số ván thắng của từng người, cộng dồn trong phòng. */
  wins: Record<string, number>;
  draws: number;
};

export class ChessRoom extends RoomSession<ChessView> {
  readonly game = "chess";
  /** Dựng lại ván tốn công (sinh nước hợp lệ từng nước) nên nhớ kết quả theo nhật ký. */
  private cache: { key: string; state: ChessState } | null = null;

  private movesOf(m: Meta): Move[] {
    const list = this.gossip.get<{ moves?: unknown }>(`g:${m.round}`)?.moves;
    return Array.isArray(list) ? (list as Move[]) : [];
  }

  private stateOf(m: Meta) {
    const moves = this.movesOf(m);
    const key = `${m.round}:${JSON.stringify(moves)}`;
    if (this.cache?.key !== key) this.cache = { key, state: replay(moves) };
    return this.cache.state;
  }

  private gameOf(m: Meta) {
    const state = this.stateOf(m);
    const offers = m.lineup.flatMap((u, k) => (this.gossip.get<{ draw?: number }>(`v:${m.round}:${u}`)?.draw === state.count ? [(k + 1) as Side] : []));
    let result: Result | undefined;
    if (state.winner) result = { round: m.round, winner: m.lineup[state.winner - 1] ?? null, loser: m.lineup[2 - state.winner], reason: "mate" };
    else if (state.draw) result = { round: m.round, winner: null, reason: "draw" };
    else {
      const quitter = m.lineup.find((u) => this.gossip.get(`x:${m.round}:${u}`));
      if (quitter) result = { round: m.round, winner: m.lineup.find((u) => u !== quitter) ?? null, loser: quitter, reason: "resign" };
      else if (offers.length === 2) result = { round: m.round, winner: null, reason: "agree" };
      else if (m.result?.round === m.round) result = m.result;
    }
    return { state, offers, result };
  }

  protected begin(m: Meta) {
    if (m.players.length !== m.seats || m.players.some((u) => !this.isOnline(u))) return false;
    // Đổi bên cầm quân Trắng (đi trước) giữa các ván.
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

  protected onKick(m: Meta, uid: string, reason: "kick" | "cheat" = "kick") {
    if (m.status === "playing" && m.lineup.includes(uid)) {
      m.status = "ended";
      m.result = { round: m.round, winner: m.lineup.find((u) => u !== uid) ?? null, loser: uid, reason };
    }
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): ChessView {
    const tally = { wins: m.wins ?? {}, draws: m.draws ?? 0 };
    if (!(m.round > 0 && m.lineup.length === 2)) return tally;
    const g = this.gameOf(m);
    const mySide = (m.lineup.indexOf(this.me) + 1) as 0 | Side;
    return {
      ...tally,
      match: {
        round: m.round,
        state: g.state,
        lineup: m.lineup.map(seatOf),
        mySide,
        myTurn: m.status === "playing" && !g.result && mySide > 0 && g.state.turn === mySide,
        offers: g.result ? [] : g.offers,
        result: g.result,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    const m = this.meta();
    const end = m && m.round === r.round ? this.stateOf(m).end : null;
    if (!r.winner) {
      const why =
        r.reason === "agree"
          ? "hai bên đồng ý hoà"
          : end === "stalemate"
            ? "hết nước đi"
            : end === "repeat"
              ? "lặp lại thế cờ"
              : end === "fifty"
                ? "50 nước không ăn quân, không đi Tốt"
                : end === "material"
                  ? "không đủ quân chiếu hết"
                  : "";
      return `Ván ${r.round} hoà${why ? ` — ${why}` : ""}`;
    }
    const why =
      r.reason === "cheat"
        ? " (đối thủ gian lận)"
        : r.reason === "resign"
          ? " (đối thủ xin thua)"
          : r.reason === "leave"
            ? " (đối thủ rời trận)"
            : r.reason === "kick"
              ? " (đối thủ bị mời ra)"
              : end === "mate"
                ? " — chiếu hết!"
                : "";
    return `${name(r.winner)} thắng ván ${r.round}${why}`;
  }

  move(from: number, to: number, promo?: number) {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || !g?.myTurn || g.round !== m.round) return;
    const move = g.state.legal.find(([a, b, p]) => a === from && b === to && (p ?? 0) === (promo ?? 0));
    if (!move) return;
    this.gossip.set(`g:${m.round}`, { moves: [...this.movesOf(m), move] });
    this.react();
  }

  /** Xin hoà (hoặc đồng ý lời xin hoà của đối thủ) ở nước hiện tại. */
  offerDraw() {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || m.status !== "playing" || !g || g.round !== m.round || !g.mySide || g.result) return;
    this.gossip.set(`v:${m.round}:${this.me}`, { draw: g.state.count });
    this.react();
  }

  resign() {
    const m = this.meta();
    if (!m || m.status !== "playing" || !m.lineup.includes(this.me)) return;
    this.gossip.set(`x:${m.round}:${this.me}`, { resign: true });
    this.react();
  }
}
