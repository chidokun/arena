/**
 * Luật Undercover. Máy chủ phòng là người điều hành: giữ bí mật của ván (`Secret` — phe của từng người, cặp từ
 * khoá) và công bố phần ai cũng biết (`Public` — giai đoạn, thứ tự thảo luận, các mô tả, phiếu bầu, ai đã bị loại).
 * Ván chạy theo vòng: phát từ (lật bài, chốt thứ tự thảo luận) → [mô tả (lần lượt từng người, bắt buộc, không đếm
 * giờ) → thảo luận tự do trong khung chat → biểu quyết (ai bấm cũng được) → (bỏ phiếu phụ) → (chủ phòng phá hoà) →
 * loại một người, lộ phe → (phe Trắng đoán từ)].
 *
 * Mọi bước là hàm thuần trên (Public, Secret) + đầu vào (mô tả, phiếu bầu, lời đoán — đều công khai —, giờ, hàm ngẫu nhiên)
 * nên chạy được trong unit test, không phụ thuộc mạng.
 */
import { PAIRS } from "./undercover-words.ts";

export type Role = "civilian" | "undercover" | "white";

export const ROLES: Record<Role, { name: string; team: string; emoji: string; brief: string }> = {
  civilian: {
    name: "Dân",
    team: "Phe Dân",
    emoji: "🙂",
    brief: "Nhận từ khoá chung của số đông. Mô tả để chứng minh mình là người một nhà, tìm và loại hết Gián Điệp cùng phe Trắng.",
  },
  undercover: {
    name: "Gián Điệp",
    team: "Phe Gián Điệp",
    emoji: "🕵️",
    brief: "Nhận một từ khoá khác nhưng na ná từ của phe Dân. Mô tả khéo để trà trộn, sống sót tới khi đủ sức áp đảo phiếu bầu.",
  },
  white: {
    name: "Trắng",
    team: "Phe Trắng",
    emoji: "👤",
    brief: "Không có từ khoá. Nghe người khác mô tả để đoán chủ đề và nói sao cho khỏi lộ; bị loại thì được đoán từ của phe Dân — đúng là thắng.",
  },
};

/** Thứ tự hiện các phe. */
export const ROLE_ORDER: Role[] = ["civilian", "undercover", "white"];

export type Tie = "random" | "none" | "host";

export type UcOptions = {
  /** Số Gián Điệp; 0 là tự động theo số người chơi. */
  undercovers: number;
  /** Có phe Trắng trong ván. */
  white: boolean;
  /** Số người phe Trắng khi có. */
  whites: number;
  /** Báo phe cho người chơi; tắt thì phe Dân và Gián Điệp chỉ thấy từ khoá, tự đoán mình thuộc phe nào. */
  reveal: boolean;
  /** Bỏ phiếu phụ vẫn hoà: bốc thăm, không ai bị loại, hoặc chủ phòng (không chơi) chọn. */
  tie: Tie;
  /** Chủ phòng cũng chơi; tắt thì chủ phòng là người điều hành — thấy hết phe và từ khoá, tự đặt cặp từ được. */
  hostPlays: boolean;
};

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;
export const MAX_UNDERCOVERS = 9;
export const MAX_WHITES = 2;
export const GUESS_TEXT = 60;
export const CLUE_TEXT = 80;
export const TIE_NAMES: Record<Tie, string> = { random: "Bốc thăm", none: "Không ai bị loại", host: "Chủ phòng chọn" };

export const DEFAULT_OPTIONS: UcOptions = {
  undercovers: 0,
  white: true,
  whites: 1,
  reveal: true,
  tie: "random",
  hostPlays: true,
};

/** Thời lượng các giai đoạn (ms). */
export const DURATION = {
  /** Phát từ: chờ mọi người lật bài, tối đa bấy nhiêu. */
  intro: 30000,
  /** Phát từ kéo dài ít nhất bấy nhiêu (để kịp xem lá bài vừa lật). */
  introMin: 3000,
  vote: 60000,
  /** Người bị loại bị lật bài phe. */
  verdict: 7000,
  /** Phe Trắng đoán từ khoá. */
  guess: 45000,
  /** Công bố phe Trắng đoán đúng hay sai. */
  judged: 6000,
};

