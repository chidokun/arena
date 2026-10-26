"use client";

import { createContext, memo, useContext, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  autoDesign,
  BUDGET_MAX,
  BUDGET_MIN,
  CANVAS,
  CATALOG,
  extentOf,
  COUNTDOWN_MS,
  designCost,
  emptyDesign,
  flowIssues,
  flowPath,
  FLOWS,
  fmt,
  INCIDENTS,
  inspect,
  levelStep,
  linkIssue,
  makeProblem,
  MAX_FLOWS,
  MAX_NODES,
  modeFlows,
  modeIncidents,
  modeKinds,
  MODES,
  NODE,
  neededKinds,
  nodeLabels,
  normProblem,
  pct,
  presetsOf,
  ruleOf,
  SIM,
  simulate,
  SINK_NAMES,
  modeSinks,
  suggestBudget,
  TARGET_MAX,
  TARGET_MIN,
  timeLabel,
  TIMES,
  USERS,
  USERS_ID,
  usersPos,
  type Design,
  type DesignTime,
  type Extent,
  type Flow,
  type FlowKind,
  type Incident,
  type Kind,
  type LevelLoad,
  type Mode,
  type Problem,
  type SimResult,
  type Sink,
  type Standing,
} from "@/lib/games/system-design";
import type { RoomState, RoomView } from "@/lib/net/room";
import { playbackOf, PREP_MS, type SxFinal, type SxMatch, type SxSeat, type SxView, type SystemDesignRoom } from "@/lib/net/system-design-room";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "../ConfirmButton";
import { Dialog } from "../Dialog";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, LoseCine, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel } from "./People";
import { ResultCard, StoppedCard } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout } from "./RoomLayout";
import { SeatButtons, seatMessage, StatusBar, StopButton, TONE } from "./StatusBar";
import { StageArea, StageCtx, useStaged } from "./stage";
import { SxCanvas, type Balloon, type Blast, type Fx, type Heat, type Pan, type Sel } from "./SxCanvas";
import { shallowEqual, useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

type View = Omit<RoomView<SxView>, "chat">;

const CONFETTI = ["🎉", "🏆", "✨", "🏗️", "📈", "⭐"];
const WIN_SCENE_MS = 6500;

function useSxView(session: SystemDesignRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

function useNow(active: boolean, every = 500) {
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

// Đồng hồ chạy từ `from` tới `until` rồi tự dừng (không đếm mãi sau khi phát lại xong).
function useClock(from: number, until: number) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!from) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(id);
    };
    const id = setInterval(tick, 100);
    tick();
    return () => clearInterval(id);
  }, [from, until]);
  return now;
}

// Chỉ vẽ lại đúng một lần lúc vượt mốc (lộ đề), không theo nhịp đồng hồ.
function useReached(at: number | undefined) {
  const [hit, setHit] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (at === undefined) return;
    const t = setTimeout(() => setHit(at), Math.max(0, at - Date.now()));
    return () => clearTimeout(t);
  }, [at]);
  return at !== undefined && hit === at;
}

const isLive = (view: Pick<View, "meta" | "game">) => view.meta!.status === "playing" && view.game?.match?.round === view.meta!.round;

function nameIn(view: Pick<View, "me" | "members" | "game">, uid: string) {
  if (uid === view.me) return "Bạn";
  return view.game?.match?.lineup.find((s) => s.seat.uid === uid)?.seat.member?.name ?? view.members.find((p) => p.uid === uid)?.name ?? "Ai đó";
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const headOf = (r: RoomState) => ({ name: r.meta!.name, status: r.meta!.status, round: r.meta!.round });

export function SystemDesignTable({ id, slug, session }: { id: string; slug: string; session: SystemDesignRoom }) {
  const head = useRoomState(session, headOf, shallowEqual);
  const areaRef = useRef<HTMLDivElement>(null);
  const live = useSxLive(session);
  const chips = useGame(
    session,
    (v) => {
      const p = live && v?.match ? v.match.problem : v!.problem;
      return { mode: p.mode, target: p.target, budget: p.budget, time: p.time };
    },
    shallowEqual,
  );
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <RoomHeader name={head.name} status={head.status} round={head.round} playing="đang thiết kế">
        <ModeChip mode={chips.mode} />
        <span className="chip text-ink-2">🎯 {fmt(chips.target)} TPS</span>
        <span className="chip text-ink-2">💰 Budget {fmt(chips.budget)}</span>
        <span className="chip text-ink-2">⏱ {timeLabel(chips.time)}</span>
      </RoomHeader>
      <ActionPart session={session} />
      <PlaybackHost session={session}>
        {/* Trình chiếu: thanh trạng thái (kèm nút xác nhận đọc đề / bắt đầu…) lên đầu, phần thân cuộn được; lúc chạy tải thì
            bàn chạy tải tự xếp vừa một màn hình. Lúc thiết kế (phóng to) bàn thiết kế lấp cả màn hình, tự mang thanh trạng thái. */}
        <StageArea scroll fit="w-full max-w-[1240px]" head={<HeadPart session={session} />}>
          <div ref={areaRef} className="relative">
            <BodyPart session={session} />
            <FlyersPart session={session} areaRef={areaRef} />
          </div>
        </StageArea>
        <CinemaPart session={session} />
      </PlaybackHost>
    </RoomLayout>
  );
}

// Thân bàn dài hơn một màn hình (đề, sơ đồ, danh mục…): lớp sticker bám theo khung đang nhìn thay vì rải khắp chiều cao,
// để sticker không bay ở đoạn đã cuộn qua. Tách riêng để sticker bay không làm cả bàn vẽ lại.
function FlyersPart({ session, areaRef }: { session: SystemDesignRoom; areaRef: React.RefObject<HTMLDivElement | null> }) {
  const flyers = useFlyers(session, areaRef);
  if (!flyers.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-hidden="true">
      <div className="sticky top-0 h-[min(100svh,100%)]">
        <Flyers flyers={flyers} />
      </div>
    </div>
  );
}

// Mọi người chốt xong: đếm ngược mở màn (`intro`), load test chạy lại từng mức trên sơ đồ (`run`), rồi mới lộ kết quả.
// Kết quả đã tính sẵn — đây chỉ là phần trình diễn, máy nào tự chạy theo đồng hồ của mình.
type Phase = "intro" | "run" | "done";
// `run` đếm số lần phát (0 = lần tự phát khi ván vừa xong, tăng mỗi lần bấm "Chạy lại") để bàn chạy tải và cảnh kết thúc
// diễn lại từ đầu. `who`: lần chạy lại này mở sơ đồ của ai (người được chọn trên bảng xếp hạng).
type Playback = { phase: Phase; level: number; n: number; fresh: boolean; run: number; who?: string; skip: () => void; replay: (who?: string) => void };

const PlaybackCtx = createContext<Playback>({ phase: "done", level: 0, n: 0, fresh: false, run: 0, skip: () => {}, replay: () => {} });

function PlaybackHost({ session, children }: { session: SystemDesignRoom; children: React.ReactNode }) {
  const g = useGame(
    session,
    (v) => (v?.match?.final ? { round: v.match.round, at: v.match.playAt, final: v.match.final } : null),
    (a, b) => a?.round === b?.round && a?.at === b?.at && a?.final === b?.final,
  );
  const round = g?.round ?? 0;
  const [skipped, setSkipped] = useState("");
  const [again, setAgain] = useState<{ round: number; at: number; run: number; who?: string }>({ round: -1, at: 0, run: 0 });
  const timing = g ? playbackOf(g.final) : null;
  const replayed = again.round === round;
  const at = replayed ? again.at : (g?.at ?? 0);
  const run = replayed ? again.run : 0;
  const who = replayed ? again.who : undefined;
  const playing = !!at && !!timing && skipped !== `${round}:${run}`;
  const now = useClock(playing ? at : 0, playing ? at + timing!.total : 0);
  const elapsed = now ? Math.max(0, now - at) : 0;
  const phase: Phase = !playing || elapsed >= timing!.total ? "done" : elapsed < timing!.intro ? "intro" : "run";
  const level = !timing ? 0 : phase === "done" ? timing.levels : phase === "run" ? Math.min(timing.levels, Math.floor((elapsed - timing.intro) / timing.tick) + 1) : 0;
  const n = phase === "intro" ? Math.max(1, Math.ceil((timing!.intro - elapsed) / 1000)) : 0;
  const value = useMemo(
    () => ({
      phase,
      level,
      n,
      fresh: !!at,
      run,
      who,
      skip: () => setSkipped(`${round}:${run}`),
      replay: (who?: string) => {
        setAgain({ round, at: Date.now(), run: run + 1, who });
        scrollTo({ top: 0, behavior: "smooth" });
      },
    }),
    [phase, level, n, at, run, who, round],
  );
  return <PlaybackCtx value={value}>{children}</PlaybackCtx>;
}

function useSxLive(session: SystemDesignRoom) {
  const room = useRoomState(session, (r) => ({ status: r.meta!.status, round: r.meta!.round }), shallowEqual);
  const round = useGame(session, (v) => v?.match?.round);
  return room.status === "playing" && round === room.round;
}

// `extra`: nút đặt trước các nút của thanh trạng thái (bàn thiết kế phóng to gắn chi phí, hoàn tác, chốt thiết kế vào đây).
// `compact`: bàn phóng to — lúc thiết kế / đã chốt chỉ hiện đồng hồ và số người đã chốt thay cho câu hướng dẫn.
const ActionPart = memo(function ActionPart({ session, extra, compact }: { session: SystemDesignRoom; extra?: React.ReactNode; compact?: boolean }) {
  const view = useSxView(session);
  return <ActionBar view={view} session={session} extra={extra} compact={compact} />;
});

// Bàn phóng to (thiết kế / đã chốt) tự đặt thanh trạng thái trong khung của nó.
function HeadPart({ session }: { session: SystemDesignRoom }) {
  const stage = useSxStage(session);
  if (stage === "design" || stage === "locked" || stage === "result") return null;
  return <ActionPart session={session} />;
}

function ActionBar({ view, session, extra, compact }: { view: View; session: SystemDesignRoom; extra?: React.ReactNode; compact?: boolean }) {
  const g = view.game?.match;
  const live = isLive(view);
  const shown = useReached(g?.readAt);
  const opened = useReached(g?.opensAt || undefined);
  if (live && g) {
    const done = g.lineup.filter((s) => s.locked || s.out).length;
    const read = g.lineup.filter((s) => s.read && !s.out).length;
    const n = g.lineup.length;
    const players = g.lineup.filter((s) => !s.out).length;
    let tone: string = TONE.turn;
    let message: React.ReactNode;
    let action: React.ReactNode = null;
    if (!shown) {
      tone = TONE.hot;
      message = <>⏳ Chuẩn bị… đề lộ sau vài giây!</>;
    } else if (!g.opensAt) {
      const mine = g.lineup[g.me];
      if (mine && !mine.read) {
        message = (
          <>
            📖 Đọc kỹ đề rồi bấm xác nhận — bàn thiết kế mở khi mọi người đã đọc xong ({read}/{players}).
          </>
        );
        action = <ReadButton session={session} />;
      } else {
        tone = mine ? TONE.info : TONE.idle;
        message = mine ? <>✅ Bạn đã xác nhận đọc đề. Chờ mọi người đọc xong ({read}/{players})…</> : <>👀 Mọi người đang đọc đề — {read}/{players} đã xác nhận.</>;
      }
    } else if (!opened) {
      tone = TONE.hot;
      message = compact ? <>⏳ Chuẩn bị thiết kế…</> : <>⏳ Mọi người đã đọc đề — chuẩn bị thiết kế!</>;
    } else if (compact && g.me >= 0) {
      tone = g.locked ? TONE.info : tone;
      message = (
        <span className="flex items-center gap-2.5 whitespace-nowrap" title={g.locked ? "Bạn đã chốt thiết kế — chờ mọi người chốt" : "Dựng hệ thống của bạn rồi chốt"}>
          {/* Đồng hồ nổi bật để liếc là thấy; không giới hạn giờ thì chỉ là chữ thường. */}
          <span className={`sx-clock ${g.endsAt ? "" : "is-free"}`} title="Thời gian thiết kế còn lại">
            ⏱ {g.endsAt ? <Countdown until={g.endsAt} /> : "Vô hạn"}
          </span>
          <span>
            {g.locked && "✅ Đã chốt · "}🔒{" "}
            <b className="tabular-nums">
              {done}/{n}
            </b>{" "}
            đã chốt
          </span>
        </span>
      );
    } else if (g.me >= 0 && !g.locked)
      message = (
        <>
          🛠️ Dựng hệ thống của bạn rồi chốt{g.endsAt ? <> — còn <Countdown until={g.endsAt} /></> : ""}. Đã chốt {done}/{n}.
        </>
      );
    else if (g.me >= 0) {
      tone = TONE.info;
      message = (
        <>
          🔒 Bạn đã chốt thiết kế. Chờ mọi người chốt ({done}/{n})
          {g.endsAt ? (
            <>
              {" "}
              · còn <Countdown until={g.endsAt} />
            </>
          ) : (
            "…"
          )}
        </>
      );
    } else {
      tone = TONE.idle;
      message = (
        <>
          👀 Mọi người đang thiết kế — {done}/{n} đã chốt. Thiết kế chỉ lộ khi có kết quả.
        </>
      );
    }
    return (
      <StatusBar tone={tone} message={message}>
        {extra}
        {action}
        {view.isHost && <StopButton onConfirm={() => session.stop()} />}
      </StatusBar>
    );
  }
  const m = view.meta!;
  const blocked = !m.players.length ? "Cần ít nhất một người vào ghế" : !view.seats.some((s) => s.online) ? "Người chơi đang mất kết nối" : "";
  return (
    <StatusBar message={seatMessage(view, { enough: true, startHint: "Bấm “Bắt đầu” khi mọi người sẵn sàng.", join: "Bấm “Vào chơi” để cùng thiết kế hệ thống." })}>
      {extra}
      <SeatButtons view={view} session={session} blocked={blocked} />
    </StatusBar>
  );
}

