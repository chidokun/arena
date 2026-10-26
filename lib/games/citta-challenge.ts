// Tâm Đấu: trò chơi kiến thức Vi Diệu Pháp cho 1–4 người theo luật phiên bản 1.1. Cả bàn đọc chung một tình huống, mở
// chung hai trong bốn thẻ dữ kiện, rồi mỗi người tự trả lời phần nhận diện (kèm căn cứ) và kiểm tra một nhận định. Chấm
// theo đúng hai thẻ đã mở — bảng chấm sáu tổ hợp nằm sẵn trong bộ đề nên máy nào cũng tự chấm ra cùng kết quả.

export type Mode = "nm" | "ud" | "cs";
export const MODE_KEYS: readonly Mode[] = ["nm", "ud", "cs"];

export const MODES: Record<Mode, { name: string; emoji: string; text: string; items: number; minutes: string }> = {
  nm: { name: "Nhập môn", emoji: "🌱", text: "Một nhân vật, một khoảnh khắc: hiểu thuật ngữ, phân biệt dữ kiện với suy đoán.", items: 1, minutes: "10–15 phút" },
  ud: { name: "Ứng dụng", emoji: "🪷", text: "Hai mốc hoặc hai nhân vật: phân biệt các trạng thái gần giống nhau.", items: 2, minutes: "15–20 phút" },
  cs: { name: "Chuyên sâu", emoji: "☸️", text: "Phân loại tâm, quan hệ tâm–tâm sở: phân biệt “có thể”, “bắt buộc” và “được chứng minh”.", items: 3, minutes: "20–30 phút" },
};

export type Topic = "tt" | "bt" | "th" | "pl" | "qt";
export const TOPICS: Record<Topic, { name: string; emoji: string; about: string }> = {
  tt: { name: "Tợ tha", emoji: "🌀", about: "Biến hành và biệt cảnh: xúc, thọ, tưởng, tư, tác ý, cần, dục, hỷ…" },
  bt: { name: "Bất thiện", emoji: "🔥", about: "Tham, sân, si, ganh tỵ, bỏn xẻn, mạn, tà kiến, hối quá…" },
  th: { name: "Tịnh hảo", emoji: "🌸", about: "Tín, niệm, tàm, quý, vô tham, vô sân, tuệ, bi, tùy hỷ…" },
  pl: { name: "Phân loại tâm", emoji: "🧭", about: "Cảm thọ, tương ưng, trợ lực của tâm tham, đại thiện, đại quả, đại duy tác." },
  qt: { name: "Tổng hợp quy tắc", emoji: "📐", about: "Danh mục, hệ đếm, nhân và phạm vi áp dụng quy tắc." },
};
export const MODE_TOPICS: Record<Mode, readonly Topic[]> = { nm: ["tt", "bt", "th"], ud: ["tt", "bt", "th"], cs: ["tt", "bt", "th", "pl", "qt"] };

export type Card = { label: string; text: string };
export type Item = {
  q: string;
  options: string[];
  // Đáp án theo từng tổ hợp hai thẻ đã mở (thứ tự `PAIRS`), là chỉ số trong `options`.
  key: number[];
  // Đáp án khi đã biết cả bốn thẻ.
  full: number;
  // Thẻ chứa bằng chứng hợp lệ; rỗng = bằng chứng là câu chuyện công khai và bảng kiến thức.
  proof: number[];
  why: string;
  ground: string;
  missing: string;
};
export type De = {
  id: string;
  title: string;
  topic: string;
  topics: Topic[];
  story: string;
  cards: Card[];
  items: Item[];
  claim: string;
  // Đánh giá đúng của nhận định theo từng tổ hợp, là chỉ số trong `VERDICTS`.
  verdicts: number[];
  reason: string;
  note: string;
};
export type Term = { term: string; topic: Topic; group: string; trait: string; plain?: string; note: string };

export const ROUNDS = 6;
export const MAX_PLAYERS = 4;
export const CARDS_OPENED = 2;
export const COUNTDOWN_MS = 3000;
export const NONE = "Chưa đủ dữ kiện";

export const PAIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

export const VERDICTS: readonly { name: string; emoji: string; text: string }[] = [
  { name: "Hợp lý", emoji: "✅", text: "Kết luận được dữ kiện và quy tắc hỗ trợ" },
  { name: "Thiếu bằng chứng/điều kiện", emoji: "🌫️", text: "Kết luận vượt quá thông tin đang có" },
  { name: "Nhầm khái niệm/quy tắc", emoji: "🔀", text: "Áp dụng sai định nghĩa, quan hệ hoặc phạm vi" },
  { name: "Nhầm khoảnh khắc/đối tượng", emoji: "⏱️", text: "Dẫn chứng cho sai thời điểm hoặc nhân vật" },
];
const MISSED = 1;
const MOMENT = 3;

