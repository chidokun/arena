"use client";

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";

// Đạp mìn ở Dò Mìn và Dò Mìn Chiến Thuật, cùng kiểu trúng tàu ở Bắn Tàu: chớp sáng, sóng nổ, tia lửa, đất đá văng, khói
// bốc lên và cả bàn rung. Lớp nổ phủ ngoài khung cuộn của bàn để khói ở hàng trên cùng / ô sát mép không bị cắt; vị trí
// ô đo từ DOM lúc nổ nên dùng được cho cả hai lưới.

const BLAST_MS = 2400;
// Ô quá nhỏ (bàn khổng lồ) thì vụ nổ vẫn giữ một cỡ tối thiểu cho dễ thấy.
const MIN_UNIT = 32;
// Khung vẽ rộng bằng ngần này ô.
const SPAN = 5.5;

type Blast = { key: string; x: number; y: number; u: number; big: boolean };

// Ngẫu nhiên theo chỉ số (không dùng Math.random) để hiệu ứng giống nhau ở mọi lần vẽ.
const rnd = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const vars = (v: Record<string, string>) => v as React.CSSProperties;

const SMOKE = "color-mix(in srgb, var(--ink-2) 70%, var(--surface))";
const DIRT = ["#7a5a3a", "#a0785a", "var(--ink-2)", "#5b4632"];

const BURST = Array.from({ length: 16 }, (_, i) => {
  const a = (Math.PI * i) / 8 - Math.PI / 2;
  const r = i % 2 ? 6.5 : 14;
  return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
}).join(" ");

const SPARKS = Array.from({ length: 12 }, (_, i) => ({ a: i * 30 + (rnd(i) - 0.5) * 20, d: 30 + rnd(i + 30) * 22 }));
const PUFFS = [
  { x: -12, r: 10, t: 80 },
  { x: 10, r: 11, t: 180 },
  { x: -4, r: 13, t: 320 },
  { x: 14, r: 9, t: 460 },
  { x: -10, r: 8, t: 600 },
  { x: 4, r: 10, t: 760 },
];
const BITS = Array.from({ length: 12 }, (_, i) => {
  const a = -Math.PI / 2 + (rnd(i + 3) - 0.5) * 2.6;
  const v = 34 + rnd(i + 57) * 40;
  return {
    dx: (Math.cos(a) * v).toFixed(1),
    dy: (Math.sin(a) * v).toFixed(1),
    r: Math.round((rnd(i + 91) - 0.5) * 900),
    s: 4 + rnd(i + 7) * 4,
    fill: DIRT[i % DIRT.length],
    t: Math.round(rnd(i + 21) * 80),
  };
});

// `booms`: các ô mìn đã nổ hiện có trên bàn. Ô mới xuất hiện so với lần trước thì nổ; lần đầu gắn (vào phòng / tải lại
// giữa ván) không nổ lại các ô cũ. `grid`: phần tử có các ô là con trực tiếp; `quake`: phần tử rung theo vụ nổ (nên chứa
// luôn lớp nổ để khói rung cùng bàn); `big`: vụ nổ lớn (rung mạnh, cả bàn loé sáng).
export function MineBlasts({
  booms,
  grid,
  quake,
  big,
}: {
  booms: readonly number[];
  grid: RefObject<HTMLElement | null>;
  quake: RefObject<HTMLElement | null>;
  big?: (c: number) => boolean;
}) {
  const [blasts, setBlasts] = useState<Blast[]>([]);
  const layer = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<number> | null>(null);
  const onBooms = useEffectEvent((fresh: number[]) => {
    const box = layer.current?.getBoundingClientRect();
    const cells = grid.current?.children;
    if (!box || !cells) return;
    const at = Date.now();
    const made = fresh.flatMap((c): Blast[] => {
      const r = cells[c]?.getBoundingClientRect();
      if (!r) return [];
      return [{ key: `${c}:${at}`, x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top, u: Math.max(MIN_UNIT, r.width), big: !!big?.(c) }];
    });
    if (!made.length) return;
    jolt(quake.current, made.some((b) => b.big));
    setBlasts((b) => [...b.slice(-6), ...made]);
    setTimeout(() => setBlasts((b) => b.filter((x) => !made.includes(x))), BLAST_MS);
  });
  const sig = booms.join(",");
  useEffect(() => {
    const now = sig ? sig.split(",").map(Number) : [];
    const prev = seen.current;
    seen.current = new Set(now);
    if (!prev) return;
    const fresh = now.filter((c) => !prev.has(c));
    if (fresh.length) onBooms(fresh);
  }, [sig]);

  return (
    <div ref={layer} className="mb-layer" aria-hidden="true">
      {blasts.map(({ key, ...b }) => (
        <Blast key={key} {...b} />
      ))}
    </div>
  );
}

function jolt(el: HTMLElement | null, big: boolean) {
  if (!el) return;
  el.classList.remove("mb-quake", "mb-quake-lg");
  void el.getBoundingClientRect();
  el.classList.add(big ? "mb-quake-lg" : "mb-quake");
}

// Khung vẽ 160 đơn vị (cùng thước với hải đồ Bắn Tàu để dùng lại keyframes) trải rộng SPAN ô — vụ nổ lan ra hai ô
// quanh tâm; tâm nổ ở (0, 0), phía trên chừa nhiều chỗ cho khói.
function Blast({ x, y, u, big }: Omit<Blast, "key">) {
  return (
    <>
      {big && <span className="mb-glare" style={vars({ "--x": `${x}px`, "--y": `${y}px` })} />}
      <svg className="mb-blast" viewBox="-80 -110 160 160" style={{ left: x, top: y, width: u * SPAN, height: u * SPAN }}>
        <circle className="mb-flash" r={26} fill="var(--sun)" />
        <circle className="mb-ring" r={14} fill="none" stroke="var(--coral)" strokeWidth={3.5} />
        {big && <circle className="mb-ring is-late" r={14} fill="none" stroke="var(--sun)" strokeWidth={2.5} />}
        <g className="mb-core">
          <circle r={18} fill="var(--sun)" opacity={0.85} />
          <polygon points={BURST} transform="scale(1.4)" fill="var(--coral)" stroke="var(--edge)" strokeWidth={1.2} strokeLinejoin="round" />
        </g>
        {SPARKS.map((p, i) => (
          <line
            key={i}
            className="mb-spark"
            style={vars({ "--a": `${p.a.toFixed(1)}deg`, "--d": `${p.d.toFixed(1)}px` })}
            x2={10}
            stroke={i % 2 ? "var(--sun)" : "var(--coral)"}
            strokeWidth={4}
            strokeLinecap="round"
          />
        ))}
        {BITS.map((p, i) => (
          <rect
            key={i}
            className="mb-bit"
            style={vars({ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--r": `${p.r}deg`, animationDelay: `${p.t}ms` })}
            x={-p.s / 2}
            y={-p.s / 2}
            width={p.s}
            height={p.s}
            rx={1}
            fill={p.fill}
          />
        ))}
        {PUFFS.map((p, i) => (
          <circle key={i} className="mb-puff" style={vars({ "--dx": `${p.x}px`, animationDelay: `${p.t}ms` })} cy={-4} r={p.r} fill={SMOKE} />
        ))}
      </svg>
    </>
  );
}
