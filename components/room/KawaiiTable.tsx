"use client";

import { memo, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { clock, COUNTDOWN_MS, HINT_COST, HINT_LOCK_MS, kindsOf, MODE_KEYS, MODES, PAIR_POINTS, SIZE_KEYS, SIZES, TILES, type Point } from "@/lib/games/kawaii";
import type { KawaiiRoom, KwMatch, KwView } from "@/lib/net/kawaii-room";
import type { RoomView } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { ChatPanel } from "./ChatPanel";
import { AudioToggles } from "../audio/AudioToggles";
import { useMusic } from "../audio/music";
import { LOFI } from "../audio/tracks";
import { play } from "./kawaiiSounds";
import { CountdownCine, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel } from "./People";
import { ResultCard as Result, Standings, StoppedCard } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout } from "./RoomLayout";
import { StageArea, useStaged } from "./stage";
import { SeatButtons, seatMessage, StatusBar, StopButton, TONE } from "./StatusBar";
import { Roster } from "./SudokuTable";
import { useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

type View = Omit<RoomView<KwView>, "chat">;

function useKwView(session: KawaiiRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const PLAYER_COLORS = ["var(--coral)", "var(--sky)", "var(--lime)", "var(--sun)", "var(--grape)", "#ff6fb5", "#14b8c4", "#ff8a3d", "#8a9a2c", "#a0785a"];
const colorOf = (k: number) => PLAYER_COLORS[k] ?? `hsl(${Math.round((k * 137.508) % 360)} 70% 52%)`;
// Góc vàng (137.5°) để các loại liền nhau lệch màu rõ.
const hueOf = (kind: number) => Math.round((kind * 137.508) % 360);

const CONFETTI = ["🎉", "🏆", "✨", "🐾", "🎊", "⭐"];
const WIN_SCENE_MS = 6500;
const FX_MS = 650;
const HINT_MS = 4000;

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

// Chỉ vẽ lại đúng một lần lúc vượt mốc (vd. lộ bàn), không theo nhịp đồng hồ.
function useReached(at: number | undefined) {
  const [hit, setHit] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (at === undefined) return;
    const t = setTimeout(() => setHit(at), Math.max(0, at - Date.now()));
    return () => clearTimeout(t);
  }, [at]);
  return at !== undefined && hit === at;
}

const NARROW = "(max-width: 639px)";
const PORTRAIT = "(orientation: portrait)";
const subscribeTo = (query: string) => (f: () => void) => {
  const q = matchMedia(query);
  q.addEventListener("change", f);
  return () => q.removeEventListener("change", f);
};
const subscribeNarrow = subscribeTo(NARROW);
const subscribePortrait = subscribeTo(PORTRAIT);
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => matchMedia(NARROW).matches, () => false);
const usePortrait = () => useSyncExternalStore(subscribePortrait, () => matchMedia(PORTRAIT).matches, () => false);

const subscribeResize = (f: () => void) => {
  addEventListener("resize", f);
  return () => removeEventListener("resize", f);
};
const viewportOf = () => `${innerWidth}x${innerHeight}`;

// Các số khớp với `.stage` (globals.css): lề 16px hai bên, 60px trên + 32px dưới, mạn bên clamp(150px, 22%, 280px).
// STACK_CHROME ước lượng bảng điểm (một hàng) + hàng nút + khoảng cách khi xếp trên / dưới bàn.
const STACK_CHROME = 190;

// Lúc trình chiếu trên màn hình ngang, bàn chữ nhật kẹp giữa hai mạn bên bị bó bề ngang. Chọn cách xếp cho bàn to hơn:
// màn hình không quá rộng mà đủ cao thì bảng điểm lên trên, hàng nút xuống dưới (class `kw-stack`, globals.css).
function useStacked(staged: boolean, ratio: number) {
  const size = useSyncExternalStore(subscribeResize, viewportOf, () => "0x0");
  if (!staged) return false;
  const [vw, vh] = size.split("x").map(Number);
  if (vw <= vh) return false;
  const w = vw - 32;
  const h = vh - 92;
  const flank = Math.min(280, Math.max(150, 0.22 * w));
  const side = Math.min(w - 2 * (flank + 16), h * ratio);
  const stack = Math.min(w, (h - STACK_CHROME) * ratio);
  return stack > side;
}

// Bàn ngang mà khung dọc thì xoay bàn cho ô to hơn: màn hẹp, hoặc lúc trình chiếu thì theo hướng màn hình.
function useTurned(w: number, h: number) {
  const staged = useStaged();
  const narrow = useNarrow();
  const portrait = usePortrait();
  return w > h && (staged ? portrait : narrow);
}

const isLive = (view: View) => view.meta!.status === "playing" && view.game?.match?.round === view.meta!.round;

const rankOf = (g: KwMatch, k: number) => g.state.finished.indexOf(k) + 1;

