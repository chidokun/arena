"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  accuracy,
  CARS,
  carOf,
  clock,
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
  scan,
  standings,
  wpm,
  type Standing,
  type TrOptions,
  type TrRec,
} from "@/lib/games/typing-race";
import { START_COUNTDOWN_MS, type RoomState, type RoomView } from "@/lib/net/room";
import type { TrMatch, TrView, TypingRaceRoom } from "@/lib/net/typing-race-room";
import { ConfirmButton } from "../ConfirmButton";
import { Avatar } from "../Avatar";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel } from "./People";
import { ResultCard as Result, Standings } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout } from "./RoomLayout";
import { SeatButtons, seatMessage, StatusBar, StopButton, TONE } from "./StatusBar";
import { shallowEqual, useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

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
  return g?.result ? <ResultCard view={view} match={g} /> : null;
});

const TrackPart = memo(function TrackPart({ session }: { session: TypingRaceRoom }) {
  const view = useTrView(session);
  const ref = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, ref);
  const g = view.game!.match;
  return (
    <div ref={ref} className="relative mt-4">
      {g ? <Track view={view} match={g} /> : <Grid view={view} />}
      <Flyers flyers={flyers} />
    </div>
  );
});

const PadPart = memo(function PadPart({ session }: { session: TypingRaceRoom }) {
  const g = useGame(session, (v) => v?.match);
  return g ? <Pad session={session} match={g} /> : null;
});

const CinemaPart = memo(function CinemaPart({ session }: { session: TypingRaceRoom }) {
  const live = useTrLive(session);
  const g = useGame(session, (v) => v?.match);
  const me = useRoomState(session, (r) => r.me);
  // Vào phòng / tải lại giữa lúc đếm thì vẫn đếm nốt phần còn lại tới lúc xuất phát.
  const count = useCountdown(live && g ? g.round : 0, { endsAt: g?.opensAt, ms: START_COUNTDOWN_MS, onMount: true });
  const end = useEndScene(g?.result && g.result.reason !== "stop" && g.final?.some((s) => s.rank === 1 && s.n > 0) ? g.round : 0, { ms: WIN_SCENE_MS, emojis: CONFETTI });
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
      />
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
    </StatusBar>
  );
}

// ——— Thiết lập ván ———

