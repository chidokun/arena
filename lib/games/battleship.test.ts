import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerShot,
  commitOf,
  coord,
  CLASSIC,
  flippable,
  FLEET,
  fleetGrid,
  honest,
  kindsOf,
  normOptions,
  orients,
  parseFleet,
  parseKinds,
  randomFleet,
  randomKinds,
  replay,
  shapeOf,
  shipCells,
  shotsAt,
  SIZE,
  type Fleet,
  type Shot,
} from "./battleship.ts";

const at = (x: number, y: number) => y * SIZE + x;

const ROWS: Fleet = [0, 2, 4, 6, 8].map((y, k) => ({ k, at: at(0, y), o: 0 }));
const ROWS_CELLS = ROWS.reduce((n, s) => n + shipCells(s)!.length, 0);

function play(fleets: [Fleet, Fleet], targets: [number[], number[]], chain: boolean) {
  const log: Shot[] = [];
  const next = [0, 0];
  const kinds = [kindsOf(fleets[0]), kindsOf(fleets[1])] as [number[], number[]];
  for (let guard = 0; guard < 400; guard++) {
    const s = replay(log, { chain }, [], kinds);
    if (s.winner >= 0) return s;
    const foe = 1 - s.turn;
    const c = targets[s.turn][next[s.turn]++];
    if (c === undefined) return s;
    log.push(answerShot(fleets[foe], shotsAt(s, foe as 0 | 1).map((x) => x.c), c));
  }
  throw new Error("không kết thúc");
}

const sorted = (cells: number[] | null) => cells && [...cells].sort((a, b) => a - b);

test("ô của tàu, tràn mép thì sai", () => {
  assert.deepEqual(shipCells({ k: 0, at: at(5, 0), o: 0 }), [5, 6, 7, 8, 9]);
  assert.equal(shipCells({ k: 0, at: at(6, 0), o: 0 }), null);
  assert.deepEqual(shipCells({ k: 4, at: at(9, 8), o: 1 }), [at(9, 8), at(9, 9)]);
  assert.equal(shipCells({ k: 4, at: at(9, 9), o: 1 }), null);
  assert.equal(shipCells({ k: 11, at: 0, o: 0 }), null);
  assert.equal(shipCells({ k: 0, at: 0, o: 8 }), null);
});

test("tàu hình đặc biệt: xoay, lật, tràn mép", () => {
  // Pháo đài nổi (dấu cộng) xoay kiểu nào cũng vậy.
  assert.deepEqual(orients(5), [0]);
  assert.deepEqual(sorted(shipCells({ k: 5, at: at(0, 0), o: 0 })), [1, 10, 11, 12, 21]);
  assert.equal(shipCells({ k: 5, at: at(8, 0), o: 0 }), null);
  // Chữ L: 4 hướng × lật = 8 hình khác nhau; xoay 90° chiều kim đồng hồ.
  assert.equal(orients(6).length, 8);
  assert.deepEqual(sorted(shipCells({ k: 6, at: at(0, 0), o: 0 })), [at(0, 0), at(1, 2), at(0, 1), at(0, 2)].sort((a, b) => a - b));
  assert.deepEqual(sorted(shipCells({ k: 6, at: at(0, 0), o: 1 })), [at(0, 0), at(1, 0), at(2, 0), at(0, 1)]);
  assert.deepEqual(sorted(shipCells({ k: 6, at: at(0, 0), o: 4 })), [at(1, 0), at(1, 1), at(0, 2), at(1, 2)]);
  // Tàu tàng hình nằm chéo: hai hướng.
  assert.deepEqual(orients(7).length, 2);
  assert.deepEqual(sorted(shipCells({ k: 7, at: at(0, 0), o: 1 })), [at(2, 0), at(1, 1), at(0, 2)]);
  assert.equal(orients(8).length, 4);
  assert.equal(orients(9).length, 4);
  assert.equal(orients(10).length, 2);
  assert.deepEqual(sorted(shipCells({ k: 10, at: at(0, 0), o: 0 })), [at(0, 0), at(2, 0), at(0, 1), at(2, 1)]);
  assert.deepEqual(
    FLEET.map((_, k) => flippable(k)),
    [false, false, false, false, false, false, true, false, false, true, false],
  );
  // Xoay giữ thứ tự ô như hình gốc.
  assert.deepEqual(shapeOf(0, 2)!.cells, [[4, 0], [3, 0], [2, 0], [1, 0], [0, 0]]);
});

