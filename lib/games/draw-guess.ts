/**
 * Luật Vẽ Đoán (thuần — không mạng, không DOM).
 *
 * Ván gồm `rounds` vòng; mỗi vòng ai trong đội hình cũng vẽ một lượt theo thứ tự `order` (xáo lúc bắt đầu ván).
 * Một lượt: *chọn từ* (`pick` — người vẽ chọn 1 trong 3 từ dễ / vừa / khó, hết giờ thì bốc thay) → *vẽ* (`draw` —
 * người khác đoán, càng sớm càng nhiều điểm; gợi ý chữ cái mở dần) → *lộ đáp án* (`show`). Người vẽ vắng mặt lúc tới
 * lượt thì bỏ lượt; im lặng quá `AWAY_MS` giữa lượt thì dừng lượt.
 *
 * Máy chủ phòng điều hành: từ khoá chỉ nằm trong `Secret` trên máy mình, chấm từng lời đoán (không phân biệt dấu,
 * hoa thường, được bỏ loại từ đứng đầu như "con", "cái"…), báo riêng lời đoán gần đúng, công khai lời đoán sai
 * (`Feed`) và ai đoán đúng (`DwPublic.hits`). `tick` là một bước điều hành, tất định theo đầu vào.
 */
import { TIERS, tierOf, wordId, wordOf, type Tier } from "./draw-guess-words.ts";
import { normWord } from "./undercover.ts";

export { tierOf, wordOf, type Tier };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const ROUND_CHOICES = [1, 2, 3, 4] as const;
/** Thời gian vẽ mỗi lượt (giây). */
export const TIME_CHOICES = [60, 80, 100, 120] as const;

export type DwOptions = {
  /** Số vòng: mỗi vòng ai cũng vẽ một lượt. */
  rounds: number;
  /** Thời gian vẽ mỗi lượt (giây). */
  time: number;
  /** Mở dần chữ cái gợi ý trong lúc vẽ. */
  hints: boolean;
};

export const DEFAULT_OPTIONS: DwOptions = { rounds: 2, time: 80, hints: true };

export function normOptions(raw: unknown): DwOptions {
  const o = (raw ?? {}) as Partial<DwOptions>;
  return {
    rounds: ROUND_CHOICES.includes(o.rounds as 1) ? (o.rounds as number) : DEFAULT_OPTIONS.rounds,
    time: TIME_CHOICES.includes(o.time as 60) ? (o.time as number) : DEFAULT_OPTIONS.time,
    hints: typeof o.hints === "boolean" ? o.hints : DEFAULT_OPTIONS.hints,
  };
}

export const TIER_NAMES: Record<Tier, { name: string; emoji: string }> = {
  0: { name: "Dễ", emoji: "🟢" },
  1: { name: "Vừa", emoji: "🟡" },
  2: { name: "Khó", emoji: "🔴" },
};

/** Thời gian chọn từ. */
export const PICK_MS = 15000;
/** Thời gian lộ đáp án trước khi sang lượt sau. */
export const SHOW_MS = 6000;
/** Lượt bị bỏ (người vẽ vắng mặt, mất đáp án) chỉ dừng chừng này. */
export const SKIP_MS = 3000;
/** Người vẽ im lặng chừng này giữa lượt thì dừng lượt. */
export const AWAY_MS = 15000;
/** Mỗi người đoán tối đa chừng này lần mỗi lượt, mỗi lần tối đa `GUESS_LEN` ký tự. */
export const GUESS_MAX = 40;
export const GUESS_LEN = 40;
/** Số lời đoán sai công khai giữ lại của lượt hiện tại. */
export const FEED_MAX = 60;

/** Điểm người đoán đúng: 60–300 tuỳ phần thời gian còn lại (`left`, 0–1), làm tròn 5. */
export const guessPoints = (left: number) => 60 + 5 * Math.round((240 * Math.min(1, Math.max(0, left))) / 5);
/** Điểm người vẽ cho mỗi người đoán đúng. */
export const DRAWER_POINTS = 50;

// ---------- so từ ----------