function watchedOf(g: KwMatch, pick: number) {
  if (g.mode !== "race" || (g.me >= 0 && !g.cleared)) return -1;
  if (pick >= 0 && pick < g.lineup.length && pick !== g.me) return pick;
  const k = g.lineup.findIndex((_, i) => i !== g.me && !rankOf(g, i) && !g.state.desks[i].stuck);
  return k >= 0 ? k : g.me >= 0 ? -1 : 0;
}

function nameIn(view: View, uid: string) {
  if (uid === view.me) return "Bạn";
  return view.game?.match?.lineup.find((s) => s.uid === uid)?.member?.name ?? view.members.find((p) => p.uid === uid)?.name ?? "Ai đó";
}

// Phần bàn chơi bọc `memo` và tự đọc store để nhịp tim, tin chat hay người vào ra không làm bàn vẽ lại, và nước đi
// không làm danh sách người / khung chat vẽ lại.
export function KawaiiTable({ id, slug, session }: { id: string; slug: string; session: KawaiiRoom }) {
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <KawaiiBody session={session} />
    </RoomLayout>
  );
}

const KawaiiBody = memo(function KawaiiBody({ session }: { session: KawaiiRoom }) {
  const view = useKwView(session);
  const m = view.meta!;
  const { opts, match: g } = view.game!;
  const areaRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, areaRef);
  const live = isLive(view);
  // Vào phòng / tải lại giữa lúc đếm thì vẫn đếm nốt phần còn lại tới lúc lộ bàn.
  const count = useCountdown(live && g ? g.round : 0, { endsAt: g?.opensAt, ms: COUNTDOWN_MS, onMount: true });
  const end = useEndScene(winKey(g), { ms: WIN_SCENE_MS, emojis: CONFETTI });
  useMusic(LOFI);
  useCueSounds(g, count, end.shown);
  const size = live && g ? g.size : opts.size;
  const mode = live && g ? g.mode : opts.mode;
  const [pick, setPick] = useState({ round: 0, k: -1 });
  const watched = g ? watchedOf(g, pick.round === g.round ? pick.k : -1) : -1;
  const onPick = g ? (k: number) => setPick({ round: g.round, k }) : undefined;
  // Lúc trình chiếu bàn lấp ô giữa theo đúng tỉ lệ (kể cả vành ngoài); bảng điểm sang một bên, hàng nút sang bên kia
  // (màn hình dọc: trên / dưới). Hàng nút nằm trong <Play> (dùng chung ô đang chọn, gợi ý…) nên đưa sang qua portal.
  const staged = useStaged();
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const shape = SIZES[g ? g.size : opts.size];
  const turned = useTurned(shape.w, shape.h);
  const [cols, rows] = turned ? [shape.h, shape.w] : [shape.w, shape.h];
  const ratio = (cols + 2) / (rows + 2);
  const stacked = useStacked(staged, ratio);

  return (
    <>
      <RoomHeader name={m.name} status={m.status} round={m.round} playing="đang nối">
        <span className="chip text-ink-2">
          ▦ {SIZES[size].label} {SIZES[size].w}×{SIZES[size].h}
        </span>
        <span className="chip text-ink-2">
          {MODES[mode].emoji} {MODES[mode].name}
        </span>
        <span className="chip text-ink-2">🙋 {m.players.length} người chơi · không giới hạn</span>
      </RoomHeader>

      <ActionBar view={view} session={session} />
      {!live && <Rules view={view} session={session} />}
      {g?.result && <ResultCard view={view} match={g} />}

      <StageArea
        fit="w-[min(100cqw,var(--stage-center))]"
        center={`100cqh * ${ratio}`}
        flanks={[
          <div key="a" className="sd-flank">
            {g ? <Scoreboard view={view} match={g} watched={watched} onPick={onPick} staged /> : <Roster view={view} />}
          </div>,
          <div key="b" ref={setSlot} className="sd-flank" />,
        ]}
        tools={<Buttons view={view} session={session} />}
      >
        <div ref={areaRef} className={staged ? `relative ${stacked ? "kw-stack" : ""}` : "relative mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px]"}>
          {g ? (
            <Play key={g.round} view={view} session={session} match={g} watched={watched} turned={turned} slot={slot} />
          ) : (
            <EmptyBoard view={view} turned={turned} slot={slot} />
          )}
          {g && !staged && <Scoreboard view={view} match={g} watched={watched} onPick={onPick} />}
          <Flyers flyers={flyers} />
        </div>
      </StageArea>

      {g && <Cinema match={g} count={count} win={end.shown} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

const winKey = (g?: KwMatch) =>
  g && (g.mode === "race" ? g.state.winners.length > 0 : g.result?.reason === "points" && !!g.result.winners?.length) ? g.round : 0;

function Cinema({ match: g, count, win, onClose }: { match: KwMatch; count: number; win: boolean; onClose: () => void }) {
  if (count > 0)
    return (
      <CountdownCine
        tone="lilac"
        eyebrow={`${MODES[g.mode].emoji} ${MODES[g.mode].name} · ${SIZES[g.size].label} ${SIZES[g.size].w}×${SIZES[g.size].h}`}
        n={count}
        title={g.lineup.length === 1 ? "Dọn sạch bàn nào..." : g.mode === "race" ? "Dọn sạch bàn của mình nhanh nhất để chiến thắng nhé..." : "Nối cặp nhanh tay hơn mọi người nhé..."}
        tip="Hai ô cùng hình, đường nối gấp tối đa 2 lần."
      />
    );
  if (!win) return null;
  const race = g.mode === "race";
  const winners = race ? g.state.winners : g.lineup.flatMap((s, k) => (g.result?.winners?.includes(s.uid) ? [k] : []));
  if (!winners.length) return null;
  const iWon = winners.includes(g.me);
  const names = winners.map((k) => (k === g.me ? "Bạn" : (g.lineup[k].member?.name ?? "Ai đó"))).join(", ");
  const first = winners[0];
  const solo = g.lineup.length === 1;
  const time = g.fin[first];
  return (
    <WinCine
      winners={winners.map((k) => ({ uid: g.lineup[k].uid, p: g.lineup[k].member }))}
      title={solo ? (iWon ? "Bạn dọn sạch bàn!" : `${names} dọn sạch bàn!`) : iWon && winners.length === 1 ? "Bạn chiến thắng!" : `${names} chiến thắng!`}
      sub={
        race
          ? `${solo ? "Dọn sạch bàn" : "Dọn sạch bàn đầu tiên"}${time != null ? ` sau ${clock(time)}` : ""}${g.state.hints[first] ? ` · ${g.state.hints[first]} lần gợi ý` : " · không cần gợi ý"}`
          : undefined
      }
      note={race && !g.state.over ? (rankOf(g, g.me) || g.me < 0 ? "Mọi người tiếp tục để hoàn tất ván nhé..." : "Hãy tiếp tục để hoàn tất ván nhé...") : undefined}
      onClose={onClose}
    >
      {!race && (
        <>
      <p className="cine-score">
        {g.state.score[first]} <small>điểm</small>
      </p>
      <p className="text-[15px] font-bold opacity-85">
        {winners.length > 1 ? "Đồng hạng nhất · " : ""}
        {g.state.pairs[first]} cặp{g.state.hints[first] ? ` · ${g.state.hints[first]} lần gợi ý` : " · không cần gợi ý"}
      </p>
        </>
      )}
    </WinCine>
  );
}

function ActionBar({ view, session }: { view: View; session: KawaiiRoom }) {
  const m = view.meta!;
  const g = view.game!.match;
  const live = isLive(view);
  const opened = useReached(g?.opensAt);
  const unlocked = useReached(g?.lockedUntil);
  const now = useNow(live && (!opened || (!!g?.lockedUntil && !unlocked)));

  if (live && g) {
    let message: React.ReactNode;
    let tone: string = TONE.turn;
    const counting = !opened;
    const locked = !!g.lockedUntil && !unlocked;
    const race = g.mode === "race";
    if (g.me < 0) {
      tone = TONE.idle;
      message = race ? (
        <>👀 Bạn đang xem — mỗi người một bàn, bấm vào bảng tiến độ để xem bàn của từng người.</>
      ) : (
        <>👀 Bạn đang xem — mỗi cặp vừa nối hiện đường nối theo màu người nối.</>
      );
    } else if (counting) {
      tone = TONE.hot;
      message = now ? <>⏳ Chuẩn bị… bàn lộ sau {Math.max(1, Math.ceil((g.opensAt - now) / 1000))} giây!</> : <>⏳ Chuẩn bị…</>;
    } else if (race && g.cleared) {
      tone = TONE.hot;
      const rank = rankOf(g, g.me);
      const t = g.fin[g.me];
      message =
        g.lineup.length === 1 ? (
          <>🏁 Bạn đã dọn sạch bàn{t != null ? ` (${clock(t)})` : ""}!</>
        ) : (
          <>
            🏁 Bạn đã dọn sạch bàn{rank ? <> — <b>{rank === 1 ? "về nhất" : `hạng ${rank}`}</b></> : ""}
            {t != null ? ` (${clock(t)})` : ""}. Bấm vào bảng tiến độ để xem bàn người khác…
          </>
        );
    } else if (locked) {
      tone = TONE.alert;
      message = <>🔒 Đã xin gợi ý — khoá tay {now ? Math.max(0, Math.ceil((g.lockedUntil - now) / 1000)) : HINT_LOCK_MS / 1000} giây.</>;
    } else if (race && g.state.winners.length && g.lineup.length > 1) {
      message = (
        <>
          🏆 <b>{nameIn(view, g.lineup[g.state.winners[0]].uid)}</b> đã thắng — hãy tiếp tục dọn sạch bàn để hoàn tất ván nhé!
        </>
      );
    } else if (race && g.lineup.length > 1)
      message = <>⚡ Mỗi người một bàn giống hệt nhau — dọn sạch bàn của mình trước mọi người để thắng! Xin gợi ý bị khoá tay {HINT_LOCK_MS / 1000} giây.</>;
    else if (race) message = <>⚡ Dọn sạch bàn nhanh nhất có thể — đồng hồ đang chạy! Xin gợi ý bị khoá tay {HINT_LOCK_MS / 1000} giây.</>;
    else if (g.lineup.length === 1)
      message = <>🎯 Chọn hai ô cùng hình nối được (gấp tối đa 2 lần, đi vòng viền được) — dọn sạch bàn là xong ván, không tính giờ.</>;
    else
      message = (
        <>
          🎯 Nối cặp trước người khác để ghi điểm: mỗi cặp +{PAIR_POINTS}, xin gợi ý −{HINT_COST}. Hết bàn thì nhiều điểm nhất thắng.
        </>
      );
    return (
      <StatusBar tone={tone} message={message}>
        <Buttons view={view} session={session} />
      </StatusBar>
    );
  }
  return (
    <StatusBar
      message={seatMessage(view, {
        enough: m.players.length > 0,
        startHint: "Bấm “Bắt đầu” khi mọi người sẵn sàng — chơi một mình cũng được.",
        join: "Bấm “Vào chơi” để cùng nối thú — không giới hạn người chơi.",
      })}
    >
      <Buttons view={view} session={session} />
    </StatusBar>
  );
}

// Dùng chung cho thanh trạng thái và thanh công cụ lúc trình chiếu.
function Buttons({ view, session }: { view: View; session: KawaiiRoom }) {
  const m = view.meta!;
  if (isLive(view) && view.game!.match) return view.isHost ? <StopButton onConfirm={() => session.stop()} /> : null;
  const blocked = !m.players.length ? "Cần ít nhất một người vào ghế" : !view.seats.some((s) => s.online) ? "Người chơi đang mất kết nối" : "";
  return <SeatButtons view={view} session={session} blocked={blocked} />;
}

function Rules({ view, session }: { view: View; session: KawaiiRoom }) {
  const opts = view.game!.opts;
  const host = view.isHost;
  return (
    <section className="card mt-4 grid gap-3 p-4" aria-label="Luật ván tới">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Cỡ bàn</span>
        {SIZE_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`btn btn-sm ${opts.size === k ? "btn-sun" : ""}`}
            aria-pressed={opts.size === k}
            disabled={!host && opts.size !== k}
            onClick={host ? () => session.setOptions({ size: k }) : undefined}
            title={`${kindsOf(k)} loại thú, mỗi loại 4 ô`}
          >
            {SIZES[k].label} {SIZES[k].w}×{SIZES[k].h}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Chế độ</span>
        {MODE_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`btn btn-sm ${opts.mode === k ? "btn-sun" : ""}`}
            aria-pressed={opts.mode === k}
            disabled={!host && opts.mode !== k}
            onClick={host ? () => session.setOptions({ mode: k }) : undefined}
          >
            {MODES[k].emoji} {MODES[k].name}
          </button>
        ))}
      </div>
      <p className="text-[13.5px] text-ink-2">
        Chọn hai ô cùng hình nối được bằng đường gấp khúc tối đa 3 đoạn (gấp tối đa 2 lần) chỉ qua ô trống — được đi vòng ra ngoài viền bàn. Hết cặp nối được thì bàn tự
        xáo lại. {MODES[opts.mode].text}
        {!host && " Chủ phòng chọn cỡ bàn và chế độ cho ván tới."}
      </p>
    </section>
  );
}

