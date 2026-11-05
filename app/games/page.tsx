import type { Metadata } from "next";
import { GameGrid, LiveStats } from "@/components/home/GameGrid";
import { CATEGORIES, loadGames } from "@/lib/games/registry";
import { shareMeta } from "@/lib/site";

export const metadata: Metadata = shareMeta({
  title: "Tất cả trò chơi",
  description: "Toàn bộ mini game đối kháng trên Arena theo thể loại: đấu trí căng não, nhẹ nhàng chill chill và trò chơi dân gian. Mở phòng, gửi link là chơi cùng bạn bè.",
  path: "/games/",
});

export default async function Games() {
  const games = await loadGames();
  const live = games.filter((g) => g.status === "LIVE").length;
  return (
    <>
      <section className="mx-auto max-w-[1280px] px-4 pt-12 pb-6 sm:px-6 lg:pt-16">
        <p className="chip bg-surface" style={{ color: "var(--lime)" }}>
          🎮 {live} game đang mở
        </p>
        <h1 className="mt-5 font-display text-[44px] leading-[1.02] font-extrabold tracking-tight text-balance sm:text-[56px]">
          Tất cả <span className="text-pen">trò chơi</span>
        </h1>
        <p className="mt-4 max-w-[60ch] text-lg text-ink-2">Chọn một game, mở phòng và gửi link cho bạn bè. Đấu trí, chill hay dân gian, cả hội thích kiểu nào cũng có.</p>
        <nav aria-label="Thể loại" className="mt-6 flex flex-wrap gap-2.5">
          {CATEGORIES.map((c) => {
            const n = games.filter((g) => g.category === c.value).length;
            if (!n) return null;
            return (
              <a key={c.value} href={`#${c.value}`} className="btn h-10 gap-2 px-4 text-[15px] no-underline">
                <span aria-hidden="true">{c.emoji}</span> {c.label}
                <span className="text-ink-3">{n}</span>
              </a>
            );
          })}
        </nav>
        <div className="mt-6">
          <LiveStats />
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
        <GameGrid />
      </section>
    </>
  );
}
