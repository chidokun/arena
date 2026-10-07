"use client";

import { memo, useState } from "react";
import { COLS, colOf, KING, PIECES, ROWS, rowOf, sideOf, type Side, type XqState } from "@/lib/games/xiangqi";

const C = 40;
const M = 36;
const W = 2 * M + (COLS - 1) * C;
const H = 2 * M + (ROWS - 1) * C;
const R = 17.5;

export type Script = "han" | "viet";

/** Mặt quân cờ: chữ Hán (帥, 車…) hoặc tên tiếng Việt. Dùng chung cho bàn cờ, quân bị ăn, cảnh mở ván. */
export function PieceFace({ v, script, r = R }: { v: number; script: Script; r?: number }) {
  const red = v > 0;
  const p = PIECES[Math.abs(v)];
  const text = script === "han" ? (red ? p.red : p.black) : p.name;
  const size = script === "han" ? r * 1.05 : r * (text.length >= 5 ? 0.5 : text.length >= 4 ? 0.56 : 0.64);
  return (
    <>
      <circle r={r} className="xq-disc" />
      <circle r={r * 0.8} className={`xq-ring ${red ? "is-red" : "is-black"}`} />
      <text className={`xq-glyph ${red ? "is-red" : "is-black"} ${script === "han" ? "is-han" : ""}`} fontSize={size} dy="0.36em">
        {text}
      </text>
    </>
  );
}

/** Quân cờ rời (ngoài bàn): quân bị ăn, cảnh mở ván. */
export function PieceIcon({ v, script, size = 26, className = "" }: { v: number; script: Script; size?: number; className?: string }) {
  return (
    <svg viewBox="-20 -20 40 40" width={size} height={size} className={`xq-icon ${className}`} aria-hidden="true">
      <PieceFace v={v} script={script} r={18.5} />
    </svg>
  );
}

/** Điểm đánh dấu vị trí Pháo, Tốt lúc khai cuộc. */
function Marker({ c, r }: { c: number; r: number }) {
  const x = M + c * C;
  const y = M + r * C;
  const g = 3;
  const l = 7;
  const d: string[] = [];
  for (const sx of [-1, 1]) {
    if ((sx < 0 && c === 0) || (sx > 0 && c === COLS - 1)) continue;
    for (const sy of [-1, 1]) d.push(`M${x + sx * (g + l)} ${y + sy * g}H${x + sx * g}V${y + sy * (g + l)}`);
  }
  return <path d={d.join("")} fill="none" />;
}

const MARKERS: [number, number][] = [
  [1, 2],
  [7, 2],
  [1, 7],
  [7, 7],
  ...[0, 2, 4, 6, 8].flatMap((c) => [
    [c, 3] as [number, number],
    [c, 6] as [number, number],
  ]),
];

/** Lưới bàn cờ (đối xứng nên không cần lật theo bên cầm quân). */
const Grid = memo(function Grid({ script }: { script: Script }) {
  const x = (c: number) => M + c * C;
  const y = (r: number) => M + r * C;
  const lines = [];
  for (let r = 0; r < ROWS; r++) lines.push(<line key={`h${r}`} x1={x(0)} y1={y(r)} x2={x(8)} y2={y(r)} />);
  for (let c = 0; c < COLS; c++) {
    if (c === 0 || c === COLS - 1) lines.push(<line key={`v${c}`} x1={x(c)} y1={y(0)} x2={x(c)} y2={y(9)} />);
    else lines.push(<line key={`v${c}a`} x1={x(c)} y1={y(0)} x2={x(c)} y2={y(4)} />, <line key={`v${c}b`} x1={x(c)} y1={y(5)} x2={x(c)} y2={y(9)} />);
  }
  const palace = [
    [3, 0, 5, 2],
    [5, 0, 3, 2],
    [3, 7, 5, 9],
    [5, 7, 3, 9],
  ];
  const mid = (y(4) + y(5)) / 2;
  return (
    <>
      <rect x={x(0) - 8} y={y(0) - 8} width={8 * C + 16} height={9 * C + 16} rx={4} className="xq-frame" />
      <g className="xq-lines">
        {lines}
        {palace.map(([a, b, c, d], k) => (
          <line key={`p${k}`} x1={x(a)} y1={y(b)} x2={x(c)} y2={y(d)} />
        ))}
        {MARKERS.map(([c, r]) => (
          <Marker key={`${c}:${r}`} c={c} r={r} />
        ))}
      </g>
      <text className={`xq-river ${script === "han" ? "is-han" : ""}`} x={x(2)} y={mid} dy="0.35em">
        {script === "han" ? "楚 河" : "Sở Hà"}
      </text>
      <text className={`xq-river ${script === "han" ? "is-han" : ""}`} x={x(6)} y={mid} dy="0.35em">
        {script === "han" ? "漢 界" : "Hán Giới"}
      </text>
      {/* Số cột: phía trên theo bên ở trên, phía dưới theo bên ở dưới (đều đếm từ phải sang trái của người đó). */}
      {Array.from({ length: COLS }, (_, c) => (
        <g key={`n${c}`} className="xq-file">
          <text x={x(c)} y={11}>
            {c + 1}
          </text>
          <text x={x(c)} y={H - 4}>
            {COLS - c}
          </text>
        </g>
      ))}
    </>
  );
});

