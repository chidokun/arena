import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/Faq";
import { GameIcon } from "@/components/GameIcon";
import { gameHref, loadGames } from "@/lib/games/registry";
import { shareMeta } from "@/lib/site";

export const metadata: Metadata = shareMeta({
  title: "Bảng giá",
  description: "Arena hoàn toàn miễn phí: chơi mọi game đối kháng trên nền tảng, sắp tới có thêm lưu lịch sử chơi và giải đấu.",
  path: "/pricing/",
});

const NO_NEED = ["Không cần đăng ký", "Không cài app", "Không cần thẻ ngân hàng"];

const EXTRAS = [
  { icon: "🔗", title: "Mời bằng một đường link", text: "Tạo phòng, gửi link cho cả hội là vào chơi được ngay." },
  { icon: "💬", title: "Chat & sticker", text: "Vừa đấu vừa nhắn tin, thả tim, ném gạch trêu nhau." },
  { icon: "📱", title: "Điện thoại hay máy tính", text: "Chơi ngay trên trình duyệt, máy nào cũng được." },
  { icon: "🌙", title: "Giao diện sáng / tối", text: "Chơi khuya cũng không chói mắt." },
];

// Cái "giá" vui để chốt lại ý: thứ duy nhất phải bỏ ra là thời gian và tinh thần thể thao.
const REAL_COST = [
  { icon: "⏱️", text: "Vài phút rảnh rỗi" },
  { icon: "😂", text: "Một ít tiếng cười" },
  { icon: "🙈", text: "Chút sĩ diện khi thua bạn" },
];

const ROADMAP = [
  { icon: "📜", title: "Lưu lịch sử chơi", text: "Xem lại các ván đã đấu, thống kê thắng thua và thành tích của bạn.", tone: "var(--sky)" },
  { icon: "🏆", title: "Tạo và tham gia giải đấu", text: "Mở giải riêng, mời cả hội đăng ký và đấu theo nhánh tới chung kết.", tone: "var(--coral)", href: "/tournaments/" },
];

