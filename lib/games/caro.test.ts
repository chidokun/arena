import assert from "node:assert/strict";
import { test } from "node:test";
import { replay, type Move } from "./caro.ts";

const opts = { size: 15, blockTwoEnds: false };

// X đi các nước trong `xs`, O đi `os`, xen kẽ bắt đầu bằng X.
function interleave(xs: Move[], os: Move[]): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < Math.max(xs.length, os.length); i++) {
    if (xs[i]) out.push(xs[i]);
    if (os[i]) out.push(os[i]);
  }
  return out;
}

test("năm quân hàng ngang thì thắng", () => {
  const s = replay(interleave([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], [[0, 5], [1, 5], [2, 5], [3, 5]]), opts);
  assert.equal(s.winner, 1);
  assert.equal(s.line.length, 5);
});

test("đường chéo ngược", () => {
  const s = replay(interleave([[9, 1], [5, 5], [6, 4], [7, 3], [8, 2]], [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]), opts);
  assert.equal(s.winner, 1);
});

test("bốn quân chưa thắng, lượt chuyển đúng", () => {
  const s = replay(interleave([[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 5], [1, 5], [2, 5]]), opts);
  assert.equal(s.winner, 0);
  assert.equal(s.turn, 2);
});

test("chặn hai đầu: không thắng khi bật luật, thắng khi tắt", () => {
  const xs: Move[] = [[2, 7], [3, 7], [4, 7], [5, 7], [6, 7]];
  const os: Move[] = [[1, 7], [7, 7], [0, 0], [0, 1], [0, 3]];
  const blocked = replay(interleave(xs, os), { size: 15, blockTwoEnds: true });
  assert.equal(blocked.winner, 0);
  const free = replay(interleave(xs, os), opts);
  assert.equal(free.winner, 1);
});

test("chặn một đầu và mép bàn vẫn thắng", () => {
  const xs: Move[] = [[0, 7], [1, 7], [2, 7], [3, 7], [4, 7]];
  const os: Move[] = [[5, 7], [9, 9], [9, 10], [9, 12]];
  assert.equal(replay(interleave(xs, os), { size: 15, blockTwoEnds: true }).winner, 1);
});

test("nước đè ô đã có quân bị dừng", () => {
  const s = replay([[0, 0], [0, 0], [1, 1]], opts);
  assert.equal(s.count, 1);
});
