import assert from "node:assert/strict";
import { test } from "node:test";
import { insertMsg, RateLimit, readPublicMsg, TEXT_MAX } from "./chat.ts";
import type { ChatMsg } from "./room.ts";

const base = { uid: "abc", name: "Cáo", avatar: "🦊", color: "#ff5a5f", at: 1000 };

test("readPublicMsg: nhận tin chữ / sticker đúng người gửi", () => {
  assert.deepEqual(readPublicMsg({ id: "abc:1:0", t: "chat", p: { ...base, text: "  chào  " } }), { id: "abc:1:0", ...base, text: "chào" });
  assert.equal(readPublicMsg({ id: "abc:1:1", t: "chat", p: { ...base, sticker: "heart" } })?.sticker, "heart");
});

test("readPublicMsg: bỏ tin mạo danh, rỗng, sticker lạ, thiếu giờ", () => {
  assert.equal(readPublicMsg({ id: "xyz:1:0", t: "chat", p: { ...base, text: "hi" } }), null);
  assert.equal(readPublicMsg({ id: "abc:1:0", t: "chat", p: { ...base, text: "   " } }), null);
  assert.equal(readPublicMsg({ id: "abc:1:0", t: "chat", p: { ...base, sticker: "../x" } }), null);
  assert.equal(readPublicMsg({ id: "abc:1:0", t: "chat", p: { ...base, at: "1", text: "hi" } }), null);
  assert.equal(readPublicMsg({ id: "abc:1:0", t: "chat", p: null }), null);
});

test("readPublicMsg: bỏ cờ đặc biệt, cắt chữ dài", () => {
  const m = readPublicMsg({ id: "abc:1:0", t: "chat", p: { ...base, text: "x".repeat(500), system: true, shout: true, guess: "right" } })!;
  assert.equal(m.text!.length, TEXT_MAX);
  assert.equal(m.system, undefined);
  assert.equal(m.shout, undefined);
  assert.equal(m.guess, undefined);
});

test("RateLimit: tối đa max lần trong cửa sổ, hết cửa sổ thì được gửi lại", () => {
  let now = 0;
  const rl = new RateLimit(2, 1000, () => now);
  assert.equal(rl.take("a"), true);
  assert.equal(rl.take("a"), true);
  assert.equal(rl.take("a"), false);
  assert.equal(rl.take("b"), true);
  now = 1001;
  assert.equal(rl.take("a"), true);
  now = 5000;
  rl.sweep();
  assert.equal(rl.take("a"), true);
});

test("insertMsg: sắp theo giờ, khử trùng lặp, giữ tin mới nhất", () => {
  const m = (id: string, at: number): ChatMsg => ({ ...base, id, at, text: id });
  let chat = insertMsg([], m("b", 2))!;
  chat = insertMsg(chat, m("a", 1))!;
  assert.deepEqual(chat.map((c) => c.id), ["a", "b"]);
  assert.equal(insertMsg(chat, m("a", 1)), null);
  assert.deepEqual(insertMsg(chat, m("c", 3), 2)!.map((c) => c.id), ["b", "c"]);
});
