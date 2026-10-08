"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
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
import type { DodgeRoom, DodgeView } from "@/lib/net/dodge-room";
import type { RoomView } from "@/lib/net/room";
import { ConfirmButton } from "../ConfirmButton";
import { ChatPanel } from "./ChatPanel";
import { PeoplePanel } from "./People";
import { RoomLayout, StatusChip } from "./RoomLayout";
import { useBalloons, useRoomView } from "./useRoom";

type View = RoomView<DodgeView>;

const EDGE_EMOJI: Record<Edge, string> = { top: "⬆️", right: "➡️", bottom: "⬇️", left: "⬅️" };

export function DodgeTable({ id, slug, session }: { id: string; slug: string; session: DodgeRoom }) {
  const view = useRoomView(session)!;
  const m = view.meta!;
  const g = view.game?.match;
  const balloons = useBalloons(session);
  const live = m.status === "playing" && !!g;

  return (
    <RoomLayout
      id={id}
      slug={slug}
      side={
        <>
          <PeoplePanel view={view} session={session} balloons={balloons} roomId={id} />
          <ChatPanel session={session} chat={view.chat} me={view.me} />
        </>
      }
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{m.name}</h1>
        <StatusChip status={m.status} round={m.round} playing="đang né bão" />
        <span className="chip text-ink-2">🌩️ Real-time</span>
      </header>

      <ActionBar view={view} session={session} />
      {g?.result && <ResultCard view={view} />}
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
        <Arena view={view} session={session} live={live} />
        <Scoreboard view={view} />
      </div>
      {!live && <HowTo />}
    </RoomLayout>
  );
}

function ActionBar({ view, session }: { view: View; session: DodgeRoom }) {
  const m = view.meta!;
  const g = view.game?.match;
  const seated = view.mySeat >= 0;
  const playing = m.status === "playing";
  const enough = m.players.length >= MIN_PLAYERS;
  const allOnline = view.seats.every((s) => s.online);

  let message: ReactNode;
  let tone = "var(--sunken)";
  if (playing && g) {
    if (g.iAmRunner) {
      message = <>🏃 Tự chạy trái→phải — Space / W / ↑ nhảy né hố, gai và đạn!</>;
      tone = "var(--lime-soft)";
    } else if (seated || g.lineup.some((s) => s.uid === view.me)) {
      const edge = g.myEdge ?? "top";
      const slide =
        edge === "left" || edge === "right" ? "↑↓ / W S trượt cạnh" : "←→ / A D trượt cạnh";
      message = (
        <>
          🔫 Truy cản từ <b>{EDGE_LABEL[edge]}</b> — {slide}, click / Space bắn
        </>
      );
      tone = "var(--coral-soft)";
    } else message = <>👀 Đang xem trận né bão…</>;
  } else if (m.status === "ended" && g?.result) {
    const r = g.result;
    const won = r.winner === view.me || r.winners?.includes(view.me);
    tone = won ? "var(--sun-soft)" : "var(--grape-soft)";
    message = r.winner ? (
      <>
        🏁 <b>{nameOf(view, r.winner)}</b> sống lâu nhất!
      </>
    ) : r.winners?.length ? (
      <>🏁 Đồng hạng: {r.winners.map((u) => nameOf(view, u)).join(", ")}</>
    ) : (
      <>🏁 Hết trận.</>
    );
  } else if (seated) {
    message = enough ? <>✅ Đã vào ghế. {view.isHost ? "Bấm Bắt đầu khi đủ người." : "Chờ chủ phòng bắt đầu."}</> : <>✅ Đã vào ghế — cần ít nhất {MIN_PLAYERS} người.</>;
  } else {
    message = <>Chọn cạnh nấp rồi bấm “Vào chơi”.</>;
  }

  return (
    <div className="card flex flex-wrap items-center gap-3 px-4 py-3" style={{ background: tone }} aria-live="polite">
      <p className="min-w-0 flex-1 text-[15px] font-semibold">{message}</p>
      <div className="flex flex-wrap gap-2">
        {!playing && (
          <EdgePicker
            current={g?.myEdge}
            onPick={(e) => session.pickEdge(e)}
            disabled={view.pending === "play"}
          />
        )}
        {!playing && !seated && (
          <button type="button" className="btn btn-lime" onClick={() => session.join()} disabled={view.pending === "play"}>
            🙋 Vào chơi
          </button>
        )}
        {!playing && seated && (
          <button type="button" className="btn" onClick={() => session.leaveSeat()} disabled={view.pending === "watch"}>
            Rời ghế
          </button>
        )}
        {!playing && view.isHost && (
          <button
            type="button"
            className="btn btn-pen"
            onClick={() => session.start()}
            disabled={!enough || !allOnline}
            title={!enough ? `Cần ≥ ${MIN_PLAYERS} người` : !allOnline ? "Có người mất kết nối" : ""}
          >
            {m.round > 0 ? "🔁 Ván mới" : "▶ Bắt đầu"}
          </button>
        )}
        {playing && view.isHost && (
          <ConfirmButton className="btn btn-coral" onConfirm={() => session.stop()} confirmLabel="Bấm lần nữa để dừng">
            ⏹ Dừng ván
          </ConfirmButton>
        )}
      </div>
    </div>
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

function ResultCard({ view }: { view: View }) {
  const g = view.game?.match;
  if (!g?.result) return null;
  const order = rankScores(g.liveScores, g.lineup.map((s) => s.uid));
  return (
    <div className="card mt-3 px-4 py-3" style={{ background: "var(--sun-soft)" }}>
      <p className="font-display text-lg font-extrabold">🏁 Bảng xếp hạng</p>
      <ol className="mt-2 grid gap-1 text-sm font-semibold">
        {order.map((uid, i) => (
          <li key={uid} className="flex justify-between gap-3">
            <span>
              {i + 1}. {nameOf(view, uid)}
              {uid === view.me ? " (bạn)" : ""}
            </span>
            <span className="tabular-nums">{formatMs(g.liveScores[uid] ?? 0)}</span>
          </li>
        ))}
      </ol>
    </div>
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