test("hạm đội: 1–5 loại tàu khác nhau, không chồng nhau", () => {
  assert.ok(fleetGrid(ROWS));
  assert.ok(fleetGrid(ROWS.slice(0, 4)));
  assert.ok(fleetGrid([{ k: 7, at: 0, o: 0 }]));
  assert.equal(fleetGrid([]), null);
  assert.equal(fleetGrid([...ROWS, { k: 5, at: at(5, 5), o: 0 }]), null);
  assert.equal(fleetGrid([ROWS[0], { ...ROWS[1], k: 0 }]), null);
  assert.equal(fleetGrid([...ROWS.slice(0, 4), { k: 4, at: at(1, 0), o: 1 }]), null);
  assert.equal(parseFleet([...ROWS.slice(0, 4), { k: 4, at: "3", o: 0 }]), null);
  assert.deepEqual(parseFleet(ROWS), ROWS);
  // Hai thân chừa cột giữa: tàu khác nằm lọt vào đó vẫn được.
  assert.ok(fleetGrid([{ k: 10, at: 0, o: 0 }, { k: 4, at: 1, o: 1 }]));
});

test("loại tàu công bố", () => {
  assert.deepEqual(parseKinds([9, 0, 5]), [0, 5, 9]);
  assert.equal(parseKinds([]), null);
  assert.equal(parseKinds([0, 1, 2, 3, 4, 5]), null);
  assert.equal(parseKinds([1, 1]), null);
  assert.equal(parseKinds([11]), null);
  assert.equal(parseKinds("0,1"), null);
  assert.deepEqual(kindsOf([{ k: 9, at: 0, o: 0 }, { k: 2, at: 50, o: 0 }]), [2, 9]);
  for (let i = 0; i < 100; i++) assert.ok(parseKinds(randomKinds()));
});

test("bày ngẫu nhiên luôn hợp lệ và các tàu không chạm nhau", () => {
  for (let i = 0; i < 200; i++) {
    const fleet = i % 2 ? randomFleet() : randomFleet(i % 4 ? [5, 6, 8, 9, 10] : randomKinds());
    const grid = fleetGrid(fleet);
    assert.ok(grid);
    if (i % 2) assert.deepEqual(kindsOf(fleet), [...CLASSIC]);
    for (let c = 0; c < SIZE * SIZE; c++) {
      if (grid[c] < 0) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = (c % SIZE) + dx;
          const y = Math.floor(c / SIZE) + dy;
          if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
          const o = grid[at(x, y)];
          assert.ok(o < 0 || o === grid[c], "hai tàu chạm nhau");
        }
    }
  }
});

test("trả lời trúng / trượt / chìm kèm vị trí tàu", () => {
  const ship = ROWS[4];
  assert.deepEqual(answerShot(ROWS, [], at(5, 5)), { c: at(5, 5), r: 0 });
  assert.deepEqual(answerShot(ROWS, [], at(0, 8)), { c: at(0, 8), r: 1 });
  assert.deepEqual(answerShot(ROWS, [at(0, 8)], at(1, 8)), { c: at(1, 8), r: 2, k: 4, at: ship.at, o: 0 });
  // Tàu tàng hình: trúng ô giữa, bốn ô kề cạnh đều trượt.
  const odd: Fleet = [{ k: 7, at: at(3, 3), o: 0 }];
  assert.equal(answerShot(odd, [], at(4, 4)).r, 1);
  for (const c of [at(4, 3), at(4, 5), at(3, 4), at(5, 4)]) assert.equal(answerShot(odd, [at(4, 4)], c).r, 0);
  assert.deepEqual(answerShot(odd, [at(3, 3), at(4, 4)], at(5, 5)), { c: at(5, 5), r: 2, k: 7, at: at(3, 3), o: 0 });
});

test("trúng được bắn tiếp, trượt thì đổi lượt", () => {
  const log: Shot[] = [{ c: at(0, 0), r: 1 }];
  assert.equal(replay(log, { chain: true }).turn, 0);
  assert.equal(replay(log, { chain: false }).turn, 1);
  log.push({ c: at(9, 9), r: 0 });
  assert.equal(replay(log, { chain: true }).turn, 1);
});

