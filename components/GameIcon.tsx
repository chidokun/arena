import { gameLogo, type GameDef } from "@/lib/games/registry";

const base = process.env.BASE_PATH ?? "";

export function GameIcon({ game, size, className = "", lazy }: { game: Pick<GameDef, "slug" | "emoji">; size: number; className?: string; lazy?: boolean }) {
  const src = gameLogo(game.slug);
  if (!src)
    return (
      <span className={`leading-none ${className}`} style={{ fontSize: size * 0.8 }} aria-hidden="true">
        {game.emoji}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- site xuất tĩnh, ảnh đã thu nhỏ sẵn
    <img
      src={base + src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading={lazy ? "lazy" : undefined}
      draggable={false}
      className={`object-contain select-none ${className}`}
    />
  );
}
