"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { roundOfTurn, ROUND_CHOICES, standings, TIER_NAMES, TIME_CHOICES, totalTurns, type DwPublic } from "@/lib/games/draw-guess";
import type { DrawGuessRoom, DwMatch, DwView, GuessState } from "@/lib/net/draw-guess-room";
import type { RoomView } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Crowd, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { DrawBoard, Toolbar, type Tool } from "./DrawBoard";
import { PeoplePanel } from "./People";
import { ResultCard as Result, Standings, StoppedCard } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout } from "./RoomLayout";
import { SeatButtons, seatMessage, StatusBar, StopButton, TONE } from "./StatusBar";
import { shallowEqual, useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

type View = Omit<RoomView<DwView>, "chat">;

function useDwView(session: DrawGuessRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const CONFETTI = ["🎉", "🏆", "🎨", "🖌️", "✨", "⭐"];
const WIN_SCENE_MS = 6500;

function useNow(active: boolean, every = 250) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, every);
    return () => clearInterval(t);
  }, [active, every]);
  return now;
}

const isLive = (view: View) => view.meta!.status === "playing" && view.game?.match?.round === view.meta!.round;

function nameIn(view: View, uid: string) {
  if (uid === view.me) return "Bạn";
  return view.game?.match?.lineup.find((s) => s.uid === uid)?.member?.name ?? view.members.find((p) => p.uid === uid)?.name ?? "Ai đó";
}

const guessing = (g: DwMatch) => g.role === "guesser" && g.pub.phase === "draw" && !g.hit;

const guessersOf = (pub: DwPublic) => pub.order.filter((u) => u !== pub.drawer);

type Shot = { round: number; turn: number; drawer: string; word: string; url: string };

// Phần bàn chơi bọc `memo` và tự đọc store để nhịp tim, tin chat hay người vào ra không làm bàn vẽ lại, và nước đi
// không làm danh sách người / khung chat vẽ lại.
export function DrawGuessTable({ id, slug, session }: { id: string; slug: string; session: DrawGuessRoom }) {
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<DwChat session={session} />}>
      <DrawGuessBody session={session} />
    </RoomLayout>
  );
}

// Chỉ chọn hai chuỗi từ store nên chỉ vẽ lại khi chúng đổi.
const DwChat = memo(function DwChat({ session }: { session: DrawGuessRoom }) {
  const room = useRoomState(session, (r) => (r.meta!.status === "playing" ? r.meta!.round : 0));
  const chat = useGame(
    session,
    (v) => {
      const g = v?.match;
      if (!room || !g || g.round !== room) return { placeholder: undefined, locked: undefined };
      return {
        placeholder: guessing(g) ? "Thảo luận — đoán ở ô dưới tranh nhé" : g.word && g.pub.phase !== "show" ? "Nhắn gì đó — đừng lộ đáp án!" : undefined,
        locked: g.hit && g.pub.phase === "draw" ? "🤐 Bạn đã đoán đúng — khoá chat tới hết lượt để không lộ đáp án." : undefined,
      };
    },
    shallowEqual,
  );
  return <ChatPanel session={session} placeholder={chat.placeholder} locked={chat.locked} />;
});

