"use client";

import { memo, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ChangelogEntry } from "@/lib/changelog";
import { TEXT_MAX } from "@/lib/net/chat";
import type { ChatMsg, GuessMark, RoomSession } from "@/lib/net/room";
import { KAIXIN_PACK, KAIXIN_STICKERS, QUICK_STICKERS, type StickerId } from "@/lib/stickers";
import { Avatar } from "../Avatar";
import { LogoMark } from "../Logo";
import { useLobbyOnline, useNet, usePublicChat } from "../NetProvider";
import { setStickerFx, useStickerFx } from "../stickerFx";
import { useWhatsNew } from "../WhatsNew";
import { Flyers } from "./RoomLayout";
import { useRoomSide, type RoomSide, type SidePanel } from "./side";
import { useStaged } from "./stage";
import { StickerArt } from "./Sticker";
import { useFlyers } from "./useFlyers";
import { useBalloons, useRoomChat } from "./useRoom";

const ROOM_KEY = "arena:chat-open";
const PUBLIC_KEY = "arena:public-chat-open";

const time = (t: number) => new Date(t).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|\s)+$/u;
const PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

const isIcon = (m: ChatMsg) => !m.system && !m.shout && !m.clue && !m.guess && (!!m.sticker || (!!m.text && m.text.length <= 32 && EMOJI_ONLY.test(m.text) && PICTO.test(m.text)));

// Tin của chính Arena (nhật ký thay đổi) mang logo Arena; cờ `news` chỉ có ở tin tại chỗ, tin qua mạng bị gỡ nên không giả được.
function ChatAvatar({ m, size }: { m: ChatMsg; size: number }) {
  if (m.news) return <LogoMark className="flex-none" style={{ width: size, height: size }} />;
  return <Avatar p={m} size={size} />;
}

type Row = { kind: "msg"; m: ChatMsg } | { kind: "icons"; m: ChatMsg; items: ChatMsg[] };

const GUESS_TAG: Record<GuessMark, string> = { wrong: "❌ Đã đoán sai", near: "🔥 Gần đúng rồi!", right: "✅ Đã đoán đúng" };

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

// Tách riêng và `memo` để gõ phím trong ô nhập hay các cập nhật khác của khung chat (số người online, bàn chơi đổi
// trạng thái…) không vẽ lại cả trăm tin.
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
          <ChatAvatar m={r.m} size={28} />
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
                {r.m.news ? <NewsText text={r.m.text ?? ""} /> : r.m.text}
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

const noop = () => () => {};

// Trên điện thoại bàn phím ảo chỉ thu nhỏ visual viewport chứ không thu layout viewport, nên khung chat `fixed bottom`
// bị che mất ô nhập. Chỉ theo dõi lúc ô nhập đang focus để phóng to bằng hai ngón không bị tính nhầm là bàn phím.
function useKeyboardView(active: boolean) {
  return useSyncExternalStore(
    active
      ? (fn) => {
          const vv = window.visualViewport;
          vv?.addEventListener("resize", fn);
          vv?.addEventListener("scroll", fn);
          return () => {
            vv?.removeEventListener("resize", fn);
            vv?.removeEventListener("scroll", fn);
          };
        }
      : noop,
    () => {
      const vv = window.visualViewport;
      if (!active || !vv || document.documentElement.clientHeight - vv.height < 80) return "";
      return `${Math.round(vv.offsetTop)},${Math.round(vv.height)}`;
    },
    () => "",
  );
}

type Channel = {
  key: "room" | "public";
  label: string;
  chat: ChatMsg[];
  send: (c: Content) => boolean | void;
  empty: string;
  placeholder?: string;
  locked?: string;
  hint?: string;
};

const unreadOf = (chat: ChatMsg[], me: string, since: number) => chat.filter((m) => !m.system && m.uid !== me && m.at > since).length;

function bubbleKind(m: ChatMsg): { tone: string; tag?: string } {
  if (m.news) return { tone: "is-news" };
  if (m.shout) return { tone: "is-shout" };
  if (m.guess) return { tone: `is-${m.guess}`, tag: GUESS_TAG[m.guess] };
  if (m.clue) return { tone: "is-clue", tag: "✍️ Mô tả" };
  return { tone: "" };
}

// Tin "Có gì mới": mỗi dòng một điểm, xuống hàng thì thụt vào thẳng chữ chứ không về dưới dấu chấm. Dùng span vì nằm
// trong <p> / <button> (không chứa được <ul>).
function NewsText({ text }: { text: string }) {
  return (
    <>
      <b className="block font-extrabold">Có gì mới?</b>
      {text.split("\n").map((line, i) => (
        <span key={i} className="relative mt-0.5 block pl-3.5 before:absolute before:left-0 before:content-['•']">
          {line}
        </span>
      ))}
    </>
  );
}

