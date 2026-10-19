export const COLS = 7;
export const ROWS = 6;
export const WIN_LEN = 4;

export type Move = number;

export type C4State = {
  board: Uint8Array;
  count: number;
  turn: 1 | 2;
  winner: 0 | 1 | 2;
  line: number[];
  draw: boolean;
  last: number;
};

const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export function emptyState(): C4State {
  return { board: new Uint8Array(COLS * ROWS), count: 0, turn: 1, winner: 0, line: [], draw: false, last: -1 };
}

export function dropRow(board: Uint8Array, col: number): number {
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return -1;
  for (let r = ROWS - 1; r >= 0; r--) if (!board[r * COLS + col]) return r;
  return -1;
}

export function winningCells(board: Uint8Array, col: number, row: number): number[] {
  const me = board[row * COLS + col];
  if (!me) return [];
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= COLS || r >= ROWS ? 0 : board[r * COLS + c]);
  const out = new Set<number>();
  for (const [dc, dr] of DIRS) {
    const cells = [row * COLS + col];
    for (let c = col + dc, r = row + dr; at(c, r) === me; c += dc, r += dr) cells.push(r * COLS + c);
    for (let c = col - dc, r = row - dr; at(c, r) === me; c -= dc, r -= dr) cells.push(r * COLS + c);
    if (cells.length >= WIN_LEN) cells.forEach((i) => out.add(i));
  }
  return [...out].sort((a, b) => a - b);
}

// Tất định: mọi peer có cùng nhật ký sẽ ra cùng kết quả, nên không cần ai "phán" thắng thua.
export function replay(moves: readonly Move[]): C4State {
  const s = emptyState();
  for (const col of moves) {
    if (s.winner || s.draw) break;
    const row = dropRow(s.board, col);
    if (row < 0) break;
    const i = row * COLS + col;
    s.board[i] = s.turn;
    s.count++;
    s.last = i;
    const line = winningCells(s.board, col, row);
    if (line.length) {
      s.winner = s.turn;
      s.line = line;
    } else if (s.count === COLS * ROWS) {
      s.draw = true;
    } else {
      s.turn = s.turn === 1 ? 2 : 1;
    }
  }
  return s;
}
