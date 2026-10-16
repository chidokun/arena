"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { COUNTDOWN_MS, FINAL_MS, GUESS_LEN, GUESS_MAX, hintNeed, LEVEL_KEYS, LEVELS, openedOf, pairsOf, SIZE_KEYS, SIZES, TILES, TURN_MS } from "@/lib/games/truc-xanh";
import type { GuessState, TrucXanhRoom, TxMatch, TxView } from "@/lib/net/truc-xanh-room";
import type { RoomView } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Crowd, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { PeoplePanel } from "./People";
import { ResultCard as Result, StoppedCard } from "./ResultCard";
import { Flyers, RoomHeader, RoomLayout } from "./RoomLayout";
import { SeatButtons, seatMessage, StatusBar, StopButton, TONE } from "./StatusBar";
import { shallowEqual, useFlyers, useGame, usePeople, useRoomState } from "./useRoom";

/** View các phần của bàn đọc — ghép từ `roomStore` + `peopleStore` + `gameStore` (chat đi riêng `chatStore`). */
type View = Omit<RoomView<TxView>, "chat">;

/** Đăng ký ba store và ghép lại thành view cho bàn chơi: vẽ lại khi phòng / người / ván đổi, không theo nhịp tim hay tin chat. */
function useTxView(session: TrucXanhRoom): View {
  const room = useRoomState(session);
  const people = usePeople(session);
  const game = useGame(session);
  return useMemo(() => ({ ...room, ...people, game }), [room, people, game]);
}

const CONFETTI = ["🎉", "🏆", "✨", "🎋", "🎊", "⭐"];
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

/** Đã tới mốc `at` chưa — chỉ vẽ lại đúng một lần lúc vượt mốc (vd. lộ bàn), không theo nhịp đồng hồ. */
function useReached(at: number | undefined) {
  const [hit, setHit] = useState<number | undefined>(undefined);
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
  return view.game?.match?.lineup.find((s) => s.uid === uid)?.member?.name ?? view.members.find((p) => p.uid === uid)?.name ?? "Ai đó";
}

/** Người tới lượt (thứ tự trong đội hình) — chưa lật hết bàn, chưa hết ván. */
const turnOf = (g: TxMatch) => (g.state.cleared || g.state.over ? -1 : g.state.current);

/** Mình bị xử thua vì gian lận trong ván này: bị gạch tên, không được lật ô hay đoán nữa. */
const banned = (g: TxMatch) => g.me >= 0 && !!g.cheats[g.me];

/** Mình đoán được không: người chơi chưa bị xử thua, ván đang chạy, bàn đã mở. */
const canGuess = (view: View, g: TxMatch, opened: boolean) => isLive(view) && g.me >= 0 && !banned(g) && !g.state.over && opened;

/**
 * Bàn chơi tách theo store: khung chỉ giữ RoomLayout — danh sách người (`peopleStore`) và khung chat (`chatStore`) tự
 * đăng ký; phần bàn chơi bọc `memo`, đọc `roomStore` + `peopleStore` + `gameStore`, nên nhịp tim, tin chat hay người
 * vào ra không làm bàn vẽ lại, và nước đi không làm danh sách người / khung chat vẽ lại.
 */
export function TrucXanhTable({ id, slug, session }: { id: string; slug: string; session: TrucXanhRoom }) {
  return (
    <RoomLayout id={id} slug={slug} people={<PeoplePanel session={session} roomId={id} />} chat={<TxChat session={session} />}>
      <TrucXanhBody session={session} />
    </RoomLayout>
  );
}

/** Khung chat: gợi ý trong ô nhập theo vai (người chơi thì đoán ở ô dưới tranh, người xem đừng nhắc đáp án). */
const TxChat = memo(function TxChat({ session }: { session: TrucXanhRoom }) {
  const live = useRoomState(session, (r) => r.meta!.status === "playing" && r.meta!.round);
  const game = useGame(session, (v) => (v?.match ? { round: v.match.round, player: v.match.me >= 0 } : null), shallowEqual);
  const playing = !!live && game?.round === live;
  const placeholder = playing && game.player ? "Thảo luận — đoán ở ô dưới tranh nhé" : playing ? "Người xem đừng nhắc đáp án nhé!" : undefined;
  return <ChatPanel session={session} placeholder={placeholder} />;
});

