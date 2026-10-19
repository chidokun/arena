// Mọi bản ghi gossip ai trong phòng cũng nhận được, nên phần bí mật được niêm phong (`seal.ts`) giữa từng người và quản
// trò. Hộp `s:` có gì đổi với bất kỳ ai thì ghi lại cả loạt, độn cùng cỡ để không lộ ai vừa được báo tin. Ban đêm mọi
// người còn sống đều gửi hộp hành động `a:` đều đặn mỗi nhịp, cùng cỡ (dân làng gửi hộp rỗng), để nhìn lưu lượng không
// đoán được ai có chức năng.
//
// Bí mật của quản trò chỉ nằm trên máy chủ phòng (sessionStorage để tải lại trang vẫn giữ); quản trò mất kết nối thì
// người kế nhiệm không có bí mật để điều khiển tiếp: ván dừng.
import {
  advance,
  ballotsOf,
  castFor,
  depart,
  joinNames,
  newGame,
  normOptions,
  readyOf,
  secretFor,
  shotOf,
  sideOf,
  skipNight,
  skipTalk,
  skipTurn,
  unveil,
  watchView,
  WHISPER_TEXT,
  type Action,
  type Cast,
  type Death,
  type Game,
  type Public,
  type Role,
  type SecretView,
  type Side,
  type Vote,
  type WatchView,
  type WolfOptions,
} from "../games/werewolf";
import type { Profile } from "../identity";
import type { Lobby, RoomAd } from "./lobby";
import { RoomSession, type Member, type Meta, type Result, type SeatView } from "./room";
import { Keyring, sealedSize, type KeyStore } from "./seal";
import type { Channel } from "./wire";

const LEFT_MS = 60000;
const BEACON_MS = 2000;
// Đủ chứa ba lời thì thầm dài nhất của Sói, để hộp của Sói không to hơn của dân.
const ACTION_SIZE = 1400;

const gmKey = (id: string) => `arena:ww:${id}`;
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
  | { kind: "dusk"; day: number }
  | { kind: "sunrise"; day: number; dead: Death[] }
  | { kind: "hang"; death: Death }
  | { kind: "shot"; death: Death }
  | { kind: "spared" }
  | { kind: "end"; team: Side }
);
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type SceneBody = DistOmit<Scene, "id">;

export type WolfView = {
  opts: WolfOptions;
  plan: { cast: Cast; error?: string };
  pub?: Public;
  playing: boolean;
  deadline: number;
  me: {
    ready: boolean;
    inGame: boolean;
    alive: boolean;
    role?: Role;
    secret?: SecretView;
    act: Action;
    vote?: Vote;
  };
  seeAll?: WatchView;
  aim?: string | null;
  ballots: Record<string, string | null>;
  ready: string[];
  people: Record<string, SeatView>;
  unkeyed: string[];
  result?: Result;
};

export class WerewolfRoom extends RoomSession<WolfView> {
  readonly game = "werewolf";
  private keys: Keyring | null = null;
  private gm: GmState | null = null;
  private gmSaved = "";
  private sealed = { sig: "", busy: false };
  private opened = new Map<string, { c: number; w: string; peer: string; v: unknown }>();
  private opening = new Set<string>();
  private night: { round: number; act: Action; said: { id: string; text: string }[] } = { round: 0, act: { day: 0 }, said: [] };
  private saySeq = 0;
  private beacon = { at: 0, busy: false };
  private stageSeen = { key: "", at: 0 };
  // null khi chưa nhìn thấy gì, để vừa vào phòng thì không rao lại chuyện cũ.
  private heard: string | null = null;
  private deathsHeard = 0;
  private sceneSeq = 0;
  private sceneFns = new Set<(s: Scene) => void>();

  constructor(id: string, me: string, profile: Profile, lobby: Lobby, channel: Channel) {
    super(id, me, profile, lobby, channel);
    try {
      const raw = sessionStorage.getItem(gmKey(id));
      if (raw) this.gm = JSON.parse(raw) as GmState;
    } catch {}
    void Keyring.create(sessionStore(keyKey(me))).then((k) => {
      this.keys = k;
      this.refresh();
      this.react();
    });
    this.gossip.onChange((keys) => {
      for (const k of keys) if (k.startsWith("a:") || k.startsWith("s:")) this.unseal(k);
    });
  }

  /** Bàn chơi không đọc hộp niêm phong thô: `a:` chỉ quản trò mở để tính ván, `s:` thì đọc qua bản đã mở (`opened`). */
  protected viewKey(k: string) {
    return !k.startsWith("a:") && !k.startsWith("s:");
  }

