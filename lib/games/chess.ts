/**
 * Luật cờ vua: bàn 8 × 8, quân Trắng ở dưới đi trước. Ván dựng lại tất định từ nhật ký nước đi nên mọi máy tự tính ra
 * cùng kết quả. Có nhập thành, bắt tốt qua đường, phong cấp (chọn Hậu, Xe, Tượng hay Mã). Bên tới lượt hết nước đi hợp
 * lệ: đang bị chiếu là thua (chiếu hết), không bị chiếu là hoà (hết nước). Hoà khi thế cờ lặp lại lần thứ ba, 50 nước
 * mỗi bên không ăn quân và không đi Tốt, hoặc hai bên không đủ quân để chiếu hết.
 */

export const SIZE = 8;
export const SQUARES = SIZE * SIZE;

/** Loại quân; quân Trắng mang số dương, quân Đen mang số âm, 0 là ô trống. */
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

/** 1 là Trắng (đi trước, ở dưới), 2 là Đen. */
export type Side = 1 | 2;
/** [từ ô, tới ô] hoặc [từ ô, tới ô, quân phong cấp] — ô 0 là a8, ô 63 là h1. */
export type Move = [from: number, to: number] | [from: number, to: number, promo: number];
/** Cách ván kết thúc: chiếu hết, hết nước (không bị chiếu), lặp thế cờ, 50 nước, không đủ quân chiếu hết. */
export type End = "mate" | "stalemate" | "repeat" | "fifty" | "material";

export const PIECES: Record<number, { name: string; letter: string; value: number }> = {
  [PAWN]: { name: "Tốt", letter: "", value: 1 },
  [KNIGHT]: { name: "Mã", letter: "N", value: 3 },
  [BISHOP]: { name: "Tượng", letter: "B", value: 3 },
  [ROOK]: { name: "Xe", letter: "R", value: 5 },
  [QUEEN]: { name: "Hậu", letter: "Q", value: 9 },
  [KING]: { name: "Vua", letter: "K", value: 0 },
};

/** Các quân Tốt được phong thành, theo thứ tự hiện trong bảng chọn. */
export const PROMOTIONS = [QUEEN, ROOK, BISHOP, KNIGHT] as const;

/** 50 nước mỗi bên không ăn quân, không đi Tốt thì hoà. */
export const FIFTY_PLIES = 100;

/** Quyền nhập thành: Trắng cánh Vua / cánh Hậu, Đen cánh Vua / cánh Hậu. */
const WK = 1;
const WQ = 2;
const BK = 4;
const BQ = 8;

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const CODE: Record<string, number> = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };

export const rowOf = (i: number) => i >> 3;
export const colOf = (i: number) => i & 7;
export const sideOf = (v: number): 0 | Side => (v > 0 ? 1 : v < 0 ? 2 : 0);
export const other = (s: Side): Side => (s === 1 ? 2 : 1);
/** Tên ô kiểu "e4". */
export const squareName = (i: number) => `${"abcdefgh"[colOf(i)]}${SIZE - rowOf(i)}`;
/** Ô sáng (a8, h1…) hay ô tối. */
export const isLight = (i: number) => (rowOf(i) + colOf(i)) % 2 === 0;

/** Thế cờ: bàn, lượt, quyền nhập thành, ô bắt tốt qua đường (-1 nếu không có). */
export type Position = { board: Int8Array; turn: Side; castling: number; ep: number };

/** Thế cờ từ chuỗi FEN (bỏ qua hai số đếm cuối). */
export function parseFen(fen: string): Position {
  const [rows, turn = "w", castle = "-", ep = "-"] = fen.trim().split(/\s+/);
  const board = new Int8Array(SQUARES);
  rows.split("/").forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) c += Number(ch);
      else {
        const t = CODE[ch.toLowerCase()];
        board[r * SIZE + c++] = ch === ch.toUpperCase() ? t : -t;
      }
    }
  });
  let castling = 0;
  for (const ch of castle) castling |= ch === "K" ? WK : ch === "Q" ? WQ : ch === "k" ? BK : ch === "q" ? BQ : 0;
  const epSq = ep === "-" ? -1 : (SIZE - Number(ep[1])) * SIZE + ep.charCodeAt(0) - 97;
  return { board, turn: turn === "b" ? 2 : 1, castling, ep: epSq };
}

export const startPosition = () => parseFen(START_FEN);

