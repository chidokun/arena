"use client";

import { memo, useMemo, useRef } from "react";
import { emptyState, REPEAT_DRAW, SETUP_NAME, SETUPS } from "@/lib/games/co-cho";
import type { CoChoMatch, CoChoRoom, CoChoView } from "@/lib/net/co-cho-room";
import type { RoomView, SeatView } from "@/lib/net/room";
import { Score, Wins } from "./CaroTable";
import { ChatPanel } from "./ChatPanel";
import { CD_NAME, CD_TONE, Cap, CoChoBoard, SLIDE_MS } from "./CoChoBoard";
import { CountdownCine, DrawCine, Duel, Fighter, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel, SeatCard } from "./People";
import { DuelResult, type DuelSummary } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout, SpectatorNote, WaitingOverlay } from "./RoomLayout";
import { StageArea } from "./stage";
import { forfeitWhy, ResignButton, SeatButtons, seatMessage, StatusBar, TONE } from "./StatusBar";
import { useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

type View = Omit<RoomView<CoChoView>, "chat">;

function useCoChoView(session: CoChoRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const CHEERS = ["🎉", "🏆", "✨", "🎊", "🐕", "🦴"];

// Phần bàn chơi bọc `memo` và tự đọc store để nhịp tim, tin chat hay người vào ra không làm bàn vẽ lại, và nước đi
// không làm danh sách người / khung chat vẽ lại.
export function CoChoTable({ id, slug, session }: { id: string; slug: string; session: CoChoRoom }) {
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <CoChoBody session={session} />
    </RoomLayout>
  );
}

const CoChoBody = memo(function CoChoBody({ session }: { session: CoChoRoom }) {
  const view = useCoChoView(session);
  const m = view.meta!;
  const { match: g, wins, draws, setup } = view.game!;
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);
  const live = m.status === "playing" && g?.round === m.round && !g.result;
  const count = useCountdown(live && g!.state.count === 0 ? g!.round : 0);
  // Hết ván vì bị chặn / hoà do lặp thế thì chờ quân cuối trượt xong rồi mới diễn.
  const end = useEndScene(g?.result ? g.round : 0, { delay: g?.result?.reason === "blocked" || g?.result?.reason === "draw" ? SLIDE_MS + 450 : 0, cheer: g?.result?.loser !== view.me, emojis: CHEERS });

  const showGame = !!g && (m.status !== "waiting" || g.state.count > 0);
  const state = showGame ? g!.state : emptyState(setup);
  const playing = m.status === "playing";
  const seated = view.mySeat >= 0;
  const inLineup = !!g && g.myMark > 0;

  const slots = showGame ? g!.lineup : Array.from({ length: m.seats }, (_, i) => view.seats[i]);
  const winsOf = (k: number) => (slots[k]?.uid ? (wins[slots[k]!.uid] ?? 0) : 0);
  // Lúc trình chiếu (`stacked`) không có ô tỉ số ở giữa, nên mỗi thẻ tự ghi số ván thắng của mình.
  const seatCard = (k: 0 | 1, stacked?: boolean) => {
    const v = (k + 1) as 1 | 2;
    return (
      <SeatCard
        seat={slots[k]}
        mark={showGame ? v : undefined}
        badge={showGame ? "●" : undefined}
        tone={showGame ? CD_TONE[v] : undefined}
        active={playing && state.turn === v && !state.over}
        isHost={slots[k]?.uid === m.host}
        me={view.me}
        align={k === 1 ? "right" : "left"}
        stacked={stacked}
        footer={stacked && slots[k] ? <Wins n={winsOf(k)} color={winsOf(k) > winsOf(1 - k) ? CD_TONE[v] : undefined} /> : undefined}
      />
    );
  };

  return (
    <>
      <RoomHeader name={m.name} status={m.status} round={m.round}>
        <span className="chip text-ink-2">
          🐕 Xếp {SETUP_NAME[state.setup].toLowerCase()}
          {!playing && setup !== state.setup && ` · ván tới ${SETUP_NAME[setup].toLowerCase()}`}
        </span>
      </RoomHeader>

      <div className="mb-4 flex items-stretch gap-2 sm:gap-4">
        {seatCard(0)}
        <Score left={slots[0]?.uid} right={slots[1]?.uid} wins={wins} draws={draws} played={m.scored ?? 0} />
        {seatCard(1)}
      </div>

      <ActionBar view={view} session={session} />
      {m.status === "ended" && g?.result && <DuelResult round={g.round} summary={summary(g, view.me)} me={view.me} />}

      <StageArea
        className="relative mx-auto mt-4 max-w-[460px]"
        fit="w-[min(100cqw,100cqh)]"
        flanks={[seatCard(0, true), seatCard(1, true)]}
        tools={<Buttons view={view} session={session} />}
      >
        <div ref={boardRef} className="card overflow-hidden p-2 sm:p-3" style={{ background: "var(--board)" }}>
          <CoChoBoard state={state} canPlay={!!g?.myTurn && !count} myMark={g?.myMark ?? 0} onMove={(from) => session.move(from)} />
        </div>
        <Flyers flyers={flyers} />
        {!showGame && m.status === "waiting" && <WaitingOverlay isHost={view.isHost} players={m.players.length} seats={m.seats} />}
      </StageArea>
      {!seated && !inLineup && <SpectatorNote />}

      {g && count > 0 && <CountdownScene match={g} me={view.me} n={count} />}
      {g?.result && end.shown && <EndScene match={g} me={view.me} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

const Badge = ({ v }: { v: 1 | 2 }) => (
  <svg viewBox="-14 -14 28 28" className="block h-[24px] w-[24px]" aria-hidden>
    <Cap v={v} r={12.5} />
  </svg>
);

const fighter = (seat: SeatView | undefined, v: 1 | 2, me: string, side: "left" | "right") => (
  <Fighter
    p={seat?.member}
    name={seat?.uid === me ? "Bạn" : (seat?.member?.name ?? "Ai đó")}
    sub={`Quân ${CD_NAME[v]}${v === 1 ? " · đi trước" : ""}`}
    ring={CD_TONE[v]}
    badge={<Badge v={v} />}
    side={side}
  />
);

function CountdownScene({ match: g, me, n }: { match: CoChoMatch; me: string; n: number }) {
  const tip = g.myMark ? `Bạn cầm quân ${CD_NAME[g.myMark]} — ${g.myMark === 1 ? "đi trước nhé!" : "chờ Đỏ đi trước nhé!"}` : "Quân Đỏ đi trước — cùng xem nhé!";
  return (
    <CountdownCine eyebrow={`🐕 Cờ Chó · Ván ${g.round}`} n={n} tip={tip}>
      <Duel left={fighter(g.lineup[0], 1, me, "left")} right={fighter(g.lineup[1], 2, me, "right")} />
    </CountdownCine>
  );
}

function summary(g: CoChoMatch, me: string): DuelSummary {
  const r = g.result!;
  if (!r.winner) return { winner: null, title: "Hoà!", sub: `Ván ${g.round} — thế cờ lặp lại ${REPEAT_DRAW} lần` };
  const k = g.lineup.findIndex((s) => s.uid === r.winner);
  const why = forfeitWhy(r) ?? `Chặn hết đường đi sau ${g.state.count} nước`;
  return {
    winner: r.winner,
    title: r.winner === me ? "Bạn chiến thắng!" : `${g.lineup[k]?.member?.name ?? "Ai đó"} chiến thắng!`,
    sub: `Quân ${CD_NAME[(k + 1) as 1 | 2]} · ${why}`,
    note: r.loser === me ? "Bạn bị chặn mất rồi — ván sau phục thù nhé!" : undefined,
  };
}

function EndScene({ match: g, me, onClose }: { match: CoChoMatch; me: string; onClose: () => void }) {
  const s = summary(g, me);
  if (!s.winner) return <DrawCine people={g.lineup.map((x, k) => ({ uid: x.uid, p: x.member, ring: CD_TONE[(k + 1) as 1 | 2] }))} title={s.title} sub={s.sub} onClose={onClose} />;
  const k = g.lineup.findIndex((x) => x.uid === s.winner);
  return <WinCine winners={[{ uid: s.winner, p: g.lineup[k]?.member, badge: <Badge v={(k + 1) as 1 | 2} /> }]} title={s.title} sub={s.sub} note={s.note} onClose={onClose} />;
}

function ActionBar({ view, session }: { view: View; session: CoChoRoom }) {
  const m = view.meta!;
  const g = view.game?.match;
  const name = (uid?: string | null) => (uid ? (view.members.find((p) => p.uid === uid)?.name ?? g?.lineup.find((s) => s.uid === uid)?.member?.name ?? "Ai đó") : "");

  if (m.status === "playing" && g) {
    const { turn, seen, legal } = g.state;
    const repeat = seen > 1 ? ` · thế cờ lặp lần ${seen}/${REPEAT_DRAW}` : "";
    if (!g.myMark)
      return (
        <StatusBar
          message={
            <>
              👀 Đang xem — lượt của <b>{name(g.lineup[turn - 1]?.uid)}</b> ({CD_NAME[turn]}){repeat}
            </>
          }
        />
      );
    const mine = <b style={{ color: CD_TONE[g.myMark] }}>{CD_NAME[g.myMark]}</b>;
    return (
      <StatusBar
        tone={g.myTurn ? TONE.turn : TONE.idle}
        message={
          g.myTurn ? (
            legal.length === 1 ? (
              <>
                🎯 Đến lượt bạn — chỉ còn một quân {mine} đi được, cẩn thận bị chặn!{repeat}
              </>
            ) : (
              <>
                🎯 Đến lượt bạn — bấm quân {mine} để đi sang điểm trống{repeat}
              </>
            )
          ) : (
            <>⏳ Chờ đối thủ đi…{repeat}</>
          )
        }
      >
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
function Buttons({ view, session }: { view: View; session: CoChoRoom }) {
  const g = view.game?.match;
  const setup = view.game!.setup;
  if (view.meta!.status === "playing" && g) return g.myMark ? <ResignButton onConfirm={() => session.resign()} /> : null;
  return (
    <>
      {view.isHost && (
        <div className="flex gap-1" role="group" aria-label="Cách xếp quân cho ván tới">
          {SETUPS.map((s) => (
            <button key={s} type="button" className={`btn btn-sm !px-2.5 ${s === setup ? "btn-sun" : ""}`} aria-pressed={s === setup} onClick={() => session.setSetup(s)}>
              {SETUP_NAME[s]}
            </button>
          ))}
        </div>
      )}
      <SeatButtons view={view} session={session} />
    </>
  );
}
