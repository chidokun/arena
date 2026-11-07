// Anh Hùng Bàn Phím: đua xe bằng cách gõ chữ. Văn bản sinh tất định từ seed nên không phải gửi qua mạng (trừ khi chủ
// phòng tự nhập); quãng đường của mỗi xe là số ký tự đã gõ đúng.
import { EN_HARD, EN_MEDIUM, EN_WORDS, VI_HARD, VI_MEDIUM, VI_WORDS } from "./typing-race-texts.ts";

export type Mode = "chars" | "time";
export type Lang = "vi" | "en";
export type Level = "easy" | "medium" | "hard";
export type Source = "random" | "custom";
export type TrOptions = { mode: Mode; length: number; minutes: number; lang: Lang; level: Level; source: Source };

export const MAX_PLAYERS = 20;
// Người đầu tiên về đích thì những người còn lại có thêm chừng này để hoàn thành.
export const FINISH_GRACE_MS = 60000;

export const LENGTHS = [500, 1000, 2000] as const;
export const LENGTH_MIN = 100;
export const LENGTH_MAX = 5000;
export const MINUTES = [1, 3, 5, 10] as const;
export const MINUTES_MIN = 1;
export const MINUTES_MAX = 30;
export const CUSTOM_MAX = 5000;
export const CUSTOM_MIN = 20;

export const MODES: Record<Mode, { name: string; emoji: string; text: string }> = {
  chars: {
    name: "Đua theo số ký tự",
    emoji: "🏁",
    text: "Gõ hết đoạn văn bản: ai về đích trước thắng. Người đầu tiên về đích thì những người còn lại có thêm 60 giây để hoàn thành.",
  },
  time: {
    name: "Đua theo thời gian",
    emoji: "⏱",
    text: "Gõ liên tục tới khi hết giờ: đường đua không có đích, ai đi được xa nhất (nhiều ký tự đúng nhất) thắng.",
  },
};
export const MODE_KEYS = Object.keys(MODES) as Mode[];

export const LANGS: Record<Lang, { name: string; emoji: string }> = {
  vi: { name: "Tiếng Việt", emoji: "🇻🇳" },
  en: { name: "Tiếng Anh", emoji: "🇬🇧" },
};
export const LANG_KEYS = Object.keys(LANGS) as Lang[];

export const LEVELS: Record<Level, { name: string; emoji: string; text: string }> = {
  easy: { name: "Dễ", emoji: "🌱", text: "Từ thông dụng viết thường, ít dấu câu, không có số và ký tự đặc biệt." },
  medium: { name: "Trung bình", emoji: "🌿", text: "Câu có chữ hoa, chữ thường, số và dấu câu thông dụng." },
  hard: { name: "Khó", emoji: "🔥", text: "Nhiều dấu câu, số, ký tự đặc biệt và từ ít gặp." },
};
export const LEVEL_KEYS = Object.keys(LEVELS) as Level[];

export const DEFAULT_OPTIONS: TrOptions = { mode: "chars", length: 1000, minutes: 5, lang: "vi", level: "medium", source: "random" };

/** Chốt lúc bắt đầu ván: tham số, seed của văn bản (hoặc văn bản tự nhập), giờ xuất phát; hết ván thêm bảng xếp hạng. */
export type TrRound = TrOptions & { seed: number; t0: number; text?: string; end?: number; final?: Standing[] };

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

export function normOptions(o: unknown): TrOptions {
  const x = (o ?? {}) as Partial<TrOptions>;
  return {
    mode: MODE_KEYS.includes(x.mode as Mode) ? (x.mode as Mode) : DEFAULT_OPTIONS.mode,
    length: clampInt(x.length, LENGTH_MIN, LENGTH_MAX, DEFAULT_OPTIONS.length),
    minutes: clampInt(x.minutes, MINUTES_MIN, MINUTES_MAX, DEFAULT_OPTIONS.minutes),
    lang: LANG_KEYS.includes(x.lang as Lang) ? (x.lang as Lang) : DEFAULT_OPTIONS.lang,
    level: LEVEL_KEYS.includes(x.level as Level) ? (x.level as Level) : DEFAULT_OPTIONS.level,
    source: x.source === "custom" ? "custom" : "random",
  };
}

export const goalLabel = (o: Pick<TrOptions, "mode" | "length" | "minutes">) =>
  o.mode === "chars" ? `${o.length.toLocaleString("vi-VN")} ký tự` : `${o.minutes} phút`;

