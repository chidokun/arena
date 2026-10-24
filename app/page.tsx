import type { Metadata } from "next";
import Link from "next/link";
import { GameGrid, LiveStats } from "@/components/home/GameGrid";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { TOURNAMENT_PERKS, TournamentArt } from "@/components/home/TournamentArt";
import { HUE } from "@/components/home/hue";
import { GameIcon } from "@/components/GameIcon";
import { StickerArt } from "@/components/room/Sticker";
import { loadGames, type GameDef } from "@/lib/games/registry";
import { shareMeta, SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";

export const metadata: Metadata = {
  ...shareMeta({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/" }),
  title: { absolute: SITE_TITLE },
};

const STEPS = [
  { n: "1", title: "Chọn game", text: "Vào sảnh của game để xem các phòng đang mở và số người trong đó.", tone: "var(--sky)" },
  { n: "2", title: "Tạo hoặc vào phòng", text: "Chủ phòng đặt luật và số người tối đa, có quyền thêm hay mời người khác ra.", tone: "var(--sun)" },
  { n: "3", title: "Bấm “Vào chơi”", text: "Ngồi vào ghế là sẵn sàng. Chủ phòng bấm Bắt đầu; người vào sau chỉ được xem.", tone: "var(--coral)" },
];

export default async function Home() {
  const games = (await loadGames()).filter((g) => g.status === "LIVE");
  return (
    <>
      <HeroCarousel
        slides={[
          { label: "Thiết kế hệ thống", content: <SystemDesignSlide /> },
          { label: "Đấu trường mini", content: <ArenaSlide /> },
          { label: "Kho game", content: <GamesSlide games={games} /> },
          { label: "Lịch sử đấu", content: <HistorySlide /> },
          { label: "Giải đấu", content: <TournamentSlide /> },
        ]}
      />

      <section id="games" className="mx-auto max-w-[1280px] scroll-mt-24 px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Chọn trò chơi</h2>
          <p className="hidden text-sm text-ink-3 sm:block">Số liệu cập nhật trực tiếp từ những người đang online</p>
        </div>
        <GameGrid />
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <h2 className="mb-6 font-display text-3xl font-extrabold tracking-tight">Chơi thế nào?</h2>
        <ol className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="card p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl border-2 border-edge font-display text-xl font-extrabold text-white" style={{ background: s.tone }}>
                {s.n}
              </span>
              <h3 className="mt-4 font-display text-xl font-extrabold">{s.title}</h3>
              <p className="mt-1.5 text-[15px] text-ink-2">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

const SLIDE = "mx-auto grid max-w-[1280px] items-center gap-10 px-4 pt-12 pb-10 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-20";
const SLIDE_TITLE = "mt-5 font-display text-[44px] leading-[1.02] font-extrabold tracking-tight text-balance sm:text-[64px]";

function ArenaSlide() {
  return (
    <div className={SLIDE}>
      <div>
        <p className="chip bg-surface text-pen">⚡ Không đăng ký · Không máy chủ</p>
        <h1 className={SLIDE_TITLE}>
          Đấu trường mini <span className="text-pen">cho hội bạn</span> ngay trên trình duyệt
        </h1>
        <p className="mt-5 max-w-[52ch] text-lg text-ink-2">
          Không cần cài app, không cần đăng ký. Chỉ cần mở phòng và gửi link cho bạn bè, vừa đấu vừa thả sticker trêu nhau ngay.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/games/caro/" className="btn btn-pen h-12 px-6 text-base no-underline">
            Chơi Caro ngay →
          </Link>
          <Link href="#games" className="btn h-12 px-6 text-base no-underline">
            Xem các game
          </Link>
        </div>
        <div className="mt-8">
          <LiveStats />
        </div>
      </div>
      <HeroArt />
    </div>
  );
}

function SystemDesignSlide() {
  return (
    <div className={SLIDE}>
      <div>
        <p className="chip bg-surface" style={{ color: "var(--grape)" }}>
          🏗️ Game mới · Thiết kế hệ thống
        </p>
        <h2 className={SLIDE_TITLE}>
          Trò chơi <span className="text-pen">Thiết kế hệ thống</span> chịu tải cùng bạn bè
        </h2>
        <p className="mt-5 max-w-[52ch] text-lg text-ink-2">
          Cùng một đề bài, bạn sẽ cùng bạn bè thiết kế hệ thống chịu tải lớn sử dụng các thành phần Load Balancer, Cache, Database, Queue…
          Hệ thống của ai chịu được nhiều TPS nhất trong budget sẽ chiến thắng.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/games/system-design/" className="btn btn-pen h-12 px-6 text-base no-underline">
            Thử thiết kế ngay →
          </Link>
          <Link href="#games" className="btn h-12 px-6 text-base no-underline">
            Xem các game
          </Link>
        </div>
      </div>
      <SystemDesignArt />
    </div>
  );
}

const SD_NODES = [
  { id: "users", emoji: "👥", label: "Users", x: 160, y: 26 },
  { id: "lb", emoji: "⚖️", label: "LB", x: 160, y: 88 },
  { id: "app1", emoji: "🖥️", label: "App", x: 85, y: 150 },
  { id: "app2", emoji: "🖥️", label: "App", x: 235, y: 150 },
  { id: "cache", emoji: "⚡", label: "Cache", x: 85, y: 212 },
  { id: "db", emoji: "🗄️", label: "DB", x: 235, y: 212 },
] as const;

const SD_EDGES = [
  ["users", "lb"],
  ["lb", "app1"],
  ["lb", "app2"],
  ["app1", "cache"],
  ["app2", "cache"],
  ["app1", "db"],
  ["app2", "db"],
] as const;

function SystemDesignArt() {
  const at = (id: string) => SD_NODES.find((n) => n.id === id)!;
  return (
    <div className="relative mx-auto w-full max-w-[460px]" aria-hidden="true">
      <div className="card -rotate-2 p-5" style={{ boxShadow: "0 8px 0 var(--edge)" }}>
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-xl font-extrabold">📋 Đề: Mạng xã hội</p>
          <span className="chip bg-surface" style={{ color: "var(--grape)" }}>
            ⏱ 05:00
          </span>
        </div>
        <svg viewBox="0 0 320 240" className="mt-3 block w-full rounded-2xl border-2 border-edge bg-sunken">
          {SD_EDGES.map(([a, b]) => {
            const p = at(a);
            const q = at(b);
            return <line key={a + b} className="sd-flow" x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--pen)" strokeWidth="2.5" strokeLinecap="round" />;
          })}
          {SD_NODES.map((n) => (
            <g key={n.id}>
              <rect x={n.x - 44} y={n.y - 17} width={88} height={34} rx={10} fill="var(--surface)" stroke="var(--edge)" strokeWidth="2" />
              <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--ink)">
                {n.emoji} {n.label}
              </text>
            </g>
          ))}
        </svg>
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-[15px] font-bold">
            <span>📈 Load test</span>
            <span className="font-display text-xl font-extrabold tabular-nums" style={{ color: "var(--lime)" }}>
              12.400 TPS
            </span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full border-2 border-edge bg-surface">
            <div className="h-full w-[78%]" style={{ background: "var(--lime)" }} />
          </div>
          <p className="mt-1.5 text-[13px] text-ink-3">Budget 180 · Đã dùng 142 · Vượt quality gate ✓</p>
        </div>
      </div>
      <span className="bob absolute -top-12 -right-6" style={{ ["--r" as string]: "10deg" }}>
        <StickerArt id="kx-dang-cap" size={70} />
      </span>
      <span className="bob absolute -right-5 -bottom-8" style={{ ["--r" as string]: "-12deg", animationDelay: "-1.4s" }}>
        <StickerArt id="clap" size={58} />
      </span>
    </div>
  );
}

function Perks({ items }: { items: readonly { icon: string; title: string }[] }) {
  return (
    <ul className="mt-6 grid gap-2.5 sm:grid-cols-3">
      {items.map((p) => (
        <li key={p.title} className="flex items-center gap-2 text-[15px] font-bold">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-edge bg-surface text-lg" aria-hidden="true">
            {p.icon}
          </span>
          {p.title}
        </li>
      ))}
    </ul>
  );
}

function GamesSlide({ games }: { games: GameDef[] }) {
  return (
    <div className={SLIDE}>
      <div>
        <p className="chip bg-surface" style={{ color: "var(--lime)" }}>
          🎮 Kho game đối kháng
        </p>
        <h2 className={SLIDE_TITLE}>
          Gần <span className="text-pen">20 game</span> đối kháng hấp dẫn
        </h2>
        <p className="mt-5 max-w-[52ch] text-lg text-ink-2">
          Cờ Caro, Cờ Tướng, Cờ Vua, Ma Sói, Lô Tô, Ô Ăn Quan… tất cả đã sẵn sàng để bạn tranh tài cùng bạn bè, mở phòng là đấu ngay.
        </p>
        <Perks
          items={[
            { icon: "🧠", title: "Đấu trí căng não" },
            { icon: "🍃", title: "Nhẹ nhàng chill" },
            { icon: "🏮", title: "Trò dân gian" },
          ]}
        />
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="#games" className="btn btn-pen h-12 px-6 text-base no-underline">
            Chọn game ngay →
          </Link>
        </div>
      </div>
      <GamesArt games={games} />
    </div>
  );
}

function GamesArt({ games }: { games: GameDef[] }) {
  const tiles = games.slice(0, 12);
  return (
    <div className="relative mx-auto w-full max-w-[460px]" aria-hidden="true">
      <ul className="grid grid-cols-4 gap-3 sm:gap-4">
        {tiles.map((g, i) => (
          <li
            key={g.slug}
            className="card grid aspect-square place-items-center"
            style={{
              background: HUE[g.hue].soft,
              rotate: `${[-4, 3, -2, 5][i % 4]}deg`,
              translate: `0 ${i % 2 ? 10 : 0}px`,
            }}
            title={g.name}
          >
            <GameIcon game={g} size={72} className="h-[74%] w-[74%]" />
          </li>
        ))}
      </ul>
      <span className="bob absolute -top-7 -right-4" style={{ ["--r" as string]: "10deg" }}>
        <StickerArt id="kx-dang-cap" size={70} />
      </span>
      <span className="bob absolute -bottom-6 -left-5" style={{ ["--r" as string]: "-12deg", animationDelay: "-1.4s" }}>
        <StickerArt id="heart" size={54} />
      </span>
    </div>
  );
}

function HistorySlide() {
  return (
    <div className={SLIDE}>
      <div>
        <p className="chip bg-surface" style={{ color: "var(--sky)" }}>
          🔐 Đăng nhập · Sắp ra mắt
        </p>
        <h2 className={SLIDE_TITLE}>
          Lưu lại <span className="text-pen">lịch sử đấu</span> với bạn bè
        </h2>
        <p className="mt-5 max-w-[52ch] text-lg text-ink-2">
          Đăng nhập để giữ lại từng ván đã chơi: thắng ai, thua ai, tỉ số đối đầu với từng người bạn. Không đăng nhập vẫn chơi bình thường.
        </p>
        <Perks
          items={[
            { icon: "📜", title: "Lịch sử từng ván" },
            { icon: "⚔️", title: "Tỉ số đối đầu" },
            { icon: "📈", title: "Thành tích" },
          ]}
        />
        <div className="mt-7 flex flex-wrap gap-3">
          <span className="btn h-12 px-6 text-base opacity-70" aria-disabled="true">
            ⏳ Sắp ra mắt
          </span>
          <Link href="#games" className="btn btn-pen h-12 px-6 text-base no-underline">
            Chơi ngay →
          </Link>
        </div>
      </div>
      <HistoryArt />
    </div>
  );
}

const MATCHES = [
  { foe: "🐼", name: "Gấu Lười", game: "Cờ Caro", win: true },
  { foe: "🦊", name: "Cáo Nhanh", game: "Cờ Tướng", win: false },
  { foe: "🐸", name: "Ếch Ngơ", game: "Ô Ăn Quan", win: true },
  { foe: "🐼", name: "Gấu Lười", game: "Cờ Vua", win: true },
];

function HistoryArt() {
  return (
    <div className="relative mx-auto w-full max-w-[460px]" aria-hidden="true">
      <div className="card rotate-2 p-5" style={{ boxShadow: "0 8px 0 var(--edge)" }}>
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-xl font-extrabold">📜 Lịch sử đấu</p>
          <span className="chip bg-sun text-[#1d1648]" style={{ borderColor: "var(--edge)" }}>
            Sắp ra mắt
          </span>
        </div>
        <div className="mt-4 flex items-center justify-center gap-4 rounded-2xl border-2 border-edge bg-sunken py-3">
          <span className="text-3xl">🐯</span>
          <span className="font-display text-3xl font-extrabold tabular-nums">
            <span style={{ color: "var(--lime)" }}>7</span> – <span style={{ color: "var(--coral)" }}>4</span>
          </span>
          <span className="text-3xl">🐼</span>
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {MATCHES.map((m, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border-2 border-rule px-3 py-2">
              <span className="text-2xl">{m.foe}</span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[15px] font-bold">vs {m.name}</span>
                <span className="block text-[13px] text-ink-3">{m.game}</span>
              </span>
              <span className="chip bg-surface" style={{ color: m.win ? "var(--lime)" : "var(--coral)" }}>
                {m.win ? "Thắng" : "Thua"}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <span className="bob absolute -top-6 -left-5" style={{ ["--r" as string]: "-10deg", animationDelay: "-0.4s" }}>
        <StickerArt id="kx-dak" size={68} />
      </span>
      <span className="bob absolute -right-4 -bottom-5" style={{ ["--r" as string]: "12deg", animationDelay: "-1.8s" }}>
        <StickerArt id="cow" size={62} />
      </span>
    </div>
  );
}

function TournamentSlide() {
  return (
    <div className={SLIDE}>
      <div>
        <p className="chip bg-surface" style={{ color: "var(--coral)" }}>
          🏆 Giải đấu · Sắp ra mắt
        </p>
        <h2 className={SLIDE_TITLE}>
          Mở giải đấu <span className="text-pen">tranh cúp</span> cùng bạn bè
        </h2>
        <p className="mt-5 max-w-[52ch] text-lg text-ink-2">
          Đăng nhập, tạo giải đấu và mời thật nhiều bạn bè cùng tham gia. Không chỉ một ván, cả hội cùng leo nhánh đấu để tìm ra nhà vô địch.
        </p>
        <Perks items={TOURNAMENT_PERKS} />
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/tournaments/" className="btn btn-pen h-12 px-6 text-base no-underline">
            Tìm hiểu giải đấu →
          </Link>
          <Link href="#games" className="btn h-12 px-6 text-base no-underline">
            Chơi game trước đã
          </Link>
        </div>
      </div>
      <TournamentArt />
    </div>
  );
}

function HeroArt() {
  const N = 7;
  const marks: Record<string, "x" | "o"> = { "1,1": "o", "2,2": "x", "3,3": "x", "4,4": "x", "5,5": "x", "2,4": "o", "3,2": "o", "4,2": "o", "5,1": "o" };
  const win = new Set(["2,2", "3,3", "4,4", "5,5"]);
  return (
    <div className="relative mx-auto w-full max-w-[460px]" aria-hidden="true">
      <div className="card rotate-2 p-4" style={{ background: "var(--board)", boxShadow: "0 8px 0 var(--edge)" }}>
        <svg viewBox={`0 0 ${N * 40} ${N * 40}`} className="block w-full">
          {Array.from({ length: N + 1 }, (_, i) => (
            <g key={i} stroke="var(--board-line)" strokeWidth="2">
              <line x1={i * 40} y1={0} x2={i * 40} y2={N * 40} />
              <line x1={0} y1={i * 40} x2={N * 40} y2={i * 40} />
            </g>
          ))}
          {Object.entries(marks).map(([k, v]) => {
            const [x, y] = k.split(",").map(Number);
            const cx = x * 40 + 20;
            const cy = y * 40 + 20;
            return (
              <g key={k}>
                {win.has(k) && <rect x={x * 40 + 2} y={y * 40 + 2} width={36} height={36} rx={8} fill="var(--win)" />}
                {v === "x" ? (
                  <path d={`M${cx - 11} ${cy - 11}l22 22M${cx + 11} ${cy - 11}l-22 22`} stroke="var(--coral)" strokeWidth="6" strokeLinecap="round" />
                ) : (
                  <circle cx={cx} cy={cy} r={12} fill="none" stroke="var(--sky)" strokeWidth="5.5" />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <span className="bob absolute -top-6 -left-4" style={{ ["--r" as string]: "-12deg" }}>
        <StickerArt id="clap" size={68} />
      </span>
      <span className="bob absolute -right-3 -bottom-5" style={{ ["--r" as string]: "10deg", animationDelay: "-1.2s" }}>
        <StickerArt id="cow" size={68} />
      </span>
      <span className="bob absolute top-1/3 -right-8" style={{ animationDelay: "-2s" }}>
        <StickerArt id="heart" size={54} />
      </span>
      <span className="bob absolute -bottom-6 left-8" style={{ ["--r" as string]: "-20deg", animationDelay: "-0.6s" }}>
        <StickerArt id="brick" size={54} />
      </span>
    </div>
  );
}
