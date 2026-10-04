"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Profile } from "@/lib/identity";
import type { Lobby } from "@/lib/net/lobby";
import { RoomSession, type ChatMsg, type RoomView } from "@/lib/net/room";

/**
 * Giữ phiên phòng theo id, đếm tham chiếu và trì hoãn huỷ một nhịp: React Strict Mode (dev) gắn–gỡ–gắn
 * component liên tục, nếu huỷ ngay thì chủ phòng sẽ "rời phòng" rồi vào lại.
 */
const cache = new Map<string, { promise: Promise<RoomSession>; refs: number; timer: ReturnType<typeof setTimeout> | null }>();

function acquire(id: string, uid: string, profile: Profile, lobby: Lobby) {
  const key = `${id}:${uid}`;
  let c = cache.get(key);
  if (!c) {
    c = { promise: RoomSession.open(id, uid, profile, lobby), refs: 0, timer: null };
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

export function useRoomSession(id: string, uid: string, profile: Profile | null, lobby: Lobby | null) {
  const [session, setSession] = useState<RoomSession | null>(null);
  const ready = !!(id && uid && profile && lobby);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const h = acquire(id, uid, profile!, lobby!);
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
  }, [id, uid, lobby, ready]);

  useEffect(() => {
    if (session && profile) session.setProfile(profile);
  }, [session, profile]);

  return session;
}

const noopSub = () => () => {};

export function useRoomView(session: RoomSession | null): RoomView | null {
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