export default async function Pricing() {
  const games = (await loadGames()).filter((g) => g.status === "LIVE");
  const maxPlayers = Math.max(...games.map((g) => g.capacity.max));
  const features = [
    { title: "Tất cả các game đối kháng trên nền tảng", text: `${games.length} game đang mở, game mới ra cũng chơi được ngay.`, soon: false },
    { title: "Lưu lịch sử chơi", text: "Xem lại các ván đã đấu và thành tích của bạn.", soon: true },
    { title: "Tạo và tham gia giải đấu", text: "Mở giải riêng, mời cả hội cùng tranh cúp.", soon: true },
  ];
  const faq = [
    { q: "Arena có miễn phí thật không?", a: "Có. Mọi game đối kháng và các tính năng trong bảng giá đều miễn phí, không có gói trả phí hay giới hạn số ván." },
    {
      q: "Vậy Arena lấy kinh phí ở đâu?",
      a: "Arena hiển thị một ít quảng cáo để trang trải chi phí duy trì. Quảng cáo được giữ ở mức tối thiểu để không làm phiền lúc bạn đang chơi.",
    },
    { q: "Có cần tạo tài khoản không?", a: "Không. Bạn chỉ cần đặt tên và chọn avatar là vào chơi được ngay. Bạn bè của bạn cũng vậy." },
    { q: "Một phòng chơi được bao nhiêu người?", a: `Tuỳ từng game, có game đấu tay đôi, có game chơi được tới ${maxPlayers} người một phòng.` },
    {
      q: "Khi lịch sử chơi và giải đấu ra mắt thì có mất phí không?",
      a: "Không. Hai tính năng này đã nằm sẵn trong gói miễn phí ở trên, khi ra mắt bạn dùng được luôn.",
    },
  ];

  return (
    <>
      <section className="mx-auto max-w-[1280px] px-4 pt-12 pb-10 sm:px-6 lg:pt-20">
        <div className="text-center">
          <h1 className="font-display text-[44px] leading-[1.02] font-extrabold tracking-tight text-balance sm:text-[64px]">
            Bảng giá <span className="text-pen">đơn giản</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[52ch] text-lg text-ink-2">Arena miễn phí cho tất cả mọi người. Rủ bạn bè vào chơi thôi!</p>
          <ul className="mt-6 flex flex-wrap justify-center gap-2">
            {NO_NEED.map((t) => (
              <li key={t} className="chip bg-surface text-ink-2">
                <span style={{ color: "var(--lime)" }} aria-hidden="true">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto mt-12 max-w-[480px]">
          <p
            className="absolute -top-4 left-1/2 z-10 -translate-x-1/2 rounded-full border-2 border-edge px-4 py-1 font-display text-sm font-extrabold whitespace-nowrap text-white"
            style={{ background: "var(--pen)", boxShadow: "var(--shadow-sm)" }}
          >
            ⭐ Gói duy nhất, dành cho tất cả
          </p>
          <div className="card p-6 pt-8 sm:p-8 sm:pt-10">
            <p className="chip bg-surface" style={{ color: "var(--lime)" }}>
              🎉 Miễn phí
            </p>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="font-display text-6xl font-extrabold tracking-tight">0đ</span>
              <span className="text-ink-3">/ mãi mãi</span>
            </p>

            <ul className="mt-6 flex flex-col gap-4 border-t-2 border-rule pt-6">
              {features.map((f, i) => (
                <li key={f.title} className="flex gap-3">
                  <span
                    className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-edge text-sm font-extrabold text-white"
                    style={{ background: f.soon ? "var(--sun)" : "var(--lime)" }}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <div className="min-w-0">
                    <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-extrabold">
                      {f.title}
                      {f.soon && (
                        <span className="chip bg-surface px-2 text-[11px] leading-[1.5]" style={{ color: "var(--coral)" }}>
                          Sắp ra mắt
                        </span>
                      )}
                    </h2>
                    <p className="mt-0.5 text-[15px] text-ink-2">{f.text}</p>
                    {i === 0 && (
                      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Các game đang mở">
                        {games.map((g) => (
                          <li key={g.slug}>
                            <Link
                              href={gameHref(g.slug)}
                              title={g.name}
                              className="grid h-9 w-9 place-items-center rounded-lg border-2 border-rule bg-sunken no-underline transition-transform hover:-translate-y-0.5 hover:border-edge"
                            >
                              <GameIcon game={g} size={26} lazy />
                              <span className="sr-only">{g.name}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <Link href="/games/" className="btn btn-pen mt-8 h-12 w-full px-6 text-base no-underline">
              Chơi ngay →
            </Link>
            <p className="mt-3 text-center text-sm text-ink-3">Mất chưa tới 10 giây để vào ván đầu tiên.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <h2 className="mb-6 font-display text-3xl font-extrabold tracking-tight">Đã bao gồm sẵn</h2>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {EXTRAS.map((e) => (
            <li key={e.title} className="card p-6">
              <span className="text-4xl" aria-hidden="true">
                {e.icon}
              </span>
              <h3 className="mt-3 font-display text-xl font-extrabold">{e.title}</h3>
              <p className="mt-1.5 text-[15px] text-ink-2">{e.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <div className="card grid items-center gap-6 p-6 sm:p-8 md:grid-cols-[1fr_1.4fr]" style={{ background: "var(--sun-soft)" }}>
          <div>
            <h2 className="font-display text-3xl font-extrabold tracking-tight">Cái giá thật sự 😏</h2>
            <p className="mt-2 text-[15px] text-ink-2">Không tốn đồng nào, nhưng đã vào Arena thì bạn sẽ phải bỏ ra:</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {REAL_COST.map((c) => (
              <li key={c.text} className="flex items-center gap-3 rounded-xl border-2 border-edge bg-surface p-4 font-display font-extrabold">
                <span className="text-3xl" aria-hidden="true">
                  {c.icon}
                </span>
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <h2 className="font-display text-3xl font-extrabold tracking-tight">Sắp có thêm, vẫn miễn phí</h2>
        <p className="mt-2 mb-6 text-[15px] text-ink-2">Những tính năng đang được làm, ra mắt là có ngay trong gói của bạn.</p>
        <ul className="grid gap-5 md:grid-cols-2">
          {ROADMAP.map((r) => (
            <li key={r.title} className="card flex gap-4 p-6">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 border-edge text-2xl" style={{ background: r.tone }} aria-hidden="true">
                {r.icon}
              </span>
              <div>
                <h3 className="flex flex-wrap items-center gap-2 font-display text-xl font-extrabold">
                  {r.title}
                  <span className="chip bg-surface px-2 text-[11px] leading-[1.5]" style={{ color: "var(--coral)" }}>
                    Sắp ra mắt
                  </span>
                </h3>
                <p className="mt-1.5 text-[15px] text-ink-2">{r.text}</p>
                {r.href && (
                  <Link href={r.href} className="mt-2 inline-block text-[15px] font-bold text-pen">
                    Xem trước →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Faq items={faq} />

      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <div className="card p-8 text-center sm:p-12" style={{ background: "var(--pen-soft)" }}>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">Cả hội đã sẵn sàng chưa?</h2>
          <p className="mx-auto mt-3 max-w-[48ch] text-ink-2">Mở phòng, gửi link, và xem ai là người phải khao trà sữa hôm nay.</p>
          <Link href="/games/" className="btn btn-pen mt-6 h-12 px-8 text-base no-underline">
            Chọn game ngay →
          </Link>
        </div>
      </section>
    </>
  );
}
