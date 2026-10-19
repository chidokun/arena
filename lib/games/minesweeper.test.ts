import assert from "node:assert/strict";
import { test } from "node:test";
import {
  around,
  chordCells,
  DEFAULT_OPTIONS,
  emptyBoard,
  floodFrom,
  HIDDEN,
  judge,
  makeLayout,
  maxMines,
  minMines,
  newGame,
  normOptions,
  optimistic,
  replay,
  SIZE_KEYS,
  SIZES,
  START,
  type Board,
  type Layout,
} from "./minesweeper.ts";

function draw(rows: string[]): Layout {
  const w = rows[0].length;
  const h = rows.length;
  const cells = rows.join("");
  const mine = new Uint8Array(w * h);
  for (let c = 0; c < w * h; c++) if (cells[c] === "*") mine[c] = 1;
  const near = new Uint8Array(w * h);
  for (let c = 0; c < w * h; c++) for (const d of around(w, h, c)) near[c] += mine[d];
  const start = cells.indexOf("S");
  return { w, h, mines: mine.reduce((a, b) => a + b, 0), mine, near, start, opening: floodFrom(w, h, mine, near, start) };
}

const at = (lay: Layout, x: number, y: number) => y * lay.w + x;

// Vùng xuất phát góc trái lan ra 3 cột đầu; cột 3–4 còn ẩn, mìn ở (4,0) và (4,3).
const LAY = draw([
  "S...*", //
  ".....",
  ".....",
  "....*",
]);

test("chuẩn hoá tuỳ chọn: cỡ lạ về mặc định, số mìn kẹp trong khoảng", () => {
  assert.deepEqual(normOptions(undefined), DEFAULT_OPTIONS);
  assert.deepEqual(normOptions({ size: "zz" }), { size: "m", mines: SIZES.m.mines });
  assert.deepEqual(normOptions({ size: "s" }), { size: "s", mines: 10 });
  assert.deepEqual(normOptions({ size: "s", mines: 1 }), { size: "s", mines: minMines("s") });
  assert.deepEqual(normOptions({ size: "s", mines: 999 }), { size: "s", mines: maxMines("s") });
  assert.deepEqual(normOptions({ size: "l", mines: 60.4 }), { size: "l", mines: 60 });
  for (const k of SIZE_KEYS) assert.ok(SIZES[k].mines <= maxMines(k) && SIZES[k].mines >= minMines(k), k);
});

test("bàn sinh tất định, đúng số mìn, vùng xuất phát 3×3 không có mìn", () => {
  for (const size of SIZE_KEYS) {
    for (const [seed, mines] of [
      [1, maxMines(size)],
      [42, minMines(size)],
      [0xdeadbeef, SIZES[size].mines],
    ]) {
      const r = { seed, size, mines };
      const a = makeLayout(r);
      assert.deepEqual(a, makeLayout(r));
      assert.equal(a.mine.reduce((x, y) => x + y, 0), r.mines);
      assert.equal(a.mines, r.mines);
      for (const c of [a.start, ...around(a.w, a.h, a.start)]) assert.equal(a.mine[c], 0);
      assert.equal(a.near[a.start], 0);
      const x = a.start % a.w;
      const y = Math.floor(a.start / a.w);
      assert.ok(x >= 1 && x <= a.w - 2 && y >= 1 && y <= a.h - 2);
      assert.ok(a.opening.includes(a.start) && a.opening.length >= 9);
      assert.ok(a.opening.every((c) => !a.mine[c]));
      assert.ok(a.opening.length <= (a.w * a.h - mines) * 0.4 || a.opening.length === 9);
      assert.equal(newGame(a, 2).over, false);
    }
  }
});

test("lộ bàn: vùng xuất phát mở sẵn, lan qua ô số 0, không tính điểm cho ai", () => {
  const s = newGame(LAY, 2);
  // Cột 0–2 lan hết (ô số 0 ở cột 0–2), cột 3 là ô số, cột 4 ẩn.
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x <= 3; x++) assert.equal(s.by[at(LAY, x, y)], START, `${x},${y}`);
    assert.equal(s.by[at(LAY, 4, y)], HIDDEN);
  }
  assert.equal(s.left, 2);
  assert.deepEqual(s.score, [0, 0]);
  assert.equal(s.over, false);
});

test("mở ô an toàn được điểm, ô đã mở thì không tính lại", () => {
  let board: Board = emptyBoard(2);
  board = judge(LAY, [[at(LAY, 4, 1)], [at(LAY, 4, 1)]], board)!;
  const s = replay(LAY, 2, board.log);
  assert.deepEqual(s.score, [1, 0]);
  assert.equal(s.by[at(LAY, 4, 1)], 0);
  assert.deepEqual(board.log, [[at(LAY, 4, 1), 0]]);
  assert.deepEqual(board.seen, [1, 1]);
  // Không có nước mới thì không đổi.
  assert.equal(judge(LAY, [[at(LAY, 4, 1)], [at(LAY, 4, 1)]], board), null);
});

test("đạp mìn bị loại, nước sau đó bị bỏ qua; mở hết ô an toàn thì người còn trụ nhiều điểm nhất thắng", () => {
  const mine = at(LAY, 4, 0);
  const board = judge(LAY, [[mine, at(LAY, 4, 1)], [at(LAY, 4, 2)]], emptyBoard(2))!;
  const s = replay(LAY, 2, board.log);
  assert.deepEqual(s.alive, [false, true]);
  assert.deepEqual(s.fate, ["boom", null]);
  assert.equal(s.boom[mine], 0);
  assert.equal(s.by[at(LAY, 4, 1)], HIDDEN);
  assert.deepEqual(s.score, [0, 1]);
  assert.equal(s.over, false);
  // Người còn lại phải tự mở hết mới thắng.
  const done = judge(LAY, [[mine, at(LAY, 4, 1)], [at(LAY, 4, 2), at(LAY, 4, 1)]], board)!;
  const t = replay(LAY, 2, done.log);
  assert.equal(t.over, true);
  assert.equal(t.cleared, true);
  assert.deepEqual(t.winners, [1]);
});

