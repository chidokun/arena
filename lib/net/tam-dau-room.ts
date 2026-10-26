// Đề và bảng chấm nằm sẵn trong bản build (đề vòng hiện tại chép trong `meta`), nên ai mở công cụ dev vẫn tra ra được —
// chỉ giao diện là giữ kín: câu trả lời của người khác lộ khi mọi người đã khoá, đáp án lộ ở bước xem lời giải.
import {
  BLANK,
  CARDS_OPENED,
  COUNTDOWN_MS,
  grade,
  loadBank,
  MAX_PLAYERS,
  normAnswers,
  normOptions,
  normVerdict,
  pickDes,
  pickerAt,
  poolOf,
  ROUNDS,
  shuffle,
  standings,
  TIMES,
  type Answer,
  type De,
  type Graded,
  type Mode,
  type Stage,
  type Standing,
  type TdOptions,
  type TdRound,
  type Verdict,
} from "../games/tam-dau";
import { RoomSession, type Meta, type Result, type SeatView } from "./room";

// Im lặng quá lâu thì cả bàn thôi chờ người đó (câu trả lời đang có được chốt hộ); quay lại vẫn chơi tiếp được.
const AWAY_MS = 20000;
// Người tới lượt mở thẻ đã rời / bị mời ra thì chờ chừng này rồi mở ngẫu nhiên hộ.
const ABSENT_PICK_MS = 3000;
// Hết giờ thì chủ phòng chờ thêm chút (lệch đồng hồ, tin còn trên đường) rồi mới chốt hộ.
const GRACE_MS = 2500;
const USED_MAX = 240;

// Bản nháp của từng người (`m:<ván>:<uid>`, chỉ chủ nhân ghi được) — chỉ giữ vòng đang chơi. `p` là thẻ muốn mở:
// [vòng, lượt mở thứ mấy trong vòng, thẻ].
type Draft = { v: number; a?: Answer[]; j?: Verdict; la?: boolean; lj?: boolean; nx?: boolean; p?: [number, number, number] };
// Câu trả lời đã chốt do chủ phòng ghi nhận (`g:<ván>`), theo vòng: đã chốt thì không đổi nữa.
type Board = { ans: Record<string, Record<number, Answer[]>>; jud: Record<string, Record<number, Verdict>> };

export type TdSeat = { seat: SeatView; out: boolean; away: boolean; locked: boolean; next: boolean; halves: number; rounds: (number | null)[] };

export type TdPast = { v: number; de?: De; cards: number[]; graded: Record<string, Graded> };

export type TdMatch = {
  round: number;
  opts: TdOptions;
  v: number;
  stage: Stage;
  de: De;
  cards: number[];
  // Người tới lượt mở thẻ (chỉ số trong `lineup`), -1 nếu không phải lúc mở thẻ.
  picker: number;
  lineup: TdSeat[];
  me: number;
  opensAt: number;
  // 0 = không giới hạn.
  deadline: number;
  stageMs: number;
  mine: { answers: Answer[]; verdict: Verdict; la: boolean; lj: boolean; nx: boolean; pick: number };
  // Câu trả lời của cả bàn: lộ khi mọi người đã khoá phần nhận diện; đánh giá nhận định lộ ở bước xem lời giải.
  answers: Record<string, Answer[]> | null;
  verdicts: Record<string, Verdict> | null;
  graded: Record<string, Graded> | null;
  past: TdPast[];
  rows: Standing[] | null;
  result?: Result;
};

export type TdView = { opts: TdOptions; pool: number | null; used: number; match?: TdMatch };

const emptyDraft = (v: number): Draft => ({ v });

export class TamDauRoom extends RoomSession<TdView> {
  readonly game = "citta-challenge";
  private banks = new Map<Mode, De[]>();
  private loading = new Set<Mode>();
  private mine: (Draft & { round: number }) | null = null;
  private opened = { round: -1, at: 0 };
  private stageSeen = { key: "", seen: 0, at: 0 };
  private told = { round: -1, cards: "", stage: "" };

  private need(mode: Mode) {
    if (this.banks.has(mode) || this.loading.has(mode)) return;
    this.loading.add(mode);
    loadBank(mode)
      .then((list) => {
        this.banks.set(mode, list);
        this.refreshViews();
        this.react();
      })
      .catch(() => {})
      .finally(() => this.loading.delete(mode));
  }

  private deOf(td: TdRound, v: number) {
    return v === td.v ? td.de : this.banks.get(td.mode)?.find((d) => d.id === td.ids[v]);
  }

