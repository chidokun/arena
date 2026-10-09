"use client";

import { useEffect, useRef, useState } from "react";
import { roundOfTurn, ROUND_CHOICES, standings, TIER_NAMES, TIME_CHOICES, totalTurns, type DwPublic } from "@/lib/games/draw-guess";
import type { DrawGuessRoom, DwMatch, DwView, GuessState } from "@/lib/net/draw-guess-room";
import type { ChatMsg, RoomView } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "../ConfirmButton";
import { ChatPanel } from "./ChatPanel";
import { DrawBoard, Toolbar, type Tool } from "./DrawBoard";
import { Balloon, PeoplePanel } from "./People";
import { Flyers, RoomLayout, StatusChip } from "./RoomLayout";
import { useBalloons, useFlyers, useRoomView } from "./useRoom";

type View = RoomView<DwView>;

const CONFETTI = ["🎉", "🏆", "🎨", "🖌️", "✨", "⭐"];
const WIN_SCENE_MS = 6500;

/** Giờ hiện tại, cập nhật đều khi `active`. */
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

/** Người đoán chưa đoán ra trong lượt đang vẽ. */
const guessing = (g: DwMatch) => g.role === "guesser" && g.pub.phase === "draw" && !g.hit;

/** Ai còn đoán được trong lượt: người chơi trừ người vẽ. */
const guessersOf = (pub: DwPublic) => pub.order.filter((u) => u !== pub.drawer);

/** Tranh của các lượt đã lộ đáp án, chụp trên máy mình (mất khi tải lại trang). */
type Shot = { round: number; turn: number; drawer: string; word: string; url: string };

export function DrawGuessTable({ id, slug, session }: { id: string; slug: string; session: DrawGuessRoom }) {
  const view = useRoomView(session)!;
  const m = view.meta!;
  const { opts, match: g } = view.game!;
  const balloons = useBalloons(session);
  const areaRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, areaRef);
  const live = isLive(view);
  const now = useNow(live);
  const [tool, setTool] = useState<Tool>({ kind: "pen", color: 1, size: 1 });
  const [shots, setShots] = useState<Shot[]>([]);
  const scenes = useScenes(g);
  const shown = live && g ? { rounds: g.pub.rounds, time: g.pub.time / 1000, hints: g.pub.hints } : opts;

  const last = g?.pub.last;
  const capture =
    g && live && g.pub.phase === "show" && last?.word
      ? {
          key: `${g.round}:${last.t}`,
          onCapture: (url: string) => setShots((list) => [...list.filter((s) => s.round === g.round).slice(-40), { round: g.round, turn: last.t, drawer: last.drawer, word: last.word!, url }]),
        }
      : undefined;

  const placeholder = !live || !g ? undefined : guessing(g) ? "Gõ đáp án rồi Enter…" : g.word && g.pub.phase !== "show" ? "Nhắn gì đó — đừng lộ đáp án!" : undefined;

  return (
    <RoomLayout
      id={id}
      slug={slug}
      side={
        <>
          <PeoplePanel view={view} session={session} balloons={balloons} roomId={id} />
          <ChatPanel session={session} chat={view.chat} me={view.me} placeholder={placeholder} />
        </>
      }
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{m.name}</h1>
        <StatusChip status={m.status} round={m.round} playing="đang vẽ" />
        <span className="chip text-ink-2">🔁 {shown.rounds} vòng</span>
        <span className="chip text-ink-2">⏱ {shown.time}s</span>
        <span className="chip text-ink-2">💡 Gợi ý {shown.hints ? "bật" : "tắt"}</span>
      </header>

      <ActionBar view={view} session={session} now={now} />
      {!live && <Rules view={view} session={session} />}
      {g?.result && <ResultCard view={view} match={g} />}

      <div ref={areaRef} className="dw-col relative mx-auto mt-4 grid gap-3">
        {g && <Stage view={view} match={g} now={now} />}
        <DrawBoard session={session} ops={g?.ops ?? []} turnKey={g ? `${g.round}:${g.pub.turn}` : "idle"} canDraw={!!g?.canDraw} tool={tool} capture={capture}>
          <Overlay view={view} session={session} match={g} now={now} />
        </DrawBoard>
        {g?.canDraw && <Toolbar tool={tool} setTool={setTool} session={session} ops={g.ops} />}
        {g && live && <Prompt view={view} session={session} match={g} />}
        {g ? <Scoreboard view={view} match={g} balloons={balloons} /> : <Waiting view={view} balloons={balloons} />}
        <Flyers flyers={flyers} />
      </div>

      {g && <Gallery view={view} shots={shots.filter((s) => s.round === g.round)} />}

      {g && scenes.win !== null && <WinScene view={view} match={g} onClose={scenes.close} />}
      {scenes.party.length > 0 && (
        <div className="loto-party sd-party" aria-hidden="true">
          {scenes.party.map((b) => (
            <span key={b.key} style={{ left: `${b.left}%`, animationDelay: `${b.delay}ms`, animationDuration: `${b.dur}ms`, ["--rot" as string]: `${b.rot}deg` }}>
              {b.emoji}
            </span>
          ))}
        </div>
      )}
    </RoomLayout>
  );
}

