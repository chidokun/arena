/**
 * Phòng Né Bão: máy chủ phòng mô phỏng ~20Hz từ input LWW `i:<uid>`, ghi snapshot `g:<ván>`,
 * cập nhật `meta.dg` khi đổi runner hoặc dừng. Client nội suy để vẽ.
 */
import {
  afterKill,
  applySnapshot,
  createWorld,
  EDGES,
  edgeOfPick,
  formatMs,
  makeCourse,
  MIN_PLAYERS,
  nextInLine,
  pickOfEdge,
  rankScores,
  snapshotOf,
  stepWorld,
  TICK_MS,
  type DodgeInput,
  type DodgePublic,
  type DodgeSnapshot,
  type Edge,
  type Hazard,
  type Platform,
  type World,
} from "../games/dodge";
import { RoomSession, START_COUNTDOWN_MS, type Member, type Meta, type Result, type SeatView } from "./room";

const RUNNER_GONE_MS = 8000;
const ABANDON_MS = 60000;

export type DodgeMatch = {
  round: number;
  lineup: SeatView[];
  pub: DodgePublic;
  snap?: DodgeSnapshot;
  platforms: Platform[];
  hazards: Hazard[];
  /** Thời gian sống hiện tại của runner (ms), gồm stint đang chạy. */
  liveScores: Record<string, number>;
  myEdge?: Edge;
  iAmRunner: boolean;
  result?: Result;
};

export type DodgeView = {
  match?: DodgeMatch;
};

function emptyInput(t = Date.now()): DodgeInput {
  return { left: false, right: false, jump: false, fireSeq: 0, t };
}

function readInput(raw: unknown): DodgeInput | undefined {
  if (!raw || typeof raw !== "object") return;
  const x = raw as Partial<DodgeInput>;
  return {
    left: !!x.left,
    right: !!x.right,
    jump: !!x.jump,
    fireSeq: Number(x.fireSeq) || 0,
    edge: x.edge && EDGES.includes(x.edge as Edge) ? (x.edge as Edge) : undefined,
    aimX: typeof x.aimX === "number" ? x.aimX : undefined,
    aimY: typeof x.aimY === "number" ? x.aimY : undefined,
    t: Number(x.t) || Date.now(),
  };
}

export class DodgeRoom extends RoomSession<DodgeView> {
  readonly game = "dodge";
  private world: World | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private localInput = emptyInput();
  private lastPush = 0;
  private announcedHit = -1;

  private ensureSim(m: Meta) {
    const dg = m.dg;
    if (!dg || !m.round) return;
    if (!this.world || this.world.runnerUid !== dg.runner) {
      this.world = createWorld(dg.seed, dg.runner);
      const snap = this.gossip.get<DodgeSnapshot>(`g:${m.round}`);
      if (snap && typeof snap.t === "number") this.world = applySnapshot(this.world, snap);
    }
  }

