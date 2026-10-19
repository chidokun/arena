import assert from "node:assert/strict";
import { test } from "node:test";
import { adjacent, BL, BR, CENTER, emptyState, legalMoves, LINES, normOptions, POINTS, replay, SETUPS, TL, TR, type Setup } from "./co-cho.ts";

test("bàn năm điểm, bảy đường — cạnh trái có chó nên không đi được", () => {
  assert.equal(LINES.length, 7);
  assert.equal(adjacent(TL, BL), false);
  assert.equal(adjacent(BL, TL), false);
  assert.ok(adjacent(TL, TR) && adjacent(BL, BR) && adjacent(TR, BR));
  for (const i of [TL, TR, BL, BR]) assert.ok(adjacent(i, CENTER));
});

test("khai cuộc: tâm trống, mỗi bên hai quân theo cách xếp", () => {
  const side = emptyState("side");
  assert.deepEqual(side.board, [1, 2, 1, 2, 0]);
  assert.equal(side.empty, CENTER);
  assert.equal(side.turn, 1);
  assert.deepEqual(side.legal, [TL, BL]);
  const cross = emptyState("cross");
  assert.deepEqual(cross.board, [1, 2, 2, 1, 0]);
  assert.deepEqual(cross.legal, [TL, BR]);
});

test("đi quân sang điểm trống rồi đổi lượt", () => {
  const s = replay("side", [TL]);
  assert.deepEqual(s.board, [0, 2, 1, 2, 1]);
  assert.equal(s.empty, TL);
  assert.deepEqual(s.last, { from: TL, to: CENTER });
  assert.equal(s.turn, 2);
  // Điểm trống ở góc trên trái: chỉ quân ở góc trên phải (và tâm) kề nó.
  assert.deepEqual(s.legal, [TR]);
});

test("nước không hợp lệ thì dừng tại đó", () => {
  // Quân đối thủ, quân không kề điểm trống, ngoài bàn.
  assert.equal(replay("side", [TR]).count, 0);
  assert.equal(replay("side", [TL, BL]).count, 1);
  assert.equal(replay("side", [TL, 9]).count, 1);
  assert.equal(replay("side", [TL, -1]).count, 1);
});

test("hết đường đi thì thua", () => {
  // Thế cạnh: Đỏ dồn hai quân xuống dưới, Xanh chiếm góc trên phải và tâm — góc trống trên trái chỉ kề quân Xanh.
  const s = replay("side", [TL, TR, CENTER, BR, TR, TL]);
  assert.deepEqual(s.board, [0, 2, 1, 1, 2]);
  assert.deepEqual(s.legal, []);
  assert.equal(s.over, true);
  assert.equal(s.winner, 2);
  // Thế chéo: thua ngay nước thứ ba.
  const x = replay("cross", [BR, TR, TL]);
  assert.equal(x.over, true);
  assert.equal(x.winner, 1);
  // Ván xong rồi thì không đi thêm được.
  assert.equal(replay("cross", [BR, TR, TL, BL]).count, 3);
});

test("thế cờ lặp lại lần thứ ba thì hoà", () => {
  // Ba quân xoay vòng quanh tam giác trên (góc trái – góc phải – tâm): thế ban đầu lặp lại sau mỗi sáu nước.
  const loop = [TL, TR, CENTER, TL, TR, CENTER];
  const s1 = replay("side", loop);
  assert.equal(s1.seen, 2);
  assert.equal(s1.over, false);
  const s2 = replay("side", [...loop, ...loop]);
  assert.equal(s2.seen, 3);
  assert.equal(s2.over, true);
  assert.equal(s2.draw, true);
  assert.equal(s2.winner, 0);
});

function solve() {
  const states: { board: number[]; turn: 1 | 2 }[] = [];
  for (let e = 0; e < POINTS; e++)
    for (let a = 0; a < POINTS; a++)
      for (let b = a + 1; b < POINTS; b++) {
        if (a === e || b === e) continue;
        const board = Array.from({ length: POINTS }, (_, i) => (i === e ? 0 : i === a || i === b ? 1 : 2));
        states.push({ board, turn: 1 }, { board, turn: 2 });
      }
  const k = (board: number[], turn: number) => board.join("") + turn;
  const next = (board: number[], turn: 1 | 2) =>
    legalMoves(board, turn).map((from) => {
      const nb = [...board];
      nb[nb.indexOf(0)] = turn;
      nb[from] = 0;
      return k(nb, turn === 1 ? 2 : 1);
    });
  const val = new Map<string, "W" | "L">();
  for (let changed = true; changed; ) {
    changed = false;
    for (const { board, turn } of states) {
      const id = k(board, turn);
      if (val.has(id)) continue;
      const ns = next(board, turn);
      const v = ns.some((n) => val.get(n) === "L") ? "W" : ns.every((n) => val.get(n) === "W") ? "L" : undefined;
      if (v) {
        val.set(id, v);
        changed = true;
      }
    }
  }
  return (setup: Setup) => {
    const s = emptyState(setup);
    return val.get(k(s.board, 1)) ?? "D";
  };
}

test("cả hai cách xếp quân đều cân bằng: đi đúng thì không ai ép thắng được", () => {
  const value = solve();
  for (const setup of SETUPS) assert.equal(value(setup), "D", setup);
});

test("tuỳ chọn lạ quay về mặc định", () => {
  assert.deepEqual(normOptions({ setup: "cross" }), { setup: "cross" });
  assert.deepEqual(normOptions({ setup: "zigzag" }), { setup: "side" });
  assert.deepEqual(normOptions(undefined), { setup: "side" });
});