/** Loại từ hay đứng đầu ("con mèo", "cái ghế", "quả táo"…) — đoán thiếu loại từ vẫn tính đúng. */
const CLASSIFIERS = new Set(["con", "cai", "chiec", "qua", "trai", "cay", "bong", "doi", "chum", "cu", "quyen", "cuon", "ngon", "hon", "dong", "giot", "tia", "dam", "cuc", "bat"]);

/**
 * Lời đoán còn được bỏ thêm những tiếng hay nói kèm phía trước ("người nông dân", "xe ô tô", "một con mèo") — chỉ bỏ ở
 * lời đoán; từ khoá thì chỉ bỏ loại từ, để "tuyết" không ăn "người tuyết", "đạp" không ăn "xe đạp".
 */
const GUESS_PREFIXES = new Set([...CLASSIFIERS, "nguoi", "chu", "co", "ong", "ba", "anh", "chi", "xe", "may", "mot", "cac", "nhung"]);

/**
 * Các dạng được chấp nhận của một cụm (đã chuẩn hoá, bỏ khoảng trắng): cả cụm, và cụm bỏ dần tối đa `drop` tiếng đầu
 * thuộc `prefixes` (phần còn lại ít nhất hai ký tự).
 */
function forms(s: string, prefixes = CLASSIFIERS, drop = 1): string[] {
  let words = normWord(s).split(" ").filter(Boolean);
  const out = [words.join("")];
  for (let k = 0; k < drop && words.length > 1 && prefixes.has(words[0]); k++) {
    words = words.slice(1);
    const core = words.join("");
    if (core.length >= 2) out.push(core);
  }
  return out.filter(Boolean);
}

const guessForms = (s: string) => forms(s, GUESS_PREFIXES, 2);

/** Đoán đúng: trùng từ khoá sau khi bỏ dấu, hoa thường, khoảng trắng, loại từ đứng đầu ("meo" ≡ "Con mèo"). */
export function isRight(guess: string, word: string) {
  const want = forms(word);
  return guessForms(guess).some((g) => want.includes(g));
}

/** Khoảng cách sửa (Levenshtein), dừng sớm khi đã vượt `max`. */
function distance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Gần đúng (sai một, hai ký tự với từ dài) — chỉ báo riêng người đoán. Từ quá ngắn thì không có gần đúng. */
export function isNear(guess: string, word: string) {
  if (isRight(guess, word)) return false;
  return forms(word).some((w) => {
    const max = w.length >= 9 ? 2 : w.length >= 4 ? 1 : 0;
    return max > 0 && guessForms(guess).some((g) => distance(g, w, max) <= max);
  });
}

/** Câu chat nhắc tới đáp án (cả cụm hoặc phần bỏ loại từ) — người đã biết đáp án không được nói ra. */
export function leaks(text: string, word: string) {
  const t = ` ${normWord(text)} `;
  const words = normWord(word).split(" ").filter(Boolean);
  if (!words.length) return false;
  const core = words.length > 1 && CLASSIFIERS.has(words[0]) ? words.slice(1) : words;
  return t.includes(` ${words.join(" ")} `) || t.includes(` ${core.join(" ")} `);
}

// ---------- khung đáp án & gợi ý ----------

const chars = (word: string) => Array.from(word.normalize("NFC"));

/** Vị trí các chữ cái (bỏ khoảng trắng). */
export const letterSlots = (word: string) => chars(word).flatMap((ch, i) => (ch === " " ? [] : [i]));

/** Khung đáp án: chữ cái chưa mở là "_", khoảng trắng giữ nguyên. */
export const maskOf = (word: string, shown: number[]) =>
  chars(word)
    .map((ch, i) => (ch === " " ? " " : shown.includes(i) ? ch : "_"))
    .join("");

/** Số chữ cái được mở gợi ý trong một lượt, theo độ dài từ. */
export function hintCount(word: string) {
  const n = letterSlots(word).length;
  return n <= 2 ? 0 : n <= 4 ? 1 : n <= 8 ? 2 : 3;
}

/** Mốc mở gợi ý (phần thời gian vẽ đã trôi qua). */
const HINT_AT = [0.5, 0.65, 0.8];

