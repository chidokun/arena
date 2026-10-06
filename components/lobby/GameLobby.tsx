"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_PACE, PACE_NAMES, PACES, SHEET_COUNT } from "@/lib/games/loto";
import { getGame, hostTitle, roomHref } from "@/lib/games/registry";
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

export function GameLobby({ slug }: { slug: string }) {
  const game = getGame(slug)!;
  useWhere({ game: slug });
  const view = useLobbyView();
  const rooms = view.rooms.filter((r) => r.game === slug);
  const here = view.users.filter((u) => u.game === slug);
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
        <div className="flex w-full flex-none flex-col gap-2.5 sm:w-60">
          <button type="button" className="btn btn-pen h-12 w-full px-6 text-base" onClick={() => setCreating(true)}>
            + Tạo phòng
          </button>
          <JoinByCode slug={slug} />
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
        <section aria-labelledby="rooms-h">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="rooms-h" className="font-display text-2xl font-extrabold">
              Phòng đang mở <span className="text-ink-3">({rooms.length})</span>
            </h2>
            {!view.connected && <span className="text-sm text-ink-3">Đang dò tìm phòng qua mạng P2P…</span>}
          </div>
          {rooms.length === 0 ? (
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
            <span className="live-dot" aria-hidden="true" /> Đang ở {game.name} ({here.length})
          </h2>
          <ul className="mt-3 grid gap-2.5">
            {here.slice(0, 30).map((u) => (
              <li key={u.uid} className="flex items-center gap-2.5">
                <Avatar p={u} size={30} />
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{u.name}</span>
                <span className="text-xs text-ink-3">{u.room ? "trong phòng" : "ở sảnh"}</span>
              </li>
            ))}
          </ul>
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
  const full = room.cap > 0 && room.members >= room.cap;
  const playing = room.status === "playing";
  // Lô tô: hết tờ thì chỉ vào xem được.
  const noSheets = loto && (room.sheets ?? 0) >= room.seats;
  const status = playing
    ? { label: loto ? "Đang kêu số" : wolf || spy ? "Đang chơi" : "Đang đấu", color: "var(--coral)" }
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
      <div className="flex flex-wrap gap-2 text-[13px] font-bold">{loto ? <LotoChips room={room} /> : wolf ? <WolfChips room={room} /> : spy ? <UcChips room={room} /> : <CaroChips room={room} />}</div>
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
  const loto = slug === "loto";
  const wolf = slug === "werewolf";
  const spy = slug === "undercover";
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
        } else stashCreate(id, { name: clean, cap, seats, opts: { size, blockTwoEnds } });
        router.push(roomHref(slug, id));
      }}
    >
      <div>
        <label htmlFor="cr-name" className="mb-1.5 block text-sm font-bold">
          Tên phòng
        </label>
        <input id="cr-name" className="field" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
      </div>
      {spy ? (
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
          <div>
            <label htmlFor="cr-cap" className="mb-1.5 flex justify-between text-sm font-bold">
              <span>Số người tối đa trong phòng</span>
              <span className="text-pen tabular-nums">{cap} người</span>
            </label>
            <input
              id="cr-cap"
              type="range"
              min={Math.max(game.capacity.min, seats)}
              max={game.capacity.max}
              value={cap}
              onChange={(e) => setCap(Number(e.target.value))}
              className="w-full accent-[var(--pen)]"
            />
            <p className="mt-1 text-[13px] text-ink-3">
              Gồm {seats} người chơi và {cap - seats} người xem.
            </p>
          </div>
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
