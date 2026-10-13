/**
 * Luật Nối Thú Kawaii (Pikachu / Onet): bàn xếp đầy ô hình con vật, mỗi loại 4 ô. Chọn hai ô cùng hình nối được bằng
 * đường gấp khúc tối đa 3 đoạn (gấp tối đa 2 lần) chỉ đi qua ô trống — được đi vòng ra ngoài viền bàn — thì cả hai biến
 * mất. Hết nước nối thì bàn tự xáo lại các ô còn lại. Dọn sạch bàn là hết ván.
 *
 * Không tính giờ, chỉ tính điểm: cả phòng (1 người trở lên, không giới hạn) chơi chung một bàn, ai nối được một cặp trước
 * người khác thì được điểm cặp đó; xin gợi ý bị trừ điểm. Hết bàn thì người nhiều điểm nhất thắng.
 *
 * Bàn sinh tất định từ seed nên không phải gửi qua mạng. Người chơi chỉ ghi nhật ký nước nối của chính mình; chủ phòng là
 * người phân xử thứ tự (`judge`) và ghi bàn chung — ai cũng dựng lại được bàn, điểm số, người thắng từ bàn chung (`replay`).
 */

export const SIZES = {
  s: { w: 8, h: 6, label: "Nhỏ" },
  m: { w: 12, h: 8, label: "Vừa" },
  l: { w: 16, h: 9, label: "Lớn" },
} as const;
export type SizeKey = keyof typeof SIZES;
export const SIZE_KEYS: readonly SizeKey[] = ["s", "m", "l"];

/** Các loại hình — bàn lớn nhất (16×9, mỗi loại 4 ô) dùng hết 36 loại. */
export const TILES = [
  "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮",
  "🐷", "🐸", "🐵", "🐔", "🐧", "🐤", "🦆", "🦉", "🐺", "🐴", "🦄", "🐝",
  "🦋", "🐞", "🐢", "🐙", "🦀", "🐠", "🐬", "🐳", "🦒", "🦓", "🦔", "🦩",
] as const;
/** Số ô mỗi loại. */
export const COPIES = 4;

export const MIN_PLAYERS = 1;
/** Đếm ngược trước khi lộ bàn — để mọi người cùng bắt đầu. */
export const COUNTDOWN_MS = 3000;
/** Điểm mỗi cặp nối được. */
export const PAIR_POINTS = 10;
/** Điểm bị trừ mỗi lần xin gợi ý. */
export const HINT_COST = 5;
/** Số lần thử xáo bàn khi bế tắc trước khi chịu thua (gần như không bao giờ tới). */
const SHUFFLE_TRIES = 64;

export type KwOptions = { size: SizeKey };
export const DEFAULT_OPTIONS: KwOptions = { size: "m" };

export function normOptions(o: unknown): KwOptions {
  const x = (o ?? {}) as Partial<KwOptions>;
  return { size: SIZE_KEYS.find((k) => k === x.size) ?? DEFAULT_OPTIONS.size };
}

/** Phần công khai của một ván, chủ phòng chốt lúc bắt đầu (`meta.kw`): bàn sinh từ `seed` theo `size`. */
export type KwRound = KwOptions & {
  seed: number;
  /** Giờ máy chủ phòng lúc lộ bàn (hết đếm ngược). */
  t0: number;
};

/** Số loại hình của một cỡ bàn. */
export const kindsOf = (size: SizeKey) => (SIZES[size].w * SIZES[size].h) / COPIES;

// ---------- bàn ----------

