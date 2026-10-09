"use client";

import { useRef, useState } from "react";
import { docSo, MAX_NUMBER, MAX_PICK, notReady, PACE_NAMES, PACES, SHEET_COLORS, SHEET_COUNT, sheetName, waitingRows } from "@/lib/games/loto";
import { FIRST_CALL_MS, type LotoRoom, type LotoView } from "@/lib/net/loto-room";
import type { ChatMsg, RoomView } from "@/lib/net/room";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "../ConfirmButton";
import { Dialog } from "../Dialog";
import { ChatPanel } from "./ChatPanel";
import { CountdownCine, Crowd, Party, useCountdown, useEndScene, WinCine } from "./Cine";
import { LotoSheet, SheetDots, sheetStyle } from "./LotoSheet";
import { Balloon, PeoplePanel } from "./People";
import { Flyers, RoomLayout, StatusChip } from "./RoomLayout";
import { useConfetti, useInView, useVoice } from "./useLoto";
import { useBalloons, useFlyers, useRoomView } from "./useRoom";

type View = RoomView<LotoView>;
type Voice = ReturnType<typeof useVoice>;

const NUMBERS = Array.from({ length: MAX_NUMBER }, (_, i) => i + 1);

/** Các tờ một người giữ: trong ván là tờ đã chia, ngoài ván là tờ đang chọn. */
function sheetsOf(view: View, uid: string) {
  const g = view.game!;
  return view.meta!.status === "playing" ? (g.dealt[uid] ?? []) : g.owner.flatMap((owner, id) => (owner === uid ? [id] : []));
}

/** Lựa chọn của mình, tính cả ý định đang chờ chủ phòng ghi nhận: tờ đang chọn, đã sẵn sàng chưa. */
function myChoice(view: View) {
  const g = view.game!;
  return { sheets: g.pending?.pick ?? g.mine, ready: g.pending ? g.pending.ready : g.ready.includes(view.me), waiting: !!g.pending };
}

export function LotoTable({ id, slug, session }: { id: string; slug: string; session: LotoRoom }) {
  const view = useRoomView(session)!;
  const m = view.meta!;
  const g = view.game!;
  const balloons = useBalloons(session);
  const areaRef = useRef<HTMLDivElement>(null);
  const callerRef = useRef<HTMLElement>(null);
  const flyers = useFlyers(session, areaRef);
  const voice = useVoice(session, view.isHost);
  const confetti = useConfetti(session);
  const callerInView = useInView(callerRef);
  const playing = m.status === "playing";
  const taken = g.owner.filter(Boolean).length;
  const last = g.state.draws.at(-1);
  // Mở ván: đếm ngược 3‑2‑1 tới lúc kêu số đầu tiên. Hết ván có người kinh: cảnh chiến thắng (pháo giấy đã có sẵn lúc kinh).
  const count = useCountdown(playing && g.round === m.round && !g.state.draws.length && !g.paused ? g.round : 0);
  const end = useEndScene(g.result?.reason === "kinh" && g.result.round === g.round ? g.round : 0, { cheer: false });

  return (
    <RoomLayout
      id={id}
      slug={slug}
      side={
        <>
          <PeoplePanel
            view={view}
            session={session}
            balloons={balloons}
            roomId={id}
            canSeat={false}
            unseatLabel="Thu tờ"
            detail={(p, seated) => (seated ? <PersonSheets view={view} uid={p.uid} /> : "Đang xem")}
          />
          <ChatPanel session={session} chat={view.chat} me={view.me} />
        </>
      }
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{m.name}</h1>
        <StatusChip status={m.status} round={m.round} playing="đang kêu số" />
        <span className="chip text-ink-2">⏱ {g.opts.interval / 1000} giây/số</span>
        <span className="chip" style={{ color: taken >= SHEET_COUNT ? "var(--coral)" : "var(--ink-3)" }}>
          🎫 {taken}/{SHEET_COUNT} tờ
        </span>
      </header>

      <div ref={areaRef} className="relative">
        <Caller ref={callerRef} view={view} session={session} voice={voice} balloons={balloons} />
        {g.result && <ResultCard view={view} />}
        <div className="mt-4">
          <ActionBar view={view} session={session} voice={voice} />
        </div>
        <div className="mt-4 grid gap-4">
          {!playing && <Picker view={view} session={session} />}
          <MySheets view={view} />
        </div>
        <Flyers flyers={flyers} />
      </div>

      {playing && !callerInView && last && <FloatingBall n={last} paused={g.paused} />}
      {count > 0 && <CountdownScene view={view} n={count} />}
      {g.result && end.shown && <EndScene view={view} onClose={end.close} />}
      <Party bits={confetti} />
    </RoomLayout>
  );
}

