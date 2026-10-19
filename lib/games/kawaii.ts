// Bàn sinh tất định từ seed nên không phải gửi qua mạng.

export const SIZES = {
  s: { w: 8, h: 6, label: "Nhỏ" },
  m: { w: 12, h: 8, label: "Vừa" },
  l: { w: 16, h: 9, label: "Lớn" },
} as const;
export type SizeKey = keyof typeof SIZES;
export const SIZE_KEYS: readonly SizeKey[] = ["s", "m", "l"];

export const TILES = [
  "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮",
  "🐷", "🐸", "🐵", "🐔", "🐧", "🐤", "🦆", "🦉", "🐺", "🐴", "🦄", "🐝",
  "🦋", "🐞", "🐢", "🐙", "🦀", "🐠", "🐬", "🐳", "🦒", "🦓", "🦔", "🦩",
] as const;
export const COPIES = 4;

export const MIN_PLAYERS = 1;
// Đếm ngược trước khi lộ bàn để mọi người cùng bắt đầu.
export const COUNTDOWN_MS = 3000;
export const PAIR_POINTS = 10;
export const HINT_COST = 5;
const SHUFFLE_TRIES = 64;

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

export type KwRound = KwOptions & {
  seed: number;
  t0: number;
};

export const kindsOf = (size: SizeKey) => (SIZES[size].w * SIZES[size].h) / COPIES;

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

const mix = (seed: number, n: number, k: number) => (seed ^ Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0;

function shuffle<T>(list: T[], rand: () => number) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function deal(seed: number, size: SizeKey): number[] {
  const kinds = Array.from({ length: kindsOf(size) * COPIES }, (_, i) => i % kindsOf(size));
  return shuffle(kinds, rng(seed));
}

export type Point = [x: number, y: number];

const DIRS: readonly Point[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function findPath(tiles: readonly number[], w: number, h: number, a: number, b: number): Point[] | null {
  const n = w * h;
  if (a === b || !(a >= 0 && a < n && b >= 0 && b < n) || tiles[a] < 0 || tiles[a] !== tiles[b]) return null;
  const W = w + 2;
  const at = (x: number, y: number) => (y + 1) * W + (x + 1);
  const target = at(b % w, Math.floor(b / w));
  const start = at(a % w, Math.floor(a / w));
  const free = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || tiles[y * w + x] < 0;
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

// Ván cũ không có `mode` là cùng giải đề.
export type KwRules = Pick<KwRound, "seed" | "size"> & { mode?: Mode };

export type Entry = [a: number, b: number, player: number];
export type Move = [a: number, b: number, shuffles: number] | [hint: -1];

export type Board = {
  log: Entry[];
  seen: number[];
  fin?: (number | null)[];
};

export const emptyBoard = (players: number): Board => ({ log: [], seen: new Array<number>(players).fill(0) });

export type Taken = { a: number; b: number; kind: number; k: number; path: Point[] };

export type Desk = {
  tiles: number[];
  left: number;
  // Nước đi gửi kèm số lần xáo để không áp nhầm lên bàn đã xáo.
  shuffles: number;
  stuck: boolean;
};

export type KwState = {
  mode: Mode;
  w: number;
  h: number;
  desks: Desk[];
  score: number[];
  pairs: number[];
  hints: number[];
  taken: Taken[];
  // Để dựng tiếp từ trạng thái cũ khi nhật ký dài thêm.
  count: number;
  finished: number[];
  over: boolean;
  winners: number[];
};

export const deskOf = (s: KwState, k: number) => (s.mode === "race" ? s.desks[k] : s.desks[0]);

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

const fits = (from: KwState | undefined, r: KwRules, players: number, rows: number): from is KwState =>
  !!from && from.count <= rows && from.score.length === players && from.mode === (r.mode === "race" ? "race" : "coop");

export function replay(r: KwRules, players: number, log: readonly unknown[], from?: KwState): KwState {
  const s = fits(from, r, players, log.length) ? clone(from) : newGame(r, players);
  for (; s.count < log.length; s.count++) apply(s, r.seed, log[s.count]);
  return s;
}

const isMove = (x: unknown): x is Move => Array.isArray(x) && (x.length === 1 ? x[0] === -1 : x.length === 3 && x.every(isInt));

function take(s: KwState, seed: number, k: number, mv: unknown): Entry | null {
  if (!isMove(mv)) return null;
  if (mv.length === 3 && mv[2] !== deskOf(s, k).shuffles) return null;
  const e: Entry = mv.length === 1 ? [-1, -1, k] : [mv[0], mv[1], k];
  return apply(s, seed, e) ? e : null;
}

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

// Bàn mỗi người chỉ đổi theo nước của người đó, nên dựng thẳng từ nhật ký của mình là ra đúng bàn chủ phòng sẽ ghi —
// không phải chờ chủ phòng, kể cả lúc bàn tự xáo.
export function ownGame(r: KwRules, moves: readonly unknown[], from?: KwState): KwState {
  const solo = { ...r, mode: "race" as const };
  const s = fits(from, solo, 1, moves.length) ? clone(from) : newGame(solo, 1);
  for (; s.count < moves.length; s.count++) take(s, r.seed, 0, moves[s.count]);
  return s;
}

// Áp tạm các cặp mình vừa nối lên bàn chung để không phải chờ chủ phòng ghi nhận.
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

export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
