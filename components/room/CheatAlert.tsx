"use client";

import { useEffect, useState } from "react";
import type { CheatAlert as Alert, RoomSession } from "@/lib/net/room";
import { Dialog } from "../Dialog";

type Cheat = Extract<Alert, { kind: "cheat" }>;

/** Người khác gian lận thì thông báo tự tắt sau chừng này; mình bị bắt thì phải bấm đóng. */
const OTHER_MS = 8000;
const WARN_MS = 9000;

/**
 * Chống gian lận: bật hộp thoại khi có người chơi bị bắt mở công cụ nhà phát triển giữa ván (mọi người trong phòng đều
 * thấy), và nhắc mình đóng DevTools nếu đang mở lúc ngồi ghế chờ ván.
 */
export function CheatAlert({ session }: { session: RoomSession }) {
  const [cheat, setCheat] = useState<Cheat | null>(null);
  const [warn, setWarn] = useState(0);

  useEffect(
    () =>
      session.onCheat((a) => {
        if (a.kind === "warn") setWarn(Date.now());
        // Mình bị bắt thì giữ thông báo của mình, không để thông báo người khác đè lên.
        else setCheat((cur) => (cur?.mine && !a.mine ? cur : a));
      }),
    [session],
  );

  useEffect(() => {
    if (!cheat || cheat.mine) return;
    const t = setTimeout(() => setCheat((cur) => (cur === cheat ? null : cur)), OTHER_MS);
    return () => clearTimeout(t);
  }, [cheat]);

  useEffect(() => {
    if (!warn) return;
    const t = setTimeout(() => setWarn(0), WARN_MS);
    return () => clearTimeout(t);
  }, [warn]);

  return (
    <>
      <Dialog open={!!cheat} onClose={() => setCheat(null)} title="Phát hiện gian lận!">
        {cheat && (
          <div className="text-center" role="alert">
            <div className="cheat-siren text-6xl" aria-hidden="true">
              🚨
            </div>
            <p className="mt-4 font-display text-lg font-extrabold text-coral">{cheat.mine ? "Bạn đã bị xử thua!" : `${cheat.name} vừa gian lận!`}</p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
              {cheat.mine
                ? `Hệ thống phát hiện bạn mở công cụ nhà phát triển (DevTools) trong lúc chơi — ván ${cheat.round} tính là thua, mọi người trong phòng đều đã được báo.`
                : `Người này mở công cụ nhà phát triển (DevTools) trong lúc chơi nên bị xử thua ván ${cheat.round}.`}
            </p>
            <button type="button" className="btn btn-pen mt-5" onClick={() => setCheat(null)}>
              Đã hiểu
            </button>
          </div>
        )}
      </Dialog>
      {warn > 0 && (
        <div className="fixed right-4 bottom-4 left-4 z-50 grid justify-items-end sm:left-auto" role="status" aria-live="polite">
          <div key={warn} className="card flex w-full max-w-sm items-start gap-3 p-4" style={{ animation: "pop-in 220ms ease" }}>
            <span className="text-2xl" aria-hidden="true">
              ⚠️
            </span>
            <p className="min-w-0 flex-1 text-[14.5px] leading-snug">
              <b>Đóng công cụ nhà phát triển (DevTools)</b> trước khi ván bắt đầu — mở trong lúc chơi sẽ bị xử thua ngay.
            </p>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setWarn(0)}>
              Đóng
            </button>
          </div>
        </div>
      )}
    </>
  );
}
