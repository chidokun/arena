import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COPIES,
  deal,
  emptyBoard,
  findMove,
  findPath,
  HINT_COST,
  judge,
  kindsOf,
  newGame,
  normOptions,
  optimistic,
  PAIR_POINTS,
  replay,
  SIZE_KEYS,
  SIZES,
  TILES,
  type Board,
  type KwState,
  type Move,
} from "./kawaii.ts";

const E = -1;
/** Bàn 4×3 vẽ tay: chữ cái là loại hình, "." là ô trống. */
function grid(rows: string[]) {
  const tiles = rows.flatMap((r) => [...r].map((ch) => (ch === "." ? E : ch.charCodeAt(0) - 65)));
  return { tiles, w: rows[0].length, h: rows.length };
}
const turns = (path: [number, number][]) => path.length - 2;

/** Nối hết bàn bằng nước gợi ý đầu tiên, luân phiên giữa các người chơi. */
function playOut(seed: number, players: number) {
  const r = { seed, size: "s" as const };
  const moves: Move[][] = Array.from({ length: players }, () => []);
  let board: Board = emptyBoard(players);
  let s: KwState = replay(r, players, board.log);
  for (let turn = 0; !s.over && turn < 200; turn++) {
    const mv = findMove(s.tiles, s.w, s.h)!;
    moves[turn % players].push([mv[0], mv[1], s.shuffles]);
    board = judge(r, moves, board, s) ?? board;
    s = replay(r, players, board.log, s);
  }
  return { s, board };
}

test("mỗi cỡ bàn chia đều 4 ô mỗi loại, đủ hình để vẽ", () => {
  for (const k of SIZE_KEYS) {
    const { w, h } = SIZES[k];
    assert.equal((w * h) % COPIES, 0, k);
    assert.ok(kindsOf(k) <= TILES.length, k);
    const tiles = deal(7, k);
    assert.equal(tiles.length, w * h);
    for (let kind = 0; kind < kindsOf(k); kind++) assert.equal(tiles.filter((t) => t === kind).length, COPIES);
  }
  assert.equal(new Set(TILES).size, TILES.length);
});

test("cùng seed ra cùng bàn, khác seed ra bàn khác", () => {
  assert.deepEqual(deal(42, "m"), deal(42, "m"));
  assert.notDeepEqual(deal(42, "m"), deal(43, "m"));
});

test("normOptions bỏ giá trị lạ", () => {
  assert.deepEqual(normOptions({ size: "l" }), { size: "l" });
  assert.deepEqual(normOptions({ size: "xl" }), { size: "m" });
  assert.deepEqual(normOptions(undefined), { size: "m" });
});

test("nối thẳng, gấp 1 lần, gấp 2 lần", () => {
  const line = grid(["A.A"]);
  assert.equal(turns(findPath(line.tiles, line.w, line.h, 0, 2)!), 0, "thẳng hàng qua ô trống");
  const l = grid(["B..", "..B"]);
  assert.equal(turns(findPath(l.tiles, l.w, l.h, 0, 5)!), 1, "chữ L");
  // Đường thẳng và chữ L đều bị chặn (kể cả vòng viền) — phải đi chữ Z qua cột giữa.
  const z = grid(["C.X", "X.X", "X.C"]);
  const p = findPath(z.tiles, z.w, z.h, 0, 8)!;
  assert.equal(turns(p), 2, "chữ Z");
  assert.deepEqual(p, [
    [0, 0],
    [1, 0],
    [1, 2],
    [2, 2],
  ]);
});

test("được đi vòng ra ngoài viền bàn", () => {
  // Hai A ở hàng trên bị chặn giữa bởi B — đi vòng lên trên viền (chữ U).
  const { tiles, w, h } = grid(["ABA", "CCC"]);
  const p = findPath(tiles, w, h, 0, 2)!;
  assert.ok(p, "nối được qua viền");
  assert.equal(turns(p), 2);
  assert.ok(p.some(([, y]) => y === -1), "đường đi trên vành ngoài");
});

test("không nối khi phải gấp quá 2 lần, khác hình, hoặc cùng một ô", () => {
  // A ở giữa bị vây kín — không đường nào ra.
  const { tiles, w, h } = grid(["BBBBB", "BABAB", "BBBBB"]);
  assert.equal(findPath(tiles, w, h, 6, 8), null);
  assert.equal(findPath(tiles, w, h, 0, 6), null, "khác hình");
  assert.equal(findPath(tiles, w, h, 0, 0), null, "cùng một ô");
  // Đường duy nhất là bậc thang phải gấp 3 lần.
  const g = grid(["CCCCC", "CA.CC", "CC..C", "CCCAC", "CCCCC"]);
  assert.equal(findPath(g.tiles, g.w, g.h, 6, 18), null);
});

