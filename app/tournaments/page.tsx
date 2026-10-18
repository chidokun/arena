import type { Metadata } from "next";
import Link from "next/link";
import { TOURNAMENT_PERKS, TournamentArt } from "@/components/home/TournamentArt";
import { shareMeta } from "@/lib/site";

export const metadata: Metadata = shareMeta({
  title: "Giải đấu — Sắp ra mắt",
  description: "Đăng nhập, tạo giải đấu và mời thật nhiều bạn bè cùng tranh cúp trên Arena. Tính năng giải đấu sắp ra mắt.",
  path: "/tournaments/",
});

const STEPS = [
  { n: "1", title: "Đăng nhập", text: "Một tài khoản để giữ tên, thành tích và các giải bạn đã tham gia.", tone: "var(--sky)" },
  { n: "2", title: "Tạo giải & gửi link", text: "Chọn game, đặt luật, rồi gửi link mời cả hội vào đăng ký.", tone: "var(--sun)" },
  { n: "3", title: "Đấu tới chung kết", text: "Mỗi người đấu từng vòng trên nhánh đấu cho tới khi tìm ra nhà vô địch.", tone: "var(--coral)" },
];

export default function Tournaments() {
  return (
    <>
      <section className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 pt-12 pb-10 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
        <div>
          <p className="chip bg-surface" style={{ color: "var(--coral)" }}>
            🏆 Sắp ra mắt
          </p>
          <h1 className="mt-5 font-display text-[44px] leading-[1.02] font-extrabold tracking-tight text-balance sm:text-[64px]">
            Giải đấu <span className="text-pen">cho cả hội</span>
          </h1>
          <p className="mt-5 max-w-[52ch] text-lg text-ink-2">
            Một ván thì chưa đã. Sắp tới bạn có thể đăng nhập, tạo giải đấu riêng và mời thật nhiều bạn bè cùng tham gia, cả nhóm cùng
            tranh cúp cho thêm phần vui.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <span className="btn h-12 px-6 text-base opacity-70" aria-disabled="true">
              ⏳ Đang phát triển…
            </span>
            <Link href="/#games" className="btn btn-pen h-12 px-6 text-base no-underline">
              Chơi game trong lúc chờ →
            </Link>
          </div>
        </div>
        <TournamentArt />
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <h2 className="mb-6 font-display text-3xl font-extrabold tracking-tight">Giải đấu sẽ có gì?</h2>
        <ul className="grid gap-5 md:grid-cols-3">
          {TOURNAMENT_PERKS.map((p) => (
            <li key={p.title} className="card p-6">
              <span className="text-4xl" aria-hidden="true">
                {p.icon}
              </span>
              <h3 className="mt-3 font-display text-xl font-extrabold">{p.title}</h3>
              <p className="mt-1.5 text-[15px] text-ink-2">{p.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <h2 className="mb-6 font-display text-3xl font-extrabold tracking-tight">Sẽ chơi thế nào?</h2>
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
