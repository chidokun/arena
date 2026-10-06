import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advance,
  autoWolves,
  ballotsOf,
  castFor,
  deal,
  DEFAULT_OPTIONS,
  depart,
  DURATION,
  joinNames,
  newGame,
  nightTurns,
  normOptions,
  secretFor,
  shotOf,
  sideOf,
  skipNight,
  skipTalk,
  skipTurn,
  tally,
  watchView,
  winnerOf,
  type Action,
  type Game,
  type Role,
  type Vote,
  type WolfOptions,
} from "./werewolf.ts";

/** Bộ sinh số giả ngẫu nhiên có hạt giống (mulberry32). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYERS = ["a", "b", "c", "d", "e", "f", "g", "h"];

/** Ván 8 người với vai cố định: a, b là Sói; c Tiên Tri; d Bảo Vệ; e Phù Thủy; f, g, h Dân. */
function fixed(opts: WolfOptions = DEFAULT_OPTIONS, players = PLAYERS): Game {
  const g = newGame(1, players, opts, 0, rng(1));
  const roles: Role[] = ["wolf", "wolf", "seer", "guard", "witch", "villager", "villager", "villager"];
  g.sec.roles = Object.fromEntries(players.map((u, i) => [u, roles[i] ?? "villager"]));
  return g;
}

type Step = { actions?: Record<string, Action>; votes?: Record<string, Vote>; now: number; opts?: WolfOptions };
const step = (g: Game, s: Step) => advance(g, { actions: s.actions ?? {}, votes: s.votes ?? {}, now: s.now, rand: rng(7), opts: s.opts ?? DEFAULT_OPTIONS });

/** Hết giai đoạn hiện tại. */
const timeout = (g: Game, s: Omit<Step, "now"> = {}) => step(g, { ...s, now: g.pub.until });

/** Qua từng lượt của đêm: nhận hành động của vai đang được gọi; chưa chốt thì quản trò bỏ qua lượt. Dừng khi hết đêm. */
function dawnNow(g: Game, actions: Record<string, Action> = {}, opts?: WolfOptions) {
  for (let i = 0; g.pub.stage === "night" && i < 20; i++) {
    const turn = g.pub.turn;
    g = step(g, { actions, opts, now: g.pub.since + 1 });
    if (g.pub.stage === "night" && g.pub.turn === turn) g = skipTurn(g, g.pub.since + 1, rng(7));
  }
  assert.equal(g.pub.stage, "dawn");
  return g;
}

/** Qua đêm rồi hết đếm ngược. */
const night = (g: Game, actions: Record<string, Action> = {}, opts?: WolfOptions) => timeout(dawnNow(g, actions, opts), { opts });

/** Qua các lượt trước cho tới lượt của vai `role`. */
function toTurn(g: Game, role: Role, actions: Record<string, Action> = {}, opts?: WolfOptions) {
  for (let i = 0; g.pub.turn !== role && i < 20; i++) {
    const turn = g.pub.turn;
    g = step(g, { actions, opts, now: g.pub.since + 1 });
    if (g.pub.turn === turn) g = skipTurn(g, g.pub.since + 1, rng(7));
  }
  assert.equal(g.pub.turn, role);
  return g;
}

test("số Sói tự động và đội hình", () => {
  assert.deepEqual([4, 5, 6, 8, 9, 12, 15, 16].map(autoWolves), [1, 1, 2, 2, 3, 4, 5, 5]);
  const { cast, error } = castFor(8, DEFAULT_OPTIONS);
  assert.equal(error, undefined);
  assert.deepEqual(cast, { wolf: 2, minion: 0, cursed: 0, seer: 1, guard: 1, witch: 1, hunter: 0, cupid: 0, villager: 3 });
  assert.deepEqual(castFor(8, { ...DEFAULT_OPTIONS, cupid: true, cursed: true }).cast, { wolf: 2, minion: 0, cursed: 1, seer: 1, guard: 1, witch: 1, hunter: 0, cupid: 1, villager: 1 });
  assert.match(castFor(3, DEFAULT_OPTIONS).error!, /ít nhất/);
  assert.match(castFor(4, { ...DEFAULT_OPTIONS, wolves: 2 }).error!, /quá nhiều/);
  assert.equal(castFor(4, DEFAULT_OPTIONS).cast.villager, 0);
});

