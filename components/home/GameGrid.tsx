"use client";

import Link from "next/link";
import { gameHref, type GameDef } from "@/lib/games/registry";
import { countFor } from "@/lib/net/lobby";
import { useGames } from "../GamesProvider";
import { showMaintenance } from "../Maintenance";
import { useLobbyView, useWhere } from "../NetProvider";
import { Spinner } from "../Spinner";
import { HUE } from "./hue";

export function LiveStats() {
  useWhere({});
  const view = useLobbyView();
  // Chưa nối được ai thì sảnh chưa có dữ liệu thật — hiện vòng quay thay vì số 0 / "–" gây hiểu nhầm.
  const ready = view.connected;
  return (
    <div className="flex flex-wrap gap-3">
      <Stat value={ready ? view.users.length : null} label="đang online" tone="var(--lime)" />
      <Stat value={ready ? view.rooms.length : null} label="phòng đang mở" tone="var(--sun)" />
      <Stat value={ready ? view.rooms.filter((r) => r.status === "playing").length : null} label="ván đang đấu" tone="var(--coral)" />
    </div>
  );
}

function Stat({ value, label, tone }: { value: number | null; label: string; tone: string }) {
  return (
    <div className="card flex items-center gap-2 px-4 py-2.5" style={{ borderRadius: 14 }}>
      <span className="grid min-w-[1ch] place-items-center font-display text-2xl leading-8 font-extrabold tabular-nums" style={{ color: tone }}>
        {value ?? <Spinner />}
      </span>
      <span className="text-sm font-semibold text-ink-2">{label}</span>
    </div>
  );
}

export function GameGrid() {
  const view = useLobbyView();
  const games = useGames();
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {games.map((g) => (
        <li key={g.slug}>
          <GameCard game={g} counts={view.connected ? countFor(view, g.slug) : null} />
        </li>
      ))}
    </ul>
  );
}

function GameCard({ game, counts }: { game: GameDef; counts: { rooms: number; players: number } | null }) {
  const hue = HUE[game.hue];
  const body = (
    <>
      <div className="relative grid h-36 place-items-center overflow-hidden border-b-2 border-edge" style={{ background: hue.soft }}>
        <span className="text-[68px] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" aria-hidden="true">
          {game.emoji}
        </span>
        {game.status === "LIVE" && (
          <span className="chip absolute top-3 right-3 bg-surface" style={{ color: "var(--lime)" }}>
            <span className="live-dot" aria-hidden="true" /> Trực tuyến
          </span>
        )}
        {game.status === "MAINTENANCE" && (
          <span className="chip absolute top-3 right-3 bg-surface" style={{ color: "var(--sun)" }}>
            🛠️ Bảo trì
          </span>
        )}
        {game.status === "DEVELOPMENT" && <span className="chip absolute top-3 right-3 bg-surface text-ink-2">Sắp ra mắt</span>}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-[22px] font-extrabold tracking-tight">{game.name}</h3>
        <p className="mt-1 text-[14.5px] text-ink-2">{game.tagline}</p>
        <div className="mt-auto flex items-center gap-4 pt-4 text-sm font-bold">
          {game.status === "LIVE" ? (
            <>
              <span className="inline-flex items-center gap-1" title="Số phòng đang mở">
                🏠 {counts ? counts.rooms : <Spinner className="text-ink-3" />} phòng
              </span>
              <span className="inline-flex items-center gap-1" title="Số người đang ở game này">
                🙋 {counts ? counts.players : <Spinner className="text-ink-3" />} người
              </span>
            </>
          ) : (
            <span className="text-ink-3">{game.status === "MAINTENANCE" ? "Đang bảo trì, quay lại sau nha…" : "Đang phát triển…"}</span>
          )}
        </div>
      </div>
    </>
  );
  const cls = "card group flex h-full flex-col overflow-hidden no-underline transition-transform";
  if (game.status === "MAINTENANCE")
    return (
      <button type="button" className={`${cls} w-full cursor-pointer text-left opacity-90`} onClick={() => showMaintenance(game.slug)}>
        {body}
      </button>
    );
  if (game.status === "DEVELOPMENT")
    return (
      <div className={`${cls} opacity-75`} aria-disabled="true">
        {body}
      </div>
    );
  return (
    <Link href={gameHref(game.slug)} className={`${cls} hover:-translate-y-1`} style={{ boxShadow: `0 6px 0 var(--edge)` }}>
      {body}
    </Link>
  );
}
