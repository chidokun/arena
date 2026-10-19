// Chọn tờ là một ý định như vào ghế: chủ phòng ghi nhận theo thứ tự nên không có hai người giành được cùng một tờ.
import {
  grantSheets,
  isSheetId,
  makeSheets,
  MAX_NUMBER,
  MAX_PICK,
  nextNumber,
  notReady,
  paceOf,
  PACES,
  replay,
  SHEET_COUNT,
  shoutFor,
  waitingRows,
  type LotoOptions,
  type LotoState,
  type Sheet,
} from "../games/loto";
import type { RoomAd } from "./lobby";
import { RoomSession, START_COUNTDOWN_MS, type Member, type Meta, type Result, type SeatView } from "./room";

// Kêu số đầu tiên ngay khi hết nhịp đếm ngược mở ván — vừa đủ để mọi người nhìn lại tờ.
export const FIRST_CALL_MS = START_COUNTDOWN_MS;

export type LotoView = {
  opts: LotoOptions;
  sheets: Sheet[];
  owner: (string | null)[];
  mine: number[];
  pending: { pick: number[]; ready: boolean } | null;
  ready: string[];
  round: number;
  dealt: Record<string, number[]>;
  state: LotoState;
  waiting: Record<string, number>;
  people: Record<string, SeatView>;
  paused: boolean;
  result?: Result;
};

export type LotoCall = {
  round: number;
  n: number;
  count: number;
  waiting: string[];
  kinh: string[];
};

export class LotoRoom extends RoomSession<LotoView> {
  readonly game = "loto";
  private deck: { seed: number; sheets: Sheet[] } | null = null;
  private clock = { round: -1, count: -1, paused: false, at: 0 };
  private heard = { round: -1, count: 0, paused: false };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private callFns = new Set<(c: LotoCall) => void>();

  private sheets(m: Meta) {
    const seed = Number((m.opts as LotoOptions).seed) || 0;
    if (this.deck?.seed !== seed) this.deck = { seed, sheets: makeSheets(seed) };
    return this.deck.sheets;
  }

  private play(m: Meta) {
    const log = m.round ? this.gossip.get<{ draws?: unknown }>(`g:${m.round}`)?.draws : undefined;
    return replay(Array.isArray(log) ? log : [], m.dealt ?? {}, this.sheets(m));
  }

  protected applyIntent(m: Meta, p: Member) {
    const claims = (m.claims ??= {});
    const ready = new Set(m.ready);
    ready.delete(p.uid);
    if (p.want === "play") {
      const next = grantSheets(claims, p.uid, Array.isArray(p.pick) ? p.pick : []);
      if (next.length) {
        claims[p.uid] = next;
        if (!m.players.includes(p.uid)) m.players.push(p.uid);
        if (p.ready) ready.add(p.uid);
      } else delete claims[p.uid];
    } else if (p.want === "watch") delete claims[p.uid];
    m.ready = [...ready];
  }

  protected tidy(m: Meta) {
    const claims = (m.claims ??= {});
    for (const uid of Object.keys(claims)) if (!m.players.includes(uid)) delete claims[uid];
    m.players = m.players.filter((uid) => claims[uid]?.length);
    m.ready = (m.ready ?? []).filter((uid) => m.players.includes(uid));
  }

  protected begin(m: Meta) {
    const claims = m.claims ?? {};
    const players = m.players.filter((uid) => claims[uid]?.length);
    if (!players.length || notReady(players, m.host, m.ready ?? []).length) return false;
    m.lineup = players;
    m.dealt = Object.fromEntries(players.map((uid) => [uid, [...claims[uid]]]));
    m.ready = [];
    m.paused = false;
    return true;
  }

  protected outcome(m: Meta): Result | undefined {
    const s = this.play(m);
    if (s.winners.length) return { round: m.round, winner: s.winners.length === 1 ? s.winners[0] : null, winners: s.winners, reason: "kinh" };
    if (!Object.keys(m.dealt ?? {}).length || s.draws.length >= MAX_NUMBER) return { round: m.round, winner: null, winners: [], reason: "stop" };
  }

  protected hostPlay(m: Meta) {
    const now = Date.now();
    const s = this.play(m);
    const paused = !!m.paused;
    const c = this.clock;
    if (c.round !== m.round || c.count !== s.draws.length || c.paused !== paused) this.clock = { round: m.round, count: s.draws.length, paused, at: now };
    if (paused) return;
    const due = this.clock.at + (s.draws.length ? paceOf(m.opts) : FIRST_CALL_MS);
    if (now < due) {
      this.wakeAt(due - now);
      return;
    }
    const n = nextNumber(s.drawn);
    if (n != null) this.gossip.set(`g:${m.round}`, { draws: [...s.draws, n] });
  }

