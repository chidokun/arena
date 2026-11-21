"use client";

import { memo, useEffect, useEffectEvent, useMemo, useState } from "react";
import {
  clock,
  clueText,
  COUNTDOWN_MS,
  isBlock,
  isSeat,
  LEVEL_KEYS,
  LEVELS,
  LOCK_MS,
  MODE_KEYS,
  MODES,
  OBJECTS,
  standable,
  THEME_KEYS,
  THEMES,
  type Puzzle,
} from "@/lib/games/grid-detective";
import type { GdMatch, GdView, GridDetectiveRoom } from "@/lib/net/grid-detective-room";
import type { RoomState, RoomView } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel } from "./People";
import { ResultCard as Result, Standings, StoppedCard } from "./ResultCard";
import { RoomHeader, RoomLayout } from "./RoomLayout";
import { SeatButtons, seatMessage, StatusBar, StopButton, TONE } from "./StatusBar";
import { Roster } from "./SudokuTable";
import { shallowEqual, useGame, usePeople, useRoomState } from "./useRoom";

type View = Omit<RoomView<GdView>, "chat">;

const PLAYER_COLORS = ["var(--coral)", "var(--sky)", "var(--lime)", "var(--sun)", "var(--grape)", "#ff6fb5", "#14b8c4", "#ff8a3d", "#8a9a2c", "#a0785a"];
const colorOf = (k: number) => PLAYER_COLORS[k % PLAYER_COLORS.length];
const ROOM_TINTS = ["var(--sky)", "var(--lime)", "var(--sun)", "var(--grape)", "var(--coral)", "#14b8c4"];
const roomTint = (r: number) => `color-mix(in srgb, ${ROOM_TINTS[r % ROOM_TINTS.length]} 36%, var(--board))`;
const CONFETTI = ["🎉", "🔎", "✨", "🕵️", "🎊", "⭐"];
const WIN_SCENE_MS = 6500;

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

function useGdView(session: GridDetectiveRoom): View {
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

const headOf = (r: RoomState) => ({ name: r.meta!.name, status: r.meta!.status, round: r.meta!.round });

function useGdLive(session: GridDetectiveRoom) {
  const room = useRoomState(session, (r) => ({ status: r.meta!.status, round: r.meta!.round }), shallowEqual);
  const round = useGame(session, (v) => v?.match?.round);
  return room.status === "playing" && round === room.round;
}

export function GridDetectiveTable({ id, slug, session }: { id: string; slug: string; session: GridDetectiveRoom }) {
  const head = useRoomState(session, headOf, shallowEqual);
  const live = useGdLive(session);
  const shown = useGame(
    session,
    (v) => (live && v?.match ? { level: v.match.level, mode: v.match.mode, theme: v.match.theme } : { level: v!.opts.level, mode: v!.opts.mode, theme: v!.opts.theme }),
    shallowEqual,
  );
  const round = useGame(session, (v) => v?.match?.round ?? 0);

  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <RoomHeader name={head.name} status={head.status} round={head.round} playing="đang phá án">
        <span className="chip text-ink-2">
          {LEVELS[shown.level].emoji} {LEVELS[shown.level].name}
        </span>
        <span className="chip text-ink-2">
          {MODES[shown.mode].emoji} {MODES[shown.mode].name}
        </span>
        <span className="chip text-ink-2">
          {THEMES[shown.theme].emoji} {THEMES[shown.theme].name}
        </span>
      </RoomHeader>

      <ActionPart session={session} />
      {!live && <RulesPart session={session} />}
      <ResultPart session={session} />
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_250px]">
        {round ? <PlayPart key={round} session={session} /> : <EmptyPart session={session} />}
        <SidePart session={session} />
      </div>
      <CinemaPart session={session} />
    </RoomLayout>
  );
}

const ActionPart = memo(function ActionPart({ session }: { session: GridDetectiveRoom }) {
  const view = useGdView(session);
  return <ActionBar view={view} session={session} />;
});

const RulesPart = memo(function RulesPart({ session }: { session: GridDetectiveRoom }) {
  const view = useGdView(session);
  return <Rules view={view} session={session} />;
});

const ResultPart = memo(function ResultPart({ session }: { session: GridDetectiveRoom }) {
  const view = useGdView(session);
  const g = view.game!.match;
  return g?.result ? <ResultCard view={view} match={g} /> : null;
});

