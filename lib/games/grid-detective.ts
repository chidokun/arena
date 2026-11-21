// Thám Tử Ô Vuông (Grid Detective): đặt N quân — 1 nạn nhân (hoặc món bị ăn vụng) và N−1 nghi phạm — lên bản đồ N×N.
// Mỗi hàng, mỗi cột đúng một quân; không ai đứng lên vật cản; mọi lời khai đều đúng; thủ phạm là người DUY NHẤT ở cùng
// phòng với nạn nhân. Đề sinh tất định từ seed nên không phải gửi qua mạng: mọi máy tự dựng cùng một đề.

export type Level = "easy" | "medium" | "hard";
export type Mode = "coop" | "race";
export type Theme = "murder" | "snack";
export type GdOptions = { level: Level; mode: Mode; theme: Theme };

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 10;
export const COUNTDOWN_MS = 5000;
export const LOCK_MS = 10000;

export const SIZE: Record<Level, number> = { easy: 4, medium: 5, hard: 6 };

export const LEVELS: Record<Level, { name: string; emoji: string; text: string }> = {
  easy: { name: "Dễ", emoji: "🌱", text: "Bản đồ 4×4, 3 nghi phạm. Lời khai nói thẳng chỗ đứng — đi từng bước là ra." },
  medium: { name: "Vừa", emoji: "🌿", text: "Bản đồ 5×5, 4 nghi phạm. Có lời khai nhắc tới người khác, phải ghép các lời khai với nhau." },
  hard: { name: "Khó", emoji: "🔥", text: "Bản đồ 6×6, 5 nghi phạm. Lời khai vòng vo, có chỗ phải thử giả định rồi loại trừ." },
};
export const LEVEL_KEYS = Object.keys(LEVELS) as Level[];

export const MODES: Record<Mode, { name: string; emoji: string; text: string }> = {
  coop: {
    name: "Cùng phá án",
    emoji: "🤝",
    text: "Cả phòng đặt chung một bàn: đặt đúng chỗ một người trước người khác được 1 điểm, đặt sai bị trừ 1. Mỗi người được buộc tội một lần: đúng +2, sai −2. Đặt đủ cả bàn là hết ván, nhiều điểm nhất thắng.",
  },
  race: {
    name: "Đối kháng",
    emoji: "⚡",
    text: "Mỗi người tự phá án trên bàn của mình. Đặt đủ mọi người rồi bấm Buộc tội: đúng cả bàn là về đích, sai bị khoá tay 10 giây và không biết sai ở đâu. Ai về đích trước thắng, người còn lại giải tiếp để xếp hạng.",
  },
};
export const MODE_KEYS = Object.keys(MODES) as Mode[];

export const THEMES: Record<Theme, { name: string; emoji: string; text: string; culprit: string; victim: string; ask: string }> = {
  murder: {
    name: "Án mạng",
    emoji: "🕵️",
    text: "Có người bất tỉnh giữa buổi tiệc — tìm hung thủ.",
    culprit: "hung thủ",
    victim: "nạn nhân",
    ask: "Ai đã ra tay?",
  },
  snack: {
    name: "Ăn vụng",
    emoji: "🍲",
    text: "Món ngon để dành bị ăn vụng mất — tìm kẻ ăn vụng.",
    culprit: "kẻ ăn vụng",
    victim: "món bị mất",
    ask: "Ai đã ăn vụng?",
  },
};
export const THEME_KEYS = Object.keys(THEMES) as Theme[];

export const DEFAULT_OPTIONS: GdOptions = { level: "easy", mode: "race", theme: "murder" };

export type GdRound = GdOptions & { seed: number; t0: number };

