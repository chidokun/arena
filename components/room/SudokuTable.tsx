"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { CELLS, clock, colOf, LEVEL_KEYS, LEVELS, MODE_KEYS, MODES, rowOf, sees } from "@/lib/games/sudoku";
import type { ChatMsg, RoomView } from "@/lib/net/room";
import type { SudokuMatch, SudokuRoom, SudokuView } from "@/lib/net/sudoku-room";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "../ConfirmButton";
import { ChatPanel } from "./ChatPanel";
import { Balloon, PeoplePanel } from "./People";
import { Flyers, RoomLayout, StatusChip } from "./RoomLayout";
import { useBalloons, useFlyers, useRoomView } from "./useRoom";

type View = RoomView<SudokuView>;

/** Màu của từng người chơi theo thứ tự đội hình — tô ô người đó giữ / giải nhanh nhất. */
const PLAYER_COLORS = ["var(--coral)", "var(--sky)", "var(--lime)", "var(--sun)", "var(--grape)", "#ff6fb5", "#14b8c4", "#ff8a3d", "#8a9a2c", "#a0785a"];
const colorOf = (k: number) => PLAYER_COLORS[k % PLAYER_COLORS.length];
const tintOf = (k: number) => `color-mix(in srgb, ${colorOf(k)} 32%, var(--board))`;

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const CONFETTI = ["🎉", "🏆", "✨", "🔢", "🎊", "⭐"];

/** Giờ hiện tại, cập nhật đều khi `active`. */
function useNow(active: boolean, every = 250) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, every);
    return () => clearInterval(t);
  }, [active, every]);
  return now;
}

const isLive = (view: View) => view.meta!.status === "playing" && view.game?.match?.round === view.meta!.round;

function nameIn(view: View, uid: string) {
  if (uid === view.me) return "Bạn";
  return view.game?.match?.lineup.find((s) => s.uid === uid)?.member?.name ?? view.members.find((p) => p.uid === uid)?.name ?? "Ai đó";
}

export function SudokuTable({ id, slug, session }: { id: string; slug: string; session: SudokuRoom }) {
  const view = useRoomView(session)!;
  const m = view.meta!;
  const { opts, match: g } = view.game!;
  const balloons = useBalloons(session);
  const areaRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, areaRef);
  const live = isLive(view);
  const now = useNow(live);
  const scenes = useScenes(g);
  const shown = live && g ? g : opts;

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
        <StatusChip status={m.status} round={m.round} playing="đang giải" />
        <span className="chip text-ink-2">
          {LEVELS[shown.level].emoji} {LEVELS[shown.level].name}
        </span>
        <span className="chip text-ink-2">
          {MODES[shown.mode].emoji} {MODES[shown.mode].name}
        </span>
      </header>

      <ActionBar view={view} session={session} now={now} />
      {!live && <Rules view={view} session={session} />}
      {g?.result && <ResultCard view={view} match={g} />}

      <div ref={areaRef} className="relative mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
        {g ? <Play key={g.round} view={view} session={session} match={g} now={now} /> : <EmptyBoard view={view} />}
        {g && <Scoreboard view={view} match={g} now={now} balloons={balloons} />}
        <Flyers flyers={flyers} />
      </div>

      {g && <Cinema view={view} match={g} now={now} win={scenes.win} onClose={scenes.close} />}
      {scenes.party.length > 0 && (
        <div className="loto-party sd-party" aria-hidden="true">
          {scenes.party.map((b) => (
            <span key={b.key} style={{ left: `${b.left}%`, animationDelay: `${b.delay}ms`, animationDuration: `${b.dur}ms`, ["--rot" as string]: `${b.rot}deg` }}>
              {b.emoji}
            </span>
          ))}
        </div>
      )}
    </RoomLayout>
  );
}

const WIN_SCENE_MS = 6500;

/** Đối kháng: người chơi xong thứ mấy (0 là chưa xong). */
const rankOf = (g: SudokuMatch, k: number) => g.state.finished.indexOf(k) + 1;

