"use client";

import { useEffect, useState } from "react";

// Đồng hồ lượt dùng chung cho các bàn đấu tay đôi có bấm giờ mỗi lượt.

/** Còn chừng này giây thì đồng hồ chuyển đỏ và nhấp nháy. */
const HURRY_S = 5;

/** Cao của `TimeBar` kể cả lề dưới (8px + `mb-3`): lúc trình chiếu bàn vuông phải chừa chỗ này để không tràn khung. */
export const TIME_BAR_H = 20;
/** `fit` / `center` cho `StageArea` của bàn vuông có thể kèm `TimeBar` phía trên. */
export const SQUARE_FIT = "w-[min(100cqw,var(--stage-center))]";
export const squareCenter = (timed: boolean) => (timed ? `100cqh - ${TIME_BAR_H}px` : "100cqh");

export const shortTurn = (t: number) => (!t ? "∞" : t < 60 ? `${t}s` : `${t / 60}p`);

/** Mili-giây còn lại tới `deadline` (0 là không giới hạn), cập nhật vài lần mỗi giây. */
export function useTimeLeft(deadline: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 200);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [deadline]);
  return deadline ? Math.max(0, deadline - now) : 0;
}

export function TimeBar({ left, total, tone }: { left: number; total: number; tone: string }) {
  const hurry = left <= HURRY_S * 1000;
  return (
    <div className="tx-timer mb-3" aria-hidden="true">
      <span style={{ width: `${Math.min(100, (left / total) * 100)}%`, background: hurry ? "var(--coral)" : tone }} />
    </div>
  );
}

export function TurnClock({ left }: { left: number }) {
  const s = Math.ceil(left / 1000);
  const hurry = s <= HURRY_S;
  return (
    <span
      className={`inline-flex min-w-[4.5rem] items-center justify-center gap-1 rounded-full border-2 border-[#050312] px-3 py-1 text-[15px] font-extrabold tabular-nums ${hurry ? "db-hurry" : ""}`}
      style={{ background: hurry ? "var(--coral)" : "var(--surface)", color: hurry ? "#fff" : undefined }}
      aria-hidden="true"
    >
      ⏱ {s}s
    </span>
  );
}
