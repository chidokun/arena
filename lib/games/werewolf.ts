/**
 * Luật Ma Sói. Máy chủ phòng là quản trò: giữ bí mật của ván (`Secret` — vai của từng người, bình thuốc, kế hoạch
 * đêm nay, diễn biến) và công bố phần ai cũng biết (`Public` — giai đoạn, ai còn sống, ai đã chết, kết quả bỏ phiếu).
 * Ván chạy theo vòng: nhận vai → [đêm → đếm ngược trời sáng → ngày (thảo luận) → bỏ phiếu → (bỏ phiếu lại) → tuyên án].
 * Ban đêm mọi vai có chức năng cùng thức dậy một lúc (không gọi lần lượt); ai cũng chốt xong thì trời sáng.
 *
 * Mọi bước là hàm thuần trên (Public, Secret) + đầu vào (hành động đêm đã giải mã, phiếu bầu công khai, giờ, hàm
 * ngẫu nhiên) nên chạy được trong unit test, không phụ thuộc mạng.
 */

export type Role = "wolf" | "villager" | "seer" | "guard" | "witch";
export type Team = "wolf" | "village";

export const ROLES: Record<Role, { name: string; emoji: string; team: Team; brief: string }> = {
  wolf: { name: "Ma Sói", emoji: "🐺", team: "wolf", brief: "Mỗi đêm cùng bầy chọn một người để cắn. Ban ngày giả làm dân lành, đừng để bị lộ." },
  villager: { name: "Dân Làng", emoji: "👨‍🌾", team: "village", brief: "Không có năng lực đặc biệt. Ban ngày suy luận, tranh luận và bỏ phiếu treo Sói." },
  seer: { name: "Tiên Tri", emoji: "🔮", team: "village", brief: "Mỗi đêm soi một người để biết người đó có phải Sói hay không." },
  guard: { name: "Bảo Vệ", emoji: "🛡️", team: "village", brief: "Mỗi đêm chọn một người để che chở — Sói cắn người đó sẽ không chết." },
  witch: {
    name: "Phù Thủy",
    emoji: "🧙",
    team: "village",
    brief: "Có một bình cứu người bị Sói cắn và một bình độc giết một người, mỗi bình dùng một lần cả ván.",
  },
};

/** Thứ tự hiện các vai (đội hình, bảng lộ vai). */
export const ROLE_ORDER: Role[] = ["wolf", "seer", "guard", "witch", "villager"];

export type WolfOptions = {
  /** Số Sói; 0 là tự động theo số người chơi. */
  wolves: number;
  seer: boolean;
  guard: boolean;
  witch: boolean;
  /** Có Dân Làng (lấp phần còn lại); tắt thì số người phải vừa khít số vai. */
  villager: boolean;
  /** Bảo vệ được chính mình. */
  guardSelf: boolean;
  /** Bảo vệ cùng một người hai đêm liên tiếp. */
  guardRepeat: boolean;
  /** Hoà phiếu: bỏ phiếu lại giữa những người hoà (một lần), hoặc không ai bị treo. */
  tie: "revote" | "none";
  /** Quản trò (chủ phòng) cũng được chia vai như một người chơi; tắt thì chỉ xem hết vai và điều khiển ván. */
  hostPlays: boolean;
  /** Thời gian thảo luận ban ngày (giây); 0 là quản trò điều khiển — không đếm giờ, quản trò bấm mới bỏ phiếu. */
  talk: number;
};

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 16;
export const MAX_WOLVES = 5;
export const TALKS = [60, 120, 0];
/** Tên lựa chọn thời gian thảo luận. */
export const talkName = (talk: number) => (talk ? `${talk / 60} phút` : "Quản trò điều khiển");

export const DEFAULT_OPTIONS: WolfOptions = {
  wolves: 0,
  seer: true,
  guard: true,
  witch: true,
  villager: true,
  guardSelf: true,
  guardRepeat: false,
  tie: "revote",
  hostPlays: false,
  talk: 120,
};

