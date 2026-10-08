/**
 * Luật Né Bão (dodge): runner tự chạy trái→phải, nhảy né chướng ngại / hố;
 * người còn lại nấp 4 cạnh bắn đạn. Máy chủ phòng mô phỏng; client dựng từ snapshot + seed.
 */

export type Edge = "top" | "right" | "bottom" | "left";
export const EDGES: Edge[] = ["top", "right", "bottom", "left"];
export const EDGE_INDEX: Record<Edge, number> = { top: 0, right: 1, bottom: 2, left: 3 };
export const EDGE_LABEL: Record<Edge, string> = {
  top: "Trên",
  right: "Phải",
  bottom: "Dưới",
  left: "Trái",
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const WORLD_W = 800;
export const WORLD_H = 480;
export const TICK_MS = 50;
export const GRAVITY = 2200;
/** Auto-run speed (px/s) — runner always moves right. */
export const RUN_SPEED = 200;
export const JUMP_VEL = -560;
export const BULLET_SPEED = 280;
export const FIRE_COOLDOWN_MS = 1200;
export const RUNNER_W = 28;
export const RUNNER_H = 36;
export const BULLET_R = 8;
export const EDGE_PAD = 14;
export const GROUND_Y = WORLD_H - 28;
/** Shooter slide speed along an edge (along 0–1 per second). */
export const EDGE_SPEED = 0.55;
/** Screen X where runner is drawn (scroll follows). */
export const VIEW_RUNNER_X = 220;

export type DodgeOptions = Record<string, never>;
export const DEFAULT_OPTIONS: DodgeOptions = {};

export function normOptions(_: unknown): DodgeOptions {
  void _;
  return {};
}

/** Phần công khai trên meta.dg — chủ phòng ghi khi đổi runner / dừng. */
export type DodgePublic = {
  runner: string;
  edges: Record<string, Edge>;
  scores: Record<string, number>;
  stintStarted: number;
  seed: number;
  lastHitBy?: string;
  lastStintMs?: number;
  /** "bullet" | "hazard" — cách stint vừa rồi kết thúc. */
  lastKill?: "bullet" | "hazard";
};

export type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
};

export type Platform = { x: number; y: number; w: number; h: number };
/** Spike / kill zone on the course. */
export type Hazard = { x: number; y: number; w: number; h: number };

export type Course = {
  platforms: Platform[];
  hazards: Hazard[];
};

export type Projectile = {
  id: number;
  owner: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
};

/** Snapshot host đẩy lên `g:<ván>`. */
export type DodgeSnapshot = {
  t: number;
  runner: Body;
  projectiles: Projectile[];
  nextId: number;
  along: Record<string, number>;
};

export type DodgeInput = {
  left: boolean;
  right: boolean;
  jump: boolean;
  fireSeq: number;
  edge?: Edge;
  aimX?: number;
  aimY?: number;
  t: number;
};

export type World = {
  t: number;
  runnerUid: string;
  runner: Body;
  projectiles: Projectile[];
  platforms: Platform[];
  hazards: Hazard[];
  nextId: number;
  lastFireAt: Record<string, number>;
  lastFireSeq: Record<string, number>;
  along: Record<string, number>;
};

export type Kill = { kind: "bullet"; by: string } | { kind: "hazard" };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Đường chạy lặp (wrap): đoạn sàn có hố, platform nhảy, gai trên đường.
 * Cùng seed → cùng course trên mọi máy.
 */
