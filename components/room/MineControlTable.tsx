"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  canFort,
  canGrab,
  canOpen,
  canRadar,
  canShield,
  compareRank,
  COST,
  LIVES,
  MAP_KEYS,
  MAPS,
  MAX_ENERGY,
  MAX_FORTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MINE_CHOICES,
  minesFor,
  newGame,
  ranks,
  type McEvent,
  type McPlayer,
  type McState,
} from "@/lib/games/mine-control";
import { TURN_MS, type McMatch, type McView, type MineControlRoom } from "@/lib/net/mine-control-room";
import type { Member, RoomState, RoomView, SeatView } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "../ConfirmButton";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Crowd, DrawCine, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { MC_TONE_NAMES, MC_TONES, MineControlBoard, type McTool } from "./MineControlBoard";
import { PeoplePanel } from "./People";
import { ResultCard, Standings } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout, SpectatorNote, WaitingOverlay } from "./RoomLayout";
import { ResignButton, SeatButtons, seatMessage, startBlocker, StatusBar, TONE } from "./StatusBar";
import { shallowEqual, useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

type View = Omit<RoomView<McView>, "chat">;

// Ghép riêng ba store để phần bàn không vẽ lại theo nhịp tim, theo tin chat, và không kéo các phần khác theo.
function useMcView(session: MineControlRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

function useBoard(view: View) {
  const m = view.meta!;
  const { match: g, opts } = view.game!;
  const live = m.status === "playing" && g?.round === m.round && !g.result;
  const showGame = !!g && m.status !== "waiting";
  const preview = useMemo(() => newGame({ seed: 1, map: opts.map, mines: 0, out: {} }, Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, m.players.length))), [opts.map, m.players.length]);
  const s = showGame ? g!.state : preview;
  return { m, g, opts, live, showGame, s, me: g && showGame ? g.me : -1 };
}

const CHEERS = ["🎉", "🏆", "✨", "🎊", "💣", "🚩"];

const TOOLS: { tool: McTool; icon: string; name: string; cost?: number; hint: string }[] = [
  { tool: "open", icon: "⛏️", name: "Mở ô", hint: "bấm một ô ẩn sát lãnh thổ của bạn (ngang / dọc) để mở" },
  { tool: "radar", icon: "📡", name: "Radar", cost: COST.radar, hint: "bấm một ô ẩn bất kỳ để đếm số mìn trong vùng 3×3 quanh nó" },
  { tool: "fort", icon: "🏰", name: "Pháo đài", cost: COST.fort, hint: `bấm một ô của bạn (không phải căn cứ) để xây Pháo đài — +2 điểm cuối ván, tối đa ${MAX_FORTS}` },
  { tool: "grab", icon: "🚩", name: "Cướp Đất", cost: COST.grab, hint: "bấm một ô trung lập sát lãnh thổ bạn (không sát đối thủ) để chiếm" },
];

const VALID: Record<McTool, (s: McState, k: number, c: number) => boolean> = { open: canOpen, radar: canRadar, fort: canFort, grab: canGrab };

const hasTarget = (s: McState, k: number, tool: McTool) => {
  for (let c = 0; c < s.w * s.h; c++) if (VALID[tool](s, k, c)) return true;
  return false;
};

export function MineControlTable({ id, slug, session }: { id: string; slug: string; session: MineControlRoom }) {
  const head = useRoomState(session, headOf, shallowEqual);
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <RoomHeader name={head.name} status={head.status} round={head.round} playing="đang dò mìn">
        <HeadChips session={session} />
      </RoomHeader>
      <PlayersPart session={session} />
      <PlayPart session={session} />
    </RoomLayout>
  );
}

const headOf = (r: RoomState) => ({ name: r.meta!.name, status: r.meta!.status, round: r.meta!.round });

