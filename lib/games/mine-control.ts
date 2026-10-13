/**
 * Luật dò mìn chiến thuật (Mine Control) cho 2–4 người: mỗi người có một căn cứ ở góc bản đồ, lần lượt mở ô ẩn liền
 * kề (4 hướng) lãnh thổ của mình để chiếm đất, dùng năng lượng cho kỹ năng (Radar, Khiên, Pháo đài, Cướp Đất) và tránh
 * mìn. Mở trúng mìn mất mạng, hết mạng bị loại. Còn một người thì người đó thắng ngay; mở hết ô an toàn hoặc bế tắc
 * (không ai còn nước mở ô / Cướp Đất) thì cộng thưởng cuối ván rồi ai nhiều điểm nhất thắng.
 *
 * Bản đồ sinh tất định từ `seed` của ván nên không phải gửi qua mạng — đổi lại, ai mở mã nguồn trang ra soi thì đọc
 * được vị trí mìn (cũng như mọi game "tự dựng lại ván" khác trong P2P, không có máy chủ giữ bí mật).
 */

// ---------- thiết lập ----------

export const MAPS = {
  s: { w: 10, h: 6, label: "Nhỏ" },
  m: { w: 15, h: 9, label: "Vừa" },
  l: { w: 20, h: 12, label: "Lớn" },
} as const;
export type MapKey = keyof typeof MAPS;
export const MAP_KEYS: readonly MapKey[] = ["s", "m", "l"];

export const MINE_CHOICES = [10, 15, 20] as const;
export type Mines = (typeof MINE_CHOICES)[number];

export type McOptions = { map: MapKey; mines: Mines };
export const DEFAULT_OPTIONS: McOptions = { map: "m", mines: 15 };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const LIVES = 3;
export const START_ENERGY = 2;
export const MAX_ENERGY = 4;
export const MAX_FORTS = 2;
export const COST = { radar: 2, shield: 2, fort: 2, grab: 3 } as const;
export const MINE_PENALTY = 2;
export const FORT_BONUS = 2;
export const LIFE_BONUS = 1;
/**
 * Mọi người còn chơi cùng bỏ lượt liên tiếp chừng này vòng thì ván kết thúc như bế tắc — khi ô ẩn còn lại toàn là ô
 * nghi có mìn, không ai muốn mở, ván không kéo dài vô hạn bằng cách bỏ lượt (cũng như không kéo dài được bằng Radar / Khiên).
 */
export const STALL_ROUNDS = 2;

export function normOptions(o: Record<string, unknown> | undefined): McOptions {
  const map = MAP_KEYS.find((k) => k === o?.map) ?? DEFAULT_OPTIONS.map;
  const mines = MINE_CHOICES.find((n) => n === o?.mines) ?? DEFAULT_OPTIONS.mines;
  return { map, mines };
}

/** Căn cứ của từng người: lùi vào một ô từ các góc để vùng bảo vệ 3×3 nằm gọn trong bản đồ; 2 người thì ở hai góc chéo nhau. */
export function basesOf(w: number, h: number, n: number): number[] {
  const corners = [
    [1, 1],
    [w - 2, h - 2],
    [w - 2, 1],
    [1, h - 2],
  ];
  return corners.slice(0, n).map(([x, y]) => y * w + x);
}

/** Số ô không thuộc vùng bảo vệ của căn cứ nào — chỗ được rải mìn. */
export function freeCells(map: MapKey, players: number) {
  const { w, h } = MAPS[map];
  return w * h - 9 * players;
}

/**
 * Số mìn của ván: lựa chọn của chủ phòng, nhưng không quá nửa số ô ngoài vùng bảo vệ (bản đồ nhỏ, đông người mà rải
 * 20 mìn thì gần như ô nào ngoài căn cứ cũng là mìn) — khi đó hạ xuống mức lớn nhất còn hợp lệ.
 */
export function minesFor(o: McOptions, players: number): Mines {
  const cap = Math.floor(freeCells(o.map, players) / 2);
  return [...MINE_CHOICES].reverse().find((n) => n <= o.mines && n <= cap) ?? MINE_CHOICES[0];
}

// ---------- lưới ----------