test("phát chờ trả lời chỉ được ở cuối nhật ký", () => {
  const s = replay([{ c: 3, r: 0 }, { c: 7 }], { chain: true });
  assert.equal(s.pending, 7);
  assert.equal(s.turn, 1);
  assert.equal(replay([{ c: 3 }, { c: 7, r: 0 }], { chain: true }).shots.length, 0);
});

test("bắn ô đã bắn hoặc ngoài hải đồ thì dừng", () => {
  const opts = { chain: true };
  assert.equal(replay([{ c: 3, r: 1 }, { c: 3, r: 1 }], opts).shots.length, 1);
  assert.equal(replay([{ c: 100, r: 0 }], opts).shots.length, 0);
  assert.equal(replay([{ c: 1.5, r: 0 }], opts).shots.length, 0);
  // Đổi lượt rồi thì bắn lại ô đó trên hải đồ bên kia vẫn được.
  assert.equal(replay([{ c: 3, r: 0 }, { c: 3, r: 0 }], opts).shots.length, 2);
});

test("khai chìm sai thì dừng", () => {
  const opts = { chain: true };
  // Khu trục hạm (2 ô) mới trúng một ô mà đã khai chìm.
  assert.equal(replay([{ c: at(0, 8), r: 2, k: 4, at: at(0, 8), o: 0 }], opts).shots.length, 0);
  // Ô vừa bắn không thuộc tàu khai chìm.
  assert.equal(replay([{ c: at(0, 8), r: 1 }, { c: at(5, 5), r: 2, k: 4, at: at(0, 8), o: 1 }], opts).shots.length, 1);
  // Khai chìm cùng một tàu hai lần.
  const twice: Shot[] = [
    { c: at(0, 8), r: 1 },
    { c: at(1, 8), r: 2, k: 4, at: at(0, 8), o: 0 },
    { c: at(0, 9), r: 1 },
    { c: at(1, 9), r: 2, k: 4, at: at(0, 9), o: 0 },
  ];
  assert.equal(replay(twice, opts).shots.length, 3);
  // Khai chìm loại tàu bên bị bắn không chọn.
  const sunk: Shot[] = [{ c: at(0, 8), r: 1 }, { c: at(1, 8), r: 2, k: 4, at: at(0, 8), o: 0 }];
  assert.equal(replay(sunk, opts, [], [CLASSIC, CLASSIC]).shots.length, 2);
  assert.equal(replay(sunk, opts, [], [CLASSIC, [0, 5]]).shots.length, 1);
});

test("bắn chìm hết hạm đội thì thắng, nhật ký sau đó bị bỏ qua", () => {
  const all = ROWS.flatMap((s) => shipCells(s)!);
  const s = play([randomFleet(), ROWS], [all, []], true);
  assert.equal(s.winner, 0);
  assert.equal(s.sunk[1].length, ROWS.length);
  assert.equal(s.shots.length, ROWS_CELLS);
  assert.deepEqual(
    s.sunk[1].map((x) => x.k).sort(),
    [...CLASSIC],
  );
});

test("hai bên chọn hạm đội khác nhau: chìm đủ số tàu bên kia đã chọn thì thắng", () => {
  const small: Fleet = [{ k: 7, at: at(3, 3), o: 1 }];
  const big: Fleet = [
    { k: 5, at: at(0, 0), o: 0 },
    { k: 6, at: at(5, 0), o: 4 },
    { k: 10, at: at(0, 5), o: 0 },
  ];
  const sea = Array.from({ length: SIZE * SIZE }, (_, c) => c);
  // Bên 0 bắn lần lượt cả hải đồ, bên 1 chỉ cần 3 ô chéo.
  const s = play([big, small], [sea, sea], false);
  assert.equal(s.winner, 0);
  assert.equal(s.sunk[1].length, 1);
  assert.deepEqual(s.sunk[1][0], small[0]);
  const t = play([big, small], [[99, 98, 97, 96], big.flatMap((x) => shipCells(x)!)], true);
  assert.equal(t.winner, 1);
  assert.deepEqual(
    t.sunk[0].map((x) => x.k),
    [5, 6, 10],
  );
  assert.ok(honest(big, shotsAt(t, 0)));
});

