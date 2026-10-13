"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { COUNTDOWN_MS, HINT_COST, kindsOf, PAIR_POINTS, SIZE_KEYS, SIZES, TILES, type Point } from "@/lib/games/kawaii";
import type { KawaiiRoom, KwMatch, KwView } from "@/lib/net/kawaii-room";
import type { RoomView } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel } from "./People";
import { ResultCard as Result, Standings, StoppedCard } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout } from "./RoomLayout";
import { SeatButtons, seatMessage, StatusBar, StopButton, TONE } from "./StatusBar";
import { useFlyers, useRoomView } from "./useRoom";

type View = RoomView<KwView>;

/** Màu của từng người chơi theo thứ tự đội hình — đường nối, bảng điểm. Hết bảng màu thì xoay vòng sắc độ. */
const PLAYER_COLORS = ["var(--coral)", "var(--sky)", "var(--lime)", "var(--sun)", "var(--grape)", "#ff6fb5", "#14b8c4", "#ff8a3d", "#8a9a2c", "#a0785a"];
const colorOf = (k: number) => PLAYER_COLORS[k] ?? `hsl(${Math.round((k * 137.508) % 360)} 70% 52%)`;
/** Sắc độ nền của từng loại hình — các loại liền nhau lệch màu rõ. */
const hueOf = (kind: number) => Math.round((kind * 137.508) % 360);

const CONFETTI = ["🎉", "🏆", "✨", "🐾", "🎊", "⭐"];
const WIN_SCENE_MS = 6500;
const FX_MS = 650;
const HINT_MS = 4000;

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

const NARROW = "(max-width: 639px)";
const subscribeNarrow = (f: () => void) => {
  const q = matchMedia(NARROW);
  q.addEventListener("change", f);
  return () => q.removeEventListener("change", f);
};
/** Màn hẹp (điện thoại dọc) — bàn xoay dọc cho ô to hơn. */
const useNarrow = () =>
  useSyncExternalStore(
    subscribeNarrow,
    () => matchMedia(NARROW).matches,
    () => false,
  );

const isLive = (view: View) => view.meta!.status === "playing" && view.game?.match?.round === view.meta!.round;

function nameIn(view: View, uid: string) {
  if (uid === view.me) return "Bạn";
  return view.game?.match?.lineup.find((s) => s.uid === uid)?.member?.name ?? view.members.find((p) => p.uid === uid)?.name ?? "Ai đó";
}

export function KawaiiTable({ id, slug, session }: { id: string; slug: string; session: KawaiiRoom }) {
  const view = useRoomView(session)!;
  const m = view.meta!;
  const { opts, match: g } = view.game!;
  const areaRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, areaRef);
  const live = isLive(view);
  const now = useNow(live);
  // Vào phòng / tải lại giữa lúc đếm thì vẫn đếm nốt phần còn lại tới lúc lộ bàn.
  const count = useCountdown(live && g ? g.round : 0, { endsAt: g?.opensAt, ms: COUNTDOWN_MS, onMount: true });
  const end = useEndScene(winKey(g), { ms: WIN_SCENE_MS, emojis: CONFETTI });
  const size = live && g ? g.size : opts.size;

  return (
    <RoomLayout
      id={id}
      slug={slug}
      people={<PeoplePanel view={view} session={session} roomId={id} />}
      chat={<ChatPanel session={session} chat={view.chat} me={view.me} />}
    >
      <RoomHeader name={m.name} status={m.status} round={m.round} playing="đang nối">
        <span className="chip text-ink-2">
          ▦ {SIZES[size].label} {SIZES[size].w}×{SIZES[size].h}
        </span>
        <span className="chip text-ink-2">🙋 {m.players.length} người chơi · không giới hạn</span>
      </RoomHeader>

      <ActionBar view={view} session={session} now={now} />
      {!live && <Rules view={view} session={session} />}
      {g?.result && <ResultCard view={view} match={g} />}

      <div ref={areaRef} className="relative mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        {g ? <Play key={g.round} view={view} session={session} match={g} now={now} /> : <EmptyBoard view={view} />}
        {g && <Scoreboard view={view} match={g} />}
        <Flyers flyers={flyers} />
      </div>

      {g && <Cinema match={g} count={count} win={end.shown} onClose={end.close} />}
      <Party bits={end.party} />
    </RoomLayout>
  );
}

