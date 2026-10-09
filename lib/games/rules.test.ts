import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILT_GAMES } from "./registry.ts";
import { RULES } from "./rules.ts";

test("game nào có trang cũng có luật chơi chi tiết", () => {
  for (const slug of BUILT_GAMES) {
    const r = RULES[slug];
    assert.ok(r, `thiếu luật chơi cho "${slug}"`);
    assert.ok(r.intro.trim(), `"${slug}": thiếu lời giới thiệu`);
    assert.ok(r.sections.length > 0, `"${slug}": chưa có mục luật nào`);
    for (const s of r.sections) assert.ok(s.items.length > 0, `"${slug}" › ${s.title}: mục rỗng`);
  }
});
