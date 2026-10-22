// Hạm đội là bí mật nên không ai "phán" thay được: bên bị bắn tự trả lời trúng / trượt / chìm. Để không ai đổi sơ đồ
// giữa ván, đầu ván mỗi bên công bố cam kết SHA-256 của hạm đội + muối (không đoán ngược được sơ đồ); hết ván công bố
// hạm đội + muối để ai cũng đối chiếu được từng câu trả lời (`honest`).

export const SIZE = 10;
export const CELLS = SIZE * SIZE;

// Hình tàu là các ô [x, y] ở hướng gốc. Năm tàu đầu là tàu thẳng cổ điển; hướng `o` (0–7) là xoay `o % 4` lần 90° theo
// chiều kim đồng hồ, từ 4 trở lên thì lật ngang trước khi xoay.
const line = (n: number) => Array.from({ length: n }, (_, i) => [i, 0] as const);

export const FLEET = [
  { name: "Tàu sân bay", cells: line(5), line: true },
  { name: "Thiết giáp hạm", cells: line(4), line: true },
  { name: "Tuần dương hạm", cells: line(3), line: true },
  { name: "Tàu ngầm", cells: line(3), line: true },
  { name: "Khu trục hạm", cells: line(2), line: true },
  { name: "Pháo đài nổi", cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], line: false },
  { name: "Tàu đổ bộ", cells: [[0, 0], [0, 1], [0, 2], [1, 2]], line: false },
  { name: "Tàu tàng hình", cells: [[0, 0], [1, 1], [2, 2]], line: false },
  { name: "Tàu hộ tống", cells: [[0, 0], [1, 0], [2, 0], [1, 1]], line: false },
  { name: "Tàu quét mìn", cells: [[0, 0], [1, 0], [1, 1], [2, 1]], line: false },
  { name: "Tàu hai thân", cells: [[0, 0], [0, 1], [2, 0], [2, 1]], line: false },
] as const satisfies readonly { name: string; cells: readonly (readonly [number, number])[]; line: boolean }[];

/** Mỗi người tự chọn từ 1 tới 5 loại tàu (mỗi loại một chiếc); hai bên không cần giống nhau. */
export const MIN_SHIPS = 1;
export const MAX_SHIPS = 5;
export const CLASSIC: readonly number[] = [0, 1, 2, 3, 4];

export const shipLen = (k: number) => FLEET[k].cells.length;

/** Ô của loại tàu `k` ở hướng `o`, dồn về góc trên trái và giữ thứ tự như hình gốc để xoay vẫn cầm đúng phần tàu. */
export function shapeOf(k: number, o: number): { cells: [number, number][]; w: number; h: number } | null {
  const kind = FLEET[k];
  if (!kind || !Number.isInteger(o) || o < 0 || o > 7) return null;
  let cells = kind.cells.map(([x, y]) => [o >= 4 ? -x : x, y] as [number, number]);
  for (let i = 0; i < o % 4; i++) cells = cells.map(([x, y]) => [-y, x]);
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  cells = cells.map(([x, y]) => [x - mx, y - my]);
  return { cells, w: Math.max(...cells.map((c) => c[0])) + 1, h: Math.max(...cells.map((c) => c[1])) + 1 };
}

const shapeKey = (k: number, o: number) =>
  shapeOf(k, o)!
    .cells.map(([x, y]) => y * SIZE + x)
    .sort((a, b) => a - b)
    .join(",");

/** Các hướng cho ra hình khác nhau của loại tàu `k`. */
export const orients = (k: number) => [0, 1, 2, 3, 4, 5, 6, 7].filter((o, i, all) => all.findIndex((p) => shapeKey(k, p) === shapeKey(k, o)) === i);
/** Lật được ra hình mới (chữ L, chữ Z) hay không. */
export const flippable = (k: number) => orients(k).some((o) => o >= 4);
export const rotated = (o: number) => (o & 4) | ((o + 1) & 3);
export const flipped = (o: number) => o ^ 4;

// Giây tối đa cho mỗi phát bắn; 0 là không giới hạn.
export const TURN_LIMITS = [15, 30, 45, 0] as const;
export type TurnLimit = (typeof TURN_LIMITS)[number];
export const turnLabel = (t: number) => (!t ? "Không giới hạn" : t < 60 ? `${t} giây` : `${t / 60} phút`);

export type BsOptions = {
  chain: boolean;
  turn: TurnLimit;
};

export const DEFAULT_OPTIONS: BsOptions = { chain: true, turn: 0 };

