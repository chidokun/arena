// Bàn nhỏ nên thế cờ hay lặp: cùng một thế (vị trí quân + người tới lượt) lặp lại lần thứ ba thì hoà.

export const TL = 0;
export const TR = 1;
export const BL = 2;
export const BR = 3;
export const CENTER = 4;
export const POINTS = 5;

export const LINES: readonly (readonly [number, number])[] = [
  [TL, TR],
  [BL, BR],
  [TR, BR],
  [TL, CENTER],
  [TR, CENTER],
  [BL, CENTER],
  [BR, CENTER],
];

const NEIGHBORS: readonly number[][] = Array.from({ length: POINTS }, (_, i) => LINES.flatMap(([a, b]) => (a === i ? [b] : b === i ? [a] : [])));

export const adjacent = (a: number, b: number) => NEIGHBORS[a].includes(b);

// Hai cách đều cân bằng: đi đúng thì không ai thắng được, ai sơ hở là bị chặn.
export const SETUPS = ["side", "cross"] as const;
export type Setup = (typeof SETUPS)[number];
export const SETUP_NAME: Record<Setup, string> = { side: "Hai cạnh", cross: "Chéo nhau" };

export type CoChoOptions = { setup: Setup };
export const DEFAULT_OPTIONS: CoChoOptions = { setup: "side" };

export function normOptions(o: Record<string, unknown> | undefined): CoChoOptions {
  return { setup: SETUPS.find((s) => s === o?.setup) ?? DEFAULT_OPTIONS.setup };
}

const OPENING: Record<Setup, [number[], number[]]> = {
  side: [
    [TL, BL],
    [TR, BR],
  ],
  cross: [
    [TL, BR],
    [TR, BL],
  ],
};

export type Move = number;

export const REPEAT_DRAW = 3;

export type CoChoState = {
  setup: Setup;
  board: number[];
  empty: number;
  count: number;
  turn: 1 | 2;
  legal: number[];
  last?: { from: number; to: number };
  seen: number;
  winner: 0 | 1 | 2;
  draw: boolean;
  over: boolean;
};

const other = (v: 1 | 2) => (v === 1 ? 2 : 1);

export function legalMoves(board: readonly number[], who: 1 | 2): number[] {
  const empty = board.indexOf(0);
  return NEIGHBORS[empty].filter((i) => board[i] === who).sort((a, b) => a - b);
}

const key = (board: readonly number[], turn: number) => `${board.join("")}${turn}`;

function settle(s: CoChoState, seen: Map<string, number>) {
  const k = key(s.board, s.turn);
  s.seen = (seen.get(k) ?? 0) + 1;
  seen.set(k, s.seen);
  s.legal = legalMoves(s.board, s.turn);
  if (!s.legal.length) {
    s.over = true;
    s.winner = other(s.turn);
  } else if (s.seen >= REPEAT_DRAW) {
    s.over = true;
    s.draw = true;
  }
}

export function emptyState(setup: Setup = DEFAULT_OPTIONS.setup): CoChoState {
  return replay(setup, []);
}

export function replay(setup: Setup, moves: readonly Move[]): CoChoState {
  const board = Array<number>(POINTS).fill(0);
  const [a, b] = OPENING[setup];
  for (const i of a) board[i] = 1;
  for (const i of b) board[i] = 2;
  const s: CoChoState = { setup, board, empty: CENTER, count: 0, turn: 1, legal: [], seen: 0, winner: 0, draw: false, over: false };
  const seen = new Map<string, number>();
  settle(s, seen);
  for (const from of moves) {
    if (s.over || !s.legal.includes(from)) break;
    const to = s.empty;
    s.board[to] = s.turn;
    s.board[from] = 0;
    s.empty = from;
    s.last = { from, to };
    s.count++;
    s.turn = other(s.turn);
    settle(s, seen);
  }
  return s;
}