/** Số gợi ý đã tới hạn khi đã vẽ được `passed` (0–1) thời gian. */
export const hintsDue = (word: string, passed: number) => HINT_AT.slice(0, hintCount(word)).filter((f) => passed >= f).length;

// ---------- trạng thái ván ----------

export type Phase = "pick" | "draw" | "show" | "over";

/** Một người đoán đúng: uid, lần đoán thứ mấy, điểm. */
export type Hit = { u: string; i: number; p: number };

/** Tổng kết một lượt. `end`: hết giờ / cả bàn đoán đúng / người vẽ bỏ đi / mất đáp án (đổi chủ phòng) / bỏ lượt. */
export type TurnEnd = "time" | "all" | "away" | "lost" | "skip";
export type Turn = { t: number; drawer: string; word: string | null; hits: Hit[]; dp: number; end: TurnEnd };

/** Phần công khai của ván (chủ phòng ghi vào `meta.dw`). */
export type DwPublic = {
  round: number;
  /** Thứ tự vẽ, chốt lúc bắt đầu ván. */
  order: string[];
  rounds: number;
  /** Thời gian vẽ mỗi lượt (ms). */
  time: number;
  hints: boolean;
  /** Lượt hiện tại, đếm từ 0; tổng số lượt = số người × số vòng. */
  turn: number;
  phase: Phase;
  drawer: string;
  /** Giờ máy chủ phòng lúc vào giai đoạn và hạn chót của giai đoạn. */
  since: number;
  until: number;
  /** Lượt đang vẽ: chỉ số từ người vẽ đã chọn (vô nghĩa nếu không có bộ từ bí mật), mức khó, khung đáp án. */
  pick?: number;
  tier?: Tier;
  mask?: string;
  /** Những người đã đoán đúng trong lượt, theo thứ tự. */
  hits: Hit[];
  /** Điểm cộng dồn tới hết lượt trước. */
  scores: Record<string, number>;
  /** Lượt vừa xong — hiện trong lúc lộ đáp án. */
  last?: Turn;
};

/** Bí mật của lượt, chỉ nằm trên máy chủ phòng. */
export type Secret = {
  round: number;
  turn: number;
  /** Mã ba từ để chọn: dễ, vừa, khó. */
  choices: number[];
  /** Mã từ người vẽ đã chọn. */
  word?: number;
  /** Thứ tự mở chữ cái gợi ý. */
  reveal: number[];
  /** Đã chấm tới lời đoán thứ mấy của từng người. */
  judged: Record<string, number>;
  /** Lời đoán gần đúng của từng người (chỉ số) — báo riêng người đó. */
  near: Record<string, number[]>;
};

/** Lời đoán sai công khai của lượt hiện tại (chủ phòng ghi vào `g:<ván>`). */
export type FeedItem = { u: string; i: number; t: string };
export type Feed = { turn: number; list: FeedItem[] };

export type HostState = { pub: DwPublic; secret: Secret | null; feed: Feed; used: number[] };

export type TickInput = {
  now: number;
  rand: () => number;
  /** Đang online (nhịp tim còn đều). */
  online: (uid: string) => boolean;
  /** Bao lâu (ms) chưa thấy người này. */
  silent: (uid: string) => number;
  /** Người vẽ đã chọn từ (chỉ số 0–2) cho lượt nào. */
  pick?: { turn: number; pick: number };
  /** Lời đoán (đã mở hộp) của từng người. */
  guesses: Record<string, { turn: number; list: string[] } | undefined>;
};

export const totalTurns = (pub: Pick<DwPublic, "order" | "rounds">) => pub.order.length * pub.rounds;
/** Vòng (đếm từ 1) của một lượt. */
export const roundOfTurn = (pub: Pick<DwPublic, "order">, t: number) => Math.floor(t / Math.max(1, pub.order.length)) + 1;

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ba từ để chọn, mỗi mức một từ; tránh từ phòng đã chơi (hết từ ở mức nào thì bốc lại cả mức đó). */
export function pickChoices(used: number[], rand: () => number): number[] {
  const seen = new Set(used);
  return ([0, 1, 2] as Tier[]).map((tier) => {
    const all = TIERS[tier].map((_, i) => wordId(tier, i));
    const fresh = all.filter((id) => !seen.has(id));
    const pool = fresh.length ? fresh : all;
    return pool[Math.floor(rand() * pool.length)];
  });
}