const on = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
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
const KNIGHT_STEPS = [
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
];
const KING_STEPS = [...ORTHO, ...DIAG];

/** Ô `sq` bị bên `by` khống chế (có quân của `by` ăn được vào đó). */
export function attacked(board: Int8Array, sq: number, by: Side): boolean {
  const r = rowOf(sq);
  const c = colOf(sq);
  const s = by === 1 ? 1 : -1;
  // Tốt Trắng ăn chéo lên trên (hàng nhỏ hơn) nên Tốt Trắng khống chế `sq` thì đứng ở hàng dưới nó.
  const pr = by === 1 ? r + 1 : r - 1;
  for (const dc of [-1, 1]) if (on(pr, c + dc) && board[pr * SIZE + c + dc] === s * PAWN) return true;
  for (const [dr, dc] of KNIGHT_STEPS) if (on(r + dr, c + dc) && board[(r + dr) * SIZE + c + dc] === s * KNIGHT) return true;
  for (const [dr, dc] of KING_STEPS) if (on(r + dr, c + dc) && board[(r + dr) * SIZE + c + dc] === s * KING) return true;
  const ray = (dirs: number[][], a: number, b: number) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr;
      let cc = c + dc;
      while (on(rr, cc)) {
        const t = board[rr * SIZE + cc];
        if (t) {
          if (t === s * a || t === s * b) return true;
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
    return false;
  };
  return ray(ORTHO, ROOK, QUEEN) || ray(DIAG, BISHOP, QUEEN);
}

/** Vua bên `side` đang bị chiếu. */
export function inCheck(board: Int8Array, side: Side): boolean {
  const king = board.indexOf(side === 1 ? KING : -KING);
  return king < 0 || attacked(board, king, other(side));
}

/** Các nước đi đúng cách đi của quân (chưa xét Vua mình có bị chiếu sau nước đi hay không; chưa gồm nhập thành). */
function pseudoMoves(p: Position): Move[] {
  const { board, turn } = p;
  const out: Move[] = [];
  for (let from = 0; from < SQUARES; from++) {
    const v = board[from];
    if (sideOf(v) !== turn) continue;
    const r = rowOf(from);
    const c = colOf(from);
    const add = (rr: number, cc: number) => {
      if (!on(rr, cc)) return false;
      const t = board[rr * SIZE + cc];
      if (sideOf(t) !== turn) out.push([from, rr * SIZE + cc]);
      return !t;
    };
    switch (Math.abs(v)) {
      case PAWN: {
        const dir = turn === 1 ? -1 : 1;
        const last = turn === 1 ? 0 : SIZE - 1;
        const push = (to: number) => {
          if (rowOf(to) === last) for (const q of PROMOTIONS) out.push([from, to, q]);
          else out.push([from, to]);
        };
        const one = r + dir;
        if (!on(one, c)) break;
        if (!board[one * SIZE + c]) {
          push(one * SIZE + c);
          const two = r + 2 * dir;
          if (r === (turn === 1 ? 6 : 1) && !board[two * SIZE + c]) out.push([from, two * SIZE + c]);
        }
        for (const dc of [-1, 1]) {
          if (!on(one, c + dc)) continue;
          const to = one * SIZE + c + dc;
          const t = board[to];
          if ((t && sideOf(t) !== turn) || to === p.ep) push(to);
        }
        break;
      }
      case KNIGHT:
        for (const [dr, dc] of KNIGHT_STEPS) add(r + dr, c + dc);
        break;
      case KING:
        for (const [dr, dc] of KING_STEPS) add(r + dr, c + dc);
        break;
      default: {
        const type = Math.abs(v);
        const dirs = type === ROOK ? ORTHO : type === BISHOP ? DIAG : KING_STEPS;
        for (const [dr, dc] of dirs) {
          let rr = r + dr;
          let cc = c + dc;
          while (add(rr, cc)) {
            rr += dr;
            cc += dc;
          }
        }
      }
    }
  }
  return out;
}

/** Ô bị đụng tới thì mất quyền nhập thành tương ứng (Vua hay Xe rời chỗ, hoặc Xe bị ăn). */
const CASTLE_MASK = new Map<number, number>([
  [60, ~(WK | WQ)],
  [63, ~WK],
  [56, ~WQ],
  [4, ~(BK | BQ)],
  [7, ~BK],
  [0, ~BQ],
]);

export type Applied = {
  pos: Position;
  /** Quân bị ăn (0 nếu không ăn) và ô của nó (khác ô tới khi bắt tốt qua đường). */
  taken: number;
  takenAt: number;
  /** Xe đi kèm khi nhập thành. */
  rook: [from: number, to: number] | null;
};

/** Áp dụng một nước (coi như đã hợp lệ) — trả thế cờ mới, không sửa thế cũ. */
export function applyMove(p: Position, m: Move): Applied {
  const [from, to, promo] = m;
  const board = p.board.slice();
  const v = board[from];
  const type = Math.abs(v);
  let taken = board[to];
  let takenAt = to;
  if (type === PAWN && to === p.ep && !taken) {
    takenAt = to + (p.turn === 1 ? SIZE : -SIZE);
    taken = board[takenAt];
    board[takenAt] = 0;
  }
  board[to] = promo ? Math.sign(v) * promo : v;
  board[from] = 0;
  let rook: Applied["rook"] = null;
  if (type === KING && Math.abs(to - from) === 2) {
    rook = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
    board[rook[1]] = board[rook[0]];
    board[rook[0]] = 0;
  }
  const castling = p.castling & (CASTLE_MASK.get(from) ?? ~0) & (CASTLE_MASK.get(to) ?? ~0);
  const ep = type === PAWN && Math.abs(to - from) === 2 * SIZE ? (from + to) / 2 : -1;
  return { pos: { board, turn: other(p.turn), castling, ep }, taken, takenAt, rook };
}

/** Các nước hợp lệ của bên tới lượt: đi đúng cách và không để Vua mình bị chiếu. */
export function legalMoves(p: Position): Move[] {
  const { board, turn } = p;
  const foe = other(turn);
  const out = pseudoMoves(p).filter((m) => !inCheck(applyMove(p, m).pos.board, turn));
  const king = turn === 1 ? 60 : 4;
  if (board[king] === (turn === 1 ? KING : -KING) && !attacked(board, king, foe)) {
    const rook = turn === 1 ? ROOK : -ROOK;
    const free = (...sq: number[]) => sq.every((i) => !board[i]);
    const safe = (...sq: number[]) => sq.every((i) => !attacked(board, i, foe));
    if (p.castling & (turn === 1 ? WK : BK) && board[king + 3] === rook && free(king + 1, king + 2) && safe(king + 1, king + 2)) out.push([king, king + 2]);
    if (p.castling & (turn === 1 ? WQ : BQ) && board[king - 4] === rook && free(king - 1, king - 2, king - 3) && safe(king - 1, king - 2)) out.push([king, king - 2]);
  }
  return out;
}

const sameMove = (a: Move, b: readonly unknown[]) => a[0] === b[0] && a[1] === b[1] && (a[2] ?? 0) === (b[2] ?? 0);

/** Ký hiệu đại số chuẩn (SAN) của nước `m` trong thế `p`, chưa gồm dấu chiếu (+ / #). */
export function notate(p: Position, m: Move, legal: Move[] = legalMoves(p)): string {
  const [from, to, promo] = m;
  const v = p.board[from];
  const type = Math.abs(v);
  if (type === KING && Math.abs(to - from) === 2) return to > from ? "O-O" : "O-O-O";
  const capture = !!p.board[to] || (type === PAWN && to === p.ep);
  const dest = squareName(to);
  if (type === PAWN) return `${capture ? `${squareName(from)[0]}x` : ""}${dest}${promo ? `=${PIECES[promo].letter}` : ""}`;
  // Quân cùng loại khác cũng tới được ô này thì ghi thêm cột, hàng, hoặc cả hai để phân biệt.
  const rivals = legal.filter(([f, t]) => t === to && f !== from && p.board[f] === v).map(([f]) => f);
  let which = "";
  if (rivals.length) {
    if (!rivals.some((f) => colOf(f) === colOf(from))) which = squareName(from)[0];
    else if (!rivals.some((f) => rowOf(f) === rowOf(from))) which = squareName(from)[1];
    else which = squareName(from);
  }
  return `${PIECES[type].letter}${which}${capture ? "x" : ""}${dest}`;
}

/** Hai bên không còn đủ quân để chiếu hết: chỉ còn Vua, Vua + một Mã / Tượng, hoặc chỉ còn Tượng cùng màu ô. */
export function insufficient(board: Int8Array): boolean {
  const rest: number[] = [];
  for (let i = 0; i < SQUARES; i++) if (board[i] && Math.abs(board[i]) !== KING) rest.push(i);
  if (rest.length === 0) return true;
  if (rest.length === 1) return [KNIGHT, BISHOP].includes(Math.abs(board[rest[0]]));
  return rest.every((i) => Math.abs(board[i]) === BISHOP) && rest.every((i) => isLight(i) === isLight(rest[0]));
}

export type ChessState = Position & {
  /** Mã quân (vị trí ban đầu) đang đứng ở từng ô, -1 nếu trống — để giao diện trượt đúng quân khi đi. */
  ids: Int16Array;
  /** Số nước hợp lệ đã áp dụng. */
  count: number;
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
  /** Biên bản từng nước (SAN). */
  notes: string[];
  /** Số nước liên tiếp không ăn quân, không đi Tốt. */
  quiet: number;
};

export function emptyState(start: Position = startPosition()): ChessState {
  const pos = { ...start, board: start.board.slice() };
  const ids = new Int16Array(SQUARES).fill(-1);
  pos.board.forEach((v, i) => {
    if (v) ids[i] = i;
  });
  return { ...pos, ids, count: 0, check: inCheck(pos.board, pos.turn), legal: legalMoves(pos), last: null, winner: 0, draw: false, end: null, captured: [], notes: [], quiet: 0 };
}

const isMove = (m: unknown): m is Move =>
  Array.isArray(m) && (m.length === 2 || m.length === 3) && m.every((x) => Number.isInteger(x) && x >= 0 && x < SQUARES);

/** Khoá thế cờ để xét lặp: bàn, lượt, quyền nhập thành, và ô bắt tốt qua đường chỉ khi thật sự bắt được. */
function key(s: ChessState) {
  const ep = s.ep >= 0 && s.legal.some(([f, t]) => t === s.ep && Math.abs(s.board[f]) === PAWN) ? s.ep : -1;
  return `${s.turn}:${s.castling}:${ep}:${s.board.join(",")}`;
}

/**
 * Dựng lại ván từ nhật ký nước đi. Nước không hợp lệ (sai luật, sau khi đã hết ván) thì dừng ở đó — mọi máy cùng
 * nhật ký ra cùng kết quả. `start` chỉ dùng cho test thế cờ tàn.
 */
export function replay(moves: readonly unknown[], start?: Position): ChessState {
  const s = emptyState(start);
  const seen = new Map<string, number>([[key(s), 1]]);
  for (const m of moves) {
    if (s.winner || s.draw || !isMove(m)) break;
    const move = s.legal.find((x) => sameMove(x, m));
    if (!move) break;
    const [from, to] = move;
    const note = notate(s, move, s.legal);
    const { pos, taken, takenAt, rook } = applyMove(s, move);
    const pawn = Math.abs(s.board[from]) === PAWN;
    if (taken) {
      s.captured.push(taken);
      s.ids[takenAt] = -1;
    }
    s.ids[to] = s.ids[from];
    s.ids[from] = -1;
    if (rook) {
      s.ids[rook[1]] = s.ids[rook[0]];
      s.ids[rook[0]] = -1;
    }
    Object.assign(s, pos);
    s.quiet = taken || pawn ? 0 : s.quiet + 1;
    s.count++;
    s.last = move;
    s.check = inCheck(s.board, s.turn);
    s.legal = legalMoves(s);
    s.notes.push(note + (s.check ? (s.legal.length ? "+" : "#") : ""));

    if (!s.legal.length) {
      if (s.check) {
        s.winner = other(s.turn);
        s.end = "mate";
      } else {
        s.draw = true;
        s.end = "stalemate";
      }
      break;
    }
    const k = key(s);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n >= 3) s.end = "repeat";
    else if (s.quiet >= FIFTY_PLIES) s.end = "fifty";
    else if (insufficient(s.board)) s.end = "material";
    if (s.end) {
      s.draw = true;
      break;
    }
  }
  if (s.winner || s.draw) s.legal = [];
  return s;
}

/** Chênh lệch quân (Trắng trừ Đen) theo thang điểm thông dụng Tốt 1, Mã / Tượng 3, Xe 5, Hậu 9. */
export function material(board: Int8Array): number {
  let sum = 0;
  for (const v of board) if (v) sum += Math.sign(v) * PIECES[Math.abs(v)].value;
  return sum;
}
