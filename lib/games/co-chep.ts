/**
 * Luật cò chẹp – chiếm nhà, 1 đến 5 người.
 *
 * Sân (đơn vị cm, gốc ở mép dưới ô 1, trục y hướng về phía Trời):
 *
 *            ( Trời )        ← nửa hình tròn phía trên ô 7–8, không có vạch bao
 *          [ 7 | 8 ]         ← hàng 6: chẹp
 *            [ 6 ]           ← hàng 5: cò
 *          [ 4 | 5 ]         ← hàng 4: chẹp
 *            [ 3 ]           ← hàng 3
 *            [ 2 ]           ← hàng 2
 *            [ 1 ]           ← hàng 1
 *            Đất             ← chỗ đứng chọi
 *
 * Mỗi người đi hành trình 1 → 8 (chọi đá trúng ô mục tiêu rồi nhảy một vòng nhặt đá về), xong thì chọi đá lên Trời,
 * nhảy chẹp quanh đá rồi chọi qua lưng: trúng ô trống hoàn toàn thì chiếm làm nhà và bắt đầu lại hành trình mới.
 * Phạm lỗi thì mất lượt nhưng giữ nguyên tiến độ (đá đang nằm đâu vẫn nằm đó).
 *
 * Phần nhảy tự động: lỗi nhảy là ngẫu nhiên tất định (băm từ `seed` của ván và vị trí trong nhật ký), nguy cơ tăng khi
 * phải nhảy vượt nhiều hàng liền bị chặn (đá, nhà người khác). Phần chọi đá do người chơi kéo thả — máy người chọi
 * tính quỹ đạo rồi ghi điểm rơi (số nguyên) vào nhật ký, mọi máy phân xử từ điểm rơi nên luôn khớp nhau.
 */

// ---------- sân ----------

export type Rect = { x0: number; x1: number; y0: number; y1: number };

/** Bề ngang sân. */
export const COURT_W = 200;
/** Nửa bề dày vạch kẻ. */
export const LINE = 3;
/** Bán kính viên đá. */
export const STONE_R = 7;

/** Ô 1..8 (chỉ số 0 bỏ trống cho dễ đọc). */
export const CELLS: readonly Rect[] = [
  { x0: 0, x1: 0, y0: 0, y1: 0 },
  { x0: 50, x1: 150, y0: 0, y1: 80 },
  { x0: 50, x1: 150, y0: 80, y1: 160 },
  { x0: 50, x1: 150, y0: 160, y1: 240 },
  { x0: 0, x1: 100, y0: 240, y1: 320 },
  { x0: 100, x1: 200, y0: 240, y1: 320 },
  { x0: 50, x1: 150, y0: 320, y1: 400 },
  { x0: 0, x1: 100, y0: 400, y1: 480 },
  { x0: 100, x1: 200, y0: 400, y1: 480 },
];

/** Các hàng từ dưới lên: hàng 1 → 6 (chỉ số 0 là Đất). Hàng hai ô là ô chẹp. */
export const ROWS: readonly (readonly number[])[] = [[], [1], [2], [3], [4, 5], [6], [7, 8]];
export const ROW_OF = [0, 1, 2, 3, 4, 4, 5, 6, 6];
/** Hàng ảo của Trời trong đường nhảy. */
export const TROI_ROW = 7;
/** Mục tiêu "Trời" (sau ô 8). */
export const TROI = 9;

/** Trời: nửa hình tròn trên mép ô 7–8. */
export const SKY = { cx: 100, cy: 480, r: 110 };
/** Ô Đất — chỗ đứng chọi, trước mép dưới ô 1. */
export const GROUND: Rect = { x0: 10, x1: 190, y0: -100, y1: 0 };

/** Điểm rơi được ghi trong khung này (ngoài nữa là quá xa, coi như nhật ký hỏng). */
const FIELD: Rect = { x0: -600, x1: 800, y0: -600, y1: 1400 };

export type Spot = { kind: "cell"; cell: number } | { kind: "line" } | { kind: "troi" } | { kind: "out" };

const d2Rect = (x: number, y: number, r: Rect, pad: number) => {
  const dx = Math.max(r.x0 - pad - x, 0, x - r.x1 - pad);
  const dy = Math.max(r.y0 - pad - y, 0, y - r.y1 - pad);
  return dx * dx + dy * dy;
};

