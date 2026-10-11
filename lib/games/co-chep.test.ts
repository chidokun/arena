import assert from "node:assert/strict";
import { test } from "node:test";
import { CELLS, classify, hopPath, housesOf, landing, launch, relaunch, replay, riskOf, roll, standings, targetOf, TROI, yawOf, type CcAct, type CcState } from "./co-chep.ts";

const mid = (c: number) => ({ x: (CELLS[c].x0 + CELLS[c].x1) / 2, y: (CELLS[c].y0 + CELLS[c].y1) / 2 });
const at = (u: string, x: number, y: number): CcAct => ({ k: "t", u, x, y, lx: x, ly: y });
const into = (u: string, c: number) => at(u, mid(c).x, mid(c).y);
const sky = (u: string) => at(u, 100, 540);
const miss = (u: string) => at(u, 100, 1000);

/** Tìm seed để mọi lượt nhảy trong nhật ký đều không phạm lỗi (dễ viết test luồng chính). */
function cleanSeed(lineup: string[], acts: CcAct[]) {
  for (let seed = 1; seed < 5000; seed++) {
    const s = replay(lineup, acts, {}, seed);
    if (s.count === acts.length && s.events.every((e) => e.t !== "hop" || e.fail < 0)) return seed;
  }
  throw new Error("không tìm được seed");
}

test("phân loại điểm rơi: gọn trong ô, chạm vạch, Trời, ngoài sân", () => {
  for (let c = 1; c <= 8; c++) assert.deepEqual(classify(mid(c).x, mid(c).y), { kind: "cell", cell: c });
  assert.deepEqual(classify(100, 80), { kind: "line" });
  assert.deepEqual(classify(100, 280), { kind: "line" }); // vạch giữa ô 4 và 5
  assert.deepEqual(classify(100, 71), { kind: "line" }); // mép đá chạm vạch trên ô 1
  assert.deepEqual(classify(100, 70), { kind: "cell", cell: 1 });
  assert.deepEqual(classify(100, 540), { kind: "troi" });
  assert.deepEqual(classify(100, 484), { kind: "line" }); // sát mép trên ô 7–8
  assert.deepEqual(classify(25, 40), { kind: "out" }); // cạnh ô 1, ngoài sân
  assert.deepEqual(classify(100, -40), { kind: "out" }); // ô Đất
  assert.deepEqual(classify(100, 700), { kind: "out" });
});

test("nhảy ô thường: bỏ qua ô có đá, quay đầu ở 7–8, nhặt đá ở hàng ngay trước", () => {
  const s = replay(["a"], [], {}, 1);
  s.players[0].stone = 4;
  const { path, gaps } = hopPath(s, 0, "cell");
  assert.deepEqual(gaps, []);
  assert.deepEqual(
    path.map((p) => [p.row, p.cells, !!p.pick]),
    [
      [1, [1], false],
      [2, [2], false],
      [3, [3], false],
      [4, [5], false], // ô 4 có đá: cò một chân vào ô 5
      [5, [6], false],
      [6, [7, 8], false],
      [5, [6], true], // về tới ô 6 thì nhặt đá ở ô 4
      [4, [4, 5], false],
      [3, [3], false],
      [2, [2], false],
      [1, [1], false],
      [0, [], false],
    ],
  );
  assert.equal(riskOf(gaps, false), 30);
});

test("nhảy vượt nhiều hàng bị chặn thì dễ ngã; nhà mình thì nhảy vào được", () => {
  const s = replay(["a", "b"], [], {}, 1);
  s.owners[2] = 2;
  s.owners[3] = 2;
  s.owners[6] = 1;
  s.players[0].stone = 1;
  const { path, gaps } = hopPath(s, 0, "cell");
  // Ô 1 có đá, ô 2–3 là nhà người khác: từ Đất phải nhảy vượt 3 hàng lên 4–5.
  assert.deepEqual(gaps[0], { at: 0, len: 3 });
  assert.ok(path.some((p) => p.cells.includes(6)));
  assert.ok(riskOf(gaps, false) > 600);
});

test("lên Trời: nhảy tới 7–8 rồi chẹp quanh đá bốn hướng", () => {
  const s = replay(["a"], [], {}, 1);
  s.players[0].stone = TROI;
  const { path } = hopPath(s, 0, "troi");
  assert.deepEqual(
    path.slice(-4).map((p) => p.dir),
    ["up", "right", "down", "left"],
  );
  assert.equal(path[path.length - 5].row, 6);
});

test("trúng ô mục tiêu thì nhảy và đi tiếp; trượt thì mất lượt nhưng giữ tiến độ", () => {
  const acts = [into("a", 1), into("a", 2), miss("a"), into("b", 1)];
  const seed = cleanSeed(["a", "b"], acts);
  const s = replay(["a", "b"], acts, {}, seed);
  assert.equal(s.players[0].progress, 2);
  assert.equal(s.players[1].progress, 1);
  assert.equal(s.turn, 1);
  assert.equal(s.target, 2);
  assert.equal(s.need, "throw");
});

test("chọi sai ô, chạm vạch, ra ngoài đều mất lượt", () => {
  for (const a of [into("a", 2), at("a", 100, 80), miss("a")]) {
    const s = replay(["a", "b"], [a], {}, 1);
    assert.equal(s.turn, 1);
    assert.equal(s.players[0].progress, 0);
    assert.equal(s.players[0].stone, 0);
  }
});