function ReadButton({ session, big }: { session: SystemDesignRoom; big?: boolean }) {
  return (
    <button type="button" className={`btn btn-lime btn-nudge ${big ? "h-12 px-6 text-base" : ""}`} onClick={() => session.markRead()}>
      ✅ Xác nhận đã đọc kỹ đề
    </button>
  );
}

function Countdown({ until }: { until: number }) {
  const now = useNow(true, 500);
  if (!now) return <b>…</b>;
  const left = until - now;
  return <b className={`tabular-nums ${left < 30000 ? "text-coral" : ""}`}>{clock(left)}</b>;
}

type Stage = "idle" | "read" | "design" | "locked" | "watch" | "result" | "tally" | "stopped";

function useSxStage(session: SystemDesignRoom) {
  const live = useSxLive(session);
  return useGame(session, (v): Stage => {
    const g = v?.match;
    if (!g) return "idle";
    if (live) return g.me < 0 ? "watch" : !g.opensAt ? "read" : g.locked ? "locked" : "design";
    if (g.result?.reason === "stop") return "stopped";
    if (g.final) return "result";
    return g.result ? "tally" : "idle";
  });
}

const BodyPart = memo(function BodyPart({ session }: { session: SystemDesignRoom }) {
  const stage = useSxStage(session);
  const staged = useStaged();
  const round = useGame(session, (v) => v?.match?.round ?? 0);
  const pb = useContext(PlaybackCtx);
  const running = pb.phase !== "done";
  if (stage === "design") return <DesignPart key={round} session={session} />;
  if (stage === "locked" && staged) return <LockedZoomPart key={round} session={session} />;
  if (stage === "read")
    return (
      <>
        <ReadPart session={session} />
        <ProgressPart session={session} />
        <CatalogPart session={session} />
      </>
    );
  if (stage === "result" && running) return <RunPart key={`${round}:${pb.run}`} session={session} />;
  if (stage === "result" && staged) return <ResultZoomPart key={round} session={session} />;
  if (stage === "locked" || stage === "watch")
    return (
      <>
        <MatchProblemPart session={session} />
        <ProgressPart session={session} />
        {stage === "locked" && <MinePart session={session} />}
        <CatalogPart session={session} />
      </>
    );
  return (
    <>
      {stage === "result" && <ResultPart key={round} session={session} />}
      {stage === "tally" && (
        <section className="card mt-4 p-5 text-center font-display text-lg font-extrabold">⚙️ Đang tổng hợp các thiết kế đã chốt…</section>
      )}
      {stage === "stopped" && <StoppedCard round={round} />}
      <NextProblemPart session={session} />
      <CatalogPart session={session} />
    </>
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// Đề bài.

function flowNeeds(f: Flow) {
  const out: string[] = [];
  if (f.gate) out.push("bắt buộc qua API Gateway");
  if (f.cdn) out.push("bắt buộc qua CDN");
  if (f.cache) out.push("bắt buộc đọc qua Cache");
  if (f.acid) out.push("cần giao dịch ACID (chỉ Database)");
  if (f.rag) out.push("bắt buộc truy xuất ngữ cảnh qua Vector DB (RAG)");
  return out;
}

function ModeChip({ mode }: { mode: Mode }) {
  return (
    <span className={`chip ${mode === "expert" ? "sx-mode-expert" : "text-ink-2"}`} title={MODES[mode].text}>
      {MODES[mode].emoji} {MODES[mode].name}
    </span>
  );
}

function ProblemCard({ p, title = "📋 Đề bài", children }: { p: Problem; title?: string; children?: React.ReactNode }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold tracking-wide text-ink-3 uppercase">
            {title} <ModeChip mode={p.mode} />
          </p>
          <h2 className="font-display text-2xl font-extrabold">{p.title}</h2>
        </div>
        {children}
      </div>
      {p.desc && <p className="text-[14.5px] whitespace-pre-line text-ink-2">{p.desc}</p>}
      <p className="rounded-xl bg-lime-soft px-3 py-2.5 text-[14.5px]">
        🎯 Bạn cần dựng hệ thống đáp ứng traffic <b className="tabular-nums">≥ {fmt(p.target)} TPS</b> với budget tối đa{" "}
        <b className="tabular-nums">{fmt(p.budget)}</b>
        {p.time ? (
          <>
            {" "}
            trong vòng <b>{timeLabel(p.time)}</b>.
          </>
        ) : (
          " — không giới hạn thời gian."
        )}
      </p>
      <div>
        <p className="mb-2 text-sm font-bold">Luồng nghiệp vụ</p>
        <ul className="grid gap-2">
          {p.flows.map((f, i) => (
            <li key={i} className="sx-flow">
              <span className="sx-flow-pct">{f.pct}%</span>
              <span className="min-w-0">
                <b>
                  {FLOWS[f.kind].emoji} {f.name}
                </b>{" "}
                <span className="text-ink-3">· {FLOWS[f.kind].name}</span>
                <span className="block text-[13px] text-ink-2">
                  {flowPath(f, p.mode)}
                  {flowNeeds(f).length ? ` · ${flowNeeds(f).join(", ")}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-sm font-bold">Component được dùng</p>
        <div className="flex flex-wrap gap-1.5">
          {p.kinds.map((k) => (
            <span key={k} className="rounded-lg bg-sunken px-2 py-0.5 text-[13px] font-semibold">
              {CATALOG[k].emoji} {CATALOG[k].name}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-bold">Sự cố</p>
        {p.incidents.length ? (
          <ul className="grid gap-1.5 text-[13.5px]">
            {p.incidents.map((k) => (
              <li key={k}>
                {INCIDENTS[k].emoji} <b>{INCIDENTS[k].name}</b> — <span className="text-ink-2">{INCIDENTS[k].text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-ink-2">Không có sự cố.</p>
        )}
      </div>
      <SimRules p={p} />
    </div>
  );
}

const MODE_KEYS = Object.keys(MODES) as Mode[];

// Chọn mode cho đề: đổi mode thì sinh đề ngẫu nhiên mới của mode đó (đề cũ có thể dùng thứ mode kia không có).
function ModePicker({ mode, onPick }: { mode: Mode; onPick: (m: Mode) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Mode">
      {MODE_KEYS.map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} className={`sx-mode ${mode === m ? "is-on" : ""}`} onClick={() => mode !== m && onPick(m)}>
          <b>
            {MODES[m].emoji} {MODES[m].name}
          </b>
          <span>{MODES[m].text}</span>
        </button>
      ))}
    </div>
  );
}

function SimRules({ p }: { p: Problem }) {
  const step = levelStep(p);
  return (
    <p className="rounded-xl bg-sunken p-3 text-[13px] text-ink-2">
      📈 <b>Load test:</b> traffic tăng từ 0, mỗi mức thêm {fmt(step)} TPS (mức {SIM.steps} = traffic mục tiêu) và tiếp tục tăng tới khi hệ thống thất bại. Mỗi
      mức đánh giá {SIM.window} giây{p.incidents.length ? `, sự cố xảy ra từ giây ${SIM.incFrom} tới giây ${SIM.incTo}` : ""}; sau đó ngừng nhận request và Queue có{" "}
      {SIM.drain} giây để xử lý hết tác vụ. Một component quá tải là dừng.
    </p>
  );
}

// `compact`: màn thiết kế — đề thu gọn thành một dòng tóm tắt để nhường chỗ cho sơ đồ, bấm vào mới mở đầy đủ.
const MatchProblemPart = memo(function MatchProblemPart({ session, compact }: { session: SystemDesignRoom; compact?: boolean }) {
  const p = useGame(session, (v) => v?.match?.problem);
  if (!p) return null;
  return (
    <details className={`card mt-4 ${compact ? "px-4 py-2.5 sm:px-5" : "p-4 sm:p-5"}`} open={!compact}>
      <summary className="cursor-pointer">
        <span className="font-display text-lg font-extrabold">📋 Đề bài: {p.title}</span>
        {compact && (
          <span className="mt-1.5 flex flex-wrap gap-1.5 text-[12.5px] font-bold">
            {p.mode === "expert" && <span className="sx-mode-expert rounded-lg px-2 py-0.5">{MODES.expert.emoji} Chuyên gia</span>}
            <span className="rounded-lg bg-lime-soft px-2 py-0.5">🎯 {fmt(p.target)} TPS</span>
            <span className="rounded-lg bg-sun-soft px-2 py-0.5">💰 {fmt(p.budget)}</span>
            {p.flows.map((f, i) => (
              <span key={i} className="rounded-lg bg-sunken px-2 py-0.5">
                {FLOWS[f.kind].emoji} {f.name} {f.pct}%
              </span>
            ))}
            {p.incidents.length > 0 && (
              <span className="rounded-lg bg-coral-soft px-2 py-0.5" title={p.incidents.map((k) => INCIDENTS[k].name).join(", ")}>
                ⚡ {p.incidents.length} sự cố
              </span>
            )}
            <span className="px-1 py-0.5 font-semibold text-ink-3">· bấm để xem đầy đủ</span>
          </span>
        )}
      </summary>
      <div className="mt-3">
        <ProblemCard p={p} title="Đề ván này" />
      </div>
    </details>
  );
});

const NextProblemPart = memo(function NextProblemPart({ session }: { session: SystemDesignRoom }) {
  const p = useGame(session, (v) => v!.problem);
  const host = useRoomState(session, (r) => r.isHost);
  const round = useRoomState(session, (r) => r.meta!.round);
  const [editing, setEditing] = useState(false);
  const label = round ? "📋 Đề ván tới" : "📋 Đề bài";
  const roll = (mode: Mode) => session.setProblem(makeProblem(crypto.getRandomValues(new Uint32Array(1))[0], undefined, p.time, mode));
  return (
    <section className="card mt-4 grid gap-4 p-4 sm:p-5" aria-label="Đề ván tới">
      {host && !editing && <ModePicker mode={p.mode} onPick={roll} />}
      {host && editing ? (
        <ProblemEditor session={session} problem={p} onDone={() => setEditing(false)} />
      ) : (
        <ProblemCard p={p} title={label}>
          {host ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm" onClick={() => roll(p.mode)}>
                🎲 Đề ngẫu nhiên
              </button>
              <button type="button" className="btn btn-sm btn-pen" onClick={() => setEditing(true)}>
                ✏️ Soạn đề
              </button>
            </div>
          ) : (
            <span className="text-[13px] font-semibold text-ink-3">Chủ phòng soạn đề trước mỗi ván.</span>
          )}
        </ProblemCard>
      )}
    </section>
  );
});

type Draft = { mode: Mode; title: string; desc: string; time: DesignTime; target: string; budget: string; kinds: Kind[]; flows: Flow[]; incidents: Incident[] };

const toDraft = (p: Problem): Draft => ({ ...p, target: String(p.target), budget: String(p.budget), flows: p.flows.map((f) => ({ ...f })) });

function draftIssues(d: Draft) {
  const out = flowIssues(d.flows);
  const target = Number(d.target);
  const budget = Number(d.budget);
  if (!Number.isInteger(target) || target < TARGET_MIN || target > TARGET_MAX || target % 100) out.push(`Traffic mục tiêu là bội số của 100, từ ${fmt(TARGET_MIN)} tới ${fmt(TARGET_MAX)} TPS.`);
  if (!Number.isInteger(budget) || budget < BUDGET_MIN || budget > BUDGET_MAX) out.push(`Budget là số nguyên từ ${BUDGET_MIN} tới ${fmt(BUDGET_MAX)}.`);
  if (!d.title.trim()) out.push("Đề cần có tiêu đề.");
  return out;
}

const toProblem = (d: Draft) => normProblem({ ...d, target: Number(d.target), budget: Number(d.budget) });

function ProblemEditor({ session, problem, onDone }: { session: SystemDesignRoom; problem: Problem; onDone: () => void }) {
  const [draft, setDraft] = useState(() => toDraft(problem));
  const [hint, setHint] = useState("");
  const issues = draftIssues(draft);
  const need = neededKinds(draft.flows);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setFlow = (i: number, patch: Partial<Flow>) => set({ flows: draft.flows.map((f, k) => (k === i ? cleanFlow({ ...f, ...patch }) : f)) });
  const valid = !issues.length;
  const next = valid ? toProblem(draft) : null;
  const key = next ? JSON.stringify(next) : "";

  // Đề hợp lệ thì tự lưu (chậm một nhịp để gõ không gửi liên tục).
  useEffect(() => {
    if (!next) return;
    const t = setTimeout(() => session.setProblem(next), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` là dạng chuỗi của `next`
  }, [key, session]);

  const reroll = (preset?: string, mode = draft.mode) => {
    setHint("");
    setDraft(toDraft(makeProblem(crypto.getRandomValues(new Uint32Array(1))[0], preset, draft.time, mode)));
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-extrabold">✏️ Soạn đề</h2>
        <div className="flex flex-wrap gap-2">
          <select className="field !min-h-[34px] !w-auto !py-0 text-sm" value="" onChange={(e) => e.target.value && reroll(e.target.value)} aria-label="Lấy đề mẫu">
            <option value="">📚 Đề mẫu…</option>
            {presetsOf(draft.mode).map((x) => (
              <option key={x.key} value={x.key}>
                {x.title}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm" onClick={() => reroll()}>
            🎲 Tự sinh đề
          </button>
          <button type="button" className="btn btn-sm btn-pen" onClick={onDone} disabled={!valid}>
            ✓ Xong
          </button>
        </div>
      </div>

      <ModePicker mode={draft.mode} onPick={(m) => reroll(undefined, m)} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 sm:col-span-2">
          <span className="text-sm font-bold">Tiêu đề</span>
          <input className="field" value={draft.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="grid gap-1.5 sm:col-span-2">
          <span className="text-sm font-bold">Mô tả (bối cảnh, chức năng, yêu cầu)</span>
          <textarea className="field min-h-[84px]" value={draft.desc} maxLength={600} onChange={(e) => set({ desc: e.target.value })} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-bold">🎯 Traffic mục tiêu (TPS)</span>
          <input className="field tabular-nums" type="number" inputMode="numeric" min={TARGET_MIN} max={TARGET_MAX} step={100} value={draft.target} onChange={(e) => set({ target: e.target.value })} />
        </label>
        <div className="grid gap-1.5">
          <span className="text-sm font-bold">💰 Budget tối đa</span>
          <div className="flex gap-2">
            <input
              className="field min-w-0 flex-1 tabular-nums"
              type="number"
              inputMode="numeric"
              min={BUDGET_MIN}
              max={BUDGET_MAX}
              value={draft.budget}
              aria-label="Budget tối đa"
              onChange={(e) => set({ budget: e.target.value })}
            />
            <button
              type="button"
              className="btn"
              disabled={!valid}
              title="Máy tự dựng một thiết kế đạt mục tiêu rồi cộng thêm 20%"
              onClick={() => {
                const b = next && suggestBudget({ ...next, budget: BUDGET_MAX });
                if (b) {
                  set({ budget: String(b) });
                  setHint(`💡 Máy dựng được thiết kế đạt mục tiêu với chi phí khoảng ${fmt(Math.round(b / 1.2))} — budget gợi ý ${fmt(b)}.`);
                } else setHint("Máy chưa dựng được thiết kế đạt mục tiêu này — thử giảm traffic, bớt sự cố hoặc cho dùng thêm component.");
              }}
            >
              💡 Gợi ý
            </button>
          </div>
        </div>
        {hint && <p className="text-[13px] font-semibold text-ink-2 sm:col-span-2">{hint}</p>}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-bold">⏱ Thời gian thiết kế</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIMES.map((t) => (
            <button key={t} type="button" className={`btn !px-2 ${draft.time === t ? "btn-sun" : ""}`} aria-pressed={draft.time === t} onClick={() => set({ time: t })}>
              {timeLabel(t)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-2 flex w-full items-center justify-between text-sm font-bold">
          <span>Luồng nghiệp vụ</span>
          <span className={`tabular-nums ${draft.flows.reduce((s, f) => s + f.pct, 0) === 100 ? "text-lime" : "text-coral"}`}>
            Tổng {draft.flows.reduce((s, f) => s + f.pct, 0)}%
          </span>
        </legend>
        {draft.flows.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-xl border-2 border-rule p-3">
            <div className="flex flex-wrap gap-2">
              <select className="field !w-auto" value={f.kind} aria-label="Loại request" onChange={(e) => setFlow(i, { kind: e.target.value as FlowKind })}>
                {modeFlows(draft.mode).map((k) => (
                  <option key={k} value={k}>
                    {FLOWS[k].emoji} {FLOWS[k].name}
                  </option>
                ))}
              </select>
              <input className="field min-w-[140px] flex-1" value={f.name} maxLength={40} placeholder={FLOWS[f.kind].name} aria-label="Tên luồng" onChange={(e) => setFlow(i, { name: e.target.value })} />
              <label className="flex items-center gap-1.5 font-bold">
                <input
                  className="field !w-[84px] tabular-nums"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={f.pct || ""}
                  aria-label="Tỷ lệ traffic"
                  onChange={(e) => setFlow(i, { pct: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })}
                />
                %
              </label>
              <button type="button" className="btn btn-ghost !px-3" aria-label="Xoá luồng" disabled={draft.flows.length <= 1} onClick={() => set({ flows: draft.flows.filter((_, k) => k !== i) })}>
                ✕
              </button>
            </div>
            <p className="text-[13px] text-ink-3">
              Đi qua {FLOWS[f.kind].path} — hoàn thành khi {FLOWS[f.kind].done}.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13.5px]">
              {f.kind !== "static" && <Check on={!!f.gate} onChange={(gate) => setFlow(i, { gate })} label="Bắt buộc qua API Gateway" />}
              {f.kind === "static" && <Check on={!!f.cdn} onChange={(cdn) => setFlow(i, { cdn })} label="Bắt buộc qua CDN" />}
              {f.kind === "read" && <Check on={!!f.cache} onChange={(cache) => setFlow(i, { cache })} label="Bắt buộc đọc qua Cache" />}
              {f.kind === "write" && draft.mode === "expert" && <Check on={!!f.acid} onChange={(acid) => setFlow(i, { acid })} label="Cần giao dịch ACID (NoSQL không nhận)" />}
              {(f.kind === "infer" || f.kind === "agent") && <Check on={!!f.rag} onChange={(rag) => setFlow(i, { rag })} label="Bắt buộc RAG (truy xuất qua Vector DB)" />}
              {f.kind === "job" && (
                <label className="flex items-center gap-2">
                  <span className="font-semibold">Worker xử lý xong khi</span>
                  <select className="field !min-h-[32px] !w-auto !py-0 text-sm" value={f.sink ?? ""} onChange={(e) => setFlow(i, { sink: (e.target.value || undefined) as Sink | undefined })}>
                    <option value="">xử lý tại Worker</option>
                    {modeSinks(draft.mode).map((s) => (
                      <option key={s} value={s}>
                        đã {s === "db" ? "ghi vào" : s === "storage" ? "lưu vào" : s === "vector" ? "ghi embedding vào" : "gọi"} {SINK_NAMES[s]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-sm justify-self-start"
          disabled={draft.flows.length >= MAX_FLOWS}
          onClick={() => set({ flows: [...draft.flows, { kind: "read", name: "", pct: Math.max(0, 100 - draft.flows.reduce((s, f) => s + f.pct, 0)) }] })}
        >
          ＋ Thêm luồng
        </button>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-bold">Component được dùng</legend>
        <div className="flex flex-wrap gap-2">
          {modeKinds(draft.mode).map((k) => {
            const locked = need.has(k);
            const on = locked || draft.kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                className={`btn btn-sm ${on ? "btn-lime" : ""}`}
                aria-pressed={on}
                disabled={locked}
                title={locked ? "Luồng nghiệp vụ cần loại này" : undefined}
                onClick={() => set({ kinds: on ? draft.kinds.filter((x) => x !== k) : [...draft.kinds, k] })}
              >
                {CATALOG[k].emoji} {CATALOG[k].name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-bold">Sự cố</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {modeIncidents(draft.mode).map((k) => (
            <label key={k} className={`flex gap-2.5 rounded-xl border-2 p-2.5 text-[13.5px] ${draft.incidents.includes(k) ? "border-pen bg-pen-soft" : "border-rule"}`}>
              <input
                type="checkbox"
                className="mt-1 accent-[var(--pen)]"
                checked={draft.incidents.includes(k)}
                onChange={(e) => set({ incidents: e.target.checked ? [...draft.incidents, k] : draft.incidents.filter((x) => x !== k) })}
              />
              <span>
                <b>
                  {INCIDENTS[k].emoji} {INCIDENTS[k].name}
                </b>
                <span className="block text-ink-2">{INCIDENTS[k].text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {issues.length > 0 ? (
        <ul className="grid gap-1 rounded-xl bg-coral-soft p-3 text-[13.5px] font-semibold">
          {issues.map((x) => (
            <li key={x}>⚠️ {x}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] font-semibold text-ink-3">✓ Đề hợp lệ — đã tự lưu cho ván tới.</p>
      )}
    </div>
  );
}

function cleanFlow(f: Flow): Flow {
  const out: Flow = { kind: f.kind, name: f.name, pct: f.pct };
  if (f.gate && f.kind !== "static") out.gate = true;
  if (f.cdn && f.kind === "static") out.cdn = true;
  if (f.cache && f.kind === "read") out.cache = true;
  if (f.sink && f.kind === "job") out.sink = f.sink;
  if (f.acid && f.kind === "write") out.acid = true;
  if (f.rag && (f.kind === "infer" || f.kind === "agent")) out.rag = true;
  return out;
}

function Check({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 font-semibold">
      <input type="checkbox" className="accent-[var(--pen)]" checked={on} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const CatalogPart = memo(function CatalogPart({ session }: { session: SystemDesignRoom }) {
  const staged = useStaged();
  const live = useSxLive(session);
  const { kinds, mode } = useGame(
    session,
    (v) => {
      const p = live && v?.match ? v.match.problem : v!.problem;
      return { kinds: p.kinds, mode: p.mode };
    },
    shallowEqual,
  );
  if (staged) return null;
  return (
    <details className="card mt-4 p-4 sm:p-5">
      <summary className="cursor-pointer font-display text-lg font-extrabold">🧰 Bảng thông số component</summary>
      <p className="mt-2 text-[13px] text-ink-2">Thông số cố định, như nhau cho mọi người. Tổng chi phí là tổng giá mọi component đã đặt, kể cả cái không nối hay không nhận traffic.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {kinds.map((k) => (
          <KindCard key={k} k={k} mode={mode} />
        ))}
      </div>
    </details>
  );
});

function extra(k: Kind, v: number) {
  const x = CATALOG[k].variants[v];
  if (x.hit !== undefined) return `hit ${pct(x.hit)}`;
  if (x.cap !== undefined) return `chứa ${fmt(x.cap)}`;
  return "";
}

function KindCard({ k, mode }: { k: Kind; mode: Mode }) {
  const info = CATALOG[k];
  return (
    <div className={`sx-kind k-${k}`}>
      <p className="font-bold">
        {info.emoji} {info.name} <span className="text-[13px] font-semibold text-ink-3">· {info.role}</span>
      </p>
      <table className="mt-1.5 w-full text-[13px] tabular-nums">
        <tbody>
          {info.variants.map((x, v) => (
            <tr key={x.name}>
              <td className="py-0.5 font-semibold">{x.name}</td>
              <td className="text-right">{fmt(x.tps)} TPS</td>
              <td className="text-right text-ink-2">{extra(k, v)}</td>
              <td className="text-right font-bold">${x.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[12.5px] text-ink-2">{ruleOf(k, mode)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Thiết kế.

const COLUMN: Record<Kind, number> = {
  waf: 168,
  lb: 168,
  gateway: 168,
  cdn: 168,
  app: 320,
  agent: 320,
  cache: 472,
  queue: 472,
  search: 472,
  semcache: 472,
  db: 624,
  nosql: 624,
  worker: 624,
  vector: 624,
  replica: 776,
  standby: 776,
  storage: 776,
  external: 776,
  llm: 776,
  gpu: 776,
};

function freeSpot(d: Design, k: Kind) {
  const taken = (x: number, y: number) => [usersPos(d), ...d.nodes].some((n) => Math.abs(n.x - x) < NODE.w + 8 && Math.abs(n.y - y) < NODE.h + 8);
  const xs = [COLUMN[k], COLUMN[k] + 152, COLUMN[k] - 152, COLUMN[k] + 304, COLUMN[k] - 304].filter((x) => x >= 152 && x <= CANVAS.w - NODE.w);
  for (const x of xs) for (let y = 24; y <= CANVAS.h - NODE.h; y += 16) if (!taken(x, y)) return { x, y };
  return { x: COLUMN[k], y: (CANVAS.h - NODE.h) / 2 };
}

const nextId = (d: Design) => d.nodes.reduce((m, n) => Math.max(m, n.id), 0) + 1;

// Chỉ lấy đề và mốc lộ đề: bản nháp của mình lưu lên mạng cũng làm store đổi, không cần vẽ lại cả sơ đồ theo.
const DesignPart = memo(function DesignPart({ session }: { session: SystemDesignRoom }) {
  const g = useGame(session, (v) => (v?.match ? { p: v.match.problem, opensAt: v.match.opensAt } : null), (a, b) => a?.p === b?.p && a?.opensAt === b?.opensAt);
  // Phóng to: đề thu vào cột nổi trên bàn. Giữ nguyên chỗ của `Designer` trong cây để bật / tắt không mất bản nháp đang kéo.
  const zoomed = useStaged();
  if (!g) return null;
  return (
    <>
      {!zoomed && <MatchProblemPart session={session} compact />}
      <Designer session={session} p={g.p} opensAt={g.opensAt} />
      <CatalogPart session={session} />
    </>
  );
});

function Designer({ session, p, opensAt }: { session: SystemDesignRoom; p: Problem; opensAt: number }) {
  const opened = useReached(opensAt);
  const stage = useContext(StageCtx);
  // Vào vòng thiết kế là phóng to luôn (mỗi ván một lần: `Designer` dựng lại theo ván); thoát ra thì thôi, không ép lại.
  const enter = stage?.enter;
  useEffect(() => enter?.(), [enter]);
  const [design, setDesign] = useState<Design>(() => session.myDesign());
  const [sel, setSel] = useState<Sel>(null);
  const [past, setPast] = useState<Design[]>([]);
  const base = useRef<Design | null>(null);
  const report = useMemo(() => inspect(p, design), [p, design]);
  const labels = useMemo(() => nodeLabels(design), [design]);
  // Phóng to: thông số nằm cuối cột nổi, chọn component thì cuộn tới cho thấy.
  const spec = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sel) spec.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sel]);

  const change = (d: Design, commit: boolean) => {
    if (!commit) base.current ??= design;
    else {
      const prev = base.current ?? design;
      base.current = null;
      if (prev !== d) setPast((h) => [...h.slice(-49), prev]);
    }
    setDesign(d);
    session.edit(d);
  };

  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setSel(null);
    setDesign(prev);
    session.edit(prev);
  };

  const undoRef = useRef(undo);
  useEffect(() => {
    undoRef.current = undo;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const add = (k: Kind) => {
    if (design.nodes.length >= MAX_NODES) return;
    const id = nextId(design);
    change({ ...design, nodes: [...design.nodes, { id, k, v: 0, ...freeSpot(design, k) }] }, true);
    setSel({ node: id });
  };
  const remove = () => {
    if (!sel) return;
    if ("node" in sel) {
      if (sel.node === USERS_ID) return;
      change({ ...design, nodes: design.nodes.filter((n) => n.id !== sel.node), edges: design.edges.filter(([a, b]) => a !== sel.node && b !== sel.node) }, true);
    } else change({ ...design, edges: design.edges.filter(([a, b]) => a !== sel.edge[0] || b !== sel.edge[1]) }, true);
    setSel(null);
  };
  const clone = (id: number) => {
    const n = design.nodes.find((x) => x.id === id);
    if (!n || design.nodes.length >= MAX_NODES) return;
    const copy = { ...n, id: nextId(design), ...freeSpot(design, n.k) };
    const d: Design = { ...design, nodes: [...design.nodes, copy], edges: [...design.edges] };
    for (const [a, b] of design.edges) {
      if (b === id && !linkIssue(d, a, copy.id)) d.edges.push([a, copy.id]);
      if (a === id && !linkIssue(d, copy.id, b)) d.edges.push([copy.id, b]);
    }
    change(d, true);
    setSel({ node: copy.id });
  };

  const over = report.cost > p.budget;
  const cost = (
    <span className={`sx-cost ${over ? "is-over" : ""}`} title="Tổng chi phí / budget tối đa">
      💰 <b className="tabular-nums">{fmt(report.cost)}</b> / {fmt(p.budget)}
      <span className="sx-cost-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (report.cost / p.budget) * 100)}%` }} />
      </span>
    </span>
  );
  const count = (
    <span className="text-[13px] font-semibold text-ink-3 tabular-nums">
      {design.nodes.length}/{MAX_NODES} component
    </span>
  );
  const tools = (
    <>
      <button type="button" className="btn btn-sm" onClick={undo} disabled={!past.length} title="Hoàn tác (Ctrl/⌘ + Z)">
        ↶ Hoàn tác
      </button>
      <ConfirmButton
        className="btn btn-sm btn-ghost"
        onConfirm={() => {
          change({ nodes: [], edges: [] }, true);
          setSel(null);
        }}
        confirmLabel="Bấm lần nữa để xoá hết"
      >
        🧹 Xoá hết
      </ConfirmButton>
      <ConfirmButton
        className="btn btn-sm btn-pen"
        onConfirm={() => {
          session.edit(design);
          session.lock();
        }}
        confirmLabel={report.ok ? "Bấm lần nữa để chốt — không sửa được nữa" : "Thiết kế chưa hợp lệ — vẫn chốt?"}
      >
        🔒 Chốt thiết kế
      </ConfirmButton>
    </>
  );
  const palette = p.kinds.map((k) => (
    <button key={k} type="button" className={`sx-add flex-none k-${k}`} disabled={!opened || design.nodes.length >= MAX_NODES} onClick={() => add(k)} title={CATALOG[k].role}>
      <span aria-hidden="true">{CATALOG[k].emoji}</span> {CATALOG[k].short}
      <small>từ ${CATALOG[k].variants[0].price}</small>
    </button>
  ));
  const canvas = (view?: Pan) => (
    <SxCanvas
      design={design}
      label="Sơ đồ hệ thống — kéo để di chuyển, kéo từ chấm tròn để nối"
      marks={report.errors.flatMap((e) => e.nodes?.slice(-1) ?? [])}
      edit={opened ? { onChange: change, onDelete: remove, sel, onSel: setSel } : undefined}
      view={view}
    />
  );
  const zoomed = !!stage?.on;
  const inspector = <Inspector mode={p.mode} design={design} labels={labels} sel={sel} onSel={setSel} change={change} remove={remove} clone={clone} fold={zoomed} />;
  const checklist = <Checklist p={p} report={report} fold={zoomed} />;

  // Phóng to: sơ đồ lấp màn hình; trên cùng là hướng dẫn và nút chốt, cột nổi góc phải gồm kiểm tra đường đi, danh sách
  // component rồi thông số component đang chọn.
  if (zoomed)
    return (
      <ZoomFrame
        top={
          <ActionPart
            session={session}
            compact
            extra={
              <>
                <ProblemButton p={p} />
                {cost}
                {tools}
              </>
            }
          />
        }
        side={
          <>
            {checklist}
            <Panel
              title={
                <>
                  🧰 Thêm component{" "}
                  <span className="text-[13px] font-semibold text-ink-3 tabular-nums">
                    · {design.nodes.length}/{MAX_NODES}
                  </span>
                </>
              }
              fold
            >
              <div className="mt-2 flex flex-wrap gap-2" role="toolbar" aria-label="Thêm component">
                {palette}
              </div>
            </Panel>
            <div ref={spec}>{inspector}</div>
          </>
        }
        extent={extentOf(design)}
        canvas={canvas}
      />
    );

  return (
    <section className="card mt-4 grid gap-4 p-4 sm:p-5" aria-label="Thiết kế của bạn">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-extrabold">🏗️ Thiết kế của bạn</h2>
        {cost}
        {count}
        <div className="ml-auto flex flex-wrap gap-2">
          {stage && (
            <button type="button" className="btn btn-sm" onClick={stage.enter} title="Mở bàn thiết kế tràn màn hình">
              ⛶ Phóng to
            </button>
          )}
          {tools}
        </div>
      </div>

      {/* Màn hẹp: một hàng cuộn ngang để sơ đồ không bị đẩy xuống quá xa. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pt-0.5 pb-1.5 sm:flex-wrap sm:overflow-visible" role="toolbar" aria-label="Thêm component">
        {palette}
      </div>

      <div className="sx-canvas-wrap">{canvas()}</div>

      <div className="grid gap-4 md:grid-cols-2">
        {inspector}
        {checklist}
      </div>
    </section>
  );
}

// Bàn phóng to (trong trình chiếu): sơ đồ phủ kín màn hình, thanh trạng thái và cột bảng (góc phải) nổi đè lên trên; từng
// bảng trong cột tự thu gọn được.
// Khung nhìn dời / thu phóng được: kéo nền để dời, lăn chuột (hoặc vuốt hai ngón) để dời, Ctrl/⌘ + lăn (hoặc chụm hai ngón
// trên touchpad) để thu phóng. Chưa động tới thì khung nhìn tự vừa khung vẽ vào phần không bị thanh / cột che.
type Cam = { x: number; y: number; s: number };
type Room = { w: number; h: number; top: number; right: number };

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3;
const ZOOM_STEP = 1.25;
// Chừa bấy nhiêu px của khung vẽ trong màn hình để không dời mất sơ đồ.
const KEEP_PX = 80;

const clampZoom = (s: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s));

function fitCam(r: Room, e: Extent): Cam {
  const pad = 20;
  const left = pad;
  const top = r.top + pad;
  // Chừa đáy cho thanh thu phóng.
  const w = Math.max(80, r.w - left - r.right - pad);
  const h = Math.max(80, r.h - top - 64);
  const s = clampZoom(Math.min(w / e.w, h / e.h));
  return { s, x: e.x - (left + (w - e.w * s) / 2) / s, y: e.y - (top + (h - e.h * s) / 2) / s };
}

// Không dời mất cả sơ đồ ra ngoài màn hình.
function keepCam(c: Cam, r: Room, e: Extent): Cam {
  const k = KEEP_PX / c.s;
  return { s: c.s, x: Math.min(e.x + e.w - k, Math.max(e.x + k - r.w / c.s, c.x)), y: Math.min(e.y + e.h - k, Math.max(e.y + k - r.h / c.s, c.y)) };
}

// `extent`: khung bao sơ đồ. Vừa khung theo khung bao lúc mở (hoặc lúc bấm vừa khung), không theo từng lần kéo component.
// `fitKey`: đổi (vd. đổi sang xem sơ đồ người khác) thì vừa khung lại theo sơ đồ mới.
function ZoomFrame({
  top,
  side,
  extent,
  fitKey,
  canvas,
}: {
  top: React.ReactNode;
  side: React.ReactNode;
  extent: Extent;
  fitKey?: string;
  canvas: (view: Pan) => React.ReactNode;
}) {
  const [base, setBase] = useState(extent);
  const [fitFor, setFitFor] = useState(fitKey);
  const board = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<Room>({ w: 0, h: 0, top: 0, right: 0 });
  // `null`: vừa khung (chưa dời / thu phóng, hoặc vừa bấm vừa khung).
  const [cam, setCam] = useState<Cam | null>(null);
  if (fitKey !== fitFor) {
    setFitFor(fitKey);
    setBase(extent);
    setCam(null);
  }

  // Đo bàn và phần bị thanh trạng thái / cột bảng che (cột chỉ tính bề ngang, và chỉ khi không che quá nửa bàn).
  useLayoutEffect(() => {
    const el = board.current;
    if (!el) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const t = topRef.current?.getBoundingClientRect();
      const sd = sideRef.current?.getBoundingClientRect();
      const right = sd && sd.width < b.width / 2 ? b.right - sd.left : 0;
      const next = { w: b.width, h: b.height, top: t ? t.bottom - b.top : 0, right };
      setRoom((r) => (r.w === next.w && r.h === next.h && r.top === next.top && r.right === next.right ? r : next));
    };
    const ro = new ResizeObserver(measure);
    for (const x of [el, topRef.current, sideRef.current]) if (x) ro.observe(x);
    return () => ro.disconnect();
  }, []);

  const c = cam ?? fitCam(room, base);
  // Nhiều lần lăn / kéo có thể tới trước khi React kịp vẽ lại: luôn cộng dồn trên giá trị mới nhất.
  const update = (fn: (c: Cam) => Cam) => setCam((prev) => keepCam(fn(prev ?? fitCam(room, base)), room, extent));
  const zoomAt = (f: number, ax = room.w / 2, ay = room.h / 2) =>
    update((c) => {
      const s = clampZoom(c.s * f);
      return { s, x: c.x + ax / c.s - ax / s, y: c.y + ay / c.s - ay / s };
    });

  const onWheel = useEffectEvent((e: WheelEvent) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? room.h : 1;
    const r = board.current!.getBoundingClientRect();
    // Một nấc lăn chuột (~100px) ≈ ×1.22; chụm touchpad gửi nhiều nhịp nhỏ nên vẫn mượt.
    const dz = Math.max(-50, Math.min(50, e.deltaY * unit));
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-dz * 0.004), e.clientX - r.left, e.clientY - r.top);
    else update((c) => ({ ...c, x: c.x + (e.deltaX * unit) / c.s, y: c.y + (e.deltaY * unit) / c.s }));
  });
  // Lắng nghe không thụ động để chặn trang tự cuộn / trình duyệt tự phóng to khi chụm touchpad.
  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const fn = (e: WheelEvent) => onWheel(e);
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, []);

  const view: Pan = {
    box: room.w ? `${c.x} ${c.y} ${room.w / c.s} ${room.h / c.s}` : `0 0 ${CANVAS.w} ${CANVAS.h}`,
    onPan: (dx, dy) => update((c) => ({ ...c, x: c.x - dx / c.s, y: c.y - dy / c.s })),
  };

  return (
    <section className="sx-zoom" aria-label="Bàn thiết kế phóng to">
      <div ref={board} className="sx-zoom-board">
        {canvas(view)}
      </div>
      <div className="sx-zoom-ui">
        <div ref={topRef} className="sx-zoom-top">
          {top}
        </div>
        <div ref={sideRef} className="sx-zoom-side">
          {side}
        </div>
      </div>
      <div className="sx-zoom-ctl" role="toolbar" aria-label="Thu phóng sơ đồ" title="Kéo nền để dời sơ đồ · Ctrl/⌘ + lăn chuột để thu phóng">
        <button type="button" className="btn btn-sm" onClick={() => zoomAt(1 / ZOOM_STEP)} disabled={c.s <= ZOOM_MIN} aria-label="Thu nhỏ">
          −
        </button>
        <span className="sx-zoom-pct tabular-nums">{Math.round(c.s * 100)}%</span>
        <button type="button" className="btn btn-sm" onClick={() => zoomAt(ZOOM_STEP)} disabled={c.s >= ZOOM_MAX} aria-label="Phóng to sơ đồ">
          ＋
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            setBase(extent);
            setCam(null);
          }}
        >
          ⤢ Vừa khung
        </button>
      </div>
    </section>
  );
}

// Bảng có tiêu đề; `fold`: bấm tiêu đề để thu gọn / mở (cột nổi của bàn phóng to). `body`: class của phần thân.
// Màn hẹp thì cột bảng đè gần hết sơ đồ nên bảng mở ra ở dạng thu gọn (chỉ dựng ở máy, không có ở bản dựng sẵn).
function Panel({ title, fold, body, className = "", children }: { title: React.ReactNode; fold?: boolean; body?: string; className?: string; children: React.ReactNode }) {
  const [wide] = useState(() => typeof matchMedia === "undefined" || matchMedia("(min-width: 760px)").matches);
  const inner = <div className={body}>{children}</div>;
  if (fold)
    return (
      <details open={wide} className={`sx-panel sx-fold ${className}`}>
        <summary className="font-bold">
          <span className="min-w-0">{title}</span>
        </summary>
        {inner}
      </details>
    );
  return (
    <div className={`sx-panel ${className}`}>
      <p className="font-bold">{title}</p>
      {inner}
    </div>
  );
}

function Inspector({
  mode,
  design,
  labels,
  sel,
  onSel,
  change,
  remove,
  clone,
  fold,
}: {
  mode: Mode;
  design: Design;
  labels: Map<number, string>;
  sel: Sel;
  onSel: (s: Sel) => void;
  change: (d: Design, commit: boolean) => void;
  remove: () => void;
  clone: (id: number) => void;
  fold?: boolean;
}) {
  if (!sel)
    return (
      <Panel title="🧭 Cách dựng" fold={fold}>
        <ul className="mt-1.5 grid list-disc gap-1 pl-5 text-[13.5px] text-ink-2">
          <li>Bấm component ở thanh trên để đặt, kéo để xếp chỗ.</li>
          <li>Kéo từ chấm tròn bên phải một component sang component khác để nối — hoặc chạm chấm rồi chạm đích. Ô viền xanh là đích nối được.</li>
          <li>Chọn component để đổi variant, nhân bản, nối nhanh hoặc xoá. Chọn đường nối để xoá.</li>
          <li>
            {mode === "expert"
              ? "Đường nét đứt tím là nhân bản / đồng bộ dữ liệu: Database → Read Replica / Standby, Database / NoSQL → Search Index."
              : "Đường nét đứt tím là nhân bản Database → Read Replica."}
          </li>
        </ul>
      </Panel>
    );
  if ("edge" in sel) {
    const [a, b] = sel.edge;
    return (
      <Panel
        title={
          <>
            🔗 {labels.get(a)} → {labels.get(b)}
          </>
        }
        fold={fold}
      >
        <button type="button" className="btn btn-sm btn-coral mt-3" onClick={remove}>
          ✕ Xoá đường nối
        </button>
      </Panel>
    );
  }
  const id = sel.node;
  const n = design.nodes.find((x) => x.id === id);
  const info = n ? CATALOG[n.k] : USERS;
  const reach = design.nodes.filter((x) => !linkIssue(design, id, x.id));
  const outs = design.edges.filter(([a]) => a === id);
  const ins = design.edges.filter(([, b]) => b === id);
  const unlink = (a: number, b: number) => change({ ...design, edges: design.edges.filter(([x, y]) => x !== a || y !== b) }, true);
  return (
    <Panel
      title={
        <>
          {info.emoji} {labels.get(id)} <span className="text-[13px] font-semibold text-ink-3">· {n ? CATALOG[n.k].name : USERS.role}</span>
        </>
      }
      fold={fold}
      body="mt-1 grid content-start gap-3"
    >
      {n && <p className="text-[12.5px] text-ink-2">{ruleOf(n.k, mode)}</p>}
      {n && (
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Variant">
          {CATALOG[n.k].variants.map((x, v) => (
            <button
              key={x.name}
              type="button"
              role="radio"
              aria-checked={n.v === v}
              className={`sx-variant ${n.v === v ? "is-on" : ""}`}
              onClick={() => change({ ...design, nodes: design.nodes.map((y) => (y.id === id ? { ...y, v } : y)) }, true)}
            >
              <b>{x.name}</b>
              <span>{fmt(x.tps)} TPS</span>
              {extra(n.k, v) && <span>{extra(n.k, v)}</span>}
              <span className="font-bold">${x.price}</span>
            </button>
          ))}
        </div>
      )}
      {(outs.length > 0 || ins.length > 0) && (
        <div className="grid gap-1.5 text-[13px]">
          {outs.length > 0 && <Links title="Đi tới" items={outs.map(([, b]) => ({ id: b, label: labels.get(b)!, drop: () => unlink(id, b) }))} />}
          {ins.length > 0 && <Links title="Nhận từ" items={ins.map(([a]) => ({ id: a, label: labels.get(a)!, drop: () => unlink(a, id) }))} />}
        </div>
      )}
      {reach.length > 0 && (
        <div>
          <p className="mb-1.5 text-[13px] font-bold">Nối nhanh tới</p>
          <div className="flex flex-wrap gap-1.5">
            {reach.map((x) => (
              <button
                key={x.id}
                type="button"
                className="btn btn-sm !min-h-[30px] !px-2.5"
                onClick={() => {
                  change({ ...design, edges: [...design.edges, [id, x.id]] }, true);
                  onSel({ node: id });
                }}
              >
                ＋ {labels.get(x.id)}
              </button>
            ))}
          </div>
        </div>
      )}
      {n && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" onClick={() => clone(id)} disabled={design.nodes.length >= MAX_NODES}>
            ⧉ Nhân bản
          </button>
          <button type="button" className="btn btn-sm btn-coral" onClick={remove}>
            🗑 Xoá
          </button>
        </div>
      )}
    </Panel>
  );
}

function Links({ title, items }: { title: string; items: { id: number; label: string; drop: () => void }[] }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5">
      <span className="font-bold">{title}:</span>
      {items.map((x) => (
        <span key={x.id} className="inline-flex items-center gap-1 rounded-lg bg-sunken py-0.5 pr-1 pl-2 font-semibold">
          {x.label}
          <button type="button" className="rounded px-1 text-ink-3 hover:text-coral" aria-label={`Bỏ nối ${x.label}`} onClick={x.drop}>
            ✕
          </button>
        </span>
      ))}
    </p>
  );
}

function Checklist({ p, report, fold }: { p: Problem; report: ReturnType<typeof inspect>; fold?: boolean }) {
  const bad = new Map(report.errors.filter((e) => e.flow !== undefined).map((e) => [e.flow!, e]));
  const loose = report.errors.filter((e) => e.flow === undefined);
  // Thu gọn vẫn thấy ngay đường đi đã ổn chưa.
  const ok = !report.errors.length;
  return (
    <Panel
      title={
        <>
          ✅ Kiểm tra đường đi{" "}
          <span className={`text-[13px] font-semibold ${ok ? "text-ink-3" : "text-coral"}`}>
            · {ok ? "ổn" : `${p.flows.filter((_, i) => bad.has(i) || loose.length).length} luồng lỗi`}
          </span>
        </>
      }
      fold={fold}
    >
      <ul className="mt-2 grid gap-1.5 text-[13.5px]">
        {loose.map((e) => (
          <li key={e.text} className="text-coral">
            ⛔ {e.text}
          </li>
        ))}
        {p.flows.map((f, i) => {
          const e = bad.get(i);
          return (
            <li key={i} className={e ? "" : "text-ink-2"}>
              {e || loose.length ? "❌" : "✔️"} <b>{f.name}</b> <span className="text-ink-3">({f.pct}%)</span>
              {e && <span className="block pl-6 text-[12.5px] text-coral">{e.text}</span>}
            </li>
          );
        })}
        {report.idle.map((e) => (
          <li key={e.text} className="text-[12.5px] text-ink-3">
            💤 {e.text}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-ink-3">Chỉ kiểm tra đường đi — không được chạy thử tải trước khi chốt.</p>
    </Panel>
  );
}

const MinePart = memo(function MinePart({ session }: { session: SystemDesignRoom }) {
  const round = useGame(session, (v) => v?.match?.round ?? 0);
  const p = useGame(session, (v) => v?.match?.problem);
  const design = useMemo(() => (round ? session.myDesign() : null), [session, round]);
  if (!design || !p) return null;
  return (
    <section className="card mt-4 grid gap-3 p-4 sm:p-5" aria-label="Thiết kế bạn đã chốt">
      <h2 className="font-display text-xl font-extrabold">🔒 Thiết kế bạn đã chốt</h2>
      <p className="text-[13.5px] text-ink-2">
        💰 Chi phí {fmt(designCost(design))} / {fmt(p.budget)} · {design.nodes.length} component. Kết quả load test có khi mọi người đã chốt.
      </p>
      <div className="sx-canvas-wrap">
        <SxCanvas design={design} label="Thiết kế đã chốt" />
      </div>
    </section>
  );
});

// Bàn phóng to: đề bài là một nút trên thanh trạng thái, bấm thì hiện đề đầy đủ ở giữa màn hình. Esc chỉ đóng đề, không
// thoát trình chiếu (trình chiếu nghe Esc ở `window`).
function ProblemButton({ p }: { p: Problem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        📋 Đề bài
      </button>
      <div className="contents" onKeyDown={(e) => e.key === "Escape" && e.stopPropagation()}>
        <Dialog open={open} onClose={() => setOpen(false)} title="📋 Đề bài" className="is-wide">
          <ProblemCard p={p} title="Đề ván này" />
        </Dialog>
      </div>
    </>
  );
}

// Đã chốt lúc đang phóng to: vẫn ở trên bàn, sơ đồ đã chốt lấp màn hình, cột nổi là tiến độ mọi người và đề.
const LockedZoomPart = memo(function LockedZoomPart({ session }: { session: SystemDesignRoom }) {
  const design = useMemo(() => session.myDesign(), [session]);
  const p = useGame(session, (v) => v?.match?.problem);
  return (
    <ZoomFrame
      top={<ActionPart session={session} compact extra={p && <ProblemButton p={p} />} />}
      side={<ProgressPart session={session} />}
      extent={extentOf(design)}
      canvas={(view) => <SxCanvas design={design} view={view} label="Thiết kế đã chốt" />}
    />
  );
});

// Bước đọc đề: màn hình chỉ có đề và nút xác nhận; mọi người xác nhận xong mới mở bàn thiết kế.
const ReadPart = memo(function ReadPart({ session }: { session: SystemDesignRoom }) {
  const g = useGame(session, (v) => v?.match);
  const shown = useReached(g?.readAt);
  if (!g) return null;
  const mine = g.lineup[g.me];
  const players = g.lineup.filter((s) => !s.out);
  const read = players.filter((s) => s.read).length;
  return (
    <section className="card mt-4 grid gap-4 p-4 sm:p-5" aria-label="Đọc đề">
      <ProblemCard p={g.problem} title="📋 Đề ván này — đọc kỹ trước khi thiết kế" />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sunken p-3 sm:p-4">
        <p className="text-[14px] font-semibold text-ink-2">
          {mine?.read ? "✅ Bạn đã xác nhận — chờ mọi người đọc xong." : "Đọc xong đề, luồng nghiệp vụ, sự cố và luật chạy tải thì xác nhận."}{" "}
          <b className="text-ink tabular-nums">
            {read}/{players.length}
          </b>{" "}
          người đã đọc kỹ đề.
        </p>
        {mine && !mine.read && shown && <ReadButton session={session} big />}
      </div>
    </section>
  );
});

const ProgressPart = memo(function ProgressPart({ session }: { session: SystemDesignRoom }) {
  const view = useSxView(session);
  const g = view.game?.match;
  if (!g) return null;
  const reading = !g.opensAt;
  const status = (s: SxSeat) =>
    s.out
      ? { text: "🚪 Bị loại", cls: "bg-coral-soft" }
      : reading
        ? s.read
          ? { text: "✅ Đã đọc kỹ đề", cls: "bg-lime-soft" }
          : { text: "📖 Đang đọc đề", cls: "bg-sunken" }
        : s.locked
          ? { text: "🔒 Đã chốt", cls: "bg-lime-soft" }
          : { text: "✏️ Đang thiết kế", cls: "bg-sunken" };
  return (
    <section className="card mt-4 p-4 sm:p-5" aria-label="Tiến độ">
      <h2 className="font-display text-lg font-extrabold">👥 Người chơi {reading ? "đọc đề" : "thiết kế"}</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {g.lineup.map((s) => (
          <li key={s.seat.uid} className="flex min-w-0 items-center gap-2.5">
            {s.seat.member ? <Avatar p={s.seat.member} size={30} className={s.seat.online ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[30px] w-[30px] bg-sunken" />}
            <b className="min-w-0 flex-1 truncate text-[14px]">{nameIn(view, s.seat.uid)}</b>
            <span className={`rounded-lg px-2 py-0.5 text-[12.5px] font-bold ${status(s).cls}`}>{status(s).text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// Kết quả.

const STATUS: Record<Standing["status"], { label: string; cls: string }> = {
  pass: { label: "✅ Đạt", cls: "bg-lime-soft" },
  fail: { label: "❌ Không đạt", cls: "bg-coral-soft" },
  invalid: { label: "⛔ Không hợp lệ", cls: "bg-sunken" },
  out: { label: "🚪 Bị loại", cls: "bg-sunken" },
};

function stopText(r: Pick<Standing, "status" | "sim">) {
  const s = r.sim;
  if (r.status === "out") return "Mất kết nối hoặc vi phạm giữa ván.";
  if (!s) return "";
  if (!s.valid) return s.errors[0]?.text ?? "Thiết kế không hợp lệ.";
  if (s.capped) return `Vượt mức tải tối đa của kịch bản (${fmt(s.maxTps)} TPS) mà chưa thất bại.`;
  if (!s.fail) return "";
  return `Thất bại ở mức ${s.fail.level} (${fmt(s.fail.tps)} TPS), giây ${s.fail.t}: ${s.fail.text}`;
}

const ResultPart = memo(function ResultPart({ session }: { session: SystemDesignRoom }) {
  const view = useSxView(session);
  const g = view.game?.match;
  if (!g?.final) return null;
  return <Results view={view} match={g} final={g.final} />;
});

// Kết luận ván (tiêu đề + dòng phụ của thẻ kết quả).
function verdictOf(view: View, final: SxFinal, p: Problem) {
  const winners = final.rows.filter((r) => r.rank === 1);
  const iWon = winners.some((r) => r.uid === view.me);
  const names = winners.map((r) => nameIn(view, r.uid)).join(", ");
  const top = winners[0];
  return {
    title: !winners.length ? "🤷 Không ai vượt quality gate" : winners.length > 1 ? (iWon ? "🤝 Bạn đồng hạng nhất!" : `🤝 ${names} đồng hạng nhất!`) : iWon ? "🏆 Bạn chiến thắng!" : `🏆 ${names} chiến thắng!`,
    sub: top
      ? `${fmt(top.tps)} TPS · chi phí ${fmt(top.cost)} — vượt mục tiêu ${fmt(p.target)} TPS trong budget ${fmt(p.budget)}.`
      : `Cần đạt ít nhất ${fmt(p.target)} TPS với chi phí không quá ${fmt(p.budget)}.`,
  };
}

// Mặc định xem thiết kế của mình, không có thì của người đứng đầu, không ai có thì của máy tham khảo.
const firstPick = (view: View, final: SxFinal) =>
  final.designs[view.me] ? view.me : (final.rows.find((r) => r.rank === 1)?.uid ?? final.rows.find((r) => final.designs[r.uid])?.uid ?? "@ref");

// Nút chạy lại load test cho người đang chọn (máy tham khảo không có trong load test của ván).
function ReplayButton({ view, final, pick }: { view: View; final: SxFinal; pick: string }) {
  const { replay } = useContext(PlaybackCtx);
  const again = final.designs[pick] ? pick : undefined;
  return (
    <button type="button" className="btn btn-sm" onClick={() => replay(again)}>
      ↻ {again ? `Chạy lại cho ${again === view.me ? "bạn" : nameIn(view, again)}` : "Chạy lại load test"}
    </button>
  );
}

// Bảng xếp hạng: mỗi người một dòng kèm thanh tải đạt được (vạch đen là mục tiêu); bấm dòng để xem thiết kế.
function RankRows({ view, p, final, pick, onPick }: { view: View; p: Problem; final: SxFinal; pick: string; onPick: (uid: string) => void }) {
  const rows = final.rows;
  const step = levelStep(p);
  const scale = Math.max(p.target * 1.25, Math.max(0, ...rows.map((r) => r.tps)) + step * 2);
  return (
    <ol className="mt-3 grid gap-2.5" aria-label="Bảng xếp hạng">
      {rows.map((r) => {
        const s = r.sim;
        const dead = !!s?.valid && !!s.fail;
        return (
          <li key={r.uid}>
            <button type="button" className={`sx-row ${pick === r.uid ? "is-on" : ""}`} onClick={() => final.designs[r.uid] && onPick(r.uid)} disabled={!final.designs[r.uid]}>
              <span className="sx-row-rank">{r.rank ? (["🥇", "🥈", "🥉"][r.rank - 1] ?? r.rank) : "–"}</span>
              <span className="grid min-w-0 flex-1 gap-1.5">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <b className="min-w-0 truncate">{nameIn(view, r.uid)}</b>
                  <span className={`rounded-lg px-2 py-0.5 text-[12px] font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                  {r.auto && <span className="rounded-lg bg-sun-soft px-2 py-0.5 text-[12px] font-bold">⏱ Tự chốt khi hết giờ</span>}
                  {r.status !== "out" && (
                    <span className="ml-auto text-[13px] tabular-nums">
                      💰 <b>{fmt(r.cost)}</b> / {fmt(p.budget)} {r.budget ? "✓" : "✗"}
                    </span>
                  )}
                </span>
                {s?.valid && (
                  <span className="sx-race">
                    <span className={`sx-race-bar ${dead && !r.traffic ? "is-dead" : r.traffic ? "is-met" : ""}`} style={{ width: `${(r.tps / scale) * 100}%` }} />
                    <span className="sx-race-goal" style={{ left: `${(p.target / scale) * 100}%` }} aria-hidden="true" />
                    <span className="sx-race-tag tabular-nums">
                      📈 {fmt(r.tps)} TPS {r.traffic ? "✓" : "✗"}
                      {dead ? ` · 💥 gục ở ${fmt(s.fail!.tps)}` : ""}
                    </span>
                  </span>
                )}
                {stopText(r) && <span className="text-[12.5px] text-ink-2">{stopText(r)}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Results({ view, match: g, final }: { view: View; match: SxMatch; final: SxFinal }) {
  const p = g.problem;
  const verdict = verdictOf(view, final, p);
  const [pick, setPick] = useState<string>(() => firstPick(view, final));
  return (
    <>
      {/* Một thẻ duy nhất: kết luận ván, rồi mỗi người một dòng kèm thanh tải đạt được (vạch đen là mục tiêu). */}
      <ResultCard round={g.round} title={verdict.title} sub={verdict.sub}>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12.5px] font-semibold text-ink-3">
            Xếp hạng: TPS cao hơn đứng trên, bằng TPS thì rẻ hơn. Bấm một dòng để xem thiết kế.
          </p>
          <ReplayButton view={view} final={final} pick={pick} />
        </div>
        <RankRows view={view} p={p} final={final} pick={pick} onPick={setPick} />
      </ResultCard>
      <Viewer key={pick} view={view} p={p} final={final} pick={pick} setPick={setPick} />
    </>
  );
}

// Thanh tải của từng người theo mức tải `at` của đồng hồ phát lại (bàn chạy tải).
// `stack`: cột hẹp (trình chiếu) — tên nằm trên thanh tải.
function LoadRace({
  view,
  p,
  final,
  at,
  pick,
  onPick,
  stack,
}: {
  view: View;
  p: Problem;
  final: SxFinal;
  at: number;
  pick?: string;
  onPick?: (uid: string) => void;
  stack?: boolean;
}) {
  const { levels } = playbackOf(final);
  const step = levelStep(p);
  const best = Math.max(0, ...final.rows.map((r) => r.tps));
  const scale = Math.max(p.target * 1.25, best + step * 2);
  const done = at >= levels;
  return (
    <div className="mt-4 grid gap-2.5">
      {final.rows.map((r) => {
        const s = r.sim;
        const passed = s?.valid ? (s.fail ? s.fail.level - 1 : s.levels.length) : 0;
        const shown = Math.min(at, passed) * step;
        const dead = !!s?.valid && !!s.fail && at >= s.fail.level;
        const ended = r.status === "out" || !s?.valid || dead || (done && !s.fail);
        const picked = onPick && pick === r.uid;
        return (
          <button
            key={r.uid}
            type="button"
            className={`grid items-center rounded-xl text-left ${stack ? "grid-cols-1 gap-1" : "grid-cols-[minmax(0,7.5rem)_1fr] gap-2.5 sm:grid-cols-[minmax(0,10rem)_1fr]"} ${picked ? "bg-pen-soft" : ""}`}
            disabled={!onPick || !final.designs[r.uid]}
            onClick={() => onPick?.(r.uid)}
            aria-pressed={onPick ? picked : undefined}
          >
            <span className="flex min-w-0 items-center gap-1.5 pl-1 text-[13.5px] font-bold">
              <span className="min-w-0 truncate">{nameIn(view, r.uid)}</span>
            </span>
            <span className="sx-race">
              <span className={`sx-race-bar ${dead ? "is-dead" : shown >= p.target ? "is-met" : ""}`} style={{ width: `${(shown / scale) * 100}%` }} />
              <span className="sx-race-goal" style={{ left: `${(p.target / scale) * 100}%` }} aria-hidden="true" />
              {dead && at - s.fail!.level < 4 && (
                <span className="sx-race-boom" style={{ left: `${(shown / scale) * 100}%` }} aria-hidden="true">
                  💥
                </span>
              )}
              <span className="sx-race-tag tabular-nums">
                {r.status === "out" ? "🚪 Bị loại" : !s?.valid ? "⛔ Không hợp lệ" : dead ? `${fmt(shown)} TPS · 💥 gục ở ${fmt(s.fail!.tps)}` : `${fmt(shown)} TPS${ended ? " ✓" : ""}`}
              </span>
            </span>
          </button>
        );
      })}
      <p className="text-[12px] text-ink-3">Vạch đen là traffic mục tiêu {fmt(p.target)} TPS.</p>
    </div>
  );
}

const RunPart = memo(function RunPart({ session }: { session: SystemDesignRoom }) {
  const view = useSxView(session);
  const g = view.game?.match;
  if (!g?.final) return null;
  return <LiveRun session={session} view={view} match={g} final={g.final} />;
});

// Load test chạy lại trên sơ đồ: tải từng component đổi theo mức, traffic chạy trên đường nối, gục thì báo nguyên nhân.
// Mặc định xem thiết kế của mình (người xem thì của người đứng đầu); bấm thanh tải của ai để xem sơ đồ người đó.
const luck = (key: string) => [...key].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5);

const centerOf = (d: Design, id: number) => {
  const b = id === USERS_ID ? usersPos(d) : d.nodes.find((n) => n.id === id);
  return b ? { x: b.x + NODE.w / 2, y: b.y + NODE.h / 2 } : null;
};

type Puff = Omit<Balloon, "key" | "delay">;

// Bóng sự cố của một mức tải trên sơ đồ đang xem: đối tượng bị nhắm (sập, đứt) và các component chịu sự cố chung.
function incidentBalloons(p: Problem, d: Design, lv: LevelLoad, labels: Map<number, string>): Puff[] {
  const out: Puff[] = [];
  const add = (id: number, text: string, alert = false) => {
    const c = centerOf(d, id);
    if (c) out.push({ ...c, text, alert });
  };
  const on = (ks: Kind[]) => d.nodes.filter((n) => ks.includes(n.k));
  const inc = new Set(p.incidents);
  for (const id of lv.down) {
    const k = d.nodes.find((n) => n.id === id)?.k;
    const why: Incident = k === "app" ? "app-down" : k === "external" ? "ext-down" : k === "db" ? "db-down" : k === "llm" ? "llm-down" : "worker-down";
    const spare = k === "db" ? d.nodes.find((n) => n.k === "standby" && d.edges.some(([a, b]) => a === id && b === n.id)) : undefined;
    add(id, `${INCIDENTS[why].emoji} ${labels.get(id)} ${k === "db" ? "sập" : "ngừng hoạt động"}`, true);
    if (spare) add(spare.id, `🛟 ${labels.get(spare.id)} lên thay`);
  }
  if (lv.cut) {
    const a = centerOf(d, lv.cut[0]);
    const b = centerOf(d, lv.cut[1]);
    if (a && b) out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, text: `✂️ Đứt ${labels.get(lv.cut[0])} → ${labels.get(lv.cut[1])}`, alert: true });
  }
  if (inc.has("db-slow")) for (const n of on(["db"])) add(n.id, `🐢 ${labels.get(n.id)} −40% TPS`);
  if (inc.has("long-prompt")) for (const n of on(["llm", "gpu"])) add(n.id, `📜 ${labels.get(n.id)} −50% TPS`);
  if (inc.has("cache-flush")) for (const n of on(["cache"])) add(n.id, `🧹 ${labels.get(n.id)} bị xoá sạch`);
  if (inc.has("cache-drop")) for (const n of on(["cache", "cdn", "semcache"])) add(n.id, `📉 ${labels.get(n.id)} hit −30%`);
  if (inc.has("skew")) for (const n of on(["lb", "gateway"])) if (d.edges.filter(([a]) => a === n.id).length > 1) add(n.id, `↗️ ${labels.get(n.id)} lệch nhánh`);
  if (inc.has("write-surge")) add(USERS_ID, "📝 Tỷ lệ ghi tăng ×2");
  if (inc.has("spike")) add(USERS_ID, "🚀 Traffic +50%");
  if (inc.has("bot")) {
    const waf = on(["waf"]);
    if (waf.length) for (const n of waf) add(n.id, `🤖 ${labels.get(n.id)} chặn bot`);
    else add(USERS_ID, "🤖 Bot tràn vào ×2", true);
  }
  return out.slice(0, 6);
}

const BLAST_MS = 1700;
const BALLOON_MS = 2400;
// Sự cố xảy ra ở mọi mức tải; nhắc lại bằng bóng mỗi chừng này (hoặc ngay khi đối tượng bị nhắm đổi).
const BALLOON_EVERY_MS = 2400;

// Load test chạy lại trên sơ đồ: tải từng component đổi theo mức, traffic chạy trên đường nối, sự cố hiện bóng bay lên, gục
// thì nổ rồi mới báo nguyên nhân. Mặc định xem thiết kế của mình (người xem thì của người đứng đầu); bấm thanh tải của ai để
// xem sơ đồ người đó.
function LiveRun({ session, view, match: g, final }: { session: SystemDesignRoom; view: View; match: SxMatch; final: SxFinal }) {
  const pb = useContext(PlaybackCtx);
  const staged = useStaged();
  const p = g.problem;
  const step = levelStep(p);
  const { tick } = playbackOf(final);
  const people = final.rows.filter((r) => final.designs[r.uid]);
  // Người chơi xem thiết kế của mình; khách xem ngẫu nhiên một người (mỗi khách một người, theo uid và ván).
  // Chạy lại cho một người cụ thể thì mở sơ đồ người đó.
  const [pick, setPick] = useState(() =>
    pb.who && final.designs[pb.who] ? pb.who : final.designs[view.me] ? view.me : (people[luck(`${view.me}:${g.round}`) % Math.max(1, people.length)]?.uid ?? ""),
  );
  const row = final.rows.find((r) => r.uid === pick);
  const design = final.designs[pick];
  const sim = row?.sim;
  const tps = pb.level * step;
  const dead = !!sim?.valid && !!sim.fail && pb.level >= sim.fail.level;
  const lv = sim?.valid ? Math.min(pb.level, sim.levels.length) : 0;
  const heat = sim?.valid && lv > 0 ? heatOf(sim, lv) : undefined;
  const labels = useMemo(() => (design ? nodeLabels(design) : new Map<number, string>()), [design]);
  const hit = heat && (heat.down?.length || heat.cut) ? [...(heat.down ?? []).map((id) => `${labels.get(id)} sập`), ...(heat.cut ? [`đứt ${labels.get(heat.cut[0])} → ${labels.get(heat.cut[1])}`] : [])] : [];

  // Hiệu ứng gắn với thiết kế phát ra nó (khoá bắt đầu bằng `<uid>|`): đổi sang xem người khác thì không lẫn sang.
  const [fx, setFx] = useState<{ balloons: Balloon[]; blasts: Blast[] }>({ balloons: [], blasts: [] });
  const [blasted, setBlasted] = useState<string[]>([]);
  const puffed = useRef({ pick: "", level: -99, sig: "" });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const onLevel = useEffectEvent((level: number) => {
    if (pb.phase !== "run" || !design || !sim?.valid || !level) return;
    const failAt = sim.fail?.level;
    if (failAt && level >= failAt) {
      // Vừa gục (hoặc vừa chuyển sang xem đúng lúc gục): nổ ở component quá tải, mất đường thì chỉ báo bóng.
      if (level - failAt > 1 || blasted.includes(pick)) return;
      setBlasted((b) => [...b, pick]);
      const at = sim.fail!.node !== undefined ? centerOf(design, sim.fail!.node) : null;
      if (!at) return;
      if (sim.fail!.why === "path") {
        const made: Balloon = { ...at, key: `${pick}|lost`, text: "🚫 Mất đường xử lý", delay: 0, alert: true };
        setFx((f) => ({ ...f, balloons: [...f.balloons, made] }));
        later(() => setFx((f) => ({ ...f, balloons: f.balloons.filter((x) => x !== made) })), BALLOON_MS);
        return;
      }
      const boom: Blast = { ...at, key: `${pick}|blast` };
      setFx((f) => ({ ...f, blasts: [...f.blasts, boom] }));
      later(() => setFx((f) => ({ ...f, blasts: f.blasts.filter((x) => x !== boom) })), BLAST_MS);
      return;
    }
    if (!p.incidents.length) return;
    const items = incidentBalloons(p, design, sim.levels[level - 1], labels);
    const sig = items.map((x) => x.text).join("|");
    const last = puffed.current;
    if (!items.length || (last.pick === pick && last.sig === sig && (level - last.level) * tick < BALLOON_EVERY_MS)) return;
    puffed.current = { pick, level, sig };
    const made = items.map((x, k): Balloon => ({ ...x, key: `${pick}|${level}|${k}`, delay: k * 140 }));
    setFx((f) => ({ ...f, balloons: [...f.balloons, ...made].slice(-14) }));
    later(() => setFx((f) => ({ ...f, balloons: f.balloons.filter((x) => !made.includes(x)) })), BALLOON_MS + made.length * 140);
  });
  // Mức tải đổi là một nhịp của đồng hồ phát lại (hệ ngoài): hiệu ứng sinh theo nhịp đó, gỡ theo hẹn giờ.
  useEffect(() => {
    const t = setTimeout(() => onLevel(pb.level), 0);
    return () => clearTimeout(t);
  }, [pb.level, pick]);

  const mine = (k: { key: string }) => k.key.startsWith(`${pick}|`);
  const blasts = fx.blasts.filter(mine);
  // Vừa gục ở mức này mà hiệu ứng chưa kịp sinh (sinh sau một nhịp): coi như đang nổ, để lời báo gục và khói âm ỉ không
  // hiện trước vụ nổ.
  const pending = dead && !blasted.includes(pick) && pb.level - sim!.fail!.level <= 1;
  const late = pending || blasted.includes(pick);
  const shown: Fx = {
    balloons: fx.balloons.filter(mine),
    blasts,
    smolder: dead && !pending && !blasts.length && sim?.fail?.why !== "path" ? sim?.fail?.node : undefined,
  };
  const name = nameIn(view, pick);
  // `eyebrow`: dòng "đang chạy · mức" phía trên (phóng to thì đã nằm ở tiêu đề bảng).
  const ticker = (eyebrow: boolean) => (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-[12.5px] font-bold tracking-wide text-ink-3 uppercase">📈 Load test đang chạy · mức {pb.level}</p>}
        <p className="sx-ticker" aria-live="off">
          {fmt(tps)} <small className="text-lg">TPS</small>
        </p>
      </div>
      <button type="button" className="btn btn-sm" onClick={pb.skip}>
        ⏭ Xem kết quả luôn
      </button>
    </div>
  );
  const meter = (
    <>
      <div className="sx-meter" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (tps / p.target) * 100)}%` }} />
      </div>
      <p className="text-[13px] font-semibold text-ink-2">
        🎯 Mục tiêu {fmt(p.target)} TPS{tps >= p.target ? " — đã vượt mục tiêu, tiếp tục tăng tải tới khi gục…" : pb.level ? ` — còn ${fmt(p.target - tps)} TPS` : ""}
      </p>
    </>
  );
  const label = (
    <p className="text-[13.5px] font-bold">
      🔍 Sơ đồ của {name}
      {hit.length > 0 && !dead && <span className="ml-2 font-semibold text-coral">⚡ Sự cố: {hit.join(", ")}</span>}
    </p>
  );
  const veil = (dead || !sim?.valid) && (
    <div className={`sx-run-veil ${late ? "is-late" : ""}`}>
      {sim?.valid ? (
        <p key="dead">
          <b className="font-display text-xl">💥 Gục ở {fmt(sim.fail!.tps)} TPS</b>
          <span className="mt-1 block text-[13.5px] text-ink-2">{sim.fail!.text}</span>
        </p>
      ) : (
        <p key="invalid">
          <b className="font-display text-xl">⛔ Không hợp lệ — không được chạy tải</b>
          <span className="mt-1 block text-[13.5px] text-ink-2">{sim?.errors[0]?.text}</span>
        </p>
      )}
    </div>
  );
  const canvas = (v?: Pan) => design && <SxCanvas design={design} heat={heat} live={!!heat && !dead} fx={shown} view={v} label={`Load test trên sơ đồ của ${name}`} />;

  // Phóng to: chạy tải ngay trên sơ đồ phủ kín màn hình; bộ đếm, mục tiêu và thanh tải mọi người nổi ở cột phải.
  if (staged)
    return (
      <ZoomFrame
        fitKey={pick}
        extent={extentOf(design ?? emptyDesign())}
        top={<ActionPart session={session} compact extra={<ProblemButton p={p} />} />}
        side={
          <Panel
            title={
              <>
                📈 Load test đang chạy <span className="text-[13px] font-semibold text-ink-3 tabular-nums">· mức {pb.level}</span>
              </>
            }
            fold
            body="mt-2 grid gap-3"
          >
            {ticker(false)}
            {meter}
            {design && label}
            <LoadRace view={view} p={p} final={final} at={pb.level} pick={pick} onPick={setPick} stack />
          </Panel>
        }
        canvas={(v) => (
          <>
            {canvas(v)}
            {design && veil}
          </>
        )}
      />
    );

  return (
    <section className="card mt-4 grid gap-3 p-4 sm:p-5" aria-label="Load test đang chạy">
      {ticker(true)}
      {meter}
      {design && (
        <>
          {label}
          <div className="sx-run">
            <div className="sx-canvas-wrap">{canvas()}</div>
            {veil}
          </div>
        </>
      )}
      <LoadRace view={view} p={p} final={final} at={pb.level} pick={pick} onPick={setPick} />
    </section>
  );
}

// Sự cố nhắm vào một component / đường nối cụ thể (hiện tên đối tượng); các sự cố còn lại tác động chung.
const TARGETED: readonly Incident[] = ["app-down", "link-cut", "ext-down", "worker-down", "db-down", "llm-down"];

function heatOf(sim: SimResult, level: number): Heat | undefined {
  const lv = sim.levels[level - 1];
  if (!lv) return undefined;
  return {
    input: lv.tps,
    load: new Map(sim.ids.map((id, i) => [id, lv.peak[i]])),
    edges: lv.edges,
    fail: sim.fail?.level === level ? sim.fail.node : undefined,
    down: lv.down,
    cut: lv.cut,
  };
}

// Thiết kế máy tự dựng để tham khảo (không tính vào xếp hạng).
function useRefDesign(p: Problem) {
  return useMemo(() => {
    const { design } = autoDesign(p);
    return { design, sim: simulate(p, design) };
  }, [p]);
}

// Mức tải mở sẵn khi xem một thiết kế: mức thất bại, không có thì mức cuối.
const startLevel = (sim: SimResult | null | undefined) => {
  const last = sim?.levels.length ?? 0;
  return Math.max(1, Math.min(last, sim?.fail?.level ?? last));
};

// Phần chữ khi xem một thiết kế: thanh kéo chọn mức tải, sự cố ở mức đó, vì sao dừng và chú thích màu.
function ViewDetails({
  p,
  design,
  sim,
  status,
  level,
  setLevel,
  refNote,
}: {
  p: Problem;
  design: Design;
  sim: SimResult | null | undefined;
  status: Standing["status"];
  level: number;
  setLevel: (n: number) => void;
  refNote?: string;
}) {
  const last = sim?.levels.length ?? 0;
  const lv = sim?.levels[level - 1];
  const labels = useMemo(() => nodeLabels(design), [design]);
  return (
    <div className="grid gap-3">
      {refNote && <p className="text-[13px] text-ink-2">{refNote}</p>}
      {sim?.valid && last > 0 && (
        <label className="grid gap-1.5">
          <span className="flex flex-wrap justify-between gap-2 text-[13.5px] font-bold tabular-nums">
            <span>
              Mức {level}/{last} · {fmt(lv?.tps ?? 0)} TPS{sim.fail?.level === level ? " — 💥 thất bại ở mức này" : ""}
            </span>
            {lv && lv.backlog > 0 && <span className="text-ink-3">📬 Hàng chờ đỉnh {fmt(lv.backlog)} tác vụ</span>}
          </span>
          <input type="range" min={1} max={last} value={level} onChange={(e) => setLevel(Number(e.target.value))} className="w-full accent-[var(--pen)]" />
        </label>
      )}
      <div className="grid gap-1 text-[13px] text-ink-2">
        {lv && p.incidents.length > 0 && (
          <p>
            ⚡ Sự cố giây {SIM.incFrom}–{SIM.incTo}:{" "}
            {[
              ...lv.down.map((id) => `${labels.get(id)} ngừng hoạt động`),
              ...(lv.cut ? [`đứt ${labels.get(lv.cut[0])} → ${labels.get(lv.cut[1])}`] : []),
              ...p.incidents.filter((k) => !TARGETED.includes(k)).map((k) => INCIDENTS[k].name.toLowerCase()),
            ].join(", ") || "không trúng component nào"}
            .
          </p>
        )}
        {sim && <p>{stopText({ status, sim })}</p>}
        {sim?.valid && <p className="text-[12px] text-ink-3">Màu theo mức sử dụng đỉnh trong mức tải: xanh &lt; 60%, vàng &lt; 85%, cam tới 100%, đỏ là quá tải. Số trên đường nối là TPS đi qua.</p>}
      </div>
    </div>
  );
}

const refNoteOf = (sim: SimResult) =>
  `Máy tự dựng bằng cách nâng dần chỗ nghẽn — không tối ưu chi phí và không tính vào xếp hạng: ${fmt(sim.maxTps)} TPS, chi phí ${fmt(sim.cost)}.`;

const marksOf = (sim: SimResult | null | undefined) => (sim && !sim.valid ? sim.errors.flatMap((e) => e.nodes?.slice(-1) ?? []) : undefined);

function Viewer({ view, p, final, pick, setPick }: { view: View; p: Problem; final: SxFinal; pick: string; setPick: (u: string) => void }) {
  const ref = useRefDesign(p);
  const row = final.rows.find((r) => r.uid === pick);
  const design = pick === "@ref" ? ref.design : final.designs[pick];
  const sim = pick === "@ref" ? ref.sim : row?.sim;
  const [level, setLevel] = useState(() => startLevel(sim));
  const heat = sim?.valid ? heatOf(sim, level) : undefined;
  const people = final.rows.filter((r) => final.designs[r.uid]);
  return (
    <section className="card mt-4 grid gap-3 p-4 sm:p-5" aria-label="Xem thiết kế">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-display text-xl font-extrabold">🔍 Xem thiết kế</h2>
        {people.map((r) => (
          <button key={r.uid} type="button" className={`btn btn-sm ${pick === r.uid ? "btn-sun" : ""}`} aria-pressed={pick === r.uid} onClick={() => setPick(r.uid)}>
            {nameIn(view, r.uid)}
          </button>
        ))}
        <button type="button" className={`btn btn-sm ${pick === "@ref" ? "btn-sun" : ""}`} aria-pressed={pick === "@ref"} onClick={() => setPick("@ref")}>
          🤖 Máy tham khảo
        </button>
      </div>
      {design && (
        <>
          <div className="sx-canvas-wrap">
            <SxCanvas design={design} heat={heat} marks={marksOf(sim)} label="Thiết kế và tải từng component" />
          </div>
          <ViewDetails p={p} design={design} sim={sim} status={row?.status ?? "fail"} level={level} setLevel={setLevel} refNote={pick === "@ref" ? refNoteOf(ref.sim) : undefined} />
        </>
      )}
    </section>
  );
}

// Kết quả lúc đang phóng to: sơ đồ của người đang chọn phủ kín màn hình (tải theo mức đang chọn), cột nổi là bảng xếp hạng
// (bấm một dòng để đổi sơ đồ) và chi tiết thiết kế đang xem.
const ResultZoomPart = memo(function ResultZoomPart({ session }: { session: SystemDesignRoom }) {
  const view = useSxView(session);
  const g = view.game?.match;
  if (!g?.final) return null;
  return <ResultZoom session={session} view={view} match={g} final={g.final} />;
});

function ResultZoom({ session, view, match: g, final }: { session: SystemDesignRoom; view: View; match: SxMatch; final: SxFinal }) {
  const p = g.problem;
  const ref = useRefDesign(p);
  const verdict = verdictOf(view, final, p);
  const simOf = (uid: string) => (uid === "@ref" ? ref.sim : final.rows.find((r) => r.uid === uid)?.sim);
  const [pick, setPick] = useState(() => firstPick(view, final));
  const [level, setLevel] = useState(() => startLevel(simOf(pick)));
  const choose = (uid: string) => {
    setPick(uid);
    setLevel(startLevel(simOf(uid)));
  };
  const row = final.rows.find((r) => r.uid === pick);
  const design = pick === "@ref" ? ref.design : final.designs[pick];
  const sim = simOf(pick);
  const heat = sim?.valid ? heatOf(sim, level) : undefined;
  return (
    <ZoomFrame
      fitKey={pick}
      extent={extentOf(design ?? ref.design)}
      top={<ActionPart session={session} compact extra={<ProblemButton p={p} />} />}
      side={
        <>
          <Panel title={verdict.title} fold className="is-result">
            <p className="mt-1 text-[13px] text-ink-2">{verdict.sub}</p>
            <RankRows view={view} p={p} final={final} pick={pick} onPick={choose} />
            <div className="mt-3 flex flex-wrap gap-2">
              <ReplayButton view={view} final={final} pick={pick} />
              <button type="button" className={`btn btn-sm ${pick === "@ref" ? "btn-sun" : ""}`} aria-pressed={pick === "@ref"} onClick={() => choose("@ref")}>
                🤖 Máy tham khảo
              </button>
            </div>
          </Panel>
          {design && (
            <Panel title={<>🔍 Sơ đồ của {pick === "@ref" ? "máy tham khảo" : nameIn(view, pick)}</>} fold body="mt-2">
              <ViewDetails p={p} design={design} sim={sim} status={row?.status ?? "fail"} level={level} setLevel={setLevel} refNote={pick === "@ref" ? refNoteOf(ref.sim) : undefined} />
            </Panel>
          )}
        </>
      }
      canvas={(v) => design && <SxCanvas design={design} heat={heat} marks={marksOf(sim)} view={v} label={`Thiết kế và tải từng component — ${pick === "@ref" ? "máy tham khảo" : nameIn(view, pick)}`} />}
    />
  );
}

// ---------------------------------------------------------------------------------------------------------------------

// Dưới cảnh người thắng: hạng của mình nếu cũng vượt quality gate.
function selfNote(rows: readonly Standing[], me: string) {
  const r = rows.find((x) => x.uid === me);
  return r?.status === "pass" && r.rank > 1 ? `Bạn cũng vượt quality gate — hạng ${r.rank}: ${fmt(r.tps)} TPS · chi phí ${fmt(r.cost)}.` : undefined;
}

// Vì sao thiết kế của mình chưa vượt quality gate (cảnh "Bạn chưa vượt qua được").
function missWhy(r: Standing, p: Problem): { emoji: string; text: string } {
  if (r.status === "out") return { emoji: "🚪", text: "Bạn bị loại khỏi ván này." };
  if (r.status === "invalid") return { emoji: "⛔", text: "Thiết kế không hợp lệ nên không được chạy tải." };
  const over = r.budget ? "" : ` · chi phí ${fmt(r.cost)} vượt budget ${fmt(p.budget)}`;
  if (!r.traffic) return { emoji: "💥", text: `Hệ thống gục ở ${fmt(r.sim?.fail?.tps ?? r.tps)} TPS — cần ${fmt(p.target)} TPS${over}.` };
  return { emoji: "💸", text: `Đạt ${fmt(r.tps)} TPS nhưng chi phí ${fmt(r.cost)} vượt budget ${fmt(p.budget)}.` };
}

const CinemaPart = memo(function CinemaPart({ session }: { session: SystemDesignRoom }) {
  const live = useSxLive(session);
  const g = useGame(session, (v) => v?.match);
  const me = useRoomState(session, (r) => r.me);
  const pb = useContext(PlaybackCtx);
  // Cảnh bắt đầu ván (đếm tới lúc lộ đề) và cảnh chuẩn bị thiết kế (mọi người đã đọc đề, đếm tới lúc mở bàn). Vào phòng / tải
  // lại trang giữa lúc đếm thì vẫn đếm nốt phần còn lại.
  const count = useCountdown(live && g ? g.round : 0, { endsAt: g?.readAt, ms: COUNTDOWN_MS, onMount: true });
  const prep = useCountdown(live && g?.opensAt ? `prep:${g.round}` : 0, { endsAt: g?.opensAt, ms: PREP_MS, onMount: true });
  const final = g?.final;
  const winners = final ? final.rows.filter((r) => r.rank === 1) : [];
  const mine = final?.rows.find((r) => r.uid === me);
  const missed = !!mine && mine.status !== "pass";
  // Chỉ công bố khi máy này vừa phát lại xong — sau cả vụ nổ cuối cùng (hoặc bấm bỏ qua); vào phòng / tải lại trang lúc ván đã
  // xong thì thôi.
  const end = useEndScene(final && pb.fresh && pb.phase === "done" ? `${g!.round}:${pb.run}` : 0, { ms: WIN_SCENE_MS, emojis: CONFETTI, cheer: winners.length > 0 && !missed });
  if (!g) return null;
  if (count > 0)
    return (
      <CountdownCine eyebrow={`🏗️ Ván ${g.round} · ${g.problem.title}`} n={count} title="Đọc kỹ đề trước khi thiết kế!" tip="Mọi người xác nhận đã đọc kỹ đề thì bàn thiết kế mới mở." />
    );
  if (prep > 0)
    return (
      <CountdownCine
        tone="grape"
        eyebrow="✅ Mọi người đã đọc kỹ đề"
        n={prep}
        title="Chuẩn bị thiết kế!"
        tip={`🎯 ${fmt(g.problem.target)} TPS · 💰 ${fmt(g.problem.budget)} · ⏱ ${timeLabel(g.problem.time)}`}
      />
    );
  if (pb.phase === "intro" && final)
    return (
      <CountdownCine
        tone="grape"
        eyebrow="🔒 Mọi người đã chốt thiết kế"
        n={pb.n}
        title="Bắt đầu chạy tải!"
        tip={`Traffic tăng dần ${fmt(levelStep(g.problem))} TPS mỗi mức tới khi hệ thống gục · 🎯 ${fmt(g.problem.target)} TPS`}
      />
    );
  if (!end.shown || !final) return <Party bits={end.party} />;
  const top = winners[0];
  const iWon = winners.some((r) => r.uid === me);
  const names = winners.map((r) => (r.uid === me ? "Bạn" : (g.lineup.find((s) => s.seat.uid === r.uid)?.seat.member?.name ?? "Ai đó"))).join(", ");
  if (mine && missed) {
    const why = missWhy(mine, g.problem);
    return (
      <LoseCine
        p={g.lineup.find((s) => s.seat.uid === me)?.seat.member}
        emoji={why.emoji}
        title="Bạn chưa vượt qua được!"
        sub={why.text}
        note={top ? `🏆 ${names} ${winners.length > 1 ? "đồng hạng nhất" : "thắng"} với ${fmt(top.tps)} TPS · chi phí ${fmt(top.cost)}` : "Ván này không ai vượt quality gate."}
        onClose={end.close}
      />
    );
  }
  if (!winners.length)
    return <LoseCine emoji="🤷" title="Không ai vượt quality gate" sub={`Cần ≥ ${fmt(g.problem.target)} TPS với chi phí ≤ ${fmt(g.problem.budget)}`} onClose={end.close} />;
  const note = selfNote(final.rows, me);
  return (
    <>
      <WinCine
        winners={winners.map((r) => ({ uid: r.uid, p: g.lineup.find((s) => s.seat.uid === r.uid)?.seat.member }))}
        title={iWon && winners.length === 1 ? "Bạn chiến thắng!" : winners.length > 1 ? `${names} đồng hạng nhất!` : `${names} chiến thắng!`}
        sub={`${fmt(top.tps)} TPS · chi phí ${fmt(top.cost)}`}
        note={note}
        onClose={end.close}
      />
      <Party bits={end.party} />
    </>
  );
});
