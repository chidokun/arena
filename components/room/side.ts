"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

/** Mốc màn hình rộng (lg): từ đây phòng chơi có sidebar bên phải, dưới mốc này dùng khung chat nổi. */
const WIDE = "(min-width: 1024px)";

const subscribeWide = (fn: () => void) => {
  const mq = matchMedia(WIDE);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
};

/** Màn hình có đủ rộng cho sidebar không (theo dõi khi xoay máy / đổi cỡ cửa sổ). */
export function useWide() {
  return useSyncExternalStore(subscribeWide, () => matchMedia(WIDE).matches, () => false);
}

/** Một tab không phải kênh chat trong khung chat của phòng: danh sách người (điện thoại), chat phe… */
export type SidePanel = { key: string; label: string; node: ReactNode };

/**
 * Do RoomLayout cấp cho khung chat của phòng. `docked`: chat nằm trong sidebar neo mép phải (màn hình rộng), không nổi.
 * `hidden` / `setHidden`: sidebar đang ẩn để bàn chơi rộng hơn. `panels`: tab thêm sau các kênh chat.
 * `bind`: khung chat đăng ký hàm mở mình ở một tab, để chỗ khác (dải avatar) gọi.
 */
export type RoomSide = {
  docked: boolean;
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  panels: SidePanel[];
  bind: (open: ((tab: string) => void) | null) => void;
};

export const RoomSideCtx = createContext<RoomSide | null>(null);
export const useRoomSide = () => useContext(RoomSideCtx);

/**
 * Cách vẽ danh sách người trong phòng tuỳ chỗ đặt: `card` — khối trong sidebar (thu gọn được); `bare` — nội dung
 * tab Người trong khung chat nổi; `strip` — dải avatar gọn đầu trang trên điện thoại.
 */
export type PeopleVariant = "card" | "bare" | "strip";
export const PeopleVariantCtx = createContext<PeopleVariant>("card");

/** Dải avatar (điện thoại) bấm vào thì mở khung chat ở tab Người. */
export const PeopleOpenerCtx = createContext<() => void>(() => {});
