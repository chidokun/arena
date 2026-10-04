/**
 * Luật lô tô ngày Tết. Bộ 10 màu × 2 tờ = 20 tờ; mỗi tờ 9 hàng × 9 cột chia 3 khối, mỗi hàng đúng 5 số.
 * Cột c chứa các số thuộc chục c (cột đầu 1–9, cột cuối 80–90). Hai tờ cùng màu bù trừ nhau: gộp lại đủ 1–90,
 * mỗi số đúng một lần. Bộ tờ sinh tất định từ hạt giống (seed) của phòng nên máy nào cũng tự dựng ra giống hệt.
 * Ván đấu cũng tất định: dựng lại từ dãy số đã kêu và các tờ đã chia — ai cũng tự tính được ai đợi, ai kinh.
 */

export type LotoOptions = {
  /** Hạt giống sinh bộ tờ của phòng. */
  seed: number;
  /** Khoảng cách giữa hai lần kêu số (ms). */
  interval: number;
};

/** Màu của từng cặp tờ; `ink` là màu chữ đặt trên nền màu đó. */
export const SHEET_COLORS: { name: string; hex: string; ink: string }[] = [
  { name: "Đỏ", hex: "#e5383b", ink: "#fff" },
  { name: "Cam", hex: "#f77f00", ink: "#fff" },
  { name: "Vàng", hex: "#f2c40f", ink: "#2b1d00" },
  { name: "Lục", hex: "#2a9d4b", ink: "#fff" },
  { name: "Ngọc", hex: "#0ea5a4", ink: "#fff" },
  { name: "Lam", hex: "#2f86eb", ink: "#fff" },
  { name: "Chàm", hex: "#4f46e5", ink: "#fff" },
  { name: "Tím", hex: "#9333ea", ink: "#fff" },
  { name: "Hồng", hex: "#ec4899", ink: "#fff" },
  { name: "Nâu", hex: "#a0603a", ink: "#fff" },
];

export const SHEET_COUNT = SHEET_COLORS.length * 2;
export const ROWS = 9;
export const COLS = 9;
export const PER_ROW = 5;
export const MAX_NUMBER = 90;
/** Mỗi người giữ tối đa bấy nhiêu tờ. */
export const MAX_PICK = 2;
/** Nhịp kêu số chủ phòng chọn được (ms). */
export const PACES = [3000, 5000, 8000];
export const PACE_NAMES: Record<number, string> = { 3000: "Nhanh", 5000: "Vừa", 8000: "Thong thả" };
export const DEFAULT_PACE = 5000;
/** Nhịp kêu số trong tuỳ chọn phòng; giá trị lạ thì về mặc định để chủ phòng không kêu dồn dập. */
export const paceOf = (opts: { interval?: unknown }) => (PACES.includes(opts.interval as number) ? (opts.interval as number) : DEFAULT_PACE);
/** Câu rao khi một hàng đã có 4/5 số. */
export const SHOUTS = ["Hò!", "Hẹn!", "Đợi!"];

/** Mỗi khối 3 hàng; một màu (2 tờ) gồm 6 khối, mỗi khối 15 số. */
const BLOCK = 3;
const STRIP_BLOCKS = 6;
const BLOCK_SIZE = BLOCK * PER_ROW;

export type Sheet = {
  id: number;
  /** Chỉ số trong SHEET_COLORS; hai tờ cùng màu có id `2·màu` và `2·màu + 1`. */
  color: number;
  /** Tờ thứ mấy của màu (1 hoặc 2). */
  no: number;
  /** 9 hàng × 9 cột; 0 là ô trống. */
  rows: number[][];
};

export const isSheetId = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < SHEET_COUNT;

export const sheetName = (id: number) => `${SHEET_COLORS[id >> 1].name} ${(id & 1) + 1}`;

/** Cột của một số: 1–9 ở cột 0, 10–19 ở cột 1… 80–90 ở cột 8. */
export const columnOf = (n: number) => Math.min(Math.floor(n / 10), COLS - 1);

