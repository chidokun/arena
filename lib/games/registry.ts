/**
 * Danh mục game. Slug (đường dẫn) dùng tiếng Anh, nội dung hiển thị tiếng Việt.
 *
 * Game nào có trang là việc của bản build (`BUILT_GAMES` — có code thì có trang); tên, mô tả và trạng thái lấy từ API,
 * trạng thái chỉ quyết định lúc chạy có cho vào hay không — đổi trạng thái không cần build lại.
 */

/** LIVE: đang mở chơi · MAINTENANCE: tạm khoá, vào là bị đưa về trang chủ · DEVELOPMENT: sắp ra mắt, cũng khoá như bảo trì. */
export type GameStatus = "LIVE" | "MAINTENANCE" | "DEVELOPMENT";

export type GameDef = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** Số ghế chơi (người thi đấu) mà chủ phòng có thể chọn. */
  seats: { min: number; max: number };
  /** Số người tối đa trong phòng (người chơi + người xem) mà chủ phòng có thể đặt; 0 là không giới hạn. */
  capacity: { min: number; max: number; default: number };
  status: GameStatus;
  /** Màu chủ đạo của thẻ game. */
  hue: "coral" | "sky" | "lime" | "grape" | "sun";
  emoji: string;
  /** Tên gọi người tạo phòng trong game này (mặc định "Chủ phòng"). */
  host?: string;
};

const HUES: readonly GameDef["hue"][] = ["coral", "sky", "lime", "grape", "sun"];

/** Danh mục game lấy từ API. */
export const GAMES_URL = "https://arena-api.nguyentuan.dev/games.json";

const range = (v: unknown, keys: string[]) => typeof v === "object" && v !== null && keys.every((k) => typeof (v as Record<string, unknown>)[k] === "number");

/** Đổi JSON của API thành danh sách GameDef; ném lỗi nếu sai cấu trúc để build dừng thay vì xuất trang hỏng. Trạng thái lạ coi như DEVELOPMENT. */
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
    return { ...raw, status } as GameDef;
  });
}

/**
 * Game có code (luật, lớp phòng, bàn chơi) trong bản build này: mỗi game có trang sảnh + phòng, bất kể trạng thái
 * trên API. Thêm game mới thì thêm slug vào đây (và nhánh tương ứng trong `RoomScreen` / `useRoom`).
 */
export const BUILT_GAMES: readonly string[] = ["caro", "loto", "werewolf", "undercover", "sudoku", "xiangqi", "dodge", "xiangqi-role", "connect-four", "battleship", "draw-guess"];

export const hasPage = (slug: string) => BUILT_GAMES.includes(slug);

/** Game chưa có code trong bản build này luôn là "sắp ra mắt", dù API ghi gì — không có trang để vào. */
export const withPages = (games: GameDef[]) => games.map((g): GameDef => (hasPage(g.slug) ? g : { ...g, status: "DEVELOPMENT" }));

/** Ghép danh mục mới tải lúc chạy vào danh mục lúc build: game đã có trong bản build lấy bản mới (tên, mô tả, trạng thái…). */
export function mergeGames(built: GameDef[], fresh: GameDef[]): GameDef[] {
  return withPages(built.map((g) => fresh.find((x) => x.slug === g.slug) ?? g));
}

const fetchGames = (cache: RequestCache) =>
  fetch(GAMES_URL, { cache }).then((res) => {
    if (!res.ok) throw new Error(`Không tải được ${GAMES_URL}: HTTP ${res.status}`);
    return res.json().then(parseGames);
  });

let loading: Promise<GameDef[]> | undefined;

/** Tải danh mục game (chỉ gọi một lần mỗi tiến trình). Chạy lúc build trong Server Component, kết quả nhúng sẵn vào trang tĩnh. */
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

/** Nạp danh mục lúc build cho các hàm đồng bộ bên dưới (một lần) — phía client do GamesProvider gọi trước khi các component con đọc. */
export function seedGames(games: GameDef[]) {
  if (!state.games.length) state = { ...state, games };
}

export const getGames = () => state.games;
/** Đã hỏi API lúc chạy ít nhất một lần (thành công hay không) — trước đó trạng thái chỉ là bản lúc build. */
export const isSynced = () => state.synced;
export const subscribeGames = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

let refreshing: Promise<void> | undefined;
let refreshedAt = 0;

/** Hỏi lại API (trình duyệt) để cập nhật trạng thái (mở / bảo trì / sắp ra mắt) mà không cần build lại; tối đa một lần mỗi phút. */
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

/** Game có trang, ở trạng thái nào cũng được — chặn hay không là việc của `MaintenanceGate`. */
export function getGame(slug: string) {
  return state.games.find((g) => g.slug === slug && hasPage(g.slug));
}

/** Tên gọi người tạo phòng của một game: "Chủ phòng", hoặc "Quản trò" (ma sói). */
export const hostTitle = (slug: string | undefined) => state.games.find((g) => g.slug === slug)?.host ?? "Chủ phòng";

export const gameHref = (slug: string) => `/games/${slug}/`;
export const roomHref = (slug: string, id: string) => `/games/${slug}/room/?id=${encodeURIComponent(id)}`;
