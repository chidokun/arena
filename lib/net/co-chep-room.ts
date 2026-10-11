/**
 * Phòng cò chẹp: tối đa 5 ghế, người tới lượt nối hành động (cú chọi kèm điểm rơi, lệnh nhảy tiếp) vào nhật ký
 * `g:<ván>`; ai cũng tự dựng lại ván bằng `replay`. Chủ phòng giữ `meta.cc` (seed của ván, danh sách người bỏ cuộc kèm
 * số dòng nhật ký lúc bỏ) và là người duy nhất được nối `skip` (người tới lượt treo máy / mất kết nối) và `end` (chốt ván).
 */
import { replay, standings, type CcAct, type CcState } from "../games/co-chep";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

/** Người chơi mất kết nối quá lâu thì bị loại khỏi ván (nhà vẫn giữ trên sân nhưng không được tính thắng). */
const OUT_MS = 45000;
/** Tới lượt mà mất kết nối quá lâu thì cho qua lượt. */
const AWAY_MS = 15000;
/** Thời gian tối đa cho một lượt (tính từ lúc máy chủ phòng thấy nhật ký đổi lần cuối). */
export const TURN_MS = 60000;

export type CcMatch = {
  round: number;
  state: CcState;
  lineup: SeatView[];
  /** Chỉ số của mình trong đội hình; -1 nếu chỉ xem. */
  me: number;
  myTurn: boolean;
  /** Lúc máy mình thấy nhật ký đổi lần cuối — để đếm giờ lượt. */
  since: number;
  result?: Result;
};

export type CcView = {
  match?: CcMatch;
  /** Số ván thắng của từng người, cộng dồn trong phòng. */
  wins: Record<string, number>;
};

export class CoChepRoom extends RoomSession<CcView> {
  readonly game = "co-chep";
  private seen = { round: 0, n: 0 };
  private idle = { key: "", since: 0 };

  private actsOf(m: Meta): CcAct[] {
    const list = this.gossip.get<{ acts?: unknown }>(`g:${m.round}`)?.acts;
    return Array.isArray(list) ? (list as CcAct[]) : [];
  }

  private gameOf(m: Meta) {
    const acts = this.actsOf(m);
    const cc = m.cc ?? { seed: 1, out: {} };
    const state = replay(m.lineup, acts, cc.out, cc.seed);
    let result: Result | undefined;
    if (state.over) {
      const winners = standings(state);
      result = { round: m.round, winner: winners.length === 1 ? winners[0] : null, winners, reason: state.end === "alone" ? "leave" : "points" };
    } else if (m.result?.round === m.round) result = m.result;
    return { acts, state, result };
  }

  protected begin(m: Meta) {
    const players = m.players.filter((u) => this.isOnline(u));
    if (!players.length || players.length !== m.players.length) return false;
    // Người chọi trước xoay vòng giữa các ván.
    const k = (m.round - 1) % players.length;
    m.lineup = [...players.slice(k), ...players.slice(0, k)];
    m.cc = { seed: crypto.getRandomValues(new Uint32Array(1))[0], out: {} };
    return true;
  }

  /** Chủ phòng cộng kết quả ván vừa xong vào bảng thắng (bằng nhà thì mỗi người cùng thắng được một ván). */
  protected tidy(m: Meta) {
    if (m.status !== "ended" || !m.result || m.result.round <= (m.scored ?? 0)) return;
    m.scored = m.result.round;
    const wins = { ...m.wins };
    for (const u of m.result.winners ?? []) wins[u] = (wins[u] ?? 0) + 1;
    m.wins = wins;
  }

  protected outcome(m: Meta) {
    return this.gameOf(m).result;
  }

  /** Loại người bỏ cuộc / mất kết nối lâu; cho qua lượt người tới lượt mà vắng mặt hoặc để quá giờ. */
  protected hostPlay(m: Meta) {
    if (!m.cc) return;
    const { acts, state } = this.gameOf(m);
    const out = { ...m.cc.out };
    for (const u of m.lineup) {
      if (out[u] !== undefined) continue;
      if (this.gossip.get(`x:${m.round}:${u}`) || (u !== this.me && this.silentFor(u) >= OUT_MS)) out[u] = acts.length;
    }
    if (Object.keys(out).length !== Object.keys(m.cc.out).length) {
      m.cc = { ...m.cc, out };
      return;
    }
    if (state.over || state.turn < 0) return;
    const key = `${m.round}:${acts.length}`;
    if (this.idle.key !== key) this.idle = { key, since: Date.now() };
    const who = m.lineup[state.turn];
    const away = who !== this.me && this.silentFor(who) >= AWAY_MS;
    if (away || Date.now() - this.idle.since >= TURN_MS) this.append(m, { k: "skip", u: who });
  }