// ——— Văn bản ———

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

const words = (bank: string) => bank.split(/\s+/).filter(Boolean);
const BANKS = {
  vi: { easy: words(VI_WORDS), medium: VI_MEDIUM, hard: VI_HARD },
  en: { easy: words(EN_WORDS), medium: EN_MEDIUM, hard: EN_HARD },
};

// Đủ cho người gõ ~300 WPM trong suốt ván theo thời gian.
export const timeTextLength = (minutes: number) => minutes * 1500;

// Câu xáo theo từng lượt hết kho rồi xáo lại, để đoạn dài mới lặp câu.
function sentences(rand: () => number, bank: readonly string[], need: number) {
  const out: string[] = [];
  let size = 0;
  while (size < need) {
    const deck = bank.slice();
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    // Hai lượt nối nhau không bắt đầu bằng đúng câu vừa gõ.
    if (out.length && deck[0] === out[out.length - 1]) deck.push(deck.shift()!);
    for (const s of deck) {
      out.push(s);
      size += s.length + 1;
      if (size >= need) break;
    }
  }
  return out.join(" ");
}

function wordRun(rand: () => number, bank: readonly string[], need: number) {
  let out = "";
  let prev = "";
  let sinceComma = 0;
  while (out.length < need) {
    let w = bank[Math.floor(rand() * bank.length)];
    if (w === prev) w = bank[(bank.indexOf(w) + 1) % bank.length];
    prev = w;
    sinceComma++;
    const comma = sinceComma > 8 && rand() < 0.12;
    if (comma) sinceComma = 0;
    out += (out ? " " : "") + w + (comma ? "," : "");
  }
  return out;
}

/** Cắt đúng ở ranh giới từ gần `len` nhất; không để dấu cách hay dấu phẩy treo ở cuối. */
export function cutText(text: string, len: number) {
  if (text.length <= len) return text.replace(/[\s,;:]+$/, "");
  let end = len;
  const next = text.indexOf(" ", len);
  const prev = text.lastIndexOf(" ", len);
  if (next >= 0 && next - len <= 12) end = next;
  else if (prev > 0) end = prev;
  return text.slice(0, end).replace(/[\s,;:]+$/, "");
}

export function makeText(seed: number, lang: Lang, level: Level, need: number) {
  const rand = rng(seed);
  const bank = BANKS[lang][level];
  const raw = level === "easy" ? wordRun(rand, bank, need + 40) : sentences(rand, bank, need + 200);
  return cutText(raw, need);
}

