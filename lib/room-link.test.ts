import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRoomLink } from "./room-link.ts";

const opts = { hosts: ["arena.nguyentuan.dev"], known: (s: string) => ["loto", "caro", "chess"].includes(s) };

test("nhận link phòng của site", () => {
  assert.deepEqual(parseRoomLink("https://arena.nguyentuan.dev/games/loto/room/?id=i8qxg5", opts), {
    slug: "loto",
    id: "i8qxg5",
    url: "https://arena.nguyentuan.dev/games/loto/room/?id=i8qxg5",
    rest: "",
  });
});

test("giữ phần chữ còn lại, bỏ dấu câu dính sau link", () => {
  const r = parseRoomLink("Vào chơi nè: https://arena.nguyentuan.dev/games/caro/room?id=AbC12. nhanh lên", opts);
  assert.equal(r?.slug, "caro");
  assert.equal(r?.id, "abc12");
  assert.equal(r?.rest, "Vào chơi nè: nhanh lên");
});

test("bỏ qua link lạ, game không có trang hoặc thiếu mã phòng", () => {
  assert.equal(parseRoomLink("https://evil.example/games/loto/room/?id=abc", opts), null);
  assert.equal(parseRoomLink("https://arena.nguyentuan.dev.evil.example/games/loto/room/?id=abc", opts), null);
  assert.equal(parseRoomLink("https://arena.nguyentuan.dev/games/khong-co/room/?id=abc", opts), null);
  assert.equal(parseRoomLink("https://arena.nguyentuan.dev/games/loto/room/", opts), null);
  assert.equal(parseRoomLink("https://arena.nguyentuan.dev/games/loto/", opts), null);
  assert.equal(parseRoomLink("chào cả nhà", opts), null);
});

test("nhận tên miền đang chạy và đường dẫn con", () => {
  const r = parseRoomLink("http://localhost:3219/arena/games/chess/room/?id=xyz", { ...opts, hosts: ["localhost:3219"], base: "/arena" });
  assert.equal(r?.slug, "chess");
  assert.equal(r?.id, "xyz");
});
