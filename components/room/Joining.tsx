"use client";

import { joinProgress, type JoinProgress } from "@/lib/net/join";
import type { RoomAd } from "@/lib/net/lobby";
import { Avatar } from "../Avatar";
import { useLobbyView, useNet } from "../NetProvider";
import { Notice } from "./RoomLayout";

/** Số avatar hiện ra; phòng đông (lô tô) thì gộp phần còn lại thành "+n". */
const SHOW = 12;

/** Màn hình đang vào phòng: đã nối trực tiếp được với bao nhiêu người trong phòng. */
export function Joining({ id, ad, progress }: { id: string; ad?: RoomAd; progress?: JoinProgress }) {
  const { uid } = useNet();
  const lobby = useLobbyView();
  // Phiên phòng chưa mở xong (đang lấy TURN, nạp Trystero) thì vẫn biết trước ai đang ở phòng nhờ sảnh.
  const p =
    progress ?? joinProgress({ me: uid, room: id, host: ad?.host, lobby: lobby.users, members: [], peers: [], synced: false, unreachable: 0 });
  const total = p.people.length;
  const linked = p.people.filter((x) => x.linked).length;
  const known = total > 0;
  const pct = known ? Math.round((linked / total) * 100) : p.synced ? 100 : 0;

  const headline = known ? `Đã kết nối ${linked}/${total} người` : p.synced ? "Đã nhận dữ liệu phòng" : "Đang tìm người trong phòng…";
  const detail = p.synced
    ? "Đã nhận trạng thái phòng — sắp vào…"
    : linked > 0
      ? "Đang tải trạng thái phòng…"
      : "Đang bắt tay trực tiếp (P2P) với những người trong phòng. Việc này thường mất vài giây.";

  return (
    <Notice emoji="📡" title={ad ? `Đang vào “${ad.name}”…` : `Đang tìm phòng #${id}…`} spin>
      <div className="mt-4 w-full max-w-sm">
        <div className="flex items-baseline justify-between gap-3 text-sm font-bold" aria-live="polite">
          <span className="text-ink">{headline}</span>
          {known && <span className="tabular-nums text-ink-3">{pct}%</span>}
        </div>
        <div
          className={`join-bar mt-2 ${known || p.synced ? "" : "is-unknown"}`}
          role="progressbar"
          aria-label="Tiến độ kết nối"
          aria-valuemin={0}
          aria-valuemax={total || undefined}
          aria-valuenow={known ? linked : undefined}
          aria-valuetext={headline}
        >
          <span style={known || p.synced ? { width: `${pct}%` } : undefined} />
        </div>

        {known && (
          <ul className="mt-5 flex flex-wrap justify-center gap-x-2 gap-y-3">
            {p.people.slice(0, SHOW).map((x) => (
              <li
                key={x.uid}
                className={`join-peer ${x.linked ? "is-linked" : "is-waiting"}`}
                title={`${x.name} — ${x.linked ? "đã kết nối" : "đang kết nối…"}`}
              >
                <span className="relative">
                  <Avatar p={x} size={40} />
                  <span className="join-mark" aria-hidden="true">
                    {x.linked ? "✓" : ""}
                  </span>
                </span>
                <span className="w-16 truncate text-xs font-semibold">{x.name}</span>
                <span className="sr-only">{x.linked ? "đã kết nối" : "đang kết nối"}</span>
              </li>
            ))}
            {total > SHOW && (
              <li className="join-peer">
                <span className="avatar bg-sunken text-sm font-bold" style={{ width: 40, height: 40 }}>
                  +{total - SHOW}
                </span>
              </li>
            )}
          </ul>
        )}

        <p className="mt-4 text-sm">{detail}</p>
        {p.unreachable > 0 && (
          <p className="mt-2 text-sm font-semibold text-coral">
            Chưa nối thông được với {p.unreachable} máy — mạng (thường là 4G/5G hoặc wifi công ty) có thể chặn kết nối P2P, đang thử lại…
          </p>
        )}
      </div>
    </Notice>
  );
}
