"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emptyState, type End, type Side, type XqState } from "@/lib/games/xiangqi";
import type { Result, RoomState, RoomView, SeatView } from "@/lib/net/room";
import type { XiangqiRoom, XqMatch, XqView } from "@/lib/net/xiangqi-room";
import { Score, Wins } from "./CaroTable";
import { ChatPanel } from "./ChatPanel";
import { Cine, DrawCine, Duel, Eyebrow, Fighter, Party, Stamp, Tip, useEndScene, useMoment, WinCine } from "./Cine";
import { PeoplePanel, SeatCard } from "./People";
import { DuelResult, type DuelSummary } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout, SpectatorNote, WaitingOverlay } from "./RoomLayout";
import { StageArea, useStaged } from "./stage";
import { ResignButton, SeatButtons, seatMessage, StatusBar, TONE } from "./StatusBar";
import { shallowEqual, useFlyers, useGame, usePeople, useRoomState } from "./useRoom";
import { PieceIcon, XiangqiBoard, type Script } from "./XiangqiBoard";

type View = Omit<RoomView<XqView>, "chat">;

// Ghép riêng ba store để phần bàn không vẽ lại theo nhịp tim, theo tin chat, và không kéo các phần khác theo.
function useXqView(session: XiangqiRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const SIDE_NAME = { 1: "Đỏ", 2: "Đen" } as const;
const SIDE_TONE = { 1: "#d62828", 2: "#2b2540" } as const;
const CONFETTI = ["🎉", "🏆", "✨", "🎊", "🧧", "⭐"];

const INTRO_MS = 4200;
const CHECK_MS = 1500;
// Bàn 9×10 (392×432) cộng 24px viền khung (p-2.5 + viền 2px): lúc trình chiếu bàn rộng tối đa sao cho cả khung vừa chiều cao.
const BOARD_W = "(100cqh - 24px) * 0.907 + 24px";
const BOARD_FIT = "w-[min(100cqw,(100cqh_-_24px)*0.907_+_24px)]";

function reasonOf(r: Result, end: End | null) {
  switch (r.reason) {
    case "resign":
      return "đối thủ xin thua";
    case "leave":
      return "đối thủ rời trận";
    case "kick":
      return "đối thủ bị mời ra";
    case "cheat":
      return "đối thủ gian lận";
    case "agree":
      return "hai bên đồng ý hoà";
  }
  switch (end) {
    case "mate":
      return "chiếu bí";
    case "stuck":
      return "đối thủ hết nước đi";
    case "perpetual":
      return "đối thủ chiếu dai — phạm luật";
    case "repeat":
      return "lặp lại thế cờ ba lần";
    case "idle":
      return "60 nước mỗi bên không ăn quân";
    case "bare":
      return "hai bên hết quân tấn công";
  }
  return "";
}

const SCRIPT_KEY = "arena:xiangqi:script";

function useScript() {
  const [script, setScript] = useState<Script>(() => {
    try {
      return localStorage.getItem(SCRIPT_KEY) === "viet" ? "viet" : "han";
    } catch {
      return "han";
    }
  });
  const set = (v: Script) => {
    setScript(v);
    try {
      localStorage.setItem(SCRIPT_KEY, v);
    } catch {}
  };
  return [script, set] as const;
}

export function XiangqiTable({ id, slug, session }: { id: string; slug: string; session: XiangqiRoom }) {
  const head = useRoomState(session, headOf, shallowEqual);
  const [script, setScript] = useScript();

  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <RoomHeader name={head.name} status={head.status} round={head.round}>
        <span className="chip" style={{ color: SIDE_TONE[1] }}>
          🔴 Đỏ đi trước
        </span>
        <button
          type="button"
          className="chip text-ink-2 hover:text-ink"
          onClick={() => setScript(script === "han" ? "viet" : "han")}
          title="Đổi chữ trên quân cờ (chỉ trên máy bạn)"
        >
          {script === "han" ? "帥 Chữ Hán" : "🔤 Chữ Việt"}
        </button>
      </RoomHeader>

      <DuelPart session={session} script={script} />
      <ActionPart session={session} />
      <ResultPart session={session} />
      <PlayPart session={session} script={script} />
    </RoomLayout>
  );
}

