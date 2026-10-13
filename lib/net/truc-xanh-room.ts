/**
 * Phòng Trúc Xanh: không giới hạn ghế, một người cũng chơi được. Bắt đầu ván, chủ phòng xáo thứ tự lượt (đội hình) và
 * chốt `meta.tx` (seed, cỡ bàn, mã tranh ẩn, giờ mở bàn) — mọi máy tự sinh cùng một bàn từ seed. Người chơi chỉ nối nước
 * của mình (lật ô, lời đoán) vào `m:<ván>:<uid>`; máy chủ phòng xét các nước mới theo thứ tự mình thấy (`judge`), thêm
 * mốc qua lượt / hết giờ đoán rồi ghi bàn chung `g:<ván>` — ô nào đã lật được, tới lượt ai, ai đoán gì, ai thắng đều suy
 * ra tất định từ bàn chung.
 *
 * Lời đoán gửi từ ô đoán dưới tranh, khung chat chỉ để thảo luận (người chơi lỡ gõ đúng đáp án vào chat thì tính là lời
 * đoán, không gửi lên chat). Chấm xong mỗi máy tự chép kết quả vào khung chat như tin của người đoán: sai — ô tím kèm lời
 * đoán; gần đúng — chỉ người đoán thấy; đúng — ô xanh, hết ván.
 *
 * Tranh và từ khoá nằm sẵn trong bản build (mã tranh công khai trong `meta`), nên ai mở công cụ dev vẫn tra ra được — chỉ
 * giao diện là giữ kín tới hết ván.
 */
import {
  canFlip,
  COUNTDOWN_MS,
  emptyBoard,
  FINAL_MS,
  GUESS_LEN,
  GUESS_MAX,
  guessesIn,
  isAnswer,
  judge,
  MIN_PLAYERS,
  normOptions,
  optimistic,
  LEVELS,
  pickPicture,
  pictureOf,
  replay,
  TURN_MS,
  usedId,
  usedOf,
  type Board,
  type Level,
  type SizeKey,
  type TxOptions,
  type TxRound,
  type TxState,
} from "../games/truc-xanh";
import { RoomSession, type Member, type Meta, type Result, type SeatView, type StickerId } from "./room";

/** Cả đội hình mất kết nối chừng này thì dừng ván. */
const ABANDON_MS = 60000;

export type GuessState = "wait" | "wrong" | "near" | "right";

export type TxMatch = {
  round: number;
  size: SizeKey;
  level: Level;
  /** Thứ tự lượt. */
  lineup: SeatView[];
  /** Thứ tự của mình trong đội hình; -1 nếu chỉ xem. */
  me: number;
  state: TxState;
  /** Ảnh tranh ẩn. */
  img: string;
  /** Từ khoá — chỉ có khi đã hết ván. */
  answer?: string;
  /** Các ô mình thấy đang ngửa: ô ngửa trên bàn chung cộng ô mình vừa lật đang chờ chủ phòng ghi nhận. */
  open: number[];
  /** Lời đoán của mình và kết quả chấm. */
  guesses: { text: string; state: GuessState }[];
  /** Giờ máy mình lúc mở bàn (hết đếm ngược). */
  opensAt: number;
  /** Hạn chót theo giờ máy mình: hết lượt hiện tại, hoặc hết giờ đoán khi đã lật hết bàn. */
  deadline: number;
  result?: Result;
};

export type TxView = {
  /** Luật cho ván tới. */
  opts: TxOptions;
  /** Ván hiện tại hoặc vừa xong; undefined khi chưa chơi ván nào. */
  match?: TxMatch;
  /** Số tranh đã chơi / cả bộ của mức khó đang chọn cho ván tới. */
  pics: { used: number; total: number };
};

export class TrucXanhRoom extends RoomSession<TxView> {
  readonly game = "truc-xanh";
  /** Trạng thái dựng gần nhất — nhật ký chỉ dài thêm nên dựng tiếp từ đây thay vì từ đầu. */
  private cache: { round: number; seed: number; tail: string; state: TxState } | null = null;
  private opened = { round: -1, at: 0 };
  private stageSeen = { key: "", at: 0 };
  /** Đã rao tới dòng nhật ký / lời đoán thứ mấy của ván nào. */
  private told = { round: -1, log: 0, guesses: 0 };

