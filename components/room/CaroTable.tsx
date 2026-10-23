"use client";

import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { emptyState, normOptions, SIZES, sizeLabel, TURN_LIMITS, turnLabel } from "@/lib/games/caro";
import type { CaroMatch, CaroRoom, CaroView } from "@/lib/net/caro-room";
import type { RoomState, SeatView } from "@/lib/net/room";
import { CaroBoard, MarkIcon } from "./CaroBoard";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, DrawCine, Duel, Fighter, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel, SeatCard } from "./People";
import { DuelResult, type DuelSummary } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout, SpectatorNote, WaitingOverlay } from "./RoomLayout";
import { StageArea } from "./stage";
import { forfeitWhy, ResignButton, SeatButtons, seatMessage, StatusBar, TONE } from "./StatusBar";
import { shortTurn, SQUARE_FIT, squareCenter, TimeBar, TurnClock, useTimeLeft } from "./TurnClock";
import { shallowEqual, useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

const CHEERS = ["🎉", "🏆", "✨", "🎊", "❌", "⭕"];
/** Thắng bằng chuỗi 5 thì chờ một nhịp cho mọi người kịp thấy đường thắng trên bàn rồi mới diễn. */
const LINE_PAUSE_MS = 1100;
const MARK_TONE = { 1: "var(--coral)", 2: "var(--sky)" } as const;

// Mỗi phần đăng ký đúng store mình cần để đổi gì thì chỉ phần đọc store đó vẽ lại.
export function CaroTable({ id, slug, session }: { id: string; slug: string; session: CaroRoom }) {
  const head = useRoomState(session, headOf, shallowEqual);
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <RoomHeader name={head.name} status={head.status} round={head.round}>
        <span className="chip text-ink-2">
          ▦ {sizeLabel(head.size)}
        </span>
        <span className="chip" style={{ color: head.block ? "var(--sun)" : "var(--ink-3)" }}>
          {head.block ? "🚧 Chặn 2 đầu" : "Không chặn 2 đầu"}
        </span>
        {head.turn > 0 && <span className="chip text-ink-2">⏱ {shortTurn(head.turn)}/lượt</span>}
      </RoomHeader>

      <DuelBar session={session} />
      <ActionBar session={session} />
      <Settings session={session} />
      <Result session={session} />
      <Play session={session} />
    </RoomLayout>
  );
}

// Bàn còn đang hiện ván đã chơi thì ghi luật của ván đó; luật ván tới nằm ở khung cài đặt bên dưới.
const headOf = (r: RoomState) => {
  const m = r.meta!;
  const opts = m.status !== "waiting" && m.cr ? m.cr : normOptions(m.opts);
  return {
    name: m.name,
    status: m.status,
    round: m.round,
    size: opts.size,
    block: opts.blockTwoEnds,
    turn: opts.turn,
  };
};

const duelOf = (r: RoomState) => {
  const m = r.meta!;
  return {
    me: r.me,
    status: m.status,
    seats: m.seats,
    host: m.host,
    scored: m.scored ?? 0,
  };
};

const shownMatch = (game: CaroView | undefined, status: string) => {
  const g = game?.match;
  return g && (status !== "waiting" || g.state.count > 0) ? g : undefined;
};

function useDuel(session: CaroRoom) {
  const room = useRoomState(session, duelOf, shallowEqual);
  const game = useGame(session);
  const seats = usePeople(session, (p) => p.seats);
  const g = shownMatch(game, room.status);
  const slots = g ? g.lineup : Array.from({ length: room.seats }, (_, i) => seats[i]);
  const wins = game?.wins ?? {};
  const winsOf = (k: number) => (slots[k]?.uid ? (wins[slots[k]!.uid] ?? 0) : 0);
  // Lúc trình chiếu (`stacked`) không có ô tỉ số ở giữa, nên mỗi thẻ tự ghi số ván thắng của mình.
  const seat = (k: 0 | 1, stacked?: boolean) => (
    <SeatCard
      seat={slots[k]}
      mark={g ? ((k + 1) as 1 | 2) : undefined}
      active={room.status === "playing" && (g?.state.turn ?? 0) === k + 1}
      isHost={slots[k]?.uid === room.host}
      me={room.me}
      align={k ? "right" : "left"}
      stacked={stacked}
      footer={stacked && slots[k] ? <Wins n={winsOf(k)} color={winsOf(k) > winsOf(1 - k) ? (k ? "var(--sky)" : "var(--coral)") : undefined} /> : undefined}
    />
  );
  return { seat, slots, wins, draws: game?.draws ?? 0, played: room.scored };
}