  private board(m: Meta): Board {
    const b = this.gossip.get<Partial<Board>>(`g:${m.round}`);
    return {
      ans: b?.ans && typeof b.ans === "object" ? structuredClone(b.ans) : {},
      jud: b?.jud && typeof b.jud === "object" ? structuredClone(b.jud) : {},
    };
  }

  private draftOf(m: Meta, uid: string): Draft | undefined {
    if (uid === this.me && this.mine?.round === m.round) return this.mine;
    const d = this.gossip.get<Draft>(`m:${m.round}:${uid}`);
    return d && typeof d === "object" && d.v === m.td?.v ? d : undefined;
  }

  private myDraft(m: Meta): Draft {
    const v = m.td!.v;
    if (this.mine?.round === m.round && this.mine.v === v) return this.mine;
    const saved = this.gossip.get<Draft>(`m:${m.round}:${this.me}`);
    this.mine = { ...(saved && saved.v === v ? saved : emptyDraft(v)), round: m.round };
    return this.mine;
  }

  private saveMine(m: Meta, eager: boolean) {
    const { round, ...draft } = this.mine!;
    if (round !== m.round) return;
    this.gossip.set(`m:${m.round}:${this.me}`, draft, eager);
    this.gameStore.invalidate();
    this.react();
  }

  private out(m: Meta, uid: string) {
    return m.kicked.includes(uid) || this.cheated(m, uid);
  }

  private away(m: Meta, uid: string) {
    return uid !== this.me && this.silentFor(uid) >= AWAY_MS;
  }

  // Còn phải chờ người này thao tác không.
  private waitFor(m: Meta, uid: string) {
    return !this.out(m, uid) && !this.away(m, uid);
  }

  private local(at: number, ms: number) {
    const now = Date.now();
    return at <= now ? at : now + Math.min(ms, at - now);
  }

  private opensAt(m: Meta) {
    if (this.opened.round !== m.round) this.opened = { round: m.round, at: this.local(m.td!.t0, COUNTDOWN_MS) };
    return this.opened.at;
  }

  private stageMs(td: TdRound) {
    if (!td.timer) return 0;
    const t = TIMES[td.mode];
    return (td.stage === "pick" ? t.pick : td.stage === "answer" ? t.answer : td.stage === "judge" ? t.judge : 0) * 1000;
  }

  /** Hạn chót theo giờ máy mình: đồng hồ hai máy khớp nhau thì dùng giờ chủ phòng, lệch nhiều thì tính từ lúc thấy. */
  private deadlineOf(m: Meta) {
    const td = m.td!;
    const ms = this.stageMs(td);
    if (!ms) return 0;
    const key = `${m.round}:${td.v}:${td.stage}:${td.cards.length}`;
    if (this.stageSeen.key !== key) {
      const seen = Date.now();
      this.stageSeen = { key, seen, at: td.at >= seen - ms - 3000 && td.at <= seen + 3000 ? td.at : seen };
    }
    return Math.max(this.stageSeen.at, this.opensAt(m)) + ms;
  }

  protected tidy(m: Meta) {
    const opts = normOptions(m.opts);
    if (JSON.stringify(m.opts) !== JSON.stringify(opts)) m.opts = opts;
  }

  protected begin(m: Meta) {
    const opts = normOptions(m.opts);
    const bank = this.banks.get(opts.mode);
    const players = m.players.filter((u) => this.isOnline(u)).slice(0, MAX_PLAYERS);
    if (!bank || !players.length) return false;
    const used = m.tdUsed ?? [];
    const ids = pickDes(bank, opts.topics, used, Math.random);
    if (!ids) return false;
    const now = Date.now();
    m.lineup = shuffle(players, Math.random);
    m.td = { ...opts, ids, v: 0, de: bank.find((d) => d.id === ids[0])!, stage: "pick", cards: [], hist: [], at: now + COUNTDOWN_MS, t0: now + COUNTDOWN_MS };
    m.tdUsed = [...used.filter((id) => !ids.includes(id)), ...ids].slice(-USED_MAX);
    return true;
  }

  private graded(m: Meta, b: Board, v: number, cards: number[]) {
    const td = m.td!;
    const de = this.deOf(td, v);
    if (!de) return null;
    return Object.fromEntries(m.lineup.map((u) => [u, grade(de, td.mode, cards, b.ans[u]?.[v], b.jud[u]?.[v])]));
  }

  // Điểm từng vòng đã chấm của mỗi người (null = vòng chưa xong hoặc chưa tải được đề).
  private scores(m: Meta, b: Board) {
    const td = m.td!;
    const done = td.stage === "done" ? ROUNDS : td.stage === "review" ? td.v + 1 : td.v;
    const per = Array.from({ length: done }, (_, v) => this.graded(m, b, v, v < td.hist.length ? td.hist[v] : td.cards));
    return Object.fromEntries(m.lineup.map((u) => [u, per.map((g) => (g ? g[u].halves : null))]));
  }