function ResultCard({ view, match: g }: { view: View; match: KwMatch }) {
  const r = g.result!;
  const winners = r.winners ?? [];
  if (r.reason !== "points" || !winners.length) return <StoppedCard round={g.round} />;
  const iWon = winners.includes(view.me);
  const names = winners.map((u) => nameIn(view, u)).join(", ");
  const s = g.state;
  const k = g.lineup.findIndex((x) => x.uid === winners[0]);
  const race = g.mode === "race";
  const shuffles = s.desks[race ? k : 0].shuffles;
  const t = g.fin[k];
  if (g.lineup.length === 1)
    return (
      <Result
        round={g.round}
        title={iWon ? "🧹 Bạn dọn sạch bàn!" : `🧹 ${names} dọn sạch bàn!`}
        sub={`${race ? (t != null ? `${clock(t)} · ` : "") : `${s.score[k]} điểm · `}${s.pairs[k]} cặp${s.hints[k] ? ` · ${s.hints[k]} lần gợi ý` : " · không cần gợi ý"}${shuffles ? ` · bàn tự xáo ${shuffles} lần` : ""}.`}
      />
    );
  if (race) {
    const total = (g.state.w * g.state.h) / 2;
    const rest = g.lineup.map((_, i) => i).filter((i) => !rankOf(g, i)).sort((a, b) => s.pairs[b] - s.pairs[a] || s.hints[a] - s.hints[b] || a - b);
    const done = s.finished.length;
    return (
      <Result round={g.round} title={iWon ? "🏆 Bạn về nhất!" : `🏆 ${names} về nhất!`}>
        <Standings
          rows={[...s.finished, ...rest].map((i, n) => {
            const ti = g.fin[i];
            return {
              uid: g.lineup[i].uid,
              name: nameIn(view, g.lineup[i].uid),
              rank: n < done ? n + 1 : 0,
              mark: <span className="sd-swatch" style={{ background: colorOf(i) }} aria-hidden="true" />,
              value: `${n < done ? (ti != null ? clock(ti) : "xong") : `${s.pairs[i]}/${total} cặp`}${s.hints[i] ? ` · ${s.hints[i]} gợi ý` : ""}`,
            };
          })}
        />
      </Result>
    );
  }
  const order = g.lineup.map((_, i) => i).sort((a, b) => s.score[b] - s.score[a] || s.pairs[b] - s.pairs[a] || a - b);
  const top = s.score[order[0]];
  return (
    <Result
      round={g.round}
      title={winners.length > 1 ? (iWon ? "🤝 Bạn đồng hạng nhất!" : `🤝 ${names} đồng hạng nhất!`) : iWon ? "🏆 Bạn chiến thắng!" : `🏆 ${names} chiến thắng!`}
      sub={`${top} điểm · cả phòng dọn sạch bàn ${SIZES[g.size].w}×${SIZES[g.size].h}.`}
    >
      <Standings
        rows={order.map((i) => ({
          uid: g.lineup[i].uid,
          name: nameIn(view, g.lineup[i].uid),
          rank: order.findIndex((j) => s.score[j] === s.score[i]) + 1,
          mark: <span className="sd-swatch" style={{ background: colorOf(i) }} aria-hidden="true" />,
          value: `${s.score[i]} điểm · ${s.pairs[i]} cặp${s.hints[i] ? ` · ${s.hints[i]} gợi ý` : ""}`,
        }))}
      />
    </Result>
  );
}

