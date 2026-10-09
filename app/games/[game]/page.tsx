import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameLobby } from "@/components/lobby/GameLobby";
import { MaintenanceGate } from "@/components/Maintenance";
import { getGame, hasPage, loadGames } from "@/lib/games/registry";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await loadGames()).filter((g) => hasPage(g.slug)).map((g) => ({ game: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  await loadGames();
  const game = getGame((await params).game);
  return game ? { title: `${game.name} — sảnh chờ`, description: game.description } : {};
}

export default async function GamePage({ params }: { params: Promise<{ game: string }> }) {
  await loadGames();
  const game = getGame((await params).game);
  if (!game) notFound();
  return (
    <MaintenanceGate slug={game.slug}>
      <GameLobby slug={game.slug} />
    </MaintenanceGate>
  );
}