test("tắt Dân Làng thì số người phải vừa khít số vai", () => {
  const opts = { ...DEFAULT_OPTIONS, villager: false };
  assert.equal(castFor(4, opts).error, undefined);
  assert.deepEqual(castFor(4, opts).cast, { wolf: 1, minion: 0, cursed: 0, seer: 1, guard: 1, witch: 1, hunter: 0, cupid: 0, villager: 0 });
  assert.match(castFor(5, opts).error!, /cần đúng 4 người/);
  assert.equal(castFor(5, { ...opts, wolves: 2 }).error, undefined, "2 Sói + 3 vai đặc biệt = 5 người");
});

test("chia vai đúng đội hình, mỗi người một vai", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { cast } = castFor(PLAYERS.length, DEFAULT_OPTIONS);
    const roles = deal(PLAYERS, cast, rng(seed));
    assert.deepEqual(Object.keys(roles).sort(), PLAYERS);
    const count = (r: Role) => Object.values(roles).filter((x) => x === r).length;
    assert.equal(count("wolf"), 2);
    assert.equal(count("seer"), 1);
    assert.equal(count("villager"), 3);
  }
});

test("tuỳ chọn lạ về mặc định", () => {
  assert.deepEqual(normOptions(null), DEFAULT_OPTIONS);
  assert.deepEqual(normOptions({ wolves: 99, talk: 7, tie: "x", seer: "yes" }), DEFAULT_OPTIONS);
  assert.equal(normOptions({ wolves: 3, talk: 60 }).wolves, 3);
});

test("điều kiện thắng", () => {
  const roles: Record<string, Role> = { a: "wolf", b: "villager", c: "seer", d: "wolf", e: "guard" };
  assert.equal(winnerOf(["a", "b", "c", "d", "e"], roles), undefined);
  assert.equal(winnerOf(["a", "b", "c", "d"], roles), "wolf");
  assert.equal(winnerOf(["a", "b"], roles), "wolf");
  assert.equal(winnerOf(["b", "c"], roles), "village");
});

test("đếm phiếu: nhiều nhất thắng, hoà trả nhiều người, bỏ qua không tính", () => {
  assert.deepEqual(tally({ a: "x", b: "x", c: "y", d: null }).top, ["x"]);
  assert.deepEqual(tally({ a: "x", b: "y" }).top, ["x", "y"]);
  assert.deepEqual(tally({ a: null }).top, []);
});

test("đêm: gọi lần lượt từng vai, vai này chốt xong mới tới vai kia", () => {
  let g = timeout(fixed());
  assert.equal(g.pub.stage, "night");
  assert.deepEqual(nightTurns(g.pub), ["guard", "wolf", "seer", "witch"], "không có Cupid trong đội hình");
  assert.equal(g.pub.turn, "guard");
  const all: Record<string, Action> = {
    a: { day: 1, wolf: "f", done: true },
    b: { day: 1, wolf: "f", done: true },
    c: { day: 1, seer: "a", done: true },
    d: { day: 1, guard: "g", done: true },
    e: { day: 1, done: true },
  };
  // Chưa tới lượt thì lựa chọn của vai khác không được tính.
  g = step(g, { now: 1, actions: { ...all, d: { day: 1, guard: "g" } } });
  assert.equal(g.pub.turn, "guard");
  assert.deepEqual(g.sec.night.wolves, {});
  assert.equal(g.sec.night.seerPick, undefined);
  g = step(g, { now: 2, actions: all });
  assert.equal(g.pub.turn, "wolf");
  assert.equal(secretFor(g, "e")!.victim, undefined, "Phù Thủy chưa tới lượt thì không biết gì");
  g = step(g, { now: 3, actions: { ...all, b: { day: 1, wolf: "f" } } });
  assert.equal(g.pub.turn, "wolf", "chờ cả bầy chốt");
  g = step(g, { now: 4, actions: all });
  assert.equal(g.pub.turn, "seer");
  assert.equal(g.sec.night.victim, "f");
  g = step(g, { now: 5, actions: all });
  assert.deepEqual(secretFor(g, "c")!.seen, [{ day: 1, target: "a", wolf: true }], "Tiên Tri chốt là có kết quả ngay trong đêm");
  assert.equal(g.pub.turn, "witch");
  assert.equal(secretFor(g, "e")!.victim, "f", "tới lượt Phù Thủy thì biết ai bị cắn");
  assert.equal(secretFor(g, "c")!.victim, undefined, "người khác không thấy nạn nhân");
  g = step(g, { now: 6, actions: all });
  assert.equal(g.pub.stage, "dawn");
  assert.equal(g.pub.turn, undefined);
  assert.equal(g.pub.until - g.pub.since, DURATION.dawn);
  // Đang đếm ngược: chưa công bố ai chết.
  assert.equal(g.pub.deaths.length, 0);
  g = timeout(g);
  assert.equal(g.pub.stage, "day");
  assert.deepEqual(g.pub.deaths, [{ uid: "f", day: 1, how: "night" }], "vai của người chết giữ bí mật");
  assert.equal(g.sec.lastGuard, "g");
  assert.deepEqual(g.sec.story[0], { day: 1, bite: "f", guard: "g", seer: { target: "a", wolf: true }, died: ["f"] });
});

