import type { MetadataRoute } from "next";
import { gameHref, loadGames } from "@/lib/games/registry";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const games = (await loadGames()).filter((g) => g.status === "LIVE");
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    ...games.map((g) => ({ url: `${SITE_URL}${gameHref(g.slug)}`, changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