/** Bắt đầu ván: xáo thứ tự vẽ rồi vào lượt đầu. */
export function newMatch(round: number, players: string[], opts: DwOptions, used: number[], inp: Pick<TickInput, "now" | "rand" | "online">): HostState {
  const order = shuffle(players, inp.rand);
  const pub: DwPublic = {
    round,
    order,
    rounds: opts.rounds,
    time: opts.time * 1000,
    hints: opts.hints,
    turn: 0,
    phase: "pick",
    drawer: order[0],
    since: inp.now,
    until: inp.now,
    hits: [],
    scores: Object.fromEntries(order.map((u) => [u, 0])),
  };
  return beginTurn({ pub, secret: null, feed: { turn: 0, list: [] }, used }, 0, inp);
}

/** Vào lượt `t`: người vẽ vắng mặt thì bỏ lượt, hết lượt thì xong ván. */
function beginTurn(s: HostState, t: number, inp: Pick<TickInput, "now" | "rand" | "online">): HostState {
  const { now } = inp;
  const base: DwPublic = { ...s.pub, turn: t, hits: [], since: now };
  delete base.pick;
  delete base.tier;
  delete base.mask;
  delete base.last;
  const feed = { turn: t, list: [] };
  if (t >= totalTurns(base)) return { ...s, pub: { ...base, turn: s.pub.turn, phase: "over", until: now }, secret: null, feed: s.feed };
  const drawer = base.order[t % base.order.length];
  if (!inp.online(drawer)) {
    const last: Turn = { t, drawer, word: null, hits: [], dp: 0, end: "skip" };
    return { ...s, pub: { ...base, drawer, phase: "show", until: now + SKIP_MS, last }, secret: null, feed };
  }
  const secret: Secret = { round: base.round, turn: t, choices: pickChoices(s.used, inp.rand), reveal: [], judged: {}, near: {} };
  return { ...s, pub: { ...base, drawer, phase: "pick", until: now + PICK_MS }, secret, feed };
}

/** Kết thúc lượt: cộng điểm, lộ đáp án, đánh dấu từ đã chơi. */
function finish(s: HostState, end: TurnEnd, now: number): HostState {
  const { pub, secret } = s;
  const id = secret && secret.round === pub.round && secret.turn === pub.turn ? secret.word : undefined;
  const word = id === undefined ? null : (wordOf(id) ?? null);
  const dp = DRAWER_POINTS * pub.hits.length;
  const scores = { ...pub.scores };
  for (const h of pub.hits) scores[h.u] = (scores[h.u] ?? 0) + h.p;
  scores[pub.drawer] = (scores[pub.drawer] ?? 0) + dp;
  const last: Turn = { t: pub.turn, drawer: pub.drawer, word, hits: pub.hits, dp, end };
  const next: DwPublic = { ...pub, phase: "show", since: now, until: now + (word === null ? SKIP_MS : SHOW_MS), scores, last };
  delete next.mask;
  return { ...s, pub: next, used: id === undefined || s.used.includes(id) ? s.used : [...s.used, id] };
}