// Căn cứ của một câu trả lời: 0–3 là thẻ T1–T4 (chỉ chọn được thẻ đã mở), hoặc hai lựa chọn chung dưới đây.
export const BASIS_PUBLIC = 4;
export const BASIS_MISSING = 5;
export const BASIS: Record<typeof BASIS_PUBLIC | typeof BASIS_MISSING, { name: string; emoji: string }> = {
  [BASIS_PUBLIC]: { name: "Đề công khai & bảng kiến thức", emoji: "📜" },
  [BASIS_MISSING]: { name: "Còn thiếu thông tin", emoji: "❓" },
};

// Thời gian mỗi giai đoạn khi bật giới hạn (giây).
export const TIMES: Record<Mode, { pick: number; answer: number; judge: number }> = {
  nm: { pick: 20, answer: 45, judge: 30 },
  ud: { pick: 20, answer: 75, judge: 45 },
  cs: { pick: 30, answer: 120, judge: 60 },
};

export type CtOptions = { mode: Mode; topics: Topic[]; timer: boolean };
export const DEFAULT_OPTIONS: CtOptions = { mode: "nm", topics: [...MODE_TOPICS.nm], timer: false };

export function normOptions(o: unknown): CtOptions {
  const x = (o ?? {}) as Partial<CtOptions>;
  const mode = MODE_KEYS.find((k) => k === x.mode) ?? DEFAULT_OPTIONS.mode;
  const allowed = MODE_TOPICS[mode];
  const picked = Array.isArray(x.topics) ? allowed.filter((t) => (x.topics as unknown[]).includes(t)) : [];
  return { mode, topics: picked.length ? picked : [...allowed], timer: x.timer === true };
}

// Bộ đề mỗi mode vài trăm KB nên tách riêng, chỉ tải khi cần.
const loaders: Record<Mode, () => Promise<{ DE: De[] }>> = {
  nm: () => import("./citta-challenge-nm.ts"),
  ud: () => import("./citta-challenge-ud.ts"),
  cs: () => import("./citta-challenge-cs.ts"),
};
export const loadBank = (mode: Mode) => loaders[mode]().then((m) => m.DE);

export const poolOf = (bank: readonly De[], topics: readonly Topic[]) => bank.filter((d) => d.topics.some((t) => topics.includes(t)));

// Rút đủ `ROUNDS` đề khác nhau, ưu tiên đề phòng chưa chơi; hết đề mới thì chơi lại đề cũ. Không đủ đề thì trả null.
export function pickDes(bank: readonly De[], topics: readonly Topic[], used: readonly string[], rand: () => number): string[] | null {
  const pool = poolOf(bank, topics).map((d) => d.id);
  if (pool.length < ROUNDS) return null;
  const fresh = shuffle(
    pool.filter((id) => !used.includes(id)),
    rand,
  );
  const old = shuffle(
    pool.filter((id) => used.includes(id)),
    rand,
  );
  return [...fresh, ...old].slice(0, ROUNDS);
}

export function shuffle<T>(list: T[], rand: () => number) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Lượt mở thẻ thứ `k` của cả ván thuộc ai: quyền mở luân phiên theo thứ tự chỗ ngồi, nối tiếp qua các vòng. */
export const pickerAt = (round: number, opened: number, players: number) => (round * CARDS_OPENED + opened) % Math.max(1, players);

export function comboOf(cards: readonly number[]) {
  const [a, b] = [...cards].sort((x, y) => x - y);
  return PAIRS.findIndex(([x, y]) => x === a && y === b);
}

export type Answer = { a: number; e: number };
export type Verdict = { v: number; e: number };
export const BLANK: Answer = { a: -1, e: -1 };

export const isNone = (it: Item, k: number) => it.options[k] === NONE;

/** Căn cứ được chấp nhận cho mục `it` khi đã mở `cards`. */
export function proofsOf(it: Item, cards: readonly number[]): number[] {
  const c = comboOf(cards);
  if (isNone(it, it.key[c])) return [BASIS_MISSING];
  if (!it.proof.length) return [BASIS_PUBLIC];
  const open = cards.filter((t) => it.proof.includes(t));
  return open.length ? open : [BASIS_PUBLIC];
}

/**
 * Căn cứ được chấp nhận cho đánh giá nhận định: thiếu bằng chứng thì chỉ ra còn thiếu thông tin; nhầm khoảnh khắc thì đề công
 * khai đã tách sẵn các mốc. Đánh giá đổi theo thẻ đã mở thì căn cứ là chính thẻ quyết định; không đổi thì là quy tắc / đề công khai.
 */
export function claimProofsOf(de: De, cards: readonly number[]): number[] {
  const v = de.verdicts[comboOf(cards)];
  if (v === MISSED) return [BASIS_MISSING];
  if (v === MOMENT || de.verdicts.every((x) => x === v)) return [BASIS_PUBLIC];
  const decisive = cards.filter((t) => de.items.some((it) => it.proof.includes(t)));
  return decisive.length ? decisive : [BASIS_PUBLIC];
}

