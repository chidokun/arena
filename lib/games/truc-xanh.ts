/**
 * Luật Trúc Xanh (thuần — không mạng, không DOM). Bàn gồm các ô đánh số úp lên một bức tranh ẩn; mặt dưới mỗi ô là một
 * hình emoji, mỗi hình đúng hai ô. Người chơi lần lượt theo thứ tự đội hình (xáo lúc bắt đầu), mỗi lượt lật hai ô:
 * trùng hình thì cặp ô biến mất — lộ một mảng tranh — và được lật tiếp; trật thì hai ô úp lại, sang người sau. Hết giờ
 * lượt hoặc vắng mặt thì mất lượt.
 *
 * Tranh ẩn bốc từ một trong hai bộ theo mức chủ phòng chọn: Dễ — danh lam, món ăn, con vật, đồ vật cụ thể; Khó — khái
 * niệm trừu tượng (cảm xúc, xã hội, khoa học…), kèm một câu gợi ý hiện cho cả phòng từ lúc mở bàn.
 *
 * Ai trong đội hình cũng được đoán từ khoá của tranh bất cứ lúc nào, không cần tới lượt: đoán đúng là thắng ngay, đoán
 * trật thì thôi (không bị phạt, chỉ giới hạn số lần đoán). Lật hết bàn mà chưa ai đoán ra thì còn `FINAL_MS` để đoán,
 * hết giờ thì ván kết thúc không ai thắng.
 *
 * Bàn và tranh chốt từ seed nên không phải gửi qua mạng. Người chơi chỉ ghi nhật ký nước của chính mình (lật ô, lời
 * đoán); chủ phòng phân xử thứ tự (`judge`), thêm các mốc giờ (qua lượt, hết giờ đoán) rồi ghi bàn chung — ai cũng dựng
 * lại được ván từ bàn chung (`replay`).
 */
import { isNear, isRight } from "./draw-guess.ts";
import { ABSTRACT } from "./truc-xanh-abstract.ts";
import { PICTURES, type Picture } from "./truc-xanh-words.ts";

export { ABSTRACT, PICTURES, type Picture };

export const SIZES = {
  s: { w: 4, h: 3, label: "Nhỏ" },
  m: { w: 5, h: 4, label: "Vừa" },
  l: { w: 6, h: 5, label: "Lớn" },
} as const;
export type SizeKey = keyof typeof SIZES;
export const SIZE_KEYS: readonly SizeKey[] = ["s", "m", "l"];

/** Hình mặt dưới các ô — mỗi ván bốc ngẫu nhiên số loại cần dùng (bàn lớn nhất 15 cặp). */
export const TILES = [
  "🍎", "🍌", "🍇", "🍉", "🍓", "🍒", "🥝", "🍍", "🥥", "🌽", "🥕", "🍄", "🌵", "🌻", "🌈",
  "⭐", "🌙", "🔥", "⚽", "🎈", "🎁", "🎸", "🚀", "🚗", "⛵", "🎩", "👑", "💎", "🍦", "🍩",
] as const;

export const MIN_PLAYERS = 1;
/** Đếm ngược trước khi mở bàn — để mọi người cùng bắt đầu. */
export const COUNTDOWN_MS = 3000;
/** Thời gian mỗi lượt lật (lật trúng thì tính lại từ đầu). */
export const TURN_MS = 20000;
/** Hai ô lật trật còn ngửa chừng này cho cả phòng nhớ rồi mới úp lại, sang lượt sau. */
export const PEEK_MS = 1600;
/** Lật hết bàn mà chưa ai đoán ra thì còn chừng này để đoán. */
export const FINAL_MS = 30000;
/** Mỗi người đoán tối đa chừng này lần mỗi ván, mỗi lần tối đa `GUESS_LEN` ký tự. */
export const GUESS_MAX = 20;
export const GUESS_LEN = 40;

/** Mức khó: bộ tranh ẩn dùng cho ván. */
export const LEVELS = {
  easy: { label: "Dễ", emoji: "🟢", about: "Danh lam, món ăn, con vật, đồ vật — nhìn là nhận ra.", pictures: PICTURES },
  hard: { label: "Khó", emoji: "🔴", about: "Khái niệm trừu tượng: cảm xúc, xã hội, khoa học… — suy luận từ tranh và câu gợi ý.", pictures: ABSTRACT },
} as const;
export type Level = keyof typeof LEVELS;
export const LEVEL_KEYS: readonly Level[] = ["easy", "hard"];
const normLevel = (x: unknown): Level => LEVEL_KEYS.find((k) => k === x) ?? "easy";

export type TxOptions = { size: SizeKey; level: Level };
export const DEFAULT_OPTIONS: TxOptions = { size: "m", level: "easy" };

