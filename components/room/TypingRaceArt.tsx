"use client";

import { useId } from "react";
import type { Level, Shape } from "@/lib/games/typing-race";

const INK = "#1d1648";
const GLASS = "#9fdcff";

function Wheel({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g className="tr-wheel" style={{ transformOrigin: `${x}px ${y}px` }}>
      <circle cx={x} cy={y} r={r} fill={INK} />
      <circle cx={x} cy={y} r={r * 0.45} fill="#c9c3e6" />
      <path d={`M${x - r * 0.7} ${y}h${r * 1.4}M${x} ${y - r * 0.7}v${r * 1.4}`} stroke="#c9c3e6" strokeWidth="2" />
    </g>
  );
}

function Num({ x, y, n, r = 6.5 }: { x: number; y: number; n?: number; r?: number }) {
  if (n == null) return null;
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke={INK} strokeWidth="1.5" />
      <text x={x} y={y + r * 0.42} textAnchor="middle" fontSize={r * 1.2} fontWeight="800" fill={INK}>
        {n}
      </text>
    </g>
  );
}

const line = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" } as const;

function Body({ shape, color, num }: { shape: Shape; color: string; num?: number }) {
  switch (shape) {
    case "kart":
      return (
        <>
          <path d="M38 30l-4-12h8l5 12z" fill={INK} />
          <path d="M8 42c0-4 3-6 7-6h20l6-8h30c8 0 14 3 18 8h14c4 0 6 2 6 5v1c0 2-1 3-3 3H11c-2 0-3-1-3-3z" fill={color} {...line} />
          <circle cx="52" cy="18" r="8" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <path d="M54 14h6c2 0 3 2 3 4v1h-9z" fill={GLASS} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M62 27l9-7" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <Wheel x={28} y={44} r={9} />
          <Wheel x={96} y={45} r={8} />
          <Num x={80} y={38} n={num} r={5.5} />
        </>
      );
    case "truck":
      return (
        <>
          <rect x="6" y="9" width="64" height="31" rx="3" fill={color} {...line} />
          <path d="M11 31h54" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".4" />
          <path d="M70 18h24c6 0 9 3 12 9l6 9v6c0 2-1 3-3 3H70z" fill={color} {...line} />
          <path d="M78 22h14c4 0 6 2 8 6l3 6H78z" fill={GLASS} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="4" y="40" width="108" height="6" rx="2" fill={INK} />
          <ellipse cx="111" cy="37" rx="3" ry="2.6" fill="#fff6c2" stroke={INK} strokeWidth="2" />
          <Wheel x={22} y={46} r={8.5} />
          <Wheel x={46} y={46} r={8.5} />
          <Wheel x={96} y={46} r={8.5} />
          <Num x={38} y={22} n={num} r={8} />
        </>
      );
    case "f1":
      return (
        <>
          <path d="M11 20v14" stroke={INK} strokeWidth="3" />
          <rect x="2" y="13" width="19" height="7" rx="1.5" fill={color} stroke={INK} strokeWidth="2.5" />
          <path d="M12 40c0-5 3-8 9-8h24l8-10h16l6 10h24l18 4c4 1 4 7 0 8H16c-2 0-4-2-4-4z" fill={color} {...line} />
          <path d="M98 44h19v4H96z" fill={color} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M24 38h70" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".35" />
          <circle cx="62" cy="22" r="6.5" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <path d="M64 19h5c1 0 2 1 2 2v1h-7z" fill={GLASS} stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M53 25c4-7 15-7 19 0" stroke={INK} strokeWidth="2.5" fill="none" />
          <Wheel x={28} y={43} r={11} />
          <Wheel x={96} y={45} r={9} />
          <Num x={44} y={36} n={num} r={5.5} />
        </>
      );
    default:
      return (
        <>
          <path d="M4 21h18l3 8H8z" fill={color} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path
            d="M8 37c0-7 5-9 13-10l17-3c6-9 14-13 26-13h13c10 0 17 5 22 12l8 2c6 1 9 5 9 10v5c0 3-2 4-5 4H12c-3 0-4-2-4-4z"
            fill={color}
            {...line}
          />
          <path d="M44 25c4-7 10-10 18-10h13c6 0 11 3 15 10z" fill={GLASS} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M68 15v10" stroke={INK} strokeWidth="2.5" />
          <path d="M52 22l6-6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".7" />
          <path d="M16 34h84" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".35" />
          <ellipse cx="111" cy="32" rx="3.5" ry="3" fill="#fff6c2" stroke={INK} strokeWidth="2" />
          <Wheel x={31} y={45} r={10} />
          <Wheel x={93} y={45} r={10} />
          <Num x={60} y={35} n={num} />
        </>
      );
  }
}

export function CarArt({ color, shape = "classic", num, className }: { color: string; shape?: Shape; num?: number; className?: string }) {
  return (
    <svg viewBox="0 0 120 58" className={`tr-car-art ${className ?? ""}`} aria-hidden="true">
      <ellipse cx="62" cy="53" rx="52" ry="4" fill="rgba(0,0,0,.22)" />
      <Body shape={shape} color={color} num={num} />
    </svg>
  );
}

