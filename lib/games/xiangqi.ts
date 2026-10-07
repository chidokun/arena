/**
 * Luật cờ tướng: bàn 9 cột × 10 hàng, quân Đỏ ở dưới đi trước. Ván dựng lại tất định từ nhật ký nước đi nên mọi máy
 * tự tính ra cùng kết quả. Bên tới lượt mà hết nước đi hợp lệ (bị chiếu bí hay bí nước) là thua. Hai tướng không được
 * đối mặt trên cùng một cột trống. Thế cờ lặp lại lần thứ ba: bên chiếu liên tục suốt vòng lặp thua (chiếu dai), còn
 * lại là hoà. Hoà khi 60 nước mỗi bên không ăn quân, hoặc cả hai bên hết quân tấn công (Xe, Mã, Pháo, Tốt).
 */

export const COLS = 9;
export const ROWS = 10;
export const SQUARES = COLS * ROWS;

/** Loại quân; quân Đỏ mang số dương, quân Đen mang số âm, 0 là ô trống. */
export const KING = 1;
export const ADVISOR = 2;
export const ELEPHANT = 3;
export const HORSE = 4;
export const ROOK = 5;
export const CANNON = 6;
export const PAWN = 7;

/** 1 là Đỏ (đi trước, ở dưới), 2 là Đen. */
export type Side = 1 | 2;
export type Move = [from: number, to: number];
/** Cách ván kết thúc: chiếu bí, bí nước (không bị chiếu mà hết nước), chiếu dai, lặp thế cờ, hết nước không ăn quân, hết quân tấn công. */
export type End = "mate" | "stuck" | "perpetual" | "repeat" | "idle" | "bare";

export const PIECES: Record<number, { red: string; black: string; name: string }> = {
  [KING]: { red: "帥", black: "將", name: "Tướng" },
  [ADVISOR]: { red: "仕", black: "士", name: "Sĩ" },
  [ELEPHANT]: { red: "相", black: "象", name: "Tượng" },
  [HORSE]: { red: "傌", black: "馬", name: "Mã" },
  [ROOK]: { red: "俥", black: "車", name: "Xe" },
  [CANNON]: { red: "炮", black: "砲", name: "Pháo" },
  [PAWN]: { red: "兵", black: "卒", name: "Tốt" },
};

/** Chữ viết tắt trong biên bản nước đi. */
const LETTER: Record<number, string> = { [KING]: "Tg", [ADVISOR]: "S", [ELEPHANT]: "T", [HORSE]: "M", [ROOK]: "X", [CANNON]: "P", [PAWN]: "B" };

/** 60 nước mỗi bên không ăn quân thì hoà. */
export const IDLE_PLIES = 120;

const START = "rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR";
const CODE: Record<string, number> = { k: KING, a: ADVISOR, e: ELEPHANT, h: HORSE, r: ROOK, c: CANNON, p: PAWN };

export const rowOf = (i: number) => Math.floor(i / COLS);
export const colOf = (i: number) => i % COLS;
export const sideOf = (v: number): 0 | Side => (v > 0 ? 1 : v < 0 ? 2 : 0);
export const other = (s: Side): Side => (s === 1 ? 2 : 1);

/** Bàn cờ từ chuỗi kiểu FEN (hàng trên cùng — phía Đen — viết trước; chữ hoa là Đỏ). */
export function parseBoard(fen: string): Int8Array {
  const b = new Int8Array(SQUARES);
  fen.split("/").forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) c += Number(ch);
      else {
        const t = CODE[ch.toLowerCase()];
        b[r * COLS + c++] = ch === ch.toUpperCase() ? t : -t;
      }
    }
  });
  return b;
}

export const startBoard = () => parseBoard(START);

const inPalace = (r: number, c: number, side: Side) => c >= 3 && c <= 5 && (side === 1 ? r >= 7 : r <= 2);
const ownHalf = (r: number, side: Side) => (side === 1 ? r >= 5 : r <= 4);
const ORTHO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAG = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const KNIGHT = [
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
];

