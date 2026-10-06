"use client";

import { useEffect, useRef, useState } from "react";
import {
  autoUndercovers,
  GUESS_TEXT,
  guessOf,
  MAX_PLAYERS,
  MAX_UNDERCOVERS,
  MAX_WHITES,
  MIN_PLAYERS,
  ROLE_ORDER,
  ROLES,
  speakers,
  TALKS,
  talkName,
  TIE_NAMES,
  type Out,
  type Public,
  type Role,
  type Tie,
  type UcOptions,
} from "@/lib/games/undercover";
import type { ChatMsg, RoomView } from "@/lib/net/room";
import type { Scene, UcView, UndercoverRoom } from "@/lib/net/undercover-room";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "../ConfirmButton";
import { Dialog } from "../Dialog";
import { ChatPanel } from "./ChatPanel";
import { Balloon, PeoplePanel } from "./People";
import { Flyers, RoomLayout, StatusChip } from "./RoomLayout";
import { useBalloons, useFlyers, useRoomView } from "./useRoom";

type View = RoomView<UcView>;

/** Một lựa chọn đang mở trên bàn: bấm vào người chơi để chọn. */
type Pick = { verb: string; can: (uid: string) => boolean; chosen?: string; onPick: (uid: string) => void };

/** Giờ hiện tại, cập nhật đều khi `active`. */
function useNow(active: boolean, every = 500) {
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

const nameIn = (view: View, uid: string) => (uid === view.me ? "Bạn" : (view.game!.people[uid]?.member?.name ?? "Ai đó"));
/** Tên dùng giữa câu: "bạn" viết thường. */
const nameMid = (view: View, uid: string) => (uid === view.me ? "bạn" : nameIn(view, uid));
const names = (view: View, uids: string[]) => uids.map((u) => nameIn(view, u)).join(", ");

const outOf = (pub: Public | undefined, uid: string) => pub?.outs.find((o) => o.uid === uid);
const outText = (o: Out) => (o.how === "left" ? "rời ván" : `bị loại vòng ${o.day}`);
const teamOf = (r: Role) => `${ROLES[r].emoji} ${ROLES[r].team}`;

/** Phe của một người mà mình được biết: thấy hết, hết ván, người bị loại lộ phe, của mình. */
function knownRole(view: View, uid: string): Role | undefined {
  const g = view.game!;
  return g.seeAll?.roles[uid] ?? g.pub?.roles?.[uid] ?? outOf(g.pub, uid)?.role ?? (uid === view.me ? g.me.role : undefined);
}

/** Lý do khoá ô chat: đang phát từ, phe Trắng đang đoán, người bị loại, người xem biết hết từ khoá. */
function chatLock(view: View) {
  const g = view.game!;
  const stage = g.pub?.stage;
  if (!g.playing) return undefined;
  if (!g.me.inGame) return g.seeAll && !view.isHost ? "👀 Bạn đang xem và thấy hết từ khoá — giữ im lặng tới hết ván để không lộ bí mật." : undefined;
  if (!g.me.alive) return "❌ Bạn đã bị loại — không được tham gia thảo luận nữa.";
  if (stage === "intro") return "🃏 Đang phát từ — lật bài xong là được thảo luận.";
  if (stage === "guess") return "👤 Phe Trắng đang đoán từ khoá — giữ im lặng nhé.";
}

export function UndercoverTable({ id, slug, session }: { id: string; slug: string; session: UndercoverRoom }) {
  const view = useRoomView(session)!;
  const m = view.meta!;
  const g = view.game!;
  const balloons = useBalloons(session);
  const areaRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, areaRef);
  const [rules, setRules] = useState(false);
  // Lá bài phát từ đã đóng ở ván nào (mở lại được trong lúc phát từ).
  const [dealClosed, setDealClosed] = useState(0);
  // Người đang chọn loại ở lượt bỏ phiếu hiện tại (chưa xác nhận).
  const turn = `${g.pub?.round}:${g.pub?.day}:${g.pub?.stage}`;
  const [sel, setSel] = useState<{ turn: string; uid: string } | null>(null);
  const selected = sel?.turn === turn ? sel.uid : undefined;
  const pick = pickOf(view, session, selected, (uid) => setSel({ turn, uid }));

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
            unseatLabel="Huỷ sẵn sàng"
            detail={(p, seated) => <PersonLine view={view} uid={p.uid} seated={seated} />}
          />
          <ChatPanel session={session} chat={view.chat} me={view.me} locked={chatLock(view)} />
        </>
      }
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{m.name}</h1>
        <StatusChip status={m.status} round={m.round} playing="đang chơi" />
        {!g.playing && <span className="chip text-ink-2">🙋 {m.players.length} người sẵn sàng</span>}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRules(true)}>
          📜 Luật chơi
        </button>
      </header>

      <div ref={areaRef} className="relative grid gap-4">
        <StageCard view={view} session={session} />
        {g.result && <ResultCard view={view} />}
        {g.playing && (
          <ActionCard view={view} session={session} selected={selected} clear={() => setSel(null)} reopenDeal={() => setDealClosed(0)} />
        )}
        {g.me.inGame && g.me.word !== undefined && !g.result && <WordCard view={view} />}
        {g.seeAll && g.playing && <SeeAllCard view={view} />}
        <Players view={view} pick={pick} balloons={balloons} />
        {!g.playing && <Settings view={view} session={session} />}
        <Flyers flyers={flyers} />
      </div>

      <Cinema view={view} session={session} dealClosed={dealClosed === m.round} closeDeal={() => setDealClosed(m.round)} />
      <Dialog open={rules} onClose={() => setRules(false)} title="Luật Truy tìm Gián Điệp">
        {rules && <Rules opts={g.opts} />}
      </Dialog>
    </RoomLayout>
  );
}

/** Lựa chọn đang mở cho mình: chọn người để loại (rồi xác nhận), hoặc chủ phòng phá hoà. */
function pickOf(view: View, session: UndercoverRoom, selected: string | undefined, select: (uid: string) => void): Pick | null {
  const g = view.game!;
  const pub = g.pub;
  if (!g.playing || !pub) return null;
  const alive = (u: string) => pub.alive.includes(u);
  if ((pub.stage === "vote" || pub.stage === "revote") && g.me.alive && !g.me.vote)
    return {
      verb: "Chọn loại",
      can: (u) => alive(u) && u !== view.me && (!pub.candidates || pub.candidates.includes(u)),
      chosen: selected,
      onPick: select,
    };
  if (pub.stage === "decide" && view.isHost && !g.opts.hostPlays)
    return { verb: "Loại", can: (u) => alive(u) && !!pub.candidates?.includes(u), onPick: (u) => session.decide(u) };
  return null;
}

