"use client";

import { memo, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  accuracy,
  badges,
  carIndex,
  CARS,
  carOf,
  carPoints,
  clock,
  colorOf,
  CUSTOM_MAX,
  CUSTOM_MIN,
  FINISH_GRACE_MS,
  goalLabel,
  LANG_KEYS,
  LANGS,
  LENGTH_MAX,
  LENGTH_MIN,
  LENGTHS,
  LEVEL_KEYS,
  LEVELS,
  MINUTES,
  MINUTES_MAX,
  MINUTES_MIN,
  MODE_KEYS,
  MODES,
  nAt,
  recentWpm,
  scan,
  shapeAt,
  shapeOf,
  SHAPES,
  standings,
  wpm,
  type Level,
  type Standing,
  type TrOptions,
  type TrRec,
} from "@/lib/games/typing-race";
import { START_COUNTDOWN_MS, type RoomState, type RoomView } from "@/lib/net/room";
import type { TrMatch, TrView, TypingRaceRoom } from "@/lib/net/typing-race-room";
import { AudioToggles } from "../audio/AudioToggles";
import { ConfirmButton } from "../ConfirmButton";
import { Avatar } from "../Avatar";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel } from "./People";
import { ResultCard as Result, Standings } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout } from "./RoomLayout";
import { SeatButtons, seatMessage, StatusBar, StopButton, TONE } from "./StatusBar";
import { shallowEqual, useFlyers, useGame, usePeople, useRoomState } from "./useRoom";
import { CarArt, Gauge, Scenery, StartLights } from "./TypingRaceArt";
import { Badges, Podium, WpmChart, type Racer } from "./TypingRaceResults";
import { beats, bestCombo, countRace, ghostKey, keepCombo, readGhost, record as remember, saveGhost, useGhost, useStats, type Ghost } from "./typingRaceStore";
import { play, setEngine } from "./typingRaceSounds";

type View = Omit<RoomView<TrView>, "chat">;

const CONFETTI = ["🏁", "🏆", "🚗", "⌨️", "🎉", "✨"];
const WIN_SCENE_MS = 6500;
// Tốc độ xe tính trên chừng này giây gần nhất.
const SPEED_WINDOW_MS = 4000;
// Khung văn bản chỉ dựng quanh chỗ đang gõ: đua theo thời gian văn bản rất dài.
const BEHIND = 240;
const AHEAD = 900;

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

// Chỉ vẽ lại đúng một lần lúc vượt mốc (xuất phát, hết giờ), không theo nhịp đồng hồ.
function useReached(at: number | undefined) {
  const [hit, setHit] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (at === undefined) return;
    const t = setTimeout(() => setHit(at), Math.max(0, at - Date.now()));
    return () => clearTimeout(t);
  }, [at]);
  return at !== undefined && hit === at;
}

function useTrView(session: TypingRaceRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

function useTrLive(session: TypingRaceRoom) {
  const room = useRoomState(session, (r) => ({ status: r.meta!.status, round: r.meta!.round }), shallowEqual);
  const round = useGame(session, (v) => v?.match?.round);
  return room.status === "playing" && round === room.round;
}

const isLive = (view: View) => view.meta!.status === "playing" && view.game?.match?.round === view.meta!.round;

const nameOf = (g: TrMatch, k: number, me: string) => (g.lineup[k].uid === me ? "Bạn" : (g.lineup[k].member?.name ?? "Ai đó"));

const pct = (v: number) => `${Math.floor(v)}%`;

export function TypingRaceTable({ id, slug, session }: { id: string; slug: string; session: TypingRaceRoom }) {
  const head = useRoomState(session, headOf, shallowEqual);
  const live = useTrLive(session);
  const shown = useGame(session, (v) => (live && v?.match ? v.match.opts : v!.opts), shallowEqual);
  const round = useGame(session, (v) => v?.match?.round ?? 0);
  const playing = useGame(session, (v) => (v?.match?.me ?? -1) >= 0);

  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<ChatPanel session={session} />}>
      <RoomHeader name={head.name} status={head.status} round={head.round} playing="đang đua">
        <span className="chip text-ink-2">
          {MODES[shown.mode].emoji} {goalLabel(shown)}
        </span>
        {shown.source === "custom" ? (
          <span className="chip text-ink-2">✍️ Văn bản tự nhập</span>
        ) : (
          <>
            <span className="chip text-ink-2">
              {LANGS[shown.lang].emoji} {LANGS[shown.lang].name}
            </span>
            <span className="chip text-ink-2">
              {LEVELS[shown.level].emoji} {LEVELS[shown.level].name}
            </span>
          </>
        )}
      </RoomHeader>

      <ActionPart session={session} />
      <ResultPart session={session} />
      {!live && <SetupPart session={session} />}
      <TrackPart session={session} />
      {live && playing && <PadPart key={round} session={session} />}
      {live && !playing && <WatchPart key={round} session={session} />}
      <CinemaPart session={session} />
    </RoomLayout>
  );
}

const headOf = (r: RoomState) => ({ name: r.meta!.name, status: r.meta!.status, round: r.meta!.round });

const ActionPart = memo(function ActionPart({ session }: { session: TypingRaceRoom }) {
  const view = useTrView(session);
  return <ActionBar view={view} session={session} />;
});

const SetupPart = memo(function SetupPart({ session }: { session: TypingRaceRoom }) {
  const view = useTrView(session);
  return <Setup view={view} session={session} />;
});

const ResultPart = memo(function ResultPart({ session }: { session: TypingRaceRoom }) {
  const view = useTrView(session);
  const g = view.game!.match;
  return g?.result ? <ResultCard key={g.seed} view={view} match={g} session={session} /> : null;
});

const TrackPart = memo(function TrackPart({ session }: { session: TypingRaceRoom }) {
  const view = useTrView(session);
  const ref = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, ref);
  const g = view.game!.match;
  // Ghi diễn biến ván cho biểu đồ cuối ván và xe ma.
  useEffect(() => {
    if (g) remember(session, g.seed, g.recs);
  }, [session, g?.seed, g?.recs]); // eslint-disable-line react-hooks/exhaustive-deps
  const ghost = useGhost(g?.opts ?? view.game!.opts);
  return (
    <div ref={ref} className="relative mt-4">
      {g ? <Track view={view} match={g} ghost={ghost} /> : <Grid view={view} />}
      <Flyers flyers={flyers} />
    </div>
  );
});

const PadPart = memo(function PadPart({ session }: { session: TypingRaceRoom }) {
  const g = useGame(session, (v) => v?.match);
  return g ? <Pad session={session} match={g} /> : null;
});

const WatchPart = memo(function WatchPart({ session }: { session: TypingRaceRoom }) {
  const g = useGame(session, (v) => v?.match);
  const me = useRoomState(session, (r) => r.me);
  return g ? <Watch match={g} me={me} /> : null;
});

