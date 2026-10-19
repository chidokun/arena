// Đề sinh tất định từ seed nên không phải gửi qua mạng: mọi máy tự dựng cùng một đề.

export type Level = "easy" | "medium" | "hard";
export type Mode = "coop" | "race";
export type SudokuOptions = { level: Level; mode: Mode };

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 10;
export const COUNTDOWN_MS = 5000;
export const LOCK_MS = 5000;

export const LEVELS: Record<Level, { name: string; emoji: string; text: string }> = {
  easy: { name: "Dễ", emoji: "🌱", text: "Nhiều số cho sẵn, chỉ cần dò hàng – cột – khối." },
  medium: { name: "Vừa", emoji: "🌿", text: "Ít số hơn, đôi khi phải tìm chỗ duy nhất của một số trong hàng – cột – khối." },
  hard: { name: "Khó", emoji: "🔥", text: "Ít số cho sẵn, thường phải tìm chỗ duy nhất của từng số — nên dùng ghi chú." },
};
export const LEVEL_KEYS = Object.keys(LEVELS) as Level[];

export const MODES: Record<Mode, { name: string; emoji: string; text: string }> = {
  coop: { name: "Cùng giải đề", emoji: "🤝", text: "Cả phòng điền chung một bàn: điền đúng một ô trước người khác được 1 điểm, sai bị trừ 1 điểm. Nhiều điểm nhất thắng." },
  race: { name: "Đối kháng", emoji: "⚡", text: "Mỗi người tự giải đề của mình, ai giải xong trước thắng — người còn lại giải tiếp để xếp hạng. Ô người khác đã giải được tô màu người giải nhanh nhất; điền sai bị khoá tay 5 giây." },
};
export const MODE_KEYS = Object.keys(MODES) as Mode[];

export const DEFAULT_OPTIONS: SudokuOptions = { level: "easy", mode: "coop" };

export type SudokuRound = SudokuOptions & {
  seed: number;
  t0: number;
};

export function normOptions(o: unknown): SudokuOptions {
  const x = (o ?? {}) as Partial<SudokuOptions>;
  return {
    level: LEVEL_KEYS.includes(x.level as Level) ? (x.level as Level) : DEFAULT_OPTIONS.level,
    mode: MODE_KEYS.includes(x.mode as Mode) ? (x.mode as Mode) : DEFAULT_OPTIONS.mode,
  };
}

export const CELLS = 81;
export const rowOf = (i: number) => Math.floor(i / 9);
export const colOf = (i: number) => i % 9;
export const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

const UNITS: number[][] = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3))),
];

export const sees = (a: number, b: number) => a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b));

const ALL = 0x3fe; // bit 1..9
const bits = (mask: number) => {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
};

function usedMasks(grid: readonly number[]) {
  const rows = new Array<number>(9).fill(0);
  const cols = new Array<number>(9).fill(0);
  const boxes = new Array<number>(9).fill(0);
  for (let i = 0; i < CELLS; i++) {
    const d = grid[i];
    if (!d) continue;
    const b = 1 << d;
    const r = rowOf(i);
    const c = colOf(i);
    const x = boxOf(i);
    if ((rows[r] | cols[c] | boxes[x]) & b) return null;
    rows[r] |= b;
    cols[c] |= b;
    boxes[x] |= b;
  }
  return { rows, cols, boxes };
}

// Có `rand` thì thử các số theo thứ tự ngẫu nhiên để sinh bàn đầy.
function search(grid: readonly number[], limit: number, rand?: () => number, out?: number[]): number {
  const g = grid.slice();
  const used = usedMasks(g);
  if (!used) return 0;
  const { rows, cols, boxes } = used;
  let count = 0;
  const rec = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < CELLS; i++) {
      if (g[i]) continue;
      const mask = ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]);
      const n = bits(mask);
      if (n === 0) return false;
      if (n < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = n;
        if (n === 1) break;
      }
    }
    if (best < 0) {
      if (count === 0 && out) for (let i = 0; i < CELLS; i++) out[i] = g[i];
      return ++count >= limit;
    }
    const digits: number[] = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
    const order = rand ? shuffle(digits, rand) : digits;
    const r = rowOf(best);
    const c = colOf(best);
    const x = boxOf(best);
    for (const d of order) {
      const b = 1 << d;
      g[best] = d;
      rows[r] |= b;
      cols[c] |= b;
      boxes[x] |= b;
      if (rec()) return true;
      rows[r] &= ~b;
      cols[c] &= ~b;
      boxes[x] &= ~b;
    }
    g[best] = 0;
    return false;
  };
  rec();
  return count;
}