test("lượt không hết giờ: chờ người giữ vai chốt, quản trò bỏ qua lượt hoặc cho trời sáng", () => {
  let g = timeout(fixed());
  assert.equal(g.pub.until, g.pub.since, "không có đồng hồ đếm ngược");
  g = step(g, { now: 3_600_000, actions: { d: { day: 1, guard: "g" } } });
  assert.equal(g.pub.turn, "guard");
  g = skipTurn(g, 3_600_001, rng(7));
  assert.equal(g.pub.turn, "wolf");
  assert.equal(g.sec.night.guard, "g", "lựa chọn đang có vẫn được tính");
  g = step(g, { now: 3_600_002, actions: { a: { day: 1, wolf: "f" } } });
  g = skipNight(g, 3_600_003, rng(7));
  assert.equal(g.pub.stage, "dawn");
  assert.equal(g.sec.night.victim, "f", "lựa chọn đang có vẫn được tính");
  g = timeout(g);
  assert.equal(g.pub.deaths.length, 1);
});

test("vai đã chết vẫn được gọi một lúc để không lộ", () => {
  let g = timeout(fixed());
  g = depart(g, "c");
  g = toTurn(g, "seer");
  const idle = g.sec.night.idleUntil!;
  assert.ok(idle - g.sec.night.turnAt >= DURATION.idleMin && idle - g.sec.night.turnAt <= DURATION.idleMax);
  g = step(g, { now: idle - 1 });
  assert.equal(g.pub.turn, "seer");
  g = step(g, { now: idle });
  assert.equal(g.pub.turn, "witch");
});

test("Bảo Vệ chặn được Sói; không được bảo vệ một người hai đêm liền", () => {
  let g = timeout(fixed());
  g = night(g, { a: { day: 1, wolf: "f" }, b: { day: 1, wolf: "f" }, d: { day: 1, guard: "f" } });
  assert.equal(g.pub.stage, "day");
  assert.equal(g.pub.deaths.length, 0);
  g = skipTalk(g, g.pub.until);
  g = timeout(g);
  assert.equal(g.pub.stage, "verdict");
  assert.equal(g.pub.hanged, null);
  g = timeout(g);
  assert.equal(g.pub.stage, "night");
  assert.equal(g.pub.day, 2);
  assert.equal(g.pub.turn, "guard");
  g = step(g, { now: g.pub.since + 1, actions: { d: { day: 2, guard: "f" } } });
  assert.equal(g.sec.night.guard, undefined);
  // Hành động của đêm cũ bị bỏ qua.
  g = step(g, { now: g.pub.since + 2, actions: { d: { day: 1, guard: "d" } } });
  assert.equal(g.sec.night.guard, undefined);
  g = step(g, { now: g.pub.since + 3, actions: { d: { day: 2, guard: "d" } } });
  assert.equal(g.sec.night.guard, "d");
});

test("Phù Thủy cứu người bị cắn và đầu độc trong lượt của mình", () => {
  let g = timeout(fixed());
  g = night(g, { a: { day: 1, wolf: "g" }, b: { day: 1, wolf: "g" }, e: { day: 1, save: "g", poison: "a", done: true } });
  assert.deepEqual(
    g.pub.deaths.map((d) => d.uid),
    ["a"],
  );
  assert.deepEqual(g.sec.potions, { save: false, poison: false });
  assert.equal(g.sec.story[0].save, "g");
  assert.equal(g.sec.story[0].poison, "a");
});

test("Phù Thủy chỉ cứu được đúng người bị cắn; Sói không cắn ai thì biết là không ai", () => {
  let g = timeout(fixed());
  g = night(g, { a: { day: 1, wolf: "h" }, b: { day: 1, wolf: "h" }, e: { day: 1, save: "g", done: true } });
  assert.deepEqual(
    g.pub.deaths.map((d) => d.uid),
    ["h"],
  );
  assert.equal(g.sec.potions.save, true);
  let h = toTurn(timeout(fixed()), "witch");
  assert.equal(secretFor(h, "e")!.victim, null);
  h = step(h, { now: 1, actions: { e: { day: 1, save: "f" } } });
  assert.equal(h.sec.night.save, undefined);
});

