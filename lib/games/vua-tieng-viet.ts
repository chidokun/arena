// Vua Tiếng Việt: đố vui tiếng Việt 1–8 người, năm vòng Ghép từ → Phản xạ → Giải nghĩa → Xâu chuỗi → Soán ngôi. Cả phòng nhận cùng
// câu hỏi, cùng lúc, cùng giới hạn giờ; không loại ai giữa chừng, không trừ điểm câu sai. Thiết kế gốc lấy cảm hứng từ thể
// thức gameshow cùng tên, không phải luật chính thức của chương trình.
import { CLUES, GRIDS, LONGS, MCS, ORDERS, SCRAMBLES } from "./vua-tieng-viet-bank.ts";

export type Pack = "quick" | "standard" | "long" | "custom";
export type Level = "easy" | "medium" | "hard" | "mixed";
export type Topic = "all" | "spell" | "vocab" | "idiom" | "lit";
export type Counts = [number, number, number, number, number];
export type VtOptions = { pack: Pack; counts: Counts; level: Level; topic: Topic; explain: boolean };

export const MAX_PLAYERS = 8;
export const DEFAULT_SEATS = 4;
export const COUNTDOWN_MS = 3000;

export const PACKS: Record<Exclude<Pack, "custom">, { name: string; emoji: string; counts: Counts; minutes: string }> & Record<"custom", { name: string; emoji: string; minutes: string }> = {
  quick: { name: "Nhanh", emoji: "⚡", counts: [3, 3, 2, 1, 1], minutes: "~4–5 phút" },
  standard: { name: "Tiêu chuẩn", emoji: "👑", counts: [6, 6, 4, 3, 2], minutes: "~8–10 phút" },
  long: { name: "Dài", emoji: "🏯", counts: [10, 10, 5, 5, 3], minutes: "~13–15 phút" },
  custom: { name: "Tùy chỉnh", emoji: "🛠️", minutes: "tùy số câu" },
};
export const PACK_KEYS: readonly Pack[] = ["quick", "standard", "long", "custom"];
// Mỗi vòng tối thiểu 1 câu; tối đa theo độ lớn ngân hàng để vẫn còn chỗ ưu tiên câu chưa chơi.
export const COUNT_MAX: Counts = [12, 12, 8, 8, 4];

export const LEVELS: Record<Level, { name: string; emoji: string }> = {
  easy: { name: "Dễ", emoji: "🌱" },
  medium: { name: "Trung bình", emoji: "🌿" },
  hard: { name: "Khó", emoji: "🔥" },
  mixed: { name: "Hỗn hợp", emoji: "🎲" },
};
export const LEVEL_KEYS: readonly Level[] = ["easy", "medium", "hard", "mixed"];

export const TOPICS: Record<Topic, { name: string; emoji: string }> = {
  all: { name: "Tổng hợp", emoji: "📚" },
  spell: { name: "Chính tả", emoji: "✍️" },
  vocab: { name: "Từ vựng", emoji: "🔤" },
  idiom: { name: "Thành ngữ – tục ngữ", emoji: "🎋" },
  lit: { name: "Văn học phổ thông", emoji: "📖" },
};
export const TOPIC_KEYS: readonly Topic[] = ["all", "spell", "vocab", "idiom", "lit"];

export const DEFAULT_OPTIONS: VtOptions = { pack: "standard", counts: [6, 6, 4, 3, 2], level: "mixed", topic: "all", explain: true };

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  if (v === null || v === undefined || v === "") return dflt;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

export function normOptions(o: unknown): VtOptions {
  const x = (o ?? {}) as Partial<VtOptions>;
  const pack = PACK_KEYS.includes(x.pack as Pack) ? (x.pack as Pack) : DEFAULT_OPTIONS.pack;
  // Cấu hình cũ (trước khi có vòng Ghép từ) chỉ có 4 số: thêm số câu mặc định của Ghép từ vào đầu.
  const given: unknown[] = Array.isArray(x.counts) ? x.counts : [];
  const raw = given.length === 4 ? [DEFAULT_OPTIONS.counts[0], ...given] : given;
  const counts =
    pack === "custom"
      ? (COUNT_MAX.map((max, r) => clampInt(raw[r], 1, max, DEFAULT_OPTIONS.counts[r])) as Counts)
      : ([...PACKS[pack].counts] as Counts);
  return {
    pack,
    counts,
    level: LEVEL_KEYS.includes(x.level as Level) ? (x.level as Level) : DEFAULT_OPTIONS.level,
    topic: TOPIC_KEYS.includes(x.topic as Topic) ? (x.topic as Topic) : DEFAULT_OPTIONS.topic,
    explain: x.explain !== false,
  };
}

