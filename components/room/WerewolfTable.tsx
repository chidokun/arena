"use client";

import { useEffect, useRef, useState } from "react";
import {
  autoWolves,
  MAX_PLAYERS,
  MAX_WOLVES,
  MIN_PLAYERS,
  NIGHT_ORDER,
  nightTurns,
  ROLE_ORDER,
  ROLES,
  sideOf,
  TALKS,
  talkName,
  type Chapter,
  type Death,
  type Role,
  type Side,
  type WolfOptions,
} from "@/lib/games/werewolf";
import type { ChatMsg, RoomView } from "@/lib/net/room";
import type { Scene, WerewolfRoom, WolfView } from "@/lib/net/werewolf-room";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "../ConfirmButton";
import { Dialog } from "../Dialog";
import { ChatPanel } from "./ChatPanel";
import { Balloon, PeoplePanel } from "./People";
import { Flyers, RoomLayout, StatusChip } from "./RoomLayout";
import { useBalloons, useFlyers, useRoomView } from "./useRoom";

type View = RoomView<WolfView>;

/** Một lựa chọn đang mở trên bàn: bấm vào người trong làng để chọn (Cupid chọn hai người). */
type Pick = { verb: string; can: (uid: string) => boolean; chosen: string[]; onPick: (uid: string) => void };

const one = (u: string | null | undefined) => (u ? [u] : []);

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

function deathOf(view: View, uid: string): Death | undefined {
  return view.game!.pub?.deaths.find((d) => d.uid === uid);
}

/** Vai của một người mà mình được biết: thấy hết (quản trò, người xem), hết ván, của mình, đồng bọn Sói, người yêu. */
function knownRole(view: View, uid: string): Role | undefined {
  const g = view.game!;
  const s = g.me.secret;
  return (
    g.seeAll?.roles[uid] ??
    g.pub?.roles?.[uid] ??
    (uid === view.me ? g.me.role : undefined) ??
    (s?.pack?.includes(uid) ? "wolf" : undefined) ??
    (s?.lover === uid ? s.loverRole : undefined)
  );
}

/** Cặp đôi mình được biết: thấy hết, hết ván, Cupid, hoặc mình là một trong hai. */
function knownLovers(view: View): string[] {
  const g = view.game!;
  const s = g.me.secret;
  return g.seeAll?.lovers ?? g.pub?.lovers ?? s?.lovers ?? (s?.lover ? [view.me, s.lover] : []);
}

/** Bán Sói đã hoá Sói mà mình được biết. */
function knownTurned(view: View): string[] {
  const g = view.game!;
  return g.seeAll?.turned ?? g.pub?.turned ?? (g.me.secret?.turned ? [view.me] : []);
}

/** Hai người Cupid đang chọn ghép đôi. */
const cupidPair = (g: WolfView) => (g.me.act.cupid ?? g.me.secret?.cupid ?? []).slice(-2);

const isNight = (g: WolfView) => g.playing && (g.pub?.stage === "night" || g.pub?.stage === "dawn");
/** Đã chốt hành động đêm nay. */
const isDone = (g: WolfView) => !!(g.me.act.done || g.me.secret?.done);

/** Lựa chọn đang mở cho mình theo giai đoạn và vai. */
function pickOf(view: View, session: WerewolfRoom, poisoning: boolean): Pick | null {
  const g = view.game!;
  const pub = g.pub;
  const me = g.me;
  if (!g.playing || !pub || !me.alive) return null;
  const alive = (u: string) => pub.alive.includes(u);
  const s = me.secret;
  // Ban đêm chỉ vai đang được gọi mới chọn được.
  if (pub.stage === "night" && s && s.role === pub.turn && !isDone(g)) {
    if (s.role === "cupid") {
      const pair = cupidPair(g);
      return {
        verb: "Ghép đôi",
        can: alive,
        chosen: pair,
        onPick: (u) => session.cupid(pair.includes(u) ? pair.filter((x) => x !== u) : [...pair, u]),
      };
    }
    if (s.role === "wolf")
      return {
        verb: "Cắn",
        can: (u) => alive(u) && !s.pack?.includes(u),
        chosen: one(me.act.wolf ?? s.picks?.[view.me]),
        onPick: (u) => session.nightPick("wolf", u),
      };
    if (s.role === "guard")
      return {
        verb: "Bảo vệ",
        can: (u) => alive(u) && (g.opts.guardSelf || u !== view.me) && (g.opts.guardRepeat || u !== s.lastGuard),
        chosen: one(me.act.guard ?? s.guarded),
        onPick: (u) => session.nightPick("guard", u),
      };
    if (s.role === "seer")
      return {
        verb: "Soi",
        can: (u) => alive(u) && u !== view.me && !s.seen?.some((x) => x.target === u),
        chosen: one(me.act.seer ?? s.seerPick),
        onPick: (u) => session.nightPick("seer", u),
      };
    if (s.role === "witch" && poisoning && s.potions?.poison)
      return {
        verb: "Đầu độc",
        can: (u) => alive(u) && u !== view.me,
        chosen: one(me.act.poison !== undefined ? me.act.poison : s.poison),
        onPick: (u) => session.witch({ poison: u }),
      };
  }
  if (pub.stage === "vote" || pub.stage === "revote")
    return {
      verb: "Treo",
      can: (u) => alive(u) && u !== view.me && (!pub.candidates || pub.candidates.includes(u)),
      chosen: one(g.ballots[view.me]),
      onPick: (u) => session.vote(u),
    };
  return null;
}

/** Lý do khoá ô chat: ban đêm cả làng ngủ, người chết không được nói, người xem biết hết vai. */
function chatLock(view: View) {
  const g = view.game!;
  if (!g.playing) return undefined;
  if (!g.me.inGame) return g.seeAll && !view.isHost ? "👀 Bạn đang xem và thấy hết vai — giữ im lặng tới hết ván để không lộ bí mật." : undefined;
  if (!g.me.alive) return "💀 Bạn đã chết — người chết không được nói nữa.";
  if (isNight(g)) return "🌙 Ban đêm cả làng ngủ — chờ trời sáng rồi trò chuyện.";
}

export function WerewolfTable({ id, slug, session }: { id: string; slug: string; session: WerewolfRoom }) {
  const view = useRoomView(session)!;
  const m = view.meta!;
  const g = view.game!;
  const balloons = useBalloons(session);
  const areaRef = useRef<HTMLDivElement>(null);
  const flyers = useFlyers(session, areaRef);
  // Phù Thủy đang chọn người đầu độc — gắn với đêm hiện tại, sang đêm khác tự tắt.
  const turn = `${g.pub?.round}:${g.pub?.day}:${g.pub?.stage}`;
  const [poisonTurn, setPoisonTurn] = useState("");
  const poisoning = poisonTurn === turn;
  const setPoisoning = (on: boolean) => setPoisonTurn(on ? turn : "");
  const [rules, setRules] = useState(false);
  const pick = pickOf(view, session, poisoning);

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
        {g.playing && <ActionCard view={view} session={session} pick={pick} poisoning={poisoning} setPoisoning={setPoisoning} />}
        {g.playing && g.me.secret?.role === "wolf" && <WolfDen view={view} session={session} />}
        <Village view={view} pick={pick} balloons={balloons} />
        {g.me.inGame && g.me.role && <RoleCard view={view} />}
        {!g.playing && <Settings view={view} session={session} />}
        <Flyers flyers={flyers} />
      </div>

      <Cinema view={view} session={session} />
      <Dialog open={rules} onClose={() => setRules(false)} title="Luật Ma Sói">
        {rules && <Rules opts={g.opts} />}
      </Dialog>
    </RoomLayout>
  );
}

