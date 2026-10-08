import assert from "node:assert/strict";
import { test } from "node:test";
import {
  afterHit,
  afterKill,
  createWorld,
  EDGE_INDEX,
  edgeAnchor,
  edgeOfPick,
  FIRE_COOLDOWN_MS,
  makeCourse,
  moveAlongEdge,
  nextInLine,
  pickOfEdge,
  rankScores,
  RUN_SPEED,
  spawnRunner,
  stepWorld,
  TICK_MS,
  WORLD_H,
  WORLD_W,
  type DodgeInput,
  type DodgePublic,
} from "./dodge.ts";

const emptyIn = (): DodgeInput => ({
  left: false,
  right: false,
  jump: false,
  fireSeq: 0,
  t: 0,
});

/** Flat ground, no spikes — isolate physics / shooting. */
function safeWorld(seed = 1, runner = "r") {
  const w = createWorld(seed, runner);
  w.hazards = [];
  w.platforms = [{ x: 0, y: WORLD_H - 28, w: WORLD_W, h: 28 }];
  return w;
}

test("makeCourse cùng seed thì giống nhau, có sàn và gai", () => {
  const a = makeCourse(42);
  const b = makeCourse(42);
  assert.deepEqual(a.platforms, b.platforms);
  assert.deepEqual(a.hazards, b.hazards);
  assert.ok(a.platforms.some((p) => p.y >= WORLD_H - 30));
  assert.ok(a.platforms.length >= 3);
});

test("runner tự chạy sang phải và nhảy được", () => {
  let w = safeWorld();
  const x0 = w.runner.x;
  ({ world: w } = stepWorld(w, { r: emptyIn() }, {}, TICK_MS));
  assert.ok(w.runner.x > x0);
  assert.ok(Math.abs(w.runner.vx - RUN_SPEED) < 1);

  const jump: DodgeInput = { ...emptyIn(), jump: true };
  ({ world: w } = stepWorld(w, { r: jump }, {}, TICK_MS));
  assert.equal(w.runner.onGround, false);
  assert.ok(w.runner.vy < 0);
  for (let i = 0; i < 80; i++) ({ world: w } = stepWorld(w, { r: emptyIn() }, {}, TICK_MS));
  assert.equal(w.runner.onGround, true);
});

test("runner wrap khi chạy hết mép phải", () => {
  let w = safeWorld();
  w.runner.x = WORLD_W - 10;
  for (let i = 0; i < 30; i++) ({ world: w } = stepWorld(w, { r: emptyIn() }, {}, TICK_MS));
  assert.ok(w.runner.x < WORLD_W / 2);
});

test("chạm gai thì kill hazard", () => {
  const w = safeWorld();
  w.hazards = [{ x: w.runner.x - 20, y: w.runner.y - 20, w: 100, h: 80 }];
  const { kill } = stepWorld(w, { r: emptyIn() }, {}, TICK_MS);
  assert.equal(kill?.kind, "hazard");
});

test("rơi hố thì kill hazard", () => {
  let w = safeWorld();
  w.platforms = [];
  w.runner = { ...spawnRunner(), onGround: false, vy: 100 };
  let kill;
  for (let i = 0; i < 40; i++) {
    ({ world: w, kill } = stepWorld(w, { r: emptyIn() }, {}, TICK_MS));
    if (kill) break;
  }
  assert.equal(kill?.kind, "hazard");
});

test("bắn từ cạnh tạo đạn bay vào sân", () => {
  let w = safeWorld();
  const fire: DodgeInput = {
    ...emptyIn(),
    fireSeq: 1,
    edge: "left",
    aimX: WORLD_W / 2,
    aimY: WORLD_H / 2,
  };
  ({ world: w } = stepWorld(w, { r: emptyIn(), s: fire }, { s: "left" }, TICK_MS));
  assert.equal(w.projectiles.length, 1);
  assert.equal(w.projectiles[0].owner, "s");
  assert.ok(w.projectiles[0].vx > 0);
});

