import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILT_GAMES, CATEGORIES, FEATURED_GAMES, featuredGames, hasPage, loadGames, mergeGames, parseGames, parseHome, withPages } from "./registry.ts";

const caro = {
  slug: "caro",
  name: "Cờ Caro",
  emoji: "⭕",
  status: "LIVE",
  category: "brain",
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

test("giữ thể loại hợp lệ, thiếu / lạ coi như chill", () => {
  const noCategory: Record<string, unknown> = { ...caro };
  delete noCategory.category;
  const games = parseGames({ games: [caro, { ...caro, slug: "a", category: "folk" }, { ...caro, slug: "b", category: "party" }, { ...noCategory, slug: "c" }] });
  assert.deepEqual(games.map((g) => g.category), ["brain", "folk", "chill", "chill"]);
  assert.deepEqual(CATEGORIES.map((c) => c.value), ["brain", "chill", "folk"]);
});

test("game có code thì có trang, bất kể trạng thái trên API", () => {
  assert.ok(hasPage("caro"));
  assert.ok(hasPage("battleship"));
  assert.ok(hasPage("draw-guess"));
  assert.ok(hasPage("oanquan"));
  assert.ok(hasPage("dots-boxes"));
  assert.ok(hasPage("co-chep"));
  assert.ok(hasPage("mine-control"));
  assert.ok(hasPage("kawaii"));
  assert.ok(hasPage("truc-xanh"));
  assert.ok(hasPage("minesweeper"));
  assert.ok(hasPage("reversi"));
  assert.ok(hasPage("co-cho"));
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

test("lúc chạy theo thứ tự API, có cả game API mới thêm, giữ game có trang mà API thiếu", () => {
  const built = withPages(parseGames({ games: [caro, { ...caro, slug: "loto" }] }));
  const fresh = parseGames({ games: [{ ...caro, slug: "loto" }, { ...caro, slug: "word-chain", status: "LIVE" }] });
  const merged = mergeGames(built, fresh);
  assert.deepEqual(merged.map((g) => g.slug), ["loto", "word-chain", "caro"]);
  assert.equal(merged[1].status, "DEVELOPMENT", "chưa có code thì vẫn là sắp ra mắt");
});

test("bản chép lúc build hợp lệ và có đủ mọi game đã có code", async () => {
  const games = await loadGames();
  assert.deepEqual(BUILT_GAMES.filter((s) => !games.some((g) => g.slug === s)), []);
  assert.ok(FEATURED_GAMES.every((s) => games.some((g) => g.slug === s && g.status === "LIVE")), "game nổi bật mặc định phải đang LIVE trong bản chép");
});

test("sai cấu trúc thì ném lỗi", () => {
  assert.throws(() => parseGames({}), /games/);
  assert.throws(() => parseGames({ games: [{ ...caro, hue: "pink" }] }), /hue/);
  assert.throws(() => parseGames({ games: [{ ...caro, seats: { min: 2 } }] }), /seats/);
});

test("game nổi bật theo thứ tự cố định, bỏ game không LIVE và bù bằng game LIVE khác", () => {
  assert.ok(FEATURED_GAMES.every(hasPage));
  const g = (slug: string, status = "LIVE") => ({ ...caro, slug, status });
  const games = parseGames({ games: [g("x"), g("werewolf", "MAINTENANCE"), g("sudoku"), g("y", "DEVELOPMENT"), g("caro"), g("z")] });
  assert.deepEqual(featuredGames(games).map((x) => x.slug), ["caro", "sudoku", "x", "z"]);
  assert.deepEqual(featuredGames(games, FEATURED_GAMES, 3).map((x) => x.slug), ["caro", "sudoku", "x"]);
});

test("game nổi bật theo thứ tự trong home.json, rỗng thì dùng mặc định", () => {
  const g = (slug: string, status = "LIVE") => ({ ...caro, slug, status });
  const games = parseGames({ games: [g("caro"), g("loto"), g("chess"), g("werewolf", "MAINTENANCE"), g("z")] });
  assert.deepEqual(featuredGames(games, ["chess", "nope", "werewolf", "loto"]).map((x) => x.slug), ["chess", "loto", "caro", "z"]);
  assert.deepEqual(featuredGames(games, ["loto"]).map((x) => x.slug), ["loto"]);
  assert.deepEqual(featuredGames(games, []).map((x) => x.slug), featuredGames(games).map((x) => x.slug));
});

test("đọc home.json", () => {
  assert.deepEqual(parseHome({ games: ["caro", "loto", "caro"] }), ["caro", "loto"]);
  assert.deepEqual(parseHome({ games: [] }), []);
  assert.throws(() => parseHome({}), /games/);
  assert.throws(() => parseHome({ games: [1] }), /games/);
});
