/**
 * Phòng Ma Sói. Máy chủ phòng là quản trò: chia vai, nhận hành động ban đêm, đếm phiếu, chuyển giai đoạn
 * (luật thuần ở `lib/games/werewolf.ts`). Mọi bản ghi gossip ai trong phòng cũng nhận được, nên phần bí mật được
 * niêm phong (`seal.ts`) giữa từng người và quản trò:
 *
 *   meta.ww          — phần công khai: giai đoạn, hạn chót, ai sống / chết, người bị treo.
 *   s:<ván>:<uid>    — quản trò gửi riêng từng người chơi: vai, đồng bọn, kết quả soi, nạn nhân cho phù thủy…
 *                      Có gì đổi với bất kỳ ai thì ghi lại cả loạt, độn cùng cỡ — không lộ ai vừa được báo tin.
 *                      Người xem (không chơi) nhận bản thấy hết: vai mọi người và hành động đêm nay.
 *   a:<ván>:<uid>    — hành động đêm gửi riêng quản trò. Ban đêm *mọi người còn sống* đều gửi đều đặn mỗi nhịp,
 *                      cùng cỡ (dân làng gửi hộp rỗng), nên nhìn lưu lượng không đoán được ai có chức năng.
 *   v:<ván>:<uid>    — phiếu bầu ban ngày, công khai.
 *
 * Người chơi là những người đã bấm sẵn sàng (ghế trong `meta.players`); hết ván ai cũng về xem, ván sau sẵn sàng lại.
 * Quản trò (chủ phòng) không bao giờ chơi: chỉ xem hết mọi bí mật và điều khiển ván.
 * Bí mật của quản trò chỉ nằm trên máy chủ phòng (cất trong sessionStorage để tải lại trang vẫn giữ). Quản trò mất
 * kết nối thì người kế nhiệm không có bí mật để điều khiển tiếp: ván dừng.
 */
import {
  advance,
  ballotsOf,
  castFor,
  depart,
  joinNames,
  newGame,
  normOptions,
  readyOf,
  ROLES,
  secretFor,
  skipNight,
  skipTalk,
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
  type Team,
  type Vote,
  type WatchView,
  type WolfOptions,
} from "../games/werewolf";
import type { Profile } from "../identity";
import type { Lobby, RoomAd } from "./lobby";
import { RoomSession, type Member, type Meta, type Result, type SeatView } from "./room";
import { Keyring, sealedSize, type KeyStore } from "./seal";
import type { Channel } from "./wire";

/** Người chơi mất kết nối quá lâu giữa ván thì coi như bỏ làng. */
const LEFT_MS = 60000;
/** Nhịp gửi hành động đêm. */
const BEACON_MS = 2000;
/** Cỡ tối thiểu của hộp hành động đêm: đủ chứa ba lời thì thầm dài nhất của Sói, để hộp của Sói không to hơn của dân. */
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

/** Cảnh diễn trên màn hình khi ván chuyển biến (máy nào cũng tự suy ra từ phần công khai). */
export type Scene = { id: string } & (
  | { kind: "dusk"; day: number }
  | { kind: "sunrise"; day: number; dead: Death[] }
  | { kind: "hang"; death: Death }
  | { kind: "spared" }
  | { kind: "end"; team: Team }
);
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type SceneBody = DistOmit<Scene, "id">;

export type WolfView = {
  opts: WolfOptions;
  /** Đội hình nếu bắt đầu với những người đang sẵn sàng. */
  plan: { cast: Cast; error?: string };
  /** Ván đang chơi hoặc vừa xong. */
  pub?: Public;
  playing: boolean;
  /** Hạn chót của giai đoạn hiện tại theo giờ máy mình. */
  deadline: number;
  me: {
    /** Đã bấm sẵn sàng cho ván tới. */
    ready: boolean;
    /** Có trong đội hình ván hiện tại / vừa xong. */
    inGame: boolean;
    alive: boolean;
    role?: Role;
    secret?: SecretView;
    /** Hành động đêm nay của mình (chưa chắc quản trò đã nhận). */
    act: Action;
    vote?: Vote;
  };
  /** Quản trò không ngồi chơi và người xem: thấy hết vai và hành động đêm nay. */
  seeAll?: WatchView;
  /** Phiếu hợp lệ của lượt bỏ phiếu hiện tại. */
  ballots: Record<string, string | null>;
  /** Những người muốn bỏ phiếu sớm. */
  ready: string[];
  people: Record<string, SeatView>;
  /** Người đang sẵn sàng mà máy chưa có khoá — chưa bắt đầu được. */
  unkeyed: string[];
  result?: Result;
};

