"use client";

import { useLobbyView, useNet } from "./NetProvider";
import { Spinner } from "./Spinner";

// Mốc đổi màu ping: dưới mức đầu chơi mượt, quá mức sau thì nước đi tới chậm thấy rõ.
const PING_GOOD_MS = 120;
const PING_SLOW_MS = 300;

function pingColor(ms: number) {
  return ms < PING_GOOD_MS ? "var(--lime)" : ms < PING_SLOW_MS ? "var(--sun)" : "var(--coral)";
}

export function NetBadge() {
  const { lobby } = useNet();
  const view = useLobbyView();
  const online = view.users.length;
  // Sảnh chỉ cần vài kết nối: đã đủ mức mềm thì máy không nối được cũng không ảnh hưởng gì, khỏi báo.
  const starved = !view.limit || view.peers < view.limit.soft;
  return (
    <span className="group relative inline-flex">
      <span
        className="inline-flex cursor-default items-center gap-1.5 rounded-full border-2 border-edge bg-surface px-2.5 py-1 text-[13px] font-bold whitespace-nowrap sm:gap-2 sm:px-3"
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
      {/* Chỉ hiện khi rê chuột (biến thể hover của Tailwind đã bỏ qua máy cảm ứng) và màn hình đủ rộng. */}
      <span role="tooltip" className="net-pop hidden sm:group-hover:block">
        <span className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
          <span className="text-ink-2">Người online</span>
          <b>{view.connected || view.alone ? online : "—"}</b>
          <span className="text-ink-2">Kết nối P2P</span>
          <b>
            {view.peers}
            {view.limit && <span className="text-ink-3 font-semibold"> / {view.limit.hard}</span>}
          </b>
          <span className="text-ink-2">Ping trung bình</span>
          <b className="inline-flex items-center gap-1.5">
            {view.ping == null ? (
              "—"
            ) : (
              <>
                <span className="size-2 rounded-full" style={{ background: pingColor(view.ping) }} aria-hidden="true" />
                {view.ping} ms
              </>
            )}
          </b>
        </span>
      </span>
    </span>
  );
}
