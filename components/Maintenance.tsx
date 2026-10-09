"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { refreshGames } from "@/lib/games/registry";
import { Dialog } from "./Dialog";
import { useGames, useGamesSynced } from "./GamesProvider";
import { Notice } from "./room/RoomLayout";

let notice: string | null = null;
const listeners = new Set<() => void>();

/** Bật popup "game đang bảo trì" / "sắp ra mắt" (popup nằm ở layout nên vẫn còn sau khi chuyển trang). */
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
  const soon = game?.status === "DEVELOPMENT";
  const close = () => showMaintenance(null);
  return (
    <Dialog open={!!slug} onClose={close} title={soon ? "Game sắp ra mắt" : "Game đang bảo trì"}>
      <div className="flex flex-col items-center text-center">
        <span className="text-6xl" aria-hidden="true">
          {soon ? "🚧" : "🛠️"}
        </span>
        <p className="mt-3 text-[15.5px] text-ink-2">
          {game ? <b className="text-ink">{game.name}</b> : "Game này"} {soon ? "sắp ra mắt, bạn chờ thêm chút nha!" : "đang bảo trì, bạn vui lòng thử lại sau nha!"}
        </p>
        <button type="button" className="btn btn-pen mt-5" onClick={close}>
          Đã hiểu
        </button>
      </div>
    </Dialog>
  );
}

/** Chặn lobby/phòng của game chưa mở (bảo trì / sắp ra mắt): đưa về trang chủ và bật popup. */
export function MaintenanceGate({ slug, children }: { slug: string; children: React.ReactNode }) {
  const router = useRouter();
  const status = useGames().find((g) => g.slug === slug)?.status;
  const synced = useGamesSynced();
  const blocked = status !== "LIVE";
  // Lúc build chưa mở thì chờ hỏi lại API — trạng thái đổi không cần build lại, có thể giờ đã mở.
  const kick = blocked && synced;

  useEffect(() => void refreshGames(), []);
  useEffect(() => {
    if (!kick) return;
    showMaintenance(slug);
    router.replace("/");
  }, [kick, slug, router]);

  if (!blocked) return children;
  const title = !kick ? "Đang kiểm tra trạng thái game…" : status === "DEVELOPMENT" ? "Game sắp ra mắt" : "Game đang bảo trì";
  return <Notice emoji={status === "DEVELOPMENT" && kick ? "🚧" : "🛠️"} title={title} spin={!kick} />;
}
