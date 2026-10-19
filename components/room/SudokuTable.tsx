"use client";

import { memo, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { CELLS, clock, colOf, COUNTDOWN_MS, LEVEL_KEYS, LEVELS, LOCK_MS, MODE_KEYS, MODES, rowOf, sees } from "@/lib/games/sudoku";
import type { RoomState, RoomView } from "@/lib/net/room";
import type { SudokuMatch, SudokuRoom, SudokuView } from "@/lib/net/sudoku-room";
import { Avatar } from "../Avatar";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel } from "./People";
import { ResultCard as Result, Standings, StoppedCard } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout } from "./RoomLayout";
import { SeatButtons, seatMessage, StatusBar, StopButton, TONE } from "./StatusBar";
import { shallowEqual, useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

type View = Omit<RoomView<SudokuView>, "chat">;

const PLAYER_COLORS = ["var(--coral)", "var(--sky)", "var(--lime)", "var(--sun)", "var(--grape)", "#ff6fb5", "#14b8c4", "#ff8a3d", "#8a9a2c", "#a0785a"];
const colorOf = (k: number) => PLAYER_COLORS[k % PLAYER_COLORS.length];
const tintOf = (k: number) => `color-mix(in srgb, ${colorOf(k)} 32%, var(--board))`;

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const CONFETTI = ["🎉", "🏆", "✨", "🔢", "🎊", "⭐"];

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

// Chỉ vẽ lại đúng một lần lúc vượt mốc (lộ đề, hết khoá tay), không theo nhịp đồng hồ.
function useReached(at: number | undefined) {
  const [hit, setHit] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (at === undefined) return;
    const t = setTimeout(() => setHit(at), Math.max(0, at - Date.now()));
    return () => clearTimeout(t);
  }, [at]);
  return at !== undefined && hit === at;
}

// Ghép riêng ba store để phần bàn không vẽ lại theo nhịp tim, theo tin chat, và không kéo các phần khác theo.
function useSdView(session: SudokuRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const isLive = (view: View) => view.meta!.status === "playing" && view.game?.match?.round === view.meta!.round;

function nameIn(view: View, uid: string) {
  if (uid === view.me) return "Bạn";
  return view.game?.match?.lineup.find((s) => s.uid === uid)?.member?.name ?? view.members.find((p) => p.uid === uid)?.name ?? "Ai đó";
}

// Mỗi phần tự đăng ký store và bọc `memo`; đồng hồ chạy riêng trong phần cần hiện giờ để bàn 81 ô chỉ vẽ lại khi ván
// đổi hoặc lúc lộ đề / hết khoá tay.
export function SudokuTable({ id, slug, session }: { id: string; slug: string; session: SudokuRoom }) {
  const head = useRoomState(session, headOf, shallowEqual);
  const live = useSdLive(session);
  const shown = useGame(session, (v) => (live && v?.match ? { level: v.match.level, mode: v.match.mode } : { level: v!.opts.level, mode: v!.opts.mode }), shallowEqual);
  const round = useGame(session, (v) => v?.match?.round ?? 0);
  const areaRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, areaRef);

  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <RoomHeader name={head.name} status={head.status} round={head.round} playing="đang giải">
        <span className="chip text-ink-2">
          {LEVELS[shown.level].emoji} {LEVELS[shown.level].name}
        </span>
        <span className="chip text-ink-2">
          {MODES[shown.mode].emoji} {MODES[shown.mode].name}
        </span>
      </RoomHeader>

      <ActionPart session={session} />
      {!live && <RulesPart session={session} />}
      <ResultPart session={session} />

      <div ref={areaRef} className="relative mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
        {round ? <PlayPart key={round} session={session} /> : <EmptyPart session={session} />}
        {round > 0 && <ScorePart session={session} />}
        <Flyers flyers={flyers} />
      </div>

      <CinemaPart session={session} />
    </RoomLayout>
  );
}

const headOf = (r: RoomState) => ({ name: r.meta!.name, status: r.meta!.status, round: r.meta!.round });

function useSdLive(session: SudokuRoom) {
  const room = useRoomState(session, (r) => ({ status: r.meta!.status, round: r.meta!.round }), shallowEqual);
  const round = useGame(session, (v) => v?.match?.round);
  return room.status === "playing" && round === room.round;
}

const ActionPart = memo(function ActionPart({ session }: { session: SudokuRoom }) {
  const view = useSdView(session);
  return <ActionBar view={view} session={session} />;
});

const RulesPart = memo(function RulesPart({ session }: { session: SudokuRoom }) {
  const view = useSdView(session);
  return <Rules view={view} session={session} />;
});

