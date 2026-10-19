"use client";

import { memo } from "react";
import { PER_ROW, rowHits, SHEET_COLORS, sheetName, type Sheet } from "@/lib/games/loto";

export const sheetStyle = (id: number) => {
  const c = SHEET_COLORS[id >> 1];
  return { "--sheet": c.hex, "--sheet-ink": c.ink } as React.CSSProperties;
};

export const LotoSheet = memo(function LotoSheet({
  sheet,
  drawn,
  last,
  wins = [],
  live,
  pending,
}: {
  sheet: Sheet;
  drawn?: readonly boolean[];
  last?: number;
  wins?: readonly number[];
  live?: boolean;
  pending?: boolean;
}) {
  const color = SHEET_COLORS[sheet.color];
  return (
    <figure className={`loto-sheet ${pending ? "is-pending" : ""}`} style={sheetStyle(sheet.id)}>
      <figcaption className="loto-sheet-head">
        <span>
          🧧 Tờ {color.name} {sheet.no}
        </span>
        {pending && <span className="text-xs font-bold">đang chờ chủ phòng…</span>}
      </figcaption>
      <div className="loto-grid" role="table" aria-label={`Tờ ${sheetName(sheet.id)}`}>
        {sheet.rows.map((row, r) => {
          const hits = drawn ? rowHits(row, drawn) : 0;
          const tone = wins.includes(r) ? "is-win" : live && hits === PER_ROW - 1 ? "is-wait" : "";
          return (
            <div key={r} role="row" className={`loto-row ${tone}`}>
              {row.map((n, c) => {
                if (!n) return <span key={c} role="cell" className="loto-cell is-blank" />;
                const hit = !!drawn?.[n];
                const cls = `loto-cell${hit ? " is-hit" : ""}${hit && n === last ? " is-last" : ""}${tone === "is-wait" && !hit ? " is-need" : ""}`;
                return (
                  <span key={c} role="cell" className={cls} aria-label={hit ? `${n}, đã kêu` : undefined}>
                    {n}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </figure>
  );
});

export function SheetDots({ ids, size = 12 }: { ids: readonly number[]; size?: number }) {
  if (!ids.length) return null;
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {ids.map((id) => (
        <span key={id} className="inline-block flex-none rounded-full border-2 border-edge" style={{ width: size, height: size, background: SHEET_COLORS[id >> 1].hex }} title={`Tờ ${sheetName(id)}`} />
      ))}
      <span className="sr-only">Tờ {ids.map(sheetName).join(", ")}</span>
    </span>
  );
}
