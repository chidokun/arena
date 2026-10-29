import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanText, cutText, makeText, normOptions, normRec, roundText, scan, standings, timeTextLength, type TrRec } from "./typing-race.ts";

test("văn bản sinh tất định theo seed và đúng độ dài gần mốc", () => {
  for (const lang of ["vi", "en"] as const)
    for (const level of ["easy", "medium", "hard"] as const)
      for (const len of [500, 1000, 2000]) {
        const a = makeText(42, lang, level, len);
        assert.equal(a, makeText(42, lang, level, len));
        assert.notEqual(a, makeText(43, lang, level, len));
        assert.ok(Math.abs(a.length - len) <= 40, `${lang}/${level}/${len}: dài ${a.length}`);
        assert.equal(a, a.normalize("NFC"));
        assert.doesNotMatch(a, /\s$|^\s|\s{2}/);
      }
});

test("độ khó Dễ không có số, chữ hoa hay ký tự đặc biệt", () => {
  for (const lang of ["vi", "en"] as const) {
    const t = makeText(7, lang, "easy", 2000);
    assert.equal(t, t.toLowerCase());
    assert.doesNotMatch(t, /[0-9"#$%&()*+/:;<=>?@[\]{}.!-]/);
  }
});

test("đua theo thời gian: đủ chữ cho người gõ rất nhanh, văn bản tự nhập được nối lặp", () => {
  const o = normOptions({ mode: "time", minutes: 3 });
  assert.ok(roundText(o, 1).length >= timeTextLength(3) - 40);
  const custom = roundText({ ...o, source: "custom" }, 1, "xin chào các bạn");
  assert.ok(custom.startsWith("xin chào các bạn xin chào các bạn"));
  assert.ok(custom.length >= timeTextLength(3));
  assert.equal(roundText({ ...o, mode: "chars", source: "custom" }, 1, "abc def"), "abc def");
});

test("cắt văn bản ở ranh giới từ", () => {
  assert.equal(cutText("một hai ba bốn năm", 9), "một hai ba");
  assert.equal(cutText("abc, def", 100), "abc, def");
  assert.equal(cutText("abc, def ghi", 4), "abc");
});

test("chuẩn hoá văn bản tự nhập", () => {
  assert.equal(cleanText("  “Xin\tchào”…  — bạn 😀\n"), '"Xin chào"... - bạn');
  assert.equal(cleanText("tiếng"), "tiếng");
});

test("tham số phòng bị kẹp về khoảng hợp lệ", () => {
  assert.deepEqual(normOptions({ mode: "x", length: 99999, minutes: 0, lang: "fr", level: "?", source: "custom" }), {
    mode: "chars",
    length: 5000,
    minutes: 1,
    lang: "vi",
    level: "medium",
    source: "custom",
  });
});

const T = "Tiếng Việt hoà nhã, người đẹp.";

test("gõ đúng: xác nhận tới hết dấu cách, chữ đang gõ dở vẫn tính quãng đường", () => {
  assert.deepEqual(scan(T, 0, "Tiếng "), { commit: 6, good: 6, bad: -1 });
  assert.deepEqual(scan(T, 0, "Tiếng Vi"), { commit: 6, good: 8, bad: -1 });
  assert.deepEqual(scan(T, 6, "Việt"), { commit: 0, good: 4, bad: -1 });
});

test("bước trung gian của Telex / VNI không bị tính là lỗi", () => {
  for (const step of ["T", "Ti", "Tie", "Tiê", "Tiên", "Tiêng", "Tiéng", "Tiến"]) assert.equal(scan(T, 0, step).bad, -1, step);
  assert.equal(scan(T, 0, "Tiếng").bad, -1);
  for (const step of ["ng", "ngu", "nguo", "nguoi", "ngươi", "ngưoi", "người"]) assert.equal(scan(T, 20, step).bad, -1, step);
  assert.equal(scan("đẹp", 0, "d").bad, -1);
  assert.equal(scan("đẹp", 0, "dep").bad, -1);
});

test("đặt dấu thanh ở nguyên âm khác vẫn đúng (hòa = hoà)", () => {
  assert.deepEqual(scan(T, 11, "hòa "), { commit: 4, good: 4, bad: -1 });
  assert.deepEqual(scan(T, 11, "hoà "), { commit: 4, good: 4, bad: -1 });
});

test("gõ sai: chữ khác, dấu lạ, thiếu dấu khi đã sang từ mới, phân biệt hoa thường", () => {
  assert.equal(scan(T, 0, "Tx").bad, 1);
  assert.equal(scan(T, 0, "Tiềng").bad, 2);
  assert.equal(scan(T, 0, "Tiêng ").bad, 5);
  assert.equal(scan(T, 0, "Tieng ").bad, 5);
  assert.equal(scan(T, 0, "tiếng").bad, 0);
  assert.equal(scan(T, 0, "Tiếngg").bad, 5);
  assert.equal(scan(T, 0, "Tiến ").bad, 4);
  assert.deepEqual(scan(T, 0, "Tiếng Viêt x"), { commit: 6, good: 10, bad: 10 });
});

test("gõ hết văn bản thì xác nhận cả từ cuối", () => {
  assert.deepEqual(scan("chạy đi", 5, "đi"), { commit: 2, good: 2, bad: -1 });
  assert.deepEqual(scan("chạy đi", 5, "di"), { commit: 0, good: 0, bad: -1 });
  assert.equal(scan("chạy đi", 5, "đi ").bad, 2);
});

test("bản ghi tiến độ không vượt văn bản, về đích chỉ khi xác nhận hết", () => {
  assert.deepEqual(normRec({ p: 50, n: 999, e: -3, at: 10, v: 9999, fin: 1000 }, 100), { p: 50, n: 100, e: 0, at: 10, v: 400 });
  assert.equal(normRec({ p: 100, n: 100, e: 1, at: 5, v: 0, fin: 1000 }, 100)?.fin, 1000);
  assert.equal(normRec("x", 100), null);
});

const rec = (n: number, e: number, extra: Partial<TrRec> = {}): TrRec => ({ p: n, n, e, at: 0, v: 0, ...extra });

test("xếp hạng theo ký tự: về đích trước, rồi nhiều ký tự hơn, rồi chính xác hơn; bỏ cuộc không tranh hạng", () => {
  const s = standings("chars", [rec(800, 5), rec(1000, 9, { fin: 90000 }), rec(1000, 0, { fin: 80000 }), rec(800, 1), rec(900, 0, { quit: true }), null]);
  assert.deepEqual(
    s.map((x) => [x.k, x.rank]),
    [
      [2, 1],
      [1, 2],
      [3, 3],
      [0, 4],
      [5, 5],
      [4, 0],
    ],
  );
});

test("xếp hạng theo thời gian: nhiều ký tự, chính xác, đạt sớm hơn; bằng hết thì đồng hạng", () => {
  const s = standings("time", [rec(500, 5, { at: 1000 }), rec(500, 5, { at: 900 }), rec(600, 20), rec(500, 5, { at: 900 })], [false, false, false, false]);
  assert.deepEqual(
    s.map((x) => [x.k, x.rank]),
    [
      [2, 1],
      [1, 2],
      [3, 2],
      [0, 4],
    ],
  );
  assert.equal(standings("time", [rec(10, 0)], [true])[0].rank, 0);
});
