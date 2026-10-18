/**
 * Luật Nối Thú Kawaii (Pikachu / Onet): bàn xếp đầy ô hình con vật, mỗi loại 4 ô. Chọn hai ô cùng hình nối được bằng
 * đường gấp khúc tối đa 3 đoạn (gấp tối đa 2 lần) chỉ đi qua ô trống — được đi vòng ra ngoài viền bàn — thì cả hai biến
 * mất. Hết nước nối thì bàn tự xáo lại các ô còn lại. Dọn sạch bàn là hết ván.
 *
 * Phòng 1 người trở lên, không giới hạn, có hai chế độ:
 *
 *   Cùng giải đề (`coop`) — cả phòng chơi chung một bàn, không tính giờ: ai nối được một cặp trước người khác thì được
 *                           điểm cặp đó; xin gợi ý bị trừ điểm. Hết bàn thì người nhiều điểm nhất thắng.
 *   Đối kháng (`race`)     — mỗi người một bàn giống hệt nhau, tự dọn bàn của mình: ai dọn sạch trước thì thắng, những
 *                           người còn lại dọn tiếp tới khi xong để xếp hạng. Xin gợi ý bị khoá tay vài giây.
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

/** Đối kháng: xin gợi ý thì khoá tay chừng này. */
export const HINT_LOCK_MS = 5000;

export type Mode = "coop" | "race";
export const MODES: Record<Mode, { name: string; emoji: string; text: string }> = {
  coop: {
    name: "Cùng giải đề",
    emoji: "🤝",
    text: `Cả phòng chung một bàn: nối được một cặp trước người khác được ${PAIR_POINTS} điểm, xin gợi ý −${HINT_COST}. Không tính giờ — dọn sạch bàn là hết ván, nhiều điểm nhất thắng.`,
  },
  race: {
    name: "Đối kháng",
    emoji: "⚡",
    text: `Mỗi người một bàn giống hệt nhau, tự dọn bàn của mình — ai dọn sạch trước thắng, người còn lại dọn tiếp để xếp hạng. Xin gợi ý bị khoá tay ${HINT_LOCK_MS / 1000} giây.`,
  },
};
export const MODE_KEYS = Object.keys(MODES) as Mode[];

export type KwOptions = { size: SizeKey; mode: Mode };
export const DEFAULT_OPTIONS: KwOptions = { size: "m", mode: "coop" };

export function normOptions(o: unknown): KwOptions {
  const x = (o ?? {}) as Partial<KwOptions>;
  return { size: SIZE_KEYS.find((k) => k === x.size) ?? DEFAULT_OPTIONS.size, mode: MODE_KEYS.find((k) => k === x.mode) ?? DEFAULT_OPTIONS.mode };
}

/** Phần công khai của một ván, chủ phòng chốt lúc bắt đầu (`meta.kw`): bàn sinh từ `seed` theo `size`, chơi theo `mode`. */
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

/** Phần luật một ván cần để dựng lại bàn; ván cũ không có `mode` là cùng giải đề. */
export type KwRules = Pick<KwRound, "seed" | "size"> & { mode?: Mode };

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
  /** Đối kháng: thời gian (ms, tính từ lúc lộ bàn) từng người dọn sạch bàn; null nếu chưa xong. */
  fin?: (number | null)[];
};

export const emptyBoard = (players: number): Board => ({ log: [], seen: new Array<number>(players).fill(0) });

/** Một cặp đã nối: hai ô, loại hình, người nối, đường nối lúc đó — để diễn lại trên bàn. */
export type Taken = { a: number; b: number; kind: number; k: number; path: Point[] };

/** Một bàn đang chơi: cùng giải đề cả phòng chung một bàn, đối kháng mỗi người một bàn. */
export type Desk = {
  /** Loại hình của từng ô; −1 là ô trống. */
  tiles: number[];
  /** Số ô còn trên bàn. */
  left: number;
  /** Số lần bàn tự xáo vì bế tắc — nước đi gửi kèm số này để không áp nhầm lên bàn đã xáo. */
  shuffles: number;
  /** Xáo mãi vẫn bế tắc (gần như không thể) — bàn dừng ở đây. */
  stuck: boolean;
};

export type KwState = {
  mode: Mode;
  w: number;
  h: number;
  /** Cùng giải đề: một bàn chung; đối kháng: bàn của từng người theo thứ tự đội hình. */
  desks: Desk[];
  score: number[];
  /** Số cặp từng người nối được. */
  pairs: number[];
  /** Số lần từng người xin gợi ý. */
  hints: number[];
  /** Các cặp đã nối theo thứ tự (đối kháng: của mọi bàn, `k` là chủ bàn). */
  taken: Taken[];
  /** Số dòng nhật ký đã xét — để dựng tiếp từ trạng thái cũ khi nhật ký dài thêm. */
  count: number;
  /** Đối kháng: những người đã dọn sạch bàn, theo thứ tự xong. */
  finished: number[];
  /** Hết ván — cùng giải đề: dọn sạch bàn (hoặc bế tắc mãi); đối kháng: bàn ai cũng đã xong. */
  over: boolean;
  /**
   * Người thắng (thứ tự trong đội hình) — cùng giải đề: người nhiều điểm nhất (có thể đồng hạng), chỉ có khi hết ván;
   * đối kháng: người dọn sạch bàn đầu tiên, có ngay khi họ xong.
   */
  winners: number[];
};

