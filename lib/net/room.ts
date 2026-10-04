/**
 * Phiên phòng chơi. Toàn bộ trạng thái phòng là một gossip store nhân bản giữa những người trong phòng:
 *
 *   meta            — do chủ phòng ghi: tên, sức chứa, luật, danh sách ghế, trạng thái ván, danh sách bị kick…
 *   p:<uid>         — mỗi người tự ghi: hồ sơ, nhịp tim, và *ý định* (muốn vào ghế / rời ghế) kèm số thứ tự.
 *   g:<round>       — nhật ký nước đi của ván; hai người chơi lần lượt nối thêm (luôn ghi sau khi đã thấy nước trước).
 *   x:<round>:<uid> — người chơi xin thua.
 *
 * "Chốt" trạng thái người dùng: người dùng chỉ phát ý định; chủ phòng là người duy nhất ghi `meta`, xử lý ý định
 * theo thứ tự rồi ghi nhận (`ack`). Vì chỉ có một người ghi nên không có xung đột ghế; gossip đảm bảo mọi người
 * cuối cùng thấy cùng một `meta`. Kết quả ván suy ra tất định từ nhật ký nước đi nên ai cũng tự tính được.
 * Chủ phòng rớt mạng quá hạn thì người kế nhiệm (tất định: người chơi theo ghế, rồi người vào sớm nhất) tiếp quản.
 */
import { replay, type CaroOptions, type CaroState, type Move } from "../games/caro";
import type { Profile } from "../identity";
import { Gossip, Liveness, type Rumor } from "./gossip";
import type { Lobby } from "./lobby";
import { ViewStore } from "./view-store";
import { openChannel, Redialer, type Channel } from "./wire";

export type Status = "waiting" | "playing" | "ended";

export type Result = {
  round: number;
  winner: string | null;
  loser?: string;
  reason: "line" | "draw" | "resign" | "leave" | "kick";
};

export type Meta = {
  game: string;
  name: string;
  host: string;
  seats: number;
  cap: number;
  opts: CaroOptions;
  status: Status;
  round: number;
  players: string[];
  /** Thứ tự đi của ván hiện tại: lineup[0] cầm X (đi trước), lineup[1] cầm O. */
  lineup: string[];
  ack: Record<string, number>;
  kicked: string[];
  result?: Result;
  created: number;
};

export type Member = Profile & {
  uid: string;
  peer: string;
  hb: number;
  joined: number;
  want: "play" | "watch" | null;
  seq: number;
  left?: boolean;
};

export type StickerId = "heart" | "brick" | "cow" | "clap";

export type ChatMsg = {
  id: string;
  uid: string;
  name: string;
  avatar: string;
  color: string;
  at: number;
  text?: string;
  sticker?: StickerId;
  system?: boolean;
};

export type Phase = "connecting" | "ready" | "notfound" | "full" | "kicked" | "left";

export type SeatView = { uid: string; member?: Member; online: boolean };

export type RoomView = {
  phase: Phase;
  me: string;
  meta?: Meta;
  isHost: boolean;
  peers: number;
  members: Member[];
  online: Set<string>;
  seats: SeatView[];
  spectators: Member[];
  mySeat: number;
  pending: "play" | "watch" | null;
  game?: {
    round: number;
    state: CaroState;
    lineup: SeatView[];
    myMark: 0 | 1 | 2;
    myTurn: boolean;
    result?: Result;
  };
  chat: ChatMsg[];
};

export type CreateRoom = { name: string; cap: number; seats: number; opts: CaroOptions };

const HEARTBEAT_MS = 2000;
const MEMBER_TIMEOUT_MS = 9000;
// Đủ dài để chủ phòng tải lại trang (kết nối lại qua relay mất vài giây) mà không bị tiếp quản.
const HOST_TAKEOVER_MS = 20000;
const SETTLE_MS = 2500;
const NOT_FOUND_MS = 20000;
// Sảnh vẫn thấy quảng bá của phòng (chủ phòng còn sống) thì kiên nhẫn chờ bắt tay lâu hơn.
const NOT_FOUND_ADVERTISED_MS = 60000;
const DROP_SEAT_MS = 15000;
const FORFEIT_MS = 30000;
const CHAT_LIMIT = 120;

