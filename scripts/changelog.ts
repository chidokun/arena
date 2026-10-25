// npm run changelog -- "Thêm game Cờ Chó 🐕"
// Ghi một điểm mới vào mục hôm nay của CHANGELOG.md (giờ Việt Nam) và tự tăng số build — xem lib/changelog.ts.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { addNote, CHANGELOG_FILE, todayVN } from "../lib/changelog.ts";

const note = process.argv.slice(2).join(" ");
if (!note.trim()) {
  console.error('Cách dùng: npm run changelog -- "Nội dung điểm mới"');
  process.exit(1);
}

const file = join(process.cwd(), CHANGELOG_FILE);
const current = await readFile(file, "utf8").catch(() => "# Nhật ký thay đổi\n");
const { text, version } = addNote(current, todayVN(), note);
await writeFile(file, text);
console.log(`${CHANGELOG_FILE}: đã ghi vào ${version}`);
