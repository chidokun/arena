import assert from "node:assert/strict";
import { test } from "node:test";
import { joinProgress } from "./join.ts";

const user = (uid: string, peer: string, extra: Record<string, unknown> = {}) => ({ uid, peer, name: uid.toUpperCase(), avatar: "🙂", color: "#fff", ...extra });
const base = { me: "me", room: "r1", lobby: [], members: [], peers: [], synced: false, unreachable: 0 };

test("đếm người trong phòng từ sảnh, đánh dấu ai đã nối", () => {
  const p = joinProgress({
    ...base,
    host: "b",
    lobby: [user("me", "p0", { room: "r1" }), user("a", "pa", { room: "r1" }), user("b", "pb", { room: "r1" }), user("c", "pc", { room: "r2" })],
    peers: ["pb"],
  });
  assert.deepEqual(
    p.people.map((x) => [x.uid, x.linked]),
    [
      ["b", true],
      ["a", false],
    ],
  );
});

test("gộp bản ghi của phòng với sảnh, bỏ người đã rời hoặc bị kick", () => {
  const p = joinProgress({
    ...base,
    lobby: [user("a", "pa", { room: "r1" })],
    members: [user("a", "pa2"), user("d", "pd"), user("e", "pe", { left: true }), user("k", "pk")],
    peers: ["pa2", "pk"],
    kicked: ["k"],
    synced: true,
  });
  assert.deepEqual(
    p.people.map((x) => [x.uid, x.linked]),
    [
      ["a", true],
      ["d", false],
    ],
  );
  assert.equal(p.synced, true);
});
