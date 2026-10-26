"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  BASIS,
  BASIS_MISSING,
  BASIS_PUBLIC,
  claimProofsOf,
  comboOf,
  COUNTDOWN_MS,
  fmtHalves,
  isNone,
  LETTERS,
  MAX_PLAYERS,
  MODE_KEYS,
  MODE_TOPICS,
  MODES,
  proofsOf,
  ROUND_HALVES,
  ROUNDS,
  TIMES,
  TOPICS,
  VERDICTS,
  type Answer,
  type Graded,
  type Topic,
} from "@/lib/games/citta-challenge";
import { GLOSSARY } from "@/lib/games/citta-challenge-glossary";
import type { RoomView } from "@/lib/net/room";
import type { CittaChallengeRoom, CtMatch, CtPast, CtView } from "@/lib/net/citta-challenge-room";
import { Avatar } from "../Avatar";
import { Dialog } from "../Dialog";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Crowd, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel } from "./People";
import { ResultCard, Standings, StoppedCard } from "./ResultCard";
import { RoomHeader, RoomLayout } from "./RoomLayout";
import { SeatButtons, seatMessage, StatusBar, StopButton, TONE } from "./StatusBar";
import { useGame, usePeople, useRoomState } from "./useRoom";

type View = Omit<RoomView<CtView>, "chat">;

function useTdView(session: CittaChallengeRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const CHEERS = ["🪷", "🌸", "✨", "🍃", "🌼"];
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

// Chỉ vẽ lại đúng một lần lúc vượt mốc (vd. mở đề), không theo nhịp đồng hồ.
function useReached(at: number | undefined) {
  // Vào phòng / tải lại khi đã qua mốc thì khỏi chờ một nhịp mới hiện.
  const [hit, setHit] = useState<number | undefined>(() => (at !== undefined && at <= Date.now() ? at : undefined));
  useEffect(() => {
    if (at === undefined) return;
    const t = setTimeout(() => setHit(at), Math.max(0, at - Date.now()));
    return () => clearTimeout(t);
  }, [at]);
  return at !== undefined && hit === at;
}

const isLive = (view: View) => view.meta!.status === "playing" && view.game?.match?.round === view.meta!.round;

function nameIn(view: View, uid: string) {
  if (uid === view.me) return "Bạn";
  return view.game?.match?.lineup.find((s) => s.seat.uid === uid)?.seat.member?.name ?? view.members.find((p) => p.uid === uid)?.name ?? "Ai đó";
}

// Thẻ được gọi theo ô đang bày ("Dữ kiện 1–4"), không theo chỉ số gốc trong đề.
const cardName = (g: CtMatch, card: number) => `Dữ kiện ${g.order.indexOf(card) + 1}`;

const basisLabel = (e: number, g: CtMatch) =>
  e === BASIS_PUBLIC || e === BASIS_MISSING ? `${BASIS[e].emoji} ${BASIS[e].name}` : e >= 0 ? `📄 ${cardName(g, e)} — ${g.de.cards[e].label}` : "—";

const pts = (h: number) => `${fmtHalves(h)} điểm`;

export function CittaChallengeTable({ id, slug, session }: { id: string; slug: string; session: CittaChallengeRoom }) {
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<CtChat session={session} />}>
      <CittaChallengeBody session={session} />
    </RoomLayout>
  );
}

const CtChat = memo(function CtChat({ session }: { session: CittaChallengeRoom }) {
  const answering = useGame(session, (v) => v?.match?.stage === "answer" || v?.match?.stage === "judge");
  const live = useRoomState(session, (r) => r.meta!.status === "playing");
  return <ChatPanel session={session} placeholder={live && answering ? "Chỉ hỏi cách thao tác — đừng gợi ý đáp án nhé 🤫" : undefined} />;
});