function columnNumbers(c: number) {
  const lo = c === 0 ? 1 : c * 10;
  const hi = c === COLS - 1 ? MAX_NUMBER : c * 10 + 9;
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/** Bộ sinh số giả ngẫu nhiên mulberry32: cùng seed ra cùng dãy. */
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

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const indices = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * Mỗi khối có bao nhiêu số ở từng cột: ít nhất 1, nhiều nhất 3, mỗi khối đủ 15, mỗi cột đủ số của chục đó.
 * Chia dần từng số dư của cột cho khối còn thiếu nhiều nhất (hoà thì bốc ngẫu nhiên); kẹt thì trả null để thử lại.
 */
function blockCounts(rand: () => number): number[][] | null {
  const counts = indices(STRIP_BLOCKS).map(() => new Array<number>(COLS).fill(1));
  const need = new Array<number>(STRIP_BLOCKS).fill(BLOCK_SIZE - COLS);
  // Sắp ổn định sau khi xáo: cột nhiều số chia trước, các cột bằng nhau theo thứ tự ngẫu nhiên.
  const cols = shuffle(indices(COLS), rand).sort((a, b) => columnNumbers(b).length - columnNumbers(a).length);
  for (const c of cols) {
    for (let extra = columnNumbers(c).length - STRIP_BLOCKS; extra > 0; extra--) {
      const open = shuffle(indices(STRIP_BLOCKS), rand).filter((b) => need[b] > 0 && counts[b][c] < BLOCK);
      if (!open.length) return null;
      const b = open.reduce((best, x) => (need[x] > need[best] ? x : best));
      counts[b][c]++;
      need[b]--;
    }
  }
  return need.every((n) => n === 0) ? counts : null;
}

/**
 * Xếp ô có số trong một khối 3 hàng sao cho mỗi hàng đúng 5 số: cột nhiều số xếp trước, mỗi cột chọn những hàng
 * còn trống nhiều nhất (thuật toán Ryser — luôn ra lời giải khi mỗi cột có 1–3 số và tổng là 15).
 */
function layoutBlock(counts: number[], rand: () => number): boolean[][] | null {
  const grid = indices(BLOCK).map(() => new Array<boolean>(COLS).fill(false));
  const left = new Array<number>(BLOCK).fill(PER_ROW);
  const cols = shuffle(indices(COLS), rand).sort((a, b) => counts[b] - counts[a]);
  for (const c of cols) {
    const rows = shuffle(indices(BLOCK), rand)
      .sort((a, b) => left[b] - left[a])
      .slice(0, counts[c]);
    if (rows.some((r) => left[r] === 0)) return null;
    for (const r of rows) {
      grid[r][c] = true;
      left[r]--;
    }
  }
  return left.every((x) => x === 0) ? grid : null;
}

/** Một màu = 18 hàng (2 tờ × 9 hàng) phủ đủ 1–90; trong mỗi khối, số trong một cột tăng dần từ trên xuống. */
function makeStrip(rand: () => number): number[][] {
  let counts = blockCounts(rand);
  while (!counts) counts = blockCounts(rand);
  const rows: number[][] = [];
  for (const blockCount of counts) {
    let grid = layoutBlock(blockCount, rand);
    while (!grid) grid = layoutBlock(blockCount, rand);
    for (const line of grid) rows.push(line.map((on) => (on ? -1 : 0)));
  }
  for (let c = 0; c < COLS; c++) {
    const pool = shuffle(columnNumbers(c), rand);
    for (let b = 0; b < STRIP_BLOCKS; b++) {
      const cells = indices(BLOCK)
        .map((r) => b * BLOCK + r)
        .filter((r) => rows[r][c] === -1);
      const nums = pool.splice(0, cells.length).sort((x, y) => x - y);
      cells.forEach((r, i) => (rows[r][c] = nums[i]));
    }
  }
  return rows;
}

/** Sinh cả bộ 20 tờ từ seed. */
export function makeSheets(seed: number): Sheet[] {
  const rand = rng(seed);
  const out: Sheet[] = [];
  for (let color = 0; color < SHEET_COLORS.length; color++) {
    const strip = makeStrip(rand);
    for (let half = 0; half < 2; half++) {
      out.push({ id: color * 2 + half, color, no: half + 1, rows: strip.slice(half * ROWS, (half + 1) * ROWS) });
    }
  }
  return out;
}

/**
 * Các tờ một người được giữ khi xin `pick`: bỏ id không hợp lệ, trùng, hoặc tờ người khác đang giữ; tối đa MAX_PICK tờ.
 * Chủ phòng xét ý định theo thứ tự nên ai xin trước được trước.
 */
export function grantSheets(claims: Record<string, readonly number[]>, uid: string, pick: readonly unknown[]): number[] {
  const taken = new Set(Object.entries(claims).flatMap(([owner, ids]) => (owner === uid ? [] : ids)));
  return [...new Set(pick)].filter((id): id is number => isSheetId(id) && !taken.has(id)).slice(0, MAX_PICK);
}

/**
 * Những người giữ tờ mà chưa bấm sẵn sàng; chủ phòng chỉ bắt đầu được khi không còn ai. Chủ phòng không cần bấm:
 * bấm Bắt đầu đã là sẵn sàng.
 */
export const notReady = (players: readonly string[], host: string, ready: readonly string[]) => players.filter((uid) => uid !== host && !ready.includes(uid));

/** Số ô đã kêu trên một hàng. */
export const rowHits = (row: readonly number[], drawn: readonly boolean[]) => row.reduce((k, n) => k + (n && drawn[n] ? 1 : 0), 0);

export type LotoWin = { uid: string; sheet: number; row: number };

export type LotoState = {
  /** Các số đã kêu hợp lệ theo thứ tự (dừng ở số làm ván kết thúc). */
  draws: number[];
  /** drawn[n] = true nếu số n đã được kêu. */
  drawn: boolean[];
  /** Người kinh — từ hai người trở lên là kinh trùng; rỗng khi ván chưa ngã ngũ. */
  winners: string[];
  /** Các hàng đủ 5 số ở lần kêu cuối. */
  wins: LotoWin[];
  /** waits[k]: những người vừa có một hàng lên 4/5 số nhờ lần kêu thứ k (để rao "Hò! / Hẹn! / Đợi!"). */
  waits: string[][];
};

/**
 * Dựng lại ván từ dãy số đã kêu và các tờ đã chia lúc bắt đầu. Tất định: mọi máy có cùng dữ liệu ra cùng kết quả.
 * Dừng ở số đầu tiên làm ai đó đủ 5 số một hàng; số không hợp lệ (ngoài 1–90, kêu trùng) cũng dừng lại.
 */
export function replay(draws: readonly unknown[], dealt: Record<string, readonly number[]>, sheets: readonly Sheet[]): LotoState {
  const s: LotoState = { draws: [], drawn: new Array<boolean>(MAX_NUMBER + 1).fill(false), winners: [], wins: [], waits: [] };
  const spots = new Map<number, LotoWin[]>();
  for (const [uid, ids] of Object.entries(dealt)) {
    for (const id of ids) {
      sheets[id]?.rows.forEach((row, r) => {
        for (const n of row) if (n) spots.set(n, [...(spots.get(n) ?? []), { uid, sheet: id, row: r }]);
      });
    }
  }
  const hits = new Map<string, number>();
  for (const n of draws) {
    if (s.winners.length) break;
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > MAX_NUMBER || s.drawn[n as number]) break;
    s.drawn[n as number] = true;
    s.draws.push(n as number);
    const waiting: string[] = [];
    for (const p of spots.get(n as number) ?? []) {
      const key = `${p.uid}:${p.sheet}:${p.row}`;
      const k = (hits.get(key) ?? 0) + 1;
      hits.set(key, k);
      if (k === PER_ROW) {
        s.wins.push(p);
        if (!s.winners.includes(p.uid)) s.winners.push(p.uid);
      } else if (k === PER_ROW - 1 && !waiting.includes(p.uid)) waiting.push(p.uid);
    }
    s.waits.push(s.winners.length ? [] : waiting);
  }
  return s;
}