const createKey = (id: string) => `arena:create:${id}`;
const snapKey = (id: string) => `arena:room:${id}`;

export function stashCreate(id: string, c: CreateRoom) {
  try {
    sessionStorage.setItem(createKey(id), JSON.stringify(c));
  } catch {}
}

function takeCreate(id: string): CreateRoom | null {
  try {
    const raw = sessionStorage.getItem(createKey(id));
    sessionStorage.removeItem(createKey(id));
    return raw ? (JSON.parse(raw) as CreateRoom) : null;
  } catch {
    return null;
  }
}

export class RoomSession {
  readonly id: string;
  readonly me: string;
  private profile: Profile;
  private lobby: Lobby;
  private channel: Channel;
  readonly gossip: Gossip;
  private live = new Liveness(MEMBER_TIMEOUT_MS);
  private openedAt = Date.now();
  private metaSeenAt = 0;
  private phase: Phase = "connecting";
  private chat: ChatMsg[] = [];
  private chatFns = new Set<(m: ChatMsg) => void>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private prevOnline = new Set<string>();
  private lastStatus = "";
  private lastAd = 0;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private joined = Date.now();
  private want: Member["want"] = null;
  private redialer: Redialer;
  readonly store: ViewStore<RoomView>;

  static async open(id: string, me: string, profile: Profile, lobby: Lobby) {
    const channel = await openChannel(`room:${id}`);
    return new RoomSession(id, me, profile, lobby, channel);
  }

  private constructor(id: string, me: string, profile: Profile, lobby: Lobby, channel: Channel) {
    this.id = id;
    this.me = me;
    this.profile = profile;
    this.lobby = lobby;
    this.channel = channel;
    this.gossip = new Gossip(me, channel, {
      fanout: 3,
      intervalMs: 1000,
      accept: (e) => {
        if (e.k.startsWith("p:")) return e.k === `p:${e.w}`;
        if (e.k.startsWith("x:")) return e.k.endsWith(`:${e.w}`);
        return true;
      },
    });
    this.store = new ViewStore(() => this.compute());
    // Sảnh cho biết còn ai khác đang ở phòng này: nếu kênh phòng vẫn trống thì lần bắt tay trước đã hỏng → vào lại.
    this.redialer = new Redialer(channel, () => {
      const ad = lobby.roomAd(id);
      return (!!ad && ad.host !== me) || lobby.store.get().users.some((u) => u.room === id && u.uid !== me);
    });

    // Khôi phục khi tải lại trang: giữ được đồng hồ Lamport, nước đi, và quyền chủ phòng.
    try {
      const raw = sessionStorage.getItem(snapKey(id));
      if (raw) {
        const snap = JSON.parse(raw);
        this.gossip.restore(snap);
        if (Array.isArray(snap.chat)) this.chat = snap.chat;
        const mine = this.gossip.get<Member>(`p:${me}`);
        if (mine) {
          this.seq = mine.seq;
          this.joined = mine.joined;
          this.want = mine.want;
        }
      }
    } catch {}

    const create = takeCreate(id);
    if (create && !this.meta()) {
      const meta: Meta = {
        game: "caro",
        name: create.name,
        host: me,
        seats: create.seats,
        cap: create.cap,
        opts: create.opts,
        status: "waiting",
        round: 0,
        players: [me],
        lineup: [],
        ack: {},
        kicked: [],
        created: Date.now(),
      };
      this.gossip.set("meta", meta);
    }

    this.gossip.onChange((keys) => {
      for (const k of keys) {
        if (k.startsWith("p:")) {
          const m = this.gossip.get<Member>(k);
          if (m) this.live.observe(k.slice(2), m.hb, !!m.left);
        }
        if (k === "meta") this.onMeta();
      }
      this.schedulePersist();
      this.react();
    });
    this.gossip.onRumor((r) => this.onRumor(r));
    channel.onPeerJoin((peer) => {
      // Gửi lịch sử chat cho người mới; họ tự khử trùng lặp theo id.
      const hist = this.chat.filter((m) => !m.system).slice(-60);
      this.gossip.replay(
        hist.map((m) => ({ id: m.id, t: "chat", p: m })),
        peer,
      );
      this.store.invalidate();
    });
    channel.onPeerLeave(() => this.store.invalidate());

    for (const e of this.gossip.scan<Member>("p:")) this.live.observe(e.k.slice(2), e.v.hb, !!e.v.left);
    if (this.meta()) this.onMeta();
    this.beat(true);
    this.gossip.start();
    this.timers.push(setInterval(() => this.beat(false), HEARTBEAT_MS));
    this.timers.push(setInterval(() => this.react(), 1000));
  }

