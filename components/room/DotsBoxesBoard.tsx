"use client";

import { memo } from "react";
import { lineAt, lineCount, type DotsState } from "@/lib/games/dots-boxes";

const C = 60;
const P = 22;

// Phóng tối đa 1,5 lần viewBox để chấm và nét ở bàn nhỏ không to quá cỡ.
export const boardMaxWidth = (size: number) => Math.min(560, Math.round((size * C + 2 * P) * 1.5));

export const DB_TONE = { 1: "var(--coral)", 2: "var(--sky)" } as const;
export const DB_NAME = { 1: "Đỏ", 2: "Xanh" } as const;

function ends(size: number, i: number) {
  const { horizontal, r, c } = lineAt(size, i);
  const x1 = P + c * C;
  const y1 = P + r * C;
  return { horizontal, r, c, x1, y1, x2: horizontal ? x1 + C : x1, y2: horizontal ? y1 : y1 + C };
}

// Vùng bấm của mỗi cạnh là hình thoi (hai nửa ô hai bên cạnh) để các vùng lát kín bàn — bấm đâu cũng trúng cạnh gần
// nhất, dễ bấm cả trên điện thoại.
export const DotsBoxesBoard = memo(function DotsBoxesBoard({
  state,
  canPlay,
  myMark,
  marks,
  onDraw,
}: {
  state: DotsState;
  canPlay: boolean;
  myMark: 0 | 1 | 2;
  marks: { 1?: string; 2?: string };
  onDraw: (line: number) => void;
}) {
  const n = state.size;
  const W = n * C + 2 * P;
  const fresh = new Set(state.fresh);

  const boxes = [];
  for (let b = 0; b < n * n; b++) {
    const v = state.boxes[b] as 0 | 1 | 2;
    if (!v) continue;
    const x = P + (b % n) * C;
    const y = P + Math.floor(b / n) * C;
    boxes.push(
      <g key={b} className={fresh.has(b) ? "db-claim" : undefined} style={{ transformOrigin: `${x + C / 2}px ${y + C / 2}px` }}>
        <rect x={x + 5} y={y + 5} width={C - 10} height={C - 10} rx={9} fill={`color-mix(in srgb, ${DB_TONE[v]} 28%, transparent)`} />
        <text x={x + C / 2} y={y + C / 2} textAnchor="middle" dominantBaseline="central" fontSize={C * 0.44}>
          {marks[v] ?? "●"}
        </text>
      </g>,
    );
  }

  const slots = [];
  const drawn = [];
  for (let i = 0; i < lineCount(n); i++) {
    const e = ends(n, i);
    const v = state.lines[i] as 0 | 1 | 2;
    if (v) {
      const last = i === state.last;
      drawn.push(
        <line
          key={i}
          className={last ? "db-last" : undefined}
          x1={e.x1}
          y1={e.y1}
          x2={e.x2}
          y2={e.y2}
          stroke={DB_TONE[v]}
          strokeWidth={last ? 8 : 7}
          strokeLinecap="round"
        />,
      );
      continue;
    }
    const mx = (e.x1 + e.x2) / 2;
    const my = (e.y1 + e.y2) / 2;
    const h = C / 2;
    const diamond = e.horizontal ? `${e.x1},${e.y1} ${mx},${my - h} ${e.x2},${e.y2} ${mx},${my + h}` : `${e.x1},${e.y1} ${mx - h},${my} ${e.x2},${e.y2} ${mx + h},${my}`;
    slots.push(
      <g key={i} className="db-slot">
        <line className="db-empty" x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
        {myMark !== 0 && <line className="db-ghost" x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={DB_TONE[myMark]} />}
        {canPlay && (
          <polygon
            className="db-hit"
            points={diamond}
            role="button"
            tabIndex={0}
            aria-label={e.horizontal ? `Kẻ cạnh ngang ở hàng chấm ${e.r + 1}, từ chấm ${e.c + 1} sang ${e.c + 2}` : `Kẻ cạnh dọc ở cột chấm ${e.c + 1}, từ chấm ${e.r + 1} xuống ${e.r + 2}`}
            onClick={() => onDraw(i)}
            onKeyDown={(ev) => {
              if (ev.key !== "Enter" && ev.key !== " ") return;
              ev.preventDefault();
              onDraw(i);
            }}
          />
        )}
      </g>,
    );
  }

  const dots = [];
  for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) dots.push(<circle key={`${r}.${c}`} cx={P + c * C} cy={P + r * C} r={6.5} />);

  return (
    <svg
      viewBox={`0 0 ${W} ${W}`}
      className={`db ${canPlay ? "can-play" : ""}`}
      aria-label={`Bàn chấm nối ô ${n}×${n}${canPlay && myMark ? ` — đến lượt bạn (màu ${DB_NAME[myMark]})` : ""}`}
    >
      {boxes}
      {slots}
      {drawn}
      <g className="db-dots">{dots}</g>
    </svg>
  );
});
