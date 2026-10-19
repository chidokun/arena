"use client";

import { useRef, useState, type ReactNode } from "react";
import { BISHOP, colOf, isLight, KING, KNIGHT, PAWN, PIECES, PROMOTIONS, QUEEN, ROOK, rowOf, SIZE, sideOf, squareName, type ChessState, type Side } from "@/lib/games/chess";

const S = 100;
const W = SIZE * S;
const DRAG_MIN = 8;

const BASE = <rect className="cb-body" x={22} y={78} width={56} height={11} rx={4} />;
const STEM = <path className="cb-body" d="M37 70 Q36 75 31 79 H69 Q64 75 63 70 Z" />;

const SHAPES: Record<number, ReactNode> = {
  [PAWN]: (
    <>
      <path className="cb-body" d="M38 54 Q37 68 30 79 H70 Q63 68 62 54 Z" />
      {BASE}
      <rect className="cb-body" x={35} y={46} width={30} height={9} rx={4.5} />
      <circle className="cb-body" cx={50} cy={33} r={13} />
    </>
  ),
  [ROOK]: (
    <>
      <path className="cb-body" d="M34 40 H66 L63 70 H37 Z" />
      {BASE}
      <rect className="cb-body" x={30} y={68} width={40} height={11} rx={3} />
      <path className="cb-body" d="M27 20 H36 V27 H44 V20 H56 V27 H64 V20 H73 V36 Q73 40 69 40 H31 Q27 40 27 36 Z" />
    </>
  ),
  [KNIGHT]: (
    <>
      <path
        className="cb-body"
        d="M68 79 C72 62 74 44 66 30 C63 25 60 22 58 21 L57 12 L50 20 C42 21 34 28 30 38 L22 52 C20 56 22 61 27 61 C31 61 34 58 38 56 L44 54 C46 60 40 68 34 79 Z"
      />
      {BASE}
      <circle className="cb-eye" cx={43} cy={33} r={3.2} />
      <path className="cb-line" d="M63 38 C67 50 66 60 62 69" />
    </>
  ),
  [BISHOP]: (
    <>
      <path className="cb-body" d="M40 64 Q39 72 32 79 H68 Q61 72 60 64 Z" />
      {BASE}
      <rect className="cb-body" x={34} y={58} width={32} height={8} rx={4} />
      <path className="cb-body" d="M50 22 C34 32 31 48 37 59 H63 C69 48 66 32 50 22 Z" />
      <circle className="cb-body" cx={50} cy={16} r={6.5} />
      <path className="cb-line" d="M56 33 L46 46" />
    </>
  ),
  [QUEEN]: (
    <>
      {STEM}
      {BASE}
      <path className="cb-body" d="M25 36 L35 65 H65 L75 36 L64 49 L62 29 L55 47 L50 25 L45 47 L38 29 L36 49 Z" />
      <rect className="cb-body" x={33} y={63} width={34} height={9} rx={4} />
      {[
        [25, 33],
        [38, 26],
        [50, 21],
        [62, 26],
        [75, 33],
      ].map(([x, y]) => (
        <circle key={x} className="cb-body" cx={x} cy={y} r={5} />
      ))}
    </>
  ),
  [KING]: (
    <>
      {STEM}
      {BASE}
      <path className="cb-body" d="M30 44 C26 34 36 28 43 34 C45 30 47 28 50 28 C53 28 55 30 57 34 C64 28 74 34 70 44 L64 65 H36 Z" />
      <rect className="cb-body" x={33} y={63} width={34} height={9} rx={4} />
      <path className="cb-body" d="M46.5 9 H53.5 V15 H59 V22 H53.5 V30 H46.5 V22 H41 V15 H46.5 Z" />
      <path className="cb-line" d="M38 53 Q50 47 62 53" />
    </>
  ),
};

export function PieceShape({ v }: { v: number }) {
  return <g className={`cb-p ${v > 0 ? "is-w" : "is-b"}`}>{SHAPES[Math.abs(v)]}</g>;
}

export function ChessPieceIcon({ v, size = 26, className = "" }: { v: number; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`cb-icon ${className}`} aria-hidden="true">
      <PieceShape v={v} />
    </svg>
  );
}

