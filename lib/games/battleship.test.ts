import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerShot,
  commitOf,
  coord,
  FLEET,
  FLEET_CELLS,
  fleetGrid,
  honest,
  parseFleet,
  randomFleet,
  replay,
  shipCells,
  shotsAt,
  SIZE,
  type Fleet,
  type Shot,
} from "./battleship.ts";

const at = (x: number, y: number) => y * SIZE + x;

/** Năm tàu nằm ngang ở các hàng chẵn, sát mép trái. */
const ROWS: Fleet = [0, 2, 4, 6, 8].map((y) => ({ at: at(0, y), v: false }));

/** Bên bị bắn trả lời mọi phát bằng sơ đồ thật — như máy tự trả lời. */
function play(fleets: [Fleet, Fleet], targets: [number[], number[]], chain: boolean) {
  const log: Shot[] = [];
  const next = [0, 0];
  for (let guard = 0; guard < 400; guard++) {
    const s = replay(log, { chain });
    if (s.winner >= 0) return s;
    const foe = 1 - s.turn;
    const c = targets[s.turn][next[s.turn]++];
    if (c === undefined) return s;
    log.push(answerShot(fleets[foe], shotsAt(s, foe as 0 | 1).map((x) => x.c), c));
  }
  throw new Error("không kết thúc");
}

test("ô của tàu, tràn mép thì sai", () => {
  assert.deepEqual(shipCells(0, { at: at(5, 0), v: false }), [5, 6, 7, 8, 9]);
  assert.equal(shipCells(0, { at: at(6, 0), v: false }), null);
  assert.deepEqual(shipCells(4, { at: at(9, 8), v: true }), [at(9, 8), at(9, 9)]);
  assert.equal(shipCells(4, { at: at(9, 9), v: true }), null);
});

test("hạm đội chồng nhau hoặc thiếu tàu là sai", () => {
  assert.ok(fleetGrid(ROWS));
  assert.equal(fleetGrid(ROWS.slice(0, 4)), null);
  assert.equal(fleetGrid([...ROWS.slice(0, 4), { at: at(1, 0), v: true }]), null);
  assert.equal(parseFleet([...ROWS.slice(0, 4), { at: "3", v: false }]), null);
  assert.deepEqual(parseFleet(ROWS), ROWS);
});

test("bày ngẫu nhiên luôn hợp lệ và các tàu không chạm nhau", () => {
  for (let i = 0; i < 200; i++) {
    const fleet = randomFleet();
    const grid = fleetGrid(fleet);
    assert.ok(grid);
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
  assert.deepEqual(answerShot(ROWS, [at(0, 8)], at(1, 8)), { c: at(1, 8), r: 2, k: 4, at: ship.at, v: false });
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
  assert.equal(replay([{ c: at(0, 8), r: 2, k: 4, at: at(0, 8), v: false }], opts).shots.length, 0);
  // Ô vừa bắn không thuộc tàu khai chìm.
  assert.equal(replay([{ c: at(0, 8), r: 1 }, { c: at(5, 5), r: 2, k: 4, at: at(0, 8), v: true }], opts).shots.length, 1);
  // Khai chìm cùng một tàu hai lần.
  const twice: Shot[] = [
    { c: at(0, 8), r: 1 },
    { c: at(1, 8), r: 2, k: 4, at: at(0, 8), v: false },
    { c: at(0, 9), r: 1 },
    { c: at(1, 9), r: 2, k: 4, at: at(0, 9), v: false },
  ];
  assert.equal(replay(twice, opts).shots.length, 3);
});

test("bắn chìm hết hạm đội thì thắng, nhật ký sau đó bị bỏ qua", () => {
  const all = ROWS.flatMap((s, k) => shipCells(k, s)!);
  const s = play([randomFleet(), ROWS], [all, []], true);
  assert.equal(s.winner, 0);
  assert.equal(s.sunk[1].length, FLEET.length);
  assert.equal(s.shots.length, FLEET_CELLS);
  assert.deepEqual(
    s.sunk[1].map((x) => x.k).sort(),
    FLEET.map((_, k) => k),
  );
});

test("không bắn tiếp: hai bên thay phiên tới khi một bên chìm hết", () => {
  const seaA = Array.from({ length: SIZE * SIZE }, (_, c) => c);
  const s = play([ROWS, ROWS], [seaA, [...seaA].reverse()], false);
  assert.ok(s.winner >= 0);
  for (let i = 1; i < s.shots.length; i++) assert.notEqual(s.shots[i].by, s.shots[i - 1].by);
});

test("đối chiếu: trả lời thật thì khớp, nói dối thì lệch", () => {
  const all = ROWS.flatMap((s, k) => shipCells(k, s)!);
  // A bắn trượt, B bắn trượt, rồi A bắn trúng liền một mạch tới khi chìm hết.
  const s = play([ROWS, ROWS], [[at(9, 9), ...all], [at(9, 9)]], true);
  assert.equal(s.winner, 0);
  const answered = shotsAt(s, 1);
  assert.equal(answered.length, 1 + FLEET_CELLS);
  assert.ok(honest(ROWS, answered));
  assert.ok(honest(ROWS, shotsAt(s, 0)));
  // Khai là trượt một ô có tàu.
  const lie = answered.map((x, i) => (i === 1 ? { ...x, r: 0 as const } : x));
  assert.equal(honest(ROWS, lie), false);
  // Công bố một sơ đồ khác.
  assert.equal(honest([...ROWS.slice(0, 4), { at: at(5, 8), v: false }], answered), false);
});

test("cam kết đổi theo muối và sơ đồ", async () => {
  const a = await commitOf(ROWS, "muoi");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(await commitOf(ROWS, "muoi"), a);
  assert.notEqual(await commitOf(ROWS, "muoi2"), a);
  assert.notEqual(await commitOf([{ ...ROWS[0], v: true }, ...ROWS.slice(1)], "muoi"), a);
});

test("toạ độ hải đồ", () => {
  assert.equal(coord(0), "A1");
  assert.equal(coord(at(2, 6)), "C7");
  assert.equal(coord(99), "J10");
});