// Phòng tạo trước khi có tuỳ chọn thời gian thì không có `turn`, coi như không giới hạn.
export function normOptions(raw: unknown): BsOptions {
  const o = (raw ?? {}) as Partial<BsOptions>;
  return {
    chain: typeof o.chain === "boolean" ? o.chain : DEFAULT_OPTIONS.chain,
    turn: TURN_LIMITS.find((t) => t === o.turn) ?? DEFAULT_OPTIONS.turn,
  };
}

/** Một chiếc tàu: loại `k` (chỉ số trong FLEET), góc trên trái khung bao `at`, hướng `o` (0–7). */
export type Ship = { k: number; at: number; o: number };
export type Fleet = Ship[];

// `p` là bên bắn: phát bắn tới muộn sau khi người bắn đã mất lượt vì hết giờ thì không khớp lượt nữa và bị bỏ.
export type Shot = { c: number; r?: 0 | 1 | 2; k?: number; at?: number; o?: number; p?: 0 | 1 };

export type BsState = {
  shots: (Shot & { by: 0 | 1 })[];
  marks: [Int8Array, Int8Array];
  sunk: [Ship[], Ship[]];
  turn: 0 | 1;
  pending: number;
  winner: -1 | 0 | 1;
  /** Bên vừa mất lượt vì hết giờ, nếu đó là diễn biến mới nhất; -1 là không. */
  passed: -1 | 0 | 1;
};

const inRange = (c: unknown): c is number => Number.isInteger(c) && (c as number) >= 0 && (c as number) < CELLS;

export function shipCells(s: Ship): number[] | null {
  const shape = Number.isInteger(s.k) ? shapeOf(s.k, s.o) : null;
  if (!shape || !inRange(s.at)) return null;
  const x = s.at % SIZE;
  const y = Math.floor(s.at / SIZE);
  if (x + shape.w > SIZE || y + shape.h > SIZE) return null;
  return shape.cells.map(([dx, dy]) => s.at + dy * SIZE + dx);
}

/** Loại tàu của hạm đội (đã sắp xếp) — công bố cùng cam kết để đối phương biết phải đánh chìm những tàu nào. */
export const kindsOf = (fleet: readonly Ship[]) => fleet.map((s) => s.k).sort((a, b) => a - b);

export function parseKinds(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length < MIN_SHIPS || raw.length > MAX_SHIPS) return null;
  if (raw.some((k) => !Number.isInteger(k) || k < 0 || k >= FLEET.length) || new Set(raw).size !== raw.length) return null;
  return [...(raw as number[])].sort((a, b) => a - b);
}

/** Ô → vị trí tàu trong `fleet` (-1 là biển). */
export function fleetGrid(fleet: readonly Ship[]): Int8Array | null {
  if (!parseKinds(fleet.map((s) => s.k))) return null;
  const grid = new Int8Array(CELLS).fill(-1);
  for (let i = 0; i < fleet.length; i++) {
    const cells = shipCells(fleet[i]);
    if (!cells) return null;
    for (const c of cells) {
      if (grid[c] >= 0) return null;
      grid[c] = i;
    }
  }
  return grid;
}

export function parseFleet(raw: unknown): Fleet | null {
  if (!Array.isArray(raw)) return null;
  const fleet = raw.map((s) => ({ k: (s as Ship)?.k, at: (s as Ship)?.at, o: (s as Ship)?.o }));
  if (fleet.some((s) => !Number.isInteger(s.k) || !inRange(s.at) || !Number.isInteger(s.o))) return null;
  return fleetGrid(fleet) ? fleet : null;
}

const touches = (a: number, b: number) => Math.abs((a % SIZE) - (b % SIZE)) <= 1 && Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) <= 1;

// Các tàu không chạm nhau: luật không cấm, chỉ cho đẹp và khó đoán hơn. Không nói loại tàu thì chọn ngẫu nhiên cả loại
// lẫn số lượng.
export function randomFleet(kinds?: readonly number[], rand: () => number = Math.random): Fleet {
  kinds ??= randomKinds(rand);
  for (;;) {
    const fleet: Fleet = [];
    const used: number[] = [];
    for (const [n, k] of kinds.entries()) {
      const os = orients(k);
      for (let tries = 0; tries < 200; tries++) {
        const ship = { k, at: Math.floor(rand() * CELLS), o: os[Math.floor(rand() * os.length)] };
        const cells = shipCells(ship);
        if (!cells || cells.some((c) => used.some((u) => touches(c, u)))) continue;
        fleet.push(ship);
        used.push(...cells);
        break;
      }
      if (fleet.length !== n + 1) break;
    }
    if (fleet.length === kinds.length) return fleet;
  }
}