/** Dòng mô tả từng người trong danh sách phòng. */
function PersonLine({ view, uid, seated }: { view: View; uid: string; seated: boolean }) {
  const g = view.game!;
  const pub = g.pub;
  const m = view.meta!;
  const inRound = !!pub && m.lineup.includes(uid) && (g.playing || !!g.result);
  if (uid === m.host && !inRound && !g.opts.hostPlays) return <>🎩 Điều hành — xem hết và điều khiển ván</>;
  if (inRound) {
    const o = outOf(pub, uid);
    const role = pub!.roles?.[uid];
    if (!o) {
      const n = speakers(pub!).indexOf(uid) + 1;
      return <>{g.playing ? `Còn trong ván · nói thứ ${n}` : `Trụ lại${role ? ` · ${teamOf(role)}` : ""}`}</>;
    }
    return (
      <>
        ❌ {outText(o)} · {teamOf(o.role)}
      </>
    );
  }
  if (g.playing) return <>Đang xem</>;
  return <>{seated ? "✅ Sẵn sàng" : "Đang xem"}</>;
}

// ---------- giai đoạn ----------

function stageText(view: View): { icon: string; title: string; sub: string } {
  const m = view.meta!;
  const g = view.game!;
  const pub = g.pub;
  if (!g.playing || !pub) {
    if (g.result) return { icon: "🏁", title: `Hết ván ${m.round}`, sub: "Xem lật bài, cặp từ khoá và diễn biến câu chuyện bên dưới." };
    const n = m.players.length;
    return {
      icon: "🕵️",
      title: "Bàn đang tụ họp",
      sub: n < MIN_PLAYERS ? `Cần ít nhất ${MIN_PLAYERS} người sẵn sàng — đang có ${n}.` : `${n} người đã sẵn sàng. Chờ chủ phòng bắt đầu.`,
    };
  }
  const d = pub.day;
  const voted = Object.keys(g.ballots).length;
  switch (pub.stage) {
    case "intro":
      return { icon: "🃏", title: "Phát từ", sub: `Bấm vào lá bài của bạn để lật xem từ khoá. Đã lật ${g.ready.length}/${pub.alive.length}.` };
    case "talk":
      return {
        icon: "💬",
        title: `Vòng ${d} — thảo luận`,
        sub: "Lần lượt mô tả từ khoá trong khung chat theo thứ tự, rồi tranh luận xem ai lạc chủ đề. Ai cũng có thể gọi biểu quyết.",
      };
    case "vote":
    case "revote":
      return {
        icon: "🗳️",
        title: pub.stage === "revote" ? "Bỏ phiếu phụ" : `Vòng ${d} — biểu quyết`,
        sub: `${pub.stage === "revote" ? `Hoà phiếu — chỉ được chọn ${names(view, pub.candidates ?? [])}. ` : ""}Chọn người cần loại rồi xác nhận — người nhiều phiếu nhất bị loại. Đã xác nhận ${voted}/${pub.alive.length}.`,
      };
    case "decide":
      return { icon: "⚖️", title: "Vẫn hoà phiếu", sub: `Chủ phòng chọn một trong ${names(view, pub.candidates ?? [])} để loại.` };
    case "verdict": {
      const o = pub.out ? outOf(pub, pub.out) : undefined;
      return o
        ? { icon: ROLES[o.role].emoji, title: `${nameIn(view, o.uid)} bị loại`, sub: `Thuộc ${ROLES[o.role].team}${o.role === "white" ? " — được đoán từ khoá!" : "."}` }
        : { icon: "🕊️", title: "Không ai bị loại", sub: "Vòng sau sắp bắt đầu…" };
    }
    case "guess":
      return { icon: "👤", title: `${nameIn(view, pub.out ?? "")} đoán từ khoá`, sub: "Phe Trắng chỉ được đoán một lần — đúng từ của phe Dân là thắng ngay, sai thì bị loại." };
    case "judged": {
      const x = guessOf(pub);
      return x?.right
        ? { icon: "🎯", title: "Phe Trắng đoán đúng!", sub: `“${x.text}”` }
        : { icon: "❌", title: "Phe Trắng đoán sai", sub: x?.text ? `“${x.text}” không phải từ khoá. Ván tiếp tục…` : "Hết giờ mà không đoán. Ván tiếp tục…" };
    }
  }
}

function StageCard({ view, session }: { view: View; session: UndercoverRoom }) {
  const g = view.game!;
  const pub = g.pub;
  const t = stageText(view);
  const now = useNow(g.playing);
  const total = pub ? pub.until - pub.since : 0;
  const left = !g.playing ? 0 : now ? Math.max(0, g.deadline - now) : total;
  const tone = !g.playing ? "is-idle" : pub?.stage === "verdict" || pub?.stage === "guess" || pub?.stage === "judged" ? "is-dusk" : "is-day";

  return (
    <section className={`card ww-stage ${tone} p-4 sm:p-5`} aria-label="Diễn biến ván">
      <div className="flex items-center gap-4">
        <span key={`${pub?.round}:${pub?.day}:${pub?.stage}`} className="ww-stage-icon" aria-hidden="true">
          {t.icon}
        </span>
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="font-display text-[24px] leading-tight font-extrabold sm:text-[28px]">{t.title}</p>
          <p className="mt-1 text-[14.5px] font-semibold text-ink-2">{t.sub}</p>
        </div>
        {g.playing && total > 0 && (
          <span className="font-display text-2xl font-extrabold tabular-nums" aria-label={`Còn ${Math.ceil(left / 1000)} giây`}>
            {Math.ceil(left / 1000)}s
          </span>
        )}
      </div>
      {g.playing && total > 0 && (
        <div className="ww-bar mt-3" aria-hidden="true">
          <span style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
        </div>
      )}
      {g.playing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {pub && <CastChips cast={pub.cast} />}
          <div className="flex-1" />
          {view.isHost && (
            <ConfirmButton className="btn btn-sm btn-coral" onConfirm={() => session.stop()} confirmLabel="Bấm lần nữa để dừng">
              ⏹ Dừng ván
            </ConfirmButton>
          )}
        </div>
      ) : (
        <ReadyBar view={view} session={session} />
      )}
    </section>
  );
}

/** Ngoài ván: bấm sẵn sàng / huỷ, chủ phòng bắt đầu ván — nằm ngay trong khung giai đoạn. */
function ReadyBar({ view, session }: { view: View; session: UndercoverRoom }) {
  const m = view.meta!;
  const g = view.game!;
  const me = g.me;
  const offline = m.players.filter((u) => !view.online.has(u));
  const blocker =
    g.plan.error ?? (offline.length ? `${names(view, offline)} đang mất kết nối` : g.unkeyed.length ? "Đang chờ máy của mọi người sẵn sàng…" : "");
  let message: React.ReactNode = view.pending ? (
    <>⏳ Đang chờ chủ phòng ghi nhận…</>
  ) : me.ready ? (
    <>✅ Bạn đã sẵn sàng — sẽ vào chơi ván tới.</>
  ) : (
    <>👀 Bạn đang xem. Bấm “Sẵn sàng” để tham gia ván tới — ai không sẵn sàng thì chỉ xem.</>
  );
  if (view.isHost)
    message = (
      <>
        {g.opts.hostPlays ? (
          <>👑 Bạn là chủ phòng và cũng chơi{me.ready ? " — đã sẵn sàng" : " — bấm “Sẵn sàng” để nhận từ khoá"}. Máy bạn bốc từ nhưng không cho bạn xem.</>
        ) : (
          <>🎩 Bạn là người điều hành — không chơi, thấy hết từ khoá và phe.</>
        )}{" "}
        {blocker ? <b>{blocker}.</b> : <b>Bấm “{m.round ? "Ván mới" : "Bắt đầu"}” khi mọi người đã sẵn sàng!</b>}
      </>
    );
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: me.ready ? "var(--lime-soft)" : "var(--sunken)" }}>
      <p className="min-w-[min(100%,240px)] flex-1 text-[14.5px] font-semibold" aria-live="polite">
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        {view.isHost && !g.opts.hostPlays ? null : me.ready ? (
          <button type="button" className="btn" onClick={() => session.setReady(false)} disabled={!!view.pending}>
            Huỷ sẵn sàng
          </button>
        ) : (
          <button type="button" className="btn btn-lime" onClick={() => session.setReady(true)} disabled={!!view.pending || m.players.length >= MAX_PLAYERS}>
            🙋 Sẵn sàng
          </button>
        )}
        {view.isHost && (
          <button type="button" className="btn btn-pen" onClick={() => session.start()} disabled={!!blocker} title={blocker}>
            {m.round ? "🔁 Ván mới" : "▶ Bắt đầu"}
          </button>
        )}
      </div>
    </div>
  );
}

