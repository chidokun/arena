import assert from "node:assert/strict";
import { test } from "node:test";
import { isDevtoolsShortcut } from "./devtools.ts";

const key = (code: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}, k = code) => ({
  key: k,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

test("nhận ra phím tắt mở DevTools trên Windows, Linux, macOS", () => {
  assert.ok(isDevtoolsShortcut(key("F12")));
  for (const c of ["KeyI", "KeyJ", "KeyC"]) {
    assert.ok(isDevtoolsShortcut(key(c, { ctrlKey: true, shiftKey: true })), `Ctrl+Shift+${c}`);
    // macOS: giữ ⌥ làm `key` thành ký tự khác (⌘⌥I → "ˆ"), nên phải so theo `code`.
    assert.ok(isDevtoolsShortcut(key(c, { metaKey: true, altKey: true }, "ˆ")), `⌘⌥${c}`);
  }
});

test("bỏ qua phím tắt thường dùng khi chơi", () => {
  assert.ok(!isDevtoolsShortcut(key("KeyC", { ctrlKey: true }))); // chép
  assert.ok(!isDevtoolsShortcut(key("KeyC", { metaKey: true })));
  assert.ok(!isDevtoolsShortcut(key("KeyI", { shiftKey: true })));
  assert.ok(!isDevtoolsShortcut(key("KeyU", { ctrlKey: true }))); // xem mã nguồn — không mở DevTools
  assert.ok(!isDevtoolsShortcut(key("KeyA", { ctrlKey: true, shiftKey: true })));
  assert.ok(!isDevtoolsShortcut(key("Enter")));
});
