import assert from "node:assert/strict";
import { test } from "node:test";
import {
  area3,
  basesOf,
  canGrab,
  canOpen,
  isStuck,
  MAP_KEYS,
  MAPS,
  MINE_CHOICES,
  minesFor,
  neighbors4,
  newGame,
  normOptions,
  openGain,
  ranks,
  replay,
  winnersOf,
  type McAct,
  type McPublic,
  type McState,
} from "./mine-control.ts";

const A = "a";
const B = "b";
const pub = (over: Partial<McPublic> = {}): McPublic => ({ seed: 7, map: "s", mines: 10, out: {}, ...over });

/** Tìm seed cho ra bản đồ thoả điều kiện — để test không phụ thuộc vào một bản đồ cụ thể. */
function seedWhere(base: Omit<McPublic, "seed">, players: number, ok: (s: McState) => boolean) {
  for (let seed = 1; seed < 5000; seed++) if (ok(newGame({ ...base, seed }, players))) return seed;
  throw new Error("không tìm được seed phù hợp");
}

test("tuỳ chọn lạ thì về mặc định", () => {
  assert.deepEqual(normOptions(undefined), { map: "m", mines: 15 });
  assert.deepEqual(normOptions({ map: "xl", mines: 99 }), { map: "m", mines: 15 });
  assert.deepEqual(normOptions({ map: "l", mines: 20 }), { map: "l", mines: 20 });
});

test("bản đồ nhỏ đông người thì hạ số mìn xuống mức hợp lệ", () => {
  assert.equal(minesFor({ map: "s", mines: 20 }, 2), 20);
  assert.equal(minesFor({ map: "s", mines: 20 }, 3), 15);
  assert.equal(minesFor({ map: "s", mines: 20 }, 4), 10);
  assert.equal(minesFor({ map: "m", mines: 20 }, 4), 20);
  assert.equal(minesFor({ map: "l", mines: 10 }, 4), 10);
});

test("sinh bản đồ hợp lệ cho mọi tổ hợp kích thước, số mìn và 2–4 người", () => {
  for (const map of MAP_KEYS)
    for (const want of MINE_CHOICES)
      for (let n = 2; n <= 4; n++)
        for (const seed of [1, 42, 99999]) {
          const mines = minesFor({ map, mines: want }, n);
          const s = newGame({ seed, map, mines, out: {} }, n);
          const { w, h } = MAPS[map];
          assert.equal(s.mines, mines, `${map}/${want}/${n}`);
          assert.equal(new Set(s.bases).size, n);
          for (const b of s.bases) {
            const zone = area3(w, h, b);
            assert.equal(zone.length, 9, "vùng bảo vệ nằm gọn trong bản đồ");
            assert.ok(zone.every((c) => !s.mine[c]), "vùng bảo vệ không có mìn");
          }
          // Vùng bảo vệ không chồng lên nhau.
          const zones = s.bases.flatMap((b) => area3(w, h, b));
          assert.equal(new Set(zones).size, zones.length);
          assert.equal(s.safeLeft, w * h - mines - n);
        }
});

test("cùng seed ra cùng bản đồ", () => {
  assert.deepEqual(newGame(pub({ seed: 123 }), 3).mine, newGame(pub({ seed: 123 }), 3).mine);
  assert.notDeepEqual(newGame(pub({ seed: 1 }), 2).mine, newGame(pub({ seed: 2 }), 2).mine);
});

test("căn cứ nằm ở góc, 2 người thì chéo nhau", () => {
  assert.deepEqual(basesOf(10, 6, 2), [1 * 10 + 1, 4 * 10 + 8]);
  assert.equal(basesOf(10, 6, 4).length, 4);
});

test("chỉ mở được ô ẩn liền kề 4 hướng lãnh thổ của mình", () => {
  const s = newGame(pub(), 2);
  const b = s.bases[0];
  assert.ok(canOpen(s, 0, b + 1));
  assert.ok(canOpen(s, 0, b + s.w));
  assert.equal(canOpen(s, 0, b + s.w + 1), false, "ô chéo không tính");
  assert.equal(canOpen(s, 0, b), false, "ô đã mở");
  assert.equal(canOpen(s, 1, b + 1), false, "không kề lãnh thổ người 2");
});