export class WerewolfRoom extends RoomSession<WolfView> {
  readonly game = "werewolf";
  private keys: Keyring | null = null;
  private gm: GmState | null = null;
  private gmSaved = "";
  private sealed = { sig: "", busy: false };
  /** Bản ghi niêm phong đã mở, theo khoá gossip và phiên bản. */
  private opened = new Map<string, { c: number; w: string; peer: string; v: unknown }>();
  private opening = new Set<string>();
  /** Hành động đêm nay của mình (kèm vài lời thì thầm gần nhất nếu là Sói) — mỗi đêm của mỗi ván bắt đầu lại. */
  private night: { round: number; act: Action; said: { id: string; text: string }[] } = { round: 0, act: { day: 0 }, said: [] };
  private saySeq = 0;
  private beacon = { at: 0, busy: false };
  private stageSeen = { key: "", at: 0 };
  /** Giai đoạn đã rao gần nhất; null khi chưa nhìn thấy gì (vừa vào phòng thì không rao lại chuyện cũ). */
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

  protected memberExtra(): Partial<Member> {
    return this.keys ? { key: this.keys.pub } : {};
  }

  private keyOf(uid: string) {
    return this.gossip.get<Member>(`p:${uid}`)?.key;
  }

  private gameOf(m: Meta) {
    return this.gm && this.gm.round === m.round && m.ww?.round === m.round ? this.gm.game : null;
  }

  // ---------- niêm phong ----------