/** Các ô quân tại `from` đi tới được theo cách đi của nó (chưa xét tướng có bị chiếu sau nước đi hay không). */
export function reach(board: Int8Array, from: number): number[] {
  const v = board[from];
  const side = sideOf(v);
  if (!side) return [];
  const r = rowOf(from);
  const c = colOf(from);
  const out: number[] = [];
  const on = (rr: number, cc: number) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS;
  const add = (rr: number, cc: number) => {
    if (!on(rr, cc)) return;
    const t = board[rr * COLS + cc];
    if (sideOf(t) !== side) out.push(rr * COLS + cc);
  };
  switch (Math.abs(v)) {
    case KING:
      for (const [dr, dc] of ORTHO) if (inPalace(r + dr, c + dc, side)) add(r + dr, c + dc);
      break;
    case ADVISOR:
      for (const [dr, dc] of DIAG) if (inPalace(r + dr, c + dc, side)) add(r + dr, c + dc);
      break;
    case ELEPHANT:
      for (const [dr, dc] of DIAG) {
        const rr = r + 2 * dr;
        const cc = c + 2 * dc;
        if (on(rr, cc) && ownHalf(rr, side) && !board[(r + dr) * COLS + c + dc]) add(rr, cc);
      }
      break;
    case HORSE:
      for (const [dr, dc] of KNIGHT) {
        const legR = Math.abs(dr) === 2 ? r + dr / 2 : r;
        const legC = Math.abs(dc) === 2 ? c + dc / 2 : c;
        if (on(r + dr, c + dc) && !board[legR * COLS + legC]) add(r + dr, c + dc);
      }
      break;
    case ROOK:
    case CANNON: {
      const cannon = Math.abs(v) === CANNON;
      for (const [dr, dc] of ORTHO) {
        let rr = r + dr;
        let cc = c + dc;
        let screen = false;
        while (on(rr, cc)) {
          const t = board[rr * COLS + cc];
          if (!screen) {
            if (!t) out.push(rr * COLS + cc);
            else if (!cannon) {
              if (sideOf(t) !== side) out.push(rr * COLS + cc);
              break;
            } else screen = true;
          } else if (t) {
            if (sideOf(t) !== side) out.push(rr * COLS + cc);
            break;
          }
          rr += dr;
          cc += dc;
        }
      }
      break;
    }
    case PAWN: {
      add(r + (side === 1 ? -1 : 1), c);
      if (!ownHalf(r, side)) {
        add(r, c - 1);
        add(r, c + 1);
      }
      break;
    }
  }
  return out;
}

/** Tướng bên `side` đang bị chiếu — tính cả hai tướng đối mặt trên một cột trống. */
export function inCheck(board: Int8Array, side: Side): boolean {
  const king = board.indexOf(side === 1 ? KING : -KING);
  if (king < 0) return true;
  const foe = board.indexOf(side === 1 ? -KING : KING);
  if (foe >= 0 && colOf(foe) === colOf(king)) {
    const step = foe > king ? COLS : -COLS;
    let i = king + step;
    while (i !== foe && !board[i]) i += step;
    if (i === foe) return true;
  }
  for (let i = 0; i < SQUARES; i++) {
    const v = board[i];
    if (v && sideOf(v) !== side && Math.abs(v) !== KING && reach(board, i).includes(king)) return true;
  }
  return false;
}

/** Các nước hợp lệ của bên `side`: đi đúng cách và không để tướng mình bị chiếu. */
export function legalMoves(board: Int8Array, side: Side): Move[] {
  const out: Move[] = [];
  const b = board.slice();
  for (let from = 0; from < SQUARES; from++) {
    const v = board[from];
    if (sideOf(v) !== side) continue;
    for (const to of reach(board, from)) {
      const t = b[to];
      b[to] = v;
      b[from] = 0;
      if (!inCheck(b, side)) out.push([from, to]);
      b[from] = v;
      b[to] = t;
    }
  }
  return out;
}

/**
 * Ký hiệu nước đi kiểu Việt Nam, vd. "P2-5", "M8.7", "X1/1": chữ của quân + cột đứng (đánh số 1–9 từ phải sang trái
 * theo phía người cầm quân) + hướng (. tiến, / thoái, - bình) + cột tới (đi ngang hoặc Sĩ, Tượng, Mã) hay số bước (Tướng,
 * Xe, Pháo, Tốt đi dọc). Hai quân cùng loại trên một cột thì ghi "t" (trước) / "s" (sau) thay cho số cột.
 */
export function notate(board: Int8Array, from: number, to: number): string {
  const v = board[from];
  const side = sideOf(v) as Side;
  const type = Math.abs(v);
  const r = rowOf(from);
  const c = colOf(from);
  const r2 = rowOf(to);
  const c2 = colOf(to);
  const file = (col: number) => (side === 1 ? COLS - col : col + 1);
  const same: number[] = [];
  for (let rr = 0; rr < ROWS; rr++) if (board[rr * COLS + c] === v) same.push(rr);
  let head = LETTER[type];
  if (same.length > 1) {
    // Quân "trước" là quân gần phía đối phương hơn.
    same.sort((a, b) => (side === 1 ? a - b : b - a));
    const k = same.indexOf(r);
    head += same.length === 2 ? (k === 0 ? "t" : "s") : String(k + 1);
  } else head += file(c);
  if (r === r2) return `${head}-${file(c2)}`;
  const forward = side === 1 ? r2 < r : r2 > r;
  const diagonal = type === ADVISOR || type === ELEPHANT || type === HORSE;
  return `${head}${forward ? "." : "/"}${diagonal ? file(c2) : Math.abs(r2 - r)}`;
}

