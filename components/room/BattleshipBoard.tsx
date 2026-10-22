"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CELLS, colName, coord, FLEET, orients, shapeOf, shipCells, SIZE, type Ship } from "@/lib/games/battleship";

const C = 40;
const M = 26;
const P = 6;
const W = M + SIZE * C + P;

const left = (c: number) => M + (c % SIZE) * C;
const top = (c: number) => M + Math.floor(c / SIZE) * C;

export const BS_TONE = { 0: "var(--coral)", 1: "var(--sky)" } as const;

const SEA = "color-mix(in srgb, var(--sky) 13%, var(--surface))";
const SEA_LINE = "color-mix(in srgb, var(--sky) 30%, var(--surface))";
const STEEL = "color-mix(in srgb, var(--ink-2) 58%, var(--surface))";
const FLOOD = "color-mix(in srgb, var(--sky) 45%, transparent)";
const SMOKE = "color-mix(in srgb, var(--ink-2) 70%, var(--surface))";
const PAPER = ["var(--coral)", "var(--sun)", "var(--lime)", "var(--sky)", "var(--grape)", "var(--pen)"];

// Ngẫu nhiên theo chỉ số (không dùng Math.random) để hiệu ứng giống nhau ở mọi lần vẽ.
const rnd = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const vars = (v: Record<string, string>) => v as React.CSSProperties;

export type ShipTone = "steel" | "sunk" | "reveal" | "ok" | "bad" | "lift";
export type ShipDraw = { ship: Ship; tone: ShipTone; fresh?: boolean };

const HULL: Record<ShipTone, { fill: string; stroke: string; dash?: string; opacity?: number }> = {
  steel: { fill: STEEL, stroke: "var(--edge)" },
  sunk: { fill: "color-mix(in srgb, var(--ink-2) 72%, var(--coral))", stroke: "var(--edge)", opacity: 0.8 },
  reveal: { fill: "color-mix(in srgb, var(--sun) 38%, transparent)", stroke: "var(--ink-2)", dash: "6 4" },
  ok: { fill: "color-mix(in srgb, var(--lime) 50%, transparent)", stroke: "var(--lime)", dash: "6 4" },
  bad: { fill: "color-mix(in srgb, var(--coral) 45%, transparent)", stroke: "var(--coral)", dash: "6 4" },
  lift: { fill: "transparent", stroke: "var(--ink-3)", dash: "4 4", opacity: 0.8 },
};

function hullPath(len: number) {
  const l = len * C - 8;
  const b = C - 8;
  const r = b / 2;
  return `M${r} 0H${l - b * 0.9}C${l - b * 0.3} 0 ${l} ${b * 0.3} ${l} ${r}C${l} ${b * 0.7} ${l - b * 0.3} ${b} ${l - b * 0.9} ${b}H${r}A${r} ${r} 0 0 1 ${r} 0Z`;
}

// Tàu thẳng: mũi tàu quay theo hướng (lật tàu thẳng cũng như quay nửa vòng).
function LineHull({ ship, tone, fresh }: ShipDraw) {
  const len = FLEET[ship.k].cells.length;
  const l = len * C - 8;
  const b = C - 8;
  const x = left(ship.at) + 4;
  const y = top(ship.at) + 4;
  const turn = ((ship.o % 4) + (ship.o >= 4 ? 2 : 0)) % 4;
  const place = [`translate(${x} ${y})`, `translate(${x + b} ${y}) rotate(90)`, `translate(${x + l} ${y + b}) rotate(180)`, `translate(${x} ${y + l}) rotate(270)`][turn];
  const h = HULL[tone];
  return (
    <g opacity={h.opacity} transform={place} pointerEvents="none">
      <g className={fresh ? "bs-sink" : undefined}>
        <path d={hullPath(len)} fill={h.fill} stroke={h.stroke} strokeWidth={2.5} strokeDasharray={h.dash} />
        {(tone === "steel" || tone === "sunk") &&
          Array.from({ length: len - 1 }, (_, i) => <circle key={i} cx={i * C + C / 2 - 2} cy={b / 2} r={4} fill="color-mix(in srgb, var(--edge) 30%, transparent)" />)}
        {tone === "sunk" && <path className={fresh ? "bs-flood" : undefined} d={hullPath(len)} fill={FLOOD} opacity={0.6} />}
      </g>
    </g>
  );
}

const POD = C - 8;
const NECK = 18;