// Lưới (cột + 2) × (hàng + 2): vành ngoài một ô để vẽ đường nối đi vòng viền.
function Frame({ cols, rows, children, label, plain }: { cols: number; rows: number; children: React.ReactNode; label?: string; plain?: boolean }) {
  return (
    <div
      className={`kw-board ${plain ? "is-plain" : ""}`}
      role={label ? "grid" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={
        {
          gridTemplateColumns: `repeat(${cols + 2}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows + 2}, minmax(0, 1fr))`,
          aspectRatio: `${cols + 2} / ${rows + 2}`,
          "--cols": cols + 2,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

function useCueSounds(g: KwMatch | undefined, count: number, win: boolean) {
  const last = useRef(count);
  useEffect(() => {
    const prev = last.current;
    last.current = count;
    if (count > 0 && count !== prev) play("tick");
    else if (count === 0 && prev > 0) play("go");
  }, [count]);
  const onWin = useEffectEvent(() => {
    const lost = g && g.mode === "race" && g.me >= 0 && !g.state.winners.includes(g.me);
    play(lost ? "rival" : "win");
  });
  useEffect(() => {
    if (win) onWin();
  }, [win]);
}

function EmptyBoard({ view, turned, slot }: { view: View; turned: boolean; slot: HTMLElement | null }) {
  const m = view.meta!;
  const { w, h } = SIZES[view.game!.opts.size];
  const staged = useStaged();
  const [cols, rows] = turned ? [h, w] : [w, h];
  const toggles = (
    <div className={`flex flex-wrap items-center gap-2 ${staged ? "" : "mt-3"}`}>
      <AudioToggles />
    </div>
  );
  return (
    <div className="relative">
      <Frame cols={cols} rows={rows}>
        {Array.from({ length: w * h }, (_, i) => (
          <span key={i} className="kw-tile is-back" style={{ gridColumn: (i % cols) + 2, gridRow: Math.floor(i / cols) + 2 }} />
        ))}
      </Frame>
      <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
        <p className="card px-5 py-3 text-center font-display text-lg font-extrabold">
          {!m.players.length ? "Đang chờ người vào ghế…" : view.isHost ? "Bấm “Bắt đầu” để xếp bàn!" : "Đang chờ chủ phòng xếp bàn…"}
        </p>
      </div>
      {staged ? slot && createPortal(toggles, slot) : toggles}
    </div>
  );
}

const TINT_KEY = "arena:kawaii:tint";

function useTintPref() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(TINT_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(TINT_KEY, v ? "1" : "0");
    } catch {}
  };
  return [on, set] as const;
}

type Fx = { key: string; path: Point[]; color: string; cells: { i: number; kind: number }[] };

// Chỉ diễn cặp người khác nối — cặp của mình đã diễn lúc bấm.
function useFx(g: KwMatch, active: boolean, watched: number) {
  const [fx, setFx] = useState<Fx[]>([]);
  const add = (made: Fx[]) => {
    if (!made.length) return;
    setFx((list) => [...list.slice(-10), ...made]);
    setTimeout(() => setFx((list) => list.filter((x) => !made.includes(x))), FX_MS + 100);
  };
  const seen = useRef(g.state.taken.length);
  const onTaken = useEffectEvent((from: number, to: number) => {
    if (!active) return;
    const made = g.state.taken.slice(from, to).flatMap((t, n): Fx[] =>
      t.k === g.me || (g.mode === "race" && t.k !== watched)
        ? []
        : [
            {
              key: `${g.round}:${from + n}`,
              path: t.path,
              color: colorOf(t.k),
              cells: [
                { i: t.a, kind: t.kind },
                { i: t.b, kind: t.kind },
              ],
            },
          ],
    );
    if (made.length) play("other");
    add(made.slice(-4));
  });
  const n = g.state.taken.length;
  useEffect(() => {
    const from = seen.current;
    seen.current = n;
    if (n > from) onTaken(from, n);
  }, [n]);
  return { fx, add };
}

function Play({ view, session, match: g, watched, turned: turn, slot }: { view: View; session: KawaiiRoom; match: KwMatch; watched: number; turned: boolean; slot: HTMLElement | null }) {
  const live = isLive(view);
  const race = g.mode === "race";
  const spying = watched >= 0;
  const player = g.me >= 0 && !spying;
  // Bàn chỉ cần biết đã lộ / hết khoá tay chưa — vẽ lại đúng lúc đó, không theo nhịp đồng hồ.
  const opened = useReached(g.opensAt);
  const unlocked = useReached(g.lockedUntil);
  const counting = live && !opened;
  const locked = !!g.lockedUntil && !unlocked;
  const canPlay = live && player && !counting && !locked && !g.state.over;
  const { w, h } = g.state;
  const staged = useStaged();
  const [cols, rows] = turn ? [h, w] : [w, h];
  const place = (x: number, y: number) => (turn ? [y, x] : [x, y]);

  const [tinted, setTinted] = useTintPref();
  const [picked, setSel] = useState(-1);
  const [hint, setHint] = useState<{ pair: [number, number]; key: number } | null>(null);
  const [nope, setNope] = useState<{ cells: number[]; key: number } | null>(null);
  const { fx, add } = useFx(g, live && !counting, watched);
  const desk = spying ? g.state.desks[watched] : undefined;
  const tiles = desk ? desk.tiles : g.tiles;
  const left = desk ? desk.left : g.left;
  const shuffles = desk ? desk.shuffles : g.shuffles;

  const seenShuffles = useRef(shuffles);
  useEffect(() => {
    if (shuffles > seenShuffles.current && live && !counting) play("shuffle");
    seenShuffles.current = shuffles;
  }, [shuffles, live, counting]);
  const wasCleared = useRef(g.cleared);
  useEffect(() => {
    if (g.cleared && !wasCleared.current) play("clear");
    wasCleared.current = g.cleared;
  }, [g.cleared]);

  const sel = picked >= 0 && tiles[picked] >= 0 ? picked : -1;
  const hinted = hint && tiles[hint.pair[0]] >= 0 && tiles[hint.pair[1]] >= 0 ? hint.pair : null;
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), HINT_MS + (race ? HINT_LOCK_MS : 0));
    return () => clearTimeout(t);
  }, [hint, race]);
  useEffect(() => {
    if (!nope) return;
    const t = setTimeout(() => setNope(null), 450);
    return () => clearTimeout(t);
  }, [nope]);

  const pick = (i: number) => {
    if (!canPlay || tiles[i] < 0) return;
    if (sel < 0 || sel === i || tiles[sel] !== tiles[i]) {
      play(sel === i ? "unpick" : "pick");
      return setSel(sel === i ? -1 : i);
    }
    const path = session.connect(sel, i);
    play(path ? "pair" : "nope");
    if (path) {
      add([
        {
          key: `me:${Date.now()}`,
          path,
          color: colorOf(g.me),
          cells: [
            { i: sel, kind: tiles[sel] },
            { i, kind: tiles[i] },
          ],
        },
      ]);
      if (hint && (hint.pair.includes(sel) || hint.pair.includes(i))) setHint(null);
    } else setNope({ cells: [sel, i], key: Date.now() });
    setSel(-1);
  };

  const askHint = () => {
    const pair = session.hint();
    if (!pair) return;
    play("hint");
    setHint({ pair, key: Date.now() });
  };

  const cells = [];
  for (let i = 0; i < w * h; i++) {
    const kind = tiles[i];
    if (kind < 0) continue;
    const [cx, cy] = place(i % w, Math.floor(i / w));
    const cls = ["kw-tile", i === sel ? "is-sel" : "", hinted?.includes(i) ? "is-hint" : "", nope?.cells.includes(i) ? "is-nope" : "", counting ? "is-back" : ""].join(" ");
    cells.push(
      <button
        key={nope?.cells.includes(i) ? `${i}:${nope.key}` : i}
        type="button"
        className={cls}
        style={{ gridColumn: cx + 2, gridRow: cy + 2, "--kh": hueOf(kind) } as React.CSSProperties}
        onClick={() => pick(i)}
        disabled={!canPlay}
        aria-pressed={i === sel}
        aria-label={counting ? "Ô úp" : `Hàng ${Math.floor(i / w) + 1}, cột ${(i % w) + 1}: ${TILES[kind]}`}
      >
        {counting ? null : <span aria-hidden="true">{TILES[kind]}</span>}
      </button>,
    );
  }
  for (const f of fx)
    for (const c of f.cells) {
      const [cx, cy] = place(c.i % w, Math.floor(c.i / w));
      cells.push(
        <span key={`${f.key}:${c.i}`} className="kw-tile is-gone" style={{ gridColumn: cx + 2, gridRow: cy + 2, "--kh": hueOf(c.kind) } as React.CSSProperties} aria-hidden="true">
          <span>{TILES[c.kind]}</span>
        </span>,
      );
    }

  const maxWidth = staged ? undefined : `${(cols + 2) * 58}px`;
  const spy = spying && (
    <p className={`flex items-center gap-1.5 text-[13px] font-bold text-ink-2 ${staged ? "" : "mb-2"}`}>
      <span className="sd-swatch" style={{ background: colorOf(watched) }} aria-hidden="true" />
      👀 Đang xem bàn của {nameIn(view, g.lineup[watched].uid)}
      {rankOf(g, watched) ? " · đã dọn xong" : ""}
    </p>
  );

  const controls = (
    <div className="mx-auto flex w-full flex-wrap items-center gap-2" style={{ maxWidth }}>
      {player && live && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={askHint}
          disabled={!canPlay || !!hinted}
          title={race ? `Chỉ một cặp nối được — bị khoá tay ${HINT_LOCK_MS / 1000} giây` : `Chỉ một cặp nối được — bị trừ ${HINT_COST} điểm`}
        >
          💡 <span className="sd-tool-label">Gợi ý ({race ? `khoá ${HINT_LOCK_MS / 1000}s` : `−${HINT_COST}`})</span>
        </button>
      )}
      <button
        type="button"
        className={`btn btn-sm ${tinted ? "btn-sun" : ""}`}
        onClick={() => setTinted(!tinted)}
        aria-pressed={tinted}
        title="Tô nền mỗi ô theo loại thú — chỉ áp dụng trên máy bạn"
      >
        🎨 <span className="sd-tool-label">Màu nền ô: {tinted ? "hiện" : "ẩn"}</span>
      </button>
      <AudioToggles />
      <span className="ml-auto text-[12.5px] font-semibold text-ink-3">
        Còn {left}/{w * h} ô{shuffles ? ` · đã xáo ${shuffles} lần` : ""}
        {player && live && !counting ? locked ? <> · <LockLeft until={g.lockedUntil} /></> : sel < 0 ? " · chọn ô thứ nhất" : " · chọn ô cùng hình" : ""}
      </span>
    </div>
  );

  return (
    <div className="grid gap-3">
      <div className="relative mx-auto w-full" style={{ maxWidth }}>
        {!staged && spy}
        <Frame cols={cols} rows={rows} label={spying ? `Bàn nối thú của ${nameIn(view, g.lineup[watched].uid)}` : `Bàn nối thú ${w}×${h}`} plain={!tinted}>
          {cells}
        </Frame>
        <svg className="kw-paths" viewBox={`0 0 ${cols + 2} ${rows + 2}`} preserveAspectRatio="none" aria-hidden="true">
          {fx.map((f) => (
            <polyline
              key={f.key}
              points={f.path
                .map(([x, y]) => place(x, y))
                .map(([x, y]) => `${x + 1.5},${y + 1.5}`)
                .join(" ")}
              style={{ stroke: f.color }}
            />
          ))}
        </svg>
        {counting && <div className="sd-hush" aria-hidden="true" />}
      </div>
      {staged
        ? slot &&
          createPortal(
            <>
              {spy}
              {controls}
            </>,
            slot,
          )
        : controls}
    </div>
  );
}