export function neighbors8(w: number, h: number, c: number): number[] {
  const x = c % w;
  const y = Math.floor(c / w);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) out.push(ny * w + nx);
    }
  return out;
}

export function neighbors4(w: number, h: number, c: number): number[] {
  const x = c % w;
  const y = Math.floor(c / w);
  const out: number[] = [];
  if (y > 0) out.push(c - w);
  if (x < w - 1) out.push(c + 1);
  if (y < h - 1) out.push(c + w);
  if (x > 0) out.push(c - 1);
  return out;
}

/** Vùng 3×3 có tâm `c` (phần nằm trong bản đồ). */
export const area3 = (w: number, h: number, c: number) => [c, ...neighbors8(w, h, c)];

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

/** Rải mìn tất định từ `seed`: mọi ô ngoài vùng bảo vệ 3×3 của các căn cứ đều có cùng cơ hội. */
export function makeMines(w: number, h: number, bases: readonly number[], mines: number, seed: number): Uint8Array {
  const safe = new Set(bases.flatMap((b) => area3(w, h, b)));
  const free: number[] = [];
  for (let c = 0; c < w * h; c++) if (!safe.has(c)) free.push(c);
  const rand = rng(seed);
  const n = Math.min(mines, free.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (free.length - i));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < n; i++) out[free[i]] = 1;
  return out;
}

// ---------- ván ----------

/** Phần công khai của ván do chủ phòng chốt lúc bắt đầu (`meta.mc`); `out`: uid → số dòng nhật ký lúc bị loại (bỏ cuộc, mất kết nối, bị mời ra). */
export type McPublic = { seed: number; map: MapKey; mines: number; out: Record<string, number> };

/** Một dòng nhật ký: hành động của người tới lượt; `skip` do chủ phòng ghi khi người tới lượt vắng mặt / quá giờ. */
export type McAct =
  | { k: "open"; u: string; c: number }
  | { k: "radar"; u: string; c: number }
  | { k: "shield"; u: string }
  | { k: "fort"; u: string; c: number }
  | { k: "grab"; u: string; c: number }
  | { k: "pass"; u: string }
  | { k: "skip"; u: string };

export type McPlayer = {
  lives: number;
  energy: number;
  score: number;
  shield: boolean;
  forts: number;
  /** "" còn chơi · "dead" hết mạng · "quit" bỏ cuộc / mất kết nối / bị mời ra. */
  out: "" | "dead" | "quit";
};

export type McEvent =
  | { t: "open"; who: number; c: number; near: number; gain: number; flood: number }
  | { t: "boom"; who: number; c: number; shield: boolean; dead: boolean }
  | { t: "radar"; who: number; c: number; n: number }
  | { t: "shield"; who: number }
  | { t: "fort"; who: number; c: number }
  | { t: "grab"; who: number; c: number }
  /** Bỏ lượt: tự bỏ, chủ phòng cho qua (`skip`), hoặc tự động vì không còn hành động nào (`auto`). */
  | { t: "pass"; who: number; skip?: boolean; auto?: boolean }
  | { t: "quit"; who: number };

export type McEnd = "" | "clear" | "alone" | "stuck";

export type McState = {
  w: number;
  h: number;
  mines: number;
  /** 1 là có mìn — ai cũng biết (xem đầu tệp), giao diện chỉ hiện khi đã nổ hoặc hết ván. */
  mine: Uint8Array;
  /** Số mìn trong 8 ô xung quanh. */
  near: Uint8Array;
  /** 0 ẩn · 1 đã mở (an toàn) · 2 mìn đã nổ. */
  open: Uint8Array;
  /** Chủ ô: chỉ số người chơi, -1 là không ai (ô ẩn, ô trung lập, mìn). */
  owner: Int8Array;
  fort: Uint8Array;
  /** Ô căn cứ của từng người. */
  bases: number[];
  players: McPlayer[];
  /** Kết quả Radar theo ô tâm (lần quét gần nhất của ô đó). */
  radar: Record<number, { n: number; who: number }>;
  /** Người tới lượt; -1 khi hết ván. */
  turn: number;
  /** Số dòng nhật ký đã áp dụng. */
  count: number;
  /** Số ô an toàn còn ẩn. */
  safeLeft: number;
  /** Số lần bỏ lượt liên tiếp (tự bỏ, bị cho qua, tự động) — đủ `STALL_ROUNDS` vòng thì tính là bế tắc. */
  passes: number;
  over: boolean;
  end: McEnd;
  events: McEvent[];
};