test("Phù Thủy đã dùng bình cứu thì không được biết ai bị cắn", () => {
  let g = timeout(fixed());
  g.sec.potions.save = false;
  g = toTurn(g, "witch", { a: { day: 1, wolf: "f" }, b: { day: 1, wolf: "f" } });
  assert.equal(g.sec.night.victim, "f");
  assert.equal(secretFor(g, "e")!.victim, undefined);
});

test("Phù Thủy hết thuốc thì lượt của mình trôi qua như vai đã chết", () => {
  let g = timeout(fixed());
  g.sec.potions = { save: false, poison: false };
  g = toTurn(g, "witch");
  assert.ok(g.sec.night.idleUntil);
  g = step(g, { now: g.sec.night.idleUntil! });
  assert.equal(g.pub.stage, "dawn");
});

test("Tiên Tri chỉ soi một người mỗi đêm; bị bỏ qua lượt thì soi người đang chọn", () => {
  let g = toTurn(timeout(fixed()), "seer");
  g = step(g, { now: 1, actions: { c: { day: 1, seer: "f" } } });
  assert.deepEqual(secretFor(g, "c")!.seen, []);
  g = step(g, { now: 2, actions: { c: { day: 1, seer: "f", done: true } } });
  g = step(g, { now: 3, actions: { c: { day: 1, seer: "a", done: true } } });
  assert.deepEqual(secretFor(g, "c")!.seen, [{ day: 1, target: "f", wolf: false }]);
  let h = toTurn(timeout(fixed()), "seer");
  h = step(h, { now: 1, actions: { c: { day: 1, seer: "b" } } });
  h = skipTurn(h, 2, rng(7));
  assert.deepEqual(secretFor(h, "c")!.seen, [{ day: 1, target: "b", wolf: true }]);
});

test("Sói không đồng ý thì bốc thăm giữa các lựa chọn nhiều phiếu nhất", () => {
  let g = timeout(fixed());
  g = dawnNow(g, { a: { day: 1, wolf: "f" }, b: { day: 1, wolf: "g" } });
  assert.ok(["f", "g"].includes(g.sec.night.victim!));
  let h = toTurn(timeout(fixed()), "wolf");
  h = step(h, { now: 1, actions: { a: { day: 1, wolf: "b" } } });
  assert.deepEqual(h.sec.night.wolves, {}, "Sói không cắn Sói");
});

test("Cupid ghép đôi đêm đầu; một người chết thì người kia chết theo", () => {
  const opts = { ...DEFAULT_OPTIONS, cupid: true };
  let g = newGame(1, PLAYERS, opts, 0, rng(1));
  g.sec.roles = { a: "wolf", b: "wolf", c: "seer", d: "guard", e: "witch", f: "cupid", g: "villager", h: "villager" };
  g = timeout(g, { opts });
  assert.equal(g.pub.turn, "cupid");
  g = step(g, { opts, now: 1, actions: { f: { day: 1, cupid: ["g", "g"], done: true } } });
  assert.equal(g.pub.turn, "cupid", "phải là hai người khác nhau");
  g = step(g, { opts, now: 2, actions: { f: { day: 1, cupid: ["g", "h"], done: true } } });
  assert.equal(g.pub.turn, "guard");
  assert.deepEqual(g.sec.lovers, ["g", "h"]);
  assert.equal(secretFor(g, "g")!.lover, "h");
  assert.equal(secretFor(g, "h")!.loverRole, "villager");
  assert.deepEqual(secretFor(g, "f")!.lovers, ["g", "h"]);
  assert.equal(secretFor(g, "c")!.lover, undefined);
  // Sói cắn g: h chết theo, công bố chung như người chết đêm qua.
  g = night(g, { a: { day: 1, wolf: "g" }, b: { day: 1, wolf: "g" } }, opts);
  assert.deepEqual(g.pub.deaths, [
    { uid: "g", day: 1, how: "night" },
    { uid: "h", day: 1, how: "night" },
  ]);
  assert.deepEqual(g.sec.story[0].lovers, ["g", "h"]);
  assert.deepEqual(g.sec.story[0].love, ["h"]);
  // Đêm sau không gọi Cupid nữa.
  g = timeout(timeout(skipTalk(g, 0), { opts }), { opts });
  assert.equal(g.pub.stage, "night");
  assert.deepEqual(nightTurns(g.pub), ["guard", "wolf", "seer", "witch"]);
});

