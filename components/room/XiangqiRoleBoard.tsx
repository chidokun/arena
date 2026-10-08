"use client";

import { useState } from "react";
import { ADVISOR, CANNON, COLS, ELEPHANT, HORSE, KING, PAWN, ROOK, ROWS } from "@/lib/games/xiangqi";
import { pieceTitle, type PieceKind, type PieceState, type Side } from "@/lib/games/xiangqi-role";
import { PieceFace, XiangqiGrid, type Script } from "./XiangqiBoard";

const C = 40;
const M = 36;
const W = 2 * M + (COLS - 1) * C;
const H = 2 * M + (ROWS - 1) * C;
const R = 17.5;

const KIND_CODE: Record<PieceKind, number> = {
  general: KING,
  advisor: ADVISOR,
  elephant: ELEPHANT,
  horse: HORSE,
  chariot: ROOK,
  cannon: CANNON,
  soldier: PAWN,
};

function classicRow(rank: number) {
  return ROWS - 1 - rank;
}

function pieceValue(p: PieceState) {
  const code = KIND_CODE[p.kind];
  return p.side === "red" ? code : -code;
}

function roleSq(i: number) {
  return { file: i % 9, rank: (i / 9) | 0 };
}

/**
 * Bàn cờ tướng nhập vai — cùng SVG/CSS với Cờ Tướng 1v1.
 * Tới lượt: bấm quân thuộc role mình → hiện nước đi → bấm đích.
 */
export function XiangqiRoleBoard({
  pieces,
  myPieceIds,
  mySide,
  currentSide,
  legalByPiece,
  lastMove,
  check,
  onMove,
  canPlay,
  script = "han",
}: {
  pieces: PieceState[];
  myPieceIds: number[];
  mySide: Side | null;
  currentSide: Side;
  legalByPiece: Record<number, number[]>;
  lastMove?: { from: number; to: number };
  check: boolean;
  onMove: (pieceId: number, to: number) => void;
  canPlay: boolean;
  script?: Script;
}) {
  const flip = mySide === "black";
  const alive = pieces.filter((p) => p.alive);
  const bySq = new Map(alive.map((p) => [`${p.file},${p.rank}`, p]));
  const movable = new Set(canPlay ? Object.keys(legalByPiece).map(Number) : []);
  const mySet = new Set(myPieceIds);

  const [picked, setPicked] = useState<number | null>(null);
  const sel = canPlay && picked != null && movable.has(picked) ? picked : null;
  const targets = sel != null ? (legalByPiece[sel] ?? []) : [];

  const px = (file: number, rank: number) => M + (flip ? COLS - 1 - file : file) * C;
  const py = (_file: number, rank: number) => {
    const row = classicRow(rank);
    return M + (flip ? ROWS - 1 - row : row) * C;
  };

  const lastFrom = lastMove ? roleSq(lastMove.from) : null;
  const lastTo = lastMove ? roleSq(lastMove.to) : null;
  const danger = check ? alive.find((p) => p.kind === "general" && p.side === currentSide) : undefined;

  const chooseSquare = (file: number, rank: number) => {
    if (!canPlay) return;
    const to = rank * 9 + file;
    const hit = bySq.get(`${file},${rank}`);
    if (sel != null && targets.includes(to)) {
      setPicked(null);
      onMove(sel, to);
      return;
    }
    if (hit && movable.has(hit.id)) {
      setPicked(hit.id === sel ? null : hit.id);
      return;
    }
    setPicked(null);
  };

  const keyed = (file: number, rank: number) => (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    chooseSquare(file, rank);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`xq ${canPlay ? "can-play" : ""}`} role="group" aria-label={`Bàn cờ tướng nhập vai${canPlay ? " — đến lượt bạn" : ""}`}>
      <rect width={W} height={H} rx={12} className="xq-bg" onClick={() => setPicked(null)} />
      <XiangqiGrid script={script} />
      {lastFrom && <circle cx={px(lastFrom.file, lastFrom.rank)} cy={py(lastFrom.file, lastFrom.rank)} r={7} className="xq-from" />}
      {lastTo && <circle cx={px(lastTo.file, lastTo.rank)} cy={py(lastTo.file, lastTo.rank)} r={R + 3.5} className="xq-last" />}
      {danger && <circle cx={px(danger.file, danger.rank)} cy={py(danger.file, danger.rank)} r={R + 4} className="xq-danger" />}
      {alive.map((p) => {
        const mine = movable.has(p.id);
        const owned = mySet.has(p.id);
        const target = targets.includes(p.rank * 9 + p.file);
        const selected = sel === p.id;
        return (
          <g
            key={p.id}
            className={`xq-piece ${selected ? "is-sel" : ""} ${mine || target ? "is-live" : ""}`}
            style={{ transform: `translate(${px(p.file, p.rank)}px, ${py(p.file, p.rank)}px)` }}
            onClick={mine || target ? () => chooseSquare(p.file, p.rank) : undefined}
            onKeyDown={mine || target ? keyed(p.file, p.rank) : undefined}
            tabIndex={mine || target ? 0 : undefined}
            role={mine || target ? "button" : undefined}
            aria-label={`${pieceTitle(p)}${target ? " — ăn quân này" : mine ? " — chọn quân này" : ""}`}
          >
            {/* Controllable pieces: green ring when not selected */}
            {owned && !selected && <circle r={R + 3.5} className="xq-mine" />}
            <g className="xq-lift">
              <PieceFace v={pieceValue(p)} script={script} />
            </g>
          </g>
        );
      })}
      {targets.map((to) => {
        const file = to % 9;
        const rank = (to / 9) | 0;
        if (bySq.has(`${file},${rank}`)) {
          return <circle key={to} cx={px(file, rank)} cy={py(file, rank)} r={R + 3} className="xq-hit is-take" pointerEvents="none" />;
        }
        return (
          <g key={to} onClick={() => chooseSquare(file, rank)} onKeyDown={keyed(file, rank)} tabIndex={0} role="button" aria-label="Đi tới đây" className="xq-target">
            <circle cx={px(file, rank)} cy={py(file, rank)} r={C / 2} fill="transparent" />
            <circle cx={px(file, rank)} cy={py(file, rank)} r={6} className="xq-dot" />
          </g>
        );
      })}
    </svg>
  );
}
