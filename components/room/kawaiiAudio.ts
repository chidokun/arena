/**
 * Âm thanh Nối Thú Kawaii, tổng hợp hoàn toàn bằng Web Audio (không có tệp âm thanh nào): nhạc nền lo-fi chill tự
 * sinh — vòng hợp âm Fmaj7 → Em7 → Dm7 → Cmaj7, pad ấm, piano điện, bass, trống nhẹ, giai điệu ngũ cung đổi theo mỗi
 * vòng — và tiếng cho các thao tác trên bàn. Bật / tắt nhạc, tiếng là tuỳ chọn riêng của từng máy (nhớ trong
 * localStorage). Trình duyệt chỉ cho phát tiếng sau một thao tác của người dùng, nên ngữ cảnh âm thanh được mở ở lần
 * bấm / gõ phím đầu tiên trong phòng.
 */
import { useEffect, useSyncExternalStore } from "react";

export type Sfx = "pick" | "unpick" | "pair" | "other" | "nope" | "hint" | "shuffle" | "tick" | "go" | "clear" | "win" | "rival";
type Prefs = { music: boolean; sound: boolean };

const PREF_KEY = "arena:kawaii:audio";
const DEFAULT_PREFS: Prefs = { music: true, sound: true };

const BPM = 76;
/** Một nhịp móc đơn (1/8). */
const EIGHTH = 60 / BPM / 2;
/** Nhịp móc lẻ đi trễ chừng này (swing) — nghe "lười" kiểu lo-fi. */
const SWING = 0.16 * EIGHTH;
const LOOKAHEAD = 0.15;
const MUSIC_LEVEL = 0.55;
const SFX_LEVEL = 0.6;

/** Vòng hợp âm, mỗi hợp âm một ô nhịp: nốt pad (MIDI) và nốt bass. */
const CHORDS = [
  { pad: [53, 57, 60, 64], bass: 41 }, // Fmaj7
  { pad: [52, 55, 59, 62], bass: 40 }, // Em7
  { pad: [50, 53, 57, 60], bass: 38 }, // Dm7
  { pad: [48, 52, 55, 59], bass: 36 }, // Cmaj7
];
/** Ngũ cung Đô trưởng hai quãng tám cho giai điệu. */
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// ---------- tuỳ chọn ----------

let prefs: Prefs = DEFAULT_PREFS;
let loaded = false;
const listeners = new Set<() => void>();

function readPrefs(): Prefs {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const x = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}") as Partial<Prefs>;
      prefs = { music: x.music !== false, sound: x.sound !== false };
    } catch {}
  }
  return prefs;
}

function setPrefs(next: Partial<Prefs>) {
  prefs = { ...readPrefs(), ...next };
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {}
  listeners.forEach((f) => f());
  if (next.music === true) {
    unlock();
    startMusic();
  } else if (next.music === false) stopMusic();
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

// ---------- ngữ cảnh & nút âm thanh ----------

type Bus = { ac: AudioContext; out: GainNode; sfx: GainNode; verb: ConvolverNode; noise: AudioBuffer };
let bus: Bus | null = null;

/** Tiếng vang giả: xung nhiễu tắt dần ~2 giây. */
function impulse(ac: AudioContext, seconds = 2.2) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
  }
  return buf;
}

function makeBus(): Bus | null {
  const AC = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!AC) return null;
  const ac = new AC();
  const out = ac.createGain();
  out.gain.value = 0.9;
  // Nén nhẹ để nhiều tiếng chồng lên nhau không bị vỡ.
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  out.connect(comp).connect(ac.destination);
  const verb = ac.createConvolver();
  verb.buffer = impulse(ac);
  const wet = ac.createGain();
  wet.gain.value = 0.35;
  verb.connect(wet).connect(out);
  const sfx = ac.createGain();
  sfx.gain.value = SFX_LEVEL;
  sfx.connect(out);
  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return { ac, out, sfx, verb, noise };
}

/** Mở (hoặc đánh thức) ngữ cảnh âm thanh — gọi trong một thao tác của người dùng. */
function unlock() {
  if (!bus) bus = makeBus();
  if (bus?.ac.state === "suspended") void bus.ac.resume();
  return bus;
}

/** Ngữ cảnh đang chạy được (đã mở bằng thao tác người dùng). */
const ready = () => (bus && bus.ac.state === "running" ? bus : null);

type ToneOpts = {
  freq: number;
  t: number;
  dur: number;
  gain: number;
  type?: OscillatorType;
  attack?: number;
  /** Trượt cao độ tới tần số này trong suốt nốt. */
  glide?: number;
  detune?: number;
  /** Lọc thông thấp (Hz). */
  lp?: number;
  /** Lượng gửi sang tiếng vang. */
  send?: number;
};