const headOf = (r: RoomState) => ({ name: r.meta!.name, status: r.meta!.status, round: r.meta!.round });

const showOf = (view: View) => {
  const g = view.game?.match;
  return !!g && (view.meta!.status !== "waiting" || g.state.count > 0);
};

const DuelPart = memo(function DuelPart({ session, script }: { session: XiangqiRoom; script: Script }) {
  const view = useXqView(session);
  const m = view.meta!;
  const { match: g, wins, draws } = view.game!;
  const showGame = showOf(view);
  const state = showGame ? g!.state : null;
  const playing = m.status === "playing";
  const slots = showGame ? g!.lineup : Array.from({ length: m.seats }, (_, i) => view.seats[i]);
  return (
    <>
      <div className="mb-2 flex items-stretch gap-2 sm:gap-4">
        <SeatCard
          seat={slots[0]}
          mark={showGame ? 1 : undefined}
          badge={showGame ? SIDE_NAME[1] : undefined}
          tone={showGame ? SIDE_TONE[1] : undefined}
          active={playing && !g?.result && (state?.turn ?? 1) === 1}
          isHost={slots[0]?.uid === m.host}
          me={view.me}
        />
        <Score left={slots[0]?.uid} right={slots[1]?.uid} wins={wins} draws={draws} played={m.scored ?? 0} />
        <SeatCard
          seat={slots[1]}
          mark={showGame ? 2 : undefined}
          badge={showGame ? SIDE_NAME[2] : undefined}
          tone={showGame ? SIDE_TONE[2] : undefined}
          active={playing && !g?.result && (state?.turn ?? 1) === 2}
          isHost={slots[1]?.uid === m.host}
          me={view.me}
          align="right"
        />
      </div>
      {state && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <Captured pieces={state.captured.filter((v) => v < 0)} script={script} />
          <Captured pieces={state.captured.filter((v) => v > 0)} script={script} align="right" />
        </div>
      )}
    </>
  );
});

const ActionPart = memo(function ActionPart({ session }: { session: XiangqiRoom }) {
  const view = useXqView(session);
  return <ActionBar view={view} session={session} />;
});

const ResultPart = memo(function ResultPart({ session }: { session: XiangqiRoom }) {
  const { me, ended } = useRoomState(session, (r) => ({ me: r.me, ended: r.meta!.status === "ended" }), shallowEqual);
  const g = useGame(session, (v) => v?.match);
  return ended && g?.result ? <DuelResult round={g.round} summary={summary(g, me)} me={me} /> : null;
});

// Lúc trình chiếu mỗi bên một thẻ người chơi xếp dọc, ghi luôn số ván thắng và quân đã ăn (không có hàng tỉ số ở giữa).
const FlankPart = memo(function FlankPart({ session, script, k }: { session: XiangqiRoom; script: Script; k: 0 | 1 }) {
  const view = useXqView(session);
  const m = view.meta!;
  const { match: g, wins } = view.game!;
  const showGame = showOf(view);
  const state = showGame ? g!.state : null;
  const side = (k + 1) as Side;
  const slots = showGame ? g!.lineup : Array.from({ length: m.seats }, (_, i) => view.seats[i]);
  const seat = slots[k];
  const winsOf = (i: number) => (slots[i]?.uid ? (wins[slots[i]!.uid] ?? 0) : 0);
  return (
    <SeatCard
      seat={seat}
      mark={showGame ? side : undefined}
      badge={showGame ? SIDE_NAME[side] : undefined}
      tone={showGame ? SIDE_TONE[side] : undefined}
      active={m.status === "playing" && !g?.result && (state?.turn ?? 1) === side}
      isHost={seat?.uid === m.host}
      me={view.me}
      align={k ? "right" : "left"}
      stacked
      footer={
        seat ? (
          <>
            <Wins n={winsOf(k)} color={winsOf(k) > winsOf(1 - k) ? SIDE_TONE[side] : undefined} />
            {state && <Captured pieces={state.captured.filter((v) => (k ? v > 0 : v < 0))} script={script} align="center" />}
          </>
        ) : undefined
      }
    />
  );
});