const TrucXanhBody = memo(function TrucXanhBody({ session }: { session: TrucXanhRoom }) {
  const view = useTxView(session);
  const m = view.meta!;
  const { opts, match: g } = view.game!;
  const areaRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, areaRef);
  const live = isLive(view);
  // Vào phòng / tải lại giữa lúc đếm thì vẫn đếm nốt phần còn lại tới lúc mở bàn.
  const count = useCountdown(live && g ? g.round : 0, { endsAt: g?.opensAt, ms: COUNTDOWN_MS, onMount: true });
  const end = useEndScene(g?.result?.reason === "guess" && g.result.winner ? g.round : 0, { ms: WIN_SCENE_MS, emojis: CONFETTI });
  const size = live && g ? g.size : opts.size;
  const level = LEVELS[live && g ? g.level : opts.level];

  return (
    <>
      <RoomHeader name={m.name} status={m.status} round={m.round} playing="đang lật ô">
        <span className="chip text-ink-2">
          ▦ {SIZES[size].label} {SIZES[size].w}×{SIZES[size].h}
        </span>
        <span className="chip text-ink-2">
          {level.emoji} Mức {level.label}
        </span>
        <span className="chip text-ink-2">🙋 {m.players.length} người chơi · không giới hạn</span>
      </RoomHeader>

      <ActionBar view={view} session={session} />
      {!live && <Rules view={view} session={session} />}
      {g?.result && <ResultCard view={view} match={g} />}

      <div ref={areaRef} className="relative mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        {g ? <Play key={g.round} view={view} session={session} match={g} /> : <EmptyBoard view={view} />}
        {g && <Scoreboard view={view} match={g} />}
        <Flyers flyers={flyers} />
      </div>

      {g && count > 0 && <CountdownScene view={view} match={g} n={count} />}
      {g && end.shown && <WinScene view={view} match={g} onClose={end.close} />}
      <Party bits={end.party} />
    </>
  );
});

/** Cảnh mở ván: những người chơi theo thứ tự lượt, đếm ngược 3‑2‑1 rồi mở bàn. */
function CountdownScene({ view, match: g, n }: { view: View; match: TxMatch; n: number }) {
  const first = g.lineup[0]?.uid;
  const people = g.lineup.map((s, i) => ({ uid: s.uid, p: s.member, name: nameIn(view, s.uid), ring: i === 0 ? "#3fe0a5" : "#be97ff", badge: `${i + 1}` }));
  return (
    <CountdownCine
      tone="lilac"
      eyebrow={`🎋 Trúc Xanh · Mức ${LEVELS[g.level].label} · ${SIZES[g.size].w}×${SIZES[g.size].h}`}
      n={n}
      title={g.lineup.length > 1 ? (first === view.me ? "Bạn lật trước!" : `${nameIn(view, first)} lật trước`) : "Lật ô, đoán tranh nào..."}
      tip="Đoán được tranh lúc nào cũng được — đúng là thắng!"
    >
      {g.lineup.length > 1 && <Crowd people={people} />}
    </CountdownCine>
  );
}

/** Cảnh chiến thắng khi có người đoán trúng ngay trước mắt (vào phòng / tải lại trang thì không diễn lại). */
function WinScene({ view, match: g, onClose }: { view: View; match: TxMatch; onClose: () => void }) {
  const winner = g.result?.winner;
  if (!winner) return null;
  const k = g.lineup.findIndex((s) => s.uid === winner);
  return (
    <WinCine winners={[{ uid: winner, p: g.lineup[k]?.member }]} title={winner === view.me ? "Bạn đoán trúng!" : `${nameIn(view, winner)} đoán trúng!`} onClose={onClose}>
      <p className="cine-score">“{g.answer}”</p>
      <p className="text-[15px] font-bold opacity-85">
        Mới lật {pairsOf(g.size) - g.state.left}/{pairsOf(g.size)} cặp · {g.state.guesses.length} lời đoán
      </p>
    </WinCine>
  );
}

