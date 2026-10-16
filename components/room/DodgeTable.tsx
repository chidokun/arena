"use client";

import { memo, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  EDGE_LABEL,
  EDGES,
  edgeAnchor,
  FIRE_COOLDOWN_MS,
  formatMs,
  MIN_PLAYERS,
  rankScores,
  RUNNER_H,
  RUNNER_W,
  WORLD_H,
  WORLD_W,
  type Edge,
} from "@/lib/games/dodge";
import type { DodgeMatch, DodgeRoom, DodgeView } from "@/lib/net/dodge-room";
import type { RoomView } from "@/lib/net/room";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Crowd, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel } from "./People";
import { ResultCard as Result, Standings } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout } from "./RoomLayout";
import { SeatButtons, seatMessage, startBlocker, StatusBar, StopButton, TONE } from "./StatusBar";
import { useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

/** View các phần của bàn đọc — ghép từ `roomStore` + `peopleStore` + `gameStore` (chat đi riêng `chatStore`). */
type View = Omit<RoomView<DodgeView>, "chat">;

/** Đăng ký ba store và ghép lại thành view cho bàn chơi: vẽ lại khi phòng / người / ván đổi, không theo nhịp tim hay tin chat. */
function useDodgeView(session: DodgeRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const EDGE_EMOJI: Record<Edge, string> = { top: "⬆️", right: "➡️", bottom: "⬇️", left: "⬅️" };
const CHEERS = ["🎉", "🏆", "✨", "🎊", "🌩️", "🏃"];

/**
 * Bàn chơi tách theo store: khung chỉ giữ RoomLayout — danh sách người (`peopleStore`) và khung chat (`chatStore`) tự
 * đăng ký; phần bàn chơi bọc `memo`, đọc `roomStore` + `peopleStore` + `gameStore`, nên nhịp tim, tin chat hay người
 * vào ra không làm bàn vẽ lại, và nước đi không làm danh sách người / khung chat vẽ lại.
 */
export function DodgeTable({ id, slug, session }: { id: string; slug: string; session: DodgeRoom }) {
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <DodgeBody session={session} />
    </RoomLayout>
  );
}

const DodgeBody = memo(function DodgeBody({ session }: { session: DodgeRoom }) {
  const view = useDodgeView(session);
  const m = view.meta!;
  const g = view.game?.match;
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);
  const live = m.status === "playing" && !!g;
  // Mở ván: chủ phòng cho người chạy xuất phát sau nhịp đếm ngược (stint đầu bắt đầu ở tương lai, chưa đổi người chạy lần nào).
  const count = useCountdown(live && g.round === m.round && g.pub.lastStintMs == null ? g.round : 0, { endsAt: g?.pub.stintStarted });
  const end = useEndScene(g?.result?.winners?.length ? g.round : 0, { emojis: CHEERS });

  return (
    <>
      <RoomHeader name={m.name} status={m.status} round={m.round} playing="đang né bão">
        <span className="chip text-ink-2">🌩️ Real-time</span>
      </RoomHeader>

      <ActionBar view={view} session={session} />
      {g?.result && <ResultCard view={view} />}
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative">
          <div ref={boardRef}>
            <Arena view={view} session={session} live={live && !count} />
          </div>
          <Flyers flyers={flyers} />
        </div>
        <Scoreboard view={view} />
      </div>
      {!live && <HowTo />}

      {g && count > 0 && <CountdownScene view={view} match={g} n={count} />}
      {g?.result && end.shown && <EndScene view={view} match={g} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

/** Cảnh mở ván: người chạy và những người nấp bốn cạnh, đếm ngược 3‑2‑1 rồi xuất phát. */
function CountdownScene({ view, match: g, n }: { view: View; match: DodgeMatch; n: number }) {
  const people = g.lineup.map((s) => {
    const runner = s.uid === g.pub.runner;
    const edge = g.pub.edges[s.uid];
    return { uid: s.uid, p: s.member, name: nameOf(view, s.uid), ring: runner ? "#7ee081" : "#ff8a5c", badge: runner ? "🏃" : edge ? EDGE_EMOJI[edge] : "🔫" };
  });
  const tip = g.iAmRunner
    ? "Bạn chạy trước — Space / W / ↑ để nhảy né!"
    : g.myEdge && g.lineup.some((s) => s.uid === view.me)
      ? `Bạn nấp ở ${EDGE_LABEL[g.myEdge]} — chuẩn bị ngắm bắn!`
      : `${nameOf(view, g.pub.runner)} chạy trước — cùng xem nhé!`;
  return (
    <CountdownCine eyebrow={`🌩️ Né Bão · Ván ${g.round}`} n={n} tip={tip}>
      <Crowd people={people} />
    </CountdownCine>
  );
}

/** Tiêu đề kết quả — dùng chung cho cảnh hết ván và thẻ kết quả. */
function winTitle(view: View, winners: string[]) {
  const names = winners.map((u) => nameOf(view, u)).join(", ");
  return winners.length > 1 ? `${names} đồng hạng nhất!` : winners[0] === view.me ? "Bạn sống lâu nhất!" : `${names} sống lâu nhất!`;
}

function EndScene({ view, match: g, onClose }: { view: View; match: DodgeMatch; onClose: () => void }) {
  const winners = g.result!.winners ?? [];
  const iWon = winners.includes(view.me);
  const best = g.liveScores[winners[0]] ?? 0;
  return (
    <WinCine
      winners={winners.map((u) => ({ uid: u, p: g.lineup.find((s) => s.uid === u)?.member ?? view.members.find((p) => p.uid === u), badge: "🏃" }))}
      title={winTitle(view, winners)}
      sub={`Trụ được ${formatMs(best)} giữa cơn bão`}
      note={!iWon && g.lineup.some((s) => s.uid === view.me) ? "Ván sau trụ lâu hơn nhé!" : undefined}
      onClose={onClose}
    />
  );
}

/** Thanh trạng thái: vai của mình trong trận; ngoài ván thì chọn cạnh nấp, vào ghế / bắt đầu (kết quả ván nằm ở thẻ kết quả). */
function ActionBar({ view, session }: { view: View; session: DodgeRoom }) {
  const m = view.meta!;
  const g = view.game?.match;

  if (m.status === "playing" && g) {
    let tone: string = TONE.idle;
    let message: ReactNode = <>👀 Đang xem trận né bão…</>;
    if (g.iAmRunner) {
      tone = TONE.turn;
      message = <>🏃 Tự chạy trái→phải — Space / W / ↑ nhảy né hố, gai và đạn!</>;
    } else if (view.mySeat >= 0 || g.lineup.some((s) => s.uid === view.me)) {
      const edge = g.myEdge ?? "top";
      const slide = edge === "left" || edge === "right" ? "↑↓ / W S trượt cạnh" : "←→ / A D trượt cạnh";
      tone = TONE.alert;
      message = (
        <>
          🔫 Truy cản từ <b>{EDGE_LABEL[edge]}</b> — {slide}, click / Space bắn
        </>
      );
    }
    return (
      <StatusBar tone={tone} message={message}>
        {view.isHost && <StopButton onConfirm={() => session.stop()} />}
      </StatusBar>
    );
  }
  return (
    <StatusBar message={seatMessage(view, { enough: m.players.length >= MIN_PLAYERS, startHint: "Bấm Bắt đầu khi đủ người.", join: "Chọn cạnh nấp rồi bấm “Vào chơi”." })}>
      <EdgePicker current={g?.myEdge} onPick={(e) => session.pickEdge(e)} disabled={view.pending === "play"} />
      <SeatButtons view={view} session={session} blocked={startBlocker(view, { min: MIN_PLAYERS })} />
    </StatusBar>
  );
}

function EdgePicker({ current, onPick, disabled }: { current?: Edge; onPick: (e: Edge) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Chọn cạnh nấp">
      {EDGES.map((e) => (
        <button
          key={e}
          type="button"
          className={`btn btn-sm !px-2 ${current === e ? "btn-sun" : ""}`}
          aria-pressed={current === e}
          disabled={disabled}
          onClick={() => onPick(e)}
          title={EDGE_LABEL[e]}
        >
          {EDGE_EMOJI[e]}
        </button>
      ))}
    </div>
  );
}

function HowTo() {
  return (
    <p className="mt-4 max-w-[70ch] text-[13.5px] text-ink-3">
      Người chạy tự chạy liên tục trái→phải, chỉ nhảy (Space / W / ↑) để né hố và gai. Người khác nấp 4 cạnh, trượt đổi góc rồi bắn (cooldown{" "}
      {FIRE_COOLDOWN_MS / 1000}s). Trúng đạn → người bắn lên chạy; vướng chướng ngại → người kế tiếp. Ai sống lâu hơn thắng.
    </p>
  );
}

/** Thẻ kết quả: người trụ lâu nhất và bảng thời gian sống sót. */
function ResultCard({ view }: { view: View }) {
  const g = view.game?.match;
  if (!g?.result) return null;
  const winners = g.result.winners ?? [];
  return (
    <Result round={g.round} title={winners.length ? `🏆 ${winTitle(view, winners)}` : "🏁 Hết trận"}>
      <Standings
        rows={rankScores(g.liveScores, g.lineup.map((s) => s.uid)).map((uid) => ({
          uid,
          name: `${nameOf(view, uid)}${uid === view.me ? " (bạn)" : ""}`,
          value: formatMs(g.liveScores[uid] ?? 0),
        }))}
      />
    </Result>
  );
}

function Scoreboard({ view }: { view: View }) {
  const g = view.game?.match;
  if (!g) {
    return (
      <aside className="card p-4 text-sm text-ink-3">
        Bảng điểm sẽ hiện khi ván bắt đầu.
      </aside>
    );
  }
  const order = rankScores(g.liveScores, g.lineup.map((s) => s.uid));
  return (
    <aside className="card p-4">
      <h2 className="font-display text-lg font-extrabold">⏱️ Thời gian sống</h2>
      <ul className="mt-3 grid gap-2">
        {order.map((uid) => {
          const seat = g.lineup.find((s) => s.uid === uid);
          const isRunner = g.pub.runner === uid;
          const edge = g.pub.edges[uid];
          return (
            <li key={uid} className="flex items-center justify-between gap-2 text-sm font-semibold">
              <span className="min-w-0 truncate">
                {isRunner ? "🏃 " : edge ? `${EDGE_EMOJI[edge]} ` : "👀 "}
                {seat?.member?.name ?? nameOf(view, uid)}
                {uid === view.me ? " · bạn" : ""}
              </span>
              <span className="tabular-nums text-ink-2">{formatMs(g.liveScores[uid] ?? 0)}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function nameOf(view: View, uid: string) {
  if (uid === view.me) return "Bạn";
  return (
    view.game?.match?.lineup.find((s) => s.uid === uid)?.member?.name ??
    view.members.find((p) => p.uid === uid)?.name ??
    "Ai đó"
  );
}

function Arena({ view, session, live }: { view: View; session: DodgeRoom; live: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useRef({ left: false, right: false, jump: false });
  const [cooling, setCooling] = useState(false);
  const coolingRef = useRef(false);
  const coolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const g = view.game?.match;
  const iAmRunner = !!g?.iAmRunner;
  const canShoot = live && !iAmRunner && g?.lineup.some((s) => s.uid === view.me);
  const myEdge = g?.myEdge ?? "top";
  const verticalEdge = myEdge === "left" || myEdge === "right";

  const startCooling = () => {
    coolingRef.current = true;
    setCooling(true);
    if (coolTimer.current) clearTimeout(coolTimer.current);
    coolTimer.current = setTimeout(() => {
      coolingRef.current = false;
      setCooling(false);
    }, FIRE_COOLDOWN_MS);
  };

  useEffect(() => {
    if (!live || (!iAmRunner && !canShoot)) return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (iAmRunner) {
        // Auto-run — only jump.
        if (k === " " || k === "arrowup" || k === "w") {
          keys.current.jump = true;
          e.preventDefault();
        }
      } else if (canShoot) {
        // Slide along edge: horizontal ←→; vertical ↑↓ (A/D also work).
        if (verticalEdge) {
          if (k === "arrowup" || k === "w" || k === "arrowleft" || k === "a") keys.current.left = true;
          if (k === "arrowdown" || k === "s" || k === "arrowright" || k === "d") keys.current.right = true;
        } else {
          if (k === "arrowleft" || k === "a") keys.current.left = true;
          if (k === "arrowright" || k === "d") keys.current.right = true;
        }
        if (k === " ") {
          e.preventDefault();
          if (!coolingRef.current) {
            session.fire(WORLD_W / 2, WORLD_H / 2);
            startCooling();
          }
        }
      }
      session.setInput(
        { left: keys.current.left, right: keys.current.right, jump: keys.current.jump, edge: canShoot ? myEdge : undefined },
        true,
      );
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (iAmRunner) {
        if (k === " " || k === "arrowup" || k === "w") keys.current.jump = false;
      } else if (canShoot) {
        if (verticalEdge) {
          if (k === "arrowup" || k === "w" || k === "arrowleft" || k === "a") keys.current.left = false;
          if (k === "arrowdown" || k === "s" || k === "arrowright" || k === "d") keys.current.right = false;
        } else {
          if (k === "arrowleft" || k === "a") keys.current.left = false;
          if (k === "arrowright" || k === "d") keys.current.right = false;
        }
      }
      session.setInput(
        { left: keys.current.left, right: keys.current.right, jump: keys.current.jump, edge: canShoot ? myEdge : undefined },
        true,
      );
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    const pulse = setInterval(() => {
      session.setInput({
        left: keys.current.left,
        right: keys.current.right,
        jump: keys.current.jump,
        edge: canShoot ? myEdge : undefined,
      });
      if (iAmRunner) keys.current.jump = false;
    }, 50);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      clearInterval(pulse);
      keys.current = { left: false, right: false, jump: false };
      session.setInput({ left: false, right: false, jump: false }, true);
    };
  }, [live, iAmRunner, canShoot, session, myEdge, verticalEdge]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let prevSnapT = -1;
    let drawRunner = g?.snap?.runner;
    let drawBullets = g?.snap?.projectiles ?? [];
    let drawAlong = g?.snap?.along ?? {};

    const paint = () => {
      const match = session.store.get().game?.match;
      const snap = match?.snap;
      const platforms = match?.platforms ?? [];
      const hazards = match?.hazards ?? [];
      const pub = match?.pub;

      if (snap && snap.t !== prevSnapT) {
        prevSnapT = snap.t;
        drawRunner = snap.runner;
        drawBullets = snap.projectiles;
        drawAlong = snap.along ?? {};
      }

      const w = canvas.width;
      const h = canvas.height;
      const sx = w / WORLD_W;
      const sy = h / WORLD_H;

      ctx.fillStyle = "#1a2332";
      ctx.fillRect(0, 0, w, h);

      // Edge bands (shooter zones)
      ctx.fillStyle = "rgba(255,120,80,0.18)";
      ctx.fillRect(0, 0, w, 18 * sy);
      ctx.fillRect(0, h - 18 * sy, w, 18 * sy);
      ctx.fillRect(0, 0, 18 * sx, h);
      ctx.fillRect(w - 18 * sx, 0, 18 * sx, h);

      // Motion dashes to show auto-run direction
      const scroll = drawRunner?.x ?? 0;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const dx = ((scroll + i * 100) % (WORLD_W + 40)) - 20;
        ctx.beginPath();
        ctx.moveTo(dx * sx, WORLD_H * 0.35 * sy);
        ctx.lineTo((dx + 28) * sx, WORLD_H * 0.35 * sy);
        ctx.stroke();
      }

      ctx.fillStyle = "#3d5a40";
      for (const p of platforms) {
        ctx.fillRect(p.x * sx, p.y * sy, p.w * sx, p.h * sy);
      }

      // Spikes
      for (const hz of hazards) {
        const spikes = Math.max(2, Math.floor(hz.w / 12));
        const sw = hz.w / spikes;
        for (let i = 0; i < spikes; i++) {
          const x0 = (hz.x + i * sw) * sx;
          const x1 = (hz.x + (i + 0.5) * sw) * sx;
          const x2 = (hz.x + (i + 1) * sw) * sx;
          const yb = (hz.y + hz.h) * sy;
          const yt = hz.y * sy;
          ctx.beginPath();
          ctx.moveTo(x0, yb);
          ctx.lineTo(x1, yt);
          ctx.lineTo(x2, yb);
          ctx.closePath();
          ctx.fillStyle = "#e85d4c";
          ctx.fill();
        }
      }

      if (pub) {
        ctx.font = `bold ${Math.max(11, 13 * sx)}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const [uid, edge] of Object.entries(pub.edges)) {
          if (uid === pub.runner) continue;
          const seat = match?.lineup.find((s) => s.uid === uid);
          const label = seat?.member?.name?.slice(0, 8) ?? "?";
          const anchor = edgeAnchor(edge, drawAlong[uid] ?? 0.5);
          const px = anchor.x * sx;
          const py = anchor.y * sy;
          ctx.beginPath();
          ctx.fillStyle = uid === view.me ? "#ffd28a" : "#6eb5ff";
          ctx.arc(px, py, Math.max(6, 9 * sx), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = uid === view.me ? "#ffd28a" : "#9eb6c8";
          const labelY = edge === "top" ? py + 14 * sy : edge === "bottom" ? py - 14 * sy : py;
          const labelX = edge === "left" ? px + 28 * sx : edge === "right" ? px - 28 * sx : px;
          ctx.fillText(label, labelX, labelY);
        }
      }

      if (drawRunner) {
        ctx.fillStyle = "#ff6b4a";
        ctx.fillRect(drawRunner.x * sx, drawRunner.y * sy, RUNNER_W * sx, RUNNER_H * sy);
        ctx.fillStyle = "#fff";
        ctx.fillRect((drawRunner.x + 6) * sx, (drawRunner.y + 8) * sy, 6 * sx, 6 * sy);
        ctx.fillRect((drawRunner.x + 16) * sx, (drawRunner.y + 8) * sy, 6 * sx, 6 * sy);
      }

      for (const b of drawBullets) {
        ctx.beginPath();
        ctx.fillStyle = "#ffd54a";
        ctx.arc(b.x * sx, b.y * sy, Math.max(3, b.r * sx), 0, Math.PI * 2);
        ctx.fill();
      }

      if (!match?.snap && session.store.get().meta?.status !== "playing") {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.max(16, 22 * sx)}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText("Chờ bắt đầu…", w / 2, h / 2);
      }

      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
    // Paint loop reads live snapshots from session.store each frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, view.me, g?.round]);

  useEffect(() => {
    return () => {
      if (coolTimer.current) clearTimeout(coolTimer.current);
    };
  }, []);

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!canShoot || cooling) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WORLD_W;
    const y = ((e.clientY - rect.top) / rect.height) * WORLD_H;
    session.fire(x, y);
    startCooling();
  };

  return (
    <div className="card overflow-hidden p-2" style={{ background: "var(--board)" }}>
      <canvas
        ref={canvasRef}
        width={800}
        height={480}
        className="h-auto w-full touch-none rounded-lg"
        style={{ cursor: canShoot ? "crosshair" : iAmRunner ? "default" : "not-allowed", aspectRatio: `${WORLD_W}/${WORLD_H}` }}
        onClick={onClick}
        role="img"
        aria-label="Sân Né Bão"
      />
      {canShoot && (
        <p className="mt-2 text-center text-xs font-semibold text-ink-3">
          {cooling
            ? "Đang nạp đạn…"
            : verticalEdge
              ? "↑↓ trượt cạnh · click / Space bắn"
              : "←→ trượt cạnh · click / Space bắn"}
        </p>
      )}
    </div>
  );
}