/** Cảnh mở ván: những người cầm tờ (kèm số tờ), đếm ngược 3‑2‑1 tới số đầu tiên. */
function CountdownScene({ view, n }: { view: View; n: number }) {
  const g = view.game!;
  const people = Object.entries(g.dealt)
    .filter(([, ids]) => ids.length)
    .map(([uid, ids]) => {
      const p = g.people[uid]?.member;
      return { uid, p, name: uid === view.me ? "Bạn" : (p?.name ?? "Ai đó"), ring: SHEET_COLORS[Math.floor(ids[0] / 2)]?.hex, badge: ids.length > 1 ? `${ids.length}🎫` : "🎫" };
    });
  const mine = g.dealt[view.me]?.length ?? 0;
  return (
    <CountdownCine eyebrow={`🧧 Lô Tô · Ván ${g.round}`} n={n} tip={mine ? `Bạn cầm ${mine} tờ — dò số cho kỹ, đủ 5 số một hàng là Kinh!` : "Sắp kêu số đầu tiên — cùng xem ai kinh trước nhé!"}>
      <Crowd people={people} />
    </CountdownCine>
  );
}

/** Cảnh kinh: người (hoặc những người kinh trùng) thắng ván — bấm để đóng. */
function EndScene({ view, onClose }: { view: View; onClose: () => void }) {
  const g = view.game!;
  const winners = g.result!.winners ?? [];
  const iWon = winners.includes(view.me);
  const names = winners.map((u) => (u === view.me ? "Bạn" : (g.people[u]?.member?.name ?? "Ai đó"))).join(", ");
  const last = g.state.draws.at(-1);
  return (
    <WinCine
      trophy="🧧"
      winners={winners.map((u) => ({ uid: u, p: g.people[u]?.member, badge: "🎫" }))}
      title={winners.length > 1 ? `Kinh trùng! ${names}` : iWon ? "Bạn kinh rồi!" : `${names} kinh!`}
      sub={`Kinh ở số ${last ?? "?"} — sau ${g.state.draws.length} số`}
      note={!iWon && g.dealt[view.me]?.length ? "Ván sau may mắn hơn nhé!" : undefined}
      onClose={onClose}
    />
  );
}