test("shooter trượt dọc cạnh đổi điểm bắn", () => {
  assert.ok(moveAlongEdge(0.5, { ...emptyIn(), right: true }, 1000) > 0.5);
  assert.ok(moveAlongEdge(0.5, { ...emptyIn(), left: true }, 1000) < 0.5);

  let w = safeWorld();
  w.along.s = 0.2;
  const slide: DodgeInput = { ...emptyIn(), right: true };
  for (let i = 0; i < 20; i++) ({ world: w } = stepWorld(w, { s: slide }, { s: "top" }, TICK_MS));
  assert.ok((w.along.s ?? 0) > 0.2);

  const fire: DodgeInput = {
    ...emptyIn(),
    fireSeq: 1,
    edge: "top",
    aimX: WORLD_W / 2,
    aimY: WORLD_H / 2,
  };
  w.along.s = 0.9;
  w.projectiles = [];
  ({ world: w } = stepWorld(w, { s: fire }, { s: "top" }, TICK_MS));
  const origin = edgeAnchor("top", 0.9);
  const mid = edgeAnchor("top", 0.5);
  assert.equal(w.projectiles.length, 1);
  assert.ok(Math.abs(w.projectiles[0].x - origin.x) < Math.abs(w.projectiles[0].x - mid.x));
});

test("cooldown chặn bắn liên tục", () => {
  let w = safeWorld();
  const mk = (seq: number): DodgeInput => ({
    ...emptyIn(),
    fireSeq: seq,
    edge: "top",
    aimX: WORLD_W / 2,
    aimY: WORLD_H / 2,
  });
  ({ world: w } = stepWorld(w, { s: mk(1) }, { s: "top" }, TICK_MS));
  assert.equal(w.nextId, 2);
  ({ world: w } = stepWorld(w, { s: mk(2) }, { s: "top" }, TICK_MS));
  assert.equal(w.nextId, 2);
  for (let i = 0; i < FIRE_COOLDOWN_MS / TICK_MS + 2; i++) {
    ({ world: w } = stepWorld(w, { s: emptyIn() }, { s: "top" }, TICK_MS));
  }
  ({ world: w } = stepWorld(w, { s: mk(3) }, { s: "top" }, TICK_MS));
  assert.equal(w.nextId, 3);
});

test("đạn trúng runner trả kill bullet", () => {
  const w = safeWorld();
  const r = spawnRunner();
  w.runner = r;
  w.projectiles = [
    {
      id: 1,
      owner: "s",
      x: r.x + 14,
      y: r.y + 18,
      vx: 0,
      vy: 0,
      r: 8,
    },
  ];
  const { kill, world: next } = stepWorld(w, {}, {}, TICK_MS);
  assert.deepEqual(kill, { kind: "bullet", by: "s" });
  assert.equal(next.projectiles.length, 0);
});

test("afterKill / afterHit cộng điểm và đổi runner", () => {
  const pub: DodgePublic = {
    runner: "r",
    edges: { s: "left" },
    scores: {},
    stintStarted: 1000,
    seed: 7,
  };
  const w = createWorld(7, "r");
  w.t = 500;
  const { pub: next, world: nw } = afterHit(pub, w, "s", 4500);
  assert.equal(next.runner, "s");
  assert.equal(next.scores.r, 3500);
  assert.equal(next.lastKill, "bullet");
  assert.equal(nw.runnerUid, "s");

  const haz = afterKill(pub, w, "s", 4500, "hazard");
  assert.equal(haz.pub.lastKill, "hazard");
  assert.equal(haz.pub.lastHitBy, undefined);
});

test("nextInLine xoay vòng", () => {
  assert.equal(nextInLine(["a", "b", "c"], "a"), "b");
  assert.equal(nextInLine(["a", "b", "c"], "c"), "a");
});

test("edge pick encode/decode", () => {
  assert.equal(edgeOfPick([EDGE_INDEX.bottom]), "bottom");
  assert.deepEqual(pickOfEdge("right"), [1]);
  assert.equal(edgeOfPick([]), undefined);
});

test("rankScores sắp theo thời gian sống", () => {
  const order = rankScores({ a: 100, b: 500, c: 500 }, ["a", "b", "c"]);
  assert.equal(order[0], "b");
  assert.ok(order.indexOf("b") < order.indexOf("a"));
});