/** Ván vừa dọn sạch bàn (có người thắng) — số ván, 0 nếu chưa. */
const winKey = (g?: KwMatch) => (g?.result?.reason === "points" && g.result.winners?.length ? g.round : 0);

/** Lớp phủ toàn màn hình: đếm ngược trước khi lộ bàn, và cảnh chiến thắng (bấm để đóng). */
function Cinema({ match: g, count, win, onClose }: { match: KwMatch; count: number; win: boolean; onClose: () => void }) {
  if (count > 0)
    return (
      <CountdownCine
        tone="lilac"
        eyebrow={`🐾 Nối Thú Kawaii · ${SIZES[g.size].label} ${SIZES[g.size].w}×${SIZES[g.size].h}`}
        n={count}
        title={g.lineup.length > 1 ? "Nối cặp nhanh tay hơn mọi người nhé..." : "Dọn sạch bàn nào..."}
        tip="Hai ô cùng hình, đường nối gấp tối đa 2 lần."
      />
    );
  if (!win) return null;
  const winners = g.lineup.flatMap((s, k) => (g.result?.winners?.includes(s.uid) ? [k] : []));
  if (!winners.length) return null;
  const iWon = winners.includes(g.me);
  const names = winners.map((k) => (k === g.me ? "Bạn" : (g.lineup[k].member?.name ?? "Ai đó"))).join(", ");
  const first = winners[0];
  const solo = g.lineup.length === 1;
  return (
    <WinCine
      winners={winners.map((k) => ({ uid: g.lineup[k].uid, p: g.lineup[k].member }))}
      title={solo ? (iWon ? "Bạn dọn sạch bàn!" : `${names} dọn sạch bàn!`) : iWon && winners.length === 1 ? "Bạn chiến thắng!" : `${names} chiến thắng!`}
      onClose={onClose}
    >
      <p className="cine-score">
        {g.state.score[first]} <small>điểm</small>
      </p>
      <p className="text-[15px] font-bold opacity-85">
        {winners.length > 1 ? "Đồng hạng nhất · " : ""}
        {g.state.pairs[first]} cặp{g.state.hints[first] ? ` · ${g.state.hints[first]} lần gợi ý` : " · không cần gợi ý"}
      </p>
    </WinCine>
  );
}

/** Lời nhắc theo vai trò và nút chính: vào ghế / rời ghế / bắt đầu / dừng ván. */
function ActionBar({ view, session, now }: { view: View; session: KawaiiRoom; now: number }) {
  const m = view.meta!;
  const g = view.game!.match;
  const live = isLive(view);

  if (live && g) {
    let message: React.ReactNode;
    let tone: string = TONE.turn;
    const counting = !now || now < g.opensAt;
    if (g.me < 0) {
      tone = TONE.idle;
      message = <>👀 Bạn đang xem — mỗi cặp vừa nối hiện đường nối theo màu người nối.</>;
    } else if (counting) {
      tone = TONE.hot;
      message = now ? <>⏳ Chuẩn bị… bàn lộ sau {Math.max(1, Math.ceil((g.opensAt - now) / 1000))} giây!</> : <>⏳ Chuẩn bị…</>;
    } else if (g.lineup.length === 1)
      message = <>🎯 Chọn hai ô cùng hình nối được (gấp tối đa 2 lần, đi vòng viền được) — dọn sạch bàn là xong ván, không tính giờ.</>;
    else
      message = (
        <>
          🎯 Nối cặp trước người khác để ghi điểm: mỗi cặp +{PAIR_POINTS}, xin gợi ý −{HINT_COST}. Hết bàn thì nhiều điểm nhất thắng.
        </>
      );
    return (
      <StatusBar tone={tone} message={message}>
        {view.isHost && <StopButton onConfirm={() => session.stop()} />}
      </StatusBar>
    );
  }
  const blocked = !m.players.length ? "Cần ít nhất một người vào ghế" : !view.seats.some((s) => s.online) ? "Người chơi đang mất kết nối" : "";
  return (
    <StatusBar
      message={seatMessage(view, {
        enough: m.players.length > 0,
        startHint: "Bấm “Bắt đầu” khi mọi người sẵn sàng — chơi một mình cũng được.",
        join: "Bấm “Vào chơi” để cùng nối thú — không giới hạn người chơi.",
      })}
    >
      <SeatButtons view={view} session={session} blocked={blocked} />
    </StatusBar>
  );
}