  protected memberExtra(): Partial<Member> {
    return this.keys ? { key: this.keys.pub } : {};
  }

  private keyOf(uid: string) {
    return this.gossip.get<Member>(`p:${uid}`)?.key;
  }

  private gameOf(m: Meta) {
    return this.gm && this.gm.round === m.round && m.ww?.round === m.round ? this.gm.game : null;
  }

  private unseal(k: string) {
    const m = this.meta();
    if (!this.keys || !m || this.opening.has(k)) return;
    const [kind, r, uid] = k.split(":");
    if (Number(r) !== m.round) return;
    let peer: string | undefined;
    if (kind === "s" && uid === this.me) peer = this.keyOf(m.host);
    else if (kind === "a" && m.host === this.me) peer = this.keyOf(uid);
    else return;
    const e = this.gossip.entry<unknown>(k);
    const cur = this.opened.get(k);
    if (!peer || !e || typeof e.v !== "string") {
      if (cur) {
        this.opened.delete(k);
        this.store.invalidate();
        // Bí mật của mình (đã mở, nằm ngoài gossip) vừa mất: báo bàn chơi. Hộp hành động quản trò mở thì bàn không đọc.
        if (kind === "s") this.gameStore.invalidate();
      }
      return;
    }
    if (cur && cur.c === e.c && cur.w === e.w && cur.peer === peer) return;
    const keys = this.keys;
    this.opening.add(k);
    void keys.open(peer, k, e.v).then((v) => {
      this.opening.delete(k);
      this.opened.set(k, { c: e.c, w: e.w, peer, v });
      if (kind === "s") this.gameStore.invalidate();
      this.react();
      // Bản ghi có thể đã đổi trong lúc đang mở.
      this.unseal(k);
    });
  }