export function normOptions(o: unknown): TxOptions {
  const x = (o ?? {}) as Partial<TxOptions>;
  return { size: SIZE_KEYS.find((k) => k === x.size) ?? DEFAULT_OPTIONS.size, level: normLevel(x.level) };
}

/** Phần công khai của một ván, chủ phòng chốt lúc bắt đầu (`meta.tx`): bàn sinh từ `seed` theo `size`, tranh `pic`. */
export type TxRound = TxOptions & {
  seed: number;
  /** Mã tranh ẩn: vị trí trong bộ tranh của mức `level`. */
  pic: number;
  /** Giờ máy chủ phòng lúc mở bàn (hết đếm ngược) — cũng là lúc bắt đầu lượt đầu tiên. */
  t0: number;
};

export const pairsOf = (size: SizeKey) => (SIZES[size].w * SIZES[size].h) / 2;
/** Tranh của một ván (ván chốt trước khi có mức khó thì là bộ Dễ). */
export const pictureOf = (r: { pic: number; level?: unknown }): Picture | undefined => LEVELS[normLevel(r.level)].pictures[r.pic];

/** Bộ Khó đánh dấu "đã chơi" bằng mã cộng thêm chừng này, để chung một danh sách với bộ Dễ (`meta.txUsed`). */
const HARD_BASE = 1000;
/** Mã một tranh trong danh sách tranh đã chơi của phòng. */
export const usedId = (level: Level, pic: number) => (level === "hard" ? HARD_BASE + pic : pic);
/** Các tranh đã chơi (vị trí trong bộ) của một mức. */
export const usedOf = (used: readonly number[], level: Level) =>
  used.flatMap((id) => (level === "hard" ? (id >= HARD_BASE ? [id - HARD_BASE] : []) : id < HARD_BASE ? [id] : []));

// ---------- so đáp án ----------

const answers = (p: Picture) => [p.w, ...(p.alt ?? [])];

/** Đoán đúng tranh: trùng từ khoá hoặc một cách gọi khác — không phân biệt dấu, hoa thường, bỏ được loại từ đứng đầu. */
export const isAnswer = (guess: string, p: Picture) => answers(p).some((a) => isRight(guess, a));

/** Gần đúng (sai một, hai ký tự) — chỉ báo riêng người đoán. */
export const isClose = (guess: string, p: Picture) => !isAnswer(guess, p) && answers(p).some((a) => isNear(guess, a));

// ---------- bàn ----------

/** Bộ sinh số giả ngẫu nhiên mulberry32: cùng seed ra cùng dãy. */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], rand: () => number) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Hình (chỉ số trong `TILES`) dưới từng ô: bốc ngẫu nhiên đủ số loại, mỗi loại hai ô, xáo vị trí. */
export function deal(seed: number, size: SizeKey): number[] {
  const rand = rng(seed);
  const n = pairsOf(size);
  const kinds = shuffle(
    TILES.map((_, i) => i),
    rand,
  ).slice(0, n);
  return shuffle([...kinds, ...kinds], rand);
}

/** Bốc một tranh chưa chơi trong phòng (`used` — danh sách `usedId`) của mức `level`; chơi hết rồi thì bốc lại từ cả bộ. */
export function pickPicture(used: readonly number[], level: Level, rand: () => number): number {
  const all = LEVELS[level].pictures.map((_, i) => i);
  const seen = new Set(usedOf(used, level));
  const fresh = all.filter((i) => !seen.has(i));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(rand() * pool.length)];
}

// ---------- nhật ký ----------

/** Lý do qua lượt: 0 lật trật, 1 hết giờ lượt, 2 người tới lượt vắng mặt. */
export type PassWhy = 0 | 1 | 2;

/**
 * Một dòng chủ phòng đã ghi nhận, kèm giờ máy chủ phòng `t`: người thứ `k` của đội hình lật ô, người thứ `k` đoán, qua
 * lượt, hoặc hết giờ đoán sau khi lật hết bàn.
 */
export type Entry = [kind: 0, k: number, cell: number, t: number] | [kind: 1, k: number, text: string, t: number] | [kind: 2, why: PassWhy, t: number] | [kind: 3, t: number];

/** Nước người chơi gửi: lật ô `cell` trong lượt thứ `turn`, hoặc đoán. */
export type Move = ["f", cell: number, turn: number] | ["g", text: string];

/** Bàn chung chủ phòng ghi (`g:<ván>`). */
export type Board = {
  log: Entry[];
  /** Đã xét tới nước thứ mấy trong nhật ký của từng người chơi (theo thứ tự đội hình). */
  seen: number[];
};

export const emptyBoard = (players: number): Board => ({ log: [], seen: new Array<number>(players).fill(0) });