/**
 * Cảnh chiến thắng và pháo giấy khi khoảnh khắc thắng diễn ra ngay trước mắt — cùng giải đề: lúc hoàn tất bàn;
 * đối kháng: lúc người đầu tiên giải xong (ván vẫn tiếp tục). Vào phòng khi đã có người thắng thì không diễn lại.
 */
function useScenes(g: SudokuMatch | undefined) {
  const [win, setWin] = useState<number | null>(null);
  const [party, setParty] = useState<{ key: string; left: number; delay: number; dur: number; rot: number; emoji: string }[]>([]);
  const won = !!g && (g.mode === "race" ? g.state.winners.length > 0 : g.result?.reason === "solve" && !!g.result.winners?.length);
  const key = won ? g!.round : 0;
  const seen = useRef(key);
  useEffect(() => {
    if (!key || key === seen.current) {
      seen.current = key;
      return;
    }
    seen.current = key;
    setWin(key);
    setParty(
      Array.from({ length: 40 }, (_, i) => ({
        key: `${key}:${i}`,
        left: Math.random() * 96,
        delay: Math.random() * 700,
        dur: 2200 + Math.random() * 1600,
        rot: Math.round(Math.random() * 540 - 270),
        emoji: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
      })),
    );
    const a = setTimeout(() => setParty([]), 4800);
    const b = setTimeout(() => setWin((w) => (w === key ? null : w)), WIN_SCENE_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [key]);
  return { win: g && win === g.round ? win : null, party, close: () => setWin(null) };
}

/** Lớp phủ toàn màn hình: đếm ngược 5‑4‑3‑2‑1 trước khi lộ đề, và cảnh chiến thắng (bấm để đóng). */
function Cinema({ view, match: g, now, win, onClose }: { view: View; match: SudokuMatch; now: number; win: number | null; onClose: () => void }) {
  const counting = isLive(view) && (!now || now < g.opensAt);
  if (counting) {
    const n = now ? Math.min(5, Math.max(1, Math.ceil((g.opensAt - now) / 1000))) : 5;
    return (
      <div className="ww-cine sd-cine" role="dialog" aria-modal="true" aria-label="Đếm ngược">
        <div className="ww-cine-body grid justify-items-center gap-4 text-center">
          <p className="text-[15px] font-bold tracking-wide uppercase opacity-80">
            {MODES[g.mode].emoji} {MODES[g.mode].name} · {LEVELS[g.level].emoji} {LEVELS[g.level].name}
          </p>
          <span key={n} className="ww-count-big" aria-live="assertive">
            {n}
          </span>
          <p className="ww-cine-title !text-[26px] sm:!text-[30px]">
            {g.mode === "coop" ? "Cùng nhau giải để hoàn tất ván Sudoku nhé..." : "Hãy giải nhanh nhất để chiến thắng nhé..."}
          </p>
        </div>
      </div>
    );
  }
  if (win == null) return null;
  const race = g.mode === "race";
  const winners = race ? g.state.winners : g.state.winners.length ? g.state.winners : g.lineup.flatMap((s, k) => (g.result?.winners?.includes(s.uid) ? [k] : []));
  if (!winners.length) return null;
  const iWon = winners.includes(g.me);
  const names = winners.map((k) => (k === g.me ? "Bạn" : (g.lineup[k].member?.name ?? "Ai đó"))).join(", ");
  const first = winners[0];
  const time = race ? g.fin[first] : g.time;
  return (
    <div className="ww-cine sd-cine is-win" role="dialog" aria-modal="true" aria-label="Chiến thắng" onClick={onClose}>
      <div className="ww-cine-body grid justify-items-center gap-4 text-center">
        <span className="sd-trophy" aria-hidden="true">
          🏆
        </span>
        <div className="flex flex-wrap justify-center gap-3">
          {winners.map((k) => {
            const p = g.lineup[k].member;
            return p ? <Avatar key={k} p={p} size={72} className="sd-win-avatar" /> : null;
          })}
        </div>
        <p className="ww-cine-title !text-[34px] sm:!text-[42px]">{iWon && winners.length === 1 ? "Bạn chiến thắng!" : `${names} chiến thắng!`}</p>
        {race ? (
          <>
            <p className="text-[17px] font-bold opacity-90">
              Giải xong đầu tiên{time != null ? ` sau ${clock(time)}` : ""}
              {g.state.wrong[first] ? ` · sai ${g.state.wrong[first]} lần` : " · không sai lần nào"}
            </p>
            {!g.state.over && (
              <p className="sd-cine-next">{rankOf(g, g.me) || g.me < 0 ? "Mọi người tiếp tục để hoàn tất ván nhé..." : "Hãy tiếp tục để hoàn tất ván nhé..."}</p>
            )}
          </>
        ) : (
          <>
            <p className="sd-cine-score">
              {g.state.score[first]} <small>điểm</small>
            </p>
            <p className="text-[15px] font-bold opacity-85">
              {winners.length > 1 ? "Đồng hạng nhất · " : ""}Cả phòng hoàn tất ván Sudoku{time != null ? ` trong ${clock(time)}` : ""}
            </p>
          </>
        )}
      </div>
      <p className="ww-cine-skip">Bấm để đóng</p>
    </div>
  );
}

/** Lời nhắc theo vai trò và nút chính: vào ghế / rời ghế / bắt đầu / dừng ván. */
function ActionBar({ view, session, now }: { view: View; session: SudokuRoom; now: number }) {
  const m = view.meta!;
  const g = view.game!.match;
  const live = isLive(view);
  const seated = view.mySeat >= 0;
  const full = m.players.length >= m.seats;
  const anyOnline = view.seats.some((s) => s.online);

  let message: React.ReactNode;
  let tone = "var(--sunken)";
  if (live && g) {
    const counting = !now || now < g.opensAt;
    const locked = now < g.lockedUntil;
    if (g.me < 0) message = <>👀 Bạn đang xem — {g.mode === "race" ? "ô tô màu là đã có người giải (màu người giải nhanh nhất) — hết ván mới lộ số." : "mỗi ô được tô màu người điền đúng trước."}</>;
    else if (counting) {
      tone = "var(--sun-soft)";
      message = now ? <>⏳ Chuẩn bị… đề lộ sau {Math.max(1, Math.ceil((g.opensAt - now) / 1000))} giây!</> : <>⏳ Chuẩn bị…</>;
    } else if (g.mode === "race" && rankOf(g, g.me)) {
      tone = "var(--sun-soft)";
      const rank = rankOf(g, g.me);
      const t = g.fin[g.me];
      message = (
        <>
          🏁 Bạn đã giải xong — <b>{rank === 1 ? "về nhất" : `hạng ${rank}`}</b>
          {t != null ? ` (${clock(t)})` : ""}. Chờ mọi người hoàn tất ván…
        </>
      );
    } else if (locked) {
      tone = "var(--coral-soft)";
      message = <>🔒 Sai rồi — khoá tay {Math.ceil((g.lockedUntil - now) / 1000)} giây.</>;
    } else if (g.mode === "race" && g.state.winners.length) {
      tone = "var(--lime-soft)";
      message = (
        <>
          🏆 <b>{nameIn(view, g.lineup[g.state.winners[0]].uid)}</b> đã thắng — hãy tiếp tục để hoàn tất ván nhé!
        </>
      );
    } else if (g.mode === "race") {
      tone = "var(--lime-soft)";
      message = <>⚡ Giải nhanh nhất có thể! Ô tô màu là đã có người giải trước — điền sai bị khoá tay 5 giây.</>;
    } else {
      tone = "var(--lime-soft)";
      message = <>🎯 Điền đúng ô trống trước người khác để ghi điểm — điền sai bị trừ 1 điểm.</>;
    }
  } else if (view.pending === "play") {
    message = <>⏳ Đang chờ chủ phòng xếp ghế…</>;
  } else if (seated) {
    message = <>✅ Bạn đã vào ghế. {view.isHost ? "Bấm “Bắt đầu” khi mọi người sẵn sàng." : "Chờ chủ phòng bắt đầu."}</>;
  } else {
    message = full ? <>🪑 Hết ghế — bạn có thể ngồi xem và trò chuyện.</> : <>Bấm “Vào chơi” để giải đề cùng mọi người.</>;
  }

  return (
    <div className="card flex flex-wrap items-center gap-3 px-4 py-3" style={{ background: tone }} aria-live="polite">
      <p className="min-w-0 flex-1 text-[15px] font-semibold">{message}</p>
      <div className="flex flex-wrap gap-2">
        {!live && !seated && !full && (
          <button type="button" className="btn btn-lime" onClick={() => session.join()} disabled={view.pending === "play"}>
            🙋 Vào chơi
          </button>
        )}
        {!live && seated && (
          <button type="button" className="btn" onClick={() => session.leaveSeat()} disabled={view.pending === "watch"}>
            Rời ghế
          </button>
        )}
        {!live && view.isHost && (
          <button
            type="button"
            className="btn btn-pen"
            onClick={() => session.start()}
            disabled={!m.players.length || !anyOnline}
            title={!m.players.length ? "Cần ít nhất một người vào ghế" : !anyOnline ? "Người chơi đang mất kết nối" : ""}
          >
            {m.round > 0 ? "🔁 Ván mới" : "▶ Bắt đầu"}
          </button>
        )}
        {live && view.isHost && (
          <ConfirmButton className="btn btn-coral" onConfirm={() => session.stop()} confirmLabel="Bấm lần nữa để dừng">
            ⏹ Dừng ván
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}

/** Luật ván tới: chủ phòng chọn mức đề và chế độ, người khác xem. */
function Rules({ view, session }: { view: View; session: SudokuRoom }) {
  const opts = view.game!.opts;
  const host = view.isHost;
  return (
    <section className="card mt-4 grid gap-3 p-4" aria-label="Luật ván tới">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Mức đề</span>
        {LEVEL_KEYS.map((l) => (
          <button
            key={l}
            type="button"
            className={`btn btn-sm ${opts.level === l ? "btn-sun" : ""}`}
            aria-pressed={opts.level === l}
            disabled={!host && opts.level !== l}
            onClick={host ? () => session.setOptions({ level: l }) : undefined}
            title={LEVELS[l].text}
          >
            {LEVELS[l].emoji} {LEVELS[l].name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Chế độ</span>
        {MODE_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`btn btn-sm ${opts.mode === k ? "btn-sun" : ""}`}
            aria-pressed={opts.mode === k}
            disabled={!host && opts.mode !== k}
            onClick={host ? () => session.setOptions({ mode: k }) : undefined}
          >
            {MODES[k].emoji} {MODES[k].name}
          </button>
        ))}
      </div>
      <p className="text-[13.5px] text-ink-2">
        {MODES[opts.mode].text}
        {!host && " Chủ phòng chọn mức đề và chế độ cho ván tới."}
      </p>
    </section>
  );
}

function ResultCard({ view, match: g }: { view: View; match: SudokuMatch }) {
  const r = g.result!;
  const winners = r.winners ?? [];
  const solved = r.reason === "solve" && winners.length > 0;
  const iWon = winners.includes(view.me);
  const k = g.lineup.findIndex((s) => s.uid === winners[0]);
  const names = winners.map((u) => nameIn(view, u)).join(", ");
  if (!solved)
    return (
      <section className="card loto-result mt-4 p-4 sm:p-5" aria-label={`Kết quả ván ${g.round}`}>
        <p className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">⏹ Dừng ván</p>
        <p className="mt-1 text-[15px] text-ink-2">Ván {g.round} dừng giữa chừng — không tính ai thắng.</p>
      </section>
    );
  if (g.mode === "coop")
    return (
      <section className="card loto-result mt-4 p-4 sm:p-5" aria-label={`Kết quả ván ${g.round}`}>
        <p className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          {winners.length > 1 ? (iWon ? "🤝 Bạn đồng hạng nhất!" : `🤝 ${names} đồng hạng nhất!`) : iWon ? "🏆 Bạn chiến thắng!" : `🏆 ${names} chiến thắng!`}
        </p>
        <p className="mt-1 text-[15px] text-ink-2">
          {g.state.score[k]} điểm · cả phòng hoàn tất ván Sudoku trong {clock(g.time ?? 0)}.
        </p>
      </section>
    );
  // Đối kháng: xếp hạng theo thứ tự giải xong, người chưa xong xếp theo số ô đã giải.
  const rest = g.lineup.map((_, i) => i).filter((i) => !rankOf(g, i)).sort((a, b) => g.state.right[b] - g.state.right[a]);
  return (
    <section className="card loto-result mt-4 p-4 sm:p-5" aria-label={`Kết quả ván ${g.round}`}>
      <p className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{iWon ? "🏆 Bạn về nhất!" : `🏆 ${names} về nhất!`}</p>
      <ol className="mt-3 grid gap-2">
        {[...g.state.finished, ...rest].map((i, n) => {
          const seat = g.lineup[i];
          const done = rankOf(g, i) > 0;
          const t = g.fin[i];
          return (
            <li key={seat.uid} className="flex items-center gap-2.5 text-[14.5px]">
              <span className="w-6 text-center font-display font-extrabold">{done ? (n === 0 ? "🥇" : n === 1 ? "🥈" : n === 2 ? "🥉" : n + 1) : "–"}</span>
              <span className="sd-swatch" style={{ background: colorOf(i) }} aria-hidden="true" />
              <b className="min-w-0 flex-1 truncate">{nameIn(view, seat.uid)}</b>
              <span className="font-semibold text-ink-2 tabular-nums">
                {done ? (t != null ? clock(t) : "xong") : `${g.state.right[i]}/${g.puzzle.empties} ô`}
                {g.state.wrong[i] ? ` · sai ${g.state.wrong[i]}` : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Bàn trống khi chưa chơi ván nào. */
function EmptyBoard({ view }: { view: View }) {
  const m = view.meta!;
  return (
    <div className="relative">
      <div className="sd-board" aria-hidden="true">
        {Array.from({ length: CELLS }, (_, i) => (
          <div key={i} className={cellFrame(i)} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
        <p className="card px-5 py-3 text-center font-display text-lg font-extrabold">
          {!m.players.length ? "Đang chờ người vào ghế…" : view.isHost ? "Bấm “Bắt đầu” để ra đề!" : "Đang chờ chủ phòng ra đề…"}
        </p>
      </div>
    </div>
  );
}

/** Đường kẻ khối 3×3 của một ô. */
function cellFrame(i: number) {
  const r = rowOf(i);
  const c = colOf(i);
  return `sd-cell ${c === 2 || c === 5 ? "bx-r" : ""} ${c === 8 ? "end-r" : ""} ${r === 2 || r === 5 ? "bx-b" : ""} ${r === 8 ? "end-b" : ""}`;
}

type Burst = { key: string; cell: number; color: string; bits: { dx: number; dy: number; rot: number; delay: number; w: number; h: number; tone: string }[] };

const BURST_MS = 1400;
const BURST_BITS = 26;

/**
 * Pháo giấy nổ từ ô vừa có người khác giải đúng (màu của người đó). Chỉ diễn các nước mới thấy khi đang ở trong phòng;
 * nhiều nước tới cùng lúc (vừa nối lại mạng) thì chỉ diễn vài nước cuối.
 */
function useBursts(g: SudokuMatch, active: boolean) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const seen = useRef(g.log.length);
  const onLog = useEffectEvent((from: number, to: number) => {
    if (!active) return;
    const made: Burst[] = [];
    for (let n = from; n < to; n++) {
      const [cell, digit, k] = g.log[n];
      if (k === g.me || g.puzzle.solution[cell] !== digit) continue;
      const color = colorOf(k);
      made.push({
        key: `${g.round}:${n}`,
        cell,
        color,
        bits: Array.from({ length: BURST_BITS }, (_, j) => {
          const angle = ((j + Math.random() * 0.6) / BURST_BITS) * Math.PI * 2;
          const dist = 44 + Math.random() * 70;
          const round = Math.random() < 0.35;
          return {
            dx: Math.round(Math.cos(angle) * dist),
            // Rơi xuống một chút như có trọng lực.
            dy: Math.round(Math.sin(angle) * dist + 22),
            rot: Math.round(Math.random() * 720 - 360),
            delay: Math.round(Math.random() * 90),
            w: round ? 12 : 9,
            h: round ? 12 : 18,
            tone: j % 3 === 0 ? "#ffd84d" : j % 3 === 1 ? color : "#ffffff",
          };
        }),
      });
    }
    const fresh = made.slice(-6);
    if (!fresh.length) return;
    setBursts((b) => [...b.slice(-12), ...fresh]);
    setTimeout(() => setBursts((b) => b.filter((x) => !fresh.includes(x))), BURST_MS + 150);
  });
  const n = g.log.length;
  useEffect(() => {
    const from = seen.current;
    seen.current = n;
    if (n > from) onLog(from, n);
  }, [n]);
  return bursts;
}

/** Lớp pháo giấy phủ lên bàn, mỗi chùm đặt ở tâm ô (trừ viền 3px của bàn). */
function Bursts({ bursts }: { bursts: Burst[] }) {
  return bursts.map((b) => (
    <span
      key={b.key}
      className="sd-burst"
      style={{
        left: `calc(3px + (100% - 6px) * ${(colOf(b.cell) + 0.5) / 9})`,
        top: `calc(3px + (100% - 6px) * ${(rowOf(b.cell) + 0.5) / 9})`,
        ["--c" as string]: b.color,
      }}
      aria-hidden="true"
    >
      {b.bits.map((x, j) => (
        <i
          key={j}
          style={{
            width: x.w,
            height: x.h,
            background: x.tone,
            borderRadius: x.w === x.h ? 999 : 2,
            animationDelay: `${x.delay}ms`,
            ["--dx" as string]: `${x.dx}px`,
            ["--dy" as string]: `${x.dy}px`,
            ["--rot" as string]: `${x.rot}deg`,
          }}
        />
      ))}
    </span>
  ));
}

/** Bàn chơi và bàn phím số; ghi chú bút chì chỉ lưu ở máy mình. */
function Play({ view, session, match: g, now }: { view: View; session: SudokuRoom; match: SudokuMatch; now: number }) {
  const live = isLive(view);
  const player = g.me >= 0;
  const [sel, setSel] = useState(-1);
  const [noting, setNoting] = useState(false);
  const [notes, setNotes] = useState<number[]>(() => new Array<number>(CELLS).fill(0));
  const [flash, setFlash] = useState<{ cell: number; digit: number; key: number } | null>(null);
  const counting = live && (!now || now < g.opensAt);
  const locked = now < g.lockedUntil;
  const canPlay = live && player && !counting && !locked && !g.state.over;
  const ended = !live;
  const bursts = useBursts(g, live && !counting);

  // Số trên bàn mình thấy: số cho sẵn, số đã giải, số mình vừa điền đúng đang chờ ghi nhận.
  const value = (i: number) => g.cells[i] || (g.pending.includes(i) ? g.puzzle.solution[i] : 0);
  const board = Array.from({ length: CELLS }, (_, i) => value(i));
  const left = (d: number) => 9 - board.filter((v) => v === d).length;
  const selValue = sel >= 0 ? board[sel] : 0;
  const open = (i: number) => i >= 0 && !board[i];

  const enter = (d: number) => {
    if (!open(sel) || !player) return;
    if (noting) {
      if (!live || counting) return;
      setNotes((n) => n.map((mask, i) => (i === sel ? mask ^ (1 << d) : mask)));
      return;
    }
    const res = session.play(sel, d);
    if (res === "wrong") setFlash({ cell: sel, digit: d, key: Date.now() });
  };
  const erase = () => {
    if (open(sel)) setNotes((n) => n.map((mask, i) => (i === sel ? 0 : mask)));
  };

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [flash]);

  // Bàn phím: mũi tên chọn ô, 1–9 điền, Backspace xoá ghi chú, N bật / tắt ghi chú. Bỏ qua khi đang gõ chat.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.closest("input, textarea, select, [contenteditable]") || t.closest("dialog")))) return;
    const move = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (move) {
      e.preventDefault();
      setSel((s) => {
        if (s < 0) return 40;
        if (move === -1 && colOf(s) === 0) return s + 8;
        if (move === 1 && colOf(s) === 8) return s - 8;
        return (s + move + CELLS) % CELLS;
      });
    } else if (/^[1-9]$/.test(e.key)) enter(Number(e.key));
    else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") erase();
    else if (e.key === "n" || e.key === "N") setNoting((x) => !x);
    else if (e.key === "Escape") setSel(-1);
  });
  useEffect(() => {
    if (!player) return;
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [player]);

  const cells = [];
  for (let i = 0; i < CELLS; i++) {
    const given = g.puzzle.givens[i];
    const v = board[i];
    const owner = g.state.owner[i];
    const pend = !g.cells[i] && g.pending.includes(i);
    const wrong = flash?.cell === i && !v;
    const ghost = ended && !v ? g.puzzle.solution[i] : 0;
    const shown = wrong ? flash!.digit : v || ghost;
    const mine = !given && v && (g.mode === "race" ? player : owner === g.me);
    const cls = [
      cellFrame(i),
      given ? "is-given" : "",
      !given && v && !pend ? (mine ? "is-mine" : "is-taken") : "",
      pend ? "is-pending" : "",
      ghost && !wrong ? "is-ghost" : "",
      wrong ? "is-wrong" : "",
      i === sel ? "is-sel" : sel >= 0 && sees(i, sel) ? "is-peer" : "",
      i !== sel && selValue && shown === selValue && !wrong ? "is-same" : "",
    ].join(" ");
    // Ô đã có người giải: cùng giải đề là người giữ ô; đối kháng là người giải nhanh nhất (kể cả khi mình chưa giải).
    const tint = owner >= 0 && !given && !counting ? tintOf(owner) : undefined;
    const who = owner >= 0 ? g.lineup[owner] : undefined;
    const label = `Hàng ${rowOf(i) + 1}, cột ${colOf(i) + 1}: ${counting ? "ẩn" : shown ? shown : "trống"}${who && !given && !counting ? ` — ${who.uid === view.me ? "bạn" : (who.member?.name ?? "ai đó")} giải ${g.mode === "race" ? "nhanh nhất" : ""}` : ""}`;
    const marks = !v && !counting && notes[i] ? DIGITS.filter((d) => notes[i] & (1 << d) && !board.some((x, j) => x === d && sees(i, j))) : [];
    cells.push(
      <button
        key={i}
        type="button"
        className={cls}
        style={tint ? ({ "--tint": tint } as React.CSSProperties) : undefined}
        onClick={() => setSel(i)}
        aria-label={label}
        aria-pressed={i === sel}
        title={who && !given && !counting ? `${who.uid === view.me ? "Bạn" : (who.member?.name ?? "Ai đó")}${g.mode === "race" ? " giải ô này nhanh nhất" : " giữ ô này"}` : undefined}
      >
        {counting ? null : shown ? (
          <span key={wrong ? flash!.key : shown}>{shown}</span>
        ) : marks.length ? (
          <span className="sd-notes" aria-hidden="true">
            {DIGITS.map((d) => (
              <span key={d}>{marks.includes(d) ? d : ""}</span>
            ))}
          </span>
        ) : null}
      </button>,
    );
  }

  return (
    <div className="grid gap-3">
      <div className="relative mx-auto w-full max-w-[560px]">
        <div className="sd-board" role="grid" aria-label={`Đề Sudoku ${LEVELS[g.level].name.toLowerCase()}`}>
          {cells}
        </div>
        <Bursts bursts={bursts} />
        {counting && (
          <div className="sd-hush" aria-hidden="true" />
        )}
      </div>
      {player && live && (
        <>
          <div className="sd-pad" role="group" aria-label="Bàn phím số">
            {DIGITS.map((d) => (
              <button
                key={d}
                type="button"
                className={`sd-key ${noting ? "is-note" : ""}`}
                onClick={() => enter(d)}
                disabled={!canPlay || !left(d) || (!noting && !open(sel))}
                aria-label={`${noting ? "Ghi chú" : "Điền"} số ${d}, còn ${left(d)}`}
              >
                {d}
                <small>{left(d) || "✓"}</small>
              </button>
            ))}
          </div>
          <div className="mx-auto flex w-full max-w-[560px] flex-wrap items-center gap-2">
            <button type="button" className={`btn btn-sm ${noting ? "btn-sun" : ""}`} onClick={() => setNoting((x) => !x)} aria-pressed={noting} title="Phím N">
              ✏️ Ghi chú: {noting ? "bật" : "tắt"}
            </button>
            <button type="button" className="btn btn-sm" onClick={erase} disabled={!open(sel) || !notes[sel]} title="Phím Backspace">
              🧽 Xoá ghi chú
            </button>
            <span className="ml-auto text-[12.5px] font-semibold text-ink-3">
              {locked ? `🔒 Khoá tay ${Math.ceil((g.lockedUntil - now) / 1000)}s` : sel < 0 ? "Chọn một ô rồi bấm số" : "Phím 1–9 · mũi tên · N"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** Bảng điểm: màu từng người, điểm (cùng giải đề) hoặc tiến độ (đối kháng), số lần sai, đồng hồ. */
function Scoreboard({ view, match: g, now, balloons }: { view: View; match: SudokuMatch; now: number; balloons: Record<string, ChatMsg> }) {
  const live = isLive(view);
  const s = g.state;
  const race = g.mode === "race";
  // Ván bị dừng thì không có thời gian giải.
  const elapsed = live ? (now && now > g.opensAt ? now - g.opensAt : 0) : g.time;
  // Đối kháng: người đã xong theo thứ tự xong, rồi tới người đang giải theo số ô đã giải.
  const done = (k: number) => rankOf(g, k) || Infinity;
  const order = g.lineup
    .map((_, k) => k)
    .sort((a, b) => (race ? done(a) - done(b) : 0) || s.score[b] - s.score[a] || s.wrong[a] - s.wrong[b] || a - b);
  const winners = new Set(race ? s.winners.map((k) => g.lineup[k].uid) : (g.result?.winners ?? []));
  return (
    <section className="card p-4" aria-labelledby="sd-score-h">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="sd-score-h" className="font-display text-lg font-extrabold">
          {race ? "⚡ Tiến độ" : "🏅 Bảng điểm"}
        </h2>
        {elapsed != null && (
          <span className="font-display text-lg font-extrabold tabular-nums" title="Thời gian giải">
            ⏱ {clock(elapsed)}
          </span>
        )}
      </div>
      <p className="text-[12.5px] font-semibold text-ink-3">
        {race ? `Mỗi người ${g.puzzle.empties} ô trống` : `Còn ${s.open}/${g.puzzle.empties} ô trống`}
      </p>
      <ol className="mt-3 grid gap-3">
        {order.map((k, rank) => {
          const seat = g.lineup[k];
          const p = seat.member;
          return (
            <li key={seat.uid} className="flex items-center gap-2.5">
              <span className="w-4 text-center text-[13px] font-extrabold text-ink-3">{rank + 1}</span>
              <span className="relative">
                {p ? <Avatar p={p} size={34} className={seat.online ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[34px] w-[34px] bg-sunken" />}
                <Balloon msg={balloons[seat.uid]} />
                {winners.has(seat.uid) && (
                  <span className="absolute -right-2 -bottom-1 text-base" aria-label="Thắng">
                    🏆
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-[14px] font-bold">
                  <span className="sd-swatch" style={{ background: colorOf(k) }} aria-hidden="true" />
                  <span className="truncate">{seat.uid === view.me ? "Bạn" : (p?.name ?? "Ai đó")}</span>
                </p>
                {race ? (
                  <>
                    <div className="sd-bar mt-1" aria-hidden="true">
                      <span style={{ width: `${(100 * s.right[k]) / Math.max(1, g.puzzle.empties)}%`, background: colorOf(k) }} />
                    </div>
                    <p className="mt-0.5 text-[11.5px] font-semibold text-ink-3">
                      {rankOf(g, k) ? `🏁 Xong${g.fin[k] != null ? ` ${clock(g.fin[k]!)}` : ""}` : `${s.right[k]}/${g.puzzle.empties} ô`}
                      {s.wrong[k] ? ` · sai ${s.wrong[k]}` : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-[11.5px] font-semibold text-ink-3">
                    ✔ {s.right[k]} · ✖ {s.wrong[k]}
                  </p>
                )}
              </div>
              {!race && <span className="font-display text-2xl font-extrabold tabular-nums">{s.score[k]}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