function DuelBar({ session }: { session: CaroRoom }) {
  const { seat, slots, wins, draws, played } = useDuel(session);
  return (
    <div className="mb-4 flex items-stretch gap-2 sm:gap-4">
      {seat(0)}
      <Score left={slots[0]?.uid} right={slots[1]?.uid} wins={wins} draws={draws} played={played} />
      {seat(1)}
    </div>
  );
}

function Result({ session }: { session: CaroRoom }) {
  const { me, ended } = useRoomState(session, (r) => ({ me: r.me, ended: r.meta!.status === "ended" }), shallowEqual);
  const g = useGame(session, (v) => v?.match);
  if (!ended || !g?.result) return null;
  return <DuelResult round={g.round} summary={summary(g, me)} me={me} />;
}

const playOf = (r: RoomState) => {
  const m = r.meta!;
  return {
    me: r.me,
    isHost: r.isHost,
    seated: r.mySeat >= 0,
    status: m.status,
    round: m.round,
    players: m.players.length,
    seats: m.seats,
  };
};

function Play({ session }: { session: CaroRoom }) {
  const room = useRoomState(session, playOf, shallowEqual);
  const game = useGame(session);
  const { seat } = useDuel(session);
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);
  const g = game?.match;
  const live = room.status === "playing" && g?.round === room.round && !g.result;
  const count = useCountdown(live && g!.state.count === 0 ? g!.round : 0);
  const end = useEndScene(g?.result ? g.round : 0, {
    delay: g?.result?.reason === "line" ? LINE_PAUSE_MS : 0,
    cheer: g?.result?.loser !== room.me,
    emojis: CHEERS,
  });
  const shown = shownMatch(game, room.status);
  const size = game?.opts.size ?? 15;
  const state = useMemo(() => shown?.state ?? emptyState(size), [shown?.state, size]);
  const onPlay = useCallback((x: number, y: number) => session.move(x, y), [session]);
  const inLineup = !!g && g.myMark > 0;
  const timed = live && g!.opts.turn > 0;

  return (
    <>
      <StageArea className="relative mt-4" fit={SQUARE_FIT} center={squareCenter(timed)} flanks={[seat(0, true), seat(1, true)]} tools={<Controls session={session} />}>
        {/* Hiện suốt ván có bấm giờ (lúc đếm ngược mở màn thì đầy) để bàn không bị đẩy xuống khi đồng hồ bắt đầu chạy. */}
        {timed && <TurnBar match={g!} />}
        <div ref={boardRef} className="card overflow-hidden p-2 sm:p-3" style={{ background: "var(--board)" }}>
          <CaroBoard state={state} canPlay={!!g?.myTurn && !count} myMark={g?.myMark ?? 0} onPlay={onPlay} />
        </div>
        <Flyers flyers={flyers} />
        {!shown && room.status === "waiting" && <WaitingOverlay isHost={room.isHost} players={room.players} seats={room.seats} />}
      </StageArea>
      {!room.seated && !inLineup && <SpectatorNote />}

      {g && count > 0 && <CountdownScene match={g} me={room.me} n={count} />}
      {g?.result && end.shown && <EndScene match={g} me={room.me} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
}

// Tách riêng để đồng hồ chạy chỉ vẽ lại thanh này, không kéo cả bàn cờ vẽ lại theo. Hạn chót nước đầu tính cả lúc đếm
// ngược mở màn nên kẹp lại để thanh đầy trong lúc đó.
function TurnBar({ match: g }: { match: CaroMatch }) {
  const total = g.opts.turn * 1000;
  return <TimeBar left={Math.min(total, useTimeLeft(g.deadline))} total={total} tone={MARK_TONE[g.state.turn]} />;
}

const fighter = (seat: SeatView | undefined, mark: 1 | 2, me: string, side: "left" | "right") => (
  <Fighter
    p={seat?.member}
    name={seat?.uid === me ? "Bạn" : (seat?.member?.name ?? "Ai đó")}
    sub={mark === 1 ? "Quân X · đi trước" : "Quân O"}
    ring={mark === 1 ? "#ff5a5f" : "#2f7bff"}
    badge={<MarkIcon v={mark} size={24} />}
    side={side}
  />
);

function CountdownScene({ match: g, me, n }: { match: CaroMatch; me: string; n: number }) {
  const tip = g.myMark === 1 ? "Bạn cầm X — đi trước nhé!" : g.myMark === 2 ? "Bạn cầm O — chờ X đi trước nhé!" : "X đi trước — cùng xem ván cờ nhé!";
  return (
    <CountdownCine eyebrow={`⭕ Cờ Caro · Ván ${g.round}`} n={n} tip={tip}>
      <Duel left={fighter(g.lineup[0], 1, me, "left")} right={fighter(g.lineup[1], 2, me, "right")} />
    </CountdownCine>
  );
}

function summary(g: CaroMatch, me: string): DuelSummary {
  const r = g.result!;
  if (!r.winner)
    return {
      winner: null,
      title: "Hoà cờ!",
      sub: `Ván ${g.round} hoà — kín bàn sau ${g.state.count} nước`,
    };
  const k = g.lineup.findIndex((s) => s.uid === r.winner);
  const why = forfeitWhy(r) ?? `${g.state.line.length} quân liên tiếp sau ${g.state.count} nước`;
  return {
    winner: r.winner,
    title: r.winner === me ? "Bạn chiến thắng!" : `${g.lineup[k]?.member?.name ?? "Ai đó"} chiến thắng!`,
    sub: `Quân ${k === 0 ? "X" : "O"} · ${why}`,
    note: r.loser === me ? "Bạn thua ván này — ván sau phục thù nhé!" : undefined,
  };
}

function EndScene({ match: g, me, onClose }: { match: CaroMatch; me: string; onClose: () => void }) {
  const s = summary(g, me);
  if (!s.winner)
    return (
      <DrawCine
        people={g.lineup.map((x, k) => ({
          uid: x.uid,
          p: x.member,
          ring: k ? "#2f7bff" : "#ff5a5f",
        }))}
        title={s.title}
        sub={s.sub}
        onClose={onClose}
      />
    );
  const k = g.lineup.findIndex((x) => x.uid === s.winner);
  return (
    <WinCine
      winners={[
        {
          uid: s.winner,
          p: g.lineup[k]?.member,
          badge: <MarkIcon v={(k + 1) as 1 | 2} size={22} />,
        },
      ]}
      title={s.title}
      sub={s.sub}
      note={s.note}
      onClose={onClose}
    />
  );
}

export function Score({ left, right, wins, draws, played }: { left?: string; right?: string; wins: Record<string, number>; draws: number; played: number }) {
  if (!played)
    return (
      <span className="self-center font-display text-xl font-extrabold text-ink-3 sm:text-2xl" aria-hidden="true">
        VS
      </span>
    );
  const a = left ? (wins[left] ?? 0) : 0;
  const b = right ? (wins[right] ?? 0) : 0;
  return (
    <div className="flex flex-none flex-col items-center justify-center gap-1 self-center" aria-label={`Tỉ số ${a} – ${b}${draws ? `, hoà ${draws}` : ""}`}>
      <span className="text-[11px] font-bold tracking-wide text-ink-3 uppercase" aria-hidden="true">
        🏆 Thắng
      </span>
      <span className="font-display text-2xl leading-none font-extrabold tabular-nums sm:text-3xl" aria-hidden="true">
        <span style={{ color: a > b ? "var(--coral)" : undefined }}>{a}</span>
        <span className="mx-1 text-ink-3">–</span>
        <span style={{ color: b > a ? "var(--sky)" : undefined }}>{b}</span>
      </span>
      {draws > 0 && (
        <span className="text-[11.5px] font-semibold text-ink-3" aria-hidden="true">
          Hoà {draws}
        </span>
      )}
    </div>
  );
}

export function Wins({ n, color }: { n: number; color?: string }) {
  return (
    <p className="mt-2 font-display text-2xl leading-none font-extrabold tabular-nums sm:text-3xl" style={{ color }} aria-label={n ? `Thắng ${n} ván` : "Chưa thắng ván nào"}>
      {n || "–"}
    </p>
  );
}

function useActions(session: CaroRoom): {
  tone?: string;
  message: ReactNode;
  buttons?: ReactNode;
  clock?: { deadline: number; limit: number };
} {
  const room = useRoomState(session);
  const people = usePeople(session);
  const g = useGame(session, (v) => v?.match);
  const m = room.meta!;
  const view = { ...room, seats: people.seats };
  const name = (uid?: string | null) => (uid ? (people.members.find((p) => p.uid === uid)?.name ?? g?.lineup.find((s) => s.uid === uid)?.member?.name ?? "Ai đó") : "");

  if (m.status === "playing" && g) {
    const clock = g.opts.turn ? { deadline: g.deadline, limit: g.opts.turn } : undefined;
    if (!g.myMark)
      return {
        message: (
          <>
            👀 Đang xem — lượt của <b>{name(g.lineup[g.state.turn - 1]?.uid)}</b>
          </>
        ),
        clock,
      };
    const mine = <b>{g.myMark === 1 ? "X" : "O"}</b>;
    return {
      tone: g.myTurn ? TONE.turn : TONE.idle,
      message: g.myTurn ? (
        <>
          🎯 Đến lượt bạn — đánh {mine}
          {clock && " trước khi hết giờ"}
        </>
      ) : (
        <>⏳ Chờ đối thủ đi…</>
      ),
      buttons: <ResignButton onConfirm={() => session.resign()} />,
      clock,
    };
  }
  return {
    message: seatMessage(view),
    buttons: <SeatButtons view={view} session={session} />,
  };
}

// Đồng hồ ẩn với trình đọc màn hình để thanh trạng thái (vùng `aria-live`) không đọc lại mỗi giây.
function ActionBar({ session }: { session: CaroRoom }) {
  const { tone, message, buttons, clock } = useActions(session);
  return (
    <StatusBar tone={tone} message={message}>
      {clock && clock.deadline > 0 && <Clock {...clock} />}
      {buttons}
    </StatusBar>
  );
}

function Clock({ deadline, limit }: { deadline: number; limit: number }) {
  return <TurnClock left={Math.min(limit * 1000, useTimeLeft(deadline))} />;
}

function Controls({ session }: { session: CaroRoom }) {
  return useActions(session).buttons;
}

function Settings({ session }: { session: CaroRoom }) {
  const { host, playing } = useRoomState(session, (r) => ({ host: r.isHost, playing: r.meta!.status === "playing" }), shallowEqual);
  const opts = useGame(session, (v) => v?.opts);
  if (playing || !opts) return null;
  const row = (label: string, items: ReactNode) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[86px] text-[13px] font-bold text-ink-3">{label}</span>
      <div className="flex flex-1 flex-wrap gap-2">{items}</div>
    </div>
  );
  const pick = (key: string | number, on: boolean, label: ReactNode, set: () => void, aria?: string) => (
    <button key={key} type="button" className={`btn btn-sm ${on ? "btn-coral" : ""}`} aria-pressed={on} aria-label={aria} disabled={!host && !on} onClick={host ? set : undefined}>
      {label}
    </button>
  );
  return (
    <section className="card mt-4 grid gap-3 p-4" aria-label="Luật ván tới">
      {row(
        "Cỡ bàn",
        SIZES.map((s) => pick(s, s === opts.size, sizeLabel(s), () => session.setOptions({ size: s }))),
      )}
      {row(
        "Chặn 2 đầu",
        [true, false].map((b) => pick(String(b), b === opts.blockTwoEnds, b ? "🚧 Bật" : "Tắt", () => session.setOptions({ blockTwoEnds: b }))),
      )}
      {row(
        "Mỗi lượt",
        TURN_LIMITS.map((t) => pick(t, t === opts.turn, `⏱ ${t ? turnLabel(t) : "Vô hạn"}`, () => session.setOptions({ turn: t }), turnLabel(t))),
      )}
      {!host && <p className="text-[13.5px] text-ink-2">Chủ phòng chọn cỡ bàn, luật chặn hai đầu và thời gian mỗi lượt cho ván tới.</p>}
    </section>
  );
}
