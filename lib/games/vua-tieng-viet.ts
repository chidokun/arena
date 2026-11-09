// Vua Tiếng Việt: đố vui tiếng Việt 1–8 người, bốn vòng Phản xạ → Giải nghĩa → Xâu chuỗi → Soán ngôi. Cả phòng nhận cùng
// câu hỏi, cùng lúc, cùng giới hạn giờ; không loại ai giữa chừng, không trừ điểm câu sai. Thiết kế gốc lấy cảm hứng từ thể
// thức gameshow cùng tên, không phải luật chính thức của chương trình.
import { CLUES, GRIDS, LONGS, MCS, ORDERS } from "./vua-tieng-viet-bank.ts";

export type Pack = "quick" | "standard" | "long" | "custom";
export type Level = "easy" | "medium" | "hard" | "mixed";
export type Topic = "all" | "spell" | "vocab" | "idiom" | "lit";
export type Counts = [number, number, number, number];
export type VtOptions = { pack: Pack; counts: Counts; level: Level; topic: Topic; explain: boolean };

export const MAX_PLAYERS = 8;
export const DEFAULT_SEATS = 4;
export const COUNTDOWN_MS = 3000;

export const PACKS: Record<Exclude<Pack, "custom">, { name: string; emoji: string; counts: Counts; minutes: string }> & Record<"custom", { name: string; emoji: string; minutes: string }> = {
  quick: { name: "Nhanh", emoji: "⚡", counts: [3, 2, 1, 1], minutes: "~3 phút" },
  standard: { name: "Tiêu chuẩn", emoji: "👑", counts: [6, 4, 3, 2], minutes: "~5–6 phút" },
  long: { name: "Dài", emoji: "🏯", counts: [10, 5, 5, 3], minutes: "~8–9 phút" },
  custom: { name: "Tùy chỉnh", emoji: "🛠️", minutes: "tùy số câu" },
};
export const PACK_KEYS: readonly Pack[] = ["quick", "standard", "long", "custom"];
// Mỗi vòng tối thiểu 1 câu; tối đa theo độ lớn ngân hàng để vẫn còn chỗ ưu tiên câu chưa chơi.
export const COUNT_MAX: Counts = [12, 8, 8, 4];

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

export const DEFAULT_OPTIONS: VtOptions = { pack: "standard", counts: [6, 4, 3, 2], level: "mixed", topic: "all", explain: true };

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  if (v === null || v === undefined || v === "") return dflt;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

