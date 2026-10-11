import { getGame, hasPage, loadGames } from "@/lib/games/registry";
import { renderOgImage } from "@/lib/og";

// Xuất thành file tĩnh out/og/<tên>.png — cần đuôi .png để GitHub Pages trả đúng Content-Type, Facebook mới nhận ảnh.
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const games = (await loadGames()).filter((g) => hasPage(g.slug));
  return [{ file: "home.png" }, ...games.map((g) => ({ file: `${g.slug}.png` }))];
}

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const games = await loadGames();
  const slug = (await params).file.replace(/\.png$/, "");
  const game = getGame(slug);
  if (game) {
    return renderOgImage({
      kicker: "🎮 Rủ bạn vào chơi cùng",
      title: game.name,
      subtitle: game.tagline,
      cta: "Vào phòng chơi ngay →",
      tiles: [{ emoji: game.emoji, hue: game.hue }],
    });
  }
  const live = games.filter((g) => g.status === "LIVE");
  return renderOgImage({
    kicker: "⚡ Không đăng ký · Không cài app",
    title: "Đấu trường mini cho hội bạn",
    subtitle: `${live.length} trò chơi: Caro, Cờ tướng, Ma Sói, Lô Tô… chơi ngay trên trình duyệt.`,
    cta: "Vào chơi ngay →",
    tiles: live.slice(0, 4).map((g) => ({ emoji: g.emoji, hue: g.hue })),
  });
}