  private openedOf<T>(k: string) {
    return (this.opened.get(k)?.v ?? undefined) as T | undefined;
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

  private tonight(pub: Public) {
    if (this.night.round !== pub.round || this.night.act.day !== pub.day) this.night = { round: pub.round, act: { day: pub.day }, said: [] };
    return this.night;
  }

  private sendBeacon(m: Meta) {
    const pub = m.ww;
    if (m.status !== "playing" || !pub || pub.round !== m.round || pub.stage !== "night" || !pub.alive.includes(this.me)) return;
    const host = this.keyOf(m.host);
    const keys = this.keys;
    if (!keys || !host || this.beacon.busy || Date.now() - this.beacon.at < BEACON_MS) return;
    const { act, said } = this.tonight(pub);
    const k = `a:${m.round}:${this.me}`;
    const body: Action = { ...act, ...(said.length ? { say: said } : {}) };
    this.beacon = { at: Date.now(), busy: true };
    void keys.seal(host, k, body, ACTION_SIZE).then(
      (box) => {
        this.beacon.busy = false;
        if (this.meta()?.round === m.round) this.gossip.set(k, box);
      },
      () => {
        this.beacon.busy = false;
      },
    );
  }

  protected tidy(m: Meta) {
    if (m.scored === undefined || (m.status === "ended" && m.scored < m.round)) {
      m.scored = m.round;
      m.players = [];
    }
    if (m.status !== "playing" && !normOptions(m.opts).hostPlays) m.players = m.players.filter((u) => u !== m.host);
  }

  // Người xem thấy hết vai nên phải giữ im lặng trong ván.
  protected muted(uid: string) {
    const m = this.meta();
    const pub = m?.ww;
    if (!m || m.status !== "playing" || !pub || m.round <= 0 || pub.round !== m.round) return false;
    if (!m.lineup.includes(uid)) return uid !== m.host;
    return !pub.alive.includes(uid) || pub.stage === "night" || pub.stage === "dawn";
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
    const g = newGame(m.round, players, opts, Date.now(), Math.random);
    m.lineup = players;
    this.commit(m, g);
    return true;
  }

  private commit(m: Meta, g: Game) {
    this.gm = { round: m.round, game: g };
    m.ww = g.pub;
    const raw = JSON.stringify(this.gm);
    if (raw !== this.gmSaved) {
      this.gmSaved = raw;
      try {
        sessionStorage.setItem(gmKey(this.id), raw);
      } catch {}
      // Quản trò đứng xem thì thấy hết (`seeAll`), phần bí mật đó có thể đổi mà `meta.ww` công khai vẫn như cũ.
      if (!m.lineup.includes(this.me)) this.gameStore.invalidate();
    }
  }

  protected outcome(m: Meta): Result | undefined {
    const pub = m.ww;
    if (!pub?.winner || pub.round !== m.round) return;
    const roles = pub.roles ?? {};
    const winners = m.lineup.filter((u) => roles[u] && sideOf(roles, pub.lovers, u) === pub.winner);
    return { round: m.round, winner: null, winners, reason: "team", team: pub.winner };
  }

  protected hostPlay(m: Meta) {
    let g = this.gameOf(m);
    if (!g) {
      // Chủ phòng mới (người cũ mất kết nối / rời phòng) không có bí mật của ván: không điều khiển tiếp được.
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
      return;
    }
    const opts = normOptions(m.opts);
    for (const uid of g.pub.alive) if (uid !== this.me && this.silentFor(uid) >= LEFT_MS) g = depart(g, uid);
    const actions: Record<string, Action | undefined> = {};
    const votes: Record<string, Vote | undefined> = {};
    for (const uid of m.lineup) {
      actions[uid] = this.openedOf<Action>(`a:${m.round}:${uid}`);
      votes[uid] = this.gossip.get<Vote>(`v:${m.round}:${uid}`);
    }
    this.commit(m, advance(g, { actions, votes, now: Date.now(), rand: Math.random, opts }));
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
    for (const e of [...this.gossip.scan("s:"), ...this.gossip.scan("a:")]) this.unseal(e.k);
    if (m.host === this.me) this.publishSecrets(m);
    this.sendBeacon(m);
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

  private who(d: Pick<Death, "uid">) {
    return this.nameOf(d.uid);
  }

  private sunrise(pub: Public, dead: Death[]) {
    this.system(dead.length ? `☀️ Trời sáng. Đêm qua ${joinNames(dead.map((d) => this.who(d)))} đã chết` : "☀️ Trời sáng — đêm qua bình yên, không ai chết");
    this.scene({ kind: "sunrise", day: pub.day, dead });
  }

  private hanged(d: Death) {
    this.system(`🪢 ${this.nameOf(d.uid)} bị treo cổ — ${d.wolf ? "LÀ SÓI 🐺" : "không phải Sói"}`);
    this.scene({ kind: "hang", death: d });
  }

  // Máy nào cũng tự rao từ phần công khai nên ai cũng thấy như nhau.
  private announce(m: Meta) {
    const pub = m.ww?.round === m.round ? m.ww : undefined;
    const key = pub && m.status === "playing" ? `${pub.round}:${pub.day}:${pub.stage}` : `${m.status}:${m.round}`;
    if (this.heard === null) {
      this.heard = key;
      this.deathsHeard = pub?.deaths.length ?? 0;
      return;
    }
    if (pub && pub.deaths.length < this.deathsHeard) this.deathsHeard = 0;
    const fresh = pub ? pub.deaths.slice(this.deathsHeard) : [];
    this.deathsHeard = pub?.deaths.length ?? 0;
    for (const d of fresh) if (d.how === "left") this.system(`🚪 ${this.who(d)} đã bỏ làng ra đi`);
    if (key === this.heard) {
      this.aftermath(fresh);
      return;
    }
    const prev = this.heard;
    this.heard = key;
    if (!pub) return;
    if (m.status === "ended") {
      // Ván có thể ngã ngũ ngay lúc trời sáng hoặc lúc treo cổ: diễn nốt cảnh đó rồi mới công bố phe thắng.
      const night = fresh.filter((d) => d.how === "night");
      if (night.length || prev.endsWith(":dawn")) this.sunrise(pub, night);
      const hang = fresh.find((d) => d.how === "hang");
      if (hang) this.hanged(hang);
      this.aftermath(fresh);
      if (m.result?.team) this.scene({ kind: "end", team: m.result.team as Side });
      return;
    }
    const d = pub.day;
    // Vừa bắn xong: kể phát bắn trước khi sang ngày / đêm.
    const shot = prev.endsWith(":hunt");
    if (shot) this.aftermath(fresh);
    switch (pub.stage) {
      case "intro":
        this.system("🌙 Trời tối rồi, mọi người ngủ đi thôi… Lật bài xem vai của mình nhé!");
        break;
      case "night":
        this.system(`🌙 Đêm thứ ${d} buông xuống — cả làng đi ngủ`);
        if (d > 1) this.scene({ kind: "dusk", day: d });
        break;
      case "hunt": {
        // Thợ Săn chết đêm qua: công bố trời sáng trước rồi mới tới phát bắn.
        if (prev.endsWith(":dawn"))
          this.sunrise(
            pub,
            pub.deaths.filter((x) => x.day === d && x.how === "night"),
          );
        if (pub.hunt) this.system(`🏹 ${this.nameOf(pub.hunt.uid)} là Thợ Săn — trước khi gục xuống được bắn kéo theo một người!`);
        break;
      }
      case "day":
        if (!shot)
          this.sunrise(
            pub,
            pub.deaths.filter((x) => x.day === d && x.how === "night"),
          );
        break;
      case "vote":
        this.system("🗳️ Bỏ phiếu treo cổ!");
        break;
      case "revote":
        this.system(`⚖️ Hoà phiếu giữa ${joinNames((pub.candidates ?? []).map((u) => this.nameOf(u)))} — bỏ phiếu lại`);
        break;
      case "verdict": {
        const hang = pub.hanged ? pub.deaths.find((x) => x.uid === pub.hanged && x.how === "hang") : undefined;
        if (hang) this.hanged(hang);
        else {
          this.system("🕊️ Hôm nay không ai bị treo cổ");
          this.scene({ kind: "spared" });
        }
        break;
      }
    }
    if (!shot) this.aftermath(fresh);
  }

  // Người yêu chết theo ban đêm đã công bố chung với những người chết đêm qua, ở đây chỉ kể ban ngày.
  private aftermath(fresh: Death[]) {
    for (const d of fresh) {
      if (d.how === "shot") {
        this.system(`🎯 Thợ Săn ${d.by ? this.nameOf(d.by) : ""} bắn chết ${this.who(d)}`);
        this.scene({ kind: "shot", death: d });
      }
      if (d.how === "love") this.system(`💔 ${this.who(d)} đau buồn chết theo người yêu`);
    }
  }

  /** Hạn chót theo giờ máy mình: đồng hồ hai máy khớp nhau thì dùng luôn giờ quản trò, lệch nhiều thì tính từ lúc thấy. */
  private deadlineOf(pub: Public) {
    const key = `${pub.round}:${pub.day}:${pub.stage}:${pub.since}`;
    if (this.stageSeen.key !== key) this.stageSeen = { key, at: Date.now() };
    const at = this.stageSeen.at;
    return at >= pub.since - 3000 && at <= pub.until + 3000 ? pub.until : at + (pub.until - pub.since);
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): WolfView {
    const opts = normOptions(m.opts);
    const pub = m.ww && m.round > 0 && m.ww.round === m.round ? m.ww : undefined;
    const playing = m.status === "playing" && !!pub;
    const inGame = !!pub && m.lineup.includes(this.me);
    const secret = pub ? this.openedOf<SecretView>(`s:${m.round}:${this.me}`) : undefined;
    const votes: Record<string, Vote | undefined> = {};
    for (const uid of m.lineup) votes[uid] = this.gossip.get<Vote>(`v:${m.round}:${uid}`);
    const uids = new Set([...m.players, ...(pub ? m.lineup : [])]);
    const g = this.gameOf(m);
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
        role: inGame ? (secret?.role ?? pub?.roles?.[this.me]) : undefined,
        secret: inGame ? secret : undefined,
        act: pub && this.night.round === pub.round && this.night.act.day === pub.day ? this.night.act : { day: pub?.day ?? 0 },
        vote: votes[this.me],
      },
      seeAll: inGame ? undefined : g && m.host === this.me ? watchView(g) : secret?.watch,
      aim: pub ? shotOf(pub, votes) : undefined,
      ballots: pub ? ballotsOf(pub, votes) : {},
      ready: pub ? readyOf(pub, votes) : [],
      people: Object.fromEntries([...uids].map((uid) => [uid, seatOf(uid)])),
      unkeyed: m.players.filter((u) => !this.keyOf(u)),
      result: m.status === "ended" && m.result?.round === m.round ? m.result : undefined,
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    if (r.team === "wolf") return `🐺 Phe Ma Sói thắng ván ${r.round}! (${(r.winners ?? []).map(name).join(", ")})`;
    if (r.team === "village") return `👨‍🌾 Dân làng thắng ván ${r.round}!`;
    if (r.team === "lovers") return `💘 Cặp đôi ${(r.winners ?? []).map(name).join(" & ")} thắng ván ${r.round}!`;
    return `Ván ${r.round} đã dừng giữa chừng`;
  }

  setReady(on: boolean) {
    const m = this.meta();
    if (!m || m.status === "playing" || (m.host === this.me && !normOptions(m.opts).hostPlays)) return;
    if (on) this.join();
    else this.leaveSeat();
  }

  private livePub(stage?: Public["stage"]) {
    const m = this.meta();
    const pub = m?.ww;
    if (!m || m.status !== "playing" || !pub || pub.round !== m.round || !pub.alive.includes(this.me)) return null;
    if (stage && pub.stage !== stage) return null;
    return { m, pub };
  }

  private plan(change: Partial<Action>) {
    const live = this.livePub("night");
    if (!live) return;
    const n = this.tonight(live.pub);
    if (n.act.done) return;
    n.act = { ...n.act, ...change };
    // Lựa chọn đêm nay của mình (`me.act`) nằm ngoài gossip tới nhịp gửi kế tiếp.
    this.store.invalidate();
    this.gameStore.invalidate();
  }

  nightPick(kind: "wolf" | "guard" | "seer", target: string) {
    this.plan({ [kind]: target });
  }

  cupid(pair: string[]) {
    this.plan({ cupid: pair.slice(-2) });
  }

  witch(change: { save?: string | null; poison?: string | null }) {
    this.plan(change);
  }

  confirm() {
    this.plan({ done: true });
  }

  whisper(text: string) {
    const live = this.livePub("night");
    const t = text.trim().slice(0, WHISPER_TEXT);
    if (!live || !t) return;
    const n = this.tonight(live.pub);
    n.said = [...n.said, { id: `${this.me}:${live.pub.round}:${live.pub.day}:${this.saySeq++}`, text: t }].slice(-3);
    this.store.invalidate();
  }

  vote(target: string | null) {
    const live = this.livePub();
    if (!live || (live.pub.stage !== "vote" && live.pub.stage !== "revote")) return;
    this.gossip.set<Vote>(`v:${live.m.round}:${this.me}`, { day: live.pub.day, stage: live.pub.stage, target });
    this.react();
  }

  // Ai cũng thấy phát bắn nên ghi công khai.
  shoot(target: string | null) {
    const m = this.meta();
    const pub = m?.ww;
    if (!m || m.status !== "playing" || !pub || pub.round !== m.round || pub.stage !== "hunt" || pub.hunt?.uid !== this.me) return;
    this.gossip.set<Vote>(`v:${m.round}:${this.me}`, { day: pub.day, stage: "hunt", target });
    this.react();
  }

  readyToVote(on: boolean) {
    const live = this.livePub("day");
    if (!live) return;
    this.gossip.set<Vote>(`v:${live.m.round}:${this.me}`, { day: live.pub.day, stage: "day", ready: on });
    this.react();
  }

  setOptions(patch: Partial<WolfOptions>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const next = normOptions({ ...normOptions(m.opts), ...patch });
      if (JSON.stringify(next) === JSON.stringify(normOptions(m.opts))) return false;
      m.opts = next;
    });
  }

  skipTalk() {
    this.hostEdit((m) => {
      const g = m.status === "playing" ? this.gameOf(m) : null;
      if (!g || g.pub.stage !== "day") return false;
      this.commit(m, skipTalk(g, Date.now()));
    });
  }

  skipTurn() {
    this.hostEdit((m) => {
      const g = m.status === "playing" ? this.gameOf(m) : null;
      if (!g || g.pub.stage !== "night") return false;
      this.commit(m, skipTurn(g, Date.now(), Math.random));
    });
  }

  skipNight() {
    this.hostEdit((m) => {
      const g = m.status === "playing" ? this.gameOf(m) : null;
      if (!g || g.pub.stage !== "night") return false;
      this.commit(m, skipNight(g, Date.now(), Math.random));
    });
  }

  stop() {
    this.hostEdit((m) => {
      if (m.status !== "playing") return false;
      const g = this.gameOf(m);
      if (g) m.ww = unveil(g);
      m.status = "ended";
      m.result = { round: m.round, winner: null, winners: [], reason: "stop" };
    });
  }

  /** Đang chơi thì không nhường quyền chủ phòng: bí mật của ván chỉ nằm trên máy quản trò. */
  makeHost(uid: string) {
    if (this.meta()?.status === "playing") {
      this.system("Đang chơi thì không nhường quyền quản trò được — bí mật của ván chỉ nằm trên máy quản trò.");
      return;
    }
    super.makeHost(uid);
  }
}
