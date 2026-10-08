/** Danh mục game. Slug (đường dẫn) dùng tiếng Anh, nội dung hiển thị tiếng Việt. */

/** LIVE: đang mở chơi · MAINTENANCE: có trang nhưng tạm khoá, vào là bị đưa về trang chủ · DEVELOPMENT: sắp ra mắt, chưa có trang. */
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

/** Game có trang (lobby/phòng) được xuất lúc build. */
export const routable = (g: GameDef) => g.status !== "DEVELOPMENT";

/**
 * Ghép danh mục mới tải lúc chạy vào danh mục lúc build. Chỉ game đã có trang mới đổi được trạng thái
 * (LIVE ⇄ MAINTENANCE); game chưa có trang giữ nguyên, game bị hạ về DEVELOPMENT coi như bảo trì.
 */
export function mergeGames(built: GameDef[], fresh: GameDef[]): GameDef[] {
  return built.map((g) => {
    const f = fresh.find((x) => x.slug === g.slug);
    if (!f || !routable(g)) return g;
    return { ...f, status: routable(f) ? f.status : "MAINTENANCE" };
  });
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
    .then((games) => {
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

/** Hỏi lại API (trình duyệt) để cập nhật trạng thái bảo trì mà không cần build lại; tối đa một lần mỗi phút. */
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

/** Game có trang (đang chơi được hoặc đang bảo trì). */
export function getGame(slug: string) {
  return state.games.find((g) => g.slug === slug && routable(g));
}

/** Tên gọi người tạo phòng của một game: "Chủ phòng", hoặc "Quản trò" (ma sói). */
export const hostTitle = (slug: string | undefined) => state.games.find((g) => g.slug === slug)?.host ?? "Chủ phòng";

export const gameHref = (slug: string) => `/games/${slug}/`;
export const roomHref = (slug: string, id: string) => `/games/${slug}/room/?id=${encodeURIComponent(id)}`;