/** Dòng mô tả từng người trong danh sách phòng. */
function PersonLine({ view, uid, seated }: { view: View; uid: string; seated: boolean }) {
  const g = view.game!;
  const pub = g.pub;
  const m = view.meta!;
  // Quản trò không ngồi chơi (hoặc chưa sẵn sàng): chỉ xem và điều khiển.
  if (uid === m.host && !(pub && m.lineup.includes(uid) && (g.playing || g.result)) && !(seated && g.opts.hostPlays))
    return <>🎩 Quản trò — xem và điều khiển ván</>;
  if (pub && view.meta!.lineup.includes(uid) && (g.playing || g.result)) {
    const d = deathOf(view, uid);
    const role = pub.roles?.[uid];
    if (!d) return <>{g.playing ? "Còn sống" : "Sống sót"}</>;
    return (
      <>
        {deathIcon(d)} {deathText(d)}
        {role
          ? ` · ${ROLES[role].emoji} ${roleName(role, !!pub.turned?.includes(uid))}`
          : d.wolf !== undefined
            ? ` · ${d.wolf ? "🐺 là Sói" : "không phải Sói"}`
            : ""}
      </>
    );
  }
  if (g.playing) return <>Đang xem</>;
  return <>{seated ? "✅ Sẵn sàng" : "Đang xem"}</>;
}

const deathText = (d: Death) =>
  d.how === "hang" ? `treo ngày ${d.day}` : d.how === "left" ? "bỏ làng" : d.how === "love" ? `chết theo người yêu` : `chết đêm ${d.day}`;
/** Tên vai; Bán Sói đã hoá Sói thì ghi rõ. */
const roleName = (role: Role, turned: boolean) => (turned ? "Sói (vốn Bán Sói)" : ROLES[role].name);
const deathIcon = (d: Death) => (d.how === "hang" ? "🪢" : d.how === "left" ? "🚪" : d.how === "love" ? "💔" : "💀");

const SIDE_TITLE: Record<Side, string> = { wolf: "Phe Ma Sói thắng!", village: "Dân làng thắng!", lovers: "Cặp đôi thắng!" };
const SIDE_ICON: Record<Side, string> = { wolf: "🐺", village: "👨‍🌾", lovers: "💘" };

/** Phe của mình khi hết ván (cần vai mọi người đã lộ). */
function mySide(view: View): Side | undefined {
  const g = view.game!;
  const roles = g.pub?.roles;
  return g.me.inGame && roles?.[view.me] ? sideOf(roles, g.pub?.lovers, view.me) : undefined;
}

// ---------- giai đoạn ----------

function stageText(view: View): { icon: string; title: string; sub: string } {
  const m = view.meta!;
  const g = view.game!;
  const pub = g.pub;
  const names = (uids: string[]) => uids.map((u) => nameIn(view, u)).join(", ");
  if (!g.playing || !pub) {
    if (g.result) return { icon: "🏁", title: `Hết ván ${m.round}`, sub: "Xem lật bài và diễn biến câu chuyện bên dưới." };
    const n = m.players.length;
    return {
      icon: "🏡",
      title: "Làng đang tụ họp",
      sub: n < MIN_PLAYERS ? `Cần ít nhất ${MIN_PLAYERS} người sẵn sàng — đang có ${n}.` : `${n} người đã sẵn sàng. Chờ quản trò bắt đầu.`,
    };
  }
  const d = pub.day;
  switch (pub.stage) {
    case "intro":
      return { icon: "🎭", title: "Nhận vai", sub: "Lật bài xem vai của bạn và giữ bí mật. Đêm đầu tiên sắp buông xuống…" };
    case "night": {
      return {
        icon: "🌙",
        title: `Đêm thứ ${d}`,
        sub: `Cả làng đi ngủ. ${
          pub.turn ? `Quản trò gọi ${ROLES[pub.turn].name} thức dậy…` : ""
        } Lần lượt từng vai: vai này chốt xong mới tới vai kia, hết lượt là trời sáng.${
          g.seeAll?.night ? ` ✅ Đã chốt: ${g.seeAll.night.done.length ? g.seeAll.night.done.map((u) => nameIn(view, u)).join(", ") : "chưa ai"}.` : ""
        }`,
      };
    }
    case "dawn":
      return { icon: "🌅", title: "Trời sắp sáng…", sub: "Mọi người đã xong việc đêm nay." };
    case "day": {
      const dead = pub.deaths.filter((x) => x.day === d && x.how === "night").map((x) => x.uid);
      return {
        icon: "☀️",
        title: `Ngày thứ ${d} — thảo luận`,
        sub: `${dead.length ? `Đêm qua ${names(dead)} đã chết.` : "Đêm qua bình yên, không ai chết."} Ai là Sói? ${
          g.opts.hostPlays
            ? "Bàn xong thì ai cũng có thể bắt đầu bỏ phiếu."
            : `${g.ready.length}/${pub.alive.length} người muốn bỏ phiếu ngay${g.opts.talk ? "" : " — chờ quản trò cho bỏ phiếu"}.`
        }`,
      };
    }
    case "vote":
    case "revote":
      return {
        icon: "🗳️",
        title: pub.stage === "revote" ? "Bỏ phiếu lại" : `Ngày thứ ${d} — bỏ phiếu`,
        sub: `${pub.stage === "revote" ? `Hoà phiếu — chỉ được bầu ${names(pub.candidates ?? [])}. ` : ""}Người nhiều phiếu nhất bị treo cổ. Đã bỏ ${Object.keys(g.ballots).length}/${pub.alive.length} phiếu.`,
      };
    case "verdict": {
      const d0 = pub.hanged ? deathOf(view, pub.hanged) : undefined;
      return d0
        ? { icon: "🪢", title: `${nameIn(view, d0.uid)} bị treo cổ`, sub: d0.wolf ? "Là Sói! 🐺" : "Không phải Sói…" }
        : { icon: "🕊️", title: "Không ai bị treo cổ", sub: "Làng không thống nhất được. Đêm lại sắp buông xuống…" };
    }
  }
}