// Khoang nối với khoang kề cạnh; khoang không kề cạnh ai (tàu chéo) thì nối chéo.
function linksOf(cells: [number, number][]) {
  const has = (x: number, y: number) => cells.some((c) => c[0] === x && c[1] === y);
  const out: [number, number, number, number][] = [];
  for (const [x, y] of cells) {
    const lone = ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => has(x + dx, y + dy));
    const next = lone ? [[1, 1], [-1, 1]] : [[1, 0], [0, 1]];
    for (const [dx, dy] of next) if (has(x + dx, y + dy)) out.push([x, y, x + dx, y + dy]);
  }
  return out;
}

// Tàu hình đặc biệt: các khoang vuông nối bằng cổ. Màu thân tô một lần qua clipPath (hợp các mảnh) nên màu trong suốt
// không đậm lên ở chỗ chồng. Viền là nét của từng mảnh, che phần nằm lọt trong thân (mask là thân co vào nửa nét) để chỉ
// còn đường bao ngoài — đứt nét được như tàu thẳng, dày 2,5px nằm giữa mép thân.
function BlockHull({ ship, tone, fresh }: ShipDraw) {
  const id = `bs-${useId().replace(/[^\w-]/g, "")}`;
  const shape = shapeOf(ship.k, ship.o);
  if (!shape) return null;
  const x0 = left(ship.at) + C / 2;
  const y0 = top(ship.at) + C / 2;
  const links = linksOf(shape.cells);
  const h = HULL[tone];
  const box = { x: left(ship.at), y: top(ship.at), width: shape.w * C, height: shape.h * C };
  const pieces = (pad: number) => (
    <>
      {links.map(([ax, ay, bx, by], i) => {
        const x1 = x0 + ax * C;
        const y1 = y0 + ay * C;
        const len = Math.hypot(bx - ax, by - ay) * C;
        const deg = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
        const half = NECK / 2 + pad;
        return <rect key={`n${i}`} x={x1} y={y1 - half} width={len} height={half * 2} transform={`rotate(${deg} ${x1} ${y1})`} />;
      })}
      {shape.cells.map(([x, y], i) => (
        <rect key={`p${i}`} x={x0 + x * C - POD / 2 - pad} y={y0 + y * C - POD / 2 - pad} width={POD + pad * 2} height={POD + pad * 2} rx={9 + pad} />
      ))}
    </>
  );
  return (
    <g opacity={h.opacity} pointerEvents="none">
      <defs>
        <clipPath id={`${id}-body`}>{pieces(0)}</clipPath>
        <mask id={`${id}-rim`} maskUnits="userSpaceOnUse" x={box.x} y={box.y} width={box.width} height={box.height}>
          <rect {...box} fill="white" />
          <g fill="black">{pieces(-1.25)}</g>
        </mask>
      </defs>
      <g className={fresh ? "bs-sink" : undefined}>
        {h.fill !== "transparent" && <rect {...box} clipPath={`url(#${id}-body)`} fill={h.fill} />}
        {(tone === "steel" || tone === "sunk") &&
          shape.cells.map(([x, y], i) => <circle key={i} cx={x0 + x * C} cy={y0 + y * C} r={4} fill="color-mix(in srgb, var(--edge) 30%, transparent)" />)}
        {tone === "sunk" && <rect {...box} className={fresh ? "bs-flood" : undefined} clipPath={`url(#${id}-body)`} fill={FLOOD} opacity={0.6} />}
        <g mask={`url(#${id}-rim)`} fill="none" stroke={h.stroke} strokeWidth={2.5} strokeDasharray={h.dash}>
          {pieces(0)}
        </g>
      </g>
    </g>
  );
}

const ShipShape = (d: ShipDraw) => (FLEET[d.ship.k]?.line ? <LineHull {...d} /> : <BlockHull {...d} />);

// Hình nhỏ của loại tàu cho danh sách, quay ngang nếu được; `hits` ô đầu tô đỏ.
export function ShapeIcon({ k, size = 8, color = "var(--ink-3)", hits = 0 }: { k: number; size?: number; color?: string; hits?: number }) {
  const o = orients(k).find((o) => shapeOf(k, o)!.w >= shapeOf(k, o)!.h) ?? 0;
  const shape = shapeOf(k, o)!;
  return (
    <span className="grid flex-none gap-0.5" style={{ gridTemplateColumns: `repeat(${shape.w}, ${size}px)`, gridAutoRows: `${size}px` }} aria-hidden="true">
      {shape.cells.map(([x, y], j) => (
        <span key={j} className="rounded-[3px]" style={{ gridColumn: x + 1, gridRow: y + 1, background: j < hits ? "var(--coral)" : color }} />
      ))}
    </span>
  );
}

