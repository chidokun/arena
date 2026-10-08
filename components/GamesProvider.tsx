"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getGames, isSynced, refreshGames, seedGames, subscribeGames, type GameDef } from "@/lib/games/registry";

/** Nạp danh mục game (layout tải lúc build) vào registry phía client trước khi các component con đọc tới, rồi hỏi lại API để cập nhật trạng thái. */
export function GamesProvider({ games, children }: { games: GameDef[]; children: React.ReactNode }) {
  seedGames(games);
  useEffect(() => void refreshGames(), []);
  return children;
}

/** Danh mục game, vẽ lại khi trạng thái (bảo trì…) đổi lúc chạy. */
export const useGames = () => useSyncExternalStore(subscribeGames, getGames, getGames);
export const useGamesSynced = () => useSyncExternalStore(subscribeGames, isSynced, () => false);