export function makeCourse(seed: number): Course {
  const rand = mulberry32(seed || 1);
  const platforms: Platform[] = [];
  const hazards: Hazard[] = [];

  // Segmented ground with gaps (pits).
  let x = 0;
  while (x < WORLD_W) {
    const solid = 90 + Math.floor(rand() * 110);
    const gap = 50 + Math.floor(rand() * 70);
    const w = Math.min(solid, WORLD_W - x);
    if (w > 24) platforms.push({ x, y: GROUND_Y, w, h: 28 });
    // Occasional spikes on solid ground.
    if (w > 60 && rand() < 0.45) {
      const hw = 28 + Math.floor(rand() * 24);
      const hx = x + 20 + Math.floor(rand() * Math.max(1, w - hw - 40));
      hazards.push({ x: hx, y: GROUND_Y - 18, w: hw, h: 18 });
    }
    x += solid + gap;
  }
  // Ensure start area is safe solid.
  platforms.unshift({ x: 0, y: GROUND_Y, w: 140, h: 28 });

  // Floating pads to jump over pits / spikes.
  const bands = [GROUND_Y - 100, GROUND_Y - 180, GROUND_Y - 260];
  for (const y of bands) {
    const count = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i++) {
      const w = 70 + Math.floor(rand() * 50);
      const px = 80 + Math.floor(rand() * (WORLD_W - w - 100));
      platforms.push({ x: px, y, w, h: 14 });
    }
  }

  return { platforms, hazards };
}

/** @deprecated use makeCourse — kept for call sites that only need platforms. */
export function makeMap(seed: number): Platform[] {
  return makeCourse(seed).platforms;
}

export function spawnRunner(): Body {
  return {
    x: 48,
    y: GROUND_Y - RUNNER_H - 2,
    vx: RUN_SPEED,
    vy: 0,
    onGround: true,
  };
}

export function createWorld(seed: number, runnerUid: string): World {
  const course = makeCourse(seed);
  return {
    t: 0,
    runnerUid,
    runner: spawnRunner(),
    projectiles: [],
    platforms: course.platforms,
    hazards: course.hazards,
    nextId: 1,
    lastFireAt: {},
    lastFireSeq: {},
    along: {},
  };
}

export function snapshotOf(w: World): DodgeSnapshot {
  return {
    t: w.t,
    runner: { ...w.runner },
    projectiles: w.projectiles.map((p) => ({ ...p })),
    nextId: w.nextId,
    along: { ...w.along },
  };
}

export function applySnapshot(w: World, snap: DodgeSnapshot): World {
  return {
    ...w,
    t: snap.t,
    runner: { ...snap.runner },
    projectiles: snap.projectiles.map((p) => ({ ...p })),
    nextId: snap.nextId,
    along: snap.along && typeof snap.along === "object" ? { ...snap.along } : w.along,
  };
}

export function edgeOfPick(pick?: number[]): Edge | undefined {
  const n = pick?.[0];
  return n != null && n >= 0 && n < EDGES.length ? EDGES[n] : undefined;
}

export function pickOfEdge(edge: Edge): number[] {
  return [EDGE_INDEX[edge]];
}

export function edgeAnchor(edge: Edge, along = 0.5): { x: number; y: number } {
  const a = Math.min(1, Math.max(0, along));
  if (edge === "top") return { x: EDGE_PAD + a * (WORLD_W - 2 * EDGE_PAD), y: EDGE_PAD };
  if (edge === "bottom") return { x: EDGE_PAD + a * (WORLD_W - 2 * EDGE_PAD), y: WORLD_H - EDGE_PAD };
  if (edge === "left") return { x: EDGE_PAD, y: EDGE_PAD + a * (WORLD_H - 2 * EDGE_PAD) };
  return { x: WORLD_W - EDGE_PAD, y: EDGE_PAD + a * (WORLD_H - 2 * EDGE_PAD) };
}

function rectOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Platforms at world X and ±WORLD_W for wrap collision. */
function tiled(platforms: Platform[]): Platform[] {
  const out: Platform[] = [];
  for (const p of platforms) {
    out.push(p, { ...p, x: p.x - WORLD_W }, { ...p, x: p.x + WORLD_W });
  }
  return out;
}

function wrapX(x: number) {
  const m = ((x % WORLD_W) + WORLD_W) % WORLD_W;
  return m;
}

/**
 * Auto-run right; jump only. Course wraps. Returns whether runner fell into a pit.
 */
