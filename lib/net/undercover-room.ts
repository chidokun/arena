// Ai trong phòng cũng nhận được mọi bản ghi gossip, nên phe và từ khoá được niêm phong (`seal.ts`) giữa từng người và
// người điều hành; hộp `s:` ghi cả loạt, độn cùng cỡ để độ dài hộp không tiết lộ ai thuộc phe Trắng hay từ nào dài hơn.
//
// Bí mật chỉ nằm trên máy chủ phòng (sessionStorage để tải lại trang vẫn giữ); chủ phòng mất kết nối thì người kế nhiệm
// không có bí mật nên không điều hành tiếp được: ván dừng.
import {
  advance,
  ballotsOf,
  castFor,
  clueError,
  decide,
  depart,
  guessOf,
  joinNames,
  mentions,
  newGame,
  normOptions,
  pickWords,
  readyOf,
  ROLES,
  secretFor,
  skipClue,
  skipTalk,
  speakerOf,
  speakers,
  unveil,
  watchView,
  type Cast,
  type Clue,
  type Game,
  type Guess,
  type Out,
  type Public,
  type Role,
  type Say,
  type SecretView,
  type UcOptions,
  type Vote,
  type WatchView,
  type Words,
} from "../games/undercover";
import { PAIRS } from "../games/undercover-words";
import type { Profile } from "../identity";
import type { Lobby, RoomAd } from "./lobby";
import { RoomSession, type Member, type Meta, type Result, type SeatView, type StickerId } from "./room";
import { Keyring, sealedSize, type KeyStore } from "./seal";
import type { Channel } from "./wire";

const LEFT_MS = 60000;

const gmKey = (id: string) => `arena:uc:${id}`;
const customKey = (id: string) => `arena:uc:${id}:custom`;
const keyKey = (uid: string) => `arena:key:${uid}`;

function sessionStore(key: string): KeyStore {
  return {
    get: () => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (v) => {
      try {
        sessionStorage.setItem(key, v);
      } catch {}
    },
  };
}

type GmState = { round: number; game: Game };

export type Scene = { id: string } & (
  | { kind: "out"; out: Out; tiebreak?: "random" | "host" }
  | { kind: "spared" }
  | { kind: "guess"; guess: Guess }
  | { kind: "end"; team: Role }
);
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type SceneBody = DistOmit<Scene, "id">;

export type UcView = {
  opts: UcOptions;
  plan: { cast: Cast; error?: string };
  pub?: Public;
  playing: boolean;
  deadline: number;
  me: {
    ready: boolean;
    inGame: boolean;
    alive: boolean;
    word?: string | null;
    role?: Role;
    vote?: string;
    clue?: string;
    guess?: string;
  };
  seeAll?: WatchView;
  ballots: Record<string, string>;
  ready: string[];
  people: Record<string, SeatView>;
  unkeyed: string[];
  custom: Words | null;
  words: { used: number; total: number };
  result?: Result;
};

export class UndercoverRoom extends RoomSession<UcView> {
  readonly game = "undercover";
  private keys: Keyring | null = null;
  private gm: GmState | null = null;
  private gmSaved = "";
  private custom: Words | null = null;
  private sealed = { sig: "", busy: false };
  private opened = new Map<string, { c: number; w: string; peer: string; v: unknown }>();
  private opening = new Set<string>();
  private stageSeen = { key: "", at: 0 };
  // null khi chưa nhìn thấy gì, để vừa vào phòng thì không rao lại chuyện cũ.
  private heard: string | null = null;
  private outsHeard = 0;
  private cluesHeard = 0;
  private sceneSeq = 0;
  private sceneFns = new Set<(s: Scene) => void>();

  constructor(id: string, me: string, profile: Profile, lobby: Lobby, channel: Channel) {
    super(id, me, profile, lobby, channel);
    try {
      const raw = sessionStorage.getItem(gmKey(id));
      if (raw) this.gm = JSON.parse(raw) as GmState;
      const custom = sessionStorage.getItem(customKey(id));
      if (custom) this.custom = JSON.parse(custom) as Words;
    } catch {}
    void Keyring.create(sessionStore(keyKey(me))).then((k) => {
      this.keys = k;
      this.refresh();
      this.react();
    });
    this.gossip.onChange((keys) => {
      for (const k of keys) if (k.startsWith("s:")) this.unseal(k);
    });
  }