function CastChips({ cast }: { cast: Record<Role, number> }) {
  return (
    <span className="flex flex-wrap gap-1.5" aria-label="Đội hình">
      {ROLE_ORDER.filter((r) => cast[r] > 0).map((r) => (
        <span key={r} className="ww-cast" title={ROLES[r].team}>
          {ROLES[r].emoji}
          {cast[r] > 1 && <b>×{cast[r]}</b>}
        </span>
      ))}
    </span>
  );
}

// ---------- việc của mình ----------

function ActionCard({
  view,
  session,
  selected,
  clear,
  reopenDeal,
}: {
  view: View;
  session: UndercoverRoom;
  selected?: string;
  clear: () => void;
  reopenDeal: () => void;
}) {
  const g = view.game!;
  const pub = g.pub!;
  const me = g.me;
  let tone = "var(--sunken)";
  let message: React.ReactNode;
  let extra: React.ReactNode = null;
  const callVote = (
    <ConfirmButton className="btn btn-sun" onConfirm={() => session.callVote()} confirmLabel="Bấm lần nữa — cả bàn chuyển sang biểu quyết">
      🗳️ Biểu quyết ngay
    </ConfirmButton>
  );

  if (pub.stage === "guess" && pub.out === view.me) {
    tone = "var(--sun-soft)";
    message = me.guess ? (
      <>
        👤 Bạn đã đoán <b>“{me.guess}”</b> — chờ công bố…
      </>
    ) : (
      <>👤 Bạn thuộc phe Trắng và vừa bị loại. Đoán từ khoá của phe Dân — chỉ một lần: đúng là thắng ngay, sai thì bị loại hẳn.</>
    );
    if (!me.guess) extra = <GuessForm session={session} />;
  } else if (!me.inGame) {
    message = view.isHost ? (
      <>🎩 Bạn đang điều hành — thấy hết từ khoá và phe. Đừng tiết lộ nhé!</>
    ) : g.seeAll ? (
      <>👀 Bạn đang xem — thấy được từ khoá và phe của mọi người. Đừng tiết lộ nhé!</>
    ) : (
      <>👀 Bạn đang xem ván này. Hết ván bấm “Sẵn sàng” để vào chơi.</>
    );
    if (view.isHost && pub.stage === "talk") extra = callVote;
  } else if (!me.alive) {
    tone = "var(--coral-soft)";
    message = <>❌ Bạn đã bị loại. Hãy im lặng theo dõi đến hết ván — không tiết lộ từ khoá hay phe của ai nhé.</>;
  } else if (me.word === undefined) {
    message = <>🔐 Đang nhận từ khoá bí mật từ chủ phòng…</>;
  } else if (pub.stage === "intro") {
    tone = "var(--sky-soft)";
    message = g.ready.includes(view.me) ? <>🃏 Bạn đã lật bài. Chờ mọi người lật xong là vào thảo luận…</> : <>🃏 Bấm vào lá bài của bạn để lật xem từ khoá.</>;
    extra = (
      <button type="button" className="btn" onClick={reopenDeal}>
        🃏 Xem lá bài
      </button>
    );
  } else if (pub.stage === "talk") {
    tone = "var(--sun-soft)";
    const order = speakers(pub);
    message = (
      <>
        💬 Lần lượt mô tả từ khoá của mình trong khung chat theo thứ tự <b>{order.map((u) => nameIn(view, u)).join(" → ")}</b> — mỗi người một câu ngắn, không nói thẳng
        từ khoá. Rồi tranh luận, nghi ngờ, bảo vệ mình. Bàn xong thì ai cũng có thể gọi biểu quyết.
      </>
    );
    extra = callVote;
  } else if (pub.stage === "vote" || pub.stage === "revote") {
    tone = "var(--sun-soft)";
    if (me.vote)
      message = (
        <>
          ✅ Bạn đã xác nhận loại <b>{nameMid(view, me.vote)}</b>. Chờ mọi người ({Object.keys(g.ballots).length}/{pub.alive.length})…
        </>
      );
    else if (selected) {
      message = (
        <>
          🗳️ Bạn chọn loại <b>{nameMid(view, selected)}</b>. Xác nhận rồi thì không đổi được.
        </>
      );
      extra = (
        <>
          <button
            type="button"
            className="btn btn-coral"
            onClick={() => {
              session.vote(selected);
              clear();
            }}
          >
            ✅ Xác nhận loại {nameIn(view, selected)}
          </button>
          <button type="button" className="btn btn-ghost" onClick={clear}>
            Bỏ chọn
          </button>
        </>
      );
    } else message = <>🗳️ Bấm vào một người chơi bên dưới để chọn người cần loại, rồi bấm xác nhận — không được chọn chính mình.</>;
  } else if (pub.stage === "decide") {
    message = view.isHost && !g.opts.hostPlays ? <>⚖️ Bấm vào một trong những người hoà phiếu bên dưới để loại.</> : <>⚖️ Chờ chủ phòng phá hoà…</>;
  } else if (pub.stage === "guess") {
    message = <>👤 {nameIn(view, pub.out ?? "")} thuộc phe Trắng — đang đoán từ khoá…</>;
  } else {
    message = <>⏳ Vòng sau sắp bắt đầu…</>;
  }

  return (
    <div className="card grid gap-3 px-4 py-3" style={{ background: tone }} aria-live="polite">
      <p className="text-[15px] font-semibold">{message}</p>
      {extra && <div className="flex flex-wrap gap-2">{extra}</div>}
    </div>
  );
}

