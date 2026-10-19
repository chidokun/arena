"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

const WIDE = "(min-width: 1024px)";

const subscribeWide = (fn: () => void) => {
  const mq = matchMedia(WIDE);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
};

export function useWide() {
  return useSyncExternalStore(subscribeWide, () => matchMedia(WIDE).matches, () => false);
}

export type SidePanel = { key: string; label: string; node: ReactNode };

export type RoomSide = {
  docked: boolean;
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  panels: SidePanel[];
  bind: (open: ((tab: string) => void) | null) => void;
};

export const RoomSideCtx = createContext<RoomSide | null>(null);
export const useRoomSide = () => useContext(RoomSideCtx);

export type PeopleVariant = "card" | "bare" | "strip";
export const PeopleVariantCtx = createContext<PeopleVariant>("card");

export const PeopleOpenerCtx = createContext<() => void>(() => {});
