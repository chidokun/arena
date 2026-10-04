import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RoomScreen } from "@/components/room/RoomScreen";
import { GAMES, getGame } from "@/lib/games/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return GAMES.filter((g) => g.available).map((g) => ({ game: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const game = getGame((await params).game);
  return game ? { title: `Phòng ${game.name}` } : {};
}

export default async function RoomPage({ params }: { params: Promise<{ game: string }> }) {
  const game = getGame((await params).game);
  if (!game) notFound();
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1280px] px-4 py-16 text-center text-ink-3">Đang mở phòng…</div>}>
      <RoomScreen slug={game.slug} />
    </Suspense>
  );
}