/** Luật ván tới: chủ phòng chọn cỡ bàn, người khác xem. */
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
      <p className="text-[13.5px] text-ink-2">
        Chọn hai ô cùng hình nối được bằng đường gấp khúc tối đa 3 đoạn (gấp tối đa 2 lần) chỉ qua ô trống — được đi vòng ra ngoài viền bàn. Ai nối trước được{" "}
        {PAIR_POINTS} điểm, xin gợi ý bị trừ {HINT_COST} điểm. Hết cặp nối được thì bàn tự xáo lại. Không tính giờ: dọn sạch bàn là hết ván, nhiều điểm nhất thắng.
        {!host && " Chủ phòng chọn cỡ bàn cho ván tới."}
      </p>
    </section>
  );
}

/** Thẻ kết quả: người thắng và bảng điểm cả phòng. */
function ResultCard({ view, match: g }: { view: View; match: KwMatch }) {
  const r = g.result!;
  const winners = r.winners ?? [];
  if (r.reason !== "points" || !winners.length) return <StoppedCard round={g.round} />;
  const iWon = winners.includes(view.me);
  const names = winners.map((u) => nameIn(view, u)).join(", ");
  const s = g.state;
  const k = g.lineup.findIndex((x) => x.uid === winners[0]);
  if (g.lineup.length === 1)
    return (
      <Result
        round={g.round}
        title={iWon ? "🧹 Bạn dọn sạch bàn!" : `🧹 ${names} dọn sạch bàn!`}
        sub={`${s.score[k]} điểm · ${s.pairs[k]} cặp${s.hints[k] ? ` · ${s.hints[k]} lần gợi ý` : " · không cần gợi ý"}${s.shuffles ? ` · bàn tự xáo ${s.shuffles} lần` : ""}.`}
      />
    );
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
          // Đồng điểm thì đồng hạng.
          rank: order.findIndex((j) => s.score[j] === s.score[i]) + 1,
          mark: <span className="sd-swatch" style={{ background: colorOf(i) }} aria-hidden="true" />,
          value: `${s.score[i]} điểm · ${s.pairs[i]} cặp${s.hints[i] ? ` · ${s.hints[i]} gợi ý` : ""}`,
        }))}
      />
    </Result>
  );
}

