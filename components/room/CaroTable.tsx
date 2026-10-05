"use client";

import { useRef } from "react";
import { emptyState } from "@/lib/games/caro";
import type { CaroRoom, CaroView } from "@/lib/net/caro-room";
import type { RoomView } from "@/lib/net/room";
import { ConfirmButton } from "../ConfirmButton";
import { CaroBoard } from "./CaroBoard";
import { ChatPanel } from "./ChatPanel";
import { PeoplePanel, SeatCard } from "./People";
import { Flyers, RoomLayout, StatusChip } from "./RoomLayout";
import { useBalloons, useFlyers, useRoomView } from "./useRoom";

export function CaroTable({ id, slug, session }: { id: string; slug: string; session: CaroRoom }) {
  const view = useRoomView(session)!;
  const m = view.meta!;
  const { opts, match: g, wins, draws } = view.game!;
  const balloons = useBalloons(session);
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);

  const showGame = !!g && (m.status !== "waiting" || g.state.count > 0);
  const state = showGame ? g!.state : emptyState(opts.size);
  const playing = m.status === "playing";
  const seated = view.mySeat >= 0;
  const inLineup = !!g && g.myMark > 0;

  // Thanh đối đầu: trong ván thì theo thứ tự X–O; khi chờ thì theo ghế.
  const slots = showGame ? g!.lineup : Array.from({ length: m.seats }, (_, i) => view.seats[i]);

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
        <span className="chip text-ink-2">
          ▦ {opts.size}×{opts.size}
        </span>
        <span className="chip" style={{ color: opts.blockTwoEnds ? "var(--sun)" : "var(--ink-3)" }}>
          {opts.blockTwoEnds ? "🚧 Chặn 2 đầu" : "Không chặn 2 đầu"}
        </span>
      </header>

      <div className="mb-4 flex items-stretch gap-2 sm:gap-4">
        <SeatCard
          seat={slots[0]}
          mark={showGame ? 1 : undefined}
          active={playing && state.turn === 1}
          isHost={slots[0]?.uid === m.host}
          balloon={slots[0] ? balloons[slots[0].uid] : undefined}
          me={view.me}
        />
        <Score left={slots[0]?.uid} right={slots[1]?.uid} wins={wins} draws={draws} played={m.scored ?? 0} />
        <SeatCard
          seat={slots[1]}
          mark={showGame ? 2 : undefined}
          active={playing && state.turn === 2}
          isHost={slots[1]?.uid === m.host}
          balloon={slots[1] ? balloons[slots[1].uid] : undefined}
          me={view.me}
          align="right"
        />
      </div>

      <ActionBar view={view} session={session} />

      <div className="relative mt-4">
        <div ref={boardRef} className="card overflow-hidden p-2 sm:p-3" style={{ background: "var(--board)" }}>
          <CaroBoard state={state} canPlay={!!g?.myTurn} myMark={g?.myMark ?? 0} onPlay={(x, y) => session.move(x, y)} />
        </div>
        <Flyers flyers={flyers} />
        {!showGame && m.status === "waiting" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <p className="card px-5 py-3 text-center font-display text-lg font-extrabold">
              {m.players.length < m.seats ? `Đang chờ đủ ${m.seats} người vào ghế…` : view.isHost ? "Đủ người rồi — bấm Bắt đầu!" : "Đang chờ chủ phòng bắt đầu…"}
            </p>
          </div>
        )}
      </div>
      {!seated && !inLineup && <p className="mt-3 text-center text-sm text-ink-3">👀 Bạn đang ở chế độ xem.</p>}
    </RoomLayout>
  );
}

/** Giữa hai thẻ người chơi: "VS" khi chưa xong ván nào, sau đó là tỉ số thắng cộng dồn trong phòng. */
function Score({ left, right, wins, draws, played }: { left?: string; right?: string; wins: Record<string, number>; draws: number; played: number }) {
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

/** Nút hành động chính tuỳ vai trò: vào ghế / rời ghế / bắt đầu / xin thua / ván mới. */
function ActionBar({ view, session }: { view: RoomView<CaroView>; session: CaroRoom }) {
  const m = view.meta!;
  const g = view.game?.match;
  const seated = view.mySeat >= 0;
  const playing = m.status === "playing";
  const full = m.players.length >= m.seats;
  const allOnline = view.seats.every((s) => s.online);
  const name = (uid?: string | null) => (uid ? (view.members.find((p) => p.uid === uid)?.name ?? g?.lineup.find((s) => s.uid === uid)?.member?.name ?? "Ai đó") : "");

  let message: React.ReactNode;
  let tone = "var(--sunken)";
  if (playing && g) {
    if (g.myMark) {
      message = g.myTurn ? (
        <>
          🎯 Đến lượt bạn — đánh <b>{g.myMark === 1 ? "X" : "O"}</b>
        </>
      ) : (
        <>⏳ Chờ đối thủ đi…</>
      );
      tone = g.myTurn ? "var(--lime-soft)" : "var(--sunken)";
    } else {
      message = (
        <>
          👀 Đang xem — lượt của <b>{name(g.lineup[g.state.turn - 1]?.uid)}</b>
        </>
      );
    }
  } else if (m.status === "ended" && g?.result) {
    const r = g.result;
    const iWon = r.winner === view.me;
    const iLost = r.loser === view.me;
    tone = iWon ? "var(--sun-soft)" : iLost ? "var(--coral-soft)" : "var(--grape-soft)";
    const why = r.reason === "resign" ? " — đối thủ xin thua" : r.reason === "leave" ? " — đối thủ rời trận" : r.reason === "kick" ? " — đối thủ bị mời ra" : "";
    message = r.winner ? (
      iWon ? (
        <>🏆 Bạn thắng rồi!{why}</>
      ) : (
        <>
          {iLost ? "😵 Bạn thua" : "🏁"} — <b>{name(r.winner)}</b> thắng{why}
        </>
      )
    ) : (
      <>🤝 Hoà cờ!</>
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
        {playing && g?.myMark ? (
          <ConfirmButton className="btn btn-coral" onConfirm={() => session.resign()} confirmLabel="Bấm lần nữa để xin thua">
            🏳️ Xin thua
          </ConfirmButton>
        ) : null}
      </div>
    </div>
  );
}
