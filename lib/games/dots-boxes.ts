// Cỡ lẻ có số ô lẻ nên không bao giờ hoà.
export const SIZES = [3, 5, 7] as const;
export type Size = (typeof SIZES)[number];

export type DotsOptions = { size: Size };
export const DEFAULT_OPTIONS: DotsOptions = { size: 5 };

export function normOptions(o: Record<string, unknown> | undefined): DotsOptions {
  const size = SIZES.find((s) => s === o?.size) ?? DEFAULT_OPTIONS.size;
  return { size };
}

export type Move = number;

export const lineCount = (size: number) => 2 * size * (size + 1);

export const hLine = (size: number, r: number, c: number) => r * size + c;
export const vLine = (size: number, r: number, c: number) => size * (size + 1) + r * (size + 1) + c;

export function lineAt(size: number, i: number) {
  const h = size * (size + 1);
  if (i < h) return { horizontal: true, r: Math.floor(i / size), c: i % size };
  const j = i - h;
  return { horizontal: false, r: Math.floor(j / (size + 1)), c: j % (size + 1) };
}

export function boxSides(size: number, b: number): [number, number, number, number] {
  const r = Math.floor(b / size);
  const c = b % size;
  return [hLine(size, r, c), hLine(size, r + 1, c), vLine(size, r, c), vLine(size, r, c + 1)];
}

export function boxesOf(size: number, i: number): number[] {
  const { horizontal, r, c } = lineAt(size, i);
  const out: number[] = [];
  if (horizontal) {
    if (r > 0) out.push((r - 1) * size + c);
    if (r < size) out.push(r * size + c);
  } else {
    if (c > 0) out.push(r * size + c - 1);
    if (c < size) out.push(r * size + c);
  }
  return out;
}

export type DotsState = {
  size: number;
  lines: Uint8Array;
  boxes: Uint8Array;
  score: [number, number];
  count: number;
  turn: 1 | 2;
  last: number;
  fresh: number[];
  winner: 0 | 1 | 2;
  draw: boolean;
  over: boolean;
};

export function emptyState(size: number): DotsState {
  return {
    size,
    lines: new Uint8Array(lineCount(size)),
    boxes: new Uint8Array(size * size),
    score: [0, 0],
    count: 0,
    turn: 1,
    last: -1,
    fresh: [],
    winner: 0,
    draw: false,
    over: false,
  };
}

export function sidesDrawn(s: DotsState, b: number) {
  return boxSides(s.size, b).reduce((n, i) => n + (s.lines[i] ? 1 : 0), 0);
}

export function replay(size: number, moves: readonly Move[]): DotsState {
  const s = emptyState(size);
  const total = size * size;
  for (const i of moves) {
    if (s.over) break;
    if (!Number.isInteger(i) || i < 0 || i >= s.lines.length || s.lines[i]) break;
    s.lines[i] = s.turn;
    s.count++;
    s.last = i;
    s.fresh = boxesOf(size, i).filter((b) => sidesDrawn(s, b) === 4);
    for (const b of s.fresh) s.boxes[b] = s.turn;
    s.score[s.turn - 1] += s.fresh.length;
    const [a, b] = s.score;
    if (a + b === total || a * 2 > total || b * 2 > total) {
      s.over = true;
      if (a === b) s.draw = true;
      else s.winner = a > b ? 1 : 2;
    } else if (!s.fresh.length) {
      s.turn = s.turn === 1 ? 2 : 1;
    }
  }
  return s;
}
