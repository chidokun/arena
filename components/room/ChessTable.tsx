"use client";

import { useEffect, useRef } from "react";
import { emptyState, KING, material, PIECES, type ChessState, type End, type Side } from "@/lib/games/chess";
import type { Result, RoomView, SeatView } from "@/lib/net/room";
import type { ChessMatch, ChessRoom, ChessView } from "@/lib/net/chess-room";
import { ConfirmButton } from "../ConfirmButton";
import { Score } from "./CaroTable";
import { ChatPanel } from "./ChatPanel";
import { ChessBoard, ChessPieceIcon } from "./ChessBoard";
import { Cine, DrawCine, Duel, Eyebrow, Fighter, Party, Stamp, Tip, useEndScene, useMoment, WinCine } from "./Cine";
import { PeoplePanel, SeatCard } from "./People";
import { Flyers, RoomLayout, StatusChip } from "./RoomLayout";
import { useBalloons, useFlyers, useRoomView } from "./useRoom";

type View = RoomView<ChessView>;

const SIDE_NAME = { 1: "Trắng", 2: "Đen" } as const;
const SIDE_TONE = { 1: "var(--sun)", 2: "var(--grape)" } as const;
const CONFETTI = ["🎉", "🏆", "✨", "🎊", "♟️", "⭐"];

const INTRO_MS = 4200;
const CHECK_MS = 1500;

/** Lý do thắng / hoà theo cách ván kết thúc. */
function reasonOf(r: Result, end: End | null) {
  switch (r.reason) {
    case "resign":
      return "đối thủ xin thua";
    case "leave":
      return "đối thủ rời trận";
    case "kick":
      return "đối thủ bị mời ra";
    case "agree":
      return "hai bên đồng ý hoà";
  }
  switch (end) {
    case "mate":
      return "chiếu hết";
    case "stalemate":
      return "hết nước đi (không bị chiếu)";
    case "repeat":
      return "lặp lại thế cờ ba lần";
    case "fifty":
      return "50 nước không ăn quân, không đi Tốt";
    case "material":
      return "không đủ quân chiếu hết";
  }
  return "";
}

export function ChessTable({ id, slug, session }: { id: string; slug: string; session: ChessRoom }) {
  const view = useRoomView(session)!;
  const m = view.meta!;
  const { match: g, wins, draws } = view.game!;
  const balloons = useBalloons(session);
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);
  const scenes = useScenes(view);

  const showGame = !!g && (m.status !== "waiting" || g.state.count > 0);
  const state = showGame ? g!.state : emptyState();
  const playing = m.status === "playing";
  const seated = view.mySeat >= 0;
  const inLineup = !!g && g.mySide > 0;
  const flip = showGame && g!.mySide === 2;
  const lead = material(state.board);

  // Thanh đối đầu: trong ván thì Trắng bên trái, Đen bên phải; khi chờ thì theo ghế.
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
        <span className="chip text-ink-2">⚪ Trắng đi trước</span>
      </header>

      <div className="mb-2 flex items-stretch gap-2 sm:gap-4">
        <SeatCard
          seat={slots[0]}
          mark={showGame ? 1 : undefined}
          badge={showGame ? <SeatPiece v={KING} /> : undefined}
          tone={showGame ? SIDE_TONE[1] : undefined}
          active={playing && !g?.result && state.turn === 1}
          isHost={slots[0]?.uid === m.host}
          balloon={slots[0] ? balloons[slots[0].uid] : undefined}
          me={view.me}
        />
        <Score left={slots[0]?.uid} right={slots[1]?.uid} wins={wins} draws={draws} played={m.scored ?? 0} />
        <SeatCard
          seat={slots[1]}
          mark={showGame ? 2 : undefined}
          badge={showGame ? <SeatPiece v={-KING} /> : undefined}
          tone={showGame ? SIDE_TONE[2] : undefined}
          active={playing && !g?.result && state.turn === 2}
          isHost={slots[1]?.uid === m.host}
          balloon={slots[1] ? balloons[slots[1].uid] : undefined}
          me={view.me}
          align="right"
        />
      </div>
      {showGame && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <Captured pieces={state.captured.filter((v) => v < 0)} lead={lead} />
          <Captured pieces={state.captured.filter((v) => v > 0)} lead={-lead} align="right" />
        </div>
      )}

      <ActionBar view={view} session={session} />

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_210px]">
        <div className="relative">
          <div ref={boardRef} className="card mx-auto max-w-[600px] overflow-hidden p-1.5 sm:p-2.5">
            <ChessBoard
              key={`${g?.round ?? 0}:${flip}`}
              state={state}
              canPlay={!!g?.myTurn && !scenes.intro.shown}
              mySide={g?.mySide ?? 0}
              flip={flip}
              onMove={(from, to, promo) => session.move(from, to, promo)}
            />
          </div>
          <Flyers flyers={flyers} />
          {scenes.check && (
            <div className="xq-check-flash" aria-live="assertive">
              <span>Chiếu!</span>
            </div>
          )}
          {!showGame && m.status === "waiting" && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <p className="card px-5 py-3 text-center font-display text-lg font-extrabold">
                {m.players.length < m.seats ? `Đang chờ đủ ${m.seats} người vào ghế…` : view.isHost ? "Đủ người rồi — bấm Bắt đầu!" : "Đang chờ chủ phòng bắt đầu…"}
              </p>
            </div>
          )}
        </div>
        <MoveList state={state} />
      </div>
      {!seated && !inLineup && <p className="mt-3 text-center text-sm text-ink-3">👀 Bạn đang ở chế độ xem.</p>}

      {g && scenes.intro.shown && <IntroScene match={g} me={view.me} onClose={scenes.intro.close} />}
      {g?.result && scenes.end.shown && <EndScene match={g} me={view.me} onClose={scenes.end.close} />}
      <Party bits={scenes.end.party} />
    </RoomLayout>
  );
}

