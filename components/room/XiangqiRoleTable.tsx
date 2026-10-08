"use client";

import { useEffect, useState } from "react";
import { ADVISOR, CANNON, ELEPHANT, HORSE, KING, PAWN, ROOK } from "@/lib/games/xiangqi";
import {
  CLAIM_OPTIONS,
  claimLabel,
  MIN_PLAYERS,
  piecesOfRole,
  ROLE_COUNT,
  ROLES,
  roleTitle,
  type ClaimMs,
  type PieceKind,
  type Side,
} from "@/lib/games/xiangqi-role";
import type { XqRoleMatch, XiangqiRoleRoom } from "@/lib/net/xiangqi-role-room";
import type { RoomView } from "@/lib/net/room";
import { ChatPanel } from "./ChatPanel";
import { PeoplePanel } from "./People";
import { RoomLayout, StatusChip } from "./RoomLayout";
import { PieceIcon } from "./XiangqiBoard";
import { XiangqiRoleBoard } from "./XiangqiRoleBoard";
import { useBalloons, useRoomView } from "./useRoom";

const KIND_CODE: Record<PieceKind, number> = {
  general: KING,
  advisor: ADVISOR,
  elephant: ELEPHANT,
  horse: HORSE,
  chariot: ROOK,
  cannon: CANNON,
  soldier: PAWN,
};

function faceValue(kind: PieceKind, side: Side) {
  const code = KIND_CODE[kind];
  return side === "red" ? code : -code;
}

/** Icon for a role seat (palace shows general face). */
function roleFace(roleId: number) {
  const r = ROLES[roleId];
  const kind = r.key === "palace" ? "general" : r.kinds[0];
  return faceValue(kind, r.side);
}

const QUICK = ["Chờ", "Tấn công", "Phòng thủ", "Đừng đi", "Nước hay", "Cứu", "Tôi có kế hoạch", "Canh quân này"];

export function XiangqiRoleTable({ id, slug, session }: { id: string; slug: string; session: XiangqiRoleRoom }) {
  const view = useRoomView(session)!;
  const m = view.meta!;
  const g = view.game!;
  const balloons = useBalloons(session);
  const match = g.match;
  const playing = m.status === "playing";
  const ended = m.status === "ended";

  return (
    <RoomLayout
      id={id}
      slug={slug}
      side={
        <>
          <PeoplePanel view={view} session={session} balloons={balloons} roomId={id} />
          <TeamChat session={session} messages={g.teamChat} me={view.me} side={match?.mySide ?? sideFromSeats(g.seats, view.me)} />
          <ChatPanel session={session} chat={view.chat} me={view.me} />
        </>
      }
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{m.name}</h1>
        <StatusChip status={m.status} round={m.round} />
        {match && (
          <span className="chip" style={{ color: match.pub.side === "red" ? "var(--coral)" : "var(--ink)" }}>
            Lượt {match.pub.side === "red" ? "Đỏ" : "Đen"}
            {match.pub.check ? " · Chiếu!" : ""}
          </span>
        )}
        <span className="chip text-ink-2">⏱ Claim {claimLabel(g.opts.claimMs)}</span>
      </header>

      <ActionBar view={view} session={session} />

      {!playing && !ended && (
        <>
          {view.isHost && <ClaimConfig claimMs={g.opts.claimMs} onChange={(ms) => session.setClaimMs(ms)} />}
          <RolePicker session={session} seats={g.seats} me={view.me} />
        </>
      )}

      {match && (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="card mx-auto w-full max-w-[600px] overflow-hidden p-1.5 sm:p-2.5">
            <XiangqiRoleBoard
              pieces={match.pub.pieces}
              myPieceIds={match.myPieceIds}
              mySide={match.mySide}
              currentSide={match.pub.side}
              legalByPiece={match.legalByPiece}
              lastMove={match.pub.lastMove}
              check={match.pub.check}
              onMove={(pieceId, to) => session.move(pieceId, to)}
              canPlay={match.myTurn}
              script="han"
            />
          </div>
          <aside className="grid gap-3 content-start">
            <YourRole match={match} members={view.members} me={view.me} />
            <TurnPanel match={match} session={session} members={view.members} claimMs={g.opts.claimMs} />
            {match.dead && (
              <p className="rounded-xl bg-sunken p-3 text-sm text-ink-2">Hết quân trong role của bạn. Bạn đang xem và vẫn chat được với đồng đội.</p>
            )}
            {ended && match.pub.winner && (
              <p className="rounded-xl bg-lime-soft p-3 font-display text-lg font-extrabold">
                Chiếu bí — phe {match.pub.winner === "red" ? "Đỏ" : "Đen"} thắng!
              </p>
            )}
          </aside>
        </div>
      )}
    </RoomLayout>
  );
}

function sideFromSeats(seats: Record<number, string>, me: string): Side | null {
  for (const [id, uid] of Object.entries(seats)) {
    if (uid === me) return ROLES[Number(id)]?.side ?? null;
  }
  return null;
}

