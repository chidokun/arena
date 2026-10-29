import {
  carOf,
  cleanText,
  CUSTOM_MIN,
  FINISH_GRACE_MS,
  isCar,
  normOptions,
  normRec,
  roundText,
  standings,
  type TrOptions,
  type TrRec,
  type TrRound,
  type Standing,
} from "../games/typing-race";
import { RoomSession, START_COUNTDOWN_MS, type Member, type Meta, type Result, type SeatView } from "./room";

const ABANDON_MS = 60000;
// Chủ phòng chờ thêm chút sau giờ chót để bản ghi cuối của mọi người kịp tới.
const END_GRACE_MS = 1500;
// Gõ nhanh thì mỗi người cũng chỉ phát tiến độ chừng này một lần.
const SEND_MS = 250;
// Nhanh hơn ~300 WPM liên tục là không phải người gõ: quãng đường bị chặn ở mức này.
const MAX_CPS = 25;
const CAR_KEY = "arena:typing-race:car";

export type TrMatch = {
  round: number;
  opts: TrOptions;
  text: string;
  lineup: SeatView[];
  cars: number[];
  me: number;
  recs: (TrRec | null)[];
  opensAt: number;
  /** Đua theo thời gian: lúc hết giờ (giờ máy mình). */
  endsAt?: number;
  /** Thời gian ván đã chạy lúc chủ phòng chốt kết quả. */
  end?: number;
  final?: Standing[];
  result?: Result;
};

export type TrView = {
  opts: TrOptions;
  /** Văn bản tự nhập cho ván tới — chỉ chủ phòng thấy, người khác chỉ biết đã có hay chưa. */
  draft?: string;
  drafted: number;
  myCar: number;
  match?: TrMatch;
};

export class TypingRaceRoom extends RoomSession<TrView> {
  readonly game = "typing-race";
  private cache: { key: string; text: string } | null = null;
  private opened = { round: -1, at: 0 };
  private outbox: { round: number; rec: TrRec } | null = null;
  private sentAt = 0;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private hailed = -1;
  private car: number | undefined = (() => {
    try {
      const v = Number(localStorage.getItem(CAR_KEY));
      return isCar(v) && localStorage.getItem(CAR_KEY) !== null ? v : undefined;
    } catch {
      return undefined;
    }
  })();

  private textOf(tr: TrRound) {
    const key = `${tr.seed}:${tr.mode}:${tr.length}:${tr.minutes}:${tr.lang}:${tr.level}:${tr.source}:${tr.text ?? ""}`;
    if (this.cache?.key === key) return this.cache.text;
    const text = roundText(tr, tr.seed, tr.text);
    this.cache = { key, text };
    return text;
  }

  private recsOf(m: Meta, total: number) {
    return m.lineup.map((u) => normRec(this.gossip.get(`m:${m.round}:${u}`), total));
  }

  // Đếm ngược tối đa một nhịp để máy chậm giờ không phải chờ lâu hơn.
  private opensAt(m: Meta, tr: TrRound) {
    if (this.opened.round !== m.round) {
      const now = Date.now();
      this.opened = { round: m.round, at: tr.t0 <= now ? tr.t0 : now + Math.min(START_COUNTDOWN_MS, tr.t0 - now) };
    }
    return this.opened.at;
  }

  protected memberExtra(): Partial<Member> {
    return this.car === undefined ? {} : { car: this.car };
  }

  protected begin(m: Meta) {
    const lineup = m.players.filter((u) => this.isOnline(u));
    const opts = normOptions(m.opts);
    if (!lineup.length) return false;
    if (opts.source === "custom" && (m.trText?.length ?? 0) < CUSTOM_MIN) return false;
    m.lineup = lineup;
    m.tr = {
      ...opts,
      seed: crypto.getRandomValues(new Uint32Array(1))[0],
      t0: Date.now() + START_COUNTDOWN_MS,
      ...(opts.source === "custom" ? { text: m.trText } : {}),
    };
    return true;
  }

  protected outcome(m: Meta): Result | undefined {
    if (!m.tr) return { round: m.round, winner: null, winners: [], reason: "stop" };
  }

  /** Bảng xếp hạng lúc chốt: bỏ cuộc / gian lận không tranh hạng, quãng đường nhanh quá sức người bị chặn lại. */
  private rank(m: Meta, tr: TrRound, total: number) {
    const recs = this.recsOf(m, total).map((r) => (r ? { ...r, n: Math.min(r.n, Math.floor((r.at / 1000) * MAX_CPS) + 20) } : r));
    return standings(
      tr.mode,
      recs.map((r) => (r && r.fin != null && r.n < total ? { ...r, fin: undefined } : r)),
      m.lineup.map((u) => this.cheated(m, u)),
    );
  }

  private settle(m: Meta, stopped: boolean) {
    const tr = m.tr!;
    const total = this.textOf(tr).length;
    const elapsed = Math.max(0, Date.now() - tr.t0);
    const final = this.rank(m, tr, total);
    tr.final = final;
    tr.end = tr.mode === "time" ? Math.min(elapsed, tr.minutes * 60000) : elapsed;
    const winners = stopped ? [] : final.filter((s) => s.rank === 1 && s.n > 0).map((s) => m.lineup[s.k]);
    m.status = "ended";
    m.result = { round: m.round, winner: winners.length === 1 ? winners[0] : null, winners, reason: stopped ? "stop" : tr.mode === "chars" ? "solve" : "points" };
  }

