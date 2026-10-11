import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RoomScreen } from "@/components/room/RoomScreen";
import { MaintenanceGate } from "@/components/Maintenance";
import { getGame, hasPage, loadGames } from "@/lib/games/registry";
import { ogImage, shareMeta } from "@/lib/site";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await loadGames()).filter((g) => hasPage(g.slug)).map((g) => ({ game: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  await loadGames();
  const game = getGame((await params).game);
  if (!game) return {};
  // Link phòng là link mời: Facebook / Zalo hiện tiêu đề này kèm ảnh của game.
  const meta = shareMeta({
    title: `Vào phòng ${game.name} chơi cùng mình!`,
    description: `${game.tagline}. Bấm link là vào phòng ngay, không cần đăng ký hay cài app.`,
    image: ogImage(game.slug, `${game.name} — ${game.tagline}`),
  });
  // Mỗi phòng một ?id= nhưng cùng một trang tĩnh; không cho Google lập chỉ mục các phòng tạm thời.
  return { ...meta, robots: { index: false, follow: true } };
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
