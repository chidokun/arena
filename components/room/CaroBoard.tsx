"use client";

import { memo } from "react";
import type { CaroState } from "@/lib/games/caro";

const C = 32;

function Mark({ v, cx, cy, fresh }: { v: number; cx: number; cy: number; fresh: boolean }) {
  const r = C * 0.3;
  return v === 1 ? (
    <path
      className={fresh ? "mark-new" : undefined}
      d={`M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}`}
      stroke="var(--coral)"
      strokeWidth={5}
      strokeLinecap="round"
    />
  ) : (
    <circle className={fresh ? "mark-new" : undefined} cx={cx} cy={cy} r={r} fill="none" stroke="var(--sky)" strokeWidth={4.6} />
  );
}

/** Quân X / O đứng riêng (huy hiệu trong các cảnh mở ván, hết ván). */
export function MarkIcon({ v, size = 32, className }: { v: 1 | 2; size?: number; className?: string }) {
  return (
    <svg viewBox={`0 0 ${C} ${C}`} width={size} height={size} className={className} aria-label={v === 1 ? "X" : "O"}>
      <Mark v={v} cx={C / 2} cy={C / 2} fresh={false} />
    </svg>
  );
}

/** Bàn caro SVG: mỗi ô là một hình chữ nhật bấm được; đánh dấu nước cuối và chuỗi thắng. */
export const CaroBoard = memo(function CaroBoard({
  state,
  canPlay,
  myMark,
  onPlay,
}: {
  state: CaroState;
  canPlay: boolean;
  myMark: number;
  onPlay: (x: number, y: number) => void;
}) {
  const N = state.size;
  const W = N * C;
  const win = new Set(state.line);
  const cells = [];
  for (let i = 0; i < N * N; i++) {
    const x = i % N;
    const y = Math.floor(i / N);
    const v = state.board[i];
    cells.push(
      <g key={i}>
        {win.has(i) && <rect className="win-cell" x={x * C + 1.5} y={y * C + 1.5} width={C - 3} height={C - 3} rx={6} />}
        {i === state.last && !win.has(i) && <rect x={x * C + 2} y={y * C + 2} width={C - 4} height={C - 4} rx={6} fill="var(--sun-soft)" stroke="var(--sun)" strokeWidth={2} />}
        {v ? (
          <Mark v={v} cx={x * C + C / 2} cy={y * C + C / 2} fresh={i === state.last} />
        ) : (
          <rect className="cell" x={x * C} y={y * C} width={C} height={C} onClick={canPlay ? () => onPlay(x, y) : undefined}>
            <title>{`Cột ${x + 1}, hàng ${y + 1}`}</title>
          </rect>
        )}
      </g>,
    );
  }
  const lines = [];
  for (let i = 1; i < N; i++) {
    lines.push(<line key={`v${i}`} x1={i * C} y1={0} x2={i * C} y2={W} />, <line key={`h${i}`} x1={0} y1={i * C} x2={W} y2={i * C} />);
  }
  const first = state.line[0];
  const last = state.line[state.line.length - 1];
  return (
    <svg
      viewBox={`0 0 ${W} ${W}`}
      className={`caro ${canPlay ? "can-play" : ""}`}
      role="grid"
      aria-label={`Bàn cờ ${N}×${N}${canPlay ? ` — đến lượt bạn (${myMark === 1 ? "X" : "O"})` : ""}`}
    >
      <rect width={W} height={W} rx={10} fill="var(--board)" />
      <g stroke="var(--board-line)" strokeWidth={1.4}>
        {lines}
      </g>
      {cells}
      {state.line.length > 0 && (
        <line
          x1={(first % N) * C + C / 2}
          y1={Math.floor(first / N) * C + C / 2}
          x2={(last % N) * C + C / 2}
          y2={Math.floor(last / N) * C + C / 2}
          stroke="var(--edge)"
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.75}
        />
      )}
    </svg>
  );
});
