import assert from "node:assert/strict";
import { test } from "node:test";
import { applyStep, cloneBoard, initialState, legal, play, replay, score, TOTAL, type OaqState } from "./oanquan.ts";

/** Tổng điểm còn trên bàn + đã ăn — luôn bằng TOTAL. */
const total = (s: OaqState) => s.dan.reduce((a, b) => a + b, 0) + (s.quan[0] ? 10 : 0) + (s.quan[1] ? 10 : 0) + score(s, 1) + score(s, 2);

test("bàn mới: 10 ô dân mỗi ô 5 quân, hai ô quan, bên 1 đi trước", () => {
  const s = initialState();
  assert.deepEqual(s.dan, [0, 5, 5, 5, 5, 5, 0, 5, 5, 5, 5, 5]);
  assert.deepEqual(s.quan, [true, true]);
  assert.equal(s.turn, 1);
  assert.equal(total(s), TOTAL);
});

test("chỉ được bốc ô dân có quân bên mình", () => {
  const s = initialState();
  assert.ok(legal(s, 3));
  assert.ok(legal(s, -5));
  assert.equal(legal(s, 7), false);
  assert.equal(legal(s, 0), false);
  assert.equal(legal(s, 6), false);
  assert.equal(legal(s, 1.5), false);
  assert.equal(replay([1, 1]).count, 1, "bên 2 không được bốc ô của bên 1");
});

test("rải hết gặp ô dân thì bốc rải tiếp, gặp ô trống thì ăn ô sau nó", () => {
  // Bốc ô 1 rải sang phải: 2,3,4,5 và ô quan 6; ô 7 có quân → bốc rải 8,9,10,11 và ô quan 0; ô 1 trống → ăn ô 2 (6 dân).
  const s = replay([1]);
  assert.deepEqual(s.dan, [1, 0, 0, 6, 6, 6, 1, 0, 6, 6, 6, 6]);
  assert.equal(s.got[1], 6);
  assert.equal(s.turn, 2);
  assert.equal(total(s), TOTAL);
  assert.deepEqual(
    s.steps.filter((x) => x.k !== "drop"),
    [
      { k: "pick", at: 1, n: 5 },
      { k: "pick", at: 7, n: 5 },
      { k: "eat", at: 2, n: 6, quan: false, p: 1 },
    ],
  );
});

test("quan non: cấm ăn thì mất lượt, cho ăn thì ăn cả quan", () => {
  // Bốc ô 1 rải sang trái: 0,11,10,9,8; bốc ô 7 rải 6,5,4,3,2; ô 1 trống, ô 0 chỉ có quan + 1 dân.
  const banned = replay([-1]);
  assert.equal(score(banned, 1), 0);
  assert.equal(banned.quan[0], true);
  const allowed = replay([-1], { quanNon: false });
  assert.equal(allowed.quan[0], false);
  assert.equal(allowed.quans[1], 1);
  assert.deepEqual(allowed.quanBy, [1, 0]);
  assert.equal(score(allowed, 1), 11);
  assert.equal(total(allowed), TOTAL);
});

test("ăn liên tiếp khi cứ cách một ô trống lại có quân", () => {
  const s = initialState();
  s.dan = [0, 1, 0, 3, 0, 4, 0, 5, 5, 5, 5, 5];
  s.quan = [true, false];
  assert.ok(play(s, 1, { quanNon: false }));
  // Thả xuống ô 2, ô 3 có quân → bốc rải 4,5,6; ô 7 có quân → bốc rải 8..11, 0; ô 1 trống → ăn ô 2 (1),
  // ô 3 trống → ăn ô 4 (1), ô 5 có quân → dừng.
  const eats = s.steps.filter((x) => x.k === "eat");
  assert.deepEqual(
    eats.map((x) => x.at),
    [2, 4],
  );
});

test("gặp ô quan còn quân thì mất lượt", () => {
  const s = initialState();
  s.dan = [0, 0, 0, 0, 1, 0, 0, 5, 5, 5, 5, 5];
  assert.ok(play(s, 4));
  // Thả xuống ô 5, ô kế là ô quan 6 còn quân → dừng, không ăn gì.
  assert.equal(score(s, 1), 0);
  assert.equal(s.turn, 2);
});

test("hết dân bên mình thì lấy 5 quân đã ăn rải lại, thiếu thì vay", () => {
  const s = initialState();
  s.dan = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
  // Bên 1 bốc ô 4 thả xuống ô 5, gặp ô quan → mất lượt. Bên 2 không còn dân: rải 5 quân, chưa ăn gì nên vay (điểm âm).
  assert.ok(play(s, 4));
  assert.equal(s.turn, 2);
  assert.deepEqual(s.steps.at(-1), { k: "scatter", p: 2 });
  assert.deepEqual(s.dan.slice(7), [1, 1, 1, 1, 1]);
  assert.equal(s.got[2], -5);
});

test("hết quan thì thu dân về mỗi bên và đếm điểm", () => {
  const s = initialState();
  s.dan = [5, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1];
  s.quan = [true, false];
  s.quans = [0, 0, 1];
  s.got = [0, 34, 7];
  assert.equal(total(s), TOTAL);
  // Bốc ô 3 rải sang trái: thả ô 2; ô 1 trống → ăn ô quan 0 (quan + 5 dân); ô 11 có quân → dừng. Hai ô quan hết → thu quân.
  assert.ok(play(s, -3));
  assert.equal(s.over, true);
  assert.equal(s.end, "quan");
  assert.deepEqual(
    s.steps.map((x) => x.k),
    ["pick", "drop", "eat", "sweep"],
  );
  // Bên 1: 34 + 5 + 10 + 1 (ô 2); bên 2: 7 + 10 + 2 + 1.
  assert.equal(score(s, 1), 50);
  assert.equal(score(s, 2), 20);
  assert.equal(s.winner, 1);
  assert.equal(total(s), TOTAL);
  assert.equal(play(s, 2), false, "hết ván thì không đi tiếp được");
});

test("ván ngẫu nhiên: luôn đủ quân, diễn lại từng bước khớp, dựng lại tất định", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let g = 0; g < 200; g++) {
    const opts = { quanNon: g % 2 === 0 };
    const s = initialState();
    const moves: number[] = [];
    while (!s.over) {
      const row = s.turn === 1 ? [1, 2, 3, 4, 5] : [7, 8, 9, 10, 11];
      const choices = row.filter((i) => s.dan[i] > 0).flatMap((i) => [i, -i]);
      const mv = choices[Math.floor(rnd() * choices.length)];
      const before = cloneBoard(s);
      assert.ok(play(s, mv, opts));
      moves.push(mv);
      for (const st of s.steps) applyStep(before, st);
      assert.deepEqual(before, cloneBoard(s));
      assert.equal(total(s), TOTAL);
      assert.ok(s.dan.every((n) => n >= 0));
    }
    assert.deepEqual(replay(moves, opts), s);
  }
});
