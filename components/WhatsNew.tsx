"use client";

import { useCallback, useEffect, useState } from "react";
import { compareVersion, parseVersion, type ChangelogEntry } from "@/lib/changelog";
import type { ChatMsg } from "@/lib/net/room";

// Phiên bản nhật ký đã xem nằm ở localStorage — site không có máy chủ, mỗi máy tự nhớ.
const SEEN_KEY = "arena:whatsnew-seen";
const PROFILE_KEY = "arena:profile";
// Đợi khung chat hiện hẳn rồi mới "nhắn tới", cho giống tin vừa đến.
const ARRIVE_MS = 1500;

function store(version: string) {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {}
}

// Chưa từng ghi mốc: người cũ (đã lưu hồ sơ) thì báo, người mới ghé lần đầu thì coi như đã xem — với họ mọi thứ đều mới.
function unseen(latest: ChangelogEntry): boolean {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    if (seen === null && localStorage.getItem(PROFILE_KEY) === null) {
      store(latest.version);
      return false;
    }
    return !seen || !parseVersion(seen) || compareVersion(latest.version, seen) > 0;
  } catch {
    return false;
  }
}

// Chỉ là tin hiển thị tại chỗ: không đi qua sảnh (lobby) nên không được gửi, gửi lại hay lưu cùng lịch sử chat công cộng.
function toMsg(entry: ChangelogEntry): ChatMsg {
  return {
    id: `whatsnew-${entry.version}`,
    uid: "arena:whatsnew",
    name: "Arena",
    avatar: "✨",
    color: "#6c47ff",
    at: Date.now(),
    // Mỗi dòng một điểm; khung chat tự vẽ tiêu đề và dấu chấm đầu dòng.
    text: entry.notes.join("\n"),
    local: true,
    news: true,
  };
}

// Nhật ký mới nhất "nhắn" vào kênh chat công cộng như một tin vừa tới: nổi bong bóng, tăng số tin chưa đọc. Khác tin
// chat, bong bóng không tự tắt — nằm đó tới khi người chơi mở khung chat (bấm bong bóng / nút chat), lúc đó ghi là đã
// xem; tin vẫn nằm trong khung tới khi tải lại trang.
export function useWhatsNew(latest: ChangelogEntry | null, ready: boolean) {
  const [msg, setMsg] = useState<ChatMsg | null>(null);
  const [bubble, setBubble] = useState(false);

  useEffect(() => {
    if (!ready || !latest || msg || !unseen(latest)) return;
    const t = setTimeout(() => {
      setMsg(toMsg(latest));
      setBubble(true);
    }, ARRIVE_MS);
    return () => clearTimeout(t);
  }, [ready, latest, msg]);

  const read = useCallback(() => {
    if (!latest || !msg) return;
    store(latest.version);
    setBubble(false);
  }, [latest, msg]);

  return { msg, bubbles: msg && bubble ? [msg] : [], read };
}
