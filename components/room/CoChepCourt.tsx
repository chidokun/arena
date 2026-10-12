"use client";

import { memo } from "react";
import { CELLS, GROUND, SKY, TROI, type Rect, type Snap, type Step } from "@/lib/games/co-chep";

/** Màu của từng người chơi theo thứ tự trong đội hình (tối đa 5). */
export const CC_TONES = ["var(--coral)", "var(--sky)", "var(--lime)", "var(--grape)", "var(--sun)"] as const;
export const CC_TONE_NAMES = ["coral", "sky", "lime", "grape", "sun"] as const;

const center = (c: number) => ({ x: (CELLS[c].x0 + CELLS[c].x1) / 2, y: (CELLS[c].y0 + CELLS[c].y1) / 2 });
/** Chỗ đá nằm trên Trời. */
export const SKY_STONE = { x: 100, y: 535 };
const DIRS = { up: [0, 30], down: [0, -30], left: [-30, 0], right: [30, 0] } as const;

/** Chỗ đứng của một bước nhảy (toạ độ sân, giữa hai chân nếu là chẹp). */
function stepAt(step: Step) {
  if (step.row === 0) return { x: 100, y: -48 };
  if (step.dir) return { x: SKY_STONE.x + DIRS[step.dir][0], y: SKY_STONE.y + DIRS[step.dir][1] };
  const pts = step.cells.map(center);
  return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
}

/**
 * Hướng vẽ sân. `tall`: Đất ở dưới, Trời ở trên (điện thoại). `wide`: Đất bên trái, Trời bên phải (máy tính) — xoay
 * sân 90° ngược chiều kim đồng hồ: hướng nhảy (+y) chỉ sang phải, ô bên trái của hàng chẹp (4, 7) nằm trên.
 * Chỉ đổi toạ độ; chữ, hình đại diện, lửa khói vẫn đứng thẳng.
 */
export type Orient = "tall" | "wide";

/** Toạ độ sân (cm, y hướng lên Trời) → toạ độ SVG theo hướng vẽ. */
function geometry(o: Orient) {
  const tall = o === "tall";
  const TOP = 610;
  const LEFT = 124;
  const pt = (x: number, y: number) => (tall ? { x, y: TOP - y } : { x: y + LEFT, y: x });
  const box = (r: Rect, pad = 0) =>
    tall
      ? { x: r.x0 + pad, y: TOP - r.y1 + pad, width: r.x1 - r.x0 - 2 * pad, height: r.y1 - r.y0 - 2 * pad }
      : { x: r.y0 + LEFT + pad, y: r.x0 + pad, width: r.y1 - r.y0 - 2 * pad, height: r.x1 - r.x0 - 2 * pad };
  const c = pt(SKY.cx, SKY.cy);
  const R = SKY.r;
  // Nửa tròn Trời phồng về phía xa Đất.
  const sky = tall ? `M ${c.x - R} ${c.y} A ${R} ${R} 0 0 1 ${c.x + R} ${c.y} Z` : `M ${c.x} ${c.y - R} A ${R} ${R} 0 0 1 ${c.x} ${c.y + R} Z`;
  const viewBox = tall ? `-24 ${TOP - (SKY.cy + R) - 14} 248 ${R + 480 + 110 + 30}` : `${LEFT - 110 - 14} -24 ${R + 480 + 110 + 30} 248`;
  return { tall, pt, box, sky, viewBox };
}

const GEO = { tall: geometry("tall"), wide: geometry("wide") };
type Geo = (typeof GEO)[Orient];

export type CourtPlayer = { avatar: string; color: string };

/** Người đang nhảy trên sân: đang ở bước nào, có ngã ở bước này không. */
export type Hopper = { who: number; step: Step; n: number; fall: boolean };

/** Hiệu ứng trên một ô: cháy nhà (lửa, khói) hoặc chiếm nhà. */
export type CourtFx = { cell: number; kind: "burn" | "claim"; key: string };

