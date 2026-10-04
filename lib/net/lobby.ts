/**
 * Sảnh chung: mọi người đang mở trang đều ở chung một kênh gossip để biết ai đang online, đang ở game nào,
 * và phòng nào đang mở (chủ phòng quảng bá). Trang chủ đếm số phòng / số người từ đây.
 */
import type { Profile } from "../identity";
import { Gossip, Liveness } from "./gossip";
import { ViewStore } from "./view-store";
import { openChannel, Redialer, type Channel } from "./wire";

export type Where = { game?: string; room?: string };

export type LobbyUser = Profile & Where & { uid: string; peer: string; hb: number; left?: boolean };

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
  /** Lô tô: số tờ đã có người chọn. */
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
  peers: number;
  users: LobbyUser[];
  rooms: RoomAd[];
};

const HEARTBEAT_MS = 3000;
const USER_TIMEOUT_MS = 12000;
const AD_TIMEOUT_MS = 15000;
const PRUNE_AFTER_MS = 60000;

export class Lobby {
  readonly uid: string;
  private profile: Profile;
  private where: Where = {};
  private channel: Channel;
  readonly gossip: Gossip;
  private users = new Liveness(USER_TIMEOUT_MS);
  private ads = new Liveness(AD_TIMEOUT_MS);
  private timers: ReturnType<typeof setInterval>[] = [];
  private inviteFns = new Set<(i: Invite) => void>();
  private redialer: Redialer;
  readonly store: ViewStore<LobbyView>;

  static async open(uid: string, profile: Profile) {
    const channel = await openChannel("lobby");
    return new Lobby(uid, profile, channel);
  }

  private constructor(uid: string, profile: Profile, channel: Channel) {
    this.uid = uid;
    this.profile = profile;
    this.channel = channel;
    this.gossip = new Gossip(uid, channel, {
      fanout: 3,
      intervalMs: 1500,
      // Bản ghi hiện diện chỉ chính chủ được ghi.
      accept: (e) => !e.k.startsWith("u:") || e.k === `u:${e.w}`,
    });
    this.store = new ViewStore(() => this.compute());
    // Ở sảnh không biết trước có ai khác không, nên cứ thử lại thưa dần (15s → 60s) khi đang một mình.
    this.redialer = new Redialer(channel, () => true, 15000, 60000);
    this.gossip.onChange((keys) => {
      for (const k of keys) this.observe(k);
      this.store.invalidate();
    });
    this.gossip.onRumor((r) => {
      if (r.t !== "invite") return;
      const inv = r.p as Invite;
      if (inv?.to === this.uid) for (const fn of this.inviteFns) fn(inv);
    });
    channel.onPeerJoin(() => this.store.invalidate());
    channel.onPeerLeave(() => this.store.invalidate());
    this.beat(true);
    this.gossip.start();
    this.timers.push(
      setInterval(() => this.beat(false), HEARTBEAT_MS),
      setInterval(() => {
        this.redialer.check();
        this.store.invalidate();
      }, 2000),
      setInterval(() => this.prune(), 10000),
    );
  }

  private observe(k: string) {
    const e = this.gossip.entry<LobbyUser | RoomAd | null>(k);
    if (!e?.v) return;
    if (k.startsWith("u:")) {
      const u = e.v as LobbyUser;
      this.users.observe(k.slice(2), u.hb, !!u.left);
    } else if (k.startsWith("r:")) {
      const a = e.v as RoomAd;
      this.ads.observe(k.slice(2), a.hb, !!a.closed);
    }
  }

  private beat(eager: boolean) {
    const me: LobbyUser = { uid: this.uid, peer: this.channel.selfId, hb: Date.now(), ...this.profile, ...this.where };
    this.gossip.set(`u:${this.uid}`, me, eager);
  }

  private prune() {
    for (const e of this.gossip.scan<LobbyUser>("u:")) {
      if (this.users.silentFor(e.k.slice(2)) > PRUNE_AFTER_MS && e.w !== this.uid) {
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
    return { connected: this.channel.peers().length > 0, peers: this.channel.peers().length, users, rooms };
  }

  // ---------- API ----------

  setWhere(w: Where) {
    if (w.game === this.where.game && w.room === this.where.room) return;
    this.where = w;
    this.beat(true);
  }

  setProfile(p: Profile) {
    this.profile = p;
    this.beat(true);
  }

  /** Chủ phòng quảng bá phòng ra sảnh. Gọi định kỳ để làm mới nhịp tim của quảng cáo. */
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

  /** Báo rời đi ngay (đóng tab) để người khác không phải đợi hết hạn nhịp tim. */
  goodbye() {
    const cur = this.gossip.get<LobbyUser>(`u:${this.uid}`);
    if (cur) this.gossip.set(`u:${this.uid}`, { ...cur, hb: Date.now(), left: true });
  }

  close() {
    this.goodbye();
    for (const t of this.timers) clearInterval(t);
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

