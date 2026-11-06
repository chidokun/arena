// npm run catalog
// Chép games.json của arena-api vào lib/games/catalog.ts — bản build dùng để xuất trang (tên, mô tả, ảnh OG) mà không cần
// gọi mạng lúc build. CI chạy lệnh này ngay trước `npm run build` để nội dung SEO luôn mới.
//
// Lệnh không bao giờ thất bại: API lỗi, sai cấu trúc hay thiếu game đã có code thì chỉ cảnh báo và giữ nguyên bản chép
// đang có (bản đã commit), nên build vẫn chạy được.

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BUILT_GAMES, GAMES_URL, parseGames } from "../lib/games/registry.ts";

const FILE = "lib/games/catalog.ts";

try {
  const res = await fetch(GAMES_URL, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const slugs = parseGames(json).map((g) => g.slug);
  const missing = BUILT_GAMES.filter((s) => !slugs.includes(s));
  if (missing.length) throw new Error(`thiếu game đã có code: ${missing.join(", ")}`);
  await writeFile(
    join(process.cwd(), FILE),
    `// Bản chép games.json của arena-api (${GAMES_URL}) cho lúc build — sinh bằng \`npm run catalog\`, đừng sửa tay.\n` +
      `export const CATALOG: unknown = ${JSON.stringify(json, null, 2)};\n`,
  );
  console.log(`${FILE}: đã chép ${slugs.length} game từ arena-api`);
} catch (e) {
  console.warn(`::warning::Không cập nhật được ${FILE} từ ${GAMES_URL} (${e instanceof Error ? e.message : e}) — build dùng bản chép đang có.`);
}