  // ---------- trạng thái ----------

  meta() {
    return this.gossip.get<Meta>("meta");
  }

  private members(): Member[] {
    return this.gossip.scan<Member>("p:").map((e) => e.v);
  }

  private isOnline(uid: string) {
    return uid === this.me ? this.phase === "ready" || this.phase === "connecting" : this.live.alive(uid);
  }

  private beat(eager: boolean) {
    if (this.phase === "kicked" || this.phase === "left" || this.phase === "full" || this.phase === "notfound") return;
    const me: Member = {
      uid: this.me,
      peer: this.channel.selfId,
      hb: Date.now(),
      joined: this.joined,
      want: this.want,
      seq: this.seq,
      ...this.profile,
    };
    this.gossip.set(`p:${this.me}`, me, eager);
  }

  private onMeta() {
    const m = this.meta();
    if (!m) return;
    if (!this.metaSeenAt) this.metaSeenAt = Date.now();
    // Dọn nhật ký các ván cũ (ai cũng dọn như nhau nên không bị "sống lại" qua anti-entropy).
    for (const e of [...this.gossip.scan("g:"), ...this.gossip.scan("x:")]) {
      const r = Number(e.k.split(":")[1]);
      if (r < m.round) this.gossip.prune(e.k);
    }
    if (m.kicked.includes(this.me) && this.phase !== "kicked") {
      this.phase = "kicked";
      this.shutdown(false);
    }
  }

  /** Vòng lặp chính: chuyển pha, bầu lại chủ phòng, chủ phòng xử lý ý định, nhắn hệ thống. */
  private react() {
    const now = Date.now();
    if (this.phase === "connecting" || this.phase === "ready") this.redialer.check(now);
    const m = this.meta();
    if (this.phase === "connecting") {
      // Chờ một nhịp để biết đủ ai đang trong phòng (kiểm tra sức chứa); chủ phòng thì vào ngay.
      if (m && (m.host === this.me || now - this.metaSeenAt >= SETTLE_MS)) {
        if (m.kicked.includes(this.me)) {
          this.phase = "kicked";
          this.shutdown(false);
        } else {
          const others = this.members().filter((p) => p.uid !== this.me && this.live.alive(p.uid) && !m.kicked.includes(p.uid)).length;
          const seated = m.players.includes(this.me) || m.host === this.me;
          if (!seated && others >= m.cap) {
            this.phase = "full";
            this.shutdown(true);
          } else {
            this.phase = "ready";
            this.prevOnline = this.onlineSet();
          }
        }
      } else if (!m && now - this.openedAt > (this.lobby.roomAd(this.id) ? NOT_FOUND_ADVERTISED_MS : NOT_FOUND_MS)) {
        this.phase = "notfound";
        this.shutdown(true);
      }
    }
    if (this.phase === "ready" && m) {
      this.announceChanges(m);
      this.maybeTakeOver(m);
      if (this.meta()?.host === this.me) this.hostLoop();
    }
    this.store.invalidate();
  }

  private onlineSet() {
    const kicked = this.meta()?.kicked ?? [];
    return new Set(this.members().filter((p) => this.isOnline(p.uid) && !kicked.includes(p.uid)).map((p) => p.uid));
  }

