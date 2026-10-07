import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countSolutions,
  emptyBoard,
  judge,
  makePuzzle,
  normOptions,
  ownBoard,
  replay,
  solvesBySingles,
  stamp,
  type Board,
  type Move,
  type Puzzle,
} from "./sudoku.ts";

const empties = (p: Puzzle) => p.givens.flatMap((d, i) => (d ? [] : [i]));
const right = (p: Puzzle, i: number): Move => [i, p.solution[i]];
const wrong = (p: Puzzle, i: number): Move => [i, (p.solution[i] % 9) + 1];

function validSolution(g: readonly number[]) {
  for (let k = 0; k < 9; k++) {
    const row = new Set<number>();
    const col = new Set<number>();
    const box = new Set<number>();
    for (let j = 0; j < 9; j++) {
      row.add(g[k * 9 + j]);
      col.add(g[j * 9 + k]);
      box.add(g[(Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3)]);
    }
    if (row.size !== 9 || col.size !== 9 || box.size !== 9 || row.has(0)) return false;
  }
  return true;
}

test("cùng seed và mức thì ra cùng một đề", () => {
  assert.deepEqual(makePuzzle(42, "medium"), makePuzzle(42, "medium"));
  assert.notDeepEqual(makePuzzle(42, "medium").givens, makePuzzle(43, "medium").givens);
});

test("đề hợp lệ, duy nhất lời giải, khớp với lời giải", () => {
  for (const level of ["easy", "medium", "hard"] as const) {
    for (let seed = 1; seed <= 15; seed++) {
      const p = makePuzzle(seed * 101, level);
      assert.ok(validSolution(p.solution), `${level}/${seed}: lời giải sai luật`);
      assert.equal(countSolutions(p.givens), 1, `${level}/${seed}: không duy nhất`);
      p.givens.forEach((d, i) => d && assert.equal(d, p.solution[i]));
      assert.equal(p.empties, empties(p).length);
    }
  }
});

test("mức càng khó càng ít số cho sẵn; mức nào cũng giải được bằng ô đơn", () => {
  const clues = (level: "easy" | "medium" | "hard") => 81 - makePuzzle(7, level).empties;
  assert.ok(clues("easy") > clues("medium"));
  assert.ok(clues("medium") > clues("hard"));
  assert.ok(solvesBySingles(makePuzzle(7, "easy").givens, false));
  assert.ok(solvesBySingles(makePuzzle(7, "medium").givens, true));
  assert.ok(solvesBySingles(makePuzzle(7, "hard").givens, true), "khó cũng không phải đoán");
});

test("normOptions bỏ giá trị lạ", () => {
  assert.deepEqual(normOptions({ level: "hard", mode: "race" }), { level: "hard", mode: "race" });
  assert.deepEqual(normOptions({ level: "x", mode: 3 }), { level: "easy", mode: "coop" });
  assert.deepEqual(normOptions(undefined), { level: "easy", mode: "coop" });
});

test("cùng giải đề: ai điền đúng trước giữ ô, sai bị trừ điểm, ô đã giữ không tính nữa", () => {
  const p = makePuzzle(5, "easy");
  const [a, b] = empties(p);
  const board = judge(p, "coop", [[right(p, a), wrong(p, b)], [right(p, a), right(p, b)]], emptyBoard(2))!;
  const s = replay(p, "coop", 2, board.log);
  assert.equal(s.owner[a], 0, "người 0 được xét trước nên giữ ô a");
  assert.equal(s.owner[b], 1);
  assert.deepEqual(s.score, [0, 1]);
  assert.deepEqual(s.wrong, [1, 0]);
  // Nước của người 1 vào ô a (đã có chủ) không được ghi.
  assert.equal(board.log.filter((e) => e[0] === a).length, 1);
  assert.deepEqual(board.seen, [2, 2]);
  assert.equal(judge(p, "coop", [[right(p, a), wrong(p, b)], [right(p, a), right(p, b)]], board), null, "không có nước mới thì không đổi");
});