test("nhảy phạm lỗi: đá nằm lại, lượt sau nhảy tiếp không cần chọi lại", () => {
  let seed = 1;
  // Tìm seed để lượt nhảy đầu tiên bị ngã.
  while (replay(["a", "b"], [into("a", 1)], {}, seed).events.find((e) => e.t === "hop")?.fail === -1) seed++;
  const s = replay(["a", "b"], [into("a", 1)], {}, seed);
  assert.equal(s.players[0].stone, 1);
  assert.equal(s.players[0].faults, 1);
  assert.equal(s.turn, 1);
  // b không chọi được vào ô 1 đang có đá của a.
  const t = replay(["a", "b"], [into("a", 1), into("b", 1)], {}, seed);
  assert.equal(t.events.find((e) => e.t === "throw" && e.who === 1 && e.verdict === "stone")?.t, "throw");
  assert.equal(t.turn, 0);
  assert.equal(t.need, "hop");
});

/** Đi trọn hành trình 1 → 8 rồi lên Trời. */
const journey = (u: string) => [1, 2, 3, 4, 5, 6, 7, 8].map((c) => into(u, c));

test("xong ô 8 thì lên Trời, chọi qua lưng trúng ô trống là chiếm nhà và đi tiếp hành trình mới", () => {
  const acts = [...journey("a"), sky("a"), into("a", 5)];
  const seed = cleanSeed(["a"], acts);
  const s = replay(["a"], acts, {}, seed);
  assert.equal(s.owners[5], 1);
  assert.equal(housesOf(s, 0), 1);
  assert.equal(s.players[0].progress, 0);
  assert.equal(s.turn, 0);
  assert.equal(s.target, 1);
  // Hành trình mới bỏ qua ô đã thành nhà.
  assert.equal(targetOf(s.owners, { ...s.players[0], progress: 4 }), 6);
});

test("chọi qua lưng vào nhà mình thì cháy nhà; vào nhà người khác hay ra ngoài thì mất lượt", () => {
  const base = [...journey("a"), sky("a"), into("a", 5), ...[1, 2, 3, 4, 6, 7, 8].map((c) => into("a", c)), sky("a")];
  const seed = cleanSeed(["a"], base);
  const burn = replay(["a"], [...base, into("a", 5)], {}, seed);
  assert.equal(burn.owners[5], 0);
  assert.equal(burn.players[0].burnt, 1);
  assert.equal(burn.need, "throw");
  assert.equal(burn.target, TROI);
  const out = replay(["a"], [...base, miss("a")], {}, seed);
  assert.equal(out.owners[5], 1);
  assert.equal(out.target, TROI);
});

test("chọi từ Đất vào nhà mình cũng cháy nhà", () => {
  const acts = [...journey("a"), sky("a"), into("a", 2)];
  const seed = cleanSeed(["a"], acts);
  const s = replay(["a"], [...acts, into("a", 2)], {}, seed);
  assert.equal(s.owners[2], 0);
  assert.equal(s.players[0].burnt, 1);
});

test("người khác bỏ cuộc thì bỏ qua lượt; còn một người là hết ván", () => {
  const s = replay(["a", "b", "c"], [miss("a")], { b: 1 }, 1);
  assert.equal(s.turn, 2);
  assert.equal(s.players[1].out, true);
  const t = replay(["a", "b"], [miss("a")], { b: 1 }, 1);
  assert.equal(t.over, true);
  assert.equal(t.end, "alone");
  assert.deepEqual(standings(t), ["a"]);
});

test("chủ phòng chốt ván: ai nhiều nhà nhất thắng, bằng nhau cùng thắng", () => {
  const s: CcState = replay(["a", "b", "c"], [{ k: "end" }], {}, 1);
  assert.equal(s.over, true);
  assert.deepEqual(standings(s), []);
  s.owners = [0, 1, 2, 0, 2, 1, 0, 3, 0];
  assert.deepEqual(standings(s), ["a", "b"]);
});

test("cho qua lượt người treo máy; dòng sai người thì dừng", () => {
  const s = replay(["a", "b"], [{ k: "skip", u: "a" }, into("a", 1)], {}, 1);
  assert.equal(s.count, 1);
  assert.equal(s.turn, 1);
});

test("băm tất định", () => {
  assert.equal(roll(42, 1, 0, "hop"), roll(42, 1, 0, "hop"));
  assert.notEqual(roll(42, 1, 0, "hop"), roll(43, 1, 0, "hop"));
});

test("cú chọi: lực lớn bay xa hơn, lệch phải sang phải; dựng lại đường bay từ điểm chạm đất", () => {
  const near = landing(launch("front", 0.1, 0));
  const far = landing(launch("front", 0.9, 0));
  assert.ok(far.y > near.y);
  assert.ok(landing(launch("front", 0.5, 0.3)).x > 100);
  assert.ok(landing(launch("back", 0.5, 0.3)).x < 100);
  assert.ok(landing(launch("back", 0.5, 0)).y < 535);
  assert.ok(Math.abs(yawOf("front", 1, 1) - Math.PI / 4) < 1e-9);
  assert.ok(Math.abs(yawOf("back", -1, -1) - Math.PI / 4) < 1e-9);
  const l = launch("front", 0.6, 0.1);
  const g = landing(l);
  const r = relaunch("front", g.lx, g.ly);
  assert.ok(Math.abs(r.t - l.t) < 0.02);
});
