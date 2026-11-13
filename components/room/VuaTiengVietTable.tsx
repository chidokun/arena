"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { BANK_VERSION } from "@/lib/games/vua-tieng-viet-bank";
import {
  adjacent,
  clueAnswers,
  COUNT_MAX,
  COUNTDOWN_MS,
  CROWN,
  fmtPts,
  GRID_GOAL,
  GRID_WORD,
  gridFinds,
  HINT_AT,
  introMs,
  limitNote,
  limitSpan,
  itemOf,
  LETTERS,
  lettersOf,
  LEVEL_KEYS,
  LEVELS,
  MAX_PLAYERS,
  maxScore,
  optionOrder,
  PACK_KEYS,
  PACKS,
  ROUNDS,
  TB,
  TIEBREAK,
  TIER_NAMES,
  tokensOf,
  TOPIC_KEYS,
  TOPICS,
  type Counts,
  type Item,
  type Mark,
  type Sub,
  type VtOptions,
} from "@/lib/games/vua-tieng-viet";
import type { RoomView } from "@/lib/net/room";
import type { VtMatch, VtPast, VtView, VuaTiengVietRoom } from "@/lib/net/vua-tieng-viet-room";
import { Avatar } from "../Avatar";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Crowd, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel } from "./People";
import { ResultCard, StoppedCard } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout } from "./RoomLayout";
import { SeatButtons, seatMessage, StatusBar, StopButton, TONE } from "./StatusBar";
import { useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

type View = Omit<RoomView<VtView>, "chat">;

const base = process.env.BASE_PATH ?? "";
const LOGO = `${base}/vua-tieng-viet/logo.webp`;
const CHEERS = ["👑", "✨", "🎉", "📜", "⭐"];
const ROUND_TONES = ["sky", "teal", "cream", "coral", "gold", "gold"] as const;

function useVtView(session: VuaTiengVietRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

function useNow(active: boolean, every = 200) {
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

// Chỉ vẽ lại đúng một lần lúc vượt mốc (vd. mở bàn), không theo nhịp đồng hồ.
function useReached(at: number | undefined) {
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

const roundLabel = (r: number) => (r === TB ? `${TIEBREAK.emoji} ${TIEBREAK.name}` : `${ROUNDS[r].emoji} Vòng ${r + 1} · ${ROUNDS[r].name}`);
const packLabel = (o: VtOptions) => `${PACKS[o.pack].emoji} ${PACKS[o.pack].name}${o.pack === "custom" ? ` (${o.counts.join(" · ")})` : ""}`;
const locked = (g: VtMatch) => !!g.mine.sub || !!g.mine.draft?.lk;

const upper = (s: string) => s.toLocaleUpperCase("vi");

/** Chuỗi người chơi ghép (chỉ số thẻ chữ, -1 là khoảng trắng). */
const spellOf = (letters: string[], a: number[]) => upper(a.map((i) => (i === -1 ? " " : (letters[i] ?? ""))).join("").replace(/ +/g, " ").trim());

/** Đáp án chuẩn dạng chữ (để công bố, xem lại, báo lỗi). */
function answerText(item: Item) {
  if (item.kind === "scramble") return upper(item.a);
  if (item.kind === "mc") return item.o[0];
  if (item.kind === "clue") return item.a;
  if (item.kind === "order") return item.text;
  return item.words.join(" · ");
}

function promptText(item: Item) {
  if (item.kind === "scramble") return `Ghép ${lettersOf(item.a).length} chữ cái · ${TIER_NAMES[item.lv]}`;
  if (item.kind === "mc") return item.q;
  if (item.kind === "clue") return item.h[0];
  if (item.kind === "order") return `Xếp thẻ: ${tokensOf(item).join(" | ")}`;
  return `Lưới chủ đề “${item.theme}”`;
}

/** Câu trả lời của một người, dạng chữ ngắn. */
function subText(item: Item, sub: Sub | undefined, order: number[]) {
  if (!sub) return "—";
  if (item.kind === "scramble") return Array.isArray(sub.a) && sub.a.some((i) => i >= 0) ? spellOf(lettersOf(item.a), sub.a) : "Không xác nhận";
  if (item.kind === "mc") return typeof sub.a === "number" ? `${LETTERS[order.indexOf(sub.a)]}. ${item.o[sub.a]}` : "Không trả lời";
  if (item.kind === "clue") return typeof sub.a === "string" && sub.a.trim() ? `“${sub.a.trim()}”` : "Không trả lời";
  if (item.kind === "order") {
    const tokens = tokensOf(item);
    return Array.isArray(sub.a) && sub.a.length ? sub.a.map((i) => tokens[i]).join(" ") : "Không xác nhận";
  }
  const found = gridFinds(item, sub.f);
  return found.length ? found.map((x) => x.w).join(", ") : "Chưa tìm được từ nào";
}

const secs = (ms: number) => `${(ms / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}s`;

export function VuaTiengVietTable({ id, slug, session }: { id: string; slug: string; session: VuaTiengVietRoom }) {
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<VtChat session={session} />}>
      <VtBody session={session} />
    </RoomLayout>
  );
}

const VtChat = memo(function VtChat({ session }: { session: VuaTiengVietRoom }) {
  const asking = useGame(session, (v) => v?.match?.stage === "ask");
  const live = useRoomState(session, (r) => r.meta!.status === "playing");
  return <ChatPanel session={session} placeholder={live && asking ? "Đừng nhắc bài nhé 🤫" : undefined} />;
});

const VtBody = memo(function VtBody({ session }: { session: VuaTiengVietRoom }) {
  const view = useVtView(session);
  const m = view.meta!;
  const { opts, match: g } = view.game!;
  const live = isLive(view);
  const areaRef = useRef<HTMLDivElement>(null);
  const count = useCountdown(live && g ? g.round : 0, { endsAt: g?.opensAt, ms: COUNTDOWN_MS, onMount: true });
  const won = g?.result?.reason === "points" && g.lineup.length > 1 && !!g.result.winners?.length;
  const end = useEndScene(won ? g!.round : 0, { ms: 6500, emojis: CHEERS });
  const shown = live && g ? g.opts : opts;
  const opened = useReached(live ? g?.opensAt : undefined);
  const sceneKey = live && g && opened && g.stage === "intro" ? `${g.round}:${g.i}` : "";
  const [hidden, setHidden] = useState("");

  return (
    <div className="vt-root">
      <RoomHeader name={m.name} status={m.status} round={m.round} playing="đang tranh ngôi">
        <span className="chip text-ink-2">{packLabel(shown)}</span>
        <span className="chip text-ink-2">
          {LEVELS[shown.level].emoji} {LEVELS[shown.level].name}
        </span>
        <span className="chip text-ink-2">
          {TOPICS[shown.topic].emoji} {TOPICS[shown.topic].name}
        </span>
      </RoomHeader>

      <ActionBar view={view} session={session} />
      {!live && <Setup view={view} session={session} />}
      {g?.result && <Outcome view={view} match={g} />}

      <div ref={areaRef} className="relative mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
        {g ? <Stage key={g.round} view={view} session={session} match={g} /> : <Welcome view={view} />}
        {g && <Scoreboard view={view} match={g} />}
      </div>

      {g && count > 0 && <CountdownScene view={view} match={g} n={count} />}
      {g && sceneKey && hidden !== sceneKey && count === 0 && <RoundScene key={sceneKey} view={view} session={session} match={g} onClose={() => setHidden(sceneKey)} />}
      {g && end.shown && <WinScene view={view} match={g} onClose={end.close} />}
      <Party bits={end.party} />
      <StickerFlyers session={session} areaRef={areaRef} />
    </div>
  );
});

const StickerFlyers = memo(function StickerFlyers({ session, areaRef }: { session: VuaTiengVietRoom; areaRef: React.RefObject<HTMLDivElement | null> }) {
  const flyers = useFlyers(session, areaRef);
  if (!flyers.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
      <Flyers flyers={flyers} />
    </div>
  );
});

function CountdownScene({ view, match: g, n }: { view: View; match: VtMatch; n: number }) {
  const people = g.lineup.map((s) => ({ uid: s.seat.uid, p: s.seat.member, name: nameIn(view, s.seat.uid), ring: "#f4b71c" }));
  return (
    <CountdownCine
      tone="gold"
      eyebrow={`👑 Vua Tiếng Việt · ${PACKS[g.opts.pack].name} · ${g.total} câu`}
      n={n}
      title={g.lineup.length > 1 ? "Sẵn sàng tranh ngôi!" : "Luyện tập — cố lên nhé!"}
      tip="Đúng và nhanh thì nhiều điểm — câu sai không bị trừ."
    >
      {g.lineup.length > 1 && <Crowd people={people} />}
    </CountdownCine>
  );
}

function WinScene({ view, match: g, onClose }: { view: View; match: VtMatch; onClose: () => void }) {
  const w = g.result?.winners ?? [];
  const top = g.rows?.[0];
  if (!w.length) return null;
  return (
    <WinCine
      trophy="👑"
      winners={w.map((uid) => ({ uid, p: g.lineup.find((s) => s.seat.uid === uid)?.seat.member }))}
      title={w.length > 1 ? "Đồng Vua Tiếng Việt!" : w[0] === view.me ? "Bạn là Vua Tiếng Việt!" : `${nameIn(view, w[0])} lên ngôi!`}
      onClose={onClose}
    >
      {top && <p className="cine-score">{fmtPts(top.total)} điểm</p>}
    </WinCine>
  );
}

// ——— Thanh trạng thái ———

function ActionBar({ view, session }: { view: View; session: VuaTiengVietRoom }) {
  const m = view.meta!;
  const g = view.game!.match;
  const live = isLive(view);
  const now = useNow(live && g?.stage === "ask", 500);
  const opened = useReached(g?.opensAt);

  if (live && g) {
    const left = g.deadline && now ? Math.max(0, Math.ceil((g.deadline - now) / 1000)) : 0;
    const clock = g.deadline ? ` (${left}s)` : "";
    const banned = g.me >= 0 && g.lineup[g.me].out;
    const waiting = g.lineup.filter((s) => s.on && !s.locked && !s.out && !s.away).length;
    const tbNames = (g.tbs[g.tbs.length - 1] ?? []).map((u) => nameIn(view, u)).join(", ");
    let tone: string = TONE.idle;
    let message: React.ReactNode;
    if (!opened) {
      tone = TONE.hot;
      message = <>⏳ Chuẩn bị… câu hỏi đầu tiên ngay đây.</>;
    } else if (banned) {
      tone = TONE.alert;
      message = <>🚫 Bạn đã bị xử thua vì gian lận — ở lại xem mọi người chơi nhé.</>;
    } else if (g.stage === "intro") {
      tone = TONE.hot;
      message = g.r === TB ? <>⚔️ Hoà điểm ở ngôi đầu — {tbNames} bước vào câu hỏi phụ!</> : <>📣 {roundLabel(g.r)} sắp bắt đầu…</>;
    } else if (g.stage === "ask") {
      if (!g.playing) {
        message = g.r === TB ? <>⚔️ Câu hỏi phụ giữa {tbNames}{clock}…</> : <>👀 Mọi người đang trả lời{clock}…</>;
      } else if (locked(g)) {
        message = waiting ? <>🔒 Đã chốt — chờ {waiting} người nữa{clock}.</> : <>🔒 Đã chốt — đang công bố đáp án…</>;
      } else {
        tone = TONE.turn;
        message = <>✍️ Trả lời đi!{clock}</>;
      }
    } else if (g.stage === "reveal") {
      tone = TONE.info;
      const ready = g.lineup.filter((s) => s.on && !s.next && !s.out && !s.away).length;
      message = g.solo ? (
        <>📖 Đọc đáp án thong thả — xong thì bấm “Câu tiếp”.</>
      ) : (
        <>📖 Đáp án đã công bố{ready ? ` · chờ ${ready} người đọc xong` : ""}.</>
      );
    } else message = <>👑 Hết câu — đang tổng kết…</>;
    return (
      <StatusBar tone={tone} message={message}>
        {view.isHost && (g.stage === "intro" || (g.stage === "reveal" && !g.solo)) && (
          <button type="button" className="btn" onClick={() => session.skip()}>
            ⏭ {g.stage === "intro" ? "Bỏ qua" : "Câu tiếp"}
          </button>
        )}
        {view.isHost && <StopButton onConfirm={() => session.stop()} />}
      </StatusBar>
    );
  }
  const blocked = !m.players.length ? "Cần ít nhất một người vào ghế" : !view.seats.some((s) => s.online) ? "Người chơi đang mất kết nối" : "";
  return (
    <StatusBar
      message={seatMessage(view, {
        enough: m.players.length > 0,
        startHint: m.players.length > 1 ? "Bấm “Bắt đầu” khi mọi người sẵn sàng." : "Bấm “Bắt đầu” để luyện tập một mình, hoặc chờ thêm bạn.",
        join: `Bấm “Vào chơi” để tranh ngôi — tối đa ${m.seats || MAX_PLAYERS} người, chơi một mình cũng được.`,
      })}
    >
      <SeatButtons view={view} session={session} blocked={blocked} />
    </StatusBar>
  );
}

// ——— Thiết lập ván tới ———

function Setup({ view, session }: { view: View; session: VuaTiengVietRoom }) {
  const { opts, used } = view.game!;
  const host = view.isHost;
  const setCount = (r: number, d: number) => {
    const counts = [...opts.counts] as Counts;
    counts[r] = Math.min(COUNT_MAX[r], Math.max(1, counts[r] + d));
    session.setOptions({ counts });
  };
  return (
    <section className="card mt-4 grid gap-3 p-4" aria-label="Thiết lập ván tới">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Gói</span>
        {PACK_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`btn btn-sm ${opts.pack === k ? "btn-sun" : ""}`}
            aria-pressed={opts.pack === k}
            disabled={!host && opts.pack !== k}
            onClick={host ? () => session.setOptions({ pack: k, counts: k === "custom" ? opts.counts : undefined }) : undefined}
          >
            {PACKS[k].emoji} {PACKS[k].name}
          </button>
        ))}
        <span className="text-[12.5px] font-semibold text-ink-3">
          {opts.counts.join(" · ")} câu · {PACKS[opts.pack].minutes} · tối đa {fmtPts(maxScore(opts.counts))} điểm
        </span>
      </div>
      {opts.pack === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-[86px] text-[13px] font-bold text-ink-3">Số câu</span>
          {ROUNDS.map((rd, r) => (
            <span key={r} className="vt-stepper">
              <span className="text-[12.5px] font-bold">
                {rd.emoji} {rd.name}
              </span>
              <button type="button" className="btn btn-sm !px-2" disabled={!host || opts.counts[r] <= 1} onClick={() => setCount(r, -1)} aria-label={`Bớt một câu vòng ${rd.name}`}>
                −
              </button>
              <b className="w-5 text-center tabular-nums">{opts.counts[r]}</b>
              <button
                type="button"
                className="btn btn-sm !px-2"
                disabled={!host || opts.counts[r] >= COUNT_MAX[r]}
                onClick={() => setCount(r, 1)}
                aria-label={`Thêm một câu vòng ${rd.name}`}
              >
                +
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Độ khó</span>
        {LEVEL_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`btn btn-sm ${opts.level === k ? "btn-sun" : ""}`}
            aria-pressed={opts.level === k}
            disabled={!host && opts.level !== k}
            onClick={host ? () => session.setOptions({ level: k }) : undefined}
          >
            {LEVELS[k].emoji} {LEVELS[k].name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Chủ đề</span>
        {TOPIC_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`btn btn-sm ${opts.topic === k ? "btn-lime" : ""}`}
            aria-pressed={opts.topic === k}
            disabled={!host && opts.topic !== k}
            onClick={host ? () => session.setOptions({ topic: k }) : undefined}
          >
            {TOPICS[k].emoji} {TOPICS[k].name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Giải thích</span>
        {[true, false].map((on) => (
          <button
            key={String(on)}
            type="button"
            className={`btn btn-sm ${opts.explain === on ? "btn-sun" : ""}`}
            aria-pressed={opts.explain === on}
            disabled={!host && opts.explain !== on}
            onClick={host ? () => session.setOptions({ explain: on }) : undefined}
          >
            {on ? "📖 Hiện sau mỗi câu" : "⏩ Chỉ hiện đáp án"}
          </button>
        ))}
        <span className="text-[12.5px] font-semibold text-ink-3">Phòng đã chơi {used} câu — ván mới ưu tiên câu chưa gặp.</span>
        {host && used > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => session.resetUsed()}>
            ↺ Quên câu đã chơi
          </button>
        )}
      </div>
      <p className="text-[13.5px] text-ink-2">
        Năm vòng:{" "}
        {ROUNDS.map((x, r) => {
          const [lo, hi] = limitSpan(r);
          return `${x.emoji} ${x.name} (${lo === hi ? lo : `${lo}–${hi}`}s${r ? "" : "/câu"})`;
        }).join(" → ")}
        ; câu càng khó càng nhiều giờ. Đúng và nhanh thì nhiều điểm, sai không bị trừ; hoà ngôi đầu thì đấu câu hỏi phụ.{!host && " Chủ phòng chọn gói, độ khó và chủ đề cho ván tới."}
      </p>
    </section>
  );
}

function Welcome({ view }: { view: View }) {
  const m = view.meta!;
  return (
    <div className="vt-welcome card grid place-items-center gap-4 p-6 text-center sm:p-8 xl:col-span-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- site xuất tĩnh, ảnh đã thu nhỏ sẵn */}
      <img src={LOGO} alt="Vua Tiếng Việt" width={260} height={205} className="vt-logo" draggable={false} />
      <p className="font-display text-xl font-extrabold">{!m.players.length ? "Đang chờ người vào ghế…" : view.isHost ? "Sẵn sàng thì bấm “Bắt đầu” nhé" : "Đang chờ chủ phòng bắt đầu…"}</p>
      <ol className="vt-rounds">
        {ROUNDS.map((rd, r) => (
          <li key={r} className={`vt-round-card is-${ROUND_TONES[r]}`}>
            <span className="vt-round-num">{r + 1}</span>
            <b>
              {rd.emoji} {rd.name}
            </b>
            <span>{rd.about}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ——— Bàn chơi ———

function Stage({ view, session, match: g }: { view: View; session: VuaTiengVietRoom; match: VtMatch }) {
  const live = isLive(view);
  const opened = useReached(g.opensAt);
  if (live && !opened)
    return (
      <div className="vt-welcome card grid min-h-[320px] place-items-center p-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- site xuất tĩnh */}
        <img src={LOGO} alt="" width={200} height={158} className="vt-logo" draggable={false} />
      </div>
    );
  if (!live || g.stage === "done") return <Review view={view} match={g} />;
  if (g.stage === "intro") return <RoundIntro match={g} />;
  return <QuestionCard key={g.i} view={view} session={session} match={g} />;
}

function RoundIntro({ match: g }: { match: VtMatch }) {
  const tb = g.r === TB;
  return (
    <div className={`vt-intro card is-${ROUND_TONES[g.r]}`} role="status">
      <span className="vt-intro-emoji" aria-hidden="true">
        {tb ? TIEBREAK.emoji : ROUNDS[g.r].emoji}
      </span>
      <p className="vt-intro-eyebrow">{tb ? "Hoà điểm ở ngôi đầu" : `Vòng ${g.r + 1} / ${ROUNDS.length} · ${g.n} ${g.r === CROWN ? "thử thách" : "câu"}`}</p>
      <h2 className="vt-intro-title">{tb ? TIEBREAK.name : ROUNDS[g.r].name}</h2>
      <p className="vt-intro-about">{tb ? "Một câu trắc nghiệm khó, 15 giây — tối đa 3 câu." : ROUNDS[g.r].about}</p>
      <p className="vt-intro-rule">{tb ? TIEBREAK.rule : ROUNDS[g.r].rule}</p>
      {!tb && <p className="vt-intro-rule">⏱️ {limitNote(g.r)}</p>}
    </div>
  );
}

/** Màn giới thiệu vòng toàn màn hình: lộ trình 5 vòng, luật vòng mới và bảng xếp hạng sau vòng vừa xong. Bấm để ẩn riêng máy mình. */
function RoundScene({ view, session, match: g, onClose }: { view: View; session: VuaTiengVietRoom; match: VtMatch; onClose: () => void }) {
  const tb = g.r === TB;
  const ms = introMs(g.r);
  const now = useNow(g.introAt > 0, 200);
  const left = g.introAt && now ? Math.max(0, g.introAt + ms - now) : ms;
  const order = [...g.lineup]
    .filter((s) => !s.out)
    .sort((a, b) => b.total - a.total || b.rounds[CROWN] - a.rounds[CROWN] || b.hits - a.hits);
  const prev = g.r > 0 && !tb ? g.r - 1 : -1;
  const tied = tb ? (g.tbs[g.tbs.length - 1] ?? []) : [];
  const meIdx = order.findIndex((s) => s.seat.uid === view.me);
  const mine = meIdx >= 0 ? order[meIdx] : undefined;
  const top = order[0];
  let standing: string | null = null;
  if (!tb && prev >= 0 && mine && !g.solo) {
    if (mine.total === top.total) {
      const second = order.find((s) => s.total < mine.total);
      const co = order.filter((s) => s.total === mine.total).length;
      standing = co > 1 ? `Bạn đang đồng dẫn đầu với ${co - 1} người khác — bứt lên nào!` : second ? `Bạn đang dẫn đầu, hơn hạng nhì ${fmtPts(mine.total - second.total)} điểm.` : "Bạn đang dẫn đầu!";
    } else standing = `Bạn đang hạng ${order.filter((s) => s.total > mine.total).length + 1} · kém 👑 ${nameIn(view, top.seat.uid)} ${fmtPts(top.total - mine.total)} điểm.`;
  }
  const rd = tb ? null : ROUNDS[g.r];
  return (
    <div className={`cine vt-scene is-${ROUND_TONES[g.r]} is-skippable`} role="dialog" aria-modal="true" aria-label={tb ? TIEBREAK.name : `Vòng ${g.r + 1}: ${rd!.name}`} onClick={onClose}>
      <div className="vt-scene-body">
        <ol className="vt-road" aria-label="Lộ trình năm vòng">
          {ROUNDS.map((x, r) => (
            <li key={r} className={`is-${ROUND_TONES[r]} ${r === g.r ? "is-now" : r < g.r ? "is-done" : ""}`} style={{ animationDelay: `${80 + r * 70}ms` }}>
              <span className="vt-road-dot">{r < g.r ? "✓" : x.emoji}</span>
              <span className="vt-road-name">{x.name}</span>
            </li>
          ))}
          {tb && (
            <li className="is-gold is-now" style={{ animationDelay: "430ms" }}>
              <span className="vt-road-dot">{TIEBREAK.emoji}</span>
              <span className="vt-road-name">Phụ</span>
            </li>
          )}
        </ol>

        <span className="vt-scene-emoji" aria-hidden="true">
          {tb ? TIEBREAK.emoji : rd!.emoji}
        </span>
        <p className="vt-scene-eyebrow">{tb ? "Hoà điểm ở ngôi đầu" : g.r === CROWN ? `Vòng cuối · ${g.n} thử thách` : `Vòng ${g.r + 1} / ${ROUNDS.length} · ${g.n} câu`}</p>
        <h2 className="vt-scene-title">{tb ? TIEBREAK.name : rd!.name}</h2>
        <p className="vt-scene-about">{tb ? "Một câu trắc nghiệm khó, 15 giây — tối đa 3 câu." : rd!.about}</p>
        <div className="vt-scene-rules">
          <span>🎯 {tb ? TIEBREAK.rule : rd!.rule}</span>
          {!tb && <span>⏱️ {limitNote(g.r)}</span>}
        </div>

        {tb ? (
          <div className="vt-scene-board">
            <p className="vt-scene-board-h">Cùng {fmtPts(order.find((s) => tied.includes(s.seat.uid))?.total ?? 0)} điểm</p>
            <Crowd people={tied.map((uid) => ({ uid, p: g.lineup.find((s) => s.seat.uid === uid)?.seat.member, name: nameIn(view, uid), ring: "#f4b71c" }))} />
          </div>
        ) : prev >= 0 && order.length > 0 ? (
          <div className="vt-scene-board">
            <p className="vt-scene-board-h">
              Sau vòng {prev + 1} · {ROUNDS[prev].emoji} {ROUNDS[prev].name}
            </p>
            <ol>
              {order.slice(0, g.solo ? 1 : 5).map((s, k) => {
                const lead = s.total > 0 && s.total === top.total;
                const gain = s.rounds[prev];
                return (
                  <li key={s.seat.uid} className={s.seat.uid === view.me ? "is-me" : ""} style={{ animationDelay: `${700 + k * 110}ms` }}>
                    <span className="vt-scene-rank">{lead ? "👑" : order.filter((x) => x.total > s.total).length + 1}</span>
                    {s.seat.member ? <Avatar p={s.seat.member} size={30} /> : <span className="avatar h-[30px] w-[30px]" />}
                    <b className="min-w-0 flex-1 truncate text-left">{nameIn(view, s.seat.uid)}</b>
                    <span className={`vt-scene-gain ${gain ? "" : "is-zero"}`}>+{fmtPts(gain)}</span>
                    <span className="vt-scene-total">{fmtPts(s.total)}</span>
                  </li>
                );
              })}
            </ol>
            {standing && <p className="vt-scene-me">{standing}</p>}
            {!g.solo && meIdx >= 5 && <p className="vt-scene-me">Bạn: {fmtPts(mine!.total)} điểm</p>}
          </div>
        ) : null}

        {g.r === CROWN && !g.solo && <p className="vt-scene-stamp">Cơ hội lật ngược thế cờ!</p>}

        <div className="vt-scene-foot" onClick={(e) => e.stopPropagation()}>
          <div className="vt-scene-bar" aria-hidden="true">
            <span style={{ width: `${(left / ms) * 100}%` }} />
          </div>
          <span className="vt-scene-left">{tb ? "Câu hỏi phụ" : "Vòng"} bắt đầu sau {Math.ceil(left / 1000)}s</span>
          {view.isHost && (
            <button type="button" className="btn btn-sm btn-sun" onClick={() => session.skip()}>
              ⏭ Bắt đầu ngay
            </button>
          )}
        </div>
      </div>
      <p className="cine-skip">Bấm để ẩn</p>
    </div>
  );
}

function Timer({ match: g }: { match: VtMatch }) {
  const now = useNow(g.deadline > 0, 100);
  const left = g.deadline && now ? Math.max(0, g.deadline - now) : 0;
  const frac = g.limit ? left / g.limit : 0;
  const hot = frac < 0.25;
  return (
    <div className="flex items-center gap-3" aria-label={`Còn ${Math.ceil(left / 1000)} giây`}>
      <div className="vt-timer" aria-hidden="true">
        <span style={{ width: `${frac * 100}%` }} className={hot ? "is-hot" : ""} />
      </div>
      <span className={`vt-clock ${hot ? "is-hot" : ""}`}>{Math.ceil(left / 1000)}</span>
    </div>
  );
}

function QuestionCard({ view, session, match: g }: { view: View; session: VuaTiengVietRoom; match: VtMatch }) {
  const closed = !!g.marks;
  const item = g.item;
  const head = g.r === TB ? `Câu ${g.k + 1}` : `${g.r === CROWN ? "Thử thách" : "Câu"} ${g.k + 1}/${g.n}`;
  const kindName =
    item.kind === "grid"
      ? "Săn từ trong lưới"
      : item.kind === "order"
        ? g.r === CROWN
          ? "Giải mã câu khó"
          : "Sắp xếp thành câu"
        : item.kind === "clue"
          ? "Đoán từ qua gợi ý"
          : item.kind === "scramble"
            ? `Ghép chữ cái · ${TIER_NAMES[item.lv]}`
            : "Trắc nghiệm";
  return (
    <div className="grid gap-4">
      <article className={`vt-stage card p-4 sm:p-5 is-${ROUND_TONES[g.r]}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="vt-roundtag">{roundLabel(g.r)}</span>
          <span className="text-[13px] font-extrabold text-ink-2">
            {head} · {kindName}
          </span>
          <span className="ml-auto font-mono text-[11.5px] font-bold text-ink-3">{item.id}</span>
        </div>
        <div className="mt-3">{g.stage === "ask" ? <Timer match={g} /> : <RevealBar match={g} />}</div>
        <div className="mt-4">
          {item.kind === "scramble" ? (
            <ScrambleBody session={session} match={g} item={item} />
          ) : item.kind === "mc" ? (
            <McBody view={view} session={session} match={g} item={item} />
          ) : item.kind === "clue" ? (
            <ClueBody session={session} match={g} item={item} />
          ) : item.kind === "order" ? (
            <OrderBody session={session} match={g} item={item} />
          ) : (
            <GridBody session={session} match={g} item={item} />
          )}
        </div>
      </article>
      {closed && <RevealPanel view={view} session={session} match={g} />}
    </div>
  );
}

/** Thanh chờ sang câu sau (ván nhiều người tự sang sau vài giây). */
function RevealBar({ match: g }: { match: VtMatch }) {
  const now = useNow(!g.solo && g.revealAt > 0, 200);
  if (g.solo || !g.revealAt) return <p className="vt-closed">⏱ Đã đóng câu</p>;
  const frac = now ? Math.max(0, 1 - (now - g.revealAt) / g.revealMs) : 1;
  return (
    <div className="flex items-center gap-3">
      <div className="vt-timer is-calm" aria-hidden="true">
        <span style={{ width: `${frac * 100}%` }} />
      </div>
      <span className="text-[12.5px] font-bold text-ink-3">Câu tiếp</span>
    </div>
  );
}

function Pickers({ view, match: g, uids }: { view: View; match: VtMatch; uids: string[] }) {
  if (!uids.length || g.solo) return null;
  return (
    <span className="flex -space-x-1.5" aria-label={`Đã chọn: ${uids.map((u) => nameIn(view, u)).join(", ")}`}>
      {uids.map((u) => {
        const p = g.lineup.find((s) => s.seat.uid === u)?.seat.member;
        return p ? <Avatar key={u} p={p} size={22} className="ring-2 ring-[var(--surface)]" /> : null;
      })}
    </span>
  );
}

function ScrambleBody({ session, match: g, item }: { session: VuaTiengVietRoom; match: VtMatch; item: Extract<Item, { kind: "scramble" }> }) {
  const letters = useMemo(() => lettersOf(item.a), [item]);
  const closed = !!g.marks;
  const confirmed = (g.mine.sub?.a ?? g.mine.draft?.a) as number[] | undefined;
  const can = g.playing && g.stage === "ask" && !locked(g);
  // Thứ tự đang xếp: chỉ số thẻ chữ, -1 là khoảng trắng (chỉ để dễ đọc, không tính khi chấm).
  const [placed, setPlaced] = useState<number[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const placedRef = useRef<number[]>([]);
  useEffect(() => {
    placedRef.current = placed;
  }, [placed]);
  const line = can ? placed : (confirmed ?? []);
  const used = placed.filter((i) => i >= 0).length;
  const full = used === letters.length;
  const add = (i: number) => setPlaced((p) => (p.includes(i) ? p : [...p, i]));
  const space = () => setPlaced((p) => (p.length && p[p.length - 1] !== -1 ? [...p, -1] : p));
  const removeAt = (pos: number) => setPlaced((p) => p.filter((_, k) => k !== pos));
  const submit = (p: number[]) => {
    const clean = [...p];
    while (clean[clean.length - 1] === -1) clean.pop();
    if (clean.filter((i) => i >= 0).length === letters.length) session.answer(clean);
  };
  useEffect(() => {
    if (!can) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]")) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        setPlaced((p) => p.slice(0, -1));
      } else if (e.key === "Escape") setPlaced([]);
      else if (e.key === "Enter") {
        e.preventDefault();
        submit(placedRef.current);
      } else if (e.key === " ") {
        e.preventDefault();
        space();
      } else {
        // Gõ đúng chữ (kể cả dấu) thì lấy thẻ chữ đó chưa dùng đầu tiên.
        const k = e.key.normalize("NFC").toLowerCase();
        if ([...k].length !== 1) return;
        setPlaced((p) => {
          const i = g.order.find((j) => letters[j] === k && !p.includes(j));
          return i === undefined ? p : [...p, i];
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submit chỉ đọc ref và session
  }, [can, g.order, letters, session]);
  const dropAt = (pos: number) => {
    if (drag === null) return;
    setPlaced((p) => {
      const next = [...p];
      const [x] = next.splice(drag, 1);
      next.splice(drag < pos ? pos - 1 : pos, 0, x);
      return next;
    });
    setDrag(null);
  };
  const myMark = closed && g.me >= 0 ? g.marks?.[g.lineup[g.me].seat.uid] : undefined;
  return (
    <>
      <p className="vt-q">Xếp tất cả chữ cái thành một từ hoặc cụm từ có nghĩa.</p>
      <p className="mt-1 text-[13px] font-semibold text-ink-3">
        {letters.length} chữ cái · {TIER_NAMES[item.lv]} · dùng hết mọi chữ, giữ nguyên dấu (“ố” và “ồ” là hai chữ khác nhau).
      </p>
      <div
        className={`vt-line mt-4 ${myMark ? (myMark.ok ? "is-right" : "is-wrong") : ""}`}
        aria-label="Từ đang ghép"
        onDragOver={(e) => can && e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          dropAt(placed.length);
        }}
      >
        {line.length === 0 && <span className="text-[13.5px] font-semibold text-ink-3">{can ? "Chạm các chữ bên dưới theo thứ tự đúng…" : closed ? "Không xác nhận" : "Đang chờ…"}</span>}
        {line.map((i, pos) => (
          <button
            key={i === -1 ? `s${pos}` : i}
            type="button"
            className={i === -1 ? "vt-gap" : "vt-tile is-char is-placed"}
            disabled={!can}
            draggable={can}
            onDragStart={() => setDrag(pos)}
            onDragOver={(e) => can && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dropAt(pos);
            }}
            onClick={() => can && removeAt(pos)}
            title={can ? (i === -1 ? "Chạm để bỏ khoảng trắng" : "Chạm để bỏ ra, kéo để đổi chỗ") : undefined}
            aria-label={i === -1 ? "Khoảng trắng" : undefined}
          >
            {i === -1 ? "" : upper(letters[i])}
          </button>
        ))}
      </div>
      {!closed && (
        <div className="vt-pool mt-3" aria-label="Chữ chưa xếp">
          {g.order.map((i) => (
            <button key={i} type="button" className={`vt-tile is-char ${line.includes(i) ? "is-used" : ""}`} disabled={!can || line.includes(i)} onClick={() => add(i)}>
              {upper(letters[i])}
            </button>
          ))}
        </div>
      )}
      {can && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-pen" disabled={!full} onClick={() => submit(placed)}>
            ✓ Xác nhận
          </button>
          <button type="button" className="btn" disabled={!placed.length || placed[placed.length - 1] === -1} onClick={space}>
            ␣ Khoảng trắng
          </button>
          <button type="button" className="btn" disabled={!placed.length} onClick={() => setPlaced((p) => p.slice(0, -1))}>
            ⌫ Bỏ chữ cuối
          </button>
          <button type="button" className="btn" disabled={!placed.length} onClick={() => setPlaced([])}>
            ↺ Xếp lại
          </button>
          <span className="text-[12.5px] font-semibold text-ink-3">
            {used}/{letters.length} chữ · gõ chữ để chọn, Space chèn khoảng trắng, ⌫ bỏ chữ cuối, Enter xác nhận
          </span>
        </div>
      )}
      {!can && !closed && g.playing && <p className="mt-3 text-[14px] font-bold text-ink-2">{confirmed ? "🔒 Đã xác nhận — chờ công bố đáp án." : "⏳ Hết giờ."}</p>}
    </>
  );
}

function McBody({ view, session, match: g, item }: { view: View; session: VuaTiengVietRoom; match: VtMatch; item: Extract<Item, { kind: "mc" }> }) {
  const closed = !!g.marks;
  const mine = (g.mine.sub?.a ?? g.mine.draft?.a) as number | undefined;
  const can = g.playing && g.stage === "ask" && !locked(g);
  useEffect(() => {
    if (!can) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]")) return;
      const k = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
      if (k < 0 || e.key.length !== 1) return;
      e.preventDefault();
      session.answer(g.order[k]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [can, g.order, session]);
  const by = (o: number) => (g.subs ? Object.entries(g.subs).flatMap(([u, s]) => (s.a === o ? [u] : [])) : []);
  return (
    <>
      <p className="vt-q">{item.q}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {g.order.map((o, slot) => {
          const on = mine === o;
          const state = closed ? (o === 0 ? "is-right" : on ? "is-wrong" : "is-dim") : on ? "is-on" : "";
          return (
            <button key={o} type="button" className={`vt-opt ${state}`} disabled={!can} aria-pressed={on} onClick={() => session.answer(o)}>
              <span className="vt-letter">{LETTERS[slot]}</span>
              <span className="min-w-0 flex-1">{item.o[o]}</span>
              {closed && <Pickers view={view} match={g} uids={by(o)} />}
              {!closed && on && <span className="text-[12px] font-extrabold">🔒 Đã chốt</span>}
            </button>
          );
        })}
      </div>
      {can && <p className="mt-2 text-[12.5px] font-semibold text-ink-3">Bấm là chốt luôn, không sửa được · phím 1–4 hoặc A–D.</p>}
    </>
  );
}

function ClueBody({ session, match: g, item }: { session: VuaTiengVietRoom; match: VtMatch; item: Extract<Item, { kind: "clue" }> }) {
  const closed = !!g.marks;
  const now = useNow(g.stage === "ask" && g.askAt > 0, 250);
  const elapsed = g.askAt && now ? now - g.askAt : 0;
  const sent = (g.mine.sub?.a ?? g.mine.draft?.a) as string | undefined;
  const can = g.playing && g.stage === "ask" && !locked(g);
  const [text, setText] = useState("");
  const tier = elapsed < HINT_AT[1] ? 150 : elapsed < HINT_AT[2] ? 110 : 70;
  const submit = () => {
    if (text.trim()) session.answer(text.trim());
  };
  return (
    <>
      <ol className="grid gap-2">
        {item.h.map((h, j) => {
          const open = closed || elapsed >= HINT_AT[j];
          return (
            <li key={j} className={`vt-hint ${open ? "is-open" : ""}`}>
              <span className="vt-hint-num">{j + 1}</span>
              {open ? <span className="min-w-0 flex-1">{h}</span> : <span className="min-w-0 flex-1 text-ink-3">🔒 Gợi ý {j + 1} mở ở giây {HINT_AT[j] / 1000}</span>}
            </li>
          );
        })}
      </ol>
      {can ? (
        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="vt-clue" className="sr-only">
            Đáp án
          </label>
          <input
            id="vt-clue"
            className="field vt-input min-w-0 flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Gõ đáp án có dấu…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={60}
            autoFocus
          />
          <button type="submit" className="btn btn-pen" disabled={!text.trim()}>
            Gửi · {tier} điểm
          </button>
          <span className="basis-full text-[12.5px] font-semibold text-ink-3">Chỉ được gửi một lần — sai là mất lượt. Đoán càng sớm càng nhiều điểm.</span>
        </form>
      ) : (
        g.me >= 0 &&
        g.playing &&
        !closed && (
          <p className="mt-4 text-[14px] font-bold text-ink-2">{sent ? <>🔒 Đã gửi “{sent}” — chờ công bố đáp án.</> : <>⏳ Hết giờ.</>}</p>
        )
      )}
    </>
  );
}

function OrderBody({ session, match: g, item }: { session: VuaTiengVietRoom; match: VtMatch; item: Extract<Item, { kind: "order" }> }) {
  const tokens = useMemo(() => tokensOf(item), [item]);
  const closed = !!g.marks;
  const confirmed = (g.mine.sub?.a ?? g.mine.draft?.a) as number[] | undefined;
  const can = g.playing && g.stage === "ask" && !locked(g);
  const [placed, setPlaced] = useState<number[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  // Phím Enter đọc thứ tự đang xếp qua ref để không gọi gửi bài bên trong hàm cập nhật state.
  const placedRef = useRef<number[]>([]);
  useEffect(() => {
    placedRef.current = placed;
  }, [placed]);
  const line = can ? placed : (confirmed ?? []);
  const toggle = (i: number) => {
    if (!can) return;
    setPlaced((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  };
  const full = placed.length === tokens.length;
  useEffect(() => {
    if (!can) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]")) return;
      if (/^[1-9]$/.test(e.key)) {
        const slot = Number(e.key) - 1;
        if (slot < g.order.length) {
          e.preventDefault();
          const i = g.order[slot];
          setPlaced((p) => (p.includes(i) ? p : [...p, i]));
        }
      } else if (e.key === "0" && g.order.length >= 10) {
        e.preventDefault();
        const i = g.order[9];
        setPlaced((p) => (p.includes(i) ? p : [...p, i]));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setPlaced((p) => p.slice(0, -1));
      } else if (e.key === "Escape") setPlaced([]);
      else if (e.key === "Enter") {
        e.preventDefault();
        if (placedRef.current.length === tokens.length) session.answer(placedRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [can, g.order, tokens.length, session]);
  const dropAt = (pos: number) => {
    if (drag === null) return;
    setPlaced((p) => {
      const from = p.indexOf(drag);
      const next = p.filter((x) => x !== drag);
      next.splice(from >= 0 && from < pos ? pos - 1 : pos, 0, drag);
      return next;
    });
    setDrag(null);
  };
  const myMark = closed && g.me >= 0 ? g.marks?.[g.lineup[g.me].seat.uid] : undefined;
  return (
    <>
      <p className="vt-q">{g.r === CROWN ? "Giải mã câu dài: xếp các thẻ thành câu hoàn chỉnh." : "Xếp các thẻ thành câu tục ngữ, thành ngữ hoặc ca dao."}</p>
      <div
        className={`vt-line mt-4 ${myMark ? (myMark.ok ? "is-right" : "is-wrong") : ""}`}
        aria-label="Câu đang xếp"
        onDragOver={(e) => can && e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          dropAt(placed.length);
        }}
      >
        {line.length === 0 && <span className="text-[13.5px] font-semibold text-ink-3">{can ? "Chạm thẻ bên dưới theo thứ tự đúng…" : closed ? "Không xác nhận" : "Đang chờ…"}</span>}
        {line.map((i, pos) => (
          <button
            key={i}
            type="button"
            className="vt-tile is-placed"
            disabled={!can}
            draggable={can}
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => can && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dropAt(pos);
            }}
            onClick={() => toggle(i)}
            title={can ? "Chạm để bỏ ra, kéo để đổi chỗ" : undefined}
          >
            {tokens[i]}
          </button>
        ))}
      </div>
      {!closed && (
        <div className="vt-pool mt-3" aria-label="Thẻ chưa xếp">
          {g.order.map((i, slot) => (
            <button key={i} type="button" className={`vt-tile ${line.includes(i) ? "is-used" : ""}`} disabled={!can || line.includes(i)} onClick={() => toggle(i)}>
              {tokens[i]}
              {can && slot < 10 && <span className="vt-tile-key">{(slot + 1) % 10}</span>}
            </button>
          ))}
        </div>
      )}
      {can && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-pen" disabled={!full} onClick={() => session.answer(placed)}>
            ✓ Xác nhận
          </button>
          <button type="button" className="btn" disabled={!placed.length} onClick={() => setPlaced([])}>
            ↺ Xếp lại
          </button>
          <span className="text-[12.5px] font-semibold text-ink-3">
            {placed.length}/{tokens.length} thẻ · phím số để chọn, ⌫ bỏ thẻ cuối, Enter xác nhận
          </span>
        </div>
      )}
      {!can && !closed && g.playing && <p className="mt-3 text-[14px] font-bold text-ink-2">{confirmed ? "🔒 Đã xác nhận — chờ công bố đáp án." : "⏳ Hết giờ."}</p>}
    </>
  );
}

type Flash = { kind: "ok" | "dup" | "bad"; word: string; n: number };

function GridBody({ session, match: g, item }: { session: VuaTiengVietRoom; match: VtMatch; item: Extract<Item, { kind: "grid" }> }) {
  const closed = !!g.marks;
  const can = g.playing && g.stage === "ask" && !locked(g);
  const finds = g.mine.sub?.f ?? g.mine.draft?.f;
  const found = useMemo(() => gridFinds(item, finds), [item, finds]);
  const [path, setPathState] = useState<number[]>([]);
  // Đường đang nối giữ thêm trong ref: thao tác chuột / chạm đọc ngay giá trị mới nhất mà không cần hàm cập nhật state.
  const pathRef = useRef<number[]>([]);
  const setPath = (p: number[]) => {
    pathRef.current = p;
    setPathState(p);
  };
  const [flash, setFlash] = useState<Flash | null>(null);
  const flashN = useRef(0);
  const drag = useRef<{ on: boolean; moved: boolean }>({ on: false, moved: false });
  const foundCells = useMemo(() => new Set(found.flatMap((x) => x.p)), [found]);

  const submit = (p: number[]) => {
    if (p.length < 2) return;
    const res = session.find(p);
    setPath([]);
    if (res) setFlash({ ...res, n: ++flashN.current });
  };
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const cellAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest?.("[data-cell]") as HTMLElement | null;
    return el ? Number(el.dataset.cell) : -1;
  };
  // Kéo: đi qua ô kề thì nối thêm, lùi về ô trước thì bỏ ô cuối. Chạm: ô kề ô cuối thì nối tiếp, chạm lại ô cuối thì chốt.
  const extend = (c: number) => {
    const p = pathRef.current;
    if (c < 0 || !p.length || c === p[p.length - 1]) return;
    if (p.length >= 2 && c === p[p.length - 2]) return setPath(p.slice(0, -1));
    if (p.includes(c) || !adjacent(p[p.length - 1], c)) return;
    drag.current.moved = true;
    setPath([...p, c]);
  };
  const down = (c: number) => {
    if (!can) return;
    const p = pathRef.current;
    const last = p[p.length - 1];
    if (p.length >= 2 && c === last) {
      drag.current = { on: false, moved: false };
      return submit(p);
    }
    drag.current = { on: true, moved: false };
    setPath(p.length && !p.includes(c) && adjacent(last, c) ? [...p, c] : [c]);
  };
  const up = () => {
    if (!drag.current.on) return;
    drag.current.on = false;
    if (drag.current.moved && pathRef.current.length >= 2) submit(pathRef.current);
  };

  return (
    <>
      <p className="vt-q">
        Chủ đề: <b className="vt-theme">{item.theme}</b>
      </p>
      <p className="mt-1 text-[13px] font-semibold text-ink-3">
        Nối các ô kề nhau theo hàng ngang / dọc (không chéo) thành từ đúng chủ đề. Mỗi từ +{GRID_WORD} điểm, đủ {GRID_GOAL} từ là xong.
      </p>
      <div className="mt-4 flex flex-wrap items-start gap-4">
        <div
          className={`vt-grid ${can ? "is-live" : ""}`}
          onPointerMove={(e) => {
            if (drag.current.on) extend(cellAt(e.clientX, e.clientY));
          }}
          onPointerUp={up}
          onPointerCancel={() => (drag.current.on = false)}
          onPointerLeave={up}
        >
          {item.cells.map((c, i) => {
            const k = path.indexOf(i);
            return (
              <button
                key={i}
                type="button"
                data-cell={i}
                className={`vt-cell ${k >= 0 ? "is-path" : ""} ${foundCells.has(i) ? "is-found" : ""}`}
                disabled={!can}
                onPointerDown={(e) => {
                  (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
                  down(i);
                }}
              >
                {c}
                {k >= 0 && <span className="vt-cell-n">{k + 1}</span>}
              </button>
            );
          })}
        </div>
        <div className="grid min-w-[180px] flex-1 gap-2">
          {can && (
            <div className="vt-path" aria-live="polite">
              {path.length ? path.map((c) => item.cells[c]).join(" ") : <span className="text-ink-3">Kéo hoặc chạm lần lượt các ô…</span>}
            </div>
          )}
          {can && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm btn-pen" disabled={path.length < 2} onClick={() => submit(path)}>
                ✓ Chốt từ
              </button>
              <button type="button" className="btn btn-sm" disabled={!path.length} onClick={() => setPath([])}>
                ✕ Bỏ
              </button>
            </div>
          )}
          {flash && (
            <p className={`vt-flash is-${flash.kind}`} key={flash.n}>
              {flash.kind === "ok" ? `✅ “${flash.word}” +${GRID_WORD}` : flash.kind === "dup" ? `↺ “${flash.word}” tìm rồi` : `❌ “${flash.word}” không có trong đáp án`}
            </p>
          )}
          {g.me >= 0 && (
            <div>
              <p className="text-[13px] font-extrabold text-ink-2">
                Đã tìm {Math.min(found.length, GRID_GOAL)}/{GRID_GOAL}
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {found.slice(0, GRID_GOAL).map((x) => (
                  <li key={x.w} className="vt-word is-mine">
                    {x.w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!can && !closed && g.playing && <p className="text-[14px] font-bold text-ink-2">{found.length >= GRID_GOAL ? "🎉 Đủ từ rồi — chờ mọi người." : "⏳ Hết giờ."}</p>}
        </div>
      </div>
    </>
  );
}

// ——— Công bố đáp án ———

function RevealPanel({ view, session, match: g }: { view: View; session: VuaTiengVietRoom; match: VtMatch }) {
  const item = g.item;
  const marks = g.marks ?? {};
  const mine = g.me >= 0 ? marks[view.me] : undefined;
  const live = isLive(view);
  const meReady = g.lineup[g.me]?.next;
  const rows = Object.entries(marks)
    .map(([uid, mk]) => ({ uid, mk }))
    .sort((a, b) => b.mk.pts - a.mk.pts || Number(b.mk.ok) - Number(a.mk.ok) || a.mk.t - b.mk.t);
  useEffect(() => {
    if (!live || !g.playing || meReady) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable], button")) return;
      e.preventDefault();
      session.proceed();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [live, g.playing, meReady, session]);
  return (
    <section className="vt-reveal card grid gap-3 p-4 sm:p-5" aria-label="Đáp án">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[13px] font-extrabold text-ink-3">Đáp án</span>
        <span className="vt-answer">{item.kind === "grid" ? `${item.words.length} từ hợp lệ` : answerText(item)}</span>
      </div>
      {item.kind === "scramble" && item.acc?.length ? <p className="text-[13px] font-semibold text-ink-3">Cũng chấp nhận: {item.acc.map(upper).join(" / ")}</p> : null}
      {item.kind === "clue" && clueAnswers(item).length > 1 && <p className="text-[13px] font-semibold text-ink-3">Cũng chấp nhận: {clueAnswers(item).slice(1).join(", ")}</p>}
      {item.kind === "order" && item.alt?.length ? <p className="text-[13px] font-semibold text-ink-3">Cũng chấp nhận: {item.alt.join(" / ")}</p> : null}
      {item.kind === "grid" && (
        <ul className="flex flex-wrap gap-1.5">
          {item.words.map((w) => (
            <li key={w} className={`vt-word ${mine?.words?.includes(w) ? "is-mine" : ""}`}>
              {w}
            </li>
          ))}
        </ul>
      )}
      {mine && <MineLine mark={mine} r={g.r} blank={isBlank(g.subs?.[view.me])} />}
      {g.opts.explain && item.kind !== "grid" && <p className="vt-why">💡 {item.why}</p>}
      {!g.solo && rows.length > 0 && (
        <ol className="grid gap-1.5">
          {rows.map(({ uid, mk }) => {
            const p = g.lineup.find((s) => s.seat.uid === uid)?.seat.member;
            return (
              <li key={uid} className="flex items-center gap-2 text-[13.5px]">
                {p ? <Avatar p={p} size={24} /> : <span className="avatar h-6 w-6 bg-sunken" />}
                <b className="w-24 shrink-0 truncate">{nameIn(view, uid)}</b>
                <span className="min-w-0 flex-1 truncate text-ink-2">{subText(item, g.subs?.[uid], g.order)}</span>
                <span className={`shrink-0 font-extrabold tabular-nums ${mk.ok || mk.pts ? "text-lime" : "text-ink-3"}`}>
                  {g.r === TB ? (mk.ok ? `✓ ${secs(mk.t)}` : "✗") : mk.pts ? `+${mk.pts}${mk.ok && item.kind !== "grid" ? ` · ${secs(mk.t)}` : ""}` : "0"}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {live && g.playing && (
          <button type="button" className="btn btn-pen btn-nudge" disabled={meReady} onClick={() => session.proceed()}>
            {meReady ? "✅ Đã sẵn sàng" : g.i + 1 >= g.total && g.r !== TB ? "👑 Xem kết quả" : "➡️ Câu tiếp"}
          </button>
        )}
        <ReportButton session={session} item={item} />
      </div>
    </section>
  );
}

const isBlank = (sub: Sub | undefined) => !sub || (sub.a === undefined && !sub.f?.length);

function MineLine({ mark: mk, r, blank }: { mark: Mark; r: number; blank: boolean }) {
  if (blank && !mk.ok) return <p className="vt-mine is-no">⏳ Hết giờ — bạn chưa trả lời · +0 điểm</p>;
  if (r === TB) return <p className={`vt-mine ${mk.ok ? "is-ok" : "is-no"}`}>{mk.ok ? `✅ Bạn trả lời đúng sau ${secs(mk.t)}` : "❌ Bạn chưa trả lời đúng"}</p>;
  const text = mk.ok ? `✅ Chính xác sau ${secs(mk.t)}! +${mk.pts} điểm` : mk.pts ? `🌗 Tìm được ${mk.hits} từ · +${mk.pts} điểm` : "❌ Chưa đúng · +0 điểm";
  return <p className={`vt-mine ${mk.ok ? "is-ok" : mk.pts ? "is-part" : "is-no"}`}>{text}</p>;
}

function ReportButton({ session, item }: { session: VuaTiengVietRoom; item: Item }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  if (done) return <span className="text-[12.5px] font-semibold text-ink-3">🚩 Đã báo lỗi câu {item.id} (chép sẵn vào bộ nhớ tạm). Cảm ơn bạn!</span>;
  if (!open)
    return (
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}>
        🚩 Báo lỗi câu hỏi
      </button>
    );
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = note.trim().slice(0, 140);
        session.reportIssue(item.id, clean);
        const text = `Vua Tiếng Việt — báo lỗi câu ${item.id} (bộ câu hỏi v${BANK_VERSION})\nCâu hỏi: ${promptText(item)}\nĐáp án: ${answerText(item)}\nGhi chú: ${clean || "(không có)"}`;
        navigator.clipboard?.writeText(text).catch(() => {});
        setDone(true);
      }}
    >
      <input className="field !min-h-[36px] min-w-0 flex-1 !py-1 text-sm" placeholder="Câu này sai / đa nghĩa ở đâu?" value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} autoFocus />
      <button type="submit" className="btn btn-sm btn-coral">
        Gửi báo lỗi
      </button>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
        Thôi
      </button>
    </form>
  );
}

// ——— Bảng điểm ———

function Scoreboard({ view, match: g }: { view: View; match: VtMatch }) {
  const live = isLive(view);
  const order = [...g.lineup].sort((a, b) => b.total - a.total || b.rounds[CROWN] - a.rounds[CROWN] || b.hits - a.hits);
  const top = order[0]?.total ?? 0;
  return (
    <section className="vt-board card p-4" aria-labelledby="vt-score-h">
      <h2 id="vt-score-h" className="font-display text-lg font-extrabold">
        👑 Bảng điểm
      </h2>
      <p className="text-[12.5px] font-semibold text-ink-3">
        {g.lineup.length} người · {g.total} câu · tối đa {fmtPts(maxScore(g.opts.counts))} điểm
      </p>
      <ol className="mt-3 grid gap-2">
        {order.map((s, k) => {
          const p = s.seat.member;
          const status = s.out
            ? "🚫 Bị xử thua"
            : s.away
              ? "📡 Đang mất kết nối"
              : !live || !s.on
                ? g.r === TB && live && !s.on
                  ? "👀 Đang xem câu hỏi phụ"
                  : ""
                : g.stage === "ask"
                  ? s.locked
                    ? "✅ Đã trả lời"
                    : "💭 Đang suy nghĩ"
                  : g.stage === "reveal" && s.next
                    ? "➡️ Sẵn sàng"
                    : "";
          const lead = s.total > 0 && s.total === top;
          return (
            <li key={s.seat.uid} className={`vt-player ${s.seat.uid === view.me ? "is-me" : ""} ${s.out ? "is-out" : ""}`}>
              <span className="w-5 shrink-0 text-center text-[13px] font-extrabold text-ink-3">{lead ? "👑" : k + 1}</span>
              {p ? <Avatar p={p} size={32} className={s.seat.online && !s.out ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[32px] w-[32px] bg-sunken" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold">{s.seat.uid === view.me ? "Bạn" : (p?.name ?? "Ai đó")}</p>
                <p className="truncate text-[11.5px] font-semibold text-ink-3">{status || `${s.hits} câu đúng`}</p>
                <div className="mt-1 flex gap-1" aria-label="Điểm từng vòng">
                  {ROUNDS.map((rd, r) => (
                    <span key={r} className={`vt-pip is-${ROUND_TONES[r]} ${live && g.r === r ? "is-now" : ""}`} title={`${rd.name}: ${fmtPts(s.rounds[r])} điểm`}>
                      {s.rounds[r] ? fmtPts(s.rounds[r]) : "·"}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 text-right">
                <span className="block font-display text-2xl leading-none font-extrabold tabular-nums">{fmtPts(s.total)}</span>
                <span className="text-[10.5px] font-bold text-ink-3">điểm</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ——— Kết quả & xem lại ———

function Outcome({ view, match: g }: { view: View; match: VtMatch }) {
  const r = g.result!;
  if (r.reason === "cheat") return <StoppedCard round={g.round} sub={`Ván ${g.round} dừng — người chơi bị xử thua vì gian lận.`} />;
  if (r.reason !== "points") return <StoppedCard round={g.round} />;
  const rows = g.rows ?? [];
  const w = r.winners ?? [];
  const max = maxScore(g.opts.counts);
  if (g.solo) {
    const me = rows[0];
    const done = g.past.length;
    const right = g.past.filter((p) => me && p.marks[me.uid]?.ok).length;
    return (
      <ResultCard round={g.round} title={`👑 Hoàn thành ${done} câu · ${fmtPts(me?.total ?? 0)}/${fmtPts(max)} điểm`} sub={`Trả lời đúng ${right}/${done} câu (${done ? Math.round((100 * right) / done) : 0}%).`}>
        {me && <RoundBreakdown rounds={me.rounds} counts={g.opts.counts} />}
      </ResultCard>
    );
  }
  const title = w.length > 1 ? `🤝 ${w.map((u) => nameIn(view, u)).join(", ")} — Đồng Vua Tiếng Việt` : `👑 ${nameIn(view, w[0] ?? "")} là Vua Tiếng Việt!`;
  const mine = rows.find((x) => x.uid === view.me);
  const tb = g.tbs.length ? `Phân định qua ${g.tbs.length} câu hỏi phụ.` : undefined;
  return (
    <ResultCard round={g.round} title={title} sub={mine ? `Bạn được ${fmtPts(mine.total)}/${fmtPts(max)} điểm · hạng ${mine.rank}.` : undefined} note={tb}>
      <Podium view={view} match={g} />
      <ol className="mt-3 grid gap-1.5">
        {rows.map((x) => {
          const p = g.lineup.find((s) => s.seat.uid === x.uid)?.seat.member;
          return (
            <li key={x.uid} className="flex flex-wrap items-center gap-2 text-[14px]">
              <span className="w-6 text-center font-display font-extrabold">{x.rank <= 0 ? "–" : x.king ? "👑" : x.rank}</span>
              {p && <Avatar p={p} size={24} />}
              <b className="min-w-0 flex-1 truncate">{nameIn(view, x.uid)}</b>
              <span className="text-[12px] font-semibold text-ink-3 tabular-nums">{x.rounds.map((v) => fmtPts(v)).join(" · ")}</span>
              <span className="w-16 text-right font-extrabold tabular-nums">{fmtPts(x.total)}</span>
            </li>
          );
        })}
      </ol>
      {mine && <RoundBreakdown rounds={mine.rounds} counts={g.opts.counts} />}
    </ResultCard>
  );
}

function Podium({ view, match: g }: { view: View; match: VtMatch }) {
  const rows = (g.rows ?? []).filter((x) => x.rank > 0).slice(0, 3);
  if (rows.length < 2) return null;
  const spots = [rows[1], rows[0], rows[2]].filter(Boolean);
  return (
    <div className="vt-podium" aria-label="Bục vinh danh">
      {spots.map((x) => {
        const p = g.lineup.find((s) => s.seat.uid === x.uid)?.seat.member;
        const place = x.king ? 1 : x.rank;
        return (
          <div key={x.uid} className={`vt-podium-col is-${Math.min(3, place)}`}>
            {x.king && (
              <span className="vt-podium-crown" aria-hidden="true">
                👑
              </span>
            )}
            {p ? <Avatar p={p} size={place === 1 ? 56 : 44} /> : null}
            <b className="max-w-[110px] truncate text-[13.5px]">{nameIn(view, x.uid)}</b>
            <span className="vt-podium-step">
              <span className="text-[20px] font-extrabold">{place}</span>
              <span className="text-[12px] font-bold tabular-nums">{fmtPts(x.total)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RoundBreakdown({ rounds, counts }: { rounds: number[]; counts: Counts }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 border-t-2 border-dashed border-rule pt-4 sm:grid-cols-3 lg:grid-cols-5">
      {ROUNDS.map((rd, r) => (
        <div key={r} className={`vt-sum is-${ROUND_TONES[r]}`}>
          <span className="text-[12px] font-extrabold">
            {rd.emoji} {rd.name}
          </span>
          <b className="font-display text-xl tabular-nums">{fmtPts(rounds[r] ?? 0)}</b>
          <span className="text-[11px] font-bold text-ink-3">{counts[r]} {r === CROWN ? "thử thách" : "câu"}</span>
        </div>
      ))}
    </div>
  );
}

/** Xem lại từng câu sau ván: đáp án chuẩn và kết quả của mình (hoặc người nhất nếu đang xem). */
function Review({ view, match: g }: { view: View; match: VtMatch }) {
  const uid = g.me >= 0 ? view.me : (g.rows?.[0]?.uid ?? g.lineup[0]?.seat.uid ?? "");
  const [onlyWrong, setOnlyWrong] = useState(false);
  const list = g.past.filter((p) => !onlyWrong || !p.marks[uid]?.ok);
  if (!g.past.length)
    return (
      <div className="vt-welcome card grid min-h-[200px] place-items-center p-8 text-center">
        <p className="font-display text-lg font-extrabold">Ván dừng trước khi có câu nào được chấm.</p>
      </div>
    );
  return (
    <section className="card grid gap-3 p-4 sm:p-5" aria-label="Xem lại câu hỏi">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-extrabold">📜 Xem lại {g.past.length} câu</h2>
        <span className="text-[12.5px] font-semibold text-ink-3">{uid === view.me ? "Kết quả của bạn" : `Kết quả của ${nameIn(view, uid)}`}</span>
        <button type="button" className={`btn btn-sm ml-auto ${onlyWrong ? "btn-sun" : ""}`} aria-pressed={onlyWrong} onClick={() => setOnlyWrong((v) => !v)}>
          {onlyWrong ? "Đang xem câu sai" : "Chỉ câu sai"}
        </button>
      </div>
      <ol className="grid gap-2">
        {list.map((p) => (
          <PastRow key={p.i} past={p} uid={uid} seed={g.seed} />
        ))}
        {!list.length && <li className="text-[13.5px] font-semibold text-ink-2">🎉 Không sai câu nào!</li>}
      </ol>
    </section>
  );
}

function PastRow({ past: p, uid, seed }: { past: VtPast; uid: string; seed: number }) {
  const item = useMemo(() => itemOf(p.id) ?? null, [p.id]);
  const mk = p.marks[uid];
  const order = useMemo(() => (item?.kind === "mc" ? optionOrder(seed, item.id) : []), [item, seed]);
  if (!item) return null;
  return (
    <li className={`vt-past ${mk?.ok ? "is-ok" : mk?.pts ? "is-part" : "is-no"}`}>
      <details>
        <summary>
          <span className={`vt-pip is-${ROUND_TONES[p.r]}`}>{ROUNDS[p.r].emoji}</span>
          <span className="min-w-0 flex-1 truncate">{promptText(item)}</span>
          <b className="shrink-0 tabular-nums">{mk?.pts ? `+${mk.pts}` : mk?.ok ? "✓" : "0"}</b>
        </summary>
        <div className="mt-2 grid gap-1 text-[13.5px] text-ink-2">
          {item.kind === "clue" && <p>Gợi ý: {item.h.join(" · ")}</p>}
          <p>
            <b className="text-ink">Đáp án:</b> {answerText(item)}
          </p>
          <p>
            <b className="text-ink">Trả lời:</b> {subText(item, p.subs[uid], order)}
          </p>
          {item.kind !== "grid" && <p>💡 {item.why}</p>}
          <p className="font-mono text-[11px] text-ink-3">{item.id}</p>
        </div>
      </details>
    </li>
  );
}

