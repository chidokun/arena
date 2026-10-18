/**
 * Lõi âm thanh dùng chung cho các game: mọi tiếng đều tổng hợp bằng Web Audio, không có tệp âm thanh nào.
 *
 *   - Ngữ cảnh âm thanh (`Bus`): đường ra chung có nén nhẹ, tiếng vang giả, kênh tiếng hiệu ứng, đoạn nhiễu dựng sẵn.
 *     Trình duyệt chỉ cho phát tiếng sau một thao tác của người dùng, nên ngữ cảnh mở bằng `unlock()` trong lúc bấm /
 *     gõ phím; tiếng tự đến (đếm ngược, người khác đi) dùng `ready()` và im nếu ngữ cảnh chưa mở.
 *   - Tuỳ chọn bật / tắt nhạc nền và tiếng hiệu ứng — của từng máy, chung cho mọi game (nhớ trong localStorage).
 *   - Nhạc cụ cơ bản để dựng bài nhạc (`music.ts`) và tiếng hiệu ứng (`sfx.ts`): `tone`, `hiss`, `bell`.
 */
import { useSyncExternalStore } from "react";

// ---------- tuỳ chọn ----------

export type AudioPrefs = { music: boolean; sound: boolean };

const PREF_KEY = "arena:audio";
const DEFAULT_PREFS: AudioPrefs = { music: true, sound: true };

let prefs: AudioPrefs = DEFAULT_PREFS;
let loaded = false;
const listeners = new Set<() => void>();

export function readPrefs(): AudioPrefs {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const x = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}") as Partial<AudioPrefs>;
      prefs = { music: x.music !== false, sound: x.sound !== false };
    } catch {}
  }
  return prefs;
}

/** Đổi tuỳ chọn — gọi trong lúc người dùng bấm, nên mở luôn ngữ cảnh để bật lên là có tiếng ngay. */
export function setPrefs(next: Partial<AudioPrefs>) {
  prefs = { ...readPrefs(), ...next };
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {}
  if (next.music || next.sound) unlock();
  listeners.forEach((f) => f());
}

/** Theo dõi tuỳ chọn đổi; trả về hàm huỷ theo dõi. */
export function onPrefs(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

/** Tuỳ chọn âm thanh của máy này, kèm hàm bật / tắt. */
export function useAudioPrefs() {
  const p = useSyncExternalStore(onPrefs, readPrefs, () => DEFAULT_PREFS);
  return { ...p, setMusic: (v: boolean) => setPrefs({ music: v }), setSound: (v: boolean) => setPrefs({ sound: v }) };
}

// ---------- ngữ cảnh ----------

const SFX_LEVEL = 0.6;

export type Bus = {
  ac: AudioContext;
  /** Đường ra chung (qua bộ nén). */
  out: GainNode;
  /** Kênh tiếng hiệu ứng. */
  sfx: GainNode;
  /** Tiếng vang — nối thêm một nhánh vào đây để có vang. */
  verb: ConvolverNode;
  /** Một giây nhiễu trắng dựng sẵn. */
  noise: AudioBuffer;
};
let bus: Bus | null = null;
const wakers = new Set<() => void>();

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

/**
 * Mở (hoặc đánh thức) ngữ cảnh âm thanh — gọi trong một thao tác của người dùng. Ngữ cảnh chạy được rồi thì báo cho
 * những ai đang chờ (`whenReady`), vd. bộ phát nhạc.
 */
export function unlock() {
  if (!bus) bus = makeBus();
  const b = bus;
  if (!b) return null;
  if (b.ac.state === "running") wakers.forEach((f) => f());
  else void b.ac.resume().then(() => wakers.forEach((f) => f()));
  return b;
}

/** Ngữ cảnh đang chạy được (đã mở bằng thao tác người dùng), null nếu chưa. */
export const ready = () => (bus && bus.ac.state === "running" ? bus : null);

/** Gọi `f` mỗi lần ngữ cảnh được mở / đánh thức; trả về hàm huỷ. */
export function whenReady(f: () => void) {
  wakers.add(f);
  return () => {
    wakers.delete(f);
  };
}

// ---------- nhạc cụ cơ bản ----------

/** Tần số (Hz) của nốt MIDI. */
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Bộ sinh số giả ngẫu nhiên mulberry32: cùng seed ra cùng dãy. */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ToneOpts = {
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

/** Một nốt từ bộ dao động: bật nhanh rồi tắt dần trong `dur` giây. */
export function tone(b: Bus, dest: AudioNode, o: ToneOpts) {
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

export type NoiseOpts = { t: number; dur: number; gain: number; type: BiquadFilterType; freq: number; q?: number; sweep?: number; send?: number };

/** Một tiếng nhiễu qua bộ lọc (trống, tiếng gió…), tắt dần trong `dur` giây. */
export function hiss(b: Bus, dest: AudioNode, o: NoiseOpts) {
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

/** Chuông nhỏ trên kênh tiếng hiệu ứng: sine + triangle quãng tám, có vang. */
export function bell(b: Bus, midi: number, t: number, gain: number, dur = 0.45) {
  tone(b, b.sfx, { freq: hz(midi), t, dur, gain, attack: 0.004, send: 0.4 });
  tone(b, b.sfx, { freq: hz(midi + 12), t, dur: dur * 0.5, gain: gain * 0.3, type: "triangle", attack: 0.003, send: 0.4 });
}