/** Khung bàn: lưới (cột + 2) × (hàng + 2) — vành ngoài một ô để vẽ đường nối đi vòng viền. */
function Frame({ cols, rows, children, label }: { cols: number; rows: number; children: React.ReactNode; label?: string }) {
  return (
    <div
      className="kw-board"
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

/** Bàn trống khi chưa chơi ván nào: các ô úp. */
function EmptyBoard({ view }: { view: View }) {
  const m = view.meta!;
  const { w, h } = SIZES[view.game!.opts.size];
  const narrow = useNarrow();
  const [cols, rows] = narrow ? [h, w] : [w, h];
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
    </div>
  );
}

/** Một cặp vừa biến mất: đường nối (màu người nối) và hai ô mờ dần. */
type Fx = { key: string; path: Point[]; color: string; cells: { i: number; kind: number }[] };

/**
 * Diễn các cặp người khác vừa nối (cặp của mình đã diễn lúc bấm). Chỉ diễn những cặp mới thấy khi đang ở trong phòng;
 * nhiều cặp tới cùng lúc (vừa nối lại mạng) thì chỉ diễn vài cặp cuối.
 */
function useFx(g: KwMatch, active: boolean) {
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
      t.k === g.me
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

/** Bàn chơi: bấm hai ô cùng hình để nối; nút gợi ý (bị trừ điểm). */
function Play({ view, session, match: g, now }: { view: View; session: KawaiiRoom; match: KwMatch; now: number }) {
  const live = isLive(view);
  const player = g.me >= 0;
  const counting = live && (!now || now < g.opensAt);
  const canPlay = live && player && !counting && !g.state.over;
  const { w, h } = g.state;
  const narrow = useNarrow();
  // Màn hẹp thì xoay bàn: cột hiển thị là hàng của bàn.
  const turn = narrow && w > h;
  const [cols, rows] = turn ? [h, w] : [w, h];
  const place = (x: number, y: number) => (turn ? [y, x] : [x, y]);

  const [picked, setSel] = useState(-1);
  const [hint, setHint] = useState<{ pair: [number, number]; key: number } | null>(null);
  const [nope, setNope] = useState<{ cells: number[]; key: number } | null>(null);
  const { fx, add } = useFx(g, live && !counting);
  const tiles = g.tiles;

  // Ô đang chọn / ô gợi ý bị người khác nối mất thì coi như bỏ chọn, tắt gợi ý.
  const sel = picked >= 0 && tiles[picked] >= 0 ? picked : -1;
  const hinted = hint && tiles[hint.pair[0]] >= 0 && tiles[hint.pair[1]] >= 0 ? hint.pair : null;
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), HINT_MS);
    return () => clearTimeout(t);
  }, [hint]);
  useEffect(() => {
    if (!nope) return;
    const t = setTimeout(() => setNope(null), 450);
    return () => clearTimeout(t);
  }, [nope]);

  const pick = (i: number) => {
    if (!canPlay || tiles[i] < 0) return;
    if (sel < 0 || sel === i) return setSel(sel === i ? -1 : i);
    if (tiles[sel] !== tiles[i]) return setSel(i);
    const path = session.connect(sel, i);
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
    if (pair) setHint({ pair, key: Date.now() });
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

  return (
    <div className="grid gap-3">
      <div className="relative mx-auto w-full" style={{ maxWidth: `${(cols + 2) * 58}px` }}>
        <Frame cols={cols} rows={rows} label={`Bàn nối thú ${w}×${h}`}>
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
      <div className="mx-auto flex w-full flex-wrap items-center gap-2" style={{ maxWidth: `${(cols + 2) * 58}px` }}>
        {player && live && (
          <button type="button" className="btn btn-sm" onClick={askHint} disabled={!canPlay || !!hinted} title={`Chỉ một cặp nối được — bị trừ ${HINT_COST} điểm`}>
            💡 Gợi ý (−{HINT_COST})
          </button>
        )}
        <span className="ml-auto text-[12.5px] font-semibold text-ink-3">
          Còn {g.state.left - g.pending.length * 2}/{w * h} ô{g.state.shuffles ? ` · đã xáo ${g.state.shuffles} lần` : ""}
          {player && live && !counting ? (sel < 0 ? " · chọn ô thứ nhất" : " · chọn ô cùng hình") : ""}
        </span>
      </div>
    </div>
  );
}

/** Bảng điểm: màu từng người, số cặp, số lần gợi ý, điểm. */
function Scoreboard({ view, match: g }: { view: View; match: KwMatch }) {
  const s = g.state;
  const order = g.lineup.map((_, k) => k).sort((a, b) => s.score[b] - s.score[a] || s.pairs[b] - s.pairs[a] || a - b);
  const winners = new Set(g.result?.winners ?? []);
  return (
    <section className="card p-4" aria-labelledby="kw-score-h">
      <h2 id="kw-score-h" className="font-display text-lg font-extrabold">
        🏅 Bảng điểm
      </h2>
      <p className="text-[12.5px] font-semibold text-ink-3">
        {g.lineup.length} người chơi · mỗi cặp +{PAIR_POINTS}, gợi ý −{HINT_COST}
      </p>
      <ol className="mt-3 grid max-h-[480px] grid-cols-1 gap-3 overflow-y-auto pr-1">
        {order.map((k, rank) => {
          const seat = g.lineup[k];
          const p = seat.member;
          return (
            <li key={seat.uid} className="flex min-w-0 items-center gap-2.5">
              <span className="w-5 shrink-0 text-center text-[13px] font-extrabold text-ink-3">{rank + 1}</span>
              <span className="relative shrink-0">
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
                  <span className="min-w-0 truncate">{seat.uid === view.me ? "Bạn" : (p?.name ?? "Ai đó")}</span>
                </p>
                <p className="text-[11.5px] font-semibold text-ink-3">
                  🐾 {s.pairs[k]} cặp{s.hints[k] ? ` · 💡 ${s.hints[k]}` : ""}
                </p>
              </div>
              <span className="shrink-0 font-display text-2xl font-extrabold tabular-nums">{s.score[k]}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