type Drag = { from: number; x: number; y: number; x0: number; y0: number; moved: boolean; wasSel: boolean };

export function ChessBoard({
  state,
  canPlay,
  mySide,
  flip,
  onMove,
}: {
  state: ChessState;
  canPlay: boolean;
  mySide: 0 | Side;
  flip: boolean;
  onMove: (from: number, to: number, promo?: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [picked, setPicked] = useState<{ at: number; count: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number; count: number } | null>(null);
  const live = (count: number) => canPlay && count === state.count;
  const sel = picked && live(picked.count) && sideOf(state.board[picked.at]) === mySide ? picked.at : -1;
  const asking = promo && live(promo.count) ? promo : null;
  const targets = sel >= 0 ? [...new Set(state.legal.filter(([f]) => f === sel).map(([, t]) => t))] : [];
  const movable = new Set(canPlay ? state.legal.map(([f]) => f) : []);

  const dx = (i: number) => (flip ? SIZE - 1 - colOf(i) : colOf(i)) * S;
  const dy = (i: number) => (flip ? SIZE - 1 - rowOf(i) : rowOf(i)) * S;
  const king = state.board.indexOf(state.turn === 1 ? KING : -KING);
  const danger = state.check && king >= 0 ? king : -1;
  const [lastFrom, lastTo] = state.last ?? [-1, -1];

  const go = (from: number, to: number) => {
    setPicked(null);
    if (state.legal.some(([f, t, p]) => f === from && t === to && p)) setPromo({ from, to, count: state.count });
    else onMove(from, to);
  };
  const choose = (i: number) => {
    if (!canPlay) return;
    if (sel >= 0 && targets.includes(i)) go(sel, i);
    else if (movable.has(i) && i !== sel) setPicked({ at: i, count: state.count });
    else setPicked(null);
  };
  const keyed = (i: number) => (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    choose(i);
  };

  const point = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * W;
    let c = Math.floor(x / S);
    let rr = Math.floor(y / S);
    if (flip) {
      c = SIZE - 1 - c;
      rr = SIZE - 1 - rr;
    }
    return { x, y, sq: c >= 0 && c < SIZE && rr >= 0 && rr < SIZE ? rr * SIZE + c : -1 };
  };

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canPlay || asking || e.button !== 0) return;
    const { x, y, sq } = point(e);
    if (sq < 0) return;
    if (sel >= 0 && targets.includes(sq)) return go(sel, sq);
    if (!movable.has(sq)) return setPicked(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    setPicked({ at: sq, count: state.count });
    setDrag({ from: sq, x, y, x0: x, y0: y, moved: false, wasSel: sq === sel });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const { x, y } = point(e);
    setDrag({ ...drag, x, y, moved: drag.moved || Math.hypot(x - drag.x0, y - drag.y0) > DRAG_MIN });
  };
  const up = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag(null);
    if (!drag.moved) {
      if (drag.wasSel) setPicked(null);
      return;
    }
    const { sq } = point(e);
    if (live(state.count) && state.legal.some(([f, t]) => f === drag.from && t === sq)) go(drag.from, sq);
  };

  const squares = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const light = isLight(i);
    squares.push(<rect key={i} x={dx(i)} y={dy(i)} width={S} height={S} className={light ? "cb-light" : "cb-dark"} />);
  }
  const labels = [];
  for (let k = 0; k < SIZE; k++) {
    const file = flip ? SIZE - 1 - k : k;
    const rank = flip ? k + 1 : SIZE - k;
    labels.push(
      <text key={`f${k}`} x={k * S + S - 6} y={W - 7} textAnchor="end" className={`cb-coord ${(SIZE - 1 + k) % 2 === 0 ? "on-light" : "on-dark"}`}>
        {"abcdefgh"[file]}
      </text>,
      <text key={`r${k}`} x={6} y={k * S + 20} className={`cb-coord ${k % 2 === 0 ? "on-light" : "on-dark"}`}>
        {rank}
      </text>,
    );
  }

  const dragging = drag?.moved ? drag.from : -1;
  const pieces = [];
  let lifted: ReactNode = null;
  for (let i = 0; i < state.board.length; i++) {
    const v = state.board[i];
    if (!v) continue;
    const mine = movable.has(i);
    const target = targets.includes(i);
    const name = `${PIECES[Math.abs(v)].name} ${v > 0 ? "Trắng" : "Đen"} ở ${squareName(i)}`;
    const node = (
      <g
        key={state.ids[i]}
        className={`cb-piece ${i === sel ? "is-sel" : ""} ${mine ? "is-live" : ""} ${i === dragging ? "is-drag" : ""}`}
        style={{ transform: i === dragging ? `translate(${drag!.x - S / 2}px, ${drag!.y - S / 2}px)` : `translate(${dx(i)}px, ${dy(i)}px)` }}
        onKeyDown={mine || target ? keyed(i) : undefined}
        tabIndex={mine || target ? 0 : undefined}
        role={mine || target ? "button" : undefined}
        aria-label={`${name}${target ? " — ăn quân này" : ""}`}
      >
        <g className="cb-lift">
          <PieceShape v={v} />
        </g>
      </g>
    );
    if (i === dragging) lifted = node;
    else pieces.push(node);
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${W}`}
      className={`cb ${canPlay ? "can-play" : ""} ${drag?.moved ? "is-dragging" : ""}`}
      role="group"
      aria-label={`Bàn cờ vua${canPlay ? " — đến lượt bạn" : ""}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDrag(null)}
    >
      <defs>
        <radialGradient id="cb-danger">
          <stop offset="0%" stopColor="#ff2d3d" />
          <stop offset="40%" stopColor="#ff2d3d" stopOpacity={0.85} />
          <stop offset="100%" stopColor="#ff2d3d" stopOpacity={0} />
        </radialGradient>
      </defs>
      {squares}
      {lastFrom >= 0 && (
        <>
          <rect x={dx(lastFrom)} y={dy(lastFrom)} width={S} height={S} className="cb-last" />
          <rect x={dx(lastTo)} y={dy(lastTo)} width={S} height={S} className="cb-last" />
        </>
      )}
      {sel >= 0 && <rect x={dx(sel)} y={dy(sel)} width={S} height={S} className="cb-sel" />}
      {danger >= 0 && <circle cx={dx(danger) + S / 2} cy={dy(danger) + S / 2} r={S * 0.6} className="cb-danger" />}
      {labels}
      {targets.map((t) =>
        state.board[t] || (t === state.ep && Math.abs(state.board[sel]) === PAWN) ? (
          <circle key={t} cx={dx(t) + S / 2} cy={dy(t) + S / 2} r={S / 2 - 5} className="cb-take" />
        ) : (
          <circle key={t} cx={dx(t) + S / 2} cy={dy(t) + S / 2} r={14} className="cb-dot" />
        ),
      )}
      {pieces}
      {lifted}
      {/* Ô đích trống cho bàn phím (chuột / chạm đã xử lý ở thẻ svg). */}
      {targets
        .filter((t) => !state.board[t])
        .map((t) => (
          <rect key={`k${t}`} x={dx(t)} y={dy(t)} width={S} height={S} fill="transparent" className="cb-target" tabIndex={0} role="button" aria-label={`Đi tới ${squareName(t)}`} onKeyDown={keyed(t)} />
        ))}
      {asking && <PromoPicker at={asking.to} side={mySide as Side} x={dx(asking.to)} top={dy(asking.to) === 0} onPick={(p) => (setPromo(null), p && onMove(asking.from, asking.to, p))} />}
    </svg>
  );
}

function PromoPicker({ at, side, x, top, onPick }: { at: number; side: Side; x: number; top: boolean; onPick: (p: number | null) => void }) {
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <g onPointerDown={stop} onPointerUp={stop} role="dialog" aria-label={`Phong cấp Tốt ở ${squareName(at)}`}>
      <rect width={W} height={W} className="cb-shade" onClick={() => onPick(null)} />
      {PROMOTIONS.map((p, k) => {
        const y = top ? k * S : W - (k + 1) * S;
        return (
          <g
            key={p}
            className="cb-promo"
            transform={`translate(${x} ${y})`}
            onClick={() => onPick(p)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick(p);
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`Phong thành ${PIECES[p].name}`}
          >
            <rect width={S} height={S} rx={14} className="cb-promo-bg" />
            <PieceShape v={side === 1 ? p : -p} />
          </g>
        );
      })}
    </g>
  );
}