// Mặc định đếm tới 2 — đủ để biết đề có duy nhất một lời giải không.
export const countSolutions = (grid: readonly number[], limit = 2) => search(grid, limit);

// Đề giải kín được bằng "ô đơn" thì chắc chắn duy nhất lời giải.
export function solvesBySingles(grid: readonly number[], hidden: boolean): boolean {
  const g = grid.slice();
  const used = usedMasks(g);
  if (!used) return false;
  const { rows, cols, boxes } = used;
  const place = (i: number, d: number) => {
    const b = 1 << d;
    g[i] = d;
    rows[rowOf(i)] |= b;
    cols[colOf(i)] |= b;
    boxes[boxOf(i)] |= b;
  };
  const cand = (i: number) => ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]);
  for (let progress = true; progress; ) {
    progress = false;
    for (let i = 0; i < CELLS; i++) {
      if (g[i]) continue;
      const mask = cand(i);
      if (!mask) return false;
      if (bits(mask) === 1) {
        place(i, 31 - Math.clz32(mask));
        progress = true;
      }
    }
    if (progress || !hidden) continue;
    for (const unit of UNITS) {
      for (let d = 1; d <= 9; d++) {
        const b = 1 << d;
        let spot = -1;
        let n = 0;
        for (const i of unit) {
          if (g[i] === d) {
            n = -1;
            break;
          }
          if (!g[i] && cand(i) & b) {
            spot = i;
            n++;
          }
        }
        if (n === 0) return false;
        if (n === 1) {
          place(spot, d);
          progress = true;
        }
      }
    }
  }
  return g.every(Boolean);
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type Puzzle = {
  givens: number[];
  solution: number[];
  empties: number;
};

// Chỉ khoét khi đề vẫn giải được theo cách của mức, để mức nào cũng giải được bằng suy luận "ô đơn", không phải đoán.
const CARVE: Record<Level, { clues: number; ok: (g: readonly number[]) => boolean }> = {
  easy: { clues: 46, ok: (g) => solvesBySingles(g, false) },
  medium: { clues: 38, ok: (g) => solvesBySingles(g, true) },
  hard: { clues: 30, ok: (g) => solvesBySingles(g, true) },
};
// Đề khó mà chỉ cần "ô còn một ứng viên" là giải xong thì sinh lại cho đúng độ khó.
const HARD_TRIES = 6;

function carve(solution: readonly number[], level: Level, rand: () => number): number[] {
  const { clues, ok } = CARVE[level];
  const g = solution.slice();
  let left = CELLS;
  for (const i of shuffle(Array.from({ length: 41 }, (_, k) => k), rand)) {
    const j = CELLS - 1 - i;
    const n = i === j ? 1 : 2;
    if (left - n < clues) continue;
    g[i] = 0;
    g[j] = 0;
    if (ok(g)) left -= n;
    else {
      g[i] = solution[i];
      g[j] = solution[j];
    }
  }
  return g;
}

export function makePuzzle(seed: number, level: Level): Puzzle {
  const rand = rng(seed);
  let best: { givens: number[]; solution: number[] } | null = null;
  for (let t = 0; t < (level === "hard" ? HARD_TRIES : 1); t++) {
    const solution = new Array<number>(CELLS).fill(0);
    search(solution, 1, rand, solution);
    const givens = carve(solution, level, rand);
    best = { givens, solution };
    if (level !== "hard" || !solvesBySingles(givens, false)) break;
  }
  return { ...best!, empties: best!.givens.filter((d) => !d).length };
}

export type Entry = [cell: number, digit: number, player: number];
export type Move = [cell: number, digit: number];

export type Board = {
  log: Entry[];
  seen: number[];
  time?: number;
  fin?: (number | null)[];
};

