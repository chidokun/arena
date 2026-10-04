import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameLobby } from "@/components/lobby/GameLobby";
import { GAMES, getGame } from "@/lib/games/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return GAMES.filter((g) => g.available).map((g) => ({ game: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const game = getGame((await params).game);
  return game ? { title: `${game.name} — sảnh chờ`, description: game.description } : {};
}

export default async function GamePage({ params }: { params: Promise<{ game: string }> }) {
  const game = getGame((await params).game);
  if (!game) notFound();
  return <GameLobby slug={game.slug} />;
}