/** Viên đá tâm (x, y) nằm ở đâu: gọn trong một ô, chạm vạch, trên Trời, hay ngoài sân. Toạ độ nguyên → kết quả tất định. */
export function classify(x: number, y: number): Spot {
  const pad = STONE_R + LINE;
  for (let c = 1; c <= 8; c++) {
    const r = CELLS[c];
    if (x - pad >= r.x0 && x + pad <= r.x1 && y - pad >= r.y0 && y + pad <= r.y1) return { kind: "cell", cell: c };
  }
  for (let c = 1; c <= 8; c++) if (d2Rect(x, y, CELLS[c], LINE) < STONE_R * STONE_R) return { kind: "line" };
  const dx = x - SKY.cx;
  const dy = y - SKY.cy;
  if (y > SKY.cy && dx * dx + dy * dy <= SKY.r * SKY.r) return { kind: "troi" };
  return { kind: "out" };
}

// ---------- nhật ký & trạng thái ----------

/** Phần công khai của ván do chủ phòng ghi: seed cho các lần nhảy, người bỏ cuộc → số dòng nhật ký lúc bị loại. */
export type CcPublic = { seed: number; out: Record<string, number> };

/**
 * Một dòng nhật ký: `t` chọi đá (điểm rơi `x, y`, chỗ chạm đất trước khi trượt `lx, ly` — chỉ để diễn lại), `h` nhảy
 * tiếp khi lượt mới bắt đầu mà đá còn nằm trên sân, `skip` chủ phòng cho qua lượt người treo máy, `end` chủ phòng chốt ván.
 */
export type CcAct = { k: "t"; u: string; x: number; y: number; lx: number; ly: number } | { k: "h"; u: string } | { k: "skip"; u: string } | { k: "end" };

export type Racer = {
  uid: string;
  /** Ô cuối cùng đã chinh phục trong hành trình hiện tại (0 là chưa ô nào). */
  progress: number;
  /** Đá đang nằm ở đâu: 0 trong tay, 1..8 trong ô, 9 trên Trời. */
  stone: number;
  /** Đã nhảy chẹp quanh đá trên Trời xong, đang chờ chọi qua lưng. */
  back: boolean;
  out: boolean;
  throws: number;
  /** Số cú chọi hợp lệ (trúng mục tiêu, lên Trời, chiếm nhà). */
  hits: number;
  faults: number;
  claimed: number;
  burnt: number;
};

export type Verdict = "hit" | "troi" | "claim" | "burn" | "house" | "stone" | "miss" | "line" | "out";

/** Một bước nhảy: đứng ở hàng `row` (0 Đất, 7 Trời) bằng các chân trong `cells`; `pick` là nhặt đá ở bước này. */
export type Step = { row: number; cells: number[]; pick?: boolean; dir?: "up" | "down" | "left" | "right" };

export type Snap = { owners: number[]; stones: number[]; backs: boolean[] };

type CcHappening =
  | { t: "turn"; who: number; why: "start" | "miss" | "fault" | "skip" | "out" | "burn" }
  | { t: "throw"; i: number; who: number; mode: "front" | "back"; target: number; x: number; y: number; lx: number; ly: number; spot: Spot; verdict: Verdict }
  | { t: "hop"; i: number; who: number; mode: "cell" | "troi"; path: Step[]; risk: number; fail: number }
  | { t: "end"; why: "full" | "host" | "alone" };

/** Diễn biến của ván theo thứ tự, kèm ảnh chụp sân ngay sau đó (`snap`) để bàn chơi diễn lại từng bước. */
export type CcEvent = CcHappening & { snap: Snap };

export type CcState = {
  players: Racer[];
  /** Theo ô 1..8: 0 trống, k là chủ nhà (người thứ k trong đội hình, đếm từ 1). */
  owners: number[];
  /** Người đang tới lượt (chỉ số trong đội hình); -1 khi đã hết ván. */
  turn: number;
  /** Việc người tới lượt phải làm. */
  need: "throw" | "back" | "hop" | null;
  /** Mục tiêu của cú chọi kế tiếp (1..8 hoặc 9 = Trời); 0 nếu không phải chọi từ Đất. */
  target: number;
  /** Số dòng nhật ký hợp lệ đã áp dụng. */
  count: number;
  events: CcEvent[];
  over: boolean;
  end?: "full" | "host" | "alone";
};