function Setup({ view, session }: { view: View; session: TypingRaceRoom }) {
  const { opts, draft, drafted, myCar } = view.game!;
  const host = view.isHost;
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
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Chọn xe">
          {CARS.map((c, i) => (
            <button
              key={c.name}
              type="button"
              role="radio"
              aria-checked={myCar === i}
              className={`tr-pick ${myCar === i ? "is-on" : ""}`}
              onClick={() => session.setCar(i)}
              title={c.name}
            >
              <CarArt color={c.color} />
              <span className="sr-only">{c.name}</span>
            </button>
          ))}
        </div>
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

function ResultCard({ view, match: g }: { view: View; match: TrMatch }) {
  const r = g.result!;
  const final = g.final ?? [];
  const top = final.filter((s) => s.rank === 1 && s.n > 0);
  const solo = g.lineup.length === 1;
  const mine = final.find((s) => s.k === g.me);
  const rows = (
    <Standings
      rows={final.map((s) => ({
        uid: g.lineup[s.k].uid,
        name: nameOf(g, s.k, view.me),
        rank: s.rank,
        mark: <span className="sd-swatch" style={{ background: CARS[g.cars[s.k]].color }} aria-hidden="true" />,
        value: rowValue(g, s),
      }))}
    />
  );
  const note = mine ? `Bạn: ${mine.n.toLocaleString("vi-VN")} ký tự đúng · ${mine.e} lần gõ sai · chính xác ${pct(accuracy(mine.n, mine.e))}` : undefined;
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
  return (
    <Result round={g.round} title={title} note={note}>
      {rows}
    </Result>
  );
}

// ——— Đường đua ———

export function CarArt({ color, className }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 58" className={`tr-car-art ${className ?? ""}`} aria-hidden="true">
      <ellipse cx="62" cy="53" rx="52" ry="4" fill="rgba(0,0,0,.22)" />
      <path d="M4 21h18l3 8H8z" fill={color} stroke="#1d1648" strokeWidth="3" strokeLinejoin="round" />
      <path
        d="M8 37c0-7 5-9 13-10l17-3c6-9 14-13 26-13h13c10 0 17 5 22 12l8 2c6 1 9 5 9 10v5c0 3-2 4-5 4H12c-3 0-4-2-4-4z"
        fill={color}
        stroke="#1d1648"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M44 25c4-7 10-10 18-10h13c6 0 11 3 15 10z" fill="#9fdcff" stroke="#1d1648" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M68 15v10" stroke="#1d1648" strokeWidth="2.5" />
      <path d="M52 22l6-6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".7" />
      <path d="M16 34h84" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".35" />
      <ellipse cx="111" cy="32" rx="3.5" ry="3" fill="#fff6c2" stroke="#1d1648" strokeWidth="2" />
      {[31, 93].map((x) => (
        <g key={x} className="tr-wheel" style={{ transformOrigin: `${x}px 45px` }}>
          <circle cx={x} cy="45" r="10" fill="#1d1648" />
          <circle cx={x} cy="45" r="4.5" fill="#c9c3e6" />
          <path d={`M${x - 7} 45h14M${x} 38v14`} stroke="#c9c3e6" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}

function Lane({
  name,
  me,
  member,
  online,
  color,
  frac,
  speed,
  rank,
  tag,
  finish,
  ticks,
}: {
  name: string;
  me: boolean;
  member?: Parameters<typeof Avatar>[0]["p"];
  online: boolean;
  color: string;
  frac: number;
  speed: number;
  rank?: number;
  tag?: React.ReactNode;
  finish: boolean;
  ticks?: { at: number; label: string }[];
}) {
  const moving = speed > 1;
  return (
    <li className={`tr-lane ${me ? "is-me" : ""} ${online ? "" : "is-off"}`}>
      <div className="tr-who">
        <span className="tr-rank">{rank ? (["🥇", "🥈", "🥉"][rank - 1] ?? rank) : "–"}</span>
        {member ? <Avatar p={member} size={28} className={online ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[28px] w-[28px] bg-sunken" />}
        <span className="min-w-0 truncate">{name}</span>
        {tag}
      </div>
      <div className={`tr-road ${finish ? "has-finish" : ""}`}>
        {ticks?.map((t) => (
          <span key={t.label} className="tr-tick" style={{ left: `calc((100% - var(--car-w)) * ${t.at} + var(--car-w) * 0.9)` }}>
            {t.label}
          </span>
        ))}
        <div
          className={`tr-car ${moving ? "is-moving" : ""} ${speed > 45 ? "is-fast" : ""}`}
          style={{ left: `calc((100% - var(--car-w)) * ${Math.min(1, Math.max(0, frac))})`, ["--spin" as string]: `${Math.max(0.12, 1.2 - speed / 90)}s` }}
        >
          <span className="tr-trail" aria-hidden="true" />
          <CarArt color={color} />
          {moving && <span className="tr-speed">{Math.round(speed)}</span>}
        </div>
      </div>
    </li>
  );
}

function Track({ view, match: g }: { view: View; match: TrMatch }) {
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
  return (
    <section className="card tr-track p-3 sm:p-4" aria-label="Đường đua">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 px-1">
        <h2 className="font-display text-lg font-extrabold">🏎️ Đường đua</h2>
        <RaceClock view={view} match={g} />
      </div>
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
              color={CARS[g.cars[k]].color}
              frac={(r?.n ?? 0) / Math.max(1, scale)}
              speed={live && r?.fin == null && !r?.quit && seat.online ? (r?.v ?? 0) : 0}
              rank={s && !s.out && (s.n > 0 || !!final) ? s.rank : undefined}
              tag={tag}
              finish={chars}
              ticks={ticks}
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
  if (now < g.opensAt) return <span className="font-display text-base font-extrabold text-ink-3">Chuẩn bị…</span>;
  if (g.endsAt) return <span className="font-display text-lg font-extrabold tabular-nums">⏳ Còn {clock(Math.max(0, g.endsAt - now + 999))}</span>;
  return <span className="font-display text-lg font-extrabold tabular-nums">⏱ {clock(now - g.opensAt)}</span>;
}

// Chưa có ván nào: xếp sẵn các xe ở vạch xuất phát.
function Grid({ view }: { view: View }) {
  const seated = view.seats.filter((s) => !!s?.uid);
  return (
    <section className="card tr-track p-3 sm:p-4" aria-label="Vạch xuất phát">
      <h2 className="mb-2 px-1 font-display text-lg font-extrabold">🏎️ Vạch xuất phát</h2>
      {seated.length ? (
        <ol className="tr-lanes">
          {seated.map((s) => (
            <Lane
              key={s.uid}
              name={s.uid === view.me ? "Bạn" : (s.member?.name ?? "Ai đó")}
              me={s.uid === view.me}
              member={s.member}
              online={s.online}
              color={CARS[carOf(s.uid, s.uid === view.me ? view.game!.myCar : s.member?.car)].color}
              frac={0}
              speed={0}
              finish={view.game!.opts.mode === "chars"}
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

type Typing = { pos: number; n: number; e: number; at: number; fin?: number; quit?: boolean; buf: string; samples: [number, number][] };

function speedOf(t: Typing, elapsed: number) {
  const from = elapsed - SPEED_WINDOW_MS;
  let base = t.samples.find(([at]) => at >= from) ?? [elapsed, t.n];
  if (base[0] > from && t.samples.length && t.samples[0][0] <= from) base = t.samples[0];
  const span = Math.max(1000, Math.min(SPEED_WINDOW_MS, elapsed));
  return Math.max(0, wpm(t.n - base[1], span));
}

function Pad({ session, match: g }: { session: TypingRaceRoom; match: TrMatch }) {
  const text = g.text;
  const opened = useReached(g.opensAt);
  const timeUp = useReached(g.endsAt);
  const ref = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const composing = useRef(false);
  // Trạng thái gõ đổi ngay trong trình xử lý phím (`state`), bản chụp (`t`) để vẽ. Tải lại trang giữa ván thì gõ
  // tiếp từ bản ghi đã phát.
  const [t, setT] = useState<Typing>(() => {
    const r = session.saved(g.round);
    return { pos: r?.p ?? 0, n: r?.n ?? 0, e: r?.e ?? 0, at: r?.at ?? 0, fin: r?.fin, quit: r?.quit, buf: "", samples: [] };
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
    let buf = v;
    if (s.bad >= 0) {
      // Mỗi lần nhập khi đang có ký tự sai đều là một lần nhập sai; chỉ giữ lại một ký tự sai trong ô.
      if (v.length >= prev.length && v !== prev) x.e += 1;
      if (buf.length > s.bad + 1) buf = buf.slice(0, s.bad + 1);
    }
    const reached = x.pos + s.good;
    if (reached > x.n) {
      x.n = reached;
      x.at = at;
      x.samples.push([at, x.n]);
      if (x.samples.length > 200) x.samples.splice(0, x.samples.length - 200);
    }
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
    setT({ ...x });
    setShown(buf);
  };

  const s = scan(text, t.pos, shown);
  const okLen = s.bad >= 0 ? s.bad : Math.min(shown.length, text.length - t.pos);
  const cur = t.pos + okLen;
  let from = Math.max(0, t.pos - BEHIND);
  if (from > 0) from = text.indexOf(" ", from) + 1 || from;
  const to = Math.min(text.length, cur + AHEAD);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const caret = caretRef.current;
    if (!box || !caret) return;
    const line = parseFloat(getComputedStyle(box).lineHeight) || 30;
    box.scrollTop = Math.max(0, caret.offsetTop - line);
  });

  const n = t.n;
  const ms = t.fin ?? (g.endsAt && timeUp ? g.endsAt - g.opensAt : elapsed);
  const chars = g.opts.mode === "chars";
  const left = g.endsAt && now ? Math.max(0, g.endsAt - now) : null;

  return (
    <section className="card tr-pad mt-4 p-3 sm:p-4" aria-label="Khu vực gõ">
      <div className="tr-stats">
        <Stat label="WPM" value={Math.round(wpm(n, ms))} />
        <Stat label="Chính xác" value={pct(accuracy(n, t.e))} />
        <Stat label="Lỗi" value={t.e} tone={t.e ? "coral" : undefined} />
        <Stat label={chars ? "Thời gian" : "Còn lại"} value={chars ? clock(ms) : clock(left != null ? left + 999 : timeUp ? 0 : (g.opts.minutes * 60000))} />
        <Stat label="Tiến độ" value={chars ? pct((100 * n) / Math.max(1, text.length)) : n.toLocaleString("vi-VN")} sub={chars ? `${n}/${text.length}` : "ký tự"} />
      </div>
      <div ref={boxRef} className={`tr-text ${opened ? "" : "is-hidden"}`} onClick={() => ref.current?.focus()} aria-hidden={!opened}>
        {opened ? (
          <>
            {from > 0 && <span className="tr-done">…</span>}
            <span className="tr-done">{text.slice(from, t.pos)}</span>
            <span className="tr-typing">{text.slice(t.pos, t.pos + okLen)}</span>
            {s.bad >= 0 ? (
              <span ref={caretRef} className="tr-wrong">
                {text[cur] ?? " "}
              </span>
            ) : (
              <span ref={caretRef} className={canType ? "tr-cur" : ""}>
                {text[cur] ?? ""}
              </span>
            )}
            <span>{text.slice(cur + 1, to)}</span>
            {to < text.length && <span>…</span>}
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

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "coral" }) {
  return (
    <div className="tr-stat">
      <span className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">{label}</span>
      <b className={`font-display text-xl leading-tight tabular-nums ${tone === "coral" ? "text-coral" : ""}`}>{value}</b>
      {sub && <span className="text-[11px] font-semibold text-ink-3 tabular-nums">{sub}</span>}
    </div>
  );
}