export const emptyBoard = (players: number): Board => ({ log: [], seen: new Array<number>(players).fill(0) });

export type SudokuState = {
  owner: number[];
  solved: boolean[][];
  right: number[];
  wrong: number[];
  score: number[];
  open: number;
  finished: number[];
  over: boolean;
  winners: number[];
};

const isMove = (x: unknown): x is Move =>
  Array.isArray(x) && Number.isInteger(x[0]) && x[0] >= 0 && x[0] < CELLS && Number.isInteger(x[1]) && x[1] >= 1 && x[1] <= 9;

function fresh(p: Puzzle, players: number): SudokuState {
  return {
    owner: new Array<number>(CELLS).fill(-1),
    solved: Array.from({ length: players }, () => new Array<boolean>(CELLS).fill(false)),
    right: new Array<number>(players).fill(0),
    wrong: new Array<number>(players).fill(0),
    score: new Array<number>(players).fill(0),
    open: p.empties,
    finished: [],
    over: p.empties === 0,
    winners: [],
  };
}

function apply(s: SudokuState, p: Puzzle, mode: Mode, cell: number, digit: number, k: number): boolean {
  if (s.over || p.givens[cell] || k < 0 || k >= s.right.length) return false;
  if (mode === "coop" ? s.owner[cell] >= 0 : s.solved[k][cell]) return false;
  if (digit !== p.solution[cell]) {
    s.wrong[k]++;
    if (mode === "coop") s.score[k]--;
    return true;
  }
  s.right[k]++;
  s.score[k]++;
  if (s.owner[cell] < 0) s.owner[cell] = k;
  if (mode === "coop") {
    s.open--;
    if (s.open === 0) {
      s.over = true;
      const top = Math.max(...s.score);
      s.winners = s.score.flatMap((v, i) => (v === top ? [i] : []));
    }
  } else {
    s.solved[k][cell] = true;
    s.open = Math.min(s.open, p.empties - s.right[k]);
    if (s.right[k] === p.empties) {
      s.finished.push(k);
      s.winners = [s.finished[0]];
      s.over = s.finished.length === s.right.length;
    }
  }
  return true;
}

export function replay(p: Puzzle, mode: Mode, players: number, log: readonly unknown[]): SudokuState {
  const s = fresh(p, players);
  for (const e of log) if (isMove(e) && Number.isInteger((e as unknown[])[2])) apply(s, p, mode, e[0], e[1], (e as unknown[])[2] as number);
  return s;
}

export function judge(p: Puzzle, mode: Mode, moves: readonly (readonly unknown[])[], prev: Board): Board | null {
  const players = moves.length;
  const s = replay(p, mode, players, prev.log);
  const log = prev.log.slice();
  const seen = Array.from({ length: players }, (_, k) => prev.seen[k] ?? 0);
  let dirty = false;
  for (let k = 0; k < players && !s.over; k++) {
    const list = moves[k];
    for (; seen[k] < list.length && !s.over; seen[k]++) {
      dirty = true;
      const mv = list[seen[k]];
      if (isMove(mv) && apply(s, p, mode, mv[0], mv[1], k)) log.push([mv[0], mv[1], k]);
    }
  }
  return dirty ? { ...prev, log, seen } : null;
}

export function stamp(b: Board, s: SudokuState, elapsed: number): Board | null {
  const fin = Array.from({ length: s.right.length }, (_, k) => b.fin?.[k] ?? null);
  let dirty = false;
  for (const k of s.finished) {
    if (fin[k] != null) continue;
    fin[k] = elapsed;
    dirty = true;
  }
  const time = b.time ?? (s.over ? elapsed : undefined);
  if (time !== b.time) dirty = true;
  if (!dirty) return null;
  return { ...b, ...(s.finished.length ? { fin } : {}), ...(time != null ? { time } : {}) };
}

export function ownBoard(p: Puzzle, moves: readonly unknown[]) {
  const cells = p.givens.slice();
  let wrong = 0;
  for (const mv of moves) {
    if (!isMove(mv) || p.givens[mv[0]] || cells[mv[0]]) continue;
    if (mv[1] === p.solution[mv[0]]) cells[mv[0]] = mv[1];
    else wrong++;
  }
  return { cells, wrong };
}

export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
