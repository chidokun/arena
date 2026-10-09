import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AWAY_MS,
  canUndo,
  DRAWER_POINTS,
  guessPoints,
  hintCount,
  hintsDue,
  isNear,
  isRight,
  leaks,
  maskOf,
  newMatch,
  normOptions,
  parseOp,
  pickChoices,
  PICK_MS,
  SHOW_MS,
  SKIP_MS,
  standings,
  tick,
  totalTurns,
  visibleOps,
  winnersOf,
  type HostState,
  type TickInput,
} from "./draw-guess.ts";
import { TIERS, tierOf, wordId, wordOf } from "./draw-guess-words.ts";

/** Bộ sinh số giả ngẫu nhiên tất định cho test. */
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const everyone = { online: () => true, silent: () => 0 };

function input(now: number, extra: Partial<TickInput> = {}): TickInput {
  return { now, rand: rng(7), guesses: {}, ...everyone, ...extra };
}

/** Chạy tới khi qua giai đoạn chọn từ: người vẽ chọn từ thứ `pick`. */
function startDrawing(s: HostState, now: number, pick = 0) {
  return tick(s, input(now, { pick: { turn: s.pub.turn, pick } }));
}

test("bộ từ: không trùng (kể cả khi bỏ dấu), mã từ ổn định theo mức", () => {
  const fold = (w: string) => w.replace(/[đĐ]/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const all = TIERS.flat();
  assert.equal(new Set(all.map(fold)).size, all.length);
  assert.ok(TIERS.every((t) => t.length >= 80 && t.length < 1000));
  assert.equal(wordOf(wordId(1, 3)), TIERS[1][3]);
  assert.equal(tierOf(wordId(2, 5)), 2);
  assert.equal(wordOf(5000), undefined);
});

test("đoán đúng: không phân biệt dấu, hoa thường, khoảng trắng; được bỏ loại từ đứng đầu", () => {
  assert.ok(isRight("con mèo", "con mèo"));
  assert.ok(isRight("  CON MEO ", "con mèo"));
  assert.ok(isRight("mèo", "con mèo"));
  assert.ok(isRight("meo", "con mèo"));
  assert.ok(isRight("conmeo", "con mèo"));
  assert.ok(isRight("rô bốt", "rô bốt"));
  assert.ok(isRight("con robot", "rô bốt"));
  assert.ok(isRight("tháp eiffel", "tháp Eiffel"));
  assert.ok(isRight("dong ho", "đồng hồ"));
  assert.equal(isRight("con", "con mèo"), false);
  assert.equal(isRight("chó", "con mèo"), false);
  assert.equal(isRight("", "con mèo"), false);
  // Lời đoán được bỏ những tiếng hay nói kèm phía trước…
  assert.ok(isRight("người nông dân", "nông dân"));
  assert.ok(isRight("xe ô tô", "ô tô"));
  assert.ok(isRight("một con mèo", "con mèo"));
  assert.ok(isRight("mot con meo", "con mèo"));
  assert.ok(isRight("ông mặt trời", "mặt trời"));
  // …nhưng từ khoá thì không: "tuyết" không ăn "người tuyết", "đạp" không ăn "xe đạp".
  assert.equal(isRight("tuyết", "người tuyết"), false);
  assert.equal(isRight("đạp", "xe đạp"), false);
  assert.equal(isRight("xe", "xe đạp"), false);
});

test("gần đúng: sai một ký tự (hai với từ dài), từ ngắn thì không có", () => {
  assert.ok(isNear("con meu", "con mèo"));
  assert.ok(isNear("dong hoo", "đồng hồ"));
  assert.ok(isNear("khung lon", "con khủng long"));
  assert.ok(isNear("phi hanh za", "phi hành gia"));
  assert.equal(isNear("con mèo", "con mèo"), false);
  assert.equal(isNear("cá", "cá"), false);
  assert.equal(isNear("xe buyt", "con mèo"), false);
  assert.equal(isNear("mo", "ô tô"), false);
});

test("người biết đáp án không được nói ra trong chat", () => {
  assert.ok(leaks("gợi ý: con mèo nhé", "con mèo"));
  assert.ok(leaks("MÈO!!!", "con mèo"));
  assert.equal(leaks("con chó", "con mèo"), false);
  assert.equal(leaks("mèo mun", "con chó"), false);
});

test("khung đáp án và gợi ý chữ cái", () => {
  assert.equal(maskOf("con mèo", []), "___ ___");
  assert.equal(maskOf("con mèo", [0, 5]), "c__ _è_");
  assert.equal(hintCount("bò"), 0);
  assert.equal(hintCount("con mèo"), 2);
  assert.equal(hintCount("phi hành gia"), 3);
  assert.equal(hintsDue("con mèo", 0.2), 0);
  assert.equal(hintsDue("con mèo", 0.5), 1);
  assert.equal(hintsDue("con mèo", 0.9), 2);
  assert.equal(hintsDue("bò", 0.9), 0);
});

test("điểm: đoán càng sớm càng nhiều", () => {
  assert.equal(guessPoints(1), 300);
  assert.equal(guessPoints(0), 60);
  assert.equal(guessPoints(-1), 60);
  assert.equal(guessPoints(0.5), 180);
  assert.ok(guessPoints(0.9) > guessPoints(0.3));
  assert.equal(guessPoints(0.33) % 5, 0);
});

test("ba từ để chọn: mỗi mức một từ, tránh từ đã chơi", () => {
  const used = TIERS[0].slice(1).map((_, i) => wordId(0, i + 1));
  const choices = pickChoices(used, rng(3));
  assert.deepEqual(choices.map(tierOf), [0, 1, 2]);
  assert.equal(choices[0], wordId(0, 0));
  // Hết từ ở một mức thì bốc lại cả mức.
  const all = TIERS[0].map((_, i) => wordId(0, i));
  assert.equal(tierOf(pickChoices(all, rng(4))[0]), 0);
});

test("luật phòng chuẩn hoá về giá trị hợp lệ", () => {
  assert.deepEqual(normOptions({ rounds: 9, time: 33, hints: "x" }), { rounds: 2, time: 80, hints: true });
  assert.deepEqual(normOptions({ rounds: 3, time: 120, hints: false }), { rounds: 3, time: 120, hints: false });
});

test("một lượt trọn vẹn: chọn từ → vẽ → đoán → lộ đáp án → lượt sau", () => {
  let s = newMatch(1, ["a", "b", "c"], { rounds: 1, time: 60, hints: true }, [], input(0));
  assert.equal(totalTurns(s.pub), 3);
  assert.equal(s.pub.phase, "pick");
  assert.equal(s.pub.until, PICK_MS);
  const drawer = s.pub.drawer;
  const [g1, g2] = s.pub.order.filter((u) => u !== drawer);
  assert.equal(s.secret?.choices.length, 3);

  s = startDrawing(s, 1000, 1);
  assert.equal(s.pub.phase, "draw");
  assert.equal(s.pub.pick, 1);
  assert.equal(s.pub.tier, 1);
  const word = wordOf(s.secret!.word!)!;
  assert.equal(s.pub.mask, maskOf(word, []));

  // g1 đoán sai rồi đúng; g2 đoán sai.
  s = tick(s, input(31000, { guesses: { [g1]: { turn: 0, list: ["zzzz", word] }, [g2]: { turn: 0, list: ["qqqqqq"] } } }));
  assert.deepEqual(
    s.pub.hits.map((h) => [h.u, h.i]),
    [[g1, 1]],
  );
  assert.equal(s.pub.hits[0].p, guessPoints(0.5));
  assert.deepEqual(
    s.feed.list.map((f) => [f.u, f.t]),
    [
      [g1, "zzzz"],
      [g2, "qqqqqq"],
    ],
  );
  // Đã chấm thì không chấm lại.
  const again = tick(s, input(31500, { guesses: { [g1]: { turn: 0, list: ["zzzz", word] }, [g2]: { turn: 0, list: ["qqqqqq"] } } }));
  assert.equal(again.feed, s.feed);
  assert.equal(again.pub.hits.length, 1);

  // g2 cũng đoán đúng → cả bàn đoán xong, lộ đáp án.
  s = tick(s, input(41000, { guesses: { [g2]: { turn: 0, list: ["qqqqqq", word.toUpperCase()] } } }));
  assert.equal(s.pub.phase, "show");
  assert.equal(s.pub.last?.end, "all");
  assert.equal(s.pub.last?.word, word);
  assert.equal(s.pub.last?.dp, 2 * DRAWER_POINTS);
  assert.equal(s.pub.scores[drawer], 2 * DRAWER_POINTS);
  assert.ok(s.pub.scores[g1] > s.pub.scores[g2]);
  assert.deepEqual(s.used, [s.secret!.word]);

  // Hết giờ lộ đáp án thì sang lượt sau với người vẽ khác.
  assert.equal(tick(s, input(41000 + SHOW_MS - 1)), s);
  s = tick(s, input(41000 + SHOW_MS));
  assert.equal(s.pub.turn, 1);
  assert.equal(s.pub.phase, "pick");
  assert.notEqual(s.pub.drawer, drawer);
  assert.equal(s.pub.hits.length, 0);
  assert.equal(s.feed.list.length, 0);
});

test("hết giờ chọn thì bốc thay; hết giờ vẽ thì lộ đáp án; gợi ý mở dần", () => {
  let s = newMatch(1, ["a", "b"], { rounds: 1, time: 60, hints: true }, [], input(0));
  s = tick(s, input(PICK_MS));
  assert.equal(s.pub.phase, "draw");
  const word = wordOf(s.secret!.word!)!;
  const t0 = s.pub.since;
  const revealed = (mask: string) => [...mask].filter((ch) => ch !== "_" && ch !== " ").length;
  s = tick(s, input(t0 + 0.55 * 60000));
  assert.equal(revealed(s.pub.mask!), Math.min(1, hintCount(word)));
  s = tick(s, input(t0 + 60000));
  assert.equal(s.pub.phase, "show");
  assert.equal(s.pub.last?.end, "time");
  assert.equal(s.pub.last?.hits.length, 0);
  assert.equal(s.pub.scores[s.pub.drawer], 0);
});

test("người vẽ vắng mặt thì bỏ lượt; bỏ đi giữa lượt thì dừng lượt", () => {
  const away = (u: string) => (uid: string) => uid !== u;
  let s = newMatch(1, ["a", "b", "c"], { rounds: 1, time: 60, hints: false }, [], { now: 0, rand: rng(2), online: () => true });
  const first = s.pub.drawer;
  s = startDrawing(s, 500);
  s = tick(s, input(1000 + AWAY_MS, { silent: (u) => (u === first ? AWAY_MS : 0) }));
  assert.equal(s.pub.phase, "show");
  assert.equal(s.pub.last?.end, "away");
  assert.ok(s.pub.last?.word);

  const second = s.pub.order[1];
  s = tick(s, input(1000 + AWAY_MS + SHOW_MS, { online: away(second) }));
  assert.equal(s.pub.turn, 1);
  assert.equal(s.pub.phase, "show");
  assert.equal(s.pub.last?.end, "skip");
  assert.equal(s.pub.until, 1000 + AWAY_MS + SHOW_MS + SKIP_MS);
  assert.equal(s.secret, null);
});

test("chủ phòng mới không có bộ từ thì dừng lượt, ván vẫn tiếp tục", () => {
  let s = newMatch(1, ["a", "b"], { rounds: 1, time: 60, hints: false }, [], input(0));
  s = startDrawing(s, 100);
  s = tick({ ...s, secret: null }, input(200));
  assert.equal(s.pub.phase, "show");
  assert.equal(s.pub.last?.end, "lost");
  assert.equal(s.pub.last?.word, null);
  s = tick(s, input(200 + SKIP_MS));
  assert.equal(s.pub.turn, 1);
  assert.equal(s.pub.phase, "pick");
});

test("gần đúng báo riêng, không công khai; lời đoán của lượt khác bị bỏ qua", () => {
  let s = newMatch(1, ["a", "b"], { rounds: 1, time: 60, hints: false }, [], input(0));
  s = startDrawing(s, 0);
  // Ép từ của lượt thành "con mèo" để kiểm tra tất định.
  s = { ...s, secret: { ...s.secret!, word: wordId(0, TIERS[0].indexOf("con mèo")) } };
  const g = s.pub.order.find((u) => u !== s.pub.drawer)!;
  s = tick(s, input(1000, { guesses: { [g]: { turn: 0, list: ["con meu", "con chó"] } } }));
  assert.deepEqual(s.secret?.near[g], [0]);
  assert.deepEqual(
    s.feed.list.map((f) => [f.i, f.t]),
    [[1, "con chó"]],
  );
  assert.equal(s.pub.hits.length, 0);
  const stale = tick(s, input(2000, { guesses: { [g]: { turn: 5, list: ["con meu", "con chó", "mèo"] } } }));
  assert.equal(stale.pub.hits.length, 0);
  s = tick(s, input(2000, { guesses: { [g]: { turn: 0, list: ["con meu", "con chó", "mèo", "con mèo"] } } }));
  assert.deepEqual(s.pub.hits.map((h) => h.i), [2]);
  // Cả bàn (một người đoán) đã đúng thì lộ đáp án ngay, lời đoán sau đó không được chấm.
  assert.equal(s.pub.phase, "show");
  assert.equal(s.pub.last?.word, "con mèo");
});

test("hết lượt cuối thì xong ván; xếp hạng đồng hạng, người thắng", () => {
  let s = newMatch(1, ["a", "b"], { rounds: 1, time: 60, hints: false }, [], input(0));
  for (let t = 0; t < 2; t++) {
    s = startDrawing(s, s.pub.since + 10);
    const word = wordOf(s.secret!.word!)!;
    const g = s.pub.order.find((u) => u !== s.pub.drawer)!;
    s = tick(s, input(s.pub.since + 1000, { guesses: { [g]: { turn: s.pub.turn, list: [word] } } }));
    assert.equal(s.pub.phase, "show");
    s = tick(s, input(s.pub.until));
  }
  assert.equal(s.pub.phase, "over");
  const table = standings(s.pub);
  assert.equal(table.length, 2);
  assert.ok(table[0].score >= table[1].score);
  assert.ok(winnersOf(s.pub).length >= 1);

  const tie = { ...s.pub, scores: { a: 100, b: 100 } };
  assert.deepEqual(
    standings(tie).map((x) => x.rank),
    [1, 1],
  );
  assert.deepEqual(winnersOf(tie).sort(), ["a", "b"]);
  assert.deepEqual(winnersOf({ ...s.pub, scores: { a: 0, b: 0 } }), []);
});

test("nét vẽ: kiểm tra khuôn, hoàn tác, xoá tranh", () => {
  assert.deepEqual(parseOp({ c: 1, z: 2, p: [0, 0, 800, 600] }), { c: 1, z: 2, p: [0, 0, 800, 600] });
  assert.equal(parseOp({ c: 1, z: 2, p: [0, 0, 801, 600] }), null);
  assert.equal(parseOp({ c: 99, z: 0, p: [1, 1] }), null);
  assert.equal(parseOp({ c: 1, z: 0, p: [1] }), null);
  assert.equal(parseOp({ c: 1, z: 0, p: [1.5, 2] }), null);
  assert.deepEqual(parseOp({ f: 4, p: [10, 20] }), { f: 4, p: [10, 20] });
  assert.equal(parseOp({ f: 4, p: [10] }), null);
  assert.deepEqual(parseOp({ u: 1 }), { u: 1 });
  assert.deepEqual(parseOp({ x: 1 }), { x: 1 });
  assert.equal(parseOp("x"), null);

  const a = { c: 1, z: 0, p: [1, 1] };
  const b = { c: 2, z: 0, p: [2, 2] };
  const f = { f: 3, p: [5, 5] as [number, number] };
  assert.deepEqual(visibleOps([a, b, { u: 1 }]), [a]);
  assert.deepEqual(visibleOps([a, { x: 1 }, b]), [b]);
  // Hoàn tác lần xoá thì tranh cũ quay lại.
  assert.deepEqual(visibleOps([a, f, { x: 1 }, { u: 1 }]), [a, f]);
  assert.deepEqual(visibleOps([{ u: 1 }, a]), [a]);
  assert.equal(canUndo([]), false);
  assert.equal(canUndo([a, { u: 1 }]), false);
  assert.equal(canUndo([a, { x: 1 }]), true);
});