/** Nguy cơ phạm lỗi (phần nghìn): mỗi lượt nhảy, theo số hàng liền bị chặn phải nhảy vượt, và động tác chẹp quanh đá. */
export const BASE_RISK = 30;
export const GAP_RISK = [0, 0, 300, 600, 900];
export const ROUTINE_RISK = 80;

/** Số nhà của người thứ k (đếm từ 0). */
export const housesOf = (s: Pick<CcState, "owners">, k: number) => s.owners.filter((o) => o === k + 1).length;

/** Mục tiêu kế tiếp của một người: ô chưa ai làm nhà đầu tiên sau tiến độ, hết ô thì lên Trời. */
export function targetOf(owners: readonly number[], p: Racer) {
  for (let c = p.progress + 1; c <= 8; c++) if (!owners[c]) return c;
  return TROI;
}

/** Băm tất định ra số 0..999 (Math.imul cho kết quả như nhau trên mọi trình duyệt). */
export function roll(seed: number, ...parts: (string | number)[]) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  const s = parts.join(":");
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % 1000;
}

const snap = (s: CcState): Snap => ({ owners: [...s.owners], stones: s.players.map((p) => p.stone), backs: s.players.map((p) => p.back) });

/** Ô `c` có cấm người thứ `k` nhảy vào không: đá (của người khác, hoặc của mình khi chưa nhặt) hay nhà người khác. */
function blocked(s: CcState, k: number, c: number, ownStoneGone: boolean) {
  if (s.owners[c] && s.owners[c] !== k + 1) return true;
  return s.players.some((p, j) => p.stone === c && !(j === k && ownStoneGone));
}

/**
 * Đường nhảy tự động của người thứ `k`. `cell`: từ Đất nhảy lên tới hàng xa nhất, quay đầu, nhặt đá ở hàng ngay trước
 * ô có đá rồi nhảy về Đất. `troi`: nhảy lên tới ô chẹp 7–8, vào Trời và chẹp quanh đá bốn hướng.
 * `gaps` là các chỗ phải nhảy vượt hàng bị chặn: bước đáp xuống và số hàng vượt qua.
 */
export function hopPath(s: CcState, k: number, mode: "cell" | "troi") {
  const path: Step[] = [];
  const gaps: { at: number; len: number }[] = [];
  const own = s.players[k].stone;
  const rs = mode === "cell" ? ROW_OF[own] : TROI_ROW;
  let run = 0;
  const land = (row: number, cells: number[]) => {
    if (run) gaps.push({ at: path.length, len: run });
    run = 0;
    path.push({ row, cells });
  };
  for (let r = 1; r <= 6; r++) {
    const free = ROWS[r].filter((c) => !blocked(s, k, c, false));
    if (free.length) land(r, free);
    else run++;
  }
  if (mode === "troi") {
    // Hàng bị chặn ngay trước Trời cũng phải nhảy vượt.
    for (const dir of ["up", "right", "down", "left"] as const) {
      land(TROI_ROW, []);
      path[path.length - 1].dir = dir;
    }
    return { path, gaps };
  }
  if (!path.length) {
    // Cả sáu hàng bị chặn: phải nhảy một mạch từ Đất — gần như chắc chắn ngã.
    gaps.push({ at: 0, len: 6 });
    path.push({ row: 0, cells: [], pick: true });
    return { path, gaps };
  }
  run = 0;
  let picked = false;
  const top = path[path.length - 1].row;
  for (let r = top - 1; r >= 0; r--) {
    if (!picked && r <= rs) {
      // Nhặt đá ở bước đang đứng (hàng ngay trước ô có đá trên đường về).
      if (path.length) path[path.length - 1].pick = true;
      picked = true;
    }
    if (r === 0) {
      land(0, []);
      break;
    }
    const free = ROWS[r].filter((c) => !blocked(s, k, c, picked));
    if (free.length) land(r, free);
    else run++;
  }
  if (!picked) path[path.length - 1].pick = true;
  return { path, gaps };
}