  /** Mở bản ghi niêm phong dành cho mình: bí mật quản trò gửi mình; chủ phòng thì mở hành động đêm của mọi người. */
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
      }
      return;
    }
    if (cur && cur.c === e.c && cur.w === e.w && cur.peer === peer) return;
    const keys = this.keys;
    this.opening.add(k);
    void keys.open(peer, k, e.v).then((v) => {
      this.opening.delete(k);
      this.opened.set(k, { c: e.c, w: e.w, peer, v });
      this.react();
      // Bản ghi có thể đã đổi trong lúc đang mở.
      this.unseal(k);
    });
  }

  private openedOf<T>(k: string) {
    return (this.opened.get(k)?.v ?? undefined) as T | undefined;
  }

  /** Người xem đang online (không chơi, không phải quản trò) — nhận bản thấy hết. */
  private watchers(m: Meta) {
    return this.members()
      .filter((p) => p.uid !== this.me && !m.lineup.includes(p.uid) && !m.kicked.includes(p.uid) && !!p.key && this.isOnline(p.uid))
      .map((p) => p.uid)
      .sort();
  }

  /** Quản trò: gửi bí mật cho từng người (cả loạt, cùng cỡ) khi có gì thay đổi. */
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

  /** Ban đêm, mọi người còn sống gửi hành động của mình cho quản trò theo nhịp đều (dân làng gửi hộp rỗng). */
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

  // ---------- luật ----------

  /**
   * Mỗi ván phải bấm sẵn sàng lại: phòng mới tạo và mỗi khi hết ván, mọi người (kể cả chủ phòng) về chế độ xem.
   * `scored` ghi ván gần nhất đã được dọn.
   */
  protected tidy(m: Meta) {
    if (m.scored === undefined || (m.status === "ended" && m.scored < m.round)) {
      m.scored = m.round;
      m.players = [];
    }
    // Quản trò không chơi, chỉ xem và điều khiển ván.
    if (m.status !== "playing") m.players = m.players.filter((u) => u !== m.host);
  }

  protected applyIntent(m: Meta, p: Member) {
    if (p.uid === m.host) return;
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

  /** Quản trò ghi nhận trạng thái mới của ván: phần công khai vào `meta`, phần bí mật cất trên máy mình. */
  private commit(m: Meta, g: Game) {
    this.gm = { round: m.round, game: g };
    m.ww = g.pub;
    const raw = JSON.stringify(this.gm);
    if (raw !== this.gmSaved) {
      this.gmSaved = raw;
      try {
        sessionStorage.setItem(gmKey(this.id), raw);
      } catch {}
    }
  }

  protected outcome(m: Meta): Result | undefined {
    const pub = m.ww;
    if (!pub?.winner || pub.round !== m.round) return;
    const roles = pub.roles ?? {};
    const winners = m.lineup.filter((u) => roles[u] && ROLES[roles[u]].team === pub.winner);
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

  // ---------- rao & cảnh ----------

  /** Mỗi cảnh cần diễn trên màn hình (trời tối, trời sáng, treo cổ, hết ván). */
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

  /** Rao khi chuyển giai đoạn — máy nào cũng tự rao từ phần công khai nên ai cũng thấy như nhau. */
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
    if (key === this.heard) return;
    const prev = this.heard;
    this.heard = key;
    if (!pub) return;
    if (m.status === "ended") {
      // Ván có thể ngã ngũ ngay lúc trời sáng hoặc lúc treo cổ: diễn nốt cảnh đó rồi mới công bố phe thắng.
      const night = fresh.filter((d) => d.how === "night");
      if (night.length || prev.endsWith(":dawn")) this.sunrise(pub, night);
      const hang = fresh.find((d) => d.how === "hang");
      if (hang) this.hanged(hang);
      if (m.result?.team) this.scene({ kind: "end", team: m.result.team });
      return;
    }
    const d = pub.day;
    switch (pub.stage) {
      case "intro":
        this.system("🌙 Trời tối rồi, mọi người ngủ đi thôi… Lật bài xem vai của mình nhé!");
        break;
      case "night":
        this.system(`🌙 Đêm thứ ${d} buông xuống — cả làng đi ngủ`);
        if (d > 1) this.scene({ kind: "dusk", day: d });
        break;
      case "day":
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
  }

  // ---------- giao diện ----------

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
    return `Ván ${r.round} đã dừng giữa chừng`;
  }

  // ---------- hành động người chơi ----------

  /** Bấm sẵn sàng (vào chơi ván tới) hoặc huỷ (về xem). Quản trò không chơi. */
  setReady(on: boolean) {
    const m = this.meta();
    if (!m || m.status === "playing" || m.host === this.me) return;
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

  /** Ban đêm: đổi lựa chọn của mình (chưa chốt). Gửi ở nhịp kế tiếp. */
  private plan(change: Partial<Action>) {
    const live = this.livePub("night");
    if (!live) return;
    const n = this.tonight(live.pub);
    if (n.act.done) return;
    n.act = { ...n.act, ...change };
    this.store.invalidate();
  }

  /** Chọn người để cắn (Sói), bảo vệ (Bảo Vệ) hoặc soi (Tiên Tri). */
  nightPick(kind: "wolf" | "guard" | "seer", target: string) {
    this.plan({ [kind]: target });
  }

  /** Phù Thủy: cứu người bị cắn (null: thôi cứu), chọn người đầu độc (null: bỏ chọn). */
  witch(change: { save?: string | null; poison?: string | null }) {
    this.plan(change);
  }

  /** Chốt hành động đêm nay — mọi vai có chức năng chốt xong thì trời sáng. */
  confirm() {
    this.plan({ done: true });
  }

  /** Sói thì thầm với bầy trong đêm (quản trò chuyển cho cả bầy). */
  whisper(text: string) {
    const live = this.livePub("night");
    const t = text.trim().slice(0, WHISPER_TEXT);
    if (!live || !t) return;
    const n = this.tonight(live.pub);
    n.said = [...n.said, { id: `${this.me}:${live.pub.round}:${live.pub.day}:${this.saySeq++}`, text: t }].slice(-3);
    this.store.invalidate();
  }

  /** Bỏ phiếu treo một người (null: bỏ qua). */
  vote(target: string | null) {
    const live = this.livePub();
    if (!live || (live.pub.stage !== "vote" && live.pub.stage !== "revote")) return;
    this.gossip.set<Vote>(`v:${live.m.round}:${this.me}`, { day: live.pub.day, stage: live.pub.stage, target });
    this.react();
  }

  /** Lúc thảo luận: muốn bỏ phiếu sớm (cả làng cùng muốn thì bỏ phiếu ngay). */
  readyToVote(on: boolean) {
    const live = this.livePub("day");
    if (!live) return;
    this.gossip.set<Vote>(`v:${live.m.round}:${this.me}`, { day: live.pub.day, stage: "day", ready: on });
    this.react();
  }

  // ---------- hành động chủ phòng ----------

  setOptions(patch: Partial<WolfOptions>) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      const next = normOptions({ ...normOptions(m.opts), ...patch });
      if (JSON.stringify(next) === JSON.stringify(normOptions(m.opts))) return false;
      m.opts = next;
    });
  }

  /** Hết giờ thảo luận sớm, bỏ phiếu ngay. */
  skipTalk() {
    this.hostEdit((m) => {
      const g = m.status === "playing" ? this.gameOf(m) : null;
      if (!g || g.pub.stage !== "day") return false;
      this.commit(m, skipTalk(g, Date.now()));
    });
  }

  /** Cho trời sáng ngay, không chờ người chưa chốt (vd. có người treo máy). */
  skipNight() {
    this.hostEdit((m) => {
      const g = m.status === "playing" ? this.gameOf(m) : null;
      if (!g || g.pub.stage !== "night") return false;
      this.commit(m, skipNight(g, Date.now(), Math.random));
    });
  }

  /** Dừng ván giữa chừng, lộ vai mọi người và diễn biến. */
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
