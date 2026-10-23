export const SIZES = [15, 19, 200] as const;
export type Size = (typeof SIZES)[number];
// Bàn 200×200 rộng tới mức chẳng ván nào chạm mép, nên gọi là "gần vô hạn"; mép vẫn giữ để toạ độ có giới hạn.
export const sizeLabel = (s: number) => (s >= 200 ? "Gần vô hạn" : `${s}×${s}`);

// Giây tối đa cho mỗi lượt; 0 là không giới hạn.
export const TURN_LIMITS = [15, 30, 45, 0] as const;
export type TurnLimit = (typeof TURN_LIMITS)[number];
export const turnLabel = (t: number) => (!t ? "Không giới hạn" : t < 60 ? `${t} giây` : `${t / 60} phút`);

export type CaroOptions = {
  size: Size;
  blockTwoEnds: boolean;
  turn: TurnLimit;
};
export const DEFAULT_OPTIONS: CaroOptions = { size: 15, blockTwoEnds: true, turn: 0 };

// Phòng tạo trước khi có tuỳ chọn thời gian thì không có `turn`, coi như không giới hạn.
export function normOptions(o: Record<string, unknown> | undefined): CaroOptions {
  const size = SIZES.find((s) => s === o?.size) ?? DEFAULT_OPTIONS.size;
  const blockTwoEnds = typeof o?.blockTwoEnds === "boolean" ? o.blockTwoEnds : DEFAULT_OPTIONS.blockTwoEnds;
  const turn = TURN_LIMITS.find((t) => t === o?.turn) ?? DEFAULT_OPTIONS.turn;
  return { size, blockTwoEnds, turn };
}

export type Move = [x: number, y: number];

export type CaroState = {
  size: number;
  board: Uint8Array;
  count: number;
  turn: 1 | 2;
  winner: 0 | 1 | 2;
  line: number[];
  draw: boolean;
  last: number;
};

const DIRS: Move[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export const WIN_LEN = 5;

export function emptyState(size: number): CaroState {
  return { size, board: new Uint8Array(size * size), count: 0, turn: 1, winner: 0, line: [], draw: false, last: -1 };
}

export function winningLine(board: Uint8Array, size: number, x: number, y: number, blockTwoEnds: boolean): number[] {
  const me = board[y * size + x];
  if (!me) return [];
  const at = (cx: number, cy: number) => (cx < 0 || cy < 0 || cx >= size || cy >= size ? -1 : board[cy * size + cx]);
  for (const [dx, dy] of DIRS) {
    const cells = [y * size + x];
    let fx = x + dx;
    let fy = y + dy;
    while (at(fx, fy) === me) {
      cells.push(fy * size + fx);
      fx += dx;
      fy += dy;
    }
    let bx = x - dx;
    let by = y - dy;
    while (at(bx, by) === me) {
      cells.unshift(by * size + bx);
      bx -= dx;
      by -= dy;
    }
    if (cells.length < WIN_LEN) continue;
    if (blockTwoEnds) {
      const endA = at(fx, fy);
      const endB = at(bx, by);
      const blocked = (v: number) => v > 0 && v !== me;
      if (blocked(endA) && blocked(endB)) continue;
    }
    return cells;
  }
  return [];
}

// Tất định: mọi peer có cùng nhật ký sẽ ra cùng kết quả, nên không cần ai "phán" thắng thua.
export function replay(moves: readonly Move[], opts: Pick<CaroOptions, "size" | "blockTwoEnds">): CaroState {
  const s = emptyState(opts.size);
  for (const m of moves) {
    if (s.winner || s.draw) break;
    if (!Array.isArray(m)) break;
    const [x, y] = m;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= s.size || y >= s.size) break;
    const i = y * s.size + x;
    if (s.board[i]) break;
    s.board[i] = s.turn;
    s.count++;
    s.last = i;
    const line = winningLine(s.board, s.size, x, y, opts.blockTwoEnds);
    if (line.length) {
      s.winner = s.turn;
      s.line = line;
    } else if (s.count === s.size * s.size) {
      s.draw = true;
    } else {
      s.turn = s.turn === 1 ? 2 : 1;
    }
  }
  return s;
}