test("người bị loại không thắng dù nhiều điểm hơn", () => {
  const lay = draw([
    "S.*..", //
    "..*..",
    "***..",
    ".....",
  ]);
  const s0 = newGame(lay, 2);
  const last = at(lay, 2, 3);
  const safe = s0.by.flatMap((b, c) => (b === HIDDEN && !lay.mine[c] && c !== last ? [c] : []));
  // Người 0 mở gần hết rồi đạp mìn; người 1 mở ô cuối.
  const s = replay(lay, 2, judge(lay, [[...safe, at(lay, 2, 0)], [last]], emptyBoard(2))!.log);
  assert.equal(s.over, true);
  assert.ok(s.score[0] > s.score[1]);
  assert.deepEqual(s.winners, [1]);
});

test("đồng điểm thì đồng hạng", () => {
  const s = replay(LAY, 2, judge(LAY, [[at(LAY, 4, 1)], [at(LAY, 4, 2)]], emptyBoard(2))!.log);
  assert.equal(s.over, true);
  assert.deepEqual(s.winners, [0, 1]);
});

test("ai cũng đạp mìn thì hết ván, không ai thắng", () => {
  const s = replay(LAY, 2, judge(LAY, [[at(LAY, 4, 0)], [at(LAY, 4, 3)]], emptyBoard(2))!.log);
  assert.equal(s.over, true);
  assert.equal(s.cleared, false);
  assert.deepEqual(s.winners, []);
  assert.deepEqual(s.out, [0, 1]);
});

test("chơi một mình: đạp mìn là thua, mở hết là thắng", () => {
  assert.deepEqual(replay(LAY, 1, [[at(LAY, 4, 0), 0]]).winners, []);
  const s = replay(LAY, 1, [
    [at(LAY, 4, 1), 0],
    [at(LAY, 4, 2), 0],
  ]);
  assert.equal(s.over, true);
  assert.deepEqual(s.winners, [0]);
});

test("rời ván bị loại; còn một người thì phải mở hết", () => {
  const board = judge(LAY, [[], [], []], emptyBoard(3), undefined, [2])!;
  let s = replay(LAY, 3, board.log);
  assert.deepEqual(s.fate, [null, null, "left"]);
  // Loại hai lần không ghi thêm.
  assert.equal(judge(LAY, [[], [], []], board, s, [2]), null);
  s = replay(LAY, 3, judge(LAY, [[at(LAY, 4, 0)], [], []], board, s)!.log);
  assert.deepEqual(s.alive, [false, true, false]);
  assert.equal(s.over, false);
});

test("ô số 0 lan rộng, các ô lan ra tính điểm cho người mở", () => {
  const lay = draw([
    "S.*......", //
    "..*......",
    "***......",
    ".........",
  ]);
  const s0 = newGame(lay, 1);
  const before = s0.left;
  const s = replay(lay, 1, [[at(lay, 8, 0), 0]]);
  assert.ok(s.score[0] > 10);
  assert.equal(s.left, before - s.score[0]);
  // Ô số cạnh mìn được mở nhưng không lan qua mìn.
  for (let c = 0; c < s.by.length; c++) if (lay.mine[c]) assert.equal(s.by[c], HIDDEN);
});

test("dựng tiếp từ trạng thái cũ ra như dựng từ đầu", () => {
  const log = [
    [at(LAY, 4, 1), 0],
    [at(LAY, 4, 0), 1],
  ];
  const head = replay(LAY, 2, log.slice(0, 1));
  assert.deepEqual(replay(LAY, 2, log, head), replay(LAY, 2, log));
  assert.equal(head.count, 1);
  assert.deepEqual(head.alive, [true, true]);
});

test("bàn tạm: áp nước mình đang chờ mà không đụng bàn chung", () => {
  const s = newGame(LAY, 2);
  const t = optimistic(s, LAY, 1, [at(LAY, 4, 1), "x", at(LAY, 4, 0)]);
  assert.equal(t.by[at(LAY, 4, 1)], 1);
  assert.equal(t.boom[at(LAY, 4, 0)], 1);
  assert.equal(t.alive[1], false);
  assert.equal(s.by[at(LAY, 4, 1)], HIDDEN);
  assert.equal(optimistic(s, LAY, 1, []), s);
});

test("mở nhanh quanh ô số khi cắm đủ cờ", () => {
  const s = newGame(LAY, 1);
  const c = at(LAY, 3, 0); // số 1, kề mìn (4,0)
  assert.equal(LAY.near[c], 1);
  assert.deepEqual(chordCells(s, LAY, c, new Set()), []);
  assert.deepEqual(chordCells(s, LAY, c, new Set([at(LAY, 4, 0)])), [at(LAY, 4, 1)]);
  // Cắm nhầm cờ thì mở trúng mìn.
  assert.deepEqual(chordCells(s, LAY, c, new Set([at(LAY, 4, 1)])), [at(LAY, 4, 0)]);
  // Ô ẩn / ô số 0 không mở nhanh được.
  assert.deepEqual(chordCells(s, LAY, at(LAY, 4, 1), new Set()), []);
  assert.deepEqual(chordCells(s, LAY, at(LAY, 0, 0), new Set()), []);
});