/** Quân Vua trên huy hiệu ghế, co theo khung huy hiệu. */
const SeatPiece = ({ v }: { v: number }) => <ChessPieceIcon v={v} className="h-[88%] w-[88%]" />;

/**
 * Các cảnh diễn khi khoảnh khắc xảy ra ngay trước mắt: mở ván (ván mới chưa ai đi), hết ván (kèm pháo giấy, trừ người
 * thua), chiếu. Vào phòng / tải lại trang giữa chừng thì không diễn lại.
 */
function useScenes(view: View) {
  const m = view.meta!;
  const g = view.game?.match;
  const live = m.status === "playing" && g?.round === m.round && !g.result;
  const intro = useMoment(live && g!.state.count === 0 ? g!.round : 0, INTRO_MS);
  const end = useEndScene(g?.result ? g.round : 0, { cheer: g?.result?.loser !== view.me, emojis: CONFETTI });
  const check = useMoment(live && g!.state.check ? `${g!.round}:${g!.state.count}` : "", CHECK_MS);
  return { intro, end, check: check.shown };
}

/** Một bên trong cảnh đối đầu: avatar viền theo phe, quân Vua của bên đó, tên. */
function fighter(seat: SeatView, side: Side, me: string) {
  return (
    <Fighter
      p={seat.member}
      name={seat.uid === me ? "Bạn" : (seat.member?.name ?? "Ai đó")}
      sub={`Quân ${SIDE_NAME[side]}${side === 1 ? " · đi trước" : ""}`}
      ring={side === 1 ? "#ffffff" : "#2b2540"}
      badge={<ChessPieceIcon v={side === 1 ? KING : -KING} size={44} />}
      plainBadge
      side={side === 1 ? "left" : "right"}
    />
  );
}

/** Cảnh mở ván: hai bên lao vào từ hai phía, "Khai cuộc!" — bấm để vào bàn. */
function IntroScene({ match: g, me, onClose }: { match: ChessMatch; me: string; onClose: () => void }) {
  const tip =
    g.mySide === 1 ? "Bạn cầm quân Trắng — đi trước nhé!" : g.mySide === 2 ? "Bạn cầm quân Đen — chờ Trắng đi trước nhé!" : "Quân Trắng đi trước — cùng xem ván cờ nhé!";
  return (
    <Cine tone="grape" label="Khai cuộc" onClose={onClose} skip="Bấm để vào bàn" gap={6}>
      <Eyebrow>♟️ Cờ Vua · Ván {g.round}</Eyebrow>
      <Duel left={fighter(g.lineup[0], 1, me)} right={fighter(g.lineup[1], 2, me)} />
      <Stamp>Khai cuộc!</Stamp>
      <Tip>{tip}</Tip>
    </Cine>
  );
}

/** Cảnh hết ván: người thắng (vàng rực) hoặc hoà cờ — bấm để đóng. */
function EndScene({ match: g, me, onClose }: { match: ChessMatch; me: string; onClose: () => void }) {
  const r = g.result!;
  const why = reasonOf(r, g.state.end);
  if (!r.winner)
    return (
      <DrawCine
        people={g.lineup.map((s, k) => ({ uid: s.uid, p: s.member, ring: SIDE_TONE[(k + 1) as Side] }))}
        title="Hoà cờ!"
        sub={why ? `Ván ${g.round} hoà — ${why}` : undefined}
        onClose={onClose}
      />
    );
  const k = g.lineup.findIndex((s) => s.uid === r.winner);
  const seat = g.lineup[k];
  const side = (k + 1) as Side;
  return (
    <WinCine
      winners={[{ uid: r.winner, p: seat?.member, badge: <ChessPieceIcon v={side === 1 ? KING : -KING} size={40} />, plainBadge: true }]}
      title={r.winner === me ? "Bạn chiến thắng!" : `${seat?.member?.name ?? "Ai đó"} chiến thắng!`}
      sub={`Quân ${SIDE_NAME[side]}${why ? ` · ${why[0].toUpperCase()}${why.slice(1)}` : ""}${r.reason === "mate" && g.state.end === "mate" ? ` sau ${Math.ceil(g.state.count / 2)} nước` : ""}`}
      note={r.loser === me ? "Bạn thua ván này — ván sau phục thù nhé!" : undefined}
      onClose={onClose}
    />
  );
}

