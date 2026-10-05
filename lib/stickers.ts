/**
 * Danh mục sticker dùng chung cho mạng (kiểm tra id nhận được) và giao diện (hiển thị).
 * - Bộ "nhanh": emoji, có hiệu ứng bay riêng trên bàn chơi.
 * - KaiXin Stickers: ảnh tĩnh trong public/stickers/kaixin, gửi một cái là cả đàn bay qua bàn chơi.
 */

const EMOJI = [
  { id: "heart", emoji: "❤️", label: "Trái tim" },
  { id: "brick", emoji: "🧱", label: "Cục gạch" },
  { id: "cow", emoji: "🐄", label: "Con bò" },
  { id: "clap", emoji: "👏", label: "Vỗ tay" },
] as const;

const KAIXIN = [
  { id: "kx-be-ri-gu-du", label: "Bè ri gù đừ" },
  { id: "kx-bo-ruh", label: "Bờ rù" },
  { id: "kx-buh", label: "Bủh" },
  { id: "kx-cay-nho", label: "Cay nhờ" },
  { id: "kx-dak", label: "Đảk" },
  { id: "kx-dang-cap", label: "Đẳng cấp" },
  { id: "kx-dang-suy-ngam", label: "Đáng suy ngẫm" },
  { id: "kx-het-cuu", label: "Hết cứu" },
  { id: "kx-lmao-bun-bun", label: "Lờ mao bủn bủn" },
  { id: "kx-lmao-su-huynh", label: "Lmao sư huynh" },
  { id: "kx-no-hop", label: "Nô hốp" },
  { id: "kx-vua", label: "Vua" },
] as const;

export type EmojiStickerId = (typeof EMOJI)[number]["id"];
export type StickerId = EmojiStickerId | (typeof KAIXIN)[number]["id"];

export type Sticker = { id: StickerId; label: string } & ({ emoji: string; src?: undefined } | { emoji?: undefined; src: string });

export const EMOJI_STICKERS: Sticker[] = EMOJI.map((s) => ({ ...s }));

export const KAIXIN_PACK = "KaiXin Stickers";
export const KAIXIN_STICKERS: Sticker[] = KAIXIN.map((s) => ({ ...s, src: `/stickers/kaixin/${s.id.slice(3)}.webp` }));

const BY_ID = new Map<string, Sticker>([...EMOJI_STICKERS, ...KAIXIN_STICKERS].map((s) => [s.id, s]));

export const getSticker = (id: string) => BY_ID.get(id);
export const isStickerId = (id: unknown): id is StickerId => typeof id === "string" && BY_ID.has(id);
