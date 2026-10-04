import Link from "next/link";
import { GameGrid, LiveStats } from "@/components/home/GameGrid";

const STEPS = [
  { n: "1", title: "Chọn game", text: "Vào sảnh của game để xem các phòng đang mở và số người trong đó.", tone: "var(--sky)" },
  { n: "2", title: "Tạo hoặc vào phòng", text: "Chủ phòng đặt luật và số người tối đa, có quyền thêm hay mời người khác ra.", tone: "var(--sun)" },
  { n: "3", title: "Bấm “Vào chơi”", text: "Ngồi vào ghế là sẵn sàng. Chủ phòng bấm Bắt đầu; người vào sau chỉ được xem.", tone: "var(--coral)" },
];

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 pt-12 pb-10 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
          <div>
            <p className="chip bg-surface text-pen">⚡ Không đăng ký · Không máy chủ</p>
            <h1 className="mt-5 font-display text-[44px] leading-[1.02] font-extrabold tracking-tight text-balance sm:text-[64px]">
              Đấu trường mini <span className="text-pen">cho hội bạn</span> ngay trên trình duyệt
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg text-ink-2">
              Mở phòng, gửi link, vào chơi. Các trình duyệt nối thẳng với nhau qua WebRTC, chat và ném sticker trong lúc đấu.
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
      </section>

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

/** Minh hoạ bàn caro mini với quân cờ và sticker lơ lửng. */
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
      <span className="bob absolute -top-6 -left-4 text-6xl" style={{ ["--r" as string]: "-12deg" }}>
        👏
      </span>
      <span className="bob absolute -right-3 -bottom-5 text-6xl" style={{ ["--r" as string]: "10deg", animationDelay: "-1.2s" }}>
        🐄
      </span>
      <span className="bob absolute top-1/3 -right-8 text-5xl" style={{ animationDelay: "-2s" }}>
        ❤️
      </span>
      <span className="bob absolute -bottom-6 left-8 text-5xl" style={{ ["--r" as string]: "-20deg", animationDelay: "-0.6s" }}>
        🧱
      </span>
    </div>
  );
}
