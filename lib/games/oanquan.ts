export const SQUARES = 12;
export const QUANS = [0, 6] as const;
export const ROWS = { 1: [1, 2, 3, 4, 5], 2: [7, 8, 9, 10, 11] } as const;
export const DAN_START = 5;
export const QUAN_VALUE = 10;
export const QUAN_NON = 5;
export const TOTAL = 10 * DAN_START + 2 * QUAN_VALUE;
/** Chặn ván kéo dài vô tận: đủ ngần này nước thì thu quân, đếm điểm. */
export const MAX_MOVES = 400;
/** Chặn một lượt rải vòng vô tận. */
const MAX_DROPS = 5000;

export type OaqOptions = {
  quanNon: boolean;
};

export const DEFAULT_OPTIONS: OaqOptions = { quanNon: true };

export function normOptions(raw: unknown): OaqOptions {
  const o = (raw ?? {}) as Partial<OaqOptions>;
  return { quanNon: typeof o.quanNon === "boolean" ? o.quanNon : DEFAULT_OPTIONS.quanNon };
}

export type Move = number;

export type Board = {
  dan: number[];
  quan: [boolean, boolean];
  got: [number, number, number];
  quans: [number, number, number];
  quanBy: [0 | 1 | 2, 0 | 1 | 2];
  hand: number;
};

export type Step =
  | { k: "pick"; at: number; n: number }
  | { k: "drop"; at: number }
  | { k: "eat"; at: number; n: number; quan: boolean; p: 1 | 2 }
  | { k: "scatter"; p: 1 | 2 }
  | { k: "sweep" };

export type OaqState = Board & {
  count: number;
  turn: 1 | 2;
  over: boolean;
  end?: "quan" | "limit";
  winner: 0 | 1 | 2;
  draw: boolean;
  last: Move;
  steps: Step[];
};

export const isQuan = (i: number) => i === 0 || i === 6;
const qi = (i: number) => (i === 0 ? 0 : 1);
const wrap = (i: number) => ((i % SQUARES) + SQUARES) % SQUARES;
export const ownerOf = (i: number): 0 | 1 | 2 => (i >= 1 && i <= 5 ? 1 : i >= 7 && i <= 11 ? 2 : 0);
export const isEmpty = (b: Board, i: number) => b.dan[i] === 0 && !(isQuan(i) && b.quan[qi(i)]);
export const hasQuan = (b: Board, i: number) => isQuan(i) && b.quan[qi(i)];
export const isQuanNon = (b: Board, i: number) => hasQuan(b, i) && b.dan[i] < QUAN_NON;
export const score = (b: Board, p: 1 | 2) => b.got[p] + b.quans[p] * QUAN_VALUE;

export function initialState(): OaqState {
  const dan = Array.from({ length: SQUARES }, (_, i) => (isQuan(i) ? 0 : DAN_START));
  return { dan, quan: [true, true], got: [0, 0, 0], quans: [0, 0, 0], quanBy: [0, 0], hand: 0, count: 0, turn: 1, over: false, winner: 0, draw: false, last: 0, steps: [] };
}

export function cloneBoard(b: Board): Board {
  return { dan: [...b.dan], quan: [b.quan[0], b.quan[1]], got: [...b.got], quans: [...b.quans], quanBy: [b.quanBy[0], b.quanBy[1]], hand: b.hand };
}

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
        b.quanBy[qi(s.at)] = s.p;
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

export function legal(s: OaqState, mv: Move) {
  if (s.over || !Number.isInteger(mv) || mv === 0) return false;
  const at = Math.abs(mv);
  return ownerOf(at) === s.turn && s.dan[at] > 0;
}

function sow(b: Board, mv: Move, p: 1 | 2, opts: OaqOptions): Step[] {
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
      if (isQuan(next)) return steps;
      at = next;
      go({ k: "pick", at, n: b.dan[at] });
      continue;
    }
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

export function play(s: OaqState, mv: Move, opts: OaqOptions = DEFAULT_OPTIONS): boolean {
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

// Tất định: mọi peer có cùng nhật ký sẽ ra cùng kết quả, nên không cần ai "phán" thắng thua.
export function replay(moves: readonly Move[], opts: OaqOptions = DEFAULT_OPTIONS): OaqState {
  const s = initialState();
  for (const mv of moves) if (!play(s, mv, opts)) break;
  return s;
}