const DrawGuessBody = memo(function DrawGuessBody({ session }: { session: DrawGuessRoom }) {
  const view = useDwView(session);
  const m = view.meta!;
  const { opts, match: g } = view.game!;
  const areaRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, areaRef);
  const live = isLive(view);
  const [tool, setTool] = useState<Tool>({ kind: "pen", color: 1, size: 1 });
  const [shots, setShots] = useState<Shot[]>([]);
  const end = useEndScene(g?.result?.reason === "points" && g.result.winners?.length ? g.round : 0, { ms: WIN_SCENE_MS, emojis: CONFETTI });
  const count = useCountdown(live && g && g.pub.turn === 0 && g.pub.phase === "pick" ? g.round : 0, { endsAt: g?.pub.since });
  const shown = live && g ? { rounds: g.pub.rounds, time: g.pub.time / 1000, hints: g.pub.hints } : opts;

  const last = g?.pub.last;
  const capture =
    g && live && g.pub.phase === "show" && last?.word
      ? {
          key: `${g.round}:${last.t}`,
          onCapture: (url: string) => setShots((list) => [...list.filter((s) => s.round === g.round).slice(-40), { round: g.round, turn: last.t, drawer: last.drawer, word: last.word!, url }]),
        }
      : undefined;


  return (
    <>
      <RoomHeader name={m.name} status={m.status} round={m.round} playing="đang vẽ">
        <span className="chip text-ink-2">🔁 {shown.rounds} vòng</span>
        <span className="chip text-ink-2">⏱ {shown.time}s</span>
        <span className="chip text-ink-2">💡 Gợi ý {shown.hints ? "bật" : "tắt"}</span>
      </RoomHeader>

      <ActionBar view={view} session={session} />
      {!live && <Rules view={view} session={session} />}
      {g?.result && <ResultCard view={view} match={g} />}

      <div ref={areaRef} className="dw-col relative mx-auto mt-4 grid gap-3">
        {g && <Stage view={view} match={g} />}
        <DrawBoard session={session} ops={g?.ops ?? []} turnKey={g ? `${g.round}:${g.pub.turn}` : "idle"} canDraw={!!g?.canDraw} tool={tool} capture={capture}>
          <Overlay view={view} session={session} match={g} />
        </DrawBoard>
        {g?.canDraw && <Toolbar tool={tool} setTool={setTool} session={session} ops={g.ops} />}
        {g && live && <Prompt view={view} session={session} match={g} />}
        {g ? <Scoreboard view={view} match={g} /> : <Waiting view={view} />}
        <Flyers flyers={flyers} />
      </div>

      {g && <Gallery view={view} shots={shots.filter((s) => s.round === g.round)} />}

      {g && count > 0 && <CountdownScene view={view} match={g} n={count} />}
      {g && end.shown && <WinScene view={view} match={g} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

function CountdownScene({ view, match: g, n }: { view: View; match: DwMatch; n: number }) {
  const drawer = g.pub.drawer;
  const people = g.lineup.map((s, i) => ({ uid: s.uid, p: s.member, name: nameIn(view, s.uid), ring: s.uid === drawer ? "#ffc23d" : "#be97ff", badge: s.uid === drawer ? "✏️" : `${i + 1}` }));
  const tip = drawer === view.me ? "Bạn vẽ trước — chuẩn bị chọn từ nhé!" : `${nameIn(view, drawer)} vẽ trước — đoán cho nhanh nhé!`;
  return (
    <CountdownCine eyebrow={`🎨 Vẽ Đoán · Ván ${g.round} · ${g.pub.rounds} vòng`} n={n} tip={tip}>
      <Crowd people={people} />
    </CountdownCine>
  );
}

function WinScene({ view, match: g, onClose }: { view: View; match: DwMatch; onClose: () => void }) {
  const winners = g.result?.winners ?? [];
  const top = standings(g.pub)[0]?.score ?? 0;
  const iWon = winners.includes(view.me);
  return (
    <WinCine
      winners={winners.map((u) => ({ uid: u, p: g.lineup.find((s) => s.uid === u)?.member }))}
      title={iWon && winners.length === 1 ? "Bạn chiến thắng!" : `${winners.map((u) => nameIn(view, u)).join(", ")} ${winners.length > 1 ? "đồng hạng nhất!" : "chiến thắng!"}`}
      onClose={onClose}
    >
      <p className="cine-score">
        {top} <small>điểm</small>
      </p>
      <p className="text-[15px] font-bold opacity-85">Họa sĩ kiêm thám tử xuất sắc nhất phòng 🎨</p>
    </WinCine>
  );
}

function ActionBar({ view, session }: { view: View; session: DrawGuessRoom }) {
  const now = useNow(isLive(view));
  const { match: g, unkeyed } = view.game!;
  const live = isLive(view);
  const ready = view.seats.filter((s) => s.online).length;
  const left = g && now ? Math.max(0, Math.ceil((g.deadline - now) / 1000)) : 0;

  let message: React.ReactNode;
  let tone: string = TONE.idle;
  if (live && g) {
    const pub = g.pub;
    const drawer = nameIn(view, pub.drawer);
    if (pub.phase === "pick") {
      tone = g.role === "drawer" ? TONE.hot : TONE.idle;
      message = g.role === "drawer" ? <>✏️ Tới lượt bạn vẽ — chọn một từ{left ? ` trong ${left} giây` : ""}!</> : <>⏳ {drawer} đang chọn từ…</>;
    } else if (pub.phase === "draw") {
      const hits = pub.hits.length;
      const total = guessersOf(pub).length;
      if (g.role === "drawer") {
        tone = TONE.turn;
        message = (
          <>
            🖌️ Vẽ <b>“{g.word}”</b> — không viết chữ, không nói đáp án! ({hits}/{total} người đã đoán ra)
          </>
        );
      } else if (g.hit) {
        tone = TONE.hot;
        message = (
          <>
            🎉 Bạn đã đoán đúng{g.word ? <> <b>“{g.word}”</b></> : ""} (+{g.hit.p})! Khung chat tạm khoá tới hết lượt — chờ mọi người nhé.
          </>
        );
      } else if (g.role === "guesser") {
        tone = TONE.turn;
        message = <>🤔 {drawer} đang vẽ gì vậy? Gõ đáp án vào ô đoán dưới tranh — không cần dấu. Khung chat chỉ để thảo luận.</>;
      } else message = <>👀 Bạn đang xem {drawer} vẽ — {hits}/{total} người đã đoán ra.</>;
    } else if (pub.phase === "show") {
      tone = TONE.info;
      message = pub.last?.word ? (
        <>
          💡 Đáp án là <b>“{pub.last.word}”</b>
          {pub.turn + 1 < totalTurns(pub) ? " — lượt sau bắt đầu ngay đây!" : " — đây là lượt cuối!"}
        </>
      ) : (
        <>⏭ Bỏ qua lượt này…</>
      );
    } else message = <>🏁 Hết các lượt — đang tổng kết…</>;
  }
  if (live && g)
    return (
      <StatusBar tone={tone} message={message}>
        {view.isHost && <StopButton onConfirm={() => session.stop()} />}
      </StatusBar>
    );
  const blocked = ready < 2 ? "Cần ít nhất 2 người chơi đang online trong ghế" : unkeyed.length ? "Đang chờ máy của người chơi sẵn sàng…" : "";
  return (
    <StatusBar message={seatMessage(view, { enough: true, startHint: "Bấm “Bắt đầu” khi đủ người (ít nhất 2).", join: "Bấm “Vào chơi” để cùng vẽ, cùng đoán." })}>
      <SeatButtons view={view} session={session} blocked={blocked} />
    </StatusBar>
  );
}

function Rules({ view, session }: { view: View; session: DrawGuessRoom }) {
  const { opts, words } = view.game!;
  const host = view.isHost;
  const row = "flex flex-wrap items-center gap-2";
  const label = "w-[96px] text-[13px] font-bold text-ink-3";
  return (
    <section className="card mt-4 grid gap-3 p-4" aria-label="Luật ván tới">
      <div className={row}>
        <span className={label}>Số vòng</span>
        {ROUND_CHOICES.map((n) => (
          <button key={n} type="button" className={`btn btn-sm ${opts.rounds === n ? "btn-sun" : ""}`} aria-pressed={opts.rounds === n} disabled={!host && opts.rounds !== n} onClick={host ? () => session.setOptions({ rounds: n }) : undefined}>
            {n} vòng
          </button>
        ))}
      </div>
      <div className={row}>
        <span className={label}>Thời gian vẽ</span>
        {TIME_CHOICES.map((s) => (
          <button key={s} type="button" className={`btn btn-sm ${opts.time === s ? "btn-sun" : ""}`} aria-pressed={opts.time === s} disabled={!host && opts.time !== s} onClick={host ? () => session.setOptions({ time: s }) : undefined}>
            {s} giây
          </button>
        ))}
      </div>
      <div className={row}>
        <span className={label}>Gợi ý chữ cái</span>
        {[true, false].map((on) => (
          <button key={String(on)} type="button" className={`btn btn-sm ${opts.hints === on ? "btn-sun" : ""}`} aria-pressed={opts.hints === on} disabled={!host && opts.hints !== on} onClick={host ? () => session.setOptions({ hints: on }) : undefined}>
            {on ? "💡 Mở dần" : "🙈 Không gợi ý"}
          </button>
        ))}
      </div>
      <p className="text-[13.5px] text-ink-2">
        Mỗi vòng ai cũng vẽ một lượt: chọn 1 trong 3 từ (dễ · vừa · khó), người khác gõ đáp án vào ô đoán dưới tranh — không cần dấu, bỏ được chữ “con”, “cái”… ở
        đầu; khung chat chỉ để thảo luận, ai đoán đúng thì bị khoá chat tới hết lượt. Đoán càng sớm càng
        nhiều điểm (60–300); người vẽ được 50 điểm cho mỗi người đoán ra.
        {!host && " Chủ phòng chỉnh luật cho ván tới."}
      </p>
      <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-ink-3">
        📚 Đã chơi {words.used}/{words.total} từ — phòng không bốc lại từ đã chơi.
        {host && words.used > 0 && (
          <button type="button" className="btn btn-sm btn-ghost !min-h-[28px] !px-2" onClick={() => session.resetWords()}>
            Làm mới bộ từ
          </button>
        )}
      </p>
    </section>
  );
}

function Mask({ mask }: { mask: string }) {
  const words = mask.split(" ").filter(Boolean);
  const letters = words.reduce((n, w) => n + Array.from(w).length, 0);
  return (
    <span className="dw-mask" role="img" aria-label={`Đáp án gồm ${words.length} tiếng, ${letters} chữ cái${mask.replace(/[_ ]/g, "") ? `, đã mở: ${mask.replace(/_/g, "?")}` : ""}`}>
      {words.map((w, i) => (
        <span key={i} className="dw-mask-word">
          {Array.from(w).map((ch, j) => (
            <span key={j} className={`dw-slot ${ch === "_" ? "" : "is-open"}`}>
              {ch === "_" ? "" : ch}
            </span>
          ))}
          <sup>{Array.from(w).length}</sup>
        </span>
      ))}
    </span>
  );
}

function TierChip({ tier }: { tier?: 0 | 1 | 2 }) {
  if (tier === undefined) return null;
  return (
    <span className="chip text-ink-2">
      {TIER_NAMES[tier].emoji} {TIER_NAMES[tier].name}
    </span>
  );
}

function Stage({ view, match: g }: { view: View; match: DwMatch }) {
  const pub = g.pub;
  const live = isLive(view);
  // Vòng đếm giờ của lượt chạy riêng ở đây, không kéo tranh vẽ lại.
  const now = useNow(live);
  const span = Math.max(1, pub.until - pub.since);
  const leftMs = live && now ? Math.max(0, g.deadline - now) : 0;
  const timed = live && (pub.phase === "pick" || pub.phase === "draw");
  const low = timed && pub.phase === "draw" && leftMs <= 10000;
  let center: React.ReactNode;
  if (pub.phase === "pick") center = <span className="text-[15px] font-bold text-ink-2">{g.role === "drawer" ? "Chọn một từ để vẽ ↓" : `${nameIn(view, pub.drawer)} đang chọn từ…`}</span>;
  else if (pub.phase === "draw" && g.word)
    center = (
      <span className="flex flex-wrap items-center justify-center gap-2">
        <span className="dw-word">{g.word}</span>
        {g.hit && <span className="chip text-lime">✅ Đã đoán ra</span>}
        <TierChip tier={pub.tier} />
      </span>
    );
  else if (pub.phase === "draw")
    center = (
      <span className="flex flex-wrap items-center justify-center gap-2">
        <Mask mask={pub.mask ?? ""} />
        <TierChip tier={pub.tier} />
      </span>
    );
  else
    center = g.word ? (
      <span className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-[12px] font-bold text-ink-3 uppercase">Đáp án</span>
        <span className="dw-word">{g.word}</span>
      </span>
    ) : (
      <span className="text-[15px] font-bold text-ink-3">{pub.phase === "over" || !live ? "Hết ván" : "Bỏ qua lượt"}</span>
    );
  return (
    <div className="card flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap sm:px-4">
      <div className="flex-none text-[12.5px] leading-tight font-bold text-ink-3">
        <p>
          Lượt {Math.min(pub.turn + 1, totalTurns(pub))}/{totalTurns(pub)}
        </p>
        <p>
          Vòng {Math.min(roundOfTurn(pub, pub.turn), pub.rounds)}/{pub.rounds}
        </p>
      </div>
      <div className="order-last min-w-0 basis-full text-center sm:order-none sm:flex-1 sm:basis-auto">{center}</div>
      <div
        className={`dw-timer ml-auto sm:ml-0 ${low ? "is-low" : ""}`}
        style={{ ["--p" as string]: timed ? Math.min(1, leftMs / span) : 0 }}
        role="timer"
        aria-label={timed ? `Còn ${Math.ceil(leftMs / 1000)} giây` : "Không tính giờ"}
      >
        <span>{timed ? Math.ceil(leftMs / 1000) : "–"}</span>
      </div>
    </div>
  );
}

function Overlay({ view, session, match: g }: { view: View; session: DrawGuessRoom; match?: DwMatch }) {
  const m = view.meta!;
  const live = isLive(view);
  if (!g)
    return (
      <div className="dw-veil">
        <p className="card px-5 py-3 text-center font-display text-lg font-extrabold">
          {m.players.length < 2 ? "🎨 Cần ít nhất 2 người vào ghế để vẽ đoán…" : view.isHost ? "🎨 Bấm “Bắt đầu” để vẽ!" : "🎨 Đang chờ chủ phòng bắt đầu…"}
        </p>
      </div>
    );
  if (!live) return null;
  const pub = g.pub;
  if (pub.phase === "pick") return g.role === "drawer" ? <Choose key={`${g.round}:${pub.turn}`} session={session} match={g} /> : <Picking view={view} match={g} />;
  if (pub.phase === "show" && pub.last) return <Reveal view={view} match={g} />;
  return null;
}

function Choose({ session, match: g }: { session: DrawGuessRoom; match: DwMatch }) {
  const now = useNow(true);
  const [chosen, setChosen] = useState<{ turn: number; i: number } | null>(null);
  const picked = chosen?.turn === g.pub.turn ? chosen.i : -1;
  const left = now ? Math.max(0, Math.ceil((g.deadline - now) / 1000)) : 0;
  return (
    <div className="dw-veil">
      <div className="card dw-choose grid gap-3 p-4 text-center sm:p-5">
        <p className="font-display text-xl font-extrabold sm:text-2xl">Chọn một từ để vẽ</p>
        {g.choices ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {g.choices.map((w, i) => {
              const tier = TIER_NAMES[i as 0 | 1 | 2];
              return (
                <button
                  key={i}
                  type="button"
                  className={`btn dw-choice ${picked === i ? "btn-sun" : ""}`}
                  disabled={picked >= 0}
                  onClick={() => {
                    setChosen({ turn: g.pub.turn, i });
                    session.choose(i);
                  }}
                >
                  <span className="text-[12px] font-bold text-ink-3">
                    {tier.emoji} {tier.name}
                  </span>
                  <span className="font-display text-lg font-extrabold">{w}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[14px] font-semibold text-ink-3">Đang nhận bộ từ…</p>
        )}
        <p className="text-[13px] font-semibold text-ink-3">{picked >= 0 ? "Đã chọn — chuẩn bị vẽ…" : `Không chọn thì tự bốc sau ${left} giây`}</p>
      </div>
    </div>
  );
}

function Picking({ view, match: g }: { view: View; match: DwMatch }) {
  const p = g.lineup.find((s) => s.uid === g.pub.drawer)?.member;
  return (
    <div className="dw-veil">
      <div className="card flex items-center gap-3 px-5 py-3">
        {p && <Avatar p={p} size={44} className="bob" />}
        <p className="font-display text-lg font-extrabold">{nameIn(view, g.pub.drawer)} đang chọn từ…</p>
      </div>
    </div>
  );
}

function Reveal({ view, match: g }: { view: View; match: DwMatch }) {
  const l = g.pub.last!;
  const who = (u: string) => g.lineup.find((s) => s.uid === u)?.member;
  return (
    <div className="dw-reveal card" role="status">
      {l.word ? (
        <>
          <p className="text-[12px] font-bold tracking-wide text-ink-3 uppercase">{l.end === "time" ? "⏰ Hết giờ — đáp án" : l.end === "away" ? "🚪 Người vẽ đã rời đi — đáp án" : "🎯 Đáp án"}</p>
          <p className="dw-word">{l.word}</p>
          {l.hits.length ? (
            <ul className="mt-2 flex flex-wrap justify-center gap-1.5">
              {l.hits.map((h) => {
                const p = who(h.u);
                return (
                  <li key={h.u} className="dw-hit">
                    {p && <Avatar p={p} size={20} />}
                    <span className="max-w-[9em] truncate">{nameIn(view, h.u)}</span>
                    <b>+{h.p}</b>
                  </li>
                );
              })}
              <li className="dw-hit is-drawer">
                ✏️ <span className="max-w-[9em] truncate">{nameIn(view, l.drawer)}</span> <b>+{l.dp}</b>
              </li>
            </ul>
          ) : (
            <p className="mt-1 text-[13.5px] font-semibold text-ink-2">Chưa ai đoán ra 😅</p>
          )}
        </>
      ) : (
        <p className="font-display text-lg font-extrabold">{l.end === "skip" ? `⏭ ${nameIn(view, l.drawer)} vắng mặt — bỏ qua lượt` : "⚠️ Chủ phòng vừa đổi — lượt này bị huỷ"}</p>
      )}
    </div>
  );
}

const GUESS_ICON: Record<GuessState, string> = { wait: "⏳", wrong: "❌", near: "🔥", right: "✅" };
const GUESS_LABEL: Record<GuessState, string> = { wait: "đang chấm", wrong: "sai", near: "gần đúng!", right: "đúng!" };

function Prompt({ view, session, match: g }: { view: View; session: DrawGuessRoom; match: DwMatch }) {
  const pub = g.pub;
  if (pub.phase !== "draw") return null;
  if (g.role === "drawer")
    return (
      <p className="flex flex-wrap items-center justify-center gap-2 text-center text-[13px] font-semibold text-ink-3">
        Người đoán đang thấy: <Mask mask={pub.mask ?? ""} />
      </p>
    );
  if (g.role !== "guesser") return null;
  if (g.hit)
    return (
      <p className="card bg-lime-soft px-4 py-3 text-center text-[15px] font-bold">
        🎉 Bạn đã đoán ra{g.word ? <> “{g.word}”</> : ""}! +{g.hit.p} điểm
      </p>
    );
  return <GuessBox key={`${g.round}:${pub.turn}`} view={view} session={session} match={g} />;
}

// Chỉ tự đặt con trỏ vào ô trên máy có chuột — trên điện thoại bàn phím ảo sẽ che tranh.
function GuessBox({ view, session, match: g }: { view: View; session: DrawGuessRoom; match: DwMatch }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = inputRef.current;
    const busy = document.activeElement && document.activeElement !== document.body;
    if (el && !busy && window.matchMedia("(pointer: fine)").matches) el.focus({ preventScroll: true });
  }, []);
  const recent = g.guesses.slice(-6);
  return (
    <div className="dw-guessbox card grid gap-2 p-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (session.guess(text)) setText("");
        }}
      >
        <label htmlFor="dw-guess" className="sr-only">
          Đáp án bạn đoán
        </label>
        <input
          ref={inputRef}
          id="dw-guess"
          className="field"
          placeholder="🎯 Gõ đáp án…"
          aria-describedby="dw-guess-hint"
          value={text}
          maxLength={40}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          enterKeyHint="send"
        />
        <button type="submit" className="btn btn-pen" disabled={!text.trim()}>
          Đoán
        </button>
      </form>
      <p id="dw-guess-hint" className="sr-only">
        Đoán xem {nameIn(view, g.pub.drawer)} đang vẽ gì — không cần dấu. Kết quả hiện trong khung chat.
      </p>
      {recent.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Lời đoán của bạn">
          {recent.map((x, i) => (
            <li key={g.guesses.length - recent.length + i} className={`dw-guess is-${x.state}`} title={GUESS_LABEL[x.state]}>
              {GUESS_ICON[x.state]} {x.text}
              {x.state === "near" && <b> gần đúng!</b>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Scoreboard({ view, match: g }: { view: View; match: DwMatch }) {
  const pub = g.pub;
  const live = isLive(view);
  const last = pub.phase === "show" ? pub.last : undefined;
  const gain = (u: string) => (last ? (last.hits.find((h) => h.u === u)?.p ?? 0) + (last.drawer === u ? last.dp : 0) : 0);
  const table = new Map(standings(pub).map((x) => [x.uid, x]));
  return (
    <section className="card p-3" aria-labelledby="dw-score-h">
      <h2 id="dw-score-h" className="sr-only">
        Bảng điểm
      </h2>
      <ol className="dw-strip">
        {pub.order.map((uid) => {
          const { score = 0, rank = 0 } = table.get(uid) ?? {};
          const seat = g.lineup.find((s) => s.uid === uid);
          const p = seat?.member;
          const drawing = live && pub.drawer === uid && (pub.phase === "pick" || pub.phase === "draw");
          const hit = live && pub.phase === "draw" && pub.hits.some((h) => h.u === uid);
          const plus = gain(uid);
          const name = uid === view.me ? "Bạn" : (p?.name ?? "Ai đó");
          return (
            <li key={uid} className={`dw-player ${drawing ? "is-drawing" : hit ? "is-hit" : ""}`} aria-label={`Hạng ${rank}: ${name}, ${score} điểm${drawing ? ", đang vẽ" : hit ? ", đã đoán ra" : ""}`}>
              <span className="relative flex-none">
                {p ? <Avatar p={p} size={38} className={seat?.online ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[38px] w-[38px] bg-sunken" />}
                <span className={`dw-rank ${rank === 1 && score > 0 ? "is-top" : ""}`} aria-hidden="true">
                  {rank === 1 && score > 0 ? "👑" : rank}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] leading-tight font-bold">{name}</span>
                <span className="block text-[11.5px] leading-tight font-semibold text-ink-3">
                  {drawing ? "✏️ Đang vẽ" : hit ? "✅ Đã đoán ra" : seat && !seat.online ? "⚠️ Mất kết nối" : "\u00a0"}
                </span>
              </span>
              <span className="flex-none text-right" aria-hidden="true">
                <span className="block font-display text-lg leading-tight font-extrabold tabular-nums">{score}</span>
                {plus > 0 && <span className="dw-plus">+{plus}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Waiting({ view }: { view: View }) {
  const m = view.meta!;
  return (
    <section className="card p-3" aria-labelledby="dw-seat-h">
      <h2 id="dw-seat-h" className="mb-2 px-1 text-[13px] font-bold text-ink-3">
        🪑 Người chơi ({m.players.length}/{m.seats})
      </h2>
      {view.seats.length ? (
        <ul className="dw-strip">
          {view.seats.map((s) => (
            <li key={s.uid} className="dw-player">
              <span className="flex-none">
                {s.member ? <Avatar p={s.member} size={38} className={s.online ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[38px] w-[38px] bg-sunken" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{s.uid === view.me ? "Bạn" : (s.member?.name ?? "Ai đó")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-[13.5px] text-ink-3">Chưa ai vào ghế.</p>
      )}
    </section>
  );
}

function ResultCard({ view, match: g }: { view: View; match: DwMatch }) {
  const r = g.result!;
  if (r.reason !== "points") return <StoppedCard round={g.round} />;
  const winners = r.winners ?? [];
  const iWon = winners.includes(view.me);
  const names = winners.map((u) => nameIn(view, u)).join(", ");
  return (
    <Result round={g.round} title={!winners.length ? "🤷 Chưa ai ghi được điểm" : winners.length > 1 ? `🤝 ${names} đồng hạng nhất!` : iWon ? "🏆 Bạn chiến thắng!" : `🏆 ${names} chiến thắng!`}>
      <Standings rows={standings(g.pub).map(({ uid, score, rank }) => ({ uid, name: nameIn(view, uid), rank, value: `${score} điểm` }))} />
    </Result>
  );
}

function Gallery({ view, shots }: { view: View; shots: Shot[] }) {
  if (!shots.length) return null;
  return (
    <section className="card mt-4 p-4" aria-labelledby="dw-gallery-h">
      <h2 id="dw-gallery-h" className="font-display text-lg font-extrabold">
        🖼️ Triển lãm <span className="text-ink-3">({shots.length})</span>
      </h2>
      <p className="text-[12.5px] font-semibold text-ink-3">Tranh các lượt bạn đã xem trong ván này — chỉ lưu trên máy bạn, tải lại trang là mất.</p>
      <ul className="dw-gallery mt-3">
        {shots.map((s) => (
          <li key={s.turn}>
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element -- ảnh chụp từ canvas (data URL) */}
              <img src={s.url} alt={`Tranh “${s.word}” của ${nameIn(view, s.drawer)}`} loading="lazy" />
              <figcaption className="mt-1 flex items-center gap-1.5 text-[13px]">
                <b className="min-w-0 flex-1 truncate">{s.word}</b>
                <span className="truncate text-ink-3">✏️ {nameIn(view, s.drawer)}</span>
                <a href={s.url} download={`ve-doan-${s.turn + 1}.jpg`} className="no-underline" title="Lưu tranh" aria-label={`Lưu tranh “${s.word}”`}>
                  💾
                </a>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
