import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ABSTRACT,
  deal,
  emptyBoard,
  FINAL_MS,
  GUESS_MAX,
  guessesIn,
  hintNeed,
  hintShown,
  isAnswer,
  isClose,
  judge,
  LEVEL_KEYS,
  LEVELS,
  normOptions,
  openedOf,
  optimistic,
  pairsOf,
  PEEK_MS,
  pickPicture,
  pictureOf,
  PICTURES,
  replay,
  SIZE_KEYS,
  SIZES,
  TILES,
  TURN_MS,
  usedId,
  usedOf,
  type Board,
  type Move,
  type TxRound,
  type TxState,
} from "./truc-xanh.ts";
import { leaks } from "./draw-guess.ts";

const T0 = 1_000_000;
const pic = PICTURES.findIndex((p) => p.w === "Tháp Eiffel");
const R: TxRound = { seed: 42, size: "s", level: "easy", pic, t0: T0 };

function match(players: number, r: TxRound = R) {
  const moves: Move[][] = Array.from({ length: players }, () => []);
  let board: Board = emptyBoard(players);
  let online = new Array<boolean>(players).fill(true);
  const state = () => replay(r, players, board.log);
  const tick = (now: number) => {
    const next = judge(r, moves, board, { now, online: (k) => online[k] }, state());
    if (next) board = next;
    return state();
  };
  return {
    moves,
    state,
    tick,
    setOnline: (list: boolean[]) => (online = list),
    get board() {
      return board;
    },
    flip: (k: number, cell: number) => moves[k].push(["f", cell, state().turn]),
    guess: (k: number, text: string) => moves[k].push(["g", text]),
  };
}

function cells(s: TxState) {
  const a = 0;
  const b = s.tiles.findIndex((t, i) => i !== a && t === s.tiles[a]);
  const c = s.tiles.findIndex((t) => t !== s.tiles[a]);
  return { a, b, c };
}

test("chia bàn: mỗi hình đúng hai ô, đủ số cặp, tất định theo seed", () => {
  for (const size of SIZE_KEYS) {
    const tiles = deal(7, size);
    assert.equal(tiles.length, SIZES[size].w * SIZES[size].h);
    const count = new Map<number, number>();
    for (const t of tiles) count.set(t, (count.get(t) ?? 0) + 1);
    assert.equal(count.size, pairsOf(size));
    assert.ok([...count.values()].every((n) => n === 2));
    assert.ok([...count.keys()].every((t) => t >= 0 && t < TILES.length));
    assert.deepEqual(deal(7, size), tiles);
  }
  assert.notDeepEqual(deal(1, "l"), deal(2, "l"));
  assert.deepEqual(normOptions({ size: "x" }), { size: "m", level: "easy" });
  assert.deepEqual(normOptions({ size: "l", level: "hard" }), { size: "l", level: "hard" });
  assert.equal(normOptions({ level: "x" }).level, "easy");
});

test("bộ tranh: mỗi mức ít nhất 100 tranh, mỗi tranh có từ khoá và ảnh https", () => {
  for (const level of LEVEL_KEYS) {
    const set = LEVELS[level].pictures;
    assert.ok(set.length >= 100, level);
    assert.equal(new Set(set.map((p) => p.w)).size, set.length);
    for (const p of set) {
      assert.ok(p.w.trim());
      assert.match(p.img, /^https:\/\/(upload|thumb)\.wikimedia\.org\/[^?]+$/);
    }
  }
  assert.equal(LEVELS.easy.pictures, PICTURES);
  assert.equal(LEVELS.hard.pictures, ABSTRACT);
  assert.ok(PICTURES.length >= 300);
});

test("bộ Khó: tranh nào cũng có câu gợi ý, câu gợi ý không lộ đáp án", () => {
  for (const p of ABSTRACT) {
    assert.ok(p.hint?.trim(), p.w);
    for (const name of [p.w, ...(p.alt ?? [])]) assert.ok(!leaks(p.hint!, name), `${p.w}: ${p.hint}`);
  }
});

test("bộ tranh: từ khoá nào cũng chấm đúng tranh của nó, không ăn nhầm tranh khác cùng bộ", () => {
  for (const level of LEVEL_KEYS) {
    const set = LEVELS[level].pictures;
    for (const p of set)
      for (const name of [p.w, ...(p.alt ?? [])]) {
        assert.ok(isAnswer(name, p), name);
        for (const q of set) if (q !== p) assert.ok(!isAnswer(name, q), `${name} ≠ ${q.w}`);
      }
  }
});