const ResultPart = memo(function ResultPart({ session }: { session: SudokuRoom }) {
  const view = useSdView(session);
  const g = view.game!.match;
  return g?.result ? <ResultCard view={view} match={g} /> : null;
});

const PlayPart = memo(function PlayPart({ session }: { session: SudokuRoom }) {
  const view = useSdView(session);
  const g = view.game!.match;
  return g ? <Play view={view} session={session} match={g} /> : null;
});

const EmptyPart = memo(function EmptyPart({ session }: { session: SudokuRoom }) {
  const view = useSdView(session);
  return <EmptyBoard view={view} />;
});

const ScorePart = memo(function ScorePart({ session }: { session: SudokuRoom }) {
  const view = useSdView(session);
  const g = view.game!.match;
  return g ? <Scoreboard view={view} match={g} /> : null;
});

const CinemaPart = memo(function CinemaPart({ session }: { session: SudokuRoom }) {
  const live = useSdLive(session);
  const g = useGame(session, (v) => v?.match);
  // Vào phòng / tải lại giữa lúc đếm thì vẫn đếm nốt phần còn lại tới lúc lộ đề.
  const count = useCountdown(live && g ? g.round : 0, { endsAt: g?.opensAt, ms: COUNTDOWN_MS, onMount: true });
  const end = useEndScene(winKey(g), { ms: WIN_SCENE_MS, emojis: CONFETTI });
  return (
    <>
      {g && <Cinema match={g} count={count} win={end.shown} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

const WIN_SCENE_MS = 6500;

const rankOf = (g: SudokuMatch, k: number) => g.state.finished.indexOf(k) + 1;

const winKey = (g?: SudokuMatch) => (g && (g.mode === "race" ? g.state.winners.length > 0 : g.result?.reason === "solve" && !!g.result.winners?.length) ? g.round : 0);

function Cinema({ match: g, count, win, onClose }: { match: SudokuMatch; count: number; win: boolean; onClose: () => void }) {
  if (count > 0)
    return (
      <CountdownCine
        tone="grape"
        eyebrow={`${MODES[g.mode].emoji} ${MODES[g.mode].name} · ${LEVELS[g.level].emoji} ${LEVELS[g.level].name}`}
        n={count}
        title={g.mode === "coop" ? "Cùng nhau giải để hoàn tất ván Sudoku nhé..." : "Hãy giải nhanh nhất để chiến thắng nhé..."}
      />
    );
  if (!win) return null;
  const race = g.mode === "race";
  const winners = race ? g.state.winners : g.state.winners.length ? g.state.winners : g.lineup.flatMap((s, k) => (g.result?.winners?.includes(s.uid) ? [k] : []));
  if (!winners.length) return null;
  const iWon = winners.includes(g.me);
  const names = winners.map((k) => (k === g.me ? "Bạn" : (g.lineup[k].member?.name ?? "Ai đó"))).join(", ");
  const first = winners[0];
  const time = race ? g.fin[first] : g.time;
  return (
    <WinCine
      winners={winners.map((k) => ({ uid: g.lineup[k].uid, p: g.lineup[k].member }))}
      title={iWon && winners.length === 1 ? "Bạn chiến thắng!" : `${names} chiến thắng!`}
      sub={
        race
          ? `Giải xong đầu tiên${time != null ? ` sau ${clock(time)}` : ""}${g.state.wrong[first] ? ` · sai ${g.state.wrong[first]} lần` : " · không sai lần nào"}`
          : undefined
      }
      note={race && !g.state.over ? (rankOf(g, g.me) || g.me < 0 ? "Mọi người tiếp tục để hoàn tất ván nhé..." : "Hãy tiếp tục để hoàn tất ván nhé...") : undefined}
      onClose={onClose}
    >
      {!race && (
        <>
          <p className="cine-score">
            {g.state.score[first]} <small>điểm</small>
          </p>
          <p className="text-[15px] font-bold opacity-85">
            {winners.length > 1 ? "Đồng hạng nhất · " : ""}Cả phòng hoàn tất ván Sudoku{time != null ? ` trong ${clock(time)}` : ""}
          </p>
        </>
      )}
    </WinCine>
  );
}

function ActionBar({ view, session }: { view: View; session: SudokuRoom }) {
  const m = view.meta!;
  const g = view.game!.match;
  const live = isLive(view);
  const opened = useReached(g?.opensAt);
  const unlocked = useReached(g?.lockedUntil);
  const now = useNow(live && (!opened || (!!g?.lockedUntil && !unlocked)));

  let message: React.ReactNode;
  let tone: string = TONE.idle;
  if (live && g) {
    const counting = !opened;
    const locked = !!g.lockedUntil && !unlocked;
    if (g.me < 0) message = <>👀 Bạn đang xem — {g.mode === "race" ? "ô tô màu là đã có người giải (màu người giải nhanh nhất) — hết ván mới lộ số." : "mỗi ô được tô màu người điền đúng trước."}</>;
    else if (counting) {
      tone = TONE.hot;
      message = now ? <>⏳ Chuẩn bị… đề lộ sau {Math.max(1, Math.ceil((g.opensAt - now) / 1000))} giây!</> : <>⏳ Chuẩn bị…</>;
    } else if (g.mode === "race" && rankOf(g, g.me)) {
      tone = TONE.hot;
      const rank = rankOf(g, g.me);
      const t = g.fin[g.me];
      message = (
        <>
          🏁 Bạn đã giải xong — <b>{rank === 1 ? "về nhất" : `hạng ${rank}`}</b>
          {t != null ? ` (${clock(t)})` : ""}. Chờ mọi người hoàn tất ván…
        </>
      );
    } else if (locked) {
      tone = TONE.alert;
      message = <>🔒 Sai rồi — khoá tay {now ? Math.max(0, Math.ceil((g.lockedUntil - now) / 1000)) : LOCK_MS / 1000} giây.</>;
    } else if (g.mode === "race" && g.state.winners.length) {
      tone = TONE.turn;
      message = (
        <>
          🏆 <b>{nameIn(view, g.lineup[g.state.winners[0]].uid)}</b> đã thắng — hãy tiếp tục để hoàn tất ván nhé!
        </>
      );
    } else if (g.mode === "race") {
      tone = TONE.turn;
      message = <>⚡ Giải nhanh nhất có thể! Ô tô màu là đã có người giải trước — điền sai bị khoá tay 5 giây.</>;
    } else {
      tone = TONE.turn;
      message = <>🎯 Điền đúng ô trống trước người khác để ghi điểm — điền sai bị trừ 1 điểm.</>;
    }
  }
  if (live && g)
    return (
      <StatusBar tone={tone} message={message}>
        {view.isHost && <StopButton onConfirm={() => session.stop()} />}
      </StatusBar>
    );
  const blocked = !m.players.length ? "Cần ít nhất một người vào ghế" : !view.seats.some((s) => s.online) ? "Người chơi đang mất kết nối" : "";
  return (
    <StatusBar message={seatMessage(view, { enough: true, startHint: "Bấm “Bắt đầu” khi mọi người sẵn sàng.", join: "Bấm “Vào chơi” để giải đề cùng mọi người." })}>
      <SeatButtons view={view} session={session} blocked={blocked} />
    </StatusBar>
  );
}

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
  if (r.reason !== "solve" || !winners.length) return <StoppedCard round={g.round} />;
  const iWon = winners.includes(view.me);
  const k = g.lineup.findIndex((s) => s.uid === winners[0]);
  const names = winners.map((u) => nameIn(view, u)).join(", ");
  if (g.mode === "coop")
    return (
      <Result
        round={g.round}
        title={winners.length > 1 ? (iWon ? "🤝 Bạn đồng hạng nhất!" : `🤝 ${names} đồng hạng nhất!`) : iWon ? "🏆 Bạn chiến thắng!" : `🏆 ${names} chiến thắng!`}
        sub={`${g.state.score[k]} điểm · cả phòng hoàn tất ván Sudoku trong ${clock(g.time ?? 0)}.`}
      />
    );
  const rest = g.lineup.map((_, i) => i).filter((i) => !rankOf(g, i)).sort((a, b) => g.state.right[b] - g.state.right[a]);
  const done = g.state.finished.length;
  return (
    <Result round={g.round} title={iWon ? "🏆 Bạn về nhất!" : `🏆 ${names} về nhất!`}>
      <Standings
        rows={[...g.state.finished, ...rest].map((i, n) => {
          const t = g.fin[i];
          return {
            uid: g.lineup[i].uid,
            name: nameIn(view, g.lineup[i].uid),
            rank: n < done ? n + 1 : 0,
            mark: <span className="sd-swatch" style={{ background: colorOf(i) }} aria-hidden="true" />,
            value: `${n < done ? (t != null ? clock(t) : "xong") : `${g.state.right[i]}/${g.puzzle.empties} ô`}${g.state.wrong[i] ? ` · sai ${g.state.wrong[i]}` : ""}`,
          };
        })}
      />
    </Result>
  );
}

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

function cellFrame(i: number) {
  const r = rowOf(i);
  const c = colOf(i);
  return `sd-cell ${c === 2 || c === 5 ? "bx-r" : ""} ${c === 8 ? "end-r" : ""} ${r === 2 || r === 5 ? "bx-b" : ""} ${r === 8 ? "end-b" : ""}`;
}

const TINT_KEY = "arena:sudoku:tint";

function useTintPref() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(TINT_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(TINT_KEY, v ? "1" : "0");
    } catch {}
  };
  return [on, set] as const;
}

type Burst = { key: string; cell: number; color: string; bits: { dx: number; dy: number; rot: number; delay: number; w: number; h: number; tone: string }[] };

const BURST_MS = 1400;
const BURST_BITS = 26;

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

function Play({ view, session, match: g }: { view: View; session: SudokuRoom; match: SudokuMatch }) {
  const live = isLive(view);
  const player = g.me >= 0;
  const [sel, setSel] = useState(-1);
  const [noting, setNoting] = useState(false);
  const [tinted, setTinted] = useTintPref();
  const [notes, setNotes] = useState<number[]>(() => new Array<number>(CELLS).fill(0));
  const [flash, setFlash] = useState<{ cell: number; digit: number; key: number } | null>(null);
  // Bàn chỉ cần biết đã lộ đề / hết khoá tay chưa — vẽ lại đúng lúc đó, số giây khoá tay chạy riêng trong <LockLeft>.
  const opened = useReached(g.opensAt);
  const unlocked = useReached(g.lockedUntil);
  const counting = live && !opened;
  const locked = !!g.lockedUntil && !unlocked;
  const canPlay = live && player && !counting && !locked && !g.state.over;
  const ended = !live;
  const bursts = useBursts(g, live && !counting);

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
    const tint = tinted && owner >= 0 && !given && !counting ? tintOf(owner) : undefined;
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
      )}
      <div className="mx-auto flex w-full max-w-[560px] flex-wrap items-center gap-2">
        {player && live && (
          <>
            <button type="button" className={`btn btn-sm ${noting ? "btn-sun" : ""}`} onClick={() => setNoting((x) => !x)} aria-pressed={noting} title="Phím N">
              ✏️ Ghi chú: {noting ? "bật" : "tắt"}
            </button>
            <button type="button" className="btn btn-sm" onClick={erase} disabled={!open(sel) || !notes[sel]} title="Phím Backspace">
              🧽 Xoá ghi chú
            </button>
          </>
        )}
        <button
          type="button"
          className={`btn btn-sm ${tinted ? "btn-sun" : ""}`}
          onClick={() => setTinted(!tinted)}
          aria-pressed={tinted}
          title={g.mode === "race" ? "Tô ô đã có người giải bằng màu người giải nhanh nhất" : "Tô mỗi ô bằng màu người giữ ô"}
        >
          🎨 Màu người chơi: {tinted ? "hiện" : "ẩn"}
        </button>
        {player && live && (
          <span className="ml-auto text-[12.5px] font-semibold text-ink-3">
            {locked ? <LockLeft until={g.lockedUntil} /> : sel < 0 ? "Chọn một ô rồi bấm số" : "Phím 1–9 · mũi tên · N"}
          </span>
        )}
      </div>
    </div>
  );
}

