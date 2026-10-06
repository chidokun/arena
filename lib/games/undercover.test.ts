import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advance,
  autoUndercovers,
  ballotsOf,
  castFor,
  clueError,
  cluesOf,
  decide,
  DEFAULT_OPTIONS,
  depart,
  DURATION,
  mentions,
  newGame,
  normOptions,
  normWord,
  pickWords,
  readyOf,
  sameWord,
  secretFor,
  skipClue,
  skipTalk,
  speakerOf,
  speakers,
  tally,
  winnerOf,
  winnersOf,
  type Game,
  type Role,
  type Say,
  type UcOptions,
  type Vote,
} from "./undercover.ts";
import { PAIRS } from "./undercover-words.ts";

/** Bộ sinh số giả ngẫu nhiên có hạt giống (mulberry32). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYERS = ["a", "b", "c", "d", "e", "f"];
const WORDS = { civilian: "Cà phê", undercover: "Trà" };

/** Ván 6 người với phe cố định: a, b, c, d là Dân; e Gián Điệp; f phe Trắng. */
function fixed(opts: UcOptions = DEFAULT_OPTIONS, players = PLAYERS, roles: Role[] = ["civilian", "civilian", "civilian", "civilian", "undercover", "white"]): Game {
  const g = newGame(1, players, opts, WORDS, 0, rng(1));
  g.sec.roles = Object.fromEntries(players.map((u, i) => [u, roles[i] ?? "civilian"]));
  return g;
}

type Step = { clues?: Record<string, Say>; votes?: Record<string, Vote>; guesses?: Record<string, Say>; now: number; opts?: UcOptions };
const step = (g: Game, s: Step) =>
  advance(g, { clues: s.clues ?? {}, votes: s.votes ?? {}, guesses: s.guesses ?? {}, now: s.now, rand: rng(7), opts: s.opts ?? DEFAULT_OPTIONS });
const timeout = (g: Game, s: Omit<Step, "now"> = {}) => step(g, { ...s, now: g.pub.until });
const ready = (g: Game, uids: string[], at = 0): Record<string, Vote> =>
  Object.fromEntries(uids.map((u, i) => [u, { day: g.pub.day, stage: g.pub.stage, ready: true, at: at + i }]));

/** Ai cũng lật bài, sang lượt mô tả. */
function flipAll(g: Game, opts?: UcOptions) {
  g = step(g, { votes: ready(g, g.pub.alive), opts, now: g.pub.since + DURATION.introMin });
  assert.equal(g.pub.stage, "clue");
  return g;
}

/** Ai cũng mô tả (gửi cùng lúc, nhận theo thứ tự), sang thảo luận. */
function describe(g: Game, opts?: UcOptions) {
  const clues: Record<string, Say> = {};
  for (const u of g.pub.alive) clues[u] = { day: g.pub.day, text: `mô tả của ${u}` };
  g = step(g, { clues, opts, now: g.pub.since + 1 });
  assert.equal(g.pub.stage, "talk");
  return g;
}

/** Xác nhận phiếu theo bảng `voter → target` rồi hết giờ. */
function vote(g: Game, ballots: Record<string, string>, opts?: UcOptions) {
  const votes: Record<string, Vote> = {};
  for (const [v, t] of Object.entries(ballots)) votes[v] = { day: g.pub.day, stage: g.pub.stage, target: t };
  return timeout(g, { votes, opts });
}

/** Từ đầu ván tới lúc biểu quyết vòng đầu. */
const toVote = (g: Game, opts?: UcOptions) => skipTalk(describe(flipAll(g, opts), opts), 1);

test("bộ từ: đúng 1000 cặp, không cặp nào trùng hay hai từ như nhau", () => {
  assert.equal(PAIRS.length, 1000);
  const keys = new Set<string>();
  for (const [a, b] of PAIRS) {
    assert.ok(a && b, `cặp rỗng: ${a}|${b}`);
    assert.notEqual(normWord(a), normWord(b), `hai từ như nhau: ${a}|${b}`);
    const k = [normWord(a), normWord(b)].sort().join("|");
    assert.ok(!keys.has(k), `trùng cặp: ${a}|${b}`);
    keys.add(k);
  }
});

