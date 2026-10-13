"use client";

import type { ReactNode } from "react";
import { seatOpen, type Result, type RoomSession, type RoomView } from "@/lib/net/room";
import { ConfirmButton } from "../ConfirmButton";

/**
 * Thanh trạng thái dưới thanh người chơi, dùng chung cho các game: một câu nói mình đang ở đâu / cần làm gì, nền đổi màu
 * theo tình huống, và các nút hành động bên phải. Game chỉ cấp nội dung; khuôn, cỡ chữ, vị trí nút là của chung.
 *
 * Kết quả ván không nằm ở đây mà ở `ResultCard` — hết ván thì thanh quay về câu nhắc vào ghế / bắt đầu ván mới.
 */
export function StatusBar({ tone = TONE.idle, message, stack, children }: { tone?: string; message: ReactNode; stack?: boolean; children?: ReactNode }) {
  return (
    <div className="card flex flex-wrap items-center gap-3 px-4 py-3" style={{ background: tone }} aria-live="polite">
      <p className={`min-w-0 flex-1 text-[15px] font-semibold ${stack ? "basis-full sm:basis-0" : ""}`}>{message}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** Màu nền thanh trạng thái: chờ / tới lượt mình / nổi bật / cảnh báo / thông tin chung cả phòng. */
export const TONE = {
  idle: "var(--sunken)",
  turn: "var(--lime-soft)",
  hot: "var(--sun-soft)",
  alert: "var(--coral-soft)",
  info: "var(--grape-soft)",
} as const;

/**
 * Câu nhắc lúc chưa vào ván (chờ, hoặc vừa hết ván): đang chờ xếp ghế / đã vào ghế / hết ghế / mời vào chơi.
 * `enough`: đủ người để bắt đầu chưa (mặc định: kín ghế). `startHint`: câu nhắc chủ phòng đã ngồi ghế. `join`: lời mời
 * người chưa vào ghế.
 */
export function seatMessage(
  view: RoomView,
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

const isFull = (view: RoomView) => !seatOpen(view.meta!);

/** Lý do chủ phòng chưa bấm bắt đầu được (rỗng là bắt đầu được): mặc định cần kín ghế và mọi người chơi còn kết nối. */
export function startBlocker(view: RoomView, { min }: { min?: number } = {}): string {
  const n = view.meta!.players.length;
  if (min === undefined ? !isFull(view) : n < min) return min === undefined ? "Cần đủ người vào ghế" : min <= 1 ? "Cần ít nhất một người vào ghế" : `Cần ít nhất ${min} người vào ghế`;
  if (!view.seats.every((s) => s.online)) return "Có người chơi đang mất kết nối";
  return "";
}

/**
 * Các nút lúc chưa vào ván: Vào chơi / Rời ghế, và Bắt đầu – Ván mới cho chủ phòng. `blocked` là lý do chưa bắt đầu
 * được (mặc định `startBlocker`), hiện khi rê chuột lên nút.
 */
export function SeatButtons({
  view,
  session,
  blocked = startBlocker(view),
  joinLabel = "🙋 Vào chơi",
  onStart,
}: {
  view: RoomView;
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

/** Người chơi bỏ cuộc giữa ván (bấm hai lần). */
export function ResignButton({ onConfirm, label = "Xin thua" }: { onConfirm: () => void; label?: string }) {
  return (
    <ConfirmButton className="btn btn-coral" onConfirm={onConfirm} confirmLabel={`Bấm lần nữa để ${label.toLowerCase()}`}>
      🏳️ {label}
    </ConfirmButton>
  );
}

/** Chủ phòng dừng ván giữa chừng (bấm hai lần). */
export function StopButton({ onConfirm }: { onConfirm: () => void }) {
  return (
    <ConfirmButton className="btn btn-coral" onConfirm={onConfirm} confirmLabel="Bấm lần nữa để dừng">
      ⏹ Dừng ván
    </ConfirmButton>
  );
}

/** Lý do thắng không do luật mà do đối thủ bỏ (xin thua, rời trận, bị mời ra); undefined nếu thắng theo luật. */
export function forfeitWhy(r: Result): string | undefined {
  if (r.reason === "resign") return "Đối thủ xin thua";
  if (r.reason === "leave") return "Đối thủ rời trận";
  if (r.reason === "kick") return "Đối thủ bị mời ra";
}
