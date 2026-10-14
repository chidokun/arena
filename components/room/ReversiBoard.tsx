"use client";

import { memo, useState } from "react";
import { CELLS, flipsOf, SIZE, type ReversiState } from "@/lib/games/reversi";

/** Cạnh một ô và lề khung (theo đơn vị viewBox — bàn co giãn theo khung). */
const C = 56;
const P = 14;
const W = SIZE * C + 2 * P;
const R = C * 0.39;

/** Màu nhấn của hai bên (thẻ ghế, vòng sáng) — quân thật thì đen / trắng, xem `FACE`. */
export const RV_TONE = { 1: "var(--grape)", 2: "var(--sun)" } as const;
export const RV_NAME = { 1: "Đen", 2: "Trắng" } as const;
/** Mặt quân: đen / trắng cố định như quân thật, không đổi theo giao diện sáng tối. */
export const FACE = { 1: "#26222f", 2: "#fbf8ef" } as const;
const SHEEN = { 1: "#4a4558", 2: "#ffffff" } as const;

/** Nước vừa đặt nảy ra trước; các quân bị lật lần lượt theo khoảng cách tới nó. */
const FLIP_START_MS = 160;
const FLIP_STEP_MS = 70;

const cx = (i: number) => P + (i % SIZE) * C + C / 2;
const cy = (i: number) => P + Math.floor(i / SIZE) * C + C / 2;
const square = (i: number) => `${String.fromCharCode(97 + (i % SIZE))}${Math.floor(i / SIZE) + 1}`;

/** Thời gian để mọi quân của nước cuối lật xong (ms) — bàn chơi chờ ngần ấy rồi mới diễn cảnh hết ván. */
export function settleMs(state: ReversiState) {
  const far = state.flipped.reduce((d, f) => Math.max(d, ring(state.last, f)), 0);
  return FLIP_START_MS + far * FLIP_STEP_MS + 450;
}

/** Khoảng cách theo vòng (số ô theo hướng xa nhất) giữa hai ô. */
function ring(a: number, b: number) {
  return Math.max(Math.abs((a % SIZE) - (b % SIZE)), Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)));
}

function Disc({ v, x, y }: { v: 1 | 2; x: number; y: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={R} fill={FACE[v]} stroke="#050312" strokeWidth={2.5} />
      <circle cx={x - R * 0.28} cy={y - R * 0.3} r={R * 0.38} fill={SHEEN[v]} opacity={v === 1 ? 0.55 : 0.9} />
    </>
  );
}

/**
 * Bàn cờ lật SVG trên nền nỉ xanh. Đến lượt mình thì các ô đặt được hiện chấm gợi ý; di chuột / tab tới ô thì hiện
 * quân mờ và đánh dấu những quân sẽ bị lật.
 */
export const ReversiBoard = memo(function ReversiBoard({
  state,
  canPlay,
  myMark,
  onPlace,
}: {
  state: ReversiState;
  canPlay: boolean;
  myMark: 0 | 1 | 2;
  onPlace: (cell: number) => void;
}) {
  const [aim, setAim] = useState(-1);
  const legal = canPlay ? new Set(state.legal) : new Set<number>();
  const preview = canPlay && myMark && legal.has(aim) ? new Set(flipsOf(state.board, myMark, aim)) : new Set<number>();
  const flipped = new Set(state.flipped);
  const ended = state.over;
  const winner = state.winner;

  const discs = [];
  for (let i = 0; i < CELLS; i++) {
    const v = state.board[i] as 0 | 1 | 2;
    if (!v) continue;
    const x = cx(i);
    const y = cy(i);
    const placed = i === state.last;
    const turned = flipped.has(i);
    // Khoá theo nước đi để quân vừa đặt / vừa lật diễn lại hiệu ứng kể cả khi ô đó vừa lật ở nước trước.
    const key = placed || turned ? `${i}@${state.count}` : `${i}`;
    discs.push(
      <g key={key} className={placed ? "rv-put" : turned ? "rv-flip" : undefined} opacity={ended && winner && v !== winner ? 0.5 : 1} style={turned ? ({ "--d": `${FLIP_START_MS + ring(state.last, i) * FLIP_STEP_MS}ms` } as React.CSSProperties) : undefined}>
        <Disc v={v} x={x} y={y} />
        {turned && <circle className="rv-was" cx={x} cy={y} r={R} fill={FACE[v === 1 ? 2 : 1]} stroke="#050312" strokeWidth={2.5} />}
      </g>,
    );
  }

  const slots = [];
  for (const i of legal) {
    slots.push(
      <g key={i} className="rv-slot">
        <circle className="rv-hint" cx={cx(i)} cy={cy(i)} r={C * 0.11} fill={myMark ? FACE[myMark] : undefined} />
        {myMark !== 0 && (
          <g className="rv-ghost">
            <Disc v={myMark} x={cx(i)} y={cy(i)} />
          </g>
        )}
        <rect
          className="rv-hit"
          x={P + (i % SIZE) * C}
          y={P + Math.floor(i / SIZE) * C}
          width={C}
          height={C}
          role="button"
          tabIndex={0}
          aria-label={`Đặt quân vào ô ${square(i)}, lật ${flipsOf(state.board, myMark || 1, i).length} quân`}
          onPointerEnter={() => setAim(i)}
          onPointerLeave={() => setAim((a) => (a === i ? -1 : a))}
          onFocus={() => setAim(i)}
          onBlur={() => setAim((a) => (a === i ? -1 : a))}
          onClick={() => onPlace(i)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            onPlace(i);
          }}
        />
      </g>,
    );
  }

  const lines = [];
  for (let k = 1; k < SIZE; k++) {
    lines.push(<line key={`h${k}`} x1={P} y1={P + k * C} x2={P + SIZE * C} y2={P + k * C} />);
    lines.push(<line key={`v${k}`} x1={P + k * C} y1={P} x2={P + k * C} y2={P + SIZE * C} />);
  }

  return (
    <svg viewBox={`0 0 ${W} ${W}`} className={`rv ${canPlay ? "can-play" : ""}`} aria-label={`Bàn cờ lật ${SIZE}×${SIZE}${canPlay && myMark ? ` — đến lượt bạn (quân ${RV_NAME[myMark]})` : ""}`}>
      <rect x={1.5} y={1.5} width={W - 3} height={W - 3} rx={16} className="rv-frame" />
      <rect x={P} y={P} width={SIZE * C} height={SIZE * C} className="rv-felt" />
      <g className="rv-lines">{lines}</g>
      {[2, 6].flatMap((r) => [2, 6].map((c) => <circle key={`s${r}.${c}`} className="rv-star" cx={P + c * C} cy={P + r * C} r={4} />))}
      {discs}
      {[...preview].map((i) => (
        <circle key={`p${i}`} className="rv-preview" cx={cx(i)} cy={cy(i)} r={R * 0.42} fill={FACE[myMark || 1]} />
      ))}
      {state.last >= 0 && !ended && <circle key={`l${state.count}`} className="rv-last" cx={cx(state.last)} cy={cy(state.last)} r={5} />}
      {slots}
    </svg>
  );
});
