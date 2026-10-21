import type { Profile } from "../identity";
import type { StickerId } from "../stickers";
import { Gossip, Liveness } from "./gossip";
import { CHAT_PERSIST, CHAT_RATE, CHAT_RATE_WINDOW_MS, CHAT_REPLAY, insertMsg, isFresh, RateLimit, readPublicMsg, TEXT_MAX, toPublicWire } from "./chat";
import type { ChatMsg } from "./room";
import { ViewStore } from "./view-store";
import { LOBBY_MESH, type MeshLimit } from "./mesh";
import { openChannel, Redialer, type Channel } from "./wire";

export type Where = { game?: string; room?: string };

// `nb`: peer id của các máy đang nối trực tiếp ở sảnh, để máy khác biết ai còn thiếu kết nối, cạnh nào cắt được (mesh.ts).
export type LobbyUser = Profile & Where & { uid: string; peer: string; hb: number; nb?: string[]; left?: boolean };

export type RoomAd = {
  id: string;
  game: string;
  name: string;
  host: string;
  hostName: string;
  hostAvatar: string;
  cap: number;
  seats: number;
  members: number;
  players: number;
  sheets?: number;
  status: "waiting" | "playing" | "ended";
  opts: Record<string, unknown>;
  hb: number;
  closed?: boolean;
};

export type Invite = {
  to: string;
  from: { uid: string; name: string; avatar: string; color: string };
  game: string;
  room: string;
  roomName: string;
};

export type LobbyView = {
  connected: boolean;
  // Mạng ổn (relay đã mở) và đã tìm đủ lâu mà chưa có peer nào — đang online một mình, không phải đang tìm.
  alone: boolean;
  peers: number;
  // Giới hạn kết nối trực tiếp ở sảnh (null: không giới hạn).
  limit: MeshLimit | null;
  unreachable: number;
  // Ping trung bình (ms) tới các peer nối trực tiếp; null khi chưa đo được.
  ping: number | null;
  users: LobbyUser[];
  rooms: RoomAd[];
};

const HEARTBEAT_MS = 3000;
// Sảnh chỉ nối vài máy nên nhịp tim đi qua nhiều peer trung gian, tới nơi không đều; hạn rộng để khỏi chập chờn.
const USER_TIMEOUT_MS = 20000;
const AD_TIMEOUT_MS = 25000;
const PRUNE_AFTER_MS = 60000;
const CHAT_KEY = "arena:public-chat";
// Relay vừa mở thì peer thường cần vài giây mới bắt tay xong; chưa coi là "một mình" ngay để khỏi nháy "1 người online".
const ALONE_AFTER_MS = 8000;
const PING_MS = 5000;

export class Lobby {
  readonly uid: string;
  private profile: Profile;
  private where: Where = {};
  private channel: Channel;
  readonly gossip: Gossip;
  private users = new Liveness(USER_TIMEOUT_MS);
  private ads = new Liveness(AD_TIMEOUT_MS);
  private neighbors = new Map<string, string[]>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private inviteFns = new Set<(i: Invite) => void>();
  private redialer: Redialer;
  readonly store: ViewStore<LobbyView>;
  private chat: ChatMsg[] = [];
  private chatFns = new Set<(m: ChatMsg) => void>();
  private chatRate = new RateLimit(CHAT_RATE, CHAT_RATE_WINDOW_MS);
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private signalingSince = 0;
  readonly chatStore = new ViewStore<ChatMsg[]>(() => this.chat);

  static async open(uid: string, profile: Profile) {
    const channel = await openChannel("lobby", LOBBY_MESH);
    return new Lobby(uid, profile, channel);
  }