export function newGame(pub: McPublic, players: number): McState {
  const { w, h } = MAPS[pub.map];
  const bases = basesOf(w, h, players);
  const mine = makeMines(w, h, bases, pub.mines, pub.seed);
  const near = new Uint8Array(w * h);
  for (let c = 0; c < w * h; c++) near[c] = neighbors8(w, h, c).reduce((n, d) => n + mine[d], 0);
  const open = new Uint8Array(w * h);
  const owner = new Int8Array(w * h).fill(-1);
  bases.forEach((b, k) => {
    open[b] = 1;
    owner[b] = k;
  });
  const mines = mine.reduce((n, v) => n + v, 0);
  return {
    w,
    h,
    mines,
    mine,
    near,
    open,
    owner,
    fort: new Uint8Array(w * h),
    bases,
    players: bases.map(() => ({ lives: LIVES, energy: START_ENERGY, score: 0, shield: false, forts: 0, out: "" })),
    radar: {},
    turn: 0,
    count: 0,
    safeLeft: w * h - mines - bases.length,
    passes: 0,
    over: false,
    end: "",
    events: [],
  };
}

const inBoard = (s: McState, c: number) => Number.isInteger(c) && c >= 0 && c < s.w * s.h;
const touches = (s: McState, c: number, pred: (owner: number) => boolean) => neighbors4(s.w, s.h, c).some((d) => pred(s.owner[d]));

export const isBase = (s: McState, c: number) => s.bases.includes(c);

/** Mở được ô `c`: đang ẩn và liền kề (4 hướng) lãnh thổ của người `k`. */
export function canOpen(s: McState, k: number, c: number) {
  return inBoard(s, c) && s.open[c] === 0 && touches(s, c, (o) => o === k);
}

/** Cướp Đất ô `c` (chưa xét năng lượng): ô trung lập đã mở, kề lãnh thổ mình, không kề lãnh thổ đối thủ nào. */
export function grabTarget(s: McState, k: number, c: number) {
  return inBoard(s, c) && s.open[c] === 1 && s.owner[c] === -1 && touches(s, c, (o) => o === k) && !touches(s, c, (o) => o >= 0 && o !== k);
}

export function canGrab(s: McState, k: number, c: number) {
  return s.players[k].energy >= COST.grab && grabTarget(s, k, c);
}

export function canRadar(s: McState, k: number, c: number) {
  return s.players[k].energy >= COST.radar && inBoard(s, c) && s.open[c] === 0;
}

export function canShield(s: McState, k: number) {
  return s.players[k].energy >= COST.shield && !s.players[k].shield;
}

export function canFort(s: McState, k: number, c: number) {
  const p = s.players[k];
  return p.energy >= COST.fort && p.forts < MAX_FORTS && inBoard(s, c) && s.owner[c] === k && !s.fort[c] && !isBase(s, c);
}

/** Người `k` còn nước mở rộng lãnh thổ (mở ô hoặc Cướp Đất đủ năng lượng) không — để xét bế tắc. */
export function canExpand(s: McState, k: number) {
  for (let c = 0; c < s.w * s.h; c++) if (canOpen(s, k, c) || canGrab(s, k, c)) return true;
  return false;
}

/** Người `k` còn hành động nào ngoài bỏ lượt không; không còn thì tới lượt là tự bỏ qua. */
export function canAct(s: McState, k: number) {
  if (canExpand(s, k) || canShield(s, k)) return true;
  for (let c = 0; c < s.w * s.h; c++) if (canRadar(s, k, c) || canFort(s, k, c)) return true;
  return false;
}

const regen = (p: McPlayer) => {
  p.energy = Math.min(MAX_ENERGY, p.energy + 1);
};

