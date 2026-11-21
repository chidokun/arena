import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clueText,
  countSolutions,
  emptyBoard,
  isBlock,
  judge,
  LEVEL_KEYS,
  makePuzzle,
  normOptions,
  replay,
  SIZE,
  stamp,
  type Move,
} from "./grid-detective.ts";

test("đề sinh tất định theo seed", () => {
  assert.deepEqual(makePuzzle(42, "medium", "murder"), makePuzzle(42, "medium", "murder"));
  assert.notDeepEqual(makePuzzle(42, "medium", "murder").solution, makePuzzle(43, "medium", "murder").solution);
});

test("đề nào cũng đúng luật và chỉ có một lời giải", () => {
  for (const level of LEVEL_KEYS) {
    for (let seed = 1; seed <= 12; seed++) {
      const p = makePuzzle(seed * 101, level, seed % 2 ? "murder" : "snack");
      const n = SIZE[level];
      assert.equal(p.n, n);
      assert.equal(p.tokens.length, n);
      assert.equal(new Set(p.solution.map((c) => Math.floor(c / n))).size, n, "mỗi hàng một quân");
      assert.equal(new Set(p.solution.map((c) => c % n)).size, n, "mỗi cột một quân");
      assert.ok(p.solution.every((c) => !isBlock(p.objs[c])), "không ai đứng trên vật cản");
      const others = p.solution.filter((c, t) => t > 0 && p.room[c] === p.room[p.solution[0]]);
      assert.equal(others.length, 1, "phòng nạn nhân có đúng một người khác");
      assert.equal(p.room[p.solution[p.culprit]], p.room[p.solution[0]]);
      assert.ok(p.culprit > 0);
      assert.equal(countSolutions(p, p.clues, 3), 1, `${level} seed ${seed}: phải duy nhất lời giải`);
      assert.ok(p.grade >= 1 && p.grade <= 3, "giải được bằng suy luận");
      for (let t = 0; t < n; t++) assert.ok(p.clues.some((c) => c.t === t), "ai cũng có lời khai");
      for (const c of p.clues) assert.ok(clueText(p, c).length > 5);
    }
  }
});

test("độ khó đúng mức với đa số đề", () => {
  const target = { easy: 1, medium: 2, hard: 3 } as const;
  for (const level of LEVEL_KEYS) {
    let hit = 0;
    for (let seed = 1; seed <= 10; seed++) if (makePuzzle(seed * 977, level, "murder").grade === target[level]) hit++;
    assert.ok(hit >= 8, `${level}: chỉ ${hit}/10 đề đúng mức`);
  }
});

test("chuẩn hoá tuỳ chọn", () => {
  assert.deepEqual(normOptions({ level: "hard", mode: "coop", theme: "snack" }), { level: "hard", mode: "coop", theme: "snack" });
  assert.deepEqual(normOptions({ level: "x", mode: 1 }), { level: "easy", mode: "race", theme: "murder" });
});

const P = makePuzzle(7, "easy", "murder");
// Ô của quân khác (không phải nạn nhân, vì nạn nhân được đặt trước trong test), tức là ô sai với quân `t`.
const wrongCell = (t: number) => P.solution.find((_, u) => u !== t && u !== 0)!;

test("cùng phá án: đặt đúng +1, sai −1, buộc tội một lần ±2, đặt đủ là hết ván", () => {
  const innocent = P.tokens.findIndex((_, t) => t > 0 && t !== P.culprit);
  const a: Move[] = [["p", 0, P.solution[0]], ["a", innocent], ["a", P.culprit]];
  const b: Move[] = [["p", 1, wrongCell(1)], ["p", 0, P.solution[0]], ["a", P.culprit]];
  const board = judge(P, "coop", [a, b], emptyBoard(2))!;
  let s = replay(P, "coop", 2, board.log);
  // A: +1 (đặt), −2 (buộc tội sai), lượt buộc tội thứ hai bị bỏ. B: −1 (sai), đặt trùng bị bỏ, +2 buộc tội đúng.
  assert.deepEqual(s.score, [-1, 1]);
  assert.equal(s.accuser, 1);
  assert.equal(s.owner[0], 0);
  assert.equal(s.over, false);
  const rest: Move[] = P.solution.slice(1).map((c, i) => ["p", i + 1, c]);
  const end = judge(P, "coop", [[...a, ...rest], b], board)!;
  s = replay(P, "coop", 2, end.log);
  assert.equal(s.over, true);
  assert.deepEqual(s.winners, [0]);
  assert.equal(s.score[0], -1 + rest.length);
});

test("đối kháng: nộp sai bị tính, nộp đúng về đích, hết người là hết ván", () => {
  const bad = P.solution.slice().reverse();
  const board = judge(P, "race", [[["s", bad], ["s", P.solution]], [["s", P.solution]]], emptyBoard(2))!;
  const s = replay(P, "race", 2, board.log);
  assert.deepEqual(s.wrong, [1, 0]);
  assert.deepEqual(s.finished, [0, 1]);
  assert.deepEqual(s.winners, [0]);
  assert.equal(s.over, true);
  const stamped = stamp(board, s, 5000)!;
  assert.deepEqual(stamped.fin, [5000, 5000]);
  assert.equal(stamped.time, 5000);
});

test("nước đi sai cấu trúc bị bỏ qua", () => {
  const junk = [["p", 99, 0], ["a", 0], ["s", [1, 2]], "x", null, ["p", 0, -1]];
  const board = judge(P, "coop", [junk], emptyBoard(1))!;
  assert.deepEqual(board.log, []);
  assert.deepEqual(board.seen, [junk.length]);
});
