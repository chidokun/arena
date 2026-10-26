"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DEFAULT_OPTIONS as CARO_DEFAULTS,
  normOptions as caroOptions,
  SIZES as CARO_SIZES,
  sizeLabel as caroSizeLabel,
  TURN_LIMITS as CARO_TURNS,
  type Size as CaroSize,
  type TurnLimit as CaroTurn,
} from "@/lib/games/caro";
import {
  DEFAULT_OPTIONS as BS_DEFAULTS,
  CLASSIC as BS_CLASSIC,
  MAX_SHIPS as BS_MAX_SHIPS,
  MIN_SHIPS as BS_MIN_SHIPS,
  modeLabel as bsModeLabel,
  normOptions as bsOptions,
  SIZE as BS_SIZE,
  TURN_LIMITS as BS_TURNS,
  type TurnLimit as BsTurn,
} from "@/lib/games/battleship";
import { DEFAULT_OPTIONS as CD_DEFAULTS, normOptions as cdOptions, SETUP_NAME as CD_SETUP_NAME, SETUPS as CD_SETUPS, type Setup as CdSetup } from "@/lib/games/co-cho";
import {
  DEFAULT_OPTIONS as DB_DEFAULTS,
  normOptions as dbOptions,
  SIZES as DB_SIZES,
  TURN_LIMITS as DB_TURNS,
  turnLabel as dbTurnLabel,
  type Size as DbSize,
  type TurnLimit as DbTurn,
} from "@/lib/games/dots-boxes";
import {
  DEFAULT_OPTIONS as DW_DEFAULTS,
  MAX_PLAYERS as DW_MAX,
  MIN_PLAYERS as DW_MIN,
  normOptions as dwOptions,
  ROUND_CHOICES as DW_ROUNDS,
  TIME_CHOICES as DW_TIMES,
} from "@/lib/games/draw-guess";
import {
  CLAIM_OPTIONS,
  claimLabel,
  DEFAULT_OPTIONS as XQ_DEFAULTS,
  MAX_PLAYERS as XQ_MAX,
  MIN_PLAYERS as XQ_MIN,
  normOptions as xqOptions,
  type ClaimMs,
} from "@/lib/games/xiangqi-role";
import { DEFAULT_PACE, PACE_NAMES, PACES, SHEET_COUNT } from "@/lib/games/loto";
import {
  DEFAULT_OPTIONS as MC_DEFAULTS,
  MAP_KEYS as MC_MAPS,
  MAPS as MC_MAP,
  MAX_PLAYERS as MC_MAX,
  MINE_CHOICES as MC_MINES,
  minesFor as mcMinesFor,
  normOptions as mcOptions,
  type MapKey as McMap,
  type Mines as McMines,
} from "@/lib/games/mine-control";
import {
  DEFAULT_OPTIONS as MS_DEFAULTS,
  density as msDensity,
  normOptions as msOptions,
  SIZE_KEYS as MS_SIZES,
  SIZES as MS_SIZE,
  type SizeKey as MsSize,
} from "@/lib/games/minesweeper";
import { DEFAULT_OPTIONS as OAQ_DEFAULTS, normOptions as oaqOptions, QUAN_NON } from "@/lib/games/oanquan";
import {
  DEFAULT_OPTIONS as KW_DEFAULTS,
  MODE_KEYS as KW_MODES,
  MODES as KW_MODE,
  normOptions as kwOptions,
  SIZE_KEYS as KW_SIZES,
  SIZES as KW_SIZE,
  type Mode as KwMode,
  type SizeKey as KwSize,
} from "@/lib/games/kawaii";
import { getGame, hostTitle, roomHref } from "@/lib/games/registry";
import {
  DEFAULT_OPTIONS as TX_DEFAULTS,
  LEVEL_KEYS as TX_LEVELS,
  LEVELS as TX_LEVEL,
  normOptions as txOptions,
  SIZE_KEYS as TX_SIZES,
  SIZES as TX_SIZE,
  type Level as TxLevel,
  type SizeKey as TxSize,
} from "@/lib/games/truc-xanh";
import {
  DEFAULT_OPTIONS as SD_DEFAULTS,
  LEVEL_KEYS,
  LEVELS,
  MAX_PLAYERS as SD_MAX,
  MODE_KEYS,
  MODES,
  normOptions as sdOptions,
  type Level,
  type Mode,
} from "@/lib/games/sudoku";
import {
  fmt as sxFmt,
  makeProblem as sxProblem,
  MODES as SX_MODE,
  presetsOf as sxPresets,
  timeLabel as sxTime,
  TIMES as SX_TIMES,
  type DesignTime as SxTime,
  type Mode as SxMode,
} from "@/lib/games/system-design";
import {
  DEFAULT_OPTIONS as TD_DEFAULTS,
  MAX_PLAYERS as TD_MAX,
  MODE_KEYS as TD_MODES,
  MODES as TD_MODE,
  normOptions as tdOptions,
  ROUNDS as TD_ROUNDS,
  TIMES as TD_TIMES,
  TOPICS as TD_TOPICS,
  type Mode as TdMode,
} from "@/lib/games/tam-dau";
import {
  DEFAULT_OPTIONS as UC_DEFAULTS,
  MAX_PLAYERS as UC_MAX,
  MIN_PLAYERS as UC_MIN,
  normOptions as ucOptions,
  ROLES as UC_ROLES,
} from "@/lib/games/undercover";
import { DEFAULT_OPTIONS, MAX_PLAYERS, MIN_PLAYERS, normOptions, ROLES, TALKS, talkName } from "@/lib/games/werewolf";
import { cleanName, randomId } from "@/lib/identity";
import type { RoomAd } from "@/lib/net/lobby";
import { stashCreate } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { Dialog } from "../Dialog";
import { GameIcon } from "../GameIcon";
import { HUE } from "../home/hue";
import { useLobbyView, useNet, useWhere } from "../NetProvider";
import { Spinner } from "../Spinner";
import { MineCount } from "../MineCount";
import { RulesButton } from "./RulesButton";