test("mở ô an toàn: được ô, cộng điểm theo số, hồi năng lượng, đổi lượt", () => {
  const s0 = newGame(pub(), 2);
  const c = s0.bases[0] + 1;
  const s = replay(pub(), [A, B], [{ k: "open", u: A, c }]);
  assert.equal(s.count, 1);
  assert.equal(s.owner[c], 0);
  assert.equal(s.players[0].score, openGain(s.near[c]));
  assert.equal(s.players[0].energy, 3);
  assert.equal(s.turn, 1);
  assert.equal(openGain(0), 1);
  assert.equal(openGain(4), 2);
  assert.equal(openGain(7), 3);
});

test("sai người, sai luật thì nhật ký dừng tại đó", () => {
  const s0 = newGame(pub(), 2);
  assert.equal(replay(pub(), [A, B], [{ k: "open", u: B, c: s0.bases[1] - 1 }]).count, 0);
  assert.equal(replay(pub(), [A, B], [{ k: "open", u: A, c: s0.bases[0] + 2 * s0.w + 5 }]).count, 0);
  assert.equal(replay(pub(), [A, B], [{ k: "grab", u: A, c: 0 }]).count, 0);
});

/**
 * Người 0 mở dần các ô an toàn (số khác 0 — để không lan ra trung lập) từ lãnh thổ hiện có tới cạnh quả mìn gần nhất,
 * người 1 bỏ lượt xen giữa. Trả về nhật ký nối thêm và quả mìn; null nếu bản đồ không có đường như vậy.
 */
function toMine(p: McPublic, acts: McAct[]): { acts: McAct[]; mine: number } | null {
  const s = replay(p, [A, B], acts);
  const own = [...s.owner.keys()].filter((c) => s.owner[c] === 0);
  const prev = new Map<number, number>(own.map((c) => [c, -1]));
  const queue = [...own];
  while (queue.length) {
    const c = queue.shift()!;
    for (const d of neighbors4(s.w, s.h, c)) {
      if (prev.has(d) || s.open[d]) continue;
      if (s.mine[d]) {
        const path: number[] = [];
        for (let x = c; prev.get(x) !== -1; x = prev.get(x)!) path.unshift(x);
        return { acts: [...acts, ...path.flatMap((x): McAct[] => [{ k: "open", u: A, c: x }, { k: "pass", u: B }])], mine: d };
      }
      if (s.near[d] === 0) continue;
      prev.set(d, c);
      queue.push(d);
    }
  }
  return null;
}

/** Đi tới rồi giẫm lần lượt `n` quả mìn (mỗi lần người 1 bỏ lượt xen giữa); `head` là các dòng mở đầu. */
function stepOnMines(p: McPublic, n: number, head: McAct[] = []) {
  let acts = head;
  const mines: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = toMine(p, acts);
    if (!r) return null;
    acts = [...r.acts, { k: "open", u: A, c: r.mine }, { k: "pass", u: B }];
    mines.push(r.mine);
  }
  return { acts, mines };
}

const seedFor = (n: number, head: McAct[] = []) => {
  for (let seed = 1; seed < 5000; seed++) {
    const r = stepOnMines(pub({ seed, mines: 20 }), n, head);
    if (r && replay(pub({ seed, mines: 20 }), [A, B], r.acts).count >= r.acts.length - 1) return seed;
  }
  throw new Error("không tìm được seed phù hợp");
};

