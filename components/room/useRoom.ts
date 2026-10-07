"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Profile } from "@/lib/identity";
import { CaroRoom } from "@/lib/net/caro-room";
import type { Lobby } from "@/lib/net/lobby";
import { LotoRoom } from "@/lib/net/loto-room";
import type { ChatMsg, RoomSession, RoomView, StickerId } from "@/lib/net/room";
import { SudokuRoom } from "@/lib/net/sudoku-room";
import { UndercoverRoom } from "@/lib/net/undercover-room";
import { WerewolfRoom } from "@/lib/net/werewolf-room";
import { getSticker } from "@/lib/stickers";

export type GameRoom = CaroRoom | LotoRoom | WerewolfRoom | UndercoverRoom | SudokuRoom;

/**
 * Giữ phiên phòng theo id, đếm tham chiếu và trì hoãn huỷ một nhịp: React Strict Mode (dev) gắn–gỡ–gắn
 * component liên tục, nếu huỷ ngay thì chủ phòng sẽ "rời phòng" rồi vào lại.
 */
const cache = new Map<string, { promise: Promise<GameRoom>; refs: number; timer: ReturnType<typeof setTimeout> | null }>();

function acquire(game: string, id: string, uid: string, profile: Profile, lobby: Lobby) {
  const key = `${game}:${id}:${uid}`;
  let c = cache.get(key);
  if (!c) {
    const promise: Promise<GameRoom> =
      game === "loto"
        ? LotoRoom.open(id, uid, profile, lobby)
        : game === "werewolf"
          ? WerewolfRoom.open(id, uid, profile, lobby)
          : game === "undercover"
            ? UndercoverRoom.open(id, uid, profile, lobby)
            : game === "sudoku"
              ? SudokuRoom.open(id, uid, profile, lobby)
              : CaroRoom.open(id, uid, profile, lobby);
    c = { promise, refs: 0, timer: null };
    cache.set(key, c);
  }
  c.refs++;
  if (c.timer) clearTimeout(c.timer);
  c.timer = null;
  const entry = c;
  return {
    promise: entry.promise,
    release() {
      if (--entry.refs > 0) return;
      entry.timer = setTimeout(() => {
        if (entry.refs > 0) return;
        cache.delete(key);
        void entry.promise.then((s) => s.dispose());
      }, 400);
    },
  };
}

export function useRoomSession(game: string, id: string, uid: string, profile: Profile | null, lobby: Lobby | null) {
  const [session, setSession] = useState<GameRoom | null>(null);
  const ready = !!(id && uid && profile && lobby);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const h = acquire(game, id, uid, profile!, lobby!);
    void h.promise.then((s) => {
      if (alive) setSession(s);
    });
    return () => {
      alive = false;
      setSession(null);
      h.release();
    };
    // Hồ sơ đổi thì cập nhật qua setProfile, không mở lại phiên.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, id, uid, lobby, ready]);

  useEffect(() => {
    if (session && profile) session.setProfile(profile);
  }, [session, profile]);

  return session;
}

const noopSub = () => () => {};

export function useRoomView<G>(session: RoomSession<G> | null): RoomView<G> | null {
  return useSyncExternalStore(
    session?.store.subscribe ?? noopSub,
    session ? session.store.get : () => null,
    () => null,
  );
}

/** Tin nhắn mới nhất của từng người, tự tắt sau vài giây — để vẽ bóng thoại cạnh avatar. */
export function useBalloons(session: RoomSession | null) {
  const [balloons, setBalloons] = useState<Record<string, ChatMsg>>({});
  useEffect(() => {
    if (!session) return;
    return session.onChat((m) => {
      if (m.system || Date.now() - m.at > 8000) return;
      setBalloons((b) => ({ ...b, [m.uid]: m }));
      setTimeout(() => {
        setBalloons((b) => {
          if (b[m.uid]?.id !== m.id) return b;
          const next = { ...b };
          delete next[m.uid];
          return next;
        });
      }, 3700);
    });
  }, [session]);
  return balloons;
}

export type Flyer = { key: string; sticker: StickerId; left: number; top: number; delay?: number; size?: number; rot?: number; dx?: number };

/** Sticker KaiXin gửi một cái thì bay cả đàn. */
const KX_SWARM = 7;

/** Lớp sticker bay ngang bàn chơi; cục gạch làm rung bàn. */
export function useFlyers(session: RoomSession, boardRef: React.RefObject<HTMLDivElement | null>) {
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  useEffect(
    () =>
      session.onChat((m) => {
        if (!m.sticker || Date.now() - m.at > 8000) return;
        if (getSticker(m.sticker)?.src) {
          const swarm: Flyer[] = Array.from({ length: KX_SWARM }, (_, i) => ({
            key: `${m.id}:${i}`,
            sticker: m.sticker!,
            left: 2 + Math.random() * 78,
            top: 5 + Math.random() * 65,
            delay: i === 0 ? 0 : Math.round(150 + Math.random() * 1100),
            size: i === 0 ? 150 : Math.round(80 + Math.random() * 50),
            rot: Math.round(Math.random() * 30 - 15),
            dx: Math.round(Math.random() * 60 - 30),
          }));
          setFlyers((x) => [...x.slice(-(4 * KX_SWARM)), ...swarm]);
          setTimeout(() => setFlyers((x) => x.filter((y) => !swarm.includes(y))), 4400);
          return;
        }
        const f: Flyer = { key: m.id, sticker: m.sticker, left: 20 + Math.random() * 55, top: 25 + Math.random() * 40 };
        setFlyers((x) => [...x.slice(-8), f]);
        setTimeout(() => setFlyers((x) => x.filter((y) => y.key !== f.key)), 2600);
        if (m.sticker === "brick" && boardRef.current) {
          const el = boardRef.current;
          setTimeout(() => {
            el.classList.remove("shake");
            void el.offsetWidth;
            el.classList.add("shake");
          }, 650);
        }
      }),
    [session, boardRef],
  );
  return flyers;
}
