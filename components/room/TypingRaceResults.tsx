"use client";

import type { ReactNode } from "react";
import { clock, wpmSeries, type Badge, type Pt, type Shape } from "@/lib/games/typing-race";
import type { Member } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { CarArt } from "./TypingRaceArt";

export type Racer = { k: number; uid: string; name: string; member?: Member; color: string; shape: Shape; num: number; me: boolean };

const MEDALS = ["🥇", "🥈", "🥉"];

/** Bục trao giải ba bậc (nhì – nhất – ba), xe đỗ trên bục. */
export function Podium({ top }: { top: { racer: Racer; rank: number; value: ReactNode }[] }) {
  if (top.length < 2) return null;
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <ol className="tr-podium" aria-label="Bục trao giải">
      {order.map(({ racer: r, rank, value }) => (
        <li key={r.uid} className={`tr-step is-${rank}${r.me ? " is-me" : ""}`}>
          <CarArt color={r.color} shape={r.shape} num={r.num} className="tr-podium-car" />
          <span className="flex min-w-0 items-center gap-1.5">
            {r.member ? <Avatar p={r.member} size={24} /> : null}
            <b className="min-w-0 truncate text-[14px]">{r.name}</b>
          </span>
          <span className="text-[12px] font-semibold text-ink-3 tabular-nums">{value}</span>
          <span className="tr-block">
            <span className="text-[22px]">{MEDALS[rank - 1] ?? rank}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

const CW = 600;
const CH = 180;
const PAD = { l: 34, r: 10, t: 10, b: 22 };

/** Biểu đồ WPM tức thời của từng người theo thời gian, màu theo xe. */
export function WpmChart({ lines, end }: { lines: { racer: Racer; pts: readonly Pt[]; stop?: number }[]; end: number }) {
  const drawn = lines
    .filter((l) => l.pts.length >= 3)
    .map((l) => ({ ...l, s: wpmSeries(l.pts, Math.min(end, l.stop ?? end), { steps: Math.max(8, Math.round((48 * Math.min(end, l.stop ?? end)) / end)) }) }));
  if (!drawn.length || end < 3000) return null;
  const top = Math.max(20, ...drawn.flatMap((l) => l.s.map((p) => p[1])));
  const step = top > 120 ? 40 : 20;
  const max = Math.ceil(top / step) * step;
  const x = (t: number) => PAD.l + ((CW - PAD.l - PAD.r) * t) / end;
  const y = (v: number) => CH - PAD.b - ((CH - PAD.t - PAD.b) * v) / max;
  const grid = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  // Người của mình vẽ sau cùng để nằm trên.
  const sorted = [...drawn].sort((a, b) => Number(a.racer.me) - Number(b.racer.me));
  return (
    <figure className="tr-chart">
      <figcaption className="mb-1 text-[13px] font-bold text-ink-3">📈 Tốc độ theo thời gian (WPM)</figcaption>
      <svg viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label="Biểu đồ tốc độ gõ của từng người theo thời gian">
        {grid.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={CW - PAD.r} y1={y(v)} y2={y(v)} className="tr-chart-grid" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="tr-chart-label">
              {v}
            </text>
          </g>
        ))}
        {[0, 0.5, 1].map((f) => (
          <text key={f} x={x(end * f)} y={CH - 6} textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"} className="tr-chart-label">
            {clock(end * f)}
          </text>
        ))}
        {sorted.map(({ racer: r, s }) => {
          const d = `M${x(0)} ${y(0)}` + s.map(([t, v]) => `L${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join("");
          return (
            <g key={r.uid}>
              <path d={d} className="tr-chart-under" strokeWidth={r.me ? 6 : 4.5} />
              <path d={d} stroke={r.color} strokeWidth={r.me ? 3.5 : 2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] font-bold">
        {drawn.map(({ racer: r }) => (
          <li key={r.uid} className="flex items-center gap-1.5">
            <span className="sd-swatch" style={{ background: r.color }} aria-hidden="true" />
            {r.name}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function Badges({ list, racers }: { list: Badge[]; racers: Racer[] }) {
  if (!list.length) return null;
  return (
    <ul className="tr-badges" aria-label="Danh hiệu">
      {list.map((b) => {
        const r = racers.find((x) => x.k === b.k);
        if (!r) return null;
        return (
          <li key={b.key} className="tr-badge" style={{ ["--c" as string]: r.color }}>
            <span className="text-[20px]" aria-hidden="true">
              {b.emoji}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">{b.label}</span>
              <b className="truncate text-[14px]">{r.name}</b>
              <span className="text-[12px] font-semibold text-ink-2 tabular-nums">{b.text}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
