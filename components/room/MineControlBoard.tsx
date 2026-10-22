"use client";

import { memo, useState } from "react";
import { area3, isBase, type McState } from "@/lib/games/mine-control";

export const MC_TONES = ["var(--coral)", "var(--sky)", "var(--lime)", "var(--grape)"] as const;
export const MC_TONE_NAMES = ["Đỏ", "Xanh", "Lục", "Tím"] as const;

export type McTool = "open" | "radar" | "fort" | "grab";

const MIN_CELL = 26;

export const MineControlBoard = memo(function MineControlBoard({
  state: s,
  avatars,
  tool,
  me,
  valid,
  reveal,
  last,
  staged,
  gridRef,
  onCell,
}: {
  state: McState;
  avatars: string[];
  tool: McTool | null;
  me: number;
  valid: ((c: number) => boolean) | null;
  reveal: boolean;
  last: number;
  staged?: boolean;
  gridRef?: React.Ref<HTMLDivElement>;
  onCell: (c: number) => void;
}) {
  const [hover, setHover] = useState(-1);
  const scan = tool === "radar" && valid && hover >= 0 && valid(hover) ? new Set(area3(s.w, s.h, hover)) : null;
  const tone = me >= 0 ? MC_TONES[me] : "var(--pen)";

  const cells = [];
  for (let c = 0; c < s.w * s.h; c++) {
    const open = s.open[c];
    const owner = s.owner[c];
    const ok = !!valid?.(c);
    const base = isBase(s, c);
    const radar = s.radar[c];
    let body: React.ReactNode = null;
    let cls = "mc-cell";
    let bg: string | undefined;
    let label: string;
    if (open === 2) {
      cls += " is-boom";
      body = "💥";
      label = "mìn đã nổ";
    } else if (open === 1) {
      cls += " is-open";
      if (owner >= 0) bg = base ? MC_TONES[owner] : `color-mix(in srgb, ${MC_TONES[owner]} 32%, var(--board))`;
      if (base) {
        cls += " is-base";
        body = avatars[owner] ?? "🏠";
        label = `căn cứ ${MC_TONE_NAMES[owner]}`;
      } else if (s.fort[c]) {
        body = "🏰";
        label = `pháo đài ${MC_TONE_NAMES[owner]}`;
      } else {
        body = s.near[c] ? <span className={`mc-n${s.near[c]}`}>{s.near[c]}</span> : null;
        label = `${s.near[c]} mìn xung quanh${owner >= 0 ? `, của ${MC_TONE_NAMES[owner]}` : ", trung lập"}`;
      }
    } else {
      cls += " is-hidden";
      if (reveal && s.mine[c]) {
        cls += " is-mine";
        body = "💣";
      } else if (radar) body = <span className="mc-radar">{radar.n}</span>;
      label = radar ? `ô ẩn, Radar: ${radar.n} mìn quanh đây` : "ô ẩn";
    }
    if (ok) cls += " is-ok";
    if (scan?.has(c)) cls += " is-scan";
    if (c === last) cls += " is-last";
    const x = c % s.w;
    const y = Math.floor(c / s.w);
    cells.push(
      <button
        key={c}
        type="button"
        className={cls}
        style={bg ? { background: bg } : undefined}
        disabled={!ok}
        aria-label={`Hàng ${y + 1} cột ${x + 1}: ${label}`}
        onClick={() => onCell(c)}
        onPointerEnter={() => setHover(c)}
        onPointerLeave={() => setHover((h) => (h === c ? -1 : h))}
        onFocus={() => setHover(c)}
      >
        {body}
      </button>,
    );
  }

  // Lúc trình chiếu bàn đã vừa ô giữa: bỏ cỡ ô tối thiểu và thanh cuộn ngang.
  return (
    <div className={staged ? undefined : "overflow-x-auto"}>
      <div
        ref={gridRef}
        className="mc-grid"
        style={{ gridTemplateColumns: `repeat(${s.w}, minmax(0, 1fr))`, ...(staged ? {} : { minWidth: s.w * MIN_CELL }), "--mc-w": s.w, "--mc-tone": tone } as React.CSSProperties}
      >
        {cells}
      </div>
    </div>
  );
});
