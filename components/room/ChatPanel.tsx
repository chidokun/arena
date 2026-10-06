"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMsg, RoomSession } from "@/lib/net/room";
import { EMOJI_STICKERS, getSticker, KAIXIN_PACK, KAIXIN_STICKERS, type StickerId } from "@/lib/stickers";
import { Avatar } from "../Avatar";
import { StickerArt } from "./Sticker";

const OPEN_KEY = "arena:chat-open";

const time = (t: number) => new Date(t).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200D|\uFE0F|\s)+$/u;
const PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** Tin chỉ gồm sticker hoặc vài emoji gõ tay: hiện to, không bong bóng. */
const isIcon = (m: ChatMsg) => !m.system && !m.shout && (!!m.sticker || (!!m.text && m.text.length <= 32 && EMOJI_ONLY.test(m.text) && PICTO.test(m.text)));

type Row = { kind: "msg"; m: ChatMsg } | { kind: "icons"; m: ChatMsg; items: ChatMsg[] };

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
  return <StickerArt id={m.sticker} size={getSticker(m.sticker)?.src ? 120 : 56} className="pop-in" />;
}

/** `locked`: lý do tạm không cho gửi tin (ma sói: ban đêm, người đã chết) — vẫn đọc được. */
export function ChatPanel({ session, chat, me, locked }: { session: RoomSession; chat: ChatMsg[]; me: string; locked?: string }) {
  const [text, setText] = useState("");
  const [packOpen, setPackOpen] = useState(false);
  const rows = useMemo(() => toRows(chat), [chat]);
  const total = chat.filter((m) => !m.system).length;
  // Khung chat chỉ dựng ở client sau khi đã vào phòng, nên đọc lựa chọn đã nhớ ngay lúc khởi tạo được.
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });
  // Số tin đã thấy lúc thu gọn, để đếm tin chưa đọc.
  const [seen, setSeen] = useState(0);
  const unread = open ? 0 : Math.max(0, total - seen);
  const listRef = useRef<HTMLOListElement>(null);
  const stick = useRef(true);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setSeen(total);
    if (next) stick.current = true;
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {}
  };

  // Tự cuộn xuống khi có tin mới, vừa mở lại hoặc ô nhập vừa ẩn / hiện, trừ khi người dùng đang cuộn lên đọc tin cũ.
  // Theo id tin cuối chứ không theo số tin: đủ CHAT_LIMIT tin rồi thì số tin không đổi nữa.
  const lastId = chat.at(-1)?.id;
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastId, open, locked]);

  const sendSticker = (sticker: StickerId) => {
    session.send({ sticker });
    stick.current = true;
  };

  return (
    <section
      className={`card flex flex-col overflow-hidden ${!open ? "" : packOpen ? "h-[min(78vh,640px)] lg:h-[700px]" : "h-[min(70vh,520px)] lg:h-[520px]"}`}
      aria-label="Trò chuyện trong phòng"
    >
      <h2 className={`font-display text-lg font-extrabold ${open ? "border-b-2 border-edge" : ""}`}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="chat-body"
          className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-sunken"
        >
          <span className="flex-1">💬 Trò chuyện</span>
          {unread > 0 ? (
            <span className="rounded-full border-2 border-edge bg-coral px-2 py-0.5 text-xs font-bold text-white">{unread} tin mới</span>
          ) : (
            <span className="text-xs font-semibold text-ink-3">{total} tin</span>
          )}
          <span className="text-sm text-ink-3" aria-hidden="true">
            {open ? "▴" : "▾"}
          </span>
          <span className="sr-only">{open ? "Ẩn khung trò chuyện" : "Hiện khung trò chuyện"}</span>
        </button>
      </h2>
      {open && (
        <div id="chat-body" className="flex min-h-0 flex-1 flex-col">
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
            {chat.length === 0 && <li className="py-8 text-center text-sm text-ink-3">Chưa có tin nhắn. Chào cả phòng một câu đi! 👋</li>}
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
          </ol>
          {locked ? (
            <p className="border-t-2 border-edge bg-sunken px-4 py-3.5 text-center text-[13.5px] font-semibold text-ink-2">{locked}</p>
          ) : (
            <div className="border-t-2 border-edge p-3">
              {packOpen && (
                <div id="kaixin-pack" className="mb-2.5 rounded-xl border-2 border-edge bg-sunken p-2" role="group" aria-label={`Gửi ${KAIXIN_PACK}`}>
                  <p className="mb-1.5 px-1 text-[11.5px] font-bold tracking-wide text-ink-3 uppercase">{KAIXIN_PACK}</p>
                  <div className="grid max-h-[148px] grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1 overflow-y-auto">
                    {KAIXIN_STICKERS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        title={s.label}
                        aria-label={`Gửi sticker ${s.label}`}
                        onClick={() => sendSticker(s.id)}
                        className="grid aspect-square place-items-center rounded-lg p-0.5 transition-transform hover:-translate-y-0.5 hover:bg-surface active:translate-y-0.5"
                      >
                        <StickerArt id={s.id} size={52} />
                      </button>
                    ))}
                  </div>
                </div>
            )}
            <div className="mb-2.5 flex gap-1.5" role="group" aria-label="Gửi sticker">
              {EMOJI_STICKERS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.label}
                  aria-label={`Gửi sticker ${s.label}`}
                  onClick={() => sendSticker(s.id)}
                  className="grid h-10 flex-1 place-items-center rounded-xl border-2 border-edge bg-surface text-[22px] transition-transform hover:-translate-y-0.5 hover:bg-sunken active:translate-y-0.5"
                >
                  {s.emoji}
                </button>
              ))}
              <button
                type="button"
                title={KAIXIN_PACK}
                aria-label={`${packOpen ? "Đóng" : "Mở"} ${KAIXIN_PACK}`}
                aria-expanded={packOpen}
                aria-controls="kaixin-pack"
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
                session.send({ text });
                setText("");
                stick.current = true;
              }}
            >
              <label htmlFor="chat-input" className="sr-only">
                Tin nhắn
              </label>
              <input
                id="chat-input"
                className="field !min-h-[42px]"
                placeholder="Nhắn gì đó…"
                value={text}
                maxLength={300}
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
      )}
    </section>
  );
}
