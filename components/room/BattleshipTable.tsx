"use client";

import { useEffect, useRef, useState } from "react";
import { coord, FLEET, fleetGrid, randomFleet, shipCells, SIZE, type Fleet, type Ship } from "@/lib/games/battleship";
import type { BattleshipRoom, BsMatch, BsSide, BsView } from "@/lib/net/battleship-room";
import type { RoomView } from "@/lib/net/room";
import { ConfirmButton } from "../ConfirmButton";
import { BS_TONE, damage, fleetDraws, SeaBoard, type ShipDraw } from "./BattleshipBoard";
import { Score } from "./CaroTable";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, DrawCine, Duel, Fighter, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel, SeatCard } from "./People";
import { Flyers, RoomLayout, StatusChip } from "./RoomLayout";
import { useBalloons, useFlyers, useRoomView } from "./useRoom";

type View = RoomView<BsView>;

const CHEERS = ["🎉", "🏆", "✨", "🎊", "⚓", "💥"];
/** Phát bắn chìm chiếc tàu cuối: chờ một nhịp cho hiệu ứng nổ kịp diễn rồi mới vào cảnh chiến thắng. */
const SUNK_PAUSE_MS = 2200;

export function BattleshipTable({ id, slug, session }: { id: string; slug: string; session: BattleshipRoom }) {
  const view = useRoomView(session)!;
  const m = view.meta!;
  const { opts, match: g } = view.game!;
  const balloons = useBalloons(session);
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);

  const live = m.status === "playing" && !!g && !g.result;
  const seated = view.mySeat >= 0;
  // Thanh đối đầu: trong ván theo thứ tự bắn; khi chờ thì theo ghế.
  const slots = g ? g.sides.map((s) => s.seat) : [view.seats[0], view.seats[1]];
  // Đếm ngược khi hai bên bày xong và vào trận (chưa ai khai hoả); trong lúc đếm chưa được bắn.
  const count = useCountdown(live && g.phase === "battle" && !g.last && g.pending < 0 ? g.round : 0);
  const end = useEndScene(g?.result ? g.round : 0, { delay: g?.result?.reason === "sunk" ? SUNK_PAUSE_MS : 0, cheer: g?.result?.loser !== view.me, emojis: CHEERS });
  const busy = (i: 0 | 1) => live && (g.phase === "setup" ? !g.sides[i].ready : g.turn === i);

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
        <StatusChip status={m.status} round={m.round} playing={g?.phase === "setup" ? "đang bày tàu" : "đang giao chiến"} />
        <span className="chip text-ink-2">
          ▦ {SIZE}×{SIZE} · {FLEET.length} tàu
        </span>
        <span className="chip" style={{ color: opts.chain ? "var(--sun)" : "var(--ink-3)" }}>
          {opts.chain ? "🎯 Trúng được bắn tiếp" : "Mỗi phát một lượt"}
        </span>
      </header>

      <div className="mb-4 flex items-stretch gap-2 sm:gap-4">
        {([0, 1] as const).map((i) => (
          <SeatSlot key={i} i={i} seat={slots[i]} g={g} view={view} balloons={balloons} busy={busy(i)} />
        ))}
      </div>

      <ActionBar view={view} session={session} />

      <div ref={boardRef} className="relative mt-4">
        {g?.placing ? <FleetEditor key={g.round} round={g.round} session={session} foe={g.sides[1 - g.me]} /> : <Waters view={view} session={session} locked={count > 0} />}
        <Flyers flyers={flyers} />
      </div>
      {!seated && !(g && g.me >= 0) && <p className="mt-3 text-center text-sm text-ink-3">👀 Bạn đang ở chế độ xem.</p>}

      {g && count > 0 && <CountdownScene match={g} me={view.me} n={count} />}
      {g?.result && end.shown && <EndScene match={g} me={view.me} onClose={end.close} />}
      <Party bits={end.party} />
    </RoomLayout>
  );
}

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

