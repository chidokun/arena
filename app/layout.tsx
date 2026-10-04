import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { InviteToasts } from "@/components/InviteToasts";
import { LogoMark } from "@/components/Logo";
import { NetBadge } from "@/components/NetBadge";
import { NetProvider } from "@/components/NetProvider";
import { ProfileButton } from "@/components/ProfileButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { body, display } from "@/lib/fonts";
import "./globals.css";

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export const metadata: Metadata = {
  metadataBase: new URL("https://arena.nguyentuan.dev"),
  title: { default: "Arena — Đấu trường game đối kháng P2P", template: "%s · Arena" },
  description: "Vào phòng, rủ bạn bè và đấu ngay trên trình duyệt. Không đăng ký, không máy chủ — các trình duyệt nối trực tiếp với nhau.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f2ff" },
    { media: "(prefers-color-scheme: dark)", color: "#110d26" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${body.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <a
          href="#noi-dung"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
        >
          Bỏ qua tới nội dung
        </a>
        <NetProvider>
          <header className="sticky top-0 z-40 border-b-2 border-edge bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
              <Link href="/" className="flex items-center gap-2.5 no-underline">
                <LogoMark />
                <span className="font-display text-[22px] font-extrabold tracking-tight">Arena</span>
              </Link>
              <nav aria-label="Điều hướng chính" className="ml-3 hidden md:block">
                <Link href="/#games" className="rounded-lg px-3 py-1.5 text-[15px] font-semibold text-ink-2 no-underline hover:bg-sunken hover:text-ink">
                  Trò chơi
                </Link>
                <Link href="/games/caro/" className="rounded-lg px-3 py-1.5 text-[15px] font-semibold text-ink-2 no-underline hover:bg-sunken hover:text-ink">
                  Cờ Caro
                </Link>
                <Link href="/games/loto/" className="rounded-lg px-3 py-1.5 text-[15px] font-semibold text-ink-2 no-underline hover:bg-sunken hover:text-ink">
                  Lô Tô
                </Link>
              </nav>
              <div className="flex-1" />
              <NetBadge />
              <ThemeToggle />
              <ProfileButton />
            </div>
          </header>

          <main id="noi-dung" className="flex-1">
            {children}
          </main>
          <InviteToasts />
        </NetProvider>

        <footer className="mt-20 border-t-2 border-edge bg-surface">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-8 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="flex items-center gap-2 font-display text-base font-bold text-ink">
              <LogoMark className="h-6 w-6" /> Arena
            </p>
            <p className="max-w-[62ch]">
              Chạy hoàn toàn trên trình duyệt: các máy nối trực tiếp qua WebRTC, trạng thái phòng được đồng bộ bằng giao thức gossip. Không máy chủ
              game, không lưu dữ liệu.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
