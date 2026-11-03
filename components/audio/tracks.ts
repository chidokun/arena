import { hiss, hz, tone, type Bus } from "./engine";
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

// Nhạc cờ: chậm và thưa để người chơi nghĩ nước, giai điệu ngũ cung gảy như đàn tranh, có nốt luyến lên.
const ZEN_CHORDS = [
  { pad: [50, 57, 62, 64], bass: 38 },
  { pad: [46, 53, 58, 60], bass: 34 },
  { pad: [48, 55, 60, 62], bass: 36 },
  { pad: [45, 52, 57, 60], bass: 33 },
];
const ZEN_SCALE = [62, 65, 67, 69, 72, 74, 77, 79, 81];
// Giai điệu đi từng bậc gần nhau trên thang (thay vì nhảy lung tung) cho nghe thành câu.
let walk = 3;

function pluck(b: Bus, dest: AudioNode, midi: number, t: number, gain: number) {
  tone(b, dest, { freq: hz(midi), t, dur: 1.5, gain, type: "triangle", attack: 0.003, lp: 2400, send: 0.55 });
  tone(b, dest, { freq: hz(midi) * 2, t, dur: 0.25, gain: gain * 0.3, attack: 0.002, send: 0.4 });
}

export const ZEN: Track = {
  bpm: 68,
  stepsPerBeat: 2,
  swing: 0.1,
  loop: 64,
  level: 0.5,
  lowpass: 3600,
  play({ b, dest, step, t, rand: r }) {
    const len = stepOf(ZEN);
    const s = step % 8;
    const bar = Math.floor(step / 8);
    const chord = ZEN_CHORDS[bar % ZEN_CHORDS.length];
    if (s === 0) {
      for (const n of chord.pad)
        for (const detune of [-6, 6]) tone(b, dest, { freq: hz(n), t, dur: len * 8 + 0.8, gain: 0.018, type: "triangle", attack: 0.8, detune, lp: 800, send: 0.5 });
      tone(b, dest, { freq: hz(chord.bass), t, dur: len * 6, gain: 0.12, attack: 0.04, lp: 300 });
      tone(b, dest, { freq: 90, glide: 45, t, dur: 0.35, gain: 0.16 });
    }
    if (s === 4) tone(b, dest, { freq: hz(chord.bass + 7), t, dur: len * 3, gain: 0.06, attack: 0.04, lp: 300 });
    if ((s === 3 || s === 7) && r() < 0.6) tone(b, dest, { freq: 1300, glide: 900, t, dur: 0.05, gain: 0.03, send: 0.2 });
    if (s === 2 || s === 6) hiss(b, dest, { t, dur: 0.08, gain: 0.025, type: "highpass", freq: 6000 });
    // Câu lẻ đáp lời câu chẵn nên thưa hơn, chừa chỗ thở.
    if (r() < (s % 2 ? 0.16 : bar % 2 ? 0.3 : 0.45)) {
      const d = [-2, -1, -1, 1, 1, 2][Math.floor(r() * 6)];
      walk = Math.max(0, Math.min(ZEN_SCALE.length - 1, walk + d));
      const n = ZEN_SCALE[walk];
      if (walk > 0 && r() < 0.22) {
        pluck(b, dest, ZEN_SCALE[walk - 1], t, 0.022);
        pluck(b, dest, n, t + 0.08, 0.04);
      } else pluck(b, dest, n, t, 0.04);
      if (r() < 0.2) pluck(b, dest, n + 12, t + len * 1.5, 0.014);
    }
  },
};