test("bốc tranh theo mức, tránh tranh đã chơi của mức đó, hết thì bốc lại cả bộ", () => {
  const all = PICTURES.map((_, i) => i);
  const used = all.filter((i) => i !== 5);
  assert.equal(pickPicture(used, "easy", Math.random), 5);
  const any = pickPicture(all, "easy", () => 0.5);
  assert.ok(any >= 0 && any < PICTURES.length);
  // Tranh đã chơi của bộ Dễ không ảnh hưởng bộ Khó và ngược lại.
  const hardUsed = ABSTRACT.map((_, i) => usedId("hard", i)).filter((id) => id !== usedId("hard", 7));
  assert.equal(pickPicture([...hardUsed, 7], "hard", Math.random), 7);
  assert.deepEqual(usedOf([3, usedId("hard", 3), 9], "easy"), [3, 9]);
  assert.deepEqual(usedOf([3, usedId("hard", 3), 9], "hard"), [3]);
});

test("tranh của ván theo mức; ván cũ chưa có mức là bộ Dễ", () => {
  assert.equal(pictureOf({ pic: 0, level: "hard" }), ABSTRACT[0]);
  assert.equal(pictureOf({ pic: 0, level: "easy" }), PICTURES[0]);
  assert.equal(pictureOf({ pic: 0 }), PICTURES[0]);
  const love = ABSTRACT.findIndex((p) => p.w === "Tình yêu");
  const g = match(1, { ...R, level: "hard", pic: love });
  g.guess(0, "yeu");
  assert.equal(g.tick(T0).winner, 0);
});

test("chấm đáp án: không dấu, hoa thường, cách gọi khác; gần đúng chỉ khi sai ít", () => {
  const eiffel = PICTURES[pic];
  assert.ok(isAnswer("thap eiffel", eiffel));
  assert.ok(isAnswer("THÁP EIFFEL", eiffel));
  assert.ok(!isAnswer("eiffel tower", eiffel));
  assert.ok(isClose("thap eifel", eiffel));
  assert.ok(!isClose("tháp pisa", eiffel));
  const hoGuom = PICTURES.find((p) => p.w === "Hồ Gươm")!;
  assert.ok(isAnswer("ho hoan kiem", hoGuom));
  const tre = PICTURES.find((p) => p.w === "Cây tre")!;
  assert.ok(isAnswer("tre", tre));
});

test("lật trúng: cặp biến mất, được lật tiếp; lật trật: ngửa một nhịp rồi sang người sau", () => {
  const g = match(2);
  let s = g.tick(T0);
  const { a, b, c } = cells(s);
  g.flip(0, a);
  g.flip(0, b);
  s = g.tick(T0 + 1000);
  assert.equal(s.owner[a], 0);
  assert.equal(s.owner[b], 0);
  assert.deepEqual(s.pairs, [1, 0]);
  assert.equal(s.current, 0);
  assert.equal(s.since, T0 + 1000);

  // Người không tới lượt lật thì bỏ qua.
  g.moves[1].push(["f", c, s.turn]);
  s = g.tick(T0 + 1100);
  assert.deepEqual(s.open, []);

  const d = s.tiles.findIndex((t, i) => s.owner[i] < 0 && i !== c && t !== s.tiles[c]);
  g.flip(0, c);
  g.flip(0, d);
  s = g.tick(T0 + 2000);
  assert.deepEqual(s.open, [c, d]);
  assert.equal(s.current, 0);
  s = g.tick(T0 + 2000 + PEEK_MS - 1);
  assert.equal(s.current, 0);
  s = g.tick(T0 + 2000 + PEEK_MS);
  assert.deepEqual(s.open, []);
  assert.equal(s.current, 1);
  assert.equal(s.turn, 1);

  // Nước lật gửi cho lượt đã qua thì bỏ.
  g.moves[1].push(["f", c, 0]);
  s = g.tick(T0 + 5000);
  assert.deepEqual(s.open, []);
});

test("hết giờ lượt hoặc vắng mặt thì mất lượt; cả đội hình vắng thì đứng yên", () => {
  const g = match(3);
  let s = g.tick(T0 + TURN_MS - 1);
  assert.equal(s.current, 0);
  s = g.tick(T0 + TURN_MS);
  assert.equal(s.current, 1);
  assert.equal(g.board.log.at(-1)![1], 1);
  g.setOnline([true, false, true]);
  s = g.tick(T0 + TURN_MS + 10);
  assert.equal(s.current, 2);
  assert.equal(g.board.log.at(-1)![1], 2);
  g.setOnline([false, false, false]);
  s = g.tick(T0 + TURN_MS + 20);
  assert.equal(s.current, 2);
  assert.equal(g.tick(T0 + TURN_MS + 30).turn, s.turn);
});

