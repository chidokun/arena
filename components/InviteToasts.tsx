"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getGames, roomHref } from "@/lib/games/registry";
import type { Invite } from "@/lib/net/lobby";
import { Avatar } from "./Avatar";
import { useNet } from "./NetProvider";

type Toast = Invite & { key: number };

/** Lời mời vào phòng từ người chơi khác (gửi qua sảnh P2P). */
export function InviteToasts() {
  const { lobby } = useNet();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!lobby) return;
    return lobby.onInvite((inv) => {
      const key = Date.now() + Math.random();
      setToasts((t) => [...t.filter((x) => x.room !== inv.room), { ...inv, key }].slice(-3));
      setTimeout(() => setToasts((t) => t.filter((x) => x.key !== key)), 20000);
    });
  }, [lobby]);

  if (!toasts.length) return null;
  return (
    <div className="fixed right-4 bottom-4 left-4 z-50 grid justify-items-end gap-3 sm:left-auto" role="status" aria-live="polite">
      {toasts.map((t) => {
        const game = getGames().find((g) => g.slug === t.game);
        return (
          <div key={t.key} className="card flex w-full max-w-sm items-start gap-3 p-4" style={{ animation: "pop-in 220ms ease" }}>
            <Avatar p={t.from} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] leading-snug">
                <b>{t.from.name}</b> mời bạn vào phòng <b>{t.roomName}</b>
                {game ? ` (${game.name})` : ""}
              </p>
              <div className="mt-3 flex gap-2">
                <Link href={roomHref(t.game, t.room)} className="btn btn-sm btn-pen no-underline" onClick={() => setToasts((x) => x.filter((y) => y.key !== t.key))}>
                  Vào phòng
                </Link>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setToasts((x) => x.filter((y) => y.key !== t.key))}>
                  Để sau
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
