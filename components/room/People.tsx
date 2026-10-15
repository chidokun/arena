"use client";

import { memo, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { seatOpen, type Member, type Meta, type RoomSession, type RoomState, type SeatView } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "../ConfirmButton";
import { Dialog } from "../Dialog";
import { useLobbyView, useNet } from "../NetProvider";
import { hostTitle } from "@/lib/games/registry";
import { PeopleOpenerCtx, PeopleVariantCtx } from "./side";
import { shallowEqual, usePeople, useRoomState } from "./useRoom";

const FOLD_KEY = "arena:people-folded";

/** Phần view danh sách người cần — `RoomView` (view gộp) cũng đáp ứng. */
type PeopleSlice = {
  me: string;
  isHost: boolean;
  online: Set<string>;
  seats: SeatView[];
  spectators: Member[];
  meta?: Pick<Meta, "host" | "game" | "name" | "status" | "lineup" | "cap" | "players" | "seats">;
};

/** Phần `roomStore` danh sách người cần (đổi luật, điểm… của phòng không làm danh sách vẽ lại). */
const roomBitsOf = (r: RoomState) => {
  const { host, game, name, status, lineup, cap, players, seats } = r.meta!;
  return { me: r.me, isHost: r.isHost, host, game, name, status, lineup, cap, players, seats };
};

/** Thẻ người chơi trong thanh đối đầu. Mặc định huy hiệu là X / O (caro); game khác đặt `badge`, `tone`. */
export function SeatCard({
  seat,
  mark,
  badge,
  tone: toneOf,
  active,
  isHost,
  me,
  align = "left",
  stacked,
  footer,
}: {
  seat?: SeatView;
  mark?: 1 | 2;
  /** Chữ (hoặc hình nhỏ co theo khung) trên huy hiệu. */
  badge?: ReactNode;
  tone?: string;
  active?: boolean;
  isHost?: boolean;
  me: string;
  align?: "left" | "right";
  /** Luôn xếp dọc (avatar trên tên) như trên điện thoại — cho chỗ hẹp như hai bên bàn lúc trình chiếu. */
  stacked?: boolean;
  /** Dòng thêm dưới tên (dùng với `stacked`), vd. số ván thắng lúc trình chiếu. */
  footer?: ReactNode;
}) {
  const m = seat?.member;
  const tone = toneOf ?? (mark === 1 ? "var(--coral)" : mark === 2 ? "var(--sky)" : "var(--ink-3)");
  const label = badge ?? (mark === 1 ? "X" : "O");
  return (
    <div
      className={`card relative flex min-w-0 flex-1 flex-col items-center gap-2 p-3 text-center transition-all ${stacked ? "" : `sm:flex-row sm:gap-3 sm:p-4 ${align === "right" ? "sm:flex-row-reverse sm:text-right" : "sm:text-left"}`}`}
      style={{
        borderColor: active ? tone : undefined,
        boxShadow: active ? `0 4px 0 ${tone}` : undefined,
        background: active ? `color-mix(in srgb, ${tone} 10%, var(--surface))` : undefined,
      }}
    >
      {m ? (
        <span className="relative">
          <Avatar p={m} size={48} className={seat?.online ? "" : "opacity-40 grayscale"} />
          {isHost && (
            <span className="absolute -top-2.5 -right-1.5 text-lg" title="Chủ phòng" aria-label="Chủ phòng">
              👑
            </span>
          )}
          {mark && (
            <span
              className={`absolute -bottom-1 -left-1.5 grid h-6 w-6 place-items-center rounded-lg border-2 border-edge font-display text-sm font-extrabold text-white ${stacked ? "" : "sm:hidden"}`}
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
        {footer}
      </div>
      {mark && !stacked && (
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
 * Cách vẽ theo chỗ RoomLayout đặt (`PeopleVariantCtx`): khối thu gọn được trong sidebar, tab Người, hay dải avatar.
 */
export const PeoplePanel = memo(function PeoplePanel({
  view: given,
  session,
  roomId,
  detail,
  canSeat = true,
  unseatLabel = "Rời ghế",
}: {
  /** Không truyền thì tự đăng ký `peopleStore` + một phần `roomStore` (bàn chơi đã tách theo store). */
  view?: PeopleSlice;
  session: RoomSession;
  roomId: string;
  detail?: (p: Member, seated: boolean) => React.ReactNode;
  canSeat?: boolean;
  unseatLabel?: string;
}) {
  const people = usePeople(session);
  const bits = useRoomState(session, roomBitsOf, shallowEqual);
  const view: PeopleSlice = given ?? { me: bits.me, isHost: bits.isHost, online: people.online, seats: people.seats, spectators: people.spectators, meta: bits };
  const m = view.meta!;
  const variant = useContext(PeopleVariantCtx);
  const headId = useId();
  const [inviting, setInviting] = useState(false);
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(FOLD_KEY) === "1";
    } catch {
      return false;
    }
  });
  const fold = (v: boolean) => {
    setFolded(v);
    try {
      localStorage.setItem(FOLD_KEY, v ? "1" : "0");
    } catch {}
  };
  const playing = m.status === "playing";
  const seatFree = seatOpen(m);
  const row = (p: Member, seated: boolean) => (
    <li key={p.uid} className="flex items-center gap-2.5 py-1.5">
      <Avatar p={p} size={34} className={view.online.has(p.uid) ? "" : "opacity-40 grayscale"} />
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
  const everyone = [...seated, ...view.spectators];
  const count = m.cap > 0 ? `${view.online.size}/${m.cap}` : `${view.online.size}`;

  if (variant === "strip") return <PeopleStrip people={everyone} online={view.online} count={count} me={view.me} />;

  const title = (
    <span className="truncate">
      👥 Trong phòng <span className="text-ink-3">({count})</span>
    </span>
  );
  const inviteButton = view.isHost && (
    <button type="button" className="btn btn-sm flex-none" onClick={() => setInviting(true)}>
      ✉️ Mời
    </button>
  );
  const list = (
    <ul className="divide-y divide-rule">
      {seated.map((p) => row(p, true))}
      {view.spectators.map((p) => row(p, false))}
    </ul>
  );
  const invite = (
    <Dialog open={inviting} onClose={() => setInviting(false)} title="Mời người chơi">
      {inviting && <InviteList view={view} roomId={roomId} />}
    </Dialog>
  );

  if (variant === "bare")
    return (
      <section className="px-4 py-3" aria-labelledby={headId}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 id={headId} className="min-w-0 font-display text-lg font-extrabold">
            {title}
          </h2>
          {inviteButton}
        </div>
        {list}
        {invite}
      </section>
    );

  // Khối trong sidebar: cao tối đa ~45% để nhường chỗ cho khung chat, danh sách tự cuộn; thu gọn được còn một hàng avatar.
  return (
    <section className={`card flex flex-none flex-col overflow-hidden ${folded ? "" : "max-h-[45%]"}`} aria-labelledby={headId}>
      <div className="flex items-center gap-2 py-2.5 pr-3 pl-4">
        <h2 id={headId} className="min-w-0 flex-1 font-display text-lg font-extrabold">
          <button type="button" className="flex w-full min-w-0 items-center gap-2 text-left transition-colors hover:text-pen" aria-expanded={!folded} onClick={() => fold(!folded)}>
            {title}
            {folded && <AvatarStack people={everyone} online={view.online} />}
            <svg viewBox="0 0 16 16" width="14" height="14" className={`flex-none text-ink-3 transition-transform ${folded ? "-rotate-90" : ""}`} aria-hidden="true">
              <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">{folded ? "Mở danh sách" : "Thu gọn danh sách"}</span>
          </button>
        </h2>
        {inviteButton}
      </div>
      {!folded && <div className="min-h-0 overflow-y-auto border-t-2 border-rule px-4 py-1">{list}</div>}
      {invite}
    </section>
  );
});

/** Hàng avatar chồng lên nhau (tối đa `max` người, còn lại hiện +n). */
function AvatarStack({ people, online, max = 5 }: { people: Member[]; online: Set<string>; max?: number }) {
  const more = people.length - max;
  return (
    <span className="flex flex-none items-center" aria-hidden="true">
      {people.slice(0, max).map((p) => (
        <span key={p.uid} className="-ml-1.5 rounded-full ring-2 ring-surface first:ml-0">
          <Avatar p={p} size={22} className={online.has(p.uid) ? "" : "opacity-40 grayscale"} />
        </span>
      ))}
      {more > 0 && <span className="ml-1 text-xs font-bold text-ink-3">+{more}</span>}
    </span>
  );
}

/** Dải avatar gọn đầu trang (điện thoại): ai đang trong phòng; bấm để mở danh sách đầy đủ trong khung chat. */
function PeopleStrip({
  people,
  online,
  count,
  me,
}: {
  people: Member[];
  online: Set<string>;
  count: string;
  me: string;
}) {
  const open = useContext(PeopleOpenerCtx);
  const MAX = 6;
  const more = people.length - MAX;
  return (
    <button type="button" onClick={open} className="card mb-4 flex w-full items-center gap-3 px-3 py-2 text-left">
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {people.slice(0, MAX).map((p) => (
          <span key={p.uid} className="relative flex-none">
            <Avatar p={p} size={30} className={online.has(p.uid) ? "" : "opacity-40 grayscale"} />
            <span className="sr-only">{p.uid === me ? `${p.name} (bạn)` : p.name}</span>
          </span>
        ))}
        {more > 0 && <span className="text-sm font-bold text-ink-3">+{more}</span>}
      </span>
      <span className="flex-none text-sm font-bold text-ink-2">
        👥 {count} người <span aria-hidden="true">›</span>
      </span>
    </button>
  );
}

/**
 * Menu ⋯ của chủ phòng cho từng người. Đặt `fixed` theo vị trí nút (mở lên trên nếu sát đáy màn hình) để không bị danh
 * sách cuộn trong sidebar / khung chat cắt mất; cuộn hay đổi cỡ màn hình thì đóng.
 */
function HostMenu({ onKick, onMakeHost, name, host }: { onKick: () => void; onMakeHost: () => void; name: string; host: string }) {
  const [at, setAt] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    addEventListener("scroll", close, true);
    addEventListener("resize", close);
    return () => {
      removeEventListener("scroll", close, true);
      removeEventListener("resize", close);
    };
  }, [at]);
  return (
    <div>
      <button
        type="button"
        className="btn btn-sm btn-ghost !px-2"
        aria-expanded={!!at}
        aria-label={`Tuỳ chọn cho ${name}`}
        onClick={(e) => {
          if (at) return setAt(null);
          const r = e.currentTarget.getBoundingClientRect();
          const right = innerWidth - r.right;
          setAt(innerHeight - r.bottom > 130 ? { top: r.bottom + 4, right } : { bottom: innerHeight - r.top + 4, right });
        }}
      >
        ⋯
      </button>
      {at && (
        <div className="card fixed z-50 grid w-48 gap-1 p-1.5" style={at} role="menu" onMouseLeave={() => setAt(null)}>
          <button
            type="button"
            role="menuitem"
            className="rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-sunken"
            onClick={() => {
              setAt(null);
              onMakeHost();
            }}
          >
            👑 Nhường {host.toLowerCase()}
          </button>
          <ConfirmButton
            role="menuitem"
            className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-coral hover:bg-coral-soft"
            onConfirm={() => {
              setAt(null);
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

function InviteList({ view, roomId }: { view: PeopleSlice; roomId: string }) {
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
