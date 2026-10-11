"use client";

import { memo } from "react";
import { CELLS, GROUND, SKY, TROI, type Snap, type Step } from "@/lib/games/co-chep";

/** Màu của từng người chơi theo thứ tự trong đội hình (tối đa 5). */
export const CC_TONES = ["var(--coral)", "var(--sky)", "var(--lime)", "var(--grape)", "var(--sun)"] as const;
export const CC_TONE_NAMES = ["coral", "sky", "lime", "grape", "sun"] as const;

/** Toạ độ sân (cm, y hướng lên Trời) → toạ độ SVG (y hướng xuống). */
const TOP = 610;
const sy = (y: number) => TOP - y;
const center = (c: number) => ({ x: (CELLS[c].x0 + CELLS[c].x1) / 2, y: (CELLS[c].y0 + CELLS[c].y1) / 2 });
/** Chỗ đá nằm trên Trời. */
export const SKY_STONE = { x: 100, y: 535 };
const DIRS = { up: [0, 30], down: [0, -30], left: [-30, 0], right: [30, 0] } as const;

/** Chỗ đứng của một bước nhảy (giữa hai chân nếu là chẹp). */
export function stepAt(step: Step) {
  if (step.row === 0) return { x: 100, y: -48 };
  if (step.dir) return { x: SKY_STONE.x + DIRS[step.dir][0], y: SKY_STONE.y + DIRS[step.dir][1] };
  const pts = step.cells.map(center);
  return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
}

export type CourtPlayer = { avatar: string; color: string };

/** Người đang nhảy trên sân: đang ở bước nào, có ngã ở bước này không. */
export type Hopper = { who: number; step: Step; n: number; fall: boolean };

/** Hiệu ứng trên một ô: cháy nhà (lửa, khói) hoặc chiếm nhà. */
export type CourtFx = { cell: number; kind: "burn" | "claim"; key: string };

/**
 * Sân cò chẹp nhìn từ trên xuống: ô Đất ở dưới, Trời ở trên. Vẽ nhà (tô màu chủ nhà), đá của từng người, ô mục tiêu
 * của người đang tới lượt, người đang nhảy và hiệu ứng cháy / chiếm nhà. Đồ hoạ tối giản bằng SVG — thay được bằng ảnh sau.
 */
export const CoChepCourt = memo(function CoChepCourt({
  snap,
  players,
  target,
  targetTone,
  hopper,
  hidden,
  fx,
  mark,
}: {
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
  const sky = `M ${SKY.cx - SKY.r} ${sy(SKY.cy)} A ${SKY.r} ${SKY.r} 0 0 1 ${SKY.cx + SKY.r} ${sy(SKY.cy)} Z`;
  return (
    <svg viewBox={`-24 ${sy(SKY.cy + SKY.r) - 14} 248 ${SKY.r + 480 + 110 + 30}`} className="cc" role="img" aria-label="Sân cò chẹp">
      <defs>
        <radialGradient id="cc-sky" cx="50%" cy="100%" r="100%">
          <stop offset="0%" stopColor="var(--sky)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--sky)" stopOpacity="0.04" />
        </radialGradient>
      </defs>
      <path d={sky} fill="url(#cc-sky)" className={target === TROI ? "cc-target-sky" : undefined} style={target === TROI ? { ["--tone" as string]: targetTone } : undefined} />
      <text x={100} y={sy(SKY.cy + 74)} className="cc-label">
        ☁️ TRỜI
      </text>

      <rect x={GROUND.x0} y={sy(GROUND.y1)} width={GROUND.x1 - GROUND.x0} height={GROUND.y1 - GROUND.y0} rx={14} className="cc-ground" />
      <text x={100} y={sy(-80)} className="cc-label">
        ĐẤT
      </text>

      {CELLS.map((r, c) => {
        if (!c) return null;
        const owner = snap.owners[c];
        const p = owner ? players[owner - 1] : undefined;
        const m = center(c);
        return (
          <g key={c}>
            <rect
              x={r.x0}
              y={sy(r.y1)}
              width={r.x1 - r.x0}
              height={r.y1 - r.y0}
              className="cc-cell"
              style={owner ? { fill: `color-mix(in srgb, ${CC_TONES[owner - 1]} 30%, var(--cc-ground))` } : undefined}
            />
            <text x={owner ? r.x0 + 13 : m.x} y={owner ? sy(r.y1) + 15 : sy(m.y)} className={owner ? "cc-num is-small" : "cc-num"}>
              {c}
            </text>
            {p && (
              <g className="cc-house">
                <text x={m.x} y={sy(m.y) + 2} fontSize={40}>
                  {p.avatar}
                </text>
                <text x={r.x1 - 15} y={sy(r.y0) - 13} fontSize={18}>
                  🏠
                </text>
              </g>
            )}
          </g>
        );
      })}
      {target > 0 && target < TROI && (
        <rect
          key={`t${target}`}
          x={CELLS[target].x0 + 5}
          y={sy(CELLS[target].y1) + 5}
          width={CELLS[target].x1 - CELLS[target].x0 - 10}
          height={CELLS[target].y1 - CELLS[target].y0 - 10}
          rx={8}
          className="cc-target"
          style={{ stroke: targetTone }}
        />
      )}

      {mark && <circle cx={mark.x} cy={sy(mark.y)} r={13} className="cc-mark" />}

      {snap.stones.map((c, k) => {
        if (!c || k === hidden) return null;
        const at = c === TROI ? { x: SKY_STONE.x + (k - (snap.stones.length - 1) / 2) * 16, y: SKY_STONE.y } : { x: center(c).x + 22, y: center(c).y - 18 };
        return <circle key={k} cx={at.x} cy={sy(at.y)} r={8} className="cc-stone" style={{ fill: CC_TONES[k] }} />;
      })}

      {fx && <Fx fx={fx} />}

      {hopper && players[hopper.who] && <HopToken hopper={hopper} p={players[hopper.who]} />}
    </svg>
  );
});

function HopToken({ hopper, p }: { hopper: Hopper; p: CourtPlayer }) {
  const at = stepAt(hopper.step);
  const two = hopper.step.cells.length === 2;
  return (
    <g className="cc-hopper" style={{ transform: `translate(${at.x}px, ${sy(at.y)}px)` }}>
      <g key={hopper.n} className={hopper.fall ? "cc-fall" : "cc-jump"}>
        {/* Bóng chân: hai chấm khi chẹp, một chấm khi cò. */}
        {two ? (
          <>
            <ellipse cx={-50} cy={6} rx={9} ry={4} className="cc-foot" />
            <ellipse cx={50} cy={6} rx={9} ry={4} className="cc-foot" />
          </>
        ) : (
          <ellipse cx={0} cy={18} rx={10} ry={4} className="cc-foot" />
        )}
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
function Fx({ fx }: { fx: CourtFx }) {
  const r = CELLS[fx.cell];
  const m = center(fx.cell);
  if (fx.kind === "claim")
    return (
      <g key={fx.key} style={{ transform: `translate(${m.x}px, ${sy(m.y)}px)` }}>
        <circle r={30} className="cc-claim-ring" />
        <text fontSize={34} className="cc-claim-roof">
          🏠
        </text>
      </g>
    );
  return (
    <g key={fx.key} className="cc-burn">
      <rect x={r.x0 + 3} y={sy(r.y1) + 3} width={r.x1 - r.x0 - 6} height={r.y1 - r.y0 - 6} rx={6} className="cc-char" />
      <g style={{ transform: `translate(${m.x}px, ${sy(m.y)}px)` }}>
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
