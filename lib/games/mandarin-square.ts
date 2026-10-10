/**
 * Luật Ô ăn quan: vòng 12 ô — 2 ô quan ở hai đầu (mỗi ô một quân quan), giữa là 10 ô dân, mỗi bên 5 ô, mỗi ô 5 quân dân.
 * Đến lượt thì bốc hết quân một ô dân bên mình, rải mỗi ô một quân theo chiều đã chọn. Rải hết mà ô kế có dân thì bốc ô
 * đó rải tiếp; ô kế là ô quan còn quân thì mất lượt; ô kế trống thì ăn ô ngay sau nó — rồi cứ cách một ô trống lại có quân
 * thì ăn tiếp. Hết quân dân bên mình thì lấy 5 quân đã ăn rải lại (thiếu thì vay). Hai ô quan đều hết quân thì thu dân
 * còn lại về mỗi bên và đếm điểm: dân 1 điểm, quan 10 điểm.
 */

export const SQUARES = 12;
/** Hai ô quan ở hai đầu bàn: ô 0 và ô 6. */
export const QUANS = [0, 6] as const;
/** Ô dân của từng bên: bên 1 là ô 1–5, bên 2 là ô 7–11 (chỉ số tăng dần theo cùng một chiều vòng). */
export const ROWS = { 1: [1, 2, 3, 4, 5], 2: [7, 8, 9, 10, 11] } as const;
export const DAN_START = 5;
export const QUAN_VALUE = 10;
/** Ô quan còn quân quan mà ít hơn ngần này quân dân là "quan non". */
export const QUAN_NON = 5;
/** Tổng điểm cả bàn: 50 dân + 2 quan. */
export const TOTAL = 10 * DAN_START + 2 * QUAN_VALUE;
/** Chặn ván kéo dài vô tận: đủ ngần này nước thì thu quân, đếm điểm. */
export const MAX_MOVES = 400;
/** Chặn một lượt rải vòng vô tận. */
const MAX_DROPS = 5000;

export type MsOptions = {
  /** Cấm ăn quan non: ô quan còn quân quan mà dưới `QUAN_NON` dân thì chưa ăn được — tới đó là mất lượt. */
  quanNon: boolean;
};

export const DEFAULT_OPTIONS: MsOptions = { quanNon: true };

export function normOptions(raw: unknown): MsOptions {
  const o = (raw ?? {}) as Partial<MsOptions>;
  return { quanNon: typeof o.quanNon === "boolean" ? o.quanNon : DEFAULT_OPTIONS.quanNon };
}

/** Nước đi: số ô dân (1–5 hoặc 7–11), dấu là chiều rải — dương rải theo chỉ số tăng (…5 → 6 → 7…11 → 0 → 1…), âm rải ngược lại. */
export type Move = number;

export type Board = {
  /** Số quân dân trong từng ô. */
  dan: number[];
  /** Quân quan còn nằm ở ô 0 / ô 6. */
  quan: [boolean, boolean];
  /** Dân đã ăn của bên 1 / bên 2 (chỉ số 1, 2) — rải quân thì trừ đi, vay thì âm. */
  got: [number, number, number];
  /** Số quan đã ăn của bên 1 / bên 2. */
  quans: [number, number, number];
  /** Quân đang cầm trên tay — chỉ khác 0 giữa lúc diễn lại nước đi. */
  hand: number;
};

/** Diễn biến một nước, theo đúng thứ tự — áp lần lượt bằng `applyStep` là ra bàn sau nước đó. */
export type Step =
  /** Bốc hết dân trong ô. */
  | { k: "pick"; at: number; n: number }
  /** Thả một quân xuống ô. */
  | { k: "drop"; at: number }
  /** Bên `p` ăn cả ô: `n` dân, kèm quân quan nếu còn. */
  | { k: "eat"; at: number; n: number; quan: boolean; p: 1 | 2 }
  /** Bên `p` hết dân: lấy 5 quân đã ăn rải lại mỗi ô một quân. */
  | { k: "scatter"; p: 1 | 2 }
  /** Hết quan: thu dân còn lại trên bàn về bên sở hữu ô. */
  | { k: "sweep" };

export type MsState = Board & {
  /** Số nước hợp lệ đã áp dụng. */
  count: number;
  /** Lượt kế tiếp: 1 hoặc 2. */
  turn: 1 | 2;
  over: boolean;
  /** Vì sao hết ván: "quan" hết quan, "limit" quá số nước tối đa. */
  end?: "quan" | "limit";
  winner: 0 | 1 | 2;
  draw: boolean;
  /** Nước cuối, 0 nếu chưa có. */
  last: Move;
  /** Diễn biến của nước cuối (kể cả rải quân / thu quân ngay sau đó). */
  steps: Step[];
};

export const isQuan = (i: number) => i === 0 || i === 6;
const qi = (i: number) => (i === 0 ? 0 : 1);
const wrap = (i: number) => ((i % SQUARES) + SQUARES) % SQUARES;
/** Bên sở hữu ô dân; 0 với ô quan. */
export const ownerOf = (i: number): 0 | 1 | 2 => (i >= 1 && i <= 5 ? 1 : i >= 7 && i <= 11 ? 2 : 0);
/** Ô không còn quân nào (kể cả quân quan). */
export const isEmpty = (b: Board, i: number) => b.dan[i] === 0 && !(isQuan(i) && b.quan[qi(i)]);
export const hasQuan = (b: Board, i: number) => isQuan(i) && b.quan[qi(i)];
export const isQuanNon = (b: Board, i: number) => hasQuan(b, i) && b.dan[i] < QUAN_NON;
export const score = (b: Board, p: 1 | 2) => b.got[p] + b.quans[p] * QUAN_VALUE;

