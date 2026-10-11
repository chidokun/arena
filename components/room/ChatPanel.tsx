"use client";

import { memo, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { TEXT_MAX } from "@/lib/net/chat";
import type { ChatMsg, GuessMark, RoomSession } from "@/lib/net/room";
import { KAIXIN_PACK, KAIXIN_STICKERS, QUICK_STICKERS, type StickerId } from "@/lib/stickers";
import { Avatar } from "../Avatar";
import { useLobbyOnline, useNet, usePublicChat } from "../NetProvider";
import { setStickerFx, useStickerFx } from "../stickerFx";
import { Flyers } from "./RoomLayout";
import { StickerArt } from "./Sticker";
import { useFlyers } from "./useFlyers";

const ROOM_KEY = "arena:chat-open";
const PUBLIC_KEY = "arena:public-chat-open";

const time = (t: number) => new Date(t).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|\s)+$/u;
const PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** Tin chỉ gồm sticker hoặc vài emoji gõ tay: hiện to, không bong bóng. */
const isIcon = (m: ChatMsg) => !m.system && !m.shout && !m.clue && !m.guess && (!!m.sticker || (!!m.text && m.text.length <= 32 && EMOJI_ONLY.test(m.text) && PICTO.test(m.text)));

type Row = { kind: "msg"; m: ChatMsg } | { kind: "icons"; m: ChatMsg; items: ChatMsg[] };

/** Nhãn của tin kết quả lời đoán (vẽ đoán). */
const GUESS_TAG: Record<GuessMark, string> = { wrong: "❌ Đã đoán sai", near: "🔥 Gần đúng rồi!", right: "✅ Đã đoán đúng" };

/** Gộp các tin icon/sticker liên tiếp của cùng một người (cách nhau dưới 2 phút) vào một dòng. */
function toRows(chat: ChatMsg[]): Row[] {
  const rows: Row[] = [];
  for (const m of chat) {
    const last = rows.at(-1);
    if (!isIcon(m)) rows.push({ kind: "msg", m });
    else if (last?.kind === "icons" && last.m.uid === m.uid && m.at - last.items.at(-1)!.at < 120_000) last.items.push(m);
    else rows.push({ kind: "icons", m, items: [m] });
  }
  return rows;
}

function Icon({ m }: { m: ChatMsg }) {
  if (!m.sticker)
    return (
      <span className="text-[40px] leading-none" role="img" aria-label={m.text}>
        {m.text}
      </span>
    );
  return <StickerArt id={m.sticker} size={120} className="pop-in" />;
}

/**
 * Danh sách tin, tách riêng và `memo` để gõ phím trong ô nhập hay các cập nhật khác của khung chat (số người online,
 * bàn chơi đổi trạng thái…) không vẽ lại cả trăm tin — chỉ vẽ lại khi danh sách tin đổi.
 */
const Messages = memo(function Messages({ rows, me, empty }: { rows: Row[]; me: string; empty: string }) {
  return (
    <>
    {rows.length === 0 && <li className="py-8 text-center text-sm text-ink-3">{empty}</li>}
    {rows.map((r) =>
      r.m.system ? (
        <li key={r.m.id} className="text-center text-[12.5px] font-semibold text-ink-3">
          — {r.m.text} —
        </li>
      ) : (
        <li key={r.m.id} className={`flex items-end gap-2 ${r.m.uid === me ? "flex-row-reverse" : ""}`}>
          <Avatar p={r.m} size={28} />
          <div className={`${r.kind === "icons" ? "max-w-[86%]" : "max-w-[78%]"} ${r.m.uid === me ? "text-right" : ""}`}>
            <p className="px-1 text-[11.5px] font-semibold text-ink-3">
              {r.m.uid === me ? "Bạn" : r.m.name} · {time(r.m.at)}
            </p>
            {r.kind === "icons" ? (
              <div className={`flex flex-wrap items-end gap-1.5 ${r.m.uid === me ? "justify-end" : ""}`}>
                {r.items.map((m) => (
                  <Icon key={m.id} m={m} />
                ))}
              </div>
            ) : r.m.clue ? (
              <p className="chat-clue inline-block rounded-2xl border-2 px-3 py-1.5 text-left text-[14.5px] leading-snug [overflow-wrap:anywhere]">
                <span className="mb-0.5 block text-[11px] font-extrabold tracking-wide uppercase">✍️ Mô tả</span>
                {r.m.text}
              </p>
            ) : r.m.guess ? (
              <p className={`chat-guess is-${r.m.guess} inline-block rounded-2xl border-2 px-3 py-1.5 text-left text-[14.5px] leading-snug [overflow-wrap:anywhere]`}>
                <span className="mb-0.5 block text-[11px] font-extrabold tracking-wide uppercase">{GUESS_TAG[r.m.guess]}</span>
                {r.m.text}
              </p>
            ) : r.m.shout ? (
              <p className="inline-block rounded-2xl border-2 border-edge bg-sun px-3 py-1 font-display text-xl font-extrabold text-[#2b1d00]">
                {r.m.text}
              </p>
            ) : (
              <p
                className={`inline-block rounded-2xl border-2 border-edge px-3 py-1.5 text-left text-[14.5px] leading-snug [overflow-wrap:anywhere] ${
                  r.m.uid === me ? "rounded-br-md bg-pen text-on-pen" : "rounded-bl-md bg-sunken"
                }`}
              >
                {r.m.text}
              </p>
            )}
          </div>
        </li>
      ),
    )}
    </>
  );
});

