"use client";

import { memo, useEffect, useState } from "react";
import {
  applyStep,
  cloneBoard,
  hasQuan,
  isQuan,
  isQuanNon,
  ownerOf,
  replay,
  ROWS,
  SQUARES,
  type Board,
  type Move,
  type OaqOptions,
  type OaqState,
  type Step,
} from "@/lib/games/oanquan";

/** Cạnh một ô dân, bề ngang ô quan (nửa hình bầu dục) và lề khung. */
const C = 100;
const Q = 92;
const P = 12;
const W = 2 * P + 2 * Q + 5 * C;
const H = 2 * P + 2 * C;

export const OAQ_TONE = { 1: "var(--coral)", 2: "var(--sky)" } as const;

const base = process.env.BASE_PATH ?? "";
/** Quân dân: các viên ngọc cắt từ ảnh trong public/oanquan, mỗi viên chọn ngẫu nhiên (tất định theo ván, ô, thứ tự). */
export const GEMS = ["red", "blue", "green", "yellow", "purple"].map((c) => `${base}/oanquan/gem-${c}.webp`);
/** Quân quan: avatar ông quan — ô 0 là quan nghiêm, ô 6 là quan cười. */
export const QUAN_ART = [`${base}/oanquan/quan-1.webp`, `${base}/oanquan/quan-2.webp`];
/** Viên ngọc đại diện cho từng bên (ứng màu bên: đỏ / xanh). */
export const SIDE_GEM = { 1: GEMS[0], 2: GEMS[1] } as const;
const GOLDEN = 2.399963;

type Spot = { x: number; y: number; quan: boolean; side: "l" | "r" | null; top: boolean; col: number };

/** Vị trí từng ô trên bàn. Mặc định dãy 1–5 ở dưới (trái → phải), lật bàn thì dãy 7–11 ở dưới — người chơi luôn thấy dãy mình ở dưới. */
function spotOf(i: number, flip: boolean): Spot {
  const v = flip ? (i + 6) % SQUARES : i;
  if (v === 0) return { x: P + Q * 0.56, y: P + C, quan: true, side: "l", top: false, col: -1 };
  if (v === 6) return { x: P + Q + 5 * C + Q * 0.44, y: P + C, quan: true, side: "r", top: false, col: 5 };
  const top = v > 6;
  const col = top ? 11 - v : v - 1;
  return { x: P + Q + col * C + C / 2, y: P + (top ? 0 : C) + C / 2, quan: false, side: null, top, col };
}

/** Chỗ xếp dân trong ô quan: vành ngoài trước (giữa ô là avatar quan che), xếp theo hoa hướng dương. */
const QUAN_SLOTS = Array.from({ length: 45 }, (_, j) => j)
  .filter((j) => Math.sqrt((j + 0.5) / 45) > 0.45)
  .reverse()
  .map((j) => ({ r: Math.sqrt((j + 0.5) / 45), a: j * GOLDEN }));

/** Toạ độ quân dân thứ `k` trong ô `i` — rải hình hoa hướng dương, lệch góc theo ô cho đỡ đều tăm tắp. */
function pebbleAt(i: number, k: number, quan: boolean) {
  if (quan) {
    const { r, a } = QUAN_SLOTS[k % QUAN_SLOTS.length];
    return { dx: Math.cos(a + i) * r * Q * 0.42, dy: Math.sin(a + i) * r * C * 0.82 };
  }
  // Vài viên đầu đã tản ra gần hết ô; từ viên thứ 9 xếp vòng quanh mép.
  const r = Math.min(37, Math.sqrt((k + 0.5) / 9) * 36);
  const a = k * GOLDEN + i * 1.7;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
}

const MAX_SHOWN = { dan: 26, quan: 30 };
const GEM = 25;