test("bốc cặp từ: tránh mã đã dùng; dùng hết thì bốc lại từ đầu", () => {
  const used = PAIRS.map((_, i) => i).filter((i) => i !== 42);
  const w = pickWords(used, rng(3));
  assert.equal(w.id, 42);
  assert.deepEqual([w.civilian, w.undercover].sort(), [...PAIRS[42]].sort());
  const all = PAIRS.map((_, i) => i);
  assert.ok(pickWords(all, rng(4)).id < PAIRS.length);
});

test("tuỳ chọn lạ thì về mặc định; chủ phòng cũng chơi thì không được tự phá hoà", () => {
  assert.deepEqual(normOptions(null), DEFAULT_OPTIONS);
  const o = normOptions({ undercovers: 9, whites: 7, tie: "host", hostPlays: true, white: "x" });
  assert.equal(o.undercovers, DEFAULT_OPTIONS.undercovers);
  assert.equal(o.whites, 1);
  assert.equal(o.white, true);
  assert.equal(o.tie, "random");
  assert.equal(normOptions({ tie: "host", hostPlays: false }).tie, "host");
  assert.equal(normOptions({ white: false }).white, false);
});

test("đội hình: bật / tắt phe Trắng, lỗi khi phe Dân không đông hơn", () => {
  assert.equal(autoUndercovers(3), 1);
  assert.equal(autoUndercovers(8), 2);
  const noWhite = { ...DEFAULT_OPTIONS, white: false };
  assert.deepEqual(castFor(3, noWhite), { cast: { civilian: 2, undercover: 1, white: 0 } });
  assert.deepEqual(castFor(5, DEFAULT_OPTIONS).cast, { civilian: 3, undercover: 1, white: 1 });
  assert.deepEqual(castFor(10, { ...DEFAULT_OPTIONS, whites: 2 }).cast, { civilian: 5, undercover: 3, white: 2 });
  assert.match(castFor(4, DEFAULT_OPTIONS).error ?? "", /tắt phe Trắng/);
  assert.equal(castFor(4, noWhite).error, undefined);
  assert.ok(castFor(2, noWhite).error);
  assert.ok(castFor(21, DEFAULT_OPTIONS).error);
});

test("so từ khoá không phân biệt dấu, hoa thường; nhận ra câu nói thẳng từ khoá", () => {
  assert.ok(sameWord("ca phe", "Cà phê"));
  assert.ok(sameWord(" CÀPHÊ ", "Cà phê"));
  assert.ok(sameWord("duong", "Đường"));
  assert.ok(!sameWord("trà", "Cà phê"));
  assert.ok(!sameWord("", "Cà phê"));
  assert.ok(mentions("uống cà phê sáng", "Cà phê"));
  assert.ok(!mentions("camera", "Cam"));
  assert.equal(clueError("có mùi thơm", "Cà phê"), undefined);
  assert.ok(clueError("  ", "Cà phê"));
  assert.ok(clueError("Cà Phê sữa", "Cà phê"));
  assert.equal(clueError("cà phê", null), undefined);
});

test("chia phe đúng đội hình; bí mật: từ khoá của phe mình, phe Trắng không có từ", () => {
  const g = newGame(1, PLAYERS, DEFAULT_OPTIONS, WORDS, 0, rng(5));
  const roles = Object.values(g.sec.roles);
  assert.equal(roles.filter((r) => r === "undercover").length, 1);
  assert.equal(roles.filter((r) => r === "white").length, 1);
  const f = fixed();
  assert.deepEqual(secretFor(f, "a"), { word: "Cà phê", role: "civilian" });
  assert.deepEqual(secretFor(f, "e"), { word: "Trà", role: "undercover" });
  assert.deepEqual(secretFor(f, "f"), { word: null, role: "white" });
  assert.equal(secretFor(f, "x"), undefined);
  const hidden = fixed({ ...DEFAULT_OPTIONS, reveal: false });
  assert.deepEqual(secretFor(hidden, "a"), { word: "Cà phê" });
  assert.deepEqual(secretFor(hidden, "f"), { word: null, role: "white" });
});

