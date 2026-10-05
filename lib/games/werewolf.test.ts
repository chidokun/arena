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
  normOptions,
  secretFor,
  skipNight,
  skipTalk,
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

/** Qua đêm: nhận hành động, quản trò cho trời sáng, hết đếm ngược. */
function night(g: Game, actions: Record<string, Action> = {}, opts?: WolfOptions) {
  g = step(g, { actions, opts, now: g.pub.since + 1 });
  g = skipNight(g, g.pub.since + 2, rng(7));
  assert.equal(g.pub.stage, "dawn");
  return timeout(g, { opts });
}

/** Quản trò cho trời sáng ngay (sau khi đã nhận hành động). */
const dawnNow = (g: Game, actions: Record<string, Action> = {}) => skipNight(step(g, { actions, now: g.pub.since + 1 }), g.pub.since + 2, rng(7));

test("số Sói tự động và đội hình", () => {
  assert.deepEqual([4, 5, 6, 8, 9, 12, 15, 16].map(autoWolves), [1, 1, 2, 2, 3, 4, 5, 5]);
  const { cast, error } = castFor(8, DEFAULT_OPTIONS);
  assert.equal(error, undefined);
  assert.deepEqual(cast, { wolf: 2, seer: 1, guard: 1, witch: 1, villager: 3 });
  assert.match(castFor(3, DEFAULT_OPTIONS).error!, /ít nhất/);
  assert.match(castFor(4, { ...DEFAULT_OPTIONS, wolves: 2 }).error!, /quá nhiều/);
  assert.equal(castFor(4, DEFAULT_OPTIONS).cast.villager, 0);
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

test("đêm: mọi vai cùng thức, chốt hết thì đếm ngược rồi trời sáng", () => {
  let g = timeout(fixed());
  assert.equal(g.pub.stage, "night");
  const all: Record<string, Action> = {
    a: { day: 1, wolf: "f", done: true },
    b: { day: 1, wolf: "f", done: true },
    c: { day: 1, seer: "a", done: true },
    d: { day: 1, guard: "g", done: true },
    e: { day: 1, done: true },
  };
  // Chọn mà chưa chốt thì chưa sáng.
  g = step(g, { now: g.pub.since + DURATION.nightMin, actions: { ...all, d: { day: 1, guard: "g" } } });
  assert.equal(g.pub.stage, "night");
  // Tiên Tri chốt là có kết quả ngay trong đêm.
  assert.deepEqual(secretFor(g, "c")!.seen, [{ day: 1, target: "a", wolf: true }]);
  g = step(g, { now: g.pub.since + DURATION.nightMin, actions: all });
  assert.equal(g.pub.stage, "dawn");
  assert.equal(g.pub.until - g.pub.since, DURATION.dawn);
  // Đang đếm ngược: chưa công bố ai chết.
  assert.equal(g.pub.deaths.length, 0);
  g = timeout(g);
  assert.equal(g.pub.stage, "day");
  assert.deepEqual(g.pub.deaths, [{ uid: "f", day: 1, how: "night" }], "vai của người chết giữ bí mật");
  assert.equal(g.sec.lastGuard, "g");
  assert.deepEqual(g.sec.story[0], { day: 1, bite: "f", guard: "g", seer: { target: "a", wolf: true }, died: ["f"] });
});

test("đêm không hết giờ: chờ mọi vai chốt hoặc quản trò cho trời sáng", () => {
  let g = timeout(fixed());
  assert.equal(g.pub.stage, "night");
  assert.equal(g.pub.until, g.pub.since, "không có đồng hồ đếm ngược");
  g = step(g, { now: g.pub.since + 3_600_000, actions: { a: { day: 1, wolf: "f", done: true } } });
  assert.equal(g.pub.stage, "night");
  g = skipNight(g, g.pub.since + 3_600_001, rng(7));
  assert.equal(g.pub.stage, "dawn");
  assert.equal(g.sec.night.victim, "f", "lựa chọn đang có vẫn được tính");
});

test("chưa đủ thời lượng tối thiểu thì đêm chưa hết dù mọi người đã chốt", () => {
  let g = timeout(fixed());
  const acts: Record<string, Action> = {
    a: { day: 1, wolf: "f", done: true },
    b: { day: 1, wolf: "f", done: true },
    c: { day: 1, seer: "a", done: true },
    d: { day: 1, guard: "g", done: true },
    e: { day: 1, done: true },
  };
  g = step(g, { now: g.pub.since + 1, actions: acts });
  assert.equal(g.pub.stage, "night");
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
  g = step(g, { now: g.pub.since + 1, actions: { d: { day: 2, guard: "f" } } });
  assert.equal(g.sec.night.guard, undefined);
  g = step(g, { now: g.pub.since + 2, actions: { d: { day: 2, guard: "d" }, a: { day: 2, wolf: "f" } } });
  assert.equal(g.sec.night.guard, "d");
  // Hành động của đêm cũ bị bỏ qua.
  g = step(g, { now: g.pub.since + 3, actions: { b: { day: 1, wolf: "g" } } });
  assert.deepEqual(g.sec.night.wolves, { a: "f" });
});

test("Phù Thủy thấy người bầy Sói thống nhất cắn, cứu và đầu độc ngay trong đêm", () => {
  let g = timeout(fixed());
  g = step(g, { now: 1, actions: { a: { day: 1, wolf: "g" } } });
  assert.equal(secretFor(g, "e")!.victim, undefined, "bầy chưa thống nhất");
  g = step(g, { now: 2, actions: { a: { day: 1, wolf: "g" }, b: { day: 1, wolf: "g" } } });
  assert.equal(secretFor(g, "e")!.victim, "g");
  assert.equal(secretFor(g, "c")!.victim, undefined, "người khác không thấy nạn nhân");
  g = night(g, { a: { day: 1, wolf: "g" }, b: { day: 1, wolf: "g" }, e: { day: 1, save: "g", poison: "a", done: true } });
  assert.deepEqual(
    g.pub.deaths.map((d) => d.uid),
    ["a"],
  );
  assert.deepEqual(g.sec.potions, { save: false, poison: false });
  assert.equal(g.sec.story[0].save, "g");
  assert.equal(g.sec.story[0].poison, "a");
});

test("Phù Thủy cứu nhầm người (Sói đổi ý) thì không mất bình cứu", () => {
  let g = timeout(fixed());
  g = night(g, { a: { day: 1, wolf: "h" }, b: { day: 1, wolf: "h" }, e: { day: 1, save: "g", done: true } });
  assert.deepEqual(
    g.pub.deaths.map((d) => d.uid),
    ["h"],
  );
  assert.equal(g.sec.potions.save, true);
});

test("Phù Thủy hết thuốc thì không phải chờ chốt", () => {
  let g = timeout(fixed());
  g.sec.potions = { save: false, poison: false };
  const acts: Record<string, Action> = {
    a: { day: 1, wolf: "f", done: true },
    b: { day: 1, wolf: "f", done: true },
    c: { day: 1, seer: "a", done: true },
    d: { day: 1, guard: "g", done: true },
  };
  g = step(g, { now: g.pub.since + DURATION.nightMin, actions: acts });
  assert.equal(g.pub.stage, "dawn");
});

test("Tiên Tri chỉ soi một người mỗi đêm; chưa chốt mà hết đêm thì soi người đang chọn", () => {
  let g = timeout(fixed());
  g = step(g, { now: 1, actions: { c: { day: 1, seer: "f", done: true } } });
  g = step(g, { now: 2, actions: { c: { day: 1, seer: "a", done: true } } });
  assert.deepEqual(secretFor(g, "c")!.seen, [{ day: 1, target: "f", wolf: false }]);
  let h = timeout(fixed());
  h = step(h, { now: 1, actions: { c: { day: 1, seer: "b" } } });
  assert.deepEqual(secretFor(h, "c")!.seen, []);
  h = dawnNow(h, { c: { day: 1, seer: "b" } });
  assert.deepEqual(secretFor(h, "c")!.seen, [{ day: 1, target: "b", wolf: true }]);
});

test("Sói không đồng ý thì bốc thăm giữa các lựa chọn nhiều phiếu nhất", () => {
  let g = timeout(fixed());
  g = dawnNow(g, { a: { day: 1, wolf: "f" }, b: { day: 1, wolf: "g" } });
  assert.ok(["f", "g"].includes(g.sec.night.victim!));
  let h = timeout(fixed());
  h = step(h, { now: 1, actions: { a: { day: 1, wolf: "b" } } });
  assert.deepEqual(h.sec.night.wolves, {}, "Sói không cắn Sói");
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
  g = step(g, { now: 1, actions: { a: { day: 1, wolf: "f", say: [{ id: "1", text: " cắn f nhé " }] }, d: { day: 1, guard: "g", done: true } } });
  const wolf = secretFor(g, "b")!;
  assert.deepEqual(wolf.pack, ["a", "b"]);
  assert.deepEqual(wolf.picks, { a: "f" });
  assert.deepEqual(wolf.whisper, [{ id: "1", uid: "a", text: "cắn f nhé" }]);
  assert.deepEqual(secretFor(g, "f"), { role: "villager" });
  assert.equal(secretFor(g, "d")!.done, true);
  g = step(g, { now: 2, actions: { a: { day: 1, say: [{ id: "1", text: "cắn f nhé" }] } } });
  assert.equal(g.sec.whisper.length, 1, "lời thì thầm gửi lại không bị nhân đôi");
  const w = watchView(g);
  assert.equal(w.roles.a, "wolf");
  assert.deepEqual(w.night?.wolves, { a: "f" });
  assert.equal(w.night?.guard, "g");
  assert.deepEqual(w.night?.done, ["d"]);
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

test("ghép tên", () => {
  assert.equal(joinNames(["A"]), "A");
  assert.equal(joinNames(["A", "B", "C"]), "A, B và C");
});
