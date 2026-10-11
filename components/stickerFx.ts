"use client";

import { useSyncExternalStore } from "react";

/** Cài đặt riêng của máy: sticker có bay qua màn hình không (mặc định có). Tắt thì sticker chỉ hiện trong khung chat. */
const KEY = "arena:sticker-fx";
const fns = new Set<() => void>();
// Giữ trong bộ nhớ: getSnapshot chạy mỗi lần render của mọi component dùng cài đặt này, không nên đọc localStorage mỗi lần.
// Trình duyệt chặn localStorage thì vẫn bật / tắt được trong phiên này.
let cached: boolean | null = null;

function read() {
  if (cached === null) {
    try {
      cached = localStorage.getItem(KEY) !== "0";
    } catch {
      cached = true;
    }
  }
  return cached;
}

function subscribe(fn: () => void) {
  fns.add(fn);
  // Đổi ở tab khác cũng áp dụng ngay.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cached = null;
    fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    fns.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function setStickerFx(on: boolean) {
  cached = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {}
  for (const fn of fns) fn();
}

export function useStickerFx() {
  return useSyncExternalStore(subscribe, read, () => true);
}