  private announceChanges(m: Meta) {
    const online = this.onlineSet();
    const name = (uid: string) => this.gossip.get<Member>(`p:${uid}`)?.name ?? "Ai đó";
    for (const uid of online) if (!this.prevOnline.has(uid)) this.system(`${name(uid)} đã vào phòng`);
    for (const uid of this.prevOnline) if (!online.has(uid)) this.system(`${name(uid)} đã rời phòng`);
    this.prevOnline = online;
    const status = `${m.status}:${m.round}`;
    if (this.lastStatus && status !== this.lastStatus) {
      if (m.status === "playing") this.system(`Ván ${m.round} bắt đầu!`);
      if (m.status === "ended" && m.result) {
        const r = m.result;
        this.system(
          r.winner
            ? `${name(r.winner)} thắng ván ${r.round}${r.reason === "resign" ? " (đối thủ xin thua)" : r.reason === "leave" ? " (đối thủ rời trận)" : r.reason === "kick" ? " (đối thủ bị mời ra)" : ""}`
            : `Ván ${r.round} hoà`,
        );
      }
    }
    this.lastStatus = status;
  }

  private successor(m: Meta, exclude: string): string | undefined {
    const alive = this.members().filter((p) => p.uid !== exclude && !m.kicked.includes(p.uid) && this.isOnline(p.uid));
    const seat = (u: string) => {
      const i = m.players.indexOf(u);
      return i < 0 ? 99 : i;
    };
    alive.sort((a, b) => seat(a.uid) - seat(b.uid) || a.joined - b.joined || (a.uid < b.uid ? -1 : 1));
    return alive[0]?.uid;
  }

  private maybeTakeOver(m: Meta) {
    if (m.host === this.me || Date.now() - this.openedAt < HOST_TAKEOVER_MS + SETTLE_MS) return;
    if (this.live.silentFor(m.host) < HOST_TAKEOVER_MS) return;
    if (this.successor(m, m.host) !== this.me) return;
    this.gossip.set<Meta>("meta", { ...m, host: this.me });
    this.system("Chủ phòng mất kết nối — bạn trở thành chủ phòng mới");
  }

  /** Chủ phòng: xử lý ý định vào/rời ghế, loại người rớt mạng, chốt kết quả ván, quảng bá phòng ra sảnh. */
  private hostLoop() {
    const cur = this.meta()!;
    const m: Meta = structuredClone(cur);
    let dirty = false;
    const members = this.members();

    if (m.status !== "playing") {
      for (const p of members.sort((a, b) => a.hb - b.hb)) {
        if (p.seq <= (m.ack[p.uid] ?? 0) || !this.isOnline(p.uid) || m.kicked.includes(p.uid)) continue;
        m.ack[p.uid] = p.seq;
        dirty = true;
        const i = m.players.indexOf(p.uid);
        if (p.want === "play" && i < 0 && m.players.length < m.seats) m.players.push(p.uid);
        if (p.want === "watch" && i >= 0) m.players.splice(i, 1);
      }
      const before = m.players.length;
      m.players = m.players.filter((u) => u === this.me || this.live.silentFor(u) < DROP_SEAT_MS);
      if (m.players.length !== before) dirty = true;
    } else {
      const g = this.gameOf(m);
      if (g.result) {
        m.status = "ended";
        m.result = g.result;
        dirty = true;
      } else {
        const gone = m.lineup.find((u) => u !== this.me && this.live.silentFor(u) >= FORFEIT_MS);
        if (gone) {
          m.status = "ended";
          m.result = { round: m.round, winner: m.lineup.find((u) => u !== gone) ?? null, loser: gone, reason: "leave" };
          dirty = true;
        }
      }
    }
    if (dirty) this.gossip.set("meta", m);

    const now = Date.now();
    if (dirty || now - this.lastAd > 4000) {
      this.lastAd = now;
      const host = this.gossip.get<Member>(`p:${this.me}`);
      this.lobby.publishRoom(
        {
          id: this.id,
          game: m.game,
          name: m.name,
          host: this.me,
          hostName: host?.name ?? this.profile.name,
          hostAvatar: host?.avatar ?? this.profile.avatar,
          cap: m.cap,
          seats: m.seats,
          members: this.onlineSet().size,
          players: m.players.length,
          status: m.status,
          opts: m.opts,
        },
        dirty,
      );
    }
  }