  protected onKick(m: Meta, uid: string) {
    if (m.status === "playing" && m.cc && m.lineup.includes(uid) && m.cc.out[uid] === undefined) m.cc = { ...m.cc, out: { ...m.cc.out, [uid]: this.actsOf(m).length } };
  }

  /** Mỗi nhịp, ở mọi máy: rao chiếm nhà / cháy nhà vào khung chat. */
  protected watch(m: Meta) {
    if (m.round <= 0 || !m.cc) return;
    const events = this.gameOf(m).state.events;
    if (this.seen.round === m.round)
      for (const e of events.slice(this.seen.n)) {
        if (e.t !== "throw" || e.spot.kind !== "cell") continue;
        const who = this.nameOf(m.lineup[e.who]);
        if (e.verdict === "claim") this.system(`🏠 ${who} chiếm ô ${e.spot.cell} làm nhà!`);
        if (e.verdict === "burn") this.system(`🔥 ${who} chọi trúng nhà mình — cháy nhà ô ${e.spot.cell}!`);
      }
    this.seen = { round: m.round, n: events.length };
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): CcView {
    const tally = { wins: m.wins ?? {} };
    if (!(m.round > 0 && m.lineup.length && m.cc)) return tally;
    const g = this.gameOf(m);
    const me = m.lineup.indexOf(this.me);
    const key = `${m.round}:${g.acts.length}`;
    if (this.idle.key !== key) this.idle = { key, since: Date.now() };
    return {
      ...tally,
      match: {
        round: m.round,
        state: g.state,
        lineup: m.lineup.map(seatOf),
        me,
        myTurn: m.status === "playing" && !g.result && me >= 0 && g.state.turn === me,
        since: this.idle.since,
        result: g.result,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    const who = r.winners ?? (r.winner ? [r.winner] : []);
    if (!who.length) return `Ván ${r.round} kết thúc — chưa ai có nhà`;
    if (r.reason === "leave") return `${name(who[0])} thắng ván ${r.round} (những người khác đã rời cuộc)`;
    return `${who.map(name).join(", ")} thắng ván ${r.round} — nhiều nhà nhất!`;
  }

  private append(m: Meta, act: CcAct) {
    const next = [...this.actsOf(m), act];
    const cc = m.cc!;
    if (replay(m.lineup, next, cc.out, cc.seed).count !== next.length) return false;
    this.gossip.set(`g:${m.round}`, { acts: next });
    this.react();
    return true;
  }

  private mine(need: CcState["need"][]) {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || m.status !== "playing" || !g?.myTurn || !need.includes(g.state.need)) return;
    return m;
  }

  /** Ghi cú chọi của mình: điểm dừng (x, y) và chỗ chạm đất (lx, ly), làm tròn cm. */
  throwStone(x: number, y: number, lx: number, ly: number) {
    const m = this.mine(["throw", "back"]);
    return !!m && this.append(m, { k: "t", u: this.me, x, y, lx, ly });
  }

  /** Lượt mới mà đá còn nằm trên sân (lượt trước phạm lỗi): nhảy tiếp. */
  hop() {
    const m = this.mine(["hop"]);
    if (m) this.append(m, { k: "h", u: this.me });
  }

  /** Chủ phòng chốt ván: đếm nhà, ai nhiều nhất thắng. */
  finish() {
    const m = this.meta();
    if (!m || m.host !== this.me || m.status !== "playing" || !m.cc) return;
    this.append(m, { k: "end" });
  }

  resign() {
    const m = this.meta();
    if (!m || m.status !== "playing" || !m.lineup.includes(this.me)) return;
    this.gossip.set(`x:${m.round}:${this.me}`, { resign: true });
    this.react();
  }
}
