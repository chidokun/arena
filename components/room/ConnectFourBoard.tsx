"use client";

import { memo, useId } from "react";
import { COLS, dropRow, ROWS, type C4State } from "@/lib/games/connect-four";

/** Cạnh một ô, lề khung và dải phía trên để quân "ma" báo cột sắp thả. */
const C = 64;
const P = 10;
const T = C;
const W = COLS * C + 2 * P;
const H = T + ROWS * C + 2 * P;
const R = C * 0.39;

export const C4_TONE = { 1: "var(--coral)", 2: "var(--sun)" } as const;
export const C4_NAME = { 1: "Đỏ", 2: "Vàng" } as const;

const cx = (col: number) => P + col * C + C / 2;
const cy = (row: number) => T + P + row * C + C / 2;
/** Tâm từng lỗ trên khung, theo chỉ số ô. */
const SPOTS = Array.from({ length: COLS * ROWS }, (_, i) => ({ i, x: cx(i % COLS), y: cy(Math.floor(i / COLS)) }));

function Piece({ v, x, y }: { v: 1 | 2; x: number; y: number }) {
  const tone = C4_TONE[v];
  return (
    <>
      <circle cx={x} cy={y} r={R} fill={tone} stroke="var(--edge)" strokeWidth={2.5} />
      <circle cx={x} cy={y} r={R * 0.66} fill="none" stroke={`color-mix(in srgb, ${tone} 72%, black)`} strokeWidth={3} opacity={0.55} />
    </>
  );
}

/**
 * Bàn thả cờ 4 SVG: quân nằm sau khung có khoét lỗ (mask) nên quân mới rơi từ trên xuống "lọt" vào khung.
 * Cả cột là vùng bấm; di chuột / tab tới cột thì hiện quân mờ ở dải trên.
 */
export const ConnectFourBoard = memo(function ConnectFourBoard({
  state,
  canPlay,
  myMark,
  onDrop,
}: {
  state: C4State;
  canPlay: boolean;
  myMark: 0 | 1 | 2;
  onDrop: (col: number) => void;
}) {
  const mask = useId();
  const win = new Set(state.line);
  const ended = state.winner > 0;

  const pieces = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const v = state.board[i] as 0 | 1 | 2;
    if (!v) continue;
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const fresh = i === state.last;
    pieces.push(
      <g
        key={i}
        className={fresh ? "c4-drop" : undefined}
        opacity={ended && !win.has(i) ? 0.45 : 1}
        style={fresh ? ({ "--fall": `${-(cy(row) - T / 2)}px`, animationDuration: `${260 + row * 50}ms` } as React.CSSProperties) : undefined}
      >
        <Piece v={v} x={cx(col)} y={cy(row)} />
      </g>,
    );
  }

  const cols = [];
  for (let col = 0; col < COLS; col++) {
    const open = canPlay && dropRow(state.board, col) >= 0;
    cols.push(
      <g key={col} className={`c4-col ${open ? "is-open" : ""}`}>
        <rect className="c4-glow" x={P + col * C} y={T + P} width={C} height={ROWS * C} rx={10} />
        {myMark !== 0 && (
          <g className="c4-ghost">
            <Piece v={myMark} x={cx(col)} y={T / 2} />
          </g>
        )}
        {open && (
          <rect
            className="c4-hit"
            x={P + col * C}
            y={0}
            width={C}
            height={H}
            role="button"
            tabIndex={0}
            aria-label={`Thả vào cột ${col + 1}`}
            onClick={() => onDrop(col)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onDrop(col);
            }}
          />
        )}
      </g>,
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`c4 ${canPlay ? "can-play" : ""}`}
      aria-label={`Bàn thả cờ ${COLS} cột × ${ROWS} hàng${canPlay && myMark ? ` — đến lượt bạn (quân ${C4_NAME[myMark]})` : ""}`}
    >
      <defs>
        <mask id={mask}>
          <rect x={0} y={T} width={W} height={H - T} fill="white" />
          {SPOTS.map((s) => (
            <circle key={s.i} cx={s.x} cy={s.y} r={R + 2} fill="black" />
          ))}
        </mask>
      </defs>
      <rect x={P} y={T + P} width={COLS * C} height={ROWS * C} fill="var(--sunken)" />
      {pieces}
      <rect x={1.5} y={T + 1.5} width={W - 3} height={H - T - 3} rx={18} fill="var(--sky)" stroke="var(--edge)" strokeWidth={3} mask={`url(#${mask})`} />
      <g fill="none" stroke="color-mix(in srgb, var(--sky) 60%, black)" strokeWidth={2} opacity={0.5}>
        {SPOTS.map((s) => (
          <circle key={s.i} cx={s.x} cy={s.y} r={R + 2} />
        ))}
      </g>
      {state.line.map((i) => (
        <circle key={`w${i}`} className="c4-win" cx={SPOTS[i].x} cy={SPOTS[i].y} r={R - 4} />
      ))}
      {!ended && state.last >= 0 && <circle key={`d${state.last}`} className="c4-dot" cx={SPOTS[state.last].x} cy={SPOTS[state.last].y} r={5} />}
      {cols}
    </svg>
  );
});
