/**
 * Danh mục sticker dùng chung cho mạng (kiểm tra id nhận được) và giao diện (hiển thị).
 * - Bộ "nhanh": ảnh trong public/stickers/quick, mỗi cái có hiệu ứng bay riêng trên bàn chơi.
 * - KaiXin Stickers: ảnh tĩnh trong public/stickers/kaixin, gửi một cái là cả đàn bay qua bàn chơi.
 */

const QUICK = [
  { id: "heart", label: "Trái tim" },
  { id: "brick", label: "Cục gạch" },
  { id: "cow", label: "Con bò" },
  { id: "clap", label: "Vỗ tay" },
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

export type QuickStickerId = (typeof QUICK)[number]["id"];
export type StickerId = QuickStickerId | (typeof KAIXIN)[number]["id"];

/** `pack`: "quick" bay một cái theo hiệu ứng riêng, "kaixin" bay cả đàn. */
export type Sticker = { id: StickerId; label: string; src: string; pack: "quick" | "kaixin" };

export const QUICK_STICKERS: Sticker[] = QUICK.map((s) => ({ ...s, src: `/stickers/quick/${s.id}.webp`, pack: "quick" }));

export const KAIXIN_PACK = "KaiXin Stickers";
export const KAIXIN_STICKERS: Sticker[] = KAIXIN.map((s) => ({ ...s, src: `/stickers/kaixin/${s.id.slice(3)}.webp`, pack: "kaixin" }));

const BY_ID = new Map<string, Sticker>([...QUICK_STICKERS, ...KAIXIN_STICKERS].map((s) => [s.id, s]));

export const getSticker = (id: string) => BY_ID.get(id);
export const isKaixin = (id: string) => BY_ID.get(id)?.pack === "kaixin";
export const isStickerId = (id: unknown): id is StickerId => typeof id === "string" && BY_ID.has(id);
