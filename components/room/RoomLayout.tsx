"use client";

import Link from "next/link";
import { useState } from "react";
import { gameHref, getGame } from "@/lib/games/registry";
import { isKaixin } from "@/lib/stickers";
import { StickerArt } from "./Sticker";
import type { Flyer } from "./useRoom";

export function Notice({ emoji, title, children, spin }: { emoji: string; title: string; children?: React.ReactNode; spin?: boolean }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <div className="card flex flex-col items-center p-8 text-center sm:p-10">
        <span className={`text-6xl ${spin ? "bob" : ""}`} aria-hidden="true">
          {emoji}
        </span>
        <h1 className="mt-4 font-display text-2xl font-extrabold">{title}</h1>
        <div className="mt-2 flex flex-col items-center text-ink-2">{children}</div>
      </div>
    </div>
  );
}

/** Khung chung của phòng: thanh vị trí với nút mời / rời phòng, cột bàn chơi và cột người trong phòng – trò chuyện. */
export function RoomLayout({ id, slug, side, children }: { id: string; slug: string; side: React.ReactNode; children: React.ReactNode }) {
  const game = getGame(slug)!;
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <nav aria-label="Vị trí" className="min-w-0 basis-full text-sm font-semibold text-ink-3 sm:basis-auto sm:flex-1">
          <Link href="/" className="no-underline hover:text-ink">
            Trang chủ
          </Link>{" "}
          /{" "}
          <Link href={gameHref(slug)} className="no-underline hover:text-ink">
            {game.name}
          </Link>{" "}
          / <span className="text-ink">#{id}</span>
        </nav>
        <button type="button" className="btn btn-sm" onClick={copyLink}>
          {copied ? "✅ Đã chép" : "🔗 Chép link mời"}
        </button>
        <Link href={gameHref(slug)} className="btn btn-sm btn-ghost no-underline">
          Rời phòng
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">{children}</div>
        <div className="grid h-max gap-6">{side}</div>
      </div>
    </div>
  );
}

export function StatusChip({ status, round, playing = "đang đấu" }: { status: string; round: number; playing?: string }) {
  if (status === "playing")
    return (
      <span className="chip" style={{ color: "var(--coral)" }}>
        🔥 Ván {round} {playing}
      </span>
    );
  if (status === "ended")
    return (
      <span className="chip" style={{ color: "var(--grape)" }}>
        🏁 Hết ván {round}
      </span>
    );
  return (
    <span className="chip" style={{ color: "var(--lime)" }}>
      ⏳ Đang chờ
    </span>
  );
}

/** Sticker và pháo giấy bay ngang bàn chơi (đặt trong khối `relative`). */
export function Flyers({ flyers }: { flyers: Flyer[] }) {
  return flyers.map((f) => {
    const style = {
      left: `${f.left}%`,
      top: `${f.top}%`,
      animationDelay: `${f.delay ?? 0}ms`,
      ["--rot" as string]: `${f.rot ?? 0}deg`,
      ["--dx" as string]: `${f.dx ?? 0}px`,
      ["--dy" as string]: `${f.dy ?? 0}px`,
      ["--dir" as string]: f.dir ?? 1,
    };
    if (f.color)
      return <span key={f.key} className="fly-confetti" style={{ ...style, width: f.size, height: (f.size ?? 10) * 0.55, background: f.color }} aria-hidden="true" />;
    if (!f.sticker) return null;
    return (
      <span key={f.key} className={`fly ${isKaixin(f.sticker) ? "fly-kx" : `fly-${f.sticker}`}`} style={style} aria-hidden="true">
        <StickerArt id={f.sticker} size={f.size ?? 90} />
      </span>
    );
  });
}
