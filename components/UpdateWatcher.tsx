"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const base = process.env.BASE_PATH ?? "";
const BUILD_ID = process.env.BUILD_ID;
const CHECK_EVERY = 30 * 60 * 1000;
// Lưới an toàn khi không hỏi được version.json: tab mở quá một ngày thì coi như đã cũ.
const MAX_AGE = 24 * 60 * 60 * 1000;

const inRoom = (path: string) => /\/room\/?$/.test(path);

// Tab mở lâu vẫn chạy JS cũ sau khi deploy. Phát hiện bản mới rồi tải lại vào lúc không làm phiền: khi chuyển trang,
// hoặc khi tab bị ẩn mà người chơi không ở trong phòng (tải lại giữa ván sẽ rớt kết nối P2P).
export function UpdateWatcher() {
  const pathname = usePathname();
  const stale = useRef(false);
  const path = useRef(pathname);

  useEffect(() => {
    if (path.current === pathname) return;
    path.current = pathname;
    if (stale.current) window.location.reload();
  }, [pathname]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const loadedAt = Date.now();

    const check = async () => {
      if (stale.current) return;
      if (Date.now() - loadedAt > MAX_AGE) {
        stale.current = true;
        return;
      }
      try {
        const res = await fetch(`${base}/version.json?t=${Date.now()}`, { cache: "no-store" });
        const { id } = await res.json();
        if (id && id !== BUILD_ID) stale.current = true;
      } catch {}
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
      else if (stale.current && !inRoom(path.current)) window.location.reload();
    };

    const timer = setInterval(check, CHECK_EVERY);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
