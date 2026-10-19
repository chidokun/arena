import {
  answerShot,
  commitOf,
  FLEET,
  fleetGrid,
  honest,
  newSalt,
  normOptions,
  parseFleet,
  replay,
  shotsAt,
  type BsOptions,
  type Fleet,
  type Shot,
  type Sunk,
} from "../games/battleship";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

const FORFEIT_MS = 30000;

const secretKey = (id: string) => `arena:bs:${id}`;
const draftKey = (id: string) => `arena:bs:${id}:draft`;

type Secret = { round: number; fleet: Fleet; salt: string; commit: string };
type FleetRecord = { commit?: unknown; fleet?: unknown; salt?: unknown };

const isCommit = (c: unknown): c is string => typeof c === "string" && /^[0-9a-f]{64}$/.test(c);

export type BsSide = {
  seat: SeatView;
  ready: boolean;
  commit?: string;
  marks: Int8Array;
  sunk: Sunk[];
  fleet?: Fleet;
  honest?: boolean;
};

export type BsMatch = {
  round: number;
  phase: "setup" | "battle";
  sides: [BsSide, BsSide];
  me: -1 | 0 | 1;
  turn: 0 | 1;
  pending: number;
  last?: Shot & { by: 0 | 1; n: number };
  myTurn: boolean;
  placing: boolean;
  lost: boolean;
  result?: Result;
};

export type BsView = {
  opts: BsOptions;
  match?: BsMatch;
  wins: Record<string, number>;
  draws: number;
};

export class BattleshipRoom extends RoomSession<BsView> {
  readonly game = "battleship";
  private mine: Secret | null | undefined;
  private committing = false;
  // Băm SHA-256 là bất đồng bộ nên lúc đang tính thì giữ lời hứa.
  private checks = new Map<string, boolean | Promise<void>>();
  // Để rao "bắn chìm" chỉ với diễn biến mới.
  private seen = { round: -1, n: 0 };

  private logOf(m: Meta): Shot[] {
    const list = this.gossip.get<{ shots?: unknown }>(`g:${m.round}`)?.shots;
    return Array.isArray(list) ? (list as Shot[]) : [];
  }

  private recordOf(m: Meta, uid: string) {
    return this.gossip.get<FleetRecord>(`f:${m.round}:${uid}`);
  }

  private secret(round: number): Secret | null {
    if (this.mine === undefined) {
      this.mine = null;
      try {
        const raw = JSON.parse(sessionStorage.getItem(secretKey(this.id)) ?? "null");
        const fleet = parseFleet(raw?.fleet);
        if (fleet && Number.isInteger(raw.round) && typeof raw.salt === "string" && isCommit(raw.commit))
          this.mine = { round: raw.round, fleet, salt: raw.salt, commit: raw.commit };
      } catch {}
    }
    return this.mine?.round === round ? this.mine : null;
  }

  private gameOf(m: Meta) {
    const ready = m.lineup.length === 2 && m.lineup.every((u) => isCommit(this.recordOf(m, u)?.commit));
    const state = replay(ready ? this.logOf(m) : [], normOptions(m.opts));
    let result: Result | undefined;
    if (state.winner >= 0) result = { round: m.round, winner: m.lineup[state.winner], loser: m.lineup[1 - state.winner], reason: "sunk" };
    else {
      const quitter = m.lineup.find((u) => this.gossip.get(`x:${m.round}:${u}`));
      if (quitter) result = { round: m.round, winner: m.lineup.find((u) => u !== quitter) ?? null, loser: quitter, reason: "resign" };
      else if (m.result?.round === m.round) result = m.result;
    }
    return { ready, state, result };
  }

