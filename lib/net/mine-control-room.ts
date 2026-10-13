/**
 * Phòng dò mìn chiến thuật: 2–4 ghế, người tới lượt nối hành động (mở ô, kỹ năng, bỏ lượt) vào nhật ký `g:<ván>`;
 * ai cũng tự dựng lại ván bằng `replay` nên không cần ai "phán" điểm, và phát lại nhật ký không tính điểm hai lần.
 * Chủ phòng giữ `meta.mc` (seed, bản đồ, số mìn của ván, người bị loại vì bỏ cuộc / mất kết nối kèm số dòng nhật ký lúc
 * bị loại) và là người duy nhất được nối `skip` (người tới lượt vắng mặt / quá giờ).
 */
import { MIN_PLAYERS, minesFor, normOptions, replay, winnersOf, type McAct, type McState } from "../games/mine-control";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

/** Mất kết nối quá lâu thì bị loại khỏi ván (điểm, lãnh thổ vẫn giữ để xếp hạng). */
const OUT_MS = 45000;
/** Tới lượt mà mất kết nối quá lâu thì cho qua lượt. */
const AWAY_MS = 15000;
/** Thời gian tối đa cho một lượt (tính từ lúc máy chủ phòng thấy nhật ký đổi lần cuối). */
export const TURN_MS = 45000;

export type McMatch = {
  round: number;
  state: McState;
  lineup: SeatView[];
  /** Chỉ số của mình trong đội hình; -1 nếu chỉ xem. */
  me: number;
  myTurn: boolean;
  /** Lúc máy mình thấy nhật ký đổi lần cuối — để đếm giờ lượt. */
  since: number;
  result?: Result;
};

export type McView = {
  /** Tuỳ chọn của phòng cho ván tới. */
  opts: ReturnType<typeof normOptions>;
  match?: McMatch;
  /** Số ván thắng của từng người, cộng dồn trong phòng. */
  wins: Record<string, number>;
  draws: number;
};

export class MineControlRoom extends RoomSession<McView> {
  readonly game = "mine-control";
  private seen = { round: 0, n: 0 };
  private idle = { key: "", since: 0 };

  private actsOf(m: Meta): McAct[] {
    const list = this.gossip.get<{ acts?: unknown }>(`g:${m.round}`)?.acts;
    return Array.isArray(list) ? (list as McAct[]) : [];
  }

  private gameOf(m: Meta) {
    const acts = this.actsOf(m);
    const state = replay(m.mc!, m.lineup, acts);
    let result: Result | undefined;
    if (state.over) {
      const winners = winnersOf(state).map((k) => m.lineup[k]);
      result = { round: m.round, winner: winners.length === 1 ? winners[0] : null, winners, reason: state.end === "alone" ? "survive" : winners.length === 1 ? "points" : "draw" };
    } else if (m.result?.round === m.round) result = m.result;
    return { acts, state, result };
  }

  protected begin(m: Meta) {
    const players = m.players.filter((u) => this.isOnline(u));
    if (players.length < MIN_PLAYERS || players.length !== m.players.length) return false;
    // Người đi trước xoay vòng giữa các ván (căn cứ đi theo thứ tự lượt).
    const k = (m.round - 1) % players.length;
    m.lineup = [...players.slice(k), ...players.slice(0, k)];
    const o = normOptions(m.opts);
    m.mc = { seed: crypto.getRandomValues(new Uint32Array(1))[0], map: o.map, mines: minesFor(o, players.length), out: {} };
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
    return m.mc ? this.gameOf(m).result : undefined;
  }

  /** Loại người bỏ cuộc / mất kết nối lâu; cho qua lượt người tới lượt mà vắng mặt hoặc để quá giờ. */
  protected hostPlay(m: Meta) {
    if (!m.mc) return;
    const { acts, state } = this.gameOf(m);
    const out = { ...m.mc.out };
    m.lineup.forEach((u, k) => {
      if (out[u] !== undefined || state.players[k].out) return;
      if (this.gossip.get(`x:${m.round}:${u}`) || (u !== this.me && this.silentFor(u) >= OUT_MS)) out[u] = acts.length;
    });
    if (Object.keys(out).length !== Object.keys(m.mc.out).length) {
      m.mc = { ...m.mc, out };
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
    if (m.status === "playing" && m.mc && m.lineup.includes(uid) && m.mc.out[uid] === undefined) m.mc = { ...m.mc, out: { ...m.mc.out, [uid]: this.actsOf(m).length } };
  }

  /** Mỗi nhịp, ở mọi máy: rao nổ mìn, bị loại vào khung chat. */
  protected watch(m: Meta) {
    if (m.round <= 0 || !m.mc || !m.lineup.length) return;
    const events = this.gameOf(m).state.events;
    if (this.seen.round === m.round)
      for (const e of events.slice(this.seen.n)) {
        const who = this.nameOf(m.lineup[e.who]);
        if (e.t === "boom") this.system(e.dead ? `💀 ${who} giẫm mìn — hết mạng, bị loại!` : e.shield ? `🛡️ ${who} giẫm mìn nhưng Khiên đã đỡ!` : `💥 ${who} giẫm mìn — mất 1 mạng`);
        if (e.t === "quit") this.system(`🏳️ ${who} rời cuộc`);
      }
    this.seen = { round: m.round, n: events.length };
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): McView {
    const tally = { opts: normOptions(m.opts), wins: m.wins ?? {}, draws: m.draws ?? 0 };
    if (!(m.round > 0 && m.lineup.length >= MIN_PLAYERS && m.mc)) return tally;
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
    if (r.reason === "survive" && who.length) return `${name(who[0])} thắng ván ${r.round} — người cuối cùng trụ lại!`;
    if (who.length > 1) return `Ván ${r.round} hoà giữa ${who.map(name).join(", ")}`;
    if (who.length) return `${name(who[0])} thắng ván ${r.round} — nhiều điểm nhất!`;
    return `Ván ${r.round} kết thúc`;
  }

  private append(m: Meta, act: McAct) {
    const next = [...this.actsOf(m), act];
    if (replay(m.mc!, m.lineup, next).count !== next.length) return false;
    this.gossip.set(`g:${m.round}`, { acts: next });
    this.react();
    return true;
  }

  /** Nối một hành động của mình khi đang tới lượt; hành động sai luật thì bỏ qua, không mất lượt. */
  private act(act: McAct) {
    const m = this.meta();
    if (!m || m.status !== "playing" || !m.mc || !this.store.get().game?.match?.myTurn) return false;
    return this.append(m, act);
  }

  open(c: number) {
    return this.act({ k: "open", u: this.me, c });
  }

  radar(c: number) {
    return this.act({ k: "radar", u: this.me, c });
  }

  shield() {
    return this.act({ k: "shield", u: this.me });
  }

  fort(c: number) {
    return this.act({ k: "fort", u: this.me, c });
  }

  grab(c: number) {
    return this.act({ k: "grab", u: this.me, c });
  }

  pass() {
    return this.act({ k: "pass", u: this.me });
  }

  /** Chủ phòng đổi bản đồ / số mìn giữa các ván. */
  setOptions(next: Partial<ReturnType<typeof normOptions>>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const cur = normOptions(m.opts);
      const o = normOptions({ ...cur, ...next });
      if (o.map === cur.map && o.mines === cur.mines) return false;
      m.opts = { ...m.opts, ...o };
    });
  }

  resign() {
    const m = this.meta();
    if (!m || m.status !== "playing" || !m.lineup.includes(this.me)) return;
    this.gossip.set(`x:${m.round}:${this.me}`, { resign: true });
    this.react();
  }
}
