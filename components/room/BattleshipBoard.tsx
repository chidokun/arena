"use client";

import { useState } from "react";
import { CELLS, colName, coord, FLEET, shipCells, SIZE, type Ship } from "@/lib/games/battleship";

/** Cạnh một ô, lề nhãn toạ độ (trên, trái) và lề phải / dưới. */
const C = 40;
const M = 26;
const P = 6;
const W = M + SIZE * C + P;

const left = (c: number) => M + (c % SIZE) * C;
const top = (c: number) => M + Math.floor(c / SIZE) * C;

/** Màu hai bên theo đội hình: [0] bắn trước. */
export const BS_TONE = { 0: "var(--coral)", 1: "var(--sky)" } as const;

const SEA = "color-mix(in srgb, var(--sky) 13%, var(--surface))";
const SEA_LINE = "color-mix(in srgb, var(--sky) 30%, var(--surface))";
const STEEL = "color-mix(in srgb, var(--ink-2) 58%, var(--surface))";

/**
 * Cách vẽ một tàu: `steel` tàu của mình, `sunk` tàu đã chìm, `reveal` tàu đối phương lộ ra lúc hết ván,
 * `ok` / `bad` bóng tàu đang đặt (hợp lệ / chồng lên tàu khác), `lift` chỗ cũ của tàu đang nhấc lên.
 */
export type ShipTone = "steel" | "sunk" | "reveal" | "ok" | "bad" | "lift";
export type ShipDraw = { k: number; ship: Ship; tone: ShipTone; fresh?: boolean };

const HULL: Record<ShipTone, { fill: string; stroke: string; dash?: string; opacity?: number }> = {
  steel: { fill: STEEL, stroke: "var(--edge)" },
  sunk: { fill: "color-mix(in srgb, var(--ink-2) 72%, var(--coral))", stroke: "var(--edge)", opacity: 0.8 },
  reveal: { fill: "color-mix(in srgb, var(--sun) 38%, transparent)", stroke: "var(--ink-2)", dash: "6 4" },
  ok: { fill: "color-mix(in srgb, var(--lime) 50%, transparent)", stroke: "var(--lime)", dash: "6 4" },
  bad: { fill: "color-mix(in srgb, var(--coral) 45%, transparent)", stroke: "var(--coral)", dash: "6 4" },
  lift: { fill: "transparent", stroke: "var(--ink-3)", dash: "4 4", opacity: 0.8 },
};

/** Thân tàu dài `len` ô theo trục x (đuôi tròn, mũi nhọn), đã thụt vào 4px mỗi phía. */
function hullPath(len: number) {
  const l = len * C - 8;
  const b = C - 8;
  const r = b / 2;
  return `M${r} 0H${l - b * 0.9}C${l - b * 0.3} 0 ${l} ${b * 0.3} ${l} ${r}C${l} ${b * 0.7} ${l - b * 0.3} ${b} ${l - b * 0.9} ${b}H${r}A${r} ${r} 0 0 1 ${r} 0Z`;
}

function ShipShape({ k, ship, tone, fresh }: ShipDraw) {
  const len = FLEET[k].len;
  const b = C - 8;
  const x = left(ship.at) + 4;
  const y = top(ship.at) + 4;
  const h = HULL[tone];
  return (
    <g
      className={fresh ? "bs-sink" : undefined}
      opacity={h.opacity}
      transform={ship.v ? `translate(${x + b} ${y}) rotate(90)` : `translate(${x} ${y})`}
      pointerEvents="none"
    >
      <path d={hullPath(len)} fill={h.fill} stroke={h.stroke} strokeWidth={2.5} strokeDasharray={h.dash} />
      {(tone === "steel" || tone === "sunk") &&
        Array.from({ length: len - 1 }, (_, i) => (
          <circle key={i} cx={i * C + C / 2 - 2} cy={b / 2} r={4} fill="color-mix(in srgb, var(--edge) 30%, transparent)" />
        ))}
    </g>
  );
}

/** Ngôi sao nổ 8 cánh tâm (0, 0). */
const BURST = Array.from({ length: 16 }, (_, i) => {
  const a = (Math.PI * i) / 8 - Math.PI / 2;
  const r = i % 2 ? 6.5 : 14;
  return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
}).join(" ");