test("thứ tự thảo luận chốt lúc phát từ: đủ mọi người, phe Trắng không nói đầu", () => {
  for (let seed = 0; seed < 30; seed++) {
    const g = newGame(1, PLAYERS, DEFAULT_OPTIONS, WORDS, 0, rng(seed));
    assert.deepEqual([...g.pub.order].sort(), PLAYERS);
    assert.notEqual(g.sec.roles[g.pub.order[0]], "white");
  }
});

test("phát từ: mọi người lật bài (sau tối thiểu vài giây) hoặc hết giờ thì sang lượt mô tả", () => {
  const g = fixed();
  assert.equal(step(g, { votes: ready(g, PLAYERS.slice(0, 5)), now: 5000 }).pub.stage, "intro");
  assert.equal(step(g, { votes: ready(g, PLAYERS), now: 1000 }).pub.stage, "intro");
  assert.equal(step(g, { votes: ready(g, PLAYERS), now: DURATION.introMin }).pub.stage, "clue");
  assert.equal(timeout(g).pub.stage, "clue");
  assert.deepEqual(readyOf(g.pub, ready(g, ["c", "a"])), ["c", "a"]);
});

test("mô tả: bắt buộc lần lượt theo thứ tự, không đếm giờ", () => {
  let g = flipAll(fixed());
  const [first, second, third] = g.pub.order;
  assert.equal(speakerOf(g.pub), first);
  assert.equal(g.pub.until, g.pub.since, "lượt mô tả không có hạn chót");
  // Người sau nói trước lượt thì phải chờ; chờ bao lâu cũng không tự bỏ lượt.
  g = step(g, { clues: { [second]: { day: 1, text: "ngon" } }, now: g.pub.since + 9999999 });
  assert.equal(speakerOf(g.pub), first);
  // Mô tả của vòng khác không tính.
  g = step(g, { clues: { [first]: { day: 0, text: "cũ" } }, now: 5 });
  assert.equal(speakerOf(g.pub), first);
  g = step(g, { clues: { [first]: { day: 1, text: " thơm " }, [second]: { day: 1, text: "ngon" } }, now: 5 });
  assert.equal(speakerOf(g.pub), third);
  assert.deepEqual(cluesOf(g.pub), [
    { uid: first, day: 1, text: "thơm" },
    { uid: second, day: 1, text: "ngon" },
  ]);
});

test("mô tả: chủ phòng bỏ qua lượt người treo máy; người đang mô tả rời ván thì sang người kế", () => {
  let g = flipAll(fixed());
  const [first, second, third] = g.pub.order;
  g = skipClue(g, 10);
  assert.deepEqual(g.pub.clues, [{ uid: first, day: 1, text: null }]);
  assert.equal(speakerOf(g.pub), second);
  g = depart(g, second);
  assert.equal(speakerOf(g.pub), third);
  g = describe(g);
  assert.equal(g.pub.clues.length, PLAYERS.length - 1);
});

test("thảo luận: chỉ sau khi mô tả xong; ai bấm biểu quyết cũng được, ghi lại người gọi; không tự hết giờ", () => {
  const c = flipAll(fixed());
  assert.equal(step(c, { votes: ready({ ...c, pub: { ...c.pub, stage: "talk" } }, ["a"]), now: 1 }).pub.stage, "clue");
  let g = describe(c);
  assert.equal(step(g, { now: g.pub.since + 999999 }).pub.stage, "talk");
  // Bản ghi lật bài (giai đoạn phát từ) không tính là bấm biểu quyết.
  assert.equal(step(g, { votes: { a: { day: 1, stage: "intro", ready: true } }, now: g.pub.since + 1 }).pub.stage, "talk");
  g = step(g, { votes: ready(g, ["d", "b"], 100), now: g.pub.since + 1 });
  assert.equal(g.pub.stage, "vote");
  assert.deepEqual(g.pub.calls, [{ day: 1, uid: "d" }]);
});