const PlayPart = memo(function PlayPart({ session }: { session: GridDetectiveRoom }) {
  const view = useGdView(session);
  const g = view.game!.match;
  return g ? <Play view={view} session={session} match={g} /> : null;
});

const EmptyPart = memo(function EmptyPart({ session }: { session: GridDetectiveRoom }) {
  const view = useGdView(session);
  return <EmptyBoard view={view} />;
});

const SidePart = memo(function SidePart({ session }: { session: GridDetectiveRoom }) {
  const view = useGdView(session);
  const g = view.game!.match;
  return g ? <Scoreboard view={view} match={g} /> : <Roster view={view} />;
});

const CinemaPart = memo(function CinemaPart({ session }: { session: GridDetectiveRoom }) {
  const live = useGdLive(session);
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

const rankOf = (g: GdMatch, k: number) => g.state.finished.indexOf(k) + 1;

const winKey = (g?: GdMatch) => (g && (g.mode === "race" ? g.state.winners.length > 0 : g.result?.reason === "solve" && !!g.result.winners?.length) ? g.round : 0);

const culpritName = (p: Puzzle) => `${p.tokens[p.culprit].emoji} ${p.tokens[p.culprit].name}`;

function Cinema({ match: g, count, win, onClose }: { match: GdMatch; count: number; win: boolean; onClose: () => void }) {
  const theme = THEMES[g.theme];
  if (count > 0)
    return (
      <CountdownCine
        tone="grape"
        eyebrow={`${MODES[g.mode].emoji} ${MODES[g.mode].name} · ${LEVELS[g.level].emoji} ${LEVELS[g.level].name} · ${theme.emoji} ${theme.name}`}
        n={count}
        title={g.mode === "coop" ? `Cùng nhau tìm ra ${theme.culprit} nhé...` : `Hãy là người đầu tiên tìm ra ${theme.culprit}...`}
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
  // Chưa tự phá xong thì không lộ thủ phạm trong màn chúc mừng.
  const spoil = !race || g.solved || g.me < 0 || g.state.over;
  return (
    <WinCine
      winners={winners.map((k) => ({ uid: g.lineup[k].uid, p: g.lineup[k].member }))}
      trophy="🔎"
      title={iWon && winners.length === 1 ? "Bạn phá án thành công!" : `${names} phá án thành công!`}
      sub={
        race
          ? `Phá án đầu tiên${time != null ? ` sau ${clock(time)}` : ""}${g.state.wrong[first] ? ` · buộc tội sai ${g.state.wrong[first]} lần` : " · không sai lần nào"}`
          : undefined
      }
      note={race && !g.state.over ? (rankOf(g, g.me) || g.me < 0 ? "Mọi người tiếp tục phá án nhé..." : "Hãy tiếp tục để tìm ra thủ phạm nhé...") : undefined}
      onClose={onClose}
    >
      {spoil && <p className="text-[17px] font-extrabold">{`${theme.culprit.charAt(0).toUpperCase()}${theme.culprit.slice(1)}: ${culpritName(g.puzzle)}`}</p>}
      {!race && (
        <>
          <p className="cine-score">
            {g.state.score[first]} <small>điểm</small>
          </p>
          <p className="text-[15px] font-bold opacity-85">
            {winners.length > 1 ? "Đồng hạng nhất · " : ""}Cả phòng phá xong vụ án{time != null ? ` trong ${clock(time)}` : ""}
          </p>
        </>
      )}
    </WinCine>
  );
}

function ActionBar({ view, session }: { view: View; session: GridDetectiveRoom }) {
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
    const culprit = THEMES[g.theme].culprit;
    if (g.me < 0) message = <>👀 Bạn đang xem — {g.mode === "race" ? "mỗi người tự phá án trên bàn của mình, hết ván mới lộ lời giải." : "quân nào đã đặt đúng sẽ hiện trên bản đồ."}</>;
    else if (counting) {
      tone = TONE.hot;
      message = now ? <>⏳ Chuẩn bị… hồ sơ vụ án mở sau {Math.max(1, Math.ceil((g.opensAt - now) / 1000))} giây!</> : <>⏳ Chuẩn bị…</>;
    } else if (g.mode === "race" && (rankOf(g, g.me) || g.solved)) {
      tone = TONE.hot;
      const rank = rankOf(g, g.me);
      const t = g.fin[g.me];
      message = (
        <>
          🏁 Bạn đã phá xong vụ án{rank ? <> — <b>{rank === 1 ? "về nhất" : `hạng ${rank}`}</b></> : null}
          {t != null ? ` (${clock(t)})` : ""}. Chờ mọi người hoàn tất ván…
        </>
      );
    } else if (locked) {
      tone = TONE.alert;
      message = <>🔒 Buộc tội sai — có người đứng sai chỗ. Khoá tay {now ? Math.max(0, Math.ceil((g.lockedUntil - now) / 1000)) : LOCK_MS / 1000} giây.</>;
    } else if (g.mode === "race" && g.state.winners.length) {
      tone = TONE.turn;
      message = (
        <>
          🏆 <b>{nameIn(view, g.lineup[g.state.winners[0]].uid)}</b> đã phá án đầu tiên — hãy tiếp tục để hoàn tất ván nhé!
        </>
      );
    } else if (g.mode === "race") {
      tone = TONE.turn;
      message = <>⚡ Đặt mọi người vào đúng chỗ rồi bấm “Buộc tội” — sai bị khoá tay {LOCK_MS / 1000} giây.</>;
    } else {
      tone = TONE.turn;
      message = <>🎯 Đặt đúng chỗ một người trước người khác để ghi điểm — đặt sai bị trừ 1. Chỉ đúng {culprit}: +2.</>;
    }
  }
  if (live && g)
    return (
      <StatusBar tone={tone} message={message}>
        <Buttons view={view} session={session} />
      </StatusBar>
    );
  return (
    <StatusBar message={seatMessage(view, { enough: true, startHint: "Bấm “Bắt đầu” khi mọi người sẵn sàng.", join: "Bấm “Vào chơi” để cùng phá án." })}>
      <Buttons view={view} session={session} />
    </StatusBar>
  );
}

function Buttons({ view, session }: { view: View; session: GridDetectiveRoom }) {
  const m = view.meta!;
  if (isLive(view) && view.game!.match) return view.isHost ? <StopButton onConfirm={() => session.stop()} /> : null;
  const blocked = !m.players.length ? "Cần ít nhất một người vào ghế" : !view.seats.some((s) => s.online) ? "Người chơi đang mất kết nối" : "";
  return <SeatButtons view={view} session={session} blocked={blocked} />;
}

function Rules({ view, session }: { view: View; session: GridDetectiveRoom }) {
  const opts = view.game!.opts;
  const host = view.isHost;
  const row = <K extends string>(label: string, keys: readonly K[], cur: K, info: Record<K, { name: string; emoji: string; text: string }>, set: (k: K) => void) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[86px] text-[13px] font-bold text-ink-3">{label}</span>
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          className={`btn btn-sm ${cur === k ? "btn-sun" : ""}`}
          aria-pressed={cur === k}
          disabled={!host && cur !== k}
          onClick={host ? () => set(k) : undefined}
          title={info[k].text}
        >
          {info[k].emoji} {info[k].name}
        </button>
      ))}
    </div>
  );
  return (
    <section className="card mt-4 grid gap-3 p-4" aria-label="Luật ván tới">
      {row("Mức đề", LEVEL_KEYS, opts.level, LEVELS, (level) => session.setOptions({ level }))}
      {row("Chế độ", MODE_KEYS, opts.mode, MODES, (mode) => session.setOptions({ mode }))}
      {row("Chủ đề", THEME_KEYS, opts.theme, THEMES, (theme) => session.setOptions({ theme }))}
      <p className="text-[13.5px] text-ink-2">
        {LEVELS[opts.level].text} {MODES[opts.mode].text}
        {!host && " Chủ phòng chọn mức đề, chế độ và chủ đề cho ván tới."}
      </p>
    </section>
  );
}

