"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { gameHref, getGame } from "@/lib/games/registry";
import { isKaixin } from "@/lib/stickers";
import { RulesButton } from "../lobby/RulesButton";
import { PeopleOpenerCtx, PeopleVariantCtx, RoomSideCtx, useWide, type RoomSide, type SidePanel } from "./side";
import { StageCtx, useStageHost } from "./stage";
import { StickerArt } from "./Sticker";
import type { Flyer } from "./useFlyers";

export function Notice({ emoji, title, children, spin }: { emoji: string; title: string; children?: React.ReactNode; spin?: boolean }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <div className="card flex flex-col items-center p-8 text-center sm:p-10">
        <span className={`text-6xl ${spin ? "bob" : ""}`} aria-hidden="true">
          {emoji}
        </span>
        <h1 className="mt-4 font-display text-2xl font-extrabold">{title}</h1>
        <div className="mt-2 flex flex-col items-center text-ink-2">{children}</div>
      </div>
    </div>
  );
}

const SIDE_KEY = "arena:room-side-hidden";

/**
 * Khung chung của phòng: thanh vị trí với nút mời / luật chơi / rời phòng, cột bàn chơi và phần xã hội (người trong
 * phòng, trò chuyện, `panels` thêm của từng game).
 * Màn hình rộng: sidebar neo mép phải màn hình, cao từ dưới thanh đầu trang tới đáy — người trong phòng ở trên, khung chat
 * lấp phần còn lại, `panels` thành tab trong khung chat; ẩn được (nhớ lựa chọn) để bàn chơi rộng hết khung, lúc đó chat còn
 * nút tròn ở góc. Điện thoại: dải avatar đầu trang, còn danh sách người và `panels` thành tab trong khung chat nổi.
 * Game bọc bàn chơi trong `StageArea` thì có thêm nút Trình chiếu (stage.tsx).
 */
