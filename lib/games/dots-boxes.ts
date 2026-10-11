/**
 * Luật chấm nối ô (Dots and Boxes): lưới `size`×`size` ô (tức (size+1)×(size+1) chấm). Hai người lần lượt kẻ một
 * cạnh nối hai chấm kề nhau; ai kẻ cạnh thứ tư khép kín một ô thì ô đó thuộc về mình và được kẻ tiếp. Hết ô — hoặc một
 * người đã giữ quá nửa số ô, không thể bị đuổi kịp — thì ván kết thúc, ai nhiều ô hơn thắng.
 */

/** Cỡ bàn (số ô mỗi cạnh) chủ phòng chọn được. Cỡ lẻ có số ô lẻ nên không bao giờ hoà. */
export const SIZES = [3, 5, 7] as const;
export type Size = (typeof SIZES)[number];

export type DotsOptions = { size: Size };
export const DEFAULT_OPTIONS: DotsOptions = { size: 5 };

export function normOptions(o: Record<string, unknown> | undefined): DotsOptions {
  const size = SIZES.find((s) => s === o?.size) ?? DEFAULT_OPTIONS.size;
  return { size };
}

/** Một nước đi là chỉ số cạnh (xem `hLine` / `vLine`). */
export type Move = number;

/** Tổng số cạnh: (size+1) hàng cạnh ngang × size, cộng size hàng cạnh dọc × (size+1). */
export const lineCount = (size: number) => 2 * size * (size + 1);

/** Cạnh ngang ở hàng chấm `r` (0..size), nối chấm cột `c` với `c+1` (c: 0..size-1). */
export const hLine = (size: number, r: number, c: number) => r * size + c;
/** Cạnh dọc ở cột chấm `c` (0..size), nối chấm hàng `r` với `r+1` (r: 0..size-1). */
export const vLine = (size: number, r: number, c: number) => size * (size + 1) + r * (size + 1) + c;

/** Vị trí một cạnh: ngang hay dọc và chấm đầu (trên / trái) của nó. */
export function lineAt(size: number, i: number) {
  const h = size * (size + 1);
  if (i < h) return { horizontal: true, r: Math.floor(i / size), c: i % size };
  const j = i - h;
  return { horizontal: false, r: Math.floor(j / (size + 1)), c: j % (size + 1) };
}

/** Bốn cạnh của ô `b = r * size + c`: trên, dưới, trái, phải. */
export function boxSides(size: number, b: number): [number, number, number, number] {
  const r = Math.floor(b / size);
  const c = b % size;
  return [hLine(size, r, c), hLine(size, r + 1, c), vLine(size, r, c), vLine(size, r, c + 1)];
}

/** Các ô (1 hoặc 2) giáp cạnh `i`. */
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
  /** Theo chỉ số cạnh: 0 chưa kẻ, 1 / 2 là người đã kẻ. */
  lines: Uint8Array;
  /** Theo chỉ số ô `r * size + c`: 0 chưa ai, 1 / 2 là chủ ô. */
  boxes: Uint8Array;
  /** Số ô của người 1 và người 2. */
  score: [number, number];
  /** Số nước hợp lệ đã áp dụng. */
  count: number;
  /** Lượt kế tiếp: 1 (đi trước) hoặc 2. */
  turn: 1 | 2;
  /** Cạnh của nước cuối, -1 nếu chưa có. */
  last: number;
  /** Những ô nước cuối vừa khép. */
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

/** Số cạnh đã kẻ của ô `b`. */
export function sidesDrawn(s: DotsState, b: number) {
  return boxSides(s.size, b).reduce((n, i) => n + (s.lines[i] ? 1 : 0), 0);
}

/**
 * Dựng lại ván từ nhật ký nước đi. Tất định: mọi peer có cùng nhật ký sẽ ra cùng kết quả. Nước không hợp lệ (cạnh
 * đã kẻ, ngoài bàn, sau khi ván đã xong) thì dừng tại đó.
 */
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