/** Lời nhắc theo vai trò và nút chính: vào ghế / rời ghế / bắt đầu / dừng ván. */
function ActionBar({ view, session }: { view: View; session: TrucXanhRoom }) {
  const m = view.meta!;
  const g = view.game!.match;
  const live = isLive(view);
  // Thanh trạng thái đếm giây tới hết lượt suốt ván — chỉ thanh này chạy theo nhịp đồng hồ.
  const now = useNow(live);

  if (live && g) {
    const s = g.state;
    const left = Math.max(0, Math.ceil((g.deadline - now) / 1000));
    let message: React.ReactNode;
    let tone: string = TONE.idle;
    if (!now || now < g.opensAt) {
      tone = TONE.hot;
      message = now ? <>⏳ Chuẩn bị… mở bàn sau {Math.max(1, Math.ceil((g.opensAt - now) / 1000))} giây!</> : <>⏳ Chuẩn bị…</>;
    } else if (s.over) message = <>🎉 Đã có người đoán trúng!</>;
    else if (banned(g)) {
      tone = TONE.alert;
      message = <>🚫 Bạn đã bị xử thua vì gian lận — bị gạch tên, không được lật ô hay đoán nữa. Ở lại xem mọi người chơi nhé.</>;
    } else if (s.cleared) {
      tone = TONE.alert;
      message = (
        <>
          🖼️ Đã lật hết bàn — {g.me >= 0 ? "đoán nhanh lên" : "chờ xem ai đoán ra"}, còn {left} giây!
        </>
      );
    } else if (s.current === g.me) {
      tone = TONE.turn;
      message = g.open.length === 2 ? <>🙈 Trật rồi — ghi nhớ hai ô này nhé!</> : g.open.length === 1 ? <>👉 Lật thêm một ô — trùng hình thì được lật tiếp!</> : <>🎯 Tới lượt bạn — lật hai ô, còn {left} giây.</>;
    } else {
      const who = nameIn(view, g.lineup[s.current]?.uid ?? "");
      message =
        g.me >= 0 ? (
          <>
            ⏳ Lượt của <b>{who}</b> ({left}s) — nhìn tranh thấy gì thì cứ đoán, không cần tới lượt!
          </>
        ) : (
          <>
            👀 Bạn đang xem — lượt của <b>{who}</b> ({left}s).
          </>
        );
    }
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
        join: "Bấm “Vào chơi” để cùng lật ô đoán tranh — không giới hạn người chơi.",
      })}
    >
      <SeatButtons view={view} session={session} blocked={blocked} />
    </StatusBar>
  );
}

/** Luật ván tới: chủ phòng chọn cỡ bàn, người khác xem. */
function Rules({ view, session }: { view: View; session: TrucXanhRoom }) {
  const { opts, pics } = view.game!;
  const host = view.isHost;
  return (
    <section className="card mt-4 grid gap-3 p-4" aria-label="Luật ván tới">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Cỡ bàn</span>
        {SIZE_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`btn btn-sm ${opts.size === k ? "btn-lime" : ""}`}
            aria-pressed={opts.size === k}
            disabled={!host && opts.size !== k}
            onClick={host ? () => session.setOptions({ size: k }) : undefined}
            title={`${pairsOf(k)} cặp hình`}
          >
            {SIZES[k].label} {SIZES[k].w}×{SIZES[k].h}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Mức khó</span>
        {LEVEL_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`btn btn-sm ${opts.level === k ? "btn-lime" : ""}`}
            aria-pressed={opts.level === k}
            disabled={!host && opts.level !== k}
            onClick={host ? () => session.setOptions({ level: k }) : undefined}
            title={LEVELS[k].about}
          >
            {LEVELS[k].emoji} {LEVELS[k].label}
          </button>
        ))}
        <span className="text-[12.5px] font-semibold text-ink-3">{LEVELS[opts.level].about}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[86px] text-[13px] font-bold text-ink-3">Tranh</span>
        <span className="text-[13.5px] font-semibold text-ink-2">
          Đã chơi {pics.used}/{pics.total} tranh mức {LEVELS[opts.level].label}
        </span>
        {host && pics.used > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => session.resetPictures()}>
            ↺ Chơi lại từ đầu bộ
          </button>
        )}
      </div>
      <p className="text-[13.5px] text-ink-2">
        Lần lượt lật hai ô: trùng hình thì cặp ô biến mất, lộ một mảng tranh và được lật tiếp; trật thì úp lại, sang người sau. Mỗi lượt {TURN_MS / 1000} giây. Ai
        cũng đoán được từ khoá của tranh bất cứ lúc nào: đúng là thắng, trật thì thôi (tối đa {GUESS_MAX} lần mỗi ván). Lật hết bàn còn {FINAL_MS / 1000} giây để
        đoán.{!host && " Chủ phòng chọn cỡ bàn và mức khó cho ván tới."}
      </p>
    </section>
  );
}