  protected begin(m: Meta) {
    if (m.players.length !== m.seats || m.players.some((u) => !this.isOnline(u))) return false;
    m.lineup = m.round % 2 === 1 ? [...m.players] : [...m.players].reverse();
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

  protected watch(m: Meta) {
    if (m.round <= 0 || m.lineup.length !== 2) return;
    const g = this.gameOf(m);
    this.announce(m, g.state.shots);
    const side = m.lineup.indexOf(this.me) as -1 | 0 | 1;
    const secret = this.secret(m.round);
    if (side === -1 || !secret) return;
    const key = `f:${m.round}:${this.me}`;
    const rec = this.recordOf(m, this.me);
    if (g.result) {
      if (rec?.fleet === undefined) this.gossip.set(key, { commit: secret.commit, fleet: secret.fleet, salt: secret.salt });
      return;
    }
    if (m.status !== "playing") return;
    // Cam kết chưa kịp lan đi thì máy đã tải lại trang (snapshot ghi trễ): công bố lại.
    if (!isCommit(rec?.commit)) this.gossip.set(key, { commit: secret.commit });
    else if (g.ready && g.state.pending >= 0 && g.state.turn !== side) {
      const n = g.state.shots.length;
      const prior = shotsAt(g.state, side).map((x) => x.c);
      this.gossip.set(`g:${m.round}`, { shots: [...this.logOf(m).slice(0, n - 1), answerShot(secret.fleet, prior, g.state.pending)] });
    }
  }

  private announce(m: Meta, shots: readonly (Shot & { by: 0 | 1 })[]) {
    const answered = shots.filter((x) => x.r !== undefined);
    if (this.seen.round === m.round)
      for (const x of answered.slice(this.seen.n))
        if (x.r === 2) this.system(`💥 ${this.nameOf(m.lineup[x.by])} bắn chìm ${FLEET[x.k!].name} của ${this.nameOf(m.lineup[1 - x.by])}!`);
    this.seen = { round: m.round, n: answered.length };
  }

  private check(m: Meta, uid: string, rec: FleetRecord, answered: Shot[]): boolean | undefined {
    const fleet = parseFleet(rec.fleet);
    if (!fleet || typeof rec.salt !== "string" || !isCommit(rec.commit)) return false;
    const key = JSON.stringify([m.round, uid, rec, answered.length]);
    const known = this.checks.get(key);
    if (typeof known === "boolean") return known;
    if (!known) {
      const salt = rec.salt;
      const commit = rec.commit;
      this.checks.set(
        key,
        commitOf(fleet, salt)
          .then((h) => h === commit && honest(fleet, answered))
          .catch(() => false)
          .then((ok) => {
            this.checks.set(key, ok);
            this.store.invalidate();
            // Kết quả đối chiếu (`honest`) nằm ngoài gossip nên phải tự báo store đổi.
            this.gameStore.invalidate();
          }),
      );
    }
    return undefined;
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): BsView {
    const opts = normOptions(m.opts);
    const tally = { opts, wins: m.wins ?? {}, draws: m.draws ?? 0 };
    if (!(m.round > 0 && m.lineup.length === 2)) return tally;
    const g = this.gameOf(m);
    const me = m.lineup.indexOf(this.me) as -1 | 0 | 1;
    const secret = me >= 0 ? this.secret(m.round) : null;
    const sides = ([0, 1] as const).map((i): BsSide => {
      const uid = m.lineup[i];
      const rec = this.recordOf(m, uid);
      const side: BsSide = {
        seat: seatOf(uid),
        ready: isCommit(rec?.commit),
        commit: isCommit(rec?.commit) ? rec.commit : undefined,
        marks: g.state.marks[i],
        sunk: g.state.sunk[i],
      };
      if (i === me && secret) side.fleet = secret.fleet;
      if (g.result && rec?.fleet !== undefined) {
        side.honest = this.check(m, uid, rec, shotsAt(g.state, i));
        side.fleet ??= parseFleet(rec.fleet) ?? undefined;
      }
      return side;
    }) as [BsSide, BsSide];
    const playing = m.status === "playing" && !g.result;
    let last: BsMatch["last"];
    for (let n = g.state.shots.length - 1; n >= 0 && !last; n--) if (g.state.shots[n].r !== undefined) last = { ...g.state.shots[n], n };
    return {
      ...tally,
      match: {
        round: m.round,
        phase: g.ready ? "battle" : "setup",
        sides,
        me,
        turn: g.state.turn,
        pending: g.state.pending,
        last,
        myTurn: playing && g.ready && me >= 0 && g.state.turn === me && g.state.pending < 0,
        placing: playing && me !== -1 && !sides[me].ready,
        lost: playing && me !== -1 && sides[me].ready && !secret,
        result: g.result,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    if (!r.winner) return `Ván ${r.round} hoà`;
    const why =
      r.reason === "cheat"
        ? " (đối thủ gian lận)"
        : r.reason === "sunk"
          ? " — đánh chìm toàn bộ hạm đội đối phương"
          : r.reason === "resign"
            ? " (đối thủ xin thua)"
            : r.reason === "leave"
              ? " (đối thủ rời trận)"
              : r.reason === "kick"
                ? " (đối thủ bị mời ra)"
                : "";
    return `${name(r.winner)} thắng ván ${r.round}${why}`;
  }

  draft(round: number): Fleet | null {
    try {
      const raw = JSON.parse(sessionStorage.getItem(draftKey(this.id)) ?? "null");
      return raw?.round === round ? parseFleet(raw.fleet) : null;
    } catch {
      return null;
    }
  }

  saveDraft(round: number, fleet: Fleet) {
    try {
      sessionStorage.setItem(draftKey(this.id), JSON.stringify({ round, fleet }));
    } catch {}
  }

  async lockFleet(fleet: Fleet) {
    const m = this.meta();
    if (!m || this.committing || !this.store.get().game?.match?.placing || !fleetGrid(fleet)) return;
    this.committing = true;
    try {
      const salt = newSalt();
      const commit = await commitOf(fleet, salt);
      const cur = this.meta();
      if (!cur || cur.round !== m.round || cur.status !== "playing") return;
      this.mine = { round: m.round, fleet, salt, commit };
      try {
        sessionStorage.setItem(secretKey(this.id), JSON.stringify(this.mine));
      } catch {}
      this.gossip.set(`f:${m.round}:${this.me}`, { commit });
      this.react();
    } finally {
      this.committing = false;
    }
  }

  fire(c: number) {
    const m = this.meta();
    if (!m || !this.store.get().game?.match?.myTurn) return;
    const g = this.gameOf(m);
    const next = [...this.logOf(m).slice(0, g.state.shots.length), { c }];
    if (replay(next, normOptions(m.opts)).pending !== c) return;
    this.gossip.set(`g:${m.round}`, { shots: next });
    this.react();
  }

  resign() {
    const m = this.meta();
    if (!m || m.status !== "playing" || !m.lineup.includes(this.me)) return;
    this.gossip.set(`x:${m.round}:${this.me}`, { resign: true });
    this.react();
  }
}
