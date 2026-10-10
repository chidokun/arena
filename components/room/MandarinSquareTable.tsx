"use client";

import { useRef } from "react";
import { initialState, QUAN_VALUE, score, TOTAL, type Board } from "@/lib/games/mandarin-square";
import type { MandarinSquareRoom, MsMatch, MsView } from "@/lib/net/mandarin-square-room";
import type { RoomView, SeatView } from "@/lib/net/room";
import { ConfirmButton } from "../ConfirmButton";
import { Score } from "./CaroTable";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, DrawCine, Duel, Fighter, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { MandarinSquareBoard, MS_TONE, useSowing } from "./MandarinSquareBoard";
import { PeoplePanel, SeatCard } from "./People";
import { Flyers, RoomLayout, StatusChip } from "./RoomLayout";
import { useBalloons, useFlyers, useRoomView } from "./useRoom";

const CHEERS = ["🎉", "🏆", "✨", "🎊", "🪨", "🐚"];
const START = initialState();

export function MandarinSquareTable({ id, slug, session }: { id: string; slug: string; session: MandarinSquareRoom }) {
  const view = useRoomView(session)!;
  const m = view.meta!;
  const { match: g, wins, draws, opts } = view.game!;
  const balloons = useBalloons(session);
  const boardRef = useRef<HTMLDivElement>(null);
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
  // Thanh đối đầu: trong ván thì theo thứ tự bên 1 – bên 2; khi chờ thì theo ghế.
  const slots = showGame ? g!.lineup : Array.from({ length: m.seats }, (_, i) => view.seats[i]);
  // Kho quân: bên mình ở dưới bàn, đối thủ ở trên (người xem: bên 2 trên, bên 1 dưới).
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
        tone={showGame ? MS_TONE[p] : undefined}
        active={playing && state.turn === p && !state.over}
        isHost={seat?.uid === m.host}
        balloon={seat ? balloons[seat.uid] : undefined}
        me={view.me}
        align={k === 1 ? "right" : "left"}
      />
    );
  };

  return (
    <RoomLayout
      id={id}
      slug={slug}
      side={
        <>
          <PeoplePanel view={view} session={session} balloons={balloons} roomId={id} />
          <ChatPanel session={session} chat={view.chat} me={view.me} />
        </>
      }
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{m.name}</h1>
        <StatusChip status={m.status} round={m.round} />
        <span className="chip text-ink-2">🪨 10 ô dân · 2 ô quan</span>
        {opts.quanNon && <span className="chip text-ink-2">🚫 Cấm ăn quan non</span>}
      </header>

      <div className="mb-4 flex items-stretch gap-2 sm:gap-4">
        {seatCard(0)}
        <Score left={slots[0]?.uid} right={slots[1]?.uid} wins={wins} draws={draws} played={m.scored ?? 0} />
        {seatCard(1)}
      </div>

      <ActionBar view={view} session={session} animating={!!frame} />

      <div className="relative mx-auto mt-4 max-w-[760px]">
        {showGame && <Store board={board} p={above} seat={g!.lineup[above - 1]} me={view.me} />}
        <div ref={boardRef} className="card my-2 overflow-hidden p-2 sm:p-3" style={{ background: "var(--sunken)" }}>
          <MandarinSquareBoard
            board={board}
            state={state}
            frame={frame}
            opts={opts}
            side={side}
            live={live}
            canPlay={!!g?.myTurn && !count && !frame}
            onSow={(at, dir) => session.sow(at, dir)}
          />
        </div>
        {showGame && <Store board={board} p={below} seat={g!.lineup[below - 1]} me={view.me} />}
        <Flyers flyers={flyers} />
        {!showGame && m.status === "waiting" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <p className="card px-5 py-3 text-center font-display text-lg font-extrabold">
              {m.players.length < m.seats ? `Đang chờ đủ ${m.seats} người vào ghế…` : view.isHost ? "Đủ người rồi — bấm Bắt đầu!" : "Đang chờ chủ phòng bắt đầu…"}
            </p>
          </div>
        )}
      </div>
      {!seated && !side && <p className="mt-3 text-center text-sm text-ink-3">👀 Bạn đang ở chế độ xem.</p>}

      {g && count > 0 && <CountdownScene match={g} me={view.me} n={count} />}
      {g?.result && end.shown && <EndScene match={g} me={view.me} onClose={end.close} />}
      <Party bits={end.party} />
    </RoomLayout>
  );
}

