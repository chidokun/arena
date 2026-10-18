/**
 * Các bài nhạc nền dựng sẵn (tổng hợp bằng code, không có tệp âm thanh) — game nào cũng dùng được qua `useMusic`.
 */
import { hiss, hz, tone } from "./engine";
import { stepOf, type Track } from "./music";

/** Vòng hợp âm lo-fi, mỗi hợp âm một ô nhịp: nốt pad (MIDI) và nốt bass. */
const LOFI_CHORDS = [
  { pad: [53, 57, 60, 64], bass: 41 }, // Fmaj7
  { pad: [52, 55, 59, 62], bass: 40 }, // Em7
  { pad: [50, 53, 57, 60], bass: 38 }, // Dm7
  { pad: [48, 52, 55, 59], bass: 36 }, // Cmaj7
];
/** Ngũ cung Đô trưởng hai quãng tám cho giai điệu. */
export const PENTA = [72, 74, 76, 79, 81, 84, 86, 88];

/**
 * Lo-fi chill 76 BPM: vòng Fmaj7 → Em7 → Dm7 → Cmaj7, pad ấm, piano điện nghịch phách, bass, trống nhẹ (kick, rim),
 * giai điệu ngũ cung thưa thớt đổi theo mỗi vòng. Mỗi bước một móc đơn, 8 bước một ô nhịp, 4 ô nhịp một vòng.
 */
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
      // Pad: mỗi nốt hai dao động lệch nhau một chút cho dày, lọc mềm, dài hết ô nhịp.
      for (const n of chord.pad)
        for (const detune of [-7, 7]) tone(b, dest, { freq: hz(n), t, dur: len * 8 + 0.6, gain: 0.022, type: "triangle", attack: 0.5, detune, lp: 950, send: 0.5 });
    }
    // Piano điện: vài cú bấm hợp âm nghịch phách.
    if (s === 0 || s === 3 || (s === 6 && r() < 0.5)) {
      const top = chord.pad.slice(1).map((n) => n + 12);
      for (const n of top) {
        tone(b, dest, { freq: hz(n), t: t + r() * 0.015, dur: 1.1, gain: s === 0 ? 0.018 : 0.026, attack: 0.008, send: 0.35 });
        tone(b, dest, { freq: hz(n) * 2, t, dur: 0.35, gain: 0.004, attack: 0.004 });
      }
    }
    // Bass: nốt gốc phách 1, nhấn lại ở phách 3 lơi.
    if (s === 0 || s === 5) tone(b, dest, { freq: hz(chord.bass), t, dur: s === 0 ? 0.9 : 0.5, gain: 0.13, attack: 0.02, lp: 400 });
    if (s === 7 && r() < 0.4) tone(b, dest, { freq: hz(chord.bass + 7), t, dur: 0.3, gain: 0.08, attack: 0.02, lp: 400 });
    // Trống: kick phách 1 và 3 lơi, rim phách 2 và 4.
    if (s === 0 || s === 5 || (s === 3 && r() < 0.25)) tone(b, dest, { freq: 110, glide: 42, t, dur: 0.28, gain: 0.32 });
    if (s === 2 || s === 6) {
      hiss(b, dest, { t, dur: 0.11, gain: 0.07, type: "bandpass", freq: 1900, q: 1.4, send: 0.3 });
      tone(b, dest, { freq: 190, glide: 140, t, dur: 0.06, gain: 0.05 });
    }
    // Giai điệu ngũ cung thưa thớt, mềm như tiếng music box.
    if (s !== 0 && r() < (bar === 3 ? 0.22 : 0.34)) {
      const n = PENTA[Math.floor(r() * PENTA.length)];
      tone(b, dest, { freq: hz(n), t, dur: 0.9, gain: 0.03, type: "triangle", attack: 0.006, lp: 2600, send: 0.6 });
      tone(b, dest, { freq: hz(n + 12), t, dur: 0.3, gain: 0.006, attack: 0.004, send: 0.6 });
    }
  },
};