test("phiếu: không loại chính mình, người đã bị loại không bầu và không bị bầu", () => {
  let g = toVote(fixed());
  g = depart(g, "d");
  const votes: Record<string, Vote> = {
    a: { day: 1, stage: "vote", target: "a" },
    b: { day: 1, stage: "vote", target: "d" },
    c: { day: 1, stage: "vote", target: "e" },
    d: { day: 1, stage: "vote", target: "e" },
    e: { day: 0, stage: "vote", target: "c" },
  };
  assert.deepEqual(ballotsOf(g.pub, votes), { c: "e" });
  assert.deepEqual(tally({ a: "x", b: "y", c: "x" }).top, ["x"]);
  assert.deepEqual(speakers(g.pub), g.pub.order.filter((u) => u !== "d"));
});

test("ai cũng xác nhận phiếu thì loại ngay, không chờ hết giờ; lộ phe", () => {
  const g = toVote(fixed());
  const votes: Record<string, Vote> = {};
  for (const u of PLAYERS) votes[u] = { day: 1, stage: "vote", target: u === "b" ? "a" : "b" };
  const h = step(g, { votes, now: g.pub.since + 1 });
  assert.equal(h.pub.stage, "verdict");
  assert.deepEqual(h.pub.outs, [{ uid: "b", day: 1, role: "civilian", how: "vote" }]);
});

test("loại Gián Điệp cuối cùng mà không còn phe Trắng: phe Dân thắng", () => {
  const noWhite = { ...DEFAULT_OPTIONS, white: false };
  let g = toVote(fixed(noWhite, ["a", "b", "c", "d"], ["civilian", "civilian", "civilian", "undercover"]), noWhite);
  g = vote(g, { a: "d", b: "d", c: "d", d: "a" }, noWhite);
  assert.equal(g.pub.out, "d");
  assert.equal(g.pub.winner, "civilian");
  assert.deepEqual(g.pub.winners, ["a", "b", "c"]);
  assert.equal(g.pub.words?.undercover, "Trà");
});

test("loại phe Dân: lật bài rồi sang vòng mô tả mới, giữ nguyên thứ tự", () => {
  let g = toVote(fixed());
  const order = g.pub.order;
  g = vote(g, { a: "b", c: "b", d: "b", e: "b", f: "a", b: "a" });
  assert.equal(g.pub.out, "b");
  assert.equal(g.pub.winner, undefined);
  g = timeout(g);
  assert.equal(g.pub.stage, "clue");
  assert.equal(g.pub.day, 2);
  assert.deepEqual(g.pub.order, order);
  assert.equal(speakerOf(g.pub), order.find((u) => u !== "b"));
  assert.ok(!speakers(g.pub).includes("b"));
  assert.equal(g.pub.out, undefined);
});

test("hoà phiếu: bỏ phiếu phụ giữa những người hoà; vẫn hoà thì theo luật", () => {
  const tieVotes = { a: "e", b: "e", c: "f", d: "f", e: "a", f: "a" };
  const g = vote(toVote(fixed()), tieVotes);
  assert.equal(g.pub.stage, "revote");
  assert.deepEqual(g.pub.candidates, ["a", "e", "f"]);
  assert.deepEqual(ballotsOf(g.pub, { b: { day: 1, stage: "revote", target: "c" } }), {});
  const random = vote(g, tieVotes);
  assert.equal(random.pub.stage, "verdict");
  assert.equal(random.pub.tiebreak, "random");
  assert.ok(["a", "e", "f"].includes(random.pub.out!));

  const none = { ...DEFAULT_OPTIONS, tie: "none" as const };
  const n = vote(vote(toVote(fixed(none), none), tieVotes, none), tieVotes, none);
  assert.equal(n.pub.out, null);
  assert.equal(n.pub.alive.length, 6);

  const host = normOptions({ tie: "host", hostPlays: false });
  let h = vote(vote(toVote(fixed(host), host), tieVotes, host), tieVotes, host);
  assert.equal(h.pub.stage, "decide");
  assert.equal(decide(h, "b", 1), h);
  h = decide(h, "e", 1);
  assert.equal(h.pub.out, "e");
  assert.equal(h.pub.tiebreak, "host");
  assert.equal(h.pub.tallies.length, 2);
});

