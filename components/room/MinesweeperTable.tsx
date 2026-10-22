"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clock, COUNTDOWN_MS, density, HIDDEN, SIZES, START, type Layout, type MsState } from "@/lib/games/minesweeper";
import type { MinesweeperRoom, MsMatch, MsView } from "@/lib/net/minesweeper-room";
import type { RoomView } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { MineCount } from "../MineCount";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { MineBlasts } from "./MineBlast";
import { PeoplePanel } from "./People";
import { ResultCard as Result, Standings, StoppedCard } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout } from "./RoomLayout";
import { StageArea, useStaged } from "./stage";
import { SeatButtons, seatMessage, StatusBar, StopButton, TONE } from "./StatusBar";
import { useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

type View = Omit<RoomView<MsView>, "chat">;

function useMsView(session: MinesweeperRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const PLAYER_COLORS = ["var(--sky)", "var(--lime)", "var(--grape)", "var(--sun)", "var(--coral)", "#ff6fb5", "#14b8c4", "#ff8a3d", "#8a9a2c", "#a0785a"];
const colorOf = (k: number) => PLAYER_COLORS[k] ?? `hsl(${Math.round((k * 137.508) % 360)} 70% 52%)`;

const CONFETTI = ["🎉", "🏆", "✨", "🚩", "🎊", "⭐"];
const WIN_SCENE_MS = 6500;
const LONG_PRESS_MS = 380;
const MIN_CELL = 26;
const MAX_CELL = 44;

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

// Chỉ vẽ lại đúng một lần lúc vượt mốc (vd. lộ bàn), không theo nhịp đồng hồ.
function useReached(at: number | undefined) {
  const [hit, setHit] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (at === undefined) return;
    const t = setTimeout(() => setHit(at), Math.max(0, at - Date.now()));
    return () => clearTimeout(t);
  }, [at]);
  return at !== undefined && hit === at;
}

const isLive = (view: View) => view.meta!.status === "playing" && view.game?.match?.round === view.meta!.round;

function nameIn(view: View, uid: string) {
  if (uid === view.me) return "Bạn";
  return view.game?.match?.lineup.find((s) => s.uid === uid)?.member?.name ?? view.members.find((p) => p.uid === uid)?.name ?? "Ai đó";
}

const aliveOf = (s: MsState) => s.alive.flatMap((a, k) => (a ? [k] : []));

function ranking(g: MsMatch) {
  const s = g.state;
  const won = new Set(s.winners);
  const tier = (k: number) => (won.has(k) ? 0 : s.alive[k] ? 1 : 2);
  return g.lineup.map((_, k) => k).sort((a, b) => tier(a) - tier(b) || s.score[b] - s.score[a] || a - b);
}

// Phần bàn chơi bọc `memo` và tự đọc store để nhịp tim, tin chat hay người vào ra không làm bàn vẽ lại, và nước đi
// không làm danh sách người / khung chat vẽ lại.
export function MinesweeperTable({ id, slug, session }: { id: string; slug: string; session: MinesweeperRoom }) {
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <MinesweeperBody session={session} />
    </RoomLayout>
  );
}