/** Thẻ kết quả: ai đoán trúng, đáp án. */
function ResultCard({ view, match: g }: { view: View; match: TxMatch }) {
  const r = g.result!;
  if (r.reason === "cheat") return <StoppedCard round={g.round} sub={`Ván ${g.round} dừng — người chơi bị xử thua vì gian lận, không ai thắng. Đáp án là “${g.answer}”.`} />;
  if (r.reason !== "guess") return <StoppedCard round={g.round} />;
  const opened = `${pairsOf(g.size) - g.state.left}/${pairsOf(g.size)} cặp đã lật`;
  if (!r.winner) return <Result round={g.round} title="😮 Không ai đoán ra!" sub={`Đáp án là “${g.answer}” · ${opened}.`} />;
  return <Result round={g.round} title={r.winner === view.me ? "🏆 Bạn đoán trúng tranh!" : `🏆 ${nameIn(view, r.winner)} đoán trúng tranh!`} sub={`Đáp án “${g.answer}” · ${opened}.`} />;
}

/** Bàn trống khi chưa chơi ván nào: các ô úp. */
function EmptyBoard({ view }: { view: View }) {
  const m = view.meta!;
  const { w, h } = SIZES[view.game!.opts.size];
  return (
    <div className="relative">
      <div className="tx-board" style={{ "--cols": w } as React.CSSProperties} aria-hidden="true">
        <div className="tx-grid" style={{ gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${h}, minmax(0, 1fr))` }}>
          {Array.from({ length: w * h }, (_, i) => (
            <span key={i} className="tx-cell">
              <span className="tx-card">
                <span className="tx-back">{i + 1}</span>
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
        <p className="card px-5 py-3 text-center font-display text-lg font-extrabold">
          {!m.players.length ? "Đang chờ người vào ghế…" : view.isHost ? "Bấm “Bắt đầu” để bốc tranh!" : "Đang chờ chủ phòng bốc tranh…"}
        </p>
      </div>
    </div>
  );
}

/** Thanh thời gian còn lại của lượt — tách riêng để nhịp đồng hồ chỉ vẽ lại thanh này. Chưa mở bàn thì trống. */
function TurnTimer({ deadline, total, color }: { deadline?: number; total: number; color: string }) {
  const now = useNow(deadline !== undefined);
  const left = deadline !== undefined && now ? Math.max(0, Math.min(1, (deadline - now) / total)) : 0;
  return (
    <div className="tx-timer" aria-hidden="true">
      <span style={{ width: `${left * 100}%`, background: color }} />
    </div>
  );
}

/** Bàn chơi: tranh ẩn dưới lưới ô; tới lượt thì bấm ô để lật. Dưới tranh là đồng hồ lượt và ô đoán. */
function Play({ view, session, match: g }: { view: View; session: TrucXanhRoom; match: TxMatch }) {
  const live = isLive(view);
  const s = g.state;
  // Bàn chỉ cần biết đã mở chưa — vẽ lại một lần lúc mở bàn; thanh thời gian chạy riêng trong <TurnTimer>.
  const opened = useReached(g.opensAt);
  const counting = live && !opened;
  const done = !live || s.over;
  const myTurn = live && !counting && !done && g.me >= 0 && !banned(g) && turnOf(g) === g.me && g.open.length < 2;
  const [pic, setPic] = useState<"wait" | "ok" | "err">("wait");
  // Các ô đã lật được lúc bàn hiện ra (vào giữa ván, tải lại trang) — không diễn lại hiệu ứng lật trúng.
  const [gone] = useState(() => new Set(s.owner.flatMap((o, i) => (o >= 0 ? [i] : []))));
  const { w, h } = s;
  const turn = turnOf(g);
  const total = s.cleared ? FINAL_MS : TURN_MS;

  return (
    <div className="grid gap-3">
      {live && !done && (
        <TurnTimer deadline={counting ? undefined : g.deadline} total={total} color={s.cleared ? "var(--coral)" : turn === g.me ? "var(--lime)" : "var(--pen)"} />
      )}
      {g.hint && !counting && (
        <p key="hint" className="tx-hint is-open" role="note">
          💡 Gợi ý: {g.hint}
        </p>
      )}
      {g.hintLocked && !counting && (
        <p key="locked" className="tx-hint is-locked" role="note">
          🔒 Câu gợi ý mở khi lật được nửa bàn — đã lật {openedOf(s)}/{hintNeed(s)} ô
        </p>
      )}
      <div className="tx-board" style={{ "--cols": w } as React.CSSProperties}>
        {/* Tranh ẩn chỉ hiện qua những ô đã lật được; ảnh tải sẵn từ lúc đếm ngược. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="tx-pic" src={g.img} alt={done && g.answer ? `Tranh: ${g.answer}` : ""} draggable={false} referrerPolicy="no-referrer" onLoad={() => setPic("ok")} onError={() => setPic("err")} />
        <div className="tx-grid" role="grid" aria-label={`Bàn Trúc Xanh ${w}×${h}`} style={{ gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${h}, minmax(0, 1fr))` }}>
          {s.tiles.map((kind, i) => {
            const owned = s.owner[i] >= 0;
            const open = g.open.includes(i);
            // Ô nào cũng là cùng một nút từ đầu tới cuối ván để CSS diễn liền mạch: úp → lật ngửa → (trúng) giữ hai
            // hình một nhịp rồi mờ đi. Ô đã lật được từ trước khi mình vào bàn thì ẩn luôn, không diễn lại.
            const state = owned ? (gone.has(i) ? "is-cleared" : "is-gone") : done ? "is-done" : open ? "is-open" : myTurn ? "is-pickable" : "";
            return (
              <button
                key={i}
                type="button"
                className={`tx-cell ${state}`}
                onClick={() => session.flip(i)}
                disabled={!myTurn || open || owned || done}
                aria-hidden={owned || undefined}
                aria-label={open || owned ? `Ô ${i + 1}: ${TILES[kind]}` : `Ô ${i + 1}`}
              >
                <span className="tx-card">
                  <span className="tx-back">{i + 1}</span>
                  <span className="tx-face">{open || owned ? TILES[kind] : null}</span>
                </span>
              </button>
            );
          })}
        </div>
        {done && g.answer && <p className="tx-answer">🎋 {g.answer}</p>}
        {pic === "err" && (s.left < pairsOf(g.size) || done) && <p className="tx-answer is-err">⚠️ Không tải được tranh</p>}
        {counting && <div className="sd-hush" aria-hidden="true" />}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-ink-3">
        <span>
          Còn {s.left}/{pairsOf(g.size)} cặp úp
        </span>
        {live && !done && turn >= 0 && <span className="ml-auto">{turn === g.me ? "🟢 Lượt của bạn" : `Lượt của ${nameIn(view, g.lineup[turn]?.uid ?? "")}`}</span>}
      </div>
      {canGuess(view, g, opened) && <GuessBox key={g.round} session={session} match={g} />}
      {live && !done && banned(g) && (
        <p className="tx-banned" role="status">
          🚫 Bạn bị xử thua vì gian lận — ô đoán đã khoá.
        </p>
      )}
    </div>
  );
}

