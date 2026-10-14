/**
 * Luật cờ lật (Reversi / Othello): bàn 8×8, khai cuộc bốn quân chéo ở giữa. Hai người lần lượt đặt một quân sao cho
 * kẹp được ít nhất một dãy quân đối phương (ngang, dọc hoặc chéo) giữa quân mới và một quân mình có sẵn — cả dãy bị
 * lật sang màu mình. Người tới lượt không có nước hợp lệ thì tự bỏ lượt; cả hai cùng hết nước (thường là kín bàn)
 * thì ván kết thúc, ai nhiều quân hơn thắng.
 */

export const SIZE = 8;
export const CELLS = SIZE * SIZE;

/** Một nước đi là chỉ số ô `r * SIZE + c`. Bỏ lượt không cần ghi: `replay` tự bỏ khi người tới lượt hết nước. */
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
  /** Theo chỉ số ô: 0 trống, 1 quân Đen (đi trước), 2 quân Trắng. */
  board: Uint8Array;
  /** Số quân của người 1 và người 2. */
  score: [number, number];
  /** Số nước hợp lệ đã áp dụng. */
  count: number;
  /** Lượt kế tiếp: 1 hoặc 2. */
  turn: 1 | 2;
  /** Các ô người tới lượt đặt được. */
  legal: number[];
  /** Ô của nước cuối, -1 nếu chưa có. */
  last: number;
  /** Những quân nước cuối vừa lật. */
  flipped: number[];
  /** Người vừa bị bỏ lượt vì hết nước sau nước cuối (0 nếu không ai). */
  passed: 0 | 1 | 2;
  winner: 0 | 1 | 2;
  draw: boolean;
  over: boolean;
};

const other = (v: 1 | 2) => (v === 1 ? 2 : 1);

/** Các quân đối phương bị lật nếu `who` đặt vào ô `i` (rỗng nếu ô đã có quân hoặc không kẹp được gì). */
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
  // Khai cuộc chuẩn: Trắng ở d4, e5; Đen ở e4, d5.
  board[(m - 1) * SIZE + m - 1] = 2;
  board[m * SIZE + m] = 2;
  board[(m - 1) * SIZE + m] = 1;
  board[m * SIZE + m - 1] = 1;
  return { board, score: [2, 2], count: 0, turn: 1, legal: legalMoves(board, 1), last: -1, flipped: [], passed: 0, winner: 0, draw: false, over: false };
}

/**
 * Dựng lại ván từ nhật ký nước đi. Tất định: mọi peer có cùng nhật ký sẽ ra cùng kết quả. Nước không hợp lệ (ô đã có
 * quân, không lật được quân nào, ngoài bàn, sau khi ván đã xong) thì dừng tại đó.
 */
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
    // Đối thủ hết nước: bỏ lượt họ, mình đi tiếp; cả hai cùng hết nước thì xong ván.
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