  // Vòng lặp chung chỉ chạy mỗi giây nên hẹn giờ riêng cho đúng lúc kêu số kế tiếp.
  private wakeAt(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.react();
    }, ms);
  }

  protected stopped() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  protected onKick(m: Meta, uid: string) {
    if (m.status === "playing" && m.dealt) delete m.dealt[uid];
  }

  protected adExtra(m: Meta): Partial<RoomAd> {
    return { sheets: Object.values(m.claims ?? {}).flat().length };
  }

  protected watch(m: Meta) {
    if (!m.round) return;
    const s = this.play(m);
    const paused = !!m.paused;
    if (this.heard.round !== m.round) {
      // Vào giữa ván hoặc vừa tải lại trang: không rao lại những lần kêu đã qua.
      this.heard = { round: m.round, count: s.draws.length, paused };
      return;
    }
    if (m.status === "playing" && paused !== this.heard.paused) this.system(paused ? "Chủ phòng tạm dừng kêu số" : "Tiếp tục kêu số!");
    this.heard.paused = paused;
    const from = this.heard.count;
    if (s.draws.length <= from) return;
    this.heard.count = s.draws.length;
    const waiting = new Set<string>();
    for (let k = from; k < s.draws.length; k++) {
      const final = k === s.draws.length - 1 && s.winners.length > 0;
      for (const uid of final ? s.winners : s.waits[k]) {
        this.shout(uid, final ? (s.winners.length > 1 ? "Kinh trùng!" : "Kinh!") : shoutFor(uid, m.round, k), `${m.round}:${k}`);
        if (!final) waiting.add(uid);
      }
    }
    const call: LotoCall = {
      round: m.round,
      n: s.draws[s.draws.length - 1],
      count: s.draws.length,
      waiting: [...waiting].map((uid) => this.nameOf(uid)),
      kinh: s.winners.map((uid) => this.nameOf(uid)),
    };
    for (const fn of this.callFns) fn(call);
  }

  private shout(uid: string, text: string, key: string) {
    const p = this.gossip.get<Member>(`p:${uid}`);
    this.pushChat({ id: `shout:${key}:${uid}`, uid, name: p?.name ?? "Ai đó", avatar: p?.avatar ?? "🙂", color: p?.color ?? "var(--sunken)", at: Date.now(), text, shout: true });
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): LotoView {
    const claims = m.claims ?? {};
    const owner = new Array<string | null>(SHEET_COUNT).fill(null);
    for (const [uid, ids] of Object.entries(claims)) for (const id of ids) if (isSheetId(id)) owner[id] = uid;
    const sheets = this.sheets(m);
    const dealt = m.dealt ?? {};
    const state = this.play(m);
    const waiting: Record<string, number> = {};
    if (m.status === "playing") {
      for (const [uid, ids] of Object.entries(dealt)) {
        const rows = waitingRows(sheets, ids, state.drawn).length;
        if (rows) waiting[uid] = rows;
      }
    }
    const uids = new Set([...Object.keys(claims), ...Object.keys(dealt), ...(m.result?.winners ?? [])]);
    const intent = this.myIntent(m);
    return {
      opts: { seed: Number((m.opts as LotoOptions).seed) || 0, interval: paceOf(m.opts) },
      sheets,
      owner,
      mine: claims[this.me] ?? [],
      pending: intent.pending && intent.want ? { pick: intent.want === "play" ? (intent.pick ?? []) : [], ready: intent.want === "play" && intent.ready } : null,
      ready: m.ready ?? [],
      round: m.round,
      dealt,
      state,
      waiting,
      people: Object.fromEntries([...uids].map((uid) => [uid, seatOf(uid)])),
      paused: !!m.paused,
      result: m.status === "ended" && m.result?.round === m.round ? m.result : undefined,
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    const w = r.winners ?? [];
    if (w.length > 1) return `Kinh trùng! ${w.map(name).join(", ")} cùng kinh ván ${r.round}`;
    if (w.length === 1) return `${name(w[0])} kinh ván ${r.round}!`;
    return `Ván ${r.round} dừng — không ai kinh`;
  }

  onCall(fn: (c: LotoCall) => void) {
    this.callFns.add(fn);
    return () => {
      this.callFns.delete(fn);
    };
  }

  pick(ids: number[]) {
    const m = this.meta();
    if (!m || m.status === "playing") return;
    const next = [...new Set(ids)].filter(isSheetId).slice(0, MAX_PICK);
    this.intend(next.length ? "play" : "watch", next);
  }

  setReady(on: boolean) {
    const m = this.meta();
    const mine = m?.claims?.[this.me];
    if (!m || m.status === "playing" || !mine?.length) return;
    this.intend("play", mine, on);
  }

  pause(on: boolean) {
    this.hostEdit((m) => {
      if (m.status !== "playing" || !!m.paused === on) return false;
      m.paused = on;
    });
  }

  setPace(ms: number) {
    if (!PACES.includes(ms)) return;
    this.hostEdit((m) => {
      if (paceOf(m.opts) === ms) return false;
      m.opts = { ...m.opts, interval: ms };
    });
  }

  stop() {
    this.hostEdit((m) => {
      if (m.status !== "playing") return false;
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
    });
  }
}