const CinemaPart = memo(function CinemaPart({ session }: { session: TypingRaceRoom }) {
  const live = useTrLive(session);
  const g = useGame(session, (v) => v?.match);
  const me = useRoomState(session, (r) => r.me);
  // Vào phòng / tải lại giữa lúc đếm thì vẫn đếm nốt phần còn lại tới lúc xuất phát.
  const count = useCountdown(live && g ? g.round : 0, { endsAt: g?.opensAt, ms: START_COUNTDOWN_MS, onMount: true });
  const end = useEndScene(g?.result && g.result.reason !== "stop" && g.final?.some((s) => s.rank === 1 && s.n > 0) ? g.round : 0, { ms: WIN_SCENE_MS, emojis: CONFETTI });
  // Mỗi nhịp đếm một tiếng đèn đỏ, xuất phát thì đèn xanh; màn thắng của mình có nhạc thắng.
  const lastCount = useRef(count);
  useEffect(() => {
    const prev = lastCount.current;
    lastCount.current = count;
    if (count > 0 && count !== prev) play("light");
    else if (count === 0 && prev > 0) play("start");
  }, [count]);
  const onWin = useEffectEvent(() => {
    if (g && g.me >= 0 && g.final?.some((s) => s.k === g.me && s.rank === 1 && s.n > 0)) play("win");
  });
  useEffect(() => {
    if (end.shown) onWin();
  }, [end.shown]);
  return (
    <>
      {g && <Cinema match={g} me={me} count={count} win={end.shown} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

function Cinema({ match: g, me, count, win, onClose }: { match: TrMatch; me: string; count: number; win: boolean; onClose: () => void }) {
  if (count > 0)
    return (
      <CountdownCine
        tone="duel"
        eyebrow={`${MODES[g.opts.mode].emoji} ${goalLabel(g.opts)}${g.opts.source === "custom" ? " · ✍️ Văn bản tự nhập" : ` · ${LANGS[g.opts.lang].name} · ${LEVELS[g.opts.level].name}`}`}
        n={count}
        title={g.me >= 0 ? "Đặt tay lên hàng phím ASDF… sẵn sàng!" : "Các tay đua đã vào vạch xuất phát!"}
        tip={g.me >= 0 ? "Gõ đúng thì xe tiến, gõ sai phải xoá lỗi rồi gõ lại." : undefined}
      >
        <StartLights big lit={Math.max(0, Math.min(5, (4 - count) * 2 - 1))} />
      </CountdownCine>
    );
  if (!win || !g.final) return null;
  const top = g.final.filter((s) => s.rank === 1 && s.n > 0);
  if (!top.length) return null;
  const solo = g.lineup.length === 1;
  const iWon = top.some((s) => s.k === g.me);
  const names = top.map((s) => nameOf(g, s.k, me)).join(", ");
  const first = top[0];
  const ms = first.fin ?? g.end ?? 0;
  return (
    <WinCine
      winners={top.map((s) => ({ uid: g.lineup[s.k].uid, p: g.lineup[s.k].member }))}
      trophy={solo ? "🏁" : "🏆"}
      title={solo ? (first.fin != null ? "Về đích rồi!" : "Hết giờ!") : iWon && top.length === 1 ? "Bạn chiến thắng!" : `${names} chiến thắng!`}
      sub={`${first.fin != null ? `Về đích sau ${clock(first.fin)} · ` : `${first.n.toLocaleString("vi-VN")} ký tự · `}${Math.round(wpm(first.n, ms))} WPM · chính xác ${pct(accuracy(first.n, first.e))}`}
      onClose={onClose}
    />
  );
}

// ——— Thanh trạng thái ———

function myRec(g: TrMatch) {
  return g.me >= 0 ? g.recs[g.me] : null;
}

function ActionBar({ view, session }: { view: View; session: TypingRaceRoom }) {
  const g = view.game!.match;
  const live = isLive(view);
  const opened = useReached(g?.opensAt);
  const firstFin = g && g.opts.mode === "chars" ? Math.min(...g.recs.map((r) => r?.fin ?? Infinity)) : Infinity;
  const now = useNow(live && (!opened || Number.isFinite(firstFin)), 500);

  if (live && g) {
    const mine = myRec(g);
    let message: React.ReactNode;
    let tone: string = TONE.turn;
    if (!opened) {
      tone = TONE.hot;
      message = now ? <>⏳ Chuẩn bị… xuất phát sau {Math.max(1, Math.ceil((g.opensAt - now) / 1000))} giây!</> : <>⏳ Chuẩn bị…</>;
    } else if (g.me < 0) {
      tone = TONE.info;
      message = <>👀 Bạn đang xem cuộc đua — ván sau bấm “Vào chơi” để cùng đua nhé.</>;
    } else if (mine?.quit) {
      tone = TONE.idle;
      message = <>🏳️ Bạn đã bỏ cuộc — thành tích chỉ để tham khảo. Chờ mọi người về đích…</>;
    } else if (mine?.fin != null) {
      tone = TONE.hot;
      const rank = standings("chars", g.recs).find((s) => s.k === g.me)?.rank ?? 0;
      message = (
        <>
          🏁 Bạn đã về đích{rank ? <> — <b>{rank === 1 ? "về nhất" : `hạng ${rank}`}</b></> : null} sau {clock(mine.fin)}. Chờ mọi người hoàn thành…
        </>
      );
    } else if (Number.isFinite(firstFin)) {
      tone = TONE.alert;
      const k = g.recs.findIndex((r) => r?.fin === firstFin);
      const left = now ? Math.max(0, Math.ceil((g.opensAt + firstFin + FINISH_GRACE_MS - now) / 1000)) : 60;
      message = (
        <>
          🏁 <b>{nameOf(g, k, view.me)}</b> đã về đích — còn <b>{left} giây</b> để hoàn thành!
        </>
      );
    } else
      message =
        g.opts.mode === "time" ? (
          <>⏱ Gõ liên tục tới khi hết giờ — ai đi xa nhất thắng. Gõ sai phải xoá lỗi rồi gõ lại.</>
        ) : (
          <>⌨️ Gõ đúng để xe tiến lên — về đích trước thì thắng. Gõ sai phải xoá lỗi rồi gõ lại.</>
        );
    const canQuit = g.me >= 0 && opened && !mine?.quit && mine?.fin == null;
    return (
      <StatusBar tone={tone} message={message}>
        {canQuit && (
          <ConfirmButton className="btn" onConfirm={() => session.report({ ...(session.saved(g.round) ?? { p: 0, n: 0, e: 0, at: 0, v: 0 }), v: 0, quit: true }, true)} confirmLabel="Bấm lần nữa để bỏ cuộc">
            🏳️ Bỏ cuộc
          </ConfirmButton>
        )}
        {view.isHost && <StopButton onConfirm={() => session.stop()} />}
        <AudioToggles />
      </StatusBar>
    );
  }
  const opts = view.game!.opts;
  const needText = opts.source === "custom" && view.game!.drafted < CUSTOM_MIN;
  const m = view.meta!;
  const blocked = !m.players.length
    ? "Cần ít nhất một người vào ghế"
    : !view.seats.some((s) => s.online)
      ? "Người chơi đang mất kết nối"
      : needText
        ? `Chủ phòng cần nhập văn bản (ít nhất ${CUSTOM_MIN} ký tự)`
        : "";
  return (
    <StatusBar
      message={
        needText && view.isHost ? (
          <>✍️ Nhập văn bản đua ở bên dưới (ít nhất {CUSTOM_MIN} ký tự) rồi bấm “Bắt đầu”.</>
        ) : (
          seatMessage(view, { enough: true, startHint: "Bấm “Bắt đầu” khi mọi người sẵn sàng.", join: "Bấm “Vào chơi” để lên xe cùng đua." })
        )
      }
    >
      <SeatButtons view={view} session={session} blocked={blocked} joinLabel="🏎️ Vào chơi" />
      <AudioToggles />
    </StatusBar>
  );
}

// ——— Thiết lập ván ———

function Setup({ view, session }: { view: View; session: TypingRaceRoom }) {
  const { opts, draft, drafted, myCar } = view.game!;
  const host = view.isHost;
  const stats = useStats();
  const points = carPoints(stats);
  const color = myCar % CARS.length;
  const shape = shapeAt(myCar);
  const set = (next: Partial<TrOptions>) => host && session.setOptions(next);
  const pick = <T,>(label: string, keys: readonly T[], on: (k: T) => boolean, name: (k: T) => React.ReactNode, choose: (k: T) => void, title?: (k: T) => string) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[92px] text-[13px] font-bold text-ink-3">{label}</span>
      {keys.map((k) => (
        <button
          key={String(k)}
          type="button"
          className={`btn btn-sm ${on(k) ? "btn-sun" : ""}`}
          aria-pressed={on(k)}
          disabled={!host && !on(k)}
          onClick={host ? () => choose(k) : undefined}
          title={title?.(k)}
        >
          {name(k)}
        </button>
      ))}
    </div>
  );
  const custom = opts.source === "custom";
  return (
    <section className="card mt-4 grid gap-3 p-4" aria-label="Thiết lập ván tới">
      {pick("Thể thức", MODE_KEYS, (k) => opts.mode === k, (k) => `${MODES[k].emoji} ${MODES[k].name}`, (k) => set({ mode: k }))}
      {opts.mode === "chars" ? (
        !custom && (
          <Amount
            label="Độ dài"
            host={host}
            presets={LENGTHS}
            value={opts.length}
            min={LENGTH_MIN}
            max={LENGTH_MAX}
            unit="ký tự"
            name={(n) => n.toLocaleString("vi-VN")}
            onChange={(length) => set({ length })}
          />
        )
      ) : (
        <Amount label="Thời gian" host={host} presets={MINUTES} value={opts.minutes} min={MINUTES_MIN} max={MINUTES_MAX} unit="phút" name={(n) => `${n} phút`} onChange={(minutes) => set({ minutes })} />
      )}
      {pick("Văn bản", ["random", "custom"] as const, (k) => opts.source === k, (k) => (k === "random" ? "🎲 Hệ thống chọn" : "✍️ Chủ phòng nhập"), (k) => set({ source: k }))}
      {!custom && (
        <>
          {pick("Ngôn ngữ", LANG_KEYS, (k) => opts.lang === k, (k) => `${LANGS[k].emoji} ${LANGS[k].name}`, (k) => set({ lang: k }))}
          {pick("Độ khó", LEVEL_KEYS, (k) => opts.level === k, (k) => `${LEVELS[k].emoji} ${LEVELS[k].name}`, (k) => set({ level: k }), (k) => LEVELS[k].text)}
        </>
      )}
      {custom && (host ? <Draft session={session} saved={draft ?? ""} /> : <p className="rounded-xl bg-sunken p-3 text-[13.5px] text-ink-2">{drafted ? `✍️ Chủ phòng đã nhập văn bản ${drafted.toLocaleString("vi-VN")} ký tự — sẽ hiện khi xuất phát.` : "✍️ Đang chờ chủ phòng nhập văn bản đua…"}</p>)}
      <p className="text-[13.5px] text-ink-2">
        {MODES[opts.mode].text} {!custom && LEVELS[opts.level].text}
        {!host && " Chủ phòng chọn cấu hình cho ván tới."} Văn bản chỉ hiện khi cuộc đua bắt đầu.
      </p>
      <div className="border-t-2 border-dashed border-rule pt-3">
        <p className="mb-2 text-[13px] font-bold text-ink-3">🏎️ Xe của bạn</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Chọn dáng xe">
          {SHAPES.map((sh, i) => {
            const locked = points < sh.need;
            return (
              <button
                key={sh.key}
                type="button"
                role="radio"
                aria-checked={shape === i}
                disabled={locked && shape !== i}
                className={`tr-pick ${shape === i ? "is-on" : ""} ${locked ? "is-locked" : ""}`}
                onClick={() => session.setCar(carIndex(color, i))}
                title={locked ? `${sh.name} — cần ${sh.need} điểm xe (bạn có ${points})` : sh.name}
              >
                <CarArt color={CARS[color].color} shape={sh.key} />
                <span className="tr-pick-name">{locked ? `🔒 ${sh.need} điểm` : sh.name}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Chọn màu xe">
          {CARS.map((c, i) => (
            <button
              key={c.name}
              type="button"
              role="radio"
              aria-checked={color === i}
              className={`tr-color ${color === i ? "is-on" : ""}`}
              style={{ background: c.color }}
              onClick={() => session.setCar(carIndex(i, shape))}
              title={c.name}
            >
              <span className="sr-only">{c.name}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] font-semibold text-ink-3">
          Điểm xe của bạn: <b className="text-ink-2">{points}</b> — mỗi ván chơi trọn +1, thắng ván nhiều người +2 nữa. Dáng xe mới mở khoá theo điểm (lưu trên máy này).
        </p>
      </div>
    </section>
  );
}

function Amount({
  label,
  host,
  presets,
  value,
  min,
  max,
  unit,
  name,
  onChange,
}: {
  label: string;
  host: boolean;
  presets: readonly number[];
  value: number;
  min: number;
  max: number;
  unit: string;
  name: (n: number) => string;
  onChange: (n: number) => void;
}) {
  const preset = presets.includes(value);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  const own = editing || !preset;
  const save = () => {
    const n = Math.round(Number(text));
    if (Number.isFinite(n) && n > 0) onChange(Math.min(max, Math.max(min, n)));
    else setText(String(value));
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[92px] text-[13px] font-bold text-ink-3">{label}</span>
      {presets.map((p) => (
        <button
          key={p}
          type="button"
          className={`btn btn-sm ${value === p && !editing ? "btn-sun" : ""}`}
          aria-pressed={value === p && !editing}
          disabled={!host && value !== p}
          onClick={
            host
              ? () => {
                  setEditing(false);
                  onChange(p);
                }
              : undefined
          }
        >
          {name(p)}
        </button>
      ))}
      {host ? (
        own ? (
          <label className="flex items-center gap-1.5 text-[13px] font-bold">
            <input
              type="number"
              className="field !w-[96px] !py-1 text-[14px]"
              min={min}
              max={max}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => {
                save();
                setEditing(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              autoFocus={editing}
              aria-label={`${label} tùy chỉnh (${min}–${max} ${unit})`}
            />
            {unit}
          </label>
        ) : (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setText(String(value));
              setEditing(true);
            }}
          >
            ✏️ Tùy chỉnh
          </button>
        )
      ) : (
        !preset && (
          <span className="btn btn-sm btn-sun" aria-pressed="true">
            {name(value)}
          </span>
        )
      )}
    </div>
  );
}

function Draft({ session, saved }: { session: TypingRaceRoom; saved: string }) {
  const [text, setText] = useState(saved);
  const [base, setBase] = useState(saved);
  // Bản đã lưu đổi từ nơi khác (vd. đổi chủ phòng) thì lấy theo, trừ khi đang sửa dở.
  if (saved !== base) {
    setBase(saved);
    if (text === base) setText(saved);
  }
  useEffect(() => {
    if (text === saved) return;
    const t = setTimeout(() => session.setText(text), 700);
    return () => clearTimeout(t);
  }, [text, saved, session]);
  return (
    <div>
      <textarea
        className="field min-h-[110px] w-full resize-y text-[14.5px]"
        value={text}
        maxLength={CUSTOM_MAX}
        placeholder="Dán hoặc gõ đoạn văn bản cả phòng sẽ đua…"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => session.setText(text)}
        aria-label="Văn bản đua do chủ phòng nhập"
      />
      <p className="mt-1 text-[12.5px] font-semibold text-ink-3">
        {saved.length.toLocaleString("vi-VN")}/{CUSTOM_MAX.toLocaleString("vi-VN")} ký tự (tối thiểu {CUSTOM_MIN}) · tự bỏ tab, emoji và đổi dấu ngoặc cong, gạch dài sang ký tự thường.
      </p>
    </div>
  );
}

// ——— Kết quả ———

function rowValue(g: TrMatch, s: Standing) {
  const ms = s.fin ?? (g.opts.mode === "time" ? g.opts.minutes * 60000 : (g.end ?? 0));
  const stats = `${Math.round(wpm(s.n, ms))} WPM · ${pct(accuracy(s.n, s.e))}`;
  if (s.quit) return `Bỏ cuộc · ${s.n.toLocaleString("vi-VN")} ký tự`;
  if (s.out) return "Gian lận";
  if (g.opts.mode === "time") return `${s.n.toLocaleString("vi-VN")} ký tự · ${stats}`;
  return s.fin != null ? `⏱ ${clock(s.fin)} · ${stats}` : `${s.n.toLocaleString("vi-VN")}/${g.text.length.toLocaleString("vi-VN")} · ${stats}`;
}

const racersOf = (g: TrMatch, me: string): Racer[] =>
  g.lineup.map((s, k) => ({
    k,
    uid: s.uid,
    name: nameOf(g, k, me),
    member: s.member,
    color: colorOf(g.cars[k]).color,
    shape: shapeOf(g.cars[k]),
    num: k + 1,
    me: k === g.me,
  }));

const runLabel = (r: { fin?: number; n: number }) => (r.fin != null ? clock(r.fin) : `${r.n.toLocaleString("vi-VN")} ký tự`);

function ResultCard({ view, match: g, session }: { view: View; match: TrMatch; session: TypingRaceRoom }) {
  const r = g.result!;
  const final = g.final ?? [];
  const top = final.filter((s) => s.rank === 1 && s.n > 0);
  const solo = g.lineup.length === 1;
  const mine = final.find((s) => s.k === g.me);
  const pts = remember(session, g.seed, g.recs);
  const racers = racersOf(g, view.me);
  // Kỷ lục trước ván này — đọc một lần trước khi lưu kỷ lục mới.
  const [prev] = useState(() => readGhost(g.opts));
  const played = g.me >= 0 && r.reason !== "stop" && !!mine && !mine.out && mine.n > 0;
  const isRecord = played && !!ghostKey(g.opts) && beats(g.opts.mode, mine!, prev);

  // Chơi trọn ván thì cộng điểm xe; phá kỷ lục cấu hình này thì lưu làm xe ma.
  useEffect(() => {
    if (!played) return;
    countRace(g.seed, !solo && mine!.rank === 1);
    const mineSeries = pts[g.me] ?? [];
    if (mineSeries.length >= 3 && beats(g.opts.mode, mine!, readGhost(g.opts))) saveGhost(g.opts, { n: mine!.n, pts: mineSeries, ...(mine!.fin != null ? { fin: mine!.fin } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.seed, played]);

  const rows = (
    <Standings
      rows={final.map((s) => ({
        uid: g.lineup[s.k].uid,
        name: nameOf(g, s.k, view.me),
        rank: s.rank,
        mark: <span className="sd-swatch" style={{ background: colorOf(g.cars[s.k]).color }} aria-hidden="true" />,
        value: rowValue(g, s),
      }))}
    />
  );
  const combo = bestCombo(session, g.seed);
  const note = mine
    ? `Bạn: ${mine.n.toLocaleString("vi-VN")} ký tự đúng · ${mine.e} lần gõ sai · chính xác ${pct(accuracy(mine.n, mine.e))}${combo ? ` · combo dài nhất x${combo}` : ""}`
    : undefined;
  if (r.reason === "stop" || !top.length)
    return (
      <Result round={g.round} title="⏹ Dừng ván" sub={`Ván ${g.round} dừng giữa chừng — không tính ai thắng.`} note={note}>
        {final.length > 0 && rows}
      </Result>
    );
  const names = top.map((s) => nameOf(g, s.k, view.me)).join(", ");
  const title = solo
    ? "🏁 Kết quả luyện tập"
    : top.length > 1
      ? `🤝 ${names} đồng hạng nhất!`
      : top[0].k === g.me
        ? g.opts.mode === "chars"
          ? "🏆 Bạn về nhất!"
          : "🏆 Bạn đi xa nhất!"
        : g.opts.mode === "chars"
          ? `🏆 ${names} về nhất!`
          : `🏆 ${names} đi xa nhất!`;
  const end = g.end ?? Math.max(0, ...g.recs.map((x) => x?.at ?? 0));
  const podium = final
    .filter((s) => !s.out && s.rank > 0 && s.n > 0)
    .slice(0, 3)
    .map((s) => ({ racer: racers[s.k], rank: s.rank, value: s.fin != null ? `⏱ ${clock(s.fin)}` : `${s.n.toLocaleString("vi-VN")} ký tự` }));
  const stopOf = (k: number) => {
    const s = final.find((x) => x.k === k);
    return s?.fin ?? (s?.quit ? s.at : undefined);
  };
  return (
    <Result round={g.round} title={title} note={note}>
      {isRecord && (
        <p className="tr-record">
          👻 Kỷ lục mới của bạn cho {goalLabel(g.opts)} · {LANGS[g.opts.lang].name} · {LEVELS[g.opts.level].name}: <b>{runLabel(mine!)}</b>
          {prev ? <> (cũ {runLabel(prev)})</> : null} — ván sau xe ma sẽ chạy theo thành tích này.
        </p>
      )}
      {!solo && <Podium top={podium} />}
      {!solo && <Badges list={badges(final, pts, end)} racers={racers} />}
      <WpmChart end={end} lines={racers.map((x) => ({ racer: x, pts: pts[x.k] ?? [], stop: stopOf(x.k) }))} />
      {rows}
    </Result>
  );
}

// ——— Đường đua ———

// Vạch đường chạy lùi theo bậc tốc độ (giây mỗi vòng hoa văn): chia bậc để không giật mỗi lần tốc độ nhích một chút.
const ROLL = [0, 1.3, 0.85, 0.55, 0.36, 0.24];
const rollOf = (speed: number) => (speed <= 1 ? 0 : speed < 25 ? 1 : speed < 45 ? 2 : speed < 65 ? 3 : speed < 90 ? 4 : 5);
// Quá chừng này người thì thu thấp các làn.
const DENSE = 6;

/** Đếm số lần `v` tăng kể từ lúc gắn (lần đầu không tính) — để diễn lại hiệu ứng mỗi lần gõ sai. */
function useBump(v: number) {
  const [s, setS] = useState({ v, n: 0 });
  if (v !== s.v) setS({ v, n: v > s.v ? s.n + 1 : s.n });
  return s.n;
}

const sceneOf = (o: TrOptions): Level => (o.source === "custom" ? "medium" : o.level);

function Lane({
  name,
  me,
  member,
  online,
  car,
  num,
  frac,
  speed,
  rank,
  tag,
  finish,
  done,
  errors = 0,
  ghost,
  ticks,
}: {
  name: string;
  me: boolean;
  member?: Parameters<typeof Avatar>[0]["p"];
  online: boolean;
  car: number;
  num?: number;
  frac: number;
  speed: number;
  rank?: number;
  tag?: ReactNode;
  finish: boolean;
  done?: boolean;
  errors?: number;
  ghost?: ReactNode;
  ticks?: { at: number; label: string }[];
}) {
  const color = colorOf(car).color;
  const moving = speed > 1;
  const roll = rollOf(speed);
  const hit = useBump(errors);
  return (
    <li className={`tr-lane ${me ? "is-me" : ""} ${online ? "" : "is-off"} ${done ? "is-fin" : ""}`} style={{ ["--c" as string]: color }}>
      <div className="tr-who">
        <span className="tr-rank">{rank ? (["🥇", "🥈", "🥉"][rank - 1] ?? rank) : "–"}</span>
        {member ? <Avatar p={member} size={28} className={online ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[28px] w-[28px] bg-sunken" />}
        <span className="min-w-0 truncate">{name}</span>
        {tag}
      </div>
      <div className={`tr-road ${finish ? "has-finish" : ""} ${roll ? "is-rolling" : ""}`} style={roll ? { ["--roll" as string]: `${ROLL[roll]}s` } : undefined}>
        <span className="tr-ground" aria-hidden="true" />
        {ticks?.map((t) => (
          <span key={t.label} className="tr-tick" style={{ left: `calc((100% - var(--car-w)) * ${t.at} + var(--car-w) * 0.9)` }}>
            {t.label}
          </span>
        ))}
        {ghost}
        <div
          className={`tr-car ${moving ? "is-moving" : ""} ${speed > 45 ? "is-fast" : ""} ${speed > 90 ? "is-n2" : speed > 60 ? "is-n1" : ""}`}
          style={{ ["--f" as string]: Math.min(1, Math.max(0, frac)), ["--spin" as string]: `${Math.max(0.12, 1.2 - speed / 90)}s` }}
        >
          <span className="tr-trail" aria-hidden="true" />
          <span className="tr-flame" aria-hidden="true" />
          {hit > 0 && (
            <span key={hit} className="tr-puff" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
          <span key={`b${hit}`} className={`tr-body ${hit ? "is-hit" : ""}`}>
            <CarArt color={color} shape={shapeOf(car)} num={num} />
          </span>
          {moving && <span className="tr-speed">{Math.round(speed)}</span>}
        </div>
      </div>
    </li>
  );
}

/** Xe ma: chạy lại kỷ lục của mình ở cùng cấu hình, chỉ mình thấy. */
function GhostCar({ ghost, opensAt, scale, car }: { ghost: Ghost; opensAt: number; scale: number; car: number }) {
  const now = useNow(true, 250);
  if (!now || now < opensAt) return null;
  const n = nAt(ghost.pts, now - opensAt);
  return (
    <div className="tr-car is-ghost" style={{ ["--f" as string]: Math.min(1, n / Math.max(1, scale)) }} title="Xe ma — kỷ lục của bạn">
      <CarArt color={colorOf(car).color} shape={shapeOf(car)} />
      <span className="tr-ghost-tag">👻</span>
    </div>
  );
}

type Tick = { seed: number; sig: string; ranks: number[]; fins: boolean[]; msg?: { id: number; text: string; at: number; mine: boolean } };

/** Bình luận viên: ai vừa vượt ai, ai vừa về đích. Tính lại mỗi lần thứ hạng đổi. */
function useTicker(g: TrMatch, me: string, live: boolean) {
  const sts = live ? standings(g.opts.mode, g.recs) : [];
  const ranks = g.lineup.map((_, k) => sts.find((s) => s.k === k && !s.out)?.rank ?? 0);
  const fins = g.recs.map((r) => r?.fin != null);
  const sig = `${g.seed}|${ranks.join()}|${fins.map(Number).join("")}`;
  const [s, setS] = useState<Tick>({ seed: g.seed, sig, ranks, fins });
  if (s.sig !== sig) {
    let msg = s.seed === g.seed ? s.msg : undefined;
    if (s.seed === g.seed && live && g.lineup.length > 1) {
      const id = (msg?.id ?? 0) + 1;
      const fin = fins.findIndex((f, k) => f && !s.fins[k]);
      if (fin >= 0) msg = { id, text: `🏁 ${nameOf(g, fin, me)} về đích${ranks[fin] === 1 ? " đầu tiên" : ` — hạng ${ranks[fin]}`}!`, at: g.recs[fin]?.at ?? 0, mine: fin === g.me };
      else {
        let pass: [number, number] | null = null;
        for (let k = 0; k < ranks.length; k++) {
          const rk = ranks[k];
          if (!rk || !s.ranks[k] || rk >= s.ranks[k]) continue;
          for (let j = 0; j < ranks.length; j++)
            if (j !== k && s.ranks[j] && s.ranks[j] < s.ranks[k] && ranks[j] > rk && (!pass || rk < ranks[pass[0]])) pass = [k, j];
        }
        const at = pass ? (g.recs[pass[0]]?.at ?? 0) : 0;
        // Đầu ván ai cũng sát nhau, đổi hạng liên tục — chưa bình luận; mỗi câu cách nhau một chút.
        if (pass && at > 5000 && (!msg || Math.abs(at - msg.at) > 2500)) {
          const [k, j] = pass;
          msg = { id, text: `${ranks[k] === 1 ? "👑" : "💨"} ${nameOf(g, k, me)} vừa vượt ${nameOf(g, j, me)}${ranks[k] === 1 ? " lên dẫn đầu" : ""}!`, at, mine: k === g.me || j === g.me };
        }
      }
    }
    setS({ seed: g.seed, sig, ranks, fins, msg });
  }
  return live ? s.msg : undefined;
}

function Track({ view, match: g, ghost }: { view: View; match: TrMatch; ghost: Ghost | null }) {
  const live = isLive(view);
  const total = g.text.length;
  const chars = g.opts.mode === "chars";
  const final = g.final;
  const ranks = new Map((final ?? standings(g.opts.mode, g.recs)).map((s) => [s.k, s]));
  const most = Math.max(0, ...g.recs.map((r) => r?.n ?? 0));
  // Đua theo thời gian không có đích: mọi xe dùng chung một thang, nới dần khi người dẫn đầu tới gần mép.
  const scale = chars ? total : Math.max(200, Math.ceil((most * 1.2) / 100) * 100);
  const ticks = chars ? undefined : [0.25, 0.5, 0.75].map((f) => ({ at: f, label: `${Math.round(scale * f)}` }));
  const order = g.lineup.map((_, k) => k);
  const speeds = order.map((k) => {
    const r = g.recs[k];
    return live && r?.fin == null && !r?.quit && g.lineup[k].online ? (r?.v ?? 0) : 0;
  });
  const msg = useTicker(g, view.me, live);
  const mine = msg?.mine ? msg.id : 0;
  useEffect(() => {
    if (mine) play("overtake");
  }, [mine]);
  return (
    <section className={`card tr-track is-${sceneOf(g.opts)} ${g.lineup.length > DENSE ? "is-dense" : ""} p-3 sm:p-4`} aria-label="Đường đua">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        <h2 className="font-display text-lg font-extrabold">🏎️ Đường đua</h2>
        {msg && (
          <p key={msg.id} className="tr-ticker" aria-live="polite">
            {msg.text}
          </p>
        )}
        <RaceClock view={view} match={g} />
      </div>
      <Scenery level={sceneOf(g.opts)} moving={speeds.some((v) => v > 1)} />
      <ol className="tr-lanes">
        {order.map((k) => {
          const seat = g.lineup[k];
          const r = g.recs[k];
          const s = ranks.get(k);
          const tag = r?.quit ? (
            <span title="Bỏ cuộc">🏳️</span>
          ) : r?.fin != null ? (
            <span className="text-[11.5px] font-bold text-ink-3 tabular-nums">🏁 {clock(r.fin)}</span>
          ) : !seat.online && live ? (
            <span className="text-[11px] font-bold text-coral">mất kết nối</span>
          ) : null;
          return (
            <Lane
              key={seat.uid}
              name={nameOf(g, k, view.me)}
              me={k === g.me}
              member={seat.member}
              online={seat.online}
              car={g.cars[k]}
              num={k + 1}
              frac={(r?.n ?? 0) / Math.max(1, scale)}
              speed={speeds[k]}
              rank={s && !s.out && (s.n > 0 || !!final) ? s.rank : undefined}
              tag={tag}
              finish={chars}
              done={r?.fin != null}
              errors={r?.e ?? 0}
              ticks={ticks}
              ghost={k === g.me && live && ghost ? <GhostCar ghost={ghost} opensAt={g.opensAt} scale={scale} car={g.cars[k]} /> : undefined}
            />
          );
        })}
      </ol>
    </section>
  );
}

function RaceClock({ view, match: g }: { view: View; match: TrMatch }) {
  const live = isLive(view);
  const now = useNow(live, 500);
  if (!live) return g.end != null ? <span className="font-display text-base font-extrabold tabular-nums text-ink-3">⏱ {clock(g.end)}</span> : null;
  if (!now) return null;
  if (now < g.opensAt)
    return (
      <span className="flex items-center gap-2 font-display text-base font-extrabold text-ink-3">
        <StartLights lit={Math.max(0, Math.min(5, 5 - Math.ceil((g.opensAt - now) / 700)))} /> Chuẩn bị…
      </span>
    );
  const go = now < g.opensAt + 1500 ? <StartLights lit={5} go /> : null;
  if (g.endsAt)
    return (
      <span className="flex items-center gap-2 font-display text-lg font-extrabold tabular-nums">
        {go}⏳ Còn {clock(Math.max(0, g.endsAt - now + 999))}
      </span>
    );
  return (
    <span className="flex items-center gap-2 font-display text-lg font-extrabold tabular-nums">
      {go}⏱ {clock(now - g.opensAt)}
    </span>
  );
}

// Chưa có ván nào: xếp sẵn các xe ở vạch xuất phát.
function Grid({ view }: { view: View }) {
  const seated = view.seats.filter((s) => !!s?.uid);
  const opts = view.game!.opts;
  return (
    <section className={`card tr-track is-${sceneOf(opts)} ${seated.length > DENSE ? "is-dense" : ""} p-3 sm:p-4`} aria-label="Vạch xuất phát">
      <h2 className="mb-2 px-1 font-display text-lg font-extrabold">🏎️ Vạch xuất phát</h2>
      <Scenery level={sceneOf(opts)} moving={false} />
      {seated.length ? (
        <ol className="tr-lanes">
          {seated.map((s, i) => (
            <Lane
              key={s.uid}
              name={s.uid === view.me ? "Bạn" : (s.member?.name ?? "Ai đó")}
              me={s.uid === view.me}
              member={s.member}
              online={s.online}
              car={carOf(s.uid, s.uid === view.me ? view.game!.myCar : s.member?.car)}
              num={i + 1}
              frac={0}
              speed={0}
              finish={opts.mode === "chars"}
            />
          ))}
        </ol>
      ) : (
        <p className="px-1 pb-2 text-[14px] font-semibold text-ink-3">Chưa ai lên xe — bấm “Vào chơi” để vào vạch xuất phát.</p>
      )}
    </section>
  );
}

// ——— Khu vực gõ ———

type Typing = { pos: number; n: number; e: number; at: number; fin?: number; quit?: boolean; buf: string; samples: [number, number][]; combo: number; best: number };

// Mỗi chừng này ký tự đúng liền mạch thì combo lên một bậc (rung + chuông).
const COMBO_STEP = 25;

const speedOf = (t: Typing, elapsed: number) => recentWpm(t.samples, t.n, elapsed, SPEED_WINDOW_MS);

const lum = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
};

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function Pad({ session, match: g }: { session: TypingRaceRoom; match: TrMatch }) {
  const text = g.text;
  const opened = useReached(g.opensAt);
  const timeUp = useReached(g.endsAt);
  const ref = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const composing = useRef(false);
  const ghost = useGhost(g.opts);
  // Trạng thái gõ đổi ngay trong trình xử lý phím (`state`), bản chụp (`t`) để vẽ. Tải lại trang giữa ván thì gõ
  // tiếp từ bản ghi đã phát.
  const [t, setT] = useState<Typing>(() => {
    const r = session.saved(g.round);
    // Mốc đầu của tốc độ tức thời: chỗ đang đứng lúc mở khu vực gõ (đầu ván, hoặc bản ghi cũ khi tải lại trang).
    return { pos: r?.p ?? 0, n: r?.n ?? 0, e: r?.e ?? 0, at: r?.at ?? 0, fin: r?.fin, quit: r?.quit, buf: "", samples: [[r?.at ?? 0, r?.n ?? 0]], combo: 0, best: bestCombo(session, g.seed) };
  });
  const state = useRef(t);
  // Ô nhập đang hiện, kể cả chữ bộ gõ còn đang soạn — để tô màu văn bản.
  const [shown, setShown] = useState("");
  // Bỏ cuộc bấm ở thanh trạng thái.
  const quit = !!t.quit || (g.me >= 0 && !!g.recs[g.me]?.quit);
  const done = t.fin != null || quit || t.pos >= text.length;
  const canType = opened && !timeUp && !done;
  const now = useNow(opened && !done, 500);
  const elapsed = now ? Math.max(0, now - g.opensAt) : 0;
  const speed = canType && now ? Math.round(speedOf(t, elapsed)) : 0;
  const color = colorOf(g.cars[g.me] ?? 0).color;

  const record = (v: number): TrRec => {
    const x = state.current;
    return { p: x.pos, n: x.n, e: x.e, at: x.at, v, ...(x.fin != null ? { fin: x.fin } : {}), ...(quit ? { quit: true } : {}) };
  };

  // Tốc độ giảm dần về 0 khi ngừng gõ: phát lại theo nhịp, kể cả khi không có phím nào.
  const lastV = useRef(-1);
  useEffect(() => {
    if (!opened || done || !now) return;
    const v = Math.round(speedOf(state.current, Math.max(0, now - g.opensAt)));
    if (v !== lastV.current) {
      lastV.current = v;
      session.report(record(v));
    }
  });

  // Tiếng máy xe theo tốc độ; rời khu vực gõ thì tắt máy.
  useEffect(() => {
    setEngine(canType ? speed : null);
  }, [canType, speed]);
  useEffect(() => () => setEngine(null), []);

  // Hết giờ: chốt bản ghi cuối ngay.
  useEffect(() => {
    if (!timeUp) return;
    session.report(record(0), true);
    ref.current?.blur();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  useEffect(() => {
    if (canType) ref.current?.focus({ preventScroll: true });
  }, [canType]);

  // `ime`: chữ vừa được bộ gõ soạn xong — một lúc có thể chèn cả âm tiết.
  const handle = (ime = false) => {
    const el = ref.current;
    if (!el) return;
    const x = state.current;
    if (!canType) {
      el.value = x.buf;
      setShown(x.buf);
      return;
    }
    const v = el.value.normalize("NFC");
    const prev = x.buf;
    // Chỉ nhận từng phím: chèn một lúc nhiều chữ (dán, gợi ý tự điền) thì bỏ.
    if (v.length - prev.length > 3 && !ime) {
      el.value = prev;
      setShown(prev);
      return;
    }
    const at = Math.max(0, Date.now() - g.opensAt);
    const s = scan(text, x.pos, v);
    const errors = x.e;
    const combo = x.combo;
    let buf = v;
    if (s.bad >= 0) {
      // Mỗi lần nhập khi đang có ký tự sai đều là một lần nhập sai; chỉ giữ lại một ký tự sai trong ô.
      if (v.length >= prev.length && v !== prev) x.e += 1;
      if (buf.length > s.bad + 1) buf = buf.slice(0, s.bad + 1);
    }
    const reached = x.pos + s.good;
    if (reached > x.n) {
      x.combo += reached - x.n;
      x.n = reached;
      x.at = at;
      x.samples.push([at, x.n]);
      if (x.samples.length > 200) x.samples.splice(0, x.samples.length - 200);
    }
    if (x.e > errors) x.combo = 0;
    x.best = Math.max(x.best, x.combo);
    if (s.commit > 0) {
      x.pos += s.commit;
      buf = buf.slice(s.commit);
    }
    let urgent = false;
    if (x.pos >= text.length) {
      x.pos = text.length;
      x.n = text.length;
      if (g.opts.mode === "chars") x.fin = at;
      urgent = true;
    }
    x.buf = buf;
    if (el.value !== buf) el.value = buf;
    const v2 = Math.round(speedOf(x, at));
    lastV.current = v2;
    session.report(record(v2), urgent);
    keepCombo(session, g.seed, x.best);
    // Tiếng và cảm giác tay: gõ sai thì khung chữ rung, lên bậc combo thì chuông, về đích thì reo.
    if (x.e > errors) {
      play("miss");
      if (!reduced()) boxRef.current?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }], { duration: 240 });
    } else if (v !== prev) play("key");
    if (Math.floor(x.combo / COMBO_STEP) > Math.floor(combo / COMBO_STEP)) play("combo");
    if (urgent && x.fin != null) play("finish");
    setT({ ...x });
    setShown(buf);
  };

  const s = scan(text, t.pos, shown);
  const okLen = s.bad >= 0 ? s.bad : Math.min(shown.length, text.length - t.pos);
  const cur = t.pos + okLen;
  let from = Math.max(0, t.pos - BEHIND);
  if (from > 0) from = text.indexOf(" ", from) + 1 || from;
  const to = Math.min(text.length, cur + AHEAD);
  const space = text.indexOf(" ", cur);
  const wordEnd = Math.max(cur + 1, space < 0 ? text.length : space);

  // Giữ dòng đang gõ ở dòng thứ hai của khung, và con trỏ trượt tới chữ kế tiếp.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const caret = caretRef.current;
    if (!box || !caret) return;
    const line = parseFloat(getComputedStyle(box).lineHeight) || 30;
    box.scrollTop = Math.max(0, caret.offsetTop - line);
    const bar = barRef.current;
    if (bar) {
      bar.style.transform = `translate(${caret.offsetLeft}px, ${caret.offsetTop}px)`;
      bar.style.height = `${caret.offsetHeight}px`;
    }
  });

  const n = t.n;
  const ms = t.fin ?? (g.endsAt && timeUp ? g.endsAt - g.opensAt : elapsed);
  const chars = g.opts.mode === "chars";
  const left = g.endsAt && now ? Math.max(0, g.endsAt - now) : null;
  const hot = t.combo >= COMBO_STEP;

  return (
    <section className="card tr-pad mt-4 p-3 sm:p-4" aria-label="Khu vực gõ" style={{ ["--car" as string]: lum(color) > 200 ? "var(--pen)" : color }}>
      <MiniMap match={g} mine={t} ghost={opened ? ghost : null} elapsed={elapsed} />
      <div className="tr-stats">
        <div className="tr-stat">
          <span className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">WPM</span>
          <span className="flex items-end justify-between gap-1">
            <b className="font-display text-xl leading-tight tabular-nums">{Math.round(wpm(n, ms))}</b>
            <Gauge v={speed} />
          </span>
          <span className="text-[11px] font-semibold text-ink-3 tabular-nums">tức thời {speed}</span>
        </div>
        <Stat label="Chính xác" value={pct(accuracy(n, t.e))} />
        <Stat label="Lỗi" value={t.e} tone={t.e ? "coral" : undefined} />
        <div className={`tr-stat tr-combo ${hot ? "is-hot" : ""}`}>
          <span className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">Combo</span>
          <b key={Math.floor(t.combo / COMBO_STEP)} className="tr-combo-n font-display text-xl leading-tight tabular-nums">
            {hot ? "🔥 " : ""}x{t.combo}
          </b>
          <span className="text-[11px] font-semibold text-ink-3 tabular-nums">cao nhất x{t.best}</span>
        </div>
        <Stat label={chars ? "Thời gian" : "Còn lại"} value={chars ? clock(ms) : clock(left != null ? left + 999 : timeUp ? 0 : g.opts.minutes * 60000)} />
        <Stat label="Tiến độ" value={chars ? pct((100 * n) / Math.max(1, text.length)) : n.toLocaleString("vi-VN")} sub={chars ? `${n}/${text.length}` : "ký tự"} />
      </div>
      <div ref={boxRef} className={`tr-text ${opened ? "" : "is-hidden"}`} onClick={() => ref.current?.focus()} aria-hidden={!opened}>
        {opened ? (
          <>
            {from > 0 && <span className="tr-done">…</span>}
            <span className="tr-done">{text.slice(from, t.pos)}</span>
            <span className="tr-typing">{text.slice(t.pos, cur)}</span>
            {s.bad >= 0 ? (
              <span ref={caretRef} className="tr-wrong">
                {text[cur] ?? " "}
              </span>
            ) : (
              <span ref={caretRef} className="tr-word">
                {text[cur] ?? ""}
              </span>
            )}
            <span className="tr-word">{text.slice(cur + 1, wordEnd)}</span>
            <span>{text.slice(wordEnd, to)}</span>
            {to < text.length && <span>…</span>}
            <span ref={barRef} className={`tr-caret ${canType ? "" : "is-idle"}`} aria-hidden="true" />
          </>
        ) : (
          <span>Văn bản sẽ hiện khi xuất phát — đặt tay lên hàng phím ASDF nhé!</span>
        )}
      </div>
      <input
        ref={ref}
        className={`field tr-input ${s.bad >= 0 ? "is-bad" : ""}`}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="next"
        data-gramm="false"
        aria-label="Ô gõ văn bản"
        placeholder={done ? (quit ? "Bạn đã bỏ cuộc" : "🏁 Đã xong!") : timeUp ? "⏱ Hết giờ!" : opened ? "Gõ vào đây…" : "Chờ xuất phát…"}
        disabled={!canType}
        defaultValue=""
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          handle(true);
        }}
        onInput={(e) => {
          if (composing.current || (e.nativeEvent as InputEvent).isComposing) setShown(e.currentTarget.value.normalize("NFC"));
          else handle();
        }}
        onKeyDown={(e) => {
          if (["Enter", "Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key) && !composing.current) e.preventDefault();
        }}
        onSelect={(e) => {
          const el = e.currentTarget;
          const end = el.value.length;
          if (!composing.current && (el.selectionStart !== end || el.selectionEnd !== end)) el.setSelectionRange(end, end);
        }}
        onPaste={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        onDragOver={(e) => e.preventDefault()}
      />
      <p className="mt-1.5 text-[12px] font-semibold text-ink-3">
        {s.bad >= 0 ? "❌ Gõ sai — nhấn Backspace để xoá lỗi rồi gõ lại." : "Gõ dùng được bộ gõ Telex / VNI · không dán được văn bản · phân biệt chữ hoa, chữ thường."}
      </p>
    </section>
  );
}

/** Bản đồ mini ngay trên khung chữ: mắt người gõ ở đây, nên đối thủ và xe ma cũng phải ở đây. */
function MiniMap({ match: g, mine, ghost, elapsed }: { match: TrMatch; mine: Typing; ghost: Ghost | null; elapsed: number }) {
  const chars = g.opts.mode === "chars";
  const recs = g.recs.map((r, k) => (k === g.me ? { ...(r ?? { v: 0 }), p: mine.pos, n: mine.n, e: mine.e, at: mine.at, v: r?.v ?? 0, ...(mine.fin != null ? { fin: mine.fin } : {}), ...(mine.quit || r?.quit ? { quit: true } : {}) } : r));
  const ghostN = ghost && elapsed ? nAt(ghost.pts, elapsed) : null;
  const most = Math.max(0, ghostN ?? 0, ...recs.map((r) => r?.n ?? 0));
  const scale = chars ? g.text.length : Math.max(200, Math.ceil((most * 1.2) / 100) * 100);
  const sts = standings(g.opts.mode, recs);
  const ranked = sts.filter((s) => !s.out);
  const me = sts.find((s) => s.k === g.me);
  let info: ReactNode;
  if (g.lineup.length === 1)
    info =
      ghostN != null ? (
        mine.n >= ghostN ? (
          <>👻 Nhanh hơn kỷ lục {Math.round(mine.n - ghostN)} ký tự</>
        ) : (
          <>👻 Chậm hơn kỷ lục {Math.round(ghostN - mine.n)} ký tự</>
        )
      ) : (
        <>Luyện tập một mình — chơi trọn ván để lập kỷ lục 👻</>
      );
  else if (me && !me.out) {
    const i = ranked.findIndex((s) => s.k === g.me);
    if (i === 0) {
      const second = ranked[1];
      info = (
        <>
          👑 Dẫn đầu{second ? <> · hơn {nameOf(g, second.k, "")} {mine.n - second.n} ký tự</> : null}
        </>
      );
    } else {
      const above = ranked[i - 1];
      info = (
        <>
          Hạng {me.rank}/{ranked.length} · kém {nameOf(g, above.k, "")} {Math.max(0, above.n - mine.n)} ký tự
        </>
      );
    }
  }
  return (
    <div className="tr-mini" aria-label="Vị trí các tay đua">
      <div className={`tr-mini-bar ${chars ? "has-finish" : ""}`}>
        {ghostN != null && <span className="tr-mini-dot is-ghost" style={{ ["--f" as string]: Math.min(1, ghostN / scale) }} title="Xe ma — kỷ lục của bạn" />}
        {recs.map((r, k) =>
          k === g.me ? null : (
            <span
              key={g.lineup[k].uid}
              className={`tr-mini-dot ${r?.quit || !g.lineup[k].online ? "is-off" : ""}`}
              style={{ ["--f" as string]: Math.min(1, (r?.n ?? 0) / scale), background: colorOf(g.cars[k]).color }}
              title={nameOf(g, k, "")}
            />
          ),
        )}
        <span className="tr-mini-dot is-me" style={{ ["--f" as string]: Math.min(1, mine.n / scale), background: colorOf(g.cars[g.me] ?? 0).color }} title="Bạn" />
      </div>
      {info && <p className="mt-1 text-[12.5px] font-bold text-ink-2 tabular-nums">{info}</p>}
    </div>
  );
}

// ——— Người xem: bộ chữ đang đua ———

// Khung chữ của người xem trải từ người chậm nhất tới người dẫn đầu, nhưng không dài quá chừng này phía sau.
const WATCH_BEHIND = 1200;
const WATCH_AHEAD = 420;
const MAX_BITS = 360;

/** Chữ trên lá cờ: màu xe sáng thì chữ tối, màu xe tối thì chữ trắng. */
function inkOn(hex: string) {
  const v = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
  return lum > 160 ? "#1d1648" : "#fff";
}

/** Bắn pháo giấy màu `color` từ điểm (x, y) trong lớp hiệu ứng. */
function burst(fx: HTMLElement, x: number, y: number, color: string, count: number, big = false) {
  for (let i = 0; i < count && fx.childElementCount < MAX_BITS; i++) {
    const bit = document.createElement("i");
    const a = Math.random() * Math.PI * 2;
    const d = (big ? 30 : 14) + Math.random() * (big ? 60 : 30);
    const w = 4 + Math.random() * 4;
    bit.className = `tr-bit ${Math.random() < 0.3 ? "is-dot" : ""}`;
    bit.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${w * (0.45 + Math.random() * 0.4)}px;background:${color};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - (big ? 22 : 10)}px;--r:${(Math.random() - 0.5) * 900}deg;animation-duration:${(big ? 1100 : 750) + Math.random() * 400}ms`;
    bit.addEventListener("animationend", () => bit.remove(), { once: true });
    fx.appendChild(bit);
  }
}

function Watch({ match: g, me }: { match: TrMatch; me: string }) {
  const text = g.text;
  const opened = useReached(g.opensAt);
  const boxRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);
  const pins = useRef(new Map<number, HTMLSpanElement>());
  const seen = useRef<{ n: number; fin: boolean }[] | null>(null);

  const racers = g.lineup.map((seat, k) => {
    const r = g.recs[k];
    return { k, n: Math.min(text.length, r?.n ?? 0), color: colorOf(g.cars[k]).color, name: nameOf(g, k, me), off: !seat.online || !!r?.quit, fin: r?.fin != null };
  });
  const most = Math.max(0, ...racers.map((r) => r.n));
  const active = racers.filter((r) => !r.off);
  const least = Math.min(most, ...(active.length ? active : racers).map((r) => r.n));
  let from = Math.max(least, most - WATCH_BEHIND);
  if (from > 0) from = text.lastIndexOf(" ", from - 1) + 1;
  const to = Math.min(text.length, most + WATCH_AHEAD);

  // Gom tay đua theo vị trí: cùng một chỗ thì chung một con trỏ, các lá cờ xếp cạnh nhau.
  const at = new Map<number, typeof racers>();
  for (const r of racers) if (r.n >= from) at.set(r.n, [...(at.get(r.n) ?? []), r]);
  const stops = [...new Set([from, ...at.keys(), least, most, to])].filter((p) => p >= from && p <= to).sort((a, b) => a - b);

  const parts: React.ReactNode[] = [];
  for (let i = 0; i < stops.length; i++) {
    const p = stops[i];
    const group = at.get(p);
    if (group) {
      const lead = group.find((r) => !r.off) ?? group[0];
      parts.push(
        <span
          key={`pin${p}`}
          ref={(el) => {
            if (!el) return;
            for (const r of group) pins.current.set(r.k, el);
            return () => {
              for (const r of group) if (pins.current.get(r.k) === el) pins.current.delete(r.k);
            };
          }}
          className={`tr-pin ${lead.off ? "is-off" : ""}`}
          style={{ ["--c" as string]: lead.color }}
        >
          <span className="tr-flags">
            {group.map((r) => (
              <span
                key={r.k}
                className={`tr-flag ${r.off ? "is-off" : ""}`}
                style={{ background: r.color, color: inkOn(r.color) }}
              >
                {r.fin ? "🏁 " : ""}
                {r.name}
              </span>
            ))}
          </span>
        </span>,
      );
    }
    const next = stops[i + 1];
    if (next === undefined || next === p) continue;
    const cls = next <= least ? "tr-done" : p >= most ? "tr-ahead" : "";
    parts.push(
      <span key={`t${p}`} className={cls}>
        {text.slice(p, next)}
      </span>,
    );
  }

  // Ai tiến lên thì pháo giấy màu xe người đó nổ ngay chỗ đó; về đích thì nổ to.
  useEffect(() => {
    const fx = fxRef.current;
    const prev = seen.current;
    seen.current = racers.map((r) => ({ n: r.n, fin: r.fin }));
    if (!fx || !prev || !opened || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const r of racers) {
      const was = prev[r.k];
      const pin = pins.current.get(r.k);
      if (!was || !pin || r.n <= was.n) continue;
      const x = pin.offsetLeft + 1;
      const y = pin.offsetTop + pin.offsetHeight / 2;
      const big = r.fin && !was.fin;
      burst(fx, x, y, r.color, big ? 46 : Math.min(18, 5 + (r.n - was.n) * 2), big);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.recs, opened]);

  // Giữ người chậm nhất ở mép trên; ai cũng không vừa khung thì bám theo người dẫn đầu.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // Con trỏ sát mép phải thì cờ quay sang trái để khỏi bị cắt.
    for (const pin of pins.current.values()) {
      if (pin.offsetLeft > box.clientWidth - 110) pin.dataset.flip = "";
      else delete pin.dataset.flip;
    }
    const y = (r: (typeof racers)[number]) => pins.current.get(r.k)?.offsetTop;
    const all = racers.flatMap((r) => y(r) ?? []);
    if (!all.length) return;
    const line = parseFloat(getComputedStyle(box).lineHeight) || 40;
    const lead = Math.max(...all);
    const top = Math.min(lead, ...active.flatMap((r) => y(r) ?? []));
    let want = top - line * 0.5;
    if (lead + line * 1.6 > want + box.clientHeight) want = lead + line * 1.6 - box.clientHeight;
    if (Math.abs(box.scrollTop - want) > 2) box.scrollTo({ top: Math.max(0, want), behavior: "smooth" });
  });

  return (
    <section className="card tr-pad mt-4 p-3 sm:p-4" aria-label="Bộ chữ đang đua">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
        <h2 className="font-display text-lg font-extrabold">👀 Bộ chữ đang đua</h2>
        <span className="text-[12.5px] font-semibold text-ink-3">Mỗi tay đua một màu pháo giấy — gõ tới đâu nổ tới đó</span>
      </div>
      <div ref={boxRef} className={`tr-text tr-watch ${opened ? "" : "is-hidden"}`} aria-hidden={!opened}>
        {opened ? (
          <>
            {from > 0 && <span className="tr-done">… </span>}
            {parts}
            {to < text.length && <span className="tr-ahead">…</span>}
            <div ref={fxRef} className="tr-fx" aria-hidden="true" />
          </>
        ) : (
          <span>Văn bản sẽ hiện khi xuất phát…</span>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "coral" }) {
  return (
    <div className="tr-stat">
      <span className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">{label}</span>
      <b className={`font-display text-xl leading-tight tabular-nums ${tone === "coral" ? "text-coral" : ""}`}>{value}</b>
      {sub && <span className="text-[11px] font-semibold text-ink-3 tabular-nums">{sub}</span>}
    </div>
  );
}
