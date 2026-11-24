"use client";

import { memo, useRef, useState } from "react";
import { COLS, colOf, KING, PIECES, ROWS, rowOf, sideOf, type Side, type XqState } from "@/lib/games/xiangqi";

const C = 40;
const M = 36;
const W = 2 * M + (COLS - 1) * C;
const H = 2 * M + (ROWS - 1) * C;
const R = 17.5;
const DRAG_MIN = 6;

export type Script = "han" | "viet";

export function PieceFace({ v, script, r = R }: { v: number; script: Script; r?: number }) {
  const red = v > 0;
  const p = PIECES[Math.abs(v)];
  const text = script === "han" ? (red ? p.red : p.black) : p.name;
  const size = script === "han" ? r * 1.05 : r * (text.length >= 5 ? 0.5 : text.length >= 4 ? 0.56 : 0.64);
  return (
    <>
      <circle r={r} className="xq-disc" />
      <circle r={r * 0.8} className={`xq-ring ${red ? "is-red" : "is-black"}`} />
      <text className={`xq-glyph ${red ? "is-red" : "is-black"} ${script === "han" ? "is-han" : ""}`} fontSize={size} dy="0.36em">
        {text}
      </text>
    </>
  );
}

export function PieceIcon({ v, script, size = 26, className = "" }: { v: number; script: Script; size?: number; className?: string }) {
  return (
    <svg viewBox="-20 -20 40 40" width={size} height={size} className={`xq-icon ${className}`} aria-hidden="true">
      <PieceFace v={v} script={script} r={18.5} />
    </svg>
  );
}

function Marker({ c, r }: { c: number; r: number }) {
  const x = M + c * C;
  const y = M + r * C;
  const g = 3;
  const l = 7;
  const d: string[] = [];
  for (const sx of [-1, 1]) {
    if ((sx < 0 && c === 0) || (sx > 0 && c === COLS - 1)) continue;
    for (const sy of [-1, 1]) d.push(`M${x + sx * (g + l)} ${y + sy * g}H${x + sx * g}V${y + sy * (g + l)}`);
  }
  return <path d={d.join("")} fill="none" />;
}

const MARKERS: [number, number][] = [
  [1, 2],
  [7, 2],
  [1, 7],
  [7, 7],
  ...[0, 2, 4, 6, 8].flatMap((c) => [
    [c, 3] as [number, number],
    [c, 6] as [number, number],
  ]),
];

// Lưới đối xứng nên không cần lật theo bên cầm quân.
export const XiangqiGrid = memo(function XiangqiGrid({ script }: { script: Script }) {
  const x = (c: number) => M + c * C;
  const y = (r: number) => M + r * C;
  const lines = [];
  for (let r = 0; r < ROWS; r++) lines.push(<line key={`h${r}`} x1={x(0)} y1={y(r)} x2={x(8)} y2={y(r)} />);
  for (let c = 0; c < COLS; c++) {
    if (c === 0 || c === COLS - 1) lines.push(<line key={`v${c}`} x1={x(c)} y1={y(0)} x2={x(c)} y2={y(9)} />);
    else lines.push(<line key={`v${c}a`} x1={x(c)} y1={y(0)} x2={x(c)} y2={y(4)} />, <line key={`v${c}b`} x1={x(c)} y1={y(5)} x2={x(c)} y2={y(9)} />);
  }
  const palace = [
    [3, 0, 5, 2],
    [5, 0, 3, 2],
    [3, 7, 5, 9],
    [5, 7, 3, 9],
  ];
  const mid = (y(4) + y(5)) / 2;
  return (
    <>
      <rect x={x(0) - 8} y={y(0) - 8} width={8 * C + 16} height={9 * C + 16} rx={4} className="xq-frame" />
      <g className="xq-lines">
        {lines}
        {palace.map(([a, b, c, d], k) => (
          <line key={`p${k}`} x1={x(a)} y1={y(b)} x2={x(c)} y2={y(d)} />
        ))}
        {MARKERS.map(([c, r]) => (
          <Marker key={`${c}:${r}`} c={c} r={r} />
        ))}
      </g>
      <text className={`xq-river ${script === "han" ? "is-han" : ""}`} x={x(2)} y={mid} dy="0.35em">
        {script === "han" ? "楚 河" : "Sở Hà"}
      </text>
      <text className={`xq-river ${script === "han" ? "is-han" : ""}`} x={x(6)} y={mid} dy="0.35em">
        {script === "han" ? "漢 界" : "Hán Giới"}
      </text>
      {Array.from({ length: COLS }, (_, c) => (
        <g key={`n${c}`} className="xq-file">
          <text x={x(c)} y={11}>
            {c + 1}
          </text>
          <text x={x(c)} y={H - 4}>
            {COLS - c}
          </text>
        </g>
      ))}
    </>
  );
});