/** Mở rộng vùng an toàn từ một ô số 0: các ô tự mở là trung lập, ô có số thì hiện số nhưng không lan tiếp. */
function flood(s: McState, from: number) {
  let n = 0;
  const queue = [from];
  while (queue.length) {
    const c = queue.pop()!;
    for (const d of neighbors8(s.w, s.h, c)) {
      if (s.open[d] || s.mine[d]) continue;
      s.open[d] = 1;
      s.safeLeft--;
      n++;
      if (s.near[d] === 0) queue.push(d);
    }
  }
  return n;
}

/** Điểm khi tự mở một ô an toàn: 1 điểm cơ bản, thưởng thêm 1 cho số 3–5, 2 cho số 6–8. */
export const openGain = (near: number) => 1 + (near >= 6 ? 2 : near >= 3 ? 1 : 0);

/** Áp dụng hành động của người `k` (đang tới lượt). Trả về false nếu không hợp lệ — trạng thái giữ nguyên. */
function apply(s: McState, k: number, a: McAct): boolean {
  const p = s.players[k];
  switch (a.k) {
    case "open": {
      if (!canOpen(s, k, a.c)) return false;
      s.passes = 0;
      const c = a.c;
      if (s.mine[c]) {
        s.open[c] = 2;
        p.score = Math.max(0, p.score - MINE_PENALTY);
        const shield = p.shield;
        if (shield) p.shield = false;
        else p.lives--;
        if (p.lives <= 0) p.out = "dead";
        s.events.push({ t: "boom", who: k, c, shield, dead: p.lives <= 0 });
      } else {
        s.open[c] = 1;
        s.owner[c] = k;
        s.safeLeft--;
        const gain = openGain(s.near[c]);
        p.score += gain;
        const n = s.near[c] === 0 ? flood(s, c) : 0;
        s.events.push({ t: "open", who: k, c, near: s.near[c], gain, flood: n });
      }
      regen(p);
      return true;
    }
    case "radar": {
      if (!canRadar(s, k, a.c)) return false;
      s.passes = 0;
      p.energy -= COST.radar;
      const n = area3(s.w, s.h, a.c).reduce((m, d) => m + s.mine[d], 0);
      s.radar[a.c] = { n, who: k };
      s.events.push({ t: "radar", who: k, c: a.c, n });
      regen(p);
      return true;
    }
    case "shield": {
      if (!canShield(s, k)) return false;
      s.passes = 0;
      p.energy -= COST.shield;
      p.shield = true;
      s.events.push({ t: "shield", who: k });
      regen(p);
      return true;
    }
    case "fort": {
      if (!canFort(s, k, a.c)) return false;
      s.passes = 0;
      p.energy -= COST.fort;
      s.fort[a.c] = 1;
      p.forts++;
      s.events.push({ t: "fort", who: k, c: a.c });
      regen(p);
      return true;
    }
    case "grab": {
      if (!canGrab(s, k, a.c)) return false;
      s.passes = 0;
      p.energy -= COST.grab;
      s.owner[a.c] = k;
      p.score += 1;
      s.events.push({ t: "grab", who: k, c: a.c });
      regen(p);
      return true;
    }
    case "pass":
    case "skip":
      s.events.push({ t: "pass", who: k, skip: a.k === "skip" || undefined });
      s.passes++;
      return true;
  }
  return false;
}

const alive = (s: McState) => s.players.flatMap((p, k) => (p.out ? [] : [k]));

/**
 * Bế tắc: không người nào còn chơi có nước mở ô / Cướp Đất — Radar, Khiên, Pháo đài không giữ ván lại được — hoặc mọi
 * người cùng bỏ lượt liên tiếp `STALL_ROUNDS` vòng.
 */
export const isStuck = (s: McState) => s.passes >= STALL_ROUNDS * alive(s).length || alive(s).every((k) => !canExpand(s, k));

/** Xét điều kiện kết thúc theo thứ tự: mở hết ô an toàn, còn một người, bế tắc (kể cả cùng bỏ lượt mãi). */
function checkEnd(s: McState) {
  const left = alive(s);
  const end: McEnd = s.safeLeft <= 0 ? "clear" : left.length <= 1 ? "alone" : isStuck(s) ? "stuck" : "";
  if (!end) return false;
  s.over = true;
  s.end = end;
  s.turn = -1;
  return true;
}

