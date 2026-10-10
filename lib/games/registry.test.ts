import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILT_GAMES, hasPage, mergeGames, parseGames, withPages } from "./registry.ts";

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

test("game có code thì có trang, bất kể trạng thái trên API", () => {
  assert.ok(hasPage("caro"));
  assert.ok(hasPage("battleship"));
  assert.ok(hasPage("draw-guess"));
  assert.ok(hasPage("mandarin-square"));
  assert.equal(hasPage("word-chain"), false);
  assert.equal(new Set(BUILT_GAMES).size, BUILT_GAMES.length);
});

test("game chưa có code luôn là sắp ra mắt", () => {
  const games = withPages(parseGames({ games: [caro, { ...caro, slug: "word-chain", status: "LIVE" }] }));
  assert.deepEqual(games.map((g) => g.status), ["LIVE", "DEVELOPMENT"]);
});

test("trạng thái lúc chạy đổi được mọi game đã có trang, kể cả từ sắp ra mắt", () => {
  const built = withPages(
    parseGames({
      games: [caro, { ...caro, slug: "battleship", status: "DEVELOPMENT" }, { ...caro, slug: "xiangqi" }, { ...caro, slug: "word-chain", status: "DEVELOPMENT" }],
    }),
  );
  const fresh = parseGames({
    games: [
      { ...caro, status: "MAINTENANCE", name: "Caro mới" },
      { ...caro, slug: "battleship", status: "LIVE" },
      { ...caro, slug: "xiangqi", status: "DEVELOPMENT" },
      { ...caro, slug: "word-chain", status: "LIVE" },
    ],
  });
  const merged = mergeGames(built, fresh);
  assert.deepEqual(merged.map((g) => g.status), ["MAINTENANCE", "LIVE", "DEVELOPMENT", "DEVELOPMENT"]);
  assert.equal(merged[0].name, "Caro mới");
  assert.deepEqual(mergeGames(built, []), built);
});

test("sai cấu trúc thì ném lỗi", () => {
  assert.throws(() => parseGames({}), /games/);
  assert.throws(() => parseGames({ games: [{ ...caro, hue: "pink" }] }), /hue/);
  assert.throws(() => parseGames({ games: [{ ...caro, seats: { min: 2 } }] }), /seats/);
});