const CittaChallengeBody = memo(function CittaChallengeBody({ session }: { session: CittaChallengeRoom }) {
  const view = useTdView(session);
  const m = view.meta!;
  const { opts, match: g } = view.game!;
  const live = isLive(view);
  const [glossary, setGlossary] = useState(false);
  const count = useCountdown(live && g ? g.round : 0, { endsAt: g?.opensAt, ms: COUNTDOWN_MS, onMount: true });
  const won = g?.result?.reason === "points" && g.lineup.length > 1 && !!g.result.winners?.length;
  const end = useEndScene(won ? g!.round : 0, { ms: WIN_SCENE_MS, emojis: CHEERS });
  const shown = live && g ? g.opts : opts;

  return (
    <>
      <RoomHeader name={m.name} status={m.status} round={m.round} playing="đang tĩnh tâm">
        <span className="chip text-ink-2">
          {MODES[shown.mode].emoji} {MODES[shown.mode].name}
        </span>
        {live && g && (
          <span className="chip text-ink-2">
            🪷 Vòng {g.v + 1}/{ROUNDS}
          </span>
        )}
        <span className="chip text-ink-2">{shown.timer ? "⏱ Có giới hạn giờ" : "🍃 Không giới hạn giờ"}</span>
        <button type="button" className="btn btn-sm ml-auto" onClick={() => setGlossary(true)}>
          📖 Bảng kiến thức
        </button>
      </RoomHeader>

      <ActionBar view={view} session={session} />
      {!live && <Setup view={view} session={session} />}
      {g?.result && <Outcome view={view} match={g} />}

      <div className="relative mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        {g ? <Play key={g.round} view={view} session={session} match={g} /> : <Welcome view={view} />}
        {g && <Scoreboard view={view} match={g} />}
      </div>

      <Glossary open={glossary} onClose={() => setGlossary(false)} mode={shown.mode} />
      {g && count > 0 && <CountdownScene view={view} match={g} n={count} />}
      {g && end.shown && <WinScene view={view} match={g} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

function CountdownScene({ view, match: g, n }: { view: View; match: CtMatch; n: number }) {
  const people = g.lineup.map((s, i) => ({ uid: s.seat.uid, p: s.seat.member, name: nameIn(view, s.seat.uid), ring: "#e9b949", badge: `${i + 1}` }));
  const first = g.lineup[0]?.seat.uid;
  return (
    <CountdownCine
      tone="gold"
      eyebrow={`🪷 Tâm Đấu · ${MODES[g.opts.mode].name} · ${ROUNDS} vòng`}
      n={n}
      title={g.lineup.length > 1 ? (first === view.me ? "Bạn mở thẻ trước" : `${nameIn(view, first)} mở thẻ trước`) : "Thở một nhịp, đọc chậm thôi…"}
      tip="Chỉ kết luận theo dữ kiện đã mở — “Chưa đủ dữ kiện” cũng là một đáp án."
    >
      {g.lineup.length > 1 && <Crowd people={people} />}
    </CountdownCine>
  );
}

function WinScene({ view, match: g, onClose }: { view: View; match: CtMatch; onClose: () => void }) {
  const w = g.result?.winners ?? [];
  const top = g.rows?.[0];
  if (!w.length) return null;
  return (
    <WinCine
      trophy="🪷"
      winners={w.map((uid) => ({ uid, p: g.lineup.find((s) => s.seat.uid === uid)?.seat.member }))}
      title={w.length > 1 ? "Đồng hạng nhất!" : w[0] === view.me ? "Bạn về nhất!" : `${nameIn(view, w[0])} về nhất!`}
      onClose={onClose}
    >
      {top && (
        <p className="cine-score">
          {fmtHalves(top.halves)}/{ROUNDS * 5} điểm
        </p>
      )}
    </WinCine>
  );
}

function Timer({ deadline, total }: { deadline: number; total: number }) {
  const now = useNow(deadline > 0);
  const left = deadline && now ? Math.max(0, Math.min(1, (deadline - now) / total)) : 0;
  return (
    <div className="ct-timer" aria-hidden="true">
      <span style={{ width: `${left * 100}%`, background: left < 0.25 ? "var(--coral)" : "var(--ct-gold)" }} />
    </div>
  );
}

function ActionBar({ view, session }: { view: View; session: CittaChallengeRoom }) {
  const m = view.meta!;
  const g = view.game!.match;
  const live = isLive(view);
  const now = useNow(live && !!g?.deadline);
  const opened = useReached(g?.opensAt);

  if (live && g) {
    const secs = g.deadline && now ? Math.max(0, Math.ceil((g.deadline - now) / 1000)) : 0;
    const clock = g.deadline ? ` (${secs}s)` : "";
    const meIn = g.me >= 0;
    const banned = meIn && g.lineup[g.me].out;
    const waiting = g.lineup.filter((s) => !s.locked && !s.out && !s.away).length;
    let tone: string = TONE.idle;
    let message: React.ReactNode;
    if (!opened) {
      tone = TONE.hot;
      message = <>⏳ Chuẩn bị… mở đề ngay đây.</>;
    } else if (banned) {
      tone = TONE.alert;
      message = <>🚫 Bạn đã bị xử thua vì gian lận — ở lại xem mọi người chơi nhé.</>;
    } else if (g.stage === "pick") {
      const picker = g.lineup[g.picker]?.seat.uid;
      if (picker === view.me) {
        tone = TONE.turn;
        message = <>🃏 Tới lượt bạn mở thẻ — chọn một thẻ còn úp{clock}. Thẻ mở ra cả bàn cùng thấy.</>;
      } else
        message = (
          <>
            👀 <b>{nameIn(view, picker ?? "")}</b> đang chọn thẻ{clock}… Trong lúc chờ, đọc kỹ tình huống và câu hỏi nhé.
          </>
        );
    } else if (g.stage === "answer") {
      tone = meIn && !g.mine.la ? TONE.turn : TONE.idle;
      message = !meIn ? (
        <>✍️ Mọi người đang trả lời phần nhận diện{clock}…</>
      ) : g.mine.la ? (
        <>🔒 Bạn đã khoá — chờ {waiting} người nữa{clock}.</>
      ) : (
        <>
          ✍️ Chọn đáp án và căn cứ cho {g.de.items.length > 1 ? `cả ${g.de.items.length} mục` : "câu hỏi"}, rồi khoá lại{clock}.
        </>
      );
    } else if (g.stage === "judge") {
      tone = meIn && !g.mine.lj ? TONE.info : TONE.idle;
      message = !meIn ? (
        <>⚖️ Mọi người đang kiểm tra nhận định{clock}…</>
      ) : g.mine.lj ? (
        <>🔒 Bạn đã khoá — chờ {waiting} người nữa{clock}.</>
      ) : (
        <>⚖️ Nhận định dưới đây đúng hay sai ở đâu? Chọn đánh giá và căn cứ rồi khoá{clock}.</>
      );
    } else if (g.stage === "review") {
      const ready = g.lineup.filter((s) => !s.next && !s.out && !s.away).length;
      tone = TONE.hot;
      message =
        meIn && !g.mine.nx ? (
          <>📖 Đã chấm vòng {g.v + 1} — đọc lời giải thong thả, xong thì bấm “Tiếp tục”.</>
        ) : (
          <>
            📖 Đang đọc lời giải… chờ {ready} người bấm tiếp tục.
          </>
        );
    } else message = <>🪷 Hết {ROUNDS} vòng — đang tổng kết…</>;
    return (
      <StatusBar tone={tone} message={message}>
        {view.isHost && g.stage === "review" && (
          <button type="button" className="btn" onClick={() => session.skip()}>
            ⏭ {g.v >= ROUNDS - 1 ? "Tổng kết" : "Sang vòng sau"}
          </button>
        )}
        {view.isHost && <StopButton onConfirm={() => session.stop()} />}
      </StatusBar>
    );
  }
  const pool = view.game!.pool;
  const blocked = !m.players.length
    ? "Cần ít nhất một người vào ghế"
    : !view.seats.some((s) => s.online)
      ? "Người chơi đang mất kết nối"
      : pool === null
        ? "Đang tải bộ đề…"
        : pool < ROUNDS
          ? `Chủ đề đã chọn chưa đủ ${ROUNDS} đề — chọn thêm chủ đề`
          : "";
  return (
    <StatusBar
      message={seatMessage(view, {
        enough: m.players.length > 0,
        startHint: "Bấm “Bắt đầu” khi mọi người sẵn sàng — chơi một mình cũng được.",
        join: `Bấm “Vào chơi” để cùng giải đề — tối đa ${MAX_PLAYERS} người, chơi một mình cũng được.`,
      })}
    >
      <SeatButtons view={view} session={session} blocked={blocked} />
    </StatusBar>
  );
}

function Setup({ view, session }: { view: View; session: CittaChallengeRoom }) {
  const { opts, pool, used } = view.game!;
  const host = view.isHost;
  const t = TIMES[opts.mode];
  const toggle = (k: Topic) => {
    const on = opts.topics.includes(k);
    if (on && opts.topics.length === 1) return;
    session.setOptions({ topics: on ? opts.topics.filter((x) => x !== k) : [...opts.topics, k] });
  };
  return (
    <section className="card mt-4 grid gap-3 p-4" aria-label="Thiết lập ván tới">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Mode</span>
        {MODE_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`btn btn-sm ${opts.mode === k ? "btn-sun" : ""}`}
            aria-pressed={opts.mode === k}
            disabled={!host && opts.mode !== k}
            onClick={host ? () => session.setOptions({ mode: k }) : undefined}
            title={MODES[k].text}
          >
            {MODES[k].emoji} {MODES[k].name}
          </button>
        ))}
        <span className="text-[12.5px] font-semibold text-ink-3">
          {MODES[opts.mode].text} {MODES[opts.mode].items} mục nhận diện mỗi vòng · {MODES[opts.mode].minutes}.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Chủ đề</span>
        {MODE_TOPICS[opts.mode].map((k) => (
          <button
            key={k}
            type="button"
            className={`btn btn-sm ${opts.topics.includes(k) ? "btn-lime" : ""}`}
            aria-pressed={opts.topics.includes(k)}
            disabled={!host}
            onClick={host ? () => toggle(k) : undefined}
            title={TOPICS[k].about}
          >
            {TOPICS[k].emoji} {TOPICS[k].name}
          </button>
        ))}
        <span className="text-[12.5px] font-semibold text-ink-3">
          {pool === null ? "Đang tải bộ đề…" : `${pool} đề phù hợp · phòng đã chơi ${used} đề mode này`}
        </span>
        {host && used > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => session.resetUsed()}>
            ↺ Quên đề đã chơi
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Thời gian</span>
        {[false, true].map((on) => (
          <button
            key={String(on)}
            type="button"
            className={`btn btn-sm ${opts.timer === on ? "btn-sun" : ""}`}
            aria-pressed={opts.timer === on}
            disabled={!host && opts.timer !== on}
            onClick={host ? () => session.setOptions({ timer: on }) : undefined}
          >
            {on ? "⏱ Có giới hạn" : "🍃 Thong thả"}
          </button>
        ))}
        <span className="text-[12.5px] font-semibold text-ink-3">
          {opts.timer ? `Mở thẻ ${t.pick}s · nhận diện ${t.answer}s · nhận định ${t.judge}s; hết giờ tự khoá phần đã chọn.` : "Không giới hạn — nghĩ bao lâu cũng được."}
        </span>
      </div>
      <p className="text-[13.5px] text-ink-2">
        Mỗi ván {ROUNDS} vòng. Mỗi vòng cả bàn đọc chung một tình huống, mở chung 2 trong 4 thẻ dữ kiện (luân phiên người mở), rồi ai nấy tự trả lời kèm căn cứ và
        kiểm tra một nhận định. Chấm theo đúng thông tin đã mở — tối đa 5 điểm mỗi vòng. Được xem 📖 Bảng kiến thức bất cứ lúc nào.
        {!host && " Chủ phòng chọn mode, chủ đề và thời gian cho ván tới."}
      </p>
    </section>
  );
}

function Welcome({ view }: { view: View }) {
  const m = view.meta!;
  return (
    <div className="ct-welcome card grid place-items-center gap-3 p-8 text-center">
      <span className="ct-lotus" aria-hidden="true">
        🪷
      </span>
      <p className="font-display text-xl font-extrabold">{!m.players.length ? "Đang chờ người vào ghế…" : view.isHost ? "Sẵn sàng thì bấm “Bắt đầu” nhé" : "Đang chờ chủ phòng bắt đầu…"}</p>
      <p className="max-w-md text-[14px] text-ink-2">Điểm số chỉ phản ánh kết quả giải đề, không đánh giá phẩm chất hay mức tu tập của ai. Nhân vật trong đề đều là giả định.</p>
    </div>
  );
}

function Outcome({ view, match: g }: { view: View; match: CtMatch }) {
  const r = g.result!;
  if (r.reason === "cheat") return <StoppedCard round={g.round} sub={`Ván ${g.round} dừng — người chơi bị xử thua vì gian lận.`} />;
  if (r.reason !== "points") return <StoppedCard round={g.round} />;
  const rows = g.rows ?? [];
  const solo = g.lineup.length === 1;
  const mine = rows.find((x) => x.uid === view.me);
  const w = r.winners ?? [];
  const title = solo
    ? `🪷 Hoàn thành ${ROUNDS} vòng · ${fmtHalves(rows[0]?.halves ?? 0)}/${ROUNDS * 5} điểm`
    : w.length > 1
      ? `🤝 ${w.map((u) => nameIn(view, u)).join(", ")} đồng hạng nhất`
      : `🏆 ${nameIn(view, w[0] ?? "")} về nhất`;
  return (
    <ResultCard round={g.round} title={title} sub={!solo && mine ? `Bạn được ${fmtHalves(mine.halves)}/${ROUNDS * 5} điểm, ${mine.perfect} vòng trọn điểm.` : undefined}>
      {!solo && (
        <Standings
          rows={rows.map((x) => ({
            uid: x.uid,
            name: nameIn(view, x.uid),
            value: `${fmtHalves(x.halves)} điểm · ${x.perfect} vòng trọn`,
            rank: x.rank,
          }))}
        />
      )}
      <Summary view={view} match={g} uid={g.me >= 0 ? view.me : (rows[0]?.uid ?? "")} />
    </ResultCard>
  );
}

// Tổng kết cuối ván của một người: điểm từng vòng, khái niệm còn nhầm và lỗi lập luận hay gặp.
function Summary({ view, match: g, uid }: { view: View; match: CtMatch; uid: string }) {
  const marks = useMarks();
  if (!uid) return null;
  const rounds = g.past.filter((p) => p.graded[uid]);
  const confused = new Map<string, number>();
  const missed = new Map<number, number>();
  // Mục mà đáp án đúng là "Chưa đủ dữ kiện": trượt là do kết luận vượt dữ kiện, không phải nhầm khái niệm.
  let hasty = 0;
  for (const p of rounds) {
    if (!p.de) continue;
    const c = comboOf(p.cards);
    p.de.items.forEach((it, i) => {
      if (p.graded[uid].items[i].ok) return;
      if (isNone(it, it.key[c])) hasty++;
      else confused.set(it.options[it.key[c]], (confused.get(it.options[it.key[c]]) ?? 0) + 1);
    });
    if (!p.graded[uid].claim.ok) missed.set(p.de.verdicts[c], (missed.get(p.de.verdicts[c]) ?? 0) + 1);
  }
  const starred = rounds.filter((p) => p.de && marks.has(p.de.id));
  return (
    <div className="mt-4 grid gap-3 border-t-2 border-dashed border-rule pt-4">
      <p className="text-[13px] font-bold text-ink-3">{uid === view.me ? "Kết quả của bạn" : `Kết quả của ${nameIn(view, uid)}`}</p>
      <ol className="grid gap-1.5 sm:grid-cols-2">
        {rounds.map((p) => {
          const h = p.graded[uid].halves;
          return (
            <li key={p.v} className="flex items-center gap-2 text-[13.5px]">
              <span className={`ct-dot ${h === ROUND_HALVES ? "is-full" : h ? "is-part" : "is-zero"}`}>{fmtHalves(h)}</span>
              <span className="min-w-0 flex-1 truncate">
                <b>V{p.v + 1}</b> · {p.de?.title ?? p.de?.id ?? "…"}
              </span>
              {p.de && marks.has(p.de.id) && <span aria-label="Đã đánh dấu">⭐</span>}
            </li>
          );
        })}
      </ol>
      {confused.size > 0 && (
        <p className="text-[13.5px] text-ink-2">
          <b>🔁 Cần ôn:</b> {[...confused.keys()].join(" · ")}
        </p>
      )}
      {hasty > 0 && (
        <p className="text-[13.5px] text-ink-2">
          <b>🌫️ Kết luận khi chưa đủ dữ kiện:</b> {hasty} mục — thẻ đã mở chưa chứa bằng chứng thì “Chưa đủ dữ kiện” mới là đáp án.
        </p>
      )}
      {missed.size > 0 && (
        <p className="text-[13.5px] text-ink-2">
          <b>🧩 Nhận định hay trượt:</b>{" "}
          {[...missed.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([v, n]) => `${VERDICTS[v].emoji} ${VERDICTS[v].name}${n > 1 ? ` (${n} lần)` : ""}`)
            .join(" · ")}
        </p>
      )}
      {!confused.size && !missed.size && !hasty && rounds.length === ROUNDS && <p className="text-[13.5px] font-semibold text-ink-2">🌸 Không trượt mục nào — tâm sáng, mắt tinh!</p>}
      {starred.length > 0 && (
        <p className="text-[13.5px] text-ink-2">
          <b>⭐ Đã đánh dấu xem lại:</b> {starred.map((p) => `${p.de!.id} ${p.de!.title}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

// Đánh dấu đề muốn xem lại: chỉ lưu trên máy mình.
const MARK_KEY = "arena:citta-challenge:marks";
const markFns = new Set<() => void>();
let markCache: Set<string> | null = null;
function readMarks() {
  if (markCache) return markCache;
  try {
    markCache = new Set(JSON.parse(localStorage.getItem(MARK_KEY) ?? "[]") as string[]);
  } catch {
    markCache = new Set();
  }
  return markCache;
}
function toggleMark(id: string) {
  const next = new Set(readMarks());
  if (next.has(id)) next.delete(id);
  else next.add(id);
  markCache = next;
  try {
    localStorage.setItem(MARK_KEY, JSON.stringify([...next].slice(-200)));
  } catch {}
  markFns.forEach((f) => f());
}
function useMarks() {
  const [marks, setMarks] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const sync = () => setMarks(readMarks());
    sync();
    markFns.add(sync);
    return () => void markFns.delete(sync);
  }, []);
  return marks;
}

function Play({ view, session, match: g }: { view: View; session: CittaChallengeRoom; match: CtMatch }) {
  const live = isLive(view);
  const meIn = g.me >= 0 && !g.lineup[g.me].out;
  const opened = useReached(g.opensAt);
  const review = g.stage === "review" || g.stage === "done" || !!g.graded;
  const marks = useMarks();
  if (live && !opened) return <div className="ct-welcome card grid min-h-[320px] place-items-center p-8 font-display text-xl font-extrabold">🪷 Chuẩn bị đề…</div>;
  const myPick = live && meIn && g.stage === "pick" && g.lineup[g.picker]?.seat.uid === view.me;
  const editAns = live && meIn && g.stage === "answer" && !g.mine.la;
  const showClaim = g.stage === "judge" || review || (!live && !!g.verdicts);
  const editClaim = live && meIn && g.stage === "judge" && !g.mine.lj;
  const ready = g.mine.answers.every((x) => x.a >= 0 && x.e >= 0);
  const de = g.de;

  return (
    <div className="grid gap-4">
      {live && g.deadline > 0 && g.stage !== "review" && <Timer deadline={g.deadline} total={g.stageMs} />}
      <article className="ct-sheet card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ct-round">
            Vòng {g.v + 1}/{ROUNDS}
          </span>
          <span className="font-mono text-[12px] font-bold text-ink-3">{de.id}</span>
          {de.topics.map((t) => (
            <span key={t} className="rounded-lg bg-sunken px-2 py-0.5 text-[12px] font-bold text-ink-2">
              {TOPICS[t].emoji} {TOPICS[t].name}
            </span>
          ))}
          {review && (
            <button
              type="button"
              className={`btn btn-sm ml-auto ${marks.has(de.id) ? "btn-sun" : ""}`}
              aria-pressed={marks.has(de.id)}
              onClick={() => toggleMark(de.id)}
              title="Đánh dấu để xem lại ở phần tổng kết (chỉ lưu trên máy bạn)"
            >
              {marks.has(de.id) ? "⭐ Đã đánh dấu" : "☆ Đánh dấu xem lại"}
            </button>
          )}
        </div>
        <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight">{de.title}</h2>
        <p className="mt-0.5 text-[13px] font-semibold text-ink-3">{de.topic}</p>
        <p className="ct-story mt-3">{de.story}</p>
      </article>

      <section aria-label="Bốn thẻ dữ kiện">
        <p className="mb-2 text-[13px] font-bold text-ink-3">
          🃏 Bốn thẻ dữ kiện — cả bàn chỉ mở 2 thẻ{g.cards.length ? ` · đã mở ${g.cards.length}/2` : ""}
        </p>
        <div className="ct-cards">
          {g.order.map((i, slot) => {
            const c = de.cards[i];
            const open = g.cards.includes(i);
            const shown = open || review;
            const can = myPick && !open && g.mine.pick < 0;
            const pending = g.mine.pick === i && !open;
            return (
              <button
                key={i}
                type="button"
                className={`ct-card ${shown ? "is-open" : ""} ${review && !open ? "is-late" : ""} ${can ? "is-pickable" : ""} ${pending ? "is-pending" : ""}`}
                disabled={!can}
                onClick={() => session.pick(i)}
                aria-label={shown ? `Dữ kiện ${slot + 1} — ${c.label}: ${c.text}` : `Dữ kiện ${slot + 1} (đang úp)`}
              >
                <span className="ct-card-inner">
                  <span className="ct-card-back">
                    <span className="ct-card-lotus" aria-hidden="true">
                      🪷
                    </span>
                    <span className="ct-card-label">Dữ kiện {slot + 1}</span>
                    {pending && <span className="text-[12px] font-bold">Đang mở…</span>}
                  </span>
                  {/* Thẻ còn úp thì chưa dựng mặt sau: nội dung không nằm sẵn trong trang (Ctrl+F, bôi đen sẽ lộ). */}
                  <span className="ct-card-face">
                    {shown && (
                      <>
                        <span className="ct-card-tag">
                          Dữ kiện {slot + 1} · {c.label}
                          {review && !open && <em> · mở sau khi chấm</em>}
                        </span>
                        <span className="ct-card-text">{c.text}</span>
                      </>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="ct-sheet card grid gap-5 p-4 sm:p-5" aria-label="Phần nhận diện">
        <h3 className="font-display text-lg font-extrabold">✍️ Phần nhận diện</h3>
        {de.items.map((it, i) => (
          <ItemBlock key={i} view={view} session={session} match={g} i={i} edit={editAns} review={review} />
        ))}
        {editAns && (
          <button type="button" className="btn btn-pen justify-self-start" disabled={!ready} onClick={() => session.lockAnswers()}>
            🔒 Khoá câu trả lời
          </button>
        )}
        {live && meIn && g.stage === "answer" && g.mine.la && <p className="text-[13.5px] font-semibold text-ink-3">🔒 Đã khoá — câu trả lời của cả bàn sẽ hiện khi mọi người cùng khoá.</p>}
      </section>

      {showClaim && <ClaimBlock view={view} session={session} match={g} edit={editClaim} review={review} />}

      {review && live && meIn && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-pen btn-nudge" disabled={g.mine.nx} onClick={() => session.proceed()}>
            {g.mine.nx ? "✅ Đã sẵn sàng" : g.v >= ROUNDS - 1 ? "🪷 Xem tổng kết" : "➡️ Tiếp tục vòng sau"}
          </button>
          <span className="text-[13px] font-semibold text-ink-3">Thảo luận thoải mái trong khung chat — phản biện sau khi chấm không tính điểm.</span>
        </div>
      )}
    </div>
  );
}

// Ai đã chọn phương án / căn cứ này (chỉ hiện khi câu trả lời của cả bàn đã lộ).
function Pickers({ view, match: g, uids }: { view: View; match: CtMatch; uids: string[] }) {
  if (!uids.length || g.lineup.length < 2) return null;
  return (
    <span className="flex -space-x-1.5" aria-label={`Đã chọn: ${uids.map((u) => nameIn(view, u)).join(", ")}`}>
      {uids.map((u) => {
        const p = g.lineup.find((s) => s.seat.uid === u)?.seat.member;
        return p ? <Avatar key={u} p={p} size={22} className="ring-2 ring-[var(--surface)]" /> : null;
      })}
    </span>
  );
}

function BasisRow({
  view,
  match: g,
  value,
  onPick,
  edit,
  correct,
  chosenBy,
}: {
  view: View;
  match: CtMatch;
  value: number;
  onPick: (e: number) => void;
  edit: boolean;
  correct: number[] | null;
  chosenBy: (e: number) => string[];
}) {
  const options = [...[...g.cards].sort((a, b) => g.order.indexOf(a) - g.order.indexOf(b)), BASIS_PUBLIC, BASIS_MISSING];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12.5px] font-bold text-ink-3">Căn cứ:</span>
      {options.map((e) => {
        const on = value === e;
        const right = correct?.includes(e);
        return (
          <button
            key={e}
            type="button"
            className={`ct-basis ${on ? "is-on" : ""} ${correct ? (right ? "is-right" : on ? "is-wrong" : "") : ""}`}
            aria-pressed={on}
            disabled={!edit}
            onClick={() => onPick(e)}
          >
            {e === BASIS_PUBLIC || e === BASIS_MISSING ? `${BASIS[e].emoji} ${BASIS[e].name}` : `📄 ${cardName(g, e)} · ${g.de.cards[e].label}`}
            <Pickers view={view} match={g} uids={chosenBy(e)} />
          </button>
        );
      })}
    </div>
  );
}

function ItemBlock({ view, session, match: g, i, edit, review }: { view: View; session: CittaChallengeRoom; match: CtMatch; i: number; edit: boolean; review: boolean }) {
  const it = g.de.items[i];
  const mine = g.mine.answers[i];
  const c = g.cards.length >= 2 ? comboOf(g.cards) : -1;
  const right = review && c >= 0 ? it.key[c] : -1;
  const others = g.answers;
  const by = (f: (a: Answer) => boolean) => (others ? Object.entries(others).flatMap(([u, list]) => (list[i] && f(list[i]) ? [u] : [])) : []);
  const mark = review && g.graded && g.me >= 0 ? g.graded[view.me]?.items[i] : undefined;
  const value = g.me >= 0 ? mine : { a: -1, e: -1 };
  return (
    <div className="grid gap-2.5">
      <p className="font-bold">
        {g.de.items.length > 1 && <span className="mr-1.5 text-ink-3">M{i + 1}.</span>}
        {it.q}
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {it.options.map((o, k) => {
          const on = value.a === k;
          return (
            <button
              key={k}
              type="button"
              className={`ct-opt ${on ? "is-on" : ""} ${right >= 0 ? (k === right ? "is-right" : on ? "is-wrong" : "") : ""} ${isNone(it, k) ? "is-none" : ""}`}
              aria-pressed={on}
              disabled={!edit}
              onClick={() => session.setAnswer(i, { a: k })}
            >
              <span className="ct-opt-letter">{LETTERS[k]}</span>
              <span className="min-w-0 flex-1">{o}</span>
              <Pickers view={view} match={g} uids={by((a) => a.a === k)} />
            </button>
          );
        })}
      </div>
      {g.cards.length >= 2 && (
        <BasisRow
          view={view}
          match={g}
          value={value.e}
          edit={edit}
          onPick={(e) => session.setAnswer(i, { e })}
          correct={review ? proofsOf(it, g.cards) : null}
          chosenBy={(e) => by((a) => a.e === e)}
        />
      )}
      {mark && <MarkLine mark={mark} full={g.opts.mode === "nm" ? 6 : g.opts.mode === "ud" ? 3 : 2} />}
      {review && c >= 0 && (
        <div className="ct-explain">
          <p>
            <b>Theo 2 thẻ đã mở:</b> {it.options[it.key[c]]}
            {isNone(it, it.key[c]) ? ` — ${it.missing}` : ""}
          </p>
          <p>
            <b>Khi biết đủ 4 thẻ:</b> {it.options[it.full]}. {it.why}
          </p>
          <p>
            <b>Bằng chứng:</b> {it.proof.length ? it.proof.map((t) => cardName(g, t)).join(" hoặc ") : "câu chuyện công khai và bảng kiến thức"}. {it.ground}
          </p>
        </div>
      )}
    </div>
  );
}

function MarkLine({ mark, full }: { mark: Graded["claim"]; full: number }) {
  const text = !mark.ok ? "Chưa đúng đáp án" : mark.proof ? "Đúng cả đáp án và căn cứ" : "Đúng đáp án, căn cứ chưa đúng";
  return (
    <p className={`ct-mark ${mark.ok ? (mark.halves === full ? "is-full" : "is-part") : "is-zero"}`}>
      {mark.ok ? (mark.proof ? "🌸" : "🌗") : "🍂"} {text} · +{pts(mark.halves)}
    </p>
  );
}

function ClaimBlock({ view, session, match: g, edit, review }: { view: View; session: CittaChallengeRoom; match: CtMatch; edit: boolean; review: boolean }) {
  const de = g.de;
  const c = g.cards.length >= 2 ? comboOf(g.cards) : -1;
  const right = review && c >= 0 ? de.verdicts[c] : -1;
  const mine = g.me >= 0 ? g.mine.verdict : { v: -1, e: -1 };
  const vs = g.verdicts;
  const by = (f: (v: { v: number; e: number }) => boolean) => (vs ? Object.entries(vs).flatMap(([u, x]) => (f(x) ? [u] : [])) : []);
  const mark = review && g.graded && g.me >= 0 ? g.graded[view.me]?.claim : undefined;
  return (
    <section className="ct-sheet card grid gap-3 p-4 sm:p-5" aria-label="Kiểm tra nhận định">
      <h3 className="font-display text-lg font-extrabold">⚖️ Kiểm tra nhận định</h3>
      <blockquote className="ct-claim">“{de.claim}”</blockquote>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {VERDICTS.map((x, k) => {
          const on = mine.v === k;
          return (
            <button
              key={k}
              type="button"
              className={`ct-opt ${on ? "is-on" : ""} ${right >= 0 ? (k === right ? "is-right" : on ? "is-wrong" : "") : ""}`}
              aria-pressed={on}
              disabled={!edit}
              onClick={() => session.setVerdict({ v: k })}
            >
              <span className="ct-opt-letter">{x.emoji}</span>
              <span className="min-w-0 flex-1">
                <b className="block">{x.name}</b>
                <span className="text-[12.5px] text-ink-3">{x.text}</span>
              </span>
              <Pickers view={view} match={g} uids={by((v) => v.v === k)} />
            </button>
          );
        })}
      </div>
      <BasisRow
        view={view}
        match={g}
        value={mine.e}
        edit={edit}
        onPick={(e) => session.setVerdict({ e })}
        correct={review ? claimProofsOf(de, g.cards) : null}
        chosenBy={(e) => by((v) => v.e === e)}
      />
      {edit && (
        <button type="button" className="btn btn-pen justify-self-start" disabled={mine.v < 0 || mine.e < 0} onClick={() => session.lockVerdict()}>
          🔒 Khoá đánh giá
        </button>
      )}
      {mark && <MarkLine mark={mark} full={4} />}
      {review && c >= 0 && (
        <div className="ct-explain">
          <p>
            <b>Đánh giá đúng:</b> {VERDICTS[de.verdicts[c]].emoji} {VERDICTS[de.verdicts[c]].name}
            {g.me >= 0 && mine.e >= 0 && <> · bạn chọn căn cứ {basisLabel(mine.e, g)}</>}
          </p>
          <p>
            <b>Lý do:</b> {de.reason}
          </p>
          {de.note && (
            <p>
              <b>Lưu ý phân biệt:</b> {de.note}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Scoreboard({ view, match: g }: { view: View; match: CtMatch }) {
  const live = isLive(view);
  return (
    <section className="card p-4" aria-labelledby="ct-score-h">
      <h2 id="ct-score-h" className="font-display text-lg font-extrabold">
        🪷 Bàn tĩnh tâm
      </h2>
      <p className="text-[12.5px] font-semibold text-ink-3">
        {g.lineup.length} người · thứ tự mở thẻ theo chỗ ngồi · tối đa {ROUNDS * 5} điểm
      </p>
      <ol className="mt-3 grid gap-2">
        {g.lineup.map((s, k) => {
          const p = s.seat.member;
          const picking = live && g.picker === k;
          const status = s.out
            ? "🚫 Bị xử thua"
            : s.away
              ? "📡 Đang mất kết nối"
              : !live
                ? ""
                : picking
                  ? "🃏 Đang chọn thẻ"
                  : g.stage === "answer" || g.stage === "judge"
                    ? s.locked
                      ? "🔒 Đã khoá"
                      : "✍️ Đang suy nghĩ"
                    : g.stage === "review"
                      ? s.next
                        ? "✅ Sẵn sàng"
                        : "📖 Đang đọc lời giải"
                      : "";
          return (
            <li key={s.seat.uid} className={`ct-player ${picking ? "is-turn" : ""} ${s.out ? "is-out" : ""}`}>
              <span className="w-4 shrink-0 text-center text-[12px] font-extrabold text-ink-3">{k + 1}</span>
              {p ? <Avatar p={p} size={32} className={s.seat.online && !s.out ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[32px] w-[32px] bg-sunken" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold">{s.seat.uid === view.me ? "Bạn" : (p?.name ?? "Ai đó")}</p>
                <p className="truncate text-[11.5px] font-semibold text-ink-3">{status}</p>
                <div className="mt-1 flex gap-1" aria-label="Điểm từng vòng">
                  {Array.from({ length: ROUNDS }, (_, v) => {
                    const h = s.rounds[v];
                    return (
                      <span
                        key={v}
                        className={`ct-pip ${h == null ? (v === g.v && live ? "is-now" : "") : h === ROUND_HALVES ? "is-full" : h ? "is-part" : "is-zero"}`}
                        title={h == null ? `Vòng ${v + 1}` : `Vòng ${v + 1}: ${pts(h)}`}
                      />
                    );
                  })}
                </div>
              </div>
              <span className="shrink-0 text-right">
                <span className="block font-display text-2xl leading-none font-extrabold tabular-nums">{fmtHalves(s.halves)}</span>
                <span className="text-[10.5px] font-bold text-ink-3">điểm</span>
              </span>
            </li>
          );
        })}
      </ol>
      {g.past.length > 0 && <PastList view={view} past={g.past} />}
    </section>
  );
}

function PastList({ view, past }: { view: View; past: CtPast[] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[13px] font-bold text-ink-2">Các vòng đã qua</summary>
      <ol className="mt-2 grid gap-1 text-[12.5px]">
        {past.map((p) => (
          <li key={p.v} className="flex gap-2">
            <b className="shrink-0">V{p.v + 1}</b>
            <span className="min-w-0 flex-1 truncate text-ink-2">{p.de?.title ?? "…"}</span>
            {view.me in p.graded && <span className="shrink-0 font-bold tabular-nums">{fmtHalves(p.graded[view.me].halves)}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

function Glossary({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: keyof typeof MODES }) {
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<Topic | "all">("all");
  const list = useMemo(() => {
    const k = norm(q.trim());
    return GLOSSARY.filter((t) => (topic === "all" || t.topic === topic) && (!k || norm(`${t.term} ${t.group} ${t.trait} ${t.plain ?? ""}`).includes(k)));
  }, [q, topic]);
  return (
    <Dialog open={open} onClose={onClose} title="📖 Bảng kiến thức" className="is-wide">
      <div className="grid gap-3">
        <input className="field" placeholder="Tìm khái niệm, tên Pāli…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm khái niệm" />
        <div className="flex flex-wrap gap-1.5">
          {(["all", "tt", "bt", "th"] as const).map((k) => (
            <button key={k} type="button" className={`btn btn-sm ${topic === k ? "btn-sun" : ""}`} aria-pressed={topic === k} onClick={() => setTopic(k)}>
              {k === "all" ? "Tất cả" : `${TOPICS[k].emoji} ${TOPICS[k].name}`}
            </button>
          ))}
        </div>
        <details className="rounded-xl bg-sunken p-3 text-[13.5px] text-ink-2">
          <summary className="cursor-pointer font-bold text-ink">Quy tắc đọc dữ kiện</summary>
          <ul className="mt-2 grid list-disc gap-1 pl-5">
            <li>Chỉ kết luận theo thẻ đã mở và câu chuyện công khai; không thêm động cơ hay tình tiết ngoài đề.</li>
            <li>Hành động bên ngoài không tự chứng minh trạng thái tâm bên trong.</li>
            <li>Mốc A và mốc B là hai đơn vị phân tích riêng: biết mốc này không suy ra mốc kia.</li>
            <li>Thẻ nói về mốc khác, nhân vật khác là dữ kiện gây nhiễu.</li>
            <li>Thiếu thẻ chứa bằng chứng thì chọn “Chưa đủ dữ kiện” với căn cứ “Còn thiếu thông tin”.</li>
            <li>Chuyên sâu: phân biệt “có thể tương ưng”, “bắt buộc có” và “được dữ kiện chứng minh đang có”.</li>
          </ul>
        </details>
        <ul className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1">
          {list.map((t) => (
            <li key={t.term} className="rounded-xl border-2 border-rule p-3">
              <p className="font-bold">
                {TOPICS[t.topic].emoji} {t.term}
              </p>
              <p className="text-[12.5px] font-semibold text-ink-3">{t.group}</p>
              <p className="mt-1 text-[13.5px]">{t.plain ?? t.trait}</p>
              {t.plain && t.plain !== t.trait && <p className="text-[13px] text-ink-2">Đặc tính: {t.trait}</p>}
              {mode !== "nm" && t.note && <p className="mt-1 text-[12.5px] text-ink-3">💡 {t.note}</p>}
            </li>
          ))}
          {!list.length && <li className="p-3 text-center text-[13.5px] text-ink-3">Không tìm thấy khái niệm nào.</li>}
        </ul>
        <p className="text-[12px] text-ink-3">
          Biên soạn theo Abhidhammattha-saṅgaha chương I–III, diễn đạt lại bằng tiếng Việt; thuật ngữ có thể khác giữa các bản dịch, tên Pāli dùng để đối chiếu. Bộ đề phục vụ ôn
          học, chưa qua thẩm định giáo lý độc lập.
        </p>
      </div>
    </Dialog>
  );
}