/** Chuyển lượt sang người kế tiếp còn chơi; ai tới lượt mà không còn hành động nào thì tự bỏ qua. */
function advance(s: McState, from: number) {
  const n = s.players.length;
  for (let d = 1; d <= n; d++) {
    const k = (from + d) % n;
    if (s.players[k].out) continue;
    if (canAct(s, k)) {
      s.turn = k;
      return;
    }
    s.events.push({ t: "pass", who: k, auto: true });
    s.passes++;
  }
  // Không ai hành động được (đã bị loại trừ bởi điều kiện bế tắc) — chốt ván cho chắc.
  s.over = true;
  s.end = "stuck";
  s.turn = -1;
}

/**
 * Dựng lại ván từ nhật ký. Tất định: cùng phần công khai (seed, bản đồ, số mìn, người bị loại), đội hình và nhật ký
 * thì ra cùng kết quả. Dòng không hợp lệ (sai người, sai luật, sau khi hết ván) thì dừng tại đó — mỗi dòng chỉ được
 * tính đúng một lần nên phát lại nhật ký không cộng / trừ điểm hai lần.
 */
export function replay(pub: McPublic, lineup: readonly string[], acts: readonly McAct[]): McState {
  const s = newGame(pub, lineup.length);
  /** Loại những người bỏ cuộc tính tới dòng `i`. */
  const prune = (i: number) => {
    let cur = false;
    lineup.forEach((u, k) => {
      const p = s.players[k];
      if (p.out || pub.out[u] === undefined || pub.out[u] > i) return;
      p.out = "quit";
      s.events.push({ t: "quit", who: k });
      if (k === s.turn) cur = true;
    });
    if (!checkEnd(s) && cur) advance(s, s.turn);
  };
  if (!canAct(s, 0)) advance(s, 0);
  for (let i = 0; i < acts.length; i++) {
    prune(i);
    if (s.over) break;
    const a = acts[i];
    const k = s.turn;
    if (!a || typeof a !== "object" || a.u !== lineup[k] || !apply(s, k, a)) break;
    s.count++;
    if (!checkEnd(s)) advance(s, k);
  }
  if (!s.over) prune(acts.length);
  return s;
}

// ---------- xếp hạng ----------

export type McRank = { k: number; score: number; bonus: number; total: number; cells: number; lives: number; forts: number };

/** Số ô thuộc quyền sở hữu của người `k` (tính cả căn cứ, Pháo đài). */
export function cellsOf(s: McState, k: number) {
  let n = 0;
  for (let c = 0; c < s.owner.length; c++) if (s.owner[c] === k) n++;
  return n;
}

/** Tổng điểm và các chỉ số phụ; thưởng cuối ván (Pháo đài, mạng còn lại) chỉ cộng khi hết ván vì mở hết ô hoặc bế tắc. */
export function ranks(s: McState): McRank[] {
  const bonusOn = s.end === "clear" || s.end === "stuck";
  return s.players.map((p, k) => {
    const bonus = bonusOn ? p.forts * FORT_BONUS + p.lives * LIFE_BONUS : 0;
    return { k, score: p.score, bonus, total: p.score + bonus, cells: cellsOf(s, k), lives: p.lives, forts: p.forts };
  });
}

/** So hai người: tổng điểm, rồi số ô sở hữu, số mạng còn lại, số Pháo đài. Âm là `a` xếp trên. */
export const compareRank = (a: McRank, b: McRank) => b.total - a.total || b.cells - a.cells || b.lives - a.lives || b.forts - a.forts;

/** Những người thắng (chỉ số trong đội hình): còn một người sống thì người đó; nếu không thì nhóm dẫn đầu bảng — từ hai người trở lên là hoà. */
export function winnersOf(s: McState): number[] {
  if (!s.over) return [];
  const left = alive(s);
  if (s.end === "alone" && left.length === 1) return left;
  const order = ranks(s).sort(compareRank);
  return order.filter((r) => compareRank(r, order[0]) === 0).map((r) => r.k);
}
