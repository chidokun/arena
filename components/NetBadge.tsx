"use client";

import { useLobbyView, useNet } from "./NetProvider";
import { Spinner } from "./Spinner";

export function NetBadge() {
  const { lobby } = useNet();
  const view = useLobbyView();
  const online = view.users.length;
  // Sảnh chỉ cần vài kết nối: đã đủ mức mềm thì máy không nối được cũng không ảnh hưởng gì, khỏi báo.
  const starved = !view.limit || view.peers < view.limit.soft;
  const blocked =
    view.unreachable > 0
      ? `\nKhông nối được với ${view.unreachable} máy — mạng (thường là 4G/5G hoặc wifi công ty) chặn kết nối P2P.`
      : "";
  const linked = view.limit
    ? `Đang nối trực tiếp (P2P) với ${view.peers} người — sảnh chỉ nối tối đa ${view.limit.hard} người, tin tức đi tiếp qua họ tới mọi người`
    : `Đang nối trực tiếp (P2P) với ${view.peers} người`;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border-2 border-edge bg-surface px-2.5 py-1 text-[13px] font-bold whitespace-nowrap sm:gap-2 sm:px-3"
      title={(view.connected ? linked : view.alone ? "Mạng ổn nhưng chưa có ai khác online — vẫn có thể tạo phòng" : "Chưa nối được với ai — vẫn có thể tạo phòng") + blocked}
      aria-live="polite"
    >
      {view.connected || view.alone ? (
        <>
          <span className="live-dot" aria-hidden="true" />
          <span>
            {online}
            <span className="hidden sm:inline"> người</span> online
          </span>
        </>
      ) : (
        <>
          <Spinner label={null} className="text-sun" />
          <span className="hidden sm:inline">{lobby ? "Đang tìm người chơi…" : "Đang khởi động…"}</span>
          <span className="sm:hidden">{lobby ? "Đang tìm…" : "Khởi động…"}</span>
        </>
      )}
      {view.unreachable > 0 && starved && (
        <span className="text-ink-3">
          · {view.unreachable}
          <span className="hidden sm:inline"> máy bị</span> chặn
        </span>
      )}
    </span>
  );
}