  private final(m: Meta, b: Board): Standing[] | null {
    const s = this.scores(m, b);
    if (Object.values(s).some((r) => r.some((h) => h === null))) return null;
    const rows = standings(m.lineup.filter((u) => !this.cheated(m, u)).map((u) => ({ uid: u, rounds: s[u] as number[] })));
    return [...rows, ...m.lineup.filter((u) => this.cheated(m, u)).map((u) => ({ uid: u, halves: 0, perfect: 0, rank: 0 }))];
  }

  protected outcome(m: Meta): Result | undefined {
    const td = m.td;
    if (!td) return { round: m.round, winner: null, winners: [], reason: "stop" };
    if (m.lineup.every((u) => this.out(m, u))) return { round: m.round, winner: null, winners: [], reason: m.lineup.some((u) => this.cheated(m, u)) ? "cheat" : "stop" };
    if (td.stage !== "done") return;
    const rows = this.final(m, this.board(m));
    if (!rows) return;
    const winners = rows.filter((r) => r.rank === 1).map((r) => r.uid);
    return { round: m.round, winner: winners.length === 1 ? winners[0] : null, winners, reason: "points" };
  }

  protected hostPlay(m: Meta) {
    const td = m.td!;
    const now = Date.now();
    if (now < td.t0) return;
    const b = this.board(m);
    let dirty = false;
    const freeze = (u: string, kind: "ans" | "jud") => {
      const d = this.draftOf(m, u);
      const n = td.de.items.length;
      (b[kind][u] ??= {})[td.v] = kind === "ans" ? normAnswers(d?.a, n) : normVerdict(d?.j);
      dirty = true;
    };
    const ms = this.stageMs(td);
    const late = ms > 0 && now >= td.at + ms + GRACE_MS;

    if (td.stage === "pick") {
      const k = pickerAt(td.v, td.cards.length, m.lineup.length);
      const uid = m.lineup[k];
      const want = this.draftOf(m, uid)?.p;
      let card = -1;
      if (want && want[0] === td.v && want[1] === td.cards.length && want[2] >= 0 && want[2] < 4 && !td.cards.includes(want[2])) card = want[2];
      else if (late || (!this.waitFor(m, uid) && now >= td.at + ABSENT_PICK_MS)) {
        const left = [0, 1, 2, 3].filter((c) => !td.cards.includes(c));
        card = left[Math.floor(Math.random() * left.length)];
      }
      if (card >= 0) {
        td.cards = [...td.cards, card];
        td.at = now;
        if (td.cards.length >= CARDS_OPENED) td.stage = "answer";
      }
    } else if (td.stage === "answer" || td.stage === "judge") {
      const kind = td.stage === "answer" ? "ans" : "jud";
      for (const u of m.lineup) {
        if (b[kind][u]?.[td.v]) continue;
        const d = this.draftOf(m, u);
        if ((kind === "ans" ? d?.la : d?.lj) || late) freeze(u, kind);
      }
      if (m.lineup.every((u) => b[kind][u]?.[td.v] || !this.waitFor(m, u))) {
        for (const u of m.lineup) if (!b[kind][u]?.[td.v]) freeze(u, kind);
        td.stage = td.stage === "answer" ? "judge" : "review";
        td.at = now;
      }
    } else if (td.stage === "review") {
      if (m.lineup.every((u) => this.draftOf(m, u)?.nx || !this.waitFor(m, u))) this.advance(m);
    }
    if (dirty) this.gossip.set(`g:${m.round}`, b);
  }

  // Sang vòng sau (hoặc xong ván ở vòng cuối). Chưa tải xong bộ đề thì đợi.
  private advance(m: Meta) {
    const td = m.td!;
    if (td.v >= ROUNDS - 1) {
      td.stage = "done";
      return true;
    }
    const de = this.deOf(td, td.v + 1);
    if (!de) return false;
    td.hist = [...td.hist, td.cards];
    td.v += 1;
    td.de = de;
    td.cards = [];
    td.stage = "pick";
    td.at = Date.now();
    return true;
  }