/** Cảnh chiến thắng và pháo giấy khi ván vừa kết thúc ngay trước mắt (vào phòng / tải lại trang thì không diễn lại). */
function useScenes(g: DwMatch | undefined) {
  const [win, setWin] = useState<number | null>(null);
  const [party, setParty] = useState<{ key: string; left: number; delay: number; dur: number; rot: number; emoji: string }[]>([]);
  const key = g?.result?.reason === "points" && g.result.winners?.length ? g.round : 0;
  const seen = useRef(key);
  useEffect(() => {
    if (!key || key === seen.current) {
      seen.current = key;
      return;
    }
    seen.current = key;
    setWin(key);
    setParty(
      Array.from({ length: 40 }, (_, i) => ({
        key: `${key}:${i}`,
        left: Math.random() * 96,
        delay: Math.random() * 700,
        dur: 2200 + Math.random() * 1600,
        rot: Math.round(Math.random() * 540 - 270),
        emoji: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
      })),
    );
    const a = setTimeout(() => setParty([]), 4800);
    const b = setTimeout(() => setWin((w) => (w === key ? null : w)), WIN_SCENE_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [key]);
  return { win: g && win === g.round ? win : null, party, close: () => setWin(null) };
}

function WinScene({ view, match: g, onClose }: { view: View; match: DwMatch; onClose: () => void }) {
  const winners = g.result?.winners ?? [];
  const top = standings(g.pub)[0]?.score ?? 0;
  const iWon = winners.includes(view.me);
  return (
    <div className="ww-cine sd-cine is-win" role="dialog" aria-modal="true" aria-label="Chiến thắng" onClick={onClose}>
      <div className="ww-cine-body grid justify-items-center gap-4 text-center">
        <span className="sd-trophy" aria-hidden="true">
          🏆
        </span>
        <div className="flex flex-wrap justify-center gap-3">
          {winners.map((u) => {
            const p = g.lineup.find((s) => s.uid === u)?.member;
            return p ? <Avatar key={u} p={p} size={72} className="sd-win-avatar" /> : null;
          })}
        </div>
        <p className="ww-cine-title !text-[34px] sm:!text-[42px]">
          {iWon && winners.length === 1 ? "Bạn chiến thắng!" : `${winners.map((u) => nameIn(view, u)).join(", ")} ${winners.length > 1 ? "đồng hạng nhất!" : "chiến thắng!"}`}
        </p>
        <p className="sd-cine-score">
          {top} <small>điểm</small>
        </p>
        <p className="text-[15px] font-bold opacity-85">Họa sĩ kiêm thám tử xuất sắc nhất phòng 🎨</p>
      </div>
      <p className="ww-cine-skip">Bấm để đóng</p>
    </div>
  );
}

/** Lời nhắc theo vai trò và nút chính: vào ghế / rời ghế / bắt đầu / dừng ván. */
function ActionBar({ view, session, now }: { view: View; session: DrawGuessRoom; now: number }) {
  const m = view.meta!;
  const { match: g, unkeyed } = view.game!;
  const live = isLive(view);
  const seated = view.mySeat >= 0;
  const full = m.players.length >= m.seats;
  const ready = view.seats.filter((s) => s.online).length;
  const left = g && now ? Math.max(0, Math.ceil((g.deadline - now) / 1000)) : 0;

  let message: React.ReactNode;
  let tone = "var(--sunken)";
  if (live && g) {
    const pub = g.pub;
    const drawer = nameIn(view, pub.drawer);
    if (pub.phase === "pick") {
      tone = g.role === "drawer" ? "var(--sun-soft)" : "var(--sunken)";
      message = g.role === "drawer" ? <>✏️ Tới lượt bạn vẽ — chọn một từ{left ? ` trong ${left} giây` : ""}!</> : <>⏳ {drawer} đang chọn từ…</>;
    } else if (pub.phase === "draw") {
      const hits = pub.hits.length;
      const total = guessersOf(pub).length;
      if (g.role === "drawer") {
        tone = "var(--lime-soft)";
        message = (
          <>
            🖌️ Vẽ <b>“{g.word}”</b> — không viết chữ, không nói đáp án! ({hits}/{total} người đã đoán ra)
          </>
        );
      } else if (g.hit) {
        tone = "var(--sun-soft)";
        message = (
          <>
            🎉 Bạn đã đoán đúng{g.word ? <> <b>“{g.word}”</b></> : ""} (+{g.hit.p})! Chờ mọi người nhé.
          </>
        );
      } else if (g.role === "guesser") {
        tone = "var(--lime-soft)";
        message = <>🤔 {drawer} đang vẽ gì vậy? Gõ đáp án vào ô dưới tranh hoặc khung chat — không cần dấu.</>;
      } else message = <>👀 Bạn đang xem {drawer} vẽ — {hits}/{total} người đã đoán ra.</>;
    } else if (pub.phase === "show") {
      tone = "var(--grape-soft)";
      message = pub.last?.word ? (
        <>
          💡 Đáp án là <b>“{pub.last.word}”</b>
          {pub.turn + 1 < totalTurns(pub) ? " — lượt sau bắt đầu ngay đây!" : " — đây là lượt cuối!"}
        </>
      ) : (
        <>⏭ Bỏ qua lượt này…</>
      );
    } else message = <>🏁 Hết các lượt — đang tổng kết…</>;
  } else if (view.pending === "play") {
    message = <>⏳ Đang chờ chủ phòng xếp ghế…</>;
  } else if (seated) {
    message = <>✅ Bạn đã vào ghế. {view.isHost ? "Bấm “Bắt đầu” khi đủ người (ít nhất 2)." : "Chờ chủ phòng bắt đầu."}</>;
  } else {
    message = full ? <>🪑 Hết ghế — bạn có thể ngồi xem và trò chuyện.</> : <>Bấm “Vào chơi” để cùng vẽ, cùng đoán.</>;
  }

  const blocked = ready < 2 ? "Cần ít nhất 2 người chơi đang online trong ghế" : unkeyed.length ? "Đang chờ máy của người chơi sẵn sàng…" : "";
  return (
    <div className="card flex flex-wrap items-center gap-3 px-4 py-3" style={{ background: tone }} aria-live="polite">
      <p className="min-w-0 flex-1 text-[15px] font-semibold">{message}</p>
      <div className="flex flex-wrap gap-2">
        {!live && !seated && !full && (
          <button type="button" className="btn btn-lime" onClick={() => session.join()} disabled={view.pending === "play"}>
            🙋 Vào chơi
          </button>
        )}
        {!live && seated && (
          <button type="button" className="btn" onClick={() => session.leaveSeat()} disabled={view.pending === "watch"}>
            Rời ghế
          </button>
        )}
        {!live && view.isHost && (
          <button type="button" className="btn btn-pen" onClick={() => session.start()} disabled={!!blocked} title={blocked}>
            {m.round > 0 ? "🔁 Ván mới" : "▶ Bắt đầu"}
          </button>
        )}
        {live && view.isHost && (
          <ConfirmButton className="btn btn-coral" onConfirm={() => session.stop()} confirmLabel="Bấm lần nữa để dừng">
            ⏹ Dừng ván
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}

/** Luật ván tới: chủ phòng chọn số vòng, thời gian vẽ, gợi ý; người khác xem. */
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
        Mỗi vòng ai cũng vẽ một lượt: chọn 1 trong 3 từ (dễ · vừa · khó), người khác gõ đáp án — không cần dấu, bỏ được chữ “con”, “cái”… ở đầu. Đoán càng sớm càng
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

/** Khung đáp án: mỗi chữ cái một ô, chữ đã mở gợi ý hiện ra; số chữ cái mỗi tiếng ghi nhỏ bên cạnh. */
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

/** Thanh trên tranh: lượt / vòng, đáp án (hoặc khung đáp án), đồng hồ. */
function Stage({ view, match: g, now }: { view: View; match: DwMatch; now: number }) {
  const pub = g.pub;
  const live = isLive(view);
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

/** Lớp phủ trên tranh: chưa có ván, chọn từ, lộ đáp án. */
function Overlay({ view, session, match: g, now }: { view: View; session: DrawGuessRoom; match?: DwMatch; now: number }) {
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
  if (pub.phase === "pick") return g.role === "drawer" ? <Choose key={`${g.round}:${pub.turn}`} session={session} match={g} now={now} /> : <Picking view={view} match={g} />;
  if (pub.phase === "show" && pub.last) return <Reveal view={view} match={g} />;
  return null;
}

function Choose({ session, match: g, now }: { session: DrawGuessRoom; match: DwMatch; now: number }) {
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

/** Dưới tranh: ô đoán cho người đoán, khung đáp án người đoán thấy cho người vẽ. */
function Prompt({ view, session, match: g }: { view: View; session: DrawGuessRoom; match: DwMatch }) {
  const [text, setText] = useState("");
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
  const recent = g.guesses.slice(-6);
  return (
    <div className="grid gap-2">
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
        <input id="dw-guess" className="field" placeholder={`Đoán xem ${nameIn(view, pub.drawer)} vẽ gì…`} value={text} maxLength={40} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        <button type="submit" className="btn btn-pen" disabled={!text.trim()}>
          Đoán
        </button>
      </form>
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

/** Bảng điểm: dải người chơi theo thứ tự vẽ — hạng, điểm, ai đang vẽ, ai đã đoán ra, điểm vừa cộng lúc lộ đáp án. */
function Scoreboard({ view, match: g, balloons }: { view: View; match: DwMatch; balloons: Record<string, ChatMsg> }) {
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
                <Balloon msg={balloons[uid]} />
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

/** Chưa có ván: những người đã vào ghế. */
function Waiting({ view, balloons }: { view: View; balloons: Record<string, ChatMsg> }) {
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
              <span className="relative flex-none">
                {s.member ? <Avatar p={s.member} size={38} className={s.online ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[38px] w-[38px] bg-sunken" />}
                <Balloon msg={balloons[s.uid]} />
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
  if (r.reason !== "points")
    return (
      <section className="card loto-result mt-4 p-4 sm:p-5" aria-label={`Kết quả ván ${g.round}`}>
        <p className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">⏹ Dừng ván</p>
        <p className="mt-1 text-[15px] text-ink-2">Ván {g.round} dừng giữa chừng — không tính ai thắng.</p>
      </section>
    );
  const winners = r.winners ?? [];
  const iWon = winners.includes(view.me);
  const names = winners.map((u) => nameIn(view, u)).join(", ");
  return (
    <section className="card loto-result mt-4 p-4 sm:p-5" aria-label={`Kết quả ván ${g.round}`}>
      <p className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
        {!winners.length ? "🤷 Chưa ai ghi được điểm" : winners.length > 1 ? `🤝 ${names} đồng hạng nhất!` : iWon ? "🏆 Bạn chiến thắng!" : `🏆 ${names} chiến thắng!`}
      </p>
      <ol className="mt-3 grid gap-2">
        {standings(g.pub).map(({ uid, score, rank }) => (
          <li key={uid} className="flex items-center gap-2.5 text-[14.5px]">
            <span className="w-6 text-center font-display font-extrabold">{rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}</span>
            <b className="min-w-0 flex-1 truncate">{nameIn(view, uid)}</b>
            <span className="font-semibold text-ink-2 tabular-nums">{score} điểm</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Triển lãm: tranh các lượt đã lộ đáp án trong ván, chụp trên máy mình. */
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