  private board(m: Meta): Board {
    const b = this.gossip.get<Board>(`g:${m.round}`);
    return b && Array.isArray(b.log) && Array.isArray(b.seen) ? b : emptyBoard(m.lineup.length);
  }

  private movesOf(m: Meta, uid: string): unknown[] {
    const list = this.gossip.get<{ moves?: unknown }>(`m:${m.round}:${uid}`)?.moves;
    return Array.isArray(list) ? list : [];
  }

  private stateOf(m: Meta, tx: TxRound) {
    const log = this.board(m).log;
    const c = this.cache;
    // Chỉ dựng tiếp khi nhật ký mới vẫn bắt đầu bằng phần đã dựng (chủ phòng mới tiếp quản có thể ghi khác đi).
    const same = c && c.round === m.round && c.seed === tx.seed && c.state.count <= log.length && c.tail === JSON.stringify(log[c.state.count - 1]);
    const state = replay(tx, m.lineup.length, log, same ? c.state : undefined);
    this.cache = { round: m.round, seed: tx.seed, tail: JSON.stringify(log[state.count - 1]), state };
    return state;
  }

  /**
   * Giờ máy mình lúc mở bàn: lần đầu thấy ván thì đếm ngược phần còn lại theo giờ chủ phòng, tối đa một nhịp đếm ngược;
   * vào giữa ván (tải lại trang) thì chơi ngay.
   */
  private opensAt(m: Meta, tx: TxRound) {
    if (this.opened.round !== m.round) {
      const now = Date.now();
      this.opened = { round: m.round, at: tx.t0 <= now ? tx.t0 : now + Math.min(COUNTDOWN_MS, tx.t0 - now) };
    }
    return this.opened.at;
  }

  /** Hạn chót theo giờ máy mình: đồng hồ hai máy khớp nhau thì dùng luôn giờ chủ phòng, lệch nhiều thì tính từ lúc thấy. */
  private deadlineOf(m: Meta, s: TxState) {
    const [since, ms] = s.cleared ? [s.cleared, FINAL_MS] : [s.since, TURN_MS];
    const key = `${m.round}:${since}`;
    if (this.stageSeen.key !== key) this.stageSeen = { key, at: Date.now() };
    const at = this.stageSeen.at;
    return at >= since - 3000 - COUNTDOWN_MS && at <= since + ms + 3000 ? since + ms : at + ms;
  }

  // ---------- luật ----------