test("mở trúng mìn: mất mạng, trừ 2 điểm (không âm), mìn lộ vĩnh viễn", () => {
  const p = pub({ seed: seedFor(1), mines: 20 });
  const r = toMine(p, [])!;
  const before = replay(p, [A, B], r.acts);
  const s = replay(p, [A, B], [...r.acts, { k: "open", u: A, c: r.mine }]);
  assert.equal(s.count, r.acts.length + 1);
  assert.equal(s.open[r.mine], 2);
  assert.equal(s.owner[r.mine], -1);
  assert.equal(s.players[0].lives, 2);
  assert.equal(s.players[0].score, Math.max(0, before.players[0].score - 2));
  assert.equal(s.turn, 1, "lượt đã dùng");
  assert.equal(canOpen(s, 0, r.mine), false, "mìn đã lộ không mở lại được");
});

test("Khiên chặn mất mạng đúng một lần, vẫn bị trừ điểm", () => {
  const head: McAct[] = [{ k: "shield", u: A }, { k: "pass", u: B }];
  const p = pub({ seed: seedFor(1, head), mines: 20 });
  assert.equal(replay(p, [A, B], [...head, { k: "shield", u: A }]).count, 2, "không chồng Khiên");
  const r = toMine(p, head)!;
  const shielded = replay(p, [A, B], r.acts);
  assert.equal(shielded.players[0].shield, true);
  const s = replay(p, [A, B], [...r.acts, { k: "open", u: A, c: r.mine }]);
  assert.equal(s.count, r.acts.length + 1);
  assert.equal(s.players[0].lives, 3);
  assert.equal(s.players[0].shield, false);
  assert.equal(s.players[0].score, Math.max(0, shielded.players[0].score - 2));
});

test("hết mạng thì bị loại; còn một người là thắng ngay", () => {
  const p = pub({ seed: seedFor(3), mines: 20 });
  const { acts } = stepOnMines(p, 3)!;
  const s = replay(p, [A, B], acts);
  assert.equal(s.players[0].out, "dead");
  assert.equal(s.players[0].lives, 0);
  assert.equal(s.over, true);
  assert.equal(s.end, "alone");
  assert.deepEqual(winnersOf(s), [1]);
  assert.equal(s.count, acts.length - 1, "hết ván thì dòng sau không được tính");
});

test("Radar đếm mìn vùng 3×3 (kể cả ô tâm), tốn 2 năng lượng", () => {
  const s0 = newGame(pub({ mines: 20 }), 2);
  const c = s0.mine.findIndex((v) => v === 1);
  const s = replay(pub({ mines: 20 }), [A, B], [{ k: "radar", u: A, c }]);
  assert.equal(s.radar[c].n, area3(s.w, s.h, c).reduce((n, d) => n + s0.mine[d], 0));
  assert.ok(s.radar[c].n >= 1);
  assert.equal(s.players[0].energy, 1, "2 − 2 + 1");
  assert.equal(s.open[c], 0, "không mở ô");
  assert.equal(replay(pub(), [A, B], [{ k: "radar", u: A, c: s0.bases[0] }]).count, 0, "ô đã mở không quét được");
});

test("Pháo đài: chỉ trên ô của mình, không trên căn cứ, tối đa 2", () => {
  const p = pub({ map: "m", seed: seedWhere({ map: "m", mines: 10, out: {} }, 2, (s) => [1, 2, 3].every((d) => s.near[s.bases[0] + d] > 0 && !s.mine[s.bases[0] + d])) });
  const s0 = newGame(p, 2);
  const b = s0.bases[0];
  const acts: McAct[] = [
    { k: "open", u: A, c: b + 1 },
    { k: "pass", u: B },
    { k: "open", u: A, c: b + 2 },
    { k: "pass", u: B },
  ];
  assert.equal(replay(p, [A, B], [...acts, { k: "fort", u: A, c: b }]).count, 4, "không đặt lên căn cứ");
  assert.equal(replay(p, [A, B], [...acts, { k: "fort", u: A, c: b + 5 }]).count, 4, "không đặt lên ô chưa sở hữu");
  const s = replay(p, [A, B], [...acts, { k: "fort", u: A, c: b + 1 }]);
  assert.equal(s.fort[b + 1], 1);
  assert.equal(s.players[0].forts, 1);
  assert.equal(s.players[0].energy, 3, "4 − 2 + 1");
  const more: McAct[] = [...acts, { k: "fort", u: A, c: b + 1 }, { k: "pass", u: B }, { k: "open", u: A, c: b + 3 }, { k: "pass", u: B }];
  assert.equal(replay(p, [A, B], [...more, { k: "fort", u: A, c: b + 1 }]).count, more.length, "không xây chồng");
  const two = replay(p, [A, B], [...more, { k: "fort", u: A, c: b + 2 }, { k: "pass", u: B }]);
  assert.equal(two.players[0].forts, 2);
  assert.equal(replay(p, [A, B], [...more, { k: "fort", u: A, c: b + 2 }, { k: "pass", u: B }, { k: "fort", u: A, c: b + 3 }]).count, more.length + 2, "tối đa 2 Pháo đài");
});