function moveRunner(
  body: Body,
  input: DodgeInput | undefined,
  platforms: Platform[],
  dt: number,
): { body: Body; pit: boolean } {
  const b = { ...body };
  const dtSec = dt / 1000;
  b.vx = RUN_SPEED;
  if (input?.jump && b.onGround) {
    b.vy = JUMP_VEL;
    b.onGround = false;
  }
  b.vy += GRAVITY * dtSec;
  b.x += b.vx * dtSec;
  b.y += b.vy * dtSec;

  if (b.y < 0) {
    b.y = 0;
    b.vy = 0;
  }

  b.onGround = false;
  for (const p of tiled(platforms)) {
    if (!rectOverlap(b.x, b.y, RUNNER_W, RUNNER_H, p.x, p.y, p.w, p.h)) continue;
    const prevBottom = b.y - b.vy * dtSec + RUNNER_H;
    if (b.vy >= 0 && prevBottom <= p.y + 6) {
      b.y = p.y - RUNNER_H;
      b.vy = 0;
      b.onGround = true;
    } else if (b.vy < 0 && b.y < p.y + p.h && b.y + RUNNER_H > p.y + p.h) {
      b.y = p.y + p.h;
      b.vy = 0;
    }
  }

  // Fell through a gap.
  if (b.y + RUNNER_H > WORLD_H + 8) {
    b.x = wrapX(b.x);
    return { body: b, pit: true };
  }

  b.x = wrapX(b.x);
  return { body: b, pit: false };
}

function hitsHazard(runner: Body, hazards: Hazard[]): boolean {
  for (const h of hazards) {
    for (const hx of [h.x, h.x - WORLD_W, h.x + WORLD_W]) {
      if (rectOverlap(runner.x, runner.y, RUNNER_W, RUNNER_H, hx, h.y, h.w, h.h)) return true;
    }
  }
  return false;
}

export function moveAlongEdge(along: number, input: DodgeInput | undefined, dt: number): number {
  let dir = 0;
  if (input?.left) dir -= 1;
  if (input?.right) dir += 1;
  if (!dir) return Math.min(1, Math.max(0, along));
  return Math.min(1, Math.max(0, along + (dir * EDGE_SPEED * dt) / 1000));
}

function tryFire(world: World, uid: string, input: DodgeInput, edges: Record<string, Edge>): World {
  if (uid === world.runnerUid) return world;
  const prev = world.lastFireSeq[uid] ?? 0;
  if (input.fireSeq <= prev) return world;
  if (world.t - (world.lastFireAt[uid] ?? -FIRE_COOLDOWN_MS) < FIRE_COOLDOWN_MS) {
    return { ...world, lastFireSeq: { ...world.lastFireSeq, [uid]: input.fireSeq } };
  }
  const edge = input.edge && EDGES.includes(input.edge) ? input.edge : edges[uid] ?? "top";
  const origin = edgeAnchor(edge, world.along[uid] ?? 0.5);
  // Aim at runner (world space) by default — shooters track the runner.
  const targetX = input.aimX ?? world.runner.x + RUNNER_W / 2;
  const targetY = input.aimY ?? world.runner.y + RUNNER_H / 2;
  let dx = targetX - origin.x;
  let dy = targetY - origin.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  if (edge === "top" && dy < 0.2) dy = 0.2;
  if (edge === "bottom" && dy > -0.2) dy = -0.2;
  if (edge === "left" && dx < 0.2) dx = 0.2;
  if (edge === "right" && dx > -0.2) dx = -0.2;
  const n = Math.hypot(dx, dy) || 1;
  dx /= n;
  dy /= n;
  const bullet: Projectile = {
    id: world.nextId,
    owner: uid,
    x: origin.x,
    y: origin.y,
    vx: dx * BULLET_SPEED,
    vy: dy * BULLET_SPEED,
    r: BULLET_R,
  };
  return {
    ...world,
    nextId: world.nextId + 1,
    projectiles: [...world.projectiles, bullet],
    lastFireAt: { ...world.lastFireAt, [uid]: world.t },
    lastFireSeq: { ...world.lastFireSeq, [uid]: input.fireSeq },
  };
}

function circleHitsRunner(p: Projectile, r: Body) {
  const qx = Math.max(r.x, Math.min(p.x, r.x + RUNNER_W));
  const qy = Math.max(r.y, Math.min(p.y, r.y + RUNNER_H));
  const ddx = p.x - qx;
  const ddy = p.y - qy;
  return ddx * ddx + ddy * ddy <= p.r * p.r;
}