/** Chuẩn hoá văn bản chủ phòng nhập: dựng sẵn dấu tiếng Việt, đổi ký tự khó gõ sang ký tự thường, bỏ tab/emoji. */
export function cleanText(raw: string) {
  return raw
    .normalize("NFC")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[\s  -​　]+/g, " ")
    .replace(/[^\p{L}\p{M}\p{N} !-/:-@[-`{-~]/gu, "")
    .replace(/ {2,}/g, " ")
    .trim()
    .normalize("NFC")
    .slice(0, CUSTOM_MAX)
    .trim();
}

/** Văn bản của ván: tự nhập thì giữ nguyên (đua theo thời gian thì nối lặp lại cho đủ dài). */
export function roundText(o: TrOptions, seed: number, custom?: string) {
  const need = o.mode === "chars" ? o.length : timeTextLength(o.minutes);
  if (o.source !== "custom" || !custom) return makeText(seed, o.lang, o.level, need);
  if (o.mode === "chars") return custom;
  let out = custom;
  while (out.length < need) out += " " + custom;
  return out;
}

// ——— Kiểm tra từng lần gõ ———
// Bộ gõ tiếng Việt (Telex, VNI) đi qua các bước trung gian: gõ "tieengs" thì ô nhập lần lượt là "tie", "tiê",
// "tiêng", "tiếng". Một chữ cái chỉ bị coi là sai khi không còn cách nào thành chữ cần gõ (khác chữ gốc, có dấu lạ).
// Dấu thanh xét theo cả từ vì bộ gõ có thể đặt dấu ở nguyên âm khác ("hòa" và "hoà" như nhau). Từ chỉ được xác nhận
// khi gõ tới dấu cách / dấu câu sau nó — lúc đó mới chắc bộ gõ không đổi chữ nữa.

const TONE = /[̣̀́̃̉]/;
const TONES = /[̣̀́̃̉]/g;
const LETTER = /\p{L}/u;

const parts = new Map<string, { base: string; tone: string }>();

function partsOf(c: string) {
  let p = parts.get(c);
  if (!p) {
    const d = c.normalize("NFD");
    p = { base: d.replace(TONES, "").normalize("NFC"), tone: d.match(TONE)?.[0] ?? "" };
    parts.set(c, p);
  }
  return p;
}

export const isLetter = (c: string) => LETTER.test(c);

/** `typed` (đã bỏ dấu thanh) còn có thể thành `target` nhờ bộ gõ: cùng chữ gốc, các dấu đã có đều nằm trong chữ đích. */
function fits(typed: string, target: string) {
  if (typed === target) return true;
  if ((typed === "d" && target === "đ") || (typed === "D" && target === "Đ")) return true;
  const a = typed.normalize("NFD");
  const b = target.normalize("NFD");
  if (a[0] !== b[0]) return false;
  for (const mark of a.slice(1)) if (!b.includes(mark)) return false;
  return true;
}

function wordTone(text: string, i: number) {
  let s = i;
  while (s > 0 && isLetter(text[s - 1])) s--;
  for (let k = s; k < text.length && isLetter(text[k]); k++) {
    const t = partsOf(text[k]).tone;
    if (t) return t;
  }
  return "";
}

export type Scan = {
  /** Số ký tự đầu của ô nhập đã chắc chắn đúng — luôn dừng ở sau một dấu cách / dấu câu, hoặc ở cuối văn bản. */
  commit: number;
  /** Số ký tự đầu khớp hẳn với văn bản (kể cả phần từ đang gõ dở) — để xe tiến theo từng chữ. */
  good: number;
  /** Vị trí ký tự sai đầu tiên trong ô nhập, -1 nếu chưa sai. */
  bad: number;
};

/** So ô nhập `buf` với văn bản từ vị trí `pos` (ngay sau phần đã xác nhận). */
export function scan(text: string, pos: number, input: string): Scan {
  const buf = input.normalize("NFC");
  let commit = 0;
  let good = 0;
  let run = true;
  let word = -1;
  let typedTone = "";
  let exact = true;
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    const t = text[pos + i];
    if (t === undefined) return { commit, good, bad: i };
    if (isLetter(c)) {
      if (!isLetter(t)) return { commit, good, bad: i };
      const pc = partsOf(c);
      const pt = partsOf(t);
      if (!fits(pc.base, pt.base)) return { commit, good, bad: i };
      if (word < 0) {
        word = i;
        typedTone = "";
        exact = true;
      }
      if (pc.tone) {
        if (typedTone || pc.tone !== wordTone(text, pos + i)) return { commit, good, bad: i };
        typedTone = pc.tone;
      }
      if (pc.base !== pt.base) exact = false;
      if (run && pc.base === pt.base) good = i + 1;
      else run = false;
    } else {
      if (c !== t) return { commit, good, bad: i };
      if (word >= 0) {
        if (!exact || typedTone !== wordTone(text, pos + word)) return { commit, good, bad: i };
        word = -1;
      }
      commit = i + 1;
      if (run) good = i + 1;
    }
  }
  // Gõ tới hết văn bản thì từ cuối không có dấu cách theo sau — đúng trọn là xong.
  if (pos + buf.length === text.length && (word < 0 || (exact && typedTone === wordTone(text, pos + word)))) {
    commit = buf.length;
    good = buf.length;
  }
  return { commit, good, bad: -1 };
}

// ——— Tiến độ & xếp hạng ———

/** Bản ghi tiến độ mỗi người tự phát: `p` đã xác nhận, `n` quãng đường (≥ p), `e` số lần gõ sai, `at` lúc đạt `n`. */
export type TrRec = { p: number; n: number; e: number; at: number; v: number; fin?: number; quit?: boolean };

export function normRec(raw: unknown, total: number): TrRec | null {
  const r = raw as Partial<TrRec> | null;
  if (!r || typeof r !== "object") return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  const p = Math.min(total, Math.floor(num(r.p)));
  const n = Math.min(total, Math.max(p, Math.floor(num(r.n))));
  return {
    p,
    n,
    e: Math.floor(num(r.e)),
    at: num(r.at),
    v: Math.min(400, num(r.v)),
    ...(typeof r.fin === "number" && r.fin > 0 && p === total ? { fin: r.fin } : {}),
    ...(r.quit ? { quit: true } : {}),
  };
}

export const wpm = (chars: number, ms: number) => (ms > 0 ? chars / 5 / (ms / 60000) : 0);
export const accuracy = (right: number, wrong: number) => (right + wrong > 0 ? (100 * right) / (right + wrong) : 100);

export type Standing = { k: number; rank: number; n: number; e: number; at: number; fin?: number; quit?: boolean; out?: boolean };

/**
 * Xếp hạng theo luật: theo ký tự — về đích trước (thời gian ít hơn), chưa về đích thì nhiều ký tự hơn, rồi chính xác hơn;
 * theo thời gian — nhiều ký tự hơn, chính xác hơn, đạt mốc đó sớm hơn. Bằng hết thì đồng hạng. Bỏ cuộc / gian lận
 * (`out`) không tranh hạng (rank 0).
 */
export function standings(mode: Mode, recs: readonly (TrRec | null)[], out: readonly boolean[] = []): Standing[] {
  const rows: Standing[] = recs.map((r, k) => ({
    k,
    rank: 0,
    n: r?.n ?? 0,
    e: r?.e ?? 0,
    at: r?.at ?? 0,
    ...(r?.fin != null ? { fin: r.fin } : {}),
    ...(r?.quit ? { quit: true } : {}),
    ...(out[k] || r?.quit ? { out: true } : {}),
  }));
  const acc = (s: Standing) => Math.round(accuracy(s.n, s.e) * 100);
  const key = (s: Standing): number[] =>
    mode === "chars"
      ? [s.fin != null ? 0 : 1, s.fin ?? 0, -s.n, -acc(s)]
      : [-s.n, -acc(s), s.n ? s.at : 0];
  const cmp = (a: Standing, b: Standing) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  };
  const ranked = rows.filter((s) => !s.out).sort((a, b) => cmp(a, b) || a.k - b.k);
  ranked.forEach((s, i) => {
    s.rank = i > 0 && cmp(ranked[i - 1], s) === 0 ? ranked[i - 1].rank : i + 1;
  });
  const left = rows.filter((s) => s.out).sort((a, b) => b.n - a.n || a.k - b.k);
  return [...ranked, ...left];
}

export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ——— Xe ———

export const CARS = [
  { name: "Đỏ Rực", color: "#ff4b4b" },
  { name: "Xanh Biển", color: "#2f7bff" },
  { name: "Vàng Chanh", color: "#ffc23d" },
  { name: "Xanh Lá", color: "#12b981" },
  { name: "Tím Mộng", color: "#9b5cf6" },
  { name: "Hồng Kẹo", color: "#ff6fb5" },
  { name: "Cam Cháy", color: "#ff8a3d" },
  { name: "Xanh Ngọc", color: "#14b8c4" },
  { name: "Trắng Ngà", color: "#efeaf8" },
  { name: "Đen Tuyền", color: "#3b3556" },
] as const;

// Dáng xe mở khoá dần theo điểm (`carPoints`). Mã xe = màu + dáng × số màu, nên mã cũ (chỉ có màu) vẫn là xe con.
export const SHAPES = [
  { key: "classic", name: "Xe con", need: 0 },
  { key: "kart", name: "Xe kart", need: 1 },
  { key: "truck", name: "Xe tải", need: 5 },
  { key: "f1", name: "Xe F1", need: 12 },
] as const;
export type Shape = (typeof SHAPES)[number]["key"];

export const isCar = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < CARS.length * SHAPES.length;
export const colorOf = (car: number) => CARS[car % CARS.length] ?? CARS[0];
export const shapeAt = (car: number) => Math.floor(car / CARS.length) % SHAPES.length;
export const shapeOf = (car: number): Shape => SHAPES[shapeAt(car)].key;
export const carIndex = (color: number, shape: number) => (color % CARS.length) + (shape % SHAPES.length) * CARS.length;
/** Điểm mở khoá dáng xe: mỗi ván chơi trọn +1, thắng ván nhiều người +2 nữa. */
export const carPoints = (s: { races: number; wins: number }) => s.races + 2 * s.wins;

/** Ai chưa chọn xe thì lấy theo uid để mỗi người một màu ổn định. */
export function carOf(uid: string, pick?: unknown) {
  if (isCar(pick)) return pick;
  let h = 0;
  for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % CARS.length;
}

// ——— Diễn biến ván: chuỗi điểm (thời điểm, số ký tự) của từng người ———

export type Pt = readonly [at: number, n: number];

/** Số ký tự ở thời điểm `t`, nội suy tuyến tính giữa hai mốc (giữa hai lần phát tiến độ coi như gõ đều tay). */
export function nAt(pts: readonly Pt[], t: number): number {
  if (!pts.length || t <= pts[0][0]) return pts.length && t >= pts[0][0] ? pts[0][1] : 0;
  let lo = 0;
  let hi = pts.length - 1;
  if (t >= pts[hi][0]) return pts[hi][1];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= t) lo = mid;
    else hi = mid;
  }
  const [a, na] = pts[lo];
  const [b, nb] = pts[hi];
  return b > a ? na + ((nb - na) * (t - a)) / (b - a) : nb;
}

/**
 * WPM tức thời: số ký tự gõ thêm trong `window` ms gần nhất. `pts` là các mốc gần đây (tăng dần, mốc đầu là chỗ bắt
 * đầu theo dõi); trước mốc đầu coi như đứng ở mốc đầu. Ngừng gõ thì tụt dần về 0 sau `window` ms.
 */
export function recentWpm(pts: readonly Pt[], n: number, elapsed: number, window: number): number {
  const span = Math.max(1000, Math.min(window, elapsed));
  const from = elapsed - span;
  const base = !pts.length ? n : from <= pts[0][0] ? pts[0][1] : nAt(pts, from);
  return Math.max(0, wpm(n - base, span));
}

/** Rút gọn còn tối đa `max` điểm, giữ điểm đầu và cuối. */
export function thin(pts: readonly Pt[], max = 160): Pt[] {
  if (pts.length <= max) return [...pts];
  const out: Pt[] = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (max - 1))]);
  return out;
}

/** WPM tức thời (tính trên `window` ms gần nhất) tại `steps` mốc đều nhau từ đầu tới `end`. */
export function wpmSeries(pts: readonly Pt[], end: number, { window = 5000, steps = 60 } = {}): Pt[] {
  if (end <= 0) return [];
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = (end * i) / steps;
    const w = Math.min(window, t);
    out.push([t, Math.max(0, wpm(nAt(pts, t) - nAt(pts, t - w), w))]);
  }
  return out;
}

export type Badge = { k: number; key: "burst" | "sharp" | "comeback"; emoji: string; label: string; text: string };

/**
 * Danh hiệu cuối ván cho ván nhiều người: bứt tốc (WPM tức thời cao nhất), chính xác nhất (gõ ít nhất 30 ký tự),
 * lội ngược dòng (giữa ván hạng thấp nhất so với lúc về).
 */
export function badges(final: readonly Standing[], series: readonly (readonly Pt[])[], end: number): Badge[] {
  const ranked = final.filter((s) => !s.out && s.rank > 0);
  if (ranked.length < 2) return [];
  const out: Badge[] = [];
  let burst = { k: -1, v: 0 };
  for (const s of ranked) {
    const pts = series[s.k] ?? [];
    if (pts.length < 2) continue;
    const v = Math.max(0, ...wpmSeries(pts, Math.min(end, s.fin ?? end)).map((p) => p[1]));
    if (v > burst.v) burst = { k: s.k, v };
  }
  if (burst.k >= 0) out.push({ k: burst.k, key: "burst", emoji: "⚡", label: "Bứt tốc", text: `${Math.round(burst.v)} WPM` });
  const sharp = ranked
    .filter((s) => s.n >= 30)
    .sort((a, b) => accuracy(b.n, b.e) - accuracy(a.n, a.e) || b.n - a.n)[0];
  if (sharp) out.push({ k: sharp.k, key: "sharp", emoji: "🎯", label: "Chính xác nhất", text: `${Math.floor(accuracy(sharp.n, sharp.e))}%` });
  if (ranked.every((s) => (series[s.k]?.length ?? 0) >= 2)) {
    const half = end / 2;
    const mid = [...ranked].sort((a, b) => nAt(series[b.k], half) - nAt(series[a.k], half) || a.k - b.k);
    let best = { k: -1, from: 0, to: 0 };
    mid.forEach((s, i) => {
      const gain = i + 1 - s.rank;
      if (gain > 0 && gain > best.from - best.to) best = { k: s.k, from: i + 1, to: s.rank };
    });
    if (best.k >= 0) out.push({ k: best.k, key: "comeback", emoji: "🚀", label: "Lội ngược dòng", text: `hạng ${best.from} → ${best.to}` });
  }
  return out;
}