/**
 * Sân cò chẹp nhìn từ trên xuống. Vẽ nhà (tô màu chủ nhà), đá của từng người, ô mục tiêu của người đang tới lượt,
 * người đang nhảy và hiệu ứng cháy / chiếm nhà. Đồ hoạ tối giản bằng SVG — thay được bằng ảnh sau.
 */
export const CoChepCourt = memo(function CoChepCourt({
  orient,
  snap,
  players,
  target,
  targetTone,
  hopper,
  hidden,
  fx,
  mark,
}: {
  orient: Orient;
  snap: Snap;
  players: CourtPlayer[];
  /** Ô mục tiêu (1..8, 9 = Trời) của người đang tới lượt; 0 là không tô. */
  target: number;
  targetTone?: string;
  hopper?: Hopper | null;
  /** Đá của người này đã được nhặt lên (đang nhảy về). */
  hidden?: number;
  fx?: CourtFx | null;
  /** Chỗ viên đá vừa rơi (cú chọi gần nhất). */
  mark?: { x: number; y: number } | null;
}) {
  const g = GEO[orient];
  // Nhãn Trời / Đất nằm giữa vùng của nó. Sân ngang hẹp chiều dọc nhãn → xếp biểu tượng trên, chữ dưới.
  const skyLabel = g.pt(100, g.tall ? SKY.cy + 74 : SKY.cy + SKY.r * 0.45);
  const groundLabel = g.pt(100, g.tall ? -76 : (GROUND.y0 + GROUND.y1) / 2);
  const markAt = mark ? g.pt(mark.x, mark.y) : null;
  return (
    <svg viewBox={g.viewBox} className={`cc is-${orient}`} role="img" aria-label="Sân cò chẹp">
      <defs>
        <radialGradient id={`cc-sky-${orient}`} cx={g.tall ? "50%" : "0%"} cy={g.tall ? "100%" : "50%"} r="100%">
          <stop offset="0%" stopColor="var(--sky)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--sky)" stopOpacity="0.04" />
        </radialGradient>
      </defs>
      <path d={g.sky} fill={`url(#cc-sky-${orient})`} className={target === TROI ? "cc-target-sky" : undefined} />
      <Label at={skyLabel} icon="☁️" text="TRỜI" stacked={!g.tall} />

      <rect {...g.box(GROUND)} rx={14} className="cc-ground" />
      <Label at={groundLabel} icon="🌱" text="ĐẤT" stacked={!g.tall} />

      {CELLS.map((r, c) => {
        if (!c) return null;
        const owner = snap.owners[c];
        const p = owner ? players[owner - 1] : undefined;
        const b = g.box(r);
        const m = g.pt(center(c).x, center(c).y);
        return (
          <g key={c}>
            <rect {...b} className="cc-cell" style={owner ? { fill: `color-mix(in srgb, ${CC_TONES[owner - 1]} 30%, var(--cc-ground))` } : undefined} />
            <text x={owner ? b.x + 13 : m.x} y={owner ? b.y + 15 : m.y} className={owner ? "cc-num is-small" : "cc-num"}>
              {c}
            </text>
            {p && (
              <g className="cc-house">
                <text x={m.x} y={m.y + 2} fontSize={40}>
                  {p.avatar}
                </text>
                <text x={b.x + b.width - 15} y={b.y + b.height - 13} fontSize={18}>
                  🏠
                </text>
              </g>
            )}
          </g>
        );
      })}
      {target > 0 && target < TROI && <rect key={`t${target}`} {...g.box(CELLS[target], 5)} rx={8} className="cc-target" style={{ stroke: targetTone }} />}

      {markAt && <circle cx={markAt.x} cy={markAt.y} r={13} className="cc-mark" />}

      {snap.stones.map((c, k) => {
        if (!c || k === hidden) return null;
        // Đá trong ô nằm ở góc ô cho khỏi che số; đá trên Trời xếp cạnh nhau.
        const at =
          c === TROI ? g.pt(SKY_STONE.x + (k - (snap.stones.length - 1) / 2) * 16, SKY_STONE.y) : { x: g.pt(center(c).x, center(c).y).x + 22, y: g.pt(center(c).x, center(c).y).y + 18 };
        return <circle key={k} cx={at.x} cy={at.y} r={8} className="cc-stone" style={{ fill: CC_TONES[k] }} />;
      })}

      {fx && <Fx fx={fx} g={g} />}

      {hopper && players[hopper.who] && <HopToken hopper={hopper} p={players[hopper.who]} g={g} />}
    </svg>
  );
});

