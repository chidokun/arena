"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Profile } from "@/lib/identity";
import { BattleshipRoom } from "@/lib/net/battleship-room";
import { CaroRoom } from "@/lib/net/caro-room";
import { ChessRoom } from "@/lib/net/chess-room";
import { ConnectFourRoom } from "@/lib/net/connect-four-room";
import { DodgeRoom } from "@/lib/net/dodge-room";
import { DrawGuessRoom } from "@/lib/net/draw-guess-room";
import type { Lobby } from "@/lib/net/lobby";
import { LotoRoom } from "@/lib/net/loto-room";
import { OAnQuanRoom } from "@/lib/net/oanquan-room";
import type { ChatMsg, RoomSession, RoomView } from "@/lib/net/room";
import { SudokuRoom } from "@/lib/net/sudoku-room";
import { UndercoverRoom } from "@/lib/net/undercover-room";
import { WerewolfRoom } from "@/lib/net/werewolf-room";
import { XiangqiRoleRoom } from "@/lib/net/xiangqi-role-room";
import { XiangqiRoom } from "@/lib/net/xiangqi-room";
import { useStickerFx } from "../stickerFx";

export type GameRoom = CaroRoom | LotoRoom | WerewolfRoom | UndercoverRoom | SudokuRoom | XiangqiRoom | DodgeRoom | XiangqiRoleRoom | ConnectFourRoom | BattleshipRoom | DrawGuessRoom | OAnQuanRoom | ChessRoom;

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
              : game === "xiangqi"
                ? XiangqiRoom.open(id, uid, profile, lobby)
                : game === "dodge"
                  ? DodgeRoom.open(id, uid, profile, lobby)
                  : game === "xiangqi-role"
                    ? XiangqiRoleRoom.open(id, uid, profile, lobby)
                    : game === "connect-four"
                      ? ConnectFourRoom.open(id, uid, profile, lobby)
                      : game === "battleship"
                        ? BattleshipRoom.open(id, uid, profile, lobby)
                        : game === "draw-guess"
                          ? DrawGuessRoom.open(id, uid, profile, lobby)
                          : game === "oanquan"
                            ? OAnQuanRoom.open(id, uid, profile, lobby)
                            : game === "chess"
                              ? ChessRoom.open(id, uid, profile, lobby)
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

/**
 * Tin nhắn mới nhất của từng người, tự tắt sau vài giây — để vẽ bóng thoại bật lên từ nút chat (ChatPanel). Tắt hiệu
 * ứng sticker thì sticker không hiện thành bóng thoại.
 */
export function useBalloons(session: RoomSession | null) {
  const fx = useStickerFx();
  const [balloons, setBalloons] = useState<Record<string, ChatMsg>>({});
  useEffect(() => {
    if (!session) return;
    return session.onChat((m) => {
      if (m.system || (m.sticker && !fx) || Date.now() - m.at > 8000) return;
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
  }, [session, fx]);
  return balloons;
}

export { useFlyers, type Flyer } from "./useFlyers";