/**
 * Một bước sim. Runner auto-run + nhảy; shooter trượt cạnh / bắn.
 * `kill` nếu trúng đạn, gai, hoặc rơi hố.
 */
export function stepWorld(
  world: World,
  inputs: Record<string, DodgeInput | undefined>,
  edges: Record<string, Edge>,
  dt: number,
): { world: World; kill?: Kill } {
  let w = {
    ...world,
    projectiles: world.projectiles.map((p) => ({ ...p })),
    along: { ...world.along },
  };
  w.t += dt;
  const moved = moveRunner(w.runner, inputs[w.runnerUid], w.platforms, dt);
  w.runner = moved.body;
  if (moved.pit || hitsHazard(w.runner, w.hazards)) {
    return { world: w, kill: { kind: "hazard" } };
  }

  const shooterUids = new Set([...Object.keys(edges), ...Object.keys(inputs)]);
  for (const uid of shooterUids) {
    if (uid === w.runnerUid) continue;
    const inp = inputs[uid];
    if (w.along[uid] == null) w.along[uid] = 0.5;
    w.along[uid] = moveAlongEdge(w.along[uid], inp, dt);
    if (inp) w = tryFire(w, uid, inp, edges);
  }

  const alive: Projectile[] = [];
  let kill: Kill | undefined;
  const dtSec = dt / 1000;
  for (const p of w.projectiles) {
    const next = { ...p, x: p.x + p.vx * dtSec, y: p.y + p.vy * dtSec };
    if (next.x < -40 || next.x > WORLD_W + 40 || next.y < -40 || next.y > WORLD_H + 40) continue;
    if (!kill && circleHitsRunner(next, w.runner)) {
      kill = { kind: "bullet", by: next.owner };
      continue;
    }
    alive.push(next);
  }
  w.projectiles = alive;
  return { world: w, kill };
}

/** Đổi runner sau khi chết (đạn hoặc hazard). */
export function afterKill(
  pub: DodgePublic,
  world: World,
  nextRunner: string,
  now: number,
  kind: "bullet" | "hazard",
  defaultEdge: Edge = "top",
): { pub: DodgePublic; world: World } {
  const stint = Math.max(0, now - pub.stintStarted);
  const prev = pub.runner;
  const scores = { ...pub.scores, [prev]: (pub.scores[prev] ?? 0) + stint };
  const edges = { ...pub.edges };
  edges[prev] = edges[prev] ?? defaultEdge;
  delete edges[nextRunner];
  const nextWorld = createWorld(pub.seed, nextRunner);
  nextWorld.t = world.t;
  nextWorld.platforms = world.platforms;
  nextWorld.hazards = world.hazards;
  nextWorld.along = { ...world.along };
  delete nextWorld.along[nextRunner];
  nextWorld.along[prev] = world.along[prev] ?? 0.5;
  return {
    pub: {
      ...pub,
      runner: nextRunner,
      edges,
      scores,
      stintStarted: now,
      lastHitBy: kind === "bullet" ? nextRunner : undefined,
      lastStintMs: stint,
      lastKill: kind,
    },
    world: nextWorld,
  };
}

/** @deprecated alias — bullet kill. */
export function afterHit(
  pub: DodgePublic,
  world: World,
  hitBy: string,
  now: number,
  defaultEdge: Edge = "top",
) {
  return afterKill(pub, world, hitBy, now, "bullet", defaultEdge);
}

/** Người kế tiếp trong lineup sau runner hiện tại. */
export function nextInLine(lineup: string[], runner: string): string | undefined {
  if (lineup.length < 2) return;
  const i = lineup.indexOf(runner);
  if (i < 0) return lineup[0];
  return lineup[(i + 1) % lineup.length];
}

export function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}.${Math.floor((ms % 1000) / 100)}s`;
}

export function rankScores(scores: Record<string, number>, lineup: string[]) {
  return [...lineup].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || (a < b ? -1 : 1));
}