// Tách riêng để nhịp đồng hồ chỉ vẽ lại dòng chữ này, không kéo cả bàn.
function LockLeft({ until }: { until: number }) {
  const now = useNow(true);
  return <>{now ? `🔒 Khoá tay ${Math.max(0, Math.ceil((until - now) / 1000))}s` : "🔒 Khoá tay"}</>;
}

function Scoreboard({ view, match: g }: { view: View; match: SudokuMatch }) {
  const live = isLive(view);
  // Đồng hồ ván chạy riêng ở bảng điểm.
  const now = useNow(live);
  const s = g.state;
  const race = g.mode === "race";
  const elapsed = live ? (now && now > g.opensAt ? now - g.opensAt : 0) : g.time;
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
      <ol className="mt-3 grid grid-cols-1 gap-3">
        {order.map((k, rank) => {
          const seat = g.lineup[k];
          const p = seat.member;
          return (
            <li key={seat.uid} className="flex min-w-0 items-center gap-2.5">
              <span className="w-4 shrink-0 text-center text-[13px] font-extrabold text-ink-3">{rank + 1}</span>
              <span className="relative shrink-0">
                {p ? <Avatar p={p} size={34} className={seat.online ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[34px] w-[34px] bg-sunken" />}
                {winners.has(seat.uid) && (
                  <span className="absolute -right-2 -bottom-1 text-base" aria-label="Thắng">
                    🏆
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 text-[14px] font-bold">
                  <span className="sd-swatch" style={{ background: colorOf(k) }} aria-hidden="true" />
                  <span className="min-w-0 truncate">{seat.uid === view.me ? "Bạn" : (p?.name ?? "Ai đó")}</span>
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
              {!race && <span className="shrink-0 font-display text-2xl font-extrabold tabular-nums">{s.score[k]}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