/** Kho quân đã ăn của một bên: số dân, số quan và tổng điểm. */
function Store({ board, p, seat, me }: { board: Board; p: 1 | 2; seat?: SeatView; me: string }) {
  const dan = board.got[p];
  const quans = board.quans[p];
  const name = seat?.uid === me ? "Bạn" : (seat?.member?.name ?? "Ai đó");
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm font-semibold" style={{ background: `color-mix(in srgb, ${MS_TONE[p]} 12%, var(--surface))` }}>
      <span className="h-3 w-3 flex-none rounded-full border-2 border-edge" style={{ background: MS_TONE[p] }} aria-hidden="true" />
      <span className="min-w-0 truncate">
        Kho của <b>{name}</b>
      </span>
      <span className="ml-auto flex flex-none items-center gap-2 tabular-nums text-ink-2">
        <span title="Quân dân đã ăn (rải quân khi hết dân thì trừ đi, vay thì âm)">🪨 {dan}</span>
        {quans > 0 && <span title={`Mỗi quan ${QUAN_VALUE} điểm`}>🟣 {quans} quan</span>}
        <b className="font-display text-lg text-ink">{dan + quans * QUAN_VALUE}đ</b>
      </span>
    </div>
  );
}

/** Huy hiệu bên: viên sỏi màu của bên đó. */
const Pebble = ({ p }: { p: 1 | 2 }) => <span className="block h-[20px] w-[24px] rounded-[50%] border-2 border-[#050312]" style={{ background: MS_TONE[p] }} />;

const fighter = (seat: SeatView | undefined, p: 1 | 2, me: string, side: "left" | "right") => (
  <Fighter
    p={seat?.member}
    name={seat?.uid === me ? "Bạn" : (seat?.member?.name ?? "Ai đó")}
    sub={p === 1 ? "Đi trước" : "Đi sau"}
    ring={MS_TONE[p]}
    badge={<Pebble p={p} />}
    side={side}
  />
);

/** Cảnh mở ván: hai bên lao vào từ hai phía, đếm ngược 3‑2‑1 rồi mở bàn. */
function CountdownScene({ match: g, me, n }: { match: MsMatch; me: string; n: number }) {
  const tip = g.mySide ? (g.mySide === 1 ? "Bạn đi trước — chọn một ô dân bên mình để rải nhé!" : "Đối thủ đi trước — chờ một chút nhé!") : "Cùng xem hai bên tranh quan nhé!";
  return (
    <CountdownCine eyebrow={`🪨 Ô Ăn Quan · Ván ${g.round}`} n={n} tip={tip}>
      <Duel left={fighter(g.lineup[0], 1, me, "left")} right={fighter(g.lineup[1], 2, me, "right")} />
    </CountdownCine>
  );
}

/** Cảnh hết ván: người thắng hoặc hoà — bấm để đóng. */
function EndScene({ match: g, me, onClose }: { match: MsMatch; me: string; onClose: () => void }) {
  const r = g.result!;
  const a = score(g.state, 1);
  const b = score(g.state, 2);
  if (!r.winner)
    return <DrawCine people={g.lineup.map((s, k) => ({ uid: s.uid, p: s.member, ring: MS_TONE[(k + 1) as 1 | 2] }))} title="Hoà!" sub={`Ván ${g.round} — mỗi bên ${TOTAL / 2} điểm`} onClose={onClose} />;
  const k = g.lineup.findIndex((s) => s.uid === r.winner);
  const seat = g.lineup[k];
  const p = (k + 1) as 1 | 2;
  const why =
    r.reason === "resign"
      ? "Đối thủ xin thua"
      : r.reason === "leave"
        ? "Đối thủ rời trận"
        : r.reason === "kick"
          ? "Đối thủ bị mời ra"
          : `Hết quan, thu quân: ${p === 1 ? a : b} – ${p === 1 ? b : a} điểm`;
  return (
    <WinCine
      winners={[{ uid: r.winner, p: seat?.member, badge: <Pebble p={p} /> }]}
      title={r.winner === me ? "Bạn chiến thắng!" : `${seat?.member?.name ?? "Ai đó"} chiến thắng!`}
      sub={why}
      note={r.loser === me ? "Bạn thua ván này — ván sau phục thù nhé!" : undefined}
      onClose={onClose}
    />
  );
}