function GuessForm({ session }: { session: UndercoverRoom }) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex w-full gap-2"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <label htmlFor="uc-guess" className="sr-only">
        Từ khoá bạn đoán
      </label>
      <input
        id="uc-guess"
        className="field !min-h-[44px]"
        placeholder="Từ khoá của phe Dân là…"
        value={text}
        maxLength={GUESS_TEXT}
        onChange={(e) => setText(e.target.value)}
        autoComplete="off"
        autoFocus
      />
      <ConfirmButton className="btn btn-sun" onConfirm={() => text.trim() && session.guess(text)} confirmLabel="Chắc chưa? Bấm lần nữa">
        🎯 Đoán
      </ConfirmButton>
    </form>
  );
}

/** Từ khoá của mình (và phe nếu được báo), có nút che khi có người ngồi cạnh. */
function WordCard({ view }: { view: View }) {
  const g = view.game!;
  const word = g.me.word;
  const role = g.me.role;
  const [hidden, setHidden] = useState(false);
  const white = word === null;
  return (
    <section className={`card uc-word p-4 sm:p-5 ${white ? "is-white" : ""}`} aria-label="Từ khoá của bạn">
      <div className="flex items-center gap-4">
        <span className="ww-role-art" aria-hidden="true">
          {hidden ? "❔" : role ? ROLES[role].emoji : "🃏"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold tracking-wide text-ink-3 uppercase">{white ? "Bạn thuộc" : "Từ khoá của bạn"}</p>
          <p key={String(hidden)} className="uc-word-text">
            {hidden ? "••••••" : white ? "Phe Trắng" : word}
          </p>
          {!hidden && (
            <p className="mt-0.5 text-[14px] text-ink-2">
              {white
                ? "Không có từ khoá — nghe mô tả của người khác để đoán chủ đề và mô tả sao cho khỏi lộ."
                : role
                  ? `${teamOf(role)}. ${ROLES[role].brief}`
                  : "Bạn không được báo phe — có thể là phe Dân, cũng có thể là Gián Điệp. Nghe mô tả để tự đoán!"}
            </p>
          )}
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setHidden((h) => !h)} title="Che từ khoá khi có người ngồi cạnh">
          {hidden ? "👁 Hiện" : "🙈 Che"}
        </button>
      </div>
    </section>
  );
}

/** Người điều hành không chơi và người xem: cặp từ khoá của ván. */
function SeeAllCard({ view }: { view: View }) {
  const w = view.game!.seeAll!.words;
  return (
    <section className="card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3" aria-label="Cặp từ khoá">
      <span className="text-[13px] font-bold tracking-wide text-ink-3 uppercase">🔐 Cặp từ</span>
      <span className="text-[15px]">
        {teamOf("civilian")}: <b>{w.civilian}</b>
      </span>
      <span className="text-[15px]">
        {teamOf("undercover")}: <b>{w.undercover}</b>
      </span>
    </section>
  );
}

// ---------- bàn chơi ----------

