"use client";

import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { housesOf, judge, targetOf, TROI, type CcEvent, type CcState, type Racer, type Snap, type ThrowMode } from "@/lib/games/co-chep";
import { TURN_MS, type CcMatch, type CcView, type CoChepRoom } from "@/lib/net/co-chep-room";
import type { Member, RoomView, SeatView } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "../ConfirmButton";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Crowd, DrawCine, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { CC_TONES, CoChepCourt, type CourtFx, type Hopper } from "./CoChepCourt";
import { CoChepThrow } from "./CoChepThrow";
import { PeoplePanel } from "./People";
import { ResultCard as Result, Standings } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout, SpectatorNote } from "./RoomLayout";
import { ResignButton, SeatButtons, seatMessage, startBlocker, StatusBar, TONE } from "./StatusBar";
import { useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

type View = Omit<RoomView<CcView>, "chat">;

function useCcView(session: CoChepRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const CHEERS = ["🎉", "🏠", "✨", "🎊", "🪨", "🏆"];
const STEP_MS = 380;
const NO_EVENTS: CcEvent[] = [];

const WIDE_COURT = "(min-width: 768px)";
const subscribeWideCourt = (fn: () => void) => {
  const mq = matchMedia(WIDE_COURT);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
};
const useWideCourt = () => useSyncExternalStore(subscribeWideCourt, () => matchMedia(WIDE_COURT).matches, () => false);

const emptySnap = (n: number): Snap => ({ owners: Array(9).fill(0), stones: Array(n).fill(0), backs: Array(n).fill(false) });
const cellName = (c: number) => (c === TROI ? "Trời" : `ô ${c}`);

type Scene = { kind: "aim"; key: string; mode: ThrowMode; target: number } | { kind: "replay"; ev: Extract<CcEvent, { t: "throw" }>; before: Snap };

function usePlayback(g: CcMatch | undefined, me: number, paused: boolean) {
  const events = g?.state.events ?? NO_EVENTS;
  const round = g?.round ?? 0;
  const [pb, setPb] = useState({ round, played: events.length, cur: -1, post: false });
  if (pb.round !== round) setPb({ round, played: events.length, cur: -1, post: false });
  const [scene, setScene] = useState<Scene | null>(null);
  const [hop, setHop] = useState<{ h: Hopper; hidden?: number } | null>(null);
  const [fx, setFx] = useState<CourtFx | null>(null);
  const [banner, setBanner] = useState<{ text: string; key: string } | null>(null);
  // Cú chọi của chính mình đã xem trong màn chọi nên không diễn lại.
  const thrown = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const finish = (i: number) => setPb((p) => (p.round === round && p.cur === i ? { ...p, played: i + 1, cur: -1, post: false } : p));

  const afterThrow = (i: number, ev: Extract<CcEvent, { t: "throw" }>) => {
    if ((ev.verdict === "claim" || ev.verdict === "burn") && ev.spot.kind === "cell") {
      const f: CourtFx = { cell: ev.spot.cell, kind: ev.verdict, key: `${round}:${ev.i}` };
      setFx(f);
      later(() => setFx((x) => (x?.key === f.key ? null : x)), ev.verdict === "burn" ? 3400 : 2000);
      setPb((p) => (p.cur === i ? { ...p, post: true } : p));
      later(() => finish(i), 1300);
    } else later(() => finish(i), 250);
  };

  const start = (g: CcMatch, i: number) => {
    const ev = g.state.events[i];
    const before = g.state.events[i - 1]?.snap ?? emptySnap(g.lineup.length);
    setPb((p) => (p.round === round ? { ...p, played: i, cur: i, post: false } : p));
    const name = (k: number) => (k === me ? "bạn" : (g.lineup[k]?.member?.name ?? "Ai đó"));
    if (ev.t === "turn") {
      if (ev.why === "start") return later(() => finish(i), 0);
      const why = { miss: "Mất lượt", fault: "Ngã — mất lượt", skip: "Quá giờ — qua lượt", out: "Rời cuộc", burn: "Cháy nhà — mất lượt", start: "" }[ev.why];
      setBanner({ text: `${why} · Tới lượt ${name(ev.who)}`, key: `${round}:${i}` });
      later(() => {
        setBanner(null);
        finish(i);
      }, 1100);
    } else if (ev.t === "throw") {
      if (thrown.current.has(`${round}:${ev.i}`)) afterThrow(i, ev);
      else setScene({ kind: "replay", ev, before });
    } else if (ev.t === "hop") {
      const pick = ev.path.findIndex((s) => s.pick);
      const stop = ev.fail >= 0 ? ev.fail : ev.path.length - 1;
      ev.path.slice(0, stop + 1).forEach((step, n) => {
        later(
          () => setHop({ h: { who: ev.who, step, n, fall: n === ev.fail }, hidden: ev.mode === "cell" && pick >= 0 && n > pick ? ev.who : undefined }),
          n * STEP_MS,
        );
      });
      later(
        () => {
          setHop(null);
          finish(i);
        },
        stop * STEP_MS + (ev.fail >= 0 ? 1300 : 450),
      );
    } else later(() => finish(i), 0);
  };

  const queued = useRef("");
  useEffect(() => {
    if (!g || paused || scene || pb.cur >= 0 || pb.round !== round || pb.played >= events.length) return;
    // Bỏ lỡ nhiều quá (tab ẩn lâu) thì tua nhanh, chỉ diễn mấy sự kiện cuối.
    const i = events.length - pb.played > 10 ? events.length - 3 : pb.played;
    const tag = `${round}:${i}`;
    if (queued.current === tag) return;
    queued.current = tag;
    later(() => start(g, i), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy lại khi có sự kiện mới / vừa diễn xong
  }, [g, events.length, pb.played, pb.cur, pb.round, scene, paused]);

  const shown = pb.cur >= 0 ? (pb.post ? pb.cur : pb.cur - 1) : pb.played - 1;
  const snap = events[Math.min(shown, events.length - 1)]?.snap ?? emptySnap(g?.lineup.length ?? 0);
  let lastThrow: Extract<CcEvent, { t: "throw" }> | undefined;
  for (let j = Math.min(shown, events.length - 1); j >= 0 && !lastThrow; j--) {
    const e = events[j];
    if (e.t === "throw") lastThrow = e;
  }
  return {
    idle: pb.cur < 0 && pb.played >= events.length && !scene,
    snap,
    scene,
    hop,
    fx,
    banner,
    mark: lastThrow ? { x: lastThrow.x, y: lastThrow.y } : null,
    // Chốt chế độ và mục tiêu lúc mở: chọi xong thì ván đã sang việc khác nhưng màn vẫn đang diễn.
    openAim: (key: string, s: CcState) => setScene({ kind: "aim", key, mode: s.need === "back" ? "back" : "front", target: s.need === "back" ? 0 : s.target }),
    closeScene: () => setScene(null),
    sceneDone: () => {
      const s = scene;
      setScene(null);
      if (s?.kind === "replay") afterThrow(pb.cur, s.ev);
    },
    markThrown: (i: number) => thrown.current.add(`${round}:${i}`),
  };
}

// Phần bàn chơi bọc `memo` và tự đọc store để nhịp tim, tin chat hay người vào ra không làm bàn vẽ lại, và nước đi
// không làm danh sách người / khung chat vẽ lại.
export function CoChepTable({ id, slug, session }: { id: string; slug: string; session: CoChepRoom }) {
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <CoChepBody session={session} />
    </RoomLayout>
  );
}

const CoChepBody = memo(function CoChepBody({ session }: { session: CoChepRoom }) {
  const view = useCcView(session);
  const m = view.meta!;
  const { match: g, wins } = view.game!;
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);
  const live = m.status === "playing" && g?.round === m.round && !g.result;
  const count = useCountdown(live && g!.state.count === 0 ? g!.round : 0);
  const iWon = !!g?.result?.winners?.includes(view.me);
  const end = useEndScene(g?.result ? g.round : 0, { delay: 1500, cheer: iWon || (g?.me ?? -1) < 0, emojis: CHEERS });
  const pb = usePlayback(g, g?.me ?? -1, count > 0);
  const wide = useWideCourt();

  const showGame = !!g && m.status !== "waiting";
  const state = g?.state;
  const players = showGame ? g!.lineup : view.seats;
  const avatars = players.map((s) => ({ avatar: s.member?.avatar ?? "🙂", color: s.member?.color ?? "var(--sunken)" }));

  const key = g ? `${g.round}:${state!.events.length}:${state!.count}` : "";
  const autoKey = useRef("");
  const ready = live && g!.myTurn && pb.idle && !count;
  useEffect(() => {
    if (!ready || autoKey.current === key) return;
    // Chỉ đánh dấu khi đã mở — đóng màn chọi (xem sân) thì không tự mở lại cho tới lượt sau.
    const t = setTimeout(
      () => {
        autoKey.current = key;
        if (state!.need === "hop") session.hop();
        else pb.openAim(key, state!);
      },
      state!.need === "hop" ? 900 : 450,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  const turnTone = state && state.turn >= 0 ? CC_TONES[state.turn] : undefined;
  const scene = pb.scene;
  const sceneEv = scene?.kind === "replay" ? scene.ev : null;
  const thrower = sceneEv ? sceneEv.who : (g?.me ?? 0);
  const throwerSeat = g?.lineup[thrower];

  return (
    <>
      <RoomHeader name={m.name} status={m.status} round={m.round} playing="đang chơi">
        <span className="chip text-ink-2">🪨 Chiếm nhà · tối đa {m.seats} người</span>
      </RoomHeader>

      <ul className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: showGame ? players.length : m.seats }, (_, k) => (
          <PlayerCard
            key={k}
            k={k}
            seat={players[k]}
            racer={showGame ? state!.players[k] : undefined}
            houses={showGame ? housesOf({ owners: pb.snap.owners }, k) : undefined}
            target={showGame && state ? targetOf(pb.snap.owners, state.players[k]) : 0}
            active={live && state!.turn === k}
            wins={players[k] ? (wins[players[k].uid] ?? 0) : 0}
            isHost={players[k]?.uid === m.host}
            me={view.me}
          />
        ))}
      </ul>

      <ActionBar view={view} session={session} onAim={() => pb.openAim(key, state!)} canAim={ready && state?.need !== "hop" && !scene} busy={!pb.idle} />
      {m.status === "ended" && g?.result && pb.idle && <ResultCard match={g} me={view.me} />}

      <div className={`relative mx-auto mt-4 w-full ${wide ? "" : "max-w-[400px]"}`}>
        <div ref={boardRef} className="card overflow-hidden p-2 sm:p-3" style={{ background: "var(--board)" }}>
          <CoChepCourt
            orient={wide ? "wide" : "tall"}
            snap={pb.snap}
            players={avatars}
            target={live && pb.idle && state!.need === "throw" ? state!.target : 0}
            targetTone={turnTone}
            hopper={pb.hop?.h}
            hidden={pb.hop?.hidden}
            fx={pb.fx}
            mark={pb.mark}
          />
        </div>
        {pb.banner && (
          <p key={pb.banner.key} className="cc-banner">
            {pb.banner.text}
          </p>
        )}
        <Flyers flyers={flyers} />
        {!showGame && m.status === "waiting" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
            <p className="card px-5 py-3 text-center font-display text-lg font-extrabold">
              {!m.players.length ? "Đang chờ người vào ghế…" : view.isHost ? "Sẵn sàng thì bấm Bắt đầu!" : "Đang chờ chủ phòng bắt đầu…"}
            </p>
          </div>
        )}
      </div>
      {view.mySeat < 0 && (g?.me ?? -1) < 0 && <SpectatorNote />}

      {scene && g && (
        <CoChepThrow
          key={scene.kind === "aim" ? scene.key : `r${sceneEv!.i}`}
          mode={scene.kind === "replay" ? sceneEv!.mode : scene.mode}
          replay={sceneEv ? { lx: sceneEv.lx, ly: sceneEv.ly, x: sceneEv.x, y: sceneEv.y } : undefined}
          name={thrower === g.me ? "Bạn" : (throwerSeat?.member?.name ?? "Ai đó")}
          avatar={throwerSeat?.member?.avatar ?? "🙂"}
          tone={thrower}
          court={{ snap: scene.kind === "replay" ? scene.before : pb.snap, avatars: avatars.map((a) => a.avatar), me: thrower }}
          target={scene.kind === "replay" ? (scene.ev.mode === "back" ? 0 : scene.ev.target) : scene.target}
          judgeShot={(x, y) => {
            if (sceneEv) return { verdict: sceneEv.verdict, spot: sceneEv.spot };
            const r = judge(state!, g.me, x, y);
            return { verdict: r.verdict, spot: r.spot };
          }}
          onThrow={(shot) => {
            pb.markThrown(state!.count);
            session.throwStone(shot.x, shot.y, shot.lx, shot.ly);
          }}
          onClose={scene.kind === "aim" ? pb.closeScene : undefined}
          onDone={pb.sceneDone}
        />
      )}

      {g && count > 0 && <CountdownScene match={g} me={view.me} n={count} />}
      {g?.result && end.shown && <EndScene match={g} me={view.me} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

function progressText(r: Racer | undefined, target: number) {
  if (!r) return "";
  if (r.out) return "Đã rời cuộc";
  if (r.back) return "🙈 Chọi qua lưng";
  if (r.stone) return r.stone === TROI ? "🪨 Đá trên Trời" : `🪨 Đá ở ô ${r.stone}`;
  return target === TROI ? "☁️ Lên Trời" : `🎯 Ô ${target}`;
}

function PlayerCard({
  k,
  seat,
  racer,
  houses,
  target,
  active,
  wins,
  isHost,
  me,
}: {
  k: number;
  seat?: SeatView;
  racer?: Racer;
  houses?: number;
  target: number;
  active: boolean;
  wins: number;
  isHost: boolean;
  me: string;
}) {
  const p = seat?.member;
  const tone = CC_TONES[k];
  return (
    <li
      className={`card relative flex min-w-0 items-center gap-2 p-2 transition-all sm:gap-2.5 sm:p-2.5 ${racer?.out ? "opacity-50" : ""}`}
      style={{ borderColor: active ? tone : undefined, boxShadow: active ? `0 4px 0 ${tone}` : undefined, background: active ? `color-mix(in srgb, ${tone} 12%, var(--surface))` : undefined }}
    >
      {p ? (
        <span className="relative flex-none rounded-full p-[3px]" style={{ background: tone }}>
          <Avatar p={p} size={34} className={seat?.online ? "" : "opacity-40 grayscale"} />
          {isHost && (
            <span className="absolute -top-2.5 -right-1.5 text-base" title="Chủ phòng">
              👑
            </span>
          )}
        </span>
      ) : (
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full border-2 border-dashed border-ink-3 text-lg text-ink-3" aria-hidden="true">
          ?
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-extrabold sm:text-[14.5px]">
          {p ? p.name : "Ghế trống"}
          {p && seat?.uid === me && <span className="ml-1 text-xs font-bold text-pen">(bạn)</span>}
        </p>
        <p className="truncate text-[12px] font-semibold text-ink-3">{!p ? "Đang chờ người vào" : !seat?.online ? "⚠️ Mất kết nối" : racer ? progressText(racer, target) : wins ? `🏆 ${wins} ván thắng` : "Sẵn sàng"}</p>
      </div>
      {houses !== undefined && (
        <span className="flex flex-none flex-col items-center rounded-xl border-2 border-edge px-1.5 py-0.5 font-display leading-none font-extrabold text-white" style={{ background: tone }} title={`${houses} nhà`}>
          <span className="text-lg">{houses}</span>
          <span className="text-[10px]">🏠</span>
        </span>
      )}
    </li>
  );
}

function CountdownScene({ match: g, me, n }: { match: CcMatch; me: string; n: number }) {
  const first = g.lineup[0];
  const tip = first?.uid === me ? "Bạn chọi trước — chuẩn bị kéo đá nhé!" : `${first?.member?.name ?? "Ai đó"} chọi trước.`;
  return (
    <CountdownCine eyebrow={`🪨 Cò Chẹp · Ván ${g.round}`} n={n} tip={tip} tone="gold">
      <Crowd people={g.lineup.map((s, k) => ({ uid: s.uid, p: s.member, name: s.uid === me ? "Bạn" : (s.member?.name ?? "Ai đó"), ring: CC_TONES[k] }))} />
    </CountdownCine>
  );
}

function summary(g: CcMatch, me: string) {
  const r = g.result!;
  const ws = r.winners ?? [];
  if (!ws.length) return { ws, title: "Chưa ai có nhà!", sub: `Ván ${g.round} khép lại — ván sau cố lên nhé` };
  const first = g.lineup.find((s) => s.uid === ws[0]);
  const title = ws.includes(me) ? (ws.length > 1 ? "Bạn đồng hạng nhất!" : "Bạn chiến thắng!") : ws.length > 1 ? "Đồng hạng nhất!" : `${first?.member?.name ?? "Ai đó"} chiến thắng!`;
  const sub = r.reason === "leave" ? "Những người khác đã rời cuộc" : `${housesOf(g.state, g.lineup.indexOf(first!))} nhà — nhiều nhất sân`;
  return { ws, title, sub };
}

function EndScene({ match: g, me, onClose }: { match: CcMatch; me: string; onClose: () => void }) {
  const { ws, title, sub } = summary(g, me);
  if (!ws.length) return <DrawCine people={g.lineup.map((s, k) => ({ uid: s.uid, p: s.member, ring: CC_TONES[k] }))} title={title} sub={sub} emoji="🏚️" onClose={onClose} />;
  return (
    <WinCine
      winners={ws.map((uid) => ({ uid, p: g.lineup.find((s) => s.uid === uid)?.member as Member | undefined, badge: <span className="text-[13px]">🏠</span> }))}
      title={title}
      sub={sub}
      onClose={onClose}
    >
      <ul className="flex flex-wrap justify-center gap-2 text-[14px] font-bold">
        {g.lineup.map((s, k) => (
          <li key={s.uid} className="rounded-full bg-black/20 px-3 py-1">
            {s.member?.avatar} {s.uid === me ? "Bạn" : (s.member?.name ?? "Ai đó")}: {housesOf(g.state, k)} 🏠
          </li>
        ))}
      </ul>
    </WinCine>
  );
}

function ResultCard({ match: g, me }: { match: CcMatch; me: string }) {
  const { ws, title, sub } = summary(g, me);
  const order = g.lineup.map((s, k) => ({ s, k, n: housesOf(g.state, k) })).sort((a, b) => b.n - a.n);
  return (
    <Result round={g.round} title={`${ws.length ? "🏆" : "🏚️"} ${title}`} sub={sub}>
      <Standings
        rows={order.map(({ s, k, n }) => ({
          uid: s.uid,
          name: s.uid === me ? "Bạn" : (s.member?.name ?? "Ai đó"),
          rank: n > 0 ? order.filter((x) => x.n > n).length + 1 : 0,
          mark: <span className="h-3 w-3 flex-none rounded-full" style={{ background: CC_TONES[k] }} aria-hidden="true" />,
          value: `${n} 🏠`,
        }))}
      />
    </Result>
  );
}

function useTurnLeft(since: number | undefined, on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return since ? Math.max(0, Math.ceil((since + TURN_MS - now) / 1000)) : 0;
}

function ActionBar({ view, session, onAim, canAim, busy }: { view: View; session: CoChepRoom; onAim: () => void; canAim: boolean; busy: boolean }) {
  const m = view.meta!;
  const g = view.game?.match;
  const s = g?.state;
  const playing = m.status === "playing";
  const left = useTurnLeft(g?.since, playing && !g?.result);
  const name = (k: number) => (g?.lineup[k]?.uid === view.me ? "bạn" : (g?.lineup[k]?.member?.name ?? "Ai đó"));

  if (!playing)
    return (
      <StatusBar
        stack
        message={seatMessage(view, {
          enough: true,
          startHint: "Bấm Bắt đầu khi đủ người (chơi một mình để luyện tay cũng được).",
          join: <>Bấm “Vào chơi” để giành ghế (tối đa {m.seats} người).</>,
        })}
      >
        <SeatButtons view={view} session={session} blocked={startBlocker(view, { min: 1 })} />
      </StatusBar>
    );

  let message: React.ReactNode;
  let tone: string = TONE.idle;
  if (!g || !s || g.result || busy) {
    // Đang diễn lại các bước vừa xảy ra — chưa báo trước kết quả.
    message = <>👀 Xem diễn biến trên sân…</>;
  } else {
    const clock = left > 0 && left <= 20 ? <span className="ml-1 tabular-nums text-coral">⏱ {left}s</span> : null;
    if (g.myTurn) {
      tone = TONE.turn;
      message =
        s.need === "hop" ? (
          <>🦩 Đá vẫn nằm ở {cellName(s.players[g.me].stone)} — tự nhảy tiếp…</>
        ) : s.need === "back" ? (
          <>🙈 Nhảy chẹp quanh đá xong — chọi qua lưng để chiếm nhà!{clock}</>
        ) : (
          <>
            🎯 Đến lượt bạn — chọi đá vào <b>{cellName(s.target)}</b>
            {clock}
          </>
        );
    } else {
      const who = s.players[s.turn];
      const doing = !who ? "" : who.back ? "chọi qua lưng" : who.stone ? "nhảy tiếp" : `chọi ${cellName(targetOf(s.owners, who))}`;
      message = (
        <>
          ⏳ Lượt của <b style={{ color: CC_TONES[s.turn] }}>{name(s.turn)}</b> — đang {doing}
          {clock}
        </>
      );
    }
  }

  const inLineup = !!g && g.me >= 0 && !s?.players[g.me]?.out;
  return (
    <StatusBar stack tone={tone} message={message}>
      {canAim && (
        <button type="button" className="btn btn-sun btn-nudge" onClick={onAim}>
          🎯 Chọi đá
        </button>
      )}
      {view.isHost && (
        <ConfirmButton className="btn" onConfirm={() => session.finish()} confirmLabel="Bấm lần nữa để chốt ván">
          🏁 Chốt ván
        </ConfirmButton>
      )}
      {inLineup && (g?.lineup.length ?? 0) > 1 && <ResignButton label="Bỏ cuộc" onConfirm={() => session.resign()} />}
    </StatusBar>
  );
}