  protected begin(m: Meta) {
    const players = m.players.filter((u) => this.isOnline(u));
    if (players.length < MIN_PLAYERS) return false;
    // Thứ tự lượt xáo ngẫu nhiên mỗi ván.
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j], players[i]];
    }
    const opts = normOptions(m.opts);
    const used = m.txUsed ?? [];
    const pic = pickPicture(used, opts.level, Math.random);
    m.lineup = players;
    m.tx = { ...opts, seed: crypto.getRandomValues(new Uint32Array(1))[0], pic, t0: Date.now() + COUNTDOWN_MS };
    // Chơi hết bộ tranh của mức này thì đếm lại từ đầu (bộ của mức kia giữ nguyên).
    const full = usedOf(used, opts.level).length >= LEVELS[opts.level].pictures.length;
    m.txUsed = [...(full ? this.otherLevels(used, opts.level) : used), usedId(opts.level, pic)];
    return true;
  }

  protected outcome(m: Meta): Result | undefined {
    if (!m.tx) return { round: m.round, winner: null, winners: [], reason: "stop" };
    const s = this.stateOf(m, m.tx);
    if (!s.over) return;
    const winner = s.winner >= 0 ? m.lineup[s.winner] : null;
    return { round: m.round, winner, winners: winner ? [winner] : [], reason: "guess" };
  }

  /** Chủ phòng phân xử các nước mới, cho qua lượt / hết giờ đoán; cả đội hình bỏ đi thì dừng ván. */
  protected hostPlay(m: Meta) {
    const tx = m.tx!;
    const online = (u: string) => !m.kicked.includes(u) && this.isOnline(u);
    const next = judge(
      tx,
      m.lineup.map((u) => this.movesOf(m, u)),
      this.board(m),
      { now: Date.now(), online: (k) => online(m.lineup[k]) },
      this.stateOf(m, tx),
    );
    if (next) this.gossip.set(`g:${m.round}`, next);
    if (m.lineup.every((u) => u !== this.me && this.silentFor(u) >= ABANDON_MS)) {
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
    }
  }

  /** Mọi máy: chép lời đoán, mất lượt, lật hết bàn vào khung chat — id cố định nên tải lại trang không rao lặp. */
  protected watch(m: Meta) {
    if (!m.tx || m.status !== "playing") return;
    const s = this.stateOf(m, m.tx);
    const log = this.board(m).log;
    // Vào giữa ván thì không rao lại diễn biến cũ (tải lại trang thì khung chat đã khôi phục từ snapshot).
    if (this.told.round !== m.round) this.told = { round: m.round, log: log.length, guesses: s.guesses.length };
    const r = m.round;
    const who = (k: number) => (m.lineup[k] === this.me ? "Bạn" : this.nameOf(m.lineup[k]));
    // Lượt đã qua: chỉ rao mất lượt (hết giờ, vắng mặt) — lật trật thì cả phòng đã thấy trên bàn.
    let turn = 0;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (!Array.isArray(e)) continue;
      if (e[0] === 2 && i >= this.told.log && (e[1] === 1 || e[1] === 2)) {
        const k = turn % m.lineup.length;
        this.say(`tx-pass:${r}:${i}`, e[1] === 1 ? `⏰ ${who(k)} hết giờ — mất lượt` : `🚪 ${who(k)} vắng mặt — bỏ qua lượt`);
      }
      if (e[0] === 2) turn++;
    }
    if (s.cleared) this.say(`tx-clear:${r}`, `🖼️ Đã lật hết bàn — còn ${FINAL_MS / 1000} giây để đoán tranh!`);
    this.told.log = log.length;
    // Lời đoán: sai — công khai (ô tím); gần đúng — chỉ người đoán thấy; đúng — ô xanh.
    for (let i = this.told.guesses; i < s.guesses.length; i++) {
      const g = s.guesses[i];
      const uid = m.lineup[g.k];
      const mine = uid === this.me;
      if (g.near && !mine) continue;
      const p = this.gossip.get<Member>(`p:${uid}`);
      this.pushChat({
        id: `tx-g:${r}:${i}`,
        uid,
        name: p?.name ?? "Ai đó",
        avatar: p?.avatar ?? "",
        color: p?.color ?? "",
        at: Date.now(),
        text: g.right ? `🎯 ${g.text}` : g.text,
        guess: g.right ? "right" : g.near ? "near" : "wrong",
        ...(g.near ? { local: true } : {}),
      });
    }
    this.told.guesses = s.guesses.length;
  }

  private say(id: string, text: string) {
    this.pushChat({ id, uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true });
  }

  protected adExtra(m: Meta) {
    return m.status === "playing" ? { players: m.lineup.length } : {};
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): TxView {
    const opts = normOptions(m.opts);
    const base: TxView = { opts, pics: { used: usedOf(m.txUsed ?? [], opts.level).length, total: LEVELS[opts.level].pictures.length } };
    const tx = m.tx;
    const pic = tx && pictureOf(tx);
    if (!tx || !pic || !m.round || !m.lineup.length) return base;
    const state = this.stateOf(m, tx);
    const me = m.lineup.indexOf(this.me);
    const live = m.status === "playing" && !state.over;
    const moves = me >= 0 ? this.movesOf(m, this.me) : [];
    const pending = live ? moves.slice(this.board(m).seen[me] ?? 0) : [];
    // Lời đoán của mình theo thứ tự gửi; chủ phòng ghi nhận theo đúng thứ tự đó.
    const judged = state.guesses.filter((g) => g.k === me);
    const guesses = guessesIn(moves).map((text, i): TxMatch["guesses"][number] => {
      const g = judged[i];
      return { text, state: !g ? "wait" : g.right ? "right" : g.near ? "near" : "wrong" };
    });
    return {
      ...base,
      match: {
        round: m.round,
        size: tx.size,
        level: normOptions(tx).level,
        lineup: m.lineup.map(seatOf),
        me,
        state,
        img: pic.img,
        answer: m.status === "ended" || state.over ? pic.w : undefined,
        open: optimistic(state, me, pending),
        guesses,
        opensAt: this.opensAt(m, tx),
        deadline: this.deadlineOf(m, state),
        result: m.status === "ended" && m.result?.round === m.round ? m.result : undefined,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    if (r.reason !== "guess") return `Ván ${r.round} dừng giữa chừng`;
    const m = this.meta();
    const answer = m?.tx ? pictureOf(m.tx)?.w : undefined;
    const reveal = answer ? ` — đáp án là “${answer}”` : "";
    return r.winner ? `🏆 ${name(r.winner)} đoán trúng tranh, thắng ván ${r.round}${reveal}!` : `Ván ${r.round} kết thúc, không ai đoán ra${reveal}`;
  }

  // ---------- hành động ----------

  /** Ván đang chơi mà mình là người chơi và bàn đã mở. */
  private playable() {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || m.status !== "playing" || !g || g.round !== m.round || g.me < 0 || g.state.over || Date.now() < g.opensAt) return null;
    return { m, g };
  }

  private push(m: Meta, move: unknown[]) {
    this.gossip.set(`m:${m.round}:${this.me}`, { moves: [...this.movesOf(m, this.me), move] });
    this.react();
  }

  /** Lật ô `cell` (đang tới lượt mình, chưa ngửa đủ hai ô). Trả về false nếu không lật được. */
  flip(cell: number): boolean {
    const p = this.playable();
    if (!p) return false;
    const { g } = p;
    const s = g.state;
    if (s.current !== g.me || !canFlip(s, cell, g.open)) return false;
    this.push(p.m, ["f", cell, s.turn]);
    return true;
  }

  /** Gửi một lời đoán (bất cứ lúc nào trong ván). Kết quả hiện trong khung chat khi chủ phòng chấm xong. */
  guess(text: string): boolean {
    const p = this.playable();
    const t = text.trim().slice(0, GUESS_LEN);
    if (!p || !t) return false;
    if (guessesIn(this.movesOf(p.m, this.me)).length >= GUESS_MAX) {
      this.say(`tx-max:${p.m.round}`, `✋ Mỗi ván đoán tối đa ${GUESS_MAX} lần`);
      return false;
    }
    this.push(p.m, ["g", t]);
    return true;
  }

  /**
   * Khung chat để thảo luận. Người chơi gõ trúng đáp án vào chat thì tính là lời đoán (không gửi lên chat); người xem gõ
   * trúng đáp án thì không gửi, để khỏi lộ cho người chơi.
   */
  send(content: { text: string } | { sticker: StickerId }): boolean | void {
    const m = this.meta();
    const pic = m?.tx && m.status === "playing" ? pictureOf(m.tx) : undefined;
    if ("text" in content && m && pic && isAnswer(content.text, pic)) {
      if (!m.lineup.includes(this.me)) this.system("🤫 Người xem đừng nhắc đáp án nhé!");
      else if (this.playable()) this.guess(content.text);
      else this.system("🤫 Tin nhắn trông như một lời đoán nên chưa được gửi — chờ mở bàn rồi gõ vào ô đoán nhé!");
      return;
    }
    return super.send(content);
  }

  /** Chủ phòng đổi cỡ bàn / mức khó cho ván tới. */
  setOptions(next: Partial<TxOptions>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const opts = normOptions({ ...normOptions(m.opts), ...next });
      if (JSON.stringify(opts) === JSON.stringify(normOptions(m.opts))) return false;
      m.opts = { ...m.opts, ...opts };
    });
  }

  /** Các tranh đã chơi của những mức khác `level`. */
  private otherLevels(used: readonly number[], level: Level) {
    return used.filter((id) => !usedOf([id], level).length);
  }

  /** Xoá đánh dấu các tranh đã chơi của mức khó đang chọn để bốc lại từ đầu bộ. */
  resetPictures() {
    this.hostEdit((m) => {
      const { level } = normOptions(m.opts);
      const used = m.txUsed ?? [];
      if (!usedOf(used, level).length) return false;
      m.txUsed = this.otherLevels(used, level);
    });
  }

  /** Chủ phòng dừng ván giữa chừng: không tính ai thắng. */
  stop() {
    this.hostEdit((m) => {
      if (m.status !== "playing") return false;
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
    });
  }
}