// Điểm tính theo nửa điểm để khỏi số lẻ: tối đa 10 nửa điểm (5 điểm) mỗi vòng.
const ITEM_HALVES: Record<Mode, { full: number; part: number }> = {
  nm: { full: 6, part: 2 },
  ud: { full: 3, part: 1 },
  cs: { full: 2, part: 1 },
};
const CLAIM_HALVES = { full: 4, part: 2 };
export const ROUND_HALVES = 10;

export type Mark = { ok: boolean; proof: boolean; halves: number };
export type Graded = { items: Mark[]; claim: Mark; halves: number };

export function grade(de: De, mode: Mode, cards: readonly number[], answers: readonly Answer[] | undefined, verdict: Verdict | undefined): Graded {
  const c = comboOf(cards);
  const pts = ITEM_HALVES[mode];
  const items = de.items.map((it, i): Mark => {
    const ans = answers?.[i] ?? BLANK;
    const ok = ans.a === it.key[c];
    const proof = ok && proofsOf(it, cards).includes(ans.e);
    return { ok, proof, halves: ok ? (proof ? pts.full : pts.part) : 0 };
  });
  const v = verdict ?? { v: -1, e: -1 };
  const ok = v.v === de.verdicts[c];
  const proof = ok && claimProofsOf(de, cards).includes(v.e);
  const claim = { ok, proof, halves: ok ? (proof ? CLAIM_HALVES.full : CLAIM_HALVES.part) : 0 };
  return { items, claim, halves: items.reduce((s, m) => s + m.halves, 0) + claim.halves };
}

export const fmtHalves = (h: number) => (h % 2 ? `${Math.floor(h / 2)},5` : `${h / 2}`);

export type Standing = { uid: string; halves: number; perfect: number; rank: number };

/** Xếp hạng: tổng điểm, rồi số vòng trọn 5 điểm; vẫn bằng nhau thì đồng hạng. */
export function standings(rows: { uid: string; rounds: number[] }[]): Standing[] {
  const list = rows.map((r) => ({ uid: r.uid, halves: r.rounds.reduce((s, h) => s + h, 0), perfect: r.rounds.filter((h) => h === ROUND_HALVES).length, rank: 0 }));
  list.sort((a, b) => b.halves - a.halves || b.perfect - a.perfect);
  list.forEach((r, i) => {
    const prev = list[i - 1];
    r.rank = prev && prev.halves === r.halves && prev.perfect === r.perfect ? prev.rank : i + 1;
  });
  return list;
}

export function normAnswers(raw: unknown, n: number): Answer[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: n }, (_, i) => {
    const x = list[i] as Partial<Answer> | undefined;
    const a = Number.isInteger(x?.a) ? (x!.a as number) : -1;
    const e = Number.isInteger(x?.e) ? (x!.e as number) : -1;
    return { a: a >= 0 && a < 6 ? a : -1, e: e >= 0 && e <= BASIS_MISSING ? e : -1 };
  });
}

export function normVerdict(raw: unknown): Verdict {
  const x = (raw ?? {}) as Partial<Verdict>;
  const v = Number.isInteger(x.v) ? (x.v as number) : -1;
  const e = Number.isInteger(x.e) ? (x.e as number) : -1;
  return { v: v >= 0 && v < VERDICTS.length ? v : -1, e: e >= 0 && e <= BASIS_MISSING ? e : -1 };
}

export const LETTERS = ["A", "B", "C", "D", "E", "F"];

export const cardOrder = (rand: () => number) => shuffle([0, 1, 2, 3], rand);

// Giai đoạn của một vòng: mở thẻ (cả bàn vừa đọc đề) → nhận diện → kiểm tra nhận định → xem lời giải; hết vòng 6 là xong ván.
export type Stage = "pick" | "answer" | "judge" | "review" | "done";

export type CtRound = CtOptions & {
  ids: string[];
  // Vòng đang chơi (0–5) và đề của vòng đó, chép sẵn để không phải chờ tải bộ đề mới vẽ được bàn.
  v: number;
  de: De;
  stage: Stage;
  cards: number[];
  // Thẻ đã mở của các vòng trước, để chấm lại cả ván.
  hist: number[][];
  // Thứ tự bày thẻ vòng này: ô thứ i là thẻ nào. Thẻ úp chỉ ghi "Dữ kiện i+1", xáo mỗi vòng để không đoán được thẻ nào là
  // bằng chứng qua vị trí.
  order?: number[];
  // Lúc vào giai đoạn hiện tại và lúc mở bàn sau đếm ngược (giờ chủ phòng).
  at: number;
  t0: number;
};
