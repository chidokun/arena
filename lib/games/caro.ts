/** Luật cờ caro (gomoku kiểu Việt Nam): 5 quân liên tiếp thắng, tuỳ chọn luật chặn hai đầu. */

export type CaroOptions = {
  size: number;
  /** Bật: chuỗi 5+ bị quân đối phương chặn ở cả hai đầu thì không tính thắng. Mép bàn không tính là chặn. */
  blockTwoEnds: boolean;
};

export type Move = [x: number, y: number];

export type CaroState = {
  size: number;
  /** 0 trống, 1 quân X (đi trước), 2 quân O. */
  board: Uint8Array;
  /** Số nước hợp lệ đã áp dụng. */
  count: number;
  /** Lượt kế tiếp: 1 hoặc 2. */
  turn: 1 | 2;
  winner: 0 | 1 | 2;
  /** Các ô của chuỗi thắng. */
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

/** Kiểm tra quân vừa đặt tại (x, y) có tạo thành chuỗi thắng không; trả về các ô của chuỗi, rỗng nếu không. */
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

/**
 * Dựng lại ván từ nhật ký nước đi. Tất định: mọi peer có cùng nhật ký sẽ ra cùng kết quả,
 * nên không cần ai "phán" thắng thua. Nước không hợp lệ (ô đã có quân, ngoài bàn, sau khi đã kết thúc) bị dừng lại.
 */
export function replay(moves: readonly Move[], opts: CaroOptions): CaroState {
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
