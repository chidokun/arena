"use client";

import type { ReactNode } from "react";
import { seatOpen, type Result, type RoomSession, type RoomView } from "@/lib/net/room";
import { ConfirmButton } from "../ConfirmButton";

export type SeatState = Pick<RoomView, "pending" | "mySeat" | "isHost" | "meta" | "seats">;

export function StatusBar({ tone = TONE.idle, message, stack, children }: { tone?: string; message: ReactNode; stack?: boolean; children?: ReactNode }) {
  return (
    <div className="card flex flex-wrap items-center gap-3 px-4 py-3" style={{ background: tone }} aria-live="polite">
      <p className={`min-w-0 flex-1 text-[15px] font-semibold ${stack ? "basis-full sm:basis-0" : ""}`}>{message}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export const TONE = {
  idle: "var(--sunken)",
  turn: "var(--lime-soft)",
  hot: "var(--sun-soft)",
  alert: "var(--coral-soft)",
  info: "var(--grape-soft)",
} as const;

export function seatMessage(
  view: SeatState,
  {
    enough = isFull(view),
    startHint = "Bấm Bắt đầu khi sẵn sàng.",
    join = "Bấm “Vào chơi” để giành ghế và sẵn sàng.",
  }: { enough?: boolean; startHint?: ReactNode; join?: ReactNode } = {},
): ReactNode {
  if (view.pending === "play") return <>⏳ Đang chờ chủ phòng xếp ghế…</>;
  if (view.mySeat >= 0)
    return enough ? (
      <>✅ Bạn đã vào ghế. {view.isHost ? startHint : "Chờ chủ phòng bắt đầu."}</>
    ) : (
      <>✅ Bạn đã vào ghế, đang chờ thêm người…</>
    );
  return isFull(view) ? <>🪑 Hết ghế — bạn có thể ngồi xem và trò chuyện.</> : <>{join}</>;
}

const isFull = (view: SeatState) => !seatOpen(view.meta!);

export function startBlocker(view: SeatState, { min }: { min?: number } = {}): string {
  const n = view.meta!.players.length;
  if (min === undefined ? !isFull(view) : n < min) return min === undefined ? "Cần đủ người vào ghế" : min <= 1 ? "Cần ít nhất một người vào ghế" : `Cần ít nhất ${min} người vào ghế`;
  if (!view.seats.every((s) => s.online)) return "Có người chơi đang mất kết nối";
  return "";
}

export function SeatButtons({
  view,
  session,
  blocked = startBlocker(view),
  joinLabel = "🙋 Vào chơi",
  onStart,
}: {
  view: SeatState;
  session: RoomSession;
  blocked?: string;
  joinLabel?: ReactNode;
  onStart?: () => void;
}) {
  const m = view.meta!;
  const seated = view.mySeat >= 0;
  return (
    <>
      {!seated && !isFull(view) && (
        <button type="button" className="btn btn-lime" onClick={() => session.join()} disabled={view.pending === "play"}>
          {joinLabel}
        </button>
      )}
      {seated && (
        <button type="button" className="btn" onClick={() => session.leaveSeat()} disabled={view.pending === "watch"}>
          Rời ghế
        </button>
      )}
      {view.isHost && (
        <button
          type="button"
          className="btn btn-pen"
          onClick={() => {
            onStart?.();
            session.start();
          }}
          disabled={!!blocked}
          title={blocked}
        >
          {m.round > 0 ? "🔁 Ván mới" : "▶ Bắt đầu"}
        </button>
      )}
    </>
  );
}

export function ResignButton({ onConfirm, label = "Xin thua" }: { onConfirm: () => void; label?: string }) {
  return (
    <ConfirmButton className="btn btn-coral" onConfirm={onConfirm} confirmLabel={`Bấm lần nữa để ${label.toLowerCase()}`}>
      🏳️ {label}
    </ConfirmButton>
  );
}

export function StopButton({ onConfirm }: { onConfirm: () => void }) {
  return (
    <ConfirmButton className="btn btn-coral" onConfirm={onConfirm} confirmLabel="Bấm lần nữa để dừng">
      ⏹ Dừng ván
    </ConfirmButton>
  );
}

export function forfeitWhy(r: Result): string | undefined {
  if (r.reason === "resign") return "Đối thủ xin thua";
  if (r.reason === "leave") return "Đối thủ rời trận";
  if (r.reason === "kick") return "Đối thủ bị mời ra";
  if (r.reason === "cheat") return "Đối thủ gian lận";
}
