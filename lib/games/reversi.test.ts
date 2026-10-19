import assert from "node:assert/strict";
import { test } from "node:test";
import { CELLS, emptyState, flipsOf, legalMoves, replay } from "./reversi.ts";

const at = (sq: string) => (Number(sq[1]) - 1) * 8 + (sq.charCodeAt(0) - 97);

test("khai cuộc: bốn quân chéo, Đen có đúng bốn nước", () => {
  const s = emptyState();
  assert.equal(s.board[at("d4")], 2);
  assert.equal(s.board[at("e5")], 2);
  assert.equal(s.board[at("e4")], 1);
  assert.equal(s.board[at("d5")], 1);
  assert.deepEqual(s.score, [2, 2]);
  assert.equal(s.turn, 1);
  assert.deepEqual(s.legal, ["d3", "c4", "f5", "e6"].map(at).sort((a, b) => a - b));
});

test("đặt quân lật dãy bị kẹp rồi đổi lượt", () => {
  const s = replay([at("f5")]);
  assert.equal(s.board[at("f5")], 1);
  assert.equal(s.board[at("e5")], 1);
  assert.deepEqual(s.flipped, [at("e5")]);
  assert.deepEqual(s.score, [4, 1]);
  assert.equal(s.turn, 2);
  assert.equal(s.last, at("f5"));
  assert.deepEqual(s.legal, ["d6", "f4", "f6"].map(at).sort((a, b) => a - b));
});

test("một nước lật nhiều hướng cùng lúc", () => {
  const board = new Uint8Array(CELLS);
  // Đen đặt d4: kẹp Trắng ở hàng ngang (e4) và đường chéo (e5) cùng lúc.
  board[at("e4")] = 2;
  board[at("f4")] = 1;
  board[at("e5")] = 2;
  board[at("f6")] = 1;
  board[at("d5")] = 2;
  assert.deepEqual(flipsOf(board, 1, at("d4")).sort((a, b) => a - b), [at("e4"), at("e5")].sort((a, b) => a - b));
  // Dãy không có quân mình chặn đầu bên kia thì không lật.
  assert.deepEqual(flipsOf(board, 1, at("c6")), []);
  assert.deepEqual(flipsOf(board, 2, at("f4")), []);
});

test("nước không hợp lệ bị dừng", () => {
  assert.equal(replay([at("d4")]).count, 0); // ô đã có quân
  assert.equal(replay([at("a1")]).count, 0); // không lật được gì
  assert.equal(replay([at("f5"), at("f5")]).count, 1);
  assert.equal(replay([CELLS]).count, 0);
  assert.equal(replay([-1]).count, 0);
  assert.equal(replay([19.5]).count, 0);
});

test("người hết nước tự bị bỏ lượt, đối thủ đi tiếp", () => {
  const moves = [26, 18, 37, 25, 24, 32, 10, 11, 12, 16, 9, 4];
  assert.equal(replay(moves.slice(0, -1)).turn, 2);
  const s = replay(moves);
  assert.equal(s.passed, 1);
  assert.equal(s.turn, 2);
  assert.deepEqual(legalMoves(s.board, 1), []);
  assert.ok(s.legal.length > 0);
  assert.equal(s.over, false);
  assert.equal(replay([...moves, s.legal[0]]).count, moves.length + 1);
});

test("ván ngắn nhất: Đen ăn sạch quân sau 9 nước", () => {
  const moves = [19, 18, 17, 11, 4, 43, 51, 20, 29];
  const s = replay(moves);
  assert.equal(s.over, true);
  assert.equal(s.winner, 1);
  assert.deepEqual(s.score, [13, 0]);
  assert.deepEqual(s.legal, []);
  assert.equal(replay([...moves, 0]).count, moves.length);
});

test("kín bàn bằng quân thì hoà", () => {
  const moves = [
    26, 18, 37, 29, 20, 43, 21, 22, 23, 12, 10, 14, 13, 15, 42, 45, 5, 25, 34, 9, 16, 24, 17, 2, 1, 6, 32, 31, 38, 41, 53, 0, 49, 50, 30, 61, 51, 47, 40, 59, 19, 8, 3,
    57, 33, 39, 46, 44, 52, 54, 63, 62, 60, 4, 58, 48, 7, 11, 56, 55,
  ];
  const s = replay(moves);
  assert.equal(s.over, true);
  assert.equal(s.draw, true);
  assert.equal(s.winner, 0);
  assert.deepEqual(s.score, [32, 32]);
  assert.equal(s.board.every((v) => v !== 0), true);
});

test("điểm luôn khớp số quân trên bàn", () => {
  const moves = [26, 18, 37, 25, 24, 32, 10, 11, 12, 16, 9, 4];
  for (let k = 0; k <= moves.length; k++) {
    const s = replay(moves.slice(0, k));
    assert.equal(s.score[0], s.board.filter((v) => v === 1).length);
    assert.equal(s.score[1], s.board.filter((v) => v === 2).length);
  }
});