const BURST = Array.from({ length: 16 }, (_, i) => {
  const a = (Math.PI * i) / 8 - Math.PI / 2;
  const r = i % 2 ? 6.5 : 14;
  return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
}).join(" ");

const SPARKS = Array.from({ length: 10 }, (_, i) => ({ a: i * 36 + (rnd(i) - 0.5) * 20, d: 26 + rnd(i + 30) * 18 }));
const PUFFS = [
  { x: -10, r: 9, t: 60 },
  { x: 8, r: 10, t: 170 },
  { x: -3, r: 12, t: 300 },
  { x: 5, r: 8, t: 480 },
  { x: -6, r: 7, t: 650 },
];

function Blast() {
  return (
    <>
      <circle className="bs-fx bs-flash" r={24} fill="var(--sun)" />
      <circle className="bs-fx bs-splash" r={14} fill="none" stroke="var(--coral)" strokeWidth={3.5} />
      {SPARKS.map((p, i) => (
        <line
          key={i}
          className="bs-fx bs-spark"
          style={vars({ "--a": `${p.a.toFixed(1)}deg`, "--d": `${p.d.toFixed(1)}px` })}
          x2={10}
          stroke={i % 2 ? "var(--sun)" : "var(--coral)"}
          strokeWidth={4}
          strokeLinecap="round"
        />
      ))}
      {PUFFS.map((p, i) => (
        <circle key={i} className="bs-fx bs-puff" style={vars({ "--dx": `${p.x}px`, animationDelay: `${p.t}ms` })} cy={-4} r={p.r} fill={SMOKE} />
      ))}
    </>
  );
}

function Mark({ c, hit, fresh, burning }: { c: number; hit: boolean; fresh: boolean; burning: boolean }) {
  const x = left(c) + C / 2;
  const y = top(c) + C / 2;
  if (hit)
    return (
      <g transform={`translate(${x} ${y})`} pointerEvents="none">
        {fresh && <Blast />}
        <g className={fresh ? "bs-boom" : undefined}>
          <polygon points={BURST} fill="var(--coral)" stroke="var(--edge)" strokeWidth={1.5} strokeLinejoin="round" />
          <circle r={4} fill="var(--sun)" />
        </g>
        {burning &&
          [0, 1].map((j) => <circle key={j} className="bs-fx bs-wisp" style={{ animationDelay: `${(fresh ? 1400 : (c * 373) % 2600) + j * 1300}ms` }} cx={-3 + j * 6} cy={-10} r={6} fill={SMOKE} />)}
      </g>
    );
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      {fresh && <circle className="bs-splash" r={8} fill="none" stroke="var(--sky)" strokeWidth={2.5} />}
      <circle r={4.5} fill="var(--ink-3)" opacity={0.75} />
    </g>
  );
}

const CONFETTI = Array.from({ length: 28 }, (_, i) => {
  const a = -Math.PI / 2 + (rnd(i + 3) - 0.5) * 2.4;
  const v = 70 + rnd(i + 57) * 90;
  return {
    dx: (Math.cos(a) * v).toFixed(1),
    dy: (Math.sin(a) * v).toFixed(1),
    r: Math.round((rnd(i + 91) - 0.5) * 1080),
    w: 4 + rnd(i + 7) * 3,
    h: 7 + rnd(i + 13) * 5,
    fill: PAPER[i % PAPER.length],
    t: 250 + Math.round(rnd(i + 21) * 220),
  };
});