/** Một lời đoán đã ghi nhận: người đoán, chữ, giờ chủ phòng, kết quả. */
export type Guess = { k: number; text: string; t: number; right: boolean; near: boolean };

export type TxState = {
  w: number;
  h: number;
  /** Hình dưới từng ô (chỉ số trong `TILES`). */
  tiles: number[];
  /** Người lật được cặp ở từng ô; −1 là ô còn úp trên bàn. */
  owner: number[];
  /** Các ô đang ngửa trong lượt (0–2 ô); hai ô là vừa lật trật, chờ úp lại. */
  open: number[];
  /** Lượt thứ mấy (đếm từ 0) và người tới lượt (thứ tự trong đội hình). */
  turn: number;
  current: number;
  /** Giờ chủ phòng lúc bắt đầu lượt (hoặc lúc vừa lật trúng — tính lại giờ). */
  since: number;
  /** Giờ chủ phòng của dòng nhật ký gần nhất. */
  at: number;
  /** Số cặp từng người lật được. */
  pairs: number[];
  /** Số cặp còn úp. */
  left: number;
  guesses: Guess[];
  /** Số lần đoán của từng người. */
  tries: number[];
  /** Giờ chủ phòng lúc lật hết bàn; 0 nếu chưa. */
  cleared: number;
  over: boolean;
  /** Người đoán đúng (thứ tự trong đội hình); −1 nếu chưa / không ai. */
  winner: number;
  /** Số dòng nhật ký đã xét — để dựng tiếp từ trạng thái cũ khi nhật ký dài thêm. */
  count: number;
};

export function newGame(r: Pick<TxRound, "seed" | "size" | "t0">, players: number): TxState {
  const { w, h } = SIZES[r.size];
  return {
    w,
    h,
    tiles: deal(r.seed, r.size),
    owner: new Array<number>(w * h).fill(-1),
    open: [],
    turn: 0,
    current: 0,
    since: r.t0,
    at: r.t0,
    pairs: new Array<number>(players).fill(0),
    left: pairsOf(r.size),
    guesses: [],
    tries: new Array<number>(players).fill(0),
    cleared: 0,
    over: false,
    winner: -1,
    count: 0,
  };
}

const isInt = (x: unknown): x is number => Number.isInteger(x);
const isTime = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Lật được ô `cell` không: tới lượt, chưa đủ hai ô ngửa, ô còn úp. */
export const canFlip = (s: TxState, cell: number, open = s.open) =>
  !s.over && !s.cleared && open.length < 2 && isInt(cell) && cell >= 0 && cell < s.tiles.length && s.owner[cell] < 0 && !open.includes(cell);

/** Áp một dòng nhật ký; trả về false nếu không được tính. */
function apply(s: TxState, pic: Picture, e: unknown): boolean {
  if (s.over || !Array.isArray(e)) return false;
  const players = s.pairs.length;
  switch (e[0]) {
    case 0: {
      const [, k, cell, t] = e;
      if (!isInt(k) || k !== s.current || !isTime(t) || !canFlip(s, cell)) return false;
      s.open = [...s.open, cell];
      s.at = t;
      if (s.open.length < 2) return true;
      const [a, b] = s.open;
      if (s.tiles[a] !== s.tiles[b]) return true;
      // Trúng: cặp ô biến mất, được lật tiếp, tính lại giờ lượt.
      s.owner[a] = s.owner[b] = k;
      s.pairs[k]++;
      s.left--;
      s.open = [];
      s.since = t;
      if (s.left <= 0) s.cleared = t;
      return true;
    }
    case 1: {
      const [, k, text, t] = e;
      if (!isInt(k) || k < 0 || k >= players || typeof text !== "string" || !isTime(t) || s.tries[k] >= GUESS_MAX) return false;
      const said = text.trim().slice(0, GUESS_LEN);
      if (!said) return false;
      const right = isAnswer(said, pic);
      s.guesses.push({ k, text: said, t, right, near: !right && isClose(said, pic) });
      s.tries[k]++;
      s.at = t;
      if (right) {
        s.over = true;
        s.winner = k;
      }
      return true;
    }
    case 2: {
      const [, why, t] = e;
      if (s.cleared || ![0, 1, 2].includes(why) || !isTime(t)) return false;
      s.turn++;
      s.current = s.turn % players;
      s.open = [];
      s.since = s.at = t;
      return true;
    }
    case 3: {
      const [, t] = e;
      if (!s.cleared || !isTime(t)) return false;
      s.over = true;
      s.at = t;
      return true;
    }
  }
  return false;
}

const clone = (s: TxState): TxState => ({
  ...s,
  owner: s.owner.slice(),
  open: s.open.slice(),
  pairs: s.pairs.slice(),
  guesses: s.guesses.slice(),
  tries: s.tries.slice(),
});

