// Chừa sẵn vùng xuất phát (mở sẵn lúc lộ bàn, không tính điểm) để không ai phải đoán mò nước đầu. Mìn rải tất định từ
// seed nên — như mọi game "tự dựng lại ván" khác trong P2P — ai mở mã nguồn trang ra soi thì đọc được vị trí mìn.

export const SIZES = {
  s: { w: 9, h: 9, label: "Nhỏ", mines: 10 },
  m: { w: 16, h: 16, label: "Vừa", mines: 40 },
  l: { w: 30, h: 16, label: "Lớn", mines: 99 },
  xl: { w: 40, h: 24, label: "Khổng lồ", mines: 190 },
} as const;
export type SizeKey = keyof typeof SIZES;
export const SIZE_KEYS: readonly SizeKey[] = ["s", "m", "l", "xl"];

export const MIN_PLAYERS = 1;
// Đếm ngược trước khi lộ bàn để mọi người cùng bắt đầu.
export const COUNTDOWN_MS = 3000;
// Thưa quá thì một cú bấm lan hết bàn, dày quá thì phải đoán mò liên tục.
export const MIN_DENSITY = 0.1;
export const MAX_DENSITY = 0.3;

const cellsOf = (size: SizeKey) => SIZES[size].w * SIZES[size].h;
export const minMines = (size: SizeKey) => Math.ceil(cellsOf(size) * MIN_DENSITY);
export const maxMines = (size: SizeKey) => Math.floor(cellsOf(size) * MAX_DENSITY);

export const density = (size: SizeKey, mines: number) => Math.round((mines / cellsOf(size)) * 100);

export type MsOptions = { size: SizeKey; mines: number };
export const DEFAULT_OPTIONS: MsOptions = { size: "m", mines: SIZES.m.mines };

export function normOptions(o: unknown): MsOptions {
  const x = (o ?? {}) as Partial<MsOptions>;
  const size = SIZE_KEYS.find((k) => k === x.size) ?? DEFAULT_OPTIONS.size;
  const n = Number.isFinite(x.mines) ? Math.round(x.mines!) : SIZES[size].mines;
  return { size, mines: Math.min(maxMines(size), Math.max(minMines(size), n)) };
}

export type MsRound = MsOptions & {
  seed: number;
  t0: number;
};

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

export function around(w: number, h: number, c: number): number[] {
  const x = c % w;
  const y = Math.floor(c / w);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) out.push(ny * w + nx);
    }
  return out;
}

export type Layout = {
  w: number;
  h: number;
  mines: number;
  mine: Uint8Array;
  near: Uint8Array;
  start: number;
  opening: number[];
};

export function floodFrom(w: number, h: number, mine: Uint8Array, near: Uint8Array, c: number): number[] {
  const seen = new Uint8Array(w * h);
  const out: number[] = [];
  const stack = [c];
  while (stack.length) {
    const x = stack.pop()!;
    if (seen[x] || mine[x]) continue;
    seen[x] = 1;
    out.push(x);
    if (!near[x]) for (const d of around(w, h, x)) if (!seen[d]) stack.push(d);
  }
  return out;
}

// Không để vùng xuất phát lan ra làm bàn tự giải gần hết.
const MAX_OPENING = 0.4;
const LAYOUT_TRIES = 16;

export function makeLayout(r: Pick<MsRound, "seed" | "size" | "mines">): Layout {
  const { w, h } = SIZES[r.size];
  const rand = rng(r.seed);
  let lay: Layout | null = null;
  for (let t = 0; t < LAYOUT_TRIES; t++) {
    const start = (1 + Math.floor(rand() * (h - 2))) * w + 1 + Math.floor(rand() * (w - 2));
    const safe = new Set([start, ...around(w, h, start)]);
    const free: number[] = [];
    for (let c = 0; c < w * h; c++) if (!safe.has(c)) free.push(c);
    const n = Math.max(0, Math.min(r.mines, free.length));
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(rand() * (free.length - i));
      [free[i], free[j]] = [free[j], free[i]];
    }
    const mine = new Uint8Array(w * h);
    for (let i = 0; i < n; i++) mine[free[i]] = 1;
    const near = new Uint8Array(w * h);
    for (let c = 0; c < w * h; c++) for (const d of around(w, h, c)) near[c] += mine[d];
    const opening = floodFrom(w, h, mine, near, start);
    lay = { w, h, mines: n, mine, near, start, opening };
    if (opening.length <= (w * h - n) * MAX_OPENING) return lay;
  }
  return { ...lay!, opening: [lay!.start, ...around(w, h, lay!.start)] };
}

export const HIDDEN = -2;
export const START = -1;

export type Entry = [cell: number, player: number];

export type Board = {
  log: Entry[];
  seen: number[];
  time?: number;
};

export const emptyBoard = (players: number): Board => ({ log: [], seen: new Array<number>(players).fill(0) });

export type Fate = "boom" | "left";

export type MsState = {
  w: number;
  h: number;
  by: number[];
  boom: number[];
  score: number[];
  alive: boolean[];
  fate: (Fate | null)[];
  out: number[];
  left: number;
  // Để dựng tiếp từ trạng thái cũ khi nhật ký dài thêm.
  count: number;
  over: boolean;
  cleared: boolean;
  winners: number[];
};

