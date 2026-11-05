import type { MetadataRoute } from "next";
import { gameHref, loadGames } from "@/lib/games/registry";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const games = (await loadGames()).filter((g) => g.status === "LIVE");
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/games/`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/tournaments/`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/pricing/`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/terms/`, changeFrequency: "yearly", priority: 0.3 },
    ...games.map((g) => ({ url: `${SITE_URL}${gameHref(g.slug)}`, changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
