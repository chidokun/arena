"use client";

import Link from "next/link";
import { gameHref, type GameDef } from "@/lib/games/registry";
import { countFor } from "@/lib/net/lobby";
import { useGames } from "../GamesProvider";
import { showMaintenance } from "../Maintenance";
import { useLobbyView, useWhere } from "../NetProvider";
import { HUE } from "./hue";

export function LiveStats() {
  useWhere({});
  const view = useLobbyView();
  return (
    <div className="flex flex-wrap gap-3">
      <Stat value={view.users.length || "–"} label="đang online" tone="var(--lime)" />
      <Stat value={view.rooms.length || "–"} label="phòng đang mở" tone="var(--sun)" />
      <Stat value={view.rooms.filter((r) => r.status === "playing").length || "–"} label="ván đang đấu" tone="var(--coral)" />
    </div>
  );
}

function Stat({ value, label, tone }: { value: number | string; label: string; tone: string }) {
  return (
    <div className="card flex items-baseline gap-2 px-4 py-2.5" style={{ borderRadius: 14 }}>
      <span className="font-display text-2xl font-extrabold tabular-nums" style={{ color: tone }}>
        {value}
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
          <GameCard game={g} counts={countFor(view, g.slug)} />
        </li>
      ))}
    </ul>
  );
}

function GameCard({ game, counts }: { game: GameDef; counts: { rooms: number; players: number } }) {
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
              <span title="Số phòng đang mở">🏠 {counts.rooms} phòng</span>
              <span title="Số người đang ở game này">🙋 {counts.players} người</span>
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