/** Chọn ngẫu nhiên từ MIN_SHIPS tới MAX_SHIPS loại tàu khác nhau. */
export function randomKinds(rand: () => number = Math.random): number[] {
  const pool = FLEET.map((_, k) => k);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, MIN_SHIPS + Math.floor(rand() * (MAX_SHIPS - MIN_SHIPS + 1))).sort((a, b) => a - b);
}

export function answerShot(fleet: readonly Ship[], prior: readonly number[], c: number): Shot {
  const grid = fleetGrid(fleet);
  const i = grid ? grid[c] : -1;
  if (i < 0) return { c, r: 0 };
  const ship = fleet[i];
  const hit = new Set([...prior, c]);
  if (!shipCells(ship)!.every((x) => hit.has(x))) return { c, r: 1 };
  return { c, r: 2, k: ship.k, at: ship.at, o: ship.o };
}

// `passes[j]` là số phát bắn đã có lúc một người mất lượt vì hết giờ (tăng dần, lặp lại được khi mất lượt liên tiếp).
// `kinds[i]` là các loại tàu bên i đã công bố: khai chìm loại khác là sai, chìm đủ thì bên kia thắng.
export function replay(
  log: readonly Shot[],
  opts: Pick<BsOptions, "chain">,
  passes: readonly number[] = [],
  kinds: readonly [readonly number[], readonly number[]] = [CLASSIC, CLASSIC],
): BsState {
  const s: BsState = {
    shots: [],
    marks: [new Int8Array(CELLS).fill(-1), new Int8Array(CELLS).fill(-1)],
    sunk: [[], []],
    turn: 0,
    pending: -1,
    winner: -1,
    passed: -1,
  };
  let j = 0;
  for (let i = 0; i <= log.length && s.winner < 0; i++) {
    for (; j < passes.length && passes[j] === i; j++) {
      s.passed = s.turn;
      s.turn = (1 - s.turn) as 0 | 1;
    }
    if (i === log.length) break;
    const shot = log[i];
    const foe = (1 - s.turn) as 0 | 1;
    const marks = s.marks[foe];
    if (!shot || !inRange(shot.c) || marks[shot.c] >= 0 || (shot.p !== undefined && shot.p !== s.turn)) break;
    if (shot.r === undefined) {
      if (i !== log.length - 1) break;
      s.pending = shot.c;
      s.passed = -1;
      s.shots.push({ c: shot.c, by: s.turn });
      break;
    }
    if (shot.r !== 0 && shot.r !== 1 && shot.r !== 2) break;
    if (shot.r === 2) {
      const ship = { k: shot.k as number, at: shot.at as number, o: shot.o as number };
      const cells = kinds[foe].includes(ship.k) ? shipCells(ship) : null;
      if (!cells || s.sunk[foe].some((x) => x.k === ship.k) || !cells.includes(shot.c)) break;
      const taken = new Set(s.sunk[foe].flatMap((x) => shipCells(x)!));
      if (cells.some((c) => taken.has(c) || (c !== shot.c && marks[c] !== 1))) break;
      s.sunk[foe].push(ship);
      s.shots.push({ c: shot.c, r: 2, ...ship, by: s.turn });
    } else s.shots.push({ c: shot.c, r: shot.r, by: s.turn });
    s.passed = -1;
    marks[shot.c] = shot.r ? 1 : 0;
    if (s.sunk[foe].length === kinds[foe].length) s.winner = s.turn;
    else if (!shot.r || !opts.chain) s.turn = foe;
  }
  return s;
}

export const shotsAt = (s: BsState, side: 0 | 1) => s.shots.filter((x) => x.by !== side && x.r !== undefined);

export function honest(fleet: readonly Ship[], answered: readonly Shot[]): boolean {
  if (!fleetGrid(fleet)) return false;
  const prior: number[] = [];
  for (const shot of answered) {
    const want = answerShot(fleet, prior, shot.c);
    if (want.r !== shot.r || (want.r === 2 && (want.k !== shot.k || want.at !== shot.at || want.o !== shot.o))) return false;
    prior.push(shot.c);
  }
  return true;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

// Thiếu muối thì thử hết các cách bày (hữu hạn) là dò ngược ra sơ đồ.
export const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));

export async function commitOf(fleet: readonly Ship[], salt: string): Promise<string> {
  const body = `${salt}|${fleet.map((s) => `${s.k}@${s.at}o${s.o}`).join(",")}`;
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))));
}

const COL_NAMES = "ABCDEFGHIJ";

export const coord = (c: number) => `${COL_NAMES[c % SIZE]}${Math.floor(c / SIZE) + 1}`;
export const colName = (x: number) => COL_NAMES[x];