/**
 * Dựng lại ván từ bàn chung — tất định, máy nào cũng ra như nhau. Có `from` (trạng thái đã dựng từ phần đầu của cùng
 * nhật ký) thì chỉ áp tiếp các dòng mới.
 */
export function replay(r: Pick<TxRound, "seed" | "size" | "t0" | "pic" | "level">, players: number, log: readonly unknown[], from?: TxState): TxState {
  const s = from && from.count <= log.length && from.pairs.length === players ? clone(from) : newGame(r, players);
  const pic = pictureOf(r) ?? { w: "", img: "" };
  for (; s.count < log.length; s.count++) apply(s, pic, log[s.count]);
  return s;
}

const isMove = (x: unknown): x is Move =>
  Array.isArray(x) && x.length === (x[0] === "f" ? 3 : 2) && (x[0] === "f" ? isInt(x[1]) && isInt(x[2]) : x[0] === "g" && typeof x[1] === "string");

export type JudgeCtx = {
  /** Giờ máy chủ phòng. */
  now: number;
  /** Người thứ k của đội hình còn kết nối. */
  online: (k: number) => boolean;
};

/**
 * Chủ phòng phân xử: xét các nước mới trong nhật ký của từng người chơi (`moves[k]` — người thứ k của đội hình), ghi
 * những nước được tính vào bàn chung kèm giờ máy mình; rồi thêm mốc qua lượt (lật trật đã đủ `PEEK_MS`, hết giờ lượt,
 * người tới lượt vắng mặt) hoặc hết giờ đoán. `state` là trạng thái dựng từ `prev.log` (nếu có sẵn). Trả về bàn mới,
 * hoặc null nếu không có gì đổi.
 */
export function judge(r: Pick<TxRound, "seed" | "size" | "t0" | "pic" | "level">, moves: readonly (readonly unknown[])[], prev: Board, ctx: JudgeCtx, state?: TxState): Board | null {
  const { now } = ctx;
  if (now < r.t0) return null;
  const players = moves.length;
  const pic = pictureOf(r) ?? { w: "", img: "" };
  const s = state && state.count === prev.log.length ? clone(state) : replay(r, players, prev.log);
  const log = prev.log.slice();
  const seen = Array.from({ length: players }, (_, k) => prev.seen[k] ?? 0);
  let dirty = false;
  const push = (e: Entry) => {
    if (!apply(s, pic, e)) return;
    log.push(e);
    s.count++;
    dirty = true;
  };
  for (let k = 0; k < players && !s.over; k++) {
    const list = moves[k];
    for (; seen[k] < list.length && !s.over; seen[k]++) {
      dirty = true;
      const mv = list[seen[k]];
      if (!isMove(mv)) continue;
      if (mv[0] === "g") push([1, k, mv[1].slice(0, GUESS_LEN), now]);
      // Nước lật gửi cho lượt đã qua thì bỏ.
      else if (mv[2] === s.turn) push([0, k, mv[1], now]);
    }
  }
  if (!s.over) {
    if (s.cleared) {
      if (now - s.cleared >= FINAL_MS) push([3, now]);
    } else if (s.open.length === 2) {
      if (now - s.at >= PEEK_MS) push([2, 0, now]);
    } else if (!ctx.online(s.current)) {
      // Chỉ cho qua khi còn ai khác đang chơi — cả đội hình vắng thì đứng yên chờ (phòng tự dừng nếu vắng lâu).
      if (Array.from({ length: players }, (_, k) => k).some((k) => k !== s.current && ctx.online(k))) push([2, 2, now]);
    } else if (now - s.since >= TURN_MS) push([2, 1, now]);
  }
  return dirty ? { log, seen } : null;
}

/**
 * Các ô mình thấy đang ngửa trước khi chủ phòng kịp ghi nhận: áp tạm các ô mình vừa lật (`pending` — những nước chủ
 * phòng chưa xét) lên các ô ngửa của bàn chung, nếu đang tới lượt mình (`me`).
 */
export function optimistic(s: TxState, me: number, pending: readonly unknown[]): number[] {
  let open = s.open;
  if (me !== s.current) return open;
  for (const mv of pending) {
    if (!isMove(mv) || mv[0] !== "f" || mv[2] !== s.turn || !canFlip(s, mv[1], open)) continue;
    open = [...open, mv[1]];
  }
  return open;
}

/** Số lần đoán đã gửi (kể cả chưa được ghi nhận) trong nhật ký nước của một người. */
export const guessesIn = (moves: readonly unknown[]) => moves.filter((mv) => isMove(mv) && mv[0] === "g").map((mv) => (mv as ["g", string])[1]);