/** Nút hành động chính tuỳ vai trò: vào ghế / rời ghế / bắt đầu / xin thua / ván mới. */
function ActionBar({ view, session, animating }: { view: RoomView<MsView>; session: MandarinSquareRoom; animating: boolean }) {
  const m = view.meta!;
  const g = view.game?.match;
  const seated = view.mySeat >= 0;
  const playing = m.status === "playing";
  const full = m.players.length >= m.seats;
  const allOnline = view.seats.every((s) => s.online);
  const name = (uid?: string | null) => (uid ? (view.members.find((p) => p.uid === uid)?.name ?? g?.lineup.find((s) => s.uid === uid)?.member?.name ?? "Ai đó") : "");

  let message: React.ReactNode;
  let tone = "var(--sunken)";
  if (playing && g && !g.result) {
    if (animating) {
      message = <>🪨 Đang rải quân…</>;
    } else if (g.mySide) {
      message = g.myTurn ? (
        <>
          🎯 Đến lượt bạn — chọn một ô dân <b style={{ color: MS_TONE[g.mySide] }}>bên mình</b> (dãy dưới) rồi chọn chiều rải ◀ ▶
        </>
      ) : (
        <>⏳ Chờ đối thủ rải quân…</>
      );
      tone = g.myTurn ? "var(--lime-soft)" : "var(--sunken)";
    } else {
      message = (
        <>
          👀 Đang xem — lượt của <b>{name(g.lineup[g.state.turn - 1]?.uid)}</b>
        </>
      );
    }
    if (!animating && g.state.steps.some((s) => s.k === "scatter"))
      message = (
        <>
          {message} <span className="text-ink-3">· {g.state.turn === g.mySide ? "Bạn" : name(g.lineup[g.state.turn - 1]?.uid)} vừa hết dân, phải lấy 5 quân trong kho rải lại</span>
        </>
      );
  } else if (m.status !== "waiting" && g?.result && animating) {
    message = <>🪨 Đang rải quân…</>;
  } else if (m.status === "ended" && g?.result) {
    const r = g.result;
    const iWon = r.winner === view.me;
    const iLost = r.loser === view.me;
    tone = iWon ? "var(--sun-soft)" : iLost ? "var(--coral-soft)" : "var(--grape-soft)";
    const why = r.reason === "resign" ? " — đối thủ xin thua" : r.reason === "leave" ? " — đối thủ rời trận" : r.reason === "kick" ? " — đối thủ bị mời ra" : ` — ${score(g.state, 1)} : ${score(g.state, 2)}`;
    message = r.winner ? (
      iWon ? (
        <>🏆 Bạn thắng rồi!{why}</>
      ) : (
        <>
          {iLost ? "😵 Bạn thua" : "🏁"} — <b>{name(r.winner)}</b> thắng{why}
        </>
      )
    ) : (
      <>🤝 Hết quan — hai bên bằng điểm, hoà!</>
    );
  } else if (view.pending === "play") {
    message = <>⏳ Đang chờ chủ phòng xếp ghế…</>;
  } else if (seated) {
    message = full ? <>✅ Bạn đã vào ghế. {view.isHost ? "Bấm Bắt đầu khi sẵn sàng." : "Chờ chủ phòng bắt đầu."}</> : <>✅ Bạn đã vào ghế, đang chờ thêm người…</>;
  } else {
    message = full ? <>🪑 Hết ghế — bạn có thể ngồi xem và trò chuyện.</> : <>Bấm “Vào chơi” để giành ghế và sẵn sàng.</>;
  }

  return (
    <div className="card flex flex-wrap items-center gap-3 px-4 py-3" style={{ background: tone }} aria-live="polite">
      <p className="min-w-0 flex-1 text-[15px] font-semibold">{message}</p>
      <div className="flex flex-wrap gap-2">
        {!playing && !seated && !full && (
          <button type="button" className="btn btn-lime" onClick={() => session.join()} disabled={view.pending === "play"}>
            🙋 Vào chơi
          </button>
        )}
        {!playing && seated && (
          <button type="button" className="btn" onClick={() => session.leaveSeat()} disabled={view.pending === "watch"}>
            Rời ghế
          </button>
        )}
        {!playing && view.isHost && (
          <button type="button" className="btn btn-pen" onClick={() => session.start()} disabled={!full || !allOnline} title={!full ? "Cần đủ người vào ghế" : !allOnline ? "Có người chơi đang mất kết nối" : ""}>
            {m.round > 0 ? "🔁 Ván mới" : "▶ Bắt đầu"}
          </button>
        )}
        {playing && g?.mySide ? (
          <ConfirmButton className="btn btn-coral" onConfirm={() => session.resign()} confirmLabel="Bấm lần nữa để xin thua">
            🏳️ Xin thua
          </ConfirmButton>
        ) : null}
      </div>
    </div>
  );
}