const MinesweeperBody = memo(function MinesweeperBody({ session }: { session: MinesweeperRoom }) {
  const view = useMsView(session);
  const m = view.meta!;
  const { opts, match: g } = view.game!;
  const areaRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, areaRef);
  const live = isLive(view);
  // Vào phòng / tải lại giữa lúc đếm thì vẫn đếm nốt phần còn lại tới lúc lộ bàn.
  const count = useCountdown(live && g ? g.round : 0, { endsAt: g?.opensAt, ms: COUNTDOWN_MS, onMount: true });
  const end = useEndScene(winKey(g), { ms: WIN_SCENE_MS, emojis: CONFETTI });
  const size = live && g ? g.size : opts.size;
  const mines = live && g ? g.mines : opts.mines;
  // Lúc trình chiếu bàn lấp ô giữa theo đúng tỉ lệ (kể cả 16px viền + lề trong); bảng điểm sang một bên, đồng hồ / số mìn
  // / nút Mở–Cờ sang bên kia (màn hình dọc: trên / dưới). Phần đó nằm trong <Play> (dùng chung chế độ bấm) nên đưa sang
  // mạn bên qua portal vào `slot`.
  const staged = useStaged();
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const shape = SIZES[g ? g.size : opts.size];

  return (
    <>
      <RoomHeader name={m.name} status={m.status} round={m.round} playing="đang gỡ mìn">
        <span className="chip text-ink-2">
          ▦ {SIZES[size].label} {SIZES[size].w}×{SIZES[size].h}
        </span>
        <span className="chip text-ink-2">
          💣 {mines} mìn · {density(size, mines)}%
        </span>
        <span className="chip text-ink-2">🙋 {m.players.length} người chơi · không giới hạn</span>
      </RoomHeader>

      <ActionBar view={view} session={session} />
      {!live && <Rules view={view} session={session} />}
      {g?.result && <ResultCard view={view} match={g} />}

      <StageArea
        fit="w-[min(100cqw,var(--stage-center))]"
        center={`(100cqh - 16px) * ${shape.w / shape.h} + 16px`}
        flanks={[
          <div key="a" className="sd-flank">
            {g ? <Scoreboard view={view} match={g} staged /> : <Roster view={view} />}
          </div>,
          <div key="b" ref={setSlot} className="sd-flank" />,
        ]}
        tools={<Buttons view={view} session={session} />}
      >
        <div ref={areaRef} className={staged ? "relative" : "relative mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px]"}>
          {g ? <Play key={g.round} view={view} session={session} match={g} slot={slot} /> : <EmptyBoard view={view} />}
          {g && !staged && <Scoreboard view={view} match={g} />}
          <Flyers flyers={flyers} />
        </div>
      </StageArea>

      {g && <Cinema match={g} count={count} win={end.shown} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

const winKey = (g?: MsMatch) => ((g?.result?.reason === "points" || g?.result?.reason === "solve") && g.result.winners?.length ? g.round : 0);

function Cinema({ match: g, count, win, onClose }: { match: MsMatch; count: number; win: boolean; onClose: () => void }) {
  if (count > 0)
    return (
      <CountdownCine
        tone="red"
        eyebrow={`💣 Dò Mìn · ${SIZES[g.size].label} ${SIZES[g.size].w}×${SIZES[g.size].h} · ${g.mines} mìn`}
        n={count}
        title={g.lineup.length > 1 ? "Mở nhanh tay, nhưng đừng đạp mìn..." : "Gỡ sạch bãi mìn nào..."}
        tip="Chuột phải hoặc giữ lâu để cắm cờ."
      />
    );
  if (!win) return null;
  const winners = g.lineup.flatMap((s, k) => (g.result?.winners?.includes(s.uid) ? [k] : []));
  if (!winners.length) return null;
  const iWon = winners.includes(g.me);
  const names = winners.map((k) => (k === g.me ? "Bạn" : (g.lineup[k].member?.name ?? "Ai đó"))).join(", ");
  const first = winners[0];
  const solve = g.result?.reason === "solve";
  return (
    <WinCine
      winners={winners.map((k) => ({ uid: g.lineup[k].uid, p: g.lineup[k].member }))}
      trophy={solve ? "🚩" : "🏆"}
      title={solve ? (iWon ? "Bạn gỡ sạch bãi mìn!" : `${names} gỡ sạch bãi mìn!`) : iWon && winners.length === 1 ? "Bạn chiến thắng!" : `${names} chiến thắng!`}
      onClose={onClose}
    >
      <p className="cine-score">
        {g.state.score[first]} <small>ô</small>
      </p>
      <p className="text-[15px] font-bold opacity-85">
        {winners.length > 1 ? "Đồng hạng nhất · " : ""}
        {g.time != null ? `${clock(g.time)} · ` : ""}
        {g.lineup.length > 1 && solve ? "người trụ lại cuối cùng" : `${g.mines} mìn`}
      </p>
    </WinCine>
  );
}

function ActionBar({ view, session }: { view: View; session: MinesweeperRoom }) {
  const m = view.meta!;
  const g = view.game!.match;
  const live = isLive(view);
  const opened = useReached(g?.opensAt);
  const now = useNow(live && !opened);

  if (live && g) {
    let message: React.ReactNode;
    let tone: string = TONE.turn;
    const counting = !opened;
    const alive = aliveOf(g.view);
    if (g.me < 0) {
      tone = TONE.idle;
      message = <>👀 Bạn đang xem — ô đã mở được tô màu người mở.</>;
    } else if (counting) {
      tone = TONE.hot;
      message = now ? <>⏳ Chuẩn bị… bàn lộ sau {Math.max(1, Math.ceil((g.opensAt - now) / 1000))} giây!</> : <>⏳ Chuẩn bị…</>;
    } else if (!g.view.alive[g.me]) {
      tone = TONE.alert;
      message =
        g.view.fate[g.me] === "left" ? <>🚪 Bạn mất kết nối quá lâu — bị loại khỏi ván này.</> : <>💥 Bạn đã đạp mìn — bị loại. Ở lại xem mọi người gỡ nốt nhé.</>;
    } else if (g.lineup.length > 1 && alive.length === 1) {
      tone = TONE.hot;
      message = <>⚠️ Bạn là người cuối cùng còn trụ — phải mở hết ô an toàn mới thắng, cẩn thận từng ô!</>;
    } else
      message = (
        <>
          🎯 Mở ô an toàn: +1 điểm mỗi ô lộ ra. Chuột phải / giữ lâu để cắm cờ, bấm ô số đủ cờ để mở nhanh. Đạp mìn là bị loại!
        </>
      );
    return (
      <StatusBar tone={tone} message={message}>
        <Buttons view={view} session={session} />
      </StatusBar>
    );
  }
  return (
    <StatusBar
      message={seatMessage(view, {
        enough: m.players.length > 0,
        startHint: "Bấm “Bắt đầu” khi mọi người sẵn sàng — chơi một mình cũng được.",
        join: "Bấm “Vào chơi” để cùng dò mìn — không giới hạn người chơi.",
      })}
    >
      <Buttons view={view} session={session} />
    </StatusBar>
  );
}

// Dùng chung cho thanh trạng thái và thanh công cụ lúc trình chiếu.
function Buttons({ view, session }: { view: View; session: MinesweeperRoom }) {
  const m = view.meta!;
  if (isLive(view) && view.game!.match) return view.isHost ? <StopButton onConfirm={() => session.stop()} /> : null;
  const blocked = !m.players.length ? "Cần ít nhất một người vào ghế" : !view.seats.some((s) => s.online) ? "Người chơi đang mất kết nối" : "";
  return <SeatButtons view={view} session={session} blocked={blocked} />;
}

function Rules({ view, session }: { view: View; session: MinesweeperRoom }) {
  const opts = view.game!.opts;
  const host = view.isHost;
  return (
    <section className="card mt-4 grid gap-3 p-4" aria-label="Luật ván tới">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Cỡ bàn</span>
        {(Object.keys(SIZES) as (keyof typeof SIZES)[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`btn btn-sm ${opts.size === k ? "btn-coral" : ""}`}
            aria-pressed={opts.size === k}
            disabled={!host && opts.size !== k}
            onClick={host ? () => session.setOptions({ size: k }) : undefined}
          >
            {SIZES[k].label} {SIZES[k].w}×{SIZES[k].h}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <span className="w-[86px] pt-1.5 text-[13px] font-bold text-ink-3">Số mìn</span>
        <div className="min-w-[240px] flex-1 sm:max-w-[420px]">
          <MineCount size={opts.size} mines={opts.mines} onChange={host ? (n) => session.setOptions({ mines: n }) : undefined} />
        </div>
      </div>
      <p className="text-[13.5px] text-ink-2">
        Cả phòng chung một bàn, không theo lượt: mở ô an toàn được 1 điểm cho mỗi ô lộ ra, đạp mìn là bị loại. Mở hết ô an toàn thì ai còn trụ nhiều điểm nhất thắng;
        chỉ còn một người trụ lại thì người đó phải tự mở hết mới thắng. Cờ là của riêng bạn, người khác không thấy.
        {!host && " Chủ phòng chọn cỡ bàn và số mìn cho ván tới."}
      </p>
    </section>
  );
}

function ResultCard({ view, match: g }: { view: View; match: MsMatch }) {
  const r = g.result!;
  const winners = r.winners ?? [];
  if (r.reason === "stop") return <StoppedCard round={g.round} />;
  const s = g.state;
  const time = g.time != null ? ` · ${clock(g.time)}` : "";
  const solo = g.lineup.length === 1;
  const order = ranking(g);
  const rows = order.map((k, i) => ({
    uid: g.lineup[k].uid,
    name: nameIn(view, g.lineup[k].uid),
    rank: s.winners.includes(k) ? 1 : i + 1,
    mark: <span className="sd-swatch" style={{ background: colorOf(k) }} aria-hidden="true" />,
    value: `${s.score[k]} ô${s.fate[k] === "boom" ? " · 💥 đạp mìn" : s.fate[k] === "left" ? " · 🚪 rời ván" : ""}`,
  }));
  if (r.reason === "boom")
    return (
      <Result
        round={g.round}
        title={solo ? (g.me === 0 ? "💥 Bạn đạp mìn rồi!" : `💥 ${nameIn(view, g.lineup[0].uid)} đạp mìn!`) : "💥 Ai cũng đạp mìn — không ai thắng!"}
        sub={`Còn ${s.left} ô an toàn chưa mở${time}.`}
      >
        {!solo && <Standings rows={rows} />}
      </Result>
    );
  const iWon = winners.includes(view.me);
  const names = winners.map((u) => nameIn(view, u)).join(", ");
  const k = g.lineup.findIndex((x) => x.uid === winners[0]);
  if (solo) return <Result round={g.round} title={iWon ? "🚩 Bạn gỡ sạch bãi mìn!" : `🚩 ${names} gỡ sạch bãi mìn!`} sub={`${SIZES[g.size].w}×${SIZES[g.size].h} · ${g.mines} mìn${time}.`} />;
  return (
    <Result
      round={g.round}
      title={
        r.reason === "solve"
          ? iWon
            ? "🚩 Bạn trụ lại và gỡ sạch bãi mìn!"
            : `🚩 ${names} trụ lại và gỡ sạch bãi mìn!`
          : winners.length > 1
            ? iWon
              ? "🤝 Bạn đồng hạng nhất!"
              : `🤝 ${names} đồng hạng nhất!`
            : iWon
              ? "🏆 Bạn chiến thắng!"
              : `🏆 ${names} chiến thắng!`
      }
      sub={`${s.score[k]} ô · cả phòng gỡ sạch ${g.mines} mìn${time}.`}
    >
      <Standings rows={rows} />
    </Result>
  );
}

function EmptyBoard({ view }: { view: View }) {
  const m = view.meta!;
  const { w, h } = SIZES[view.game!.opts.size];
  const staged = useStaged();
  return (
    <div className="relative min-w-0">
      <Grid w={w} label="Bàn dò mìn chưa xếp" staged={staged}>
        {Array.from({ length: w * h }, (_, i) => (
          <span key={i} className="ms-cell is-hidden" />
        ))}
      </Grid>
      <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
        <p className="card px-5 py-3 text-center font-display text-lg font-extrabold">
          {!m.players.length ? "Đang chờ người vào ghế…" : view.isHost ? "Bấm “Bắt đầu” để rải mìn!" : "Đang chờ chủ phòng rải mìn…"}
        </p>
      </div>
    </div>
  );
}

// Lúc trình chiếu bàn đã vừa ô giữa: bỏ cỡ ô tối thiểu / tối đa và thanh cuộn ngang.
function Grid({
  w,
  label,
  staged,
  scrollRef,
  gridRef,
  children,
}: {
  w: number;
  label: string;
  staged: boolean;
  scrollRef?: React.Ref<HTMLDivElement>;
  gridRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <div ref={scrollRef} className={staged ? undefined : "overflow-x-auto pb-1"}>
      <div
        ref={gridRef}
        className="ms-grid"
        role="grid"
        aria-label={label}
        style={{ gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))`, ...(staged ? {} : { minWidth: w * MIN_CELL, maxWidth: w * MAX_CELL }), "--ms-w": w } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

function Play({ view, session, match: g, slot }: { view: View; session: MinesweeperRoom; match: MsMatch; slot: HTMLElement | null }) {
  const live = isLive(view);
  const player = g.me >= 0;
  // Bàn chỉ cần biết đã lộ chưa — vẽ lại một lần lúc lộ bàn; đồng hồ ván chạy riêng trong <Elapsed>.
  const opened = useReached(g.opensAt);
  const counting = live && !opened;
  const s = g.view;
  const canPlay = live && player && !counting && !s.over && s.alive[g.me];
  const [flagMode, setFlagMode] = useState(false);
  const staged = useStaged();
  const gridRef = useRef<HTMLDivElement>(null);
  const quakeRef = useRef<HTMLDivElement>(null);
  const booms = useMemo(() => s.boom.flatMap((b, c) => (b >= 0 ? [c] : [])), [s.boom]);
  const left = g.mines - booms.length - g.flags.length;
  const big = useCallback((c: number) => s.boom[c] === g.me, [s.boom, g.me]);

  // Hàm ổn định để lưới (memo) không vẽ lại mỗi nhịp đồng hồ.
  const open = useCallback((c: number) => {
    if (session.reveal(c) === "boom") navigator.vibrate?.([90, 50, 140]);
  }, [session]);
  const flag = useCallback((c: number) => session.toggleFlag(c), [session]);

  const out = player && live && !counting && !s.over && !s.alive[g.me];
  const bar = (
    <div
      className={staged ? "card ms-info" : "mx-auto flex w-full flex-wrap items-center gap-2"}
      style={staged ? undefined : { maxWidth: g.layout.w * MAX_CELL }}
      aria-label={staged ? "Thông tin ván" : undefined}
    >
      <span className="chip tabular-nums" title="Số mìn trừ số cờ bạn đã cắm và mìn đã nổ">
        💣 {left}
      </span>
      <Elapsed time={g.time} since={live && !counting ? g.opensAt : undefined} />
      <span className="chip tabular-nums text-ink-2" title="Ô an toàn còn chưa mở">
        ⬜ còn {s.left} ô
      </span>
      {canPlay && (
        <div className={`flex gap-1 ${staged ? "" : "ml-auto"}`} role="group" aria-label="Chế độ bấm">
          <button type="button" className={`btn btn-sm ${!flagMode ? "btn-pen" : ""}`} aria-pressed={!flagMode} onClick={() => setFlagMode(false)}>
            ⛏️ Mở
          </button>
          <button type="button" className={`btn btn-sm ${flagMode ? "btn-coral" : ""}`} aria-pressed={flagMode} onClick={() => setFlagMode(true)}>
            🚩 Cờ
          </button>
        </div>
      )}
      {staged && out && <p className="ms-info-note">{s.fate[g.me] === "left" ? "🚪 Bạn đã bị loại vì mất kết nối" : "💥 Bạn đã đạp mìn — bị loại"}</p>}
    </div>
  );

  return (
    <div className="grid min-w-0 gap-3">
      {staged ? slot && createPortal(bar, slot) : bar}
      <div ref={quakeRef} className={staged ? "relative" : "relative mx-auto w-full min-w-0"} style={staged ? undefined : { maxWidth: g.layout.w * MAX_CELL }}>
        <Board
          state={s}
          layout={g.layout}
          flags={g.flags}
          hide={counting}
          reveal={!live || s.over}
          canPlay={canPlay}
          flagMode={flagMode}
          staged={staged}
          gridRef={gridRef}
          onOpen={open}
          onFlag={flag}
        />
        <MineBlasts booms={booms} grid={gridRef} quake={quakeRef} big={big} />
        {counting && <div className="sd-hush" aria-hidden="true" />}
      </div>
    </div>
  );
}

// Tách riêng để nhịp đồng hồ chỉ vẽ lại ô này.
function Elapsed({ time, since }: { time?: number; since?: number }) {
  const now = useNow(time == null && since !== undefined);
  const elapsed = time ?? (since !== undefined && now ? now - since : 0);
  return (
    <span className="chip tabular-nums" title="Thời gian">
      ⏱ {clock(Math.max(0, elapsed))}
    </span>
  );
}

const Board = memo(function Board({
  state: s,
  layout: lay,
  flags,
  hide,
  reveal,
  canPlay,
  flagMode,
  staged,
  gridRef,
  onOpen,
  onFlag,
}: {
  state: MsState;
  layout: Layout;
  flags: number[];
  hide: boolean;
  reveal: boolean;
  canPlay: boolean;
  flagMode: boolean;
  staged: boolean;
  gridRef: React.Ref<HTMLDivElement>;
  onOpen: (c: number) => void;
  onFlag: (c: number) => void;
}) {
  const flagged = new Set(flags);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (hide || !el || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = Math.max(0, (((lay.start % lay.w) + 0.5) / lay.w) * el.scrollWidth - el.clientWidth / 2);
  }, [hide, lay]);
  const press = useRef<{ c: number; t: ReturnType<typeof setTimeout> | null; fired: boolean }>({ c: -1, t: null, fired: false });
  const cancel = () => {
    if (press.current.t) clearTimeout(press.current.t);
    press.current.t = null;
  };

  const cells = [];
  for (let c = 0; c < lay.w * lay.h; c++) {
    const by = hide ? HIDDEN : s.by[c];
    const boom = hide ? -1 : s.boom[c];
    const flag = !hide && flagged.has(c);
    let cls = "ms-cell";
    let body: React.ReactNode = null;
    let label: string;
    let style: React.CSSProperties | undefined;
    if (boom >= 0) {
      cls += " is-boom";
      body = "💥";
      label = "mìn đã nổ";
      style = { "--ms-who": colorOf(boom) } as React.CSSProperties;
    } else if (by !== HIDDEN) {
      cls += " is-open";
      const n = lay.near[c];
      if (n) body = <span className={`ms-n${n}`}>{n}</span>;
      label = n ? `${n} mìn xung quanh` : "trống";
      if (by !== START) style = { "--ms-who": colorOf(by) } as React.CSSProperties;
      else cls += " is-start";
    } else {
      cls += " is-hidden";
      if (reveal && lay.mine[c]) {
        cls += flag ? " is-flag" : " is-mine";
        body = flag ? "🚩" : "💣";
        label = "mìn";
      } else if (flag) {
        cls += reveal ? " is-wrong" : " is-flag";
        body = "🚩";
        label = reveal ? "cắm cờ nhầm" : "đã cắm cờ";
      } else label = "ô ẩn";
    }
    const active = canPlay && (by === HIDDEN ? boom < 0 : !!lay.near[c]);
    if (active) cls += " is-ok";
    const x = c % lay.w;
    const y = Math.floor(c / lay.w);
    cells.push(
      <button
        key={c}
        type="button"
        role="gridcell"
        className={cls}
        style={style}
        disabled={!active}
        aria-label={`Hàng ${y + 1} cột ${x + 1}: ${label}`}
        onClick={() => {
          if (press.current.fired && press.current.c === c) {
            press.current.fired = false;
            return;
          }
          if (flagMode && by === HIDDEN) onFlag(c);
          else onOpen(c);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (active && by === HIDDEN && !press.current.fired) onFlag(c);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" || !active || by !== HIDDEN) return;
          cancel();
          press.current = {
            c,
            fired: false,
            t: setTimeout(() => {
              press.current.fired = true;
              press.current.t = null;
              onFlag(c);
              navigator.vibrate?.(15);
            }, LONG_PRESS_MS),
          };
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
      >
        {body}
      </button>,
    );
  }
  return (
    <Grid w={lay.w} label={`Bàn dò mìn ${lay.w}×${lay.h}`} staged={staged} scrollRef={scroller} gridRef={gridRef}>
      {cells}
    </Grid>
  );
});

// Chưa có ván nào: mạn bên lúc trình chiếu hiện người đã vào ghế.
function Roster({ view }: { view: View }) {
  const seated = view.seats.filter((s) => !!s?.uid);
  return (
    <section className="card p-4" aria-labelledby="ms-roster-h">
      <h2 id="ms-roster-h" className="font-display text-lg font-extrabold">
        👥 Người chơi
      </h2>
      <p className="text-[12.5px] font-semibold text-ink-3">{seated.length ? `${seated.length} người đã vào ghế` : "Chưa ai vào ghế"}</p>
      {seated.length > 0 && (
        <ol className="sd-score-list mt-3">
          {seated.map((seat, k) => (
            <li key={seat.uid} className="flex min-w-0 items-center gap-2.5">
              {seat.member ? <Avatar p={seat.member} size={34} className={seat.online ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[34px] w-[34px] bg-sunken" />}
              <p className="flex min-w-0 items-center gap-1.5 text-[14px] font-bold">
                <span className="sd-swatch" style={{ background: colorOf(k) }} aria-hidden="true" />
                <span className="min-w-0 truncate">{seat.uid === view.me ? "Bạn" : (seat.member?.name ?? "Ai đó")}</span>
                {seat.uid === view.meta!.host && <span title="Chủ phòng" aria-label="Chủ phòng">👑</span>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// `staged`: bản ở mạn bên lúc trình chiếu — mạn bên tự cuộn khi đông người; màn hình dọc xếp một hàng cuộn ngang.
function Scoreboard({ view, match: g, staged }: { view: View; match: MsMatch; staged?: boolean }) {
  const s = g.state;
  const order = ranking(g);
  const winners = new Set(g.result?.winners ?? []);
  const alive = aliveOf(s).length;
  return (
    <section className={`card ${staged ? "sd-score" : "p-4"}`} aria-labelledby="ms-score-h">
      <h2 id="ms-score-h" className="font-display text-lg font-extrabold">
        🏅 Bảng điểm
      </h2>
      <p className="text-[12.5px] font-semibold text-ink-3">
        {g.lineup.length > 1 ? `${alive}/${g.lineup.length} người còn trụ · ` : ""}mỗi ô an toàn +1
      </p>
      <ol className={staged ? "sd-score-list mt-3" : "mt-3 grid max-h-[480px] grid-cols-1 gap-3 overflow-y-auto pr-1"}>
        {order.map((k, rank) => {
          const seat = g.lineup[k];
          const p = seat.member;
          const out = !s.alive[k];
          return (
            <li key={seat.uid} className={`flex min-w-0 items-center gap-2.5 ${out ? "opacity-60" : ""}`}>
              <span className="sd-rank w-5 shrink-0 text-center text-[13px] font-extrabold text-ink-3">{rank + 1}</span>
              <span className="sd-face relative shrink-0">
                {p ? <Avatar p={p} size={34} className={seat.online && !out ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[34px] w-[34px] bg-sunken" />}
                {(winners.has(seat.uid) || out) && (
                  <span className="absolute -right-2 -bottom-1 text-base" aria-label={out ? "Bị loại" : "Thắng"}>
                    {out ? (s.fate[k] === "left" ? "🚪" : "💥") : "🏆"}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 text-[14px] font-bold">
                  <span className="sd-swatch" style={{ background: colorOf(k) }} aria-hidden="true" />
                  <span className={`min-w-0 truncate ${out ? "line-through" : ""}`}>{seat.uid === view.me ? "Bạn" : (p?.name ?? "Ai đó")}</span>
                </p>
                <p className="text-[11.5px] font-semibold text-ink-3">{out ? (s.fate[k] === "left" ? "Rời ván — bị loại" : "Đạp mìn — bị loại") : "Đang trụ"}</p>
              </div>
              <span className="shrink-0 font-display text-2xl font-extrabold tabular-nums">{s.score[k]}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
