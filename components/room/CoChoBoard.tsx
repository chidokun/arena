"use client";

import { memo, useId, useState } from "react";
import { LINES, POINTS, type CoChoState } from "@/lib/games/co-cho";

/** Lề và cạnh hình vuông (theo đơn vị viewBox — bàn co giãn theo khung). */
const P = 64;
const S = 292;
const W = S + 2 * P;
const R = 31;

/** Màu hai loại nắp chai — dùng cho cả quân, thẻ ghế và vòng sáng. */
export const CD_TONE = { 1: "var(--coral)", 2: "var(--sky)" } as const;
export const CD_NAME = { 1: "Đỏ", 2: "Xanh" } as const;

/** Toạ độ từng điểm theo chỉ số: bốn góc (trên trái, trên phải, dưới trái, dưới phải) rồi tâm. */
const XY: readonly (readonly [number, number])[] = [
  [P, P],
  [P + S, P],
  [P, P + S],
  [P + S, P + S],
  [P + S / 2, P + S / 2],
];

const PLACE = ["góc trên trái", "góc trên phải", "góc dưới trái", "góc dưới phải", "tâm"] as const;

/** Thời gian quân trượt sang điểm mới (ms) — bàn chơi chờ ngần ấy rồi mới diễn cảnh hết ván. */
export const SLIDE_MS = 420;

/** Quân là một nắp chai: viền răng cưa, lòng nắp sáng hơn một chút. */
export function Cap({ v, x = 0, y = 0, r = R }: { v: 1 | 2; x?: number; y?: number; r?: number }) {
  const tone = CD_TONE[v];
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={tone} stroke="var(--edge)" strokeWidth={2.5} />
      <circle cx={x} cy={y} r={r - 4.5} fill="none" stroke={`color-mix(in srgb, ${tone} 70%, black)`} strokeWidth={5} strokeDasharray="4.2 3.2" />
      <circle cx={x} cy={y} r={r * 0.6} fill={`color-mix(in srgb, ${tone} 78%, white)`} stroke={`color-mix(in srgb, ${tone} 70%, black)`} strokeWidth={1.5} />
      <ellipse cx={x - r * 0.18} cy={y - r * 0.22} rx={r * 0.26} ry={r * 0.14} fill="#fff" opacity={0.55} transform={`rotate(-25 ${x - r * 0.18} ${y - r * 0.22})`} />
    </>
  );
}

/**
 * Bàn cờ chó SVG: hình vuông kẻ phấn trên nền gạch, hai đường chéo, cạnh trái có chó canh (không kẻ, không đi được).
 * Đến lượt mình thì quân đi được nhấp nháy; di chuột / tab tới quân thì hiện quân mờ ở điểm trống. Bấm là đi luôn —
 * đích lúc nào cũng là điểm trống duy nhất.
 */
export const CoChoBoard = memo(function CoChoBoard({
  state,
  canPlay,
  myMark,
  onMove,
}: {
  state: CoChoState;
  canPlay: boolean;
  myMark: 0 | 1 | 2;
  onMove: (from: number) => void;
}) {
  const tiles = useId();
  const [aim, setAim] = useState(-1);
  const legal = new Set(canPlay ? state.legal : []);
  const aiming = legal.has(aim) ? aim : -1;
  const { last, empty } = state;
  // Hết ván vì bị chặn: quân người thua mờ đi, điểm trống đánh dấu "hết đường".
  const blocked = state.over && state.winner ? ((3 - state.winner) as 1 | 2) : 0;
  const [ex, ey] = XY[empty];

  const caps = [];
  for (let i = 0; i < POINTS; i++) {
    const v = state.board[i] as 0 | 1 | 2;
    if (!v) continue;
    const [x, y] = XY[i];
    const moved = last?.to === i;
    const style = moved ? ({ "--dx": `${XY[last.from][0] - x}px`, "--dy": `${XY[last.from][1] - y}px` } as React.CSSProperties) : undefined;
    caps.push(
      // Khoá theo nước đi để quân vừa đi trượt lại từ điểm cũ.
      <g key={moved ? `${i}@${state.count}` : `${i}`} className={moved ? "cd-slide" : undefined} style={style} opacity={blocked === v ? 0.55 : 1}>
        <Cap v={v} x={x} y={y} />
      </g>,
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${W}`} className="cd" aria-label={`Bàn cờ chó${canPlay && myMark ? ` — đến lượt bạn (quân ${CD_NAME[myMark]})` : ""}`}>
      <defs>
        <pattern id={tiles} width={W / 6} height={W / 6} patternUnits="userSpaceOnUse">
          <rect width={W / 6} height={W / 6} className="cd-tile" />
          <path d={`M0 0H${W / 6}M0 0V${W / 6}`} className="cd-grout" />
        </pattern>
      </defs>
      <rect x={1.5} y={1.5} width={W - 3} height={W - 3} rx={18} fill={`url(#${tiles})`} className="cd-frame" />

      {/* Tam giác của chó: sát cạnh bị chặn. */}
      <polygon points={`${P},${P} ${P + S / 2},${P + S / 2} ${P},${P + S}`} className="cd-den" />
      <line x1={P} y1={P} x2={P} y2={P + S} className="cd-fence" />
      <g className="cd-chalk">
        {LINES.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={XY[a][0]} y1={XY[a][1]} x2={XY[b][0]} y2={XY[b][1]} />
        ))}
      </g>
      {XY.map(([x, y], i) => (
        <circle key={`n${i}`} cx={x} cy={y} r={9} className="cd-node" />
      ))}
      <g className="cd-dog" aria-hidden>
        <circle cx={P} cy={P + S / 2} r={36} />
        <text x={P} y={P + S / 2 + 2} textAnchor="middle" dominantBaseline="central" fontSize={42}>
          🐕
        </text>
      </g>

      {/* Vệt nước vừa đi. */}
      {last && !state.over && (
        <line key={`t${state.count}`} x1={XY[last.from][0]} y1={XY[last.from][1]} x2={XY[last.to][0]} y2={XY[last.to][1]} className="cd-trail" />
      )}
      {canPlay && <circle cx={ex} cy={ey} r={R + 4} className="cd-target" />}

      {caps}

      {blocked !== 0 && (
        <g key={`x${state.count}`} className="cd-stuck">
          <circle cx={ex} cy={ey} r={R - 4} />
          <path d={`M${ex - 11} ${ey - 11}L${ex + 11} ${ey + 11}M${ex + 11} ${ey - 11}L${ex - 11} ${ey + 11}`} />
        </g>
      )}

      {aiming >= 0 && myMark !== 0 && (
        <g className="cd-ghost">
          <line x1={XY[aiming][0]} y1={XY[aiming][1]} x2={ex} y2={ey} className="cd-arrow" />
          <Cap v={myMark} x={ex} y={ey} />
        </g>
      )}

      {[...legal].map((i) => (
        <g key={`h${i}@${state.count}`} className="cd-slot">
          <circle className="cd-can" cx={XY[i][0]} cy={XY[i][1]} r={R + 5} />
          <circle
            className="cd-hit"
            cx={XY[i][0]}
            cy={XY[i][1]}
            r={R + 12}
            role="button"
            tabIndex={0}
            aria-label={`Đi quân ở ${PLACE[i]} sang ${PLACE[empty]}`}
            onPointerEnter={() => setAim(i)}
            onPointerLeave={() => setAim((a) => (a === i ? -1 : a))}
            onFocus={() => setAim(i)}
            onBlur={() => setAim((a) => (a === i ? -1 : a))}
            onClick={() => onMove(i)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onMove(i);
            }}
          />
        </g>
      ))}
    </svg>
  );
});