test("người yêu bị treo cổ thì người kia chết theo ngay", () => {
  const opts = { ...DEFAULT_OPTIONS, cupid: true };
  let g = newGame(1, PLAYERS, opts, 0, rng(1));
  g.sec.roles = { a: "wolf", b: "wolf", c: "seer", d: "guard", e: "witch", f: "cupid", g: "villager", h: "villager" };
  g = timeout(g, { opts });
  g = night(g, { f: { day: 1, cupid: ["a", "h"] } }, opts);
  assert.deepEqual(g.sec.lovers, ["a", "h"]);
  assert.equal(secretFor(g, "h")!.loverRole, "wolf");
  g = skipTalk(g, 0);
  g = timeout(g, { opts, votes: { c: { day: 1, stage: "vote", target: "a" } } });
  assert.equal(g.pub.hanged, "a");
  assert.deepEqual(g.pub.deaths.slice(-2), [
    { uid: "a", day: 1, how: "hang", wolf: true },
    { uid: "h", day: 1, how: "love" },
  ]);
});

test("cặp đôi khác phe thắng khi chỉ còn hai người", () => {
  const roles: Record<string, Role> = { a: "wolf", b: "villager", c: "seer", d: "wolf" };
  assert.equal(winnerOf(["a", "b"], roles, ["a", "b"]), "lovers");
  assert.equal(winnerOf(["a", "b"], roles, null), "wolf");
  assert.equal(winnerOf(["a", "b", "c"], roles, ["a", "b"]), undefined, "Sói trong cặp đôi không tính vào bầy");
  assert.equal(winnerOf(["a", "b", "d"], roles, ["a", "b"]), undefined);
  assert.equal(winnerOf(["a", "d", "b", "c"], roles, ["a", "d"]), "wolf", "cặp đôi cùng phe Sói thì như thường");
  assert.equal(sideOf(roles, ["a", "b"], "a"), "lovers");
  assert.equal(sideOf(roles, ["a", "d"], "a"), "wolf");
  assert.equal(sideOf(roles, ["a", "b"], "c"), "village");
});

test("Bán Sói bị cắn thì hoá Sói, theo bầy từ đêm sau; được bảo vệ thì không sao", () => {
  const opts = { ...DEFAULT_OPTIONS, cursed: true };
  const setup = () => {
    const g = newGame(1, PLAYERS, opts, 0, rng(1));
    g.sec.roles = { a: "wolf", b: "wolf", c: "seer", d: "guard", e: "witch", f: "cursed", g: "villager", h: "villager" };
    return timeout(g, { opts });
  };
  let g = toTurn(setup(), "seer", {}, opts);
  g = step(g, { opts, now: 1, actions: { c: { day: 1, seer: "f", done: true } } });
  assert.deepEqual(secretFor(g, "c")!.seen, [{ day: 1, target: "f", wolf: false }], "Tiên Tri soi Bán Sói thấy không phải Sói");

  g = night(setup(), { a: { day: 1, wolf: "f" }, b: { day: 1, wolf: "f" } }, opts);
  assert.equal(g.pub.deaths.length, 0, "không ai chết");
  assert.equal(g.sec.roles.f, "wolf");
  assert.deepEqual(g.sec.turned, ["f"]);
  assert.equal(g.sec.story[0].turned, "f");
  const s = secretFor(g, "f")!;
  assert.equal(s.role, "wolf");
  assert.equal(s.turned, true);
  assert.deepEqual(s.pack, ["a", "b", "f"]);
  assert.deepEqual(secretFor(g, "a")!.pack, ["a", "b", "f"]);

  const h = night(setup(), { a: { day: 1, wolf: "f" }, b: { day: 1, wolf: "f" }, d: { day: 1, guard: "f" } }, opts);
  assert.equal(h.sec.roles.f, "cursed");
  assert.equal(h.pub.deaths.length, 0);
});

test("Bán Sói hoá Sói có thể khiến Sói thắng ngay lúc trời sáng", () => {
  const players = ["a", "b", "c", "d"];
  const opts = { ...DEFAULT_OPTIONS, seer: false, guard: false, witch: false, cursed: true };
  let g = newGame(1, players, opts, 0, rng(3));
  g.sec.roles = { a: "wolf", b: "cursed", c: "villager", d: "villager" };
  g = timeout(g, { opts });
  g = night(g, { a: { day: 1, wolf: "b" } }, opts);
  assert.equal(g.pub.winner, "wolf");
  assert.deepEqual(g.pub.turned, ["b"]);
  assert.equal(g.pub.roles?.b, "wolf");
});

/** Ván 8 người như `fixed`, h là Thợ Săn. */
function withHunter(opts: WolfOptions = { ...DEFAULT_OPTIONS, hunter: true }) {
  const g = fixed(opts);
  g.sec.roles.h = "hunter";
  return g;
}