const ControlsPart = memo(function ControlsPart({ session }: { session: XiangqiRoom }) {
  const view = useXqView(session);
  return <Buttons view={view} session={session} />;
});

const PlayPart = memo(function PlayPart({ session, script }: { session: XiangqiRoom; script: Script }) {
  const view = useXqView(session);
  const m = view.meta!;
  const g = view.game!.match;
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);
  const scenes = useScenes(view);
  const showGame = showOf(view);
  const state = useMemo(() => (showGame ? g!.state : emptyState()), [showGame, g]);
  const seated = view.mySeat >= 0;
  const inLineup = !!g && g.mySide > 0;
  const flip = showGame && g!.mySide === 2;
  const onMove = useCallback((from: number, to: number) => session.move(from, to), [session]);
  const staged = useStaged();

  return (
    <>
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_210px]">
        <StageArea
          className="relative"
          fit={BOARD_FIT}
          center={BOARD_W}
          flanks={[<FlankPart key={0} session={session} script={script} k={0} />, <FlankPart key={1} session={session} script={script} k={1} />]}
          tools={<ControlsPart session={session} />}
        >
          <div ref={boardRef} className={`card overflow-hidden ${staged ? "p-2.5" : "mx-auto max-w-[600px] p-1.5 sm:p-2.5"}`}>
            <XiangqiBoard
              key={`${g?.round ?? 0}:${flip}`}
              state={state}
              canPlay={!!g?.myTurn && !scenes.intro.shown}
              mySide={g?.mySide ?? 0}
              flip={flip}
              script={script}
              onMove={onMove}
            />
          </div>
          <Flyers flyers={flyers} />
          {scenes.check && (
            <div className="xq-check-flash" aria-live="assertive">
              <span>Chiếu tướng!</span>
            </div>
          )}
          {!showGame && m.status === "waiting" && <WaitingOverlay isHost={view.isHost} players={m.players.length} seats={m.seats} />}
        </StageArea>
        <MoveList state={state} />
      </div>
      {!seated && !inLineup && <SpectatorNote />}

      {g && scenes.intro.shown && <IntroScene match={g} me={view.me} script={script} onClose={scenes.intro.close} />}
      {g?.result && scenes.end.shown && <EndScene match={g} me={view.me} script={script} onClose={scenes.end.close} />}
      <Party bits={scenes.end.party} />
    </>
  );
});

function useScenes(view: View) {
  const m = view.meta!;
  const g = view.game?.match;
  const live = m.status === "playing" && g?.round === m.round && !g.result;
  const intro = useMoment(live && g!.state.count === 0 ? g!.round : 0, INTRO_MS);
  const end = useEndScene(g?.result ? g.round : 0, { cheer: g?.result?.loser !== view.me, emojis: CONFETTI });
  const check = useMoment(live && g!.state.check ? `${g!.round}:${g!.state.count}` : "", CHECK_MS);
  return { intro, end, check: check.shown };
}

function fighter(seat: SeatView, side: Side, me: string, script: Script) {
  return (
    <Fighter
      p={seat.member}
      name={seat.uid === me ? "Bạn" : (seat.member?.name ?? "Ai đó")}
      sub={`Quân ${SIDE_NAME[side]}${side === 1 ? " · đi trước" : ""}`}
      ring={side === 1 ? "#ffc23d" : "#f1eeff"}
      badge={<PieceIcon v={side === 1 ? 1 : -1} script={script} size={44} />}
      plainBadge
      side={side === 1 ? "left" : "right"}
    />
  );
}

