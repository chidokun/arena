"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Profile } from "@/lib/identity";
import { BattleshipRoom } from "@/lib/net/battleship-room";
import { CaroRoom } from "@/lib/net/caro-room";
import { ConnectFourRoom } from "@/lib/net/connect-four-room";
import { DodgeRoom } from "@/lib/net/dodge-room";
import type { Lobby } from "@/lib/net/lobby";
import { LotoRoom } from "@/lib/net/loto-room";
import type { ChatMsg, RoomSession, RoomView, StickerId } from "@/lib/net/room";
import { SudokuRoom } from "@/lib/net/sudoku-room";
import { UndercoverRoom } from "@/lib/net/undercover-room";
import { WerewolfRoom } from "@/lib/net/werewolf-room";
import { XiangqiRoleRoom } from "@/lib/net/xiangqi-role-room";
import { XiangqiRoom } from "@/lib/net/xiangqi-room";

export type GameRoom = CaroRoom | LotoRoom | WerewolfRoom | UndercoverRoom | SudokuRoom | XiangqiRoom | DodgeRoom | XiangqiRoleRoom | ConnectFourRoom | BattleshipRoom;

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

/** Một thứ bay qua bàn chơi: sticker, hoặc mảnh pháo giấy khi có `color`. */
export type Flyer = {
  key: string;
  sticker?: StickerId;
  color?: string;
  left: number;
  top: number;
  delay?: number;
  size?: number;
  rot?: number;
  dx?: number;
  dy?: number;
  /** Hướng bay vào: 1 từ trái, -1 từ phải. */
  dir?: 1 | -1;
};

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const int = (a: number, b: number) => Math.round(rnd(a, b));
const side = () => (Math.random() < 0.5 ? 1 : -1);
/** Con đầu ra ngay, các con sau lệch nhịp ngẫu nhiên. */
const lag = (i: number, max: number) => (i === 0 ? 0 : int(120, max));
/** Cỡ sticker trong đàn: con đầu to nhất. */
const big = (i: number) => (i === 0 ? 150 : int(80, 130));

const CONFETTI = ["var(--coral)", "var(--sun)", "var(--lime)", "var(--sky)", "var(--grape)", "var(--pen)"];
/** Lúc cục gạch (bay 1.6s) chạm bàn. */
const BRICK_HIT = 700;

/** Gửi một sticker thì cả đàn bay qua bàn, mỗi bộ một kiểu. */
function swarmOf(id: string, sticker: StickerId): Flyer[] {
  const make = (n: number, f: (i: number) => Omit<Flyer, "key" | "sticker">): Flyer[] =>
    Array.from({ length: n }, (_, i) => ({ key: `${id}:${i}`, sticker, ...f(i) }));
  switch (sticker) {
    case "heart":
      // Tim bay lên giữa một trận pháo giấy bắn từ đáy bàn.
      return [
        ...make(6, (i) => ({ left: rnd(8, 80), top: rnd(35, 70), delay: lag(i, 1000), size: big(i), rot: int(-15, 15), dx: int(-40, 40) })),
        ...Array.from({ length: 64 }, (_, i) => ({
          key: `${id}:c${i}`,
          color: CONFETTI[i % CONFETTI.length],
          left: rnd(4, 94),
          top: rnd(82, 96),
          delay: int(0, 900),
          size: int(20, 32),
          rot: int(-900, 900),
          dx: int(-90, 90),
          dy: -int(200, 440),
        })),
      ];
    case "brick":
      // Gạch ném dồn dập từ hai phía.
      return make(7, (i) => ({ left: rnd(8, 80), top: rnd(15, 65), delay: i * 170 + int(0, 90), size: big(i), rot: int(-30, 30), dir: side() }));
    case "cow":
      return make(5, (i) => ({ left: rnd(15, 72), top: rnd(8, 70), delay: lag(i, 1300), size: big(i), rot: int(-6, 6), dir: side() }));
    case "clap":
      return make(7, (i) => ({ left: rnd(4, 82), top: rnd(8, 70), delay: lag(i, 1200), size: big(i), rot: int(-20, 20) }));
    default:
      return make(7, (i) => ({
        left: 2 + Math.random() * 78,
        top: 5 + Math.random() * 65,
        delay: i === 0 ? 0 : Math.round(150 + Math.random() * 1100),
        size: big(i),
        rot: Math.round(Math.random() * 30 - 15),
        dx: Math.round(Math.random() * 60 - 30),
      }));
  }
}

/** Lớp sticker bay ngang bàn chơi; mỗi cục gạch chạm bàn làm bàn rung. */
export function useFlyers(session: RoomSession, boardRef: React.RefObject<HTMLDivElement | null>) {
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  useEffect(
    () =>
      session.onChat((m) => {
        if (!m.sticker || Date.now() - m.at > 8000) return;
        const swarm = swarmOf(m.id, m.sticker);
        setFlyers((x) => [...x.slice(-150), ...swarm]);
        const last = Math.max(...swarm.map((f) => f.delay ?? 0));
        setTimeout(() => setFlyers((x) => x.filter((y) => !swarm.includes(y))), last + 3300);
        if (m.sticker === "brick" && boardRef.current) {
          const el = boardRef.current;
          for (const f of swarm)
            setTimeout(() => {
              el.classList.remove("shake");
              void el.offsetWidth;
              el.classList.add("shake");
            }, (f.delay ?? 0) + BRICK_HIT);
        }
      }),
    [session, boardRef],
  );
  return flyers;
}