/** Băm tất định (ván, ô, thứ tự quân) → số nguyên không âm: quân giữ nguyên màu và góc xoay giữa các lần vẽ. */
function hash(seed: number, i: number, k: number) {
  let h = (Math.imul(seed, 374761393) + Math.imul(i, 668265263) + Math.imul(k, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function Pebbles({ i, n, x, y, quan, seed }: { i: number; n: number; x: number; y: number; quan: boolean; seed: number }) {
  const shown = Math.min(n, quan ? MAX_SHOWN.quan : MAX_SHOWN.dan);
  return (
    <>
      {Array.from({ length: shown }, (_, k) => {
        const { dx, dy } = pebbleAt(i, k, quan);
        const h = hash(seed, i, k);
        const cx = x + dx;
        const cy = y + dy;
        return (
          <image
            key={k}
            href={GEMS[h % GEMS.length]}
            x={cx - GEM / 2}
            y={cy - GEM / 2}
            width={GEM}
            height={GEM}
            transform={`rotate(${(h >>> 4) % 360} ${cx} ${cy})`}
          />
        );
      })}
    </>
  );
}

const QUAN_SIZE = 78;

function QuanStone({ i, x, y }: { i: number; x: number; y: number }) {
  return <image href={QUAN_ART[i === 0 ? 0 : 1]} x={x - QUAN_SIZE / 2} y={y - QUAN_SIZE / 2 - 8} width={QUAN_SIZE} height={QUAN_SIZE} className="oaq-quan" />;
}

/** Ô dân / ô quan (hình nền + viền), không gồm quân. */
function Cell({ s, mine }: { s: Spot; mine: boolean }) {
  const fill = mine ? "color-mix(in srgb, var(--board) 88%, var(--sun))" : "var(--board)";
  if (s.quan) {
    const fx = s.side === "l" ? P + Q : P + Q + 5 * C;
    const sweep = s.side === "l" ? 0 : 1;
    return <path d={`M ${fx} ${P} A ${Q} ${C} 0 0 ${sweep} ${fx} ${P + 2 * C} Z`} fill="var(--board)" stroke="var(--edge)" strokeWidth={3} />;
  }
  return <rect x={s.x - C / 2} y={s.y - C / 2} width={C} height={C} fill={fill} stroke="var(--edge)" strokeWidth={3} />;
}

/** Số quân dân của ô: ô dân ở góc ngoài (gần mép bàn), ô quan ở ngay dưới viên quan. */
function CountTag({ s, n }: { s: Spot; n: number }) {
  const x = s.quan ? s.x : s.x + C / 2 - 9;
  const y = s.quan ? s.y + 50 : s.top ? s.y - C / 2 + 19 : s.y + C / 2 - 9;
  return (
    <text x={x} y={y} textAnchor={s.quan ? "middle" : "end"} className="oaq-count">
      {n}
    </text>
  );
}

/** Các ô sẽ nhận quân ở lượt rải đầu tiên — để báo trước khi rê chuột lên mũi tên. */
function firstPass(b: Board, mv: Move) {
  const at = Math.abs(mv);
  const dir = Math.sign(mv);
  return Array.from({ length: b.dan[at] }, (_, k) => (((at + dir * (k + 1)) % SQUARES) + SQUARES) % SQUARES);
}

// ---------- diễn cảnh rải quân ----------

export type Frame = { key: string; board: Board; i: number; step?: Step };

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Thời lượng từng bước; nước dài thì thả nhanh hơn để cả nước diễn trong vài giây. */
function durations(steps: Step[]) {
  const drops = steps.filter((s) => s.k === "drop").length;
  const drop = Math.max(90, Math.min(240, 4200 / Math.max(1, drops)));
  return steps.map((s) => (s.k === "drop" ? drop : s.k === "pick" ? 380 : s.k === "eat" ? 700 : 900));
}

/**
 * Khi ván có thêm đúng một nước (lúc đang mở bàn), diễn lại nước đó từng bước trên bàn trước nước cuối: bốc, thả từng
 * quân, ăn, rải quân, thu quân. Trả về khung đang diễn; null là không diễn (vào giữa ván, đổi ván, giảm chuyển động).
 */
export function useSowing(round: number, moves: readonly Move[], state: OaqState, opts: OaqOptions) {
  const count = moves.length;
  const key = `${round}:${count}`;
  const [seen, setSeen] = useState({ round, count });
  const [start, setStart] = useState<{ key: string; board: Board; steps: Step[] } | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  // Đặt khung đầu ngay trong lần render thấy nước mới — nếu chờ tới effect thì bàn sẽ nháy trạng thái cuối trước khi diễn.
  if (seen.round !== round || seen.count !== count) {
    setSeen({ round, count });
    const fresh = round === seen.round && count === seen.count + 1 && state.steps.length > 0 && !reducedMotion();
    const board = fresh ? cloneBoard(replay(moves.slice(0, -1), opts)) : null;
    setStart(board ? { key, board, steps: state.steps } : null);
    setFrame(board ? { key, board, i: -1 } : null);
  }
  useEffect(() => {
    if (start?.key !== key) return;
    const board = cloneBoard(start.board);
    const { steps } = start;
    const wait = durations(steps);
    let i = 0;
    let timer = setTimeout(function tick() {
      if (i >= steps.length) {
        setFrame(null);
        return;
      }
      applyStep(board, steps[i]);
      setFrame({ key, board: cloneBoard(board), i, step: steps[i] });
      timer = setTimeout(tick, wait[i++]);
    }, 250);
    return () => clearTimeout(timer);
  }, [start, key]);
  return frame?.key === key ? frame : null;
}

// ---------- bàn ----------

/**
 * Bàn ô ăn quan SVG: 2 dãy × 5 ô dân, hai ô quan bán nguyệt ở hai đầu. Người chơi chạm một ô dân bên mình (dãy dưới) có
 * quân rồi chạm nửa trái / phải của ô (mũi tên ◀ / ▶) để chọn chiều rải; có chuột thì rê lên ô là hiện mũi tên, bấm thẳng luôn.
 */
export const OAnQuanBoard = memo(function OAnQuanBoard({
  board,
  state,
  frame,
  opts,
  side,
  seed,
  live,
  canPlay,
  onSow,
}: {
  /** Bàn đang hiện — khung đang diễn hoặc bàn sau nước cuối. */
  board: Board;
  state: OaqState;
  frame: Frame | null;
  opts: OaqOptions;
  /** Bên của người xem: 2 thì lật bàn cho dãy 7–11 nằm dưới. */
  side: 0 | 1 | 2;
  /** Hạt giống chọn màu ngọc (số ván) — mỗi ván một kiểu rải màu. */
  seed: number;
  /** Đang trong ván: vạch màu báo bên tới lượt. */
  live: boolean;
  canPlay: boolean;
  onSow: (at: number, dir: 1 | -1) => void;
}) {
  const flip = side === 2;
  const mine = side || 1;
  const [sel, setSel] = useState(-1);
  const [aim, setAim] = useState<Move>(0);
  const selected = canPlay && board.dan[sel] > 0 && ownerOf(sel) === mine ? sel : -1;
  const preview = new Set(canPlay && aim ? firstPass(board, aim) : []);
  const focus = frame?.step && frame.step.k !== "scatter" && frame.step.k !== "sweep" ? frame.step.at : -1;
  const lastAt = !frame && state.last ? Math.abs(state.last) : -1;
  const lastDir = Math.sign(state.last);

  const sow = (at: number, dir: 1 | -1) => {
    setSel(-1);
    setAim(0);
    onSow(at, dir);
  };

  const cells = [];
  const stones = [];
  const marks = [];
  for (let i = 0; i < SQUARES; i++) {
    const s = spotOf(i, flip);
    const quan = isQuan(i);
    const own = ownerOf(i) === side;
    cells.push(<Cell key={i} s={s} mine={own} />);
    stones.push(
      <g key={i}>
        <Pebbles i={i} n={board.dan[i]} x={s.x} y={s.y} quan={quan} seed={seed} />
        {quan && hasQuan(board, i) && <QuanStone i={i} x={s.x} y={s.y} />}
        <CountTag s={s} n={board.dan[i]} />
        {quan && opts.quanNon && isQuanNon(board, i) && (
          <text x={s.x} y={s.y + 66} textAnchor="middle" className="oaq-non">
            quan non
          </text>
        )}
      </g>,
    );
    if (preview.has(i)) marks.push(<SpotRing key={`p${i}`} s={s} className="oaq-preview" />);
    if (i === lastAt) marks.push(<SpotRing key={`l${i}`} s={s} className="oaq-last" />);
    if (i === focus) marks.push(<SpotRing key={`f${frame!.i}`} s={s} className={frame!.step!.k === "eat" ? "oaq-eat" : "oaq-focus"} />);
  }

  // Ô dân bên mình bấm được: vùng bấm + hai mũi tên chọn chiều.
  const hits = [];
  if (canPlay)
    for (const i of ROWS[mine]) {
      if (!board.dan[i]) continue;
      const s = spotOf(i, flip);
      const arrow = (dir: 1 | -1) => {
        const mv = i * dir;
        const x = s.x + dir * (C / 2 - 19);
        return (
          <g
            className="oaq-arrow"
            role="button"
            tabIndex={selected === i ? 0 : -1}
            aria-label={`Rải ô ${s.col + 1} sang ${dir === 1 ? "phải" : "trái"}`}
            onClick={() => sow(i, dir)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              sow(i, dir);
            }}
            onPointerEnter={() => setAim(mv)}
            onPointerLeave={() => setAim((a) => (a === mv ? 0 : a))}
            onFocus={() => setAim(mv)}
            onBlur={() => setAim((a) => (a === mv ? 0 : a))}
          >
            {/* Cả nửa ô là vùng bấm — trên điện thoại mũi tên nhỏ khó chạm. */}
            <rect x={dir === 1 ? s.x : s.x - C / 2} y={s.y - C / 2} width={C / 2} height={C} />
            <circle cx={x} cy={s.y} r={17} />
            <path d={dir === 1 ? `M ${x - 5} ${s.y - 8} L ${x + 6} ${s.y} L ${x - 5} ${s.y + 8} Z` : `M ${x + 5} ${s.y - 8} L ${x - 6} ${s.y} L ${x + 5} ${s.y + 8} Z`} />
          </g>
        );
      };
      hits.push(
        <g key={i} className={`oaq-sq ${selected === i ? "is-sel" : ""}`}>
          <rect
            className="oaq-hit"
            x={s.x - C / 2}
            y={s.y - C / 2}
            width={C}
            height={C}
            role="button"
            tabIndex={0}
            aria-pressed={selected === i}
            aria-label={`Ô ${s.col + 1} bên bạn, ${board.dan[i]} quân — chọn để rải`}
            onClick={() => setSel(selected === i ? -1 : i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSel(selected === i ? -1 : i);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                sow(i, e.key === "ArrowRight" ? 1 : -1);
              }
            }}
          />
          {arrow(-1)}
          {arrow(1)}
        </g>,
      );
    }

  // Quân đang cầm trên tay và số quân vừa ăn bay lên.
  let hand = null;
  if (frame && board.hand > 0 && focus >= 0) {
    const s = spotOf(focus, flip);
    const y = s.top || s.quan ? s.y + 30 : s.y - 30;
    hand = (
      <g className="oaq-hand" style={{ transform: `translate(${s.x}px, ${y}px)` }}>
        <circle r={17} />
        <text y={6} textAnchor="middle">
          {board.hand}
        </text>
      </g>
    );
  }
  let pop = null;
  if (frame?.step?.k === "eat") {
    const st = frame.step;
    const s = spotOf(st.at, flip);
    pop = (
      <text key={frame.i} x={s.x} y={s.y - 10} textAnchor="middle" className="oaq-pop" style={{ fill: OAQ_TONE[st.p] }}>
        +{st.n + (st.quan ? 10 : 0)}
      </text>
    );
  }

  const turnTone = OAQ_TONE[state.turn];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`oaq ${canPlay ? "can-play" : ""}`}
      aria-label={`Bàn ô ăn quan${canPlay ? " — đến lượt bạn: chọn một ô dân bên mình rồi chọn chiều rải" : ""}`}
      onPointerLeave={() => setAim(0)}
    >
      {cells}
      {/* Dãy bên đang tới lượt có vạch màu ở mép ngoài. */}
      {live && (
        <rect
          x={P + Q}
          y={(state.turn === 2) !== flip ? P - 6 : P + 2 * C + 1}
          width={5 * C}
          height={5}
          rx={2.5}
          fill={turnTone}
          className="oaq-turn"
        />
      )}
      {marks}
      {stones}
      {hits}
      {pop}
      {hand}
      {lastAt >= 0 && <LastArrow s={spotOf(lastAt, flip)} dir={(spotOf(lastAt, flip).top ? -1 : 1) * lastDir} />}
    </svg>
  );
});