/**
 * Bàn cờ tướng SVG. Bấm quân mình để chọn (hiện các nước đi được), bấm điểm đích để đi. Quân trượt tới chỗ mới nhờ giữ
 * khoá theo mã quân. Bên Đen thì bàn lật lại để quân mình luôn ở dưới.
 */
export function XiangqiBoard({
  state,
  canPlay,
  mySide,
  flip,
  script,
  onMove,
}: {
  state: XqState;
  canPlay: boolean;
  mySide: 0 | Side;
  flip: boolean;
  script: Script;
  onMove: (from: number, to: number) => void;
}) {
  const [picked, setPicked] = useState<{ at: number; count: number } | null>(null);
  // Lựa chọn chỉ còn hiệu lực trong nước hiện tại.
  const sel = canPlay && picked && picked.count === state.count && sideOf(state.board[picked.at]) === mySide ? picked.at : -1;
  const targets = sel >= 0 ? state.legal.filter(([f]) => f === sel).map(([, t]) => t) : [];
  const movable = new Set(canPlay ? state.legal.map(([f]) => f) : []);

  const px = (i: number) => M + (flip ? COLS - 1 - colOf(i) : colOf(i)) * C;
  const py = (i: number) => M + (flip ? ROWS - 1 - rowOf(i) : rowOf(i)) * C;
  const king = state.board.indexOf(state.turn === 1 ? KING : -KING);
  const danger = (state.check || state.winner) && king >= 0 ? king : -1;
  const [lastFrom, lastTo] = state.last ?? [-1, -1];

  const choose = (i: number) => {
    if (!canPlay) return;
    if (sel >= 0 && targets.includes(i)) {
      setPicked(null);
      onMove(sel, i);
    } else if (sideOf(state.board[i]) === mySide && i !== sel) setPicked({ at: i, count: state.count });
    else setPicked(null);
  };
  const keyed = (i: number) => (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    choose(i);
  };

  const pieces = [];
  for (let i = 0; i < state.board.length; i++) {
    const v = state.board[i];
    if (!v) continue;
    const mine = canPlay && movable.has(i);
    const side = v > 0 ? "Đỏ" : "Đen";
    const target = targets.includes(i);
    pieces.push(
      <g
        key={state.ids[i]}
        className={`xq-piece ${i === sel ? "is-sel" : ""} ${mine || target ? "is-live" : ""}`}
        style={{ transform: `translate(${px(i)}px, ${py(i)}px)` }}
        onClick={mine || target ? () => choose(i) : undefined}
        onKeyDown={mine || target ? keyed(i) : undefined}
        tabIndex={mine || target ? 0 : undefined}
        role={mine || target ? "button" : undefined}
        aria-label={`${PIECES[Math.abs(v)].name} ${side}${target ? " — ăn quân này" : ""}`}
      >
        <g className="xq-lift">
          <PieceFace v={v} script={script} />
        </g>
      </g>,
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`xq ${canPlay ? "can-play" : ""}`} role="group" aria-label={`Bàn cờ tướng${canPlay ? " — đến lượt bạn" : ""}`}>
      <rect width={W} height={H} rx={12} className="xq-bg" onClick={() => setPicked(null)} />
      <Grid script={script} />
      {lastFrom >= 0 && (
        <>
          <circle cx={px(lastFrom)} cy={py(lastFrom)} r={7} className="xq-from" />
          <circle cx={px(lastTo)} cy={py(lastTo)} r={R + 3.5} className="xq-last" />
        </>
      )}
      {danger >= 0 && <circle cx={px(danger)} cy={py(danger)} r={R + 4} className="xq-danger" />}
      {pieces}
      {targets.map((t) =>
        state.board[t] ? (
          <circle key={t} cx={px(t)} cy={py(t)} r={R + 3} className="xq-hit is-take" pointerEvents="none" />
        ) : (
          <g key={t} onClick={() => choose(t)} onKeyDown={keyed(t)} tabIndex={0} role="button" aria-label="Đi tới đây" className="xq-target">
            <circle cx={px(t)} cy={py(t)} r={C / 2} fill="transparent" />
            <circle cx={px(t)} cy={py(t)} r={6} className="xq-dot" />
          </g>
        ),
      )}
    </svg>
  );
}