/** Thời lượng các giai đoạn (ms). */
export const DURATION = {
  /** "Trời tối rồi…" rồi lật bài vai của từng người. */
  intro: 15000,
  /** Đêm kéo dài ít nhất bấy nhiêu, để độ dài đêm không tiết lộ ai đã chết. */
  nightMin: 6000,
  /** Mọi người chốt xong: đếm ngược 3, 2, 1 rồi trời sáng. */
  dawn: 3000,
  vote: 45000,
  /** Người bị treo bay lên, lật bài Sói / không phải Sói. */
  verdict: 9000,
};

/** Tuỳ chọn trong `meta.opts`; giá trị lạ thì về mặc định. */
export function normOptions(o: unknown): WolfOptions {
  const x = (o && typeof o === "object" ? o : {}) as Partial<Record<keyof WolfOptions, unknown>>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const d = DEFAULT_OPTIONS;
  return {
    wolves: Number.isInteger(x.wolves) && (x.wolves as number) >= 0 && (x.wolves as number) <= MAX_WOLVES ? (x.wolves as number) : d.wolves,
    seer: bool(x.seer, d.seer),
    guard: bool(x.guard, d.guard),
    witch: bool(x.witch, d.witch),
    villager: bool(x.villager, d.villager),
    guardSelf: bool(x.guardSelf, d.guardSelf),
    guardRepeat: bool(x.guardRepeat, d.guardRepeat),
    tie: x.tie === "none" ? "none" : "revote",
    hostPlays: bool(x.hostPlays, d.hostPlays),
    talk: TALKS.includes(x.talk as number) ? (x.talk as number) : d.talk,
  };
}

/** Số Sói tự động: 4–5 người 1 Sói, 6–8 người 2, 9–11 người 3, 12–14 người 4, từ 15 người 5. */
export const autoWolves = (n: number) => (n < 6 ? 1 : Math.min(MAX_WOLVES, Math.floor(n / 3)));

export type Cast = Record<Role, number>;

