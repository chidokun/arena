/**
 * Luật bắn tàu: hải đồ 10 × 10, mỗi bên giấu 5 tàu rồi thay phiên bắn vào hải đồ của nhau.
 *
 * Hạm đội là bí mật nên không ai "phán" thay được: bên bị bắn tự trả lời trúng / trượt / chìm (máy tự trả lời từ sơ
 * đồ cất trên máy). Để không ai đổi sơ đồ giữa ván, đầu ván mỗi bên công bố *cam kết* `commitOf(hạm đội, muối)` —
 * SHA-256 nên không đoán ngược được sơ đồ; hết ván công bố hạm đội + muối, ai cũng tính lại cam kết và đối chiếu
 * từng câu trả lời (`honest`).
 */

export const SIZE = 10;
export const CELLS = SIZE * SIZE;

export const FLEET = [
  { name: "Tàu sân bay", len: 5 },
  { name: "Thiết giáp hạm", len: 4 },
  { name: "Tuần dương hạm", len: 3 },
  { name: "Tàu ngầm", len: 3 },
  { name: "Khu trục hạm", len: 2 },
] as const;

/** Tổng số ô tàu của một hạm đội. */
export const FLEET_CELLS = FLEET.reduce((n, s) => n + s.len, 0);

/** Một tàu: ô đầu (trên cùng / trái nhất) và hướng (`v` dọc, không thì ngang). */
export type Ship = { at: number; v: boolean };
/** Hạm đội: tàu thứ k ứng với `FLEET[k]`. */
export type Fleet = Ship[];

export type BsOptions = {
  /** Bắn trúng (kể cả làm chìm) được bắn tiếp; tắt thì cứ mỗi phát lại đổi lượt. */
  chain: boolean;
};

export const DEFAULT_OPTIONS: BsOptions = { chain: true };

export function normOptions(raw: unknown): BsOptions {
  const o = (raw ?? {}) as Partial<BsOptions>;
  return { chain: typeof o.chain === "boolean" ? o.chain : DEFAULT_OPTIONS.chain };
}

/**
 * Một phát bắn vào ô `c`. Bên bị bắn trả lời `r`: 0 trượt, 1 trúng, 2 trúng và làm chìm tàu `k` — khi chìm thì
 * khai luôn vị trí tàu (`at`, `v`) như luật "Bạn đã bắn chìm tàu sân bay của tôi!".
 */
export type Shot = { c: number; r?: 0 | 1 | 2; k?: number; at?: number; v?: boolean };

export type Sunk = { k: number; ship: Ship };

export type BsState = {
  /** Các phát hợp lệ theo thứ tự, kèm người bắn (chỉ số trong đội hình). */
  shots: (Shot & { by: 0 | 1 })[];
  /** Hải đồ của từng bên (theo đội hình): -1 chưa bị bắn, 0 trượt, 1 trúng. */
  marks: [Int8Array, Int8Array];
  /** Tàu đã chìm của từng bên. */
  sunk: [Sunk[], Sunk[]];
  /** Người bắn kế tiếp, hoặc người đang chờ câu trả lời. */
  turn: 0 | 1;
  /** Ô của phát đang chờ bên kia trả lời; -1 nếu không có. */
  pending: number;
  /** Người thắng (bắn chìm hết hạm đội đối phương); -1 nếu chưa. */
  winner: -1 | 0 | 1;
};

const inRange = (c: unknown): c is number => Number.isInteger(c) && (c as number) >= 0 && (c as number) < CELLS;

/** Các ô của tàu thứ `k` đặt tại `s`; null nếu tràn ra ngoài hải đồ. */
export function shipCells(k: number, s: Ship): number[] | null {
  const len = FLEET[k]?.len;
  if (!len || !inRange(s.at)) return null;
  const x = s.at % SIZE;
  const y = Math.floor(s.at / SIZE);
  if (s.v ? y + len > SIZE : x + len > SIZE) return null;
  return Array.from({ length: len }, (_, i) => s.at + i * (s.v ? SIZE : 1));
}

/** Ô → chỉ số tàu (-1 là biển); null nếu hạm đội sai (thiếu tàu, tràn ra ngoài, chồng lên nhau). */
export function fleetGrid(fleet: readonly Ship[]): Int8Array | null {
  if (fleet.length !== FLEET.length) return null;
  const grid = new Int8Array(CELLS).fill(-1);
  for (let k = 0; k < fleet.length; k++) {
    const cells = shipCells(k, fleet[k]);
    if (!cells) return null;
    for (const c of cells) {
      if (grid[c] >= 0) return null;
      grid[c] = k;
    }
  }
  return grid;
}

/** Đọc hạm đội từ dữ liệu lạ (bản công bố của người khác); null nếu sai. */
export function parseFleet(raw: unknown): Fleet | null {
  if (!Array.isArray(raw)) return null;
  const fleet = raw.map((s) => ({ at: (s as Ship)?.at, v: (s as Ship)?.v }));
  if (fleet.some((s) => !inRange(s.at) || typeof s.v !== "boolean")) return null;
  return fleetGrid(fleet as Fleet) ? (fleet as Fleet) : null;
}

/** Hai ô có kề nhau không (kể cả chéo). */
const touches = (a: number, b: number) => Math.abs((a % SIZE) - (b % SIZE)) <= 1 && Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) <= 1;