  private startTicker() {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.simTick(), TICK_MS);
  }

  private stopTicker() {
    if (!this.tickTimer) return;
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  protected stopped() {
    this.stopTicker();
  }

  private simTick() {
    const m = this.meta();
    if (!m || m.status !== "playing" || m.host !== this.me || !m.dg) {
      this.stopTicker();
      return;
    }
    this.ensureSim(m);
    if (!this.world) return;
    // Mở ván: đứng yên tới hết nhịp đếm ngược 3‑2‑1 (stint đầu bắt đầu ở tương lai).
    if (Date.now() < m.dg.stintStarted) return;

    const inputs: Record<string, DodgeInput | undefined> = {};
    for (const uid of m.lineup) {
      if (uid === this.me) inputs[uid] = this.localInput;
      else inputs[uid] = readInput(this.gossip.get(`i:${uid}`));
    }

    const { world, kill } = stepWorld(this.world, inputs, m.dg.edges, TICK_MS);
    this.world = world;

    if (kill) {
      const now = Date.now();
      let nextUid: string | undefined;
      if (kill.kind === "bullet" && m.lineup.includes(kill.by) && kill.by !== m.dg.runner) nextUid = kill.by;
      else nextUid = nextInLine(m.lineup, m.dg.runner);
      if (nextUid && nextUid !== m.dg.runner) {
        const { pub, world: next } = afterKill(m.dg, world, nextUid, now, kill.kind);
        this.world = next;
        this.gossip.set(`g:${m.round}`, snapshotOf(next));
        this.hostEdit((meta) => {
          if (meta.status !== "playing" || !meta.dg) return false;
          meta.dg = pub;
        });
        return;
      }
    }

    this.gossip.set(`g:${m.round}`, snapshotOf(world));
  }

  /** Finalize current runner stint into scores. */
  private bankStint(dg: DodgePublic, now = Date.now()): DodgePublic {
    const add = Math.max(0, now - dg.stintStarted);
    return {
      ...dg,
      scores: { ...dg.scores, [dg.runner]: (dg.scores[dg.runner] ?? 0) + add },
      stintStarted: now,
      lastStintMs: add,
    };
  }

  private endResult(m: Meta, reason: Result["reason"] = "stop"): Result {
    const dg = m.dg ? this.bankStint(m.dg) : undefined;
    if (dg) m.dg = dg;
    const scores = dg?.scores ?? {};
    const order = rankScores(scores, m.lineup);
    const top = order[0];
    const best = top ? (scores[top] ?? 0) : 0;
    const winners = order.filter((u) => (scores[u] ?? 0) === best && best > 0);
    return {
      round: m.round,
      winner: winners.length === 1 ? winners[0] : null,
      winners,
      reason,
    };
  }

  protected begin(m: Meta) {
    const lineup = m.players.filter((u) => this.isOnline(u));
    if (lineup.length < MIN_PLAYERS) return false;
    m.lineup = lineup;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const runner = lineup[0];
    const edges: Record<string, Edge> = {};
    for (const uid of lineup) {
      if (uid === runner) continue;
      const mem = this.gossip.get<{ pick?: number[] }>(`p:${uid}`);
      edges[uid] = edgeOfPick(mem?.pick) ?? EDGES[lineup.indexOf(uid) % EDGES.length];
    }
    // Người chạy xuất phát sau nhịp đếm ngược 3‑2‑1 — tới lúc đó chưa tính giờ sống.
    const go = Date.now() + START_COUNTDOWN_MS;
    m.dg = {
      runner,
      edges,
      scores: Object.fromEntries(lineup.map((u) => [u, 0])),
      stintStarted: go,
      seed,
    };
    this.world = createWorld(seed, runner);
    this.gossip.set(`g:${m.round}`, snapshotOf(this.world));
    this.announcedHit = -1;
    this.startTicker();
    return true;
  }

  protected outcome(m: Meta): Result | undefined {
    void m;
    // Session ends only via stop() / hostPlay abandon — not from snapshot.
    return;
  }

  protected hostPlay(m: Meta) {
    if (!m.dg) return;
    this.startTicker();
    const online = m.lineup.filter((u) => this.isOnline(u));
    if (online.length < MIN_PLAYERS || m.lineup.every((u) => u !== this.me && this.silentFor(u) >= ABANDON_MS)) {
      m.status = "ended";
      m.result = this.endResult(m, "leave");
      this.stopTicker();
      return;
    }
    const runner = m.dg.runner;
    if (runner !== this.me && this.silentFor(runner) >= RUNNER_GONE_MS) {
      const next = online.find((u) => u !== runner);
      if (!next) {
        m.status = "ended";
        m.result = this.endResult(m, "leave");
        this.stopTicker();
        return;
      }
      const now = Date.now();
      const stint = Math.max(0, now - m.dg.stintStarted);
      const scores = { ...m.dg.scores, [runner]: (m.dg.scores[runner] ?? 0) + stint };
      const edges = { ...m.dg.edges, [runner]: m.dg.edges[runner] ?? "top" };
      delete edges[next];
      m.dg = {
        ...m.dg,
        runner: next,
        edges,
        scores,
        stintStarted: now,
        lastStintMs: stint,
      };
      delete m.dg.lastHitBy;
      this.world = createWorld(m.dg.seed, next);
      this.gossip.set(`g:${m.round}`, snapshotOf(this.world));
    }
  }

  protected applyIntent(m: Meta, p: Member) {
    const i = m.players.indexOf(p.uid);
    if (p.want === "play" && i < 0 && m.players.length < m.seats) m.players.push(p.uid);
    if (p.want === "watch" && i >= 0) m.players.splice(i, 1);
  }

  protected tidy(m: Meta) {
    if (!m.dg) return;
    const edges = { ...m.dg.edges };
    for (const uid of Object.keys(edges)) {
      if (!m.players.includes(uid) && !m.lineup.includes(uid)) delete edges[uid];
    }
    m.dg = { ...m.dg, edges };
  }

  protected onKick(m: Meta, uid: string) {
    if (m.status === "playing" && m.lineup.includes(uid)) {
      m.lineup = m.lineup.filter((u) => u !== uid);
      if (m.lineup.length < MIN_PLAYERS) {
        m.status = "ended";
        m.result = this.endResult(m, "kick");
        this.stopTicker();
      } else if (m.dg?.runner === uid) {
        const next = m.lineup[0];
        const now = Date.now();
        const stint = Math.max(0, now - m.dg.stintStarted);
        const scores = { ...m.dg.scores, [uid]: (m.dg.scores[uid] ?? 0) + stint };
        const edges = { ...m.dg.edges };
        delete edges[next];
        m.dg = { ...m.dg, runner: next, edges, scores, stintStarted: now, lastStintMs: stint };
        this.world = createWorld(m.dg.seed, next);
        this.gossip.set(`g:${m.round}`, snapshotOf(this.world));
      }
    }
  }

  protected watch(m: Meta) {
    if (m.status === "playing" && m.host === this.me) this.startTicker();
    if (m.status !== "playing" || !m.dg || m.dg.lastStintMs == null || !m.dg.lastKill) return;
    const key = m.round * 1e12 + m.dg.stintStarted;
    if (this.announcedHit === key) return;
    this.announcedHit = key;
    const next = this.nameOf(m.dg.runner);
    const stint = formatMs(m.dg.lastStintMs);
    if (m.dg.lastKill === "bullet" && m.dg.lastHitBy) {
      const killer = this.nameOf(m.dg.lastHitBy);
      this.system(`💥 ${killer} bắn trúng! Sống ${stint} — ${killer} lên làm người chạy.`);
    } else {
      this.system(`☠️ Vướng chướng ngại! Sống ${stint} — ${next} lên làm người chạy.`);
    }
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): DodgeView {
    if (!m.dg || !m.round || !m.lineup.length) return {};
    const snap = this.gossip.get<DodgeSnapshot>(`g:${m.round}`);
    const now = Date.now();
    const liveScores = { ...m.dg.scores };
    if (m.status === "playing") {
      liveScores[m.dg.runner] = (m.dg.scores[m.dg.runner] ?? 0) + Math.max(0, now - m.dg.stintStarted);
    }
    const myEdge = m.dg.edges[this.me] ?? edgeOfPick(this.myIntent(m).pick);
    const course = makeCourse(m.dg.seed);
    return {
      match: {
        round: m.round,
        lineup: m.lineup.map(seatOf),
        pub: m.dg,
        snap: snap && typeof snap.t === "number" ? snap : undefined,
        platforms: course.platforms,
        hazards: course.hazards,
        liveScores,
        myEdge,
        iAmRunner: m.dg.runner === this.me,
        result: m.status === "ended" && m.result?.round === m.round ? m.result : undefined,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    if (r.reason === "stop" || r.reason === "leave" || r.reason === "kick") {
      if (r.winners?.length === 1) return `🏁 Hết trận — ${name(r.winners[0])} sống lâu nhất!`;
      if (r.winners && r.winners.length > 1) return `🏁 Hết trận — đồng hạng: ${r.winners.map(name).join(", ")}`;
      return `🏁 Hết trận Né Bão (ván ${r.round}).`;
    }
    return `Ván ${r.round} kết thúc.`;
  }

  // ---------- player actions ----------

  /** Chọn cạnh nấp (ngoài ván hoặc khi không phải runner). */
  pickEdge(edge: Edge) {
    if (!EDGES.includes(edge)) return;
    this.localInput = { ...this.localInput, edge };
    const m = this.meta();
    if (!m || m.status !== "playing") this.intend("play", pickOfEdge(edge), true);
    this.pushInput(true);
  }

  join() {
    const edge = this.localInput.edge ?? "top";
    this.intend("play", pickOfEdge(edge), true);
  }

  /** Cập nhật phím runner / trạng thái bắn; throttle ghi mạng. */
  setInput(partial: Partial<DodgeInput>, eager = false) {
    this.localInput = { ...this.localInput, ...partial, t: Date.now() };
    this.pushInput(eager);
  }

  fire(aimX: number, aimY: number) {
    const m = this.meta();
    if (!m || m.status !== "playing" || m.dg?.runner === this.me) return;
    this.localInput = {
      ...this.localInput,
      fireSeq: this.localInput.fireSeq + 1,
      aimX,
      aimY,
      edge: this.localInput.edge ?? m.dg?.edges[this.me] ?? "top",
      t: Date.now(),
    };
    this.pushInput(true);
  }

  private pushInput(eager: boolean) {
    const now = Date.now();
    if (!eager && now - this.lastPush < 50) return;
    this.lastPush = now;
    this.gossip.set(`i:${this.me}`, { ...this.localInput, t: now }, eager);
  }

  stop() {
    this.hostEdit((m) => {
      if (m.status !== "playing") return false;
      m.status = "ended";
      m.result = this.endResult(m, "stop");
      this.stopTicker();
    });
  }
}
