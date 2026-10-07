import assert from "node:assert/strict";
import { test } from "node:test";
import { COLS, inCheck, legalMoves, notate, parseBoard, reach, replay, startBoard, type Move } from "./xiangqi.ts";

/** Ô theo (cột, hàng); hàng 0 ở phía Đen (trên cùng), hàng 9 ở phía Đỏ. */
const at = (c: number, r: number) => r * COLS + c;
const mv = (c: number, r: number, c2: number, r2: number): Move => [at(c, r), at(c2, r2)];
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
const from = (fen: string, moves: Move[]) => replay(moves, parseBoard(fen));

test("thế khai cuộc mỗi bên có 44 nước", () => {
  assert.equal(legalMoves(startBoard(), 1).length, 44);
  assert.equal(legalMoves(startBoard(), 2).length, 44);
});

test("Mã bị cản chân thì không đi được hướng đó", () => {
  const b = startBoard();
  assert.deepEqual(sorted(reach(b, at(1, 9))), sorted([at(0, 7), at(2, 7)]));
  b[at(1, 8)] = 7;
  assert.deepEqual(reach(b, at(1, 9)), []);
});

test("Pháo phải có ngòi mới ăn được quân", () => {
  const b = startBoard();
  assert.ok(reach(b, at(1, 7)).includes(at(1, 0)));
  assert.ok(!reach(b, at(1, 7)).includes(at(1, 2)));
});

test("Tượng không qua sông, Tốt qua sông mới được đi ngang", () => {
  const b = parseBoard("4k4/9/9/9/2P6/2E6/9/9/9/4K4");
  assert.deepEqual(sorted(reach(b, at(2, 5))), sorted([at(0, 7), at(4, 7)]));
  assert.deepEqual(sorted(reach(b, at(2, 4))), sorted([at(2, 3), at(1, 4), at(3, 4)]));
  const home = parseBoard("4k4/9/9/9/9/9/2P6/9/9/4K4");
  assert.deepEqual(reach(home, at(2, 6)), [at(2, 5)]);
});

test("hai tướng không được đối mặt", () => {
  const b = parseBoard("3k5/9/9/9/9/9/9/9/9/4K4");
  assert.ok(!inCheck(b, 1));
  assert.ok(!legalMoves(b, 1).some(([, to]) => to === at(3, 9)));
  assert.ok(inCheck(parseBoard("4k4/9/9/9/9/9/9/9/9/4K4"), 1));
});

test("ván từ thế khai cuộc: ăn quân, ghi biên bản, chuyển lượt", () => {
  const s = replay([
    mv(7, 7, 4, 7), // P2-5
    mv(1, 0, 2, 2), // M2.3 (Đen)
    mv(7, 9, 6, 7), // M2.3
    mv(0, 3, 0, 4),
    mv(8, 9, 7, 9), // X1-2
    mv(0, 4, 0, 5),
    mv(7, 9, 7, 2), // Xe ăn Pháo Đen
    mv(0, 5, 0, 6), // Tốt Đen ăn Tốt Đỏ
    mv(4, 7, 4, 3), // Pháo đầu ăn Tốt giữa qua ngòi
  ]);
  assert.equal(s.count, 9);
  assert.equal(s.turn, 2);
  assert.deepEqual(s.captured, [-6, 7, -7]);
  assert.equal(s.quiet, 0);
  assert.deepEqual(s.notes.slice(0, 3), ["P2-5", "M2.3", "M2.3"]);
  assert.equal(s.winner, 0);
});

test("chiếu bí thì thắng", () => {
  const s = from("3k5/R8/9/9/9/8R/9/9/9/5K3", [mv(8, 5, 8, 0)]);
  assert.equal(s.check, true);
  assert.equal(s.winner, 1);
  assert.equal(s.end, "mate");
  assert.deepEqual(s.legal, []);
});

test("bí nước (không bị chiếu mà hết nước đi) cũng thua", () => {
  // Tướng Đen chỉ còn ô (4, 0) — đối mặt tướng Đỏ — và (3, 1) — bị Xe khoá.
  const s = from("3k5/9/1R7/9/9/9/9/9/9/4K4", [mv(1, 2, 1, 1)]);
  assert.equal(s.check, false);
  assert.equal(s.winner, 1);
  assert.equal(s.end, "stuck");
});

