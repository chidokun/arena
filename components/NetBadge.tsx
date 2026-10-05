"use client";

import { useLobbyView, useNet } from "./NetProvider";

/** Trạng thái lưới P2P: đang tìm bạn chơi hay đã nối với bao nhiêu người. */
export function NetBadge() {
  const { lobby } = useNet();
  const view = useLobbyView();
  const online = view.users.length;
  const label = !lobby ? "Đang khởi động…" : view.connected ? `${online} người online` : "Đang tìm người chơi…";
  const blocked =
    view.unreachable > 0
      ? `\nKhông nối được với ${view.unreachable} máy — mạng (thường là 4G/5G hoặc wifi công ty) chặn kết nối P2P.`
      : "";
  return (
    <span
      className="hidden items-center gap-2 rounded-full border-2 border-edge bg-surface px-3 py-1 text-[13px] font-bold sm:inline-flex"
      title={(view.connected ? `Đang nối trực tiếp (P2P) với ${view.peers} người` : "Chưa nối được với ai — vẫn có thể tạo phòng") + blocked}
      aria-live="polite"
    >
      <span className={view.connected ? "live-dot" : "inline-block h-[9px] w-[9px] rounded-full bg-sun"} aria-hidden="true" />
      {label}
      {view.unreachable > 0 && <span className="text-ink-3">· {view.unreachable} máy bị chặn</span>}
    </span>
  );
}