test("ô số 0 lan ra các ô trung lập, không tính điểm; Cướp Đất chiếm ô trung lập", () => {
  // Cần một ô số 0 ngay cạnh căn cứ, lan ra được ít nhất một ô không kề lãnh thổ đối thủ.
  const p = pub({ seed: seedWhere({ map: "l", mines: 10, out: {} }, 2, (s) => s.near[s.bases[0] + 1] === 0) });
  const s0 = newGame(p, 2);
  const c = s0.bases[0] + 1;
  const s = replay(p, [A, B], [{ k: "open", u: A, c }]);
  const ev = s.events.find((e) => e.t === "open")!;
  assert.ok(ev.t === "open" && ev.flood > 0);
  assert.equal(s.players[0].score, 1, "chỉ tính ô tự mở");
  const neutral = [...s.open.keys()].filter((d) => s.open[d] === 1 && s.owner[d] === -1);
  assert.equal(neutral.length, ev.t === "open" ? ev.flood : 0);
  // Mở thêm một ô để đủ 4 năng lượng rồi Cướp Đất.
  const target = neutral.find((d) => canGrab({ ...s, players: s.players.map((q) => ({ ...q, energy: 4 })) }, 0, d))!;
  assert.ok(target !== undefined);
  const s2 = replay(p, [A, B], [{ k: "open", u: A, c }, { k: "pass", u: B }, { k: "grab", u: A, c: target }]);
  assert.equal(s2.owner[target], 0);
  assert.equal(s2.players[0].score, 2);
  assert.equal(s2.players[0].energy, 1, "3 − 3 + 1");
  assert.equal(replay(p, [A, B], [{ k: "open", u: A, c }, { k: "pass", u: B }, { k: "grab", u: A, c: target }, { k: "pass", u: B }, { k: "grab", u: A, c: target }]).count, 4, "đã chiếm thì không cướp lại");
});

test("Cướp Đất: không chiếm ô kề lãnh thổ đối thủ", () => {
  const s = newGame(pub(), 2);
  const c = s.bases[0] + 2;
  s.open[c] = 1;
  s.owner[s.bases[0] + 1] = 0;
  s.players[0].energy = 4;
  assert.ok(canGrab(s, 0, c));
  s.open[c + 1] = 1;
  s.owner[c + 1] = 1;
  assert.equal(canGrab(s, 0, c), false);
  assert.equal(canGrab(s, 0, s.bases[1]), false, "căn cứ không cướp được");
});

test("bỏ cuộc giữa ván: bị loại, giữ điểm; hai người thì người còn lại thắng", () => {
  const s0 = newGame(pub(), 2);
  const acts: McAct[] = [{ k: "open", u: A, c: s0.bases[0] + 1 }];
  const s = replay(pub({ out: { [A]: 1 } }), [A, B], acts);
  assert.equal(s.players[0].out, "quit");
  assert.ok(s.players[0].score > 0);
  assert.equal(s.end, "alone");
  assert.deepEqual(winnersOf(s), [1]);
});