/** Bộ sinh số giả ngẫu nhiên mulberry32: cùng seed ra cùng dãy. */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed riêng cho lần xáo thứ `n`, lần thử thứ `k`. */
const mix = (seed: number, n: number, k: number) => (seed ^ Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0;

function shuffle<T>(list: T[], rand: () => number) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Bàn ban đầu (chưa xét có nước nối hay không): loại hình của từng ô, mỗi loại `COPIES` ô. */
export function deal(seed: number, size: SizeKey): number[] {
  const kinds = Array.from({ length: kindsOf(size) * COPIES }, (_, i) => i % kindsOf(size));
  return shuffle(kinds, rng(seed));
}

/** Một điểm trên đường nối: toạ độ cột, hàng — được ra ngoài bàn một ô (−1 hoặc w / h) để đi vòng viền. */
export type Point = [x: number, y: number];

const DIRS: readonly Point[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Đường nối hai ô `a`, `b` (cùng loại, còn trên bàn): tối đa 3 đoạn thẳng ngang / dọc chỉ qua ô trống, được đi trên vành
 * ngoài bàn. Trả về các điểm gấp (đầu, các góc, cuối) — ít đoạn nhất có thể; null nếu không nối được.
 */
export function findPath(tiles: readonly number[], w: number, h: number, a: number, b: number): Point[] | null {
  const n = w * h;
  if (a === b || !(a >= 0 && a < n && b >= 0 && b < n) || tiles[a] < 0 || tiles[a] !== tiles[b]) return null;
  const W = w + 2;
  const at = (x: number, y: number) => (y + 1) * W + (x + 1);
  const target = at(b % w, Math.floor(b / w));
  const start = at(a % w, Math.floor(a / w));
  const free = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || tiles[y * w + x] < 0;
  // Điểm gấp trước đó của từng ô (chỉ số trên lưới có vành); -2 là chưa tới.
  const prev = new Int32Array(W * (h + 2)).fill(-2);
  prev[start] = -1;
  let frontier = [start];
  for (let seg = 0; seg < 3 && frontier.length; seg++) {
    const next: number[] = [];
    for (const p of frontier) {
      const px = (p % W) - 1;
      const py = Math.floor(p / W) - 1;
      for (const [dx, dy] of DIRS) {
        for (let x = px + dx, y = py + dy; x >= -1 && x <= w && y >= -1 && y <= h; x += dx, y += dy) {
          const q = at(x, y);
          if (q === target) {
            prev[q] = p;
            const path: Point[] = [];
            for (let c = q; c >= 0; c = prev[c]) path.push([(c % W) - 1, Math.floor(c / W) - 1]);
            return path.reverse();
          }
          if (!free(x, y)) break;
          if (prev[q] === -2) {
            prev[q] = p;
            next.push(q);
          }
        }
      }
    }
    frontier = next;
  }
  return null;
}

/** Một cặp nối được trên bàn (ưu tiên theo thứ tự ô); null nếu bế tắc. */
export function findMove(tiles: readonly number[], w: number, h: number): [number, number] | null {
  const groups = new Map<number, number[]>();
  tiles.forEach((k, i) => {
    if (k < 0) return;
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  });
  for (const g of groups.values())
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (findPath(tiles, w, h, g[i], g[j])) return [g[i], g[j]];
  return null;
}

// ---------- phân xử & dựng lại ván ----------

/**
 * Một nước chủ phòng đã ghi nhận: nối cặp ô `a`–`b`, hoặc xin gợi ý (`a` = `b` = −1); `player` là thứ tự trong đội hình.
 */
export type Entry = [a: number, b: number, player: number];
/** Nước người chơi gửi: nối cặp `a`–`b` trên bàn sau lần xáo thứ `shuffles`, hoặc `[-1]` là xin gợi ý. */
export type Move = [a: number, b: number, shuffles: number] | [hint: -1];

/** Bàn chung chủ phòng ghi (`g:<ván>`). */
export type Board = {
  /** Các nước đã phân xử, theo thứ tự chủ phòng thấy. */
  log: Entry[];
  /** Đã xét tới nước thứ mấy trong nhật ký của từng người chơi (theo thứ tự đội hình). */
  seen: number[];
};

export const emptyBoard = (players: number): Board => ({ log: [], seen: new Array<number>(players).fill(0) });

/** Một cặp đã nối: hai ô, loại hình, người nối, đường nối lúc đó — để diễn lại trên bàn. */
export type Taken = { a: number; b: number; kind: number; k: number; path: Point[] };

export type KwState = {
  w: number;
  h: number;
  /** Loại hình của từng ô; −1 là ô trống. */
  tiles: number[];
  score: number[];
  /** Số cặp từng người nối được. */
  pairs: number[];
  /** Số lần từng người xin gợi ý. */
  hints: number[];
  /** Số ô còn trên bàn. */
  left: number;
  /** Số lần bàn tự xáo vì bế tắc — nước đi gửi kèm số này để không áp nhầm lên bàn đã xáo. */
  shuffles: number;
  /** Các cặp đã nối theo thứ tự. */
  taken: Taken[];
  /** Số dòng nhật ký đã xét — để dựng tiếp từ trạng thái cũ khi nhật ký dài thêm. */
  count: number;
  /** Hết ván: dọn sạch bàn, hoặc (gần như không thể) xáo mãi vẫn bế tắc. */
  over: boolean;
  stuck: boolean;
  /** Người nhiều điểm nhất (thứ tự trong đội hình) — có thể đồng hạng; chỉ có khi hết ván. */
  winners: number[];
};

function finish(s: KwState, stuck: boolean) {
  s.over = true;
  s.stuck = stuck;
  if (!s.score.length) return;
  const top = Math.max(...s.score);
  s.winners = s.score.flatMap((v, i) => (v === top ? [i] : []));
}

/** Bế tắc thì xáo lại các ô còn lại tới khi có nước nối; xáo mãi không được thì hết ván. */
function settle(s: KwState, seed: number) {
  if (s.left <= 0) return finish(s, false);
  if (findMove(s.tiles, s.w, s.h)) return;
  const cells = s.tiles.flatMap((k, i) => (k >= 0 ? [i] : []));
  for (let k = 0; k < SHUFFLE_TRIES; k++) {
    const kinds = shuffle(
      cells.map((c) => s.tiles[c]),
      rng(mix(seed, s.shuffles, k)),
    );
    const tiles = s.tiles.slice();
    cells.forEach((c, i) => (tiles[c] = kinds[i]));
    if (findMove(tiles, s.w, s.h)) {
      s.tiles = tiles;
      s.shuffles++;
      return;
    }
  }
  finish(s, true);
}

export function newGame(r: Pick<KwRound, "seed" | "size">, players: number): KwState {
  const { w, h } = SIZES[r.size];
  const s: KwState = {
    w,
    h,
    tiles: deal(r.seed, r.size),
    score: new Array<number>(players).fill(0),
    pairs: new Array<number>(players).fill(0),
    hints: new Array<number>(players).fill(0),
    left: w * h,
    shuffles: 0,
    taken: [],
    count: 0,
    over: false,
    stuck: false,
    winners: [],
  };
  settle(s, r.seed);
  return s;
}

const isInt = (x: unknown): x is number => Number.isInteger(x);

/** Áp một dòng nhật ký; trả về false nếu không được tính (ô đã mất, không nối được, sai người…). */
function apply(s: KwState, seed: number, e: unknown): boolean {
  if (s.over || !Array.isArray(e) || !isInt(e[0]) || !isInt(e[1]) || !isInt(e[2])) return false;
  const [a, b, k] = e as Entry;
  if (k < 0 || k >= s.score.length) return false;
  if (a === -1 && b === -1) {
    s.hints[k]++;
    s.score[k] -= HINT_COST;
    return true;
  }
  const path = findPath(s.tiles, s.w, s.h, a, b);
  if (!path) return false;
  s.taken.push({ a, b, kind: s.tiles[a], k, path });
  s.tiles[a] = -1;
  s.tiles[b] = -1;
  s.left -= 2;
  s.pairs[k]++;
  s.score[k] += PAIR_POINTS;
  settle(s, seed);
  return true;
}

const clone = (s: KwState): KwState => ({
  ...s,
  tiles: s.tiles.slice(),
  score: s.score.slice(),
  pairs: s.pairs.slice(),
  hints: s.hints.slice(),
  taken: s.taken.slice(),
  winners: s.winners.slice(),
});

/**
 * Dựng lại ván từ bàn chung — tất định, máy nào cũng ra như nhau. Có `from` (trạng thái đã dựng từ phần đầu của cùng
 * nhật ký) thì chỉ áp tiếp các dòng mới.
 */
export function replay(r: Pick<KwRound, "seed" | "size">, players: number, log: readonly unknown[], from?: KwState): KwState {
  const s = from && from.count <= log.length && from.score.length === players ? clone(from) : newGame(r, players);
  for (; s.count < log.length; s.count++) apply(s, r.seed, log[s.count]);
  return s;
}

/** Nước người chơi gửi có đúng dạng không. */
const isMove = (x: unknown): x is Move => Array.isArray(x) && (x.length === 1 ? x[0] === -1 : x.length === 3 && x.every(isInt));

/**
 * Chủ phòng phân xử: xét các nước mới trong nhật ký của từng người chơi (`moves[k]` — người thứ k của đội hình), ghi
 * những nước được tính vào bàn chung. Cặp đã bị người khác nối trước, hoặc gửi lên bàn trước lần xáo, thì bỏ qua.
 * `state` là trạng thái dựng từ `prev.log` (nếu đã có sẵn). Trả về bàn mới, hoặc null nếu không có gì đổi.
 */
export function judge(r: Pick<KwRound, "seed" | "size">, moves: readonly (readonly unknown[])[], prev: Board, state?: KwState): Board | null {
  const players = moves.length;
  const s = state && state.count === prev.log.length ? clone(state) : replay(r, players, prev.log);
  const log = prev.log.slice();
  const seen = Array.from({ length: players }, (_, k) => prev.seen[k] ?? 0);
  let dirty = false;
  for (let k = 0; k < players && !s.over; k++) {
    const list = moves[k];
    for (; seen[k] < list.length && !s.over; seen[k]++) {
      dirty = true;
      const mv = list[seen[k]];
      if (!isMove(mv)) continue;
      if (mv.length === 3 && mv[2] !== s.shuffles) continue;
      const e: Entry = mv.length === 1 ? [-1, -1, k] : [mv[0], mv[1], k];
      if (apply(s, r.seed, e)) {
        log.push(e);
        s.count++;
      }
    }
  }
  return dirty ? { log, seen } : null;
}

/**
 * Bàn mình thấy trước khi chủ phòng kịp ghi nhận: áp tạm các cặp mình vừa nối (`pending` — những nước chủ phòng chưa
 * xét) lên bàn chung. Trả về bàn tạm và các cặp được áp.
 */
export function optimistic(s: KwState, pending: readonly unknown[]) {
  const tiles = s.tiles.slice();
  const pairs: [number, number][] = [];
  for (const mv of pending) {
    if (!isMove(mv) || mv.length === 1 || mv[2] !== s.shuffles) continue;
    const [a, b] = mv;
    if (!findPath(tiles, s.w, s.h, a, b)) continue;
    tiles[a] = -1;
    tiles[b] = -1;
    pairs.push([a, b]);
  }
  return { tiles, pairs };
}