const HeadChips = memo(function HeadChips({ session }: { session: MineControlRoom }) {
  const view = useMcView(session);
  const { m, opts, live, showGame, s } = useBoard(view);
  const nextMines = minesFor(opts, Math.max(MIN_PLAYERS, m.players.length));
  const nextDiffers = !live && showGame && (opts.map !== m.mc?.map || nextMines !== m.mc?.mines);
  return (
    <>
      <span className="chip text-ink-2">
        ▦ {s.w}×{s.h} · 💣 {showGame ? s.mines : nextMines}
        {nextDiffers && ` · ván tới ${MAPS[opts.map].w}×${MAPS[opts.map].h}, ${nextMines} mìn`}
      </span>
      {live && <span className="chip text-ink-2">🟩 Còn {s.safeLeft} ô an toàn</span>}
    </>
  );
});

const PlayersPart = memo(function PlayersPart({ session }: { session: MineControlRoom }) {
  const view = useMcView(session);
  const { m, g, live, showGame, s } = useBoard(view);
  const wins = view.game!.wins;
  const players = showGame ? g!.lineup : view.seats;
  const cards = showGame ? players.length : m.seats;
  return (
    <ul className={`mb-4 grid grid-cols-2 gap-2 ${cards === 3 ? "lg:grid-cols-3" : cards === 4 ? "lg:grid-cols-4" : ""}`}>
      {Array.from({ length: cards }, (_, k) => (
        <PlayerCard
          key={k}
          k={k}
          seat={players[k]}
          p={showGame ? s.players[k] : undefined}
          active={live && s.turn === k}
          wins={players[k] ? (wins[players[k].uid] ?? 0) : 0}
          isHost={players[k]?.uid === m.host}
          me={view.me}
        />
      ))}
    </ul>
  );
});

