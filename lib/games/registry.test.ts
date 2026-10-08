import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeGames, parseGames } from "./registry.ts";

const caro = {
  slug: "caro",
  name: "Cờ Caro",
  emoji: "⭕",
  status: "LIVE",
  tagline: "Năm quân thẳng hàng là thắng",
  description: "…",
  seats: { min: 2, max: 2 },
  capacity: { min: 2, max: 16, default: 8 },
  hue: "coral",
};

test("giữ LIVE/MAINTENANCE, trạng thái lạ coi như DEVELOPMENT", () => {
  const games = parseGames({
    games: [caro, { ...caro, slug: "a", status: "MAINTENANCE", host: "Quản trò" }, { ...caro, slug: "b", status: "BETA" }],
  });
  assert.deepEqual(games.map((g) => g.status), ["LIVE", "MAINTENANCE", "DEVELOPMENT"]);
  assert.equal(games[1].host, "Quản trò");
});

test("trạng thái lúc chạy chỉ đổi được game đã có trang", () => {
  const built = parseGames({
    games: [caro, { ...caro, slug: "a", status: "MAINTENANCE" }, { ...caro, slug: "b", status: "DEVELOPMENT" }, { ...caro, slug: "c" }],
  });
  const fresh = parseGames({
    games: [
      { ...caro, status: "MAINTENANCE", name: "Caro mới" },
      { ...caro, slug: "a", status: "LIVE" },
      { ...caro, slug: "b", status: "LIVE" },
      { ...caro, slug: "c", status: "DEVELOPMENT" },
    ],
  });
  const merged = mergeGames(built, fresh);
  assert.deepEqual(merged.map((g) => g.status), ["MAINTENANCE", "LIVE", "DEVELOPMENT", "MAINTENANCE"]);
  assert.equal(merged[0].name, "Caro mới");
  assert.equal(mergeGames(built, [])[0], built[0]);
});

test("sai cấu trúc thì ném lỗi", () => {
  assert.throws(() => parseGames({}), /games/);
  assert.throws(() => parseGames({ games: [{ ...caro, hue: "pink" }] }), /hue/);
  assert.throws(() => parseGames({ games: [{ ...caro, seats: { min: 2 } }] }), /seats/);
});
