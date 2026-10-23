"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CLASSIC,
  coord,
  FLEET,
  fleetGrid,
  kindsFor,
  kindsOf,
  flippable,
  flipped,
  MAX_SHIPS,
  MIN_SHIPS,
  MODES,
  modeLabel,
  normOptions,
  randomFleet,
  rotated,
  shapeOf,
  shipCells,
  SIZE,
  TURN_LIMITS,
  turnLabel,
  type BsMode,
  type Ship,
} from "@/lib/games/battleship";
import type { BattleshipRoom, BsMatch, BsSide, BsView } from "@/lib/net/battleship-room";
import type { RoomState, RoomView } from "@/lib/net/room";
import { BS_TONE, damage, fleetDraws, SeaBoard, ShapeIcon, type ShipDraw } from "./BattleshipBoard";
import { Score, Wins } from "./CaroTable";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, DrawCine, Duel, Fighter, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel, SeatCard } from "./People";
import { DuelResult, type DuelSummary } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout, SpectatorNote, WaitingOverlay } from "./RoomLayout";
import { StageArea, useStaged } from "./stage";
import { forfeitWhy, ResignButton, SeatButtons, seatMessage, StatusBar, TONE } from "./StatusBar";
import { shortTurn, TIME_BAR_H, TimeBar, TurnClock, useTimeLeft } from "./TurnClock";
import { shallowEqual, useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

type View = Omit<RoomView<BsView>, "chat">;

// Ghép riêng ba store để phần bàn không vẽ lại theo nhịp tim, theo tin chat, và không kéo các phần khác theo.
function useBsView(session: BattleshipRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const CHEERS = ["🎉", "🏆", "✨", "🎊", "⚓", "💥"];
/** Phát bắn chìm chiếc tàu cuối: chờ một nhịp cho hiệu ứng nổ kịp diễn rồi mới vào cảnh chiến thắng. */
const SUNK_PAUSE_MS = 2200;
// Các số px là phần chữ dưới mỗi hải đồ (dòng phát bắn cuối, tiêu đề, danh sách tàu). Màn hình dọc không đủ chỗ cho
// hai hải đồ nên mỗi cái rộng hết bề ngang, chồng lên nhau và cuộn dọc.
// Ván có bấm giờ thì thanh thời gian chiếm thêm TIME_BAR_H phía trên nên hai hải đồ (đặt cạnh nhau) hẹp đi gấp đôi chừng đó.
const WATERS_FIT = "w-full landscape:h-full landscape:w-[min(100cqw,200cqh_-_290px)]";
const WATERS_FIT_TIMED = "w-full landscape:h-full landscape:w-[min(100cqw,200cqh_-_330px)]";
const EDITOR_FIT = "w-full landscape:w-[min(100cqw,100cqh_+_164px)]";
// Ước lượng thôi — hải đồ vẫn tự co cho vừa.
const watersCenter = (timed: boolean) => `200cqh + ${260 - (timed ? 2 * TIME_BAR_H : 0)}px`;
const EDITOR_CENTER = "100cqh + 164px";

export function BattleshipTable({ id, slug, session }: { id: string; slug: string; session: BattleshipRoom }) {
  const head = useRoomState(session, headOf, shallowEqual);
  const setup = useGame(session, (v) => v?.match?.phase === "setup");

  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <RoomHeader name={head.name} status={head.status} round={head.round} playing={setup ? "đang bày tàu" : "đang giao chiến"}>
        <span className="chip text-ink-2">
          ▦ {SIZE}×{SIZE} · {fleetLabel(head.mode)}
        </span>
        <span className="chip" style={{ color: head.chain ? "var(--sun)" : "var(--ink-3)" }}>
          {head.chain ? "🎯 Trúng được bắn tiếp" : "Mỗi phát một lượt"}
        </span>
        {head.turn > 0 && <span className="chip text-ink-2">⏱ {shortTurn(head.turn)}/lượt</span>}
      </RoomHeader>

      <div className="mb-4">
        <SeatRowPart session={session} />
      </div>

      <ActionPart session={session} />
      <Settings session={session} />
      <ResultPart session={session} />
      <PlayPart session={session} />
    </RoomLayout>
  );
}

// Bàn còn đang hiện ván đã chơi thì ghi luật của ván đó; luật ván tới nằm ở khung cài đặt bên dưới.
const fleetLabel = (mode: BsMode) => (mode === "basic" ? `${modeLabel(mode)} · ${CLASSIC.length} tàu` : `${modeLabel(mode)} · ${MIN_SHIPS}–${MAX_SHIPS} tàu tự chọn`);

const headOf = (r: RoomState) => {
  const m = r.meta!;
  const opts = m.status !== "waiting" && m.bs ? m.bs : normOptions(m.opts);
  return { name: m.name, status: m.status, round: m.round, chain: opts.chain, turn: opts.turn, mode: opts.mode };
};

const SeatRowPart = memo(function SeatRowPart({ session }: { session: BattleshipRoom }) {
  const view = useBsView(session);
  const { g, slots, busy } = seatsOf(view);
  return (
    <div className="flex items-stretch gap-2 sm:gap-4">
      {([0, 1] as const).map((i) => (
        <SeatSlot key={i} i={i} seat={slots[i]} g={g} view={view} busy={busy(i)} />
      ))}
    </div>
  );
});

function seatsOf(view: View) {
  const m = view.meta!;
  const g = view.game!.match;
  const live = m.status === "playing" && !!g && !g.result;
  const slots = g ? g.sides.map((s) => s.seat) : [view.seats[0], view.seats[1]];
  const busy = (i: 0 | 1) => live && (g.phase === "setup" ? !g.sides[i].ready : g.turn === i);
  return { g, slots, busy };
}

const FlankPart = memo(function FlankPart({ session, i }: { session: BattleshipRoom; i: 0 | 1 }) {
  const view = useBsView(session);
  const { g, slots, busy } = seatsOf(view);
  const seat = slots[i];
  const wins = (k: number) => (slots[k]?.uid ? (view.game!.wins[slots[k]!.uid] ?? 0) : 0);
  return (
    <SeatCard
      seat={seat}
      mark={g ? ((i + 1) as 1 | 2) : undefined}
      badge={g ? "⚓" : undefined}
      tone={g ? BS_TONE[i] : undefined}
      active={busy(i)}
      isHost={seat?.uid === view.meta!.host}
      me={view.me}
      align={i === 1 ? "right" : "left"}
      stacked
      footer={seat ? <Wins n={wins(i)} color={wins(i) > wins(1 - i) ? BS_TONE[i] : undefined} /> : undefined}
    />
  );
});

const ActionPart = memo(function ActionPart({ session }: { session: BattleshipRoom }) {
  const view = useBsView(session);
  return <ActionBar view={view} session={session} />;
});

const ControlsPart = memo(function ControlsPart({ session }: { session: BattleshipRoom }) {
  const view = useBsView(session);
  return actionsOf(view, session).buttons;
});

const ResultPart = memo(function ResultPart({ session }: { session: BattleshipRoom }) {
  const { me, ended } = useRoomState(session, (r) => ({ me: r.me, ended: r.meta!.status === "ended" }), shallowEqual);
  const g = useGame(session, (v) => v?.match);
  return ended && g?.result ? <DuelResult round={g.round} summary={summary(g, me)} me={me} /> : null;
});

const PlayPart = memo(function PlayPart({ session }: { session: BattleshipRoom }) {
  const view = useBsView(session);
  const m = view.meta!;
  const g = view.game!.match;
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);
  const live = m.status === "playing" && !!g && !g.result;
  const seated = view.mySeat >= 0;
  const count = useCountdown(live && g.phase === "battle" && !g.last && g.pending < 0 ? g.round : 0);
  const end = useEndScene(g?.result ? g.round : 0, { delay: g?.result?.reason === "sunk" ? SUNK_PAUSE_MS : 0, cheer: g?.result?.loser !== view.me, emojis: CHEERS });
  const timed = live && g.phase === "battle" && g.opts.turn > 0;
  return (
    <>
      <StageArea
        className="mt-4"
        fit={g?.placing ? EDITOR_FIT : timed ? WATERS_FIT_TIMED : WATERS_FIT}
        head={<SeatRowPart session={session} />}
        flanks={[<FlankPart key={0} session={session} i={0} />, <FlankPart key={1} session={session} i={1} />]}
        center={g?.placing ? EDITOR_CENTER : watersCenter(timed)}
        tools={<ControlsPart session={session} />}
        scroll
      >
        <div ref={boardRef} className="relative landscape:h-full">
          {g?.placing ? <FleetEditor key={g.round} round={g.round} mode={g.opts.mode} session={session} foe={g.sides[1 - g.me]} /> : <Waters view={view} session={session} locked={count > 0} timed={timed} />}
          <Flyers flyers={flyers} />
        </div>
      </StageArea>
      {!seated && !(g && g.me >= 0) && <SpectatorNote />}

      {g && count > 0 && <CountdownScene match={g} me={view.me} n={count} />}
      {g?.result && end.shown && <EndScene match={g} me={view.me} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

const RING = ["#ff5a5f", "#2f7bff"] as const;

const fighter = (g: BsMatch, i: 0 | 1, me: string) => {
  const seat = g.sides[i].seat;
  return (
    <Fighter
      p={seat.member}
      name={seat.uid === me ? "Bạn" : (seat.member?.name ?? "Ai đó")}
      sub={i === 0 ? "Khai hoả trước" : "Bắn sau"}
      ring={RING[i]}
      badge={<span style={{ color: RING[i] }}>⚓</span>}
      side={i === 0 ? "left" : "right"}
    />
  );
};

function CountdownScene({ match: g, me, n }: { match: BsMatch; me: string; n: number }) {
  const first = g.sides[0].seat;
  const tip = g.me === 0 ? "Bạn khai hoả trước — ngắm cho chuẩn nhé!" : g.me === 1 ? "Đối thủ khai hoả trước — giữ vững hạm đội nhé!" : `${first.member?.name ?? "Ai đó"} khai hoả trước — cùng xem nhé!`;
  return (
    <CountdownCine eyebrow={`🚢 Bắn Tàu · Ván ${g.round} · Hạm đội sẵn sàng`} n={n} tip={tip}>
      <Duel left={fighter(g, 0, me)} right={fighter(g, 1, me)} />
    </CountdownCine>
  );
}

function summary(g: BsMatch, me: string): DuelSummary {
  const r = g.result!;
  if (!r.winner) return { winner: null, title: "Hoà!", sub: `Ván ${g.round} hoà` };
  const k = g.sides.findIndex((s) => s.seat.uid === r.winner);
  const shots = g.sides[1 - k]?.marks.filter((v) => v >= 0).length ?? 0;
  const ships = g.sides[1 - k]?.kinds.length ?? 0;
  return {
    winner: r.winner,
    title: r.winner === me ? "Bạn chiến thắng!" : `${g.sides[k]?.seat.member?.name ?? "Ai đó"} chiến thắng!`,
    sub: forfeitWhy(r) ?? `Đánh chìm toàn bộ ${ships} tàu sau ${shots} phát bắn`,
    note: r.loser === me ? `${r.reason === "sunk" ? "Hạm đội của bạn đã chìm" : "Bạn thua ván này"} — ván sau phục thù nhé!` : undefined,
  };
}

function EndScene({ match: g, me, onClose }: { match: BsMatch; me: string; onClose: () => void }) {
  const s = summary(g, me);
  if (!s.winner) return <DrawCine people={g.sides.map((x, k) => ({ uid: x.seat.uid, p: x.seat.member, ring: RING[k] }))} title={s.title} sub={s.sub} onClose={onClose} />;
  const k = g.sides.findIndex((x) => x.seat.uid === s.winner);
  return <WinCine winners={[{ uid: s.winner, p: g.sides[k]?.seat.member, badge: <span style={{ color: RING[k] }}>⚓</span> }]} title={s.title} sub={s.sub} note={s.note} onClose={onClose} />;
}

function SeatSlot({ i, seat, g, view, busy }: { i: 0 | 1; seat?: BsSide["seat"]; g?: BsMatch; view: View; busy: boolean }) {
  const m = view.meta!;
  const card = (
    <SeatCard
      seat={seat}
      mark={g ? ((i + 1) as 1 | 2) : undefined}
      badge={g ? "⚓" : undefined}
      tone={g ? BS_TONE[i] : undefined}
      active={busy}
      isHost={seat?.uid === m.host}
      me={view.me}
      align={i === 1 ? "right" : "left"}
    />
  );
  if (i === 0) return card;
  const { wins, draws } = view.game!;
  return (
    <>
      <Score left={g?.sides[0].seat.uid ?? view.seats[0]?.uid} right={seat?.uid} wins={wins} draws={draws} played={m.scored ?? 0} />
      {card}
    </>
  );
}

const nameOf = (view: View, uid?: string | null) =>
  uid ? (view.members.find((p) => p.uid === uid)?.name ?? view.game?.match?.sides.find((s) => s.seat.uid === uid)?.seat.member?.name ?? "Ai đó") : "";

function actionsOf(
  view: View,
  session: BattleshipRoom,
): { tone?: string; message: ReactNode; buttons?: ReactNode; clock?: { deadline: number; limit: number } } {
  const m = view.meta!;
  const g = view.game!.match;
  const name = (uid?: string | null) => nameOf(view, uid);

  if (m.status === "playing" && g && !g.result) {
    const clock = g.opts.turn && g.phase === "battle" ? { deadline: g.deadline, limit: g.opts.turn } : undefined;
    if (g.me < 0)
      return {
        message:
          g.phase === "setup" ? (
            <>👀 Đang xem — hai bên đang bày tàu…</>
          ) : (
            <>
              👀 Đang xem — lượt bắn của <b>{name(g.sides[g.turn].seat.uid)}</b>
            </>
          ),
        clock,
      };
    const foe = g.sides[1 - g.me];
    let tone: string = TONE.idle;
    let message: ReactNode;
    if (g.lost) {
      tone = TONE.alert;
      message = <>⚠️ Máy này không còn sơ đồ hạm đội của bạn nên không tự báo kết quả phát bắn được — bạn có thể xin thua.</>;
    } else if (g.phase === "setup")
      message = g.placing ? (
        <>
          🛠️ Bày hạm đội rồi bấm <b>Sẵn sàng</b> — {foe.ready ? "đối thủ đã sẵn sàng!" : "đối thủ cũng đang bày tàu."}
        </>
      ) : (
        <>
          🔒 Đã chốt hạm đội. Chờ <b>{name(foe.seat.uid)}</b> bày tàu…
        </>
      );
    else if (g.myTurn) {
      tone = TONE.turn;
      message = (
        <>
          🎯 Đến lượt bạn — chọn một ô trên hải đồ đối phương để khai hoả{clock ? " trước khi hết giờ (hết giờ là mất lượt)" : ""}
          {g.opts.chain ? " (trúng được bắn tiếp)" : ""}
        </>
      );
    } else message = g.turn === g.me ? <>📡 Đang chờ đối thủ báo kết quả…</> : <>⏳ Đối thủ đang ngắm bắn…</>;
    return { tone, message, buttons: <ResignButton onConfirm={() => session.resign()} />, clock };
  }
  return { message: seatMessage(view), buttons: <SeatButtons view={view} session={session} /> };
}

// Đồng hồ ẩn với trình đọc màn hình để thanh trạng thái (vùng `aria-live`) không đọc lại mỗi giây.
function ActionBar({ view, session }: { view: View; session: BattleshipRoom }) {
  const { tone, message, buttons, clock } = actionsOf(view, session);
  return (
    <StatusBar tone={tone} message={message}>
      {clock && <Clock {...clock} />}
      {buttons}
    </StatusBar>
  );
}

// Đang chờ bên bị bắn báo kết quả thì không có hạn chót: giữ đồng hồ đầy. Hạn chót phát đầu tính cả lúc đếm ngược khai
// hoả nên kẹp lại để đồng hồ đầy trong lúc đó.
function Clock({ deadline, limit }: { deadline: number; limit: number }) {
  const left = useTimeLeft(deadline);
  return <TurnClock left={deadline ? Math.min(limit * 1000, left) : limit * 1000} />;
}

// Tách riêng để đồng hồ chạy chỉ vẽ lại thanh này, không kéo cả hai hải đồ vẽ lại theo.
function TurnBar({ match: g }: { match: BsMatch }) {
  const total = g.opts.turn * 1000;
  const left = useTimeLeft(g.deadline);
  return <TimeBar left={g.deadline ? Math.min(total, left) : total} total={total} tone={BS_TONE[g.turn]} />;
}

function Waters({ view, session, locked, timed }: { view: View; session: BattleshipRoom; locked: boolean; timed: boolean }) {
  const g = view.game!.match;
  const m = view.meta!;
  // Lúc trình chiếu xếp theo hướng màn hình (ngang: cạnh nhau, dọc: chồng lên), khớp với WATERS_FIT.
  const staged = useStaged();
  const cols = staged ? "landscape:grid-cols-2" : "md:grid-cols-2";
  if (!g)
    return (
      <div className="relative">
        <div className={`grid gap-4 ${cols}`} aria-hidden="true">
          {[0, 1].map((i) => (
            <section key={i} className="card p-2 opacity-60 sm:p-3">
              <SeaBoard label="Hải đồ trống" />
            </section>
          ))}
        </div>
        <WaitingOverlay isHost={view.isHost} players={m.players.length} seats={m.seats} />
      </div>
    );
  const order: (0 | 1)[] = g.me !== -1 ? [(1 - g.me) as 0 | 1, g.me] : [0, 1];
  // Hải đồ co vừa phần còn lại sau chữ để chữ nhiều lên thì hải đồ nhỏ lại chứ không tràn.
  return (
    <div className={staged ? "landscape:flex landscape:h-full landscape:flex-col" : undefined}>
      {g.phase === "battle" && <LastShot g={g} view={view} />}
      {timed && <TurnBar match={g} />}
      <div className={`grid gap-4 ${cols} ${staged ? "landscape:min-h-0 landscape:flex-1 landscape:grid-rows-[minmax(0,1fr)]" : ""}`}>
        {order.map((i) => (
          <Side key={i} i={i} g={g} view={view} session={session} locked={locked} fit={staged} />
        ))}
      </div>
    </div>
  );
}

function LastShot({ g, view }: { g: BsMatch; view: View }) {
  const out = g.passed;
  if (out !== -1)
    return (
      <p key={`pass:${g.last?.n ?? -1}`} className="pop-in mb-3 text-center text-[15px] font-semibold" aria-live="polite">
        ⏱ <b style={{ color: BS_TONE[out] }}>{nameOf(view, g.sides[out].seat.uid)}</b> hết giờ — mất lượt, tới lượt{" "}
        <b style={{ color: BS_TONE[g.turn] }}>{nameOf(view, g.sides[g.turn].seat.uid)}</b>
      </p>
    );
  const x = g.last;
  if (!x) return <p className="mb-3 text-center text-sm font-semibold text-ink-3">💣 Chưa ai khai hoả — {nameOf(view, g.sides[0].seat.uid)} bắn trước.</p>;
  const what = x.r === 0 ? "💦 Trượt" : x.r === 1 ? "💥 Trúng!" : `🔥 Chìm ${FLEET[x.k!].name}!`;
  return (
    <p key={x.n} className="pop-in mb-3 text-center text-[15px] font-semibold" aria-live="polite">
      <b style={{ color: BS_TONE[x.by] }}>{nameOf(view, g.sides[x.by].seat.uid)}</b> bắn <b className="font-display">{coord(x.c)}</b> —{" "}
      <b style={{ color: x.r ? "var(--coral)" : "var(--ink-2)" }}>{what}</b>
    </p>
  );
}

function Side({ i, g, view, session, locked, fit }: { i: 0 | 1; g: BsMatch; view: View; session: BattleshipRoom; locked: boolean; fit?: boolean }) {
  const side = g.sides[i];
  const mine = g.me === i;
  const foeOfMine = g.me >= 0 && !mine;
  const ended = !!g.result;
  const setup = g.phase === "setup";
  const who = nameOf(view, side.seat.uid);
  const title = mine ? "⚓ Hạm đội của bạn" : foeOfMine ? `🎯 Hải đồ của ${who}` : `Hạm đội ${who}`;
  const shooter = BS_TONE[(1 - i) as 0 | 1];
  const targeted = !setup && !ended && view.meta!.status === "playing" && g.turn !== i;
  const last = g.last && g.last.by !== i ? g.last : undefined;
  const ships = fleetDraws(side.sunk, side.fleet, mine ? "steel" : "reveal", last?.r === 2 ? last.k : -1);
  const total = side.kinds.length;
  const alive = total - side.sunk.length;
  const fog = setup && !(mine && side.ready);
  const fire = foeOfMine && g.myTurn && !locked;

  return (
    <section
      className={`card min-w-0 p-2 transition-shadow sm:p-3 ${fit ? "landscape:flex landscape:h-full landscape:flex-col" : ""}`}
      style={{ borderColor: targeted ? shooter : undefined, boxShadow: targeted ? `0 4px 0 ${shooter}` : undefined }}
      aria-label={title}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 pb-2">
        <span className="h-3.5 w-3.5 flex-none rounded-full border-2 border-edge" style={{ background: BS_TONE[i] }} aria-hidden="true" />
        <h2 className="min-w-0 flex-1 truncate font-display text-[17px] font-extrabold">{title}</h2>
        {side.commit && (
          <span className="chip text-ink-3" title={`Sơ đồ đã niêm phong — cam kết SHA-256: ${side.commit}`}>
            🔒 {side.commit.slice(0, 6)}
          </span>
        )}
        {!setup && (
          <span className="text-[12.5px] font-bold text-ink-3">
            {alive}/{total} tàu
          </span>
        )}
      </header>
      <div className={fit ? "bs-fit-wrap" : undefined}>
        <div className={fit ? "bs-fit" : undefined}>
          <div className={fit ? "bs-fit-board" : undefined}>
            <div className="relative">
              <SeaBoard
                label={`${title} — còn ${alive}/${total} tàu${fire ? ". Đến lượt bạn: chọn ô để bắn (mũi tên + Enter)." : ""}`}
                ships={ships}
                marks={side.marks}
                last={last?.c ?? -1}
                fresh
                pending={g.turn !== i ? g.pending : -1}
                aim={fire ? BS_TONE[g.me as 0 | 1] : undefined}
                canHit={(c) => side.marks[c] < 0}
                onCell={fire ? (c) => session.fire(c) : undefined}
              />
              {fog && (
                <div className="absolute inset-0 grid place-items-center rounded-xl" style={{ background: "color-mix(in srgb, var(--surface) 55%, transparent)" }}>
                  <p className="card px-4 py-2 text-center font-display text-[15px] font-extrabold">{side.ready ? "🔒 Đã bày xong" : "🛠️ Đang bày tàu…"}</p>
                </div>
              )}
            </div>
          </div>
          <div className={fit ? "bs-fit-info" : undefined}>
            {/* Nâng cao: đang chơi chỉ hiện số tàu còn lại, đội hình hai bên chỉ lộ khi hết ván. */}
            {(ended || g.opts.mode === "basic") && <FleetList side={side} />}
            {ended && <Honesty side={side} />}
          </div>
        </div>
      </div>
    </section>
  );
}

function FleetList({ side }: { side: BsSide }) {
  const hits = side.fleet ? damage(side.fleet, side.marks) : null;
  if (!side.kinds.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5 px-1" aria-label="Hạm đội">
      {side.kinds.map((k) => {
        const s = FLEET[k];
        const len = s.cells.length;
        const sunk = side.sunk.some((x) => x.k === k);
        const n = sunk ? len : (hits?.[k] ?? 0);
        return (
          <li
            key={k}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold ${sunk ? "bg-coral-soft text-ink-3 line-through" : "bg-sunken text-ink-2"}`}
            aria-label={`${s.name} (${len} ô)${sunk ? " — đã chìm" : n ? ` — trúng ${n} ô` : ""}`}
          >
            <ShapeIcon k={k} size={6} hits={n} />
            <span aria-hidden="true">{s.name}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Honesty({ side }: { side: BsSide }) {
  if (side.honest === true)
    return (
      <p className="mt-2 rounded-lg bg-lime-soft px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-2">
        🔐 Hạm đội công bố khớp cam kết và mọi lần báo kết quả — chơi đẹp!
      </p>
    );
  if (side.honest === false)
    return (
      <p className="mt-2 rounded-lg bg-coral-soft px-2.5 py-1.5 text-[12.5px] font-semibold text-ink">
        ⚠️ Hạm đội công bố không khớp cam kết hoặc lần báo kết quả — có dấu hiệu gian lận.
      </p>
    );
  if (!side.ready) return null;
  return <p className="mt-2 px-1 text-[12.5px] font-semibold text-ink-3">⏳ Đang chờ công bố hạm đội để đối chiếu…</p>;
}

type Held = { k: number; o: number; i: number; from: Ship | null };
// Theo loại tàu: `undefined` là không chọn, `null` là đã chọn nhưng chưa đặt.
type Slots = (Ship | null | undefined)[];

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

const slotsOf = (fleet: readonly Ship[]): Slots => FLEET.map((_, k) => fleet.find((s) => s.k === k));

// `i` là phần tàu đang cầm (thứ tự ô trong hình), giữ nguyên khi xoay / lật để tàu xoay quanh chỗ đang cầm.
function anchorOf(k: number, o: number, i: number, c: number): Ship {
  const shape = shapeOf(k, o)!;
  const [dx, dy] = shape.cells[clamp(i, 0, shape.cells.length - 1)];
  const x = clamp((c % SIZE) - dx, 0, SIZE - shape.w);
  const y = clamp(Math.floor(c / SIZE) - dy, 0, SIZE - shape.h);
  return { k, at: y * SIZE + x, o };
}

function fits(slots: Slots, ship: Ship) {
  const cells = shipCells(ship);
  if (!cells) return false;
  const taken = new Set(slots.flatMap((s) => (s && s.k !== ship.k ? shipCells(s)! : [])));
  return cells.every((c) => !taken.has(c));
}

function FleetEditor({ round, mode, session, foe }: { round: number; mode: BsMode; session: BattleshipRoom; foe: BsSide }) {
  const basic = mode === "basic";
  // Cơ bản luôn là 5 tàu thẳng; nâng cao bày ngẫu nhiên thì chọn ngẫu nhiên cả loại lẫn số lượng.
  const shuffle = () => randomFleet(basic ? CLASSIC : undefined);
  const [slots, setSlots] = useState<Slots>(() => {
    const draft = session.draft(round);
    return slotsOf(draft && kindsFor(mode, kindsOf(draft)) ? draft : shuffle());
  });
  const [held, setHeld] = useState<Held | null>(null);
  const [hover, setHover] = useState(-1);
  const [sending, setSending] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const picked = slots.flatMap((s, k) => (s !== undefined ? [k] : []));
  const fleet = slots.filter((s): s is Ship => !!s);
  const full = picked.length >= MAX_SHIPS;
  const done = !held && picked.length >= MIN_SHIPS && fleet.length === picked.length && !!fleetGrid(fleet);

  useEffect(() => {
    const ships = slots.filter((s): s is Ship => !!s);
    if (ships.length && slots.every((s) => s !== null)) session.saveDraft(round, ships);
  }, [slots, round, session]);

  const shipAt = (c: number) => slots.findIndex((s) => !!s && shipCells(s)!.includes(c));
  const preview = held && hover >= 0 ? anchorOf(held.k, held.o, held.i, hover) : null;
  const ok = !!preview && fits(slots, preview);

  const shake = () => {
    const el = boardRef.current;
    if (!el) return;
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  };

  // Cầm loại tàu chưa chọn là chọn luôn nó.
  const lift = (k: number, i: number) => {
    if (slots[k] === undefined && full) return shake();
    let f = slots;
    if (held?.from) f = f.map((s, j) => (j === held.k ? held.from : s));
    setHeld({ k, o: f[k]?.o ?? 0, i, from: f[k] ?? null });
    setSlots(f.map((s, j) => (j === k ? null : s)));
  };

  const cancel = () => {
    if (!held) return;
    if (held.from) setSlots((f) => f.map((s, j) => (j === held.k ? held.from : s)));
    setHeld(null);
  };

  const toggle = (k: number) => {
    if (slots[k] === undefined) return lift(k, 0);
    let f = slots;
    if (held?.from && held.k !== k) f = f.map((s, j) => (j === held.k ? held.from : s));
    if (held) setHeld(null);
    setSlots(f.map((s, j) => (j === k ? undefined : s)));
  };

  const tap = (c: number) => {
    if (!held) {
      const k = shipAt(c);
      if (k >= 0) lift(k, shipCells(slots[k]!)!.indexOf(c));
      return;
    }
    const ship = anchorOf(held.k, held.o, held.i, c);
    if (!fits(slots, ship)) return shake();
    const next = slots.map((s, j) => (j === held.k ? ship : s));
    setSlots(next);
    const k = next.findIndex((s) => s === null);
    setHeld(k >= 0 ? { k, o: 0, i: 0, from: null } : null);
  };

  const reorient = (turn: (o: number) => number) => {
    if (held) return setHeld({ ...held, o: turn(held.o) });
    const k = hover >= 0 ? shipAt(hover) : -1;
    if (k < 0) return;
    const s = slots[k]!;
    const ship = anchorOf(k, turn(s.o), shipCells(s)!.indexOf(hover), hover);
    if (fits(slots, ship)) setSlots(slots.map((x, j) => (j === k ? ship : x)));
    else shake();
  };
  const rotate = () => reorient(rotated);
  const flip = () => {
    const k = held ? held.k : hover >= 0 ? shipAt(hover) : -1;
    if (k >= 0 && flippable(k)) reorient(flipped);
  };

  const draws: ShipDraw[] = fleet.map((ship) => ({ ship, tone: "steel" as const }));
  if (held?.from && !preview) draws.push({ ship: held.from, tone: "lift" });
  if (held && preview) draws.push({ ship: preview, tone: ok ? "ok" : "bad" });

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
      <section className="card min-w-0 p-2 sm:p-3" aria-label="Bày hạm đội">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 pb-2">
          <h2 className="flex-1 font-display text-[17px] font-extrabold whitespace-nowrap">🛠️ Bày hạm đội của bạn</h2>
          <span className="text-[12.5px] font-bold text-ink-3">
            {foe.ready ? `✅ Đối thủ đã sẵn sàng · ${foe.kinds.length} tàu` : "Đối thủ đang bày tàu…"}
          </span>
        </header>
        <div ref={boardRef}>
          <SeaBoard
            label="Hải đồ của bạn — mũi tên di chuyển, Enter nhấc / đặt tàu, R xoay, F lật, Esc huỷ"
            ships={draws}
            onCell={tap}
            onHover={setHover}
            onRotate={rotate}
            onFlip={flip}
            onCancel={cancel}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2 px-1">
          <button type="button" className="btn btn-sm" onClick={rotate} disabled={!held}>
            ↻ Xoay
          </button>
          <button type="button" className="btn btn-sm" onClick={flip} disabled={!held || !flippable(held.k)}>
            ⇋ Lật
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setSlots(slotsOf(shuffle()));
              setHeld(null);
            }}
          >
            🎲 Bày ngẫu nhiên
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!picked.length}
            onClick={() => {
              setSlots(slots.map((s) => (s === undefined ? undefined : null)));
              setHeld({ k: picked[0], o: 0, i: 0, from: null });
            }}
          >
            🧹 Bày lại từ đầu
          </button>
        </div>
        <p className="mt-2 px-1 text-[12.5px] text-ink-3">
          Bấm vào tàu để nhấc lên, bấm ô khác để đặt. Xoay bằng nút <b>↻ Xoay</b>, phím <b>R</b> hoặc chuột phải; tàu chữ L, chữ Z lật được bằng <b>⇋ Lật</b> hoặc phím <b>F</b>.
          Các tàu không được chồng lên nhau.
        </p>
      </section>

      <aside className="card flex h-max flex-col gap-3 p-3">
        <div className="flex items-baseline justify-between px-0.5">
          <h3 className="font-display text-[15px] font-extrabold">{basic ? "Hạm đội" : `Chọn ${MIN_SHIPS}–${MAX_SHIPS} tàu`}</h3>
          <span className={`text-[12.5px] font-bold ${full && !basic ? "text-coral" : "text-ink-3"}`}>
            {basic ? `${CLASSIC.length} tàu` : `${picked.length}/${MAX_SHIPS}`}
          </span>
        </div>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
          {(basic ? CLASSIC : FLEET.map((_, k) => k)).map((k) => {
            const s = FLEET[k];
            const on = slots[k] !== undefined;
            const isHeld = held?.k === k;
            const locked = !on && full;
            return (
              <li key={k} className={`flex min-w-0 items-center gap-1.5 ${locked ? "opacity-50" : ""}`}>
                {!basic && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`Chọn ${s.name}`}
                    disabled={locked}
                    onClick={() => toggle(k)}
                    className={`grid h-5 w-5 flex-none place-items-center rounded-md border-2 text-[12px] font-extrabold ${on ? "border-lime bg-lime text-ink" : "border-rule"}`}
                  >
                    {on ? "✓" : ""}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (isHeld ? cancel() : lift(k, 0))}
                  aria-pressed={isHeld}
                  disabled={locked}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-left transition-colors ${isHeld ? "border-pen bg-pen-soft" : "border-rule hover:border-ink-3"}`}
                >
                  <ShapeIcon k={k} size={6} color={isHeld ? "var(--pen)" : on ? "var(--ink-2)" : "var(--ink-3)"} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{s.name}</span>
                  <span className="flex-none text-[11.5px] font-bold whitespace-nowrap text-ink-3">{isHeld ? "✋ cầm" : !on ? `${s.cells.length} ô` : slots[k] ? "✓" : "chưa đặt"}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="btn btn-lime btn-nudge h-12 text-base"
          disabled={!done || sending}
          onClick={() => {
            setSending(true);
            session.lockFleet(fleet).finally(() => setSending(false));
          }}
        >
          ✅ Sẵn sàng
        </button>
        <p className="text-[12px] text-ink-3">
          {basic ? (
            <>
              Đối thủ biết bạn có 5 tàu như trên nhưng không biết vị trí. Bấm Sẵn sàng là chốt: máy bạn giữ sơ đồ và chỉ gửi đi <b>mã niêm phong</b> (SHA-256). Hết ván sơ đồ
              được công bố để mọi người đối chiếu.
            </>
          ) : picked.length < MIN_SHIPS ? (
            <>Chọn ít nhất {MIN_SHIPS} tàu để bày.</>
          ) : (
            <>
              Trong ván đối thủ chỉ thấy bạn có bao nhiêu tàu; loại tàu và vị trí lộ ra khi tàu chìm hoặc hết ván. Bấm Sẵn sàng là chốt: máy bạn giữ sơ đồ và chỉ gửi đi <b>mã niêm phong</b> (SHA-256). Hết ván sơ đồ
              được công bố để mọi người đối chiếu.
            </>
          )}
        </p>
      </aside>
    </div>
  );
}

function Settings({ session }: { session: BattleshipRoom }) {
  const { host, playing } = useRoomState(session, (r) => ({ host: r.isHost, playing: r.meta!.status === "playing" }), shallowEqual);
  const opts = useGame(session, (v) => v?.opts);
  if (playing || !opts) return null;
  const row = (label: string, items: ReactNode) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[86px] text-[13px] font-bold text-ink-3">{label}</span>
      <div className="flex flex-1 flex-wrap gap-2">{items}</div>
    </div>
  );
  const pick = (key: string | number, on: boolean, label: ReactNode, set: () => void, aria?: string) => (
    <button key={key} type="button" className={`btn btn-sm ${on ? "btn-coral" : ""}`} aria-pressed={on} aria-label={aria} disabled={!host && !on} onClick={host ? set : undefined}>
      {label}
    </button>
  );
  return (
    <section className="card mt-4 grid gap-3 p-4" aria-label="Luật ván tới">
      {row(
        "Chế độ",
        MODES.map((md) => pick(md, md === opts.mode, md === "basic" ? "🚢 Cơ bản" : "🧩 Nâng cao", () => session.setOptions({ mode: md }), fleetLabel(md))),
      )}
      {row(
        "Luật bắn",
        [true, false].map((b) => pick(String(b), b === opts.chain, b ? "🎯 Trúng bắn tiếp" : "Mỗi phát một lượt", () => session.setOptions({ chain: b }))),
      )}
      {row(
        "Mỗi lượt",
        TURN_LIMITS.map((t) => pick(t, t === opts.turn, `⏱ ${t ? turnLabel(t) : "Vô hạn"}`, () => session.setOptions({ turn: t }), turnLabel(t))),
      )}
      {!host && <p className="text-[13.5px] text-ink-2">Chủ phòng chọn chế độ, luật bắn và thời gian mỗi lượt cho ván tới.</p>}
    </section>
  );
}
