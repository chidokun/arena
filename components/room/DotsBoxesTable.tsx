"use client";

import { memo, useMemo, useRef } from "react";
import { emptyState, SIZES } from "@/lib/games/dots-boxes";
import type { DotsBoxesRoom, DotsMatch, DotsView } from "@/lib/net/dots-boxes-room";
import type { RoomView, SeatView } from "@/lib/net/room";
import { Score } from "./CaroTable";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, DrawCine, Duel, Fighter, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { boardMaxWidth, DB_NAME, DB_TONE, DotsBoxesBoard } from "./DotsBoxesBoard";
import { PeoplePanel, SeatCard } from "./People";
import { DuelResult, type DuelSummary } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout, SpectatorNote, WaitingOverlay } from "./RoomLayout";
import { forfeitWhy, ResignButton, SeatButtons, seatMessage, StatusBar, TONE } from "./StatusBar";
import { useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

/** View các phần của bàn đọc — ghép từ `roomStore` + `peopleStore` + `gameStore` (chat đi riêng `chatStore`). */
type View = Omit<RoomView<DotsView>, "chat">;

/** Đăng ký ba store và ghép lại thành view cho bàn chơi: vẽ lại khi phòng / người / ván đổi, không theo nhịp tim hay tin chat. */
function useDotsView(session: DotsBoxesRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const CHEERS = ["🎉", "🏆", "✨", "🎊", "🟥", "🟦"];
/** Ô cuối vừa khép thì chờ một nhịp cho nét kịp vẽ và ô kịp bật lên rồi mới diễn. */
const CLAIM_PAUSE_MS = 900;

/**
 * Bàn chơi tách theo store: khung chỉ giữ RoomLayout — danh sách người (`peopleStore`) và khung chat (`chatStore`) tự
 * đăng ký; phần bàn chơi bọc `memo`, đọc `roomStore` + `peopleStore` + `gameStore`, nên nhịp tim, tin chat hay người
 * vào ra không làm bàn vẽ lại, và nước đi không làm danh sách người / khung chat vẽ lại.
 */
export function DotsBoxesTable({ id, slug, session }: { id: string; slug: string; session: DotsBoxesRoom }) {
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <DotsBoxesBody session={session} />
    </RoomLayout>
  );
}

const DotsBoxesBody = memo(function DotsBoxesBody({ session }: { session: DotsBoxesRoom }) {
  const view = useDotsView(session);
  const m = view.meta!;
  const { match: g, wins, draws, size } = view.game!;
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);
  const live = m.status === "playing" && g?.round === m.round && !g.result;
  const count = useCountdown(live && g!.state.count === 0 ? g!.round : 0);
  const end = useEndScene(g?.result ? g.round : 0, { delay: g?.result?.reason === "points" ? CLAIM_PAUSE_MS : 0, cheer: g?.result?.loser !== view.me, emojis: CHEERS });

  const showGame = !!g && (m.status !== "waiting" || g.state.count > 0);
  const state = showGame ? g!.state : emptyState(size);
  const playing = m.status === "playing";
  const seated = view.mySeat >= 0;
  const inLineup = !!g && g.myMark > 0;

  // Thanh đối đầu: trong ván thì theo thứ tự Đỏ–Xanh; khi chờ thì theo ghế.
  const slots = showGame ? g!.lineup : Array.from({ length: m.seats }, (_, i) => view.seats[i]);
  const marks = { 1: slots[0]?.member?.avatar, 2: slots[1]?.member?.avatar };
  const seatCard = (k: 0 | 1) => {
    const v = (k + 1) as 1 | 2;
    return (
      <SeatCard
        seat={slots[k]}
        mark={showGame ? v : undefined}
        badge={showGame ? String(state.score[k]) : undefined}
        tone={showGame ? DB_TONE[v] : undefined}
        active={playing && state.turn === v && !state.over}
        isHost={slots[k]?.uid === m.host}
        me={view.me}
        align={k === 1 ? "right" : "left"}
      />
    );
  };

  return (
    <>
      <RoomHeader name={m.name} status={m.status} round={m.round}>
        <span className="chip text-ink-2">
          ▦ {state.size}×{state.size} ô{!playing && size !== state.size && ` · ván tới ${size}×${size}`}
        </span>
      </RoomHeader>

      <div className="mb-4 flex items-stretch gap-2 sm:gap-4">
        {seatCard(0)}
        <Score left={slots[0]?.uid} right={slots[1]?.uid} wins={wins} draws={draws} played={m.scored ?? 0} />
        {seatCard(1)}
      </div>

      <ActionBar view={view} session={session} />
      {m.status === "ended" && g?.result && <DuelResult round={g.round} summary={summary(g, view.me)} me={view.me} />}

      <div className="relative mx-auto mt-4" style={{ maxWidth: boardMaxWidth(state.size) }}>
        <div ref={boardRef} className="card overflow-hidden p-2 sm:p-3" style={{ background: "var(--board)" }}>
          <DotsBoxesBoard state={state} canPlay={!!g?.myTurn && !count} myMark={g?.myMark ?? 0} marks={marks} onDraw={(line) => session.draw(line)} />
        </div>
        <Flyers flyers={flyers} />
        {!showGame && m.status === "waiting" && <WaitingOverlay isHost={view.isHost} players={m.players.length} seats={m.seats} />}
      </div>
      {!seated && !inLineup && <SpectatorNote />}

      {g && count > 0 && <CountdownScene match={g} me={view.me} n={count} />}
      {g?.result && end.shown && <EndScene match={g} me={view.me} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

/** Huy hiệu màu: một ô vuông Đỏ / Xanh. */
const Swatch = ({ v }: { v: 1 | 2 }) => <span className="block h-[22px] w-[22px] rounded-md border-2 border-[#050312]" style={{ background: DB_TONE[v] }} />;

const fighter = (seat: SeatView | undefined, v: 1 | 2, me: string, side: "left" | "right") => (
  <Fighter
    p={seat?.member}
    name={seat?.uid === me ? "Bạn" : (seat?.member?.name ?? "Ai đó")}
    sub={`Màu ${DB_NAME[v]}${v === 1 ? " · đi trước" : ""}`}
    ring={DB_TONE[v]}
    badge={<Swatch v={v} />}
    side={side}
  />
);

/** Cảnh mở ván: hai bên lao vào từ hai phía, đếm ngược 3‑2‑1 rồi mở bàn. */
function CountdownScene({ match: g, me, n }: { match: DotsMatch; me: string; n: number }) {
  const tip = g.myMark ? `Bạn cầm màu ${DB_NAME[g.myMark]} — ${g.myMark === 1 ? "kẻ trước nhé!" : "chờ Đỏ kẻ trước nhé!"}` : "Màu Đỏ kẻ trước — cùng xem nhé!";
  return (
    <CountdownCine eyebrow={`🔲 Chấm Nối Ô · Ván ${g.round}`} n={n} tip={tip}>
      <Duel left={fighter(g.lineup[0], 1, me, "left")} right={fighter(g.lineup[1], 2, me, "right")} />
    </CountdownCine>
  );
}

/** Kết quả ván — dùng chung cho cảnh hết ván và thẻ kết quả. */
function summary(g: DotsMatch, me: string): DuelSummary {
  const r = g.result!;
  const [a, b] = g.state.score;
  if (!r.winner) return { winner: null, title: "Hoà!", sub: `Ván ${g.round} — mỗi bên ${a} ô` };
  const k = g.lineup.findIndex((s) => s.uid === r.winner);
  const why = forfeitWhy(r) ?? `Chiếm ${Math.max(a, b)} ô, đối thủ ${Math.min(a, b)} ô`;
  return {
    winner: r.winner,
    title: r.winner === me ? "Bạn chiến thắng!" : `${g.lineup[k]?.member?.name ?? "Ai đó"} chiến thắng!`,
    sub: `Màu ${DB_NAME[(k + 1) as 1 | 2]} · ${why}`,
    note: r.loser === me ? "Bạn thua ván này — ván sau phục thù nhé!" : undefined,
  };
}

function EndScene({ match: g, me, onClose }: { match: DotsMatch; me: string; onClose: () => void }) {
  const s = summary(g, me);
  if (!s.winner) return <DrawCine people={g.lineup.map((x, k) => ({ uid: x.uid, p: x.member, ring: DB_TONE[(k + 1) as 1 | 2] }))} title={s.title} sub={s.sub} onClose={onClose} />;
  const k = g.lineup.findIndex((x) => x.uid === s.winner);
  return <WinCine winners={[{ uid: s.winner, p: g.lineup[k]?.member, badge: <Swatch v={(k + 1) as 1 | 2} /> }]} title={s.title} sub={s.sub} note={s.note} onClose={onClose} />;
}

/** Thanh trạng thái: lượt đi trong ván; ngoài ván thì nhắc vào ghế / bắt đầu, chủ phòng chọn cỡ bàn (kết quả ván nằm ở thẻ kết quả). */
function ActionBar({ view, session }: { view: View; session: DotsBoxesRoom }) {
  const m = view.meta!;
  const g = view.game?.match;
  const size = view.game!.size;
  const name = (uid?: string | null) => (uid ? (view.members.find((p) => p.uid === uid)?.name ?? g?.lineup.find((s) => s.uid === uid)?.member?.name ?? "Ai đó") : "");

  if (m.status === "playing" && g) {
    if (!g.myMark)
      return (
        <StatusBar
          message={
            <>
              👀 Đang xem — lượt của <b>{name(g.lineup[g.state.turn - 1]?.uid)}</b> ({DB_NAME[g.state.turn]})
            </>
          }
        />
      );
    // Vừa khép ô mà vẫn đến lượt mình: nhắc là được kẻ tiếp.
    const bonus = g.state.fresh.length > 0;
    const mine = <b style={{ color: DB_TONE[g.myMark] }}>{DB_NAME[g.myMark]}</b>;
    return (
      <StatusBar
        tone={g.myTurn ? TONE.turn : TONE.idle}
        message={
          g.myTurn ? (
            bonus ? (
              <>
                🎉 Khép được {g.state.fresh.length} ô — kẻ tiếp một cạnh {mine} nữa!
              </>
            ) : (
              <>🎯 Đến lượt bạn — kẻ một cạnh {mine} nối hai chấm</>
            )
          ) : bonus ? (
            <>😬 Đối thủ vừa khép ô — đang kẻ tiếp…</>
          ) : (
            <>⏳ Chờ đối thủ kẻ…</>
          )
        }
      >
        <ResignButton onConfirm={() => session.resign()} />
      </StatusBar>
    );
  }
  return (
    <StatusBar message={seatMessage(view)}>
      {view.isHost && (
        <div className="flex gap-1" role="group" aria-label="Cỡ bàn cho ván tới">
          {SIZES.map((s) => (
            <button key={s} type="button" className={`btn btn-sm !px-2.5 ${s === size ? "btn-sun" : ""}`} aria-pressed={s === size} onClick={() => session.setSize(s)}>
              {s}×{s}
            </button>
          ))}
        </div>
      )}
      <SeatButtons view={view} session={session} />
    </StatusBar>
  );
}
