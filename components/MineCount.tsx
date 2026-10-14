"use client";

import { density, maxMines, minMines, SIZES, type SizeKey } from "@/lib/games/minesweeper";

/**
 * Chọn số mìn của bàn dò mìn cổ điển: thanh kéo trong khoảng cho phép của cỡ bàn, nút −/+ chỉnh từng quả, nút về mức
 * cổ điển. `onChange` vắng thì chỉ hiện (người không phải chủ phòng).
 */
export function MineCount({ size, mines, onChange }: { size: SizeKey; mines: number; onChange?: (n: number) => void }) {
  const lo = minMines(size);
  const hi = maxMines(size);
  const classic = SIZES[size].mines;
  const set = (n: number) => onChange?.(Math.min(hi, Math.max(lo, n)));
  const off = !onChange;
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-sm !w-9 !px-0" onClick={() => set(mines - 1)} disabled={off || mines <= lo} aria-label="Bớt một quả mìn">
          −
        </button>
        <input
          type="range"
          className="min-w-0 flex-1 accent-[var(--coral)]"
          min={lo}
          max={hi}
          value={mines}
          disabled={off}
          onChange={(e) => set(Number(e.target.value))}
          aria-label="Số mìn"
          aria-valuetext={`${mines} mìn`}
        />
        <button type="button" className="btn btn-sm !w-9 !px-0" onClick={() => set(mines + 1)} disabled={off || mines >= hi} aria-label="Thêm một quả mìn">
          +
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-display text-lg font-extrabold tabular-nums">💣 {mines}</span>
        <span className="font-semibold text-ink-3">
          mìn · {density(size, mines)}% số ô · từ {lo} tới {hi}
        </span>
        {!off && mines !== classic && (
          <button type="button" className="btn btn-sm ml-auto" onClick={() => set(classic)}>
            Cổ điển ({classic})
          </button>
        )}
      </div>
    </div>
  );
}