/** Bàn người chơi thứ `k` đang chơi. */
export const deskOf = (s: KwState, k: number) => (s.mode === "race" ? s.desks[k] : s.desks[0]);

/** Bế tắc thì xáo lại các ô còn lại tới khi có nước nối; xáo mãi không được thì bàn dừng (`stuck`). */
function settle(d: Desk, w: number, h: number, seed: number) {
  if (d.left <= 0 || findMove(d.tiles, w, h)) return;
  const cells = d.tiles.flatMap((k, i) => (k >= 0 ? [i] : []));
  for (let k = 0; k < SHUFFLE_TRIES; k++) {
    const kinds = shuffle(
      cells.map((c) => d.tiles[c]),
      rng(mix(seed, d.shuffles, k)),
    );
    const tiles = d.tiles.slice();
    cells.forEach((c, i) => (tiles[c] = kinds[i]));
    if (findMove(tiles, w, h)) {
      d.tiles = tiles;
      d.shuffles++;
      return;
    }
  }
  d.stuck = true;
}

/** Xét hết ván sau mỗi nước. */
function check(s: KwState) {
  if (s.mode === "race") {
    s.over = s.desks.every((d) => d.left <= 0 || d.stuck);
    return;
  }
  const d = s.desks[0];
  if (d.left > 0 && !d.stuck) return;
  s.over = true;
  if (!s.score.length) return;
  const top = Math.max(...s.score);
  s.winners = s.score.flatMap((v, i) => (v === top ? [i] : []));
}

export function newGame(r: KwRules, players: number): KwState {
  const { w, h } = SIZES[r.size];
  const mode: Mode = r.mode === "race" ? "race" : "coop";
  const first: Desk = { tiles: deal(r.seed, r.size), left: w * h, shuffles: 0, stuck: false };
  settle(first, w, h, r.seed);
  const s: KwState = {
    mode,
    w,
    h,
    desks: Array.from({ length: mode === "race" ? players : 1 }, () => ({ ...first, tiles: first.tiles.slice() })),
    score: new Array<number>(players).fill(0),
    pairs: new Array<number>(players).fill(0),
    hints: new Array<number>(players).fill(0),
    taken: [],
    count: 0,
    finished: [],
    over: false,
    winners: [],
  };
  check(s);
  return s;
}

const isInt = (x: unknown): x is number => Number.isInteger(x);

/** Áp một dòng nhật ký; trả về false nếu không được tính (ô đã mất, không nối được, sai người, bàn đã xong…). */
function apply(s: KwState, seed: number, e: unknown): boolean {
  if (s.over || !Array.isArray(e) || !isInt(e[0]) || !isInt(e[1]) || !isInt(e[2])) return false;
  const [a, b, k] = e as Entry;
  if (k < 0 || k >= s.score.length) return false;
  const d = deskOf(s, k);
  if (d.left <= 0 || d.stuck) return false;
  if (a === -1 && b === -1) {
    s.hints[k]++;
    s.score[k] -= HINT_COST;
    return true;
  }
  const path = findPath(d.tiles, s.w, s.h, a, b);
  if (!path) return false;
  s.taken.push({ a, b, kind: d.tiles[a], k, path });
  d.tiles[a] = -1;
  d.tiles[b] = -1;
  d.left -= 2;
  s.pairs[k]++;
  s.score[k] += PAIR_POINTS;
  settle(d, s.w, s.h, seed);
  if (s.mode === "race" && d.left <= 0) {
    s.finished.push(k);
    s.winners = [s.finished[0]];
  }
  check(s);
  return true;
}

const clone = (s: KwState): KwState => ({
  ...s,
  desks: s.desks.map((d) => ({ ...d, tiles: d.tiles.slice() })),
  score: s.score.slice(),
  pairs: s.pairs.slice(),
  hints: s.hints.slice(),
  taken: s.taken.slice(),
  finished: s.finished.slice(),
  winners: s.winners.slice(),
});

/** Trạng thái cũ `from` dựng tiếp được cho cùng luật, cùng đội hình không. */
const fits = (from: KwState | undefined, r: KwRules, players: number, rows: number): from is KwState =>
  !!from && from.count <= rows && from.score.length === players && from.mode === (r.mode === "race" ? "race" : "coop");