export function GameLobby({ slug }: { slug: string }) {
  const game = getGame(slug)!;
  useWhere({ game: slug });
  const view = useLobbyView();
  const rooms = view.rooms.filter((r) => r.game === slug);
  const here = view.users.filter((u) => u.game === slug);
  // Còn đang tìm thì danh sách phòng / người chưa phải dữ liệu thật — ẩn số đếm, hiện trạng thái đang tìm.
  const ready = view.connected || view.alone;
  const [creating, setCreating] = useState(false);
  const hue = HUE[game.hue];

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
      <nav aria-label="Vị trí" className="mb-5 text-sm font-semibold text-ink-3">
        <Link href="/" className="no-underline hover:text-ink">
          Trang chủ
        </Link>{" "}
        / <span className="text-ink">{game.name}</span>
      </nav>

      <header className="card flex flex-col gap-5 overflow-hidden p-6 sm:flex-row sm:items-center sm:p-8" style={{ background: hue.soft }}>
        <span className="grid h-24 w-24 flex-none place-items-center rounded-3xl border-2 border-edge bg-surface" style={{ boxShadow: "var(--shadow-sm)" }} aria-hidden="true">
          <GameIcon game={game} size={76} />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">{game.name}</h1>
          <p className="mt-2 max-w-[70ch] text-[15.5px] text-ink-2">{game.description}</p>
        </div>
        <div className="flex w-full flex-none flex-col gap-2.5 sm:w-80">
          <div className="flex gap-2">
            <button type="button" className="btn btn-pen h-12 min-w-0 flex-1 px-4 text-base" onClick={() => setCreating(true)}>
              + Tạo phòng
            </button>
            <RulesButton game={game} />
          </div>
          <JoinByCode slug={slug} />
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
        <section aria-labelledby="rooms-h">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="rooms-h" className="font-display text-2xl font-extrabold">
              Phòng đang mở {ready && <span className="text-ink-3">({rooms.length})</span>}
            </h2>
            {!ready && rooms.length > 0 && <span className="text-sm text-ink-3">Đang dò tìm phòng qua mạng P2P…</span>}
          </div>
          {rooms.length === 0 && !ready ? (
            <div className="card grid place-items-center gap-3 px-6 py-14 text-center" style={{ borderStyle: "dashed", boxShadow: "none" }}>
              <Spinner label={null} className="text-5xl text-ink-3" />
              <p className="font-display text-xl font-extrabold">Đang tìm phòng…</p>
              <p className="max-w-[46ch] text-[15px] text-ink-2">Đang dò tìm phòng qua mạng P2P, chờ chút nhé — hoặc cứ tạo phòng rồi gửi link cho bạn bè.</p>
              <button type="button" className="btn btn-pen mt-2" onClick={() => setCreating(true)}>
                Tạo phòng
              </button>
            </div>
          ) : rooms.length === 0 ? (
            <div className="card grid place-items-center gap-3 px-6 py-14 text-center" style={{ borderStyle: "dashed", boxShadow: "none" }}>
              <span className="text-5xl" aria-hidden="true">
                🏟️
              </span>
              <p className="font-display text-xl font-extrabold">Chưa có phòng nào</p>
              <p className="max-w-[46ch] text-[15px] text-ink-2">Tạo phòng rồi gửi link cho bạn bè — hoặc chờ một chút, phòng của người khác sẽ hiện ra ở đây.</p>
              <button type="button" className="btn btn-pen mt-2" onClick={() => setCreating(true)}>
                Tạo phòng đầu tiên
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,290px),1fr))] gap-4">
              {rooms.map((r) => (
                <li key={r.id}>
                  <RoomCard room={r} slug={slug} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside aria-labelledby="here-h" className="card h-max p-5">
          <h2 id="here-h" className="flex items-center gap-2 font-display text-lg font-extrabold">
            {ready ? <span className="live-dot" aria-hidden="true" /> : <Spinner label={null} className="text-sun" />} Đang ở {game.name}
            {ready && ` (${here.length})`}
          </h2>
          {ready ? (
            <ul className="mt-3 grid gap-2.5">
              {here.slice(0, 30).map((u) => (
                <li key={u.uid} className="flex items-center gap-2.5">
                  <Avatar p={u} size={30} />
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{u.name}</span>
                  <span className="text-xs text-ink-3">{u.room ? "trong phòng" : "ở sảnh"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 flex items-center gap-2.5 py-1 text-[14.5px] font-semibold text-ink-3">
              <Spinner label="Đang tìm người chơi…" className="text-xl" /> Đang tìm người chơi…
            </p>
          )}
        </aside>
      </div>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Tạo phòng mới">
        {creating && <CreateForm slug={slug} />}
      </Dialog>
    </div>
  );
}

const stamp = (t: number) =>
  new Date(t).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function RoomCard({ room, slug }: { room: RoomAd; slug: string }) {
  const loto = room.game === "loto";
  const wolf = room.game === "werewolf";
  const spy = room.game === "undercover";
  const sudoku = room.game === "sudoku";
  const xiangqi = room.game === "xiangqi";
  const xiangqiRole = room.game === "xiangqi-role";
  const c4 = room.game === "connect-four";
  const bs = room.game === "battleship";
  const draw = room.game === "draw-guess";
  const oaq = room.game === "oanquan";
  const chess = room.game === "chess";
  const dots = room.game === "dots-boxes";
  const coChep = room.game === "co-chep";
  const mc = room.game === "mine-control";
  const kw = room.game === "kawaii";
  const tx = room.game === "truc-xanh";
  const ms = room.game === "minesweeper";
  const rv = room.game === "reversi";
  const cd = room.game === "co-cho";
  const sx = room.game === "system-design";
  const td = room.game === "citta-challenge";
  const full = room.cap > 0 && room.members >= room.cap;
  const playing = room.status === "playing";
  const noSheets = loto && (room.sheets ?? 0) >= room.seats;
  const status = playing
    ? {
        label: loto
          ? "Đang kêu số"
          : wolf || spy
            ? "Đang chơi"
            : sudoku
              ? "Đang giải"
                : xiangqiRole
                  ? "Đang nhập vai"
                  : xiangqi
                    ? "Đang đấu tướng"
                    : c4
                      ? "Đang thả cờ"
                      : bs
                        ? "Đang giao chiến"
                        : draw
                          ? "Đang vẽ"
                          : oaq
                            ? "Đang rải quân"
                            : chess
                              ? "Đang đấu cờ"
                              : dots
                                ? "Đang nối ô"
                                : coChep
                                  ? "Đang chọi đá"
                                  : mc
                                    ? "Đang dò mìn"
                                    : kw
                                      ? "Đang nối thú"
                                      : tx
                                        ? "Đang lật ô"
                                        : ms
                                          ? "Đang gỡ mìn"
                                          : rv
                                            ? "Đang lật cờ"
                                            : cd
                                              ? "Đang chặn chó"
                                              : sx
                                                ? "Đang thiết kế"
                                                : td
                                                  ? "Đang tĩnh tâm"
                                                  : "Đang đấu",
        color: "var(--coral)",
      }
    : room.status === "ended"
      ? { label: "Vừa xong ván", color: "var(--grape)" }
      : { label: "Đang chờ", color: "var(--lime)" };
  return (
    <article className="card flex h-full flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-xl font-extrabold">{room.name}</h3>
          <p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-ink-2" title={hostTitle(room.game)}>
            <Avatar p={{ avatar: room.hostAvatar, color: "var(--sunken)" }} size={22} /> 👑 <b className="truncate">{room.hostName}</b>
          </p>
        </div>
        <span className="chip flex-none" style={{ color: status.color }}>
          {status.label}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 text-[13px] font-bold">{loto ? (
          <LotoChips room={room} />
        ) : wolf ? (
          <WolfChips room={room} />
        ) : spy ? (
          <UcChips room={room} />
        ) : sudoku ? (
          <SudokuChips room={room} />
        ) : xiangqi ? (
          <XiangqiChips room={room} />
        ) : chess ? (
          <ChessChips room={room} />
        ) : xiangqiRole ? (
          <XiangqiRoleChips room={room} />
        ) : c4 ? (
          <ConnectFourChips room={room} />
        ) : bs ? (
          <BattleshipChips room={room} />
        ) : draw ? (
          <DrawGuessChips room={room} />
        ) : oaq ? (
          <OAnQuanChips room={room} />
        ) : dots ? (
          <DotsBoxesChips room={room} />
        ) : coChep ? (
          <CoChepChips room={room} />
        ) : mc ? (
          <MineControlChips room={room} />
        ) : kw ? (
          <KawaiiChips room={room} />
        ) : tx ? (
          <TrucXanhChips room={room} />
        ) : ms ? (
          <MinesweeperChips room={room} />
        ) : rv ? (
          <ReversiChips room={room} />
        ) : cd ? (
          <CoChoChips room={room} />
        ) : sx ? (
          <SystemDesignChips room={room} />
        ) : td ? (
          <TamDauChips room={room} />
        ) : (
          <CaroChips room={room} />
        )}</div>
      <div className="mt-auto flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5 font-mono text-xs text-ink-3">
          <span>#{room.id}</span>
          {room.since ? (
            <time dateTime={new Date(room.since).toISOString()} title={`${status.label} từ lúc này`}>
              {stamp(room.since)}
            </time>
          ) : null}
        </div>
        {full ? (
          <span className="btn btn-sm" aria-disabled="true" style={{ opacity: 0.5 }}>
            Phòng đầy
          </span>
        ) : (
          <Link href={roomHref(slug, room.id)} className={`btn btn-sm no-underline ${playing || noSheets ? "btn-sun" : "btn-pen"}`}>
            {playing || noSheets ? "Vào xem" : "Vào phòng"}
          </Link>
        )}
      </div>
    </article>
  );
}

function CaroChips({ room }: { room: RoomAd }) {
  const { size, blockTwoEnds, turn } = caroOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🪑 {room.players}/{room.seats} ghế
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        ▦ {caroSizeLabel(size)}
      </span>
      {blockTwoEnds && <span className="rounded-lg bg-sun-soft px-2.5 py-1">🚧 Chặn 2 đầu</span>}
      {turn > 0 && <span className="rounded-lg bg-sun-soft px-2.5 py-1">⏱ {dbTurnLabel(turn)}/lượt</span>}
    </>
  );
}

function ConnectFourChips({ room }: { room: RoomAd }) {
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🪑 {room.players}/{room.seats} ghế
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-sky-soft px-2.5 py-1">▦ 7×6 · nối 4</span>
    </>
  );
}

function ReversiChips({ room }: { room: RoomAd }) {
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🪑 {room.players}/{room.seats} ghế
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-lime-soft px-2.5 py-1">▦ 8×8 · lật quân</span>
    </>
  );
}