function flood(s: MsState, lay: Layout, c: number, k: number): number {
  let n = 0;
  const stack = [c];
  while (stack.length) {
    const x = stack.pop()!;
    if (s.by[x] !== HIDDEN || lay.mine[x]) continue;
    s.by[x] = k;
    n++;
    if (!lay.near[x]) for (const d of around(lay.w, lay.h, x)) if (s.by[d] === HIDDEN) stack.push(d);
  }
  s.left -= n;
  return n;
}

const aliveCount = (s: MsState) => s.alive.filter(Boolean).length;

function settle(s: MsState) {
  if (s.left <= 0) {
    s.over = true;
    s.cleared = true;
    const live = s.score.flatMap((v, k) => (s.alive[k] ? [v] : []));
    if (!live.length) return;
    const top = Math.max(...live);
    s.winners = s.score.flatMap((v, k) => (s.alive[k] && v === top ? [k] : []));
  } else if (s.alive.length && !aliveCount(s)) s.over = true;
}

export function newGame(lay: Layout, players: number): MsState {
  const s: MsState = {
    w: lay.w,
    h: lay.h,
    by: new Array<number>(lay.w * lay.h).fill(HIDDEN),
    boom: new Array<number>(lay.w * lay.h).fill(-1),
    score: new Array<number>(players).fill(0),
    alive: new Array<boolean>(players).fill(true),
    fate: new Array<Fate | null>(players).fill(null),
    out: [],
    left: lay.w * lay.h - lay.mines,
    count: 0,
    over: false,
    cleared: false,
    winners: [],
  };
  for (const c of lay.opening) s.by[c] = START;
  s.left -= lay.opening.length;
  settle(s);
  return s;
}

const isInt = (x: unknown): x is number => Number.isInteger(x);

function eliminate(s: MsState, k: number, fate: Fate) {
  s.alive[k] = false;
  s.fate[k] = fate;
  s.out.push(k);
}

function apply(s: MsState, lay: Layout, e: unknown): boolean {
  if (s.over || !Array.isArray(e) || !isInt(e[0]) || !isInt(e[1])) return false;
  const [c, k] = e as Entry;
  if (k < 0 || k >= s.score.length || !s.alive[k]) return false;
  if (c === -1) {
    eliminate(s, k, "left");
    settle(s);
    return true;
  }
  if (c < 0 || c >= s.by.length || s.by[c] !== HIDDEN || s.boom[c] >= 0) return false;
  if (lay.mine[c]) {
    s.boom[c] = k;
    eliminate(s, k, "boom");
  } else s.score[k] += flood(s, lay, c, k);
  settle(s);
  return true;
}

const clone = (s: MsState): MsState => ({
  ...s,
  by: s.by.slice(),
  boom: s.boom.slice(),
  score: s.score.slice(),
  alive: s.alive.slice(),
  fate: s.fate.slice(),
  out: s.out.slice(),
  winners: s.winners.slice(),
});

export function replay(lay: Layout, players: number, log: readonly unknown[], from?: MsState): MsState {
  const s = from && from.count <= log.length && from.score.length === players && from.by.length === lay.w * lay.h ? clone(from) : newGame(lay, players);
  for (; s.count < log.length; s.count++) apply(s, lay, log[s.count]);
  return s;
}

export function judge(lay: Layout, moves: readonly (readonly unknown[])[], prev: Board, state?: MsState, gone: readonly number[] = []): Board | null {
  const players = moves.length;
  const s = state && state.count === prev.log.length ? clone(state) : replay(lay, players, prev.log);
  const log = prev.log.slice();
  const seen = Array.from({ length: players }, (_, k) => prev.seen[k] ?? 0);
  let dirty = false;
  const take = (e: Entry) => {
    if (!apply(s, lay, e)) return;
    log.push(e);
    s.count++;
  };
  for (let k = 0; k < players && !s.over; k++) {
    const list = moves[k];
    for (; seen[k] < list.length && !s.over; seen[k]++) {
      dirty = true;
      const c = list[seen[k]];
      if (isInt(c) && c >= 0) take([c, k]);
    }
  }
  for (const k of gone) {
    if (s.over || !s.alive[k]) continue;
    dirty = true;
    take([-1, k]);
  }
  return dirty ? { ...prev, log, seen } : null;
}

// Áp tạm các ô mình vừa mở lên bàn chung để không phải chờ chủ phòng ghi nhận.
export function optimistic(s: MsState, lay: Layout, k: number, pending: readonly unknown[]): MsState {
  if (!pending.length || k < 0) return s;
  const t = clone(s);
  for (const c of pending) if (isInt(c) && c >= 0) apply(t, lay, [c, k]);
  return t;
}

export function chordCells(s: MsState, lay: Layout, c: number, flags: ReadonlySet<number>): number[] {
  if (s.by[c] === HIDDEN || !lay.near[c]) return [];
  const ring = around(lay.w, lay.h, c);
  const marked = ring.filter((d) => s.boom[d] >= 0 || (s.by[d] === HIDDEN && flags.has(d))).length;
  if (marked !== lay.near[c]) return [];
  return ring.filter((d) => s.by[d] === HIDDEN && s.boom[d] < 0 && !flags.has(d));
}

export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