// ——— Năm vòng ———

export type Kind = "scramble" | "mc" | "clue" | "order" | "grid";

// `limits`: hạn trả lời (ms) theo cấp độ câu 1 dễ … 4 rất khó.
export const ROUNDS = [
  { name: "Ghép từ", emoji: "🧩", limits: [15000, 15000, 30000, 60000], rule: "Đúng được 100 điểm, cộng tới 50 điểm thưởng tốc độ. Dùng hết mọi chữ cái, giữ nguyên dấu.", about: "Xếp các chữ cái bị xáo trộn thành từ, cụm từ có nghĩa rồi xác nhận. Độ khó tăng dần." },
  { name: "Phản xạ", emoji: "⚡", limits: [15000, 15000, 30000, 30000], rule: "Chọn đáp án đúng — đúng được 100 điểm, cộng tới 50 điểm thưởng tốc độ.", about: "Trắc nghiệm chính tả, từ vựng, thành ngữ, văn học. Bấm là chốt, không sửa." },
  { name: "Giải nghĩa", emoji: "🔍", limits: [20000, 20000, 20000, 20000], rule: "Gợi ý mở dần ở giây 0 – 7 – 14. Đúng trước gợi ý 2: 150 · trước gợi ý 3: 110 · sau đó: 70.", about: "Gõ từ (có dấu) khớp với lời giải nghĩa. Chỉ được gửi một lần!" },
  { name: "Xâu chuỗi", emoji: "🔗", limits: [25000, 25000, 45000, 45000], rule: "Đúng được 200 điểm, cộng tới 50 điểm thưởng tốc độ.", about: "Sắp các thẻ tiếng thành câu tục ngữ, ca dao hoàn chỉnh rồi xác nhận." },
  { name: "Soán ngôi", emoji: "👑", limits: [45000, 45000, 60000, 60000], rule: "Giải mã câu dài: 300 + tới 100 điểm tốc độ. Săn từ: 75 điểm mỗi từ (tối đa 4) + tới 100 điểm nếu đủ 4 từ sớm.", about: "Vòng cuối khó hơn, điểm cao hơn — cơ hội lật ngược thế cờ!" },
] as const;
/** Chỉ số vòng Soán ngôi (vòng cuối) và của câu hỏi phụ (sau vòng cuối). */
export const CROWN = 4;
export const TB = 5;
export const TIEBREAK = { name: "Câu hỏi phụ", emoji: "⚔️", limit: 15000, rule: "Ai đúng thắng; cùng đúng thì ai nhanh hơn thắng." };
export const TIEBREAK_MAX = 3;
/** Thời lượng màn giới thiệu vòng `r` (ms): vòng 1 ngắn hơn vì vừa đếm ngược xong; các vòng sau có thêm bảng xếp hạng để đọc. */
export const introMs = (r: number) => (r === 0 ? 5000 : r === TB ? 6000 : 7500);
export const HINT_AT = [0, 7000, 14000] as const;
export const GRID_GOAL = 4;
export const GRID_WORD = 75;
export const GRID_LIMIT = 35000;

// ——— Kiểu dữ liệu ngân hàng ———