/** Bảng kêu số: số vừa kêu (kèm vòng đếm tới số kế tiếp), bảng dò 1–90, người chơi quanh bàn và nút của chủ phòng. */
function Caller({ ref, view, session, voice, balloons }: { ref: React.Ref<HTMLElement>; view: View; session: LotoRoom; voice: Voice; balloons: Record<string, ChatMsg> }) {
  const m = view.meta!;
  const g = view.game!;
  const { draws, drawn } = g.state;
  const last = draws.at(-1);
  const playing = m.status === "playing";
  const recent = draws.slice(-6, -1).reverse();
  const ring = playing && !g.paused ? (draws.length ? g.opts.interval : FIRST_CALL_MS) : 0;
  const status = playing
    ? g.paused
      ? "⏸ Tạm dừng kêu số"
      : draws.length
        ? `Số thứ ${draws.length}`
        : "Chuẩn bị kêu số…"
    : m.round
      ? `Hết ván ${g.round} · đã kêu ${draws.length} số`
      : "Chờ chủ phòng bắt đầu";

  return (
    <section ref={ref} className="card loto-caller p-4 sm:p-5" aria-label="Bảng kêu số">
      <div className="grid items-center gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 items-center gap-4">
          <Ball n={last} ring={ring} count={draws.length} />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-bold tracking-wide text-ink-3 uppercase">{status}</p>
            <p className="font-display text-[26px] leading-tight font-extrabold first-letter:uppercase sm:text-[30px]" aria-live="polite">
              {last ? docSo(last) : "Lô tô ngày Tết"}
            </p>
            {recent.length > 0 && (
              <ol className="mt-2 flex flex-wrap gap-1.5" aria-label="Các số kêu trước đó">
                {recent.map((n) => (
                  <li key={n} className="loto-chip">
                    {n}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        <div className="hidden xl:block">
          <Board drawn={drawn} last={last} />
        </div>
      </div>
      <details className="mt-3 xl:hidden">
        <summary className="cursor-pointer text-sm font-bold text-ink-2">
          Bảng dò số ({draws.length}/{MAX_NUMBER})
        </summary>
        <div className="mt-2">
          <Board drawn={drawn} last={last} />
        </div>
      </details>

      <Players view={view} balloons={balloons} />

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t-2 border-rule pt-3">
        {voice.available ? (
          <>
            <button type="button" className="btn btn-sm" onClick={voice.toggle} aria-pressed={voice.on} title={`Đọc to số vừa kêu bằng giọng tiếng Việt “${voice.name}”`}>
              {voice.on ? "🔊 Đang đọc số" : "🔇 Đọc số"}
            </button>
            {voice.on && <span className="text-[12.5px] font-semibold text-ink-3">giọng {voice.name}</span>}
          </>
        ) : (
          <VoiceHelp host={view.isHost} />
        )}
        <div className="flex-1" />
        {view.isHost && (
          <div role="group" aria-label="Nhịp kêu số" className="flex items-center gap-1">
            <span className="mr-1 text-[13px] font-bold text-ink-3">Nhịp</span>
            {PACES.map((p) => (
              <button
                key={p}
                type="button"
                className={`btn btn-sm !px-2.5 ${p === g.opts.interval ? "btn-sun" : ""}`}
                aria-pressed={p === g.opts.interval}
                title={`${PACE_NAMES[p]} — ${p / 1000} giây một số`}
                onClick={() => session.setPace(p)}
              >
                {p / 1000}s
              </button>
            ))}
          </div>
        )}
        {view.isHost && playing && (
          <button type="button" className="btn btn-sm" onClick={() => session.pause(!g.paused)}>
            {g.paused ? "▶ Tiếp tục" : "⏸ Tạm dừng"}
          </button>
        )}
      </div>
    </section>
  );
}

/** Máy chưa có giọng tiếng Việt: không đọc bằng giọng ngôn ngữ khác, chỉ hướng dẫn cài giọng Việt. */
function VoiceHelp({ host }: { host: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn btn-sm ${host ? "btn-sun" : ""}`} onClick={() => setOpen(true)}>
        🔇 Máy chưa có giọng tiếng Việt
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Cài giọng đọc tiếng Việt">
        {open && (
          <div className="grid gap-3 text-[14.5px]">
            <p className="text-ink-2">
              Số chỉ được đọc bằng giọng tiếng Việt có sẵn trong máy{host ? " — máy chủ phòng là người kêu số nên cần có giọng này" : ""}. Cài theo
              hướng dẫn rồi tải lại trang:
            </p>
            <ul className="grid gap-2">
              <li>
                <b>iPhone, iPad:</b> Cài đặt → Trợ năng → Nội dung được đọc → Giọng nói → Tiếng Việt → tải giọng “Linh”.
              </li>
              <li>
                <b>Android:</b> Cài đặt → tìm “Chuyển văn bản thành giọng nói” → chọn dịch vụ của Google → cài dữ liệu giọng Tiếng Việt.
              </li>
              <li>
                <b>Máy Mac:</b> Cài đặt hệ thống → Trợ năng → Nội dung được đọc → Giọng hệ thống → Quản lý giọng nói… → Tiếng Việt (Linh).
              </li>
              <li>
                <b>Windows:</b> mở trang bằng trình duyệt Microsoft Edge — có sẵn giọng tiếng Việt HoaiMy, NamMinh.
              </li>
            </ul>
          </div>
        )}
      </Dialog>
    </>
  );
}

function Ball({ n, ring, count }: { n?: number; ring: number; count: number }) {
  return (
    <div className="loto-ball-wrap">
      {ring > 0 && (
        <svg key={`ring:${count}`} className="loto-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="47" pathLength={100} style={{ animationDuration: `${ring}ms` }} />
        </svg>
      )}
      <div key={`ball:${n ?? 0}`} className={`loto-ball ${n ? "is-new" : ""}`}>
        <span>{n ?? "🧧"}</span>
      </div>
    </div>
  );
}

function Board({ drawn, last }: { drawn: readonly boolean[]; last?: number }) {
  return (
    <ol className="loto-board" aria-label="Bảng dò số 1–90">
      {NUMBERS.map((n) => (
        <li key={n} className={drawn[n] ? (n === last ? "is-last" : "is-on") : undefined}>
          {n}
          {drawn[n] && <span className="sr-only"> (đã kêu)</span>}
        </li>
      ))}
    </ol>
  );
}

/** Người chơi quanh bàn: tờ đang giữ, đang đợi mấy hàng, bóng thoại "Hò!" / "Kinh!". */
function Players({ view, balloons }: { view: View; balloons: Record<string, ChatMsg> }) {
  const m = view.meta!;
  const g = view.game!;
  const roster = m.status === "playing" ? Object.keys(g.dealt) : m.players;
  const winners = new Set(g.result?.winners ?? []);
  if (!roster.length) return <p className="mt-4 text-sm font-semibold text-ink-3">Chưa ai chọn tờ — chọn tờ bên dưới để vào bàn.</p>;
  return (
    <ul className="mt-5 flex flex-wrap gap-x-1 gap-y-3" aria-label="Người chơi">
      {roster.map((uid) => {
        const seat = g.people[uid];
        const p = seat?.member;
        const wait = g.waiting[uid] ?? 0;
        // Ngoài ván: ai đã bấm sẵn sàng (chủ phòng không cần bấm).
        const readiness = m.status === "playing" || uid === m.host ? null : g.ready.includes(uid);
        return (
          <li key={uid} className="flex w-[68px] flex-col items-center gap-1 text-center">
            <span className="relative">
              {p ? <Avatar p={p} size={40} className={seat.online ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-10 w-10 bg-sunken" />}
              <Balloon msg={balloons[uid]} />
              {uid === m.host && (
                <span className="absolute -top-2.5 -right-1.5 text-base" title="Chủ phòng — người kêu số">
                  👑
                </span>
              )}
              {winners.has(uid) && (
                <span className="absolute -right-2 -bottom-1 text-lg" title="Kinh!">
                  🏆
                </span>
              )}
              {wait > 0 && (
                <span className="loto-badge is-wait" title={`Đang đợi ${wait} hàng`}>
                  đợi{wait > 1 ? ` ×${wait}` : ""}
                </span>
              )}
              {readiness != null && <span className={`loto-badge ${readiness ? "is-ready" : "is-idle"}`}>{readiness ? "sẵn sàng" : "chưa"}</span>}
            </span>
            <span className="mt-0.5 w-full truncate text-[12px] leading-tight font-bold">{uid === view.me ? "Bạn" : (p?.name ?? "…")}</span>
            <SheetDots ids={sheetsOf(view, uid)} size={10} />
          </li>
        );
      })}
    </ul>
  );
}

function PersonSheets({ view, uid }: { view: View; uid: string }) {
  const m = view.meta!;
  const g = view.game!;
  const ids = sheetsOf(view, uid);
  const wait = g.waiting[uid] ?? 0;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <SheetDots ids={ids} size={10} />
      <span aria-hidden="true">{ids.map(sheetName).join(", ")}</span>
      {wait > 0 && <b className="text-ink-2">· 🔔 đợi {wait} hàng</b>}
      {m.status !== "playing" && uid !== m.host && <b className="text-ink-2">· {g.ready.includes(uid) ? "✅ sẵn sàng" : "⏳ chưa sẵn sàng"}</b>}
    </span>
  );
}

/** Lời nhắc theo vai trò và nút chính: sẵn sàng / trả tờ / bắt đầu / dừng ván. */
function ActionBar({ view, session, voice }: { view: View; session: LotoRoom; voice: Voice }) {
  const m = view.meta!;
  const g = view.game!;
  const playing = m.status === "playing";
  const free = g.owner.filter((o) => !o).length;
  const me = myChoice(view);
  const unready = notReady(m.players, m.host, g.ready);
  const canStart = m.players.length > 0 && !unready.length;
  const nameOf = (uid: string) => g.people[uid]?.member?.name ?? "Ai đó";
  const next = m.round ? "Ván mới" : "Bắt đầu";

  let message: React.ReactNode;
  let tone = "var(--sunken)";
  if (playing) {
    const mine = g.dealt[view.me] ?? [];
    const needs = [...new Set(waitingRows(g.sheets, mine, g.state.drawn).map((w) => w.need))];
    if (!mine.length) message = view.isHost ? <>🎙️ Bạn đang kêu số — máy tự rút số theo nhịp, mọi người tự dò tờ.</> : <>👀 Bạn đang xem ván này — hết ván sẽ được chọn tờ.</>;
    else if (needs.length) {
      tone = "var(--sun-soft)";
      message = (
        <>
          🔔 Đợi rồi! Chỉ cần số <b>{needs.join(", ")}</b> là kinh.
        </>
      );
    } else message = <>🎯 Đang dò số — số được kêu tự đánh dấu trên tờ của bạn.</>;
  } else if (me.waiting) {
    message = me.ready ? <>⏳ Đang báo sẵn sàng…</> : me.sheets.length ? <>⏳ Đang chờ chủ phòng ghi nhận tờ…</> : <>⏳ Đang trả tờ…</>;
  } else if (view.isHost) {
    tone = canStart ? "var(--lime-soft)" : "var(--sunken)";
    message = (
      <>
        👑 {g.mine.length ? <>Bạn giữ tờ <b>{g.mine.map(sheetName).join(", ")}</b>. </> : <>Bạn là người kêu số — chọn tờ nếu muốn chơi cùng. </>}
        {!m.players.length
          ? "Chờ mọi người chọn tờ."
          : unready.length
            ? `Còn ${unready.length} người chưa sẵn sàng.`
            : `Mọi người đã sẵn sàng — bấm “${next}”!`}
      </>
    );
  } else if (me.ready) {
    tone = "var(--lime-soft)";
    message = (
      <>
        ✅ Đã sẵn sàng với tờ <b>{g.mine.map(sheetName).join(", ")}</b> — chờ chủ phòng bắt đầu{m.round ? " ván mới" : ""}.
      </>
    );
  } else if (g.mine.length) {
    tone = "var(--sun-soft)";
    message = (
      <>
        🎫 Bạn giữ tờ <b>{g.mine.map(sheetName).join(", ")}</b>. Chọn xong thì bấm “Sẵn sàng”.
      </>
    );
  } else {
    message = free ? <>🎫 Chọn 1–{MAX_PICK} tờ bên dưới rồi bấm “Sẵn sàng”.</> : <>🈵 Hết tờ rồi — bạn có thể ngồi xem và trò chuyện.</>;
  }

  return (
    <div className="card flex flex-wrap items-center gap-3 px-4 py-3" style={{ background: tone }} aria-live="polite">
      <p className="min-w-0 flex-1 text-[15px] font-semibold">{message}</p>
      <div className="flex flex-wrap gap-2">
        {!playing && g.mine.length > 0 && !me.ready && (
          <button type="button" className="btn" onClick={() => session.pick([])} disabled={me.waiting}>
            Trả tờ
          </button>
        )}
        {!playing && !view.isHost && g.mine.length > 0 && !me.ready && (
          <button type="button" className="btn btn-lime" onClick={() => session.setReady(true)} disabled={me.waiting}>
            🙋 Sẵn sàng
          </button>
        )}
        {!playing && !view.isHost && me.ready && (
          <button type="button" className="btn" onClick={() => session.setReady(false)} disabled={me.waiting}>
            Huỷ sẵn sàng
          </button>
        )}
        {!playing && view.isHost && (
          <button
            type="button"
            className="btn btn-pen"
            onClick={() => {
              voice.announce("Bắt đầu!");
              session.start();
            }}
            disabled={!canStart}
            title={!m.players.length ? "Cần ít nhất một người chọn tờ" : unready.length ? `Chưa sẵn sàng: ${unready.map(nameOf).join(", ")}` : ""}
          >
            {m.round > 0 ? "🔁 Ván mới" : "▶ Bắt đầu"}
          </button>
        )}
        {playing && view.isHost && (
          <ConfirmButton className="btn btn-coral" onConfirm={() => session.stop()} confirmLabel="Bấm lần nữa để dừng">
            ⏹ Dừng ván
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}

function ResultCard({ view }: { view: View }) {
  const g = view.game!;
  const r = g.result!;
  const winners = r.winners ?? [];
  const last = g.state.draws.at(-1);
  return (
    <section className="card loto-result mt-4 p-4 sm:p-5" aria-label={`Kết quả ván ${g.round}`}>
      <p className="font-display text-3xl font-extrabold tracking-tight">
        {winners.length ? "🎉" : "⏹"} {winners.length > 1 ? "Kinh trùng!" : winners.length ? "Kinh!" : "Dừng ván"}
      </p>
      {winners.length === 0 ? (
        <p className="mt-1 text-[15px] text-ink-2">Ván {g.round} dừng giữa chừng — không ai kinh.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {g.state.wins.map((win) => {
            const p = g.people[win.uid]?.member;
            const row = g.sheets[win.sheet].rows[win.row].filter(Boolean);
            return (
              <li key={`${win.uid}:${win.sheet}:${win.row}`} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {p && <Avatar p={p} size={38} />}
                <div className="min-w-0">
                  <p className="font-bold">{win.uid === view.me ? "Bạn" : (p?.name ?? "Ai đó")}</p>
                  <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-3">
                    <SheetDots ids={[win.sheet]} size={10} /> Tờ {sheetName(win.sheet)} · hàng {win.row + 1}
                  </p>
                </div>
                <ol className="flex gap-1.5 sm:ml-auto" aria-label="Năm số của hàng kinh">
                  {row.map((n) => (
                    <li key={n} className={`loto-chip ${n === last ? "is-last" : "is-win"}`}>
                      {n}
                    </li>
                  ))}
                </ol>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** 20 tờ của bộ: bấm để chọn / bỏ; tờ người khác đang giữ hiện avatar của họ. */
function Picker({ view, session }: { view: View; session: LotoRoom }) {
  const g = view.game!;
  const me = myChoice(view);
  const chosen = me.sheets;
  // Đã sẵn sàng thì khoá tờ; muốn đổi phải huỷ sẵn sàng trước.
  const locked = me.ready;
  const [note, setNote] = useState("");
  const free = g.owner.filter((o) => !o).length;

  const toggle = (id: number) => {
    if (chosen.includes(id)) {
      setNote("");
      session.pick(chosen.filter((x) => x !== id));
    } else if (chosen.length >= MAX_PICK) setNote(`Mỗi người giữ tối đa ${MAX_PICK} tờ — bỏ bớt một tờ trước nhé.`);
    else {
      setNote("");
      session.pick([...chosen, id]);
    }
  };

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="loto-pick-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="loto-pick-h" className="font-display text-lg font-extrabold">
          🎫 Chọn tờ
        </h2>
        <p className="text-[13px] font-semibold text-ink-3">
          {free} tờ trống · mỗi người 1–{MAX_PICK} tờ
        </p>
      </div>
      <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-10">
        {g.sheets.map((s) => {
          const owner = g.owner[s.id];
          const mine = chosen.includes(s.id);
          const theirs = !!owner && owner !== view.me && !mine;
          const holder = theirs ? g.people[owner]?.member : undefined;
          const pending = me.waiting && mine !== g.mine.includes(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => toggle(s.id)}
                disabled={theirs || locked}
                aria-pressed={mine}
                aria-label={`Tờ ${sheetName(s.id)}: ${mine ? (pending ? "đang chờ ghi nhận" : "của bạn") : theirs ? `${holder?.name ?? "người khác"} đang giữ` : "trống"}`}
                className={`loto-tile ${mine ? "is-mine" : ""} ${pending ? "is-pending" : ""}`}
                style={sheetStyle(s.id)}
                title={theirs ? `${holder?.name ?? "Người khác"} đang giữ tờ này` : mine ? "Bấm để bỏ tờ này" : "Bấm để chọn tờ này"}
              >
                <span className="loto-tile-band">
                  {SHEET_COLORS[s.color].name} {s.no}
                </span>
                <span className="loto-tile-body">
                  {mine ? (pending ? "…" : "✓ Của bạn") : theirs ? holder ? <Avatar p={holder} size={22} /> : "Đã có người" : "Trống"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {locked && <p className="mt-2 text-sm font-semibold text-ink-3">Bạn đã sẵn sàng — bấm “Huỷ sẵn sàng” nếu muốn đổi tờ.</p>}
      {note && !locked && (
        <p className="mt-2 text-sm font-semibold text-coral" role="alert">
          {note}
        </p>
      )}
    </section>
  );
}

/** Tờ của mình. Chỉ tờ đã chơi ở ván gần nhất mới có dấu; tờ vừa chọn cho ván sau để trắng. */
function MySheets({ view }: { view: View }) {
  const m = view.meta!;
  const g = view.game!;
  const played = g.dealt[view.me] ?? [];
  const ids = m.status === "playing" ? played : myChoice(view).sheets;
  if (!ids.length) return null;
  const last = g.state.draws.at(-1);
  return (
    <section aria-label="Tờ của bạn" className={`grid gap-4 ${ids.length > 1 ? "md:grid-cols-2" : "mx-auto w-full max-w-[520px]"}`}>
      {ids.map((id) => {
        const marked = m.round > 0 && played.includes(id);
        return (
          <LotoSheet
            key={id}
            sheet={g.sheets[id]}
            drawn={marked ? g.state.drawn : undefined}
            last={marked ? last : undefined}
            wins={marked ? g.state.wins.filter((w) => w.uid === view.me && w.sheet === id).map((w) => w.row) : undefined}
            live={m.status === "playing"}
            pending={!!g.pending && !g.mine.includes(id)}
          />
        );
      })}
    </section>
  );
}

/** Số đang kêu nổi ở góc khi đã cuộn qua bảng kêu số — để vừa nhìn tờ vừa biết số. */
function FloatingBall({ n, paused }: { n: number; paused: boolean }) {
  return (
    <div className="loto-float" aria-hidden="true">
      <div key={n} className="loto-ball is-mini is-new">
        <span>{n}</span>
      </div>
      {paused && <span className="loto-float-tag">⏸</span>}
    </div>
  );
}