type XqDrag = { from: number; x: number; y: number; x0: number; y0: number; over: number; moved: boolean; wasSel: boolean };

/**
 * Chọn quân bằng chạm/nhấp và kéo-thả quân bằng chuột hoặc ngón tay.
 * Ô được đánh số qua `index(cột, hàng)` theo toạ độ bàn cờ chuẩn (chưa lật).
 */
export function useXqPointer({
  flip,
  enabled,
  sel,
  targets,
  movable,
  select,
  move,
  index = (c, r) => r * COLS + c,
}: {
  flip: boolean;
  enabled: boolean;
  sel: number;
  targets: number[];
  movable: (sq: number) => boolean;
  select: (sq: number | null) => void;
  move: (from: number, to: number) => void;
  index?: (col: number, row: number) => number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<XqDrag | null>(null);

  const point = (e: React.PointerEvent) => {
    const b = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * W;
    const y = ((e.clientY - b.top) / b.height) * H;
    let c = Math.round((x - M) / C);
    let r = Math.round((y - M) / C);
    const inside = c >= 0 && c < COLS && r >= 0 && r < ROWS;
    if (flip) {
      c = COLS - 1 - c;
      r = ROWS - 1 - r;
    }
    return { x, y, sq: inside ? index(c, r) : -1 };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!enabled || e.button !== 0) return;
    const { x, y, sq } = point(e);
    if (sq >= 0 && sel >= 0 && targets.includes(sq)) return move(sel, sq);
    if (sq < 0 || !movable(sq)) return select(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    select(sq);
    setDrag({ from: sq, x, y, x0: x, y0: y, over: sq, moved: false, wasSel: sq === sel });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { x, y, sq } = point(e);
    setDrag({ ...drag, x, y, over: sq, moved: drag.moved || Math.hypot(x - drag.x0, y - drag.y0) > DRAG_MIN });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag(null);
    if (!drag.moved) {
      if (drag.wasSel) select(null);
      return;
    }
    const { sq } = point(e);
    if (enabled && sq !== drag.from && targets.includes(sq)) move(drag.from, sq);
  };
  const onPointerCancel = () => setDrag(null);

  const live = enabled && drag?.moved ? drag : null;
  return {
    svgRef,
    /** Quân đang bị kéo (ô gốc, toạ độ con trỏ trong viewBox), hoặc null. */
    dragging: live,
    /** Ô đích hợp lệ đang nằm dưới con trỏ khi kéo, hoặc -1. */
    over: live && live.over !== live.from && targets.includes(live.over) ? live.over : -1,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture: onPointerCancel },
  };
}

