"use client";

import { useEffect, useState } from "react";
import type { ChatMsg, StickerId } from "@/lib/net/room";
import { useStickerFx } from "../stickerFx";

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
  dir?: 1 | -1;
};

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const int = (a: number, b: number) => Math.round(rnd(a, b));
const side = () => (Math.random() < 0.5 ? 1 : -1);
const lag = (i: number, max: number) => (i === 0 ? 0 : int(120, max));
const big = (i: number) => (i === 0 ? 150 : int(80, 130));

const CONFETTI = ["var(--coral)", "var(--sun)", "var(--lime)", "var(--sky)", "var(--grape)", "var(--pen)"];
const BRICK_HIT = 700;

function swarmOf(id: string, sticker: StickerId): Flyer[] {
  const make = (n: number, f: (i: number) => Omit<Flyer, "key" | "sticker">): Flyer[] =>
    Array.from({ length: n }, (_, i) => ({ key: `${id}:${i}`, sticker, ...f(i) }));
  switch (sticker) {
    case "heart":
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
      return make(7, (i) => ({ left: rnd(8, 80), top: rnd(15, 65), delay: i * 170 + int(0, 90), size: big(i), rot: int(-30, 30), dir: side() }));
    case "cow":
      return make(5, (i) => ({ left: rnd(15, 72), top: rnd(8, 70), delay: lag(i, 1300), size: big(i), rot: int(-6, 6), dir: side() }));
    case "clap":
      return make(7, (i) => ({ left: rnd(4, 82), top: rnd(8, 70), delay: lag(i, 1200), size: big(i), rot: int(-20, 20) }));
    case "chicken":
      return make(6, (i) => ({ left: rnd(6, 80), top: rnd(25, 70), delay: lag(i, 1100), size: big(i), rot: int(8, 16), dir: side() }));
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

type ChatSource = { onChat(fn: (m: ChatMsg) => void): () => void };

export function useFlyers(source: ChatSource | null, boardRef?: React.RefObject<HTMLElement | null>) {
  const fx = useStickerFx();
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  useEffect(() => {
    if (!source || !fx) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };
    const off = source.onChat((m) => {
      if (!m.sticker || Date.now() - m.at > 8000) return;
      const swarm = swarmOf(m.id, m.sticker);
      setFlyers((x) => [...x.slice(-150), ...swarm]);
      const last = Math.max(...swarm.map((f) => f.delay ?? 0));
      later(() => setFlyers((x) => x.filter((y) => !swarm.includes(y))), last + 3300);
      const el = boardRef?.current;
      if (m.sticker === "brick" && el)
        for (const f of swarm)
          later(() => {
            el.classList.remove("shake");
            void el.offsetWidth;
            el.classList.add("shake");
          }, (f.delay ?? 0) + BRICK_HIT);
    });
    return () => {
      off();
      for (const t of timers) clearTimeout(t);
      setFlyers([]);
    };
  }, [source, boardRef, fx]);
  return flyers;
}
