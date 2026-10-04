import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLS,
  columnOf,
  docSo,
  grantSheets,
  joinNames,
  kinhLine,
  makeSheets,
  MAX_NUMBER,
  nextNumber,
  notReady,
  PER_ROW,
  replay,
  ROWS,
  SHEET_COUNT,
  shoutFor,
  SHOUTS,
  waitingLine,
  waitingRows,
  type Sheet,
} from "./loto.ts";

const nums = (rows: number[][]) => rows.flat().filter((n) => n > 0);

test("bộ tờ đúng luật với nhiều seed", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const sheets = makeSheets(seed * 7919);
    assert.equal(sheets.length, SHEET_COUNT);
    sheets.forEach((s, i) => {
      assert.equal(s.id, i);
      assert.equal(s.rows.length, ROWS);
      for (const row of s.rows) {
        assert.equal(row.length, COLS);
        assert.equal(row.filter((n) => n > 0).length, PER_ROW, `seed ${seed}: hàng không đủ ${PER_ROW} số`);
        row.forEach((n, c) => n && assert.equal(columnOf(n), c, `seed ${seed}: số ${n} sai cột ${c}`));
      }
      // Mỗi khối 3 hàng: cột nào cũng có số, và số trong cột tăng dần từ trên xuống.
      for (let b = 0; b < ROWS; b += 3) {
        for (let c = 0; c < COLS; c++) {
          const col = [0, 1, 2].map((r) => s.rows[b + r][c]).filter((n) => n > 0);
          assert.ok(col.length >= 1, `seed ${seed}: tờ ${i} khối ${b / 3} trống cột ${c}`);
          assert.deepEqual(col, [...col].sort((x, y) => x - y));
        }
      }
    });
    // Hai tờ cùng màu bù trừ nhau: gộp lại đủ 1–90, mỗi số đúng một lần.
    for (let color = 0; color < SHEET_COUNT / 2; color++) {
      const all = [...nums(sheets[color * 2].rows), ...nums(sheets[color * 2 + 1].rows)].sort((a, b) => a - b);
      assert.deepEqual(all, Array.from({ length: MAX_NUMBER }, (_, i) => i + 1), `seed ${seed}: màu ${color} không đủ 1–90`);
    }
  }
});

test("cùng seed ra cùng bộ tờ, khác seed ra bộ khác", () => {
  assert.deepEqual(makeSheets(42), makeSheets(42));
  assert.notDeepEqual(makeSheets(42)[0].rows, makeSheets(43)[0].rows);
});

const sheets = makeSheets(2027);

/** Tìm hàng của tờ `id` có chứa số n. */
const rowWith = (s: Sheet, n: number) => s.rows.findIndex((row) => row.includes(n));

test("đủ 5 số một hàng thì kinh, các số kêu sau bị bỏ qua", () => {
  const row = nums([sheets[0].rows[3]]);
  const s = replay([...row, 1, 2, 3].filter((n, i, a) => a.indexOf(n) === i), { an: [0] }, sheets);
  assert.deepEqual(s.winners, ["an"]);
  assert.deepEqual(s.wins, [{ uid: "an", sheet: 0, row: 3 }]);
  assert.equal(s.draws.length, PER_ROW);
});

test("bốn số một hàng thì đợi, chưa kinh", () => {
  const row = nums([sheets[4].rows[0]]);
  const s = replay(row.slice(0, 4), { binh: [4] }, sheets);
  assert.deepEqual(s.winners, []);
  assert.deepEqual(s.waits[3], ["binh"]);
  assert.deepEqual(waitingRows(sheets, [4], s.drawn), [{ sheet: 4, row: 0, need: row[4] }]);
});

test("hai người đủ hàng cùng một số là kinh trùng", () => {
  // Số n nằm trên một hàng của tờ Đỏ 1 và một hàng của màu Cam (mỗi màu có đủ 1–90).
  const n = sheets[0].rows[0].find((x) => x > 0)!;
  const other = rowWith(sheets[2], n) >= 0 ? 2 : 3;
  const a = nums([sheets[0].rows[0]]).filter((x) => x !== n);
  const b = nums([sheets[other].rows[rowWith(sheets[other], n)]]).filter((x) => x !== n);
  const before = [...new Set([...a, ...b])];
  const s = replay([...before, n], { an: [0], binh: [other] }, sheets);
  assert.equal(s.draws.length, before.length + 1, "không được kinh trước số chung");
  assert.deepEqual([...s.winners].sort(), ["an", "binh"]);
});

