"use client";

import { useRef } from "react";
import { emptyState, SIZES } from "@/lib/games/dots-boxes";
import type { DotsBoxesRoom, DotsMatch, DotsView } from "@/lib/net/dots-boxes-room";
import type { RoomView, SeatView } from "@/lib/net/room";
import { ConfirmButton } from "../ConfirmButton";
import { Score } from "./CaroTable";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, DrawCine, Duel, Fighter, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { boardMaxWidth, DB_NAME, DB_TONE, DotsBoxesBoard } from "./DotsBoxesBoard";
import { PeoplePanel, SeatCard } from "./People";
import { Flyers, RoomLayout, StatusChip } from "./RoomLayout";
import { useFlyers, useRoomView } from "./useRoom";

const CHEERS = ["🎉", "🏆", "✨", "🎊", "🟥", "🟦"];
/** Ô cuối vừa khép thì chờ một nhịp cho nét kịp vẽ và ô kịp bật lên rồi mới diễn. */
const CLAIM_PAUSE_MS = 900;

export function DotsBoxesTable({ id, slug, session }: { id: string; slug: string; session: DotsBoxesRoom }) {
  const view = useRoomView(session)!;
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
    <RoomLayout
      id={id}
      slug={slug}
      people={<PeoplePanel view={view} session={session} roomId={id} />}
      chat={<ChatPanel session={session} chat={view.chat} me={view.me} />}
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{m.name}</h1>
        <StatusChip status={m.status} round={m.round} />
        <span className="chip text-ink-2">
          ▦ {state.size}×{state.size} ô{!playing && size !== state.size && ` · ván tới ${size}×${size}`}
        </span>
      </header>

      <div className="mb-4 flex items-stretch gap-2 sm:gap-4">
        {seatCard(0)}
        <Score left={slots[0]?.uid} right={slots[1]?.uid} wins={wins} draws={draws} played={m.scored ?? 0} />
        {seatCard(1)}
      </div>

      <ActionBar view={view} session={session} />

      <div className="relative mx-auto mt-4" style={{ maxWidth: boardMaxWidth(state.size) }}>
        <div ref={boardRef} className="card overflow-hidden p-2 sm:p-3" style={{ background: "var(--board)" }}>
          <DotsBoxesBoard state={state} canPlay={!!g?.myTurn && !count} myMark={g?.myMark ?? 0} marks={marks} onDraw={(line) => session.draw(line)} />
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

      {g && count > 0 && <CountdownScene match={g} me={view.me} n={count} />}
      {g?.result && end.shown && <EndScene match={g} me={view.me} onClose={end.close} />}
      <Party bits={end.party} />
    </RoomLayout>
  );
}

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

/** Cảnh hết ván: người thắng (vàng rực) hoặc chia đều ô thì hoà — bấm để đóng. */
function EndScene({ match: g, me, onClose }: { match: DotsMatch; me: string; onClose: () => void }) {
  const r = g.result!;
  const [a, b] = g.state.score;
  if (!r.winner)
    return <DrawCine people={g.lineup.map((s, k) => ({ uid: s.uid, p: s.member, ring: DB_TONE[(k + 1) as 1 | 2] }))} title="Hoà!" sub={`Ván ${g.round} — mỗi bên ${a} ô`} onClose={onClose} />;
  const k = g.lineup.findIndex((s) => s.uid === r.winner);
  const seat = g.lineup[k];
  const v = (k + 1) as 1 | 2;
  const why =
    r.reason === "resign"
      ? "Đối thủ xin thua"
      : r.reason === "leave"
        ? "Đối thủ rời trận"
        : r.reason === "kick"
          ? "Đối thủ bị mời ra"
          : `Chiếm ${Math.max(a, b)} ô, đối thủ ${Math.min(a, b)} ô`;
  return (
    <WinCine
      winners={[{ uid: r.winner, p: seat?.member, badge: <Swatch v={v} /> }]}
      title={r.winner === me ? "Bạn chiến thắng!" : `${seat?.member?.name ?? "Ai đó"} chiến thắng!`}
      sub={`Màu ${DB_NAME[v]} · ${why}`}
      note={r.loser === me ? "Bạn thua ván này — ván sau phục thù nhé!" : undefined}
      onClose={onClose}
    />
  );
}

/** Nút hành động chính tuỳ vai trò: vào ghế / rời ghế / chọn cỡ bàn / bắt đầu / xin thua / ván mới. */
function ActionBar({ view, session }: { view: RoomView<DotsView>; session: DotsBoxesRoom }) {
  const m = view.meta!;
  const g = view.game?.match;
  const size = view.game!.size;
  const seated = view.mySeat >= 0;
  const playing = m.status === "playing";
  const full = m.players.length >= m.seats;
  const allOnline = view.seats.every((s) => s.online);
  const name = (uid?: string | null) => (uid ? (view.members.find((p) => p.uid === uid)?.name ?? g?.lineup.find((s) => s.uid === uid)?.member?.name ?? "Ai đó") : "");

  let message: React.ReactNode;
  let tone = "var(--sunken)";
  if (playing && g) {
    // Vừa khép ô mà vẫn đến lượt mình: nhắc là được kẻ tiếp.
    const bonus = g.state.fresh.length > 0;
    if (g.myMark) {
      message = g.myTurn ? (
        bonus ? (
          <>
            🎉 Khép được {g.state.fresh.length} ô — kẻ tiếp một cạnh <b style={{ color: DB_TONE[g.myMark] }}>{DB_NAME[g.myMark]}</b> nữa!
          </>
        ) : (
          <>
            🎯 Đến lượt bạn — kẻ một cạnh <b style={{ color: DB_TONE[g.myMark] }}>{DB_NAME[g.myMark]}</b> nối hai chấm
          </>
        )
      ) : bonus ? (
        <>😬 Đối thủ vừa khép ô — đang kẻ tiếp…</>
      ) : (
        <>⏳ Chờ đối thủ kẻ…</>
      );
      tone = g.myTurn ? "var(--lime-soft)" : "var(--sunken)";
    } else {
      message = (
        <>
          👀 Đang xem — lượt của <b>{name(g.lineup[g.state.turn - 1]?.uid)}</b> ({DB_NAME[g.state.turn]})
        </>
      );
    }
  } else if (m.status === "ended" && g?.result) {
    const r = g.result;
    const iWon = r.winner === view.me;
    const iLost = r.loser === view.me;
    tone = iWon ? "var(--sun-soft)" : iLost ? "var(--coral-soft)" : "var(--grape-soft)";
    const why = r.reason === "resign" ? " — đối thủ xin thua" : r.reason === "leave" ? " — đối thủ rời trận" : r.reason === "kick" ? " — đối thủ bị mời ra" : ` — ${g.state.score[0]}:${g.state.score[1]} ô`;
    message = r.winner ? (
      iWon ? (
        <>🏆 Bạn thắng rồi!{why}</>
      ) : (
        <>
          {iLost ? "😵 Bạn thua" : "🏁"} — <b>{name(r.winner)}</b> thắng{why}
        </>
      )
    ) : (
      <>🤝 Chia đều ô — hoà!</>
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
        {!playing && view.isHost && (
          <div className="flex gap-1" role="group" aria-label="Cỡ bàn cho ván tới">
            {SIZES.map((s) => (
              <button key={s} type="button" className={`btn btn-sm !px-2.5 ${s === size ? "btn-sun" : ""}`} aria-pressed={s === size} onClick={() => session.setSize(s)}>
                {s}×{s}
              </button>
            ))}
          </div>
        )}
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
