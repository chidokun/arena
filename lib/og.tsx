/**
 * Ảnh xem trước khi dán link (Facebook, Messenger, Zalo, Discord…): 1200×630, vẽ bằng `next/og` lúc build rồi xuất thành
 * file PNG tĩnh (app/og/[file]/route.tsx). Màu lấy từ bảng màu sáng trong globals.css.
 */
import { ImageResponse } from "next/og";
import type { GameDef } from "@/lib/games/registry";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const C = {
  paper: "#f5f2ff",
  dot: "#ddd5ff",
  surface: "#ffffff",
  ink: "#1d1648",
  ink2: "#4b4478",
  pen: "#6c47ff",
  coral: "#ff5a5f",
  lime: "#12b981",
  sun: "#ffc23d",
};

export const OG_HUE: Record<GameDef["hue"], { soft: string; solid: string }> = {
  coral: { soft: "#ffe1e2", solid: "#ff5a5f" },
  sky: { soft: "#dde9ff", solid: "#2f7bff" },
  lime: { soft: "#d3f6e8", solid: "#12b981" },
  grape: { soft: "#efe4ff", solid: "#9b5cf6" },
  sun: { soft: "#fff1cc", solid: "#ffc23d" },
};

/** Tải font từ Google Fonts, chỉ lấy đúng các ký tự cần vẽ (TTF — Satori không đọc được woff2). */
async function googleFont(family: string, weight: number, text: string) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
  if (!src) throw new Error(`Không tải được font ${family} ${weight} cho ảnh OG`);
  return (await fetch(src)).arrayBuffer();
}

type Tile = { emoji: string; hue: GameDef["hue"] };

export type OgCardProps = {
  kicker: string;
  title: string;
  subtitle: string;
  cta: string;
  tiles: Tile[];
};

export async function renderOgImage({ kicker, title, subtitle, cta, tiles }: OgCardProps) {
  const host = SITE_URL.replace(/^https?:\/\//, "");
  const display = `${SITE_NAME}${title}`;
  const body = `${kicker}${subtitle}${cta}${host}`;
  const [titleFont, bodyFont, boldFont] = await Promise.all([
    googleFont("Bricolage Grotesque", 800, display),
    googleFont("Be Vietnam Pro", 500, body),
    googleFont("Be Vietnam Pro", 700, body),
  ]);
  const big = tiles.length === 1;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: "56px 64px",
          background: C.paper,
          backgroundImage: `radial-gradient(${C.dot} 2px, transparent 2px)`,
          backgroundSize: "28px 28px",
          color: C.ink,
          fontFamily: "Body",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Logo />
            <span style={{ fontFamily: "Display", fontSize: 44, letterSpacing: -1 }}>{SITE_NAME}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", marginBottom: "auto", paddingTop: 24, paddingBottom: 24, paddingRight: 40 }}>
            <span
              style={{
                display: "flex",
                alignSelf: "flex-start",
                padding: "8px 18px",
                borderRadius: 999,
                border: `3px solid ${C.ink}`,
                background: C.surface,
                color: C.pen,
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              {kicker}
            </span>
            <span style={{ fontFamily: "Display", fontSize: title.length > 20 ? 64 : title.length > 12 ? 72 : 88, lineHeight: 1.02, letterSpacing: -2, marginTop: 22 }}>{title}</span>
            <span style={{ fontSize: 30, lineHeight: 1.35, color: C.ink2, marginTop: 18 }}>{subtitle}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <span
              style={{
                display: "flex",
                padding: "14px 28px",
                borderRadius: 18,
                border: `3px solid ${C.ink}`,
                background: C.pen,
                color: "#fff",
                fontSize: 28,
                fontWeight: 700,
                boxShadow: `0 6px 0 ${C.ink}`,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {cta}
            </span>
            <span style={{ fontSize: 26, fontWeight: 700, color: C.ink2 }}>{host}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", alignContent: "center", justifyContent: "center", width: 380, flexShrink: 0, gap: 24 }}>
          {tiles.map((t, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: big ? 330 : 172,
                height: big ? 330 : 172,
                borderRadius: big ? 56 : 36,
                border: `5px solid ${C.ink}`,
                background: OG_HUE[t.hue].soft,
                boxShadow: `0 ${big ? 14 : 9}px 0 ${C.ink}`,
                transform: `rotate(${big ? 4 : [-5, 4, 3, -4][i % 4]}deg)`,
                fontSize: big ? 180 : 92,
              }}
            >
              {t.emoji}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      emoji: "twemoji",
      fonts: [
        { name: "Display", data: titleFont, weight: 800, style: "normal" },
        { name: "Body", data: bodyFont, weight: 500, style: "normal" },
        { name: "Body", data: boldFont, weight: 700, style: "normal" },
      ],
    },
  );
}

/** Giống `LogoMark` nhưng màu cố định (Satori không hiểu biến CSS). */
function Logo() {
  return (
    <svg width="64" height="64" viewBox="0 0 36 36">
      <rect x="2" y="3" width="31" height="31" rx="9" fill={C.ink} />
      <rect x="2" y="1.5" width="31" height="30" rx="9" fill={C.pen} stroke={C.ink} strokeWidth="2" />
      <path d="M9.5 9.5l7 7M16.5 9.5l-7 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="23" r="4.2" fill="none" stroke={C.sun} strokeWidth="3" />
      <circle cx="26.5" cy="10" r="2.2" fill={C.coral} />
      <circle cx="10" cy="24.5" r="2.2" fill={C.lime} />
    </svg>
  );
}