test("số không hợp lệ hoặc kêu trùng làm dừng nhật ký", () => {
  assert.equal(replay([5, 5, 6], {}, sheets).draws.length, 1);
  assert.equal(replay([0, 6], {}, sheets).draws.length, 0);
  assert.equal(replay([91], {}, sheets).draws.length, 0);
  assert.equal(replay([7, 2.5], {}, sheets).draws.length, 1);
  assert.equal(replay([7, "8"], {}, sheets).draws.length, 1);
});

test("tờ không ai giữ không tính kinh", () => {
  const s = replay(nums([sheets[6].rows[2]]), { an: [0] }, sheets);
  assert.deepEqual(s.winners, []);
});

test("rút số không bao giờ trùng, hết số thì null", () => {
  const drawn = new Array<boolean>(MAX_NUMBER + 1).fill(false);
  const seen = new Set<number>();
  for (let i = 0; i < MAX_NUMBER; i++) {
    const n = nextNumber(drawn)!;
    assert.ok(n >= 1 && n <= MAX_NUMBER && !seen.has(n));
    seen.add(n);
    drawn[n] = true;
  }
  assert.equal(nextNumber(drawn), null);
});

test("câu rao tất định và thuộc bộ Hò / Hẹn / Đợi", () => {
  assert.equal(shoutFor("an", 3, 12), shoutFor("an", 3, 12));
  const all = new Set(Array.from({ length: 60 }, (_, k) => shoutFor("an", 1, k)));
  assert.deepEqual([...all].sort(), [...SHOUTS].sort());
});

test("đọc số tiếng Việt", () => {
  const cases: [number, string][] = [
    [1, "một"],
    [5, "năm"],
    [10, "mười"],
    [11, "mười một"],
    [14, "mười bốn"],
    [15, "mười lăm"],
    [20, "hai mươi"],
    [21, "hai mươi mốt"],
    [24, "hai mươi tư"],
    [25, "hai mươi lăm"],
    [77, "bảy mươi bảy"],
    [90, "chín mươi"],
  ];
  for (const [n, text] of cases) assert.equal(docSo(n), text);
});

test("chia tờ: không giành được tờ người khác đang giữ, tối đa 2 tờ", () => {
  const claims = { an: [0, 5], binh: [3] };
  assert.deepEqual(grantSheets(claims, "chi", [5, 6]), [6], "tờ 5 của An");
  assert.deepEqual(grantSheets(claims, "chi", [7, 8, 9]), [7, 8]);
  assert.deepEqual(grantSheets(claims, "an", [5, 3]), [5], "giữ lại tờ của mình, không lấy tờ của Bình");
  assert.deepEqual(grantSheets(claims, "chi", [4, 4]), [4], "chọn trùng chỉ tính một");
  assert.deepEqual(grantSheets(claims, "chi", [-1, 20, 1.5, "2", null]), [], "id lạ bị bỏ");
  assert.deepEqual(grantSheets(claims, "binh", []), []);
});

test("sẵn sàng: chủ phòng không cần bấm, ai giữ tờ mà chưa bấm thì chặn bắt đầu", () => {
  assert.deepEqual(notReady(["chu", "an", "binh"], "chu", ["an"]), ["binh"]);
  assert.deepEqual(notReady(["chu", "an"], "chu", ["an"]), []);
  assert.deepEqual(notReady(["chu"], "chu", []), [], "chủ phòng chơi một mình vẫn bắt đầu được");
  assert.deepEqual(notReady(["an"], "chu", []), ["an"], "chủ phòng không giữ tờ thì vẫn phải chờ người chơi");
});

test("câu đọc khi đợi và khi kinh", () => {
  assert.equal(joinNames(["An"]), "An");
  assert.equal(joinNames(["An", "Bình"]), "An và Bình");
  assert.equal(joinNames(["An", "Bình", "Chi"]), "An, Bình và Chi");
  assert.equal(waitingLine(["Cáo Lém Lỉnh"]), "Cáo Lém Lỉnh đang đợi rồi á nha!");
  assert.equal(waitingLine(["An", "Bình"]), "An và Bình đang đợi rồi á nha!");
  assert.equal(kinhLine(["Cáo Lém Lỉnh"]), "Chúc mừng Cáo Lém Lỉnh đã kinh!");
  assert.equal(kinhLine(["An", "Bình"]), "Chúc mừng An và Bình đã kinh trùng!");
});