export function RoomLayout({
  id,
  slug,
  people,
  chat,
  panels,
  children,
}: {
  id: string;
  slug: string;
  people: React.ReactNode;
  chat: React.ReactNode;
  panels?: SidePanel[];
  children: React.ReactNode;
}) {
  const game = getGame(slug)!;
  const [copied, setCopied] = useState(false);
  const wide = useWide();
  const stage = useStageHost();
  const opener = useRef<((tab: string) => void) | null>(null);
  const bind = useCallback<RoomSide["bind"]>((fn) => {
    opener.current = fn;
  }, []);
  const openPeople = useCallback(() => opener.current?.("people"), []);
  const [hidden, setHiddenState] = useState(() => {
    try {
      return localStorage.getItem(SIDE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const setHidden = useCallback((v: boolean) => {
    setHiddenState(v);
    try {
      localStorage.setItem(SIDE_KEY, v ? "1" : "0");
    } catch {}
  }, []);
  const shown = wide && !hidden;
  // Sidebar neo mép phải màn hình: chừa lề phải cho <main> và chân trang (globals.css, `html[data-room-side]`). Đặt
  // trước khi vẽ để bàn chơi không nháy rộng rồi co lại.
  useLayoutEffect(() => {
    if (!shown) return;
    const html = document.documentElement;
    html.dataset.roomSide = "";
    return () => {
      delete html.dataset.roomSide;
    };
  }, [shown]);
  const peopleTab: SidePanel = { key: "people", label: "👥 Người", node: <PeopleVariantCtx value="bare">{people}</PeopleVariantCtx> };
  // Danh sách người nằm sẵn trong sidebar thì không cần tab Người; lúc trình chiếu sidebar bị phủ nên khung chat nổi cần lại tab này.
  const docked = wide && !stage.ctx.on;
  const side: RoomSide = { docked: wide, hidden, setHidden, panels: docked ? (panels ?? []) : [peopleTab, ...(panels ?? [])], bind };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <nav aria-label="Vị trí" className="min-w-0 basis-full text-sm font-semibold text-ink-3 sm:basis-auto sm:flex-1">
          <Link href="/" className="no-underline hover:text-ink">
            Trang chủ
          </Link>{" "}
          /{" "}
          <Link href={gameHref(slug)} className="no-underline hover:text-ink">
            {game.name}
          </Link>{" "}
          / <span className="text-ink">#{id}</span>
        </nav>
        <button type="button" className="btn btn-sm" onClick={copyLink}>
          {copied ? "✅ Đã chép" : "🔗 Chép link mời"}
        </button>
        {stage.available && (
          <button type="button" className="btn btn-sm" onClick={stage.enter}>
            📺 Trình chiếu
          </button>
        )}
        <RulesButton game={game} compact />
        <Link href={gameHref(slug)} className="btn btn-sm btn-ghost no-underline">
          Rời phòng
        </Link>
      </div>

      {/* Khung chat cũng đọc StageCtx: lúc trình chiếu nó nổi lên trên lớp trình chiếu. */}
      <StageCtx value={stage.ctx}>
        <RoomSideCtx value={side}>
          {/* Bàn chơi giữ nguyên vị trí trong cây khi đổi cỡ màn hình qua mốc lg, để không bị dựng lại (mất nét vẽ, trạng thái…). */}
          <div className="min-w-0">
            {!wide && (
              <PeopleVariantCtx value="strip">
                <PeopleOpenerCtx value={openPeople}>{people}</PeopleOpenerCtx>
              </PeopleVariantCtx>
            )}
            {children}
          </div>
          {wide ? (
            // Ngay dưới thanh đầu trang (cao 4rem + viền 2px). Khi ẩn, khung chat vẫn ở đây (giữ tin chưa đọc, chữ đang gõ)
            // nhưng chỉ còn nút tròn nổi ở góc. Lúc trình chiếu cũng vậy (sidebar nằm dưới lớp trình chiếu, chat nổi lên trên).
            <aside
              className={hidden || stage.ctx.on ? undefined : "fixed top-[66px] right-0 bottom-0 z-30 flex w-[360px] flex-col gap-3 border-l-2 border-edge bg-sunken p-3"}
              aria-label="Người trong phòng và trò chuyện"
            >
              {!hidden && !stage.ctx.on && people}
              {chat}
            </aside>
          ) : (
            chat
          )}
        </RoomSideCtx>
      </StageCtx>
    </div>
  );
}

/** Đầu bàn chơi: tên phòng, trạng thái ván, rồi các chip luật / thông tin riêng của game (`children`). */
export function RoomHeader({ name, status, round, playing, children }: { name: string; status: string; round: number; playing?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">{name}</h1>
      <StatusChip status={status} round={round} playing={playing} />
      {children}
    </header>
  );
}

/**
 * Lời nhắc nổi giữa bàn chơi lúc chưa có ván (đặt trong khối `relative` bọc bàn): chờ đủ người / chủ phòng bấm bắt đầu.
 * `enough`: đủ người để bắt đầu chưa (mặc định: kín ghế); `waiting`: câu khi chưa đủ.
 */
export function WaitingOverlay({ isHost, players, seats, enough = players >= seats, waiting = `Đang chờ đủ ${seats} người vào ghế…` }: { isHost: boolean; players: number; seats: number; enough?: boolean; waiting?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
      <p className="card px-5 py-3 text-center font-display text-lg font-extrabold">
        {!enough ? waiting : isHost ? "Đủ người rồi — bấm Bắt đầu!" : "Đang chờ chủ phòng bắt đầu…"}
      </p>
    </div>
  );
}

/** Dòng nhắc dưới bàn chơi cho người không chơi ván này. */
export function SpectatorNote() {
  return <p className="mt-3 text-center text-sm text-ink-3">👀 Bạn đang ở chế độ xem.</p>;
}

export function StatusChip({ status, round, playing = "đang đấu" }: { status: string; round: number; playing?: string }) {
  if (status === "playing")
    return (
      <span className="chip" style={{ color: "var(--coral)" }}>
        🔥 Ván {round} {playing}
      </span>
    );
  if (status === "ended")
    return (
      <span className="chip" style={{ color: "var(--grape)" }}>
        🏁 Hết ván {round}
      </span>
    );
  return (
    <span className="chip" style={{ color: "var(--lime)" }}>
      ⏳ Đang chờ
    </span>
  );
}

/** Sticker và pháo giấy bay ngang bàn chơi (đặt trong khối `relative`). */
export function Flyers({ flyers }: { flyers: Flyer[] }) {
  return flyers.map((f) => {
    const style = {
      left: `${f.left}%`,
      top: `${f.top}%`,
      animationDelay: `${f.delay ?? 0}ms`,
      ["--rot" as string]: `${f.rot ?? 0}deg`,
      ["--dx" as string]: `${f.dx ?? 0}px`,
      ["--dy" as string]: `${f.dy ?? 0}px`,
      ["--dir" as string]: f.dir ?? 1,
    };
    if (f.color)
      return <span key={f.key} className="fly-confetti" style={{ ...style, width: f.size, height: (f.size ?? 10) * 0.55, background: f.color }} aria-hidden="true" />;
    if (!f.sticker) return null;
    return (
      <span key={f.key} className={`fly ${isKaixin(f.sticker) ? "fly-kx" : `fly-${f.sticker}`}`} style={style} aria-hidden="true">
        <StickerArt id={f.sticker} size={f.size ?? 90} />
      </span>
    );
  });
}