function CoChoChips({ room }: { room: RoomAd }) {
  const { setup } = cdOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🪑 {room.players}/{room.seats} ghế
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-sun-soft px-2.5 py-1">🐕 Xếp {CD_SETUP_NAME[setup].toLowerCase()}</span>
    </>
  );
}

function CoChepChips({ room }: { room: RoomAd }) {
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🙋 {room.players}/{room.seats} người chơi
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-lime-soft px-2.5 py-1">🏠 Chiếm nhà</span>
    </>
  );
}

function MineControlChips({ room }: { room: RoomAd }) {
  const o = mcOptions(room.opts);
  const { w, h } = MC_MAP[o.map];
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🙋 {room.players}/{room.seats} người chơi
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-sky-soft px-2.5 py-1">
        ▦ {w}×{h} · 💣 {o.mines}
      </span>
    </>
  );
}

function DotsBoxesChips({ room }: { room: RoomAd }) {
  const { size, turn } = dbOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🪑 {room.players}/{room.seats} ghế
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-coral-soft px-2.5 py-1">
        ▦ {size}×{size} ô
      </span>
      {turn > 0 && <span className="rounded-lg bg-sun-soft px-2.5 py-1">⏱ {dbTurnLabel(turn)}/lượt</span>}
    </>
  );
}

function OAnQuanChips({ room }: { room: RoomAd }) {
  const { quanNon } = oaqOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🪑 {room.players}/{room.seats} ghế
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-sun-soft px-2.5 py-1">{quanNon ? "🚫 Cấm ăn quan non" : "✅ Được ăn quan non"}</span>
    </>
  );
}

function BattleshipChips({ room }: { room: RoomAd }) {
  const { chain, turn, mode } = bsOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🪑 {room.players}/{room.seats} ghế
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-lime-soft px-2.5 py-1">
        ▦ {BS_SIZE}×{BS_SIZE} · {bsModeLabel(mode)} · {mode === "basic" ? `${BS_CLASSIC.length} tàu` : `${BS_MIN_SHIPS}–${BS_MAX_SHIPS} tàu tự chọn`}
      </span>
      {chain && <span className="rounded-lg bg-sun-soft px-2.5 py-1">🎯 Trúng bắn tiếp</span>}
      {turn > 0 && <span className="rounded-lg bg-sun-soft px-2.5 py-1">⏱ {dbTurnLabel(turn)}/lượt</span>}
    </>
  );
}

function DrawGuessChips({ room }: { room: RoomAd }) {
  const opts = dwOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🙋 {room.players}/{room.seats} người chơi
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-grape-soft px-2.5 py-1">
        🔁 {opts.rounds} vòng · ⏱ {opts.time}s
      </span>
    </>
  );
}

function XiangqiChips({ room }: { room: RoomAd }) {
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🪑 {room.players}/{room.seats} ghế
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-coral-soft px-2.5 py-1">🔴 Đỏ đi trước · đổi bên mỗi ván</span>
    </>
  );
}

function ChessChips({ room }: { room: RoomAd }) {
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🪑 {room.players}/{room.seats} ghế
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-grape-soft px-2.5 py-1">⚪ Trắng đi trước · đổi bên mỗi ván</span>
    </>
  );
}

function LotoChips({ room }: { room: RoomAd }) {
  const sheets = room.sheets ?? 0;
  const pace = Number(room.opts?.interval) || DEFAULT_PACE;
  return (
    <>
      <span className={`rounded-lg px-2.5 py-1 ${sheets >= room.seats ? "bg-coral-soft" : "bg-sunken"}`}>
        🎫 {sheets >= room.seats ? "Hết tờ" : `${sheets}/${room.seats} tờ`}
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">🙋 {room.players} người chơi</span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">👥 {room.members} trong phòng</span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">⏱ {pace / 1000}s/số</span>
    </>
  );
}

function WolfChips({ room }: { room: RoomAd }) {
  const opts = normOptions(room.opts);
  const roles = (["seer", "guard", "witch"] as const).filter((r) => opts[r]);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🙋 {room.players}/{room.seats} dân làng
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">👥 {room.members} trong phòng</span>
      {opts.hostPlays && <span className="rounded-lg bg-sunken px-2.5 py-1">🎩 Quản trò chơi cùng</span>}
      <span className="rounded-lg bg-sunken px-2.5 py-1">🗣️ {opts.talk ? `${opts.talk / 60} phút thảo luận` : "Quản trò điều khiển"}</span>
      <span className="rounded-lg bg-grape-soft px-2.5 py-1" title={["wolf" as const, ...roles].map((r) => ROLES[r].name).join(", ")}>
        🐺{opts.wolves ? `×${opts.wolves}` : ""} {roles.map((r) => ROLES[r].emoji).join(" ")}
      </span>
    </>
  );
}

function UcChips({ room }: { room: RoomAd }) {
  const opts = ucOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🙋 {room.players}/{room.seats} người chơi
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">👥 {room.members} trong phòng</span>
      {!opts.hostPlays && <span className="rounded-lg bg-sunken px-2.5 py-1">🎩 Chủ phòng điều hành</span>}
      <span className="rounded-lg bg-sky-soft px-2.5 py-1" title={["civilian", "undercover", ...(opts.white ? ["white"] : [])].map((r) => UC_ROLES[r as "white"].team).join(", ")}>
        {UC_ROLES.civilian.emoji} {UC_ROLES.undercover.emoji}
        {opts.undercovers ? `×${opts.undercovers}` : ""} {opts.white ? `${UC_ROLES.white.emoji}${opts.whites > 1 ? `×${opts.whites}` : ""}` : ""}
      </span>
    </>
  );
}

function KawaiiChips({ room }: { room: RoomAd }) {
  const { size, mode } = kwOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">🙋 {room.players} người chơi</span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">👥 {room.members} trong phòng</span>
      <span className="rounded-lg bg-sun-soft px-2.5 py-1">
        ▦ {KW_SIZE[size].label} {KW_SIZE[size].w}×{KW_SIZE[size].h}
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        {KW_MODE[mode].emoji} {KW_MODE[mode].name}
      </span>
    </>
  );
}

function MinesweeperChips({ room }: { room: RoomAd }) {
  const { size, mines } = msOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">🙋 {room.players} người chơi</span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">👥 {room.members} trong phòng</span>
      <span className="rounded-lg bg-coral-soft px-2.5 py-1">
        ▦ {MS_SIZE[size].label} {MS_SIZE[size].w}×{MS_SIZE[size].h}
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        💣 {mines} mìn · {msDensity(size, mines)}%
      </span>
    </>
  );
}

function TrucXanhChips({ room }: { room: RoomAd }) {
  const { size, level } = txOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">🙋 {room.players} người chơi</span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">👥 {room.members} trong phòng</span>
      <span className="rounded-lg bg-lime-soft px-2.5 py-1">
        ▦ {TX_SIZE[size].label} {TX_SIZE[size].w}×{TX_SIZE[size].h}
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        {TX_LEVEL[level].emoji} Mức {TX_LEVEL[level].label}
      </span>
    </>
  );
}