/** Tuỳ chọn trong `meta.opts`; giá trị lạ thì về mặc định. */
export function normOptions(o: unknown): UcOptions {
  const x = (o && typeof o === "object" ? o : {}) as Partial<Record<keyof UcOptions, unknown>>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  const d = DEFAULT_OPTIONS;
  const hostPlays = bool(x.hostPlays, d.hostPlays);
  const tie: Tie = x.tie === "none" || x.tie === "random" || x.tie === "host" ? x.tie : d.tie;
  return {
    undercovers: int(x.undercovers, 0, MAX_UNDERCOVERS) ? (x.undercovers as number) : d.undercovers,
    white: bool(x.white, d.white),
    whites: int(x.whites, 1, MAX_WHITES) ? (x.whites as number) : d.whites,
    reveal: bool(x.reveal, d.reveal),
    // Chủ phòng cũng chơi thì không được tự chọn người bị loại.
    tie: tie === "host" && hostPlays ? "random" : tie,
    hostPlays,
  };
}

/**
 * Số Gián Điệp tự động: nhiều nhất có thể mà vẫn ít hơn phe Dân ít nhất 2 người (phe Trắng tính riêng),
 * vd 6 người không có phe Trắng là 4 Dân / 2 Gián Điệp.
 */
export const autoUndercovers = (n: number, whites = 0) => Math.max(1, Math.floor((n - whites - 2) / 2));

export type Cast = Record<Role, number>;

/** Đội hình cho n người chơi; `error` nếu không chia được. */
export function castFor(n: number, opts: UcOptions): { cast: Cast; error?: string } {
  const white = opts.white ? opts.whites : 0;
  const undercover = opts.undercovers || autoUndercovers(n, white);
  const cast: Cast = { civilian: Math.max(0, n - undercover - white), undercover, white };
  if (n < MIN_PLAYERS) return { cast, error: `Cần ít nhất ${MIN_PLAYERS} người sẵn sàng` };
  if (n > MAX_PLAYERS) return { cast, error: `Tối đa ${MAX_PLAYERS} người chơi` };
  if (cast.civilian <= undercover)
    return {
      cast,
      error: `${undercover} Gián Điệp${white ? ` và ${white} phe Trắng` : ""} là quá nhiều cho ${n} người — phe Dân phải đông hơn Gián Điệp${white ? " (tắt phe Trắng hoặc thêm người)" : ""}`,
    };
  return { cast };
}