function IntroScene({ match: g, me, script, onClose }: { match: XqMatch; me: string; script: Script; onClose: () => void }) {
  const tip =
    g.mySide === 1 ? "Bạn cầm quân Đỏ — đi trước nhé!" : g.mySide === 2 ? "Bạn cầm quân Đen — chờ Đỏ đi trước nhé!" : "Quân Đỏ đi trước — cùng xem ván cờ nhé!";
  return (
    <Cine tone="red" label="Khai cuộc" onClose={onClose} skip="Bấm để vào bàn" gap={6}>
      <Eyebrow>🀄 Cờ Tướng · Ván {g.round}</Eyebrow>
      <Duel left={fighter(g.lineup[0], 1, me, script)} right={fighter(g.lineup[1], 2, me, script)} />
      <Stamp>Khai cuộc!</Stamp>
      <Tip>{tip}</Tip>
    </Cine>
  );
}

function summary(g: XqMatch, me: string): DuelSummary {
  const r = g.result!;
  const why = reasonOf(r, g.state.end);
  if (!r.winner) return { winner: null, title: "Hoà cờ!", sub: why ? `Ván ${g.round} hoà — ${why}` : undefined };
  const k = g.lineup.findIndex((s) => s.uid === r.winner);
  const side = (k + 1) as Side;
  return {
    winner: r.winner,
    title: r.winner === me ? "Bạn chiến thắng!" : `${g.lineup[k]?.member?.name ?? "Ai đó"} chiến thắng!`,
    sub: `Quân ${SIDE_NAME[side]}${why ? ` · ${why[0].toUpperCase()}${why.slice(1)}` : ""}${r.reason === "mate" && g.state.end === "mate" ? ` sau ${g.state.count} nước` : ""}`,
    note: r.loser === me ? "Bạn thua ván này — ván sau phục thù nhé!" : undefined,
  };
}

function EndScene({ match: g, me, script, onClose }: { match: XqMatch; me: string; script: Script; onClose: () => void }) {
  const s = summary(g, me);
  if (!s.winner) return <DrawCine people={g.lineup.map((x, k) => ({ uid: x.uid, p: x.member, ring: SIDE_TONE[(k + 1) as Side] }))} title={s.title} sub={s.sub} onClose={onClose} />;
  const k = g.lineup.findIndex((x) => x.uid === s.winner);
  const side = (k + 1) as Side;
  return <WinCine winners={[{ uid: s.winner, p: g.lineup[k]?.member, badge: <PieceIcon v={side === 1 ? 1 : -1} script={script} size={40} />, plainBadge: true }]} title={s.title} sub={s.sub} note={s.note} onClose={onClose} />;
}

function Captured({ pieces, script, align = "left" }: { pieces: number[]; script: Script; align?: "left" | "right" | "center" }) {
  const order = [...pieces].sort((a, b) => Math.abs(b) - Math.abs(a) || 0);
  return (
    <div
      className={`flex min-h-[26px] min-w-0 flex-1 flex-wrap gap-0.5 ${align === "right" ? "justify-end" : align === "center" ? "seat-captured mt-2 justify-center" : ""}`}
      aria-label={`Đã ăn ${pieces.length} quân`}
    >
      {order.map((v, i) => (
        <PieceIcon key={i} v={v} script={script} size={24} />
      ))}
    </div>
  );
}