/** Nguy cơ phạm lỗi (phần nghìn) của một đường nhảy. */
export function riskOf(gaps: readonly { len: number }[], troi: boolean) {
  let ok = 1000 - BASE_RISK;
  for (const g of gaps) ok = Math.floor((ok * (1000 - GAP_RISK[Math.min(g.len, GAP_RISK.length - 1)])) / 1000);
  if (troi) ok = Math.floor((ok * (1000 - ROUTINE_RISK)) / 1000);
  return 1000 - ok;
}

/** Phân xử điểm rơi của cú chọi kế tiếp của người thứ `k` (chọi từ Đất, hoặc qua lưng khi đang ở Trời). */
export function judge(s: Pick<CcState, "owners" | "players">, k: number, x: number, y: number): { spot: Spot; verdict: Verdict; target: number } {
  const p = s.players[k];
  const target = p.back ? 0 : targetOf(s.owners, p);
  const spot = classify(x, y);
  if (spot.kind === "line") return { spot, target, verdict: "line" };
  if (spot.kind === "out") return { spot, target, verdict: "out" };
  if (spot.kind === "troi") return { spot, target, verdict: target === TROI ? "troi" : "out" };
  const c = spot.cell;
  if (s.owners[c] === k + 1) return { spot, target, verdict: "burn" };
  if (s.owners[c]) return { spot, target, verdict: "house" };
  if (s.players.some((q, j) => j !== k && q.stone === c)) return { spot, target, verdict: "stone" };
  if (p.back) return { spot, target, verdict: "claim" };
  return { spot, target, verdict: c === target ? "hit" : "miss" };
}

const isInt = (v: unknown, r: [number, number]) => Number.isInteger(v) && (v as number) >= r[0] && (v as number) <= r[1];

/**
 * Dựng lại ván từ nhật ký. Tất định: cùng đội hình, nhật ký, danh sách người bỏ cuộc (`out`: uid → số dòng nhật ký lúc
 * bị loại) và `seed` thì ra cùng kết quả. Dòng không hợp lệ (sai người, sai việc, sau khi hết ván) thì dừng tại đó.
 */