function StageCard({ view, session }: { view: View; session: WerewolfRoom }) {
  const g = view.game!;
  const pub = g.pub;
  const t = stageText(view);
  const now = useNow(g.playing);
  const total = pub ? pub.until - pub.since : 0;
  const left = !g.playing ? 0 : now ? Math.max(0, g.deadline - now) : total;
  const tone = !g.playing ? "is-idle" : isNight(g) || pub?.stage === "intro" ? "is-night" : pub?.stage === "verdict" ? "is-dusk" : "is-day";

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
      {g.playing && pub?.stage === "night" && <NightTurns pub={pub} />}
      {g.playing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {pub && <CastChips cast={pub.cast} />}
          <div className="flex-1" />
          {view.isHost && pub?.stage === "day" && !(g.opts.hostPlays && g.me.alive) && (
            <button type="button" className={`btn btn-sun ${g.opts.talk ? "btn-sm" : ""}`} onClick={() => session.skipTalk()}>
              ⏭ Bỏ phiếu ngay
            </button>
          )}
          {view.isHost && pub?.stage === "night" && pub.turn && (
            // Đổi lượt thì nút về trạng thái chưa bấm — không lỡ tay bỏ qua lượt của vai kế tiếp.
            <ConfirmButton
              key={pub.turn}
              className="btn btn-sm"
              onConfirm={() => session.skipTurn()}
              confirmLabel={`Bấm lần nữa — bỏ qua lượt ${ROLES[pub.turn].name}`}
            >
              ⏭ Bỏ qua lượt {ROLES[pub.turn].name}
            </ConfirmButton>
          )}
          {view.isHost && pub?.stage === "night" && (
            <ConfirmButton
              className="btn btn-sm btn-sun"
              onConfirm={() => session.skipNight()}
              confirmLabel="Bấm lần nữa — bỏ qua các lượt còn lại, trời sáng"
            >
              ☀️ Trời sáng ngay
            </ConfirmButton>
          )}
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

/** Ngoài ván: bấm sẵn sàng / huỷ, quản trò bắt đầu ván — nằm ngay trong khung giai đoạn. */
function ReadyBar({ view, session }: { view: View; session: WerewolfRoom }) {
  const m = view.meta!;
  const g = view.game!;
  const me = g.me;
  const offline = m.players.filter((u) => !view.online.has(u));
  const blocker =
    g.plan.error ??
    (offline.length ? `${offline.map((u) => nameIn(view, u)).join(", ")} đang mất kết nối` : g.unkeyed.length ? "Đang chờ máy của mọi người sẵn sàng…" : "");
  let message: React.ReactNode = view.pending ? (
    <>⏳ Đang chờ quản trò ghi nhận…</>
  ) : me.ready ? (
    <>✅ Bạn đã sẵn sàng — sẽ vào chơi ván tới.</>
  ) : (
    <>👀 Bạn đang xem. Bấm “Sẵn sàng” để tham gia ván tới — ai không sẵn sàng thì chỉ xem.</>
  );
  if (view.isHost)
    message = (
      <>
        {g.opts.hostPlays ? (
          <>🎩 Bạn là Quản trò và tham gia chơi{me.ready ? " — đã sẵn sàng" : " — bấm “Sẵn sàng” để được chia vai"}. Bạn sẽ không thấy vai người khác.</>
        ) : (
          <>🎩 Bạn là Quản trò — không tham gia chơi, chỉ xem hết vai và điều khiển ván.</>
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

/** Thứ tự quản trò gọi các vai đêm nay: vai đang thức, vai đã xong, vai sắp tới. */
function NightTurns({ pub }: { pub: NonNullable<WolfView["pub"]> }) {
  const order = nightTurns(pub);
  const now = pub.turn ? order.indexOf(pub.turn) : order.length;
  return (
    <ol className="ww-turns mt-3" aria-label="Thứ tự gọi các vai">
      {order.map((r, i) => (
        <li key={r} className={i < now ? "is-past" : i === now ? "is-now" : ""} aria-current={i === now ? "step" : undefined}>
          {ROLES[r].emoji} {ROLES[r].name}
        </li>
      ))}
    </ol>
  );
}

function CastChips({ cast }: { cast: Record<Role, number> }) {
  return (
    <span className="flex flex-wrap gap-1.5" aria-label="Đội hình">
      {ROLE_ORDER.filter((r) => cast[r] > 0).map((r) => (
        <span key={r} className="ww-cast" title={ROLES[r].name}>
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
  pick,
  poisoning,
  setPoisoning,
}: {
  view: View;
  session: WerewolfRoom;
  pick: Pick | null;
  poisoning: boolean;
  setPoisoning: (on: boolean) => void;
}) {
  const g = view.game!;
  const pub = g.pub;
  const me = g.me;
  const s = me.secret;
  let tone = "var(--sunken)";
  let message: React.ReactNode;
  let buttons: React.ReactNode = null;
  const chosen = pick?.chosen[0] ? nameMid(view, pick.chosen[0]) : null;
  const done = isDone(g);
  const confirm = (label: string, ok: boolean) => (
    <button type="button" className="btn btn-pen" onClick={() => session.confirm()} disabled={!ok}>
      ✅ {label}
    </button>
  );

  if (!me.inGame) {
    message = view.isHost ? (
      <>
        🎩 Bạn là Quản trò — theo dõi vai và mọi hành động ban đêm, điều khiển ván bằng các nút ở khung trên
        {g.pub?.stage === "night" ? " (có người treo máy thì bấm “Bỏ qua lượt” hoặc “Trời sáng ngay”)" : ""}. Đừng tiết lộ nhé!
      </>
    ) : g.seeAll ? (
      <>👀 Bạn đang xem — thấy được vai của mọi người và mọi hành động ban đêm. Đừng tiết lộ nhé!</>
    ) : (
      <>👀 Bạn đang xem ván này. Hết ván bấm “Sẵn sàng” để vào chơi.</>
    );
  } else if (!me.alive) {
    tone = "var(--coral-soft)";
    message = <>💀 Bạn đã chết. Hãy im lặng theo dõi đến hết ván nhé.</>;
  } else if (!s?.role) {
    message = <>🔐 Đang nhận thông tin bí mật từ quản trò…</>;
  } else if (pub!.stage === "intro") {
    tone = "var(--grape-soft)";
    message = (
      <>
        Bạn là{" "}
        <b>
          {ROLES[s.role].emoji} {ROLES[s.role].name}
        </b>
        . {ROLES[s.role].brief}
      </>
    );
  } else if (pub!.stage === "night") {
    tone = "var(--grape-soft)";
    const turn = pub!.turn;
    const calling = turn ? (
      <b>
        {ROLES[turn].emoji} {ROLES[turn].name}
      </b>
    ) : null;
    const order = nightTurns(pub!);
    const today = s.role === "seer" ? s.seen?.find((x) => x.day === pub!.day) : undefined;
    if (today) {
      tone = today.wolf ? "var(--coral-soft)" : "var(--lime-soft)";
      message = (
        <>
          🔮 <b>{nameIn(view, today.target)}</b> {today.wolf ? <b>LÀ SÓI! 🐺</b> : <>không phải Sói ✅</>}. Nhớ kỹ và chờ trời sáng.
        </>
      );
    } else if (turn !== s.role) {
      // Chưa tới lượt / đã qua lượt của mình / vai không thức dậy ban đêm.
      tone = "var(--sunken)";
      const mine = order.indexOf(s.role);
      const now = turn ? order.indexOf(turn) : order.length;
      message =
        mine < 0 ? (
          <>😴 Bạn đang ngủ say… {calling ? <>Quản trò đang gọi {calling} dậy.</> : "Chờ trời sáng."}</>
        ) : mine < now ? (
          <>😴 Bạn đã xong lượt đêm nay — ngủ tiếp thôi. {calling ? <>Đang gọi {calling} dậy.</> : ""}</>
        ) : (
          <>
            😴 Bạn đang ngủ — chờ quản trò gọi {ROLES[s.role].name} dậy. {calling ? <>Đang gọi {calling}.</> : ""}
          </>
        );
    } else if (s.role === "cupid") {
      const pair = cupidPair(g).map((u) => nameMid(view, u));
      message = done ? (
        <>💘 Đã ghép đôi {pair.join(" ❤ ")}. Chờ trời sáng…</>
      ) : pair.length === 2 ? (
        <>
          💘 Ghép đôi <b>{pair[0]}</b> ❤ <b>{pair[1]}</b>? Bấm vào người khác để đổi.
        </>
      ) : (
        <>💘 Bạn thức dậy! Chọn hai người (có thể là bạn) để ghép thành một cặp đôi{pair.length ? ` — đã chọn ${pair[0]}, chọn thêm một người` : ""}.</>
      );
      buttons = !done && confirm(pair.length === 2 ? "Chốt ghép đôi" : "Chốt", pair.length === 2);
    } else if (s.role === "wolf") {
      const picks = { ...s.picks, ...(me.act.wolf ? { [view.me]: me.act.wolf } : {}) };
      const pack = (s.pack ?? []).filter((u) => pub!.alive.includes(u));
      const agreed = pack.every((u) => picks[u]) && new Set(pack.map((u) => picks[u])).size === 1;
      const target = picks[view.me] ? nameMid(view, picks[view.me]) : chosen;
      message = done ? (
        <>🐺 Đã chốt cắn {target}. {pack.length > 1 ? "Chờ cả bầy chốt…" : "Chờ trời sáng…"}</>
      ) : chosen ? (
        <>
          🐺 Bạn chọn cắn <b>{chosen}</b>.{" "}
          {pack.length > 1 ? (agreed ? "Cả bầy đã thống nhất!" : "Cả bầy nên chọn cùng một người — không thì người nhiều Sói chọn nhất bị cắn.") : ""}
        </>
      ) : (
        <>🐺 Bầy Sói thức dậy! Chọn một người trong làng để cắn đêm nay, rồi bấm chốt.</>
      );
      buttons = !done && confirm(chosen ? `Chốt cắn ${chosen}` : "Chốt", !!chosen);
    } else if (s.role === "seer") {
      if (done) message = <>🔮 Đang soi… quản trò sẽ báo ngay.</>;
      else {
        message = chosen ? (
          <>
            🔮 Soi <b>{chosen}</b>? Bấm để xem người đó có phải Sói không.
          </>
        ) : (
          <>🔮 Bạn thức dậy! Chọn một người để soi xem có phải Sói không.</>
        );
        buttons = confirm(chosen ? `Soi ${chosen}` : "Soi", !!chosen);
      }
    } else if (s.role === "guard") {
      const target = me.act.guard ?? s.guarded;
      message = done ? (
        <>🛡️ Đã chốt bảo vệ {target ? nameMid(view, target) : ""}. Chờ trời sáng…</>
      ) : chosen ? (
        <>
          🛡️ Bạn bảo vệ <b>{chosen}</b> đêm nay.
        </>
      ) : (
        <>
          🛡️ Bạn thức dậy! Chọn một người để bảo vệ đêm nay.
          {s.lastGuard && !g.opts.guardRepeat ? ` Không được bảo vệ ${nameMid(view, s.lastGuard)} hai đêm liền.` : ""}
        </>
      );
      buttons = !done && confirm(chosen ? `Chốt bảo vệ ${chosen}` : "Chốt", !!chosen);
    } else if (s.role === "witch") {
      const potions = s.potions ?? { save: false, poison: false };
      const victim = s.victim;
      const save = me.act.save !== undefined ? me.act.save : s.save;
      const saving = !!victim && save === victim;
      const poison = me.act.poison !== undefined ? me.act.poison : s.poison;
      if (!potions.save && !potions.poison) message = <>🧙 Bạn đã dùng hết thuốc — ngủ tiếp thôi.</>;
      else if (done) message = <>🧙 Đã chốt quyết định — chờ trời sáng.</>;
      else {
        message = (
          <>
            🧙{" "}
            {!potions.save ? (
              "Bình cứu đã dùng nên bạn không được biết ai bị cắn."
            ) : victim ? (
              <>
                Đêm nay bầy Sói cắn <b>{nameMid(view, victim)}</b>.
              </>
            ) : victim === null ? (
              "Đêm nay bầy Sói không cắn ai."
            ) : (
              "Đang nhận tin từ quản trò…"
            )}{" "}
            {saving ? <b>Sẽ cứu. </b> : ""}
            {poison ? <b>Sẽ đầu độc {nameMid(view, poison)}. </b> : poisoning ? "Chọn người muốn đầu độc trong làng. " : ""}
            Bấm “Xong” khi đã quyết.
          </>
        );
        buttons = (
          <>
            {potions.save && victim && (
              <button
                type="button"
                className={`btn ${saving ? "btn-lime" : ""}`}
                aria-pressed={saving}
                onClick={() => session.witch({ save: saving ? null : victim })}
              >
                ❤️ {saving ? "Đang cứu" : `Cứu ${nameMid(view, victim)}`}
              </button>
            )}
            {potions.poison && (
              <button
                type="button"
                className={`btn ${poisoning || poison ? "btn-coral" : ""}`}
                aria-pressed={poisoning}
                onClick={() => {
                  if (poison || poisoning) session.witch({ poison: null });
                  setPoisoning(!(poison || poisoning));
                }}
              >
                ☠️ {poison ? "Bỏ đầu độc" : poisoning ? "Huỷ" : "Đầu độc"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-pen"
              onClick={() => {
                setPoisoning(false);
                session.confirm();
              }}
            >
              ✅ Xong
            </button>
          </>
        );
      }
    }
  } else if (pub!.stage === "dawn") {
    message = <>🌅 Trời sắp sáng…</>;
  } else if (pub!.stage === "day") {
    const ready = g.ready.includes(view.me);
    tone = "var(--sun-soft)";
    message = (
      <>
        🗣️ Thảo luận xem ai là Sói. Có thể nói dối, tố cáo, nhận mình là Tiên Tri…{" "}
        {g.opts.hostPlays
          ? "Bàn xong thì ai cũng có thể bấm “Bắt đầu bỏ phiếu”."
          : g.opts.talk
            ? "Cả làng cùng muốn thì bỏ phiếu ngay."
            : view.isHost
              ? "Bàn xong thì bấm “Bỏ phiếu ngay” ở khung trên."
              : "Quản trò sẽ cho bỏ phiếu khi cả làng bàn xong."}
      </>
    );
    buttons = g.opts.hostPlays ? (
      <button type="button" className="btn btn-sun" onClick={() => session.readyToVote(true)}>
        🗳️ Bắt đầu bỏ phiếu
      </button>
    ) : (
      <button type="button" className={`btn ${ready ? "btn-lime" : ""}`} aria-pressed={ready} onClick={() => session.readyToVote(!ready)}>
        ✋ {ready ? "Đã muốn bỏ phiếu" : g.opts.talk ? "Bỏ phiếu ngay" : "Muốn bỏ phiếu"}
      </button>
    );
  } else if (pub!.stage === "vote" || pub!.stage === "revote") {
    const mine = g.ballots[view.me];
    tone = "var(--sun-soft)";
    message =
      mine === undefined ? (
        <>🗳️ Bấm vào một người trong làng để bỏ phiếu treo cổ — ai nhiều phiếu nhất bị treo.</>
      ) : mine === null ? (
        <>🗳️ Bạn bỏ qua lượt bỏ phiếu này (đổi được tới khi hết giờ).</>
      ) : (
        <>
          🗳️ Bạn bỏ phiếu treo <b>{nameMid(view, mine)}</b> (đổi được tới khi hết giờ).
        </>
      );
    buttons = (
      <button type="button" className="btn" onClick={() => session.vote(null)} disabled={mine === null}>
        🤐 Bỏ qua
      </button>
    );
  } else {
    message = <>🌒 Đêm sắp buông xuống…</>;
  }

  return (
    <div className="card flex flex-wrap items-center gap-3 px-4 py-3" style={{ background: tone }} aria-live="polite">
      <p className="min-w-[min(100%,240px)] flex-1 text-[15px] font-semibold">{message}</p>
      {buttons && <div className="flex flex-wrap gap-2">{buttons}</div>}
    </div>
  );
}

/** Bầy Sói thì thầm với nhau trong đêm — đi riêng qua quản trò. */
function WolfDen({ view, session }: { view: View; session: WerewolfRoom }) {
  const g = view.game!;
  const s = g.me.secret!;
  const [text, setText] = useState("");
  const open = g.pub?.stage === "night" && g.me.alive;
  const listRef = useRef<HTMLOListElement>(null);
  const whisper = s.whisper ?? [];
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [whisper.length]);
  if (!open && !whisper.length) return null;
  const mates = (s.pack ?? []).filter((u) => u !== view.me);
  return (
    <section className="card ww-den p-4" aria-label="Bầy Sói thì thầm">
      <h2 className="font-display text-lg font-extrabold">
        🐺 Bầy Sói thì thầm{" "}
        <span className="text-sm font-semibold text-ink-3">
          {mates.length ? `với ${mates.map((u) => nameIn(view, u)).join(", ")}` : "— bạn là Sói đơn độc"}
        </span>
      </h2>
      {whisper.length > 0 && (
        <ol ref={listRef} className="mt-2 grid max-h-44 gap-1.5 overflow-y-auto text-[14px]">
          {whisper.map((w) => (
            <li key={w.id}>
              <b>{nameIn(view, w.uid)}:</b> {w.text}
            </li>
          ))}
        </ol>
      )}
      {open && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            session.whisper(text);
            setText("");
          }}
        >
          <label htmlFor="ww-whisper" className="sr-only">
            Lời thì thầm
          </label>
          <input
            id="ww-whisper"
            className="field !min-h-[40px]"
            placeholder="Thì thầm với bầy…"
            value={text}
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-sm" disabled={!text.trim()}>
            Gửi
          </button>
        </form>
      )}
      {open && <p className="mt-1.5 text-xs text-ink-3">Lời thì thầm tới bầy sau vài giây (gửi theo nhịp chung để không ai đoán ra Sói).</p>}
    </section>
  );
}

// ---------- làng ----------

/** Vòng làng: mọi người chơi, ai sống ai chết, phiếu bầu, và những gì mình được biết. Bấm để chọn khi có lựa chọn mở. */
function Village({ view, pick, balloons }: { view: View; pick: Pick | null; balloons: Record<string, ChatMsg> }) {
  const m = view.meta!;
  const g = view.game!;
  const pub = g.pub;
  const inRound = !!pub && (g.playing || !!g.result);
  const roster = inRound ? m.lineup : m.players;
  const s = g.me.secret;
  // Ai đang nhắm vào ai: Sói thấy lựa chọn của cả bầy, người thấy hết thấy mọi thứ, lúc bỏ phiếu ai cũng thấy phiếu bầu.
  const marks: Record<string, string[]> = {};
  const add = (target: string | undefined | null, by: string) => {
    if (target) (marks[target] ??= []).push(by);
  };
  if (g.playing && pub && (pub.stage === "vote" || pub.stage === "revote")) for (const [voter, t] of Object.entries(g.ballots)) add(t, voter);
  else if (pub?.stage === "night" && s?.role === "wolf")
    for (const [w, t] of Object.entries({ ...s.picks, ...(g.me.act.wolf ? { [view.me]: g.me.act.wolf } : {}) })) add(t, w);
  else if (isNight(g) && g.seeAll?.night) for (const [w, t] of Object.entries(g.seeAll.night.wolves)) add(t, w);

  if (!roster.length) return <p className="card p-4 text-sm font-semibold text-ink-3">Chưa ai sẵn sàng — bấm “Sẵn sàng” để tham gia ván tới.</p>;
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="ww-village-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="ww-village-h" className="font-display text-lg font-extrabold">
          🏘️ {inRound ? "Dân làng" : "Đã sẵn sàng"} {inRound && <span className="text-ink-3">({pub!.alive.length} còn sống)</span>}
        </h2>
        {pick && <p className="text-[13px] font-bold text-pen">Bấm vào một người để {pick.verb.toLowerCase()}</p>}
      </div>
      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2.5">
        {roster.map((uid) => (
          <li key={uid}>
            <Token view={view} uid={uid} pick={pick} by={marks[uid] ?? []} balloon={balloons[uid]} inRound={inRound} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Token({ view, uid, pick, by, balloon, inRound }: { view: View; uid: string; pick: Pick | null; by: string[]; balloon?: ChatMsg; inRound: boolean }) {
  const m = view.meta!;
  const g = view.game!;
  const seat = g.people[uid];
  const p = seat?.member;
  const death = inRound ? deathOf(view, uid) : undefined;
  const role = inRound ? knownRole(view, uid) : undefined;
  const seen = g.me.secret?.seen?.filter((x) => x.target === uid).at(-1);
  const can = !!pick && pick.can(uid);
  const chosen = !!pick && pick.chosen.includes(uid);
  const ready = g.ready.includes(uid);
  const night = isNight(g) ? g.seeAll?.night : undefined;
  const turned = !!role && knownTurned(view).includes(uid);
  const tags: string[] = [];
  if (inRound && knownLovers(view).includes(uid)) tags.push("💘");
  if (night?.cupid?.includes(uid)) tags.push("🏹");
  if (night?.guard === uid) tags.push("🛡️");
  if (night?.seer === uid) tags.push("🔮");
  if (night?.victim === uid) tags.push("🎯");
  if (night?.save === uid) tags.push("❤️");
  if (night?.poison === uid) tags.push("☠️");
  if (night?.done.includes(uid)) tags.push("✅");
  const dot = role
    ? { icon: ROLES[role].emoji, title: roleName(role, turned) }
    : death?.wolf !== undefined
      ? { icon: death.wolf ? "🐺" : "🙂", title: death.wolf ? "Là Sói" : "Không phải Sói" }
      : seen
        ? { icon: seen.wolf ? "🐺" : "✅", title: seen.wolf ? "Bạn đã soi: là Sói" : "Bạn đã soi: không phải Sói" }
        : null;

  const body = (
    <>
      <span className="relative">
        {p ? <Avatar p={p} size={52} className={seat.online ? "" : "opacity-40 grayscale"} /> : <span className="avatar h-[52px] w-[52px] bg-sunken" />}
        {!death && <Balloon msg={balloon} />}
        {uid === m.host && (
          <span className="absolute -top-2.5 -left-1.5 text-base" title="Quản trò">
            👑
          </span>
        )}
        {dot && (
          <span className="ww-role-dot" title={dot.title}>
            {dot.icon}
          </span>
        )}
        {death && (
          <span className="ww-dead" aria-hidden="true">
            {deathIcon(death)}
          </span>
        )}
        {ready && !death && (
          <span className="ww-ready" title="Muốn bỏ phiếu ngay">
            ✋
          </span>
        )}
        {by.length > 0 && <span className="ww-count">{by.length}</span>}
      </span>
      <span className="mt-1 w-full truncate text-[12.5px] leading-tight font-bold">{nameIn(view, uid)}</span>
      <span className="w-full truncate text-[11px] leading-tight font-semibold text-ink-3">{death ? deathText(death) : role ? roleName(role, turned) : " "}</span>
      {tags.length > 0 && <span className="text-[13px] leading-tight">{tags.join(" ")}</span>}
      {by.length > 0 && (
        <span className="mt-1 flex flex-wrap justify-center -space-x-1.5" aria-label={`Được chọn bởi ${by.map((u) => nameIn(view, u)).join(", ")}`}>
          {by.slice(0, 6).map((u) => {
            const voter = g.people[u]?.member;
            return voter ? <Avatar key={u} p={voter} size={20} /> : null;
          })}
        </span>
      )}
    </>
  );

  const cls = `ww-token ${death ? "is-dead" : ""} ${chosen ? "is-chosen" : ""} ${can ? "can-pick" : ""} ${uid === view.me ? "is-me" : ""}`;
  if (!pick) return <div className={cls}>{body}</div>;
  return (
    <button
      type="button"
      className={cls}
      disabled={!can}
      aria-pressed={chosen}
      onClick={() => pick.onPick(uid)}
      title={can ? `${pick.verb} ${nameIn(view, uid)}` : undefined}
    >
      {body}
    </button>
  );
}

// ---------- vai của mình ----------

function RoleCard({ view }: { view: View }) {
  const g = view.game!;
  const role = g.me.role!;
  const s = g.me.secret;
  const [hidden, setHidden] = useState(false);
  const info = ROLES[role];
  return (
    <section className={`card ww-role p-4 sm:p-5 ${info.team === "wolf" ? "is-wolf" : ""}`} aria-label="Vai của bạn">
      <div className="flex items-center gap-4">
        <span className={`ww-role-art ${hidden ? "is-hidden" : ""}`} aria-hidden="true">
          {hidden ? "❔" : info.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold tracking-wide text-ink-3 uppercase">Vai của bạn</p>
          <p className="font-display text-2xl font-extrabold">{hidden ? "••••••" : info.name}</p>
          {!hidden && <p className="mt-0.5 text-[14px] text-ink-2">{info.brief}</p>}
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setHidden((h) => !h)} title="Che vai khi có người ngồi cạnh">
          {hidden ? "👁 Hiện" : "🙈 Che"}
        </button>
      </div>
      {!hidden && s && (
        <div className="mt-3 grid gap-1.5 border-t-2 border-rule pt-3 text-[14px]">
          {s.turned && <p>🌗 Bạn vốn là Bán Sói — đã bị Sói cắn và hoá thành Sói, giờ theo bầy.</p>}
          {s.lover && (
            <p>
              💘 Bạn đang yêu{" "}
              <b>
                {nameIn(view, s.lover)}
                {s.loverRole ? ` (${ROLES[s.loverRole].emoji} ${ROLES[s.loverRole].name})` : ""}
              </b>
              . Một người chết thì người kia chết theo.{" "}
              {s.loverRole && (s.loverRole === "wolf") !== (role === "wolf")
                ? "Hai bạn khác phe — giờ là phe riêng, thắng khi chỉ còn hai bạn sống sót."
                : "Hai bạn cùng phe."}
            </p>
          )}
          {role === "cupid" && (
            <p className="text-ink-2">
              {s.lovers ? (
                <>
                  Đã ghép đôi <b className="text-ink">{s.lovers.map((u) => nameIn(view, u)).join(" ❤ ")}</b>.
                </>
              ) : (
                "Đêm đầu tiên bạn sẽ ghép một cặp đôi."
              )}
            </p>
          )}
          {role === "wolf" && (
            <p>
              <b>Bầy Sói:</b> {(s.pack ?? []).map((u) => nameIn(view, u)).join(", ")}
            </p>
          )}
          {role === "seer" &&
            (s.seen?.length ? (
              <ul className="grid gap-1">
                {s.seen.map((x) => (
                  <li key={`${x.day}:${x.target}`}>
                    Đêm {x.day}: <b>{nameIn(view, x.target)}</b> — {x.wolf ? "🐺 là Sói" : "✅ không phải Sói"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-2">Chưa soi ai.</p>
            ))}
          {role === "guard" && (
            <p className="text-ink-2">
              {s.lastGuard ? (
                <>
                  Đêm trước bảo vệ: <b className="text-ink">{nameIn(view, s.lastGuard)}</b>.{" "}
                </>
              ) : (
                "Chưa bảo vệ ai. "
              )}
              {g.opts.guardSelf ? "Được tự bảo vệ mình." : "Không được tự bảo vệ mình."} {g.opts.guardRepeat ? "" : "Không bảo vệ một người hai đêm liền."}
            </p>
          )}
          {role === "witch" && s.potions && (
            <p>
              ❤️ Thuốc cứu: <b>{s.potions.save ? "còn" : "đã dùng"}</b> · ☠️ Thuốc độc: <b>{s.potions.poison ? "còn" : "đã dùng"}</b>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ---------- cảnh diễn ----------

const SCENE_MS: Record<Scene["kind"], number> = { dusk: 3200, sunrise: 6000, hang: 7500, spared: 3200, end: 5000 };

/**
 * Lớp phủ toàn màn hình cho những khoảnh khắc của ván: trời tối rồi lật bài vai (giai đoạn nhận vai), đếm ngược
 * 3‑2‑1 trước khi trời sáng, và các cảnh xếp hàng lần lượt: trời sáng (ai chết đêm qua), treo cổ (bay lên, lật bài
 * Sói / không phải Sói), không ai bị treo, phe thắng. Bấm để bỏ qua.
 */
function Cinema({ view, session }: { view: View; session: WerewolfRoom }) {
  const g = view.game!;
  const pub = g.pub;
  const [queue, setQueue] = useState<Scene[]>([]);
  const [closed, setClosed] = useState("");
  useEffect(() => session.onScene((s) => setQueue((q) => [...q, s].slice(-6))), [session]);
  const cur = queue[0];
  useEffect(() => {
    if (!cur) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), SCENE_MS[cur.kind]);
    return () => clearTimeout(t);
  }, [cur]);
  const stage = g.playing ? pub?.stage : undefined;
  const stageKey = `${pub?.round}:${pub?.day}:${stage}`;
  const now = useNow(stage === "intro" || stage === "dawn", 200);

  let content: React.ReactNode = null;
  let tone = "is-night";
  let skip = () => setQueue((q) => q.slice(1));
  if ((stage === "intro" || stage === "dawn") && closed !== stageKey) {
    skip = () => setClosed(stageKey);
    const elapsed = now ? now - (g.deadline - (pub!.until - pub!.since)) : 0;
    content = stage === "intro" ? <IntroScene view={view} elapsed={elapsed} /> : <Countdown left={now ? g.deadline - now : 3000} />;
  } else if (cur) {
    if (cur.kind === "sunrise") tone = "is-dawn";
    if (cur.kind === "end") tone = cur.team === "wolf" ? "is-blood" : "is-dawn";
    content = <SceneView key={cur.id} view={view} scene={cur} />;
  }
  if (!content) return null;
  return (
    <div className={`ww-cine ${tone}`} role="dialog" aria-modal="true" aria-label="Diễn biến" onClick={skip}>
      <div className="ww-cine-body">{content}</div>
      <p className="ww-cine-skip">Bấm để bỏ qua</p>
    </div>
  );
}

/** "Trời tối rồi…", rồi chia bài: mỗi người chơi một lá. Người chơi chỉ lật lá của mình; quản trò và người xem lật hết. */
function IntroScene({ view, elapsed }: { view: View; elapsed: number }) {
  const g = view.game!;
  const lineup = view.meta!.lineup;
  if (elapsed < 3200)
    return (
      <div className="grid justify-items-center gap-4 text-center">
        <span className="ww-moon" aria-hidden="true">
          🌙
        </span>
        <p className="ww-cine-title">Trời tối rồi, mọi người ngủ đi thôi…</p>
      </div>
    );
  const all = !!g.seeAll;
  return (
    <div className="grid justify-items-center gap-5 text-center">
      <div>
        <p className="ww-cine-title !text-[28px]">Lá bài định mệnh</p>
        <p className="mt-1 text-[14.5px] font-semibold opacity-80">
          {all ? "Bạn thấy vai của tất cả mọi người." : g.me.inGame ? "Chỉ lá của bạn được lật — giữ bí mật nhé!" : ""}
        </p>
      </div>
      <ul className="ww-deck">
        {lineup.map((uid, i) => {
          const role = all ? g.seeAll!.roles[uid] : uid === view.me ? g.me.role : undefined;
          const flipAt = 4200 + (all ? i * 380 : 600);
          const p = g.people[uid]?.member;
          return (
            <li
              key={uid}
              className={`ww-card ${role && elapsed >= flipAt ? "is-flipped" : ""} ${uid === view.me ? "is-me" : ""}`}
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="ww-card-inner">
                <div className="ww-card-face ww-card-back">
                  {p && <Avatar p={p} size={40} />}
                  <span className="ww-card-name">{nameIn(view, uid)}</span>
                  <span className="text-2xl" aria-hidden="true">
                    ❔
                  </span>
                </div>
                <div className={`ww-card-face ww-card-front ${role === "wolf" ? "is-wolf" : ""}`}>
                  <span className="text-[34px] leading-none" aria-hidden="true">
                    {role ? ROLES[role].emoji : ""}
                  </span>
                  <span className="text-[13px] font-extrabold">{role ? ROLES[role].name : ""}</span>
                  <span className="ww-card-name">{nameIn(view, uid)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Countdown({ left }: { left: number }) {
  const n = Math.min(3, Math.max(1, Math.ceil(left / 1000)));
  return (
    <div className="grid justify-items-center gap-3 text-center">
      <p className="text-[15px] font-bold tracking-wide uppercase opacity-80">Trời sắp sáng</p>
      <span key={n} className="ww-count-big">
        {n}
      </span>
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
    case "dusk":
      return (
        <div className="grid justify-items-center gap-4 text-center">
          <span className="ww-moon" aria-hidden="true">
            🌙
          </span>
          <p className="text-[15px] font-bold tracking-wide uppercase opacity-80">Đêm thứ {scene.day}</p>
          <p className="ww-cine-title">Trời tối rồi, mọi người ngủ đi thôi…</p>
        </div>
      );
    case "sunrise":
      return (
        <div className="grid justify-items-center gap-4 text-center">
          <span className="ww-sun" aria-hidden="true">
            ☀️
          </span>
          <p className="ww-cine-title">Trời sáng rồi, mọi người dậy nào…</p>
          <div className="ww-late">
            {scene.dead.length ? (
              <>
                <p className="text-[16px] font-bold">Đêm qua đã có người ra đi:</p>
                <ul className="mt-3 flex flex-wrap justify-center gap-4">
                  {scene.dead.map((d) => (
                    <li key={d.uid} className="grid justify-items-center gap-1">
                      <span className="relative">
                        <span className="inline-block opacity-60 grayscale">{avatar(d.uid, 56)}</span>
                        <span className="ww-dead">💀</span>
                      </span>
                      <b className="text-[14px]">{nameIn(view, d.uid)}</b>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[17px] font-bold">🕊️ Đêm qua bình yên, không ai chết.</p>
            )}
          </div>
        </div>
      );
    case "hang": {
      const d = scene.death;
      return (
        <div className="grid justify-items-center gap-4 text-center">
          <p className="text-[15px] font-bold tracking-wide uppercase opacity-80">Cả làng đã quyết định</p>
          <div className="ww-hang">{avatar(d.uid, 88)}</div>
          <p className="ww-cine-title !text-[26px]">{nameIn(view, d.uid)} bị treo cổ</p>
          <div className={`ww-verdict ${d.wolf ? "is-wolf" : ""}`}>
            <div className="ww-verdict-inner">
              <div className="ww-verdict-face ww-verdict-back">❔</div>
              <div className="ww-verdict-face ww-verdict-front">
                <span className="text-[40px] leading-none">{d.wolf ? "🐺" : "🙂"}</span>
                <b>{d.wolf ? "LÀ SÓI!" : "KHÔNG PHẢI SÓI"}</b>
              </div>
            </div>
          </div>
        </div>
      );
    }
    case "spared":
      return (
        <div className="grid justify-items-center gap-4 text-center">
          <span className="ww-moon" aria-hidden="true">
            🕊️
          </span>
          <p className="ww-cine-title">Hôm nay không ai bị treo cổ</p>
        </div>
      );
    case "end": {
      const mine = mySide(view);
      return (
        <div className="grid justify-items-center gap-3 text-center">
          <span className="ww-moon" aria-hidden="true">
            {scene.team === "village" ? "🏆" : SIDE_ICON[scene.team]}
          </span>
          <p className="ww-cine-title !text-[40px]">{SIDE_TITLE[scene.team]}</p>
          {mine && <p className="text-[17px] font-bold">{mine === scene.team ? "Phe của bạn đã thắng 🎉" : "Phe của bạn đã thua…"}</p>}
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
  const side = r.team as Side | undefined;
  const mine = mySide(view);
  const title = side ? `${SIDE_ICON[side]} ${SIDE_TITLE[side]}` : "⏹ Ván dừng giữa chừng";
  const roles = pub?.roles ?? {};
  return (
    <section className={`card ww-result p-4 sm:p-5 ${r.team === "wolf" ? "is-wolf" : ""}`} aria-label={`Kết quả ván ${r.round}`}>
      <p className="font-display text-3xl font-extrabold tracking-tight">{title}</p>
      <p className="mt-1 text-[15px] text-ink-2">
        {r.team && mine
          ? mine === r.team
            ? "Phe của bạn đã thắng 🎉"
            : "Phe của bạn đã thua — ván sau phục thù nhé!"
          : r.team
            ? `Ván ${r.round} kết thúc sau ${pub?.day ?? 1} ngày.`
            : "Không tính thắng thua."}
      </p>
      {pub && (
        <>
          <h3 className="mt-4 font-display text-lg font-extrabold">🎴 Lật bài</h3>
          <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
            {m.lineup.map((uid) => {
              const p = g.people[uid]?.member;
              const role = roles[uid];
              const d = deathOf(view, uid);
              const won = role && side ? sideOf(roles, pub.lovers, uid) === side : false;
              const turned = !!pub.turned?.includes(uid);
              return (
                <li key={uid} className={`ww-reveal ${role === "wolf" ? "is-wolf" : ""}`}>
                  <span className="text-[30px] leading-none" aria-hidden="true">
                    {role ? ROLES[role].emoji : "❔"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {p && <Avatar p={p} size={20} className={d ? "opacity-50 grayscale" : ""} />}
                      <b className="truncate text-[14px]">{nameIn(view, uid)}</b>
                      {won && <span title="Phe thắng">🏆</span>}
                      {pub.lovers?.includes(uid) && <span title="Cặp đôi">💘</span>}
                    </span>
                    <span className="block text-[12.5px] font-semibold text-ink-2">{role ? roleName(role, turned) : "Không rõ"}</span>
                    <span className="block text-[12px] text-ink-3">{d ? deathText(d) : "sống sót"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {pub.story && pub.story.length > 0 && <Story view={view} story={pub.story} roles={roles} turned={pub.turned ?? []} />}
        </>
      )}
    </section>
  );
}

/** Diễn biến từng ngày: đêm ai cắn ai, ai bảo vệ, soi, cứu, đầu độc; ngày ai bầu ai, ai bị treo. */
function Story({ view, story, roles, turned }: { view: View; story: Chapter[]; roles: Record<string, Role>; turned: string[] }) {
  const name = (uid: string) => nameMid(view, uid);
  const holder = (r: Role) => {
    const uid = Object.keys(roles).find((u) => roles[u] === r);
    return uid ? `${ROLES[r].name} ${uid === view.me ? "(bạn)" : name(uid)}` : ROLES[r].name;
  };
  // Bán Sói hoá Sói từ đêm sau đêm bị cắn.
  const turnedAt = (u: string) => story.find((c) => c.turned === u)?.day ?? 0;
  // Bầy Sói của từng đêm: những con còn sống tới đêm đó (chết từ ngày trước trở về trước thì không tính).
  const pack = (day: number) =>
    Object.keys(roles).filter(
      (u) => roles[u] === "wolf" && !((deathOf(view, u)?.day ?? Infinity) < day) && !(turned.includes(u) && turnedAt(u) >= day),
    );
  return (
    <>
      <h3 className="mt-5 font-display text-lg font-extrabold">📖 Diễn biến câu chuyện</h3>
      <ol className="ww-story mt-2">
        {story.map((c) => {
          const nights: React.ReactNode[] = [];
          if (c.lovers) nights.push(`💘 ${holder("cupid")} ghép đôi ${c.lovers.map(name).join(" ❤ ")}.`);
          if (c.bite !== undefined) {
            nights.push(c.bite ? `🐺 Bầy Sói (${pack(c.day).map(name).join(", ")}) chọn cắn ${name(c.bite)}.` : "🐺 Bầy Sói không cắn ai.");
            if (c.guard) nights.push(`🛡️ ${holder("guard")} bảo vệ ${name(c.guard)}${c.guard === c.bite ? " — chặn được nanh Sói!" : "."}`);
            if (c.seer) nights.push(`🔮 ${holder("seer")} soi ${name(c.seer.target)} — ${c.seer.wolf ? "là Sói!" : "không phải Sói."}`);
            if (c.save) nights.push(`🧙 ${holder("witch")} dùng bình cứu ${name(c.save)}.`);
            if (c.poison) nights.push(`🧙 ${holder("witch")} đầu độc ${name(c.poison)}.`);
            if (c.turned) nights.push(`🌗 ${name(c.turned)} là Bán Sói — bị cắn nên hoá thành Sói!`);
            nights.push(<b key="dawn">{c.died?.length ? `💀 Sáng ra: ${c.died.map(name).join(", ")} đã chết.` : "🕊️ Sáng ra không ai chết."}</b>);
          }
          const days: React.ReactNode[] = [];
          (c.votes ?? []).forEach((ballots, i) => {
            const by: Record<string, string[]> = {};
            let skip = 0;
            for (const [voter, t] of Object.entries(ballots)) {
              if (t) (by[t] ??= []).push(voter);
              else skip++;
            }
            const parts = Object.entries(by)
              .sort((a, b) => b[1].length - a[1].length)
              .map(([t, vs]) => `${name(t)} ${vs.length} phiếu (${vs.map(name).join(", ")})`);
            days.push(
              `🗳️ ${i ? "Bỏ phiếu lại" : "Bỏ phiếu"}: ${parts.length ? parts.join(" · ") : "không ai bị bầu"}${skip ? ` · ${skip} người bỏ qua` : ""}.`,
            );
          });
          if (c.hanged !== undefined)
            days.push(
              <b key="hang">
                {c.hanged
                  ? `🪢 ${name(c.hanged)} bị treo cổ — ${roles[c.hanged] === "wolf" ? "là Sói! 🐺" : `là ${roles[c.hanged] ? ROLES[roles[c.hanged]].name : "dân lành"}.`}`
                  : "🕊️ Không ai bị treo cổ."}
              </b>,
            );
          if (c.left?.length) days.push(`🚪 ${c.left.map(name).join(", ")} bỏ làng ra đi.`);
          // Người yêu chết theo: ban đêm đã nằm trong danh sách chết đêm qua, kể thêm cho rõ.
          for (const u of c.love ?? []) {
            const line = `💔 ${name(u)} đau buồn chết theo người yêu.`;
            if (deathOf(view, u)?.how === "love") days.push(line);
            else nights.splice(Math.max(0, nights.length - 1), 0, line);
          }
          return (
            <li key={c.day}>
              {nights.length > 0 && (
                <div>
                  <p className="ww-story-h">🌙 Đêm {c.day}</p>
                  <ul>
                    {nights.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
              {days.length > 0 && (
                <div>
                  <p className="ww-story-h">☀️ Ngày {c.day}</p>
                  <ul>
                    {days.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

// ---------- luật ----------

function Settings({ view, session }: { view: View; session: WerewolfRoom }) {
  const g = view.game!;
  const o = g.opts;
  const host = view.isHost;
  const set = (patch: Partial<WolfOptions>) => session.setOptions(patch);
  const n = view.meta!.players.length;
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="ww-settings-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="ww-settings-h" className="font-display text-lg font-extrabold">
          ⚙️ Luật của làng
        </h2>
        {!host && <p className="text-[13px] font-semibold text-ink-3">Quản trò chỉnh luật</p>}
      </div>
      <p className="mt-1 text-[13.5px] text-ink-2">
        {host ? "Bấm vào thẻ để bật / tắt vai có trong ván." : "Các vai có trong ván tới."} Đội hình với {n} người sẵn sàng:
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {ROLE_ORDER.map((r) => (
          <li key={r}>
            <RolePick role={r} view={view} session={session} />
          </li>
        ))}
      </ul>
      {g.plan.error && n > 0 && <p className="mt-2 text-sm font-semibold text-coral">{g.plan.error}.</p>}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Thảo luận ban ngày">
          <Seg value={o.talk} options={TALKS} label={talkName} onChange={(v) => set({ talk: v })} disabled={!host} />
        </Field>
        <Field label="Hoà phiếu">
          <Seg
            value={o.tie}
            options={["revote", "none"] as const}
            label={(v) => (v === "revote" ? "Bỏ phiếu lại" : "Không ai chết")}
            onChange={(v) => set({ tie: v })}
            disabled={!host}
          />
        </Field>
        <Field label="Quản trò">
          <Seg
            value={o.hostPlays}
            options={[false, true] as const}
            label={(v) => (v ? "Tham gia chơi" : "Chỉ xem và điều khiển")}
            onChange={(v) => set({ hostPlays: v })}
            disabled={!host}
          />
          <p className="mt-1.5 text-[12.5px] text-ink-3">
            {o.hostPlays
              ? "Quản trò bấm Sẵn sàng và được chia vai như mọi người — không thấy vai người khác; máy vẫn tự điều khiển ván."
              : "Quản trò không được chia vai, thấy hết vai và mọi hành động ban đêm."}
          </p>
        </Field>
      </div>
    </section>
  );
}

/** Thẻ một vai trong Luật của làng: Sói luôn có (chọn số lượng), các vai khác bấm để bật / tắt. */
function RolePick({ role, view, session }: { role: Role; view: View; session: WerewolfRoom }) {
  const g = view.game!;
  const o = g.opts;
  const host = view.isHost;
  const n = view.meta!.players.length;
  const set = (patch: Partial<WolfOptions>) => session.setOptions(patch);
  const info = ROLES[role];
  const on = role === "wolf" || o[role];
  const count = g.plan.cast[role];
  const head = (
    <>
      <span className="text-[30px] leading-none" aria-hidden="true">
        {info.emoji}
      </span>
      <span className="mt-1 font-display text-[15px] font-extrabold">{info.name}</span>
      <span className="text-[12px] font-bold text-ink-3">
        {!on ? "Không dùng" : role === "villager" ? (count ? `${count} người — phần còn lại` : "Phần còn lại") : count > 1 ? `${count} người` : "Có trong ván"}
      </span>
    </>
  );
  if (role === "wolf")
    return (
      <div className="ww-pick is-on">
        {head}
        <div className="mt-2 flex flex-wrap justify-center gap-1" role="group" aria-label="Số Sói">
          {[0, ...Array.from({ length: MAX_WOLVES }, (_, i) => i + 1)].map((v) => (
            <button
              key={v}
              type="button"
              className={`ww-pick-num ${o.wolves === v ? "is-on" : ""}`}
              aria-pressed={o.wolves === v}
              disabled={!host}
              onClick={() => set({ wolves: v })}
              title={v ? `${v} Sói` : `Tự động theo số người (${autoWolves(Math.max(n, MIN_PLAYERS))} Sói)`}
            >
              {v || "Tự động"}
            </button>
          ))}
        </div>
      </div>
    );
  return (
    <div className={`ww-pick ${on ? "is-on" : ""}`}>
      <button
        type="button"
        className="ww-pick-toggle"
        aria-pressed={on}
        disabled={!host}
        onClick={() => set({ [role]: !on })}
        title={host ? (on ? `Bỏ ${info.name} khỏi ván` : `Thêm ${info.name} vào ván`) : info.brief}
      >
        <span className="ww-pick-check" aria-hidden="true">
          {on ? "✓" : ""}
        </span>
        {head}
      </button>
      {role === "guard" && on && (
        <div className="mt-2 grid gap-1">
          <button
            type="button"
            className={`ww-pick-num ${o.guardSelf ? "is-on" : ""}`}
            aria-pressed={o.guardSelf}
            disabled={!host}
            onClick={() => set({ guardSelf: !o.guardSelf })}
          >
            {o.guardSelf ? "✓" : "✕"} Tự bảo vệ mình
          </button>
          <button
            type="button"
            className={`ww-pick-num ${o.guardRepeat ? "is-on" : ""}`}
            aria-pressed={o.guardRepeat}
            disabled={!host}
            onClick={() => set({ guardRepeat: !o.guardRepeat })}
          >
            {o.guardRepeat ? "✓" : "✕"} Một người hai đêm liền
          </button>
        </div>
      )}
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

function Rules({ opts }: { opts: WolfOptions }) {
  return (
    <div className="grid gap-3 text-[14.5px] text-ink-2">
      <p>
        <b className="text-ink">Hai phe.</b> Ma Sói muốn giết hết dân làng; Dân Làng (kể cả các vai đặc biệt) muốn tìm và treo cổ hết Sói. Sói thắng khi số Sói
        còn sống bằng hoặc nhiều hơn phần còn lại; Dân thắng khi không còn con Sói nào. Cặp đôi Cupid ghép mà khác phe (một Sói, một không) thành phe thứ ba:
        thắng khi chỉ còn hai người họ sống sót.
      </p>
      <p>
        <b className="text-ink">Vào chơi.</b> Người tạo phòng là Quản trò: tuỳ luật, chỉ xem hết vai và điều khiển ván, hoặc tham gia chơi như mọi người (khi đó
        không thấy vai người khác). Ai bấm “Sẵn sàng” mới được chia vai; những người còn lại xem — người xem thấy hết vai nên không được trò chuyện trong ván.
        Hết ván mọi người sẵn sàng lại.
      </p>
      <ul className="grid gap-1.5">
        {ROLE_ORDER.map((r) => (
          <li key={r}>
            <b className="text-ink">
              {ROLES[r].emoji} {ROLES[r].name}:
            </b>{" "}
            {ROLES[r].brief}
          </li>
        ))}
      </ul>
      <p>
        <b className="text-ink">🌙 Ban đêm.</b> Cả làng ngủ, không trò chuyện. Quản trò gọi lần lượt từng vai thức dậy:{" "}
        {NIGHT_ORDER.map((r) => ROLES[r].name).join(" → ")} (Cupid chỉ đêm đầu) — vai này chọn người và bấm chốt xong mới tới vai kia. Sói thì thầm được
        với nhau; tới lượt Phù Thủy thì được biết bầy Sói vừa cắn ai (khi còn bình cứu) để quyết định cứu hay đầu độc. Vai đã chết vẫn được “gọi” để không lộ.
        Không giới hạn thời gian — hết lượt vai cuối thì đếm ngược 3, 2, 1, trời sáng (có người treo máy thì Quản trò bỏ qua lượt hoặc cho trời sáng luôn).
      </p>
      <p>
        <b className="text-ink">☀️ Ban ngày.</b> Quản trò công bố ai chết đêm qua — vai của người chết giữ bí mật tới hết ván. Cả làng thảo luận{" "}
        {opts.talk ? `${opts.talk / 60} phút` : "tới khi quản trò cho dừng"} rồi bỏ phiếu treo một người — ai nhiều phiếu nhất bị treo và bị lật bài Sói hay
        không phải Sói; hoà phiếu thì {opts.tie === "revote" ? "bỏ phiếu lại giữa những người hoà, hoà nữa thì không ai chết" : "không ai chết"}. Người chết
        không được nói nữa.
      </p>
      <p>
        <b className="text-ink">🏁 Hết ván.</b> Lật bài vai của mọi người và kể lại diễn biến từng đêm, từng ngày.
      </p>
      <p className="rounded-xl bg-sunken p-3 text-[13px]">
        🔐 Vai và hành động ban đêm được mã hoá, chỉ máy của bạn và máy của quản trò đọc được. Quản trò mất kết nối giữa ván thì ván phải dừng.
      </p>
    </div>
  );
}