/** Bày ngẫu nhiên, các tàu không chạm nhau (luật không cấm chạm — chỉ cho đẹp và khó đoán hơn). */
export function randomFleet(rand: () => number = Math.random): Fleet {
  for (;;) {
    const fleet: Fleet = [];
    const used: number[] = [];
    for (let k = 0; k < FLEET.length; k++) {
      for (let tries = 0; tries < 200; tries++) {
        const ship = { at: Math.floor(rand() * CELLS), v: rand() < 0.5 };
        const cells = shipCells(k, ship);
        if (!cells || cells.some((c) => used.some((u) => touches(c, u)))) continue;
        fleet.push(ship);
        used.push(...cells);
        break;
      }
      if (fleet.length !== k + 1) break;
    }
    if (fleet.length === FLEET.length) return fleet;
  }
}

/** Câu trả lời đúng cho phát bắn vào ô `c` của hạm đội `fleet`, khi các ô `prior` đã bị bắn trước đó. */
export function answerShot(fleet: readonly Ship[], prior: readonly number[], c: number): Shot {
  const grid = fleetGrid(fleet);
  const k = grid ? grid[c] : -1;
  if (k < 0) return { c, r: 0 };
  const hit = new Set([...prior, c]);
  if (!shipCells(k, fleet[k])!.every((x) => hit.has(x))) return { c, r: 1 };
  return { c, r: 2, k, at: fleet[k].at, v: fleet[k].v };
}

/**
 * Dựng lại ván từ nhật ký phát bắn. Tất định: mọi máy có cùng nhật ký ra cùng kết quả. Nhật ký dừng ở mục sai đầu tiên:
 * bắn ngoài hải đồ hoặc ô đã bắn, câu trả lời lạ, khai chìm một tàu đã chìm / tàu có ô chưa bị bắn trúng / tàu chồng lên
 * tàu đã chìm. Lượt đầu là của `lineup[0]`.
 */
export function replay(log: readonly Shot[], opts: BsOptions): BsState {
  const s: BsState = {
    shots: [],
    marks: [new Int8Array(CELLS).fill(-1), new Int8Array(CELLS).fill(-1)],
    sunk: [[], []],
    turn: 0,
    pending: -1,
    winner: -1,
  };
  for (let i = 0; i < log.length && s.winner < 0; i++) {
    const shot = log[i];
    const foe = (1 - s.turn) as 0 | 1;
    const marks = s.marks[foe];
    if (!shot || !inRange(shot.c) || marks[shot.c] >= 0) break;
    if (shot.r === undefined) {
      // Chỉ phát cuối cùng mới được chờ trả lời.
      if (i !== log.length - 1) break;
      s.pending = shot.c;
      s.shots.push({ c: shot.c, by: s.turn });
      break;
    }
    if (shot.r !== 0 && shot.r !== 1 && shot.r !== 2) break;
    if (shot.r === 2) {
      const k = shot.k as number;
      const ship = { at: shot.at as number, v: shot.v === true };
      const cells = Number.isInteger(k) ? shipCells(k, ship) : null;
      if (!cells || s.sunk[foe].some((x) => x.k === k) || !cells.includes(shot.c)) break;
      const taken = new Set(s.sunk[foe].flatMap((x) => shipCells(x.k, x.ship)!));
      if (cells.some((c) => taken.has(c) || (c !== shot.c && marks[c] !== 1))) break;
      s.sunk[foe].push({ k, ship });
      s.shots.push({ c: shot.c, r: 2, k, at: ship.at, v: ship.v, by: s.turn });
    } else s.shots.push({ c: shot.c, r: shot.r, by: s.turn });
    marks[shot.c] = shot.r ? 1 : 0;
    if (s.sunk[foe].length === FLEET.length) s.winner = s.turn;
    else if (!shot.r || !opts.chain) s.turn = foe;
  }
  return s;
}

/** Các phát đã được trả lời nhắm vào bên `side` (theo đội hình), theo thứ tự. */
export const shotsAt = (s: BsState, side: 0 | 1) => s.shots.filter((x) => x.by !== side && x.r !== undefined);

/** Đối chiếu hạm đội công bố với mọi câu trả lời bên đó đã đưa. */
export function honest(fleet: readonly Ship[], answered: readonly Shot[]): boolean {
  if (!fleetGrid(fleet)) return false;
  const prior: number[] = [];
  for (const shot of answered) {
    const want = answerShot(fleet, prior, shot.c);
    if (want.r !== shot.r || (want.r === 2 && (want.k !== shot.k || want.at !== shot.at || want.v !== shot.v))) return false;
    prior.push(shot.c);
  }
  return true;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Muối ngẫu nhiên cho cam kết — thiếu muối thì thử hết các cách bày (hữu hạn) là dò ngược ra sơ đồ. */
export const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));

/** Cam kết của một hạm đội: SHA-256 (hex) của muối + sơ đồ. */
export async function commitOf(fleet: readonly Ship[], salt: string): Promise<string> {
  const body = `${salt}|${fleet.map((s) => `${s.at}${s.v ? "v" : "h"}`).join(",")}`;
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))));
}

const COL_NAMES = "ABCDEFGHIJ";

/** Toạ độ kiểu hải đồ: cột chữ A–J, hàng số 1–10 (vd. "C7"). */
export const coord = (c: number) => `${COL_NAMES[c % SIZE]}${Math.floor(c / SIZE) + 1}`;
export const colName = (x: number) => COL_NAMES[x];
