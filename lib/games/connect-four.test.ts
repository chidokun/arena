import assert from "node:assert/strict";
import { test } from "node:test";
import { COLS, ROWS, replay } from "./connect-four.ts";

const at = (c: number, r: number) => r * COLS + c;
const bottom = ROWS - 1;

test("quân rơi xuống ô trống thấp nhất của cột", () => {
  const s = replay([3, 3, 3]);
  assert.equal(s.board[at(3, bottom)], 1);
  assert.equal(s.board[at(3, bottom - 1)], 2);
  assert.equal(s.board[at(3, bottom - 2)], 1);
  assert.equal(s.last, at(3, bottom - 2));
  assert.equal(s.turn, 2);
});

test("bốn quân hàng ngang thì thắng", () => {
  const s = replay([0, 0, 1, 1, 2, 2, 3]);
  assert.equal(s.winner, 1);
  assert.deepEqual(s.line, [at(0, bottom), at(1, bottom), at(2, bottom), at(3, bottom)]);
});

test("bốn quân hàng dọc thì thắng, ba quân chưa", () => {
  assert.equal(replay([0, 1, 0, 1, 0, 1]).winner, 0);
  const s = replay([0, 1, 0, 1, 2, 1, 2, 1]);
  assert.equal(s.winner, 2);
  assert.deepEqual(s.line, [at(1, 2), at(1, 3), at(1, 4), at(1, 5)]);
});

test("đường chéo lên phải", () => {
  // Đỏ: (0,5) (1,4) (2,3) (3,2) — các cột được lót sẵn bằng quân Vàng / Đỏ.
  const s = replay([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.equal(s.winner, 1);
  assert.deepEqual(s.line, [at(3, 2), at(2, 3), at(1, 4), at(0, 5)].sort((a, b) => a - b));
});

test("một nước nối hai chuỗi thì tô cả hai", () => {
  // Đỏ có 3 quân ngang ở đáy (cột 0–2) và 3 quân chéo (2,4) (1,3) (0,2); thả cột 3 nối cả hai.
  const s = replay([0, 0, 1, 1, 2, 0, 2, 6, 1, 6, 0, 5, 3]);
  assert.equal(s.winner, 1);
  const want = [at(0, 5), at(1, 5), at(2, 5), at(3, 5), at(2, 4), at(1, 3), at(0, 2)];
  assert.deepEqual(s.line, want.sort((a, b) => a - b));
});

test("cột đầy và cột ngoài bàn bị dừng", () => {
  const full = replay([0, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(full.count, ROWS);
  assert.equal(replay([7]).count, 0);
  assert.equal(replay([-1]).count, 0);
  assert.equal(replay([1.5]).count, 0);
});

test("đầy bàn không ai thắng thì hoà", () => {
  // Xếp theo cặp cột (0,1),(2,3),(4,5) rồi cột 6: mỗi cột luân phiên màu theo khối 3 hàng, không tạo chuỗi 4.
  const moves: number[] = [];
  for (const [a, b] of [
    [0, 1],
    [2, 3],
    [4, 5],
  ]) {
    for (let k = 0; k < 3; k++) moves.push(a, b);
    for (let k = 0; k < 3; k++) moves.push(b, a);
  }
  for (let k = 0; k < ROWS; k++) moves.push(6);
  const s = replay(moves);
  assert.equal(s.winner, 0);
  assert.equal(s.count, COLS * ROWS);
  assert.equal(s.draw, true);
});

test("sau khi thắng mọi nước tiếp theo bị bỏ qua", () => {
  const s = replay([0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(s.count, 7);
});