/** Quân đã ăn được của một bên, kèm số điểm quân hơn đối thủ (nếu có). */
function Captured({ pieces, lead, align = "left" }: { pieces: number[]; lead: number; align?: "left" | "right" }) {
  const order = [...pieces].sort((a, b) => PIECES[Math.abs(b)].value - PIECES[Math.abs(a)].value || Math.abs(b) - Math.abs(a));
  return (
    <div className={`flex min-h-[26px] min-w-0 flex-1 flex-wrap items-center gap-0 ${align === "right" ? "flex-row-reverse" : ""}`} aria-label={`Đã ăn ${pieces.length} quân`}>
      {order.map((v, i) => (
        <ChessPieceIcon key={i} v={v} size={24} className="-mx-[3px]" />
      ))}
      {lead > 0 && <span className="mx-1.5 text-[13px] font-extrabold text-ink-2 tabular-nums">+{lead}</span>}
    </div>
  );
}

/** Biên bản nước đi: mỗi dòng một lượt Trắng – Đen. */
function MoveList({ state }: { state: ChessState }) {
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
              <b className="text-ink">{a}</b>
              <b className="text-ink-2">{b ?? ""}</b>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-ink-3">Chưa có nước nào. Ký hiệu: e4 (Tốt lên e4), Nf3 (Mã tới f3), Bxc6 (Tượng ăn ở c6), O-O (nhập thành), + chiếu, # chiếu hết.</p>
      )}
    </section>
  );
}

/** Nút hành động chính tuỳ vai trò: vào ghế / rời ghế / bắt đầu / xin hoà / xin thua / ván mới. */
function ActionBar({ view, session }: { view: View; session: ChessRoom }) {
  const m = view.meta!;
  const g = view.game?.match;
  const seated = view.mySeat >= 0;
  const playing = m.status === "playing";
  const full = m.players.length >= m.seats;
  const allOnline = view.seats.every((s) => s.online);
  const name = (uid?: string | null) => (uid ? (uid === view.me ? "Bạn" : (g?.lineup.find((s) => s.uid === uid)?.member?.name ?? view.members.find((p) => p.uid === uid)?.name ?? "Ai đó")) : "");
  const foe = g && g.mySide ? ((3 - g.mySide) as Side) : 0;
  const theyOffer = !!foe && g!.offers.includes(foe as Side);
  const iOffer = !!g?.mySide && g.offers.includes(g.mySide);

  let message: React.ReactNode;
  let tone = "var(--sunken)";
  if (playing && g && !g.result) {
    if (g.mySide) {
      if (theyOffer) {
        tone = "var(--grape-soft)";
        message = <>🤝 Đối thủ xin hoà — bấm “Đồng ý hoà”, hoặc cứ đi tiếp để từ chối.</>;
      } else if (g.myTurn && g.state.check) {
        tone = "var(--coral-soft)";
        message = <>⚠️ Vua của bạn đang bị chiếu — phải đỡ ngay!</>;
      } else if (g.myTurn) {
        tone = "var(--lime-soft)";
        message = (
          <>
            🎯 Đến lượt bạn — cầm quân <b>{SIDE_NAME[g.mySide]}</b>
          </>
        );
      } else message = iOffer ? <>🤝 Bạn đã xin hoà — chờ đối thủ trả lời…</> : <>⏳ Chờ đối thủ đi…</>;
    } else {
      const turn = g.lineup[g.state.turn - 1];
      message = (
        <>
          👀 Đang xem — lượt của <b>{name(turn?.uid)}</b> (quân {SIDE_NAME[g.state.turn]}){g.state.check ? " — đang bị chiếu!" : ""}
        </>
      );
    }
  } else if (g?.result && m.status !== "waiting") {
    const r = g.result;
    const iWon = r.winner === view.me;
    const iLost = r.loser === view.me;
    const why = reasonOf(r, g.state.end);
    tone = iWon ? "var(--sun-soft)" : iLost ? "var(--coral-soft)" : "var(--grape-soft)";
    message = r.winner ? (
      iWon ? (
        <>🏆 Bạn thắng rồi!{why ? ` — ${why}` : ""}</>
      ) : (
        <>
          {iLost ? "😵 Bạn thua" : "🏁"} — <b>{name(r.winner)}</b> thắng{why ? ` — ${why}` : ""}
        </>
      )
    ) : (
      <>🤝 Hoà cờ!{why ? ` — ${why}` : ""}</>
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
        {playing && g?.mySide && !g.result ? (
          <>
            <button type="button" className={`btn ${theyOffer ? "btn-lime" : ""}`} onClick={() => session.offerDraw()} disabled={iOffer}>
              🤝 {theyOffer ? "Đồng ý hoà" : iOffer ? "Đã xin hoà" : "Xin hoà"}
            </button>
            <ConfirmButton className="btn btn-coral" onConfirm={() => session.resign()} confirmLabel="Bấm lần nữa để xin thua">
              🏳️ Xin thua
            </ConfirmButton>
          </>
        ) : null}
      </div>
    </div>
  );
}
