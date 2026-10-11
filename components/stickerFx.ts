"use client";

import { useSyncExternalStore } from "react";

/** Cài đặt riêng của máy: sticker có bay qua màn hình không (mặc định có). Tắt thì sticker chỉ hiện trong khung chat. */
const KEY = "arena:sticker-fx";
const fns = new Set<() => void>();
// Trình duyệt chặn localStorage thì vẫn bật / tắt được trong phiên này.
let fallback = true;

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? fallback : v !== "0";
  } catch {
    return fallback;
  }
}

function subscribe(fn: () => void) {
  fns.add(fn);
  // Đổi ở tab khác cũng áp dụng ngay.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    fns.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function setStickerFx(on: boolean) {
  fallback = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {}
  for (const fn of fns) fn();
}

export function useStickerFx() {
  return useSyncExternalStore(subscribe, read, () => true);
}
