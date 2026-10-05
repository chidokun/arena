import { getSticker, type StickerId } from "@/lib/stickers";

const base = process.env.BASE_PATH ?? "";

/** Vẽ một sticker: emoji theo cỡ chữ, ảnh KaiXin theo `size` (px). */
export function StickerArt({ id, size, className = "" }: { id: StickerId; size: number; className?: string }) {
  const s = getSticker(id);
  if (!s) return <span className={className}>❓</span>;
  if (s.emoji)
    return (
      <span className={`leading-none ${className}`} style={{ fontSize: size * 0.8 }} role="img" aria-label={s.label}>
        {s.emoji}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- site xuất tĩnh, ảnh đã thu nhỏ sẵn
    <img src={base + s.src} alt={s.label} title={s.label} width={size} height={size} draggable={false} className={`object-contain select-none ${className}`} style={{ width: size, height: size }} />
  );
}