  private gameOf(m: Meta) {
    const moves = this.gossip.get<{ moves: Move[] }>(`g:${m.round}`)?.moves ?? [];
    const state = replay(moves, m.opts);
    let result: Result | undefined;
    if (state.winner) result = { round: m.round, winner: m.lineup[state.winner - 1] ?? null, loser: m.lineup[2 - state.winner], reason: "line" };
    else if (state.draw) result = { round: m.round, winner: null, reason: "draw" };
    else {
      const quitter = m.lineup.find((u) => this.gossip.get(`x:${m.round}:${u}`));
      if (quitter) result = { round: m.round, winner: m.lineup.find((u) => u !== quitter) ?? null, loser: quitter, reason: "resign" };
      else if (m.result?.round === m.round) result = m.result;
    }
    return { state, moves, result };
  }

  private compute(): RoomView {
    const m = this.meta();
    const members = this.members();
    const byUid = new Map(members.map((p) => [p.uid, p]));
    const online = new Set(members.filter((p) => this.isOnline(p.uid) && !m?.kicked.includes(p.uid)).map((p) => p.uid));
    const seatOf = (uid: string): SeatView => ({ uid, member: byUid.get(uid), online: online.has(uid) });
    const base: RoomView = {
      phase: this.phase,
      me: this.me,
      meta: m,
      isHost: m?.host === this.me,
      peers: this.channel.peers().length,
      members: members.filter((p) => online.has(p.uid)),
      online,
      seats: [],
      spectators: [],
      mySeat: -1,
      pending: null,
      chat: this.chat,
    };
    if (!m) return base;
    base.seats = m.players.map(seatOf);
    base.mySeat = m.players.indexOf(this.me);
    base.spectators = members
      .filter((p) => online.has(p.uid) && !m.players.includes(p.uid) && !m.kicked.includes(p.uid))
      .sort((a, b) => a.joined - b.joined);
    if (this.seq > (m.ack[this.me] ?? 0)) base.pending = this.want;
    if (m.round > 0 && m.lineup.length === 2) {
      const g = this.gameOf(m);
      const myMark = (m.lineup.indexOf(this.me) + 1) as 0 | 1 | 2;
      base.game = {
        round: m.round,
        state: g.state,
        lineup: m.lineup.map(seatOf),
        myMark,
        myTurn: m.status === "playing" && !g.result && myMark > 0 && g.state.turn === myMark,
        result: g.result,
      };
    }
    return base;
  }

  // ---------- chat ----------

  private onRumor(r: Rumor) {
    if (r.t !== "chat") return;
    const msg = r.p as ChatMsg;
    if (!msg || typeof msg.uid !== "string" || (!msg.text && !msg.sticker)) return;
    this.pushChat({ ...msg, id: r.id, text: msg.text?.slice(0, 300) });
  }

  private pushChat(msg: ChatMsg) {
    if (this.chat.some((c) => c.id === msg.id)) return;
    this.chat = [...this.chat, msg].sort((a, b) => a.at - b.at).slice(-CHAT_LIMIT);
    for (const fn of this.chatFns) fn(msg);
    this.schedulePersist();
    this.store.invalidate();
  }

  private system(text: string) {
    this.pushChat({ id: `sys:${Date.now()}:${Math.random()}`, uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true });
  }

  onChat(fn: (m: ChatMsg) => void) {
    this.chatFns.add(fn);
    return () => {
      this.chatFns.delete(fn);
    };
  }

  send(content: { text: string } | { sticker: StickerId }) {
    if (this.phase !== "ready") return;
    const { name, avatar, color } = this.profile;
    const body: ChatMsg = { id: "", uid: this.me, name, avatar, color, at: Date.now(), ...content };
    if ("text" in content) {
      const text = content.text.trim().slice(0, 300);
      if (!text) return;
      body.text = text;
    }
    const r = this.gossip.broadcast("chat", body);
    this.pushChat({ ...body, id: r.id });
  }

  // ---------- hành động người chơi ----------

  private intend(want: "play" | "watch") {
    this.want = want;
    this.seq++;
    this.beat(true);
    this.react();
  }

  join() {
    this.intend("play");
  }

  leaveSeat() {
    this.intend("watch");
  }

  setProfile(p: Profile) {
    this.profile = p;
    this.beat(true);
  }

