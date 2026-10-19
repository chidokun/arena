import { bell, hiss, tone } from "../audio/engine";
import { COMMON_SFX, defineSfx } from "../audio/sfx";

let combo = { at: 0, n: 0 };
const COMBO_MS = 3000;

export const play = defineSfx({
  ...COMMON_SFX,
  pair: {
    gesture: true,
    play: (b, t) => {
      const now = performance.now();
      combo = { at: now, n: now - combo.at < COMBO_MS ? Math.min(combo.n + 1, 8) : 0 };
      const base = 76 + combo.n;
      [0, 4, 7].forEach((d, i) => bell(b, base + d, t + i * 0.055, 0.13));
    },
  },
  hint: { gesture: true, play: (b, t) => [79, 83, 86, 91].forEach((n, i) => bell(b, n, t + i * 0.06, 0.07, 0.6)) },
  shuffle: {
    play: (b, t) => {
      hiss(b, b.sfx, { t, dur: 0.5, gain: 0.12, type: "bandpass", freq: 400, sweep: 3200, q: 1.2 });
      for (let i = 0; i < 7; i++) tone(b, b.sfx, { freq: 1200 + Math.random() * 1600, t: t + 0.05 + i * 0.055, dur: 0.03, gain: 0.05 });
    },
  },
});
