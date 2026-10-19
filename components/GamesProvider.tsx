"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getGames, isSynced, refreshGames, seedGames, subscribeGames, type GameDef } from "@/lib/games/registry";

export function GamesProvider({ games, children }: { games: GameDef[]; children: React.ReactNode }) {
  seedGames(games);
  useEffect(() => void refreshGames(), []);
  return children;
}

export const useGames = () => useSyncExternalStore(subscribeGames, getGames, getGames);
export const useGamesSynced = () => useSyncExternalStore(subscribeGames, isSynced, () => false);