  move(x: number, y: number) {
    const m = this.meta();
    const v = this.store.get();
    if (!m || !v.game?.myTurn) return;
    const moves = this.gossip.get<{ moves: Move[] }>(`g:${m.round}`)?.moves ?? [];
    const next: Move[] = [...moves, [x, y]];
    if (replay(next, m.opts).count !== next.length) return;
    this.gossip.set(`g:${m.round}`, { moves: next });
    this.react();
  }

  resign() {
    const m = this.meta();
    if (!m || m.status !== "playing" || !m.lineup.includes(this.me)) return;
    this.gossip.set(`x:${m.round}:${this.me}`, { resign: true });
    this.react();
  }

  // ---------- hành động chủ phòng ----------

  private hostEdit(fn: (m: Meta) => boolean | void) {
    const cur = this.meta();
    if (!cur || cur.host !== this.me) return;
    const m = structuredClone(cur);
    if (fn(m) === false) return;
    this.gossip.set("meta", m);
    this.react();
  }

  start() {
    this.hostEdit((m) => {
      if (m.status === "playing" || m.players.length !== m.seats) return false;
      if (m.players.some((u) => !this.isOnline(u))) return false;
      m.round += 1;
      m.status = "playing";
      // Luân phiên người đi trước giữa các ván.
      m.lineup = m.round % 2 === 1 ? [...m.players] : [...m.players].reverse();
      delete m.result;
    });
  }

  kick(uid: string) {
    if (uid === this.me) return;
    this.hostEdit((m) => {
      if (m.kicked.includes(uid)) return false;
      m.kicked.push(uid);
      m.players = m.players.filter((u) => u !== uid);
      if (m.status === "playing" && m.lineup.includes(uid)) {
        m.status = "ended";
        m.result = { round: m.round, winner: m.lineup.find((u) => u !== uid) ?? null, loser: uid, reason: "kick" };
      }
    });
  }

  /** Chủ phòng kéo một người xem vào ghế trống. */
  seat(uid: string) {
    this.hostEdit((m) => {
      if (m.status === "playing" || m.players.includes(uid) || m.players.length >= m.seats || !this.isOnline(uid)) return false;
      m.players.push(uid);
    });
  }

  /** Chủ phòng mời một người chơi ra khỏi ghế (vẫn ở lại xem). */
  unseat(uid: string) {
    this.hostEdit((m) => {
      if (m.status === "playing" || !m.players.includes(uid)) return false;
      m.players = m.players.filter((u) => u !== uid);
    });
  }

  makeHost(uid: string) {
    this.hostEdit((m) => {
      if (!this.isOnline(uid) || uid === this.me) return false;
      m.host = uid;
    });
  }

  // ---------- vòng đời ----------

  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (this.phase !== "ready" && this.phase !== "connecting") return;
      try {
        sessionStorage.setItem(snapKey(this.id), JSON.stringify({ ...this.gossip.snapshot(), chat: this.chat.slice(-60) }));
      } catch {}
    }, 800);
  }

  /** Rời phòng chủ động: chủ phòng bàn giao cho người kế nhiệm, hoặc đóng phòng nếu không còn ai. */
  leave() {
    if (this.phase === "ready") {
      const m = this.meta();
      if (m && m.host === this.me) {
        const next = this.successor(m, this.me);
        if (next) this.gossip.set<Meta>("meta", { ...m, host: next, players: m.status === "playing" ? m.players : m.players.filter((u) => u !== this.me) });
        else this.lobby.closeRoom(this.id);
      }
    }
    this.phase = this.phase === "ready" || this.phase === "connecting" ? "left" : this.phase;
    this.shutdown(true);
  }

  private shutdown(sayGoodbye: boolean) {
    if (sayGoodbye) {
      const cur = this.gossip.get<Member>(`p:${this.me}`);
      if (cur && !cur.left) this.gossip.set(`p:${this.me}`, { ...cur, hb: Date.now(), left: true });
    }
    try {
      sessionStorage.removeItem(snapKey(this.id));
    } catch {}
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.gossip.stop();
    this.channel.release();
    this.store.invalidate();
  }

  /** Huỷ phiên khi component unmount (vd. chuyển trang); khác `leave()` ở chỗ giữ snapshot nếu chỉ là tải lại. */
  dispose() {
    if (this.phase === "ready" || this.phase === "connecting") this.leave();
    else this.shutdown(false);
  }
}
