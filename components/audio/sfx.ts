import { bell, hz, ready, readPrefs, tone, unlock, type Bus } from "./engine";
import { duck } from "./music";
import { PENTA } from "./tracks";

export type SfxDef = {
  gesture?: boolean;
  play(b: Bus, t: number): void;
};

export function defineSfx<K extends string>(defs: Record<K, SfxDef>) {
  return (name: K) => {
    if (!readPrefs().sound) return;
    const def = defs[name];
    const b = def.gesture ? unlock() : ready();
    if (!b) return;
    def.play(b, b.ac.currentTime + 0.01);
  };
}

export const COMMON_SFX = {
  pick: {
    gesture: true,
    play: (b, t) => {
      tone(b, b.sfx, { freq: 740, glide: 1040, t, dur: 0.08, gain: 0.16 });
      tone(b, b.sfx, { freq: 1480, t, dur: 0.05, gain: 0.03, type: "triangle" });
    },
  },
  unpick: { gesture: true, play: (b, t) => tone(b, b.sfx, { freq: 760, glide: 520, t, dur: 0.08, gain: 0.11 }) },
  nope: {
    gesture: true,
    play: (b, t) => {
      tone(b, b.sfx, { freq: 260, glide: 170, t, dur: 0.16, gain: 0.15, type: "triangle", lp: 1200 });
      tone(b, b.sfx, { freq: 210, glide: 140, t: t + 0.09, dur: 0.18, gain: 0.12, type: "triangle", lp: 1200 });
    },
  },
  other: { play: (b, t) => bell(b, PENTA[Math.floor(Math.random() * 5)], t, 0.045, 0.3) },
  tick: { play: (b, t) => tone(b, b.sfx, { freq: 660, t, dur: 0.1, gain: 0.13 }) },
  go: {
    play: (b, t) => {
      bell(b, 84, t, 0.12, 0.5);
      bell(b, 88, t + 0.07, 0.1, 0.6);
    },
  },
  clear: { play: (b, t) => [72, 79, 84].forEach((n, i) => bell(b, n, t + i * 0.09, 0.1, 0.7)) },
  win: {
    play: (b, t) => {
      duck(2.2);
      [72, 76, 79, 84].forEach((n, i) => bell(b, n, t + i * 0.12, 0.11, 0.5));
      for (const n of [72, 76, 79, 84, 88]) tone(b, b.sfx, { freq: hz(n), t: t + 0.5, dur: 1.6, gain: 0.045, type: "triangle", attack: 0.02, send: 0.6 });
    },
  },
  rival: {
    play: (b, t) => {
      bell(b, 84, t, 0.09, 0.4);
      bell(b, 79, t + 0.14, 0.08, 0.6);
    },
  },
} satisfies Record<string, SfxDef>;