  /**
   * Bàn chơi không đọc hộp niêm phong thô `s:` (đọc qua bản đã mở), và chỉ đọc mô tả `c:` / lời đoán `w:` của chính mình
   * (của người khác đi qua `meta.uc`).
   */
  protected viewKey(k: string) {
    if (k.startsWith("s:")) return false;
    if (k.startsWith("c:") || k.startsWith("w:")) return k.endsWith(`:${this.me}`);
    return true;
  }

  protected memberExtra(): Partial<Member> {
    return this.keys ? { key: this.keys.pub } : {};
  }

  private keyOf(uid: string) {
    return this.gossip.get<Member>(`p:${uid}`)?.key;
  }

  private gameOf(m: Meta) {
    return this.gm && this.gm.round === m.round && m.uc?.round === m.round ? this.gm.game : null;
  }

  private unseal(k: string) {
    const m = this.meta();
    if (!this.keys || !m || this.opening.has(k)) return;
    const [, r, uid] = k.split(":");
    if (Number(r) !== m.round || uid !== this.me) return;
    const peer = this.keyOf(m.host);
    const e = this.gossip.entry<unknown>(k);
    const cur = this.opened.get(k);
    if (!peer || !e || typeof e.v !== "string") {
      if (cur) {
        this.opened.delete(k);
        this.store.invalidate();
        // Bí mật của mình (đã mở, nằm ngoài gossip) vừa mất: báo bàn chơi.
        this.gameStore.invalidate();
      }
      return;
    }
    if (cur && cur.c === e.c && cur.w === e.w && cur.peer === peer) return;
    const keys = this.keys;
    this.opening.add(k);
    void keys.open(peer, k, e.v).then((v) => {
      this.opening.delete(k);
      this.opened.set(k, { c: e.c, w: e.w, peer, v });
      this.gameStore.invalidate();
      this.react();
      // Bản ghi có thể đã đổi trong lúc đang mở.
      this.unseal(k);
    });
  }

  private mySecret(m: Meta) {
    return (this.opened.get(`s:${m.round}:${this.me}`)?.v ?? undefined) as SecretView | undefined;
  }

  private watchers(m: Meta) {
    return this.members()
      .filter((p) => p.uid !== this.me && !m.lineup.includes(p.uid) && !m.kicked.includes(p.uid) && !!p.key && this.isOnline(p.uid))
      .map((p) => p.uid)
      .sort();
  }

  private publishSecrets(m: Meta) {
    const g = this.gameOf(m);
    const keys = this.keys;
    if (!g || !keys || this.sealed.busy || m.status !== "playing") return;
    const round = m.round;
    const players = m.lineup;
    const watchers = this.watchers(m);
    const views = players.map((uid) => secretFor(g, uid) ?? null);
    const watch: SecretView = { watch: watchView(g) };
    const peers = [...players, ...watchers].map((uid) => this.keyOf(uid));
    const sig = JSON.stringify([round, keys.pub, peers, views, watch]);
    if (sig === this.sealed.sig || peers.slice(0, players.length).some((p) => !p)) return;
    const size = Math.max(...views.map(sealedSize));
    const boxes = [...players.map((uid, i) => [uid, views[i], size] as const), ...watchers.map((uid) => [uid, watch, 0] as const)];
    this.sealed.busy = true;
    void Promise.all(boxes.map(([uid, v, n], i) => keys.seal(peers[i]!, `s:${round}:${uid}`, v, n))).then(
      (sealed) => {
        this.sealed.busy = false;
        if (this.meta()?.round !== round) return;
        boxes.forEach(([uid], i) => this.gossip.set(`s:${round}:${uid}`, sealed[i]));
        this.sealed.sig = sig;
        this.react();
      },
      () => {
        this.sealed.busy = false;
      },
    );
  }

  // Đánh dấu cặp từ đã chơi lúc hết ván vì lúc này cặp từ đã lộ.
  protected tidy(m: Meta) {
    if (m.scored === undefined || (m.status === "ended" && m.scored < m.round)) {
      m.scored = m.round;
      m.players = [];
    }
    const id = m.uc?.round === m.round ? m.uc.words?.id : undefined;
    if (m.status === "ended" && id !== undefined && !m.ucUsed?.includes(id)) m.ucUsed = [...(m.ucUsed ?? []), id];
    if (m.status !== "playing" && !normOptions(m.opts).hostPlays) m.players = m.players.filter((u) => u !== m.host);
  }