function ResultCard({ view, match: g }: { view: View; match: GdMatch }) {
  const r = g.result!;
  const winners = r.winners ?? [];
  const theme = THEMES[g.theme];
  const reveal = `${theme.culprit.charAt(0).toUpperCase()}${theme.culprit.slice(1)} là ${culpritName(g.puzzle)}.`;
  if (r.reason !== "solve" || !winners.length) return <StoppedCard round={g.round} sub={`Ván ${g.round} dừng giữa chừng — không tính ai thắng. ${reveal}`} />;
  const iWon = winners.includes(view.me);
  const k = g.lineup.findIndex((s) => s.uid === winners[0]);
  const names = winners.map((u) => nameIn(view, u)).join(", ");
  if (g.mode === "coop")
    return (
      <Result
        round={g.round}
        title={winners.length > 1 ? (iWon ? "🤝 Bạn đồng hạng nhất!" : `🤝 ${names} đồng hạng nhất!`) : iWon ? "🏆 Bạn chiến thắng!" : `🏆 ${names} chiến thắng!`}
        sub={`${g.state.score[k]} điểm · cả phòng phá xong vụ án trong ${clock(g.time ?? 0)}. ${reveal}`}
      />
    );
  const rest = g.lineup.map((_, i) => i).filter((i) => !rankOf(g, i)).sort((a, b) => g.state.wrong[a] - g.state.wrong[b]);
  const done = g.state.finished.length;
  return (
    <Result round={g.round} title={iWon ? "🏆 Bạn phá án nhanh nhất!" : `🏆 ${names} phá án nhanh nhất!`} sub={reveal}>
      <Standings
        rows={[...g.state.finished, ...rest].map((i, n) => {
          const t = g.fin[i];
          return {
            uid: g.lineup[i].uid,
            name: nameIn(view, g.lineup[i].uid),
            rank: n < done ? n + 1 : 0,
            mark: <span className="sd-swatch" style={{ background: colorOf(i) }} aria-hidden="true" />,
            value: `${n < done ? (t != null ? clock(t) : "xong") : "chưa xong"}${g.state.wrong[i] ? ` · sai ${g.state.wrong[i]}` : ""}`,
          };
        })}
      />
    </Result>
  );
}