function tone(b: Bus, dest: AudioNode, o: ToneOpts) {
  const { ac } = b;
  const osc = ac.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, o.t);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, o.t + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = ac.createGain();
  const attack = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, o.t);
  g.gain.exponentialRampToValueAtTime(o.gain, o.t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + Math.max(attack + 0.01, o.dur));
  let node: AudioNode = osc;
  if (o.lp) {
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.lp;
    node = node.connect(f);
  }
  node.connect(g).connect(dest);
  if (o.send) {
    const s = ac.createGain();
    s.gain.value = o.send;
    g.connect(s).connect(b.verb);
  }
  osc.start(o.t);
  osc.stop(o.t + o.dur + 0.05);
}

type NoiseOpts = { t: number; dur: number; gain: number; type: BiquadFilterType; freq: number; q?: number; sweep?: number; send?: number };

function hiss(b: Bus, dest: AudioNode, o: NoiseOpts) {
  const { ac } = b;
  const src = ac.createBufferSource();
  src.buffer = b.noise;
  const f = ac.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(o.freq, o.t);
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, o.t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = ac.createGain();
  g.gain.setValueAtTime(o.gain, o.t);
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
  src.connect(f).connect(g).connect(dest);
  if (o.send) {
    const s = ac.createGain();
    s.gain.value = o.send;
    g.connect(s).connect(b.verb);
  }
  // Bắt đầu ở chỗ ngẫu nhiên trong đoạn nhiễu cho mỗi tiếng khác nhau một chút.
  src.start(o.t, Math.random() * 0.5, o.dur + 0.05);
}

// ---------- nhạc nền ----------

type Music = { gain: GainNode; timer: ReturnType<typeof setInterval>; step: number; next: number; rand: () => number };
let music: Music | null = null;
/** Số trang nhạc đang mở (bàn Nối Thú đang hiện) — 0 thì không phát nhạc. */
let mounted = 0;

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lên lịch mọi nốt của một nhịp móc đơn `step` (8 nhịp mỗi ô nhịp, 4 ô nhịp mỗi vòng) tại thời điểm `t`. */
function playStep(b: Bus, m: Music, step: number, t: number) {
  const dest = m.gain;
  const s = step % 8;
  const bar = Math.floor(step / 8) % CHORDS.length;
  const chord = CHORDS[bar];
  const r = m.rand;
  if (s === 0) {
    // Pad: mỗi nốt hai dao động lệch nhau một chút cho dày, lọc mềm, dài hết ô nhịp.
    for (const n of chord.pad)
      for (const detune of [-7, 7]) tone(b, dest, { freq: hz(n), t, dur: EIGHTH * 8 + 0.6, gain: 0.022, type: "triangle", attack: 0.5, detune, lp: 950, send: 0.5 });
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
}

function startMusic() {
  const b = ready();
  if (!b || music || !mounted || !readPrefs().music) return;
  const gain = b.ac.createGain();
  // Lọc tổng cho ấm, nhạc vào dần 2 giây.
  const warm = b.ac.createBiquadFilter();
  warm.type = "lowpass";
  warm.frequency.value = 3200;
  gain.connect(warm).connect(b.out);
  const now = b.ac.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, now + 2);
  const m: Music = { gain, step: 0, next: now + 0.1, rand: rng(Date.now()), timer: 0 as unknown as ReturnType<typeof setInterval> };
  m.timer = setInterval(() => {
    const t = b.ac.currentTime;
    // Tab bị ẩn lâu (bộ hẹn giờ chạy chậm) thì bỏ qua đoạn đã trễ thay vì dồn một loạt nốt.
    if (m.next < t - 0.05) m.next = t + 0.05;
    while (m.next < t + LOOKAHEAD) {
      // Mỗi đầu vòng đổi hạt giống giai điệu để vòng sau khác vòng trước.
      if (m.step % 32 === 0) m.rand = rng(Math.floor(Math.random() * 2 ** 32));
      playStep(b, m, m.step, m.next + (m.step % 2 ? SWING : 0));
      m.step++;
      m.next += EIGHTH;
    }
  }, 25);
  music = m;
}

function stopMusic() {
  const m = music;
  if (!m) return;
  music = null;
  clearInterval(m.timer);
  const b = bus!;
  const now = b.ac.currentTime;
  m.gain.gain.cancelScheduledValues(now);
  m.gain.gain.setValueAtTime(Math.max(0.0001, m.gain.gain.value), now);
  m.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
  setTimeout(() => m.gain.disconnect(), 1200);
}

/** Hạ nhỏ nhạc một lúc (khi có tiếng chiến thắng) rồi trả lại. */
function duck(seconds: number) {
  const m = music;
  const b = ready();
  if (!m || !b) return;
  const now = b.ac.currentTime;
  m.gain.gain.cancelScheduledValues(now);
  m.gain.gain.setValueAtTime(Math.max(0.0001, m.gain.gain.value), now);
  m.gain.gain.exponentialRampToValueAtTime(MUSIC_LEVEL * 0.25, now + 0.15);
  m.gain.gain.setValueAtTime(MUSIC_LEVEL * 0.25, now + seconds);
  m.gain.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, now + seconds + 1.5);
}

// ---------- tiếng thao tác ----------