function SudokuChips({ room }: { room: RoomAd }) {
  const opts = sdOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🙋 {room.players}/{room.seats} người chơi
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">👥 {room.members} trong phòng</span>
      <span className="rounded-lg bg-lime-soft px-2.5 py-1">
        {LEVELS[opts.level].emoji} {LEVELS[opts.level].name}
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        {MODES[opts.mode].emoji} {MODES[opts.mode].name}
      </span>
    </>
  );
}

function SystemDesignChips({ room }: { room: RoomAd }) {
  const { mode, target, budget, time } = room.opts as { mode?: SxMode; target?: number; budget?: number; time?: SxTime };
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">🙋 {room.players} người chơi</span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">👥 {room.members} trong phòng</span>
      {mode === "expert" && (
        <span className="rounded-lg bg-grape-soft px-2.5 py-1">
          {SX_MODE.expert.emoji} {SX_MODE.expert.name}
        </span>
      )}
      {typeof target === "number" && <span className="rounded-lg bg-sky-soft px-2.5 py-1">🎯 {sxFmt(target)} TPS</span>}
      {typeof budget === "number" && <span className="rounded-lg bg-sun-soft px-2.5 py-1">💰 {sxFmt(budget)}</span>}
      {SX_TIMES.includes(time as SxTime) && <span className="rounded-lg bg-sunken px-2.5 py-1">⏱ {sxTime(time as SxTime)}</span>}
    </>
  );
}

function TamDauChips({ room }: { room: RoomAd }) {
  const { mode, topics, timer } = tdOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🙋 {room.players}/{room.seats} người chơi
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">👥 {room.members} trong phòng</span>
      <span className="rounded-lg bg-sun-soft px-2.5 py-1">
        {TD_MODE[mode].emoji} {TD_MODE[mode].name}
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1" title={topics.map((t) => TD_TOPICS[t].name).join(", ")}>
        {topics.map((t) => TD_TOPICS[t].emoji).join("")} {topics.length} chủ đề
      </span>
      {timer && <span className="rounded-lg bg-sunken px-2.5 py-1">⏱ Giới hạn giờ</span>}
    </>
  );
}

function XiangqiRoleChips({ room }: { room: RoomAd }) {
  const opts = xqOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        ♟️ {room.players}/{room.seats} role
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">👥 {room.members} trong phòng</span>
      <span className="rounded-lg bg-sun-soft px-2.5 py-1">⏱ Claim {claimLabel(opts.claimMs)}</span>
    </>
  );
}

function JoinByCode({ slug }: { slug: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const id = code.trim().replace(/^#/, "").toLowerCase();
  return (
    <form
      className="field-row flex w-full gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (id) router.push(roomHref(slug, id));
      }}
    >
      <label htmlFor="room-code" className="sr-only">
        Mã phòng
      </label>
      <input id="room-code" className="field !min-h-[38px] min-w-0 flex-1 !py-1 text-sm" placeholder="Mã phòng" value={code} onChange={(e) => setCode(e.target.value)} />
      <button type="submit" className="btn btn-sm" disabled={!id}>
        Vào
      </button>
    </form>
  );
}

