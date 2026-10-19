// Bàn và tranh chốt từ seed nên không phải gửi qua mạng.
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

export const TILES = [
  "🍎", "🍌", "🍇", "🍉", "🍓", "🍒", "🥝", "🍍", "🥥", "🌽", "🥕", "🍄", "🌵", "🌻", "🌈",
  "⭐", "🌙", "🔥", "⚽", "🎈", "🎁", "🎸", "🚀", "🚗", "⛵", "🎩", "👑", "💎", "🍦", "🍩",
] as const;

export const MIN_PLAYERS = 1;
// Đếm ngược trước khi mở bàn để mọi người cùng bắt đầu.
export const COUNTDOWN_MS = 3000;
export const TURN_MS = 20000;
// Hai ô lật trật còn ngửa một lúc cho cả phòng nhớ rồi mới úp lại.
export const PEEK_MS = 1600;
export const FINAL_MS = 30000;
export const GUESS_MAX = 20;
export const GUESS_LEN = 40;

export const LEVELS = {
  easy: { label: "Dễ", emoji: "🟢", about: "Danh lam, món ăn, con vật, đồ vật — nhìn là nhận ra.", pictures: PICTURES },
  hard: { label: "Khó", emoji: "🔴", about: "Khái niệm trừu tượng: cảm xúc, xã hội, khoa học… — suy luận từ tranh, lật được nửa bàn thì có câu gợi ý.", pictures: ABSTRACT },
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

export type TxRound = TxOptions & {
  seed: number;
  pic: number;
  t0: number;
};

export const pairsOf = (size: SizeKey) => (SIZES[size].w * SIZES[size].h) / 2;
// Ván chốt trước khi có mức khó thì là bộ Dễ.
export const pictureOf = (r: { pic: number; level?: unknown }): Picture | undefined => LEVELS[normLevel(r.level)].pictures[r.pic];

// Bộ Khó cộng thêm chừng này vào mã để chung một danh sách "đã chơi" với bộ Dễ (`meta.txUsed`).
const HARD_BASE = 1000;
export const usedId = (level: Level, pic: number) => (level === "hard" ? HARD_BASE + pic : pic);
export const usedOf = (used: readonly number[], level: Level) =>
  used.flatMap((id) => (level === "hard" ? (id >= HARD_BASE ? [id - HARD_BASE] : []) : id < HARD_BASE ? [id] : []));

const answers = (p: Picture) => [p.w, ...(p.alt ?? [])];

export const isAnswer = (guess: string, p: Picture) => answers(p).some((a) => isRight(guess, a));

export const isClose = (guess: string, p: Picture) => !isAnswer(guess, p) && answers(p).some((a) => isNear(guess, a));

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

export function deal(seed: number, size: SizeKey): number[] {
  const rand = rng(seed);
  const n = pairsOf(size);
  const kinds = shuffle(
    TILES.map((_, i) => i),
    rand,
  ).slice(0, n);
  return shuffle([...kinds, ...kinds], rand);
}

export function pickPicture(used: readonly number[], level: Level, rand: () => number): number {
  const all = LEVELS[level].pictures.map((_, i) => i);
  const seen = new Set(usedOf(used, level));
  const fresh = all.filter((i) => !seen.has(i));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(rand() * pool.length)];
}

export type PassWhy = 0 | 1 | 2;

export type Entry = [kind: 0, k: number, cell: number, t: number] | [kind: 1, k: number, text: string, t: number] | [kind: 2, why: PassWhy, t: number] | [kind: 3, t: number];

export type Move = ["f", cell: number, turn: number] | ["g", text: string];

export type Board = {
  log: Entry[];
  seen: number[];
};

export const emptyBoard = (players: number): Board => ({ log: [], seen: new Array<number>(players).fill(0) });

export type Guess = { k: number; text: string; t: number; right: boolean; near: boolean };

export type TxState = {
  w: number;
  h: number;
  tiles: number[];
  owner: number[];
  open: number[];
  turn: number;
  current: number;
  since: number;
  at: number;
  pairs: number[];
  left: number;
  guesses: Guess[];
  tries: number[];
  cleared: number;
  over: boolean;
  winner: number;
  // Để dựng tiếp từ trạng thái cũ khi nhật ký dài thêm.
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

export const HINT_AT = 0.5;
export const openedOf = (s: TxState) => s.owner.filter((o) => o >= 0).length;
export const hintNeed = (s: TxState) => Math.ceil(s.tiles.length * HINT_AT);
export const hintShown = (s: TxState) => s.over || openedOf(s) >= hintNeed(s);

export const canFlip = (s: TxState, cell: number, open = s.open) =>
  !s.over && !s.cleared && open.length < 2 && isInt(cell) && cell >= 0 && cell < s.tiles.length && s.owner[cell] < 0 && !open.includes(cell);

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

export function replay(r: Pick<TxRound, "seed" | "size" | "t0" | "pic" | "level">, players: number, log: readonly unknown[], from?: TxState): TxState {
  const s = from && from.count <= log.length && from.pairs.length === players ? clone(from) : newGame(r, players);
  const pic = pictureOf(r) ?? { w: "", img: "" };
  for (; s.count < log.length; s.count++) apply(s, pic, log[s.count]);
  return s;
}

const isMove = (x: unknown): x is Move =>
  Array.isArray(x) && x.length === (x[0] === "f" ? 3 : 2) && (x[0] === "f" ? isInt(x[1]) && isInt(x[2]) : x[0] === "g" && typeof x[1] === "string");

export type JudgeCtx = {
  now: number;
  online: (k: number) => boolean;
};

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

// Áp tạm các ô mình vừa lật lên bàn chung để không phải chờ chủ phòng ghi nhận.
export function optimistic(s: TxState, me: number, pending: readonly unknown[]): number[] {
  let open = s.open;
  if (me !== s.current) return open;
  for (const mv of pending) {
    if (!isMove(mv) || mv[0] !== "f" || mv[2] !== s.turn || !canFlip(s, mv[1], open)) continue;
    open = [...open, mv[1]];
  }
  return open;
}

export const guessesIn = (moves: readonly unknown[]) => moves.filter((mv) => isMove(mv) && mv[0] === "g").map((mv) => (mv as ["g", string])[1]);
