"use client";

import { memo, useMemo, useRef } from "react";
import { emptyState } from "@/lib/games/reversi";
import type { ReversiMatch, ReversiRoom, ReversiView } from "@/lib/net/reversi-room";
import type { RoomView, SeatView } from "@/lib/net/room";
import { Score } from "./CaroTable";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, DrawCine, Duel, Fighter, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel, SeatCard } from "./People";
import { DuelResult, type DuelSummary } from "./ResultCard";
import { FACE, ReversiBoard, RV_NAME, RV_TONE, settleMs } from "./ReversiBoard";
import { Flyers, RoomHeader, RoomLayout, SpectatorNote, WaitingOverlay } from "./RoomLayout";
import { forfeitWhy, ResignButton, SeatButtons, seatMessage, StatusBar, TONE } from "./StatusBar";
import { useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

/** View các phần của bàn đọc — ghép từ `roomStore` + `peopleStore` + `gameStore` (chat đi riêng `chatStore`). */
type View = Omit<RoomView<ReversiView>, "chat">;

/** Đăng ký ba store và ghép lại thành view cho bàn chơi: vẽ lại khi phòng / người / ván đổi, không theo nhịp tim hay tin chat. */
function useReversiView(session: ReversiRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const CHEERS = ["🎉", "🏆", "✨", "🎊", "⚫", "⚪"];

/**
 * Bàn chơi tách theo store: khung chỉ giữ RoomLayout — danh sách người (`peopleStore`) và khung chat (`chatStore`) tự
 * đăng ký; phần bàn chơi bọc `memo`, đọc `roomStore` + `peopleStore` + `gameStore`, nên nhịp tim, tin chat hay người
 * vào ra không làm bàn vẽ lại, và nước đi không làm danh sách người / khung chat vẽ lại.
 */
export function ReversiTable({ id, slug, session }: { id: string; slug: string; session: ReversiRoom }) {
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <ReversiBody session={session} />
    </RoomLayout>
  );
}

const ReversiBody = memo(function ReversiBody({ session }: { session: ReversiRoom }) {
  const view = useReversiView(session);
  const m = view.meta!;
  const { match: g, wins, draws } = view.game!;
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);
  const live = m.status === "playing" && g?.round === m.round && !g.result;
  const count = useCountdown(live && g!.state.count === 0 ? g!.round : 0);
  // Hết ván do đếm quân thì chờ quân cuối lật xong rồi mới diễn.
  const end = useEndScene(g?.result ? g.round : 0, { delay: g?.result?.reason === "points" ? settleMs(g.state) : 0, cheer: g?.result?.loser !== view.me, emojis: CHEERS });

  const showGame = !!g && (m.status !== "waiting" || g.state.count > 0);
  const state = showGame ? g!.state : emptyState();
  const playing = m.status === "playing";
  const seated = view.mySeat >= 0;
  const inLineup = !!g && g.myMark > 0;

  // Thanh đối đầu: trong ván thì theo thứ tự Đen–Trắng; khi chờ thì theo ghế.
  const slots = showGame ? g!.lineup : Array.from({ length: m.seats }, (_, i) => view.seats[i]);
  const seatCard = (k: 0 | 1) => {
    const v = (k + 1) as 1 | 2;
    return (
      <SeatCard
        seat={slots[k]}
        mark={showGame ? v : undefined}
        badge={showGame ? String(state.score[k]) : undefined}
        tone={showGame ? RV_TONE[v] : undefined}
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
        <span className="chip text-ink-2">▦ 8×8 · lật quân</span>
      </RoomHeader>

      <div className="mb-4 flex items-stretch gap-2 sm:gap-4">
        {seatCard(0)}
        <Score left={slots[0]?.uid} right={slots[1]?.uid} wins={wins} draws={draws} played={m.scored ?? 0} />
        {seatCard(1)}
      </div>

      <ActionBar view={view} session={session} />
      {m.status === "ended" && g?.result && <DuelResult round={g.round} summary={summary(g, view.me)} me={view.me} />}

      <div className="relative mx-auto mt-4 max-w-[560px]">
        <div ref={boardRef} className="card overflow-hidden p-2 sm:p-3" style={{ background: "var(--board)" }}>
          <ReversiBoard state={state} canPlay={!!g?.myTurn && !count} myMark={g?.myMark ?? 0} onPlace={(cell) => session.place(cell)} />
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

/** Huy hiệu quân: một quân tròn Đen / Trắng. */
const Disc = ({ v }: { v: 1 | 2 }) => <span className="block h-[22px] w-[22px] rounded-full border-2 border-[#050312]" style={{ background: FACE[v] }} />;

const fighter = (seat: SeatView | undefined, v: 1 | 2, me: string, side: "left" | "right") => (
  <Fighter
    p={seat?.member}
    name={seat?.uid === me ? "Bạn" : (seat?.member?.name ?? "Ai đó")}
    sub={`Quân ${RV_NAME[v]}${v === 1 ? " · đi trước" : ""}`}
    ring={RV_TONE[v]}
    badge={<Disc v={v} />}
    side={side}
  />
);

/** Cảnh mở ván: hai bên lao vào từ hai phía, đếm ngược 3‑2‑1 rồi mở bàn. */
function CountdownScene({ match: g, me, n }: { match: ReversiMatch; me: string; n: number }) {
  const tip = g.myMark ? `Bạn cầm quân ${RV_NAME[g.myMark]} — ${g.myMark === 1 ? "đặt trước nhé!" : "chờ Đen đặt trước nhé!"}` : "Quân Đen đặt trước — cùng xem nhé!";
  return (
    <CountdownCine eyebrow={`⚫ Cờ Lật · Ván ${g.round}`} n={n} tip={tip}>
      <Duel left={fighter(g.lineup[0], 1, me, "left")} right={fighter(g.lineup[1], 2, me, "right")} />
    </CountdownCine>
  );
}

/** Kết quả ván — dùng chung cho cảnh hết ván và thẻ kết quả. */
function summary(g: ReversiMatch, me: string): DuelSummary {
  const r = g.result!;
  const [a, b] = g.state.score;
  if (!r.winner) return { winner: null, title: "Hoà!", sub: `Ván ${g.round} — mỗi bên ${a} quân` };
  const k = g.lineup.findIndex((s) => s.uid === r.winner);
  const why = forfeitWhy(r) ?? `${Math.max(a, b)} quân, đối thủ ${Math.min(a, b)} quân`;
  return {
    winner: r.winner,
    title: r.winner === me ? "Bạn chiến thắng!" : `${g.lineup[k]?.member?.name ?? "Ai đó"} chiến thắng!`,
    sub: `Quân ${RV_NAME[(k + 1) as 1 | 2]} · ${why}`,
    note: r.loser === me ? "Bạn thua ván này — ván sau phục thù nhé!" : undefined,
  };
}

function EndScene({ match: g, me, onClose }: { match: ReversiMatch; me: string; onClose: () => void }) {
  const s = summary(g, me);
  if (!s.winner) return <DrawCine people={g.lineup.map((x, k) => ({ uid: x.uid, p: x.member, ring: RV_TONE[(k + 1) as 1 | 2] }))} title={s.title} sub={s.sub} onClose={onClose} />;
  const k = g.lineup.findIndex((x) => x.uid === s.winner);
  return <WinCine winners={[{ uid: s.winner, p: g.lineup[k]?.member, badge: <Disc v={(k + 1) as 1 | 2} /> }]} title={s.title} sub={s.sub} note={s.note} onClose={onClose} />;
}

/** Thanh trạng thái: lượt đi trong ván (kể cả khi một bên bị bỏ lượt); ngoài ván thì nhắc vào ghế / bắt đầu. */
function ActionBar({ view, session }: { view: View; session: ReversiRoom }) {
  const m = view.meta!;
  const g = view.game?.match;
  const name = (uid?: string | null) => (uid ? (view.members.find((p) => p.uid === uid)?.name ?? g?.lineup.find((s) => s.uid === uid)?.member?.name ?? "Ai đó") : "");

  if (m.status === "playing" && g) {
    const { turn, passed } = g.state;
    if (!g.myMark)
      return (
        <StatusBar
          message={
            <>
              👀 Đang xem — {passed ? `${RV_NAME[passed]} hết nước, ` : ""}lượt của <b>{name(g.lineup[turn - 1]?.uid)}</b> ({RV_NAME[turn]})
            </>
          }
        />
      );
    const mine = <b>{RV_NAME[g.myMark]}</b>;
    return (
      <StatusBar
        tone={g.myTurn ? TONE.turn : TONE.idle}
        message={
          g.myTurn ? (
            passed ? (
              <>🙌 Đối thủ hết nước — bạn đi tiếp, đặt quân {mine} nhé!</>
            ) : (
              <>🎯 Đến lượt bạn — đặt quân {mine} kẹp quân đối thủ ({g.state.legal.length} ô đặt được)</>
            )
          ) : passed ? (
            <>😬 Bạn hết nước — bị bỏ lượt, đối thủ đi tiếp…</>
          ) : (
            <>⏳ Chờ đối thủ đặt quân…</>
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