/** Năm đèn xuất phát: đỏ sáng dần theo nhịp đếm, cùng chuyển xanh lúc xuất phát. */
export function StartLights({ lit, go, big }: { lit: number; go?: boolean; big?: boolean }) {
  return (
    <span className={`tr-lights ${big ? "is-big" : ""} ${go ? "is-go" : ""}`} role="img" aria-label={go ? "Đèn xanh — xuất phát!" : `Đèn đỏ: ${lit}/5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} className={go || i < lit ? "is-on" : ""} />
      ))}
    </span>
  );
}

const ZONES = [
  [0, 50, "var(--lime)"],
  [50, 90, "var(--sun)"],
  [90, 150, "var(--coral)"],
] as const;

/** Đồng hồ tốc độ hình cung 0–150 WPM: kim chỉ tốc độ tức thời. */
export function Gauge({ v, max = 150 }: { v: number; max?: number }) {
  const at = (w: number) => {
    const a = Math.PI * (1 - Math.min(1, w / max));
    return `${(32 + 25 * Math.cos(a)).toFixed(2)} ${(32 - 25 * Math.sin(a)).toFixed(2)}`;
  };
  const turn = Math.min(1, Math.max(0, v / max)) * 180 - 90;
  return (
    <svg viewBox="0 0 64 38" className="tr-gauge" aria-hidden="true">
      {ZONES.map(([a, b, c]) => (
        <path key={a} d={`M${at(a)}A25 25 0 0 1 ${at(b)}`} stroke={c} strokeWidth="6" fill="none" />
      ))}
      <g className="tr-needle" style={{ transform: `rotate(${turn}deg)` }}>
        <path d="M32 32V11" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="32" cy="32" r="4" fill="var(--ink)" />
    </svg>
  );
}

// ——— Phông cảnh theo độ khó: đồng quê ban ngày, phố lúc chiều, phố đêm neon ———

const W = 240;

function Tile({ level }: { level: Level }) {
  if (level === "easy")
    return (
      <>
        <ellipse cx="50" cy="12" rx="16" ry="5" fill="#fff" opacity=".9" />
        <ellipse cx="62" cy="9" rx="10" ry="5" fill="#fff" opacity=".9" />
        <ellipse cx="180" cy="16" rx="13" ry="4" fill="#fff" opacity=".8" />
        <path d="M-10 46C30 18 80 18 130 46z" fill="#86cf73" />
        <path d="M90 46C140 22 200 24 250 46z" fill="#5fb257" />
        <rect x="150" y="26" width="4" height="12" fill="#7a5230" />
        <circle cx="152" cy="24" r="8" fill="#3f9a45" />
        <rect x="30" y="30" width="3" height="10" fill="#7a5230" />
        <circle cx="31.5" cy="28" r="6" fill="#4caf50" />
      </>
    );
  const night = level === "hard";
  const blocks = [
    [4, 20, 26],
    [32, 10, 22],
    [56, 26, 30],
    [88, 6, 20],
    [110, 16, 28],
    [140, 2, 24],
    [166, 22, 34],
    [202, 12, 30],
  ] as const;
  const glow = night ? ["#ff6fb5", "#5ef2ff", "#ffe066"] : ["#ffe8a3"];
  return (
    <>
      {night &&
        [
          [20, 6],
          [70, 3],
          [126, 8],
          [190, 4],
          [228, 10],
        ].map(([x, y]) => <circle key={x} cx={x} cy={y} r="1.2" fill="#fff" opacity=".8" />)}
      {blocks.map(([x, top, w], i) => (
        <g key={x}>
          <rect x={x} y={top + 6} width={w} height={46 - top} fill={night ? (i % 2 ? "#2a2358" : "#231d4d") : i % 2 ? "#8a7fb8" : "#6d6299"} />
          {Array.from({ length: Math.floor((40 - top) / 7) }, (_, r) =>
            Array.from({ length: Math.floor(w / 7) }, (_, c) =>
              (r * 7 + c * 3 + i) % 4 === 0 ? <rect key={`${r}:${c}`} x={x + 3 + c * 7} y={top + 10 + r * 7} width="3" height="3" fill={glow[(r + c + i) % glow.length]} /> : null,
            ),
          )}
        </g>
      ))}
    </>
  );
}

export function Scenery({ level, moving }: { level: Level; moving: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <div className={`tr-sky is-${level} ${moving ? "is-moving" : ""}`} aria-hidden="true">
      <span className="tr-sky-orb" />
      <svg width="100%" height="46" preserveAspectRatio="none">
        <defs>
          <pattern id={id} width={W} height="46" patternUnits="userSpaceOnUse">
            <Tile level={level} />
          </pattern>
        </defs>
        <rect className="tr-sky-roll" width="200%" height="46" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}