type Content = { text: string } | { sticker: StickerId };

/** Một kênh chat: trong phòng hoặc công cộng. `send` trả về false nếu tin không gửi được (gửi quá nhanh). */
type Channel = {
  key: "room" | "public";
  label: string;
  chat: ChatMsg[];
  send: (c: Content) => boolean | void;
  empty: string;
  placeholder?: string;
  /** Lý do tạm không cho gửi tin — vẫn đọc được. */
  locked?: string;
  /** Dòng nhắc nhỏ phía trên ô nhập. */
  hint?: string;
};

/** Tin chưa đọc: tin của người khác gửi sau lần cuối mình xem kênh. */
const unreadOf = (chat: ChatMsg[], me: string, since: number) => chat.filter((m) => !m.system && m.uid !== me && m.at > since).length;

/**
 * Khung chat nổi ở góc màn hình, thu nhỏ còn nút tròn (đếm tin mới) — chat được ngay mà không phải cuộn trang.
 * Trong phòng có tab Trong phòng / Công cộng; ngoài phòng chỉ có kênh công cộng.
 * `storageKey`: nơi nhớ đang mở hay thu nhỏ; chưa chọn bao giờ thì theo `openByDefault`.
 */
function ChatBox({ channels, me, title, storageKey, openByDefault }: { channels: Channel[]; me: string; title: string; storageKey: string; openByDefault: () => boolean }) {
  const uid = useId();
  const fx = useStickerFx();
  const [active, setActive] = useState(channels[0].key);
  const ch = channels.find((c) => c.key === active) ?? channels[0];
  const [text, setText] = useState("");
  const [packOpen, setPackOpen] = useState(false);
  const [slow, setSlow] = useState(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rows = useMemo(() => toRows(ch.chat), [ch.chat]);
  // Khung chat chỉ dựng ở client (sau khi vào phòng / có kết nối sảnh), nên đọc lựa chọn đã nhớ ngay lúc khởi tạo được.
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v !== null) return v === "1";
    } catch {}
    return openByDefault();
  });
  // Mốc đã đọc của từng kênh. Lịch sử có sẵn lúc mở khung (người khác gửi lại cho mình) không tính là tin mới.
  const [seen, setSeen] = useState<Record<string, number>>(() => Object.fromEntries(channels.map((c) => [c.key, Date.now()])));
  const unread = (c: Channel) => (open && c.key === ch.key ? 0 : unreadOf(c.chat, me, seen[c.key] ?? 0));
  const totalUnread = channels.reduce((n, c) => n + unread(c), 0);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stick = useRef(true);
  // Vừa bấm mở khung: đặt con trỏ vào ô nhập (chỉ máy có chuột — trên điện thoại sẽ bật bàn phím che màn hình).
  const focusOnOpen = useRef(false);

  // Giờ trong tin là giờ máy người gửi (có thể lệch), nên mốc đã đọc lấy cái muộn hơn.
  const markSeen = (c: Channel) => setSeen((s) => ({ ...s, [c.key]: Math.max(Date.now(), c.chat.at(-1)?.at ?? 0) }));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next) markSeen(ch);
    else {
      stick.current = true;
      focusOnOpen.current = matchMedia("(pointer: fine)").matches;
    }
    try {
      localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {}
  };

  const pick = (c: Channel) => {
    if (c.key === ch.key) return;
    markSeen(ch);
    setActive(c.key);
    setSlow(false);
    stick.current = true;
  };

  useEffect(() => () => {
    if (slowTimer.current) clearTimeout(slowTimer.current);
  }, []);

  // Tự cuộn xuống khi có tin mới, vừa mở lại, đổi kênh hoặc ô nhập vừa ẩn / hiện, trừ khi người dùng đang cuộn lên
  // đọc tin cũ. Theo id tin cuối chứ không theo số tin: đủ giới hạn tin rồi thì số tin không đổi nữa.
  const lastId = ch.chat.at(-1)?.id;
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastId, open, ch.key, ch.locked]);

  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    inputRef.current?.focus();
  }, [open]);

  const send = (c: Content) => {
    const ok = ch.send(c) !== false;
    stick.current = true;
    if (!ok) {
      setSlow(true);
      if (slowTimer.current) clearTimeout(slowTimer.current);
      slowTimer.current = setTimeout(() => setSlow(false), 3000);
    }
    return ok;
  };

  const packId = `${uid}-pack`;
  const bodyId = `${uid}-body`;
  const inputId = `${uid}-input`;

  const fxButton = (
    <button
      type="button"
      onClick={() => setStickerFx(!fx)}
      aria-pressed={fx}
      title={fx ? "Hiệu ứng sticker bay: đang bật — bấm để tắt (sticker chỉ hiện trong khung chat)" : "Hiệu ứng sticker bay: đang tắt — bấm để bật"}
      className={`flex flex-none items-center gap-1.5 rounded-full border-2 border-edge bg-surface py-0.5 pr-1 pl-1.5 text-xs font-bold transition-colors hover:bg-sunken ${
        fx ? "text-ink" : "text-ink-3"
      }`}
    >
      <StickerArt id="heart" size={16} className={`transition-[filter,opacity] ${fx ? "" : "opacity-50 grayscale"}`} />
      <span>Hiệu ứng</span>
      <span className="sr-only">sticker bay: {fx ? "đang bật" : "đang tắt"}</span>
      {/* Công tắc gạt: xanh là bật, xám là tắt — đọc được trạng thái mà không cần dựa vào màu emoji. */}
      <span
        className={`relative h-4 w-7 flex-none rounded-full border-2 border-edge transition-colors ${fx ? "bg-lime" : "bg-sunken"}`}
        aria-hidden="true"
      >
        <span className={`absolute top-1/2 left-0.5 h-2 w-2 -translate-y-1/2 rounded-full bg-edge transition-transform ${fx ? "translate-x-3" : ""}`} />
      </span>
    </button>
  );

  if (!open)
    return (
      <button
        type="button"
        onClick={toggle}
        aria-expanded={false}
        aria-controls={bodyId}
        className="btn btn-pen fixed right-4 bottom-4 z-40 h-14 rounded-full px-5 text-base shadow-[0_5px_0_var(--edge)]"
      >
        <span aria-hidden="true">💬</span>
        <span className="hidden sm:inline">{title}</span>
        <span className="sr-only sm:hidden">Mở {title.toLowerCase()}</span>
        {totalUnread > 0 && (
          <span className="absolute -top-2 -right-1 min-w-6 rounded-full border-2 border-edge bg-coral px-1.5 py-0.5 text-xs font-bold text-white">
            {totalUnread > 99 ? "99+" : totalUnread}
            <span className="sr-only"> tin mới</span>
          </span>
        )}
      </button>
    );

  return (
    <section
      className="card fixed inset-x-3 bottom-3 z-40 flex h-[min(78dvh,600px)] flex-col overflow-hidden sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[380px]"
      style={{ animation: "pop-in 220ms ease", boxShadow: "0 8px 0 var(--edge)" }}
      aria-label={title}
      onKeyDown={(e) => e.key === "Escape" && toggle()}
    >
      <div className="border-b-2 border-edge">
        <h2 className="flex items-center gap-2 pr-2 font-display text-lg font-extrabold">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={bodyId}
            className="flex min-w-0 flex-1 items-center gap-2 py-3 pl-4 text-left transition-colors hover:text-pen"
          >
            <span className="flex-1 truncate">💬 {title}</span>
            <span className="sr-only">Thu nhỏ {title.toLowerCase()}</span>
          </button>
          {fxButton}
          {/* Bản lặp của nút tiêu đề cho dễ bấm bằng chuột; bàn phím / trình đọc màn hình dùng nút tiêu đề. */}
          <button
            type="button"
            onClick={toggle}
            tabIndex={-1}
            aria-hidden="true"
            title="Thu nhỏ"
            className="grid h-7 w-7 flex-none place-items-center rounded-lg text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 12h9" />
            </svg>
          </button>
        </h2>
        {channels.length > 1 && (
          <div className="flex gap-1.5 px-3 pb-2.5" role="tablist" aria-label="Kênh chat">
            {channels.map((c) => {
              const n = unread(c);
              const on = c.key === ch.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls={bodyId}
                  onClick={() => pick(c)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 px-2 py-1.5 text-[13.5px] font-bold transition-colors ${
                    on ? "border-edge bg-pen text-on-pen" : "border-transparent bg-sunken text-ink-2 hover:border-edge"
                  }`}
                >
                  {c.label}
                  {n > 0 && (
                    <span className="rounded-full border-2 border-edge bg-coral px-1.5 text-[11px] leading-4 text-white">
                      {n > 99 ? "99+" : n}
                      <span className="sr-only"> tin mới</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div id={bodyId} className="flex min-h-0 flex-1 flex-col" role={channels.length > 1 ? "tabpanel" : undefined}>
        <ol
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          onLoadCapture={() => {
            // Ảnh sticker tải xong làm danh sách cao thêm: giữ đáy nếu đang bám đáy.
            const el = listRef.current;
            if (el && stick.current) el.scrollTop = el.scrollHeight;
          }}
          className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3"
          aria-live="polite"
        >
          <Messages rows={rows} me={me} empty={ch.empty} />
        </ol>
        {ch.locked ? (
          <p className="border-t-2 border-edge bg-sunken px-4 py-3.5 text-center text-[13.5px] font-semibold text-ink-2">{ch.locked}</p>
        ) : (
          <div className="border-t-2 border-edge p-3">
            {(slow || ch.hint) && (
              <p className={`mb-2 px-1 text-[12.5px] font-semibold ${slow ? "text-coral" : "text-ink-3"}`} role={slow ? "status" : undefined}>
                {slow ? "Bạn gửi nhanh quá, chờ vài giây rồi gửi tiếp nhé." : ch.hint}
              </p>
            )}
            {packOpen && (
              <div id={packId} className="mb-2.5 rounded-xl border-2 border-edge bg-sunken p-2" role="group" aria-label={`Gửi ${KAIXIN_PACK}`}>
                <p className="mb-1.5 px-1 text-[11.5px] font-bold tracking-wide text-ink-3 uppercase">{KAIXIN_PACK}</p>
                <div className="grid max-h-[148px] grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1 overflow-y-auto">
                  {KAIXIN_STICKERS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      title={s.label}
                      aria-label={`Gửi sticker ${s.label}`}
                      onClick={() => send({ sticker: s.id })}
                      className="grid aspect-square place-items-center rounded-lg p-0.5 transition-transform hover:-translate-y-0.5 hover:bg-surface active:translate-y-0.5"
                    >
                      <StickerArt id={s.id} size={52} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mb-2.5 flex gap-1.5" role="group" aria-label="Gửi sticker">
              {QUICK_STICKERS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.label}
                  aria-label={`Gửi sticker ${s.label}`}
                  onClick={() => send({ sticker: s.id })}
                  className="grid h-10 flex-1 place-items-center rounded-xl border-2 border-edge bg-surface transition-transform hover:-translate-y-0.5 hover:bg-sunken active:translate-y-0.5"
                >
                  <StickerArt id={s.id} size={30} />
                </button>
              ))}
              <button
                type="button"
                title={KAIXIN_PACK}
                aria-label={`${packOpen ? "Đóng" : "Mở"} ${KAIXIN_PACK}`}
                aria-expanded={packOpen}
                aria-controls={packId}
                onClick={() => setPackOpen((o) => !o)}
                className={`grid h-10 flex-1 place-items-center overflow-hidden rounded-xl border-2 border-edge transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                  packOpen ? "bg-sun" : "bg-surface hover:bg-sunken"
                }`}
              >
                <StickerArt id={KAIXIN_STICKERS[0].id} size={34} />
              </button>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!text.trim()) return;
                if (send({ text })) setText("");
              }}
            >
              <label htmlFor={inputId} className="sr-only">
                Tin nhắn
              </label>
              <input
                ref={inputRef}
                id={inputId}
                className="field !min-h-[42px]"
                placeholder={ch.placeholder ?? "Nhắn gì đó…"}
                value={text}
                maxLength={TEXT_MAX}
                onChange={(e) => setText(e.target.value)}
                autoComplete="off"
              />
              <button type="submit" className="btn btn-pen" disabled={!text.trim()} aria-label="Gửi">
                Gửi
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}

/** Kênh công cộng: mọi người đang mở trang, đi qua kết nối sảnh. */
function usePublicChannel(): Channel | null {
  const { lobby } = useNet();
  const chat = usePublicChat();
  const online = useLobbyOnline();
  if (!lobby) return null;
  return {
    key: "public",
    label: "🌐 Công cộng",
    chat,
    send: (c) => lobby.say(c),
    empty: "Chưa ai nói gì. Chào mọi người đang online một câu đi! 👋",
    placeholder: "Nhắn cho mọi người đang online…",
    hint: online !== null ? `${online} người đang online cùng đọc kênh này.` : "Chưa nối được với ai — tin nhắn tạm thời chỉ mình bạn thấy.",
  };
}

/**
 * Khung chat trong phòng: tab Trong phòng (mặc định) và Công cộng.
 * `locked`: lý do tạm không cho gửi tin trong phòng (ma sói: ban đêm, người đã chết) — vẫn đọc được. `placeholder`: gợi ý
 * trong ô nhập (vẽ đoán: đang lượt vẽ thì tin của người đoán là lời đoán).
 */
export function ChatPanel({ session, chat, me, locked, placeholder }: { session: RoomSession; chat: ChatMsg[]; me: string; locked?: string; placeholder?: string }) {
  const pub = usePublicChannel();
  const room: Channel = {
    key: "room",
    label: "🏠 Trong phòng",
    chat,
    send: (c) => session.send(c),
    empty: "Chưa có tin nhắn. Chào cả phòng một câu đi! 👋",
    placeholder,
    locked,
  };
  useEffect(() => roomChat.mount(), []);
  return (
    <ChatBox
      channels={pub ? [room, pub] : [room]}
      me={me}
      title="Trò chuyện"
      storageKey={ROOM_KEY}
      // Màn hình rộng thì mở sẵn (khung nằm đè lên cột bên); điện thoại thì thu nhỏ để không che bàn chơi.
      openByDefault={() => matchMedia("(min-width: 1024px)").matches}
    />
  );
}

/** Đếm khung chat phòng đang hiện, để khung chat công cộng nhường chỗ (khung phòng đã có tab Công cộng). */
const roomChat = (() => {
  let n = 0;
  const fns = new Set<() => void>();
  const emit = () => fns.forEach((fn) => fn());
  return {
    mount() {
      n++;
      emit();
      return () => {
        n--;
        emit();
      };
    },
    subscribe(fn: () => void) {
      fns.add(fn);
      return () => {
        fns.delete(fn);
      };
    },
    shown: () => n > 0,
  };
})();

/** Chat công cộng nổi ở góc màn hình, trên mọi trang trừ lúc đang ở trong phòng chơi. */
export function PublicChatDock() {
  const inRoom = useSyncExternalStore(roomChat.subscribe, roomChat.shown, () => false);
  const { uid } = useNet();
  const pub = usePublicChannel();
  if (inRoom || !pub || !uid) return null;
  return (
    <>
      <PublicFlyers />
      <ChatBox channels={[pub]} me={uid} title="Chat công cộng" storageKey={PUBLIC_KEY} openByDefault={() => false} />
    </>
  );
}

/** Sticker gửi vào kênh công cộng bay ngang màn hình (ngoài phòng chơi). */
function PublicFlyers() {
  const { lobby } = useNet();
  const flyers = useFlyers(lobby);
  if (!flyers.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
      <Flyers flyers={flyers} />
    </div>
  );
}