  protected watch(m: Meta) {
    this.need(normOptions(m.opts).mode);
    const td = m.td;
    if (!td) return;
    this.need(td.mode);
    if (m.status !== "playing") return;
    const r = m.round;
    // Vào giữa ván thì không rao lại diễn biến cũ (tải lại trang thì khung chat đã khôi phục từ snapshot).
    if (this.told.round !== r) this.told = { round: r, cards: `${td.v}:${td.cards.join(",")}`, stage: `${td.v}:${td.stage}` };
    const cards = `${td.v}:${td.cards.join(",")}`;
    if (cards !== this.told.cards && td.cards.length) {
      const c = td.cards[td.cards.length - 1];
      const who = m.lineup[pickerAt(td.v, td.cards.length - 1, m.lineup.length)];
      this.say(`td-card:${r}:${td.v}:${td.cards.length}`, `🃏 ${who === this.me ? "Bạn" : this.nameOf(who)} mở thẻ T${c + 1} — ${td.de.cards[c].label}`);
    }
    this.told.cards = cards;
    const stage = `${td.v}:${td.stage}`;
    if (stage !== this.told.stage) {
      if (td.stage === "pick") this.say(`td-round:${r}:${td.v}`, `🪷 Vòng ${td.v + 1}/${ROUNDS}: “${td.de.title}”`);
      if (td.stage === "judge") this.say(`td-judge:${r}:${td.v}`, `🔒 Cả bàn đã khoá phần nhận diện — tới lượt kiểm tra nhận định`);
      if (td.stage === "review") this.say(`td-review:${r}:${td.v}`, `📖 Vòng ${td.v + 1} đã chấm — cùng xem lời giải nhé`);
    }
    this.told.stage = stage;
  }

  private say(id: string, text: string) {
    this.pushChat({ id, uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true });
  }

