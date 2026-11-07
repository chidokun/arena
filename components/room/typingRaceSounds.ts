import { bell, hiss, readPrefs, ready, tone, type Bus } from "../audio/engine";
import { duck } from "../audio/music";
import { COMMON_SFX, defineSfx } from "../audio/sfx";

export const play = defineSfx({
  ...COMMON_SFX,
  // Tiếng phím: tách nhẹ cộng tiếng thân phím trầm, mỗi phím lệch cao độ một chút cho đỡ đều.
  key: {
    gesture: true,
    play: (b, t) => {
      hiss(b, b.sfx, { t, dur: 0.028, gain: 0.05, type: "bandpass", freq: 3000 + Math.random() * 1200, q: 2.2 });
      tone(b, b.sfx, { freq: 200 + Math.random() * 40, glide: 140, t, dur: 0.04, gain: 0.035, type: "triangle" });
    },
  },
  miss: {
    gesture: true,
    play: (b, t) => {
      tone(b, b.sfx, { freq: 190, glide: 110, t, dur: 0.14, gain: 0.1, type: "square", lp: 700 });
      hiss(b, b.sfx, { t, dur: 0.12, gain: 0.05, type: "lowpass", freq: 500 });
    },
  },
  combo: { play: (b, t) => [76, 79, 84].forEach((n, i) => bell(b, n, t + i * 0.05, 0.06, 0.3)) },
  // Đèn xuất phát: mỗi nhịp đếm một tiếng bíp đỏ, lúc xanh đèn bíp cao kèm tiếng xe lao đi.
  light: { play: (b, t) => tone(b, b.sfx, { freq: 520, t, dur: 0.26, gain: 0.11, type: "square", lp: 1800 }) },
  start: {
    play: (b, t) => {
      tone(b, b.sfx, { freq: 1040, t, dur: 0.45, gain: 0.12, type: "square", lp: 2600 });
      hiss(b, b.sfx, { t: t + 0.05, dur: 0.9, gain: 0.06, type: "bandpass", freq: 400, sweep: 2400, q: 0.8 });
    },
  },
  // Về đích: tiếng đám đông reo (nhiễu quét dải) cùng chuỗi chuông.
  finish: {
    play: (b, t) => {
      duck(2.4);
      hiss(b, b.sfx, { t, dur: 1.8, gain: 0.1, type: "bandpass", freq: 900, sweep: 2200, q: 0.6, send: 0.5 });
      [79, 84, 88, 91].forEach((n, i) => bell(b, n, t + 0.1 + i * 0.08, 0.08, 0.5));
    },
  },
  overtake: { play: (b, t) => hiss(b, b.sfx, { t, dur: 0.35, gain: 0.05, type: "bandpass", freq: 600, sweep: 2600, q: 1.4 }) },
});

// ——— Tiếng máy xe: một nốt kéo dài, cao và to dần theo tốc độ gõ ———

let engine: { b: Bus; osc: OscillatorNode; sub: OscillatorNode; f: BiquadFilterNode; g: GainNode } | null = null;

/** `wpm` = tốc độ hiện tại; `null` = tắt máy (hết ván, rời khu vực gõ, tắt tiếng). */
export function setEngine(wpm: number | null) {
  const b = ready();
  if (wpm == null || !b || !readPrefs().sound) {
    if (!engine) return;
    const { b: eb, g, osc, sub } = engine;
    const t = eb.ac.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, 0.08);
    osc.stop(t + 0.6);
    sub.stop(t + 0.6);
    engine = null;
    return;
  }
  if (!engine || engine.b !== b) {
    const osc = b.ac.createOscillator();
    osc.type = "sawtooth";
    const sub = b.ac.createOscillator();
    sub.type = "sine";
    const f = b.ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 300;
    const g = b.ac.createGain();
    g.gain.value = 0;
    osc.connect(f);
    sub.connect(f);
    f.connect(g).connect(b.sfx);
    osc.start();
    sub.start();
    engine = { b, osc, sub, f, g };
  }
  const v = Math.min(160, Math.max(0, wpm));
  const t = b.ac.currentTime;
  const freq = 48 + v * 0.9;
  engine.osc.frequency.setTargetAtTime(freq, t, 0.25);
  engine.sub.frequency.setTargetAtTime(freq / 2, t, 0.25);
  engine.f.frequency.setTargetAtTime(260 + v * 8, t, 0.3);
  engine.g.gain.setTargetAtTime(0.02 + (v / 160) * 0.045, t, 0.3);
}
