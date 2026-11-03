import { bell, hiss, tone, type Bus } from "../audio/engine";
import { duck } from "../audio/music";
import { COMMON_SFX, defineSfx } from "../audio/sfx";

// Đoạn nhiễu dùng chung chỉ dài một giây (bắt đầu lệch tới nửa giây) nên mỗi lần `hiss` không quá ~0,45s; tiếng dài
// hơn thì chồng vài lần nối nhau.

// Tiếng nổ: cú dội trầm, luồng lửa ù xuống dần, rồi lách tách mảnh vỡ. `size` lớn thì nổ to và kéo dài hơn.
function blast(b: Bus, t: number, size: number) {
  tone(b, b.sfx, { freq: 95, glide: 32, t, dur: 0.5 + size * 0.3, gain: 0.42 * size });
  hiss(b, b.sfx, { t, dur: 0.45, gain: 0.32 * size, type: "lowpass", freq: 2600, sweep: 260, send: 0.35 });
  hiss(b, b.sfx, { t: t + 0.18, dur: 0.45, gain: 0.16 * size, type: "lowpass", freq: 900, sweep: 120, send: 0.4 });
  hiss(b, b.sfx, { t, dur: 0.05, gain: 0.14 * size, type: "bandpass", freq: 3200, q: 1.5 });
  for (let i = 0; i < 4 + size * 3; i++)
    hiss(b, b.sfx, { t: t + 0.12 + Math.random() * 0.5 * size, dur: 0.025, gain: 0.05, type: "bandpass", freq: 1800 + Math.random() * 3200, q: 4 });
}

// Bọt nước nổi lên: những nốt ngắn trượt lên, cao thấp và thưa dày ngẫu nhiên.
function bubbles(b: Bus, t: number, n: number, span: number, gain: number) {
  for (let i = 0; i < n; i++) {
    const f = 380 + Math.random() * 520;
    tone(b, b.sfx, { freq: f, glide: f * 1.7, t: t + Math.random() * span, dur: 0.05 + Math.random() * 0.04, gain, send: 0.2 });
  }
}

// Tiếng cạch kim loại khi đặt tàu xuống hải đồ.
function clunk(b: Bus, t: number, gain: number) {
  tone(b, b.sfx, { freq: 320, glide: 190, t, dur: 0.09, gain: gain * 0.7, type: "triangle" });
  tone(b, b.sfx, { freq: 110, glide: 70, t, dur: 0.14, gain });
  hiss(b, b.sfx, { t, dur: 0.035, gain: gain * 0.5, type: "bandpass", freq: 2200, q: 2.5 });
}

// Tiếng đạn rít bay qua đầu, cao rồi trầm dần.
function whistle(b: Bus, t: number, dur: number, gain: number) {
  tone(b, b.sfx, { freq: 2300, glide: 700, t, dur, gain, attack: dur * 0.6, send: 0.3 });
}

export const play = defineSfx({
  ...COMMON_SFX,
  // Bày tàu.
  place: { gesture: true, play: (b, t) => clunk(b, t, 0.24) },
  turn: {
    gesture: true,
    play: (b, t) => {
      tone(b, b.sfx, { freq: 1250, t, dur: 0.03, gain: 0.07, type: "triangle" });
      tone(b, b.sfx, { freq: 1500, t: t + 0.045, dur: 0.03, gain: 0.06, type: "triangle" });
    },
  },
  shuffle: {
    gesture: true,
    play: (b, t) => {
      hiss(b, b.sfx, { t, dur: 0.42, gain: 0.1, type: "bandpass", freq: 280, sweep: 1600, q: 1.1, send: 0.2 });
      for (let i = 0; i < 4; i++) clunk(b, t + 0.12 + i * 0.07 + Math.random() * 0.03, 0.09);
    },
  },
  lock: {
    gesture: true,
    play: (b, t) => {
      clunk(b, t, 0.26);
      bell(b, 74, t + 0.1, 0.08, 0.5);
      bell(b, 81, t + 0.2, 0.08, 0.7);
    },
  },
  // Giao chiến: mình khai hoả thì phát ngay lúc bấm; người khác khai hoả thì nghe tiếng pháo xa và đạn rít tới.
  fire: {
    gesture: true,
    play: (b, t) => {
      tone(b, b.sfx, { freq: 150, glide: 45, t, dur: 0.32, gain: 0.38 });
      hiss(b, b.sfx, { t, dur: 0.3, gain: 0.24, type: "lowpass", freq: 3200, sweep: 300, send: 0.3 });
      hiss(b, b.sfx, { t, dur: 0.04, gain: 0.16, type: "bandpass", freq: 3600, q: 1.2 });
      whistle(b, t + 0.08, 0.4, 0.025);
    },
  },
  incoming: {
    play: (b, t) => {
      tone(b, b.sfx, { freq: 110, glide: 40, t, dur: 0.3, gain: 0.18, send: 0.5 });
      hiss(b, b.sfx, { t, dur: 0.3, gain: 0.1, type: "lowpass", freq: 900, sweep: 200, send: 0.6 });
      whistle(b, t + 0.1, 0.45, 0.045);
    },
  },
  splash: {
    play: (b, t) => {
      hiss(b, b.sfx, { t, dur: 0.4, gain: 0.2, type: "lowpass", freq: 1500, sweep: 260, send: 0.3 });
      hiss(b, b.sfx, { t: t + 0.02, dur: 0.22, gain: 0.09, type: "bandpass", freq: 700, sweep: 2600, q: 1.2 });
      tone(b, b.sfx, { freq: 180, glide: 90, t, dur: 0.14, gain: 0.12 });
      bubbles(b, t + 0.12, 5, 0.35, 0.035);
    },
  },
  hit: { play: (b, t) => blast(b, t, 1) },
  // Nổ to, thân tàu kim loại rên rỉ rồi chìm, bọt nước sủi lên.
  sunk: {
    play: (b, t) => {
      duck(1.6);
      blast(b, t, 1.4);
      for (const detune of [-12, 12]) tone(b, b.sfx, { freq: 78, glide: 46, t: t + 0.35, dur: 1.5, gain: 0.07, type: "sawtooth", attack: 0.35, detune, lp: 420, send: 0.4 });
      hiss(b, b.sfx, { t: t + 0.7, dur: 0.45, gain: 0.08, type: "lowpass", freq: 700, sweep: 200, send: 0.4 });
      bubbles(b, t + 0.8, 12, 1.1, 0.03);
    },
  },
  // Lượt quay về mình: tiếng sonar dội, chờ tiếng phát bắn trước tan bớt.
  yours: {
    play: (b, t) => {
      tone(b, b.sfx, { freq: 1760, t: t + 0.45, dur: 0.8, gain: 0.07, attack: 0.002, send: 0.8 });
      tone(b, b.sfx, { freq: 1760, t: t + 0.95, dur: 0.6, gain: 0.02, attack: 0.002, send: 0.8 });
    },
  },
  pass: {
    play: (b, t) => {
      tone(b, b.sfx, { freq: 230, t, dur: 0.18, gain: 0.08, type: "square", lp: 900 });
      tone(b, b.sfx, { freq: 172, t: t + 0.2, dur: 0.3, gain: 0.08, type: "square", lp: 900 });
    },
  },
});