test("Thợ Săn chết đêm: trời sáng xong được bắn một người rồi mới thảo luận", () => {
  let g = timeout(withHunter());
  g = dawnNow(g, { a: { day: 1, wolf: "h" }, b: { day: 1, wolf: "h" } });
  g = timeout(g);
  assert.equal(g.pub.stage, "hunt");
  assert.deepEqual(g.pub.hunt, { uid: "h", then: "day" });
  assert.deepEqual(g.pub.deaths, [{ uid: "h", day: 1, how: "night", hunter: true }], "lộ vai Thợ Săn");
  assert.equal(g.pub.until - g.pub.since, DURATION.hunt);
  // Bắn người đã chết / chính mình thì không tính.
  assert.equal(shotOf(g.pub, { h: { day: 1, stage: "hunt", target: "h" } }), undefined);
  g = step(g, { now: g.pub.since + 1, votes: { h: { day: 1, stage: "hunt", target: "a" } } });
  assert.equal(g.pub.stage, "day");
  assert.equal(g.pub.hunt, undefined);
  assert.deepEqual(g.pub.deaths.at(-1), { uid: "a", day: 1, how: "shot", by: "h" });
  assert.deepEqual(g.sec.story[0].shot, { by: "h", target: "a" });
});

test("Thợ Săn hết giờ không bắn thì thôi; bỏ làng thì không được bắn", () => {
  let g = timeout(withHunter());
  g = night(g, { a: { day: 1, wolf: "h" }, b: { day: 1, wolf: "h" } });
  assert.equal(g.pub.stage, "hunt");
  g = step(g, { now: g.pub.until });
  assert.equal(g.pub.stage, "day");
  assert.deepEqual(g.sec.story[0].shot, { by: "h", target: null });
  assert.equal(g.pub.deaths.length, 1);

  let h = timeout(withHunter());
  h = depart(h, "h");
  assert.equal(h.sec.trigger, undefined);
  h = night(h);
  assert.equal(h.pub.stage, "day");
});

test("Thợ Săn bị treo: chờ bắn xong mới xét thắng thua, rồi sang đêm", () => {
  const players = ["a", "b", "c", "d", "e"];
  const opts = { ...DEFAULT_OPTIONS, seer: false, guard: false, witch: false, hunter: true, wolves: 2 };
  let g = newGame(1, players, opts, 0, rng(3));
  g.sec.roles = { a: "wolf", b: "wolf", c: "hunter", d: "villager", e: "villager" };
  g = timeout(g, { opts });
  g = night(g, {}, opts);
  g = skipTalk(g, 0);
  g = timeout(g, { opts, votes: { a: { day: 1, stage: "vote", target: "c" } } });
  assert.equal(g.pub.hanged, "c");
  assert.equal(g.pub.winner, undefined, "2 Sói / 2 dân nhưng Thợ Săn chưa bắn");
  g = timeout(g, { opts });
  assert.equal(g.pub.stage, "hunt");
  assert.deepEqual(g.pub.hunt, { uid: "c", then: "night" });
  g = step(g, { opts, now: g.pub.since + 1, votes: { c: { day: 1, stage: "hunt", target: "a" } } });
  assert.equal(g.pub.winner, undefined);
  assert.equal(g.pub.stage, "night");
  assert.equal(g.pub.day, 2);
  // Không bắn thì Sói thắng ngay.
  let h = newGame(1, players, opts, 0, rng(3));
  h.sec.roles = { a: "wolf", b: "wolf", c: "hunter", d: "villager", e: "villager" };
  h = timeout(h, { opts });
  h = night(h, {}, opts);
  h = skipTalk(h, 0);
  h = timeout(h, { opts, votes: { a: { day: 1, stage: "vote", target: "c" } } });
  h = timeout(h, { opts });
  h = step(h, { opts, now: h.pub.since + 1, votes: { c: { day: 1, stage: "hunt", target: null } } });
  assert.equal(h.pub.winner, "wolf");
});

test("Dân đã thắng chắc thì Thợ Săn khỏi bắn", () => {
  let g = timeout(withHunter());
  g = depart(g, "b");
  g = night(g, { a: { day: 1, wolf: "h" }, e: { day: 1, poison: "a", done: true } });
  assert.equal(g.pub.winner, "village");
  assert.equal(g.pub.hunt, undefined);
});