type Base = { id: string; lv: 1 | 2 | 3 | 4; tp: Exclude<Topic, "all">; fam?: string };
/** Ghép từ: `lv` (1 dễ – 4 rất khó) tính theo số chữ cái nên ngân hàng không ghi. */
export type Scramble = Base & { a: string; acc?: string[]; why: string };
export type ScrambleSrc = Omit<Scramble, "lv">;
export type Mc = Base & { q: string; o: [string, string, string, string]; why: string };
export type Clue = Base & { h: [string, string, string]; a: string; acc?: string[]; why: string };
export type Order = Base & { text: string; alt?: string[]; why: string };
export type Grid = Base & { theme: string; cells: string[]; words: string[] };
export type Item = ({ kind: "scramble" } & Scramble) | ({ kind: "mc" } & Mc) | ({ kind: "clue" } & Clue) | ({ kind: "order" } & Order) | ({ kind: "grid" } & Grid);

const tag = <K extends Kind, T>(kind: K, list: T[]) => list.map((x) => ({ ...x, kind }));
/** Chữ cái của một chuỗi (NFC, viết thường, bỏ khoảng trắng): mỗi chữ có dấu là một chữ. */
export const lettersOf = (s: string) => [...s.normalize("NFC").toLowerCase().replace(/[\s\u00a0]+/g, "")];

/** Cấp độ Ghép từ theo số chữ cái: 4–6 dễ, 7–9 trung bình, 10–12 khó, trên 12 rất khó. */
export const scrambleTier = (a: string): Scramble["lv"] => {
  const n = lettersOf(a).length;
  return n <= 6 ? 1 : n <= 9 ? 2 : n <= 12 ? 3 : 4;
};
export const TIER_NAMES = ["", "Dễ", "Trung bình", "Khó", "Rất khó"] as const;

export const BANK = {
  r0: tag("scramble", SCRAMBLES.map((x): Scramble => ({ ...x, lv: scrambleTier(x.a) }))),
  r1: tag("mc", MCS),
  r2: tag("clue", CLUES),
  r3: tag("order", ORDERS),
  r4a: tag("order", LONGS),
  r4b: tag("grid", GRIDS),
};
const BY_ID = new Map<string, Item>(Object.values(BANK).flatMap((list) => list.map((x) => [x.id, x as Item] as const)));
export const itemOf = (id: string) => BY_ID.get(id);

// ——— Chuẩn hoá & so khớp ———

/** NFC, bỏ khoảng trắng thừa, không phân biệt hoa thường; KHÔNG bỏ dấu (đổi dấu là đổi từ). */
export const norm = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[\s ]+/g, " ")
    .trim()
    .toLowerCase();