/** Đội hình cho n người chơi; `error` nếu không chia được. */
export function castFor(n: number, opts: WolfOptions): { cast: Cast; error?: string } {
  const wolves = opts.wolves || autoWolves(n);
  const cast: Cast = { wolf: wolves, seer: opts.seer ? 1 : 0, guard: opts.guard ? 1 : 0, witch: opts.witch ? 1 : 0, villager: 0 };
  const special = cast.seer + cast.guard + cast.witch;
  cast.villager = opts.villager ? Math.max(0, n - wolves - special) : 0;
  if (n < MIN_PLAYERS) return { cast, error: `Cần ít nhất ${MIN_PLAYERS} người sẵn sàng` };
  if (n > MAX_PLAYERS) return { cast, error: `Tối đa ${MAX_PLAYERS} người chơi` };
  if (wolves * 2 >= n) return { cast, error: `${wolves} Sói là quá nhiều cho ${n} người — Sói phải ít hơn nửa làng` };
  if (wolves + special > n) return { cast, error: `Không đủ người cho các vai đã chọn — cần ít nhất ${wolves + special} người` };
  if (!opts.villager && wolves + special < n)
    return { cast, error: `Không có Dân Làng thì cần đúng ${wolves + special} người (đang có ${n}) — bật Dân Làng hoặc thêm vai` };
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

/** Chia vai ngẫu nhiên. */
export function deal(players: string[], cast: Cast, rand: () => number): Record<string, Role> {
  const deck = ROLE_ORDER.flatMap((r) => Array<Role>(cast[r]).fill(r));
  const order = shuffle(players, rand);
  return Object.fromEntries(order.map((uid, i) => [uid, deck[i] ?? "villager"]));
}

// ---------- trạng thái ván ----------

export type Stage = "intro" | "night" | "dawn" | "day" | "vote" | "revote" | "verdict";

export type Death = {
  uid: string;
  day: number;
  /** Chết trong đêm (không nói vì sao), bị treo cổ, hoặc bỏ làng (rớt mạng / bị mời ra). Vai giữ bí mật tới hết ván. */
  how: "night" | "hang" | "left";
  /** Người bị treo: có phải Sói không (chỉ công bố chừng đó). */
  wolf?: boolean;
};

/** Diễn biến của một ngày (đêm hôm trước + ban ngày), công bố khi hết ván. */
export type Chapter = {
  day: number;
  /** Nạn nhân bầy Sói chọn; null là không cắn ai. */
  bite?: string | null;
  guard?: string;
  seer?: { target: string; wolf: boolean };
  /** Người Phù Thủy cứu (chỉ ghi khi cứu đúng người bị cắn). */
  save?: string;
  poison?: string;
  /** Chết trong đêm. */
  died?: string[];
  /** Các lượt bỏ phiếu trong ngày (lượt đầu, có thể thêm lượt bỏ phiếu lại). */
  votes?: Record<string, string | null>[];
  hanged?: string | null;
  left?: string[];
};

/** Phần ai cũng biết, nằm trong `meta.ww`. */
export type Public = {
  round: number;
  stage: Stage;
  /** Đêm `day` rồi tới ngày `day`. */
  day: number;
  /** Giờ máy quản trò lúc vào giai đoạn và hạn chót. */
  since: number;
  until: number;
  alive: string[];
  deaths: Death[];
  cast: Cast;
  /** Bỏ phiếu lại: chỉ được bầu những người này. */
  candidates?: string[];
  /** Tuyên án: người bị treo; null là không ai. */
  hanged?: string | null;
  winner?: Team;
  /** Hết ván: vai của mọi người và diễn biến từng ngày. */
  roles?: Record<string, Role>;
  story?: Chapter[];
};

export type Whisper = { id: string; uid: string; text: string };

type Plan = {
  guard?: string;
  /** Lựa chọn của từng con Sói. */
  wolves: Record<string, string>;
  /** Tiên Tri đang chọn / đã soi (đã soi thì có trong `seen`). */
  seerPick?: string;
  seer?: string;
  /** Phù Thủy muốn cứu người này (chỉ có tác dụng nếu đúng là người bị cắn). */
  save?: string;
  poison?: string;
  /** Những người đã chốt hành động đêm nay. */
  done: Record<string, true>;
  /** Nạn nhân của bầy Sói, chốt khi hết đêm. */
  victim?: string | null;
};

/** Bí mật của quản trò. */
export type Secret = {
  roles: Record<string, Role>;
  potions: { save: boolean; poison: boolean };
  /** Người được bảo vệ đêm trước. */
  lastGuard: string | null;
  /** Nhật ký soi của Tiên Tri. */
  seen: { day: number; target: string; wolf: boolean }[];
  /** Bầy Sói thì thầm ban đêm. */
  whisper: Whisper[];
  night: Plan;
  story: Chapter[];
};

export type Game = { pub: Public; sec: Secret };

/** Hành động ban đêm một người gửi riêng cho quản trò (đã mã hoá). Trường vắng mặt là "không đổi". */
export type Action = {
  day: number;
  guard?: string;
  wolf?: string;
  seer?: string;
  /** Phù Thủy: cứu người này (null: thôi cứu). */
  save?: string | null;
  /** Phù Thủy: đầu độc người này (null: bỏ chọn). */
  poison?: string | null;
  /** Chốt hành động đêm nay. */
  done?: boolean;
  /** Vài lời thì thầm gần nhất của Sói (quản trò khử trùng lặp theo id). */
  say?: { id: string; text: string }[];
};

/** Phiếu công khai: `v:<ván>:<uid>`. Thảo luận thì `ready` là muốn bỏ phiếu sớm; bỏ phiếu thì `target` (null: bỏ qua). */
export type Vote = { day: number; stage: Stage; target?: string | null; ready?: boolean };

export type Input = {
  actions: Record<string, Action | undefined>;
  votes: Record<string, Vote | undefined>;
  now: number;
  rand: () => number;
  opts: WolfOptions;
};

export const WHISPER_LIMIT = 40;
export const WHISPER_TEXT = 120;

const freshPlan = (): Plan => ({ wolves: {}, done: {} });

function enter(pub: Public, stage: Stage, now: number, ms: number) {
  pub.stage = stage;
  pub.since = now;
  pub.until = now + ms;
}

export function newGame(round: number, players: string[], opts: WolfOptions, now: number, rand: () => number): Game {
  const { cast } = castFor(players.length, opts);
  return {
    pub: { round, stage: "intro", day: 1, since: now, until: now + DURATION.intro, alive: [...players], deaths: [], cast },
    sec: {
      roles: deal(players, cast, rand),
      potions: { save: true, poison: true },
      lastGuard: null,
      seen: [],
      whisper: [],
      night: freshPlan(),
      story: [],
    },
  };
}

/** Phe thắng nếu ván đã ngã ngũ: hết Sói thì Dân thắng; Sói nhiều bằng phần còn lại thì Sói thắng. */
export function winnerOf(alive: string[], roles: Record<string, Role>): Team | undefined {
  const wolves = alive.filter((u) => roles[u] === "wolf").length;
  if (wolves === 0) return "village";
  if (wolves >= alive.length - wolves) return "wolf";
}

/** Lộ hết bí mật khi hết ván (thắng thua hoặc chủ phòng dừng). */
export function unveil(g: Game): Public {
  return { ...g.pub, roles: { ...g.sec.roles }, story: structuredClone(g.sec.story) };
}

function settle(g: Game) {
  const w = winnerOf(g.pub.alive, g.sec.roles);
  if (!w) return false;
  g.pub = { ...unveil(g), winner: w };
  return true;
}

function chapter(g: Game, day = g.pub.day): Chapter {
  let c = g.sec.story.find((x) => x.day === day);
  if (!c) {
    c = { day };
    g.sec.story.push(c);
    g.sec.story.sort((a, b) => a.day - b.day);
  }
  return c;
}

function kill(g: Game, uids: string[], how: Death["how"]) {
  for (const uid of uids) {
    if (!g.pub.alive.includes(uid)) continue;
    const role = g.sec.roles[uid];
    g.pub.alive = g.pub.alive.filter((u) => u !== uid);
    g.pub.deaths.push({ uid, day: g.pub.day, how, ...(how === "hang" ? { wolf: role === "wolf" } : {}) });
    delete g.sec.night.wolves[uid];
  }
}

/** Đếm phiếu: người nhiều phiếu nhất (hoà thì nhiều người). Phiếu null (bỏ qua) không tính. */
export function tally(ballots: Record<string, string | null>) {
  const counts: Record<string, number> = {};
  for (const t of Object.values(ballots)) if (t) counts[t] = (counts[t] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  const top =
    max > 0
      ? Object.keys(counts)
          .filter((u) => counts[u] === max)
          .sort()
      : [];
  return { counts, max, top };
}

/** Các phiếu hợp lệ của giai đoạn bỏ phiếu hiện tại: người sống bầu người sống khác (hoặc bỏ qua). */
export function ballotsOf(pub: Public, votes: Record<string, Vote | undefined>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (pub.stage !== "vote" && pub.stage !== "revote") return out;
  for (const voter of pub.alive) {
    const v = votes[voter];
    if (!v || v.day !== pub.day || v.stage !== pub.stage || v.target === undefined) continue;
    const t = v.target;
    if (t === null) out[voter] = null;
    else if (t !== voter && pub.alive.includes(t) && (!pub.candidates || pub.candidates.includes(t))) out[voter] = t;
  }
  return out;
}

/** Những người sống đã bấm "bỏ phiếu sớm" trong lúc thảo luận. */
export function readyOf(pub: Public, votes: Record<string, Vote | undefined>) {
  if (pub.stage !== "day") return [];
  return pub.alive.filter((u) => {
    const v = votes[u];
    return !!v && v.day === pub.day && v.stage === "day" && !!v.ready;
  });
}

/** Mục tiêu Bảo Vệ được chọn đêm nay. */
export function canGuard(g: Pick<Game, "pub"> & { sec: Pick<Secret, "lastGuard"> }, guard: string, target: string, opts: WolfOptions) {
  if (!g.pub.alive.includes(target)) return false;
  if (target === guard && !opts.guardSelf) return false;
  if (target === g.sec.lastGuard && !opts.guardRepeat) return false;
  return true;
}

/** Nạn nhân của bầy Sói: người được nhiều Sói chọn nhất, hoà thì bốc thăm. */
export function wolfTarget(picks: Record<string, string>, rand: () => number): string | null {
  const { top } = tally(picks);
  if (!top.length) return null;
  return top[Math.floor(rand() * top.length)];
}

const living = (g: Game, r: Role) => g.pub.alive.filter((u) => g.sec.roles[u] === r);

/** Người bầy Sói đang thống nhất cắn (mọi con Sói còn sống chọn cùng một người); undefined nếu chưa thống nhất. */
export function consensus(g: Game): string | undefined {
  const picks = living(g, "wolf").map((w) => g.sec.night.wolves[w]);
  if (picks.length && picks.every(Boolean) && new Set(picks).size === 1) return picks[0];
}

/** Những người còn sống phải chốt hành động đêm nay (Phù Thủy hết thuốc thì không phải chờ). */
export function actorsOf(g: Game) {
  return g.pub.alive.filter((u) => {
    const r = g.sec.roles[u];
    if (r === "witch") return g.sec.potions.save || g.sec.potions.poison;
    return r === "wolf" || r === "guard" || r === "seer";
  });
}

function lockSeer(g: Game) {
  const n = g.sec.night;
  if (n.seer !== undefined || n.seerPick === undefined || !g.pub.alive.includes(n.seerPick)) return;
  n.seer = n.seerPick;
  g.sec.seen.push({ day: g.pub.day, target: n.seer, wolf: g.sec.roles[n.seer] === "wolf" });
}

/** Một bước của quản trò: nhận hành động / phiếu, chuyển giai đoạn khi đủ điều kiện hoặc hết giờ. Không sửa `g0`. */
export function advance(g0: Game, inp: Input): Game {
  const g: Game = structuredClone(g0);
  const { pub, sec } = g;
  if (pub.winner) return g;
  const { now, opts } = inp;
  const alive = (u: string | null | undefined): u is string => !!u && pub.alive.includes(u);
  const act = (u: string) => {
    const a = inp.actions[u];
    return a && a.day === pub.day && alive(u) ? a : undefined;
  };

  switch (pub.stage) {
    case "intro": {
      if (now >= pub.until) enter(pub, "night", now, 0);
      break;
    }
    case "night": {
      const n = sec.night;
      for (const u of pub.alive) {
        const a = act(u);
        if (!a) continue;
        const r = sec.roles[u];
        let chosen = false;
        if (r === "guard") {
          if (a.guard !== undefined && canGuard(g, u, a.guard, opts)) n.guard = a.guard;
          chosen = n.guard !== undefined;
        }
        if (r === "wolf") {
          if (a.wolf !== undefined && alive(a.wolf) && sec.roles[a.wolf] !== "wolf") n.wolves[u] = a.wolf;
          chosen = !!n.wolves[u];
          if (Array.isArray(a.say)) {
            for (const s of a.say) {
              if (typeof s?.id !== "string" || typeof s.text !== "string" || !s.text.trim() || sec.whisper.some((w) => w.id === s.id)) continue;
              sec.whisper.push({ id: s.id, uid: u, text: s.text.trim().slice(0, WHISPER_TEXT) });
            }
            sec.whisper = sec.whisper.slice(-WHISPER_LIMIT);
          }
        }
        if (r === "seer") {
          if (n.seer === undefined && a.seer !== undefined && alive(a.seer) && a.seer !== u) n.seerPick = a.seer;
          chosen = n.seerPick !== undefined;
        }
        if (r === "witch") {
          if (a.save !== undefined) n.save = a.save && sec.potions.save && alive(a.save) ? a.save : undefined;
          if (a.poison !== undefined) n.poison = a.poison && sec.potions.poison && alive(a.poison) && a.poison !== u ? a.poison : undefined;
          chosen = true;
        }
        if (a.done && chosen) {
          n.done[u] = true;
          if (r === "seer") lockSeer(g);
        }
      }
      // Đêm không hết giờ: chờ mọi vai có chức năng chốt xong (quản trò có thể cho trời sáng sớm).
      if (actorsOf(g).every((u) => n.done[u]) && now >= pub.since + DURATION.nightMin) endNight(g, now, inp.rand);
      break;
    }
    case "dawn": {
      if (now >= pub.until) dawn(g, now, opts);
      break;
    }
    case "day": {
      const ready = readyOf(pub, inp.votes);
      // Quản trò chơi cùng (cũng là một người chơi): ai còn sống cũng bắt đầu bỏ phiếu được.
      if (opts.hostPlays && ready.length > 0) {
        enter(pub, "vote", now, DURATION.vote);
        break;
      }
      // Quản trò điều khiển: không hết giờ, cả làng muốn bỏ phiếu cũng phải chờ quản trò bấm.
      if (!opts.talk) break;
      if (now >= pub.until || (pub.alive.length > 0 && ready.length === pub.alive.length)) enter(pub, "vote", now, DURATION.vote);
      break;
    }
    case "vote":
    case "revote": {
      const ballots = ballotsOf(pub, inp.votes);
      if (now < pub.until && Object.keys(ballots).length < pub.alive.length) break;
      const c = chapter(g);
      c.votes = [...(c.votes ?? []), ballots];
      const { top } = tally(ballots);
      if (top.length > 1 && pub.stage === "vote" && opts.tie === "revote") {
        enter(pub, "revote", now, DURATION.vote);
        pub.candidates = top;
        break;
      }
      pub.hanged = top.length === 1 ? top[0] : null;
      c.hanged = pub.hanged;
      delete pub.candidates;
      enter(pub, "verdict", now, DURATION.verdict);
      if (pub.hanged) kill(g, [pub.hanged], "hang");
      settle(g);
      break;
    }
    case "verdict": {
      if (now < pub.until) break;
      pub.day += 1;
      delete pub.hanged;
      enter(pub, "night", now, 0);
      break;
    }
  }
  return g;
}

/** Hết đêm: chốt người Tiên Tri soi (nếu đang chọn), nạn nhân của bầy Sói, rồi đếm ngược tới sáng. */
function endNight(g: Game, now: number, rand: () => number) {
  lockSeer(g);
  g.sec.night.victim = wolfTarget(g.sec.night.wolves, rand);
  enter(g.pub, "dawn", now, DURATION.dawn);
}

/** Quản trò cho trời sáng ngay (có người treo máy không chốt): lựa chọn đang có vẫn được tính. */
export function skipNight(g0: Game, now: number, rand: () => number): Game {
  if (g0.pub.stage !== "night" || g0.pub.winner) return g0;
  const g: Game = structuredClone(g0);
  endNight(g, now, rand);
  return g;
}

/** Trời sáng: tính ai chết đêm qua, dùng bình thuốc, ghi diễn biến, sang ngày mới (hoặc kết thúc ván). */
function dawn(g: Game, now: number, opts: WolfOptions) {
  const { pub, sec } = g;
  const n = sec.night;
  const victim = n.victim ?? null;
  const saved = !!victim && n.save === victim && sec.potions.save;
  const dead: string[] = [];
  if (victim && victim !== n.guard && !saved) dead.push(victim);
  if (saved) sec.potions.save = false;
  if (n.poison) {
    sec.potions.poison = false;
    if (!dead.includes(n.poison)) dead.push(n.poison);
  }
  sec.lastGuard = n.guard ?? null;
  // Xếp theo thứ tự ghế để không lộ ai bị Sói cắn, ai bị đầu độc.
  const died = pub.alive.filter((u) => dead.includes(u));
  Object.assign(chapter(g), {
    bite: victim,
    ...(n.guard ? { guard: n.guard } : {}),
    ...(n.seer ? { seer: { target: n.seer, wolf: sec.roles[n.seer] === "wolf" } } : {}),
    ...(saved ? { save: victim } : {}),
    ...(n.poison ? { poison: n.poison } : {}),
    died,
  });
  sec.night = freshPlan();
  kill(g, died, "night");
  if (!settle(g)) enter(pub, "day", now, opts.talk * 1000);
}

/** Người chơi bỏ làng (rớt mạng quá lâu, bị mời ra): chết ngay, có thể khiến ván ngã ngũ. */
export function depart(g0: Game, uid: string): Game {
  if (!g0.pub.alive.includes(uid) || g0.pub.winner) return g0;
  const g: Game = structuredClone(g0);
  kill(g, [uid], "left");
  const c = chapter(g);
  c.left = [...(c.left ?? []), uid];
  if (g.pub.candidates) g.pub.candidates = g.pub.candidates.filter((u) => u !== uid);
  settle(g);
  return g;
}

/** Chủ phòng cho bỏ phiếu ngay, không chờ hết giờ thảo luận. */
export function skipTalk(g0: Game, now: number): Game {
  if (g0.pub.stage !== "day" || g0.pub.winner) return g0;
  const g: Game = structuredClone(g0);
  enter(g.pub, "vote", now, DURATION.vote);
  return g;
}

/** Những người chết trong đêm `day` (công bố lúc trời sáng). */
export const diedAt = (pub: Public, day: number, how: Death["how"] = "night") => pub.deaths.filter((d) => d.day === day && d.how === how).map((d) => d.uid);

/** Những gì người biết hết (quản trò, người xem) thấy: vai mọi người và hành động đêm nay. */
export type WatchView = {
  roles: Record<string, Role>;
  night?: { guard?: string; wolves: Record<string, string>; seer?: string; save?: string; poison?: string; victim?: string; done: string[] };
};

export function watchView(g: Game): WatchView {
  const n = g.sec.night;
  const v: WatchView = { roles: { ...g.sec.roles } };
  if (g.pub.stage === "night" || g.pub.stage === "dawn") {
    v.night = {
      wolves: { ...n.wolves },
      done: Object.keys(n.done),
      ...(n.guard ? { guard: n.guard } : {}),
      ...((n.seer ?? n.seerPick) ? { seer: n.seer ?? n.seerPick } : {}),
      ...(n.save ? { save: n.save } : {}),
      ...(n.poison ? { poison: n.poison } : {}),
      ...((n.victim ?? consensus(g)) ? { victim: (n.victim ?? consensus(g))! } : {}),
    };
  }
  return v;
}

/** Phần bí mật quản trò gửi riêng cho một người chơi. */
export type SecretView = {
  role?: Role;
  /** Đã chốt hành động đêm nay. */
  done?: boolean;
  /** Sói: cả bầy (kể cả con đã chết). */
  pack?: string[];
  /** Sói, ban đêm: lựa chọn hiện tại của từng con. */
  picks?: Record<string, string>;
  whisper?: Whisper[];
  /** Tiên Tri: nhật ký soi, người đang chọn soi đêm nay. */
  seen?: Secret["seen"];
  seerPick?: string;
  /** Bảo Vệ: người đã bảo vệ đêm trước, người đang bảo vệ đêm nay. */
  lastGuard?: string | null;
  guarded?: string;
  /** Phù Thủy. */
  potions?: Secret["potions"];
  /** Phù Thủy, ban đêm: người bầy Sói đang thống nhất cắn (chưa thống nhất thì không có), quyết định đã ghi nhận. */
  victim?: string;
  save?: string;
  poison?: string;
  /** Người xem (không chơi): thấy hết. */
  watch?: WatchView;
};

export function secretFor(g: Game, uid: string): SecretView | undefined {
  const { pub, sec } = g;
  const role = sec.roles[uid];
  if (!role) return undefined;
  const n = sec.night;
  const night = pub.stage === "night";
  const v: SecretView = { role };
  if (night && n.done[uid]) v.done = true;
  if (role === "wolf") {
    v.pack = Object.keys(sec.roles).filter((u) => sec.roles[u] === "wolf");
    if (night) v.picks = { ...n.wolves };
    v.whisper = sec.whisper;
  }
  if (role === "seer") {
    v.seen = sec.seen;
    if (night && n.seerPick && n.seer === undefined) v.seerPick = n.seerPick;
  }
  if (role === "guard") {
    v.lastGuard = sec.lastGuard;
    if (night && n.guard) v.guarded = n.guard;
  }
  if (role === "witch") {
    v.potions = sec.potions;
    if (night) {
      const victim = consensus(g);
      if (victim) v.victim = victim;
      if (n.save) v.save = n.save;
      if (n.poison) v.poison = n.poison;
    }
  }
  return v;
}

export const STAGE_NAMES: Record<Stage, string> = {
  intro: "Nhận vai",
  night: "Ban đêm",
  dawn: "Sắp sáng",
  day: "Thảo luận",
  vote: "Bỏ phiếu",
  revote: "Bỏ phiếu lại",
  verdict: "Tuyên án",
};

/** "A", "A và B", "A, B và C". */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} và ${names[names.length - 1]}`;
}