  private constructor(uid: string, profile: Profile, channel: Channel) {
    this.uid = uid;
    this.profile = profile;
    this.channel = channel;
    this.gossip = new Gossip(uid, channel, {
      fanout: 3,
      intervalMs: 1500,
      accept: (e) => !e.k.startsWith("u:") || e.k === `u:${e.w}`,
    });
    this.store = new ViewStore(() => this.compute());
    channel.useNeighbors((peer) => this.neighbors.get(peer));
    // Ở sảnh không biết trước có ai khác không, nên cứ thử lại thưa dần (15s → 60s) khi đang một mình.
    this.redialer = new Redialer(channel, () => true, 15000, 60000);
    this.gossip.onChange((keys) => {
      for (const k of keys) this.observe(k);
      this.store.invalidate();
    });
    this.gossip.onRumor((r, _from, replayed) => {
      if (r.t === "chat") {
        const msg = readPublicMsg(r);
        // Lịch sử gửi lại cho người mới vào không tính vào nhịp gửi.
        if (msg && (replayed || this.chatRate.take(msg.uid))) this.pushChat(msg);
        return;
      }
      if (r.t !== "invite") return;
      const inv = r.p as Invite;
      if (inv?.to === this.uid) for (const fn of this.inviteFns) fn(inv);
    });
    this.restoreChat();
    channel.onPeerJoin((peer) => {
      // Gửi lịch sử chat công cộng (còn hạn) cho người mới nối; họ tự khử trùng lặp theo id.
      const now = Date.now();
      this.gossip.replay(
        this.chat
          .filter((m) => isFresh(m, now))
          .slice(-CHAT_REPLAY)
          .map((m) => ({ id: m.id, t: "chat", p: toPublicWire(m, now) })),
        peer,
      );
      this.measurePing();
      this.store.invalidate();
    });
    channel.onPeerLeave(() => this.store.invalidate());
    this.beat(true);
    this.gossip.start();
    this.timers.push(
      setInterval(() => this.beat(false), HEARTBEAT_MS),
      setInterval(() => {
        this.redialer.check();
        this.channel.trim();
        this.store.invalidate();
      }, 2000),
      setInterval(() => this.measurePing(), PING_MS),
      setInterval(() => {
        this.prune();
        this.chatRate.sweep();
      }, 10000),
    );
  }

  private observe(k: string) {
    const e = this.gossip.entry<LobbyUser | RoomAd | null>(k);
    if (!e?.v) return;
    if (k.startsWith("u:")) {
      const u = e.v as LobbyUser;
      this.users.observe(k.slice(2), u.hb, !!u.left);
      const nb = Array.isArray(u.nb) && !u.left ? u.nb.filter((p): p is string => typeof p === "string").slice(0, 32) : null;
      if (nb) this.neighbors.set(u.peer, nb);
      else this.neighbors.delete(u.peer);
    } else if (k.startsWith("r:")) {
      const a = e.v as RoomAd;
      this.ads.observe(k.slice(2), a.hb, !!a.closed);
    }
  }

  private measurePing() {
    void this.channel.measure().then(() => this.store.invalidate());
  }

  private beat(eager: boolean) {
    const me: LobbyUser = { uid: this.uid, peer: this.channel.selfId, hb: Date.now(), nb: this.channel.peers(), ...this.profile, ...this.where };
    this.gossip.set(`u:${this.uid}`, me, eager);
  }

  private prune() {
    for (const e of this.gossip.scan<LobbyUser>("u:")) {
      if (this.users.silentFor(e.k.slice(2)) > PRUNE_AFTER_MS && e.w !== this.uid) {
        this.neighbors.delete(e.v.peer);
        this.gossip.prune(e.k);
        this.users.forget(e.k.slice(2));
      }
    }
    for (const e of this.gossip.scan<RoomAd>("r:")) {
      if (this.ads.silentFor(e.k.slice(2)) > PRUNE_AFTER_MS) {
        this.gossip.prune(e.k);
        this.ads.forget(e.k.slice(2));
      }
    }
  }

  private compute(): LobbyView {
    const users = this.gossip
      .scan<LobbyUser>("u:")
      .map((e) => e.v)
      .filter((u) => u.uid === this.uid || this.users.alive(u.uid));
    const rooms = this.gossip
      .scan<RoomAd>("r:")
      .map((e) => e.v)
      .filter((a) => !a.closed && this.ads.alive(a.id))
      .sort((a, b) => Number(a.status === "playing") - Number(b.status === "playing") || b.members - a.members);
    const peers = this.channel.peers().length;
    const now = Date.now();
    if (!this.channel.signaling()) this.signalingSince = 0;
    else if (!this.signalingSince) this.signalingSince = now;
    const alone = peers === 0 && this.signalingSince > 0 && now - this.signalingSince >= ALONE_AFTER_MS;
    return { connected: peers > 0, alone, peers, limit: this.channel.limit, unreachable: this.channel.unreachable(), ping: this.channel.latency(), users, rooms };
  }