  protected applyIntent(m: Meta, p: Member) {
    if (p.uid === m.host && !normOptions(m.opts).hostPlays) return;
    super.applyIntent(m, p);
  }

  protected begin(m: Meta) {
    const opts = normOptions(m.opts);
    const players = [...m.players];
    if (!this.keys || castFor(players.length, opts).error) return false;
    if (players.some((u) => !this.isOnline(u) || !this.keyOf(u))) return false;
    const own = !opts.hostPlays && this.custom ? this.custom : null;
    const words = own ?? pickWords(m.ucUsed ?? [], Math.random);
    this.commit(m, newGame(m.round, players, opts, words, Date.now(), Math.random));
    m.lineup = players;
    if (own) this.setCustom(null);
    return true;
  }

  private commit(m: Meta, g: Game) {
    this.gm = { round: m.round, game: g };
    m.uc = g.pub;
    const raw = JSON.stringify(this.gm);
    if (raw !== this.gmSaved) {
      this.gmSaved = raw;
      try {
        sessionStorage.setItem(gmKey(this.id), raw);
      } catch {}
      // Người điều hành đứng xem thì thấy hết (`seeAll`), phần bí mật đó có thể đổi mà `meta.uc` công khai vẫn như cũ.
      if (!m.lineup.includes(this.me)) this.gameStore.invalidate();
    }
  }

  protected outcome(m: Meta): Result | undefined {
    const pub = m.uc;
    if (!pub?.winner || pub.round !== m.round) return;
    return { round: m.round, winner: null, winners: pub.winners ?? [], reason: "team", team: pub.winner };
  }

  protected hostPlay(m: Meta) {
    let g = this.gameOf(m);
    if (!g) {
      // Chủ phòng mới (người cũ mất kết nối / rời phòng) không có bí mật của ván: không điều hành tiếp được.
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
      return;
    }
    for (const uid of g.pub.alive) if (uid !== this.me && this.silentFor(uid) >= LEFT_MS) g = depart(g, uid);
    const clues: Record<string, Say | undefined> = {};
    const votes: Record<string, Vote | undefined> = {};
    const guesses: Record<string, Say | undefined> = {};
    for (const uid of m.lineup) {
      clues[uid] = this.gossip.get<Say>(`c:${m.round}:${uid}`);
      votes[uid] = this.gossip.get<Vote>(`v:${m.round}:${uid}`);
      guesses[uid] = this.gossip.get<Say>(`w:${m.round}:${uid}`);
    }
    this.commit(m, advance(g, { clues, votes, guesses, now: Date.now(), rand: Math.random, opts: normOptions(m.opts) }));
  }

  protected onKick(m: Meta, uid: string) {
    const g = m.status === "playing" ? this.gameOf(m) : null;
    if (g) this.commit(m, depart(g, uid));
  }

  protected adExtra(m: Meta): Partial<RoomAd> {
    return m.status === "playing" ? { players: m.lineup.length } : {};
  }

  protected watch(m: Meta) {
    for (const k of this.opened.keys()) if (Number(k.split(":")[1]) !== m.round) this.opened.delete(k);
    for (const e of this.gossip.scan("s:")) this.unseal(e.k);
    if (m.host === this.me) this.publishSecrets(m);
    this.announce(m);
  }

  onScene(fn: (s: Scene) => void) {
    this.sceneFns.add(fn);
    return () => {
      this.sceneFns.delete(fn);
    };
  }

  private scene(s: SceneBody) {
    const full = { ...s, id: `${this.sceneSeq++}` } as Scene;
    for (const fn of this.sceneFns) fn(full);
  }

  private outed(o: Out, tiebreak?: "random" | "host") {
    const how = tiebreak === "random" ? " (bốc thăm)" : tiebreak === "host" ? " (chủ phòng chọn)" : "";
    this.system(`❌ ${this.nameOf(o.uid)} bị loại${how} — thuộc ${ROLES[o.role].emoji} ${ROLES[o.role].team}`);
    this.scene({ kind: "out", out: o, ...(tiebreak ? { tiebreak } : {}) });
  }