export function replay(lineup: readonly string[], acts: readonly CcAct[], out: Readonly<Record<string, number>>, seed: number): CcState {
  const s: CcState = {
    players: lineup.map((uid) => ({ uid, progress: 0, stone: 0, back: false, out: false, throws: 0, hits: 0, faults: 0, claimed: 0, burnt: 0 })),
    owners: Array(9).fill(0),
    turn: 0,
    need: null,
    target: 0,
    count: 0,
    events: [],
    over: false,
  };
  const n = lineup.length;
  const push = (e: CcHappening) => s.events.push({ ...e, snap: snap(s) });
  const finish = (why: "full" | "host" | "alone") => {
    s.over = true;
    s.end = why;
    s.turn = -1;
    push({ t: "end", why });
  };
  const pass = (why: "miss" | "fault" | "skip" | "out" | "burn") => {
    for (let d = 1; d <= n; d++) {
      const j = (s.turn + d) % n;
      if (!s.players[j].out) {
        s.turn = j;
        push({ t: "turn", who: j, why });
        return;
      }
    }
  };
  /** Loại những người bỏ cuộc tính tới dòng `i`; còn ≤ 1 người (ván nhiều người) thì hết ván. */
  const prune = (i: number) => {
    let cur = false;
    s.players.forEach((p, j) => {
      if (p.out || out[p.uid] === undefined || out[p.uid] > i) return;
      p.out = true;
      p.stone = 0;
      p.back = false;
      if (j === s.turn) cur = true;
    });
    const left = s.players.filter((p) => !p.out).length;
    if (left === 0 || (n > 1 && left === 1)) return finish("alone");
    if (cur) pass("out");
  };
  const hop = (i: number, k: number, mode: "cell" | "troi") => {
    const p = s.players[k];
    const { path, gaps } = hopPath(s, k, mode);
    const risk = riskOf(gaps, mode === "troi");
    let fail = -1;
    if (roll(seed, i, k, "hop") < risk) {
      const worst = gaps.filter((g) => GAP_RISK[Math.min(g.len, GAP_RISK.length - 1)] > 0).sort((a, b) => b.len - a.len)[0];
      const r2 = roll(seed, i, k, "where");
      fail = worst ? worst.at : mode === "troi" ? path.length - 4 + (r2 % 4) : r2 % Math.max(1, path.length - 1);
    }
    if (fail < 0) {
      if (mode === "cell") p.progress = p.stone;
      else p.back = true;
      p.stone = 0;
    } else p.faults++;
    push({ t: "hop", i, who: k, mode, path, risk, fail });
    if (fail >= 0) pass("fault");
  };

  if (!n) return s;
  push({ t: "turn", who: 0, why: "start" });
  for (let i = 0; i < acts.length; i++) {
    if (s.over) break;
    prune(i);
    if (s.over) break;
    const a = acts[i] as CcAct | undefined;
    const p = s.players[s.turn];
    if (!a || typeof a !== "object") break;
    if (a.k === "end") {
      s.count++;
      finish("host");
      break;
    }
    if (a.u !== p.uid) break;
    if (a.k === "skip") {
      // Treo máy giữa lúc chờ chọi qua lưng thì coi như hỏng cú đó: đá ở lại Trời, lượt sau nhảy lên lại.
      if (p.back) {
        p.back = false;
        p.stone = TROI;
      }
      s.count++;
      pass("skip");
      continue;
    }
    if (a.k === "h") {
      if (!p.stone || p.back) break;
      s.count++;
      hop(i, s.turn, p.stone === TROI ? "troi" : "cell");
      continue;
    }
    if (a.k !== "t" || p.stone || ![a.x, a.y, a.lx, a.ly].every((v) => isInt(v, [FIELD.x0, FIELD.y1]))) break;
    const k = s.turn;
    const mode = p.back ? "back" : "front";
    const { spot, verdict, target } = judge(s, k, a.x, a.y);
    s.count++;
    p.throws++;
    if (verdict === "hit" || verdict === "troi" || verdict === "claim") p.hits++;
    if (verdict === "hit" && spot.kind === "cell") p.stone = spot.cell;
    if (verdict === "troi") p.stone = TROI;
    if (verdict === "claim" && spot.kind === "cell") {
      s.owners[spot.cell] = k + 1;
      p.claimed++;
      p.progress = 0;
    }
    if (verdict === "burn" && spot.kind === "cell") {
      s.owners[spot.cell] = 0;
      p.burnt++;
    }
    p.back = false;
    push({ t: "throw", i, who: k, mode, target, x: a.x, y: a.y, lx: a.lx, ly: a.ly, spot, verdict });
    if (verdict === "hit") hop(i, k, "cell");
    else if (verdict === "troi") hop(i, k, "troi");
    else if (verdict === "claim") {
      if (s.owners.slice(1).every(Boolean)) finish("full");
    } else pass(verdict === "burn" ? "burn" : "miss");
  }
  if (!s.over) prune(acts.length);
  if (!s.over) {
    const p = s.players[s.turn];
    s.need = p.stone ? "hop" : p.back ? "back" : "throw";
    s.target = s.need === "throw" ? targetOf(s.owners, p) : 0;
  }
  return s;
}

/** Người thắng khi hết ván: người còn trong ván có nhiều nhà nhất (bằng nhau thì cùng thắng); không ai có nhà thì không ai thắng. */
export function standings(s: CcState) {
  const live = s.players.map((p, k) => ({ k, uid: p.uid, houses: housesOf(s, k), out: p.out })).filter((x) => !x.out);
  if (s.end === "alone") return live.map((x) => x.uid);
  const best = Math.max(0, ...live.map((x) => x.houses));
  return best ? live.filter((x) => x.houses === best).map((x) => x.uid) : [];
}

// ---------- cú chọi (chỉ máy người chọi tính) ----------