export function normOptions(o: unknown): VtOptions {
  const x = (o ?? {}) as Partial<VtOptions>;
  const pack = PACK_KEYS.includes(x.pack as Pack) ? (x.pack as Pack) : DEFAULT_OPTIONS.pack;
  const raw = Array.isArray(x.counts) ? x.counts : [];
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

// ——— Bốn vòng ———

export type Kind = "mc" | "clue" | "order" | "grid";

export const ROUNDS = [
  { name: "Phản xạ", emoji: "⚡", limit: 12000, rule: "Chọn đáp án đúng — đúng được 100 điểm, cộng tới 50 điểm thưởng tốc độ.", about: "Trắc nghiệm chính tả, từ vựng, thành ngữ, văn học. Bấm là chốt, không sửa." },
  { name: "Giải nghĩa", emoji: "🔍", limit: 20000, rule: "Gợi ý mở dần ở giây 0 – 7 – 14. Đúng trước gợi ý 2: 150 · trước gợi ý 3: 110 · sau đó: 70.", about: "Gõ từ (có dấu) khớp với lời giải nghĩa. Chỉ được gửi một lần!" },
  { name: "Xâu chuỗi", emoji: "🔗", limit: 25000, rule: "Đúng được 200 điểm, cộng tới 50 điểm thưởng tốc độ.", about: "Sắp các thẻ tiếng thành câu tục ngữ, ca dao hoàn chỉnh rồi xác nhận." },
  { name: "Soán ngôi", emoji: "👑", limit: 35000, rule: "Giải mã câu dài: 300 + tới 100 điểm tốc độ. Săn từ: 75 điểm mỗi từ (tối đa 4) + tới 100 điểm nếu đủ 4 từ sớm.", about: "Vòng cuối khó hơn, điểm cao hơn — cơ hội lật ngược thế cờ!" },
] as const;
export const TIEBREAK = { name: "Câu hỏi phụ", emoji: "⚔️", limit: 15000, rule: "Ai đúng thắng; cùng đúng thì ai nhanh hơn thắng." };
export const TIEBREAK_MAX = 3;
export const HINT_AT = [0, 7000, 14000] as const;
export const GRID_GOAL = 4;
export const GRID_WORD = 75;

// ——— Kiểu dữ liệu ngân hàng ———

type Base = { id: string; lv: 1 | 2 | 3; tp: Exclude<Topic, "all">; fam?: string };
export type Mc = Base & { q: string; o: [string, string, string, string]; why: string };
export type Clue = Base & { h: [string, string, string]; a: string; acc?: string[]; why: string };
export type Order = Base & { text: string; alt?: string[]; why: string };
export type Grid = Base & { theme: string; cells: string[]; words: string[] };
export type Item = ({ kind: "mc" } & Mc) | ({ kind: "clue" } & Clue) | ({ kind: "order" } & Order) | ({ kind: "grid" } & Grid);

const tag = <K extends Kind, T>(kind: K, list: T[]) => list.map((x) => ({ ...x, kind }));
export const BANK = {
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

// ——— Chọn đề ———

const LV: Record<Level, number> = { easy: 1, medium: 2, hard: 3, mixed: 0 };

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
  const [n1, n2, n3, n4] = o.counts;
  const kinds = crownKinds(n4);
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
  return { qs: [...r1, ...r2, ...r3, ...r4].map((x) => x.id), tbq: tb.map((x) => x.id) };
}

// ——— Vị trí câu trong ván ———

export const totalOf = (c: Counts) => c[0] + c[1] + c[2] + c[3];

/** Vòng (0–3) của câu thứ `i`; câu hỏi phụ (sau câu cuối) là 4. */
export function roundOf(c: Counts, i: number) {
  let acc = 0;
  for (let r = 0; r < 4; r++) {
    acc += c[r];
    if (i < acc) return r;
  }
  return 4;
}

/** Thứ tự của câu `i` trong vòng của nó (0-based) và số câu của vòng. */
export function placeOf(c: Counts, i: number) {
  const r = roundOf(c, i);
  if (r === 4) return { r, k: i - totalOf(c), n: TIEBREAK_MAX };
  const start = c.slice(0, r).reduce((s, x) => s + x, 0);
  return { r, k: i - start, n: c[r] };
}

export const firstOfRound = (c: Counts, i: number) => {
  const { r, k } = placeOf(c, i);
  return r < 4 ? k === 0 : i === totalOf(c);
};

export const limitOf = (r: number) => (r === 4 ? TIEBREAK.limit : ROUNDS[r].limit);

// ——— Chấm điểm ———

export type Find = { p: number[]; t: number };
/** Câu trả lời đã chốt: `a` là chỉ số phương án / chuỗi gõ / thứ tự thẻ; `t` là số ms đã trôi qua khi chốt; `f` là các từ tìm trong lưới. */
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
  const limit = limitOf(r);
  const t = Math.min(limit, Math.max(0, Number(sub.t) || 0));
  if (item.kind === "mc") {
    const ok = sub.a === 0;
    if (!ok) return { ...BLANK, t };
    return { ok, t, hits: 1, pts: r === 4 ? 0 : 100 + Math.floor((50 * left(limit, t)) / limit) };
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
    const base = r === 3 ? 300 : 200;
    const bonus = r === 3 ? 100 : 50;
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
  const crown = crownKinds(c[3]).length * 400;
  return c[0] * 150 + c[1] * 150 + c[2] * 250 + crown;
}

// ——— Xếp hạng ———

export type Row = { uid: string; rounds: [number, number, number, number]; total: number; hits: number; rank: number; king?: boolean };

const cmp = (a: Row, b: Row) => b.total - a.total || b.rounds[3] - a.rounds[3] || b.hits - a.hits;

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
  const marks = uids.map((u) => ({ u, m: mark(item, 4, subs[u]) }));
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