function Bubbles({ msgs, onOpen, z }: { msgs: ChatMsg[]; onOpen: () => void; z: string }) {
  return (
    <ol className={`pointer-events-none fixed right-4 bottom-[86px] ${z} flex w-[min(280px,calc(100vw-2rem))] flex-col items-end gap-2`} aria-live="polite">
      {msgs.map((m, i) => {
        const { tone, tag } = bubbleKind(m);
        return (
          <li key={m.id} className={`chat-bubble ${i === msgs.length - 1 ? "has-tail" : ""} ${tone}`}>
            <button type="button" tabIndex={m.news ? 0 : -1} onClick={onOpen} className="pointer-events-auto flex max-w-full items-start gap-2 px-2.5 py-2 text-left">
              <ChatAvatar m={m} size={30} />
              <span className="min-w-0">
                <span className={`block truncate text-[11.5px] font-bold ${m.shout ? "opacity-70" : "text-ink-3"}`}>{m.name}</span>
                {tag && <span className="chat-bubble-tag block text-[11px] font-extrabold tracking-wide uppercase">{tag}</span>}
                {m.sticker ? (
                  <StickerArt id={m.sticker} size={56} />
                ) : m.news ? (
                  <span className="block text-[14px] leading-snug font-semibold [overflow-wrap:anywhere]">
                    <NewsText text={m.text ?? ""} />
                  </span>
                ) : (
                  <span className={`line-clamp-3 leading-snug [overflow-wrap:anywhere] ${m.shout ? "font-display text-[17px] font-extrabold" : "text-[14px] font-semibold"}`}>{m.text}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ChatBox({
  channels,
  panels = [],
  docked = false,
  hidden = false,
  onHide,
  bind,
  me,
  title,
  storageKey,
  openByDefault,
  bubbles = [],
  onRead,
  staged = false,
}: {
  channels: Channel[];
  panels?: SidePanel[];
  docked?: boolean;
  hidden?: boolean;
  onHide?: (hidden: boolean) => void;
  bind?: RoomSide["bind"];
  me: string;
  title: string;
  storageKey: string;
  openByDefault: () => boolean;
  bubbles?: ChatMsg[];
  // Gọi khi khung đang mở ở một kênh chat — tức người chơi đã thấy tin trong đó.
  onRead?: () => void;
  staged?: boolean;
}) {
  const uid = useId();
  const fx = useStickerFx();
  const [active, setActive] = useState<string>(channels[0].key);
  const panel = panels.find((p) => p.key === active);
  const ch = channels.find((c) => c.key === active) ?? channels[0];
  const [text, setText] = useState("");
  const [packOpen, setPackOpen] = useState(false);
  const [slow, setSlow] = useState(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rows = useMemo(() => toRows(ch.chat), [ch.chat]);
  // Khung chat chỉ dựng ở client (sau khi vào phòng / có kết nối sảnh), nên đọc lựa chọn đã nhớ ngay lúc khởi tạo được.
  const [openPref, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v !== null) return v === "1";
    } catch {}
    return openByDefault();
  });
  const [stagedOpen, setStagedOpen] = useState(false);
  const [wasStaged, setWasStaged] = useState(staged);
  if (staged !== wasStaged) {
    setWasStaged(staged);
    setStagedOpen(false);
  }
  const open = staged ? stagedOpen : docked ? !hidden : openPref;
  // Trên lớp trình chiếu (z 45), dưới thông báo (50) và các cảnh mở / hết ván (60).
  const z = staged ? "z-[47]" : "z-40";
  // Khởi tạo bằng giờ hiện tại để lịch sử có sẵn lúc mở khung (người khác gửi lại cho mình) không tính là tin mới.
  const [seen, setSeen] = useState<Record<string, number>>(() => Object.fromEntries(channels.map((c) => [c.key, Date.now()])));
  const unread = (c: Channel) => (open && !panel && c.key === ch.key ? 0 : unreadOf(c.chat, me, seen[c.key] ?? 0));
  const totalUnread = channels.reduce((n, c) => n + unread(c), 0);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stick = useRef(true);
  // Vừa bấm mở khung: đặt con trỏ vào ô nhập (chỉ máy có chuột — trên điện thoại sẽ bật bàn phím che màn hình).
  const focusOnOpen = useRef(false);
  const [typing, setTyping] = useState(false);
  // Bàn phím ảo đang che: khung chat nổi co lại vừa phần màn hình còn thấy để ô nhập không bị che.
  const kb = useKeyboardView(typing && !docked);
  const kbStyle = (() => {
    if (!kb) return undefined;
    const [top, height] = kb.split(",").map(Number);
    const h = Math.min(height - 24, 600);
    return { top: top + height - h - 12, bottom: "auto", height: h };
  })();

  // Giờ trong tin là giờ máy người gửi (có thể lệch), nên mốc đã đọc lấy cái muộn hơn.
  const markSeen = (c: Channel) => setSeen((s) => ({ ...s, [c.key]: Math.max(Date.now(), c.chat.at(-1)?.at ?? 0) }));

  const toggle = () => {
    const next = !open;
    if (staged) setStagedOpen(next);
    else if (docked) onHide?.(!next);
    else {
      setOpen(next);
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {}
    }
    if (next) {
      stick.current = true;
      focusOnOpen.current = matchMedia("(pointer: fine)").matches;
    } else if (!panel) markSeen(ch);
  };

  const pick = (key: string) => {
    if (key === active) return;
    if (!panel) markSeen(ch);
    setActive(key);
    setSlow(false);
    stick.current = true;
  };

  // Cho chỗ khác (dải avatar trên điện thoại) mở khung ở một tab — thường là tab không phải kênh chat, nên không cần chốt mốc đã đọc.
  useEffect(() => {
    if (!bind) return;
    bind((tab) => {
      setActive(tab);
      setOpen(true);
    });
    return () => bind(null);
  }, [bind]);

  useEffect(() => () => {
    if (slowTimer.current) clearTimeout(slowTimer.current);
  }, []);

  useEffect(() => {
    if (open && !panel) onRead?.();
  }, [open, panel, onRead]);

  // Theo id tin cuối chứ không theo số tin: đủ giới hạn tin rồi thì số tin không đổi nữa.
  const lastId = ch.chat.at(-1)?.id;
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastId, open, active, ch.locked, kb]);

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
      <>
        {bubbles.length > 0 && <Bubbles msgs={bubbles} onOpen={toggle} z={z} />}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={false}
          aria-controls={bodyId}
          className={`btn btn-pen fixed right-4 bottom-4 ${z} h-14 rounded-full text-base shadow-[0_5px_0_var(--edge)] ${staged ? "w-14 px-0" : "px-5"}`}
        >
          {/* Lúc trình chiếu chỉ còn nút tròn biểu tượng để không lấn lên bàn và hàng nút ở góc dưới. */}
          <span aria-hidden="true">💬</span>
          <span className={staged ? "hidden" : "hidden sm:inline"}>{title}</span>
          <span className={staged ? "sr-only" : "sr-only sm:hidden"}>Mở {title.toLowerCase()}</span>
          {totalUnread > 0 && (
            <span className="absolute -top-2 -right-1 min-w-6 rounded-full border-2 border-edge bg-coral px-1.5 py-0.5 text-xs font-bold text-white">
              {totalUnread > 99 ? "99+" : totalUnread}
              <span className="sr-only"> tin mới</span>
            </span>
          )}
        </button>
      </>
    );

  const tabs = [
    ...channels.map((c) => ({ key: c.key, label: c.label, unread: unread(c) })),
    ...panels.map((p) => ({ key: p.key, label: p.label, unread: 0 })),
  ];

  return (
    <section
      className={
        docked
          ? "card flex min-h-0 flex-1 flex-col overflow-hidden"
          : `card fixed inset-x-3 bottom-3 ${z} flex h-[min(78dvh,600px)] flex-col overflow-hidden sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[380px]`
      }
      style={docked ? undefined : { animation: "pop-in 220ms ease", boxShadow: "0 8px 0 var(--edge)", ...kbStyle }}
      aria-label={title}
      onKeyDown={
        docked
          ? undefined
          : (e) => {
              if (e.key !== "Escape") return;
              // Esc chỉ thu nhỏ khung chat, không thoát luôn trình chiếu.
              e.stopPropagation();
              toggle();
            }
      }
    >
      <div className="border-b-2 border-edge">
        {docked ? (
          <h2 className="flex items-center gap-2 py-2.5 pr-2 pl-4 font-display text-lg font-extrabold">
            <span className="flex-1 truncate">💬 {title}</span>
            {fxButton}
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              title="Ẩn sidebar — nhường chỗ cho bàn chơi"
              className="grid h-7 w-7 flex-none place-items-center rounded-lg text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 3.5 8.5 8 4 12.5M8.5 3.5 13 8l-4.5 4.5" />
              </svg>
              <span className="sr-only">Ẩn sidebar người trong phòng và trò chuyện</span>
            </button>
          </h2>
        ) : (
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
        )}
        {tabs.length > 1 && (
          <div className="flex gap-1.5 px-3 pb-2.5" role="tablist" aria-label="Kênh chat">
            {tabs.map((t) => {
              const on = t.key === (panel?.key ?? ch.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls={bodyId}
                  onClick={() => pick(t.key)}
                  className={`flex min-w-0 flex-auto items-center justify-center gap-1.5 rounded-xl border-2 px-2 py-1.5 text-[13.5px] font-bold whitespace-nowrap transition-colors ${
                    on ? "border-edge bg-pen text-on-pen" : "border-transparent bg-sunken text-ink-2 hover:border-edge"
                  }`}
                >
                  <span className="truncate">{t.label}</span>
                  {t.unread > 0 && (
                    <span className="rounded-full border-2 border-edge bg-coral px-1.5 text-[11px] leading-4 text-white">
                      {t.unread > 99 ? "99+" : t.unread}
                      <span className="sr-only"> tin mới</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {panel ? (
        <div id={bodyId} className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
          {panel.node}
        </div>
      ) : (
        <div id={bodyId} className="flex min-h-0 flex-1 flex-col" role={tabs.length > 1 ? "tabpanel" : undefined}>
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
                        className="group grid aspect-square place-items-center rounded-lg p-0.5 hover:bg-surface"
                      >
                        {/* Chỉ ảnh nhún, nút đứng yên: dịch cả nút trong khung cuộn làm hàng sát mép tràn ra, bấm hụt. */}
                        <StickerArt id={s.id} size={52} className="transition-transform group-hover:-translate-y-0.5 group-active:translate-y-0.5" />
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
                className="field-row flex gap-2"
                onFocus={() => setTyping(true)}
                onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setTyping(false)}
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
                  // Chữ dưới 16px thì Safari iOS tự phóng to trang khi focus ô nhập.
                  className="field !min-h-[42px] max-sm:!text-base"
                  placeholder={ch.placeholder ?? "Nhắn gì đó…"}
                  value={text}
                  maxLength={TEXT_MAX}
                  onChange={(e) => setText(e.target.value)}
                  autoComplete="off"
                />
                {/* Không lấy focus khỏi ô nhập khi bấm: bàn phím ảo vẫn mở để gõ tiếp. */}
                <button type="submit" className="btn btn-pen" disabled={!text.trim()} aria-label="Gửi" onPointerDown={(e) => e.preventDefault()}>
                  Gửi
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

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

export const ChatPanel = memo(function ChatPanel({
  session,
  chat: given,
  me = session.me,
  locked,
  placeholder,
}: {
  session: RoomSession;
  chat?: ChatMsg[];
  me?: string;
  locked?: string;
  placeholder?: string;
}) {
  const fromStore = useRoomChat(session);
  const chat = given ?? fromStore;
  const pub = usePublicChannel();
  const room: Channel = {
    key: "room",
    label: "🏠 Phòng",
    chat,
    send: (c) => session.send(c),
    empty: "Chưa có tin nhắn. Chào cả phòng một câu đi! 👋",
    placeholder,
    locked,
  };
  const side = useRoomSide();
  const staged = useStaged();
  useEffect(() => roomChat.mount(), []);
  const balloons = useBalloons(session);
  const bubbles = Object.values(balloons)
    .filter((m) => m.uid !== me)
    .sort((a, b) => a.at - b.at)
    .slice(-3);
  return (
    <ChatBox
      channels={pub ? [room, pub] : [room]}
      panels={side?.panels}
      docked={side?.docked && !staged}
      staged={staged}
      hidden={side?.hidden}
      onHide={side?.setHidden}
      bind={side?.bind}
      me={me}
      title="Trò chuyện"
      storageKey={ROOM_KEY}
      // Màn hình rộng thì nằm sẵn trong sidebar; điện thoại thì thu nhỏ để không che bàn chơi.
      openByDefault={() => false}
      bubbles={bubbles}
    />
  );
});

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

// "Có gì mới" chỉ nhắn vào khung chat công cộng — trong phòng thì để yên cho ván đấu, về sảnh mới báo.
export function PublicChatDock({ latest }: { latest: ChangelogEntry | null }) {
  const inRoom = useSyncExternalStore(roomChat.subscribe, roomChat.shown, () => false);
  const { uid } = useNet();
  const pub = usePublicChannel();
  const news = useWhatsNew(latest, !inRoom && !!pub && !!uid);
  const pubChat = pub?.chat;
  const chat = useMemo(() => (pubChat && news.msg ? [...pubChat, news.msg].sort((a, b) => a.at - b.at) : pubChat), [pubChat, news.msg]);
  if (inRoom || !pub || !chat || !uid) return null;
  return (
    <>
      <PublicFlyers />
      <ChatBox
        channels={[{ ...pub, chat }]}
        me={uid}
        title="Chat công cộng"
        storageKey={PUBLIC_KEY}
        openByDefault={() => false}
        bubbles={news.bubbles}
        onRead={news.read}
      />
    </>
  );
}

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