export const GRAVITY = 980;
/** Góc ném cố định (rad) — kéo dài/ngắn chỉ đổi lực. */
export const ELEVATION = 0.72;
/** Chỗ tay người chọi: đứng ở ô Đất (chọi về phía Trời), hoặc đứng trên Trời quay lưng (chọi ngược về Đất). */
export const ORIGIN = { front: { x: 100, y: -55, z: 105 }, back: { x: 100, y: 535, z: 150 } } as const;
/** Tầm xa ứng với lực 0 → 1 (tính trên mặt đất, chưa kể đá trượt). */
export const REACH = { front: [30, 720], back: [30, 640] } as const;
/** Góc lệch tối đa so với trục sân. */
export const MAX_YAW = 0.6;
/** Đá chạm đất còn trượt thêm một quãng theo hướng bay. */
export const SLIDE = 0.07;

export type ThrowMode = keyof typeof ORIGIN;
export type Launch = { mode: ThrowMode; from: { x: number; y: number; z: number }; vx: number; vy: number; vz: number; t: number };

/** Vận tốc ban đầu để đá chạm đất cách chỗ tay một quãng `d` (theo phương ngang). */
function speedFor(d: number, z0: number) {
  const c = Math.cos(ELEVATION);
  return Math.sqrt((GRAVITY * d * d) / (2 * c * c * (z0 + d * Math.tan(ELEVATION))));
}

/** Thời gian bay tới khi chạm đất. */
function airtime(vz: number, z0: number) {
  return (vz + Math.sqrt(vz * vz + 2 * GRAVITY * z0)) / GRAVITY;
}

/**
 * Lực `power` (0..1) và góc lệch `yaw` (rad, dương là lệch sang phải theo hướng ném) → cú ném. `jitter` (−1..1, hai số)
 * làm tay hơi run: lệch tầm xa và hướng một chút cho mỗi cú một khác.
 */
export function launch(mode: ThrowMode, power: number, yaw: number, jitter: [number, number] = [0, 0]): Launch {
  const from = ORIGIN[mode];
  const [lo, hi] = REACH[mode];
  const p = Math.min(1, Math.max(0, power));
  const d = (lo + p * (hi - lo)) * (1 + jitter[0] * 0.035);
  const w = Math.max(-MAX_YAW, Math.min(MAX_YAW, yaw)) + jitter[1] * 0.025;
  const v = speedFor(d, from.z);
  const vh = v * Math.cos(ELEVATION);
  // Chọi từ Đất bay theo +y (bên phải hướng bay là +x); chọi qua lưng bay theo −y (bên phải hướng bay là −x).
  const dir = mode === "front" ? 1 : -1;
  const vx = vh * Math.sin(w) * dir;
  const vy = vh * Math.cos(w) * dir;
  const vz = v * Math.sin(ELEVATION);
  return { mode, from, vx, vy, vz, t: airtime(vz, from.z) };
}

/** Góc lệch `yaw` (cho `launch`) của hướng bay `(hx, hy)` trên mặt sân. */
export const yawOf = (mode: ThrowMode, hx: number, hy: number) => (mode === "front" ? Math.atan2(hx, hy) : Math.atan2(-hx, -hy));

/** Vị trí viên đá lúc `t` giây sau khi rời tay. */
export function flightAt(l: Launch, t: number) {
  const tt = Math.min(t, l.t);
  return { x: l.from.x + l.vx * tt, y: l.from.y + l.vy * tt, z: Math.max(0, l.from.z + l.vz * tt - (GRAVITY * tt * tt) / 2) };
}

/** Chỗ chạm đất và chỗ dừng sau khi trượt — làm tròn thành số nguyên để ghi nhật ký. */
export function landing(l: Launch) {
  const g = flightAt(l, l.t);
  return { lx: Math.round(g.x), ly: Math.round(g.y), x: Math.round(g.x + l.vx * l.t * SLIDE), y: Math.round(g.y + l.vy * l.t * SLIDE) };
}

/** Dựng lại cú ném từ điểm chạm đất (để máy khác diễn lại đường bay giống người chọi đã thấy). */
export function relaunch(mode: ThrowMode, lx: number, ly: number): Launch {
  const from = ORIGIN[mode];
  const dx = lx - from.x;
  const dy = ly - from.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const v = speedFor(d, from.z);
  const vh = v * Math.cos(ELEVATION);
  const vz = v * Math.sin(ELEVATION);
  return { mode, from, vx: (vh * dx) / d, vy: (vh * dy) / d, vz, t: airtime(vz, from.z) };
}
