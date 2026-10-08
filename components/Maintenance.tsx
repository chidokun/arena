"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { refreshGames } from "@/lib/games/registry";
import { Dialog } from "./Dialog";
import { useGames, useGamesSynced } from "./GamesProvider";
import { Notice } from "./room/RoomLayout";

let notice: string | null = null;
const listeners = new Set<() => void>();

/** Bật popup "game đang bảo trì" (popup nằm ở layout nên vẫn còn sau khi chuyển trang). */
export function showMaintenance(slug: string | null) {
  notice = slug;
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

export function MaintenanceDialog() {
  const slug = useSyncExternalStore(subscribe, () => notice, () => null);
  const game = useGames().find((g) => g.slug === slug);
  const close = () => showMaintenance(null);
  return (
    <Dialog open={!!slug} onClose={close} title="Game đang bảo trì">
      <div className="flex flex-col items-center text-center">
        <span className="text-6xl" aria-hidden="true">
          🛠️
        </span>
        <p className="mt-3 text-[15.5px] text-ink-2">
          {game ? <b className="text-ink">{game.name}</b> : "Game này"} đang bảo trì, bạn vui lòng thử lại sau nha!
        </p>
        <button type="button" className="btn btn-pen mt-5" onClick={close}>
          Đã hiểu
        </button>
      </div>
    </Dialog>
  );
}

/** Chặn lobby/phòng của game đang bảo trì: đưa về trang chủ và bật popup. */
export function MaintenanceGate({ slug, children }: { slug: string; children: React.ReactNode }) {
  const router = useRouter();
  const status = useGames().find((g) => g.slug === slug)?.status;
  const synced = useGamesSynced();
  const blocked = status !== "LIVE";
  // Lúc build đang bảo trì thì chờ hỏi lại API — có thể đã mở lại mà chưa build lại.
  const kick = blocked && synced;

  useEffect(() => void refreshGames(), []);
  useEffect(() => {
    if (!kick) return;
    showMaintenance(slug);
    router.replace("/");
  }, [kick, slug, router]);

  if (!blocked) return children;
  return <Notice emoji="🛠️" title={kick ? "Game đang bảo trì" : "Đang kiểm tra trạng thái game…"} spin={!kick} />;
}
