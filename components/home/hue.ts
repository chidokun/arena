import type { GameDef } from "@/lib/games/registry";

export const HUE: Record<GameDef["hue"], { soft: string; solid: string }> = {
  coral: { soft: "var(--coral-soft)", solid: "var(--coral)" },
  sky: { soft: "var(--sky-soft)", solid: "var(--sky)" },
  lime: { soft: "var(--lime-soft)", solid: "var(--lime)" },
  grape: { soft: "var(--grape-soft)", solid: "var(--grape)" },
  sun: { soft: "var(--sun-soft)", solid: "var(--sun)" },
};
