import assert from "node:assert/strict";
import { test } from "node:test";
import { addNote, compareVersion, latestEntry, parseChangelog, parseVersion, todayVN } from "./changelog.ts";

const LOG = `# Nhật ký thay đổi

Hướng dẫn: chữ trước mục đầu tiên được bỏ qua.

## 2026.11.02.3
- Sửa lỗi caro trên iPhone
- Thêm game Cờ Chó 🐕

## 2026.10.25.1
* Bàn caro mượt hơn
`;

test("đọc các mục, điểm mới nhất đứng đầu, bỏ qua phần mở đầu", () => {
  const entries = parseChangelog(LOG);
  assert.deepEqual(entries, [
    { version: "2026.11.02.3", date: "2026-11-02", build: 3, notes: ["Sửa lỗi caro trên iPhone", "Thêm game Cờ Chó 🐕"] },
    { version: "2026.10.25.1", date: "2026-10-25", build: 1, notes: ["Bàn caro mượt hơn"] },
  ]);
  assert.equal(latestEntry(entries)?.version, "2026.11.02.3");
  assert.equal(latestEntry(parseChangelog("# Trống\n")), null);
});

test("so phiên bản theo số, không theo chuỗi", () => {
  assert.ok(compareVersion("2026.11.02.10", "2026.11.02.9") > 0);
  assert.ok(compareVersion("2026.11.03.1", "2026.11.02.12") > 0);
  assert.ok(compareVersion("2026.10.31.5", "2026.11.01.1") < 0);
  assert.equal(compareVersion("2026.11.02.3", "2026.11.02.3"), 0);
  assert.throws(() => compareVersion("1.2.3", "2026.11.02.3"));
});

test("phiên bản phải đúng dạng và là ngày có thật", () => {
  assert.deepEqual(parseVersion("2026.02.28.1"), [2026, 2, 28, 1]);
  for (const v of ["2026.02.30.1", "2026.11.02.0", "2026.11.2.1", "2026.11.02", "abc", ""]) assert.equal(parseVersion(v), null, v);
});

test("báo lỗi kèm số dòng khi file sai", () => {
  const cases: [string, RegExp][] = [
    ["## 2026.11.02\n- a\n", /:1: tiêu đề/],
    ["## 2026.02.30.1\n- a\n", /không có thật/],
    ["## 2026.11.02.1\nchữ thường\n", /:2: .*gạch đầu dòng/],
    ["## 2026.11.02.1\n\n## 2026.11.01.1\n- a\n", /:1: .*chưa có điểm/],
    ["## 2026.11.02.2\n- a\n## 2026.11.02.1\n- b\n", /:3: .*mỗi ngày chỉ một mục/],
    ["## 2026.11.01.1\n- a\n## 2026.11.02.1\n- b\n", /:3: .*trên cùng/],
  ];
  for (const [text, err] of cases) assert.throws(() => parseChangelog(text), err, text);
});

test("ghi thêm vào mục hôm nay: điểm mới lên đầu, tăng N", () => {
  const { text, version } = addNote(LOG, "2026-11-02", "  Chat có sticker\nmới ");
  assert.equal(version, "2026.11.02.4");
  const top = parseChangelog(text)[0];
  assert.deepEqual(top, { version: "2026.11.02.4", date: "2026-11-02", build: 4, notes: ["Chat có sticker mới", "Sửa lỗi caro trên iPhone", "Thêm game Cờ Chó 🐕"] });
  assert.equal(parseChangelog(text).length, 2);
});

test("ngày mới thì mở mục .1 trên cùng, giữ nguyên phần còn lại", () => {
  const { text, version } = addNote(LOG, "2026-11-05", "Giải đấu mở đăng ký");
  assert.equal(version, "2026.11.05.1");
  assert.ok(text.includes("## 2026.11.05.1\n- Giải đấu mở đăng ký\n\n## 2026.11.02.3"));
  assert.deepEqual(parseChangelog(text).map((e) => e.version), ["2026.11.05.1", "2026.11.02.3", "2026.10.25.1"]);
  assert.ok(text.startsWith("# Nhật ký thay đổi\n\nHướng dẫn"));
});

test("file chưa có mục nào thì thêm mục đầu tiên ở cuối", () => {
  const { text } = addNote("# Nhật ký thay đổi\n\n", "2026-11-05", "Ra mắt");
  assert.equal(text, "# Nhật ký thay đổi\n\n## 2026.11.05.1\n- Ra mắt\n");
});

test("từ chối điểm trống và mục trên cùng nằm ở tương lai", () => {
  assert.throws(() => addNote(LOG, "2026-11-02", "   "), /trống/);
  assert.throws(() => addNote(LOG, "2026-11-01", "a"), /mới hơn hôm nay/);
});

test("ngày hôm nay theo giờ Việt Nam", () => {
  // 18:30 UTC ngày 1/11 là 01:30 sáng 2/11 ở Việt Nam.
  assert.equal(todayVN(new Date("2026-11-01T18:30:00Z")), "2026-11-02");
  assert.equal(todayVN(new Date("2026-11-01T16:59:00Z")), "2026-11-01");
});