function MoveList({ state }: { state: XqState }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.count]);
  const rows: [string, string | undefined][] = [];
  for (let i = 0; i < state.notes.length; i += 2) rows.push([state.notes[i], state.notes[i + 1]]);
  return (
    <section className="card p-3" aria-label="Biên bản nước đi">
      <h2 className="mb-2 flex items-center justify-between font-display text-[15px] font-extrabold">
        📜 Biên bản <span className="text-xs font-bold text-ink-3">{state.count} nước</span>
      </h2>
      {rows.length ? (
        <ol ref={ref} className="xq-moves grid max-h-[200px] gap-0.5 overflow-y-auto text-[13.5px] lg:max-h-[440px]">
          {rows.map(([a, b], n) => (
            <li key={n} className="grid grid-cols-[28px_1fr_1fr] items-center rounded-md px-1 py-0.5 tabular-nums odd:bg-sunken">
              <span className="text-xs font-bold text-ink-3">{n + 1}.</span>
              <b style={{ color: SIDE_TONE[1] }}>{a}</b>
              <b className="text-ink">{b ?? ""}</b>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-ink-3">Chưa có nước nào. Ký hiệu: P2-5 (Pháo cột 2 bình sang cột 5), M8.7 (Mã tiến), X1/1 (Xe thoái).</p>
      )}
    </section>
  );
}

function ActionBar({ view, session }: { view: View; session: XiangqiRoom }) {
  const m = view.meta!;
  const g = view.game?.match;
  const name = (uid?: string | null) => (uid ? (uid === view.me ? "Bạn" : (g?.lineup.find((s) => s.uid === uid)?.member?.name ?? view.members.find((p) => p.uid === uid)?.name ?? "Ai đó")) : "");

  if (m.status === "playing" && g && !g.result) {
    if (!g.mySide) {
      const turn = g.lineup[g.state.turn - 1];
      return (
        <StatusBar
          message={
            <>
              👀 Đang xem — lượt của <b>{name(turn?.uid)}</b> (quân {SIDE_NAME[g.state.turn]}){g.state.check ? " — đang bị chiếu!" : ""}
            </>
          }
        />
      );
    }
    const theyOffer = g.offers.includes((3 - g.mySide) as Side);
    const iOffer = g.offers.includes(g.mySide);
    let tone: string = TONE.idle;
    let message: React.ReactNode = iOffer ? <>🤝 Bạn đã xin hoà — chờ đối thủ trả lời…</> : <>⏳ Chờ đối thủ đi…</>;
    if (theyOffer) {
      tone = TONE.info;
      message = <>🤝 Đối thủ xin hoà — bấm “Đồng ý hoà”, hoặc cứ đi tiếp để từ chối.</>;
    } else if (g.myTurn && g.state.check) {
      tone = TONE.alert;
      message = <>⚠️ Bạn đang bị chiếu — phải đỡ ngay!</>;
    } else if (g.myTurn) {
      tone = TONE.turn;
      message = <>🎯 Đến lượt bạn — cầm quân <b style={{ color: SIDE_TONE[g.mySide] }}>{SIDE_NAME[g.mySide]}</b></>;
    }
    return (
      <StatusBar tone={tone} message={message}>
        <Buttons view={view} session={session} />
      </StatusBar>
    );
  }
  return (
    <StatusBar message={seatMessage(view)}>
      <Buttons view={view} session={session} />
    </StatusBar>
  );
}

// Dùng chung cho thanh trạng thái và thanh công cụ lúc trình chiếu.
function Buttons({ view, session }: { view: View; session: XiangqiRoom }) {
  const g = view.game?.match;
  if (view.meta!.status === "playing" && g && !g.result) {
    if (!g.mySide) return null;
    const theyOffer = g.offers.includes((3 - g.mySide) as Side);
    const iOffer = g.offers.includes(g.mySide);
    return (
      <>
        <button type="button" className={`btn ${theyOffer ? "btn-lime btn-nudge" : ""}`} onClick={() => session.offerDraw()} disabled={iOffer}>
          🤝 {theyOffer ? "Đồng ý hoà" : iOffer ? "Đã xin hoà" : "Xin hoà"}
        </button>
        <ResignButton onConfirm={() => session.resign()} />
      </>
    );
  }
  return <SeatButtons view={view} session={session} />;
}