  private pushChat(msg: ChatMsg) {
    const next = insertMsg(this.chat, msg);
    if (!next) return;
    this.chat = next;
    for (const fn of this.chatFns) fn(msg);
    this.chatStore.invalidate();
    this.schedulePersist();
  }

  private restoreChat() {
    try {
      const list = JSON.parse(sessionStorage.getItem(CHAT_KEY) ?? "[]");
      if (!Array.isArray(list)) return;
      const now = Date.now();
      for (const m of list) {
        // Bản lưu ghi giờ theo đồng hồ máy mình: đổi ra tuổi để kiểm tra (và bỏ tin quá hạn) như tin nhận qua mạng.
        const ok = m && typeof m.id === "string" && typeof m.at === "number";
        const msg = ok ? readPublicMsg({ id: m.id, t: "chat", p: toPublicWire(m, now) }, now) : null;
        if (msg) this.chat = insertMsg(this.chat, msg) ?? this.chat;
      }
    } catch {}
  }

  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try {
        sessionStorage.setItem(CHAT_KEY, JSON.stringify(this.chat.slice(-CHAT_PERSIST)));
      } catch {}
    }, 800);
  }

  say(content: { text: string } | { sticker: StickerId }): boolean {
    const { name, avatar, color } = this.profile;
    const body: ChatMsg = { id: "", uid: this.uid, name, avatar, color, at: Date.now() };
    if ("text" in content) {
      const text = content.text.trim().slice(0, TEXT_MAX);
      if (!text) return true;
      body.text = text;
    } else body.sticker = content.sticker;
    if (!this.chatRate.take(this.uid)) return false;
    const r = this.gossip.broadcast("chat", toPublicWire(body, body.at));
    this.pushChat({ ...body, id: r.id });
    return true;
  }

  onChat(fn: (m: ChatMsg) => void) {
    this.chatFns.add(fn);
    return () => {
      this.chatFns.delete(fn);
    };
  }

  setWhere(w: Where) {
    if (w.game === this.where.game && w.room === this.where.room) return;
    this.where = w;
    this.beat(true);
  }

  setProfile(p: Profile) {
    this.profile = p;
    this.beat(true);
  }

  publishRoom(ad: Omit<RoomAd, "hb">, eager = true) {
    this.gossip.set(`r:${ad.id}`, { ...ad, hb: Date.now() } satisfies RoomAd, eager);
  }

  closeRoom(id: string) {
    const cur = this.gossip.get<RoomAd>(`r:${id}`);
    if (cur && !cur.closed) this.gossip.set(`r:${id}`, { ...cur, closed: true, hb: Date.now() });
  }

  roomAd(id: string): RoomAd | undefined {
    const a = this.gossip.get<RoomAd>(`r:${id}`);
    return a && !a.closed ? a : undefined;
  }

  invite(inv: Omit<Invite, "from">) {
    const { name, avatar, color } = this.profile;
    this.gossip.broadcast<Invite>("invite", { ...inv, from: { uid: this.uid, name, avatar, color } });
  }

  onInvite(fn: (i: Invite) => void) {
    this.inviteFns.add(fn);
    return () => {
      this.inviteFns.delete(fn);
    };
  }

  // Báo rời đi ngay khi đóng tab để người khác không phải đợi hết hạn nhịp tim.
  goodbye() {
    const cur = this.gossip.get<LobbyUser>(`u:${this.uid}`);
    if (cur) this.gossip.set(`u:${this.uid}`, { ...cur, hb: Date.now(), left: true });
  }

  close() {
    this.goodbye();
    for (const t of this.timers) clearInterval(t);
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.gossip.stop();
    this.channel.release();
  }
}

export function countFor(view: LobbyView, game: string) {
  return {
    rooms: view.rooms.filter((r) => r.game === game).length,
    players: view.users.filter((u) => u.game === game).length,
  };
}

