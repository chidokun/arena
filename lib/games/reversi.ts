export const SIZE = 8;
export const CELLS = SIZE * SIZE;

// Bỏ lượt không cần ghi: `replay` tự bỏ khi người tới lượt hết nước.
export type Move = number;

const DIRS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const;

export type ReversiState = {
  board: Uint8Array;
  score: [number, number];
  count: number;
  turn: 1 | 2;
  legal: number[];
  last: number;
  flipped: number[];
  passed: 0 | 1 | 2;
  winner: 0 | 1 | 2;
  draw: boolean;
  over: boolean;
};

const other = (v: 1 | 2) => (v === 1 ? 2 : 1);

export function flipsOf(board: Uint8Array, who: 1 | 2, i: number): number[] {
  if (board[i]) return [];
  const r0 = Math.floor(i / SIZE);
  const c0 = i % SIZE;
  const out: number[] = [];
  for (const [dr, dc] of DIRS) {
    const run: number[] = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === other(who)) {
      run.push(r * SIZE + c);
      r += dr;
      c += dc;
    }
    if (run.length && r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === who) out.push(...run);
  }
  return out;
}

export function legalMoves(board: Uint8Array, who: 1 | 2): number[] {
  const out: number[] = [];
  for (let i = 0; i < CELLS; i++) if (flipsOf(board, who, i).length) out.push(i);
  return out;
}

export function emptyState(): ReversiState {
  const board = new Uint8Array(CELLS);
  const m = SIZE / 2;
  board[(m - 1) * SIZE + m - 1] = 2;
  board[m * SIZE + m] = 2;
  board[(m - 1) * SIZE + m] = 1;
  board[m * SIZE + m - 1] = 1;
  return { board, score: [2, 2], count: 0, turn: 1, legal: legalMoves(board, 1), last: -1, flipped: [], passed: 0, winner: 0, draw: false, over: false };
}

export function replay(moves: readonly Move[]): ReversiState {
  const s = emptyState();
  for (const i of moves) {
    if (s.over) break;
    if (!Number.isInteger(i) || i < 0 || i >= CELLS) break;
    const flips = flipsOf(s.board, s.turn, i);
    if (!flips.length) break;
    const me = s.turn;
    s.board[i] = me;
    for (const f of flips) s.board[f] = me;
    s.score[me - 1] += flips.length + 1;
    s.score[other(me) - 1] -= flips.length;
    s.count++;
    s.last = i;
    s.flipped = flips;
    s.passed = 0;
    s.turn = other(me);
    s.legal = legalMoves(s.board, s.turn);
    if (s.legal.length) continue;
    s.passed = s.turn;
    s.turn = me;
    s.legal = legalMoves(s.board, me);
    if (s.legal.length) continue;
    s.passed = 0;
    s.over = true;
    const [a, b] = s.score;
    if (a === b) s.draw = true;
    else s.winner = a > b ? 1 : 2;
  }
  return s;
}
