import { bell, hiss, tone, type Bus } from "../audio/engine";
import { COMMON_SFX, defineSfx } from "../audio/sfx";

// Quân gỗ đặt xuống bàn: tiếng gõ ngắn cộng tiếng thân bàn trầm. X cao hơn O một chút để nghe là biết bên nào vừa đi.
function stone(b: Bus, t: number, pitch: number, gain: number) {
  hiss(b, b.sfx, { t, dur: 0.045, gain: gain * 1.2, type: "bandpass", freq: 2600 * pitch, q: 3 });
  tone(b, b.sfx, { freq: 520 * pitch, glide: 380 * pitch, t, dur: 0.07, gain: gain * 0.6, type: "triangle" });
  tone(b, b.sfx, { freq: 170 * pitch, glide: 120, t, dur: 0.12, gain: gain * 0.9, send: 0.15 });
}

const X_PITCH = 1.12;
const O_PITCH = 0.9;

export const play = defineSfx({
  ...COMMON_SFX,
  mine1: { gesture: true, play: (b, t) => stone(b, t, X_PITCH, 0.3) },
  mine2: { gesture: true, play: (b, t) => stone(b, t, O_PITCH, 0.3) },
  move1: { play: (b, t) => stone(b, t, X_PITCH, 0.22) },
  move2: { play: (b, t) => stone(b, t, O_PITCH, 0.22) },
  line: {
    play: (b, t) => {
      hiss(b, b.sfx, { t, dur: 0.6, gain: 0.08, type: "bandpass", freq: 800, sweep: 5000, q: 1.4, send: 0.4 });
      [72, 74, 76, 79, 81].forEach((n, i) => bell(b, n, t + i * 0.07, 0.08, 0.5));
    },
  },
});
