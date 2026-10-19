import { hiss, hz, tone } from "./engine";
import { stepOf, type Track } from "./music";

const LOFI_CHORDS = [
  { pad: [53, 57, 60, 64], bass: 41 },
  { pad: [52, 55, 59, 62], bass: 40 },
  { pad: [50, 53, 57, 60], bass: 38 },
  { pad: [48, 52, 55, 59], bass: 36 },
];
export const PENTA = [72, 74, 76, 79, 81, 84, 86, 88];

export const LOFI: Track = {
  bpm: 76,
  stepsPerBeat: 2,
  swing: 0.16,
  loop: 32,
  level: 0.55,
  lowpass: 3200,
  play({ b, dest, step, t, rand: r }) {
    const len = stepOf(LOFI);
    const s = step % 8;
    const bar = Math.floor(step / 8) % LOFI_CHORDS.length;
    const chord = LOFI_CHORDS[bar];
    if (s === 0) {
      // Mỗi nốt hai dao động lệch nhau một chút cho dày tiếng.
      for (const n of chord.pad)
        for (const detune of [-7, 7]) tone(b, dest, { freq: hz(n), t, dur: len * 8 + 0.6, gain: 0.022, type: "triangle", attack: 0.5, detune, lp: 950, send: 0.5 });
    }
    if (s === 0 || s === 3 || (s === 6 && r() < 0.5)) {
      const top = chord.pad.slice(1).map((n) => n + 12);
      for (const n of top) {
        tone(b, dest, { freq: hz(n), t: t + r() * 0.015, dur: 1.1, gain: s === 0 ? 0.018 : 0.026, attack: 0.008, send: 0.35 });
        tone(b, dest, { freq: hz(n) * 2, t, dur: 0.35, gain: 0.004, attack: 0.004 });
      }
    }
    if (s === 0 || s === 5) tone(b, dest, { freq: hz(chord.bass), t, dur: s === 0 ? 0.9 : 0.5, gain: 0.13, attack: 0.02, lp: 400 });
    if (s === 7 && r() < 0.4) tone(b, dest, { freq: hz(chord.bass + 7), t, dur: 0.3, gain: 0.08, attack: 0.02, lp: 400 });
    if (s === 0 || s === 5 || (s === 3 && r() < 0.25)) tone(b, dest, { freq: 110, glide: 42, t, dur: 0.28, gain: 0.32 });
    if (s === 2 || s === 6) {
      hiss(b, dest, { t, dur: 0.11, gain: 0.07, type: "bandpass", freq: 1900, q: 1.4, send: 0.3 });
      tone(b, dest, { freq: 190, glide: 140, t, dur: 0.06, gain: 0.05 });
    }
    if (s !== 0 && r() < (bar === 3 ? 0.22 : 0.34)) {
      const n = PENTA[Math.floor(r() * PENTA.length)];
      tone(b, dest, { freq: hz(n), t, dur: 0.9, gain: 0.03, type: "triangle", attack: 0.006, lp: 2600, send: 0.6 });
      tone(b, dest, { freq: hz(n + 12), t, dur: 0.3, gain: 0.006, attack: 0.004, send: 0.6 });
    }
  },
};
