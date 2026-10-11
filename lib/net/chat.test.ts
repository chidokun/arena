import assert from "node:assert/strict";
import { test } from "node:test";
import { insertMsg, isFresh, PUBLIC_TTL_MS, RateLimit, readPublicMsg, TEXT_MAX, toPublicWire } from "./chat.ts";
import type { ChatMsg } from "./room.ts";

const who = { uid: "abc", name: "Cáo", avatar: "🦊", color: "#ff5a5f" };
const base = { ...who, age: 0 };

test("readPublicMsg: nhận tin chữ / sticker đúng người gửi, giờ gửi quy về đồng hồ máy mình", () => {
  assert.deepEqual(readPublicMsg({ id: "abc:1:0", t: "chat", p: { ...base, age: 5000, text: "  chào  " } }, 100_000), {
    id: "abc:1:0",
    ...who,
    at: 95_000,
    text: "chào",
  });
  assert.equal(readPublicMsg({ id: "abc:1:1", t: "chat", p: { ...base, sticker: "heart" } })?.sticker, "heart");
});

test("readPublicMsg: bỏ tin mạo danh, rỗng, sticker lạ, thiếu giờ", () => {
  assert.equal(readPublicMsg({ id: "xyz:1:0", t: "chat", p: { ...base, text: "hi" } }), null);
  assert.equal(readPublicMsg({ id: "abc:1:0", t: "chat", p: { ...base, text: "   " } }), null);
  assert.equal(readPublicMsg({ id: "abc:1:0", t: "chat", p: { ...base, sticker: "../x" } }), null);
  assert.equal(readPublicMsg({ id: "abc:1:0", t: "chat", p: { ...base, age: "1", text: "hi" } }), null);
  assert.equal(readPublicMsg({ id: "abc:1:0", t: "chat", p: { ...who, text: "hi" } }), null);
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
  const m = (id: string, at: number): ChatMsg => ({ ...who, id, at, text: id });
  let chat = insertMsg([], m("b", 2))!;
  chat = insertMsg(chat, m("a", 1))!;
  assert.deepEqual(chat.map((c) => c.id), ["a", "b"]);
  assert.equal(insertMsg(chat, m("a", 1)), null);
  assert.deepEqual(insertMsg(chat, m("c", 3), 2)!.map((c) => c.id), ["b", "c"]);
});

test("chat công cộng: tin quá 1 giờ bị bỏ khi nhận, tuổi âm (máy lệch giờ) coi như vừa gửi", () => {
  assert.ok(readPublicMsg({ id: "abc:1:0", t: "chat", p: { ...base, age: PUBLIC_TTL_MS, text: "vừa kịp" } }));
  assert.equal(readPublicMsg({ id: "abc:1:0", t: "chat", p: { ...base, age: PUBLIC_TTL_MS + 1, text: "quá hạn" } }), null);
  assert.equal(readPublicMsg({ id: "abc:1:0", t: "chat", p: { ...base, age: -5000, text: "hi" } }, 1000)?.at, 1000);
});

test("toPublicWire: gửi tuổi thay cho giờ tuyệt đối, khứ hồi giữ đúng giờ theo đồng hồ từng máy", () => {
  const msg: ChatMsg = { ...who, id: "abc:1:0", at: 10_000, sticker: "heart" };
  const wire = toPublicWire(msg, 40_000);
  assert.equal(wire.age, 30_000);
  assert.equal("at" in wire, false);
  // Máy nhận chạy nhanh hơn 1 giờ vẫn thấy tin 30 giây trước, không bị coi là quá hạn.
  const late = 40_000 + PUBLIC_TTL_MS;
  assert.equal(readPublicMsg({ id: msg.id, t: "chat", p: wire }, late)?.at, late - 30_000);
});

test("isFresh: còn hạn trong 1 giờ theo đồng hồ máy mình", () => {
  const msg: ChatMsg = { ...who, id: "x", at: 0, text: "hi" };
  assert.equal(isFresh(msg, PUBLIC_TTL_MS), true);
  assert.equal(isFresh(msg, PUBLIC_TTL_MS + 1), false);
});