/** Nhãn vùng (Trời, Đất): biểu tượng và chữ cùng hàng, hoặc xếp chồng (biểu tượng trên, chữ dưới). */
function Label({ at, icon, text, stacked }: { at: { x: number; y: number }; icon: string; text: string; stacked: boolean }) {
  if (!stacked)
    return (
      <text x={at.x} y={at.y} className="cc-label">
        {icon} {text}
      </text>
    );
  return (
    <g className="cc-label">
      <text x={at.x} y={at.y - 12} fontSize={22}>
        {icon}
      </text>
      <text x={at.x} y={at.y + 14}>
        {text}
      </text>
    </g>
  );
}

function HopToken({ hopper, p, g }: { hopper: Hopper; p: CourtPlayer; g: Geo }) {
  const w = stepAt(hopper.step);
  const at = g.pt(w.x, w.y);
  const two = hopper.step.cells.length === 2;
  // Hai chân của bước chẹp nằm ở hai ô đôi: ngang nhau khi sân dọc, trên–dưới khi sân ngang.
  const feet = g.tall
    ? [
        [-50, 6],
        [50, 6],
      ]
    : [
        [6, -50],
        [6, 50],
      ];
  return (
    <g className="cc-hopper" style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
      <g key={hopper.n} className={hopper.fall ? "cc-fall" : "cc-jump"}>
        {/* Bóng chân: hai chấm khi chẹp, một chấm khi cò. */}
        {two ? feet.map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx={9} ry={4} className="cc-foot" />) : <ellipse cx={0} cy={18} rx={10} ry={4} className="cc-foot" />}
        <circle r={17} style={{ fill: p.color }} className="cc-token" />
        <text fontSize={20} y={1}>
          {p.avatar}
        </text>
      </g>
      {hopper.step.pick && !hopper.fall && (
        <text y={-28} fontSize={13} className="cc-tag">
          nhặt đá
        </text>
      )}
      {hopper.fall && (
        <text y={-28} fontSize={15} className="cc-tag is-bad">
          Ngã rồi!
        </text>
      )}
    </g>
  );
}

const SMOKE = [0, 1, 2, 3, 4, 5, 6, 7];
const FLAMES = [
  [-22, 12, 0],
  [0, 6, 120],
  [22, 14, 240],
  [-10, 22, 360],
  [12, 24, 80],
];

/** Cháy nhà: ô sạm lại, lửa bập bùng và khói bốc lên. Chiếm nhà: vòng sáng toả ra. */
function Fx({ fx, g }: { fx: CourtFx; g: Geo }) {
  const w = center(fx.cell);
  const m = g.pt(w.x, w.y);
  if (fx.kind === "claim")
    return (
      <g key={fx.key} style={{ transform: `translate(${m.x}px, ${m.y}px)` }}>
        <circle r={30} className="cc-claim-ring" />
        <text fontSize={34} className="cc-claim-roof">
          🏠
        </text>
      </g>
    );
  return (
    <g key={fx.key} className="cc-burn">
      <rect {...g.box(CELLS[fx.cell], 3)} rx={6} className="cc-char" />
      <g style={{ transform: `translate(${m.x}px, ${m.y}px)` }}>
        {SMOKE.map((i) => (
          <circle key={i} cx={(i % 3) * 16 - 16} cy={-10} r={14 + (i % 3) * 4} className="cc-smoke" style={{ animationDelay: `${i * 180}ms` }} />
        ))}
        {FLAMES.map(([x, y, d], i) => (
          <text key={i} x={x} y={y} fontSize={26} className="cc-flame" style={{ animationDelay: `${d}ms` }}>
            🔥
          </text>
        ))}
      </g>
    </g>
  );
}
