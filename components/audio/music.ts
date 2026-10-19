// Bộ phát gọi bài trước một chút (lookahead) theo đồng hồ âm thanh để nhạc đều nhịp kể cả khi giao diện bận.
import { useEffect } from "react";
import { onPrefs, readPrefs, ready, rng, unlock, whenReady, type Bus } from "./engine";

export type StepCtx = {
  b: Bus;
  dest: AudioNode;
  step: number;
  t: number;
  // Đổi hạt giống ở đầu mỗi vòng để vòng sau khác vòng trước.
  rand: () => number;
};

export type Track = {
  bpm: number;
  stepsPerBeat: number;
  swing: number;
  loop: number;
  level: number;
  lowpass?: number;
  play(c: StepCtx): void;
};

export const stepOf = (track: Track) => 60 / track.bpm / track.stepsPerBeat;

const LOOKAHEAD = 0.15;
const FADE_IN = 2;
const FADE_OUT = 0.8;

type Playing = { track: Track; gain: GainNode; timer: ReturnType<typeof setInterval>; step: number; next: number; rand: () => number };
let playing: Playing | null = null;
const wanted: Track[] = [];
const current = () => wanted[wanted.length - 1];

function start() {
  const track = current();
  const b = ready();
  if (!b || !track || !readPrefs().music) return;
  if (playing?.track === track) return;
  stop();
  const gain = b.ac.createGain();
  const warm = b.ac.createBiquadFilter();
  warm.type = "lowpass";
  warm.frequency.value = track.lowpass ?? 20000;
  gain.connect(warm).connect(b.out);
  const now = b.ac.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(track.level, now + FADE_IN);
  const len = stepOf(track);
  const p: Playing = { track, gain, step: 0, next: now + 0.1, rand: rng(Date.now()), timer: 0 as unknown as ReturnType<typeof setInterval> };
  p.timer = setInterval(() => {
    const t = b.ac.currentTime;
    // Tab bị ẩn lâu (bộ hẹn giờ chạy chậm) thì bỏ qua đoạn đã trễ thay vì dồn một loạt nốt.
    if (p.next < t - 0.05) p.next = t + 0.05;
    while (p.next < t + LOOKAHEAD) {
      if (p.step % track.loop === 0) p.rand = rng(Math.floor(Math.random() * 2 ** 32));
      track.play({ b, dest: gain, step: p.step, t: p.next + (p.step % 2 ? track.swing * len : 0), rand: p.rand });
      p.step++;
      p.next += len;
    }
  }, 25);
  playing = p;
}

function stop() {
  const p = playing;
  const b = ready();
  if (!p) return;
  playing = null;
  clearInterval(p.timer);
  if (!b) return p.gain.disconnect();
  const now = b.ac.currentTime;
  p.gain.gain.cancelScheduledValues(now);
  p.gain.gain.setValueAtTime(Math.max(0.0001, p.gain.gain.value), now);
  p.gain.gain.exponentialRampToValueAtTime(0.0001, now + FADE_OUT);
  setTimeout(() => p.gain.disconnect(), (FADE_OUT + 0.4) * 1000);
}

function sync() {
  if (readPrefs().music && current()) start();
  else stop();
}

let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  onPrefs(sync);
  whenReady(sync);
}

export function duck(seconds: number) {
  const p = playing;
  const b = ready();
  if (!p || !b) return;
  const level = p.track.level;
  const now = b.ac.currentTime;
  p.gain.gain.cancelScheduledValues(now);
  p.gain.gain.setValueAtTime(Math.max(0.0001, p.gain.gain.value), now);
  p.gain.gain.exponentialRampToValueAtTime(level * 0.25, now + 0.15);
  p.gain.gain.setValueAtTime(level * 0.25, now + seconds);
  p.gain.gain.exponentialRampToValueAtTime(level, now + seconds + 1.5);
}

export function useMusic(track: Track) {
  useEffect(() => {
    hook();
    wanted.push(track);
    const wake = () => {
      const { music, sound } = readPrefs();
      if (music || sound) unlock();
    };
    // Người dùng đã thao tác trên trang trước đó (vd. chuyển trang trong ứng dụng) thì phát được ngay; chưa thì chờ lần
    // bấm đầu tiên — mở ngữ cảnh sớm hơn chỉ làm trình duyệt cảnh báo.
    if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) wake();
    sync();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      wanted.splice(wanted.lastIndexOf(track), 1);
      sync();
    };
  }, [track]);
}