test("bàn đầu luôn có nước nối; chơi hết bàn thì hết ván, ai nhiều điểm nhất thắng", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { s } = playOut(seed * 977, 3);
    assert.ok(s.over, `seed ${seed}: chưa hết ván`);
    assert.equal(s.stuck, false);
    assert.equal(s.left, 0);
    assert.ok(s.tiles.every((t) => t === E));
    assert.equal(
      s.pairs.reduce((a, b) => a + b, 0),
      (SIZES.s.w * SIZES.s.h) / 2,
    );
    const top = Math.max(...s.score);
    assert.deepEqual(
      s.winners,
      s.score.flatMap((v, i) => (v === top ? [i] : [])),
    );
  }
});

test("một người chơi vẫn chơi hết bàn và thắng", () => {
  const { s } = playOut(5, 1);
  assert.ok(s.over);
  assert.deepEqual(s.winners, [0]);
  assert.equal(s.score[0], (PAIR_POINTS * SIZES.s.w * SIZES.s.h) / 2);
});

test("ai gửi trước được cặp; cặp đã mất không tính, không trừ điểm", () => {
  const r = { seed: 11, size: "s" as const };
  const s0 = newGame(r, 2);
  const [a, b] = findMove(s0.tiles, s0.w, s0.h)!;
  const board = judge(r, [[[a, b, 0]], [[a, b, 0]]], emptyBoard(2))!;
  const s = replay(r, 2, board.log);
  assert.equal(board.log.length, 1);
  assert.deepEqual(board.log[0], [a, b, 0]);
  assert.deepEqual(s.score, [PAIR_POINTS, 0]);
  assert.deepEqual(board.seen, [1, 1]);
  assert.equal(s.taken[0].k, 0);
  assert.equal(s.taken[0].kind, s0.tiles[a]);
});

test("gợi ý bị trừ điểm; nước sai dạng, sai hình bị bỏ qua", () => {
  const r = { seed: 3, size: "s" as const };
  const s0 = newGame(r, 1);
  const other = s0.tiles.findIndex((t) => t !== s0.tiles[0]);
  const board = judge(r, [[[-1], [0, other, 0], ["x"], [0, 0, 0]]], emptyBoard(1))!;
  const s = replay(r, 1, board.log);
  assert.deepEqual(board.log, [[-1, -1, 0]]);
  assert.deepEqual(s.score, [-HINT_COST]);
  assert.deepEqual(s.hints, [1]);
  assert.deepEqual(board.seen, [4]);
});

test("nước gửi lên bàn trước lần xáo thì không tính", () => {
  const r = { seed: 3, size: "s" as const };
  const s0 = newGame(r, 1);
  const [a, b] = findMove(s0.tiles, s0.w, s0.h)!;
  assert.equal(judge(r, [[[a, b, s0.shuffles + 1]]], emptyBoard(1))!.log.length, 0);
});

test("bế tắc thì bàn tự xáo lại cho tới khi có nước nối, tất định", () => {
  // Tìm một ván có lúc bị xáo khi chơi hết bàn.
  let found = false;
  for (let seed = 1; seed <= 60 && !found; seed++) {
    const a = playOut(seed, 2);
    if (!a.s.shuffles) continue;
    found = true;
    const b = replay({ seed, size: "s" }, 2, a.board.log);
    assert.deepEqual(b.tiles, a.s.tiles);
    assert.equal(b.shuffles, a.s.shuffles);
    assert.ok(b.over);
  }
  assert.ok(found, "không ván nào phải xáo — thử thêm seed");
});

test("dựng tiếp từ trạng thái cũ ra cùng kết quả như dựng lại từ đầu", () => {
  const { board } = playOut(21, 2);
  const half = replay({ seed: 21, size: "s" }, 2, board.log.slice(0, 10));
  const cont = replay({ seed: 21, size: "s" }, 2, board.log, half);
  const full = replay({ seed: 21, size: "s" }, 2, board.log);
  assert.deepEqual(cont, full);
  assert.equal(half.count, 10, "trạng thái cũ không bị sửa");
});

test("bàn tạm áp các cặp mình vừa nối chưa được ghi nhận", () => {
  const r = { seed: 8, size: "s" as const };
  const s = newGame(r, 1);
  const [a, b] = findMove(s.tiles, s.w, s.h)!;
  const o = optimistic(s, [[a, b, s.shuffles], [a, b, s.shuffles], [-1]]);
  assert.deepEqual(o.pairs, [[a, b]]);
  assert.equal(o.tiles[a], E);
  assert.equal(s.tiles[a] >= 0, true, "không sửa bàn chung");
});