const PlayPart = memo(function PlayPart({ session }: { session: MineControlRoom }) {
  const view = useMcView(session);
  const { m, g, live, showGame, s, me } = useBoard(view);
  const boardRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, boardRef);
  const count = useCountdown(live && g!.state.count === 0 ? g!.round : 0);
  const iWon = !!g?.result?.winners?.includes(view.me);
  const end = useEndScene(g?.result ? g.round : 0, { delay: 900, cheer: iWon || (g?.me ?? -1) < 0, emojis: CHEERS });
  const players = showGame ? g!.lineup : view.seats;
  const avatars = players.map((p) => p.member?.avatar ?? "🏠");

  const [tool, setTool] = useState<McTool>("open");
  const stamp = g ? `${g.round}:${g.state.count}` : "";
  const [toolAt, setToolAt] = useState(stamp);
  if (toolAt !== stamp) {
    setToolAt(stamp);
    setTool("open");
  }

  const myTurn = live && !!g?.myTurn && !count;
  const valid = useMemo(() => (myTurn && me >= 0 ? (c: number) => VALID[tool](s, me, c) : null), [myTurn, me, tool, s]);
  const last = useMemo(() => {
    for (let i = s.events.length - 1; i >= 0; i--) {
      const e = s.events[i];
      if ("c" in e) return e.c;
    }
    return -1;
  }, [s]);

  const act = (c: number) => {
    if (tool === "open") session.open(c);
    else if (tool === "radar") session.radar(c);
    else if (tool === "fort") session.fort(c);
    else session.grab(c);
  };

  return (
    <>
      <ActionBar view={view} session={session} counting={count > 0} />
      {live && me >= 0 && !s.players[me].out && <Toolbar state={s} me={me} myTurn={myTurn} tool={tool} setTool={setTool} session={session} />}
      {m.status === "ended" && g?.result && <Result match={g} me={view.me} />}

      <div className="relative mx-auto mt-4" style={{ maxWidth: s.w * 48 + 24 }}>
        <div ref={boardRef} className="card p-2 sm:p-3" style={{ background: "var(--board)" }}>
          <MineControlBoard state={s} avatars={avatars} tool={myTurn ? tool : null} me={me} valid={valid} reveal={!!g?.result && showGame} last={showGame ? last : -1} onCell={act} />
        </div>
        <Flyers flyers={flyers} />
        {!showGame && m.status === "waiting" && (
          <WaitingOverlay isHost={view.isHost} players={m.players.length} seats={m.seats} enough={m.players.length >= MIN_PLAYERS} waiting={`Đang chờ ít nhất ${MIN_PLAYERS} người vào ghế…`} />
        )}
      </div>
      {showGame && <LastAction match={g!} me={view.me} />}
      {view.mySeat < 0 && me < 0 && <SpectatorNote />}

      {g && count > 0 && <CountdownScene match={g} me={view.me} n={count} />}
      {g?.result && end.shown && <EndScene match={g} me={view.me} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

function PlayerCard({ k, seat, p, active, wins, isHost, me }: { k: number; seat?: SeatView; p?: McPlayer; active: boolean; wins: number; isHost: boolean; me: string }) {
  const who = seat?.member;
  const tone = MC_TONES[k];
  return (
    <li
      className={`card relative flex min-w-0 items-center gap-2 p-2 transition-all sm:gap-2.5 sm:p-2.5 ${p?.out ? "opacity-55" : ""}`}
      style={{ borderColor: active ? tone : undefined, boxShadow: active ? `0 4px 0 ${tone}` : undefined, background: active ? `color-mix(in srgb, ${tone} 12%, var(--surface))` : undefined }}
    >
      {who ? (
        <span className="relative flex-none rounded-full p-[3px]" style={{ background: tone }}>
          <Avatar p={who} size={34} className={seat?.online && !p?.out ? "" : "opacity-40 grayscale"} />
          {isHost && (
            <span className="absolute -top-2.5 -right-1.5 text-base" title="Chủ phòng">
              👑
            </span>
          )}
        </span>
      ) : (
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full border-2 border-dashed border-ink-3 text-lg text-ink-3" aria-hidden="true">
          ?
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-extrabold sm:text-[14.5px]">
          {who ? who.name : "Ghế trống"}
          {who && seat?.uid === me && <span className="ml-1 text-xs font-bold text-pen">(bạn)</span>}
        </p>
        {p ? (
          p.out ? (
            <p className="truncate text-[12px] font-semibold text-ink-3">{p.out === "dead" ? "💀 Hết mạng — bị loại" : "🏳️ Đã rời cuộc"}</p>
          ) : (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-semibold leading-tight">
              <span title={`${p.lives} mạng`} aria-label={`${p.lives} mạng`}>
                {Array.from({ length: LIVES }, (_, i) => (i < p.lives ? "❤️" : "🖤")).join("")}
              </span>
              <span className="flex items-center gap-0.5" title={`${p.energy}/${MAX_ENERGY} năng lượng`} aria-label={`${p.energy} năng lượng`}>
                ⚡
                {Array.from({ length: MAX_ENERGY }, (_, i) => (
                  <span key={i} className="h-2.5 w-1.5 rounded-sm border border-edge" style={{ background: i < p.energy ? "var(--sun)" : "transparent" }} />
                ))}
              </span>
              {p.shield && <span title="Khiên đang bật">🛡️</span>}
              {p.forts > 0 && <span title={`${p.forts} Pháo đài`}>🏰{p.forts}</span>}
            </p>
          )
        ) : (
          <p className="truncate text-[12px] font-semibold text-ink-3">{!who ? "Đang chờ người vào" : !seat?.online ? "⚠️ Mất kết nối" : wins ? `🏆 ${wins} ván thắng` : "Sẵn sàng"}</p>
        )}
      </div>
      {p && (
        <span className="flex flex-none flex-col items-center rounded-xl border-2 border-edge px-1.5 py-0.5 font-display leading-none font-extrabold text-white" style={{ background: tone }} title={`${p.score} điểm`}>
          <span className="text-lg tabular-nums">{p.score}</span>
          <span className="text-[10px]">điểm</span>
        </span>
      )}
    </li>
  );
}

function Toolbar({ state: s, me, myTurn, tool, setTool, session }: { state: McState; me: number; myTurn: boolean; tool: McTool; setTool: (t: McTool) => void; session: MineControlRoom }) {
  const p = s.players[me];
  const cur = TOOLS.find((t) => t.tool === tool)!;
  return (
    <div className="card mt-3 px-3 py-2.5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn hành động">
        {TOOLS.map((t) => {
          const ok = myTurn && (t.tool === "open" || hasTarget(s, me, t.tool));
          return (
            <button
              key={t.tool}
              type="button"
              className={`btn btn-sm !px-2.5 ${tool === t.tool && myTurn ? "btn-sun" : ""}`}
              aria-pressed={tool === t.tool}
              disabled={!ok}
              title={t.cost && p.energy < t.cost ? `Cần ${t.cost} năng lượng` : undefined}
              onClick={() => setTool(t.tool)}
            >
              {t.icon} {t.name}
              {t.cost && <span className="text-[12px] opacity-80">{t.cost}⚡</span>}
            </button>
          );
        })}
        <button
          type="button"
          className="btn btn-sm !px-2.5"
          disabled={!myTurn || !canShield(s, me)}
          title={p.shield ? "Khiên đang bật" : p.energy < COST.shield ? `Cần ${COST.shield} năng lượng` : "Đỡ cho lần giẫm mìn tới"}
          onClick={() => session.shield()}
        >
          🛡️ Khiên<span className="text-[12px] opacity-80">{COST.shield}⚡</span>
        </button>
        {myTurn ? (
          <ConfirmButton className="btn btn-sm !px-2.5" onConfirm={() => session.pass()} confirmLabel="Bấm lần nữa để bỏ lượt">
            ⏭️ Bỏ lượt
          </ConfirmButton>
        ) : (
          <button type="button" className="btn btn-sm !px-2.5" disabled>
            ⏭️ Bỏ lượt
          </button>
        )}
      </div>
      {myTurn && (
        <p className="mt-2 text-[13px] text-ink-2">
          {cur.icon} <b>{cur.name}</b>: {cur.hint}.
        </p>
      )}
    </div>
  );
}

function useTurnLeft(since: number | undefined, on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return since ? Math.max(0, Math.ceil((since + TURN_MS - now) / 1000)) : 0;
}

function ActionBar({ view, session, counting }: { view: View; session: MineControlRoom; counting: boolean }) {
  const m = view.meta!;
  const g = view.game?.match;
  const opts = view.game!.opts;
  const s = g?.state;
  const playing = m.status === "playing";
  const left = useTurnLeft(g?.since, playing && !g?.result);
  const name = (k: number) => (g?.lineup[k]?.uid === view.me ? "bạn" : (g?.lineup[k]?.member?.name ?? "Ai đó"));

  if (!playing) {
    const n = Math.max(MIN_PLAYERS, m.players.length);
    const lowered = minesFor(opts, n) < opts.mines;
    return (
      <StatusBar
        stack
        message={
          <>
            {seatMessage(view, { enough: m.players.length >= MIN_PLAYERS, join: <>Bấm “Vào chơi” để giành ghế (2–{m.seats} người).</> })}
            {lowered && <span className="mt-0.5 block text-[13px] font-medium text-ink-3">Bản đồ nhỏ với {n} người: ván tới chỉ rải {minesFor(opts, n)} mìn.</span>}
          </>
        }
      >
        {view.isHost && (
          <>
            <div className="flex gap-1" role="group" aria-label="Bản đồ cho ván tới">
              {MAP_KEYS.map((k) => (
                <button key={k} type="button" className={`btn btn-sm !px-2.5 ${k === opts.map ? "btn-sun" : ""}`} aria-pressed={k === opts.map} onClick={() => session.setOptions({ map: k })} title={`${MAPS[k].label} ${MAPS[k].w}×${MAPS[k].h}`}>
                  {MAPS[k].w}×{MAPS[k].h}
                </button>
              ))}
            </div>
            <div className="flex gap-1" role="group" aria-label="Số mìn cho ván tới">
              {MINE_CHOICES.map((x) => (
                <button key={x} type="button" className={`btn btn-sm !px-2.5 ${x === opts.mines ? "btn-sun" : ""}`} aria-pressed={x === opts.mines} onClick={() => session.setOptions({ mines: x })}>
                  💣{x}
                </button>
              ))}
            </div>
          </>
        )}
        <SeatButtons view={view} session={session} blocked={startBlocker(view, { min: MIN_PLAYERS })} />
      </StatusBar>
    );
  }

  let message: React.ReactNode;
  let tone: string = TONE.idle;
  const clock = left > 0 && left <= 15 ? <span className="ml-1 tabular-nums text-coral">⏱ {left}s</span> : null;
  if (!g || !s || g.result || counting) message = <>💣 Chuẩn bị dò mìn…</>;
  else if (g.myTurn) {
    tone = TONE.turn;
    message = (
      <>
        🎯 Đến lượt bạn — mở một ô hoặc dùng kỹ năng
        {clock}
      </>
    );
  } else if (g.me >= 0 && s.players[g.me].out) {
    message = (
      <>
        {s.players[g.me].out === "dead" ? "💀 Bạn đã bị loại" : "🏳️ Bạn đã rời cuộc"} — điểm vẫn được tính nếu ván kết thúc vì hết ô / bế tắc. Lượt của{" "}
        <b style={{ color: MC_TONES[s.turn] }}>{name(s.turn)}</b>
      </>
    );
  } else
    message = (
      <>
        {g.me >= 0 ? "⏳" : "👀 Đang xem —"} Lượt của <b style={{ color: MC_TONES[s.turn] }}>{name(s.turn)}</b>
        {clock}
      </>
    );

  const inLineup = !!g && g.me >= 0 && !s?.players[g.me]?.out;
  return (
    <StatusBar stack tone={tone} message={message}>
      {inLineup && <ResignButton label="Bỏ cuộc" onConfirm={() => session.resign()} />}
    </StatusBar>
  );
}

function describe(e: McEvent, name: (k: number) => string): string {
  const who = name(e.who);
  switch (e.t) {
    case "open":
      return `⛏️ ${who} mở ô số ${e.near} (+${e.gain} điểm)${e.flood ? ` — lan ra ${e.flood} ô trung lập` : ""}`;
    case "boom":
      return e.dead ? `💀 ${who} giẫm mìn, hết mạng — bị loại!` : e.shield ? `🛡️ ${who} giẫm mìn, Khiên đỡ được (−2 điểm)` : `💥 ${who} giẫm mìn — mất 1 mạng, −2 điểm`;
    case "radar":
      return `📡 ${who} quét Radar: ${e.n} mìn trong vùng 3×3`;
    case "shield":
      return `🛡️ ${who} bật Khiên`;
    case "fort":
      return `🏰 ${who} xây Pháo đài`;
    case "grab":
      return `🚩 ${who} Cướp Đất một ô trung lập (+1 điểm)`;
    case "pass":
      return e.auto ? `⏭️ ${who} không còn việc gì làm được — tự bỏ lượt` : e.skip ? `⏭️ ${who} quá giờ / vắng mặt — qua lượt` : `⏭️ ${who} bỏ lượt`;
    case "quit":
      return `🏳️ ${who} rời cuộc`;
  }
}

function LastAction({ match: g, me }: { match: McMatch; me: string }) {
  const name = (k: number) => (g.lineup[k]?.uid === me ? "Bạn" : (g.lineup[k]?.member?.name ?? "Ai đó"));
  const recent = g.state.events.slice(-3).reverse();
  if (!recent.length) return null;
  return (
    <ul className="mx-auto mt-3 grid max-w-xl gap-0.5 text-center text-[13.5px]" aria-live="polite">
      {recent.map((e, i) => (
        <li key={g.state.events.length - i} className={i ? "text-ink-3" : "font-semibold text-ink-2"}>
          {describe(e, name)}
        </li>
      ))}
    </ul>
  );
}

function CountdownScene({ match: g, me, n }: { match: McMatch; me: string; n: number }) {
  const first = g.lineup[0];
  const tip = first?.uid === me ? "Bạn đi trước — mở ô sát căn cứ để chiếm đất!" : `${first?.member?.name ?? "Ai đó"} đi trước.`;
  return (
    <CountdownCine eyebrow={`💣 Dò Mìn Chiến Thuật · Ván ${g.round}`} n={n} tip={tip} tone="gold">
      <Crowd people={g.lineup.map((s, k) => ({ uid: s.uid, p: s.member, name: s.uid === me ? "Bạn" : (s.member?.name ?? "Ai đó"), ring: MC_TONES[k] }))} />
    </CountdownCine>
  );
}

function summary(g: McMatch, me: string) {
  const r = g.result!;
  const ws = r.winners ?? (r.winner ? [r.winner] : []);
  const rows = ranks(g.state);
  const nameOf = (uid: string) => (uid === me ? "Bạn" : (g.lineup.find((s) => s.uid === uid)?.member?.name ?? "Ai đó"));
  const why = g.state.end === "clear" ? "Đã mở hết ô an toàn" : "Bế tắc — không còn nước mở rộng";
  if (r.reason === "survive" && ws.length) return { ws, title: ws[0] === me ? "Bạn trụ lại cuối cùng!" : `${nameOf(ws[0])} trụ lại cuối cùng!`, sub: "Những người khác đều đã bị loại" };
  if (ws.length > 1) return { ws, title: "Hoà!", sub: `${why} · ${ws.map(nameOf).join(", ")} bằng điểm, bằng ô, bằng mạng, bằng Pháo đài` };
  if (!ws.length) return { ws, title: "Hết ván", sub: why };
  const top = rows[g.lineup.findIndex((s) => s.uid === ws[0])];
  return { ws, title: ws[0] === me ? "Bạn chiến thắng!" : `${nameOf(ws[0])} chiến thắng!`, sub: `${why} · ${top?.total ?? 0} điểm, nhiều nhất bàn` };
}

function EndScene({ match: g, me, onClose }: { match: McMatch; me: string; onClose: () => void }) {
  const { ws, title, sub } = summary(g, me);
  if (ws.length !== 1) return <DrawCine people={g.lineup.map((s, k) => ({ uid: s.uid, p: s.member, ring: MC_TONES[k] }))} title={title} sub={sub} onClose={onClose} />;
  const rows = ranks(g.state);
  return (
    <WinCine
      winners={ws.map((uid) => ({ uid, p: g.lineup.find((s) => s.uid === uid)?.member as Member | undefined, badge: <span className="text-[13px]">🚩</span> }))}
      title={title}
      sub={sub}
      note={g.me >= 0 && !ws.includes(me) ? "Ván sau dò kỹ hơn nhé!" : undefined}
      onClose={onClose}
    >
      <ul className="flex flex-wrap justify-center gap-2 text-[14px] font-bold">
        {g.lineup.map((s, k) => (
          <li key={s.uid} className="rounded-full bg-black/20 px-3 py-1">
            {s.member?.avatar} {s.uid === me ? "Bạn" : (s.member?.name ?? "Ai đó")}: {rows[k].total} điểm
          </li>
        ))}
      </ul>
    </WinCine>
  );
}

function Result({ match: g, me }: { match: McMatch; me: string }) {
  const { ws, title, sub } = summary(g, me);
  const order = ranks(g.state).sort(compareRank);
  const survive = g.result?.reason === "survive";
  return (
    <ResultCard round={g.round} title={`${ws.length === 1 ? "🏆" : "🤝"} ${title}`} sub={sub}>
      <Standings
        rows={order.map((r) => {
          const seat = g.lineup[r.k];
          const p = g.state.players[r.k];
          const rank = survive ? (p.out ? 0 : 1) : order.filter((x) => compareRank(x, r) < 0).length + 1;
          return {
            uid: seat.uid,
            name: (
              <>
                {seat.uid === me ? "Bạn" : (seat.member?.name ?? "Ai đó")}
                {p.out && <span className="ml-1 text-[12px] font-semibold text-ink-3">{p.out === "dead" ? "💀" : "🏳️"}</span>}
              </>
            ),
            rank,
            mark: <span className="h-3 w-3 flex-none rounded-full" style={{ background: MC_TONES[r.k] }} title={MC_TONE_NAMES[r.k]} aria-hidden="true" />,
            value: (
              <>
                {r.total} điểm
                <span className="ml-1.5 text-[12px] text-ink-3">
                  {r.bonus ? `(${r.score} + ${r.bonus} thưởng) · ` : ""}
                  {r.cells} ô
                </span>
              </>
            ),
          };
        })}
      />
    </ResultCard>
  );
}
