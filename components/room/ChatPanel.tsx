"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMsg, RoomSession } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { STICKERS, stickerEmoji } from "./stickers";

const time = (t: number) => new Date(t).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

export function ChatPanel({ session, chat, me }: { session: RoomSession; chat: ChatMsg[]; me: string }) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const stick = useRef(true);

  // Tự cuộn xuống khi có tin mới, trừ khi người dùng đang cuộn lên đọc tin cũ.
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  return (
    <section className="card flex min-h-[380px] flex-col overflow-hidden lg:h-[520px]" aria-label="Trò chuyện trong phòng">
      <h2 className="flex items-center justify-between border-b-2 border-edge px-4 py-3 font-display text-lg font-extrabold">
        💬 Trò chuyện
        <span className="text-xs font-semibold text-ink-3">{chat.filter((m) => !m.system).length} tin</span>
      </h2>
      <ol
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3"
        aria-live="polite"
      >
        {chat.length === 0 && <li className="py-8 text-center text-sm text-ink-3">Chưa có tin nhắn. Chào cả phòng một câu đi! 👋</li>}
        {chat.map((m) =>
          m.system ? (
            <li key={m.id} className="text-center text-[12.5px] font-semibold text-ink-3">
              — {m.text} —
            </li>
          ) : (
            <li key={m.id} className={`flex items-end gap-2 ${m.uid === me ? "flex-row-reverse" : ""}`}>
              <Avatar p={m} size={28} />
              <div className={`max-w-[78%] ${m.uid === me ? "text-right" : ""}`}>
                <p className="px-1 text-[11.5px] font-semibold text-ink-3">
                  {m.uid === me ? "Bạn" : m.name} · {time(m.at)}
                </p>
                {m.sticker ? (
                  <span className="inline-block text-[44px] leading-none" role="img" aria-label={STICKERS.find((s) => s.id === m.sticker)?.label}>
                    {stickerEmoji(m.sticker)}
                  </span>
                ) : (
                  <p
                    className={`inline-block rounded-2xl border-2 border-edge px-3 py-1.5 text-left text-[14.5px] leading-snug [overflow-wrap:anywhere] ${
                      m.uid === me ? "rounded-br-md bg-pen text-on-pen" : "rounded-bl-md bg-sunken"
                    }`}
                  >
                    {m.text}
                  </p>
                )}
              </div>
            </li>
          ),
        )}
      </ol>
      <div className="border-t-2 border-edge p-3">
        <div className="mb-2.5 flex gap-1.5" role="group" aria-label="Gửi sticker">
          {STICKERS.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.label}
              aria-label={`Gửi sticker ${s.label}`}
              onClick={() => session.send({ sticker: s.id })}
              className="grid h-10 flex-1 place-items-center rounded-xl border-2 border-edge bg-surface text-[22px] transition-transform hover:-translate-y-0.5 hover:bg-sunken active:translate-y-0.5"
            >
              {s.emoji}
            </button>
          ))}
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
          <input id="chat-input" className="field !min-h-[42px]" placeholder="Nhắn gì đó…" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          <button type="submit" className="btn btn-pen" disabled={!text.trim()} aria-label="Gửi">
            Gửi
          </button>
        </form>
      </div>
    </section>
  );
}
