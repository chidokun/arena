"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { emptyState } from "@/lib/games/caro";
import { gameHref, getGame } from "@/lib/games/registry";
import type { RoomSession, RoomView, StickerId } from "@/lib/net/room";
import { ConfirmButton } from "../ConfirmButton";
import { useNet, useWhere } from "../NetProvider";
import { CaroBoard } from "./CaroBoard";
import { ChatPanel } from "./ChatPanel";
import { PeoplePanel, SeatCard } from "./People";
import { stickerEmoji } from "./stickers";
import { useBalloons, useRoomSession, useRoomView } from "./useRoom";

export function RoomScreen({ slug }: { slug: string }) {
  const id = (useSearchParams().get("id") ?? "").trim().toLowerCase();
  const { uid, profile, lobby } = useNet();
  useWhere({ game: slug, room: id || undefined });
  const session = useRoomSession(id, uid, profile, lobby);
  const view = useRoomView(session);
  const game = getGame(slug)!;
  const ad = lobby?.roomAd(id);

  const back = (
    <Link href={gameHref(slug)} className="btn btn-pen mt-6 no-underline">
      Về sảnh {game.name}
    </Link>
  );

  if (!id)
    return (
      <Notice emoji="🤔" title="Thiếu mã phòng">
        Đường dẫn phòng không hợp lệ.
        {back}
      </Notice>
    );
  if (!view || view.phase === "connecting")
    return (
      <Notice emoji="📡" title={ad ? `Đang vào “${ad.name}”…` : `Đang tìm phòng #${id}…`} spin>
        Đang kết nối trực tiếp với những người trong phòng. Việc này thường mất vài giây.
      </Notice>
    );
  if (view.phase === "notfound")
    return (
      <Notice emoji="🏚️" title="Không tìm thấy phòng">
        Phòng #{id} không còn ai hoặc đã đóng. Phòng chỉ tồn tại khi còn ít nhất một người ở trong.
        <span className="flex flex-wrap justify-center gap-3">
          <button type="button" className="btn mt-6" onClick={() => location.reload()}>
            Thử lại
          </button>
          {back}
        </span>
      </Notice>
    );
  if (view.phase === "full")
    return (
      <Notice emoji="🈵" title="Phòng đã đầy">
        Phòng đã đủ {view.meta?.cap} người. Thử lại sau hoặc chọn phòng khác nhé.
        {back}
      </Notice>
    );
  if (view.phase === "kicked")
    return (
      <Notice emoji="🚪" title="Bạn đã bị mời ra khỏi phòng">
        Chủ phòng đã mời bạn ra khỏi “{view.meta?.name}”.
        {back}
      </Notice>
    );
  if (view.phase === "left" || !session || !view.meta)
    return (
      <Notice emoji="👋" title="Bạn đã rời phòng">
        {back}
      </Notice>
    );
  return <Room id={id} slug={slug} session={session} view={view} />;
}

function Notice({ emoji, title, children, spin }: { emoji: string; title: string; children?: React.ReactNode; spin?: boolean }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <div className="card flex flex-col items-center p-8 text-center sm:p-10">
        <span className={`text-6xl ${spin ? "bob" : ""}`} aria-hidden="true">
          {emoji}
        </span>
        <h1 className="mt-4 font-display text-2xl font-extrabold">{title}</h1>
        <div className="mt-2 flex flex-col items-center text-ink-2">{children}</div>
      </div>
    </div>
  );
}

type Flyer = { key: string; sticker: StickerId; left: number; top: number };

/** Lớp sticker bay ngang bàn cờ; cục gạch làm rung bàn. */
function useFlyers(session: RoomSession, boardRef: React.RefObject<HTMLDivElement | null>) {
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  useEffect(
    () =>
      session.onChat((m) => {
        if (!m.sticker || Date.now() - m.at > 8000) return;
        const f: Flyer = { key: m.id, sticker: m.sticker, left: 20 + Math.random() * 55, top: 25 + Math.random() * 40 };
        setFlyers((x) => [...x.slice(-8), f]);
        setTimeout(() => setFlyers((x) => x.filter((y) => y.key !== f.key)), 2600);
        if (m.sticker === "brick" && boardRef.current) {
          const el = boardRef.current;
          setTimeout(() => {
            el.classList.remove("shake");
            void el.offsetWidth;
            el.classList.add("shake");
          }, 650);
        }
      }),
    [session, boardRef],
  );
  return flyers;
}

