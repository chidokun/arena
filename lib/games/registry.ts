// Game nào có trang là việc của bản build (có code thì có trang); tên, mô tả và trạng thái lấy từ API để đổi trạng thái
// không cần build lại.

export type GameStatus = "LIVE" | "MAINTENANCE" | "DEVELOPMENT";

export type GameCategory = "brain" | "chill" | "folk";

export const CATEGORIES: readonly { value: GameCategory; label: string; emoji: string }[] = [
  { value: "brain", label: "Đấu trí căng não", emoji: "🧠" },
  { value: "chill", label: "Nhẹ nhàng chill chill", emoji: "🍃" },
  { value: "folk", label: "Trò chơi dân gian", emoji: "🏮" },
];

export type GameDef = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  seats: { min: number; max: number };
  capacity: { min: number; max: number; default: number };
  status: GameStatus;
  category: GameCategory;
  hue: "coral" | "sky" | "lime" | "grape" | "sun";
  emoji: string;
  host?: string;
};

const HUES: readonly GameDef["hue"][] = ["coral", "sky", "lime", "grape", "sun"];

export const GAMES_URL = "https://arena-api.nguyentuan.dev/games.json";

const range = (v: unknown, keys: string[]) => typeof v === "object" && v !== null && keys.every((k) => typeof (v as Record<string, unknown>)[k] === "number");

// Ném lỗi nếu sai cấu trúc để build dừng thay vì xuất trang hỏng. Thể loại thiếu / lạ thì coi như "chill" vì nó chỉ
// ảnh hưởng chỗ xếp thẻ ở trang chủ.
export function parseGames(json: unknown): GameDef[] {
  const list = (json as { games?: unknown })?.games;
  if (!Array.isArray(list)) throw new Error(`${GAMES_URL}: thiếu mảng "games"`);
  return list.map((raw: Record<string, unknown>, i) => {
    const bad = (field: string) => new Error(`${GAMES_URL}: games[${i}] (${String(raw?.slug)}) sai trường "${field}"`);
    for (const f of ["slug", "name", "tagline", "description", "emoji", "status"]) if (typeof raw?.[f] !== "string") throw bad(f);
    if (!range(raw.seats, ["min", "max"])) throw bad("seats");
    if (!range(raw.capacity, ["min", "max", "default"])) throw bad("capacity");
    if (!HUES.includes(raw.hue as GameDef["hue"])) throw bad("hue");
    if (raw.host !== undefined && typeof raw.host !== "string") throw bad("host");
    const status = raw.status === "LIVE" || raw.status === "MAINTENANCE" ? raw.status : "DEVELOPMENT";
    const category = CATEGORIES.some((c) => c.value === raw.category) ? raw.category : "chill";
    return { ...raw, status, category } as GameDef;
  });
}

// Thêm game mới thì thêm slug vào đây (và nhánh tương ứng trong `RoomScreen` / `useRoom`).
export const BUILT_GAMES: readonly string[] = ["caro", "loto", "werewolf", "undercover", "sudoku", "xiangqi", "xiangqi-role", "connect-four", "battleship", "draw-guess", "oanquan", "chess", "dots-boxes", "co-chep", "mine-control", "kawaii", "truc-xanh", "minesweeper", "reversi", "co-cho", "system-design", "citta-challenge", "typing-race"];

export const hasPage = (slug: string) => BUILT_GAMES.includes(slug);

// Logo nằm trong bản build (public/games/<slug>.webp) nên chỉ game có trang mới có; game "sắp ra mắt" từ API vẫn dùng emoji.
export const gameLogo = (slug: string) => (hasPage(slug) ? `/games/${slug}.webp` : null);

// Game chưa có code trong bản build luôn là "sắp ra mắt" dù API ghi gì, vì không có trang để vào.
export const withPages = (games: GameDef[]) => games.map((g): GameDef => (hasPage(g.slug) ? g : { ...g, status: "DEVELOPMENT" }));

export function mergeGames(built: GameDef[], fresh: GameDef[]): GameDef[] {
  return withPages(built.map((g) => fresh.find((x) => x.slug === g.slug) ?? g));
}

const fetchGames = (cache: RequestCache) =>
  fetch(GAMES_URL, { cache }).then((res) => {
    if (!res.ok) throw new Error(`Không tải được ${GAMES_URL}: HTTP ${res.status}`);
    return res.json().then(parseGames);
  });

let loading: Promise<GameDef[]> | undefined;

export function loadGames() {
  return (loading ??= fetchGames("force-cache")
    .then((fresh) => {
      const games = withPages(fresh);
      seedGames(games);
      return games;
    })
    .catch((e) => {
      loading = undefined;
      throw e;
    }));
}

let state = { games: [] as GameDef[], synced: false };
const listeners = new Set<() => void>();

function update(next: Partial<typeof state>) {
  state = { ...state, ...next };
  listeners.forEach((f) => f());
}

export function seedGames(games: GameDef[]) {
  if (!state.games.length) state = { ...state, games };
}

export const getGames = () => state.games;
export const isSynced = () => state.synced;
export const subscribeGames = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

let refreshing: Promise<void> | undefined;
let refreshedAt = 0;

export function refreshGames() {
  if (refreshing) return refreshing;
  if (Date.now() - refreshedAt < 60_000) return Promise.resolve();
  return (refreshing = fetchGames("no-cache")
    .then((fresh) => update({ games: mergeGames(state.games, fresh) }))
    .catch((e) => console.warn("Không cập nhật được danh mục game:", e))
    .finally(() => {
      refreshing = undefined;
      refreshedAt = Date.now();
      if (!state.synced) update({ synced: true });
    }));
}

export function getGame(slug: string) {
  return state.games.find((g) => g.slug === slug && hasPage(g.slug));
}

export const hostTitle = (slug: string | undefined) => state.games.find((g) => g.slug === slug)?.host ?? "Chủ phòng";

export const gameHref = (slug: string) => `/games/${slug}/`;
export const roomHref = (slug: string, id: string) => `/games/${slug}/room/?id=${encodeURIComponent(id)}`;