function Mark({ c, hit, fresh }: { c: number; hit: boolean; fresh: boolean }) {
  const x = left(c) + C / 2;
  const y = top(c) + C / 2;
  if (hit)
    return (
      <g transform={`translate(${x} ${y})`} pointerEvents="none">
        <g className={fresh ? "bs-boom" : undefined}>
          <polygon points={BURST} fill="var(--coral)" stroke="var(--edge)" strokeWidth={1.5} strokeLinejoin="round" />
          <circle r={4} fill="var(--sun)" />
        </g>
      </g>
    );
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      {fresh && <circle className="bs-splash" r={8} fill="none" stroke="var(--sky)" strokeWidth={2.5} />}
      <circle r={4.5} fill="var(--ink-3)" opacity={0.75} />
    </g>
  );
}

/** Tâm ngắm (đang rê chuột / phát đang chờ trả lời). */
function Reticle({ c, tone, className }: { c: number; tone: string; className?: string }) {
  const x = left(c) + C / 2;
  const y = top(c) + C / 2;
  return (
    <g className={className} transform={`translate(${x} ${y})`} stroke={tone} strokeWidth={2.5} fill="none" strokeLinecap="round" pointerEvents="none">
      <circle r={13} />
      <path d="M0 -19V-8M0 8V19M-19 0H-8M8 0H19" />
    </g>
  );
}

/**
 * Hải đồ 10 × 10 SVG. Vẽ tàu (`ships`), dấu trúng / trượt (`marks`: -1 chưa bắn, 0 trượt, 1 trúng), phát gần nhất và
 * phát đang chờ. Có `onCell` thì bấm được: chuột / chạm chọn ô, bàn phím dùng mũi tên + Enter (R xoay, Esc huỷ khi bày tàu).
 */