/** Cảnh vào trận: hai hạm đội đã bày xong, đếm ngược 3‑2‑1 rồi khai hoả. */
function CountdownScene({ match: g, me, n }: { match: BsMatch; me: string; n: number }) {
  const first = g.sides[0].seat;
  const tip = g.me === 0 ? "Bạn khai hoả trước — ngắm cho chuẩn nhé!" : g.me === 1 ? "Đối thủ khai hoả trước — giữ vững hạm đội nhé!" : `${first.member?.name ?? "Ai đó"} khai hoả trước — cùng xem nhé!`;
  return (
    <CountdownCine eyebrow={`🚢 Bắn Tàu · Ván ${g.round} · Hạm đội sẵn sàng`} n={n} tip={tip}>
      <Duel left={fighter(g, 0, me)} right={fighter(g, 1, me)} />
    </CountdownCine>
  );
}

/** Cảnh hết ván: người thắng (vàng rực) — bấm để đóng. */
function EndScene({ match: g, me, onClose }: { match: BsMatch; me: string; onClose: () => void }) {
  const r = g.result!;
  if (!r.winner) return <DrawCine people={g.sides.map((s, k) => ({ uid: s.seat.uid, p: s.seat.member, ring: RING[k] }))} title="Hoà!" sub={`Ván ${g.round} hoà`} onClose={onClose} />;
  const k = g.sides.findIndex((s) => s.seat.uid === r.winner) as 0 | 1;
  const seat = g.sides[k]?.seat;
  const shots = g.sides[1 - k]?.marks.filter((v) => v >= 0).length ?? 0;
  const why =
    r.reason === "resign"
      ? "Đối thủ xin thua"
      : r.reason === "leave"
        ? "Đối thủ rời trận"
        : r.reason === "kick"
          ? "Đối thủ bị mời ra"
          : `Đánh chìm toàn bộ ${FLEET.length} tàu sau ${shots} phát bắn`;
  return (
    <WinCine
      winners={[{ uid: r.winner, p: seat?.member, badge: <span style={{ color: RING[k] }}>⚓</span> }]}
      title={r.winner === me ? "Bạn chiến thắng!" : `${seat?.member?.name ?? "Ai đó"} chiến thắng!`}
      sub={why}
      note={r.loser === me ? `${r.reason === "sunk" ? "Hạm đội của bạn đã chìm" : "Bạn thua ván này"} — ván sau phục thù nhé!` : undefined}
      onClose={onClose}
    />
  );
}

