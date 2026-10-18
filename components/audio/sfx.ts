/**
 * Tiếng hiệu ứng: mỗi game khai báo bộ tiếng của mình bằng `defineSfx`, ghép từ các tiếng dùng chung (`COMMON_SFX`)
 * với tiếng riêng. Hàm phát trả về tự tôn trọng tuỳ chọn tắt tiếng và chuyện trình duyệt chặn tiếng trước thao tác
 * đầu tiên.
 */
import { bell, hz, ready, readPrefs, tone, unlock, type Bus } from "./engine";
import { duck } from "./music";
import { PENTA } from "./tracks";

export type SfxDef = {
  /**
   * Tiếng phát ngay trong một thao tác của người dùng (bấm ô, bấm nút) — được mở ngữ cảnh âm thanh nếu chưa mở.
   * Tiếng tự đến (đếm ngược, người khác đi) thì chỉ phát khi ngữ cảnh đã mở.
   */
  gesture?: boolean;
  /** Lên lịch tiếng bắt đầu ở thời điểm `t` (giờ đồng hồ âm thanh). */
  play(b: Bus, t: number): void;
};

/** Tạo hàm phát cho một bộ tiếng. */
export function defineSfx<K extends string>(defs: Record<K, SfxDef>) {
  return (name: K) => {
    if (!readPrefs().sound) return;
    const def = defs[name];
    const b = def.gesture ? unlock() : ready();
    if (!b) return;
    def.play(b, b.ac.currentTime + 0.01);
  };
}

/** Tiếng dùng chung cho các game. */
export const COMMON_SFX = {
  /** Chọn một ô / quân. */
  pick: {
    gesture: true,
    play: (b, t) => {
      tone(b, b.sfx, { freq: 740, glide: 1040, t, dur: 0.08, gain: 0.16 });
      tone(b, b.sfx, { freq: 1480, t, dur: 0.05, gain: 0.03, type: "triangle" });
    },
  },
  /** Bỏ chọn. */
  unpick: { gesture: true, play: (b, t) => tone(b, b.sfx, { freq: 760, glide: 520, t, dur: 0.08, gain: 0.11 }) },
  /** Nước không hợp lệ / hụt. */
  nope: {
    gesture: true,
    play: (b, t) => {
      tone(b, b.sfx, { freq: 260, glide: 170, t, dur: 0.16, gain: 0.15, type: "triangle", lp: 1200 });
      tone(b, b.sfx, { freq: 210, glide: 140, t: t + 0.09, dur: 0.18, gain: 0.12, type: "triangle", lp: 1200 });
    },
  },
  /** Người khác vừa đi — tiếng gảy nhẹ. */
  other: { play: (b, t) => bell(b, PENTA[Math.floor(Math.random() * 5)], t, 0.045, 0.3) },
  /** Một nhịp đếm ngược. */
  tick: { play: (b, t) => tone(b, b.sfx, { freq: 660, t, dur: 0.1, gain: 0.13 }) },
  /** Hết đếm ngược — bắt đầu. */
  go: {
    play: (b, t) => {
      bell(b, 84, t, 0.12, 0.5);
      bell(b, 88, t + 0.07, 0.1, 0.6);
    },
  },
  /** Mình vừa hoàn thành phần của mình. */
  clear: { play: (b, t) => [72, 79, 84].forEach((n, i) => bell(b, n, t + i * 0.09, 0.1, 0.7)) },
  /** Chiến thắng: bốn nốt đi lên rồi hợp âm ngân dài, nhạc nền nhỏ lại một lúc. */
  win: {
    play: (b, t) => {
      duck(2.2);
      [72, 76, 79, 84].forEach((n, i) => bell(b, n, t + i * 0.12, 0.11, 0.5));
      for (const n of [72, 76, 79, 84, 88]) tone(b, b.sfx, { freq: hz(n), t: t + 0.5, dur: 1.6, gain: 0.045, type: "triangle", attack: 0.02, send: 0.6 });
    },
  },
  /** Người khác thắng / về nhất — tiếng nhẹ hơn. */
  rival: {
    play: (b, t) => {
      bell(b, 84, t, 0.09, 0.4);
      bell(b, 79, t + 0.14, 0.08, 0.6);
    },
  },
} satisfies Record<string, SfxDef>;