function Room({ id, slug, session, view }: { id: string; slug: string; session: RoomSession; view: RoomView }) {
  const m = view.meta!;
  const game = getGame(slug)!;
  const balloons = useBalloons(session);
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);
  const [copied, setCopied] = useState(false);

  const g = view.game;
  const showGame = !!g && (m.status !== "waiting" || g.state.count > 0);
  const state = showGame ? g!.state : emptyState(m.opts.size);
  const playing = m.status === "playing";
  const seated = view.mySeat >= 0;
  const inLineup = !!g && g.myMark > 0;

  // Thanh đối đầu: trong ván thì theo thứ tự X–O; khi chờ thì theo ghế.
  const slots = showGame ? g!.lineup : Array.from({ length: m.seats }, (_, i) => view.seats[i]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <nav aria-label="Vị trí" className="min-w-0 basis-full text-sm font-semibold text-ink-3 sm:basis-auto sm:flex-1">
          <Link href="/" className="no-underline hover:text-ink">
            Trang chủ
          </Link>{" "}
          /{" "}
          <Link href={gameHref(slug)} className="no-underline hover:text-ink">
            {game.name}
          </Link>{" "}
          / <span className="text-ink">#{id}</span>
        </nav>
        <button type="button" className="btn btn-sm" onClick={copyLink}>
          {copied ? "✅ Đã chép" : "🔗 Chép link mời"}
        </button>
        <Link href={gameHref(slug)} className="btn btn-sm btn-ghost no-underline">
          Rời phòng
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-display text-3xl font-extrabold tracking-tight">{m.name}</h1>
            <StatusChip status={m.status} round={m.round} />
            <span className="chip text-ink-2">
              ▦ {m.opts.size}×{m.opts.size}
            </span>
            <span className="chip" style={{ color: m.opts.blockTwoEnds ? "var(--sun)" : "var(--ink-3)" }}>
              {m.opts.blockTwoEnds ? "🚧 Chặn 2 đầu" : "Không chặn 2 đầu"}
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
            <span className="self-center font-display text-xl font-extrabold text-ink-3 sm:text-2xl" aria-hidden="true">
              VS
            </span>
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
            {flyers.map((f) => (
              <span key={f.key} className={`fly fly-${f.sticker}`} style={{ left: `${f.left}%`, top: `${f.top}%` }} aria-hidden="true">
                {stickerEmoji(f.sticker)}
              </span>
            ))}
            {!showGame && m.status === "waiting" && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <p className="card px-5 py-3 text-center font-display text-lg font-extrabold">
                  {m.players.length < m.seats ? `Đang chờ đủ ${m.seats} người vào ghế…` : view.isHost ? "Đủ người rồi — bấm Bắt đầu!" : "Đang chờ chủ phòng bắt đầu…"}
                </p>
              </div>
            )}
          </div>
          {!seated && !inLineup && <p className="mt-3 text-center text-sm text-ink-3">👀 Bạn đang ở chế độ xem.</p>}
        </div>

        <div className="grid h-max gap-6">
          <PeoplePanel view={view} session={session} balloons={balloons} roomId={id} />
          <ChatPanel session={session} chat={view.chat} me={view.me} />
        </div>
      </div>
    </div>
  );
}

function StatusChip({ status, round }: { status: string; round: number }) {
  if (status === "playing")
    return (
      <span className="chip" style={{ color: "var(--coral)" }}>
        🔥 Ván {round} đang đấu
      </span>
    );
  if (status === "ended")
    return (
      <span className="chip" style={{ color: "var(--grape)" }}>
        🏁 Hết ván {round}
      </span>
    );
  return (
    <span className="chip" style={{ color: "var(--lime)" }}>
      ⏳ Đang chờ
    </span>
  );
}

/** Nút hành động chính tuỳ vai trò: vào ghế / rời ghế / bắt đầu / xin thua / ván mới. */
function ActionBar({ view, session }: { view: RoomView; session: RoomSession }) {
  const m = view.meta!;
  const g = view.game;
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