/** Chấm các lời đoán mới: đúng thì ghi điểm (và thôi chấm người đó), gần đúng thì báo riêng, sai thì công khai. */
function judge(s: HostState, word: string, inp: TickInput): HostState {
  const { pub } = s;
  const secret = { ...s.secret!, judged: { ...s.secret!.judged }, near: { ...s.secret!.near } };
  const hits = pub.hits.slice();
  let list = s.feed.list;
  const left = (pub.until - inp.now) / Math.max(1, pub.time);
  for (const u of pub.order) {
    if (u === pub.drawer || hits.some((h) => h.u === u)) continue;
    const box = inp.guesses[u];
    if (!box || box.turn !== pub.turn || !Array.isArray(box.list)) continue;
    const said = box.list.slice(0, GUESS_MAX);
    let i = secret.judged[u] ?? 0;
    for (; i < said.length; i++) {
      const text = typeof said[i] === "string" ? said[i].trim().slice(0, GUESS_LEN) : "";
      if (!text) continue;
      if (isRight(text, word)) {
        hits.push({ u, i, p: guessPoints(left) });
        i++;
        break;
      }
      if (isNear(text, word)) secret.near[u] = [...(secret.near[u] ?? []), i];
      else list = [...list, { u, i, t: text }];
    }
    secret.judged[u] = i;
  }
  if (list.length > FEED_MAX) list = list.slice(-FEED_MAX);
  const same = hits.length === pub.hits.length && list === s.feed.list && JSON.stringify(secret) === JSON.stringify(s.secret);
  if (same) return s;
  return { ...s, pub: hits.length === pub.hits.length ? pub : { ...pub, hits }, secret, feed: list === s.feed.list ? s.feed : { ...s.feed, list } };
}

/** Một bước điều hành của chủ phòng. Trả về chính `s` nếu không có gì đổi. */
export function tick(s: HostState, inp: TickInput): HostState {
  const { pub, secret } = s;
  const { now } = inp;
  const mine = !!secret && secret.round === pub.round && secret.turn === pub.turn;
  switch (pub.phase) {
    case "over":
      return s;
    case "show":
      return now >= pub.until ? beginTurn(s, pub.turn + 1, inp) : s;
    case "pick": {
      // Không có bộ từ của lượt (chủ phòng mới tiếp quản) thì không điều hành tiếp lượt này được.
      if (!mine) return finish(s, "lost", now);
      if (inp.silent(pub.drawer) >= AWAY_MS) return finish(s, "away", now);
      const chosen = inp.pick?.turn === pub.turn && [0, 1, 2].includes(inp.pick.pick) ? inp.pick.pick : now >= pub.until ? Math.floor(inp.rand() * 3) : -1;
      if (chosen < 0) return s;
      const id = secret!.choices[chosen];
      const word = wordOf(id) ?? "";
      return {
        ...s,
        pub: { ...pub, phase: "draw", pick: chosen, tier: tierOf(id), mask: maskOf(word, []), since: now, until: now + pub.time },
        secret: { ...secret!, word: id, reveal: shuffle(letterSlots(word), inp.rand) },
      };
    }
    case "draw": {
      const word = mine && secret!.word !== undefined ? wordOf(secret!.word) : undefined;
      if (!word) return finish(s, "lost", now);
      let next = judge(s, word, inp);
      if (pub.hints) {
        const due = hintsDue(word, (now - pub.since) / Math.max(1, pub.time));
        const mask = maskOf(word, next.secret!.reveal.slice(0, due));
        if (mask !== next.pub.mask) next = { ...next, pub: { ...next.pub, mask } };
      }
      const waiting = next.pub.order.filter((u) => u !== pub.drawer && inp.online(u) && !next.pub.hits.some((h) => h.u === u));
      if (next.pub.hits.length > 0 && !waiting.length) return finish(next, "all", now);
      if (now >= pub.until) return finish(next, "time", now);
      if (inp.silent(pub.drawer) >= AWAY_MS) return finish(next, "away", now);
      return next;
    }
  }
}

/** Điểm hiện tại: điểm cộng dồn cộng phần đang có trong lượt (người đoán đúng và người vẽ). */
export function liveScores(pub: DwPublic): Record<string, number> {
  const scores = { ...pub.scores };
  if (pub.phase !== "draw") return scores;
  for (const h of pub.hits) scores[h.u] = (scores[h.u] ?? 0) + h.p;
  if (pub.hits.length) scores[pub.drawer] = (scores[pub.drawer] ?? 0) + DRAWER_POINTS * pub.hits.length;
  return scores;
}

/** Bảng xếp hạng: điểm giảm dần, bằng điểm thì đồng hạng (hạng đếm từ 1), rồi theo thứ tự vẽ. */
export function standings(pub: DwPublic): { uid: string; score: number; rank: number }[] {
  const scores = liveScores(pub);
  const list = pub.order.map((uid, k) => ({ uid, score: scores[uid] ?? 0, k })).sort((a, b) => b.score - a.score || a.k - b.k);
  return list.map(({ uid, score }) => ({ uid, score, rank: list.findIndex((x) => x.score === score) + 1 }));
}