test("Minion biết bầy Sói, bầy không biết Minion; tính như dân khi đếm, thắng cùng Sói", () => {
  const opts = { ...DEFAULT_OPTIONS, minion: true };
  assert.equal(castFor(8, opts).cast.minion, 1);
  let g = fixed(opts);
  g.sec.roles.h = "minion";
  g = timeout(g, { opts });
  assert.deepEqual(secretFor(g, "h"), { role: "minion", pack: ["a", "b"] });
  assert.deepEqual(secretFor(g, "a")!.pack, ["a", "b"]);
  g = toTurn(g, "seer", {}, opts);
  g = step(g, { opts, now: 1, actions: { c: { day: 1, seer: "h", done: true } } });
  assert.deepEqual(secretFor(g, "c")!.seen, [{ day: 1, target: "h", wolf: false }]);

  const roles: Record<string, Role> = { a: "wolf", m: "minion", v: "villager", w: "villager" };
  assert.equal(winnerOf(["a", "m", "v"], roles), undefined, "Minion không tính vào bầy");
  assert.equal(winnerOf(["a", "m"], roles), "wolf");
  assert.equal(winnerOf(["m", "v"], roles), "village", "hết Sói thì Dân thắng dù Minion còn sống");
  assert.equal(sideOf(roles, null, "m"), "wolf");
  assert.equal(sideOf(roles, ["m", "v"], "m"), "lovers", "Minion yêu dân là cặp đôi khác phe");
});

test("bỏ phiếu: đủ phiếu thì kết thúc sớm, người nhiều phiếu nhất bị treo và lộ có phải Sói không", () => {
  const opts = DEFAULT_OPTIONS;
  let g = timeout(fixed(opts), { opts });
  g = night(g, {}, opts);
  assert.equal(g.pub.stage, "day");
  const ready = Object.fromEntries(g.pub.alive.map((u) => [u, { day: 1, stage: "day", ready: true } as Vote]));
  g = step(g, { now: g.pub.since + 1, votes: ready, opts });
  assert.equal(g.pub.stage, "vote");
  const votes: Record<string, Vote> = {};
  for (const u of g.pub.alive) votes[u] = { day: 1, stage: "vote", target: u === "a" ? "c" : "a" };
  votes.h = { day: 1, stage: "vote", target: "h" };
  assert.equal(Object.keys(ballotsOf(g.pub, votes)).length, g.pub.alive.length - 1, "phiếu bầu chính mình không hợp lệ");
  g = step(g, { now: g.pub.since + 1, votes, opts });
  assert.equal(g.pub.stage, "vote", "còn người chưa bỏ phiếu hợp lệ");
  votes.h = { day: 1, stage: "vote", target: null };
  g = step(g, { now: g.pub.since + 1, votes, opts });
  assert.equal(g.pub.stage, "verdict");
  assert.equal(g.pub.hanged, "a");
  assert.deepEqual(g.pub.deaths.at(-1), { uid: "a", day: 1, how: "hang", wolf: true });
  assert.equal(g.sec.story[0].hanged, "a");
  assert.equal(g.sec.story[0].votes?.length, 1);
});

test("hoà phiếu: bỏ phiếu lại một lần giữa những người hoà", () => {
  let g = timeout(fixed());
  g = night(g);
  g = skipTalk(g, 0);
  const votes: Record<string, Vote> = { a: { day: 1, stage: "vote", target: "f" }, f: { day: 1, stage: "vote", target: "a" } };
  g = timeout(g, { votes });
  assert.equal(g.pub.stage, "revote");
  assert.deepEqual(g.pub.candidates, ["a", "f"]);
  assert.deepEqual(ballotsOf(g.pub, { ...votes, b: { day: 1, stage: "revote", target: "c" } }), {});
  g = timeout(g, { votes: { a: { day: 1, stage: "revote", target: "f" }, f: { day: 1, stage: "revote", target: "a" } } });
  assert.equal(g.pub.stage, "verdict");
  assert.equal(g.pub.hanged, null);
  assert.equal(g.sec.story[0].votes?.length, 2);

  const opts = { ...DEFAULT_OPTIONS, tie: "none" as const };
  let h = timeout(fixed(opts), { opts });
  h = night(h, {}, opts);
  h = skipTalk(h, 0);
  h = timeout(h, { votes, opts });
  assert.equal(h.pub.stage, "verdict");
  assert.equal(h.pub.hanged, null);
});

test("hết ván lộ hết vai và diễn biến", () => {
  const opts = DEFAULT_OPTIONS;
  let g = timeout(fixed(opts), { opts });
  g = night(g, { a: { day: 1, wolf: "f" } }, opts);
  assert.deepEqual(g.pub.deaths, [{ uid: "f", day: 1, how: "night" }]);
  assert.equal(g.pub.roles, undefined);
  assert.equal(g.pub.story, undefined);
  g = depart(g, "a");
  g = depart(g, "b");
  assert.equal(g.pub.winner, "village");
  assert.equal(g.pub.roles?.a, "wolf");
  assert.deepEqual(g.pub.story?.[0].left, ["a", "b"]);
});