export function XiangqiBoard({
  state,
  canPlay,
  mySide,
  flip,
  script,
  onMove,
}: {
  state: XqState;
  canPlay: boolean;
  mySide: 0 | Side;
  flip: boolean;
  script: Script;
  onMove: (from: number, to: number) => void;
}) {
  const [picked, setPicked] = useState<{ at: number; count: number } | null>(null);
  const sel = canPlay && picked && picked.count === state.count && sideOf(state.board[picked.at]) === mySide ? picked.at : -1;
  const targets = sel >= 0 ? state.legal.filter(([f]) => f === sel).map(([, t]) => t) : [];
  const movable = new Set(canPlay ? state.legal.map(([f]) => f) : []);

  const px = (i: number) => M + (flip ? COLS - 1 - colOf(i) : colOf(i)) * C;
  const py = (i: number) => M + (flip ? ROWS - 1 - rowOf(i) : rowOf(i)) * C;
  const king = state.board.indexOf(state.turn === 1 ? KING : -KING);
  const danger = (state.check || state.winner) && king >= 0 ? king : -1;
  const [lastFrom, lastTo] = state.last ?? [-1, -1];

  const choose = (i: number) => {
    if (!canPlay) return;
    if (sel >= 0 && targets.includes(i)) {
      setPicked(null);
      onMove(sel, i);
    } else if (movable.has(i) && i !== sel) setPicked({ at: i, count: state.count });
    else setPicked(null);
  };
  const keyed = (i: number) => (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    choose(i);
  };
  const { svgRef, dragging, over, handlers } = useXqPointer({
    flip,
    enabled: canPlay,
    sel,
    targets,
    movable: (i) => movable.has(i),
    select: (i) => setPicked(i == null ? null : { at: i, count: state.count }),
    move: (from, to) => {
      setPicked(null);
      onMove(from, to);
    },
  });

  const pieces = [];
  let lifted: React.ReactNode = null;
  for (let i = 0; i < state.board.length; i++) {
    const v = state.board[i];
    if (!v) continue;
    const mine = canPlay && movable.has(i);
    const side = v > 0 ? "Đỏ" : "Đen";
    const target = targets.includes(i);
    const held = dragging?.from === i;
    const node = (
      <g
        key={state.ids[i]}
        className={`xq-piece ${i === sel ? "is-sel" : ""} ${mine ? "is-mine" : ""} ${mine || target ? "is-live" : ""} ${held ? "is-drag" : ""} ${i === over ? "is-over" : ""}`}
        style={{ transform: held ? `translate(${dragging.x}px, ${dragging.y}px)` : `translate(${px(i)}px, ${py(i)}px)` }}
        onKeyDown={mine || target ? keyed(i) : undefined}
        tabIndex={mine || target ? 0 : undefined}
        role={mine || target ? "button" : undefined}
        aria-label={`${PIECES[Math.abs(v)].name} ${side}${target ? " — ăn quân này" : ""}`}
      >
        <g className="xq-lift">
          <PieceFace v={v} script={script} />
        </g>
      </g>
    );
    if (held) lifted = node;
    else pieces.push(node);
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className={`xq ${canPlay ? "can-play" : ""} ${dragging ? "is-dragging" : ""}`}
      role="group"
      aria-label={`Bàn cờ tướng${canPlay ? " — đến lượt bạn" : ""}`}
      {...handlers}
    >
      <rect width={W} height={H} rx={12} className="xq-bg" />
      <XiangqiGrid script={script} />
      {lastFrom >= 0 && (
        <>
          <circle cx={px(lastFrom)} cy={py(lastFrom)} r={7} className="xq-from" />
          <circle cx={px(lastTo)} cy={py(lastTo)} r={R + 3.5} className="xq-last" />
        </>
      )}
      {danger >= 0 && <circle cx={px(danger)} cy={py(danger)} r={R + 4} className="xq-danger" />}
      {pieces}
      {targets.map((t) =>
        state.board[t] ? (
          <circle key={t} cx={px(t)} cy={py(t)} r={R + 3} className={`xq-hit is-take ${t === over ? "is-over" : ""}`} pointerEvents="none" />
        ) : (
          <g key={t} onKeyDown={keyed(t)} tabIndex={0} role="button" aria-label="Đi tới đây" className={`xq-target ${t === over ? "is-over" : ""}`}>
            <circle cx={px(t)} cy={py(t)} r={C / 2} fill="transparent" />
            <circle cx={px(t)} cy={py(t)} r={6} className="xq-dot" />
          </g>
        ),
      )}
      {lifted}
    </svg>
  );
}
