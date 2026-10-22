"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Profile } from "@/lib/identity";
import { BattleshipRoom } from "@/lib/net/battleship-room";
import { CaroRoom } from "@/lib/net/caro-room";
import { ChessRoom } from "@/lib/net/chess-room";
import { CoChepRoom } from "@/lib/net/co-chep-room";
import { CoChoRoom } from "@/lib/net/co-cho-room";
import { ConnectFourRoom } from "@/lib/net/connect-four-room";
import { DotsBoxesRoom } from "@/lib/net/dots-boxes-room";
import { DrawGuessRoom } from "@/lib/net/draw-guess-room";
import { KawaiiRoom } from "@/lib/net/kawaii-room";
import type { Lobby } from "@/lib/net/lobby";
import { LotoRoom } from "@/lib/net/loto-room";
import { MineControlRoom } from "@/lib/net/mine-control-room";
import { MinesweeperRoom } from "@/lib/net/minesweeper-room";
import { OAnQuanRoom } from "@/lib/net/oanquan-room";
import { ReversiRoom } from "@/lib/net/reversi-room";
import type { ChatMsg, PeopleView, RoomSession, RoomState, RoomView } from "@/lib/net/room";
import { SudokuRoom } from "@/lib/net/sudoku-room";
import { SystemDesignRoom } from "@/lib/net/system-design-room";
import { TrucXanhRoom } from "@/lib/net/truc-xanh-room";
import { UndercoverRoom } from "@/lib/net/undercover-room";
import type { ViewStore } from "@/lib/net/view-store";
import { WerewolfRoom } from "@/lib/net/werewolf-room";
import { XiangqiRoleRoom } from "@/lib/net/xiangqi-role-room";
import { XiangqiRoom } from "@/lib/net/xiangqi-room";
import { useStickerFx } from "../stickerFx";

export type GameRoom = CaroRoom | LotoRoom | WerewolfRoom | UndercoverRoom | SudokuRoom | XiangqiRoom | XiangqiRoleRoom | ConnectFourRoom | BattleshipRoom | DrawGuessRoom | OAnQuanRoom | ChessRoom | DotsBoxesRoom | CoChepRoom | MineControlRoom | KawaiiRoom | TrucXanhRoom | MinesweeperRoom | ReversiRoom | CoChoRoom | SystemDesignRoom;

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
                              : game === "dots-boxes"
                                ? DotsBoxesRoom.open(id, uid, profile, lobby)
                                : game === "co-chep"
                                  ? CoChepRoom.open(id, uid, profile, lobby)
                                  : game === "mine-control"
                                    ? MineControlRoom.open(id, uid, profile, lobby)
                                    : game === "kawaii"
                                      ? KawaiiRoom.open(id, uid, profile, lobby)
                                      : game === "truc-xanh"
                                        ? TrucXanhRoom.open(id, uid, profile, lobby)
                                        : game === "minesweeper"
                                          ? MinesweeperRoom.open(id, uid, profile, lobby)
                                          : game === "reversi"
                                            ? ReversiRoom.open(id, uid, profile, lobby)
                                            : game === "co-cho"
                                              ? CoChoRoom.open(id, uid, profile, lobby)
                                              : game === "system-design"
                                                ? SystemDesignRoom.open(id, uid, profile, lobby)
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

export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ka = Object.keys(a) as (keyof T)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && Object.is(a[k], b[k]));
}

type Store<V> = Pick<ViewStore<V>, "subscribe" | "get">;

export function useStore<V, T>(store: Store<V>, select: (v: V) => T, equal?: (a: T, b: T) => boolean): T;
export function useStore<V, T>(store: Store<V> | null | undefined, select: (v: V) => T, equal?: (a: T, b: T) => boolean): T | null;
export function useStore<V, T>(store: Store<V> | null | undefined, select: (v: V) => T, equal: (a: T, b: T) => boolean = Object.is): T | null {
  const cache = useRef<{ view?: V; select?: (v: V) => T; out?: T; has: boolean }>({ has: false });
  const get = () => {
    if (!store) return null;
    const v = store.get();
    const c = cache.current;
    if (c.has && c.view === v && c.select === select) return c.out as T;
    const out = select(v);
    c.view = v;
    c.select = select;
    if (!c.has || !equal(c.out as T, out)) {
      c.out = out;
      c.has = true;
    }
    return c.out as T;
  };
  return useSyncExternalStore(store?.subscribe ?? noopSub, get, () => null);
}

const whole = <V,>(v: V) => v;

export function useRoomState(session: RoomSession): RoomState;
export function useRoomState<T>(session: RoomSession, select: (r: RoomState) => T, equal?: (a: T, b: T) => boolean): T;
export function useRoomState<T>(session: RoomSession, select: (r: RoomState) => T = whole as (r: RoomState) => T, equal?: (a: T, b: T) => boolean) {
  return useStore(session.roomStore, select, equal);
}

export function usePeople(session: RoomSession): PeopleView;
export function usePeople<T>(session: RoomSession, select: (p: PeopleView) => T, equal?: (a: T, b: T) => boolean): T;
export function usePeople<T>(session: RoomSession, select: (p: PeopleView) => T = whole as (p: PeopleView) => T, equal?: (a: T, b: T) => boolean) {
  return useStore(session.peopleStore, select, equal);
}

export function useGame<G>(session: RoomSession<G>): G | undefined;
export function useGame<G, T>(session: RoomSession<G>, select: (g: G | undefined) => T, equal?: (a: T, b: T) => boolean): T;
export function useGame<G, T>(session: RoomSession<G>, select: (g: G | undefined) => T = whole as (g: G | undefined) => T, equal?: (a: T, b: T) => boolean) {
  return useStore(session.gameStore, select, equal);
}

export function useRoomChat(session: RoomSession): ChatMsg[] {
  return useSyncExternalStore(session.chatStore.subscribe, session.chatStore.get, session.chatStore.get);
}

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
