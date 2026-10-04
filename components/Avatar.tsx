import type { Profile } from "@/lib/identity";

export function Avatar({ p, size = 36, className = "" }: { p: Pick<Profile, "avatar" | "color">; size?: number; className?: string }) {
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.55, background: p.color }}
      aria-hidden="true"
    >
      {p.avatar}
    </span>
  );
}