function ClaimConfig({ claimMs, onChange }: { claimMs: ClaimMs; onChange: (ms: ClaimMs) => void }) {
  return (
    <div className="mt-3 rounded-xl bg-sunken p-3">
      <p className="mb-2 text-sm font-bold">Thời gian claim token</p>
      <div className="flex flex-wrap gap-2">
        {CLAIM_OPTIONS.map((ms) => (
          <button key={ms} type="button" className={`btn btn-sm !px-2.5 ${ms === claimMs ? "btn-sun" : ""}`} aria-pressed={ms === claimMs} onClick={() => onChange(ms)}>
            {claimLabel(ms)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionBar({ view, session }: { view: RoomView; session: XiangqiRoleRoom }) {
  const m = view.meta!;
  const seated = view.mySeat >= 0;
  const n = m.players.length;
  if (m.status === "playing") return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!seated ? (
        <button type="button" className="btn btn-lime" onClick={() => session.join()} disabled={view.pending === "play" || n >= ROLE_COUNT}>
          Chọn role &amp; vào ghế
        </button>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => session.leaveSeat()}>
          Rời ghế
        </button>
      )}
      {view.isHost && (
        <button type="button" className="btn btn-pen" disabled={n < MIN_PLAYERS} onClick={() => session.start()}>
          Bắt đầu ({n}/{MIN_PLAYERS}+ · tối đa {ROLE_COUNT} · bot fill)
        </button>
      )}
      {!view.isHost && seated && <span className="text-sm text-ink-3">Chờ chủ phòng bắt đầu…</span>}
    </div>
  );
}

function RolePicker({ session, seats, me }: { session: XiangqiRoleRoom; seats: Record<number, string>; me: string }) {
  const red = ROLES.filter((r) => r.side === "red");
  const black = ROLES.filter((r) => r.side === "black");
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <SidePick title="Phe Đỏ — 5 role" list={red} seats={seats} me={me} onPick={(id) => session.pickRole(id)} />
      <SidePick title="Phe Đen — 5 role" list={black} seats={seats} me={me} onPick={(id) => session.pickRole(id)} />
    </div>
  );
}

function SidePick({
  title,
  list,
  seats,
  me,
  onPick,
}: {
  title: string;
  list: typeof ROLES;
  seats: Record<number, string>;
  me: string;
  onPick: (id: number) => void;
}) {
  return (
    <section className="card p-4" style={{ background: list[0]?.side === "red" ? "var(--coral-soft)" : "var(--sunken)" }}>
      <h2 className="font-display text-lg font-extrabold">{title}</h2>
      <ul className="mt-3 grid gap-2">
        {list.map((r) => {
          const owner = seats[r.id];
          const mine = owner === me;
          const taken = !!owner && !mine;
          return (
            <li key={r.id}>
              <button
                type="button"
                disabled={taken}
                onClick={() => onPick(r.id)}
                className={`btn btn-sm w-full !justify-start ${mine ? "btn-pen" : ""}`}
                style={{ opacity: taken ? 0.45 : 1 }}
              >
                <PieceIcon v={roleFace(r.id)} script="han" size={22} className="mr-1" />
                {r.name}
                {r.key === "palace" ? " (1 người)" : ""}
                {taken ? " · hết" : mine ? " · bạn" : ""}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function YourRole({ match, members, me }: { match: XqRoleMatch; members: RoomView["members"]; me: string }) {
  const id = match.myRoleId;
  if (id == null) return <p className="rounded-xl bg-sunken p-3 text-sm">Bạn đang xem.</p>;
  const role = ROLES[id];
  const alive = piecesOfRole(match.pub.pieces, id).filter((p) => p.alive);
  const byUid = new Map(members.map((x) => [x.uid, x]));
  return (
    <div className="card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Role của bạn</p>
      <p className="mt-1 flex items-center gap-2 font-display text-xl font-extrabold">
        <PieceIcon v={roleFace(id)} script="han" size={36} />
        {roleTitle(role)}
      </p>
      <p className="mt-1 text-sm text-ink-2">
        {alive.length ? `${alive.length} quân còn sống` : "Hết quân"} · {byUid.get(me)?.name ?? "Bạn"}
      </p>
    </div>
  );
}

function TurnPanel({
  match,
  session,
  members,
  claimMs,
}: {
  match: XqRoleMatch;
  session: XiangqiRoleRoom;
  members: RoomView["members"];
  claimMs: ClaimMs;
}) {
  const pub = match.pub;
  const now = useNow(500);
  const byUid = new Map(members.map((x) => [x.uid, x]));

  if (pub.phase === "claim" || pub.phase === "assign") {
    const isClaim = pub.phase === "claim";
    const deadline = isClaim ? pub.claimDeadline : pub.assignDeadline;
    const left = Math.max(0, deadline - now);
    const claimants = pub.claimants;
    return (
      <div className="card p-4" style={{ background: match.canAssign ? "var(--lime-soft)" : "var(--sun-soft)" }}>
        <p className="font-display text-lg font-extrabold">{isClaim ? "Claim lượt" : "Tướng chọn ai đi"}</p>
        <p className="text-sm text-ink-2">
          {isClaim
            ? `Xin lượt · 1 người → tự đi · ≥2 → Tướng chọn · ${(left / 1000).toFixed(1)}s / ${claimLabel(claimMs)}`
            : `Nhiều người claim — chờ Tướng chỉ định · ${(left / 1000).toFixed(1)}s`}
        </p>
        {claimants.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {claimants.map((rid) => (
              <li key={rid} className="flex items-center gap-2">
                <PieceIcon v={roleFace(rid)} script="han" size={22} />
                {roleTitle(ROLES[rid])}
                {" · "}
                {pub.owners[rid] ? byUid.get(pub.owners[rid])?.name ?? "…" : "Bot"}
              </li>
            ))}
          </ul>
        )}
        {isClaim && match.canClaim && (
          <button type="button" className="btn btn-pen mt-3 w-full" onClick={() => session.claim()}>
            CLAIM TURN
          </button>
        )}
        {isClaim && !match.canClaim && !match.canAssign && (
          <p className="mt-3 text-sm text-ink-3">{match.dead ? "Hết quân" : "Không claim được (sai phe / hết nước)"}</p>
        )}
        {match.canAssign ? (
          <AssignPicker match={match} session={session} members={members} />
        ) : (
          <p className="mt-2 text-xs text-ink-3">
            {isClaim
              ? claimants.length <= 1
                ? "Hết giờ: 1 claim → người đó đi; 0 claim → auto"
                : "Tướng có thể chọn sớm, hoặc chờ hết giờ"
              : "Đang chờ Tướng…"}
          </p>
        )}
      </div>
    );
  }

  if (pub.phase === "move" && pub.tokenRoleId != null) {
    const rid = pub.tokenRoleId;
    const owner = pub.owners[rid];
    const role = ROLES[rid];
    const left = Math.max(0, pub.moveDeadline - now);
    const mine = match.myTurn;
    return (
      <div className="card p-4" style={{ background: mine ? "var(--lime-soft)" : "var(--sunken)" }}>
        <p className="font-display text-lg font-extrabold">{mine ? "Lượt của bạn!" : "Đang đi…"}</p>
        <p className="mt-1 flex items-center gap-2 text-sm">
          <PieceIcon v={roleFace(rid)} script="han" size={28} />
          {roleTitle(role)}
          {" — "}
          {owner ? byUid.get(owner)?.name ?? "…" : "Bot"}
        </p>
        <p className="mt-2 font-mono text-sm">{(left / 1000).toFixed(1)}s</p>
        {mine && <p className="mt-2 text-sm text-ink-2">Bấm quân thuộc role bạn, rồi bấm ô đích.</p>}
      </div>
    );
  }

  return null;
}

function AssignPicker({
  match,
  session,
  members,
}: {
  match: XqRoleMatch;
  session: XiangqiRoleRoom;
  members: RoomView["members"];
}) {
  const byUid = new Map(members.map((x) => [x.uid, x]));
  return (
    <div className="mt-3">
      <p className="mb-2 text-sm font-bold">Chọn ai được đi</p>
      <div className="grid gap-1.5">
        {match.assignPicks.map((rid) => {
          const owner = match.pub.owners[rid];
          const claimed = match.pub.claimants.includes(rid);
          return (
            <button key={rid} type="button" className="btn btn-sm w-full !justify-start" onClick={() => session.assign(rid)}>
              <PieceIcon v={roleFace(rid)} script="han" size={22} className="mr-1" />
              {ROLES[rid].name}
              {claimed ? " · đã claim" : ""}
              {" — "}
              {owner ? byUid.get(owner)?.name ?? "…" : "Bot"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function useNow(ms: number) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

function TeamChat({
  session,
  messages,
  me,
  side,
}: {
  session: XiangqiRoleRoom;
  messages: { id: string; uid: string; name: string; text?: string; at: number }[];
  me: string;
  side: Side | null;
}) {
  const [text, setText] = useState("");
  if (!side) {
    return <div className="card p-4 text-sm text-ink-3">Chọn role để mở chat phe.</div>;
  }
  return (
    <div className="card flex max-h-80 flex-col p-3">
      <h3 className="font-display text-base font-extrabold">Chat phe {side === "red" ? "Đỏ" : "Đen"}</h3>
      <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto text-sm">
        {messages.length === 0 && <li className="text-ink-3">Chưa có tin…</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.uid === me ? "text-pen" : ""}>
            <b>{m.name}</b>: {m.text}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-1">
        {QUICK.map((q) => (
          <button key={q} type="button" className="btn btn-sm !px-2 !py-0.5 text-xs" onClick={() => session.sendTeam(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          session.sendTeam(text);
          setText("");
        }}
      >
        <input className="field !min-h-0 flex-1 !py-1 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhắn đồng đội…" />
        <button type="submit" className="btn btn-sm" disabled={!text.trim()}>
          Gửi
        </button>
      </form>
    </div>
  );
}