export type XqState = {
  board: Int8Array;
  /** Mã quân (vị trí ban đầu) đang đứng ở từng ô, -1 nếu trống — để giao diện trượt đúng quân khi đi. */
  ids: Int16Array;
  /** Số nước hợp lệ đã áp dụng. */
  count: number;
  turn: Side;
  /** Bên tới lượt đang bị chiếu. */
  check: boolean;
  /** Các nước hợp lệ của bên tới lượt (rỗng khi hết ván). */
  legal: Move[];
  last: Move | null;
  winner: 0 | Side;
  draw: boolean;
  end: End | null;
  /** Quân bị ăn theo thứ tự (mã quân có dấu). */
  captured: number[];
  /** Biên bản từng nước. */
  notes: string[];
  /** Số nước liên tiếp không ăn quân. */
  quiet: number;
};

const ATTACKERS = [HORSE, ROOK, CANNON, PAWN];
const bare = (board: Int8Array) => !board.some((v) => ATTACKERS.includes(Math.abs(v)));

export function emptyState(start: Int8Array = startBoard()): XqState {
  const board = start.slice();
  const ids = new Int16Array(SQUARES).fill(-1);
  board.forEach((v, i) => {
    if (v) ids[i] = i;
  });
  return { board, ids, count: 0, turn: 1, check: false, legal: legalMoves(board, 1), last: null, winner: 0, draw: false, end: null, captured: [], notes: [], quiet: 0 };
}

const isMove = (m: unknown): m is Move =>
  Array.isArray(m) && m.length === 2 && m.every((x) => Number.isInteger(x) && x >= 0 && x < SQUARES);

/**
 * Dựng lại ván từ nhật ký nước đi. Nước không hợp lệ (sai luật, sau khi đã hết ván) thì dừng ở đó — mọi máy cùng
 * nhật ký ra cùng kết quả. `start` chỉ dùng cho test thế cờ tàn.
 */
export function replay(moves: readonly unknown[], start?: Int8Array): XqState {
  const s = emptyState(start);
  // Thế cờ (bàn + lượt) → các thời điểm (số nước) từng gặp; và nước thứ k có chiếu tướng hay không.
  const seen = new Map<string, number[]>([[key(s.board, s.turn), [0]]]);
  const checks: boolean[] = [];
  for (const m of moves) {
    if (s.winner || s.draw || !isMove(m)) break;
    const [from, to] = m;
    if (!s.legal.some(([a, b]) => a === from && b === to)) break;
    s.notes.push(notate(s.board, from, to));
    const taken = s.board[to];
    if (taken) s.captured.push(taken);
    s.quiet = taken ? 0 : s.quiet + 1;
    s.board[to] = s.board[from];
    s.board[from] = 0;
    s.ids[to] = s.ids[from];
    s.ids[from] = -1;
    s.count++;
    s.last = [from, to];
    s.turn = other(s.turn);
    s.check = inCheck(s.board, s.turn);
    s.legal = legalMoves(s.board, s.turn);
    checks.push(s.check);

    if (!s.legal.length) {
      s.winner = other(s.turn);
      s.end = s.check ? "mate" : "stuck";
      break;
    }
    const k = key(s.board, s.turn);
    const at = seen.get(k) ?? [];
    at.push(s.count);
    seen.set(k, at);
    if (at.length >= 3) {
      // Vòng lặp từ lần đầu gặp thế cờ tới giờ: bên nào nước nào cũng chiếu thì phạm luật chiếu dai.
      const from0 = at[0];
      const nag = ([1, 2] as Side[]).filter((side) => {
        const mine = checks.filter((_, p) => p >= from0 && (p % 2 === 0 ? 1 : 2) === side);
        return mine.length > 0 && mine.every(Boolean);
      });
      if (nag.length === 1) {
        s.winner = other(nag[0]);
        s.end = "perpetual";
      } else {
        s.draw = true;
        s.end = "repeat";
      }
    } else if (s.quiet >= IDLE_PLIES) {
      s.draw = true;
      s.end = "idle";
    } else if (bare(s.board)) {
      s.draw = true;
      s.end = "bare";
    }
    if (s.end) break;
  }
  if (s.winner || s.draw) s.legal = [];
  return s;
}

function key(board: Int8Array, turn: Side) {
  return `${turn}:${board.join(",")}`;
}