test("nước sai luật làm dừng nhật ký", () => {
  assert.equal(replay([mv(7, 7, 4, 7), mv(4, 7, 4, 3)]).count, 1, "Đỏ không được đi hai nước liền");
  assert.equal(replay([[999, 1], mv(7, 7, 4, 7)]).count, 0);
  assert.equal(replay([mv(0, 6, 1, 6)]).count, 0, "Tốt chưa qua sông không đi ngang");
});

test("lặp thế cờ ba lần: bên chiếu liên tục thua (chiếu dai)", () => {
  const s = from("4k4/9/9/9/9/9/9/9/9/R2K5", [
    mv(0, 9, 0, 0),
    mv(4, 0, 4, 1),
    mv(0, 0, 0, 1),
    mv(4, 1, 4, 0),
    mv(0, 1, 0, 0),
    mv(4, 0, 4, 1),
    mv(0, 0, 0, 1),
    mv(4, 1, 4, 0),
    mv(0, 1, 0, 0),
  ]);
  assert.equal(s.end, "perpetual");
  assert.equal(s.winner, 2);
  assert.equal(s.count, 9);
});

test("lặp thế cờ ba lần mà không ai chiếu dai thì hoà", () => {
  const s = from("3k5/9/9/9/9/9/9/9/9/R4K3", [mv(0, 9, 1, 9), mv(3, 0, 3, 1), mv(1, 9, 0, 9), mv(3, 1, 3, 0), mv(0, 9, 1, 9), mv(3, 0, 3, 1), mv(1, 9, 0, 9), mv(3, 1, 3, 0)]);
  assert.equal(s.end, "repeat");
  assert.equal(s.draw, true);
  assert.equal(s.count, 8);
});

test("hai bên hết quân tấn công thì hoà", () => {
  const s = from("3k5/9/9/9/9/9/9/9/5p3/5K3", [mv(5, 9, 5, 8)]);
  assert.equal(s.end, "bare");
  assert.equal(s.draw, true);
});

test("đủ 60 nước mỗi bên không ăn quân thì hoà", () => {
  // Xe Đỏ đi rắn bò trên hàng 5→2 (bỏ cột 3 của Tướng Đen) rồi quay ngược lại — thế cờ không lặp tới ba lần;
  // Tướng Đen bước lên xuống trong cung.
  const cols = [0, 1, 2, 4, 5, 6, 7, 8];
  const path: number[] = [];
  for (let r = 5; r >= 2; r--) for (const c of (5 - r) % 2 ? [...cols].reverse() : cols) path.push(at(c, r));
  const seq = [...path, ...path.slice(2, path.length - 1).reverse()];
  const moves: Move[] = [];
  for (let k = 1; k < seq.length; k++) moves.push([seq[k - 1], seq[k]], k % 2 ? mv(3, 0, 3, 1) : mv(3, 1, 3, 0));
  const s = from("3k5/9/9/9/9/R8/9/9/9/5K3", moves);
  assert.equal(s.count, 120);
  assert.equal(s.end, "idle");
  assert.equal(s.draw, true);
});

test("ký hiệu nước đi kiểu Việt Nam", () => {
  const b = startBoard();
  assert.equal(notate(b, at(7, 7), at(4, 7)), "P2-5");
  assert.equal(notate(b, at(7, 9), at(6, 7)), "M2.3");
  assert.equal(notate(b, at(1, 0), at(2, 2)), "M2.3", "Đen đánh số cột từ phía mình");
  assert.equal(notate(b, at(8, 9), at(8, 7)), "X1.2");
  assert.equal(notate(b, at(6, 9), at(4, 7)), "T3.5");
  assert.equal(notate(b, at(4, 9), at(4, 8)), "Tg5.1");
  const two = parseBoard("4k4/9/9/9/9/9/1R7/9/1R7/4K4");
  assert.equal(notate(two, at(1, 6), at(1, 2)), "Xt.4");
  assert.equal(notate(two, at(1, 8), at(1, 9)), "Xs/1");
});