test("ba người: một người bỏ cuộc lúc tới lượt thì lượt sang người kế", () => {
  const s = replay(pub({ out: { b: 1 } }), ["a", "b", "c"], [{ k: "pass", u: "a" }]);
  assert.equal(s.over, false);
  assert.equal(s.turn, 2);
  assert.equal(replay(pub({ out: { b: 1 } }), ["a", "b", "c"], [{ k: "pass", u: "a" }, { k: "pass", u: "c" }]).turn, 0);
});

test("chơi tới cuối: hết ván (mở hết ô / bế tắc), cộng thưởng cuối ván rồi xếp hạng", () => {
  // Hai người lần lượt mở ô an toàn kề lãnh thổ, hết thì Cướp Đất, không được nữa thì bỏ lượt (không bao giờ đụng mìn).
  const p = pub({ map: "s", mines: 10, seed: 5 });
  let acts: McAct[] = [];
  for (let guard = 0; guard < 500; guard++) {
    const s = replay(p, [A, B], acts);
    if (s.over) break;
    const k = s.turn;
    const u = k === 0 ? A : B;
    const c = [...s.open.keys()].find((d) => !s.mine[d] && canOpen(s, k, d));
    const g = [...s.open.keys()].find((d) => canGrab(s, k, d));
    acts = [...acts, c !== undefined ? { k: "open", u, c } : g !== undefined ? { k: "grab", u, c: g } : { k: "pass", u }];
  }
  const s = replay(p, [A, B], acts);
  assert.equal(s.count, acts.length);
  assert.equal(s.over, true);
  assert.ok(s.end === "clear" || s.end === "stuck");
  const r = ranks(s);
  for (const x of r) assert.equal(x.bonus, s.players[x.k].lives + 2 * s.players[x.k].forts);
  assert.ok(winnersOf(s).length >= 1);
});

test("bế tắc: không ai còn nước mở ô / Cướp Đất thì hết ván dù còn Radar, Khiên", () => {
  const s = newGame(pub(), 2);
  assert.equal(isStuck(s), false);
  // Rào kín: mọi ô quanh lãnh thổ của cả hai đều là mìn đã nổ.
  for (const b of s.bases) for (const d of area3(s.w, s.h, b)) if (d !== b) s.open[d] = 2;
  assert.equal(isStuck(s), true);
  // Còn một ô trung lập Cướp Đất được (đủ năng lượng) thì chưa bế tắc.
  const c = s.bases[0] + 1;
  s.open[c] = 1;
  s.players[0].energy = 3;
  assert.equal(isStuck(s), false);
  s.players[0].energy = 2;
  assert.equal(isStuck(s), true, "không đủ năng lượng Cướp Đất");
  assert.equal(replay(pub(), [A, B], [{ k: "pass", u: A }, { k: "pass", u: B }]).over, false, "bỏ lượt không làm hết ván khi còn nước đi");
});

test("mọi người cùng bỏ lượt liên tiếp 2 vòng thì hết ván như bế tắc", () => {
  const three: McAct[] = [{ k: "pass", u: A }, { k: "pass", u: B }, { k: "pass", u: A }];
  assert.equal(replay(pub(), [A, B], three).over, false);
  const s = replay(pub(), [A, B], [...three, { k: "pass", u: B }]);
  assert.equal(s.over, true);
  assert.equal(s.end, "stuck");
  // Một hành động khác bỏ lượt thì đếm lại từ đầu.
  const c = newGame(pub(), 2).bases[0] + 1;
  assert.equal(replay(pub(), [A, B], [{ k: "pass", u: A }, { k: "pass", u: B }, { k: "open", u: A, c }, { k: "pass", u: B }, { k: "pass", u: A }]).over, false);
});

test("hoà khi bằng mọi chỉ số", () => {
  const s = newGame(pub(), 2);
  s.over = true;
  s.end = "stuck";
  assert.deepEqual(winnersOf(s), [0, 1]);
  s.players[1].score = 1;
  assert.deepEqual(winnersOf(s), [1]);
});