export function normOptions(o: unknown): GdOptions {
  const x = (o ?? {}) as Partial<GdOptions>;
  return {
    level: LEVEL_KEYS.includes(x.level as Level) ? (x.level as Level) : DEFAULT_OPTIONS.level,
    mode: MODE_KEYS.includes(x.mode as Mode) ? (x.mode as Mode) : DEFAULT_OPTIONS.mode,
    theme: THEME_KEYS.includes(x.theme as Theme) ? (x.theme as Theme) : DEFAULT_OPTIONS.theme,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Bản đồ

export type ObjKind = "sofa" | "chair" | "bed" | "bath" | "tv" | "plant" | "stove" | "fridge" | "wardrobe" | "altar" | "box" | "bike" | "well";

// `seat`: đứng (ngồi, nằm) lên được, kèm động từ cho lời khai. Không có `seat` là vật cản.
export const OBJECTS: Record<ObjKind, { name: string; emoji: string; seat?: string }> = {
  sofa: { name: "ghế sofa", emoji: "🛋️", seat: "ngồi trên" },
  chair: { name: "ghế", emoji: "🪑", seat: "ngồi trên" },
  bed: { name: "giường", emoji: "🛏️", seat: "nằm trên" },
  bath: { name: "bồn tắm", emoji: "🛁", seat: "ngồi trong" },
  tv: { name: "TV", emoji: "📺" },
  plant: { name: "chậu cây", emoji: "🪴" },
  stove: { name: "bếp lò", emoji: "🔥" },
  fridge: { name: "tủ lạnh", emoji: "🧊" },
  wardrobe: { name: "tủ đồ", emoji: "🗄️" },
  altar: { name: "bàn thờ", emoji: "🕯️" },
  box: { name: "thùng đồ", emoji: "📦" },
  bike: { name: "xe máy", emoji: "🛵" },
  well: { name: "giếng", emoji: "🪣" },
};

export const isSeat = (k: ObjKind | null) => !!k && !!OBJECTS[k].seat;
export const isBlock = (k: ObjKind | null) => !!k && !OBJECTS[k].seat;

export type Room = { name: string; out?: boolean };

const ROOM_TYPES: (Room & { objs: ObjKind[] })[] = [
  { name: "Phòng khách", objs: ["sofa", "tv", "plant", "chair"] },
  { name: "Bếp", objs: ["stove", "fridge", "chair"] },
  { name: "Phòng ngủ", objs: ["bed", "wardrobe", "plant"] },
  { name: "Phòng thờ", objs: ["altar", "chair", "plant"] },
  { name: "Sân", out: true, objs: ["bike", "well", "plant", "chair"] },
  { name: "Phòng tắm", objs: ["bath", "plant"] },
  { name: "Nhà kho", objs: ["box", "bike", "chair"] },
  { name: "Hiên", out: true, objs: ["chair", "plant", "bike"] },
  { name: "Gác xép", objs: ["box", "bed"] },
];

/** "trong Bếp", "ngoài Sân". */
export const roomAt = (r: Room) => `${r.out ? "ngoài" : "trong"} ${r.name}`;

// ---------------------------------------------------------------------------------------------------------------------
// Nhân vật

export type Token = { name: string; emoji: string };

const SUSPECTS: Token[] = [
  { name: "Cô Lan", emoji: "👩" },
  { name: "Anh Bảo", emoji: "👨" },
  { name: "Bé Na", emoji: "👧" },
  { name: "Bác Hai", emoji: "👴" },
  { name: "Bà Năm", emoji: "👵" },
  { name: "Chú Tám", emoji: "🧔" },
  { name: "Chị Mai", emoji: "👩‍🦰" },
  { name: "Cu Tí", emoji: "👦" },
  { name: "Anh Khoa", emoji: "👨‍🍳" },
  { name: "Cô Hạnh", emoji: "👩‍🏫" },
  { name: "Ông Bảy", emoji: "👨‍🦳" },
  { name: "Chị Thảo", emoji: "👩‍🦱" },
  { name: "Anh Tùng", emoji: "👨‍🎤" },
  { name: "Chú Sáu", emoji: "👨‍🔧" },
];

const VICTIMS = ["Ông Tư", "Bà Sáu", "Chú Ba", "Cô Út", "Bác Cả", "Ông Chín"];
export const VICTIM_EMOJI = "😵";

const SNACKS: Token[] = [
  { name: "Nồi thịt kho", emoji: "🍲" },
  { name: "Hũ mứt gừng", emoji: "🍯" },
  { name: "Đĩa gà luộc", emoji: "🍗" },
  { name: "Hộp bánh trung thu", emoji: "🥮" },
  { name: "Quả dưa hấu", emoji: "🍉" },
  { name: "Đĩa bánh flan", emoji: "🍮" },
  { name: "Tô phở", emoji: "🍜" },
];

function story(theme: Theme, victim: string, rand: () => number) {
  if (theme === "murder") {
    const where = pick(["Đám giỗ nhà", "Tiệc tân gia của", "Đêm mưa ở nhà", "Bữa cơm đoàn viên nhà", "Tiệc sinh nhật"], rand);
    return {
      title: `${where} ${victim}`,
      intro: `${victim} được phát hiện bất tỉnh giữa buổi tiệc. Hung thủ là người duy nhất ở cùng phòng với ${victim}. Ai đã ra tay?`,
    };
  }
  const low = victim.charAt(0).toLowerCase() + victim.slice(1);
  return {
    title: pick([`Vụ mất ${low}`, `Ai ăn vụng ${low}?`, `Bí ẩn ${low}`], rand),
    intro: `${victim} để dành cho bữa tối đã bị ăn sạch. Kẻ ăn vụng là người duy nhất ở cùng phòng với ${low}. Ai đã ăn vụng?`,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Lời khai

export type ClueKind =
  | "room" | "notRoom" | "on" | "near" | "top" | "bottom" | "left" | "right" | "corner" | "row" | "col"
  | "same" | "apart" | "alone" | "above" | "below" | "leftOf" | "rightOf";

/** `t`: quân nói lời khai (0 là nạn nhân / món bị mất: lời khai của hiện trường). `a`: phòng, hàng, cột hoặc quân kia. */
export type Clue = { k: ClueKind; t: number; a?: number; o?: ObjKind };

const UNARY = new Set<ClueKind>(["room", "notRoom", "on", "near", "top", "bottom", "left", "right", "corner", "row", "col"]);
const BINARY = new Set<ClueKind>(["same", "apart", "above", "below", "leftOf", "rightOf"]);

const WEIGHTS: Record<Level, Partial<Record<ClueKind, number>>> = {
  easy: { room: 4, on: 3, near: 2, top: 1.5, bottom: 1.5, left: 1.5, right: 1.5, corner: 2, row: 1, col: 1, notRoom: 1, same: 1, alone: 1 },
  medium: {
    room: 2, on: 2, near: 3, top: 1, bottom: 1, left: 1, right: 1, corner: 1, row: 0.5, col: 0.5, notRoom: 2, same: 2, apart: 1, alone: 2,
    above: 1, below: 1, leftOf: 1, rightOf: 1,
  },
  hard: {
    room: 1, on: 1.5, near: 3, top: 0.8, bottom: 0.8, left: 0.8, right: 0.8, corner: 1, notRoom: 3, same: 2, apart: 1.5, alone: 2,
    above: 1.5, below: 1.5, leftOf: 1.5, rightOf: 1.5,
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Đề

export type Puzzle = {
  n: number;
  level: Level;
  theme: Theme;
  /** Phòng của từng ô. */
  room: number[];
  rooms: Room[];
  objs: (ObjKind | null)[];
  /** 0 là nạn nhân / món bị mất, còn lại là nghi phạm. */
  tokens: Token[];
  clues: Clue[];
  /** Ô của từng quân. */
  solution: number[];
  culprit: number;
  title: string;
  intro: string;
  /** Mức suy luận cần để giải: 1 lời khai trực tiếp, 2 ghép lời khai, 3 thử giả định. */
  grade: number;
};

type Base = Pick<Puzzle, "n" | "room" | "rooms" | "objs" | "solution">;

const nbrs = (n: number, c: number) => {
  const r = Math.floor(c / n);
  const q = c % n;
  const out: number[] = [];
  if (r > 0) out.push(c - n);
  if (r < n - 1) out.push(c + n);
  if (q > 0) out.push(c - 1);
  if (q < n - 1) out.push(c + 1);
  return out;
};

function holdsUnary(b: Base, c: Clue, cell: number): boolean {
  const { n } = b;
  const r = Math.floor(cell / n);
  const q = cell % n;
  switch (c.k) {
    case "room":
      return b.room[cell] === c.a;
    case "notRoom":
      return b.room[cell] !== c.a;
    case "on":
      return b.objs[cell] === c.o;
    case "near":
      return nbrs(n, cell).some((d) => b.objs[d] === c.o);
    case "top":
      return r === 0;
    case "bottom":
      return r === n - 1;
    case "left":
      return q === 0;
    case "right":
      return q === n - 1;
    case "corner":
      return (r === 0 || r === n - 1) && (q === 0 || q === n - 1);
    case "row":
      return r === c.a;
    case "col":
      return q === c.a;
    default:
      return true;
  }
}

function holdsBinary(b: Base, c: Clue, x: number, y: number): boolean {
  const { n } = b;
  switch (c.k) {
    case "same":
      return b.room[x] === b.room[y];
    case "apart":
      return b.room[x] !== b.room[y];
    case "above":
      return Math.floor(x / n) < Math.floor(y / n);
    case "below":
      return Math.floor(x / n) > Math.floor(y / n);
    case "leftOf":
      return x % n < y % n;
    case "rightOf":
      return x % n > y % n;
    default:
      return true;
  }
}

/** Mọi lời khai đúng với lời giải mà quân `t` có thể nói. */
function trueClues(b: Base, t: number, culprit: number): Clue[] {
  const { n, solution } = b;
  const cell = solution[t];
  const out: Clue[] = [];
  const add = (c: Clue) => {
    if (UNARY.has(c.k) ? holdsUnary(b, c, cell) : true) out.push(c);
  };
  add({ k: "room", t, a: b.room[cell] });
  for (let a = 0; a < b.rooms.length; a++) if (a !== b.room[cell]) add({ k: "notRoom", t, a });
  const own = b.objs[cell];
  if (own && isSeat(own)) add({ k: "on", t, o: own });
  for (const o of new Set(nbrs(n, cell).flatMap((d) => (b.objs[d] ? [b.objs[d]!] : [])))) add({ k: "near", t, o });
  for (const k of ["top", "bottom", "left", "right", "corner"] as const) add({ k, t });
  add({ k: "row", t, a: Math.floor(cell / n) });
  add({ k: "col", t, a: cell % n });
  const alone = solution.every((d, u) => u === t || b.room[d] !== b.room[cell]);
  if (alone) out.push({ k: "alone", t });
  for (let u = 0; u < solution.length; u++) {
    if (u === t) continue;
    // Nạn nhân và thủ phạm "ở cùng phòng" thì lộ luôn thủ phạm — bỏ.
    const pair = (t === 0 && u === culprit) || (u === 0 && t === culprit);
    for (const k of ["same", "apart", "above", "below", "leftOf", "rightOf"] as const) {
      if (k === "same" && pair) continue;
      const c: Clue = { k, t, a: u };
      if (holdsBinary(b, c, cell, solution[u])) out.push(c);
    }
  }
  return out;
}

/**
 * Đếm lời giải (tối đa `limit`) bằng quay lui. Luật: mỗi hàng/cột đúng một quân, không đứng lên vật cản, mọi lời khai
 * đúng, phòng của nạn nhân có đúng một quân khác.
 */
export function countSolutions(b: Base, clues: readonly Clue[], limit = 2, out?: number[][]): number {
  const { n } = b;
  const N = n * n;
  const T = b.solution.length;
  const dom: number[][] = Array.from({ length: T }, (_, t) => {
    const mine = clues.filter((c) => c.t === t && UNARY.has(c.k));
    const list: number[] = [];
    for (let c = 0; c < N; c++) if (!isBlock(b.objs[c]) && mine.every((x) => holdsUnary(b, x, c))) list.push(c);
    return list;
  });
  const pairs = clues.filter((c) => BINARY.has(c.k));
  const alone = new Set(clues.filter((c) => c.k === "alone").map((c) => c.t));
  const order = Array.from({ length: T }, (_, t) => t).sort((x, y) => dom[x].length - dom[y].length);
  const at = new Array<number>(T).fill(-1);
  const rowUsed = new Array<boolean>(n).fill(false);
  const colUsed = new Array<boolean>(n).fill(false);
  const inRoom = new Array<number>(b.rooms.length).fill(0);
  let count = 0;

  const fits = (t: number, cell: number) => {
    const R = b.room[cell];
    if (alone.has(t) && inRoom[R] > 0) return false;
    for (let u = 0; u < T; u++) if (at[u] >= 0 && alone.has(u) && b.room[at[u]] === R) return false;
    // Phòng nạn nhân không được có quá một quân khác.
    if (t === 0 && inRoom[R] > 1) return false;
    if (t !== 0 && at[0] >= 0 && b.room[at[0]] === R && inRoom[R] >= 2) return false;
    for (const c of pairs) {
      if (c.t === t && at[c.a!] >= 0 && !holdsBinary(b, c, cell, at[c.a!])) return false;
      if (c.a === t && at[c.t] >= 0 && !holdsBinary(b, c, at[c.t], cell)) return false;
    }
    return true;
  };

  const rec = (i: number): boolean => {
    if (i === T) {
      if (inRoom[b.room[at[0]]] !== 2) return false;
      if (out && out.length < limit) out.push(at.slice());
      return ++count >= limit;
    }
    const t = order[i];
    for (const cell of dom[t]) {
      const r = Math.floor(cell / n);
      const q = cell % n;
      if (rowUsed[r] || colUsed[q] || !fits(t, cell)) continue;
      at[t] = cell;
      rowUsed[r] = colUsed[q] = true;
      inRoom[b.room[cell]]++;
      const stop = rec(i + 1);
      inRoom[b.room[cell]]--;
      rowUsed[r] = colUsed[q] = false;
      at[t] = -1;
      if (stop) return true;
    }
    return false;
  };
  rec(0);
  return count;
}

/**
 * Giải như người: loại trừ dần ứng viên từng quân. Mức 1 chỉ dùng lời khai về chính mình + "hàng/cột đã có người" + "hàng/cột
 * chỉ còn một người đứng được"; mức 2 thêm lời khai về người khác, luật phòng nạn nhân, "một mình"; mức 3 thêm thử giả
 * định một bước rồi loại nếu vỡ. Trả về mức nhỏ nhất giải được, 4 nếu phải đoán.
 */
export function grade(b: Base, clues: readonly Clue[]): number {
  for (let lv = 1; lv <= 3; lv++) {
    const D = initial(b, clues);
    if (propagate(b, clues, D, lv) && D.every((d) => d.length === 1) && D.every((d, t) => d[0] === b.solution[t])) return lv;
  }
  return 4;
}

function initial(b: Base, clues: readonly Clue[]): number[][] {
  const N = b.n * b.n;
  return b.solution.map((_, t) => {
    const mine = clues.filter((c) => c.t === t && UNARY.has(c.k));
    const list: number[] = [];
    for (let c = 0; c < N; c++) if (!isBlock(b.objs[c]) && mine.every((x) => holdsUnary(b, x, c))) list.push(c);
    return list;
  });
}

function propagate(b: Base, clues: readonly Clue[], D: number[][], lv: number): boolean {
  const { n } = b;
  const T = D.length;
  const row = (c: number) => Math.floor(c / n);
  const col = (c: number) => c % n;
  const keep = (t: number, ok: (c: number) => boolean) => {
    const next = D[t].filter(ok);
    if (next.length === D[t].length) return false;
    D[t] = next;
    return true;
  };
  const pairs = clues.filter((c) => BINARY.has(c.k));
  const alone = clues.filter((c) => c.k === "alone").map((c) => c.t);

  for (let changed = true; changed; ) {
    changed = false;
    if (D.some((d) => d.length === 0)) return false;
    // Quân đã chốt ô: hàng và cột đó không ai khác đứng được.
    for (let t = 0; t < T; t++) {
      if (D[t].length !== 1) continue;
      const c = D[t][0];
      for (let u = 0; u < T; u++) if (u !== t && keep(u, (d) => row(d) !== row(c) && col(d) !== col(c))) changed = true;
    }
    if (D.some((d) => d.length === 0)) return false;
    // Hàng/cột nào cũng phải có người: chỉ một quân đứng được ở đó thì quân đó phải ở đó.
    for (let i = 0; i < n; i++) {
      for (const line of [row, col]) {
        const who = Array.from({ length: T }, (_, t) => t).filter((t) => D[t].some((c) => line(c) === i));
        if (!who.length) return false;
        if (who.length === 1 && keep(who[0], (c) => line(c) === i)) changed = true;
      }
    }
    if (changed || lv < 2) continue;

    // Quân chỉ còn ứng viên trong một hàng/cột: người khác không đứng hàng/cột đó.
    for (let t = 0; t < T; t++) {
      for (const line of [row, col]) {
        const v = line(D[t][0]);
        if (D[t].every((c) => line(c) === v)) for (let u = 0; u < T; u++) if (u !== t && keep(u, (c) => line(c) !== v)) changed = true;
      }
    }
    for (const c of pairs) {
      const u = c.a!;
      const ok = (x: number, y: number) => row(x) !== row(y) && col(x) !== col(y) && holdsBinary(b, c, x, y);
      if (keep(c.t, (x) => D[u].some((y) => ok(x, y)))) changed = true;
      if (keep(u, (y) => D[c.t].some((x) => ok(x, y)))) changed = true;
    }
    for (const t of alone) {
      if (D[t].length === 1) {
        const R = b.room[D[t][0]];
        for (let u = 0; u < T; u++) if (u !== t && keep(u, (c) => b.room[c] !== R)) changed = true;
      }
      const fixed = new Set(D.flatMap((d, u) => (u !== t && d.length === 1 ? [b.room[d[0]]] : [])));
      if (keep(t, (c) => !fixed.has(b.room[c]))) changed = true;
    }
    // Phòng nạn nhân có đúng một quân khác.
    if (
      keep(0, (v) => {
        const R = b.room[v];
        return D.some((d, u) => u > 0 && d.some((c) => b.room[c] === R && row(c) !== row(v) && col(c) !== col(v)));
      })
    )
      changed = true;
    const vr = b.room[D[0][0]];
    if (D[0].length && D[0].every((c) => b.room[c] === vr)) {
      const can = D.flatMap((d, u) => (u > 0 && d.some((c) => b.room[c] === vr) ? [u] : []));
      if (can.length === 1 && keep(can[0], (c) => b.room[c] === vr)) changed = true;
      const sure = D.flatMap((d, u) => (u > 0 && d.length === 1 && b.room[d[0]] === vr ? [u] : []));
      if (sure.length) for (let u = 1; u < T; u++) if (!sure.includes(u) && keep(u, (c) => b.room[c] !== vr)) changed = true;
    }
    if (changed || lv < 3) continue;

    // Thử giả định: đặt quân vào một ô, suy tiếp ở mức 2 mà vỡ thì ô đó sai.
    search: for (let t = 0; t < T; t++) {
      if (D[t].length < 2) continue;
      for (const c of D[t]) {
        const trial = D.map((d) => d.slice());
        trial[t] = [c];
        if (!propagate(b, clues, trial, 2)) {
          D[t] = D[t].filter((x) => x !== c);
          changed = true;
          break search;
        }
      }
    }
  }
  return !D.some((d) => d.length === 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// Sinh đề

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: readonly T[], rand: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = <T>(list: readonly T[], rand: () => number) => list[Math.floor(rand() * list.length)];
const between = ([lo, hi]: readonly [number, number], rand: () => number) => lo + Math.floor(rand() * (hi - lo + 1));

function weighted<T>(list: readonly T[], w: (x: T) => number, rand: () => number): T | undefined {
  const total = list.reduce((s, x) => s + w(x), 0);
  if (total <= 0) return undefined;
  let r = rand() * total;
  for (const x of list) {
    r -= w(x);
    if (r < 0) return x;
  }
  return list[list.length - 1];
}

const GEN: Record<Level, { rooms: [number, number]; blocks: [number, number]; seats: [number, number] }> = {
  easy: { rooms: [3, 4], blocks: [3, 5], seats: [2, 3] },
  medium: { rooms: [4, 5], blocks: [5, 7], seats: [2, 4] },
  hard: { rooms: [5, 6], blocks: [6, 9], seats: [3, 5] },
};

// Loang vùng từ k điểm gốc: mỗi bước nới một phòng (ưu tiên phòng nhỏ hơn) sang ô trống kề — phòng nào cũng liền một khối.
function growRooms(n: number, k: number, rand: () => number): number[] | null {
  const N = n * n;
  const room = new Array<number>(N).fill(-1);
  const size = new Array<number>(k).fill(0);
  shuffle(
    Array.from({ length: N }, (_, c) => c),
    rand,
  )
    .slice(0, k)
    .forEach((c, i) => {
      room[c] = i;
      size[i] = 1;
    });
  for (let left = N - k; left > 0; left--) {
    const cand: [number, number][] = [];
    for (let c = 0; c < N; c++) if (room[c] < 0) for (const d of nbrs(n, c)) if (room[d] >= 0) cand.push([c, room[d]]);
    const x = pick(cand, rand);
    const y = pick(cand, rand);
    const [c, r] = size[x[1]] <= size[y[1]] ? x : y;
    room[c] = r;
    size[r]++;
  }
  if (size.some((s) => s < 2)) return null;
  // Đánh số lại theo thứ tự đọc (trái → phải, trên → dưới) cho dễ dò.
  const remap = new Map<number, number>();
  return room.map((r) => {
    if (!remap.has(r)) remap.set(r, remap.size);
    return remap.get(r)!;
  });
}

function furnish(n: number, room: number[], types: (typeof ROOM_TYPES)[number][], level: Level, rand: () => number) {
  const N = n * n;
  const objs = new Array<ObjKind | null>(N).fill(null);
  const want = { block: between(GEN[level].blocks, rand), seat: between(GEN[level].seats, rand) };
  const free = (cells: number[]) => cells.filter((c) => !isBlock(objs[c])).length;
  const rowCells = (r: number) => Array.from({ length: n }, (_, q) => r * n + q);
  const colCells = (q: number) => Array.from({ length: n }, (_, r) => r * n + q);
  const roomCells = (R: number) => room.flatMap((x, c) => (x === R ? [c] : []));
  let block = 0;
  let seat = 0;
  for (let tries = 0; tries < 300 && (block < want.block || seat < want.seat); tries++) {
    const c = Math.floor(rand() * N);
    if (objs[c]) continue;
    const asBlock = block < want.block && (seat >= want.seat || rand() < 0.6);
    const kinds = types[room[c]].objs.filter((k) => isBlock(k) === asBlock);
    if (!kinds.length) continue;
    const k = pick(kinds, rand);
    if (asBlock) {
      objs[c] = k;
      const r = Math.floor(c / n);
      const q = c % n;
      if (free(rowCells(r)) < 2 || free(colCells(q)) < 2 || free(roomCells(room[c])) < 1) {
        objs[c] = null;
        continue;
      }
      block++;
    } else {
      objs[c] = k;
      seat++;
    }
  }
  return objs;
}

// Xếp N quân mỗi hàng/cột một quân, tránh vật cản; phòng của nạn nhân (quân 0) có đúng một quân khác — đó là thủ phạm.
function placeTokens(n: number, room: number[], objs: (ObjKind | null)[], rand: () => number): number[] | null {
  for (let tries = 0; tries < 40; tries++) {
    const cols = new Array<number>(n).fill(-1);
    const used = new Array<boolean>(n).fill(false);
    const rec = (r: number): boolean => {
      if (r === n) return true;
      for (const q of shuffle(
        Array.from({ length: n }, (_, i) => i),
        rand,
      )) {
        if (used[q] || isBlock(objs[r * n + q])) continue;
        used[q] = true;
        cols[r] = q;
        if (rec(r + 1)) return true;
        used[q] = false;
      }
      return false;
    };
    if (!rec(0)) return null;
    const rows = shuffle(
      Array.from({ length: n }, (_, i) => i),
      rand,
    );
    const sol = rows.map((r) => r * n + cols[r]);
    const R = room[sol[0]];
    if (sol.filter((c) => room[c] === R).length === 2) return sol;
  }
  return null;
}

function makeBase(n: number, level: Level, rand: () => number): Base | null {
  const k = between(GEN[level].rooms, rand);
  const room = growRooms(n, k, rand);
  if (!room) return null;
  const types = shuffle(ROOM_TYPES, rand).slice(0, k);
  const objs = furnish(n, room, types, level, rand);
  const solution = placeTokens(n, room, objs, rand);
  if (!solution) return null;
  return { n, room, rooms: types.map(({ name, out }) => (out ? { name, out } : { name })), objs, solution };
}

const sameClue = (x: Clue, y: Clue) => x.k === y.k && x.t === y.t && x.a === y.a && x.o === y.o;

// Mỗi quân một lời khai ngẫu nhiên theo trọng số của mức; còn nhiều lời giải thì đổi lời khai của quân còn mơ hồ (giữ
// nếu không làm số lời giải tăng), cuối cùng mới thêm lời khai phụ.
function pickClues(b: Base, level: Level, culprit: number, rand: () => number): Clue[] | null {
  const T = b.solution.length;
  const cands = Array.from({ length: T }, (_, t) => trueClues(b, t, culprit));
  const w = WEIGHTS[level];
  const draw = (t: number, not: readonly Clue[] = []) => weighted(cands[t].filter((c) => !not.some((x) => sameClue(x, c))), (c) => w[c.k] ?? 0, rand);
  const first = Array.from({ length: T }, (_, t) => draw(t));
  if (first.some((c) => !c)) return null;
  let clues = first as Clue[];
  const LIMIT = 24;
  let sols: number[][] = [];
  let count = countSolutions(b, clues, LIMIT, sols);
  const vague = () => Array.from({ length: T }, (_, t) => t).filter((t) => sols.some((s) => s[t] !== sols[0][t]));
  for (let it = 0; it < 120 && count > 1; it++) {
    const t = pick(vague(), rand);
    const c = draw(t, clues);
    if (!c) continue;
    const next = clues.map((x) => (x.t === t ? c : x));
    const s2: number[][] = [];
    const c2 = countSolutions(b, next, LIMIT, s2);
    if (c2 <= count) {
      clues = next;
      count = c2;
      sols = s2;
    }
  }
  for (let extra = 0; extra < 3 && count > 1; extra++) {
    const t = pick(vague(), rand);
    const c = draw(t, clues);
    if (!c) continue;
    clues = [...clues, c];
    sols = [];
    count = countSolutions(b, clues, LIMIT, sols);
  }
  return count === 1 ? clues : null;
}

const TARGET: Record<Level, number> = { easy: 1, medium: 2, hard: 3 };

export function makePuzzle(seed: number, level: Level, theme: Theme): Puzzle {
  const rand = rng(seed);
  const n = SIZE[level];
  const target = TARGET[level];
  let best: { b: Base; clues: Clue[]; grade: number } | null = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    // Đủ số lần thử mà chưa đúng mức thì lấy đề gần mức nhất đã có.
    if (best && attempt >= 30) break;
    const b = makeBase(n, level, rand);
    if (!b) continue;
    const culprit = b.solution.findIndex((c, t) => t > 0 && b.room[c] === b.room[b.solution[0]]);
    const clues = pickClues(b, level, culprit, rand);
    if (!clues) continue;
    const g = grade(b, clues);
    if (g > 3) continue;
    if (!best || Math.abs(g - target) < Math.abs(best.grade - target)) best = { b, clues, grade: g };
    if (g === target) break;
  }
  if (!best) throw new Error(`Không sinh được đề (seed ${seed}, ${level})`);
  const { b, clues } = best;
  const culprit = b.solution.findIndex((c, t) => t > 0 && b.room[c] === b.room[b.solution[0]]);
  const suspects = shuffle(SUSPECTS, rand).slice(0, n - 1);
  const victim: Token = theme === "murder" ? { name: pick(VICTIMS, rand), emoji: VICTIM_EMOJI } : pick(SNACKS, rand);
  const { title, intro } = story(theme, victim.name, rand);
  // Lời khai xếp theo người nói (hiện trường trước), giữ thứ tự sinh trong từng người.
  const ordered = clues.map((c, i) => [c, i] as const).sort((x, y) => x[0].t - y[0].t || x[1] - y[1]).map(([c]) => c);
  return { ...b, level, theme, tokens: [victim, ...suspects], clues: ordered, culprit, title, intro, grade: best.grade };
}

// ---------------------------------------------------------------------------------------------------------------------
// Lời văn

const objName = (o?: ObjKind) => (o ? OBJECTS[o].name : "");

export function clueText(p: Pick<Puzzle, "tokens" | "rooms" | "theme" | "n">, c: Clue): string {
  const scene = c.t === 0;
  const S = scene ? p.tokens[0].name : "Tôi";
  const U = c.a != null ? p.tokens[c.a]?.name : "";
  const person = !(scene && p.theme === "snack");
  switch (c.k) {
    case "room":
      return `${S} ở ${roomAt(p.rooms[c.a!])}.`;
    case "notRoom":
      return `${S} không ở ${roomAt(p.rooms[c.a!])}.`;
    case "on":
      return `${S} ${person ? OBJECTS[c.o!].seat : "nằm trên"} ${objName(c.o)}.`;
    case "near":
      return `${S} ở ngay cạnh ${objName(c.o)}.`;
    case "top":
      return `${S} ở hàng trên cùng.`;
    case "bottom":
      return `${S} ở hàng dưới cùng.`;
    case "left":
      return `${S} ở cột ngoài cùng bên trái.`;
    case "right":
      return `${S} ở cột ngoài cùng bên phải.`;
    case "corner":
      return `${S} ở một góc của bản đồ.`;
    case "row":
      return `${S} ở hàng ${c.a! + 1}.`;
    case "col":
      return `${S} ở cột ${c.a! + 1}.`;
    case "same":
      return `${S} ở cùng phòng với ${U}.`;
    case "apart":
      return `${S} không ở cùng phòng với ${U}.`;
    case "alone":
      return `${S} ở một mình trong phòng, không có ai khác.`;
    case "above":
      return `${S} ở hàng phía trên ${U}.`;
    case "below":
      return `${S} ở hàng phía dưới ${U}.`;
    case "leftOf":
      return `${S} ở cột bên trái ${U}.`;
    case "rightOf":
      return `${S} ở cột bên phải ${U}.`;
  }
}

/** Ô có thể đặt quân: không phải vật cản. */
export const standable = (p: Pick<Puzzle, "objs">, cell: number) => !isBlock(p.objs[cell]);

// ---------------------------------------------------------------------------------------------------------------------
// Ván đấu: nhật ký nước đi do chủ phòng ghi, mọi máy dựng lại trạng thái từ nhật ký.

/** "p": đặt quân `token` vào ô (cùng phá án). "a": buộc tội nghi phạm (cùng phá án). "s": nộp cả bàn (đối kháng). */
export type Move = ["p", number, number] | ["a", number] | ["s", number[]];
export type Entry = [move: Move, player: number];

export type Board = {
  log: Entry[];
  seen: number[];
  time?: number;
  fin?: (number | null)[];
};

export const emptyBoard = (players: number): Board => ({ log: [], seen: new Array<number>(players).fill(0) });

export type GdState = {
  /** Cùng phá án: ô đã đặt đúng của từng quân (−1 nếu chưa) và người đặt. */
  placed: number[];
  owner: number[];
  right: number[];
  wrong: number[];
  score: number[];
  /** Cùng phá án: ai đã dùng lượt buộc tội, ai buộc tội đúng đầu tiên (−1 nếu chưa). */
  accused: boolean[];
  accuser: number;
  open: number;
  finished: number[];
  over: boolean;
  winners: number[];
};

const int = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) < hi;

export function isMove(p: Pick<Puzzle, "n">, x: unknown): x is Move {
  if (!Array.isArray(x)) return false;
  const N = p.n * p.n;
  if (x[0] === "p") return x.length === 3 && int(x[1], 0, p.n) && int(x[2], 0, N);
  if (x[0] === "a") return x.length === 2 && int(x[1], 1, p.n);
  if (x[0] === "s") return x.length === 2 && Array.isArray(x[1]) && x[1].length === p.n && x[1].every((c) => int(c, 0, N));
  return false;
}

function fresh(p: Puzzle, players: number): GdState {
  return {
    placed: new Array<number>(p.n).fill(-1),
    owner: new Array<number>(p.n).fill(-1),
    right: new Array<number>(players).fill(0),
    wrong: new Array<number>(players).fill(0),
    score: new Array<number>(players).fill(0),
    accused: new Array<boolean>(players).fill(false),
    accuser: -1,
    open: p.n,
    finished: [],
    over: false,
    winners: [],
  };
}

export const solvedBy = (p: Puzzle, cells: readonly number[]) => cells.length === p.n && cells.every((c, t) => c === p.solution[t]);

function apply(s: GdState, p: Puzzle, mode: Mode, mv: Move, k: number): boolean {
  if (s.over || k < 0 || k >= s.right.length) return false;
  if (mv[0] === "p") {
    const [, t, cell] = mv;
    if (mode !== "coop" || s.placed[t] >= 0 || !standable(p, cell) || s.placed.includes(cell)) return false;
    if (cell !== p.solution[t]) {
      s.wrong[k]++;
      s.score[k]--;
      return true;
    }
    s.placed[t] = cell;
    s.owner[t] = k;
    s.right[k]++;
    s.score[k]++;
    s.open--;
    if (s.open === 0) {
      s.over = true;
      const top = Math.max(...s.score);
      s.winners = s.score.flatMap((v, i) => (v === top ? [i] : []));
    }
    return true;
  }
  if (mv[0] === "a") {
    if (mode !== "coop" || s.accused[k] || s.accuser >= 0) return false;
    s.accused[k] = true;
    if (mv[1] === p.culprit) {
      s.accuser = k;
      s.score[k] += 2;
    } else {
      s.wrong[k]++;
      s.score[k] -= 2;
    }
    return true;
  }
  if (mode !== "race" || s.finished.includes(k)) return false;
  if (!solvedBy(p, mv[1])) {
    s.wrong[k]++;
    return true;
  }
  s.right[k] = p.n;
  s.finished.push(k);
  s.winners = [s.finished[0]];
  s.over = s.finished.length === s.right.length;
  return true;
}

export function replay(p: Puzzle, mode: Mode, players: number, log: readonly unknown[]): GdState {
  const s = fresh(p, players);
  for (const e of log) if (Array.isArray(e) && isMove(p, e[0]) && Number.isInteger(e[1])) apply(s, p, mode, e[0], e[1]);
  return s;
}

export function judge(p: Puzzle, mode: Mode, moves: readonly (readonly unknown[])[], prev: Board): Board | null {
  const players = moves.length;
  const s = replay(p, mode, players, prev.log);
  const log = prev.log.slice();
  const seen = Array.from({ length: players }, (_, k) => prev.seen[k] ?? 0);
  let dirty = false;
  for (let k = 0; k < players && !s.over; k++) {
    const list = moves[k];
    for (; seen[k] < list.length && !s.over; seen[k]++) {
      dirty = true;
      const mv = list[seen[k]];
      if (isMove(p, mv) && apply(s, p, mode, mv, k)) log.push([mv, k]);
    }
  }
  return dirty ? { ...prev, log, seen } : null;
}

export function stamp(b: Board, s: GdState, elapsed: number): Board | null {
  const fin = Array.from({ length: s.right.length }, (_, k) => b.fin?.[k] ?? null);
  let dirty = false;
  for (const k of s.finished) {
    if (fin[k] != null) continue;
    fin[k] = elapsed;
    dirty = true;
  }
  const time = b.time ?? (s.over ? elapsed : undefined);
  if (time !== b.time) dirty = true;
  if (!dirty) return null;
  return { ...b, ...(s.finished.length ? { fin } : {}), ...(time != null ? { time } : {}) };
}

export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
