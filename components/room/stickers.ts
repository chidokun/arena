import type { StickerId } from "@/lib/net/room";

export const STICKERS: { id: StickerId; emoji: string; label: string }[] = [
  { id: "heart", emoji: "❤️", label: "Trái tim" },
  { id: "brick", emoji: "🧱", label: "Cục gạch" },
  { id: "cow", emoji: "🐄", label: "Con bò" },
  { id: "clap", emoji: "👏", label: "Vỗ tay" },
];

export const stickerEmoji = (id: StickerId) => STICKERS.find((s) => s.id === id)?.emoji ?? "❓";
