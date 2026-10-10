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
  type MsOptions,
  type MsState,
  type Step,
} from "@/lib/games/mandarin-square";

/** Cạnh một ô dân, bề ngang ô quan (nửa hình bầu dục) và lề khung. */
const C = 100;
const Q = 92;
const P = 12;
const W = 2 * P + 2 * Q + 5 * C;
const H = 2 * P + 2 * C;

export const MS_TONE = { 1: "var(--coral)", 2: "var(--sky)" } as const;

/** Màu sỏi dân: vài sắc đá trung tính, đọc rõ trên nền bàn sáng lẫn tối. */
const PEBBLES = ["#a3adb8", "#c9b99c", "#8996a5", "#bba68b", "#adb0c2", "#d1c3ad"];
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

/** Toạ độ sỏi thứ `k` trong ô `i` — rải hình hoa hướng dương, lệch góc theo ô cho đỡ đều tăm tắp. */
function pebbleAt(i: number, k: number, quan: boolean) {
  if (quan) {
    // Chừa giữa ô cho quân quan, dân xếp vòng quanh.
    const j = k + 7;
    const r = Math.sqrt(j / 38);
    const a = j * GOLDEN + i;
    return { dx: Math.cos(a) * r * Q * 0.42, dy: Math.sin(a) * r * C * 0.78 };
  }
  const r = Math.sqrt((k + 0.5) / 26) * 38;
  const a = k * GOLDEN + i * 1.7;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
}

const MAX_SHOWN = { dan: 26, quan: 30 };

function Pebbles({ i, n, x, y, quan }: { i: number; n: number; x: number; y: number; quan: boolean }) {
  const shown = Math.min(n, quan ? MAX_SHOWN.quan : MAX_SHOWN.dan);
  return (
    <>
      {Array.from({ length: shown }, (_, k) => {
        const { dx, dy } = pebbleAt(i, k, quan);
        const h = (i * 31 + k * 17) % 97;
        return (
          <ellipse
            key={k}
            cx={x + dx}
            cy={y + dy}
            rx={7.5}
            ry={6.2}
            transform={`rotate(${(h * 37) % 180} ${x + dx} ${y + dy})`}
            fill={PEBBLES[h % PEBBLES.length]}
            stroke="var(--edge)"
            strokeWidth={1.6}
          />
        );
      })}
    </>
  );
}

function QuanStone({ x, y, grad }: { x: number; y: number; grad: string }) {
  return (
    <g>
      <ellipse cx={x} cy={y + 2} rx={24} ry={19} fill={`url(#${grad})`} stroke="var(--edge)" strokeWidth={2.5} />
      <ellipse cx={x - 8} cy={y - 6} rx={8} ry={4.5} fill="white" opacity={0.45} transform={`rotate(-20 ${x - 8} ${y - 6})`} />
    </g>
  );
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
  const y = s.quan ? s.y + 46 : s.top ? s.y - C / 2 + 19 : s.y + C / 2 - 9;
  return (
    <text x={x} y={y} textAnchor={s.quan ? "middle" : "end"} className="ms-count">
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
export function useSowing(round: number, moves: readonly Move[], state: MsState, opts: MsOptions) {
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
export const MandarinSquareBoard = memo(function MandarinSquareBoard({
  board,
  state,
  frame,
  opts,
  side,
  live,
  canPlay,
  onSow,
}: {
  /** Bàn đang hiện — khung đang diễn hoặc bàn sau nước cuối. */
  board: Board;
  state: MsState;
  frame: Frame | null;
  opts: MsOptions;
  /** Bên của người xem: 2 thì lật bàn cho dãy 7–11 nằm dưới. */
  side: 0 | 1 | 2;
  /** Đang trong ván: vạch màu báo bên tới lượt. */
  live: boolean;
  canPlay: boolean;
  onSow: (at: number, dir: 1 | -1) => void;
}) {
  const flip = side === 2;
  const mine = side || 1;
  const [sel, setSel] = useState(-1);
  const [aim, setAim] = useState<Move>(0);
  const grad = `ms-quan-${flip ? "f" : "n"}`;
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
        {quan && hasQuan(board, i) && <QuanStone x={s.x} y={s.y} grad={grad} />}
        <Pebbles i={i} n={board.dan[i]} x={s.x} y={s.y} quan={quan} />
        <CountTag s={s} n={board.dan[i]} />
        {quan && opts.quanNon && isQuanNon(board, i) && (
          <text x={s.x} y={s.y + 63} textAnchor="middle" className="ms-non">
            quan non
          </text>
        )}
      </g>,
    );
    if (preview.has(i)) marks.push(<SpotRing key={`p${i}`} s={s} className="ms-preview" />);
    if (i === lastAt) marks.push(<SpotRing key={`l${i}`} s={s} className="ms-last" />);
    if (i === focus) marks.push(<SpotRing key={`f${frame!.i}`} s={s} className={frame!.step!.k === "eat" ? "ms-eat" : "ms-focus"} />);
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
            className="ms-arrow"
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
        <g key={i} className={`ms-sq ${selected === i ? "is-sel" : ""}`}>
          <rect
            className="ms-hit"
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
      <g className="ms-hand" style={{ transform: `translate(${s.x}px, ${y}px)` }}>
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
      <text key={frame.i} x={s.x} y={s.y - 10} textAnchor="middle" className="ms-pop" style={{ fill: MS_TONE[st.p] }}>
        +{st.n + (st.quan ? 10 : 0)}
      </text>
    );
  }

  const turnTone = MS_TONE[state.turn];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`ms ${canPlay ? "can-play" : ""}`}
      aria-label={`Bàn ô ăn quan${canPlay ? " — đến lượt bạn: chọn một ô dân bên mình rồi chọn chiều rải" : ""}`}
      onPointerLeave={() => setAim(0)}
    >
      <defs>
        <radialGradient id={grad} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--grape) 55%, white)" />
          <stop offset="100%" stopColor="color-mix(in srgb, var(--grape) 70%, black)" />
        </radialGradient>
      </defs>
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
          className="ms-turn"
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
    <path className="ms-last-dir" d={dir > 0 ? `M ${x - 6} ${y - 6} L ${x + 6} ${y} L ${x - 6} ${y + 6} Z` : `M ${x + 6} ${y - 6} L ${x - 6} ${y} L ${x + 6} ${y + 6} Z`} />
  );
}