test("không bắn tiếp: hai bên thay phiên tới khi một bên chìm hết", () => {
  const seaA = Array.from({ length: SIZE * SIZE }, (_, c) => c);
  const s = play([ROWS, ROWS], [seaA, [...seaA].reverse()], false);
  assert.ok(s.winner >= 0);
  for (let i = 1; i < s.shots.length; i++) assert.notEqual(s.shots[i].by, s.shots[i - 1].by);
});

test("đối chiếu: trả lời thật thì khớp, nói dối thì lệch", () => {
  const all = ROWS.flatMap((s) => shipCells(s)!);
  const s = play([ROWS, ROWS], [[at(9, 9), ...all], [at(9, 9)]], true);
  assert.equal(s.winner, 0);
  const answered = shotsAt(s, 1);
  assert.equal(answered.length, 1 + ROWS_CELLS);
  assert.ok(honest(ROWS, answered));
  assert.ok(honest(ROWS, shotsAt(s, 0)));
  // Khai là trượt một ô có tàu.
  const lie = answered.map((x, i) => (i === 1 ? { ...x, r: 0 as const } : x));
  assert.equal(honest(ROWS, lie), false);
  // Công bố một sơ đồ khác.
  assert.equal(honest([...ROWS.slice(0, 4), { k: 4, at: at(5, 8), o: 0 }], answered), false);
  // Công bố cùng vị trí nhưng khai hướng khác lúc chìm.
  const turned = answered.map((x) => (x.r === 2 && x.k === 0 ? { ...x, o: 2 } : x));
  assert.equal(honest(ROWS, turned), false);
});

test("cam kết đổi theo muối và sơ đồ", async () => {
  const a = await commitOf(ROWS, "muoi");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(await commitOf(ROWS, "muoi"), a);
  assert.notEqual(await commitOf(ROWS, "muoi2"), a);
  assert.notEqual(await commitOf([{ ...ROWS[0], o: 1 }, ...ROWS.slice(1)], "muoi"), a);
  assert.notEqual(await commitOf([{ ...ROWS[0], k: 5 }, ...ROWS.slice(1)], "muoi"), a);
});

test("toạ độ hải đồ", () => {
  assert.equal(coord(0), "A1");
  assert.equal(coord(at(2, 6)), "C7");
  assert.equal(coord(99), "J10");
});

test("tuỳ chọn lạ hoặc thiếu thì về mặc định, thiếu thời gian thì không giới hạn", () => {
  assert.deepEqual(normOptions({ chain: false, turn: 30 }), { chain: false, turn: 30 });
  assert.deepEqual(normOptions({ chain: "có", turn: 20 }), { chain: true, turn: 0 });
  assert.equal(normOptions({ chain: true }).turn, 0);
  assert.equal(normOptions({ turn: 15 }).turn, 15);
  assert.equal(normOptions({ turn: 45 }).turn, 45);
  assert.equal(normOptions(undefined).turn, 0);
});

test("hết giờ thì mất lượt: chuyển bên bắn, phát bắn trễ của người mất lượt bị bỏ", () => {
  const chain = { chain: true };
  // Hết giờ trước phát đầu: bên 1 bắn trước.
  let s = replay([], chain, [0]);
  assert.equal(s.turn, 1);
  assert.equal(s.passed, 0);
  // Bên 0 trúng (vẫn giữ lượt) rồi hết giờ: sang bên 1; bên 1 cũng hết giờ: về lại bên 0.
  const hit = answerShot(ROWS, [], at(0, 0));
  s = replay([{ ...hit, p: 0 }], chain, [1]);
  assert.equal(s.turn, 1);
  s = replay([{ ...hit, p: 0 }], chain, [1, 1]);
  assert.equal(s.turn, 0);
  assert.equal(s.passed, 1);
  // Có phát bắn mới thì không còn là diễn biến mới nhất.
  s = replay([{ ...hit, p: 0 }, { c: at(5, 5), r: 0, p: 1 }], chain, [1]);
  assert.equal(s.passed, -1);
  assert.equal(s.turn, 0);
  // Bên 0 bắn trễ ngay lúc chủ phòng chuyển lượt: phát đó không tính, cũng không thành câu trả lời.
  s = replay([{ c: at(3, 3), p: 0 }], chain, [0]);
  assert.equal(s.pending, -1);
  assert.equal(s.shots.length, 0);
  assert.equal(s.turn, 1);
  s = replay([{ c: at(3, 3), r: 0, p: 0 }], chain, [0]);
  assert.equal(s.shots.length, 0);
});
