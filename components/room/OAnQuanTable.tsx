"use client";

import { memo, useMemo, useRef } from "react";
import { initialState, QUAN_VALUE, score, TOTAL, type Board } from "@/lib/games/oanquan";
import type { OAnQuanRoom, OaqMatch, OaqView } from "@/lib/net/oanquan-room";
import type { RoomView, SeatView } from "@/lib/net/room";
import { Score } from "./CaroTable";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, DrawCine, Duel, Fighter, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { OAnQuanBoard, OAQ_TALL_RATIO, OAQ_TONE, quanArt, SIDE_GEM, useSowing, useTallBoard } from "./OAnQuanBoard";
import { PeoplePanel, SeatCard } from "./People";
import { DuelResult, type DuelSummary } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout, SpectatorNote, WaitingOverlay } from "./RoomLayout";
import { forfeitWhy, ResignButton, SeatButtons, seatMessage, StatusBar, TONE } from "./StatusBar";
import { useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

type View = Omit<RoomView<OaqView>, "chat">;

function useOaqView(session: OAnQuanRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const CHEERS = ["🎉", "🏆", "✨", "🎊", "🪨", "🐚"];
const START = initialState();

// Phần bàn chơi bọc `memo` và tự đọc store để nhịp tim, tin chat hay người vào ra không làm bàn vẽ lại, và nước đi
// không làm danh sách người / khung chat vẽ lại.
export function OAnQuanTable({ id, slug, session }: { id: string; slug: string; session: OAnQuanRoom }) {
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <OAnQuanBody session={session} />
    </RoomLayout>
  );
}

const OAnQuanBody = memo(function OAnQuanBody({ session }: { session: OAnQuanRoom }) {
  const view = useOaqView(session);
  const m = view.meta!;
  const { match: g, wins, draws, opts } = view.game!;
  const boardRef = useRef<HTMLDivElement>(null);
  const tall = useTallBoard();
  const flyers = useFlyers(session, boardRef);
  const live = m.status === "playing" && g?.round === m.round && !g.result;
  const count = useCountdown(live && g!.state.count === 0 ? g!.round : 0);

  const showGame = !!g && (m.status !== "waiting" || g.state.count > 0);
  const state = showGame ? g!.state : START;
  const frame = useSowing(g?.round ?? 0, g?.moves ?? [], state, opts);
  const board: Board = frame?.board ?? state;
  // Hết ván thì chờ diễn xong nước cuối rồi mới mở cảnh thắng.
  const end = useEndScene(g?.result && !frame ? g.round : 0, { delay: 300, cheer: g?.result?.loser !== view.me, emojis: CHEERS });

  const playing = m.status === "playing";
  const seated = view.mySeat >= 0;
  const side = g && showGame ? g.mySide : 0;
  const slots = showGame ? g!.lineup : Array.from({ length: m.seats }, (_, i) => view.seats[i]);
  const below: 1 | 2 = side === 2 ? 2 : 1;
  const above: 1 | 2 = below === 1 ? 2 : 1;
  const seatCard = (k: 0 | 1) => {
    const p = (k + 1) as 1 | 2;
    const seat = slots[k];
    return (
      <SeatCard
        seat={seat}
        mark={showGame ? p : undefined}
        badge={showGame ? String(score(board, p)) : undefined}
        tone={showGame ? OAQ_TONE[p] : undefined}
        active={playing && state.turn === p && !state.over}
        isHost={seat?.uid === m.host}
        me={view.me}
        align={k === 1 ? "right" : "left"}
      />
    );
  };

  return (
    <>
      <RoomHeader name={m.name} status={m.status} round={m.round}>
        <span className="chip text-ink-2">🪨 10 ô dân · 2 ô quan</span>
        {opts.quanNon && <span className="chip text-ink-2">🚫 Cấm ăn quan non</span>}
      </RoomHeader>

      <div className="mb-4 flex items-stretch gap-2 sm:gap-4">
        {seatCard(0)}
        <Score left={slots[0]?.uid} right={slots[1]?.uid} wins={wins} draws={draws} played={m.scored ?? 0} />
        {seatCard(1)}
      </div>

      <ActionBar view={view} session={session} animating={!!frame} tall={tall} />
      {m.status === "ended" && g?.result && !frame && <DuelResult round={g.round} summary={summary(g, view.me)} me={view.me} />}

      <div className="relative mt-4">
        {showGame && <Store board={board} p={above} seat={g!.lineup[above - 1]} me={view.me} seed={g!.round} />}
        <div
          ref={boardRef}
          className="card mx-auto my-2 overflow-hidden p-2 sm:p-3"
          style={{ background: "var(--sunken)", width: tall ? `min(100%, calc((100svh - 190px) * ${OAQ_TALL_RATIO.toFixed(4)} + 20px))` : undefined }}
        >
          <OAnQuanBoard
            board={board}
            state={state}
            frame={frame}
            opts={opts}
            side={side}
            seed={g?.round ?? 0}
            live={live}
            canPlay={!!g?.myTurn && !count && !frame}
            tall={tall}
            onSow={(at, dir) => session.sow(at, dir)}
          />
        </div>
        {showGame && <Store board={board} p={below} seat={g!.lineup[below - 1]} me={view.me} seed={g!.round} />}
        <Flyers flyers={flyers} />
        {!showGame && m.status === "waiting" && <WaitingOverlay isHost={view.isHost} players={m.players.length} seats={m.seats} />}
      </div>
      {!seated && !side && <SpectatorNote />}

      {g && count > 0 && <CountdownScene match={g} me={view.me} n={count} />}
      {g?.result && end.shown && <EndScene match={g} me={view.me} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

function Store({ board, p, seat, me, seed }: { board: Board; p: 1 | 2; seat?: SeatView; me: string; seed: number }) {
  const dan = board.got[p];
  const quans = board.quans[p];
  const name = seat?.uid === me ? "Bạn" : (seat?.member?.name ?? "Ai đó");
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm font-semibold" style={{ background: `color-mix(in srgb, ${OAQ_TONE[p]} 12%, var(--surface))` }}>
      <span className="h-3 w-3 flex-none rounded-full border-2 border-edge" style={{ background: OAQ_TONE[p] }} aria-hidden="true" />
      <span className="min-w-0 truncate">
        Kho của <b>{name}</b>
      </span>
      <span className="ml-auto flex flex-none items-center gap-2 tabular-nums text-ink-2">
        <span className="flex items-center gap-1" title="Quân dân đã ăn (rải quân khi hết dân thì trừ đi, vay thì âm)">
          <Art src={SIDE_GEM[p]} size={18} /> {dan}
        </span>
        {([0, 1] as const).map((q) =>
          board.quanBy[q] === p ? <Art key={q} src={quanArt(q, seed)} size={28} title={`Quan ${QUAN_VALUE} điểm`} /> : null,
        )}
        <b className="font-display text-lg text-ink">{dan + quans * QUAN_VALUE}đ</b>
      </span>
    </div>
  );
}

function Art({ src, size, title }: { src: string; size: number; title?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- site xuất tĩnh, ảnh đã thu nhỏ sẵn
  return <img src={src} alt="" title={title} width={size} height={size} draggable={false} className="flex-none object-contain select-none" style={{ width: size, height: size }} />;
}

const Pebble = ({ p }: { p: 1 | 2 }) => <Art src={SIDE_GEM[p]} size={26} />;

const fighter = (seat: SeatView | undefined, p: 1 | 2, me: string, side: "left" | "right") => (
  <Fighter
    p={seat?.member}
    name={seat?.uid === me ? "Bạn" : (seat?.member?.name ?? "Ai đó")}
    sub={p === 1 ? "Đi trước" : "Đi sau"}
    ring={OAQ_TONE[p]}
    badge={<Pebble p={p} />}
    side={side}
  />
);

function CountdownScene({ match: g, me, n }: { match: OaqMatch; me: string; n: number }) {
  const tip = g.mySide ? (g.mySide === 1 ? "Bạn đi trước — chọn một ô dân bên mình để rải nhé!" : "Đối thủ đi trước — chờ một chút nhé!") : "Cùng xem hai bên tranh quan nhé!";
  return (
    <CountdownCine eyebrow={`🪨 Ô Ăn Quan · Ván ${g.round}`} n={n} tip={tip}>
      <Duel left={fighter(g.lineup[0], 1, me, "left")} right={fighter(g.lineup[1], 2, me, "right")} />
    </CountdownCine>
  );
}

function summary(g: OaqMatch, me: string): DuelSummary {
  const r = g.result!;
  if (!r.winner) return { winner: null, title: "Hoà!", sub: `Ván ${g.round} — mỗi bên ${TOTAL / 2} điểm` };
  const a = score(g.state, 1);
  const b = score(g.state, 2);
  const k = g.lineup.findIndex((s) => s.uid === r.winner);
  return {
    winner: r.winner,
    title: r.winner === me ? "Bạn chiến thắng!" : `${g.lineup[k]?.member?.name ?? "Ai đó"} chiến thắng!`,
    sub: forfeitWhy(r) ?? `Hết quan, thu quân: ${k === 0 ? a : b} – ${k === 0 ? b : a} điểm`,
    note: r.loser === me ? "Bạn thua ván này — ván sau phục thù nhé!" : undefined,
  };
}

function EndScene({ match: g, me, onClose }: { match: OaqMatch; me: string; onClose: () => void }) {
  const s = summary(g, me);
  if (!s.winner) return <DrawCine people={g.lineup.map((x, k) => ({ uid: x.uid, p: x.member, ring: OAQ_TONE[(k + 1) as 1 | 2] }))} title={s.title} sub={s.sub} onClose={onClose} />;
  const k = g.lineup.findIndex((x) => x.uid === s.winner);
  return <WinCine winners={[{ uid: s.winner, p: g.lineup[k]?.member, badge: <Pebble p={(k + 1) as 1 | 2} /> }]} title={s.title} sub={s.sub} note={s.note} onClose={onClose} />;
}

function ActionBar({ view, session, animating, tall }: { view: View; session: OAnQuanRoom; animating: boolean; tall: boolean }) {
  const m = view.meta!;
  const g = view.game?.match;
  const name = (uid?: string | null) => (uid ? (view.members.find((p) => p.uid === uid)?.name ?? g?.lineup.find((s) => s.uid === uid)?.member?.name ?? "Ai đó") : "");

  // Nước cuối vẫn đang diễn: chưa nói gì về kết quả.
  if (m.status !== "waiting" && g && animating)
    return <StatusBar message={<>🪨 Đang rải quân…</>}>{m.status === "playing" && !g.result && g.mySide ? <ResignButton onConfirm={() => session.resign()} /> : null}</StatusBar>;
  if (m.status === "playing" && g && !g.result) {
    const scatter = g.state.steps.some((s) => s.k === "scatter") && (
      <span className="text-ink-3">
        {" "}
        · {g.state.turn === g.mySide ? "Bạn" : name(g.lineup[g.state.turn - 1]?.uid)} vừa hết dân, phải lấy 5 quân trong kho rải lại
      </span>
    );
    if (!g.mySide)
      return (
        <StatusBar
          message={
            <>
              👀 Đang xem — lượt của <b>{name(g.lineup[g.state.turn - 1]?.uid)}</b>
              {scatter}
            </>
          }
        />
      );
    return (
      <StatusBar
        tone={g.myTurn ? TONE.turn : TONE.idle}
        message={
          g.myTurn ? (
            <>
              🎯 Đến lượt bạn — chọn một ô dân <b style={{ color: OAQ_TONE[g.mySide] }}>bên mình</b> {tall ? "(cột phải) rồi chọn chiều rải ▲ ▼" : "(dãy dưới) rồi chọn chiều rải ◀ ▶"}
              {scatter}
            </>
          ) : (
            <>
              ⏳ Chờ đối thủ rải quân…{scatter}
            </>
          )
        }
      >
        <ResignButton onConfirm={() => session.resign()} />
      </StatusBar>
    );
  }
  return (
    <StatusBar message={seatMessage(view)}>
      <SeatButtons view={view} session={session} />
    </StatusBar>
  );
}
