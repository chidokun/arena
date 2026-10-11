import assert from "node:assert/strict";
import { test } from "node:test";
import { boxesOf, boxSides, hLine, lineAt, lineCount, normOptions, replay, vLine } from "./dots-boxes.ts";

test("đánh số cạnh: mỗi cạnh một chỉ số, đổi qua lại được", () => {
  for (const n of [1, 3, 5]) {
    const seen = new Set<number>();
    for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) seen.add(hLine(n, r, c));
    for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) seen.add(vLine(n, r, c));
    assert.equal(seen.size, lineCount(n));
    assert.deepEqual([...seen].sort((a, b) => a - b), [...Array(lineCount(n)).keys()]);
    for (const i of seen) {
      const { horizontal, r, c } = lineAt(n, i);
      assert.equal(horizontal ? hLine(n, r, c) : vLine(n, r, c), i);
    }
  }
});

test("cạnh giáp đúng các ô của nó", () => {
  assert.deepEqual(boxesOf(3, hLine(3, 0, 1)), [1]);
  assert.deepEqual(boxesOf(3, hLine(3, 1, 1)), [1, 4]);
  assert.deepEqual(boxesOf(3, hLine(3, 3, 2)), [8]);
  assert.deepEqual(boxesOf(3, vLine(3, 2, 0)), [6]);
  assert.deepEqual(boxesOf(3, vLine(3, 1, 2)), [4, 5]);
  for (let b = 0; b < 9; b++) for (const i of boxSides(3, b)) assert.ok(boxesOf(3, i).includes(b));
});

test("kẻ cạnh thường thì đổi lượt", () => {
  const s = replay(3, [hLine(3, 0, 0), hLine(3, 0, 1)]);
  assert.equal(s.count, 2);
  assert.equal(s.lines[hLine(3, 0, 0)], 1);
  assert.equal(s.lines[hLine(3, 0, 1)], 2);
  assert.equal(s.turn, 1);
});

test("khép ô thì được ô và đi tiếp", () => {
  const [t, b, l, r] = boxSides(3, 0);
  const s = replay(3, [t, b, l, r]);
  assert.equal(s.boxes[0], 2);
  assert.deepEqual(s.score, [0, 1]);
  assert.deepEqual(s.fresh, [0]);
  assert.equal(s.turn, 2);
});

test("một cạnh khép hai ô cùng lúc", () => {
  // Hai ô 0 và 1 chung cạnh dọc giữa; kẻ hết các cạnh khác trước.
  const mid = vLine(3, 0, 1);
  const others = [...boxSides(3, 0), ...boxSides(3, 1)].filter((i, k, a) => i !== mid && a.indexOf(i) === k);
  const s = replay(3, [...others, mid]);
  assert.deepEqual(s.fresh, [0, 1]);
  assert.equal(s.boxes[0], s.boxes[1]);
  assert.equal(s.score[s.boxes[0] - 1], 2);
});

test("nước không hợp lệ bị dừng", () => {
  assert.equal(replay(3, [0, 0, 1]).count, 1);
  assert.equal(replay(3, [lineCount(3)]).count, 0);
  assert.equal(replay(3, [-1]).count, 0);
  assert.equal(replay(3, [0.5]).count, 0);
});

test("kẻ hết bàn 1×1 thì có người thắng", () => {
  const s = replay(1, [0, 1, 2, 3]);
  assert.equal(s.over, true);
  assert.equal(s.winner, 2);
  assert.deepEqual(s.score, [0, 1]);
});

// Bàn 2×2 — cạnh ngang 0..5 (hàng chấm 0: 0 1, hàng 1: 2 3, hàng 2: 4 5), cạnh dọc 6..11 (hàng ô 0: 6 7 8, hàng 1: 9 10 11).
// Ô 0 (trên trái) = 0 2 6 7, ô 1 = 1 3 7 8, ô 2 = 2 4 9 10, ô 3 = 3 5 10 11.
// Bảy cạnh đầu không khép ô nào; nước 8 (người 2) đưa ô 1, ô 3 lên 3 cạnh; người 1 kẻ 7 ăn ô 1, kẻ 2 ăn ô 0.
const OPENING = [0, 1, 6, 8, 5, 9, 11, 3, 7, 2];

test("hoà khi chia đều ô (bàn chẵn)", () => {
  const mid = replay(2, OPENING);
  assert.deepEqual(mid.score, [2, 0]);
  assert.equal(mid.turn, 1);
  // Người 1 buộc phải kẻ thêm: kẻ 4 không khép ô nào, người 2 kẻ 10 ăn nốt hai ô.
  const s = replay(2, [...OPENING, 4, 10]);
  assert.deepEqual(s.score, [2, 2]);
  assert.equal(s.over, true);
  assert.equal(s.draw, true);
  assert.equal(s.winner, 0);
});

test("ván kết thúc sớm khi một người đã quá nửa số ô", () => {
  // Người 1 kẻ 10 khép ô 3: 3/4 ô — ô 2 còn trống nhưng không thể bị đuổi kịp.
  const s = replay(2, [...OPENING, 10]);
  assert.deepEqual(s.score, [3, 0]);
  assert.equal(s.over, true);
  assert.equal(s.winner, 1);
  assert.equal(s.boxes[2], 0);
  assert.equal(replay(2, [...OPENING, 10, 4]).count, s.count);
});

test("tuỳ chọn cỡ bàn lạ thì về mặc định", () => {
  assert.deepEqual(normOptions({ size: 7 }), { size: 7 });
  assert.deepEqual(normOptions({ size: 4 }), { size: 5 });
  assert.deepEqual(normOptions(undefined), { size: 5 });
});