/** Nối liên tiếp nhanh thì tiếng nối cao dần (combo). */
let combo = { at: 0, n: 0 };
const COMBO_MS = 3000;

/** Chuông nhỏ: sine + triangle quãng tám, có vang. */
function bell(b: Bus, midi: number, t: number, gain: number, dur = 0.45) {
  tone(b, b.sfx, { freq: hz(midi), t, dur, gain, attack: 0.004, send: 0.4 });
  tone(b, b.sfx, { freq: hz(midi + 12), t, dur: dur * 0.5, gain: gain * 0.3, type: "triangle", attack: 0.003, send: 0.4 });
}

/** Phát tiếng cho một thao tác (nếu tiếng đang bật). */
export function play(name: Sfx) {
  if (!readPrefs().sound) return;
  // Tiếng do người dùng bấm thì đánh thức ngữ cảnh luôn; tiếng tự đến (đếm ngược, người khác nối) chỉ phát khi đã mở.
  const b = name === "pick" || name === "unpick" || name === "pair" || name === "nope" || name === "hint" ? unlock() : ready();
  if (!b) return;
  const t = b.ac.currentTime + 0.01;
  switch (name) {
    case "pick":
      tone(b, b.sfx, { freq: 740, glide: 1040, t, dur: 0.08, gain: 0.16 });
      tone(b, b.sfx, { freq: 1480, t, dur: 0.05, gain: 0.03, type: "triangle" });
      break;
    case "unpick":
      tone(b, b.sfx, { freq: 760, glide: 520, t, dur: 0.08, gain: 0.11 });
      break;
    case "pair": {
      const now = performance.now();
      combo = { at: now, n: now - combo.at < COMBO_MS ? Math.min(combo.n + 1, 8) : 0 };
      const base = 76 + combo.n;
      [0, 4, 7].forEach((d, i) => bell(b, base + d, t + i * 0.055, 0.13));
      break;
    }
    case "other":
      bell(b, PENTA[Math.floor(Math.random() * 5)], t, 0.045, 0.3);
      break;
    case "nope":
      tone(b, b.sfx, { freq: 260, glide: 170, t, dur: 0.16, gain: 0.15, type: "triangle", lp: 1200 });
      tone(b, b.sfx, { freq: 210, glide: 140, t: t + 0.09, dur: 0.18, gain: 0.12, type: "triangle", lp: 1200 });
      break;
    case "hint":
      [79, 83, 86, 91].forEach((n, i) => bell(b, n, t + i * 0.06, 0.07, 0.6));
      break;
    case "shuffle":
      hiss(b, b.sfx, { t, dur: 0.5, gain: 0.12, type: "bandpass", freq: 400, sweep: 3200, q: 1.2 });
      for (let i = 0; i < 7; i++) tone(b, b.sfx, { freq: 1200 + Math.random() * 1600, t: t + 0.05 + i * 0.055, dur: 0.03, gain: 0.05 });
      break;
    case "tick":
      tone(b, b.sfx, { freq: 660, t, dur: 0.1, gain: 0.13 });
      break;
    case "go":
      bell(b, 84, t, 0.12, 0.5);
      bell(b, 88, t + 0.07, 0.1, 0.6);
      break;
    case "clear":
      [72, 79, 84].forEach((n, i) => bell(b, n, t + i * 0.09, 0.1, 0.7));
      break;
    case "win":
      duck(2.2);
      [72, 76, 79, 84].forEach((n, i) => bell(b, n, t + i * 0.12, 0.11, 0.5));
      for (const n of [72, 76, 79, 84, 88]) tone(b, b.sfx, { freq: hz(n), t: t + 0.5, dur: 1.6, gain: 0.045, type: "triangle", attack: 0.02, send: 0.6 });
      break;
    case "rival":
      bell(b, 84, t, 0.09, 0.4);
      bell(b, 79, t + 0.14, 0.08, 0.6);
      break;
  }
}

// ---------- hook ----------

/** Tuỳ chọn âm thanh của máy này. */
export function useAudioPrefs() {
  const p = useSyncExternalStore(subscribe, readPrefs, () => DEFAULT_PREFS);
  return { ...p, setMusic: (v: boolean) => setPrefs({ music: v }), setSound: (v: boolean) => setPrefs({ sound: v }) };
}

/**
 * Bật nhạc nền khi bàn Nối Thú đang hiện: lần bấm / gõ phím đầu tiên trên trang mở ngữ cảnh âm thanh rồi phát nhạc
 * (nếu đang bật); rời bàn thì nhạc tắt dần.
 */
export function useMusic() {
  useEffect(() => {
    mounted++;
    const wake = () => {
      if (!readPrefs().music && !readPrefs().sound) return;
      unlock();
      // `resume()` chạy bất đồng bộ — đợi ngữ cảnh chạy rồi mới phát.
      const b = bus;
      if (b?.ac.state === "running") startMusic();
      else void b?.ac.resume().then(startMusic);
    };
    wake();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      if (--mounted === 0) stopMusic();
    };
  }, []);
}