test("Sói thắng khi bằng số người còn lại — kể cả lúc trời sáng", () => {
  const players = ["a", "b", "c", "d"];
  const opts = { ...DEFAULT_OPTIONS, seer: false, guard: false, witch: false };
  let g = newGame(1, players, opts, 0, rng(3));
  g.sec.roles = { a: "wolf", b: "villager", c: "villager", d: "villager" };
  g = timeout(g, { opts });
  g = night(g, { a: { day: 1, wolf: "b" } }, opts);
  assert.equal(g.pub.stage, "day");
  g = skipTalk(g, 0);
  g = timeout(g, { opts, votes: { a: { day: 1, stage: "vote", target: "c" }, d: { day: 1, stage: "vote", target: "c" } } });
  assert.equal(g.pub.hanged, "c");
  assert.equal(g.pub.winner, "wolf");
  assert.equal(timeout(g).pub.stage, "verdict", "ván đã ngã ngũ thì không chạy tiếp");
});

test("bí mật riêng: Sói biết đồng bọn và lựa chọn của nhau, dân không biết gì thêm; người xem thấy hết", () => {
  let g = timeout(fixed());
  // Sói thì thầm được cả khi chưa tới lượt.
  g = step(g, { now: 1, actions: { a: { day: 1, wolf: "f", say: [{ id: "1", text: " cắn f nhé " }] }, d: { day: 1, guard: "g", done: true } } });
  assert.equal(g.sec.whisper.length, 1);
  assert.equal(watchView(g).night?.guard, "g");
  assert.deepEqual(watchView(g).night?.done, ["d"]);
  assert.equal(secretFor(g, "d")!.done, true);
  g = step(g, { now: 2, actions: { a: { day: 1, wolf: "f", say: [{ id: "1", text: " cắn f nhé " }] } } });
  assert.equal(g.pub.turn, "wolf");
  const wolf = secretFor(g, "b")!;
  assert.deepEqual(wolf.pack, ["a", "b"]);
  assert.deepEqual(wolf.picks, { a: "f" });
  assert.deepEqual(wolf.whisper, [{ id: "1", uid: "a", text: "cắn f nhé" }]);
  assert.deepEqual(secretFor(g, "f"), { role: "villager" });
  g = step(g, { now: 3, actions: { a: { day: 1, say: [{ id: "1", text: "cắn f nhé" }] } } });
  assert.equal(g.sec.whisper.length, 1, "lời thì thầm gửi lại không bị nhân đôi");
  const w = watchView(g);
  assert.equal(w.roles.a, "wolf");
  assert.deepEqual(w.night?.wolves, { a: "f" });
  assert.equal(w.night?.victim, undefined, "bầy chưa thống nhất");
});

test("thảo luận do quản trò điều khiển: không hết giờ, chỉ quản trò cho bỏ phiếu", () => {
  const opts = { ...DEFAULT_OPTIONS, talk: 0 };
  let g = timeout(fixed(opts), { opts });
  g = night(g, {}, opts);
  assert.equal(g.pub.stage, "day");
  assert.equal(g.pub.until, g.pub.since, "không có đồng hồ đếm ngược");
  const ready = Object.fromEntries(g.pub.alive.map((u) => [u, { day: 1, stage: "day", ready: true } as Vote]));
  g = step(g, { now: g.pub.since + 3_600_000, votes: ready, opts });
  assert.equal(g.pub.stage, "day");
  g = skipTalk(g, g.pub.since + 1);
  assert.equal(g.pub.stage, "vote");
  assert.equal(normOptions({ talk: 0 }).talk, 0);
});

test("quản trò chơi cùng: một người sống bấm là bắt đầu bỏ phiếu", () => {
  for (const talk of [0, 120]) {
    const opts = { ...DEFAULT_OPTIONS, hostPlays: true, talk };
    let g = timeout(fixed(opts), { opts });
    g = night(g, { a: { day: 1, wolf: "f" } }, opts);
    assert.equal(g.pub.stage, "day");
    // Người đã chết bấm không tính.
    g = step(g, { now: g.pub.since + 1, opts, votes: { f: { day: 1, stage: "day", ready: true } } });
    assert.equal(g.pub.stage, "day");
    g = step(g, { now: g.pub.since + 1, opts, votes: { h: { day: 1, stage: "day", ready: true } } });
    assert.equal(g.pub.stage, "vote");
  }
});

test("ghép tên", () => {
  assert.equal(joinNames(["A"]), "A");
  assert.equal(joinNames(["A", "B", "C"]), "A, B và C");
});