const words = (s: string) =>
  norm(s)
    .replace(/[.,;:!?“”"…]/g, " ")
    .split(" ")
    .filter(Boolean);

/** Thẻ của câu xâu chuỗi, theo đúng thứ tự trong câu chuẩn. Tiếng đầu câu viết thường để khỏi lộ thẻ mở đầu; tên riêng giữ hoa. */
export function tokensOf(o: Order) {
  const raw = o.text.replace(/[.,;:!?“”"…]/g, " ").split(/\s+/).filter(Boolean);
  return raw.map((t, i) => (i === 0 ? t.charAt(0).toLowerCase() + t.slice(1) : t).normalize("NFC"));
}

export const orderAnswers = (o: Order) => [o.text, ...(o.alt ?? [])].map((s) => words(s).join(" "));

/** Đáp án Ghép từ dạng chuỗi chữ cái liền nhau (khoảng trắng không tính khi chấm). */
export const scrambleAnswers = (s: Scramble) => [s.a, ...(s.acc ?? [])].map((x) => lettersOf(x).join(""));

/** Chuỗi chữ người chơi xếp: chỉ số thẻ, -1 là khoảng trắng chèn cho dễ đọc. Trả về null nếu không dùng đúng mỗi thẻ một lần. */
export function scrambleSpell(s: Scramble, a: unknown) {
  const letters = lettersOf(s.a);
  if (!Array.isArray(a)) return null;
  const used = a.filter((i) => i !== -1);
  const full = used.length === letters.length && new Set(used).size === used.length && used.every((i) => Number.isInteger(i) && i >= 0 && i < letters.length);
  return full ? used.map((i) => letters[i]).join("") : null;
}

export const clueAnswers = (c: Clue) => [c.a, ...(c.acc ?? [])].map((s) => norm(s));

/** So câu trả lời gõ tay: chuẩn hoá rồi bỏ dấu câu ở cuối (người chơi hay gõ thêm dấu chấm). */
export const clueMatch = (c: Clue, typed: string) => clueAnswers(c).includes(norm(typed).replace(/[.!?…]+$/, "").trim());

export const adjacent = (a: number, b: number) => (Math.abs(a - b) === 4 || (Math.abs(a - b) === 1 && Math.floor(a / 4) === Math.floor(b / 4)));

/** Đường nối hợp lệ: ít nhất 2 ô, ô sau kề ô trước theo hàng ngang / dọc, không dùng lại ô. */
export function validPath(p: unknown): p is number[] {
  if (!Array.isArray(p) || p.length < 2 || p.length > 16) return false;
  if (!p.every((c) => Number.isInteger(c) && c >= 0 && c < 16)) return false;
  if (new Set(p).size !== p.length) return false;
  return p.every((c, i) => i === 0 || adjacent(p[i - 1], c));
}

export const pathWord = (g: Grid, p: readonly number[]) => norm(p.map((c) => g.cells[c]).join(" "));

export const gridHas = (g: Grid, word: string) => g.words.some((w) => norm(w) === word);

/** Tìm một đường nối cho từ `word` (để kiểm tra lưới và tô lời giải). */
export function findPath(g: Grid, word: string): number[] | null {
  const parts = norm(word).split(" ");
  const walk = (path: number[]): number[] | null => {
    if (path.length === parts.length) return path;
    const last = path[path.length - 1];
    for (let c = 0; c < 16; c++)
      if (!path.includes(c) && adjacent(last, c) && norm(g.cells[c]) === parts[path.length]) {
        const r = walk([...path, c]);
        if (r) return r;
      }
    return null;
  };
  for (let c = 0; c < 16; c++)
    if (norm(g.cells[c]) === parts[0]) {
      const r = walk([c]);
      if (r) return r;
    }
  return null;
}

// ——— Xáo tất định theo seed (cả phòng thấy cùng một thứ tự) ———

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(list: T[], rand: () => number) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Thứ tự bày 4 phương án trắc nghiệm (chỉ số trong `o`; 0 là đáp án đúng). */
export const optionOrder = (seed: number, id: string) => shuffle([0, 1, 2, 3], rng(seed ^ hash(id)));

/** Thứ tự bày thẻ xâu chuỗi: không bao giờ trùng sẵn một đáp án đúng. */
export function tokenOrder(seed: number, o: Order) {
  const tokens = tokensOf(o);
  const ok = new Set(orderAnswers(o));
  const rand = rng(seed ^ hash(o.id));
  let order = tokens.map((_, i) => i);
  for (let tries = 0; tries < 20; tries++) {
    order = shuffle(order, rand);
    if (!ok.has(norm(order.map((i) => tokens[i]).join(" ")))) return order;
  }
  // Câu ngắn xui xẻo: đảo vòng tới khi khác đáp án.
  for (let k = 1; k < order.length; k++) {
    const r = [...order.slice(k), ...order.slice(0, k)];
    if (!ok.has(norm(r.map((i) => tokens[i]).join(" ")))) return r;
  }
  return order;
}

/** Thứ tự bày thẻ chữ Ghép từ: không bao giờ đọc sẵn ra một đáp án đúng. */
export function letterOrder(seed: number, s: Scramble) {
  const letters = lettersOf(s.a);
  const ok = new Set(scrambleAnswers(s));
  const rand = rng(seed ^ hash(s.id));
  let order = letters.map((_, i) => i);
  for (let tries = 0; tries < 20; tries++) {
    order = shuffle(order, rand);
    if (!ok.has(order.map((i) => letters[i]).join(""))) return order;
  }
  for (let k = 1; k < order.length; k++) {
    const r = [...order.slice(k), ...order.slice(0, k)];
    if (!ok.has(r.map((i) => letters[i]).join(""))) return r;
  }
  return order;
}

// ——— Chọn đề ———

const LV: Record<Level, number> = { easy: 1, medium: 2, hard: 3, mixed: 0 };

/**
 * Cấp độ từng câu Ghép từ, tăng dần qua vòng: câu cuối rất khó (vòng từ 4 câu), các câu trước chia đều dễ → trung bình → khó.
 * 6 câu: Dễ, Dễ, TB, TB, Khó, Rất khó. Độ khó ván "Dễ" lùi một bậc, "Khó" tiến một bậc.
 */
export function scrambleTiers(n: number, level: Level): Scramble["lv"][] {
  const head = n >= 4 ? n - 1 : n;
  const tiers = Array.from({ length: head }, (_, i) => 1 + Math.floor((3 * i) / head));
  if (n >= 4) tiers.push(4);
  const shift = level === "easy" ? -1 : level === "hard" ? 1 : 0;
  return tiers.map((t) => Math.min(4, Math.max(1, t + shift)) as Scramble["lv"]);
}

type Pick = { level: Level; topic: Topic; used: ReadonlySet<string>; fams: Set<string>; taken: Set<string>; rand: () => number };

/** Chọn `n` câu: ưu tiên đúng chủ đề, rồi câu phòng chưa chơi, rồi gần độ khó đã chọn; không lấy hai câu cùng nhóm. */
function pickFrom<T extends Base>(pool: readonly T[], n: number, p: Pick, prefer?: (x: T) => number): T[] {
  const scored = pool
    .filter((x) => !p.taken.has(x.id))
    .map((x) => ({
      x,
      k: [
        p.topic === "all" || x.tp === p.topic ? 0 : 1,
        p.used.has(x.id) ? 1 : 0,
        prefer ? prefer(x) : p.level === "mixed" ? 0 : Math.abs(x.lv - LV[p.level]),
        p.rand(),
      ],
    }))
    .sort((a, b) => {
      for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i];
      return 0;
    });
  const out: T[] = [];
  for (const { x } of scored) {
    if (out.length >= n) break;
    if (x.fam && p.fams.has(x.fam)) continue;
    out.push(x);
    p.taken.add(x.id);
    if (x.fam) p.fams.add(x.fam);
  }
  return out;
}

/** Thử thách vòng 4 lần lượt: Giải mã câu khó, Săn từ, Giải mã… (gói chỉ một thử thách thì là Săn từ). */
export const crownKinds = (n: number): ("a" | "b")[] => (n === 1 ? ["b"] : Array.from({ length: n }, (_, i) => (i % 2 ? "b" : "a")));

export function makePlan(o: VtOptions, used: readonly string[], rand: () => number) {
  const p: Pick = { level: o.level, topic: o.topic, used: new Set(used), fams: new Set(), taken: new Set(), rand };
  const [n0, n1, n2, n3, n4] = o.counts;
  const kinds = crownKinds(n4);
  // Ghép từ: mỗi câu lấy đúng cấp độ của nó; hết câu cấp đó thì lấy cấp gần nhất.
  const r0 = scrambleTiers(n0, o.level).flatMap((tier) => {
    for (let d = 0; d < 4; d++) {
      const got = pickFrom(BANK.r0.filter((x) => Math.abs(x.lv - tier) <= d), 1, p);
      if (got.length) return got;
    }
    return [];
  });
  const r1 = pickFrom(BANK.r1, n1, p);
  const r2 = pickFrom(BANK.r2, n2, p);
  const r3 = pickFrom(BANK.r3, n3, p);
  // Vòng cuối luôn nghiêng về khó: chọn "Dễ" thì lấy trung bình, còn lại lấy khó.
  const crownLv = o.level === "easy" ? 2 : 3;
  const a = pickFrom(BANK.r4a, kinds.filter((k) => k === "a").length, p, (x) => Math.abs(x.lv - crownLv));
  const b = pickFrom(BANK.r4b, kinds.filter((k) => k === "b").length, p, (x) => Math.abs(x.lv - crownLv));
  const r4 = kinds.map((k) => (k === "a" ? a.shift()! : b.shift()!));
  // Câu hỏi phụ: trắc nghiệm khó, không trùng câu đã có trong ván.
  const tb = pickFrom(BANK.r1, TIEBREAK_MAX, { ...p, topic: "all" }, (x) => 3 - x.lv);
  return { qs: [...r0, ...r1, ...r2, ...r3, ...r4].map((x) => x.id), tbq: tb.map((x) => x.id) };
}

// ——— Vị trí câu trong ván ———

export const totalOf = (c: Counts) => c.reduce((s, x) => s + x, 0);

/** Vòng (0–4) của câu thứ `i`; câu hỏi phụ (sau câu cuối) là `TB`. */
export function roundOf(c: Counts, i: number) {
  let acc = 0;
  for (let r = 0; r < TB; r++) {
    acc += c[r];
    if (i < acc) return r;
  }
  return TB;
}

/** Thứ tự của câu `i` trong vòng của nó (0-based) và số câu của vòng. */
export function placeOf(c: Counts, i: number) {
  const r = roundOf(c, i);
  if (r === TB) return { r, k: i - totalOf(c), n: TIEBREAK_MAX };
  const start = c.slice(0, r).reduce((s, x) => s + x, 0);
  return { r, k: i - start, n: c[r] };
}

export const firstOfRound = (c: Counts, i: number) => {
  const { r, k } = placeOf(c, i);
  return r < TB ? k === 0 : i === totalOf(c);
};

/** Hạn trả lời (ms) của câu `item` ở vòng `r`: tuỳ vòng và cấp độ câu (Soán ngôi: `limits` là của Giải mã, Săn từ luôn `GRID_LIMIT`). */
export function limitOf(r: number, item: Item) {
  if (r === TB) return TIEBREAK.limit;
  if (item.kind === "grid") return GRID_LIMIT;
  return ROUNDS[r].limits[item.lv - 1];
}

/** Các cấp độ có câu ở vòng `r` (Ghép từ có 4 cấp; Giải mã câu dài chỉ có trung bình, khó). */
const levelsOf = (r: number): number[] => (r === 0 ? [1, 2, 3, 4] : r === CROWN ? [2, 3] : [1, 2, 3]);

/** Hạn ngắn nhất – dài nhất (giây) của vòng `r`. */
export function limitSpan(r: number): [number, number] {
  const all = [...levelsOf(r).map((lv) => ROUNDS[r].limits[lv - 1]), ...(r === CROWN ? [GRID_LIMIT] : [])].map((x) => x / 1000);
  return [Math.min(...all), Math.max(...all)];
}

/** Hạn trả lời theo cấp độ của vòng `r`, vd. "Dễ, Trung bình: 15 giây · Khó: 30 giây · Rất khó: 60 giây". */
export function limitNote(r: number) {
  const groups: { names: string[]; s: number }[] = [];
  for (const lv of levelsOf(r)) {
    const s = ROUNDS[r].limits[lv - 1] / 1000;
    const last = groups.at(-1);
    if (last?.s === s) last.names.push(TIER_NAMES[lv]);
    else groups.push({ names: [TIER_NAMES[lv]], s });
  }
  const text = groups.length === 1 ? `${groups[0].s} giây mỗi câu` : groups.map((g) => `${g.names.join(", ")}: ${g.s} giây`).join(" · ");
  return r === CROWN ? `Giải mã — ${text} · Săn từ: ${GRID_LIMIT / 1000} giây` : text;
}

// ——— Chấm điểm ———

export type Find = { p: number[]; t: number };
/** Câu trả lời đã chốt: `a` là chỉ số phương án / chuỗi gõ / thứ tự thẻ (Ghép từ: -1 là khoảng trắng); `t` là số ms đã trôi qua khi chốt; `f` là các từ tìm trong lưới. */
export type Sub = { a?: number | string | number[]; t: number; f?: Find[] };
export type Mark = { ok: boolean; pts: number; hits: number; t: number; words?: string[] };

export const BLANK: Mark = { ok: false, pts: 0, hits: 0, t: 0 };

const left = (limit: number, t: number) => Math.max(0, limit - Math.max(0, t));

/** Các từ hợp lệ, khác nhau, trong lưới — theo thứ tự tìm được. */
export function gridFinds(g: Grid, finds: readonly Find[] | undefined) {
  const out: { w: string; t: number; p: number[] }[] = [];
  for (const f of [...(finds ?? [])].sort((a, b) => a.t - b.t)) {
    if (!validPath(f.p)) continue;
    const w = pathWord(g, f.p);
    if (!gridHas(g, w) || out.some((x) => x.w === w)) continue;
    out.push({ w, t: f.t, p: f.p });
  }
  return out;
}

export function mark(item: Item, r: number, sub: Sub | undefined): Mark {
  if (!sub) return BLANK;
  const limit = limitOf(r, item);
  const t = Math.min(limit, Math.max(0, Number(sub.t) || 0));
  if (item.kind === "scramble") {
    const spelled = scrambleSpell(item, sub.a);
    const ok = spelled !== null && scrambleAnswers(item).includes(spelled);
    if (!ok) return { ...BLANK, t };
    return { ok, t, hits: 1, pts: 100 + Math.floor((50 * left(limit, t)) / limit) };
  }
  if (item.kind === "mc") {
    const ok = sub.a === 0;
    if (!ok) return { ...BLANK, t };
    return { ok, t, hits: 1, pts: r === TB ? 0 : 100 + Math.floor((50 * left(limit, t)) / limit) };
  }
  if (item.kind === "clue") {
    const ok = typeof sub.a === "string" && clueMatch(item, sub.a);
    if (!ok) return { ...BLANK, t };
    return { ok, t, hits: 1, pts: t < HINT_AT[1] ? 150 : t < HINT_AT[2] ? 110 : 70 };
  }
  if (item.kind === "order") {
    const tokens = tokensOf(item);
    const a = sub.a;
    const full = Array.isArray(a) && a.length === tokens.length && new Set(a).size === a.length && a.every((i) => Number.isInteger(i) && i >= 0 && i < tokens.length);
    const ok = full && orderAnswers(item).includes(norm((a as number[]).map((i) => tokens[i]).join(" ")));
    if (!ok) return { ...BLANK, t };
    const base = r === CROWN ? 300 : 200;
    const bonus = r === CROWN ? 100 : 50;
    return { ok, t, hits: 1, pts: base + Math.floor((bonus * left(limit, t)) / limit) };
  }
  const found = gridFinds(item, sub.f).slice(0, GRID_GOAL);
  const done = found.length >= GRID_GOAL;
  const at = done ? found[GRID_GOAL - 1].t : t;
  return {
    ok: done,
    t: at,
    hits: found.length,
    words: found.map((x) => x.w),
    pts: GRID_WORD * found.length + (done ? Math.floor((100 * left(limit, at)) / limit) : 0),
  };
}

/** Điểm tối đa của cả ván với cấu hình `c`. */
export function maxScore(c: Counts) {
  const crown = crownKinds(c[4]).length * 400;
  return c[0] * 150 + c[1] * 150 + c[2] * 150 + c[3] * 250 + crown;
}

// ——— Xếp hạng ———

export type Rounds = [number, number, number, number, number];
export const NO_ROUNDS = (): Rounds => [0, 0, 0, 0, 0];
export type Row = { uid: string; rounds: Rounds; total: number; hits: number; rank: number; king?: boolean };

const cmp = (a: Row, b: Row) => b.total - a.total || b.rounds[CROWN] - a.rounds[CROWN] || b.hits - a.hits;

/**
 * Tổng điểm cao hơn đứng trên; bằng thì ai điểm Soán ngôi cao hơn; vẫn bằng thì ai nhiều câu đúng hơn (mỗi từ trong lưới
 * tính một). Nhóm còn hoà ở hạng nhất đã đấu câu hỏi phụ thì người thắng (`kings`) hạng nhất, những người còn lại trong
 * nhóm hạng ngay sau. Các vị trí khác hoà thì đồng hạng.
 */
export function standings(list: Omit<Row, "rank" | "king">[], kings?: readonly string[]): Row[] {
  const rows: Row[] = list.map((r) => ({ ...r, rank: 0 })).sort((a, b) => cmp(a, b) || (a.uid < b.uid ? -1 : 1));
  rows.forEach((r, i) => {
    r.rank = i > 0 && cmp(rows[i - 1], r) === 0 ? rows[i - 1].rank : i + 1;
  });
  if (kings?.length) {
    const top = rows.filter((r) => r.rank === 1);
    if (top.length > 1 && kings.every((k) => top.some((r) => r.uid === k))) {
      const win = top.filter((r) => kings.includes(r.uid));
      const lose = top.filter((r) => !kings.includes(r.uid));
      win.forEach((r) => (r.king = true));
      lose.forEach((r) => (r.rank = win.length + 1));
      return [...win, ...lose, ...rows.filter((r) => r.rank > 1 && !lose.includes(r))];
    }
  }
  rows.filter((r) => r.rank === 1).forEach((r) => (r.king = true));
  return rows;
}

/** Nhóm đang hoà ở hạng nhất (theo tổng điểm, điểm Soán ngôi, số câu đúng). */
export function topTie(rows: Row[]) {
  return rows.filter((r) => r.rank === 1).map((r) => r.uid);
}

/** Sau một câu hỏi phụ: người đúng thắng người sai, cùng đúng thì nhanh hơn thắng. Ai còn lại thì đấu tiếp. */
export function tieSurvivors(item: Item, uids: readonly string[], subs: Record<string, Sub | undefined>) {
  const marks = uids.map((u) => ({ u, m: mark(item, TB, subs[u]) }));
  const right = marks.filter((x) => x.m.ok);
  if (!right.length) return [...uids];
  const best = Math.min(...right.map((x) => x.m.t));
  return right.filter((x) => x.m.t === best).map((x) => x.u);
}

// ——— Chuẩn hoá bản ghi nhận từ mạng ———

export function normSub(item: Item, raw: unknown, limit: number): Sub {
  const x = (raw ?? {}) as Partial<Sub>;
  const t = Math.min(limit, Math.max(0, Number.isFinite(x.t) ? Math.round(x.t as number) : limit));
  if (item.kind === "mc") return Number.isInteger(x.a) && (x.a as number) >= 0 && (x.a as number) < 4 ? { a: x.a, t } : { t };
  if (item.kind === "clue") return typeof x.a === "string" ? { a: x.a.slice(0, 60), t } : { t };
  if (item.kind === "order") return Array.isArray(x.a) ? { a: (x.a as unknown[]).filter((i) => Number.isInteger(i)).slice(0, 24) as number[], t } : { t };
  if (item.kind === "scramble") return Array.isArray(x.a) ? { a: (x.a as unknown[]).filter((i) => Number.isInteger(i) && (i as number) >= -1).slice(0, 64) as number[], t } : { t };
  const f = Array.isArray(x.f)
    ? (x.f as unknown[])
        .slice(0, 40)
        .map((v) => v as Partial<Find>)
        // Từ nối sau khi hết giờ thì bỏ.
        .filter((v) => validPath(v?.p) && Number.isFinite(v?.t) && (v.t as number) <= limit)
        .map((v) => ({ p: v.p as number[], t: Math.min(limit, Math.max(0, Math.round(v.t as number))) }))
    : [];
  return { f, t };
}

// ——— Diễn biến ván (chủ phòng ghi trong meta) ———

// Giới thiệu vòng → trả lời → công bố đáp án; hết câu cuối (và câu hỏi phụ nếu hoà ngôi đầu) là xong.
export type Stage = "intro" | "ask" | "reveal" | "done";

export type VtRound = VtOptions & {
  seed: number;
  /** Mã câu của ván theo thứ tự, và tối đa 3 câu dự phòng cho câu hỏi phụ. */
  qs: string[];
  tbq: string[];
  /** Câu đang chơi: 0…qs.length-1 là câu chính, từ qs.length trở đi là câu hỏi phụ. */
  i: number;
  stage: Stage;
  /** Lúc vào giai đoạn hiện tại và lúc mở bàn sau đếm ngược (giờ chủ phòng). */
  at: number;
  t0: number;
  /** Người tham gia từng câu hỏi phụ. */
  tbs: string[][];
  /** Vua (hoặc các Đồng Vua) sau câu hỏi phụ. */
  kings?: string[];
};

export const fmtPts = (n: number) => n.toLocaleString("vi-VN");
export const LETTERS = ["A", "B", "C", "D"];