function SeatSlot({ i, seat, g, view, balloons, busy }: { i: 0 | 1; seat?: BsSide["seat"]; g?: BsMatch; view: View; balloons: ReturnType<typeof useBalloons>; busy: boolean }) {
  const m = view.meta!;
  const card = (
    <SeatCard
      seat={seat}
      mark={g ? ((i + 1) as 1 | 2) : undefined}
      badge={g ? "⚓" : undefined}
      tone={g ? BS_TONE[i] : undefined}
      active={busy}
      isHost={seat?.uid === m.host}
      balloon={seat ? balloons[seat.uid] : undefined}
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

/** Nút hành động chính tuỳ vai trò: vào ghế / rời ghế / bắt đầu / xin thua / ván mới. */
function ActionBar({ view, session }: { view: View; session: BattleshipRoom }) {
  const m = view.meta!;
  const { opts, match: g } = view.game!;
  const seated = view.mySeat >= 0;
  const playing = m.status === "playing";
  const full = m.players.length >= m.seats;
  const allOnline = view.seats.every((s) => s.online);
  const name = (uid?: string | null) => nameOf(view, uid);

  let message: React.ReactNode;
  let tone = "var(--sunken)";
  if (playing && g && !g.result) {
    if (g.me >= 0) {
      const foe = g.sides[1 - g.me];
      if (g.lost) {
        message = <>⚠️ Máy này không còn sơ đồ hạm đội của bạn nên không tự báo kết quả phát bắn được — bạn có thể xin thua.</>;
        tone = "var(--coral-soft)";
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
        message = <>🎯 Đến lượt bạn — chọn một ô trên hải đồ đối phương để khai hoả{opts.chain ? " (trúng được bắn tiếp)" : ""}</>;
        tone = "var(--lime-soft)";
      } else if (g.turn === g.me) message = <>📡 Đang chờ đối thủ báo kết quả…</>;
      else message = <>⏳ Đối thủ đang ngắm bắn…</>;
    } else
      message =
        g.phase === "setup" ? (
          <>👀 Đang xem — hai bên đang bày tàu…</>
        ) : (
          <>
            👀 Đang xem — lượt bắn của <b>{name(g.sides[g.turn].seat.uid)}</b>
          </>
        );
  } else if (m.status === "ended" && g?.result) {
    const r = g.result;
    const iWon = r.winner === view.me;
    const iLost = r.loser === view.me;
    tone = iWon ? "var(--sun-soft)" : iLost ? "var(--coral-soft)" : "var(--grape-soft)";
    const why =
      r.reason === "sunk"
        ? " — đánh chìm toàn bộ hạm đội"
        : r.reason === "resign"
          ? " — đối thủ xin thua"
          : r.reason === "leave"
            ? " — đối thủ rời trận"
            : r.reason === "kick"
              ? " — đối thủ bị mời ra"
              : "";
    message = iWon ? (
      <>🏆 Bạn thắng rồi!{why}</>
    ) : (
      <>
        {iLost ? "😵 Bạn thua" : "🏁"} — <b>{name(r.winner)}</b> thắng{why}
      </>
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
        {playing && g && g.me >= 0 && !g.result ? (
          <ConfirmButton className="btn btn-coral" onConfirm={() => session.resign()} confirmLabel="Bấm lần nữa để xin thua">
            🏳️ Xin thua
          </ConfirmButton>
        ) : null}
      </div>
    </div>
  );
}

// ---------- giao chiến ----------

/** Hai hải đồ: người chơi thấy hải đồ đối phương (để bắn) trước, hạm đội mình sau; người xem thấy theo thứ tự bắn. */
function Waters({ view, session, locked }: { view: View; session: BattleshipRoom; locked: boolean }) {
  const g = view.game!.match;
  const m = view.meta!;
  if (!g)
    return (
      <div className="relative">
        <div className="grid gap-4 md:grid-cols-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <section key={i} className="card p-2 opacity-60 sm:p-3">
              <SeaBoard label="Hải đồ trống" />
            </section>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
          <p className="card px-5 py-3 text-center font-display text-lg font-extrabold">
            {m.players.length < m.seats ? `Đang chờ đủ ${m.seats} người vào ghế…` : view.isHost ? "Đủ người rồi — bấm Bắt đầu!" : "Đang chờ chủ phòng bắt đầu…"}
          </p>
        </div>
      </div>
    );
  const order: (0 | 1)[] = g.me !== -1 ? [(1 - g.me) as 0 | 1, g.me] : [0, 1];
  return (
    <>
      {g.phase === "battle" && <LastShot g={g} view={view} />}
      <div className="grid gap-4 md:grid-cols-2">
        {order.map((i) => (
          <Side key={i} i={i} g={g} view={view} session={session} locked={locked} />
        ))}
      </div>
    </>
  );
}

function LastShot({ g, view }: { g: BsMatch; view: View }) {
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

function Side({ i, g, view, session, locked }: { i: 0 | 1; g: BsMatch; view: View; session: BattleshipRoom; locked: boolean }) {
  const side = g.sides[i];
  const mine = g.me === i;
  const foeOfMine = g.me >= 0 && !mine;
  const ended = !!g.result;
  const setup = g.phase === "setup";
  const who = nameOf(view, side.seat.uid);
  const title = mine ? "⚓ Hạm đội của bạn" : foeOfMine ? `🎯 Hải đồ của ${who}` : `Hạm đội ${who}`;
  // Hải đồ đang bị nhắm bắn: viền theo màu người bắn.
  const shooter = BS_TONE[(1 - i) as 0 | 1];
  const targeted = !setup && !ended && view.meta!.status === "playing" && g.turn !== i;
  const last = g.last && g.last.by !== i ? g.last : undefined;
  const ships = fleetDraws(side.sunk, side.fleet, mine ? "steel" : "reveal", last?.r === 2 ? last.k : -1);
  const alive = FLEET.length - side.sunk.length;
  const fog = setup && !(mine && side.ready);
  const fire = foeOfMine && g.myTurn && !locked;

  return (
    <section
      className="card min-w-0 p-2 transition-shadow sm:p-3"
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
            {alive}/{FLEET.length} tàu
          </span>
        )}
      </header>
      <div className="relative">
        <SeaBoard
          label={`${title} — còn ${alive}/${FLEET.length} tàu${fire ? ". Đến lượt bạn: chọn ô để bắn (mũi tên + Enter)." : ""}`}
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
      <FleetList side={side} />
      {ended && <Honesty side={side} />}
    </section>
  );
}

/** Danh sách tàu: tàu chìm gạch ngang; biết sơ đồ thì tô số ô đã trúng. */
function FleetList({ side }: { side: BsSide }) {
  const hits = side.fleet ? damage(side.fleet, side.marks) : null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5 px-1" aria-label="Hạm đội">
      {FLEET.map((s, k) => {
        const sunk = side.sunk.some((x) => x.k === k);
        return (
          <li
            key={k}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold ${sunk ? "bg-coral-soft text-ink-3 line-through" : "bg-sunken text-ink-2"}`}
            aria-label={`${s.name} (${s.len} ô)${sunk ? " — đã chìm" : hits?.[k] ? ` — trúng ${hits[k]} ô` : ""}`}
          >
            <span className="flex gap-0.5" aria-hidden="true">
              {Array.from({ length: s.len }, (_, j) => (
                <span key={j} className="h-2 w-2 rounded-[3px]" style={{ background: sunk || (hits && j < hits[k]) ? "var(--coral)" : "var(--ink-3)" }} />
              ))}
            </span>
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

// ---------- bày tàu ----------

/** Tàu đang cầm trên tay: hướng, ô đang nắm (thứ tự trong thân tàu) và chỗ cũ để huỷ thì trả về. */
type Held = { k: number; v: boolean; off: number; from: Ship | null };

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** Vị trí tàu khi ô đang nắm nằm ở ô `c`, kéo vào trong hải đồ nếu tràn mép. */
function anchorOf(k: number, v: boolean, off: number, c: number): Ship {
  const len = FLEET[k].len;
  const x = clamp((c % SIZE) - (v ? 0 : off), 0, SIZE - (v ? 1 : len));
  const y = clamp(Math.floor(c / SIZE) - (v ? off : 0), 0, SIZE - (v ? len : 1));
  return { at: y * SIZE + x, v };
}

function fits(fleet: (Ship | null)[], k: number, ship: Ship) {
  const cells = shipCells(k, ship);
  if (!cells) return false;
  const taken = new Set(fleet.flatMap((s, j) => (s && j !== k ? shipCells(j, s)! : [])));
  return cells.every((c) => !taken.has(c));
}

function FleetEditor({ round, session, foe }: { round: number; session: BattleshipRoom; foe: BsSide }) {
  const [fleet, setFleet] = useState<(Ship | null)[]>(() => session.draft(round) ?? randomFleet());
  const [held, setHeld] = useState<Held | null>(null);
  const [hover, setHover] = useState(-1);
  const [sending, setSending] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const done = !held && fleet.every(Boolean) && !!fleetGrid(fleet as Fleet);

  useEffect(() => {
    if (fleet.every(Boolean)) session.saveDraft(round, fleet as Fleet);
  }, [fleet, round, session]);

  const shipAt = (c: number) => fleet.findIndex((s, k) => !!s && shipCells(k, s)!.includes(c));
  const preview = held && hover >= 0 ? anchorOf(held.k, held.v, held.off, hover) : null;
  const ok = !!preview && fits(fleet, held!.k, preview);

  const shake = () => {
    const el = boardRef.current;
    if (!el) return;
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  };

  /** Nhấc tàu `k` lên tay (trả tàu đang cầm về chỗ cũ trước). */
  const lift = (k: number, off: number) => {
    let f = fleet;
    if (held?.from) f = f.map((s, j) => (j === held.k ? held.from : s));
    setHeld({ k, v: f[k]?.v ?? false, off, from: f[k] });
    setFleet(f.map((s, j) => (j === k ? null : s)));
  };

  const cancel = () => {
    if (!held) return;
    if (held.from) setFleet((f) => f.map((s, j) => (j === held.k ? held.from : s)));
    setHeld(null);
  };

  const tap = (c: number) => {
    if (!held) {
      const k = shipAt(c);
      if (k >= 0) lift(k, shipCells(k, fleet[k]!)!.indexOf(c));
      return;
    }
    const ship = anchorOf(held.k, held.v, held.off, c);
    if (!fits(fleet, held.k, ship)) return shake();
    const next = fleet.map((s, j) => (j === held.k ? ship : s));
    setFleet(next);
    // Còn tàu chưa đặt (vừa xoá hết) thì cầm luôn tàu kế tiếp.
    const k = next.findIndex((s) => !s);
    setHeld(k >= 0 ? { k, v: false, off: 0, from: null } : null);
  };

  const rotate = () => {
    if (held) return setHeld({ ...held, v: !held.v });
    // Không cầm tàu nào: xoay tàu dưới con trỏ quanh ô đang trỏ.
    const k = hover >= 0 ? shipAt(hover) : -1;
    if (k < 0) return;
    const s = fleet[k]!;
    const ship = anchorOf(k, !s.v, shipCells(k, s)!.indexOf(hover), hover);
    if (fits(fleet, k, ship)) setFleet(fleet.map((x, j) => (j === k ? ship : x)));
    else shake();
  };

  const draws: ShipDraw[] = fleet.flatMap((s, k) => (s ? [{ k, ship: s, tone: "steel" as const }] : []));
  if (held?.from && !preview) draws.push({ k: held.k, ship: held.from, tone: "lift" });
  if (held && preview) draws.push({ k: held.k, ship: preview, tone: ok ? "ok" : "bad" });

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_250px]">
      <section className="card min-w-0 p-2 sm:p-3" aria-label="Bày hạm đội">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 pb-2">
          <h2 className="flex-1 font-display text-[17px] font-extrabold whitespace-nowrap">🛠️ Bày hạm đội của bạn</h2>
          <span className="text-[12.5px] font-bold text-ink-3">
            {foe.ready ? "✅ Đối thủ đã sẵn sàng" : "Đối thủ đang bày tàu…"}
          </span>
        </header>
        <div ref={boardRef}>
          <SeaBoard
            label="Hải đồ của bạn — mũi tên di chuyển, Enter nhấc / đặt tàu, R xoay, Esc huỷ"
            ships={draws}
            onCell={tap}
            onHover={setHover}
            onRotate={rotate}
            onCancel={cancel}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2 px-1">
          <button type="button" className="btn btn-sm" onClick={rotate} disabled={!held}>
            ↻ Xoay
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setFleet(randomFleet());
              setHeld(null);
            }}
          >
            🎲 Ngẫu nhiên
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setFleet(FLEET.map(() => null));
              setHeld({ k: 0, v: false, off: 0, from: null });
            }}
          >
            🧹 Bày lại từ đầu
          </button>
        </div>
        <p className="mt-2 px-1 text-[12.5px] text-ink-3">
          Bấm vào tàu để nhấc lên, bấm ô khác để đặt. Xoay bằng nút <b>↻ Xoay</b>, phím <b>R</b> hoặc chuột phải. Các tàu không được chồng lên nhau.
        </p>
      </section>

      <aside className="card flex h-max flex-col gap-3 p-3">
        <ul className="grid gap-1.5">
          {FLEET.map((s, k) => {
            const isHeld = held?.k === k;
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => (isHeld ? cancel() : lift(k, 0))}
                  aria-pressed={isHeld}
                  className={`flex w-full items-center gap-2 rounded-xl border-2 px-2.5 py-2 text-left transition-colors ${isHeld ? "border-pen bg-pen-soft" : "border-rule hover:border-ink-3"}`}
                >
                  <span className="flex gap-0.5" aria-hidden="true">
                    {Array.from({ length: s.len }, (_, j) => (
                      <span key={j} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: isHeld ? "var(--pen)" : "var(--ink-3)" }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{s.name}</span>
                  <span className="text-[12px] font-bold text-ink-3">{isHeld ? "đang cầm" : fleet[k] ? "✓" : "chưa đặt"}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="btn btn-lime h-12 text-base"
          disabled={!done || sending}
          onClick={() => {
            setSending(true);
            session.lockFleet(fleet as Fleet).finally(() => setSending(false));
          }}
        >
          ✅ Sẵn sàng
        </button>
        <p className="text-[12px] text-ink-3">
          Bấm Sẵn sàng là chốt: máy bạn giữ sơ đồ và chỉ gửi đi <b>mã niêm phong</b> (SHA-256). Hết ván sơ đồ được công bố để mọi người đối chiếu.
        </p>
      </aside>
    </div>
  );
}