/** Các hàng đang đợi (đã kêu đúng 4/5 số) trên những tờ này, kèm số còn thiếu. */
export function waitingRows(sheets: readonly Sheet[], ids: readonly number[], drawn: readonly boolean[]) {
  const out: { sheet: number; row: number; need: number }[] = [];
  for (const id of ids) {
    sheets[id]?.rows.forEach((row, r) => {
      if (rowHits(row, drawn) === PER_ROW - 1) out.push({ sheet: id, row: r, need: row.find((n) => n && !drawn[n])! });
    });
  }
  return out;
}

/** Rút ngẫu nhiên một số chưa kêu; null khi đã kêu hết. */
export function nextNumber(drawn: readonly boolean[], rand: () => number = Math.random): number | null {
  const left: number[] = [];
  for (let n = 1; n <= MAX_NUMBER; n++) if (!drawn[n]) left.push(n);
  return left.length ? left[Math.floor(rand() * left.length)] : null;
}

/** Băm FNV-1a 32 bit. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Nối tên kiểu tiếng Việt: "An", "An và Bình", "An, Bình và Chi". */
export function joinNames(names: readonly string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} và ${names[names.length - 1]}` : (names[0] ?? "");
}

/** Câu đọc to khi có người vừa đợi (hàng 4/5 số). */
export const waitingLine = (names: readonly string[]) => `${joinNames(names)} đang đợi rồi á nha!`;

/** Câu đọc to khi kinh; nhiều người cùng một số là kinh trùng. */
export const kinhLine = (names: readonly string[]) => `Chúc mừng ${joinNames(names)} đã kinh${names.length > 1 ? " trùng" : ""}!`;

/** Câu rao khi đợi, chọn tất định theo người + ván + lần kêu để máy nào cũng hiện cùng một câu. */
export const shoutFor = (uid: string, round: number, k: number) => SHOUTS[hash(`${uid}:${round}:${k}`) % SHOUTS.length];

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

/** Đọc số 1–90 bằng chữ như người kêu lô tô: 21 "hai mươi mốt", 24 "hai mươi tư", 15 "mười lăm". */
export function docSo(n: number): string {
  if (n < 10) return DIGITS[n];
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  const head = tens === 1 ? "mười" : `${DIGITS[tens]} mươi`;
  if (!unit) return head;
  const tail = unit === 5 ? "lăm" : unit === 1 && tens > 1 ? "mốt" : unit === 4 && tens > 1 ? "tư" : DIGITS[unit];
  return `${head} ${tail}`;
}
