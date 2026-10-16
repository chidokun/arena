"use client";

import { memo, useMemo, useRef } from "react";
import { emptyState } from "@/lib/games/connect-four";
import type { C4Match, ConnectFourRoom, C4View } from "@/lib/net/connect-four-room";
import type { RoomView, SeatView } from "@/lib/net/room";
import { Score } from "./CaroTable";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, DrawCine, Duel, Fighter, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { C4_NAME, C4_TONE, ConnectFourBoard } from "./ConnectFourBoard";
import { PeoplePanel, SeatCard } from "./People";
import { DuelResult, type DuelSummary } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout, SpectatorNote, WaitingOverlay } from "./RoomLayout";
import { forfeitWhy, ResignButton, SeatButtons, seatMessage, StatusBar, TONE } from "./StatusBar";
import { useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

/** View các phần của bàn đọc — ghép từ `roomStore` + `peopleStore` + `gameStore` (chat đi riêng `chatStore`). */
type View = Omit<RoomView<C4View>, "chat">;

/** Đăng ký ba store và ghép lại thành view cho bàn chơi: vẽ lại khi phòng / người / ván đổi, không theo nhịp tim hay tin chat. */
function useC4View(session: ConnectFourRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const CHEERS = ["🎉", "🏆", "✨", "🎊", "🔴", "🟡"];
/** Thắng bằng chuỗi 4 thì chờ một nhịp cho quân kịp rơi và đường thắng kịp sáng rồi mới diễn. */
const LINE_PAUSE_MS = 1300;

/**
 * Bàn chơi tách theo store: khung chỉ giữ RoomLayout — danh sách người (`peopleStore`) và khung chat (`chatStore`) tự
 * đăng ký; phần bàn chơi bọc `memo`, đọc `roomStore` + `peopleStore` + `gameStore`, nên nhịp tim, tin chat hay người
 * vào ra không làm bàn vẽ lại, và nước đi không làm danh sách người / khung chat vẽ lại.
 */
export function ConnectFourTable({ id, slug, session }: { id: string; slug: string; session: ConnectFourRoom }) {
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <ConnectFourBody session={session} />
    </RoomLayout>
  );
}

const ConnectFourBody = memo(function ConnectFourBody({ session }: { session: ConnectFourRoom }) {
  const view = useC4View(session);
  const m = view.meta!;
  const { match: g, wins, draws } = view.game!;
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);
  const live = m.status === "playing" && g?.round === m.round && !g.result;
  const count = useCountdown(live && g!.state.count === 0 ? g!.round : 0);
  const end = useEndScene(g?.result ? g.round : 0, { delay: g?.result?.reason === "line" ? LINE_PAUSE_MS : 0, cheer: g?.result?.loser !== view.me, emojis: CHEERS });

  const showGame = !!g && (m.status !== "waiting" || g.state.count > 0);
  const state = showGame ? g!.state : emptyState();
  const playing = m.status === "playing";
  const seated = view.mySeat >= 0;
  const inLineup = !!g && g.myMark > 0;

  // Thanh đối đầu: trong ván thì theo thứ tự Đỏ–Vàng; khi chờ thì theo ghế.
  const slots = showGame ? g!.lineup : Array.from({ length: m.seats }, (_, i) => view.seats[i]);

  return (
    <>
      <RoomHeader name={m.name} status={m.status} round={m.round}>
        <span className="chip text-ink-2">▦ 7×6 · nối 4</span>
      </RoomHeader>

      <div className="mb-4 flex items-stretch gap-2 sm:gap-4">
        <SeatCard
          seat={slots[0]}
          mark={showGame ? 1 : undefined}
          badge={showGame ? "●" : undefined}
          tone={showGame ? C4_TONE[1] : undefined}
          active={playing && state.turn === 1}
          isHost={slots[0]?.uid === m.host}
          me={view.me}
        />
        <Score left={slots[0]?.uid} right={slots[1]?.uid} wins={wins} draws={draws} played={m.scored ?? 0} />
        <SeatCard
          seat={slots[1]}
          mark={showGame ? 2 : undefined}
          badge={showGame ? "●" : undefined}
          tone={showGame ? C4_TONE[2] : undefined}
          active={playing && state.turn === 2}
          isHost={slots[1]?.uid === m.host}
          me={view.me}
          align="right"
        />
      </div>

      <ActionBar view={view} session={session} />
      {m.status === "ended" && g?.result && <DuelResult round={g.round} summary={summary(g, view.me)} me={view.me} />}

      <div className="relative mx-auto mt-4 max-w-[560px]">
        <div ref={boardRef} className="card overflow-hidden p-2 sm:p-3" style={{ background: "var(--board)" }}>
          <ConnectFourBoard state={state} canPlay={!!g?.myTurn && !count} myMark={g?.myMark ?? 0} onDrop={(col) => session.drop(col)} />
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

/** Huy hiệu quân: một viên tròn màu Đỏ / Vàng. */
const Disc = ({ v }: { v: 1 | 2 }) => <span className="block h-[22px] w-[22px] rounded-full border-2 border-[#050312]" style={{ background: C4_TONE[v] }} />;

const fighter = (seat: SeatView | undefined, v: 1 | 2, me: string, side: "left" | "right") => (
  <Fighter
    p={seat?.member}
    name={seat?.uid === me ? "Bạn" : (seat?.member?.name ?? "Ai đó")}
    sub={`Quân ${C4_NAME[v]}${v === 1 ? " · đi trước" : ""}`}
    ring={C4_TONE[v]}
    badge={<Disc v={v} />}
    side={side}
  />
);

/** Cảnh mở ván: hai bên lao vào từ hai phía, đếm ngược 3‑2‑1 rồi mở bàn. */
function CountdownScene({ match: g, me, n }: { match: C4Match; me: string; n: number }) {
  const tip = g.myMark ? `Bạn cầm quân ${C4_NAME[g.myMark]} — ${g.myMark === 1 ? "thả trước nhé!" : "chờ Đỏ thả trước nhé!"}` : "Quân Đỏ thả trước — cùng xem nhé!";
  return (
    <CountdownCine eyebrow={`🔵 Thả Cờ 4 · Ván ${g.round}`} n={n} tip={tip}>
      <Duel left={fighter(g.lineup[0], 1, me, "left")} right={fighter(g.lineup[1], 2, me, "right")} />
    </CountdownCine>
  );
}

/** Kết quả ván — dùng chung cho cảnh hết ván và thẻ kết quả. */
function summary(g: C4Match, me: string): DuelSummary {
  const r = g.result!;
  if (!r.winner) return { winner: null, title: "Hoà!", sub: `Ván ${g.round} — đầy bàn mà chưa ai nối được 4` };
  const k = g.lineup.findIndex((s) => s.uid === r.winner);
  const why = forfeitWhy(r) ?? `Nối 4 quân sau ${g.state.count} nước`;
  return {
    winner: r.winner,
    title: r.winner === me ? "Bạn chiến thắng!" : `${g.lineup[k]?.member?.name ?? "Ai đó"} chiến thắng!`,
    sub: `Quân ${C4_NAME[(k + 1) as 1 | 2]} · ${why}`,
    note: r.loser === me ? "Bạn thua ván này — ván sau phục thù nhé!" : undefined,
  };
}

function EndScene({ match: g, me, onClose }: { match: C4Match; me: string; onClose: () => void }) {
  const s = summary(g, me);
  if (!s.winner) return <DrawCine people={g.lineup.map((x, k) => ({ uid: x.uid, p: x.member, ring: C4_TONE[(k + 1) as 1 | 2] }))} title={s.title} sub={s.sub} onClose={onClose} />;
  const k = g.lineup.findIndex((x) => x.uid === s.winner);
  return <WinCine winners={[{ uid: s.winner, p: g.lineup[k]?.member, badge: <Disc v={(k + 1) as 1 | 2} /> }]} title={s.title} sub={s.sub} note={s.note} onClose={onClose} />;
}

/** Thanh trạng thái: lượt đi trong ván; ngoài ván thì nhắc vào ghế / bắt đầu (kết quả ván nằm ở thẻ kết quả). */
function ActionBar({ view, session }: { view: View; session: ConnectFourRoom }) {
  const m = view.meta!;
  const g = view.game?.match;
  const name = (uid?: string | null) => (uid ? (view.members.find((p) => p.uid === uid)?.name ?? g?.lineup.find((s) => s.uid === uid)?.member?.name ?? "Ai đó") : "");

  if (m.status === "playing" && g) {
    if (!g.myMark)
      return (
        <StatusBar
          message={
            <>
              👀 Đang xem — lượt của <b>{name(g.lineup[g.state.turn - 1]?.uid)}</b> ({C4_NAME[g.state.turn]})
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
              🎯 Đến lượt bạn — thả quân <b style={{ color: C4_TONE[g.myMark] }}>{C4_NAME[g.myMark]}</b> vào một cột
            </>
          ) : (
            <>⏳ Chờ đối thủ thả quân…</>
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