const GUESS_ICON: Record<GuessState, string> = { wait: "⏳", wrong: "❌", near: "🔥", right: "✅" };
const GUESS_LABEL: Record<GuessState, string> = { wait: "đang chấm", wrong: "sai", near: "gần đúng!", right: "đúng!" };

/**
 * Ô đoán — nơi gửi lời đoán (khung chat chỉ để thảo luận). Bàn mở thì tự đặt con trỏ vào ô trên máy có chuột, trừ khi
 * đang gõ ở chỗ khác; điện thoại thì không, để bàn phím ảo không che tranh.
 */
function GuessBox({ session, match: g }: { session: TrucXanhRoom; match: TxMatch }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = inputRef.current;
    const busy = document.activeElement && document.activeElement !== document.body;
    if (el && !busy && window.matchMedia("(pointer: fine)").matches) el.focus({ preventScroll: true });
  }, []);
  const recent = g.guesses.slice(-6);
  const used = g.guesses.length;
  const out = used >= GUESS_MAX;
  return (
    <div className="dw-guessbox card grid gap-2 p-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (session.guess(text)) setText("");
        }}
      >
        <label htmlFor="tx-guess" className="sr-only">
          Từ khoá bạn đoán
        </label>
        <input
          ref={inputRef}
          id="tx-guess"
          className="field"
          placeholder={out ? "Bạn đã hết lượt đoán" : "🎯 Tranh này là gì?"}
          value={text}
          maxLength={GUESS_LEN}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          enterKeyHint="send"
          disabled={out}
        />
        <button type="submit" className="btn btn-pen" disabled={!text.trim() || out}>
          Đoán
        </button>
      </form>
      <p className="text-[12px] font-semibold text-ink-3">
        Không cần dấu · đúng là thắng, trật thì thôi · còn {Math.max(0, GUESS_MAX - used)}/{GUESS_MAX} lần đoán
      </p>
      {recent.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Lời đoán của bạn">
          {recent.map((x, i) => (
            <li key={used - recent.length + i} className={`dw-guess is-${x.state}`} title={GUESS_LABEL[x.state]}>
              {GUESS_ICON[x.state]} {x.text}
              {x.state === "near" && <b> gần đúng!</b>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Người chơi theo thứ tự lượt: ai đang tới lượt, số cặp lật được, số lần đoán. */
function Scoreboard({ view, match: g }: { view: View; match: TxMatch }) {
  const s = g.state;
  const turn = isLive(view) ? turnOf(g) : -1;
  const winner = g.result?.winner;
  return (
    <section className="card p-4" aria-labelledby="tx-score-h">
      <h2 id="tx-score-h" className="font-display text-lg font-extrabold">
        🎋 Thứ tự lượt
      </h2>
      <p className="text-[12.5px] font-semibold text-ink-3">{g.lineup.length} người chơi · ai cũng đoán được bất cứ lúc nào</p>
      <ol className="mt-3 grid max-h-[480px] grid-cols-1 gap-2 overflow-y-auto pr-1">
        {g.lineup.map((seat, k) => {
          const p = seat.member;
          const out = !!g.cheats[k];
          return (
            <li key={seat.uid} className={`tx-player ${k === turn && !out ? "is-turn" : ""} ${out ? "is-out" : ""}`} aria-current={k === turn && !out ? "step" : undefined}>
              <span className="w-5 shrink-0 text-center text-[13px] font-extrabold text-ink-3">{k + 1}</span>
              <span className="relative shrink-0">
                {p ? <Avatar p={p} size={34} className={seat.online && !out ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[34px] w-[34px] bg-sunken" />}
                {(winner === seat.uid || out) && (
                  <span className="absolute -right-2 -bottom-1 text-base" aria-label={out ? "Gian lận — bị xử thua" : "Thắng"}>
                    {out ? "🚫" : "🏆"}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`min-w-0 truncate text-[14px] font-bold ${out ? "line-through decoration-coral decoration-2" : ""}`}>{seat.uid === view.me ? "Bạn" : (p?.name ?? "Ai đó")}</p>
                <p className={`text-[11.5px] font-semibold ${out ? "text-coral" : "text-ink-3"}`}>
                  {out ? "🚨 Gian lận — bị xử thua, cấm đoán" : <>{k === turn ? "🔄 đang lật · " : ""}💬 {s.tries[k]} lần đoán</>}
                </p>
              </div>
              <span className="shrink-0 text-right">
                <span className="block font-display text-2xl leading-none font-extrabold tabular-nums">{s.pairs[k]}</span>
                <span className="text-[10.5px] font-bold text-ink-3">cặp</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