/** Người thắng: điểm cao nhất (có thể đồng hạng); không ai có điểm thì không ai thắng. */
export function winnersOf(pub: DwPublic): string[] {
  const top = standings(pub).filter((s) => s.rank === 1 && s.score > 0);
  return top.map((s) => s.uid);
}

// ---------- nét vẽ ----------

/** Khổ tranh logic (4:3); toạ độ nét vẽ là số nguyên trong khổ này. */
export const W = 800;
export const H = 600;

/** Bảng màu: màu 0 (trắng, trùng nền) cũng là cục tẩy. */
export const PALETTE = [
  "#ffffff",
  "#000000",
  "#7d7d7d",
  "#c8c8c8",
  "#e53935",
  "#ff8a00",
  "#ffd400",
  "#43c443",
  "#0f8a4c",
  "#29b6f6",
  "#1e4fd8",
  "#7b2ff7",
  "#ff6fb5",
  "#8d5524",
  "#f5c7a9",
  "#4a2c1a",
] as const;
export const ERASER = 0;
/** Cỡ nét (bán kính bút × 2, đơn vị logic). */
export const SIZES = [4, 9, 18, 36] as const;

/** Một nét: màu, cỡ, dãy điểm x0, y0, x1, y1… */
export type Stroke = { c: number; z: number; p: number[] };
/** Đổ màu vùng kín quanh điểm `p`. */
export type Fill = { f: number; p: [number, number] };
/** Hoàn tác thao tác vẽ gần nhất / xoá cả tranh. */
export type Op = Stroke | Fill | { u: 1 } | { x: 1 };

/** Mỗi nét tối đa chừng này điểm — nét dài hơn được tách thành nhiều nét nối nhau. */
export const MAX_POINTS = 240;
/** Số thao tác mỗi trang bản ghi tranh (`d:<ván>:<lượt>.<trang>:<uid>`). */
export const PAGE = 8;
/** Mỗi lượt tối đa chừng này thao tác. */
export const MAX_OPS = 1200;

const coord = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;

/** Kiểm tra một thao tác nhận qua mạng; null nếu sai khuôn. */
export function parseOp(raw: unknown): Op | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.u === 1) return { u: 1 };
  if (o.x === 1) return { x: 1 };
  const color = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < PALETTE.length;
  if ("f" in o) {
    const p = o.p as unknown[];
    return color(o.f) && Array.isArray(p) && p.length === 2 && coord(p[0], W) && coord(p[1], H) ? { f: o.f as number, p: [p[0] as number, p[1] as number] } : null;
  }
  const p = o.p as unknown[];
  if (!color(o.c) || !Number.isInteger(o.z) || (o.z as number) < 0 || (o.z as number) >= SIZES.length) return null;
  if (!Array.isArray(p) || p.length < 2 || p.length % 2 || p.length > MAX_POINTS * 2) return null;
  if (!p.every((v, i) => coord(v, i % 2 ? H : W))) return null;
  return { c: o.c as number, z: o.z as number, p: p as number[] };
}

export const isStroke = (op: Op): op is Stroke => "c" in op;
export const isFill = (op: Op): op is Fill => "f" in op;

/** Những thao tác còn hiện trên tranh: áp hoàn tác (gỡ thao tác vẽ / xoá gần nhất), bỏ phần trước lần xoá cuối. */
export function visibleOps(ops: Op[]): (Stroke | Fill)[] {
  const stack: Op[] = [];
  for (const op of ops) {
    if ("u" in op) stack.pop();
    else stack.push(op);
  }
  let from = 0;
  stack.forEach((op, i) => {
    if ("x" in op) from = i + 1;
  });
  return stack.slice(from).filter((op): op is Stroke | Fill => isStroke(op) || isFill(op));
}

/** Tranh có gì để hoàn tác không. */
export const canUndo = (ops: Op[]) => ops.reduce((n, op) => ("u" in op ? Math.max(0, n - 1) : n + 1), 0) > 0;