  protected hostPlay(m: Meta) {
    const tr = m.tr!;
    const total = this.textOf(tr).length;
    const elapsed = Date.now() - tr.t0;
    const recs = this.recsOf(m, total);
    let over: boolean;
    if (tr.mode === "time") over = elapsed >= tr.minutes * 60000 + END_GRACE_MS;
    else {
      const fins = recs.flatMap((r) => (r?.fin != null ? [r.fin] : []));
      const settled = m.lineup.every((u, k) => recs[k]?.fin != null || recs[k]?.quit || this.cheated(m, u));
      over = settled || (fins.length > 0 && elapsed >= Math.min(...fins) + FINISH_GRACE_MS + END_GRACE_MS);
    }
    if (over) this.settle(m, false);
    else if (m.lineup.every((u) => u !== this.me && this.silentFor(u) >= ABANDON_MS)) this.settle(m, true);
  }

  protected watch(m: Meta) {
    const tr = m.tr;
    if (!tr || tr.mode !== "chars" || m.status !== "playing" || this.hailed === m.round) return;
    const recs = this.recsOf(m, this.textOf(tr).length);
    let first = -1;
    recs.forEach((r, k) => {
      if (r?.fin != null && (first < 0 || r.fin < recs[first]!.fin!)) first = k;
    });
    if (first < 0) return;
    this.hailed = m.round;
    if (m.lineup.length < 2) return;
    // Id cố định theo ván: tải lại trang (khung chat khôi phục từ snapshot) không báo lặp.
    const text = `🏁 ${this.nameOf(m.lineup[first])} về đích đầu tiên! Mọi người còn 60 giây để hoàn thành.`;
    this.pushChat({ id: `tr-win:${m.round}`, uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true });
  }

  protected stopped() {
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): TrView {
    const opts = normOptions(m.opts);
    const view: TrView = {
      opts,
      drafted: m.trText?.length ?? 0,
      myCar: carOf(this.me, this.car),
      ...(m.host === this.me ? { draft: m.trText ?? "" } : {}),
    };
    const tr = m.tr;
    if (!tr || !m.round || !m.lineup.length) return view;
    const text = this.textOf(tr);
    const opensAt = this.opensAt(m, tr);
    const lineup = m.lineup.map(seatOf);
    view.match = {
      round: m.round,
      opts: normOptions(tr),
      text,
      lineup,
      cars: lineup.map((s) => carOf(s.uid, s.uid === this.me ? this.car : s.member?.car)),
      me: m.lineup.indexOf(this.me),
      recs: this.recsOf(m, text.length),
      opensAt,
      ...(tr.mode === "time" ? { endsAt: opensAt + tr.minutes * 60000 } : {}),
      ...(tr.end != null ? { end: tr.end } : {}),
      ...(tr.final ? { final: tr.final } : {}),
      ...(m.status === "ended" && m.result?.round === m.round ? { result: m.result } : {}),
    };
    return view;
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    const w = r.winners ?? [];
    if (r.reason === "stop" || !w.length) return `Ván ${r.round} dừng giữa chừng`;
    if (w.length > 1) return `${w.map(name).join(", ")} đồng hạng nhất ván ${r.round}`;
    return r.reason === "solve" ? `Ván ${r.round} kết thúc — ${name(w[0])} về nhất!` : `Hết giờ — ${name(w[0])} đi xa nhất, thắng ván ${r.round}!`;
  }

  /** Phát tiến độ của mình (gộp các lần gõ sát nhau); về đích / bỏ cuộc / hết giờ thì phát ngay. */
  report(rec: TrRec, now = false) {
    const m = this.meta();
    if (!m || m.status !== "playing" || !m.lineup.includes(this.me)) return;
    this.outbox = { round: m.round, rec };
    const wait = now ? 0 : Math.max(0, SEND_MS - (Date.now() - this.sentAt));
    if (!wait) this.flush();
    else this.sendTimer ??= setTimeout(() => this.flush(), wait);
  }

  private flush() {
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;
    const o = this.outbox;
    this.outbox = null;
    if (!o || this.meta()?.round !== o.round) return;
    this.sentAt = Date.now();
    this.gossip.set(`m:${o.round}:${this.me}`, o.rec);
    this.react();
  }

  /** Bản ghi của mình đã phát (tải lại trang giữa ván thì gõ tiếp từ đây). */
  saved(round: number): TrRec | null {
    const m = this.meta();
    const tr = m?.tr;
    if (!m || !tr || m.round !== round) return null;
    return normRec(this.gossip.get(`m:${round}:${this.me}`), this.textOf(tr).length);
  }

  setCar(car: number) {
    if (!isCar(car)) return;
    this.car = car;
    try {
      localStorage.setItem(CAR_KEY, String(car));
    } catch {}
    this.refresh();
    this.gameStore.invalidate();
  }

  setOptions(next: Partial<TrOptions>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const opts = normOptions({ ...normOptions(m.opts), ...next });
      if (JSON.stringify(opts) === JSON.stringify(normOptions(m.opts))) return false;
      m.opts = { ...m.opts, ...opts };
    });
  }

  setText(raw: string) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const text = cleanText(raw);
      if (text === (m.trText ?? "")) return false;
      if (text) m.trText = text;
      else delete m.trText;
    });
  }

  stop() {
    this.hostEdit((m) => {
      if (m.status !== "playing" || !m.tr) return false;
      this.settle(m, true);
    });
  }
}