export function SeaBoard({
  label,
  ships = [],
  marks,
  last = -1,
  fresh = false,
  pending = -1,
  aim,
  canHit,
  onCell,
  onHover,
  onRotate,
  onCancel,
}: {
  label: string;
  ships?: ShipDraw[];
  marks?: Int8Array;
  /** Ô của phát gần nhất trên hải đồ này. */
  last?: number;
  /** Diễn hiệu ứng nổ / tung bọt cho phát gần nhất. */
  fresh?: boolean;
  pending?: number;
  /** Màu tâm ngắm khi đang chọn ô để bắn; không có là chế độ bày tàu. */
  aim?: string;
  canHit?: (c: number) => boolean;
  onCell?: (c: number) => void;
  onHover?: (c: number) => void;
  onRotate?: () => void;
  onCancel?: () => void;
}) {
  const [cursor, setCursor] = useState(-1);
  const active = !!onCell;
  const point = (c: number) => {
    setCursor(c);
    onHover?.(c);
  };
  const open = (c: number) => c >= 0 && (canHit ? canHit(c) : true);

  const onKey = (e: React.KeyboardEvent) => {
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (step[e.key]) {
      e.preventDefault();
      const cur = cursor >= 0 ? cursor : (SIZE / 2 - 1) * SIZE + SIZE / 2 - 1;
      const x = Math.min(SIZE - 1, Math.max(0, (cur % SIZE) + step[e.key][0]));
      const y = Math.min(SIZE - 1, Math.max(0, Math.floor(cur / SIZE) + step[e.key][1]));
      point(y * SIZE + x);
    } else if ((e.key === "Enter" || e.key === " ") && cursor >= 0) {
      e.preventDefault();
      if (open(cursor)) onCell?.(cursor);
    } else if ((e.key === "r" || e.key === "R") && onRotate) {
      e.preventDefault();
      onRotate();
    } else if (e.key === "Escape" && onCancel) onCancel();
  };

  const aiming = active && !!aim && open(cursor);
  const marked: number[] = [];
  if (marks) for (let c = 0; c < CELLS; c++) if (marks[c] >= 0) marked.push(c);

  return (
    <svg
      viewBox={`0 0 ${W} ${W}`}
      className={`bs ${active ? (aim ? "is-aim" : "is-place") : ""}`}
      role={active ? "application" : "img"}
      tabIndex={active ? 0 : undefined}
      aria-label={label}
      onKeyDown={active ? onKey : undefined}
      onPointerLeave={() => point(-1)}
      onBlur={() => point(-1)}
      onContextMenu={
        onRotate
          ? (e) => {
              e.preventDefault();
              onRotate();
            }
          : undefined
      }
    >
      <rect x={M} y={M} width={SIZE * C} height={SIZE * C} rx={8} fill={SEA} />
      {aiming && (
        <g fill="var(--board-hover)" pointerEvents="none">
          <rect x={M} y={top(cursor)} width={SIZE * C} height={C} />
          <rect x={left(cursor)} y={M} width={C} height={SIZE * C} />
        </g>
      )}
      <g stroke={SEA_LINE} strokeWidth={1.5} pointerEvents="none">
        {Array.from({ length: SIZE - 1 }, (_, i) => (
          <g key={i}>
            <line x1={M + (i + 1) * C} y1={M} x2={M + (i + 1) * C} y2={M + SIZE * C} />
            <line x1={M} y1={M + (i + 1) * C} x2={M + SIZE * C} y2={M + (i + 1) * C} />
          </g>
        ))}
      </g>
      <rect x={M} y={M} width={SIZE * C} height={SIZE * C} rx={8} fill="none" stroke="var(--edge)" strokeWidth={2.5} pointerEvents="none" />
      <g fontSize={13} fontWeight={800} fill="var(--ink-3)" textAnchor="middle" pointerEvents="none">
        {Array.from({ length: SIZE }, (_, i) => (
          <g key={i}>
            <text x={M + i * C + C / 2} y={M - 9}>
              {colName(i)}
            </text>
            <text x={M / 2 - 1} y={M + i * C + C / 2 + 4.5}>
              {i + 1}
            </text>
          </g>
        ))}
      </g>

      {ships.map((s) => (
        <ShipShape key={`${s.k}:${s.tone}`} {...s} />
      ))}
      {last >= 0 && <rect x={left(last) + 2} y={top(last) + 2} width={C - 4} height={C - 4} rx={7} fill="none" stroke="var(--pen)" strokeWidth={2.5} pointerEvents="none" />}
      {marked.map((c) => (
        <Mark key={c} c={c} hit={marks![c] === 1} fresh={fresh && c === last} />
      ))}
      {pending >= 0 && <Reticle c={pending} tone="var(--sun)" className="bs-pending" />}
      {aiming && cursor !== pending && <Reticle c={cursor} tone={aim} />}
      {active && !aim && cursor >= 0 && (
        <rect x={left(cursor) + 1.5} y={top(cursor) + 1.5} width={C - 3} height={C - 3} rx={7} fill="none" stroke="var(--pen)" strokeWidth={2} strokeDasharray="4 3" pointerEvents="none" />
      )}

      {active &&
        Array.from({ length: CELLS }, (_, c) => (
          <rect
            key={c}
            className={`bs-cell ${open(c) ? "is-open" : ""}`}
            x={left(c)}
            y={top(c)}
            width={C}
            height={C}
            aria-label={coord(c)}
            onPointerEnter={() => point(c)}
            onClick={() => {
              point(c);
              if (open(c)) onCell!(c);
            }}
          />
        ))}
    </svg>
  );
}

/** Các tàu của một hạm đội để vẽ: tàu đã chìm theo câu trả lời, phần còn lại khi biết sơ đồ (của mình, hoặc lộ ra lúc hết ván). */
export function fleetDraws(sunk: readonly { k: number; ship: Ship }[], fleet: readonly Ship[] | undefined, alive: ShipTone, freshK = -1): ShipDraw[] {
  const out: ShipDraw[] = [];
  if (fleet) fleet.forEach((ship, k) => !sunk.some((s) => s.k === k) && out.push({ k, ship, tone: alive }));
  for (const s of sunk) out.push({ k: s.k, ship: s.ship, tone: "sunk", fresh: s.k === freshK });
  return out;
}

/** Số ô đã bị bắn trúng của từng tàu (khi biết sơ đồ). */
export function damage(fleet: readonly Ship[], marks: Int8Array) {
  return fleet.map((ship, k) => shipCells(k, ship)!.filter((c) => marks[c] === 1).length);
}
