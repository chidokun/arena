import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RoomScreen } from "@/components/room/RoomScreen";
import { MaintenanceGate } from "@/components/Maintenance";
import { getGame, loadGames, routable } from "@/lib/games/registry";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await loadGames()).filter(routable).map((g) => ({ game: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  await loadGames();
  const game = getGame((await params).game);
  return game ? { title: `Phòng ${game.name}` } : {};
}

export default async function RoomPage({ params }: { params: Promise<{ game: string }> }) {
  await loadGames();
  const game = getGame((await params).game);
  if (!game) notFound();
  return (
    <MaintenanceGate slug={game.slug}>
      <Suspense fallback={<div className="mx-auto max-w-[1280px] px-4 py-16 text-center text-ink-3">Đang mở phòng…</div>}>
        <RoomScreen slug={game.slug} />
      </Suspense>
    </MaintenanceGate>
  );
}