function SinkFx({ ship }: ShipDraw) {
  const cells = shipCells(ship) ?? [];
  const shape = shapeOf(ship.k, ship.o);
  if (!cells.length || !shape) return null;
  const len = cells.length;
  const rx = (shape.w * C) / 2;
  const ry = (shape.h * C) / 2;
  const cx = left(ship.at) + rx;
  const cy = top(ship.at) + ry;
  return (
    <g pointerEvents="none">
      {cells.map((c, i) => (
        <g key={c} transform={`translate(${left(c) + C / 2} ${top(c) + C / 2})`}>
          <g className="bs-fx bs-chain" style={{ animationDelay: `${i * 110}ms` }}>
            <circle r={18} fill="var(--sun)" opacity={0.85} />
            <polygon points={BURST} transform="scale(1.35)" fill="var(--coral)" stroke="var(--edge)" strokeWidth={1.2} strokeLinejoin="round" />
          </g>
        </g>
      ))}
      {[380, 700, 1020].map((t) => (
        <ellipse key={t} className="bs-fx bs-ripple" style={{ animationDelay: `${t}ms` }} cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="var(--sky)" strokeWidth={2.5} />
      ))}
      {Array.from({ length: len * 2 }, (_, i) => {
        const c = cells[i % len];
        return (
          <circle
            key={i}
            className="bs-fx bs-bubble"
            style={{ animationDelay: `${650 + Math.round(rnd(i + 40) * 900)}ms` }}
            cx={left(c) + 8 + rnd(i + 11) * (C - 16)}
            cy={top(c) + 8 + rnd(i + 23) * (C - 16)}
            r={2.5 + rnd(i + 5) * 2.5}
            fill="none"
            stroke="var(--sky)"
            strokeWidth={1.8}
          />
        );
      })}
      <g transform={`translate(${cx} ${cy})`}>
        {CONFETTI.map((p, i) => (
          <rect
            key={i}
            className="bs-fx bs-confetti"
            style={vars({ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--r": `${p.r}deg`, animationDelay: `${p.t}ms` })}
            x={-p.w / 2}
            y={-p.h / 2}
            width={p.w}
            height={p.h}
            rx={1.5}
            fill={p.fill}
          />
        ))}
      </g>
    </g>
  );
}

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
  onFlip,
  onCancel,
}: {
  label: string;
  ships?: ShipDraw[];
  marks?: Int8Array;
  last?: number;
  fresh?: boolean;
  pending?: number;
  aim?: string;
  canHit?: (c: number) => boolean;
  onCell?: (c: number) => void;
  onHover?: (c: number) => void;
  onRotate?: () => void;
  onFlip?: () => void;
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
    } else if ((e.key === "f" || e.key === "F") && onFlip) {
      e.preventDefault();
      onFlip();
    } else if (e.key === "Escape" && onCancel) onCancel();
  };

  const aiming = active && !!aim && open(cursor);
  const marked: number[] = [];
  if (marks) for (let c = 0; c < CELLS; c++) if (marks[c] >= 0) marked.push(c);
  const wrecked = new Set(ships.flatMap((s) => (s.tone === "sunk" ? (shipCells(s.ship) ?? []) : [])));
  const sinking = ships.filter((s) => s.fresh);

  const quakeRef = useRef<SVGGElement>(null);
  const jolt = fresh && last >= 0 && marks?.[last] === 1 ? (sinking.length ? "bs-quake-lg" : "bs-quake") : "";
  useEffect(() => {
    const el = quakeRef.current;
    if (!el || !jolt) return;
    el.classList.remove("bs-quake", "bs-quake-lg");
    void el.getBoundingClientRect();
    el.classList.add(jolt);
  }, [last, jolt]);

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
      <g ref={quakeRef}>
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
          <ShipShape key={`${s.ship.k}:${s.tone}`} {...s} />
        ))}
        {last >= 0 && <rect x={left(last) + 2} y={top(last) + 2} width={C - 4} height={C - 4} rx={7} fill="none" stroke="var(--pen)" strokeWidth={2.5} pointerEvents="none" />}
        {marked.map((c) => (
          <Mark key={c} c={c} hit={marks![c] === 1} fresh={fresh && c === last} burning={!wrecked.has(c)} />
        ))}
        {sinking.map((s) => (
          <SinkFx key={s.ship.k} {...s} />
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
      </g>
    </svg>
  );
}

export function fleetDraws(sunk: readonly Ship[], fleet: readonly Ship[] | undefined, alive: ShipTone, freshK = -1): ShipDraw[] {
  const out: ShipDraw[] = [];
  if (fleet) for (const ship of fleet) if (!sunk.some((s) => s.k === ship.k)) out.push({ ship, tone: alive });
  for (const ship of sunk) out.push({ ship, tone: "sunk", fresh: ship.k === freshK });
  return out;
}

/** Số ô đã trúng của từng loại tàu trong hạm đội. */
export function damage(fleet: readonly Ship[], marks: Int8Array): Record<number, number> {
  return Object.fromEntries(fleet.map((ship) => [ship.k, shipCells(ship)!.filter((c) => marks[c] === 1).length]));
}