function CreateForm({ slug }: { slug: string }) {
  const game = getGame(slug)!;
  const router = useRouter();
  const { profile } = useNet();
  const [name, setName] = useState(`Phòng của ${profile?.name ?? "tôi"}`);
  const [cap, setCap] = useState(game.capacity.default);
  const [size, setSize] = useState<CaroSize>(CARO_DEFAULTS.size);
  const [blockTwoEnds, setBlock] = useState(CARO_DEFAULTS.blockTwoEnds);
  const [caroTurn, setCaroTurn] = useState<CaroTurn>(CARO_DEFAULTS.turn);
  const [pace, setPace] = useState(DEFAULT_PACE);
  const [talk, setTalk] = useState(DEFAULT_OPTIONS.talk);
  const [hostPlays, setHostPlays] = useState(UC_DEFAULTS.hostPlays);
  const [level, setLevel] = useState<Level>(SD_DEFAULTS.level);
  const [mode, setMode] = useState<Mode>(SD_DEFAULTS.mode);
  const [claimMs, setClaimMs] = useState<ClaimMs>(XQ_DEFAULTS.claimMs);
  const [chain, setChain] = useState(BS_DEFAULTS.chain);
  const [bsTurn, setBsTurn] = useState<BsTurn>(BS_DEFAULTS.turn);
  const [bsMode, setBsMode] = useState(BS_DEFAULTS.mode);
  const [rounds, setRounds] = useState(DW_DEFAULTS.rounds);
  const [drawTime, setDrawTime] = useState(DW_DEFAULTS.time);
  const [quanNon, setQuanNon] = useState(OAQ_DEFAULTS.quanNon);
  const [dotsSize, setDotsSize] = useState<DbSize>(DB_DEFAULTS.size);
  const [dotsTurn, setDotsTurn] = useState<DbTurn>(DB_DEFAULTS.turn);
  const [mcMap, setMcMap] = useState<McMap>(MC_DEFAULTS.map);
  const [mcMines, setMcMines] = useState<McMines>(MC_DEFAULTS.mines);
  const [kwSize, setKwSize] = useState<KwSize>(KW_DEFAULTS.size);
  const [kwMode, setKwMode] = useState<KwMode>(KW_DEFAULTS.mode);
  const [txSize, setTxSize] = useState<TxSize>(TX_DEFAULTS.size);
  const [txLevel, setTxLevel] = useState<TxLevel>(TX_DEFAULTS.level);
  const [msSize, setMsSize] = useState<MsSize>(MS_DEFAULTS.size);
  const [msMines, setMsMines] = useState(MS_DEFAULTS.mines);
  const [cdSetup, setCdSetup] = useState<CdSetup>(CD_DEFAULTS.setup);
  const [sxPreset, setSxPreset] = useState("");
  const [sxMode, setSxMode] = useState<SxMode>("basic");
  const [tdMode, setTdMode] = useState<TdMode>(TD_DEFAULTS.mode);
  const [tdTimer, setTdTimer] = useState(TD_DEFAULTS.timer);
  const [sxTimeLimit, setSxTimeLimit] = useState<SxTime>(300);
  const loto = slug === "loto";
  const wolf = slug === "werewolf";
  const spy = slug === "undercover";
  const sudoku = slug === "sudoku";
  const xiangqi = slug === "xiangqi";
  const xiangqiRole = slug === "xiangqi-role";
  const c4 = slug === "connect-four";
  const bs = slug === "battleship";
  const draw = slug === "draw-guess";
  const oaq = slug === "oanquan";
  const chess = slug === "chess";
  const dots = slug === "dots-boxes";
  const coChep = slug === "co-chep";
  const mc = slug === "mine-control";
  const kw = slug === "kawaii";
  const tx = slug === "truc-xanh";
  const ms = slug === "minesweeper";
  const rv = slug === "reversi";
  const cd = slug === "co-cho";
  const sx = slug === "system-design";
  const td = slug === "citta-challenge";
  const seats = game.seats.min;
  const clean = cleanName(name);

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!clean) return;
        const id = randomId(6);
        if (loto) {
          const seed = crypto.getRandomValues(new Uint32Array(1))[0];
          stashCreate(id, { name: clean, cap: 0, seats: SHEET_COUNT, opts: { seed, interval: pace } });
        } else if (wolf) {
          stashCreate(id, { name: clean, cap: 0, seats: MAX_PLAYERS, opts: { ...DEFAULT_OPTIONS, talk } });
        } else if (spy) {
          stashCreate(id, { name: clean, cap: 0, seats: UC_MAX, opts: { ...UC_DEFAULTS, hostPlays } });
        } else if (sudoku) {
          stashCreate(id, { name: clean, cap: 0, seats: SD_MAX, opts: { level, mode } });
        } else if (kw) {
          stashCreate(id, { name: clean, cap: 0, seats: 0, opts: { size: kwSize, mode: kwMode } });
        } else if (tx) {
          stashCreate(id, { name: clean, cap: 0, seats: 0, opts: { size: txSize, level: txLevel } });
        } else if (ms) {
          stashCreate(id, { name: clean, cap: 0, seats: 0, opts: msOptions({ size: msSize, mines: msMines }) });
        } else if (sx) {
          const problem = sxProblem(crypto.getRandomValues(new Uint32Array(1))[0], sxPreset || undefined, sxTimeLimit, sxMode);
          stashCreate(id, { name: clean, cap: 0, seats: 0, opts: { problem } });
        } else if (td) {
          stashCreate(id, { name: clean, cap: 0, seats: TD_MAX, opts: tdOptions({ mode: tdMode, timer: tdTimer }) });
        } else if (xiangqi || c4 || chess || rv) stashCreate(id, { name: clean, cap, seats, opts: {} });
        else if (cd) stashCreate(id, { name: clean, cap, seats, opts: { setup: cdSetup } });
        else if (bs) stashCreate(id, { name: clean, cap, seats, opts: { chain, turn: bsTurn, mode: bsMode } });
        else if (oaq) stashCreate(id, { name: clean, cap, seats, opts: { quanNon } });
        else if (dots) stashCreate(id, { name: clean, cap, seats, opts: { size: dotsSize, turn: dotsTurn } });
        else if (coChep) stashCreate(id, { name: clean, cap, seats: game.seats.max, opts: {} });
        else if (mc) stashCreate(id, { name: clean, cap, seats: MC_MAX, opts: { map: mcMap, mines: mcMines } });
        else if (draw) stashCreate(id, { name: clean, cap, seats: DW_MAX, opts: { ...DW_DEFAULTS, rounds, time: drawTime } });
        else if (xiangqiRole) stashCreate(id, { name: clean, cap: 0, seats: XQ_MAX, opts: { claimMs } });
        else stashCreate(id, { name: clean, cap, seats, opts: { size, blockTwoEnds, turn: caroTurn } });
        router.push(roomHref(slug, id));
      }}
    >
      <div>
        <label htmlFor="cr-name" className="mb-1.5 block text-sm font-bold">
          Tên phòng
        </label>
        <input id="cr-name" className="field" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
      </div>
      {xiangqi ? (
        <>
          <CapacityField cap={cap} setCap={setCap} min={Math.max(game.capacity.min, seats)} max={game.capacity.max} seats={seats} />
          <p className="rounded-xl bg-coral-soft p-3 text-[13.5px] text-ink-2">
            🀄 Hai người chơi, quân Đỏ đi trước và đổi bên sau mỗi ván. Chiếu bí hoặc khiến đối phương hết nước đi là thắng; chiếu dai (lặp thế cờ mà nước nào cũng chiếu) bị xử thua.
          </p>
        </>
      ) : chess ? (
        <>
          <CapacityField cap={cap} setCap={setCap} min={Math.max(game.capacity.min, seats)} max={game.capacity.max} seats={seats} />
          <p className="rounded-xl bg-grape-soft p-3 text-[13.5px] text-ink-2">
            ♟️ Hai người chơi, quân Trắng đi trước và đổi bên sau mỗi ván. Đủ luật nhập thành, bắt tốt qua đường, phong cấp; chiếu hết là thắng, hết nước
            đi mà không bị chiếu là hoà.
          </p>
        </>
      ) : c4 ? (
        <>
          <CapacityField cap={cap} setCap={setCap} min={Math.max(game.capacity.min, seats)} max={game.capacity.max} seats={seats} />
          <p className="rounded-xl bg-sky-soft p-3 text-[13.5px] text-ink-2">
            🔵 Hai người chơi lần lượt thả quân vào bàn 7 cột × 6 hàng — quân rơi xuống ô trống thấp nhất. Ai nối được 4 quân liên tiếp theo hàng ngang,
            dọc hoặc chéo trước thì thắng; đầy bàn là hoà. Quân Đỏ đi trước, đổi người đi trước sau mỗi ván.
          </p>
        </>
      ) : rv ? (
        <>
          <CapacityField cap={cap} setCap={setCap} min={Math.max(game.capacity.min, seats)} max={game.capacity.max} seats={seats} />
          <p className="rounded-xl bg-lime-soft p-3 text-[13.5px] text-ink-2">
            ⚫ Hai người chơi lần lượt đặt quân trên bàn 8×8 sao cho kẹp được quân đối thủ theo hàng ngang, dọc hoặc chéo — cả dãy bị kẹp lật sang màu
            mình. Hết nước thì bị bỏ lượt; cả hai cùng hết nước thì ai nhiều quân hơn thắng. Quân Đen đi trước, đổi người đi trước sau mỗi ván.
          </p>
        </>
      ) : cd ? (
        <>
          <CapacityField cap={cap} setCap={setCap} min={Math.max(game.capacity.min, seats)} max={game.capacity.max} seats={seats} />
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Xếp quân</legend>
            <div className="grid grid-cols-2 gap-2">
              {CD_SETUPS.map((s) => (
                <button key={s} type="button" onClick={() => setCdSetup(s)} aria-pressed={cdSetup === s} className={`btn !px-2 ${cdSetup === s ? "btn-sun" : ""}`}>
                  {CD_SETUP_NAME[s]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              {cdSetup === "side" ? "Mỗi bên giữ hai góc cùng một cạnh — Đỏ đứng phía chó canh." : "Mỗi bên giữ hai góc trên một đường chéo."} Đổi được trong phòng trước mỗi ván.
            </p>
          </fieldset>
          <p className="rounded-xl bg-sun-soft p-3 text-[13.5px] text-ink-2">
            🐕 Bàn hình vuông kẻ hai đường chéo, mỗi bên hai nắp chai, tâm để trống. Lần lượt đi một quân theo đường kẻ sang điểm trống kề nó — cạnh có chó canh
            thì không được đi. Tới lượt mà không còn quân nào đi được là thua; thế cờ lặp lại 3 lần thì hoà. Quân Đỏ đi trước, đổi người đi trước sau mỗi ván.
          </p>
        </>
      ) : coChep ? (
        <>
          <CapacityField
            cap={cap}
            setCap={setCap}
            min={Math.max(game.capacity.min, game.seats.max)}
            max={game.capacity.max}
            seats={game.seats.max}
            note={`Tối đa ${game.seats.max} người chơi và ${Math.max(0, cap - game.seats.max)} người xem.`}
          />
          <p className="rounded-xl bg-lime-soft p-3 text-[13.5px] text-ink-2">
            🪨 Từ 1 đến {game.seats.max} người chơi. Kéo – buông để chọi đá lần lượt vào ô 1 → 8, trúng thì tự nhảy cò chẹp nhặt đá về; xong ô 8 thì chọi lên Trời rồi chọi
            qua lưng để chiếm nhà. Chọi trúng nhà mình là cháy nhà! Chủ phòng chốt ván lúc nào cũng được — ai nhiều nhà nhất thắng.
          </p>
        </>
      ) : mc ? (
        <>
          <CapacityField
            cap={cap}
            setCap={setCap}
            min={Math.max(game.capacity.min, MC_MAX)}
            max={game.capacity.max}
            seats={MC_MAX}
            note={`Tối đa ${MC_MAX} người chơi và ${Math.max(0, cap - MC_MAX)} người xem.`}
          />
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Bản đồ</legend>
            <div className="grid grid-cols-3 gap-2">
              {MC_MAPS.map((k) => (
                <button key={k} type="button" onClick={() => setMcMap(k)} aria-pressed={mcMap === k} className={`btn !px-2 ${mcMap === k ? "btn-sun" : ""}`}>
                  {MC_MAP[k].label} {MC_MAP[k].w}×{MC_MAP[k].h}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Số mìn</legend>
            <div className="grid grid-cols-3 gap-2">
              {MC_MINES.map((n) => (
                <button key={n} type="button" onClick={() => setMcMines(n)} aria-pressed={mcMines === n} className={`btn !px-2 ${mcMines === n ? "btn-sun" : ""}`}>
                  💣 {n}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              {mcMinesFor({ map: mcMap, mines: mcMines }, MC_MAX) < mcMines
                ? `Bản đồ này đông người thì tự hạ còn ${mcMinesFor({ map: mcMap, mines: mcMines }, MC_MAX)} mìn (4 người) để khỏi kín mìn.`
                : "Mìn càng dày, mở ô càng hồi hộp."}{" "}
              Đổi được trong phòng trước mỗi ván.
            </p>
          </fieldset>
          <p className="rounded-xl bg-sky-soft p-3 text-[13.5px] text-ink-2">
            💣 Từ 2 đến {MC_MAX} người, mỗi người một căn cứ ở góc bản đồ. Lần lượt mở ô sát lãnh thổ để chiếm đất và ghi điểm, dùng năng lượng cho Radar, Khiên,
            Pháo đài, Cướp Đất. Giẫm mìn mất mạng — hết 3 mạng là bị loại. Trụ lại cuối cùng, hoặc nhiều điểm nhất khi hết ô / bế tắc, là thắng.
          </p>
        </>
      ) : dots ? (
        <>
          <CapacityField cap={cap} setCap={setCap} min={Math.max(game.capacity.min, seats)} max={game.capacity.max} seats={seats} />
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Cỡ bàn</legend>
            <div className="grid grid-cols-3 gap-2">
              {DB_SIZES.map((s) => (
                <button key={s} type="button" onClick={() => setDotsSize(s)} aria-pressed={dotsSize === s} className={`btn !px-2 ${dotsSize === s ? "btn-sun" : ""}`}>
                  {s}×{s} ô
                </button>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              {dotsSize === 3 ? "Ván chớp nhoáng, vài phút là xong." : dotsSize === 5 ? "Cỡ chuẩn — đủ chỗ để giăng bẫy chuỗi ô." : "Bàn lớn, ván dài, nhiều chuỗi để tính."} Đổi được trong phòng
              trước mỗi ván.
            </p>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Thời gian mỗi lượt</legend>
            <div className="grid grid-cols-4 gap-2">
              {DB_TURNS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDotsTurn(t)}
                  aria-pressed={dotsTurn === t}
                  aria-label={dbTurnLabel(t)}
                  className={`btn !px-2 ${dotsTurn === t ? "btn-sun" : ""}`}
                >
                  {t ? dbTurnLabel(t) : "Vô hạn"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              {dotsTurn ? `Hết ${dbTurnLabel(dotsTurn).toLowerCase()} mà chưa kẻ thì mất lượt, kể cả lượt được đi tiếp sau khi khép ô.` : "Nghĩ bao lâu cũng được."} Đổi được trong phòng
              trước mỗi ván.
            </p>
          </fieldset>
          <p className="rounded-xl bg-coral-soft p-3 text-[13.5px] text-ink-2">
            🔲 Hai người chơi lần lượt kẻ một cạnh nối hai chấm kề nhau. Ai kẻ cạnh thứ tư khép kín một ô thì chiếm ô đó và được kẻ tiếp. Hết ô — hoặc một
            bên đã chiếm quá nửa — thì ai nhiều ô hơn thắng. Màu Đỏ đi trước, đổi người đi trước sau mỗi ván.
          </p>
        </>
      ) : oaq ? (
        <>
          <CapacityField cap={cap} setCap={setCap} min={Math.max(game.capacity.min, seats)} max={game.capacity.max} seats={seats} />
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Quan non</legend>
            <div className="grid gap-2">
              <Choice on={quanNon} onClick={() => setQuanNon(true)} title="Cấm ăn quan non" text={`Ô quan còn quân quan mà dưới ${QUAN_NON} dân thì chưa ăn được — rải tới đó là mất lượt.`} />
              <Choice on={!quanNon} onClick={() => setQuanNon(false)} title="Được ăn quan non" text="Ô quan lúc nào cũng ăn được, kể cả khi chỉ còn trơ quân quan." />
            </div>
          </fieldset>
          <p className="rounded-xl bg-sun-soft p-3 text-[13.5px] text-ink-2">
            🪨 Hai người chơi, mỗi bên 5 ô dân (5 quân mỗi ô), hai đầu là ô quan. Bốc một ô bên mình rải theo chiều tuỳ chọn; rải hết mà cách một ô trống là
            ăn. Hết quan thì thu quân đếm điểm — dân 1 điểm, quan 10 điểm. Người đi trước đổi sau mỗi ván.
          </p>
        </>
      ) : bs ? (
        <>
          <CapacityField cap={cap} setCap={setCap} min={Math.max(game.capacity.min, seats)} max={game.capacity.max} seats={seats} />
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Chế độ</legend>
            <div className="grid gap-2">
              <Choice on={bsMode === "basic"} onClick={() => setBsMode("basic")} title="🚢 Cơ bản" text="Mỗi bên 5 tàu thẳng cổ điển, đội hình hai bên hiện suốt ván." />
              <Choice
                on={bsMode === "advanced"}
                onClick={() => setBsMode("advanced")}
                title="🧩 Nâng cao"
                text="Mỗi bên tự chọn 1–5 trong 11 loại tàu (có tàu chữ L, chữ T, tàu chéo…), đội hình giấu tới hết ván."
              />
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Luật bắn</legend>
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((b) => (
                <button key={String(b)} type="button" onClick={() => setChain(b)} aria-pressed={chain === b} className={`btn !px-2 ${chain === b ? "btn-sun" : ""}`}>
                  {b ? "🎯 Trúng bắn tiếp" : "Mỗi phát một lượt"}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Thời gian mỗi lượt</legend>
            <div className="grid grid-cols-4 gap-2">
              {BS_TURNS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBsTurn(t)}
                  aria-pressed={bsTurn === t}
                  aria-label={dbTurnLabel(t)}
                  className={`btn !px-2 ${bsTurn === t ? "btn-sun" : ""}`}
                >
                  {t ? dbTurnLabel(t) : "Vô hạn"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">Hết thời gian sẽ mất lượt.</p>
          </fieldset>
        </>
      ) : draw ? (
        <>
          <CapacityField
            cap={cap}
            setCap={setCap}
            min={Math.max(game.capacity.min, DW_MIN)}
            max={game.capacity.max}
            seats={DW_MAX}
            note={cap > DW_MAX ? `Tối đa ${DW_MAX} người chơi và ${cap - DW_MAX} người xem.` : `Tối đa ${cap} người chơi, không còn chỗ xem.`}
          />
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Số vòng</legend>
            <div className="grid grid-cols-4 gap-2">
              {DW_ROUNDS.map((n) => (
                <button key={n} type="button" onClick={() => setRounds(n)} aria-pressed={rounds === n} className={`btn !px-2 ${rounds === n ? "btn-sun" : ""}`}>
                  {n} vòng
                </button>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">Mỗi vòng ai cũng vẽ một lượt.</p>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Thời gian vẽ mỗi lượt</legend>
            <div className="grid grid-cols-4 gap-2">
              {DW_TIMES.map((t) => (
                <button key={t} type="button" onClick={() => setDrawTime(t)} aria-pressed={drawTime === t} className={`btn !px-2 ${drawTime === t ? "btn-sun" : ""}`}>
                  {t} giây
                </button>
              ))}
            </div>
          </fieldset>
          <p className="rounded-xl bg-grape-soft p-3 text-[13.5px] text-ink-2">
            🎨 Từ {DW_MIN} đến {DW_MAX} người chơi. Tới lượt thì chọn 1 trong 3 từ bí mật (dễ · vừa · khó) rồi vẽ; người khác gõ đáp án, ai đoán ra càng sớm càng nhiều điểm,
            người vẽ cũng được điểm theo số người đoán ra. Số vòng, thời gian vẽ và gợi ý chữ cái đổi được trong phòng trước mỗi ván.
          </p>
        </>
      ) : xiangqiRole ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Thời gian claim token</legend>
            <div className="grid grid-cols-4 gap-2">
              {CLAIM_OPTIONS.map((ms) => (
                <button key={ms} type="button" onClick={() => setClaimMs(ms)} aria-pressed={claimMs === ms} className={`btn !px-2 ${claimMs === ms ? "btn-sun" : ""}`}>
                  {claimLabel(ms)}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="rounded-xl bg-sun-soft p-3 text-[13.5px] text-ink-2">
            ♟️ Từ {XQ_MIN} đến {XQ_MAX} người — mỗi phe 5 role: Tướng·Sĩ·Tượng (1 người), Xe, Pháo, Mã, Tốt. Claim {claimLabel(claimMs)}:
            1 người → tự đi; ≥2 → Tướng chọn. Role trống do bot. Chat riêng theo phe.
          </p>
        </>
      ) : kw ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Cỡ bàn</legend>
            <div className="grid grid-cols-3 gap-2">
              {KW_SIZES.map((k) => (
                <button key={k} type="button" onClick={() => setKwSize(k)} aria-pressed={kwSize === k} className={`btn !px-2 ${kwSize === k ? "btn-sun" : ""}`}>
                  {KW_SIZE[k].label} {KW_SIZE[k].w}×{KW_SIZE[k].h}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              {kwSize === "s" ? "Ván nhanh, vài phút là dọn xong." : kwSize === "m" ? "Cỡ vừa — hợp với nhóm vài người." : "Bàn kinh điển 16×9, đông người chơi mới vui."} Đổi được trong phòng trước mỗi
              ván.
            </p>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Chế độ</legend>
            <div className="grid gap-2">
              {KW_MODES.map((k) => (
                <Choice key={k} on={kwMode === k} onClick={() => setKwMode(k)} title={`${KW_MODE[k].emoji} ${KW_MODE[k].name}`} text={KW_MODE[k].text} />
              ))}
            </div>
          </fieldset>
          <p className="rounded-xl bg-sun-soft p-3 text-[13.5px] text-ink-2">
            🐾 Không giới hạn người chơi, một mình cũng chơi được. Nối hai ô cùng hình bằng đường gấp tối đa 2 lần (đi vòng viền được). Cỡ bàn và chế độ đổi được
            trong phòng trước mỗi ván.
          </p>
        </>
      ) : sx ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Chế độ</legend>
            <div className="grid gap-2">
              {(Object.keys(SX_MODE) as SxMode[]).map((k) => (
                <Choice
                  key={k}
                  on={sxMode === k}
                  onClick={() => {
                    setSxMode(k);
                    setSxPreset("");
                  }}
                  title={`${SX_MODE[k].emoji} ${SX_MODE[k].name}`}
                  text={SX_MODE[k].text}
                />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Thời gian thiết kế</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SX_TIMES.map((t) => (
                <button key={t} type="button" onClick={() => setSxTimeLimit(t)} aria-pressed={sxTimeLimit === t} className={`btn !px-2 ${sxTimeLimit === t ? "btn-sun" : ""}`}>
                  {sxTime(t)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">Thiết kế tự chốt khi hết giờ.</p>
          </fieldset>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Đề bài</span>
            <select className="field" value={sxPreset} onChange={(e) => setSxPreset(e.target.value)}>
              <option value="">🎲 Tự sinh ngẫu nhiên</option>
              {sxPresets(sxMode).map((x) => (
                <option key={x.key} value={x.key}>
                  {x.title}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[13px] text-ink-3">Traffic mục tiêu, sự cố và budget được sinh kèm; trong phòng bạn soạn lại được toàn bộ đề trước mỗi ván.</span>
          </label>
        </>
      ) : td ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Mode</legend>
            <div className="grid gap-2">
              {TD_MODES.map((k) => (
                <Choice key={k} on={tdMode === k} onClick={() => setTdMode(k)} title={`${TD_MODE[k].emoji} ${TD_MODE[k].name}`} text={`${TD_MODE[k].text} ${TD_MODE[k].minutes}.`} />
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">Chủ đề trong mode chọn trong phòng trước mỗi ván.</p>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Thời gian</legend>
            <div className="grid grid-cols-2 gap-2">
              {[false, true].map((on) => (
                <button key={String(on)} type="button" onClick={() => setTdTimer(on)} aria-pressed={tdTimer === on} className={`btn !px-2 ${tdTimer === on ? "btn-sun" : ""}`}>
                  {on ? "⏱ Có giới hạn" : "🍃 Thong thả"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              {tdTimer
                ? `Mở thẻ ${TD_TIMES[tdMode].pick}s, nhận diện ${TD_TIMES[tdMode].answer}s, kiểm tra nhận định ${TD_TIMES[tdMode].judge}s — hết giờ tự khoá phần đã chọn.`
                : "Không giới hạn — nghĩ bao lâu cũng được."}
            </p>
          </fieldset>
          <p className="rounded-xl bg-sun-soft p-3 text-[13.5px] text-ink-2">
            🪷 Từ 1 đến {TD_MAX} người, {TD_ROUNDS} vòng. Cả bàn đọc chung một tình huống, mở chung 2 trong 4 thẻ dữ kiện, rồi ai nấy trả lời kèm căn cứ và kiểm tra một nhận định
            theo Vi Diệu Pháp. Chấm theo đúng thông tin đã mở — tối đa 5 điểm mỗi vòng.
          </p>
        </>
      ) : ms ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Cỡ bàn</legend>
            <div className="grid grid-cols-2 gap-2">
              {MS_SIZES.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setMsSize(k);
                    setMsMines(MS_SIZE[k].mines);
                  }}
                  aria-pressed={msSize === k}
                  className={`btn !px-2 ${msSize === k ? "btn-coral" : ""}`}
                >
                  {MS_SIZE[k].label} {MS_SIZE[k].w}×{MS_SIZE[k].h}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Số mìn</legend>
            <MineCount size={msSize} mines={msOptions({ size: msSize, mines: msMines }).mines} onChange={setMsMines} />
          </fieldset>
          <p className="rounded-xl bg-coral-soft p-3 text-[13.5px] text-ink-2">
            💣 Không giới hạn người chơi, một mình cũng chơi được. Cả phòng chung một bàn, không theo lượt: mở ô an toàn được 1 điểm mỗi ô lộ ra, đạp mìn là bị
            loại. Mở hết bàn thì ai còn trụ nhiều điểm nhất thắng — còn một người thì phải tự mở hết mới thắng.
          </p>
        </>
      ) : tx ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Cỡ bàn</legend>
            <div className="grid grid-cols-3 gap-2">
              {TX_SIZES.map((k) => (
                <button key={k} type="button" onClick={() => setTxSize(k)} aria-pressed={txSize === k} className={`btn !px-2 ${txSize === k ? "btn-lime" : ""}`}>
                  {TX_SIZE[k].label} {TX_SIZE[k].w}×{TX_SIZE[k].h}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              {txSize === "s" ? "6 cặp — tranh lộ nhanh, ván ngắn." : txSize === "m" ? "10 cặp, 20 ô như trên truyền hình." : "15 cặp — tranh lộ chậm, khó đoán hơn."} Đổi được trong phòng trước mỗi ván.
            </p>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Mức khó</legend>
            <div className="grid grid-cols-2 gap-2">
              {TX_LEVELS.map((k) => (
                <button key={k} type="button" onClick={() => setTxLevel(k)} aria-pressed={txLevel === k} className={`btn !px-2 ${txLevel === k ? "btn-lime" : ""}`}>
                  {TX_LEVEL[k].emoji} {TX_LEVEL[k].label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              {TX_LEVEL[txLevel].about} Bộ {TX_LEVEL[txLevel].pictures.length} tranh, không lặp lại trong phòng. Đổi được trong phòng trước mỗi ván.
            </p>
          </fieldset>
          <p className="rounded-xl bg-lime-soft p-3 text-[13.5px] text-ink-2">
            🎋 Không giới hạn người chơi, một mình cũng chơi được. Lần lượt lật hai ô: trùng hình thì lộ một mảng tranh và được lật tiếp. Ai cũng đoán được từ khoá
            bất cứ lúc nào — đúng là thắng, trật thì thôi.
          </p>
        </>
      ) : sudoku ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Mức đề</legend>
            <div className="grid grid-cols-3 gap-2">
              {LEVEL_KEYS.map((l) => (
                <button key={l} type="button" onClick={() => setLevel(l)} aria-pressed={level === l} className={`btn !px-2 ${level === l ? "btn-sun" : ""}`}>
                  {LEVELS[l].emoji} {LEVELS[l].name}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">{LEVELS[level].text}</p>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Chế độ tranh đấu</legend>
            <div className="grid gap-2">
              {MODE_KEYS.map((k) => (
                <Choice key={k} on={mode === k} onClick={() => setMode(k)} title={`${MODES[k].emoji} ${MODES[k].name}`} text={MODES[k].text} />
              ))}
            </div>
          </fieldset>
          <p className="rounded-xl bg-lime-soft p-3 text-[13.5px] text-ink-2">
            🔢 Từ 1 đến {SD_MAX} người chơi, ai vào cũng xem được. Mỗi ván một đề mới; mức đề và chế độ đổi được trong phòng trước mỗi ván.
          </p>
        </>
      ) : spy ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Chủ phòng</legend>
            <div className="grid gap-2">
              <Choice on={hostPlays} onClick={() => setHostPlays(true)} title="Cùng chơi" text="Bạn nhận từ khoá như mọi người; máy bạn tự bốc từ và điều hành nhưng không cho bạn xem." />
              <Choice on={!hostPlays} onClick={() => setHostPlays(false)} title="Chỉ điều hành" text="Bạn không chơi: thấy hết từ khoá và phe, tự đặt được cặp từ, chọn người bị loại khi hoà phiếu." />
            </div>
          </fieldset>
          <p className="rounded-xl bg-sky-soft p-3 text-[13.5px] text-ink-2">
            🕵️ Từ {UC_MIN} đến {UC_MAX} người chơi, ai vào cũng xem được. Ba phe: Dân, Gián Điệp, Trắng — bộ 1000 cặp từ, phòng nhớ cặp đã chơi để không
            bốc lại. Số Gián Điệp, có phe Trắng hay không, thời gian thảo luận chỉnh được trong phòng trước mỗi ván.
          </p>
        </>
      ) : wolf ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Thời gian thảo luận ban ngày</legend>
            <div className="grid grid-cols-[1fr_1fr_2fr] gap-2">
              {TALKS.map((t) => (
                <button key={t} type="button" onClick={() => setTalk(t)} aria-pressed={talk === t} className={`btn !px-2 ${talk === t ? "btn-sun" : ""}`}>
                  {talkName(t)}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="rounded-xl bg-grape-soft p-3 text-[13.5px] text-ink-2">
            🐺 Từ {MIN_PLAYERS} đến {MAX_PLAYERS} người chơi, ai vào cũng xem được. Bạn là Quản trò — mặc định chỉ xem và điều khiển ván (đổi được thành tham gia chơi trong phòng); máy của bạn tự chia vai, gọi các vai dậy ban đêm, đếm
            phiếu ban ngày. Số Sói, các vai đặc biệt và luật chi tiết chỉnh được trong phòng trước mỗi ván.
          </p>
        </>
      ) : loto ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Nhịp kêu số</legend>
            <div className="grid grid-cols-3 gap-2">
              {PACES.map((p) => (
                <button key={p} type="button" onClick={() => setPace(p)} aria-pressed={pace === p} className={`btn !px-2 ${pace === p ? "btn-sun" : ""}`}>
                  {PACE_NAMES[p]} · {p / 1000}s
                </button>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">Máy chủ phòng tự kêu một số sau mỗi {pace / 1000} giây; đổi được ngay trong phòng.</p>
          </fieldset>
          <p className="rounded-xl bg-sun-soft p-3 text-[13.5px] text-ink-2">
            🧧 Bộ 10 màu × 2 tờ = {SHEET_COUNT} tờ. Ai vào phòng cũng xem được; mỗi người chơi giữ 1–2 tờ, hết tờ thì không vào chơi được nữa. Chủ phòng cũng chọn tờ như mọi người.
          </p>
        </>
      ) : (
        <>
          <CapacityField cap={cap} setCap={setCap} min={Math.max(game.capacity.min, seats)} max={game.capacity.max} seats={seats} />
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Kích thước bàn</legend>
            <div className="grid grid-cols-3 gap-2">
              {CARO_SIZES.map((s) => (
                <button key={s} type="button" onClick={() => setSize(s)} aria-pressed={size === s} className={`btn ${size === s ? "btn-sun" : ""}`}>
                  {caroSizeLabel(s)}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Luật chặn hai đầu</legend>
            <div className="grid gap-2">
              <Choice on={blockTwoEnds} onClick={() => setBlock(true)} title="Bật — chặn 2 đầu không thắng" text="Dãy 5 quân bị quân đối phương chặn ở cả hai đầu thì không được tính thắng." />
              <Choice on={!blockTwoEnds} onClick={() => setBlock(false)} title="Tắt — cứ 5 quân là thắng" text="Chỉ cần 5 quân liên tiếp, bị chặn hay không đều thắng." />
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Thời gian mỗi lượt</legend>
            <div className="grid grid-cols-4 gap-2">
              {CARO_TURNS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setCaroTurn(t)}
                  aria-pressed={caroTurn === t}
                  aria-label={dbTurnLabel(t)}
                  className={`btn !px-2 ${caroTurn === t ? "btn-sun" : ""}`}
                >
                  {t ? dbTurnLabel(t) : "Vô hạn"}
                </button>
              ))}
            </div>
            {caroTurn > 0 && <p className="mt-1 text-[13px] text-ink-3">Hết thời gian sẽ bị xử thua.</p>}
          </fieldset>
        </>
      )}
      <button type="submit" className="btn btn-pen h-12 text-base" disabled={!clean}>
        Tạo phòng & vào ngay
      </button>
    </form>
  );
}

function CapacityField({ cap, setCap, min, max, seats, note }: { cap: number; setCap: (n: number) => void; min: number; max: number; seats: number; note?: string }) {
  return (
    <div>
      <label htmlFor="cr-cap" className="mb-1.5 flex justify-between text-sm font-bold">
        <span>Số người tối đa trong phòng</span>
        <span className="text-pen tabular-nums">{cap} người</span>
      </label>
      <input id="cr-cap" type="range" min={min} max={max} value={cap} onChange={(e) => setCap(Number(e.target.value))} className="w-full accent-[var(--pen)]" />
      <p className="mt-1 text-[13px] text-ink-3">{note ?? `Gồm ${seats} người chơi và ${cap - seats} người xem.`}</p>
    </div>
  );
}

function Choice({ on, onClick, title, text }: { on: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-xl border-2 p-3 text-left transition-colors ${on ? "border-pen bg-pen-soft" : "border-rule hover:border-ink-3"}`}
    >
      <span className="flex items-center gap-2 font-bold">
        <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${on ? "border-pen" : "border-ink-3"}`} aria-hidden="true">
          {on && <span className="h-2.5 w-2.5 rounded-full bg-pen" />}
        </span>
        {title}
      </span>
      <span className="mt-1 block pl-7 text-[13.5px] text-ink-2">{text}</span>
    </button>
  );
}