test("đoán bất cứ lúc nào: trật không bị phạt, đúng là thắng ngay", () => {
  const g = match(3);
  g.tick(T0);
  g.guess(2, "tháp pisa");
  let s = g.tick(T0 + 10);
  assert.equal(s.guesses.length, 1);
  assert.equal(s.guesses[0].right, false);
  assert.equal(s.over, false);
  assert.equal(s.current, 0);
  g.guess(1, "thap eifel");
  s = g.tick(T0 + 20);
  assert.equal(s.guesses[1].near, true);
  g.guess(1, "Tháp Eiffel");
  g.guess(2, "thap eiffel");
  s = g.tick(T0 + 30);
  assert.equal(s.over, true);
  assert.equal(s.winner, 1);
  // Hết ván thì không ghi thêm gì.
  assert.equal(s.guesses.length, 3);
  assert.equal(g.tick(T0 + TURN_MS * 5).count, s.count);
});

test("chưa mở bàn thì chưa xét nước nào", () => {
  const g = match(1);
  g.guess(0, "thap eiffel");
  assert.equal(g.tick(T0 - 1).over, false);
  assert.equal(g.tick(T0).over, true);
});

test("mỗi người đoán tối đa GUESS_MAX lần", () => {
  const g = match(2);
  for (let i = 0; i < GUESS_MAX + 3; i++) g.guess(0, `sai ${i}`);
  g.guess(0, "thap eiffel");
  const s = g.tick(T0);
  assert.equal(s.tries[0], GUESS_MAX);
  assert.equal(s.over, false);
  assert.equal(guessesIn(g.moves[0]).length, GUESS_MAX + 4);
});

test("câu gợi ý mở khi lật được nửa bàn, hoặc khi đã có người đoán trúng", () => {
  const g = match(1);
  let s = g.tick(T0);
  let now = T0;
  assert.equal(hintNeed(s), 6);
  // Bàn nhỏ 12 ô: lật được 2 cặp (4 ô) chưa mở, cặp thứ 3 (6 ô) thì mở.
  for (let pair = 1; pair <= 3; pair++) {
    assert.equal(hintShown(s), false);
    const a = s.owner.findIndex((o) => o < 0);
    const b = s.tiles.findIndex((t, i) => i !== a && s.owner[i] < 0 && t === s.tiles[a]);
    g.flip(0, a);
    g.flip(0, b);
    s = g.tick((now += 100));
    assert.equal(openedOf(s), pair * 2);
  }
  assert.equal(hintShown(s), true);
  // Ván xong sớm (đoán trúng ngay) thì cũng hiện.
  const h = match(1);
  h.guess(0, "Tháp Eiffel");
  assert.equal(hintShown(h.tick(T0)), true);
  assert.equal(hintShown(match(1).tick(T0)), false);
});

test("lật hết bàn: còn FINAL_MS để đoán, hết giờ thì không ai thắng", () => {
  const g = match(1);
  let s = g.tick(T0);
  let now = T0;
  while (s.left > 0) {
    const a = s.owner.findIndex((o) => o < 0);
    const b = s.tiles.findIndex((t, i) => i !== a && s.owner[i] < 0 && t === s.tiles[a]);
    g.flip(0, a);
    g.flip(0, b);
    s = g.tick((now += 100));
  }
  assert.equal(s.cleared, now);
  assert.equal(s.pairs[0], pairsOf("s"));
  s = g.tick(now + FINAL_MS - 1);
  assert.equal(s.over, false);
  // Lật hết bàn thì không còn hết giờ lượt.
  assert.equal(s.turn, 0);
  s = g.tick(now + FINAL_MS);
  assert.equal(s.over, true);
  assert.equal(s.winner, -1);
});

test("dựng tiếp từ trạng thái cũ ra như dựng lại từ đầu", () => {
  const g = match(2);
  let s = g.tick(T0);
  const { a, b, c } = cells(s);
  g.flip(0, a);
  g.flip(0, b);
  g.guess(1, "sai");
  const half = g.tick(T0 + 10);
  g.flip(0, c);
  g.tick(T0 + 20);
  s = g.tick(T0 + TURN_MS + 100);
  const log = g.board.log;
  const fromHalf = replay(R, 2, log, half);
  assert.deepEqual(fromHalf, replay(R, 2, log));
  assert.deepEqual(fromHalf, s);
});

test("ô mình vừa lật hiện ngửa ngay, trước khi chủ phòng ghi nhận", () => {
  const g = match(2);
  const s = g.tick(T0);
  const { a, b } = cells(s);
  assert.deepEqual(optimistic(s, 0, [["f", a, 0]]), [a]);
  assert.deepEqual(optimistic(s, 0, [["f", a, 0], ["f", a, 0], ["f", b, 0], ["f", 5, 0]]), [a, b]);
  assert.deepEqual(optimistic(s, 1, [["f", a, 0]]), []);
  assert.deepEqual(optimistic(s, 0, [["f", a, 3], ["g", "x"]]), []);
});