  private guessed(g: Guess) {
    const who = this.nameOf(g.uid);
    this.system(g.text === null ? `⌛ ${who} hết giờ mà không đoán — bị loại` : g.right ? `🎯 ${who} đoán “${g.text}” — ĐÚNG!` : `❌ ${who} đoán “${g.text}” — sai, bị loại`);
    this.scene({ kind: "guess", guess: g });
  }

  // Id cố định nên máy nào cũng chỉ có một bản.
  private clueSaid(c: Clue) {
    if (c.text === null) {
      this.system(`⏭ ${this.nameOf(c.uid)} bị bỏ qua lượt mô tả`);
      return;
    }
    const p = this.gossip.get<Member>(`p:${c.uid}`);
    this.pushChat({
      id: `clue:${this.meta()?.round}:${c.day}:${c.uid}`,
      uid: c.uid,
      name: p?.name ?? "Ai đó",
      avatar: p?.avatar ?? "",
      color: p?.color ?? "",
      at: Date.now(),
      text: c.text,
      clue: true,
    });
  }

  private orderText(pub: Public) {
    return speakers(pub)
      .map((u) => this.nameOf(u))
      .join(" → ");
  }

  // Máy nào cũng tự rao từ phần công khai nên ai cũng thấy như nhau.
  private announce(m: Meta) {
    const pub = m.uc?.round === m.round ? m.uc : undefined;
    const key = pub && m.status === "playing" ? `${pub.round}:${pub.day}:${pub.stage}` : `${m.status}:${m.round}`;
    if (this.heard === null) {
      this.heard = key;
      this.outsHeard = pub?.outs.length ?? 0;
      this.cluesHeard = pub?.clues.length ?? 0;
      return;
    }
    if (pub && pub.outs.length < this.outsHeard) this.outsHeard = 0;
    if (pub && pub.clues.length < this.cluesHeard) this.cluesHeard = 0;
    const fresh = pub ? pub.outs.slice(this.outsHeard) : [];
    this.outsHeard = pub?.outs.length ?? 0;
    for (const o of fresh) if (o.how === "left") this.system(`🚪 ${this.nameOf(o.uid)} đã rời ván — thuộc ${ROLES[o.role].team}`);
    if (key !== this.heard && pub?.stage === "clue" && m.status === "playing")
      this.system(`✍️ Vòng ${pub.day}: lần lượt điền mô tả theo thứ tự ${this.orderText(pub)}`);
    for (const c of pub ? pub.clues.slice(this.cluesHeard) : []) this.clueSaid(c);
    this.cluesHeard = pub?.clues.length ?? 0;
    if (key === this.heard) return;
    const prev = this.heard;
    this.heard = key;
    if (!pub) return;
    if (m.status === "ended") {
      // Ván có thể ngã ngũ ngay lúc loại người hoặc lúc phe Trắng đoán: diễn nốt cảnh đó rồi mới công bố phe thắng.
      const out = fresh.find((o) => o.how === "vote");
      if (out) this.outed(out, pub.tiebreak);
      const guess = guessOf(pub);
      if (guess && !prev.endsWith(":judged")) this.guessed(guess);
      if (m.result?.team) this.scene({ kind: "end", team: m.result.team as Role });
      return;
    }
    switch (pub.stage) {
      case "intro":
        this.system(`🃏 Phát từ — bấm vào lá bài để lật xem từ của bạn. Thứ tự thảo luận: ${this.orderText(pub)}`);
        break;
      case "talk":
        this.system("💬 Mọi người đã mô tả xong — thảo luận tự do, bàn xong thì bấm “Biểu quyết ngay”");
        break;
      case "vote": {
        const by = pub.calls.at(-1)?.uid;
        this.system(`🗳️ ${by ? `${this.nameOf(by)} gọi biểu quyết` : "Biểu quyết"} — chọn người cần loại rồi bấm xác nhận!`);
        break;
      }
      case "revote":
        this.system(`⚖️ Hoà phiếu giữa ${joinNames((pub.candidates ?? []).map((u) => this.nameOf(u)))} — bỏ phiếu phụ`);
        break;
      case "decide":
        this.system("⚖️ Vẫn hoà — chủ phòng chọn người bị loại");
        break;
      case "verdict": {
        const out = pub.out ? pub.outs.find((o) => o.uid === pub.out && o.how === "vote") : undefined;
        if (out) this.outed(out, pub.tiebreak);
        else {
          this.system("🕊️ Vòng này không ai bị loại");
          this.scene({ kind: "spared" });
        }
        break;
      }
      case "guess":
        this.system(`👤 ${this.nameOf(pub.out ?? "")} thuộc phe Trắng — được đoán từ khoá của phe Dân một lần!`);
        break;
      case "judged": {
        const guess = guessOf(pub);
        if (guess) this.guessed(guess);
        break;
      }
    }
  }