function EmptyBoard({ view }: { view: View }) {
  const m = view.meta!;
  const n = 4;
  return (
    <div className="relative">
      <div className="gd-board mx-auto max-w-[520px]" style={{ ["--n" as string]: n }} aria-hidden="true">
        {Array.from({ length: n * n }, (_, i) => (
          <div key={i} className="gd-cell" />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
        <p className="card px-5 py-3 text-center font-display text-lg font-extrabold">
          {!m.players.length ? "Đang chờ người vào ghế…" : view.isHost ? "Bấm “Bắt đầu” để mở hồ sơ vụ án!" : "Đang chờ chủ phòng mở vụ án…"}
        </p>
      </div>
    </div>
  );
}

const rowOf = (p: Puzzle, c: number) => Math.floor(c / p.n);
const colOf = (p: Puzzle, c: number) => c % p.n;

function Play({ view, session, match: g }: { view: View; session: GridDetectiveRoom; match: GdMatch }) {
  const p = g.puzzle;
  const n = p.n;
  const N = n * n;
  const race = g.mode === "race";
  const live = isLive(view);
  const player = g.me >= 0;
  const opened = useReached(g.opensAt);
  const unlocked = useReached(g.lockedUntil);
  const counting = live && !opened;
  const locked = !!g.lockedUntil && !unlocked;
  const canPlay = live && player && !counting && !locked && !g.state.over && !(race && g.solved);
  const theme = THEMES[g.theme];

  const [sel, setSel] = useState(-1);
  const [mine, setMine] = useState<number[]>(() => new Array<number>(n).fill(-1));
  const [marks, setMarks] = useState<boolean[]>(() => new Array<boolean>(N).fill(false));
  const [marking, setMarking] = useState(false);
  const [struck, setStruck] = useState<boolean[]>(() => new Array<boolean>(p.clues.length).fill(false));
  const [flash, setFlash] = useState<{ cell: number; token: number; key: number } | null>(null);
  const [shake, setShake] = useState(0);
  const [accusing, setAccusing] = useState(-1);
  const [said, setSaid] = useState<"right" | "wrong" | null>(null);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [flash]);

  // Quân đang hiện trên bản đồ (ô của từng quân, −1 nếu chưa đặt).
  const ended = !live;
  const shown: number[] = ended
    ? p.solution
    : race
      ? player
        ? mine
        : new Array<number>(n).fill(-1)
      : g.state.placed.map((c, t) => (c >= 0 ? c : (g.pending.find(([x]) => x === t)?.[1] ?? -1)));
  const at = new Map<number, number>();
  shown.forEach((c, t) => c >= 0 && at.set(c, t));
  const clash = (t: number) =>
    race && live && shown[t] >= 0 && shown.some((c, u) => u !== t && c >= 0 && (rowOf(p, c) === rowOf(p, shown[t]) || colOf(p, c) === colOf(p, shown[t])));
  const culpritOut = ended || (race && g.solved) || (!race && g.state.accuser >= 0);
  const fixed = (t: number) => !race && (g.state.placed[t] >= 0 || g.pending.some(([x]) => x === t));

  const toggleMark = (cell: number) => setMarks((m) => m.map((x, i) => (i === cell ? !x : x)));

  const tap = (cell: number) => {
    if (!canPlay) return;
    if (!standable(p, cell)) return;
    if (marking) {
      if (!at.has(cell)) toggleMark(cell);
      return;
    }
    if (race) {
      if (sel >= 0) {
        if (mine[sel] === cell) {
          setMine((m) => m.map((c, t) => (t === sel ? -1 : c)));
          setSel(-1);
          return;
        }
        const next = mine.map((c, t) => (t === sel ? cell : c === cell ? -1 : c));
        setMine(next);
        if (marks[cell]) toggleMark(cell);
        setSel(-1);
        return;
      }
      if (at.has(cell)) setSel(at.get(cell)!);
      else toggleMark(cell);
      return;
    }
    if (sel >= 0 && !fixed(sel) && !at.has(cell)) {
      const res = session.place(sel, cell);
      if (res === "wrong") setFlash({ cell, token: sel, key: Date.now() });
      if (res === "right") setSel(-1);
      return;
    }
    if (!at.has(cell)) toggleMark(cell);
  };

  const pickToken = (t: number) => {
    if (!canPlay || fixed(t)) return;
    setSel((s) => (s === t ? -1 : t));
  };

  const submit = () => {
    const res = session.submit(mine);
    if (res === "wrong") setShake(Date.now());
    if (res) setSel(-1);
  };

  const accuse = (t: number) => {
    const res = session.accuse(t);
    setAccusing(-1);
    if (res) setSaid(res);
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (e.metaKey || e.ctrlKey || e.altKey || (el && (el.closest("input, textarea, select, [contenteditable]") || el.closest("dialog")))) return;
    if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) pickToken(Number(e.key) - 1);
    else if (e.key === "x" || e.key === "X") setMarking((x) => !x);
    else if (e.key === "Escape") setSel(-1);
  });
  useEffect(() => {
    if (!player) return;
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [player]);

  // Ô đầu tiên (theo thứ tự đọc) của mỗi phòng mang nhãn tên phòng.
  const labelAt = new Map<number, number>();
  p.room.forEach((r, c) => !Array.from(labelAt.values()).includes(r) && labelAt.set(c, r));

  const cells = [];
  for (let c = 0; c < N; c++) {
    const r = rowOf(p, c);
    const q = colOf(p, c);
    const obj = p.objs[c];
    const t = at.get(c);
    const wrong = flash?.cell === c && t === undefined;
    const tok = wrong ? flash!.token : t;
    const pend = !race && t !== undefined && g.state.placed[t] < 0;
    const cls = [
      "gd-cell",
      q < n - 1 && p.room[c + 1] !== p.room[c] ? "wr" : "",
      r < n - 1 && p.room[c + n] !== p.room[c] ? "wb" : "",
      isBlock(obj) ? "is-block" : "",
      canPlay && standable(p, c) ? "is-open" : "",
      tok !== undefined && tok === sel ? "is-sel" : "",
      tok !== undefined && clash(tok) ? "is-clash" : "",
      tok === 0 ? "is-victim" : "",
      tok !== undefined && tok === p.culprit && culpritOut ? "is-culprit" : "",
      pend ? "is-pending" : "",
      wrong ? "is-wrong" : "",
      ended && race && player && t !== undefined ? "is-ghost" : "",
    ].join(" ");
    const owner = !race && t !== undefined ? g.state.owner[t] : -1;
    const label = `Hàng ${r + 1}, cột ${q + 1}, ${p.rooms[p.room[c]].name}${obj ? `, ${OBJECTS[obj].name}` : ""}${tok !== undefined && !counting ? `: ${p.tokens[tok].name}` : marks[c] ? ": đánh dấu ✕" : ""}`;
    cells.push(
      <button
        key={c}
        type="button"
        className={cls}
        style={{ ["--room" as string]: roomTint(p.room[c]), ...(owner >= 0 ? { ["--own" as string]: colorOf(owner) } : {}) }}
        onClick={() => tap(c)}
        aria-label={label}
      >
        {labelAt.has(c) && <span className="gd-room">{p.rooms[p.room[c]].name}</span>}
        {obj && !counting && <span className={isSeat(obj) ? "gd-seat" : "gd-obj"}>{OBJECTS[obj].emoji}</span>}
        {counting ? null : tok !== undefined ? (
          <span key={wrong ? flash!.key : tok} className="gd-token">
            {p.tokens[tok].emoji}
          </span>
        ) : marks[c] ? (
          <span className="gd-mark" aria-hidden="true">
            ✕
          </span>
        ) : null}
      </button>,
    );
  }

  const placedAll = mine.every((c) => c >= 0);
  const clashAny = race && mine.some((_, t) => clash(t));
  const suspects = p.tokens.map((_, t) => t).filter((t) => t > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <div className="gd-frame mx-auto w-full max-w-[520px]" style={{ ["--n" as string]: n }}>
          <span />
          <div className="gd-axis">
            {Array.from({ length: n }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <div className="gd-axis gd-axis-v">
            {Array.from({ length: n }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <div className="relative">
            <div key={shake} className={`gd-board ${shake ? "is-shake" : ""}`} role="grid" aria-label={`Bản đồ vụ án ${p.title}`}>
              {cells}
            </div>
            {counting && <div className="sd-hush" aria-hidden="true" />}
          </div>
        </div>
        {player && live && (
          <div className="mx-auto flex w-full max-w-[520px] flex-wrap items-center gap-2">
            <button type="button" className={`btn btn-sm ${marking ? "btn-sun" : ""}`} onClick={() => setMarking((x) => !x)} aria-pressed={marking} title="Phím X">
              ✕ Đánh dấu: {marking ? "bật" : "tắt"}
            </button>
            {race && (
              <button type="button" className="btn btn-sm" onClick={() => (setMine(new Array<number>(n).fill(-1)), setSel(-1))} disabled={!canPlay || mine.every((c) => c < 0)}>
                🧹 Gỡ hết
              </button>
            )}
            {race && (
              <button type="button" className="btn btn-sm btn-coral ml-auto" onClick={submit} disabled={!canPlay || !placedAll} title={clashAny ? "Có người trùng hàng hoặc cột" : undefined}>
                🔎 Buộc tội
              </button>
            )}
            {!race && <span className="ml-auto text-[12.5px] font-semibold text-ink-3">{locked ? null : sel < 0 ? "Chọn một người rồi bấm vào ô" : "Phím 1–" + n + " · X · Esc"}</span>}
          </div>
        )}
      </div>

      <section className="card grid content-start gap-3 p-4" aria-label="Hồ sơ vụ án">
        <div>
          <h2 className="font-display text-xl font-extrabold">
            {theme.emoji} {p.title}
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-2">{p.intro}</p>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-3">
            Mỗi hàng, mỗi cột đúng một quân · không đứng lên đồ vật có nền gạch · mọi lời khai đều đúng.
          </p>
        </div>
        {counting ? (
          <p className="text-center font-display text-lg font-extrabold text-ink-3">🔒 Hồ sơ sắp mở…</p>
        ) : (
          <ol className="grid gap-2">
            {p.tokens.map((tk, t) => {
              const done = race ? mine[t] >= 0 : fixed(t);
              const mineClues = p.clues.map((c, i) => [c, i] as const).filter(([c]) => c.t === t);
              return (
                <li key={t} className={`gd-file ${sel === t ? "is-sel" : ""} ${t === p.culprit && culpritOut ? "is-culprit" : ""}`}>
                  <button type="button" className="gd-file-head" onClick={() => pickToken(t)} disabled={!canPlay || fixed(t)} aria-pressed={sel === t}>
                    <span className="gd-file-emoji">{tk.emoji}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <b>{tk.name}</b>
                      <small className="ml-1.5 text-ink-3">{t === 0 ? theme.victim : t === p.culprit && culpritOut ? theme.culprit : `phím ${t + 1}`}</small>
                    </span>
                    {player && live && <span className="text-[12px] font-bold text-ink-3">{done ? "✓ đã đặt" : sel === t ? "đang chọn" : ""}</span>}
                  </button>
                  {mineClues.map(([c, i]) => (
                    <button
                      key={i}
                      type="button"
                      className={`gd-clue ${struck[i] ? "is-struck" : ""}`}
                      onClick={() => setStruck((s) => s.map((x, j) => (j === i ? !x : x)))}
                      title="Bấm để gạch lời khai đã dùng"
                    >
                      {t === 0 ? "🔍 " : "💬 "}
                      {clueText(p, c)}
                    </button>
                  ))}
                </li>
              );
            })}
          </ol>
        )}
        {!race && player && live && !counting && (
          <div className="grid gap-2 rounded-xl bg-sunken p-3">
            <p className="text-[13px] font-bold">
              🔎 Buộc tội ({g.accused ? "đã dùng lượt" : "một lượt: đúng +2, sai −2"})
            </p>
            {said && <p className={`text-[13px] font-bold ${said === "right" ? "text-lime" : "text-coral"}`}>{said === "right" ? "Chính xác! +2 điểm." : "Sai rồi — trừ 2 điểm."}</p>}
            {g.state.accuser >= 0 ? (
              <p className="text-[13px] text-ink-2">
                {nameIn(view, g.lineup[g.state.accuser].uid)} đã chỉ đúng {theme.culprit}: <b>{culpritName(p)}</b>.
              </p>
            ) : (
              !g.accused &&
              (accusing >= 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px]">
                    Chắc chắn {p.tokens[accusing].name} là {theme.culprit}?
                  </span>
                  <button type="button" className="btn btn-sm btn-coral" onClick={() => accuse(accusing)} disabled={!canPlay}>
                    Buộc tội
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setAccusing(-1)}>
                    Huỷ
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {suspects.map((t) => (
                    <button key={t} type="button" className="btn btn-sm" onClick={() => setAccusing(t)} disabled={!canPlay}>
                      {p.tokens[t].emoji} {p.tokens[t].name}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function useElapsed(view: View, g: GdMatch | undefined) {
  const live = isLive(view);
  const now = useNow(live && !!g);
  if (!g) return undefined;
  return live ? (now && now > g.opensAt ? now - g.opensAt : 0) : g.time;
}

function Scoreboard({ view, match: g }: { view: View; match: GdMatch }) {
  const elapsed = useElapsed(view, g);
  const s = g.state;
  const race = g.mode === "race";
  const done = (k: number) => rankOf(g, k) || Infinity;
  const order = g.lineup
    .map((_, k) => k)
    .sort((a, b) => (race ? done(a) - done(b) : 0) || s.score[b] - s.score[a] || s.wrong[a] - s.wrong[b] || a - b);
  const winners = new Set(race ? s.winners.map((k) => g.lineup[k].uid) : (g.result?.winners ?? []));
  return (
    <section className="card p-4" aria-labelledby="gd-score-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 id="gd-score-h" className="font-display text-lg font-extrabold">
          {race ? "⚡ Tiến độ" : "🏅 Bảng điểm"}
        </h2>
        {elapsed != null && (
          <span className="font-display text-lg font-extrabold tabular-nums" title="Thời gian phá án">
            ⏱ {clock(elapsed)}
          </span>
        )}
      </div>
      <p className="text-[12.5px] font-semibold text-ink-3">{race ? `${s.finished.length}/${g.lineup.length} người đã phá án` : `Còn ${s.open}/${g.puzzle.n} người chưa đặt`}</p>
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
                <p className="text-[11.5px] font-semibold text-ink-3">
                  {race
                    ? `${rankOf(g, k) ? `🏁 Xong${g.fin[k] != null ? ` ${clock(g.fin[k]!)}` : ""}` : "🕵️ Đang phá án"}${s.wrong[k] ? ` · sai ${s.wrong[k]}` : ""}`
                    : `✔ ${s.right[k]} · ✖ ${s.wrong[k]}${s.accuser === k ? " · 🔎 +2" : ""}`}
                </p>
              </div>
              {!race && <span className="shrink-0 font-display text-2xl font-extrabold tabular-nums">{s.score[k]}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