export function shuffle<T>(list: readonly T[], rand: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Chia phe ngẫu nhiên. */
export function deal(players: string[], cast: Cast, rand: () => number): Record<string, Role> {
  const deck = ROLE_ORDER.flatMap((r) => Array<Role>(cast[r]).fill(r));
  const order = shuffle(players, rand);
  return Object.fromEntries(order.map((uid, i) => [uid, deck[i] ?? "civilian"]));
}

/** Cặp từ của ván; `id` là mã cặp trong bộ từ (cặp chủ phòng tự đặt thì không có). */
export type Words = { civilian: string; undercover: string; id?: number };

/** Bốc một cặp từ chưa dùng (`used`: các mã cặp đã chơi); dùng hết thì bốc lại từ đầu. Từ nào thuộc phe Dân cũng bốc ngẫu nhiên. */
export function pickWords(used: readonly number[], rand: () => number): Words & { id: number } {
  const done = new Set(used);
  const fresh = PAIRS.map((_, i) => i).filter((i) => !done.has(i));
  const from = fresh.length ? fresh : PAIRS.map((_, i) => i);
  const id = from[Math.floor(rand() * from.length)];
  const [a, b] = PAIRS[id];
  const [civilian, undercover] = rand() < 0.5 ? [a, b] : [b, a];
  return { civilian, undercover, id };
}

/** Chuẩn hoá để so từ: bỏ dấu, chữ thường, bỏ ký tự lạ — "Cà phê!" ≡ "ca phe". */
export function normWord(s: string) {
  return s
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Phe Trắng đoán đúng từ khoá (không phân biệt dấu, hoa thường, khoảng trắng). */
export function sameWord(guess: string, word: string) {
  const a = normWord(guess).replace(/ /g, "");
  return !!a && a === normWord(word).replace(/ /g, "");
}

/** Câu `text` có nói thẳng từ khoá `word` không (khớp nguyên từ, không phân biệt dấu). */
export function mentions(text: string, word: string) {
  const w = normWord(word);
  return !!w && ` ${normWord(text)} `.includes(` ${w} `);
}

/** Mô tả hợp lệ: không rỗng, ngắn gọn, không nói thẳng từ khoá của chính mình. */
export function clueError(text: string, word: string | null | undefined) {
  const t = text.trim();
  if (!t) return "Hãy nhập một từ hoặc một câu ngắn";
  if (t.length > CLUE_TEXT) return `Tối đa ${CLUE_TEXT} ký tự`;
  if (word && mentions(t, word)) return "Không được nói thẳng từ khoá";
}

// ---------- trạng thái ván ----------

export type Stage = "intro" | "clue" | "talk" | "vote" | "revote" | "decide" | "verdict" | "guess" | "judged";

/** Người bị loại: bị biểu quyết loại hoặc rời ván (rớt mạng / bị mời ra). Phe luôn được công khai. */
export type Out = { uid: string; day: number; role: Role; how: "vote" | "left" };

/** Một lượt bỏ phiếu đã kết thúc. */
export type Tally = { day: number; stage: "vote" | "revote"; ballots: Record<string, string> };

/** Lời đoán của phe Trắng vừa bị loại; null là hết giờ mà không đoán. */
export type Guess = { uid: string; day: number; text: string | null; right: boolean };

/** Mô tả của một người trong vòng `day`; null là bị chủ phòng bỏ qua lượt. */
export type Clue = { uid: string; day: number; text: string | null };

/** Ai gọi biểu quyết ở vòng nào. */
export type Call = { day: number; uid?: string };

/** Phần ai cũng biết, nằm trong `meta.uc`. */
export type Public = {
  round: number;
  stage: Stage;
  /** Vòng chơi thứ mấy. */
  day: number;
  /** Giờ máy chủ phòng lúc vào giai đoạn và hạn chót. */
  since: number;
  until: number;
  alive: string[];
  outs: Out[];
  cast: Cast;
  /** Người chơi có được báo phe không (luật `reveal` lúc bắt đầu ván). */
  reveal: boolean;
  /** Thứ tự thảo luận, chốt lúc phát từ (người bị loại thì bỏ qua). */
  order: string[];
  /** Lượt mô tả: chỉ số trong `order` của người đang mô tả. */
  turn: number;
  clues: Clue[];
  tallies: Tally[];
  calls: Call[];
  guesses: Guess[];
  /** Bỏ phiếu phụ / chủ phòng phá hoà: chỉ được chọn những người này. */
  candidates?: string[];
  /** Người bị loại vòng này; null là không ai. */
  out?: string | null;
  /** Người bị loại được chọn bằng cách phá hoà. */
  tiebreak?: "random" | "host";
  winner?: Role;
  winners?: string[];
  /** Hết ván: phe của mọi người và cặp từ khoá. */
  roles?: Record<string, Role>;
  words?: Words;
};

/** Bí mật của người điều hành. */
export type Secret = { roles: Record<string, Role>; words: Words };

export type Game = { pub: Public; sec: Secret };

/** Mô tả công khai `c:<ván>:<uid>` / lời đoán công khai của phe Trắng `w:<ván>:<uid>`. */
export type Say = { day: number; text: string };

/**
 * Bản ghi công khai `v:<ván>:<uid>`. Phát từ: `ready` là đã lật bài. Thảo luận: `ready` là bấm biểu quyết (`at`: lúc
 * bấm, để biết ai gọi trước). Biểu quyết: `target` là người mình xác nhận loại.
 */
export type Vote = { day: number; stage: Stage; target?: string; ready?: boolean; at?: number };

export type Input = {
  clues: Record<string, Say | undefined>;
  votes: Record<string, Vote | undefined>;
  guesses: Record<string, Say | undefined>;
  now: number;
  rand: () => number;
  opts: UcOptions;
};

function enter(pub: Public, stage: Stage, now: number, ms: number) {
  pub.stage = stage;
  pub.since = now;
  pub.until = now + ms;
}

/** Thứ tự thảo luận: xáo ngẫu nhiên, người nói đầu không phải phe Trắng. */
export function talkOrder(players: string[], roles: Record<string, Role>, rand: () => number) {
  const order = shuffle(players, rand);
  const s = Math.max(0, order.findIndex((u) => roles[u] !== "white"));
  return [...order.slice(s), ...order.slice(0, s)];
}

export function newGame(round: number, players: string[], opts: UcOptions, words: Words, now: number, rand: () => number): Game {
  const { cast } = castFor(players.length, opts);
  const roles = deal(players, cast, rand);
  return {
    pub: {
      round,
      stage: "intro",
      day: 1,
      since: now,
      until: now + DURATION.intro,
      alive: [...players],
      outs: [],
      cast,
      reveal: opts.reveal,
      order: talkOrder(players, roles, rand),
      turn: 0,
      clues: [],
      tallies: [],
      calls: [],
      guesses: [],
    },
    sec: { roles, words: { civilian: words.civilian, undercover: words.undercover, ...(words.id !== undefined ? { id: words.id } : {}) } },
  };
}

const count = (alive: string[], roles: Record<string, Role>, r: Role) => alive.filter((u) => roles[u] === r).length;

/**
 * Phe thắng nếu ván đã ngã ngũ: hết Gián Điệp và phe Trắng thì phe Dân thắng; Gián Điệp đông bằng phe Dân thì áp đảo
 * được phiếu bầu; chỉ còn hai người mà phe đối lập vẫn còn thì phe đó sống sót tới cùng.
 */
export function winnerOf(alive: string[], roles: Record<string, Role>): Role | undefined {
  const uc = count(alive, roles, "undercover");
  const wh = count(alive, roles, "white");
  const cv = count(alive, roles, "civilian");
  if (uc + wh === 0) return "civilian";
  if (uc > 0 && uc >= cv) return "undercover";
  if (alive.length <= 2) return uc > 0 ? "undercover" : "white";
}

/** Người thắng: cả phe thắng (kể cả người đã bị loại); Gián Điệp thắng thì phe Trắng còn sống cũng thắng. */
export function winnersOf(winner: Role, roles: Record<string, Role>, alive: string[]) {
  return Object.keys(roles).filter((u) => roles[u] === winner || (winner === "undercover" && roles[u] === "white" && alive.includes(u)));
}

/** Lộ hết bí mật khi hết ván (thắng thua hoặc chủ phòng dừng). */
export function unveil(g: Game): Public {
  return { ...g.pub, roles: { ...g.sec.roles }, words: { ...g.sec.words } };
}

function finish(g: Game, w: Role) {
  g.pub = { ...unveil(g), winner: w, winners: winnersOf(w, g.sec.roles, g.pub.alive) };
}

function settle(g: Game) {
  const w = winnerOf(g.pub.alive, g.sec.roles);
  if (w) finish(g, w);
  return !!w;
}

/** Lời đoán của người bị loại vòng này (nếu đã đoán). */
export const guessOf = (pub: Public) => pub.guesses.find((x) => x.uid === pub.out && x.day === pub.day);

/** Phe Trắng vừa bị loại và chưa đoán xong: chưa được kết thúc ván. */
const whitePending = (g: Game) =>
  (g.pub.stage === "verdict" || g.pub.stage === "guess") && !!g.pub.out && g.sec.roles[g.pub.out] === "white" && !guessOf(g.pub);

function eliminate(g: Game, uid: string, how: Out["how"]) {
  if (!g.pub.alive.includes(uid)) return;
  g.pub.alive = g.pub.alive.filter((u) => u !== uid);
  g.pub.outs.push({ uid, day: g.pub.day, role: g.sec.roles[uid], how });
}

/** Đếm phiếu: người nhiều phiếu nhất (hoà thì nhiều người). */
export function tally(ballots: Record<string, string>) {
  const counts: Record<string, number> = {};
  for (const t of Object.values(ballots)) counts[t] = (counts[t] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  const top =
    max > 0
      ? Object.keys(counts)
          .filter((u) => counts[u] === max)
          .sort()
      : [];
  return { counts, max, top };
}

/** Các phiếu đã xác nhận của lượt bỏ phiếu hiện tại: người còn trong ván loại một người khác còn trong ván. */
export function ballotsOf(pub: Public, votes: Record<string, Vote | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  if (pub.stage !== "vote" && pub.stage !== "revote") return out;
  for (const voter of pub.alive) {
    const v = votes[voter];
    if (!v || v.day !== pub.day || v.stage !== pub.stage || typeof v.target !== "string") continue;
    const t = v.target;
    if (t !== voter && pub.alive.includes(t) && (!pub.candidates || pub.candidates.includes(t))) out[voter] = t;
  }
  return out;
}

/** Phát từ: những người đã lật bài. Thảo luận: những người đã bấm biểu quyết (ai bấm trước đứng trước). */
export function readyOf(pub: Public, votes: Record<string, Vote | undefined>) {
  if (pub.stage !== "intro" && pub.stage !== "talk") return [];
  const at = (u: string) => votes[u]?.at ?? 0;
  return pub.alive
    .filter((u) => {
      const v = votes[u];
      return !!v && v.day === pub.day && v.stage === pub.stage && !!v.ready;
    })
    .sort((a, b) => at(a) - at(b));
}

/** Thứ tự thảo luận của vòng hiện tại (bỏ người đã bị loại). */
export const speakers = (pub: Public) => pub.order.filter((u) => pub.alive.includes(u));

/** Người đang mô tả; undefined nếu không phải lượt mô tả. */
export const speakerOf = (pub: Public) => (pub.stage === "clue" ? pub.order[pub.turn] : undefined);

/** Mô tả của vòng hiện tại. */
export const cluesOf = (pub: Public, day = pub.day) => pub.clues.filter((c) => c.day === day);

/** Từ lượt `from` trở đi, tới người còn trong ván kế tiếp; hết người thì sang thảo luận tự do. Không đếm giờ. */
function seek(g: Game, from: number, now: number) {
  const { pub } = g;
  let i = from;
  while (i < pub.order.length && !pub.alive.includes(pub.order[i])) i++;
  pub.turn = i;
  if (i < pub.order.length) enter(pub, "clue", now, 0);
  else enter(pub, "talk", now, 0);
}

/** Vào vòng mới: lần lượt mô tả theo thứ tự thảo luận. */
function startClues(g: Game, now: number) {
  const { pub } = g;
  delete pub.out;
  delete pub.tiebreak;
  delete pub.candidates;
  seek(g, 0, now);
}

function startVote(g: Game, now: number, by?: string) {
  g.pub.calls.push({ day: g.pub.day, ...(by ? { uid: by } : {}) });
  enter(g.pub, "vote", now, DURATION.vote);
}

/** Loại `uid` (null: không ai) rồi lật bài phe; ván ngã ngũ thì kết thúc luôn (trừ khi phải chờ phe Trắng đoán). */
function verdict(g: Game, uid: string | null, now: number, tiebreak?: "random" | "host") {
  const { pub } = g;
  pub.out = uid;
  delete pub.candidates;
  if (tiebreak) pub.tiebreak = tiebreak;
  enter(pub, "verdict", now, DURATION.verdict);
  if (uid) eliminate(g, uid, "vote");
  if (!whitePending(g)) settle(g);
}

function nextRound(g: Game, now: number) {
  if (settle(g)) return;
  g.pub.day += 1;
  startClues(g, now);
}

function judge(g: Game, text: string | null, now: number) {
  const { pub, sec } = g;
  const right = text !== null && sameWord(text, sec.words.civilian);
  pub.guesses.push({ uid: pub.out!, day: pub.day, text, right });
  enter(pub, "judged", now, DURATION.judged);
  if (right) finish(g, "white");
}

/** Một bước của người điều hành: nhận phiếu / lời đoán, chuyển giai đoạn khi đủ điều kiện hoặc hết giờ. Không sửa `g0`. */
export function advance(g0: Game, inp: Input): Game {
  const g: Game = structuredClone(g0);
  const { pub } = g;
  if (pub.winner) return g;
  const { now, opts, rand } = inp;

  switch (pub.stage) {
    case "intro": {
      const flipped = readyOf(pub, inp.votes);
      if (now >= pub.until || (flipped.length >= pub.alive.length && now >= pub.since + DURATION.introMin)) startClues(g, now);
      break;
    }
    case "clue": {
      // Có thể nhận liền nhiều lượt (mô tả đến trễ một nhịp, người đã rời ván).
      for (let guard = 0; pub.stage === "clue" && guard <= pub.order.length; guard++) {
        const uid = pub.order[pub.turn];
        const c = inp.clues[uid];
        const text = c && c.day === pub.day && typeof c.text === "string" ? c.text.trim().slice(0, CLUE_TEXT) : "";
        if (!text) break;
        pub.clues.push({ uid, day: pub.day, text });
        seek(g, pub.turn + 1, now);
      }
      break;
    }
    case "talk": {
      const ready = readyOf(pub, inp.votes);
      if (ready.length) startVote(g, now, ready[0]);
      break;
    }
    case "vote":
    case "revote": {
      const ballots = ballotsOf(pub, inp.votes);
      if (now < pub.until && Object.keys(ballots).length < pub.alive.length) break;
      pub.tallies.push({ day: pub.day, stage: pub.stage, ballots });
      const { top } = tally(ballots);
      if (top.length === 1) verdict(g, top[0], now);
      else if (top.length === 0) verdict(g, null, now);
      else if (pub.stage === "vote") {
        enter(pub, "revote", now, DURATION.vote);
        pub.candidates = top;
      } else if (opts.tie === "random") verdict(g, top[Math.floor(rand() * top.length)], now, "random");
      else if (opts.tie === "host") {
        pub.candidates = top;
        enter(pub, "decide", now, 0);
      } else verdict(g, null, now);
      break;
    }
    case "decide": {
      // Người hoà rời ván hết chỉ còn một (hoặc không còn ai) thì khỏi phải chờ chủ phòng.
      const left = (pub.candidates ?? []).filter((u) => pub.alive.includes(u));
      if (left.length <= 1) verdict(g, left[0] ?? null, now, left.length ? "host" : undefined);
      break;
    }
    case "verdict": {
      if (now < pub.until) break;
      if (whitePending(g)) enter(pub, "guess", now, DURATION.guess);
      else nextRound(g, now);
      break;
    }
    case "guess": {
      const s = inp.guesses[pub.out!];
      const text = s && s.day === pub.day && typeof s.text === "string" ? s.text.trim().slice(0, GUESS_TEXT) : "";
      if (text) judge(g, text, now);
      else if (now >= pub.until) judge(g, null, now);
      break;
    }
    case "judged": {
      if (now >= pub.until) nextRound(g, now);
      break;
    }
  }
  return g;
}

/** Chủ phòng (người điều hành) chọn người bị loại khi bỏ phiếu phụ vẫn hoà. */
export function decide(g0: Game, uid: string, now: number): Game {
  if (g0.pub.stage !== "decide" || g0.pub.winner || !g0.pub.candidates?.includes(uid) || !g0.pub.alive.includes(uid)) return g0;
  const g: Game = structuredClone(g0);
  verdict(g, uid, now, "host");
  return g;
}

/** Chủ phòng bỏ qua lượt mô tả của người đang treo máy. */
export function skipClue(g0: Game, now: number): Game {
  if (g0.pub.stage !== "clue" || g0.pub.winner) return g0;
  const g: Game = structuredClone(g0);
  g.pub.clues.push({ uid: g.pub.order[g.pub.turn], day: g.pub.day, text: null });
  seek(g, g.pub.turn + 1, now);
  return g;
}

/** Chủ phòng không chơi gọi biểu quyết ngay. */
export function skipTalk(g0: Game, now: number, by?: string): Game {
  if (g0.pub.stage !== "talk" || g0.pub.winner) return g0;
  const g: Game = structuredClone(g0);
  startVote(g, now, by);
  return g;
}

/** Người chơi rời ván (rớt mạng quá lâu, bị mời ra): bị loại ngay, lộ phe, có thể khiến ván ngã ngũ. */
export function depart(g0: Game, uid: string): Game {
  if (!g0.pub.alive.includes(uid) || g0.pub.winner) return g0;
  const g: Game = structuredClone(g0);
  eliminate(g, uid, "left");
  if (g.pub.candidates) g.pub.candidates = g.pub.candidates.filter((u) => u !== uid);
  if (!whitePending(g) && g.pub.stage !== "judged" && settle(g)) return g;
  // Người đang mô tả rời ván thì sang lượt người kế.
  if (g.pub.stage === "clue" && g.pub.order[g.pub.turn] === uid) seek(g, g.pub.turn + 1, g.pub.since);
  return g;
}

/** Phần bí mật người điều hành gửi riêng cho một người chơi: từ khoá (phe Trắng: null), phe nếu được báo. */
export type SecretView = {
  word?: string | null;
  role?: Role;
  /** Người xem / người điều hành không chơi: thấy hết. */
  watch?: WatchView;
};

export type WatchView = { roles: Record<string, Role>; words: Words };

export function secretFor(g: Game, uid: string): SecretView | undefined {
  const role = g.sec.roles[uid];
  if (!role) return undefined;
  return { word: role === "white" ? null : g.sec.words[role], ...(g.pub.reveal || role === "white" ? { role } : {}) };
}

export const watchView = (g: Game): WatchView => ({ roles: { ...g.sec.roles }, words: { ...g.sec.words } });

export const STAGE_NAMES: Record<Stage, string> = {
  intro: "Phát từ",
  clue: "Mô tả",
  talk: "Thảo luận",
  vote: "Biểu quyết",
  revote: "Bỏ phiếu phụ",
  decide: "Phá hoà",
  verdict: "Loại",
  guess: "Phe Trắng đoán",
  judged: "Kết quả đoán",
};

/** "A", "A và B", "A, B và C". */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} và ${names[names.length - 1]}`;
}