export function initialState(): MsState {
  const dan = Array.from({ length: SQUARES }, (_, i) => (isQuan(i) ? 0 : DAN_START));
  return { dan, quan: [true, true], got: [0, 0, 0], quans: [0, 0, 0], hand: 0, count: 0, turn: 1, over: false, winner: 0, draw: false, last: 0, steps: [] };
}

export function cloneBoard(b: Board): Board {
  return { dan: [...b.dan], quan: [b.quan[0], b.quan[1]], got: [...b.got], quans: [...b.quans], hand: b.hand };
}

/** Áp một bước diễn biến lên bàn (sửa trực tiếp `b`). */
export function applyStep(b: Board, s: Step) {
  switch (s.k) {
    case "pick":
      b.hand += b.dan[s.at];
      b.dan[s.at] = 0;
      break;
    case "drop":
      b.dan[s.at]++;
      b.hand--;
      break;
    case "eat":
      b.got[s.p] += b.dan[s.at];
      b.dan[s.at] = 0;
      if (hasQuan(b, s.at)) {
        b.quan[qi(s.at)] = false;
        b.quans[s.p]++;
      }
      break;
    case "scatter":
      for (const i of ROWS[s.p]) b.dan[i]++;
      b.got[s.p] -= ROWS[s.p].length;
      break;
    case "sweep":
      for (const p of [1, 2] as const)
        for (const i of ROWS[p]) {
          b.got[p] += b.dan[i];
          b.dan[i] = 0;
        }
      break;
  }
}

export function legal(s: MsState, mv: Move) {
  if (s.over || !Number.isInteger(mv) || mv === 0) return false;
  const at = Math.abs(mv);
  return ownerOf(at) === s.turn && s.dan[at] > 0;
}

/** Rải một nước của bên `p` rồi ăn nếu được; trả về diễn biến. */
function sow(b: Board, mv: Move, p: 1 | 2, opts: MsOptions): Step[] {
  const steps: Step[] = [];
  const go = (s: Step) => {
    applyStep(b, s);
    steps.push(s);
  };
  const dir = Math.sign(mv);
  let at = Math.abs(mv);
  let drops = 0;
  go({ k: "pick", at, n: b.dan[at] });
  for (;;) {
    while (b.hand > 0) {
      at = wrap(at + dir);
      go({ k: "drop", at });
      drops++;
    }
    const next = wrap(at + dir);
    if (drops > MAX_DROPS) return steps;
    if (!isEmpty(b, next)) {
      // Gặp ô quan thì mất lượt; gặp ô dân thì bốc lên rải tiếp.
      if (isQuan(next)) return steps;
      at = next;
      go({ k: "pick", at, n: b.dan[at] });
      continue;
    }
    // Ô kế trống: ăn ô ngay sau nó, rồi cứ cách một ô trống lại có quân thì ăn tiếp.
    let gap = next;
    for (;;) {
      const prey = wrap(gap + dir);
      if (isEmpty(b, prey) || (opts.quanNon && isQuanNon(b, prey))) return steps;
      go({ k: "eat", at: prey, n: b.dan[prey], quan: hasQuan(b, prey), p });
      gap = wrap(prey + dir);
      if (!isEmpty(b, gap)) return steps;
    }
  }
}

/** Áp một nước lên ván (sửa trực tiếp `s`); trả về false nếu nước không hợp lệ. */
export function play(s: MsState, mv: Move, opts: MsOptions = DEFAULT_OPTIONS): boolean {
  if (!legal(s, mv)) return false;
  const steps = sow(s, mv, s.turn, opts);
  const go = (st: Step) => {
    applyStep(s, st);
    steps.push(st);
  };
  s.count++;
  s.last = mv;
  const quanGone = QUANS.every((q) => isEmpty(s, q));
  if (quanGone || s.count >= MAX_MOVES) {
    go({ k: "sweep" });
    s.over = true;
    s.end = quanGone ? "quan" : "limit";
    const a = score(s, 1);
    const b = score(s, 2);
    s.winner = a > b ? 1 : b > a ? 2 : 0;
    s.draw = a === b;
  } else {
    s.turn = s.turn === 1 ? 2 : 1;
    if (ROWS[s.turn].every((i) => s.dan[i] === 0)) go({ k: "scatter", p: s.turn });
  }
  s.steps = steps;
  return true;
}

/**
 * Dựng lại ván từ nhật ký nước đi. Tất định: mọi peer có cùng nhật ký sẽ ra cùng kết quả, nên không cần ai "phán"
 * thắng thua. Gặp nước không hợp lệ (ô bên kia, ô trống, sau khi đã hết ván) thì dừng lại.
 */
export function replay(moves: readonly Move[], opts: MsOptions = DEFAULT_OPTIONS): MsState {
  const s = initialState();
  for (const mv of moves) if (!play(s, mv, opts)) break;
  return s;
}