  /** Hạn chót theo giờ máy mình: đồng hồ hai máy khớp nhau thì dùng luôn giờ chủ phòng, lệch nhiều thì tính từ lúc thấy. */
  private deadlineOf(pub: Public) {
    const key = `${pub.round}:${pub.day}:${pub.stage}:${pub.since}`;
    if (this.stageSeen.key !== key) this.stageSeen = { key, at: Date.now() };
    const at = this.stageSeen.at;
    return at >= pub.since - 3000 && at <= pub.until + 3000 ? pub.until : at + (pub.until - pub.since);
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): UcView {
    const opts = normOptions(m.opts);
    const pub = m.uc && m.round > 0 && m.uc.round === m.round ? m.uc : undefined;
    const playing = m.status === "playing" && !!pub;
    const inGame = !!pub && m.lineup.includes(this.me);
    const secret = pub ? this.mySecret(m) : undefined;
    const votes: Record<string, Vote | undefined> = {};
    for (const uid of m.lineup) votes[uid] = this.gossip.get<Vote>(`v:${m.round}:${uid}`);
    const uids = new Set([...m.players, ...(pub ? m.lineup : [])]);
    const g = this.gameOf(m);
    const ballots = pub ? ballotsOf(pub, votes) : {};
    const said = (k: string) => {
      const x = pub ? this.gossip.get<Say>(`${k}:${m.round}:${this.me}`) : undefined;
      return x && x.day === pub?.day ? x.text : undefined;
    };
    const ended = pub?.roles?.[this.me];
    return {
      opts,
      plan: castFor(m.players.length, opts),
      pub,
      playing,
      deadline: pub ? this.deadlineOf(pub) : 0,
      me: {
        ready: m.players.includes(this.me),
        inGame,
        alive: !!pub && pub.alive.includes(this.me),
        word: !inGame ? undefined : ended && pub?.words ? (ended === "white" ? null : pub.words[ended]) : secret?.word,
        role: inGame ? (ended ?? secret?.role ?? pub?.outs.find((o) => o.uid === this.me)?.role) : undefined,
        vote: ballots[this.me],
        clue: said("c"),
        guess: said("w"),
      },
      seeAll: inGame ? undefined : g && m.host === this.me ? watchView(g) : secret?.watch,
      ballots,
      ready: pub ? readyOf(pub, votes) : [],
      people: Object.fromEntries([...uids].map((uid) => [uid, seatOf(uid)])),
      unkeyed: m.players.filter((u) => !this.keyOf(u)),
      custom: m.host === this.me ? this.custom : null,
      words: { used: m.ucUsed?.length ?? 0, total: PAIRS.length },
      result: m.status === "ended" && m.result?.round === m.round ? m.result : undefined,
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    const who = (r.winners ?? []).map(name).join(", ");
    if (r.team === "civilian") return `🙂 Phe Dân thắng ván ${r.round}!`;
    if (r.team === "undercover") return `🕵️ Phe Gián Điệp thắng ván ${r.round}! (${who})`;
    if (r.team === "white") return `👤 Phe Trắng thắng ván ${r.round}! (${who})`;
    return `Ván ${r.round} đã dừng giữa chừng`;
  }

  setReady(on: boolean) {
    const m = this.meta();
    if (!m || m.status === "playing" || (m.host === this.me && !normOptions(m.opts).hostPlays)) return;
    if (on) this.join();
    else this.leaveSeat();
  }

  private livePub(...stages: Public["stage"][]) {
    const m = this.meta();
    const pub = m?.uc;
    if (!m || m.status !== "playing" || !pub || pub.round !== m.round || !pub.alive.includes(this.me)) return null;
    if (stages.length && !stages.includes(pub.stage)) return null;
    return { m, pub };
  }

  private mark(v: Omit<Vote, "day">) {
    const live = this.livePub(v.stage);
    if (!live) return;
    this.gossip.set<Vote>(`v:${live.m.round}:${this.me}`, { day: live.pub.day, ...v });
    this.react();
  }

  flip() {
    this.mark({ stage: "intro", ready: true });
  }

  describe(text: string): string | undefined {
    const live = this.livePub("clue");
    if (!live || speakerOf(live.pub) !== this.me) return "Chưa tới lượt bạn";
    const t = text.trim();
    const err = clueError(t, this.mySecret(live.m)?.word);
    if (err) return err;
    this.gossip.set<Say>(`c:${live.m.round}:${this.me}`, { day: live.pub.day, text: t });
    this.react();
  }

  callVote() {
    if (this.livePub("talk")) {
      this.mark({ stage: "talk", ready: true, at: Date.now() });
      return;
    }
    this.hostEdit((m) => {
      const g = m.status === "playing" ? this.gameOf(m) : null;
      if (!g || g.pub.stage !== "talk") return false;
      this.commit(m, skipTalk(g, Date.now(), this.me));
    });
  }

  vote(target: string) {
    const live = this.livePub("vote", "revote");
    if (!live || target === this.me) return;
    const cur = this.gossip.get<Vote>(`v:${live.m.round}:${this.me}`);
    if (cur && cur.day === live.pub.day && cur.stage === live.pub.stage && cur.target) return;
    this.mark({ stage: live.pub.stage, target });
  }

  guess(text: string) {
    const m = this.meta();
    const pub = m?.uc;
    const t = text.trim();
    if (!m || m.status !== "playing" || !pub || pub.stage !== "guess" || pub.out !== this.me || !t) return;
    const k = `w:${m.round}:${this.me}`;
    if (this.gossip.get<Say>(k)?.day === pub.day) return;
    this.gossip.set<Say>(k, { day: pub.day, text: t });
    this.react();
  }

  send(content: { text: string } | { sticker: StickerId }): boolean | void {
    const m = this.meta();
    const word = m?.status === "playing" && m.lineup.includes(this.me) ? this.mySecret(m)?.word : undefined;
    if ("text" in content && word && mentions(content.text, word)) {
      this.system("🤫 Tin nhắn có từ khoá của bạn nên chưa được gửi — đừng tiết lộ từ khoá nhé!");
      return;
    }
    return super.send(content);
  }

  setOptions(patch: Partial<UcOptions>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const next = normOptions({ ...normOptions(m.opts), ...patch });
      if (JSON.stringify(next) === JSON.stringify(normOptions(m.opts))) return false;
      m.opts = next;
    });
  }

  setCustom(words: Words | null) {
    const w = words && words.civilian.trim() && words.undercover.trim() ? { civilian: words.civilian.trim(), undercover: words.undercover.trim() } : null;
    this.custom = w;
    try {
      if (w) sessionStorage.setItem(customKey(this.id), JSON.stringify(w));
      else sessionStorage.removeItem(customKey(this.id));
    } catch {}
    // Cặp từ tự đặt chỉ nằm trên máy mình (`custom`).
    this.store.invalidate();
    this.gameStore.invalidate();
  }

  resetWords() {
    this.hostEdit((m) => {
      if (!m.ucUsed?.length) return false;
      delete m.ucUsed;
    });
  }

  skipClue() {
    this.hostEdit((m) => {
      const g = m.status === "playing" ? this.gameOf(m) : null;
      if (!g || g.pub.stage !== "clue") return false;
      this.commit(m, skipClue(g, Date.now()));
    });
  }

  decide(uid: string) {
    this.hostEdit((m) => {
      const g = m.status === "playing" ? this.gameOf(m) : null;
      if (!g || g.pub.stage !== "decide") return false;
      this.commit(m, decide(g, uid, Date.now()));
    });
  }

  stop() {
    this.hostEdit((m) => {
      if (m.status !== "playing") return false;
      const g = this.gameOf(m);
      if (g) m.uc = unveil(g);
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
    });
  }

  /** Đang chơi thì không nhường quyền chủ phòng: bí mật của ván chỉ nằm trên máy chủ phòng. */
  makeHost(uid: string) {
    if (this.meta()?.status === "playing") {
      this.system("Đang chơi thì không nhường quyền chủ phòng được — bí mật của ván chỉ nằm trên máy chủ phòng.");
      return;
    }
    super.makeHost(uid);
  }
}
