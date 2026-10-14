/**
 * Luật cờ chó (cờ chặn): bàn là hình vuông kẻ hai đường chéo — năm điểm (bốn góc và tâm), nối bằng hai đường chéo và
 * ba cạnh; cạnh thứ tư có chó canh nên không đi qua được. Mỗi bên hai quân, một điểm để trống. Hai người lần lượt đi
 * một quân của mình theo đường kẻ sang điểm trống kề nó. Tới lượt mà không đi được quân nào thì thua.
 *
 * Bàn nhỏ nên thế cờ hay lặp: cùng một thế (vị trí quân + người tới lượt) lặp lại lần thứ ba thì hoà.
 */

/** Chỉ số điểm: 0 góc trên trái, 1 góc trên phải, 2 góc dưới trái, 3 góc dưới phải, 4 tâm. Chó canh cạnh trái (0–2). */
export const TL = 0;
export const TR = 1;
export const BL = 2;
export const BR = 3;
export const CENTER = 4;
export const POINTS = 5;

/** Các đường đi được (cạnh trái 0–2 bị chó chặn). */
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

/**
 * Cách xếp quân khai cuộc (đều bỏ trống tâm):
 * - `side` — mỗi bên giữ một cạnh: người đi trước ở hai góc phía chó (trái), người đi sau ở hai góc bên phải.
 * - `cross` — mỗi bên giữ một đường chéo.
 * Hai cách đều cân bằng: đi đúng thì không ai thắng được, ai sơ hở là bị chặn.
 */
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

/** Một nước đi là chỉ số điểm có quân được đi — đích luôn là điểm trống duy nhất. */
export type Move = number;

/** Số lần một thế cờ xuất hiện thì hoà. */
export const REPEAT_DRAW = 3;

export type CoChoState = {
  setup: Setup;
  /** Theo chỉ số điểm: 0 trống, 1 quân người đi trước, 2 quân người đi sau. */
  board: number[];
  /** Điểm đang trống. */
  empty: number;
  /** Số nước đã đi. */
  count: number;
  /** Lượt kế tiếp: 1 hoặc 2. */
  turn: 1 | 2;
  /** Các điểm có quân người tới lượt đi được (sang điểm trống). */
  legal: number[];
  /** Nước cuối: từ điểm nào sang điểm nào; undefined nếu chưa đi. */
  last?: { from: number; to: number };
  /** Số lần thế cờ hiện tại đã xuất hiện (kể cả lần này). */
  seen: number;
  winner: 0 | 1 | 2;
  draw: boolean;
  over: boolean;
};

const other = (v: 1 | 2) => (v === 1 ? 2 : 1);

/** Các quân của `who` đi được sang điểm trống. */
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

/**
 * Dựng lại ván từ nhật ký nước đi. Tất định: mọi peer có cùng nhật ký sẽ ra cùng kết quả. Nước không hợp lệ (không
 * phải quân của người tới lượt, không kề điểm trống, sau khi ván đã xong) thì dừng tại đó.
 */
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