test("phe Trắng bị loại được đoán: đúng thì thắng ngay", () => {
  let g = vote(toVote(fixed()), { a: "f", b: "f", c: "f", d: "f", e: "f", f: "a" });
  assert.equal(g.pub.out, "f");
  g = timeout(g);
  assert.equal(g.pub.stage, "guess");
  assert.equal(step(g, { guesses: { a: { day: 1, text: "cà phê" } }, now: g.pub.since + 1 }).pub.stage, "guess");
  g = step(g, { guesses: { f: { day: 1, text: "ca phe" } }, now: g.pub.since + 1 });
  assert.equal(g.pub.stage, "judged");
  assert.deepEqual(g.pub.guesses, [{ uid: "f", day: 1, text: "ca phe", right: true }]);
  assert.equal(g.pub.winner, "white");
  assert.deepEqual(g.pub.winners, ["f"]);
});

test("phe Trắng đoán sai (hoặc hết giờ): chết, ván tiếp tục; là người cuối thì phe Dân thắng sau khi đoán", () => {
  let g = vote(toVote(fixed()), { a: "f", b: "f", c: "f", d: "f", e: "f", f: "a" });
  g = timeout(g);
  g = step(g, { guesses: { f: { day: 1, text: "Trà" } }, now: g.pub.since + 1 });
  assert.equal(g.pub.guesses[0].right, false);
  assert.equal(g.pub.winner, undefined);
  g = timeout(g);
  assert.equal(g.pub.stage, "clue");
  assert.equal(g.pub.day, 2);

  let last = vote(toVote(fixed(DEFAULT_OPTIONS, ["a", "b", "c", "d"], ["civilian", "civilian", "civilian", "white"])), { a: "d", b: "d", c: "d", d: "a" });
  assert.equal(last.pub.winner, undefined);
  last = timeout(timeout(last));
  assert.deepEqual(last.pub.guesses, [{ uid: "d", day: 1, text: null, right: false }]);
  assert.equal(last.pub.winner, undefined);
  assert.equal(timeout(last).pub.winner, "civilian");
});

test("Gián Điệp đông bằng phe Dân thì thắng, phe Trắng còn sống thắng cùng", () => {
  const roles: Record<string, Role> = { a: "civilian", b: "civilian", c: "undercover", d: "white", e: "civilian" };
  assert.equal(winnerOf(["a", "b", "c", "d", "e"], roles), undefined);
  assert.equal(winnerOf(["a", "c", "d"], roles), "undercover");
  assert.equal(winnerOf(["a", "d"], roles), "white");
  assert.equal(winnerOf(["a", "b"], roles), "civilian");
  assert.deepEqual(winnersOf("undercover", roles, ["a", "c", "d"]), ["c", "d"]);
  assert.deepEqual(winnersOf("undercover", roles, ["a", "c"]), ["c"]);
});

test("rời ván: lộ phe, có thể khiến ván ngã ngũ", () => {
  const noWhite = { ...DEFAULT_OPTIONS, white: false };
  let g = flipAll(fixed(noWhite, ["a", "b", "c", "d"], ["civilian", "civilian", "civilian", "undercover"]), noWhite);
  g = depart(g, "a");
  assert.deepEqual(g.pub.outs, [{ uid: "a", day: 1, role: "civilian", how: "left" }]);
  assert.equal(g.pub.winner, undefined);
  g = depart(g, "d");
  assert.equal(g.pub.winner, "civilian");
  assert.equal(depart(g, "b"), g);
});
