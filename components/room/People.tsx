"use client";

import { useState } from "react";
import type { ChatMsg, Member, RoomSession, RoomView, SeatView } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "../ConfirmButton";
import { Dialog } from "../Dialog";
import { useLobbyView, useNet } from "../NetProvider";
import { hostTitle } from "@/lib/games/registry";
import { StickerArt } from "./Sticker";

export function Balloon({ msg }: { msg?: ChatMsg }) {
  if (!msg) return null;
  return (
    <span key={msg.id} className={`balloon ${msg.sticker ? "is-sticker" : ""} ${msg.shout ? "is-shout" : ""}`} role="presentation">
      {msg.sticker ? <StickerArt id={msg.sticker} size={72} /> : msg.text}
    </span>
  );
}

/** Thẻ người chơi trong thanh đối đầu, có bóng thoại hiện trên avatar. Mặc định huy hiệu là X / O (caro); game khác đặt `badge`, `tone`. */
export function SeatCard({
  seat,
  mark,
  badge,
  tone: toneOf,
  active,
  isHost,
  balloon,
  me,
  align = "left",
}: {
  seat?: SeatView;
  mark?: 1 | 2;
  badge?: string;
  tone?: string;
  active?: boolean;
  isHost?: boolean;
  balloon?: ChatMsg;
  me: string;
  align?: "left" | "right";
}) {
  const m = seat?.member;
  const tone = toneOf ?? (mark === 1 ? "var(--coral)" : mark === 2 ? "var(--sky)" : "var(--ink-3)");
  const label = badge ?? (mark === 1 ? "X" : "O");
  return (
    <div
      className={`card relative flex min-w-0 flex-1 flex-col items-center gap-2 p-3 text-center transition-all sm:flex-row sm:gap-3 sm:p-4 ${align === "right" ? "sm:flex-row-reverse sm:text-right" : "sm:text-left"}`}
      style={{
        borderColor: active ? tone : undefined,
        boxShadow: active ? `0 4px 0 ${tone}` : undefined,
        background: active ? `color-mix(in srgb, ${tone} 10%, var(--surface))` : undefined,
      }}
    >
      {m ? (
        <span className="relative">
          <Avatar p={m} size={48} className={seat?.online ? "" : "opacity-40 grayscale"} />
          <Balloon msg={balloon} />
          {isHost && (
            <span className="absolute -top-2.5 -right-1.5 text-lg" title="Chủ phòng" aria-label="Chủ phòng">
              👑
            </span>
          )}
          {mark && (
            <span
              className="absolute -bottom-1 -left-1.5 grid h-6 w-6 place-items-center rounded-lg border-2 border-edge font-display text-sm font-extrabold text-white sm:hidden"
              style={{ background: tone }}
              aria-hidden="true"
            >
              {label}
            </span>
          )}
        </span>
      ) : (
        <span className="grid h-12 w-12 flex-none place-items-center rounded-full border-2 border-dashed border-ink-3 text-xl text-ink-3" aria-hidden="true">
          ?
        </span>
      )}
      <div className="w-full min-w-0 flex-1">
        <p className="truncate font-display text-[15px] font-extrabold sm:text-[17px]">
          {m ? m.name : "Ghế trống"}
          {m && m.uid === me && <span className="ml-1.5 text-xs font-bold text-pen">(bạn)</span>}
        </p>
        <p className="truncate text-[12.5px] font-semibold text-ink-3">
          {!m ? "Đang chờ người vào chơi" : !seat?.online ? "⚠️ Mất kết nối" : active ? "Đang suy nghĩ…" : "Sẵn sàng"}
        </p>
      </div>
      {mark && (
        <span className="hidden h-11 w-11 flex-none place-items-center rounded-xl border-2 border-edge font-display text-2xl font-extrabold text-white sm:grid" style={{ background: tone }}>
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * Danh sách người trong phòng; chủ phòng có thêm nút thêm vào ghế / mời ra ghế / kick / nhường chủ phòng.
 * Game tuỳ biến được dòng mô tả từng người (`detail`), có cho kéo người xem vào ghế không (`canSeat`) và nhãn nút mời ra ghế.
 */
export function PeoplePanel({
  view,
  session,
  balloons,
  roomId,
  detail,
  canSeat = true,
  unseatLabel = "Rời ghế",
}: {
  view: RoomView;
  session: RoomSession;
  balloons: Record<string, ChatMsg>;
  roomId: string;
  detail?: (p: Member, seated: boolean) => React.ReactNode;
  canSeat?: boolean;
  unseatLabel?: string;
}) {
  const m = view.meta!;
  const [inviting, setInviting] = useState(false);
  const playing = m.status === "playing";
  const seatFree = m.players.length < m.seats;
  const row = (p: Member, seated: boolean) => (
    <li key={p.uid} className="flex items-center gap-2.5 py-1.5">
      <span className="relative">
        <Avatar p={p} size={34} className={view.online.has(p.uid) ? "" : "opacity-40 grayscale"} />
        <Balloon msg={seated ? undefined : balloons[p.uid]} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-bold">
          {p.name}
          {p.uid === view.me && <span className="ml-1 text-xs text-pen">(bạn)</span>}
          {p.uid === m.host && <span title={hostTitle(m.game)}> 👑</span>}
        </p>
        <p className="text-xs text-ink-3">{detail ? detail(p, seated) : seated ? (playing && m.lineup.includes(p.uid) ? "Đang thi đấu" : "Đã vào ghế") : "Đang xem"}</p>
      </div>
      {view.isHost && p.uid !== view.me && (
        <div className="flex flex-none gap-1">
          {canSeat && !seated && !playing && seatFree && (
            <button type="button" className="btn btn-sm btn-lime !px-2" onClick={() => session.seat(p.uid)} title="Thêm vào ghế chơi">
              + Ghế
            </button>
          )}
          {seated && !playing && (
            <button type="button" className="btn btn-sm !px-2" onClick={() => session.unseat(p.uid)} title="Mời ra khỏi ghế (vẫn ở lại xem)">
              {unseatLabel}
            </button>
          )}
          <HostMenu onKick={() => session.kick(p.uid)} onMakeHost={() => session.makeHost(p.uid)} name={p.name} host={hostTitle(m.game)} />
        </div>
      )}
    </li>
  );
  const seated = view.seats.map((s) => s.member).filter((x): x is Member => !!x);
  return (
    <section className="card p-4" aria-labelledby="people-h">
      <div className="flex items-center justify-between gap-2">
        <h2 id="people-h" className="font-display text-lg font-extrabold">
          👥 Trong phòng{" "}
          <span className="text-ink-3">({m.cap > 0 ? `${view.online.size}/${m.cap}` : view.online.size})</span>
        </h2>
        {view.isHost && (
          <button type="button" className="btn btn-sm" onClick={() => setInviting(true)}>
            ✉️ Mời
          </button>
        )}
      </div>
      <ul className="mt-2 divide-y divide-rule">
        {seated.map((p) => row(p, true))}
        {view.spectators.map((p) => row(p, false))}
      </ul>
      <Dialog open={inviting} onClose={() => setInviting(false)} title="Mời người chơi">
        {inviting && <InviteList view={view} roomId={roomId} />}
      </Dialog>
    </section>
  );
}

function HostMenu({ onKick, onMakeHost, name, host }: { onKick: () => void; onMakeHost: () => void; name: string; host: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" className="btn btn-sm btn-ghost !px-2" aria-expanded={open} aria-label={`Tuỳ chọn cho ${name}`} onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open && (
        <div className="card absolute top-full right-0 z-30 mt-1 grid w-48 gap-1 p-1.5" role="menu" onMouseLeave={() => setOpen(false)}>
          <button
            type="button"
            role="menuitem"
            className="rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-sunken"
            onClick={() => {
              setOpen(false);
              onMakeHost();
            }}
          >
            👑 Nhường {host.toLowerCase()}
          </button>
          <ConfirmButton
            role="menuitem"
            className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-coral hover:bg-coral-soft"
            onConfirm={() => {
              setOpen(false);
              onKick();
            }}
            confirmLabel="Bấm lần nữa để kick"
          >
            🚪 Kick khỏi phòng
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}

function InviteList({ view, roomId }: { view: RoomView; roomId: string }) {
  const { lobby } = useNet();
  const lobbyView = useLobbyView();
  const [sent, setSent] = useState<Set<string>>(new Set());
  const m = view.meta!;
  const people = lobbyView.users.filter((u) => u.uid !== view.me && u.room !== roomId);
  const copy = () => navigator.clipboard?.writeText(location.href);
  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        <input className="field !min-h-[40px] text-sm" readOnly value={location.href} aria-label="Link phòng" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn-sm btn-sun" onClick={copy}>
          Chép link
        </button>
      </div>
      <p className="text-sm text-ink-2">Hoặc gửi lời mời tới người đang online:</p>
      {people.length === 0 ? (
        <p className="rounded-xl bg-sunken p-4 text-center text-sm text-ink-3">Chưa thấy ai khác đang online.</p>
      ) : (
        <ul className="grid max-h-[50vh] gap-2 overflow-y-auto">
          {people.map((u) => (
            <li key={u.uid} className="flex items-center gap-3">
              <Avatar p={u} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{u.name}</p>
                <p className="text-xs text-ink-3">{u.room ? "Đang trong phòng khác" : u.game ? "Đang ở sảnh game" : "Đang ở trang chủ"}</p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-pen"
                disabled={sent.has(u.uid)}
                onClick={() => {
                  lobby?.invite({ to: u.uid, game: m.game, room: roomId, roomName: m.name });
                  setSent((s) => new Set(s).add(u.uid));
                }}
              >
                {sent.has(u.uid) ? "Đã mời" : "Mời"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