/** Những người chơi theo thứ tự thảo luận: ai còn, ai bị loại (lộ phe), ai đã lật bài, phiếu bầu. Bấm để chọn khi có lựa chọn mở. */
function Players({ view, pick, balloons }: { view: View; pick: Pick | null; balloons: Record<string, ChatMsg> }) {
  const m = view.meta!;
  const g = view.game!;
  const pub = g.pub;
  const inRound = !!pub && (g.playing || !!g.result);
  const roster = inRound ? [...pub!.order, ...m.lineup.filter((u) => !pub!.order.includes(u))] : m.players;
  const marks: Record<string, string[]> = {};
  if (g.playing && pub && (pub.stage === "vote" || pub.stage === "revote")) for (const [voter, t] of Object.entries(g.ballots)) (marks[t] ??= []).push(voter);
  if (!roster.length) return <p className="card p-4 text-sm font-semibold text-ink-3">Chưa ai sẵn sàng — bấm “Sẵn sàng” để tham gia ván tới.</p>;
  const order = pub ? speakers(pub) : [];
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="uc-players-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="uc-players-h" className="font-display text-lg font-extrabold">
          🪑 {inRound ? "Thứ tự thảo luận" : "Đã sẵn sàng"} {inRound && <span className="text-ink-3">({pub!.alive.length} còn trong ván)</span>}
        </h2>
        {pick && <p className="text-[13px] font-bold text-pen">Bấm vào một người để {pick.verb.toLowerCase()}</p>}
      </div>
      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5">
        {roster.map((uid) => (
          <li key={uid}>
            <Token view={view} uid={uid} n={g.playing ? order.indexOf(uid) + 1 : 0} pick={pick} by={marks[uid] ?? []} balloon={balloons[uid]} inRound={inRound} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Token({
  view,
  uid,
  n,
  pick,
  by,
  balloon,
  inRound,
}: {
  view: View;
  uid: string;
  n: number;
  pick: Pick | null;
  by: string[];
  balloon?: ChatMsg;
  inRound: boolean;
}) {
  const m = view.meta!;
  const g = view.game!;
  const pub = g.pub;
  const seat = g.people[uid];
  const p = seat?.member;
  const out = inRound ? outOf(pub, uid) : undefined;
  const role = inRound ? knownRole(view, uid) : undefined;
  const can = !!pick && pick.can(uid);
  const chosen = !!pick && pick.chosen === uid;
  const flipped = g.playing && pub?.stage === "intro" && g.ready.includes(uid);
  const voted = g.playing && uid in g.ballots;

  const body = (
    <>
      <span className="relative">
        {p ? <Avatar p={p} size={52} className={seat.online ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[52px] w-[52px] bg-sunken" />}
        {!out && <Balloon msg={balloon} />}
        {n > 0 && (
          <span className="uc-num" title={`Nói thứ ${n}`}>
            {n}
          </span>
        )}
        {uid === m.host && !n && (
          <span className="absolute -top-2.5 -left-1.5 text-base" title="Chủ phòng">
            👑
          </span>
        )}
        {role && (
          <span className="ww-role-dot" title={ROLES[role].team}>
            {ROLES[role].emoji}
          </span>
        )}
        {out && (
          <span className="ww-dead" aria-hidden="true">
            {out.how === "left" ? "🚪" : "❌"}
          </span>
        )}
        {(flipped || voted) && !out && (
          <span className="ww-ready" title={flipped ? "Đã lật bài" : "Đã xác nhận phiếu"}>
            ✅
          </span>
        )}
        {by.length > 0 && <span className="ww-count">{by.length}</span>}
      </span>
      <span className="mt-1 w-full truncate text-[12.5px] leading-tight font-bold">
        {uid === m.host && n > 0 ? "👑 " : ""}
        {nameIn(view, uid)}
      </span>
      <span className="w-full truncate text-[11px] leading-tight font-semibold text-ink-3">{out ? outText(out) : role ? ROLES[role].team : " "}</span>
      {by.length > 0 && (
        <span className="mt-1 flex flex-wrap justify-center -space-x-1.5" aria-label={`Bị chọn bởi ${names(view, by)}`}>
          {by.slice(0, 6).map((u) => {
            const voter = g.people[u]?.member;
            return voter ? <Avatar key={u} p={voter} size={20} /> : null;
          })}
        </span>
      )}
    </>
  );

  const cls = `ww-token ${out ? "is-dead" : ""} ${chosen ? "is-chosen" : ""} ${can ? "can-pick" : ""} ${uid === view.me ? "is-me" : ""}`;
  if (!pick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" className={cls} disabled={!can} aria-pressed={chosen} onClick={() => pick.onPick(uid)} title={can ? `${pick.verb} ${nameIn(view, uid)}` : undefined}>
      {body}
    </button>
  );
}

// ---------- cảnh diễn ----------

const SCENE_MS: Record<Scene["kind"], number> = { out: 7000, spared: 3200, guess: 5500, end: 5000 };

/**
 * Lớp phủ toàn màn hình cho những khoảnh khắc của ván: phát từ (bộ bài theo thứ tự thảo luận, bấm lá của mình để lật),
 * và các cảnh xếp hàng lần lượt: người bị loại bị lật bài phe, không ai bị loại, phe Trắng đoán, phe thắng.
 */
function Cinema({ view, session, dealClosed, closeDeal }: { view: View; session: UndercoverRoom; dealClosed: boolean; closeDeal: () => void }) {
  const g = view.game!;
  const pub = g.pub;
  const [queue, setQueue] = useState<Scene[]>([]);
  useEffect(() => session.onScene((s) => setQueue((q) => [...q, s].slice(-6))), [session]);
  const cur = queue[0];
  useEffect(() => {
    if (!cur) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), SCENE_MS[cur.kind]);
    return () => clearTimeout(t);
  }, [cur]);

  if (g.playing && pub?.stage === "intro" && !dealClosed && (g.me.word !== undefined || g.seeAll)) {
    return (
      <div className="ww-cine is-spy !cursor-default" role="dialog" aria-modal="true" aria-label="Phát từ">
        <div className="ww-cine-body">
          <DealScene key={pub.round} view={view} session={session} close={closeDeal} />
        </div>
      </div>
    );
  }
  if (!cur) return null;
  let tone = "is-spy";
  if (cur.kind === "end") tone = cur.team === "civilian" ? "is-dawn" : "is-spy";
  if (cur.kind === "guess" && cur.guess.right) tone = "is-blood";
  return (
    <div className={`ww-cine ${tone}`} role="dialog" aria-modal="true" aria-label="Diễn biến" onClick={() => setQueue((q) => q.slice(1))}>
      <div className="ww-cine-body">
        <SceneView key={cur.id} view={view} scene={cur} />
      </div>
      <p className="ww-cine-skip">Bấm để bỏ qua</p>
    </div>
  );
}

/**
 * Phát từ: mỗi người chơi một lá, xếp theo thứ tự thảo luận. Người chơi bấm lá của mình để lật xem từ khoá; lá của
 * người khác hiện ✅ khi họ đã lật. Người điều hành và người xem thấy mọi lá lật dần.
 */
function DealScene({ view, session, close }: { view: View; session: UndercoverRoom; close: () => void }) {
  const g = view.game!;
  const pub = g.pub!;
  const all = !g.me.inGame && !!g.seeAll;
  const [flipped, setFlipped] = useState(false);
  const mine = flipped || g.ready.includes(view.me);
  const flip = () => {
    if (mine) return;
    setFlipped(true);
    session.flip();
  };
  const face = (uid: string): { word: string; role?: Role } | null => {
    if (all) {
      const role = g.seeAll!.roles[uid];
      return { word: role === "white" ? "Không có từ" : g.seeAll!.words[role], role };
    }
    if (uid !== view.me || g.me.word === undefined) return null;
    return { word: g.me.word ?? "Không có từ", role: g.me.word === null ? "white" : g.me.role };
  };
  return (
    <div className="grid justify-items-center gap-5 text-center">
      <div>
        <p className="ww-cine-title !text-[28px]">Phát từ khoá</p>
        <p className="mt-1 text-[14.5px] font-semibold opacity-80">
          {all ? "Bạn thấy từ khoá của tất cả mọi người." : mine ? "Giữ bí mật, đừng nói thẳng từ này nhé!" : "Bấm vào lá bài có viền vàng để lật xem từ của bạn."} Số
          trên lá là thứ tự thảo luận.
        </p>
      </div>
      <ul className="ww-deck">
        {pub.order.map((uid, i) => {
          const f = face(uid);
          const me = uid === view.me;
          const open = !!f && (all || mine);
          const p = g.people[uid]?.member;
          const card = (
            <div className="ww-card-inner" style={all ? { transitionDelay: `${300 + i * 220}ms` } : undefined}>
              <div className="ww-card-face ww-card-back">
                <span className="uc-num !static">{i + 1}</span>
                {p && <Avatar p={p} size={36} />}
                <span className="ww-card-name">{nameIn(view, uid)}</span>
                <span className="text-xl" aria-hidden="true">
                  {g.ready.includes(uid) ? "✅" : me ? "👆" : "❔"}
                </span>
              </div>
              <div className={`ww-card-face ww-card-front ${f?.role === "undercover" ? "is-wolf" : f?.role === "white" ? "uc-front-white" : ""}`}>
                <span className="text-[22px] leading-none" aria-hidden="true">
                  {f?.role ? ROLES[f.role].emoji : "🃏"}
                </span>
                <b className="uc-deck-word">{f?.word}</b>
                <span className="text-[11px] font-bold opacity-75">{f?.role ? ROLES[f.role].team : "Phe Dân hay Gián Điệp?"}</span>
                <span className="ww-card-name">
                  {i + 1}. {nameIn(view, uid)}
                </span>
              </div>
            </div>
          );
          return (
            <li key={uid} className={`ww-card ${open ? "is-flipped" : ""} ${me ? "is-me" : ""}`} style={{ animationDelay: `${i * 90}ms` }}>
              {me && !all ? (
                <button type="button" className="block h-full w-full" onClick={flip} aria-label={mine ? "Lá bài của bạn" : "Lật lá bài của bạn"}>
                  {card}
                </button>
              ) : (
                card
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[14px] font-semibold opacity-80">
        Đã lật {g.ready.length}/{pub.alive.length} — mọi người lật xong là vào thảo luận.
      </p>
      {(mine || all) && (
        <button type="button" className="btn btn-sun" onClick={close}>
          Xong, vào bàn
        </button>
      )}
    </div>
  );
}

function FlipCard({ front, label, tone, delay = 1000 }: { front: string; label: string; tone: Role; delay?: number }) {
  return (
    <div className="uc-card">
      <div className="uc-card-inner" style={{ ["--flip" as string]: `${delay}ms` }}>
        <div className="uc-card-face uc-card-back">🕵️</div>
        <div className={`uc-card-face uc-card-front is-${tone}`}>
          <b className="uc-card-word">{front}</b>
          <span className="text-[12.5px] font-bold tracking-wide uppercase opacity-75">{label}</span>
        </div>
      </div>
    </div>
  );
}

function SceneView({ view, scene }: { view: View; scene: Scene }) {
  const g = view.game!;
  const avatar = (uid: string, size: number) => {
    const p = g.people[uid]?.member;
    return p ? <Avatar p={p} size={size} /> : <span className="avatar bg-sunken" style={{ width: size, height: size }} />;
  };
  switch (scene.kind) {
    case "out": {
      const o = scene.out;
      return (
        <div className="grid justify-items-center gap-4 text-center">
          <p className="text-[15px] font-bold tracking-wide uppercase opacity-80">
            {scene.tiebreak === "random" ? "Hoà phiếu — bốc thăm" : scene.tiebreak === "host" ? "Hoà phiếu — chủ phòng chọn" : "Cả bàn đã biểu quyết"}
          </p>
          <div className="ww-hang">{avatar(o.uid, 88)}</div>
          <p className="ww-cine-title !text-[26px]">{nameIn(view, o.uid)} bị loại</p>
          <FlipCard front={`${ROLES[o.role].emoji} ${ROLES[o.role].team}`} label="Lộ diện" tone={o.role} delay={2000} />
        </div>
      );
    }
    case "spared":
      return (
        <div className="grid justify-items-center gap-4 text-center">
          <span className="ww-moon" aria-hidden="true">
            🕊️
          </span>
          <p className="ww-cine-title">Vòng này không ai bị loại</p>
        </div>
      );
    case "guess": {
      const x = scene.guess;
      return (
        <div className="grid justify-items-center gap-4 text-center">
          <div>{avatar(x.uid, 72)}</div>
          <p className="text-[15px] font-bold tracking-wide uppercase opacity-80">{x.uid === view.me ? "Bạn đoán" : `Phe Trắng — ${nameIn(view, x.uid)} đoán`}</p>
          <p className="ww-cine-title !text-[40px]">{x.text === null ? "…" : `“${x.text}”`}</p>
          <p className="ww-late text-[22px] font-extrabold">{x.right ? "🎯 ĐÚNG RỒI!" : x.text === null ? "⌛ Hết giờ — bị loại" : "❌ Sai rồi — bị loại"}</p>
        </div>
      );
    }
    case "end": {
      const won = g.me.inGame && g.pub?.winners?.includes(view.me);
      return (
        <div className="grid justify-items-center gap-3 text-center">
          <span className="ww-moon" aria-hidden="true">
            {scene.team === "civilian" ? "🏆" : ROLES[scene.team].emoji}
          </span>
          <p className="ww-cine-title !text-[40px]">{ROLES[scene.team].team} thắng!</p>
          {g.me.inGame && <p className="text-[17px] font-bold">{won ? "Bạn đã thắng 🎉" : "Bạn đã thua…"}</p>}
        </div>
      );
    }
  }
}

// ---------- kết quả ----------

function ResultCard({ view }: { view: View }) {
  const m = view.meta!;
  const g = view.game!;
  const r = g.result!;
  const pub = g.pub;
  const team = r.team as Role | undefined;
  const won = g.me.inGame && pub?.winners?.includes(view.me);
  const title = team ? `${team === "civilian" ? "🏆" : ROLES[team].emoji} ${ROLES[team].team} thắng!` : "⏹ Ván dừng giữa chừng";
  const roles = pub?.roles ?? {};
  const rightGuess = pub?.guesses.find((x) => x.right);
  return (
    <section className={`card ww-result p-4 sm:p-5 ${team && team !== "civilian" ? "is-wolf" : ""}`} aria-label={`Kết quả ván ${r.round}`}>
      <p className="font-display text-3xl font-extrabold tracking-tight">{title}</p>
      <p className="mt-1 text-[15px] text-ink-2">
        {team && g.me.inGame
          ? won
            ? "Bạn đã thắng 🎉"
            : "Bạn đã thua — ván sau phục thù nhé!"
          : team
            ? `Ván ${r.round} kết thúc sau ${pub?.day ?? 1} vòng.`
            : "Không tính thắng thua."}
        {rightGuess ? ` ${nameIn(view, rightGuess.uid)} đoán trúng từ “${pub?.words?.civilian}”.` : ""}
      </p>
      {pub?.words && (
        <div className="mt-3 flex flex-wrap gap-2.5">
          <span className="ww-reveal">
            {teamOf("civilian")}: <b className="text-[16px]">{pub.words.civilian}</b>
          </span>
          <span className="ww-reveal is-wolf">
            {teamOf("undercover")}: <b className="text-[16px]">{pub.words.undercover}</b>
          </span>
        </div>
      )}
      {pub && (
        <>
          <h3 className="mt-4 font-display text-lg font-extrabold">🎴 Lật bài</h3>
          <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
            {m.lineup.map((uid) => {
              const p = g.people[uid]?.member;
              const role = roles[uid];
              const o = outOf(pub, uid);
              return (
                <li key={uid} className={`ww-reveal ${role && role !== "civilian" ? "is-wolf" : ""}`}>
                  <span className="text-[30px] leading-none" aria-hidden="true">
                    {role ? ROLES[role].emoji : "❔"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {p && <Avatar p={p} size={20} className={o ? "opacity-50 grayscale" : ""} />}
                      <b className="truncate text-[14px]">{nameIn(view, uid)}</b>
                      {pub.winners?.includes(uid) && <span title="Thắng">🏆</span>}
                    </span>
                    <span className="block text-[12.5px] font-semibold text-ink-2">
                      {role ? ROLES[role].team : "Không rõ"}
                      {role && role !== "white" && pub.words ? ` · ${pub.words[role]}` : ""}
                    </span>
                    <span className="block text-[12px] text-ink-3">{o ? outText(o) : "trụ lại tới cuối"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <Story view={view} pub={pub} roles={roles} />
        </>
      )}
    </section>
  );
}

/** Diễn biến câu chuyện: phát từ, rồi từng vòng — ai gọi biểu quyết, ai bầu ai, ai bị loại (thuộc phe nào), phe Trắng đoán gì. */
function Story({ view, pub, roles }: { view: View; pub: Public; roles: Record<string, Role> }) {
  const name = (uid: string) => nameMid(view, uid);
  /** Tên đứng đầu câu: "Bạn" viết hoa. */
  const Name = (uid: string) => nameIn(view, uid);
  const days = [...new Set([...pub.calls.map((c) => c.day), ...pub.tallies.map((t) => t.day), ...pub.outs.map((o) => o.day)])].sort((a, b) => a - b);
  const team = (uid: string) => (roles[uid] ? ROLES[roles[uid]].team.replace("Phe", "phe") : "?");
  return (
    <>
      <h3 className="mt-5 font-display text-lg font-extrabold">📖 Diễn biến câu chuyện</h3>
      <ol className="ww-story uc-board mt-2">
        <li>
          <p className="ww-story-h">🃏 Phát từ</p>
          <ul>
            {pub.words && (
              <li>
                Phe Dân nhận “{pub.words.civilian}”, phe Gián Điệp nhận “{pub.words.undercover}”
                {pub.cast.white ? `, phe Trắng không có từ` : ""}.
              </li>
            )}
            {ROLE_ORDER.filter((r) => pub.cast[r]).map((r) => {
              const who = Object.keys(roles).filter((u) => roles[u] === r);
              return who.length ? (
                <li key={r}>
                  {ROLES[r].emoji} {ROLES[r].team}: {who.map(name).join(", ")}.
                </li>
              ) : null;
            })}
            <li>🗣️ Thứ tự thảo luận: {pub.order.map(name).join(" → ")}.</li>
          </ul>
        </li>
        {days.map((d) => {
          const lines: React.ReactNode[] = [];
          for (const c of pub.calls.filter((x) => x.day === d)) lines.push(c.uid ? `💬 Thảo luận xong, ${name(c.uid)} gọi biểu quyết.` : "💬 Hết giờ thảo luận.");
          pub.tallies
            .filter((t) => t.day === d)
            .forEach((t) => {
              const by: Record<string, string[]> = {};
              for (const [voter, target] of Object.entries(t.ballots)) (by[target] ??= []).push(voter);
              const parts = Object.entries(by)
                .sort((a, b) => b[1].length - a[1].length)
                .map(([target, vs]) => `${name(target)} ${vs.length} phiếu (${vs.map(name).join(", ")})`);
              lines.push(`🗳️ ${t.stage === "revote" ? "Bỏ phiếu phụ" : "Biểu quyết"}: ${parts.length ? parts.join(" · ") : "không ai bỏ phiếu"}.`);
            });
          const outs = pub.outs.filter((o) => o.day === d);
          for (const o of outs) {
            lines.push(
              <b key={`o:${o.uid}`}>
                {o.how === "left" ? `🚪 ${Name(o.uid)} rời ván` : `❌ ${Name(o.uid)} bị loại`} — thuộc {team(o.uid)}.
              </b>,
            );
            const x = pub.guesses.find((y) => y.uid === o.uid && y.day === d);
            if (x)
              lines.push(
                <b key={`g:${o.uid}`}>{x.text === null ? `⌛ ${Name(o.uid)} không kịp đoán từ khoá.` : `🎯 ${Name(o.uid)} đoán “${x.text}” — ${x.right ? "ĐÚNG, phe Trắng thắng!" : "sai."}`}</b>,
              );
          }
          if (!outs.some((o) => o.how === "vote") && pub.tallies.some((t) => t.day === d) && (d < pub.day || pub.out === null))
            lines.push(<b key="spared">🕊️ Không ai bị loại.</b>);
          return (
            <li key={d}>
              <p className="ww-story-h">☀️ Vòng {d}</p>
              <ul>
                {lines.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </li>
          );
        })}
        {pub.winner && (
          <li>
            <p className="ww-story-h">
              🏁 {ROLES[pub.winner].team} thắng: {(pub.winners ?? []).map(name).join(", ")}.
            </p>
          </li>
        )}
      </ol>
    </>
  );
}

// ---------- luật ----------

function Settings({ view, session }: { view: View; session: UndercoverRoom }) {
  const g = view.game!;
  const o = g.opts;
  const host = view.isHost;
  const set = (patch: Partial<UcOptions>) => session.setOptions(patch);
  const n = view.meta!.players.length;
  const cast = g.plan.cast;
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="uc-settings-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="uc-settings-h" className="font-display text-lg font-extrabold">
          ⚙️ Luật của bàn
        </h2>
        {!host && <p className="text-[13px] font-semibold text-ink-3">Chủ phòng chỉnh luật</p>}
      </div>
      <p className="mt-1 text-[13.5px] text-ink-2">{host ? "Bấm vào thẻ phe Trắng để bật / tắt." : "Các phe có trong ván tới."} Đội hình với {n} người sẵn sàng:</p>
      <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <li>
          <div className="ww-pick is-on">
            <RoleHead role="civilian" note={cast.civilian ? `${cast.civilian} người — phần còn lại` : "Phần còn lại"} />
          </div>
        </li>
        <li>
          <div className="ww-pick is-on">
            <RoleHead role="undercover" note={`${cast.undercover} người`} />
            <div className="mt-2 flex flex-wrap justify-center gap-1" role="group" aria-label="Số Gián Điệp">
              {[0, ...Array.from({ length: MAX_UNDERCOVERS }, (_, i) => i + 1)].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`ww-pick-num ${o.undercovers === v ? "is-on" : ""}`}
                  aria-pressed={o.undercovers === v}
                  disabled={!host}
                  onClick={() => set({ undercovers: v })}
                  title={v ? `${v} Gián Điệp` : `Tự động theo số người (${autoUndercovers(Math.max(n, MIN_PLAYERS))})`}
                >
                  {v || "Tự động"}
                </button>
              ))}
            </div>
          </div>
        </li>
        <li>
          <div className={`ww-pick ${o.white ? "is-on" : ""}`}>
            <button
              type="button"
              className="ww-pick-toggle"
              aria-pressed={o.white}
              disabled={!host}
              onClick={() => set({ white: !o.white })}
              title={host ? (o.white ? "Bỏ phe Trắng khỏi ván" : "Thêm phe Trắng vào ván") : ROLES.white.brief}
            >
              <span className="ww-pick-check" aria-hidden="true">
                {o.white ? "✓" : ""}
              </span>
              <RoleHead role="white" note={o.white ? `${cast.white} người` : "Không dùng"} />
            </button>
            {o.white && (
              <div className="mt-2 flex flex-wrap justify-center gap-1" role="group" aria-label="Số người phe Trắng">
                {Array.from({ length: MAX_WHITES }, (_, i) => i + 1).map((v) => (
                  <button key={v} type="button" className={`ww-pick-num ${o.whites === v ? "is-on" : ""}`} aria-pressed={o.whites === v} disabled={!host} onClick={() => set({ whites: v })}>
                    {v} người
                  </button>
                ))}
              </div>
            )}
          </div>
        </li>
      </ul>
      {g.plan.error && n > 0 && <p className="mt-2 text-sm font-semibold text-coral">{g.plan.error}.</p>}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Thời gian thảo luận">
          <Seg value={o.talk} options={TALKS} label={talkName} onChange={(v) => set({ talk: v })} disabled={!host} />
          <p className="mt-1.5 text-[12.5px] text-ink-3">Ai bấm “Biểu quyết ngay” thì cả bàn chuyển sang biểu quyết{o.talk ? "; hết giờ cũng vậy" : ""}.</p>
        </Field>
        <Field label="Báo phe cho người chơi">
          <Seg value={o.reveal} options={[true, false] as const} label={(v) => (v ? "Có" : "Chỉ báo từ khoá")} onChange={(v) => set({ reveal: v })} disabled={!host} />
          <p className="mt-1.5 text-[12.5px] text-ink-3">
            {o.reveal ? "Ai cũng biết mình thuộc phe Dân hay Gián Điệp." : "Phe Dân và Gián Điệp chỉ thấy từ khoá, tự đoán mình thuộc phe nào. Phe Trắng luôn biết mình."}
          </p>
        </Field>
        <Field label="Bỏ phiếu phụ vẫn hoà">
          <Seg
            value={o.tie}
            options={(o.hostPlays ? ["random", "none"] : ["random", "none", "host"]) as Tie[]}
            label={(v) => TIE_NAMES[v]}
            onChange={(v) => set({ tie: v })}
            disabled={!host}
          />
        </Field>
        <Field label="Chủ phòng">
          <Seg value={o.hostPlays} options={[true, false] as const} label={(v) => (v ? "Cùng chơi" : "Chỉ điều hành")} onChange={(v) => set({ hostPlays: v })} disabled={!host} />
          <p className="mt-1.5 text-[12.5px] text-ink-3">
            {o.hostPlays
              ? "Chủ phòng nhận từ khoá như mọi người — máy vẫn tự bốc từ và điều hành nhưng không cho chủ phòng xem."
              : "Chủ phòng không chơi: thấy hết từ khoá và phe, tự đặt được cặp từ, chọn người bị loại khi hoà."}
          </p>
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-sunken px-3 py-2.5 text-[13.5px]">
        <span className="flex-1">
          📚 Bộ từ {g.words.total} cặp — phòng này đã chơi <b>{g.words.used}</b> cặp, sẽ không bốc lại.
        </span>
        {host && g.words.used > 0 && (
          <ConfirmButton className="btn btn-sm btn-ghost" onConfirm={() => session.resetWords()} confirmLabel="Bấm lần nữa để làm mới">
            ↺ Làm mới
          </ConfirmButton>
        )}
      </div>
      {host && !o.hostPlays && <CustomWords view={view} session={session} />}
    </section>
  );
}

function RoleHead({ role, note }: { role: Role; note: string }) {
  return (
    <>
      <span className="text-[30px] leading-none" aria-hidden="true">
        {ROLES[role].emoji}
      </span>
      <span className="mt-1 font-display text-[15px] font-extrabold">{ROLES[role].team}</span>
      <span className="text-[12px] font-bold text-ink-3">{note}</span>
    </>
  );
}

/** Chủ phòng chỉ điều hành: tự đặt cặp từ cho ván tới (chỉ nằm trên máy chủ phòng). */
function CustomWords({ view, session }: { view: View; session: UndercoverRoom }) {
  const custom = view.game!.custom;
  const [civ, setCiv] = useState("");
  const [uc, setUc] = useState("");
  return (
    <div className="mt-3 rounded-xl bg-sunken p-3">
      <p className="text-[13px] font-bold text-ink-2">✍️ Tự đặt cặp từ cho ván tới</p>
      {custom ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px]">
          <span>
            Phe Dân: <b>{custom.civilian}</b> · Phe Gián Điệp: <b>{custom.undercover}</b>
          </span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => session.setCustom(null)}>
            ✕ Bỏ, bốc ngẫu nhiên
          </button>
        </div>
      ) : (
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            session.setCustom({ civilian: civ, undercover: uc });
            setCiv("");
            setUc("");
          }}
        >
          <input className="field !min-h-[38px] min-w-0 flex-1 !py-1 text-sm" placeholder="Từ của phe Dân" value={civ} maxLength={40} onChange={(e) => setCiv(e.target.value)} aria-label="Từ của phe Dân" />
          <input className="field !min-h-[38px] min-w-0 flex-1 !py-1 text-sm" placeholder="Từ của phe Gián Điệp" value={uc} maxLength={40} onChange={(e) => setUc(e.target.value)} aria-label="Từ của phe Gián Điệp" />
          <button type="submit" className="btn btn-sm" disabled={!civ.trim() || !uc.trim()}>
            Dùng cặp này
          </button>
        </form>
      )}
      <p className="mt-1.5 text-[12px] text-ink-3">Chỉ máy bạn biết cặp từ này; dùng cho một ván rồi lại bốc ngẫu nhiên.</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-bold text-ink-2">{label}</p>
      {children}
    </div>
  );
}

function Seg<T extends string | number | boolean>({
  value,
  options,
  label,
  onChange,
  disabled,
}: {
  value: T;
  options: readonly T[];
  label: (v: T) => string;
  onChange: (v: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {options.map((v) => (
        <button
          key={String(v)}
          type="button"
          className={`btn btn-sm !px-2.5 ${v === value ? "btn-sun" : ""}`}
          aria-pressed={v === value}
          disabled={disabled && v !== value}
          onClick={() => onChange(v)}
        >
          {label(v)}
        </button>
      ))}
    </div>
  );
}

function Rules({ opts }: { opts: UcOptions }) {
  return (
    <div className="grid gap-3 text-[14.5px] text-ink-2">
      <p>
        <b className="text-ink">Ba phe.</b> Máy chủ phòng bốc một cặp từ na ná nhau (vd. <i>Cà phê</i> / <i>Trà</i>) trong bộ 1000 cặp và phát bí mật cho từng người:
      </p>
      <ul className="grid gap-1.5">
        {ROLE_ORDER.map((r) => (
          <li key={r}>
            <b className="text-ink">{teamOf(r)}:</b> {ROLES[r].brief}
          </li>
        ))}
      </ul>
      <p>
        <b className="text-ink">🃏 Phát từ.</b> Mỗi người một lá bài, bấm vào lá của mình để lật xem từ khoá. Thứ tự thảo luận được chốt ngay lúc này (số trên lá
        bài) và giữ nguyên cả ván.
      </p>
      <p>
        <b className="text-ink">💬 Thảo luận.</b> Lần lượt theo thứ tự, mỗi người mô tả từ khoá của mình bằng một câu ngắn trong khung chat — đủ để chứng minh
        mình biết từ, không nói thẳng từ khoá (tin nhắn có từ khoá của bạn sẽ bị chặn). Sau đó tự do tranh luận, nghi ngờ, bluff, bảo vệ mình
        {opts.talk ? ` (tối đa ${opts.talk / 60} phút)` : ""}. Ai cũng có thể bấm “Biểu quyết ngay” để cả bàn chuyển sang biểu quyết.
      </p>
      <p>
        <b className="text-ink">🗳️ Biểu quyết.</b> Mỗi người còn trong ván chọn một người khác rồi bấm xác nhận (không đổi được); ai nhiều phiếu nhất bị loại và
        lộ ra thuộc phe nào. Hoà thì bỏ phiếu phụ giữa những người hoà; vẫn hoà thì{" "}
        {opts.tie === "random" ? "bốc thăm một người" : opts.tie === "host" ? "chủ phòng chọn người bị loại" : "không ai bị loại"}. Người bị loại không được thảo
        luận, bỏ phiếu nữa.
      </p>
      <p>
        <b className="text-ink">👤 Phe Trắng bị loại</b> được nhập từ khoá mình đoán một lần: đúng từ của phe Dân là phe Trắng thắng ngay, sai thì bị loại hẳn và ván
        tiếp tục.
      </p>
      <p>
        <b className="text-ink">🏁 Thắng.</b> Phe Dân thắng khi loại hết Gián Điệp và phe Trắng. Gián Điệp thắng khi số Gián Điệp còn lại bằng số người phe Dân —
        đủ sức áp đảo phiếu bầu; phe Trắng còn sống tới lúc đó cũng thắng. Chỉ còn hai người mà phe đối lập vẫn còn thì phe đó thắng. Hết ván lật bài mọi người và
        kể lại diễn biến từng vòng.
      </p>
      <p className="rounded-xl bg-sunken p-3 text-[13px]">
        🔐 Từ khoá và phe được mã hoá, chỉ máy của bạn và máy chủ phòng đọc được. Chủ phòng mất kết nối giữa ván thì ván phải dừng.
      </p>
    </div>
  );
}
