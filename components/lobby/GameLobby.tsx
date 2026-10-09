"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_OPTIONS as BS_DEFAULTS, FLEET as BS_FLEET, normOptions as bsOptions, SIZE as BS_SIZE } from "@/lib/games/battleship";
import { MAX_PLAYERS as DG_MAX, MIN_PLAYERS as DG_MIN } from "@/lib/games/dodge";
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
import { getGame, hostTitle, roomHref } from "@/lib/games/registry";
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
import { HUE } from "../home/hue";
import { useLobbyView, useNet, useWhere } from "../NetProvider";
import { Spinner } from "../Spinner";
import { RulesButton } from "./RulesButton";

export function GameLobby({ slug }: { slug: string }) {
  const game = getGame(slug)!;
  useWhere({ game: slug });
  const view = useLobbyView();
  const rooms = view.rooms.filter((r) => r.game === slug);
  const here = view.users.filter((u) => u.game === slug);
  // Chưa nối được ai thì danh sách phòng / người chưa phải dữ liệu thật — ẩn số đếm, hiện trạng thái đang tìm.
  const ready = view.connected;
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
        <span className="grid h-24 w-24 flex-none place-items-center rounded-3xl border-2 border-edge bg-surface text-6xl" style={{ boxShadow: "var(--shadow-sm)" }} aria-hidden="true">
          {game.emoji}
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

function RoomCard({ room, slug }: { room: RoomAd; slug: string }) {
  const loto = room.game === "loto";
  const wolf = room.game === "werewolf";
  const spy = room.game === "undercover";
  const sudoku = room.game === "sudoku";
  const xiangqi = room.game === "xiangqi";
  const dodge = room.game === "dodge";
  const xiangqiRole = room.game === "xiangqi-role";
  const c4 = room.game === "connect-four";
  const bs = room.game === "battleship";
  const draw = room.game === "draw-guess";
  const full = room.cap > 0 && room.members >= room.cap;
  const playing = room.status === "playing";
  // Lô tô: hết tờ thì chỉ vào xem được.
  const noSheets = loto && (room.sheets ?? 0) >= room.seats;
  const status = playing
    ? {
        label: loto
          ? "Đang kêu số"
          : wolf || spy
            ? "Đang chơi"
            : sudoku
              ? "Đang giải"
              : dodge
                ? "Đang né bão"
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
        ) : dodge ? (
          <DodgeChips room={room} />
        ) : xiangqiRole ? (
          <XiangqiRoleChips room={room} />
        ) : c4 ? (
          <ConnectFourChips room={room} />
        ) : bs ? (
          <BattleshipChips room={room} />
        ) : draw ? (
          <DrawGuessChips room={room} />
        ) : (
          <CaroChips room={room} />
        )}</div>
      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-ink-3">#{room.id}</span>
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
  const size = Number(room.opts?.size) || 15;
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🪑 {room.players}/{room.seats} ghế
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        ▦ {size}×{size}
      </span>
      {Boolean(room.opts?.blockTwoEnds) && <span className="rounded-lg bg-sun-soft px-2.5 py-1">🚧 Chặn 2 đầu</span>}
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

function BattleshipChips({ room }: { room: RoomAd }) {
  const { chain } = bsOptions(room.opts);
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🪑 {room.players}/{room.seats} ghế
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        👥 {room.members}/{room.cap} người
      </span>
      <span className="rounded-lg bg-lime-soft px-2.5 py-1">
        ▦ {BS_SIZE}×{BS_SIZE} · {BS_FLEET.length} tàu
      </span>
      {chain && <span className="rounded-lg bg-sun-soft px-2.5 py-1">🎯 Trúng bắn tiếp</span>}
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

function DodgeChips({ room }: { room: RoomAd }) {
  return (
    <>
      <span className="rounded-lg bg-sunken px-2.5 py-1">
        🙋 {room.players}/{room.seats} người chơi
      </span>
      <span className="rounded-lg bg-sunken px-2.5 py-1">👥 {room.members} trong phòng</span>
      <span className="rounded-lg bg-coral-soft px-2.5 py-1">🌩️ Real-time</span>
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
      className="flex w-full gap-2"
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
  const [size, setSize] = useState(15);
  const [blockTwoEnds, setBlock] = useState(true);
  const [pace, setPace] = useState(DEFAULT_PACE);
  const [talk, setTalk] = useState(DEFAULT_OPTIONS.talk);
  const [hostPlays, setHostPlays] = useState(UC_DEFAULTS.hostPlays);
  const [level, setLevel] = useState<Level>(SD_DEFAULTS.level);
  const [mode, setMode] = useState<Mode>(SD_DEFAULTS.mode);
  const [claimMs, setClaimMs] = useState<ClaimMs>(XQ_DEFAULTS.claimMs);
  const [chain, setChain] = useState(BS_DEFAULTS.chain);
  const [rounds, setRounds] = useState(DW_DEFAULTS.rounds);
  const [drawTime, setDrawTime] = useState(DW_DEFAULTS.time);
  const loto = slug === "loto";
  const wolf = slug === "werewolf";
  const spy = slug === "undercover";
  const sudoku = slug === "sudoku";
  const xiangqi = slug === "xiangqi";
  const dodge = slug === "dodge";
  const xiangqiRole = slug === "xiangqi-role";
  const c4 = slug === "connect-four";
  const bs = slug === "battleship";
  const draw = slug === "draw-guess";
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
          // Bộ tờ của phòng sinh từ seed này; không giới hạn người vào xem, số người chơi giới hạn bởi số tờ.
          const seed = crypto.getRandomValues(new Uint32Array(1))[0];
          stashCreate(id, { name: clean, cap: 0, seats: SHEET_COUNT, opts: { seed, interval: pace } });
        } else if (wolf) {
          // Không giới hạn người xem; các luật khác chủ phòng chỉnh trong phòng trước mỗi ván.
          stashCreate(id, { name: clean, cap: 0, seats: MAX_PLAYERS, opts: { ...DEFAULT_OPTIONS, talk } });
        } else if (spy) {
          // Không giới hạn người xem; các luật khác chủ phòng chỉnh trong phòng trước mỗi ván.
          stashCreate(id, { name: clean, cap: 0, seats: UC_MAX, opts: { ...UC_DEFAULTS, hostPlays } });
        } else if (sudoku) {
          // Không giới hạn người xem; mức và chế độ đổi được trong phòng trước mỗi ván.
          stashCreate(id, { name: clean, cap: 0, seats: SD_MAX, opts: { level, mode } });
        } else if (xiangqi || c4) stashCreate(id, { name: clean, cap, seats, opts: {} });
        else if (bs) stashCreate(id, { name: clean, cap, seats, opts: { chain } });
        else if (draw) stashCreate(id, { name: clean, cap, seats: DW_MAX, opts: { ...DW_DEFAULTS, rounds, time: drawTime } });
        else if (dodge) stashCreate(id, { name: clean, cap: 0, seats: DG_MAX, opts: {} });
        else if (xiangqiRole) stashCreate(id, { name: clean, cap: 0, seats: XQ_MAX, opts: { claimMs } });
        else stashCreate(id, { name: clean, cap, seats, opts: { size, blockTwoEnds } });
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
      ) : c4 ? (
        <>
          <CapacityField cap={cap} setCap={setCap} min={Math.max(game.capacity.min, seats)} max={game.capacity.max} seats={seats} />
          <p className="rounded-xl bg-sky-soft p-3 text-[13.5px] text-ink-2">
            🔵 Hai người chơi lần lượt thả quân vào bàn 7 cột × 6 hàng — quân rơi xuống ô trống thấp nhất. Ai nối được 4 quân liên tiếp theo hàng ngang,
            dọc hoặc chéo trước thì thắng; đầy bàn là hoà. Quân Đỏ đi trước, đổi người đi trước sau mỗi ván.
          </p>
        </>
      ) : bs ? (
        <>
          <CapacityField cap={cap} setCap={setCap} min={Math.max(game.capacity.min, seats)} max={game.capacity.max} seats={seats} />
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Luật bắn</legend>
            <div className="grid gap-2">
              <Choice on={chain} onClick={() => setChain(true)} title="Trúng được bắn tiếp" text="Bắn trúng (kể cả làm chìm tàu) thì được bắn thêm phát nữa; trượt mới đổi lượt." />
              <Choice on={!chain} onClick={() => setChain(false)} title="Mỗi phát một lượt" text="Trúng hay trượt cũng đổi lượt — luật cổ điển." />
            </div>
          </fieldset>
          <p className="rounded-xl bg-lime-soft p-3 text-[13.5px] text-ink-2">
            🚢 Hai người chơi, mỗi người bí mật bày {BS_FLEET.length} tàu ({BS_FLEET.map((s) => s.len).join("–")} ô) trên hải đồ {BS_SIZE}×{BS_SIZE}, rồi thay phiên gọi toạ độ để bắn.
            Ai đánh chìm hết hạm đội đối phương trước thì thắng. Sơ đồ được niêm phong bằng mã băm và công bố khi hết ván để đối chiếu.
          </p>
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
      ) : dodge ? (
        <p className="rounded-xl bg-coral-soft p-3 text-[13.5px] text-ink-2">
          🌩️ Từ {DG_MIN} đến {DG_MAX} người chơi. Runner tự chạy trái→phải, nhảy né hố/gai; người còn lại nấp bốn cạnh bắn truy cản. Ai sống lâu hơn
          thắng; bắn trúng thì lên làm người chạy.
        </p>
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
            <div className="grid grid-cols-2 gap-2">
              {[15, 19].map((s) => (
                <button key={s} type="button" onClick={() => setSize(s)} aria-pressed={size === s} className={`btn ${size === s ? "btn-sun" : ""}`}>
                  {s}×{s}
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
