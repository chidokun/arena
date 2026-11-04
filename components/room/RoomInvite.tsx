"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { hasPage, roomHref, type GameDef } from "@/lib/games/registry";
import type { RoomAd } from "@/lib/net/lobby";
import { parseRoomLink, type RoomLink } from "@/lib/room-link";
import { SITE_URL } from "@/lib/site";
import { GameIcon } from "../GameIcon";
import { useGames } from "../GamesProvider";
import { HUE } from "../home/hue";
import { useNet } from "../NetProvider";

const base = process.env.BASE_PATH ?? "";
const SITE_HOST = new URL(SITE_URL).host;
const noop = () => () => {};

/** Link phòng Arena dán vào chat (chỉ của chính site) — hiện thành thẻ mời có nút vào phòng. */
export function roomLinkOf(text: string | undefined): RoomLink | null {
  if (!text?.includes("/games/")) return null;
  const hosts = typeof location === "undefined" || location.host === SITE_HOST ? [SITE_HOST] : [SITE_HOST, location.host];
  return parseRoomLink(text, { hosts, base, known: hasPage });
}

// Thông tin phòng đang mở trên sảnh (tên, số người, đang chơi hay chờ). Chỉ vẽ lại khi chính phòng này đổi, không theo
// nhịp tim của cả sảnh.
function useRoomAd(id: string): RoomAd | undefined {
  const { lobby } = useNet();
  return useSyncExternalStore(
    lobby?.store.subscribe ?? noop,
    () => lobby?.store.get().rooms.find((r) => r.id === id),
    () => undefined,
  );
}

export function useInviteGame(slug: string): GameDef | undefined {
  return useGames().find((g) => g.slug === slug);
}

const STATUS: Record<RoomAd["status"], string> = { waiting: "Đang chờ", playing: "Đang chơi", ended: "Vừa xong ván" };

export function RoomInviteCard({ link, here, fallback }: { link: RoomLink; here?: string; fallback: React.ReactNode }) {
  const game = useInviteGame(link.slug);
  const ad = useRoomAd(link.id);
  if (!game) return fallback;
  const hue = HUE[game.hue];
  const inside = here === link.id;
  // Phòng chưa thấy trên sảnh (chưa nối mạng, hoặc đã đóng): tiêu đề là tên game, dòng dưới là mã phòng.
  // Trạng thái đứng đầu: sidebar hẹp cắt đuôi dòng, còn tên game đã có logo.
  const detail = ad ? [STATUS[ad.status], `${ad.members}/${ad.cap} người`, game.name] : [`Mã phòng #${link.id}`];
  return (
    <div className="inline-block w-[min(264px,100%)] overflow-hidden rounded-2xl border-2 border-edge bg-surface text-left shadow-[0_3px_0_var(--edge)]">
      <div className="flex items-center gap-2.5 border-b-2 border-edge px-3 py-2.5" style={{ background: hue.soft }}>
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl border-2 border-edge bg-surface">
          <GameIcon game={game} size={34} />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-extrabold tracking-wide text-ink-2 uppercase">🎮 Mời vào phòng</span>
          <b className="block truncate font-display text-[16px] leading-tight font-extrabold">{ad?.name || game.name}</b>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] font-semibold text-ink-2">
            {ad && <span className="h-2 w-2 flex-none rounded-full border border-edge" style={{ background: ad.status === "playing" ? "var(--sun)" : ad.status === "waiting" ? "var(--lime)" : "var(--ink-3)" }} aria-hidden="true" />}
            <span className="truncate">{detail.join(" · ")}</span>
          </span>
        </span>
      </div>
      {link.rest && <p className="px-3 pt-2.5 text-[14.5px] leading-snug [overflow-wrap:anywhere]">{link.rest}</p>}
      <div className="p-3 pt-2.5">
        {inside ? (
          <span className="btn btn-sm w-full cursor-default opacity-70">✅ Bạn đang ở phòng này</span>
        ) : (
          <Link href={roomHref(link.slug, link.id)} className="btn btn-sm btn-pen w-full no-underline">
            Vào phòng ngay →
          </Link>
        )}
      </div>
    </div>
  );
}

/** Dòng tóm tắt cho bong bóng tin mới: không hiện cả đường link dài. */
export function InviteSummary({ link }: { link: RoomLink }) {
  const game = useInviteGame(link.slug);
  return (
    <>
      🎮 Mời vào phòng {game?.name ?? `#${link.id}`}
      {link.rest && ` — ${link.rest}`}
    </>
  );
}