test("cùng giải đề: hết ô thì người nhiều điểm nhất thắng, hoà điểm thì đồng hạng", () => {
  const p = makePuzzle(9, "easy");
  const cells = empties(p);
  const half = Math.floor(cells.length / 2);
  const s = replay(p, "coop", 2, judge(p, "coop", [cells.slice(0, half).map((i) => right(p, i)), cells.slice(half).map((i) => right(p, i))], emptyBoard(2))!.log);
  assert.ok(s.over);
  assert.equal(s.open, 0);
  assert.deepEqual(s.winners, cells.length - half > half ? [1] : [0, 1]);

  // Người 1 giữ nhiều hơn người 0 đúng (n − 2·half) ô nhưng điền sai đúng chừng ấy lần → bằng điểm.
  const misses = Array.from({ length: cells.length - 2 * half }, () => wrong(p, cells.at(-1)!));
  const tie = replay(p, "coop", 2, judge(p, "coop", [cells.slice(0, half).map((i) => right(p, i)), [...misses, ...cells.slice(half).map((i) => right(p, i))]], emptyBoard(2))!.log);
  assert.ok(tie.over);
  assert.equal(tie.score[0], tie.score[1]);
  assert.deepEqual(tie.winners, [0, 1]);
});

test("đối kháng: mỗi người giải bàn riêng, người giải ô nhanh nhất được tô, ai xong trước thắng nhưng ván chưa xong", () => {
  const p = makePuzzle(11, "easy");
  const cells = empties(p);
  const mine = cells.map((i) => right(p, i));
  // Người 1 giải ô đầu trước người 0 (được xét trong một lượt trước).
  const b1 = judge(p, "race", [[], [right(p, cells[0])]], emptyBoard(2))!;
  const b2 = judge(p, "race", [[wrong(p, cells[1]), ...mine], [right(p, cells[0])]], b1)!;
  const s = replay(p, "race", 2, b2.log);
  assert.equal(s.owner[cells[0]], 1, "ô đầu do người 1 giải trước");
  assert.equal(s.owner[cells[1]], 0);
  assert.ok(s.solved[0][cells[0]] && s.solved[1][cells[0]]);
  assert.ok(!s.over, "người kia còn đang giải");
  assert.deepEqual(s.finished, [0]);
  assert.deepEqual(s.winners, [0]);
  assert.deepEqual(s.wrong, [1, 0]);
  assert.equal(s.right[0], p.empties);
});

test("đối kháng: người thắng xong, người còn lại giải tiếp tới khi mọi người xong", () => {
  const p = makePuzzle(13, "easy");
  const cells = empties(p);
  const all = cells.map((i) => right(p, i));
  const b1 = judge(p, "race", [[], all, all.slice(0, 5)], emptyBoard(3))!;
  const s1 = replay(p, "race", 3, b1.log);
  assert.deepEqual(s1.winners, [1]);
  assert.ok(!s1.over);
  const b2 = judge(p, "race", [all, all, all], b1)!;
  const s2 = replay(p, "race", 3, b2.log);
  assert.deepEqual(s2.finished, [1, 0, 2], "người 0 được xét trước người 2 trong cùng một lượt");
  assert.deepEqual(s2.winners, [1]);
  assert.ok(s2.over);
  // Xong rồi thì nước sau không được tính.
  assert.equal(judge(p, "race", [[...all, wrong(p, cells[0])], all, all], b2), null);
});

test("stamp: ghi giờ xong của từng người một lần, và giờ ván xong", () => {
  const p = makePuzzle(23, "easy");
  const all = empties(p).map((i) => right(p, i));
  const b1 = judge(p, "race", [all, []], emptyBoard(2))!;
  const t1 = stamp(b1, replay(p, "race", 2, b1.log), 1000)!;
  assert.deepEqual(t1.fin, [1000, null]);
  assert.equal(t1.time, undefined);
  assert.equal(stamp(t1, replay(p, "race", 2, t1.log), 1500), null, "không có gì mới thì không đổi");
  const b2 = judge(p, "race", [all, all], t1)!;
  const t2 = stamp(b2, replay(p, "race", 2, b2.log), 2000)!;
  assert.deepEqual(t2.fin, [1000, 2000]);
  assert.equal(t2.time, 2000);
});

test("nước rác bị bỏ qua nhưng vẫn được đánh dấu đã xét", () => {
  const p = makePuzzle(17, "medium");
  const given = p.givens.findIndex(Boolean);
  const board = judge(p, "coop", [[[given, p.solution[given]], [99, 1], "x", [empties(p)[0], 0]]], emptyBoard(1)) as Board;
  assert.deepEqual(board.log, []);
  assert.deepEqual(board.seen, [4]);
});

test("ownBoard: bàn riêng dựng từ nhật ký của mình", () => {
  const p = makePuzzle(19, "easy");
  const [a, b] = empties(p);
  const own = ownBoard(p, [wrong(p, a), right(p, a), right(p, a), right(p, b)]);
  assert.equal(own.cells[a], p.solution[a]);
  assert.equal(own.cells[b], p.solution[b]);
  assert.equal(own.wrong, 1);
});