function SpotRing({ s, className }: { s: Spot; className: string }) {
  if (s.quan) {
    const fx = s.side === "l" ? P + Q : P + Q + 5 * C;
    const sweep = s.side === "l" ? 0 : 1;
    const ix = s.side === "l" ? 6 : -6;
    return <path className={className} d={`M ${fx + ix} ${P + 6} A ${Q - 8} ${C - 6} 0 0 ${sweep} ${fx + ix} ${P + 2 * C - 6} Z`} />;
  }
  return <rect className={className} x={s.x - C / 2 + 6} y={s.y - C / 2 + 6} width={C - 12} height={C - 12} rx={10} />;
}

/** Mũi tên nhỏ ở mép ô của nước vừa đi, chỉ chiều đã rải (theo hướng nhìn trên màn hình). */
function LastArrow({ s, dir }: { s: Spot; dir: number }) {
  const y = s.top ? s.y - C / 2 + 14 : s.y + C / 2 - 14;
  const x = s.x - C / 2 + 18;
  return (
    <path className="oaq-last-dir" d={dir > 0 ? `M ${x - 6} ${y - 6} L ${x + 6} ${y} L ${x - 6} ${y + 6} Z` : `M ${x + 6} ${y - 6} L ${x - 6} ${y} L ${x + 6} ${y + 6} Z`} />
  );
}