  protected adExtra(m: Meta) {
    return m.status === "playing" ? { players: m.lineup.length } : {};
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): TdView {
    const opts = normOptions(m.opts);
    this.need(opts.mode);
    const bank = this.banks.get(opts.mode);
    const base: TdView = {
      opts,
      pool: bank ? poolOf(bank, opts.topics).length : null,
      used: bank ? (m.tdUsed ?? []).filter((id) => bank.some((d) => d.id === id)).length : 0,
    };
    const td = m.td;
    if (!td || !m.round || !m.lineup.length) return base;
    this.need(td.mode);
    const b = this.board(m);
    const me = m.lineup.indexOf(this.me);
    const live = m.status === "playing";
    const draft = me >= 0 && live ? this.myDraft(m) : undefined;
    const n = td.de.items.length;
    const frozen = (u: string, kind: "ans" | "jud") => !!b[kind][u]?.[td.v];
    const scores = this.scores(m, b);
    const showAns = td.stage === "judge" || td.stage === "review" || td.stage === "done" || !live;
    const showJud = td.stage === "review" || td.stage === "done" || !live;
    const reviewed = td.stage === "review" || td.stage === "done";
    const ended = m.status === "ended" && m.result?.round === m.round;
    const past: TdPast[] = td.hist.map((cards, v) => ({ v, de: this.deOf(td, v), cards, graded: this.graded(m, b, v, cards) ?? {} }));
    if (td.stage === "done") past.push({ v: td.v, de: td.de, cards: td.cards, graded: this.graded(m, b, td.v, td.cards) ?? {} });
    const myAns = b.ans[this.me]?.[td.v] ?? normAnswers(draft?.a, n);
    const myJud = b.jud[this.me]?.[td.v] ?? normVerdict(draft?.j);
    const pick = draft?.p && draft.p[0] === td.v && draft.p[1] === td.cards.length ? draft.p[2] : -1;
    return {
      ...base,
      match: {
        round: m.round,
        opts: { mode: td.mode, topics: td.topics, timer: td.timer },
        v: td.v,
        stage: td.stage,
        de: td.de,
        cards: td.cards,
        picker: live && td.stage === "pick" ? pickerAt(td.v, td.cards.length, m.lineup.length) : -1,
        lineup: m.lineup.map((u) => {
          const d = this.draftOf(m, u);
          const locked = td.stage === "answer" ? frozen(u, "ans") || !!d?.la : td.stage === "judge" ? frozen(u, "jud") || !!d?.lj : false;
          const rounds = scores[u] ?? [];
          return {
            seat: seatOf(u),
            out: this.out(m, u),
            away: live && this.away(m, u),
            locked,
            next: td.stage === "review" && !!d?.nx,
            halves: rounds.reduce<number>((s, h) => s + (h ?? 0), 0),
            rounds,
          };
        }),
        me,
        opensAt: this.opensAt(m),
        deadline: live ? this.deadlineOf(m) : 0,
        stageMs: this.stageMs(td),
        mine: {
          answers: myAns,
          verdict: myJud,
          la: frozen(this.me, "ans") || !!draft?.la,
          lj: frozen(this.me, "jud") || !!draft?.lj,
          nx: !!draft?.nx,
          pick,
        },
        answers: showAns ? Object.fromEntries(m.lineup.map((u) => [u, b.ans[u]?.[td.v] ?? normAnswers(undefined, n)])) : null,
        verdicts: showJud ? Object.fromEntries(m.lineup.map((u) => [u, b.jud[u]?.[td.v] ?? normVerdict(undefined)])) : null,
        graded: reviewed && td.cards.length >= CARDS_OPENED ? this.graded(m, b, td.v, td.cards) : null,
        past,
        rows: ended || td.stage === "done" ? this.final(m, b) : null,
        result: ended ? m.result : undefined,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    if (r.reason === "cheat") return `Ván ${r.round} dừng — người chơi bị xử thua vì gian lận`;
    if (r.reason !== "points") return `Ván ${r.round} dừng giữa chừng`;
    const m = this.meta();
    const rows = m?.td ? this.final(m, this.board(m)) : null;
    const top = rows?.[0];
    const pts = top ? ` với ${(top.halves / 2).toLocaleString("vi-VN")}/${ROUNDS * 5} điểm` : "";
    if (m && m.lineup.length === 1) return `🪷 ${name(m.lineup[0])} hoàn thành ${ROUNDS} vòng${pts}`;
    const w = r.winners ?? [];
    if (!w.length) return `Ván ${r.round} kết thúc`;
    return w.length > 1 ? `🤝 ${w.map(name).join(", ")} đồng hạng nhất ván ${r.round}${pts}` : `🏆 ${name(w[0])} thắng ván ${r.round}${pts}`;
  }

  private playing() {
    const m = this.meta();
    if (!m?.td || m.status !== "playing" || !m.lineup.includes(this.me) || this.out(m, this.me) || Date.now() < this.opensAt(m)) return null;
    return m;
  }

  pick(card: number) {
    const m = this.playing();
    if (!m) return;
    const td = m.td!;
    if (td.stage !== "pick" || td.cards.includes(card) || m.lineup[pickerAt(td.v, td.cards.length, m.lineup.length)] !== this.me) return;
    const d = this.myDraft(m);
    d.p = [td.v, td.cards.length, card];
    this.saveMine(m, true);
  }

  setAnswer(i: number, patch: Partial<Answer>) {
    const m = this.playing();
    if (!m || m.td!.stage !== "answer") return;
    const d = this.myDraft(m);
    if (d.la) return;
    const list = normAnswers(d.a, m.td!.de.items.length);
    list[i] = { ...(list[i] ?? BLANK), ...patch };
    d.a = list;
    this.saveMine(m, false);
  }

  lockAnswers() {
    const m = this.playing();
    if (!m || m.td!.stage !== "answer") return;
    const d = this.myDraft(m);
    if (d.la || normAnswers(d.a, m.td!.de.items.length).some((x) => x.a < 0 || x.e < 0)) return;
    d.la = true;
    this.saveMine(m, true);
  }

  setVerdict(patch: Partial<Verdict>) {
    const m = this.playing();
    if (!m || m.td!.stage !== "judge") return;
    const d = this.myDraft(m);
    if (d.lj) return;
    d.j = { ...normVerdict(d.j), ...patch };
    this.saveMine(m, false);
  }

  lockVerdict() {
    const m = this.playing();
    if (!m || m.td!.stage !== "judge") return;
    const d = this.myDraft(m);
    const j = normVerdict(d.j);
    if (d.lj || j.v < 0 || j.e < 0) return;
    d.lj = true;
    this.saveMine(m, true);
  }

  proceed() {
    const m = this.playing();
    if (!m || m.td!.stage !== "review") return;
    const d = this.myDraft(m);
    if (d.nx) return;
    d.nx = true;
    this.saveMine(m, true);
  }

  /** Chủ phòng cho cả bàn sang vòng sau mà không chờ ai bấm tiếp tục. */
  skip() {
    this.hostEdit((m) => {
      if (m.status !== "playing" || m.td?.stage !== "review") return false;
      return this.advance(m);
    });
  }

  setOptions(next: Partial<TdOptions>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const cur = normOptions(m.opts);
      // Đổi mode thì chọn lại toàn bộ chủ đề của mode mới.
      const opts = normOptions({ ...cur, ...next, ...(next.mode && next.mode !== cur.mode && !next.topics ? { topics: [] } : {}) });
      if (JSON.stringify(opts) === JSON.stringify(cur)) return false;
      m.opts = opts;
    });
  }

  resetUsed() {
    this.hostEdit((m) => {
      if (!m.tdUsed?.length) return false;
      m.tdUsed = [];
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