// Tách riêng để nhịp đồng hồ chỉ vẽ lại dòng chữ này, không kéo cả bàn.
function LockLeft({ until }: { until: number }) {
  const now = useNow(true);
  return <>{now ? `🔒 khoá tay ${Math.max(0, Math.ceil((until - now) / 1000))}s` : "🔒 khoá tay"}</>;
}

// Tách riêng để nhịp đồng hồ không kéo cả bảng.
function Elapsed({ from, live }: { from: number; live: boolean }) {
  const now = useNow(live);
  if (!live || !now || now <= from) return null;
  return (
    <span className="font-display text-lg font-extrabold tabular-nums" title="Thời gian từ lúc lộ bàn">
      ⏱ {clock(now - from)}
    </span>
  );
}

// `staged`: bản ở mạn bên lúc trình chiếu — mạn bên tự cuộn khi đông người; màn hình dọc xếp một hàng cuộn ngang.
function Scoreboard({ view, match: g, watched, onPick, staged }: { view: View; match: KwMatch; watched: number; onPick?: (k: number) => void; staged?: boolean }) {
  const s = g.state;
  const race = g.mode === "race";
  const total = (s.w * s.h) / 2;
  const done = (k: number) => rankOf(g, k) || Infinity;
  const order = g.lineup
    .map((_, k) => k)
    .sort((a, b) => (race ? done(a) - done(b) : 0) || (race ? 0 : s.score[b] - s.score[a]) || s.pairs[b] - s.pairs[a] || a - b);
  const winners = new Set(race ? s.winners.map((k) => g.lineup[k].uid) : (g.result?.winners ?? []));
  const canPick = race && watched >= 0 && !!onPick;
  return (
    <section className={`card ${staged ? "sd-score" : "p-4"}`} aria-labelledby="kw-score-h">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="kw-score-h" className="font-display text-lg font-extrabold">
          {race ? "⚡ Tiến độ" : "🏅 Bảng điểm"}
        </h2>
        {race && <Elapsed from={g.opensAt} live={isLive(view) && !s.over} />}
      </div>
      <p className="text-[12.5px] font-semibold text-ink-3">
        {race
          ? `${g.lineup.length} người chơi · mỗi người ${total} cặp${canPick ? " · bấm để xem bàn" : ""}`
          : `${g.lineup.length} người chơi · mỗi cặp +${PAIR_POINTS}, gợi ý −${HINT_COST}`}
      </p>
      <ol className={staged ? "sd-score-list mt-3" : "mt-3 grid max-h-[480px] grid-cols-1 gap-3 overflow-y-auto pr-1"}>
        {order.map((k, rank) => {
          const seat = g.lineup[k];
          const p = seat.member;
          const name = seat.uid === view.me ? "Bạn" : (p?.name ?? "Ai đó");
          // Bàn của mình (đối kháng) dựng ngay trên máy mình — nhanh hơn chủ phòng ghi nhận.
          const pairs = race && k === g.me ? total - g.left / 2 : s.pairs[k];
          const hints = race && k === g.me ? g.hints : s.hints[k];
          const pickable = canPick && k !== g.me;
          const body = (
            <>
              <span className="sd-rank w-5 shrink-0 text-center text-[13px] font-extrabold text-ink-3">{rank + 1}</span>
              <span className="sd-face relative shrink-0">
                {p ? <Avatar p={p} size={34} className={seat.online ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[34px] w-[34px] bg-sunken" />}
                {winners.has(seat.uid) && (
                  <span className="absolute -right-2 -bottom-1 text-base" aria-label="Thắng">
                    🏆
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 text-[14px] font-bold">
                  <span className="sd-swatch" style={{ background: colorOf(k) }} aria-hidden="true" />
                  <span className="min-w-0 truncate">{name}</span>
                  {watched === k && <span aria-label="Đang xem">👀</span>}
                </p>
                {race ? (
                  <>
                    <div className="sd-bar mt-1" aria-hidden="true">
                      <span style={{ width: `${(100 * pairs) / Math.max(1, total)}%`, background: colorOf(k) }} />
                    </div>
                    <p className="mt-0.5 text-[11.5px] font-semibold text-ink-3">
                      {rankOf(g, k) ? `🏁 Xong${g.fin[k] != null ? ` ${clock(g.fin[k]!)}` : ""}` : `🐾 ${pairs}/${total} cặp`}
                      {hints ? ` · 💡 ${hints}` : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-[11.5px] font-semibold text-ink-3">
                    🐾 {s.pairs[k]} cặp{s.hints[k] ? ` · 💡 ${s.hints[k]}` : ""}
                  </p>
                )}
              </div>
              {!race && <span className="shrink-0 font-display text-2xl font-extrabold tabular-nums">{s.score[k]}</span>}
            </>
          );
          return (
            <li key={seat.uid} className="min-w-0">
              {pickable ? (
                <button
                  type="button"
                  className={`-m-1 flex w-[calc(100%+0.5rem)] min-w-0 items-center gap-2.5 rounded-xl p-1 text-left hover:bg-sunken ${watched === k ? "bg-sunken" : ""}`}
                  onClick={() => onPick!(k)}
                  aria-pressed={watched === k}
                  title={`Xem bàn của ${name}`}
                >
                  {body}
                </button>
              ) : (
                <div className="flex min-w-0 items-center gap-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