/**
 * Dựng lại ván từ bàn chung — tất định, máy nào cũng ra như nhau. Có `from` (trạng thái đã dựng từ phần đầu của cùng
 * nhật ký) thì chỉ áp tiếp các dòng mới.
 */
export function replay(r: KwRules, players: number, log: readonly unknown[], from?: KwState): KwState {
  const s = fits(from, r, players, log.length) ? clone(from) : newGame(r, players);
  for (; s.count < log.length; s.count++) apply(s, r.seed, log[s.count]);
  return s;
}

/** Nước người chơi gửi có đúng dạng không. */
const isMove = (x: unknown): x is Move => Array.isArray(x) && (x.length === 1 ? x[0] === -1 : x.length === 3 && x.every(isInt));

/** Áp nước người thứ `k` gửi nếu đúng dạng và gửi lên đúng lần xáo của bàn họ; trả về dòng nhật ký được tính. */
function take(s: KwState, seed: number, k: number, mv: unknown): Entry | null {
  if (!isMove(mv)) return null;
  if (mv.length === 3 && mv[2] !== deskOf(s, k).shuffles) return null;
  const e: Entry = mv.length === 1 ? [-1, -1, k] : [mv[0], mv[1], k];
  return apply(s, seed, e) ? e : null;
}

/**
 * Chủ phòng phân xử: xét các nước mới trong nhật ký của từng người chơi (`moves[k]` — người thứ k của đội hình), ghi
 * những nước được tính vào bàn chung. Cặp đã bị người khác nối trước, hoặc gửi lên bàn trước lần xáo, thì bỏ qua.
 * `state` là trạng thái dựng từ `prev.log` (nếu đã có sẵn). Trả về bàn mới, hoặc null nếu không có gì đổi.
 */
export function judge(r: KwRules, moves: readonly (readonly unknown[])[], prev: Board, state?: KwState): Board | null {
  const players = moves.length;
  const s = state && state.count === prev.log.length && fits(state, r, players, prev.log.length) ? clone(state) : replay(r, players, prev.log);
  const log = prev.log.slice();
  const seen = Array.from({ length: players }, (_, k) => prev.seen[k] ?? 0);
  let dirty = false;
  for (let k = 0; k < players && !s.over; k++) {
    const list = moves[k];
    for (; seen[k] < list.length && !s.over; seen[k]++) {
      dirty = true;
      const e = take(s, r.seed, k, list[seen[k]]);
      if (e) {
        log.push(e);
        s.count++;
      }
    }
  }
  return dirty ? { ...prev, log, seen } : null;
}

/**
 * Chủ phòng ghi giờ (ms tính từ lúc lộ bàn) ai vừa dọn sạch bàn (đối kháng). Giờ đã ghi thì giữ nguyên. Trả về bàn mới,
 * hoặc null nếu không có gì đổi.
 */
export function stamp(b: Board, s: KwState, elapsed: number): Board | null {
  if (!s.finished.length) return null;
  const fin = Array.from({ length: s.score.length }, (_, k) => b.fin?.[k] ?? null);
  let dirty = false;
  for (const k of s.finished) {
    if (fin[k] != null) continue;
    fin[k] = elapsed;
    dirty = true;
  }
  return dirty ? { ...b, fin } : null;
}

/**
 * Đối kháng: bàn của chính mình dựng thẳng từ nhật ký nước nối của mình — ra đúng như bàn chủ phòng sẽ ghi (bàn mỗi
 * người chỉ đổi theo nước của người đó), nên không phải chờ chủ phòng, kể cả lúc bàn tự xáo. Có `from` (dựng từ phần
 * đầu của cùng nhật ký) thì chỉ áp tiếp các nước mới. `count` là số nước đã xét.
 */
export function ownGame(r: KwRules, moves: readonly unknown[], from?: KwState): KwState {
  const solo = { ...r, mode: "race" as const };
  const s = fits(from, solo, 1, moves.length) ? clone(from) : newGame(solo, 1);
  for (; s.count < moves.length; s.count++) take(s, r.seed, 0, moves[s.count]);
  return s;
}

/**
 * Cùng giải đề: bàn mình thấy trước khi chủ phòng kịp ghi nhận — áp tạm các cặp mình vừa nối (`pending` — những nước
 * chủ phòng chưa xét) lên bàn chung. Trả về bàn tạm và các cặp được áp.
 */
export function optimistic(s: KwState, pending: readonly unknown[]) {
  const d = s.desks[0];
  const tiles = d.tiles.slice();
  const pairs: [number, number][] = [];
  for (const mv of pending) {
    if (!isMove(mv) || mv.length === 1 || mv[2] !== d.shuffles) continue;
    const [a, b] = mv;
    if (!findPath(tiles, s.w, s.h, a, b)) continue;
    tiles[a] = -1;
    tiles[b] = -1;
    pairs.push([a, b]);
  }
  return { tiles, pairs };
}

/** Thời gian dạng m:ss. */
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
