import assert from "node:assert/strict";
import { test } from "node:test";
import { turnOnly, turnOnAnswer } from "./ice.ts";

test("mỗi máy chủ chỉ giữ một URL UDP và một URL TCP/TLS, ưu tiên cổng 443", () => {
  const cloudflare = {
    urls: [
      "stun:stun.cloudflare.com:3478",
      "turn:turn.cloudflare.com:3478?transport=udp",
      "turn:turn.cloudflare.com:443?transport=udp",
      "turn:turn.cloudflare.com:3478?transport=tcp",
      "turn:turn.cloudflare.com:80?transport=tcp",
      "turns:turn.cloudflare.com:5349?transport=tcp",
      "turns:turn.cloudflare.com:443?transport=tcp",
    ],
    username: "u",
    credential: "c",
  };
  assert.deepEqual(turnOnly([cloudflare]), [
    {
      ...cloudflare,
      urls: ["turn:turn.cloudflare.com:443?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"],
    },
  ]);
});

test("bỏ máy chủ chỉ có STUN, giữ nguyên URL không ghi transport", () => {
  assert.deepEqual(
    turnOnly([
      { urls: "stun:stun.l.google.com:19302" },
      { urls: ["turn:a.example:3478", "turn:a.example:3478?transport=tcp"] },
    ]),
    [{ urls: ["turn:a.example:3478", "turn:a.example:3478?transport=tcp"] }],
  );
});

test("ngoài trình duyệt (không có WebRTC) thì không tạo lớp RTCPeerConnection riêng", () => {
  assert.equal(turnOnAnswer(() => []), undefined);
});
