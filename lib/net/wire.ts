// Kênh được đếm tham chiếu để React Strict Mode hay việc chuyển trang nhanh không làm rời rồi vào lại room liên tục.
import type { Wire, WireKind } from "./gossip";
import { currentTurn, forceRelay, turnOnAnswer, turnServers } from "./ice";
import { Mesh, type MeshLimit } from "./mesh";

export const APP_ID = "arena.nguyentuan.dev/v1";
const KINDS: WireKind[] = ["dig", "dlt", "req", "rum"];
const LEAVE_DELAY_MS = 1500;
// Trystero thử lại khi vào lại room nên chỉ tính "không nối được" trong một khoảng.
const UNREACHABLE_TTL_MS = 90000;
/**
 * Relay Nostr cố định thay cho danh sách mặc định của Trystero (nhiều relay trong đó đã chết hoặc chặn event
 * ephemeral). Ưu tiên relay lớn, lâu đời; tất cả đã thử nhận/phát event kiểu Trystero. Mọi máy phải dùng cùng
 * danh sách — đổi ở đây thì bản cũ và bản mới có thể không gặp nhau cho tới khi mọi người tải lại trang.
 */
const RELAY_URLS = [
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nostr.mom",
  "wss://purplerelay.com",
  "wss://relay.snort.social",
  "wss://nostr-pub.wellorder.net",
  "wss://nostr-01.yakihonne.com",
];

type Handler = (data: unknown, from: string) => void;
type PeerFn = (peer: string) => void;

type TrysteroRoom = import("trystero").Room;
type Send = (data: unknown, opts?: { target?: string | string[] }) => Promise<void>;

class Hub {
  refs = 0;
  leaveTimer: ReturnType<typeof setTimeout> | null = null;
  handlers = new Map<WireKind, Set<Handler>>();
  joins = new Set<PeerFn>();
  leaves = new Set<PeerFn>();
  peers = new Set<string>();
  unreachable = new Map<string, number>();
  senders = new Map<WireKind, Send>();
  room!: TrysteroRoom;
  private rejoining: Promise<void> | null = null;

  constructor(
    readonly name: string,
    private join: (hub: Hub) => TrysteroRoom,
    readonly mesh: Mesh | null = null,
  ) {
    this.bind();
  }

  private bind() {
    const room = this.join(this);
    this.room = room;
    for (const kind of KINDS) {
      const action = room.makeAction(kind);
      this.senders.set(kind, action.send as unknown as Send);
      action.onMessage = (data, ctx) => {
        if (this.room !== room) return;
        for (const fn of this.handlers.get(kind) ?? []) fn(data, ctx.peerId);
      };
    }
    room.onPeerJoin = (peer) => {
      if (this.room !== room) return;
      this.peers.add(peer);
      this.unreachable.delete(peer);
      this.mesh?.joined(peer);
      for (const fn of this.joins) fn(peer);
    };
    room.onPeerLeave = (peer) => {
      if (this.room !== room || !this.peers.delete(peer)) return;
      this.mesh?.left(peer);
      for (const fn of this.leaves) fn(peer);
    };
  }

  // Rời room rồi vào lại để bắt tay từ đầu: Trystero không tự thử lại với peer đã từng thất bại.
  noteFailure(peer: string) {
    this.mesh?.failed(peer);
    if (!this.peers.has(peer)) this.unreachable.set(peer, Date.now());
  }

  // Trystero (đã vá, xem patches/) hỏi trước khi bắt tay với peer mới.
  admit(peer: string) {
    return !this.mesh || this.mesh.admit(peer, this.peers);
  }

  trim() {
    const peer = this.mesh?.pickDrop(this.peers);
    if (!peer) return;
    this.mesh!.ban(peer);
    this.room.dropPeer(peer);
  }

  unreachableCount(now = Date.now()) {
    for (const [p, at] of this.unreachable) if (now - at > UNREACHABLE_TTL_MS) this.unreachable.delete(p);
    return this.unreachable.size;
  }

  rejoin() {
    this.rejoining ??= (async () => {
      const old = this.room;
      for (const p of [...this.peers]) {
        this.peers.delete(p);
        for (const fn of this.leaves) fn(p);
      }
      this.mesh?.reset();
      await old.leave().catch(() => {});
      this.bind();
    })().finally(() => {
      this.rejoining = null;
    });
    return this.rejoining;
  }

  send(kind: WireKind, data: unknown, to?: string | string[]) {
    if (to != null && (Array.isArray(to) ? to.length === 0 : !this.peers.has(to))) return;
    if (to == null && this.peers.size === 0) return;
    this.senders
      .get(kind)!(data, to == null ? undefined : { target: to })
      .catch(() => {
        // Peer vừa rớt giữa chừng; anti-entropy sẽ bù lại.
      });
  }
}

const hubs = new Map<string, Hub>();
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") (window as unknown as { __arenaHubs: Map<string, Hub> }).__arenaHubs = hubs;

export type Channel = Wire & {
  selfId: string;
  // Chỉ có ý nghĩa với kênh mở kèm giới hạn kết nối.
  limit: MeshLimit | null;
  useNeighbors(fn: (peer: string) => readonly string[] | undefined): void;
  trim(): void;
  onPeerLeave(fn: PeerFn): void;
  unreachable(): number;
  // Có ít nhất một relay Nostr đang mở, tức mạng vẫn ổn dù có thể chưa nối được peer nào.
  signaling(): boolean;
  rejoin(): Promise<void>;
  release(): void;
};

export async function openChannel(name: string, limit?: MeshLimit): Promise<Channel> {
  const mod = await import("trystero");
  const { joinRoom, selfId, getRelaySockets } = mod;
  if (process.env.NODE_ENV !== "production") (window as unknown as { __trystero: typeof mod }).__trystero = mod;
  await turnServers();
  const relayOnly = forceRelay();
  let hub = hubs.get(name);
  if (!hub) {
    // Relay công khai đôi khi chết; nối nhiều relay để hai bên chắc chắn gặp nhau ở ít nhất một relay.
    // Mỗi kênh một appId riêng: Trystero dùng chung kết nối WebRTC giữa các room cùng appId, và cơ chế đó
    // không ổn định khi vào phòng mới lúc đã nối sẵn ở sảnh. Tách ra thì mỗi kênh tự bắt tay độc lập.
    hub = new Hub(
      name,
      (h) =>
        joinRoom(
          {
            appId: `${APP_ID}/${name}`,
            relayConfig: { urls: RELAY_URLS, warnOnRelayFailure: false },
            // Bình thường chỉ phía trả lời offer mới xin TURN (xem lib/net/ice.ts). Ở chế độ `?relay` thì mọi kết
            // nối đều phải có TURN, nếu không phía chào hàng sẽ không có ứng viên ICE nào.
            ...(relayOnly
              ? { turnConfig: currentTurn(), rtcConfig: { iceTransportPolicy: "relay" as const } }
              : { rtcPolyfill: turnOnAnswer(currentTurn) }),
            ...(h.mesh ? { admit: (peer: string) => h.admit(peer) } : {}),
          },
          name,
          {
            onJoinError: (d) => {
              h.noteFailure(d.peerId);
              console.warn(
                `[arena] kênh ${name}: không nối được peer ${d.peerId} (${currentTurn().length ? "đã có TURN" : "không có TURN"})`,
                d.error,
              );
            },
          },
        ),
      limit ? new Mesh(limit, selfId) : null,
    );
    hubs.set(name, hub);
  }
  const h = hub;
  h.refs++;
  if (h.leaveTimer) {
    clearTimeout(h.leaveTimer);
    h.leaveTimer = null;
  }
  const mine: (() => void)[] = [];
  const add = <T>(set: Set<T>, fn: T) => {
    set.add(fn);
    mine.push(() => set.delete(fn));
  };
  let released = false;
  return {
    selfId,
    limit: h.mesh?.limit ?? null,
    useNeighbors: (fn) => h.mesh?.useNeighbors(fn),
    trim: () => {
      if (!released) h.trim();
    },
    peers: () => [...h.peers],
    unreachable: () => h.unreachableCount(),
    signaling: () => Object.values(getRelaySockets() as Record<string, WebSocket>).some((s) => s.readyState === WebSocket.OPEN),
    send: (kind, data, to) => {
      if (!released) h.send(kind, data, to);
    },
    on(kind, fn) {
      if (!h.handlers.has(kind)) h.handlers.set(kind, new Set());
      add(h.handlers.get(kind)!, fn);
    },
    onPeerJoin(fn) {
      add(h.joins, fn);
      for (const p of h.peers) fn(p);
    },
    onPeerLeave(fn) {
      add(h.leaves, fn);
    },
    rejoin: () => (released ? Promise.resolve() : h.rejoin()),
    release() {
      if (released) return;
      released = true;
      for (const off of mine) off();
      if (--h.refs > 0) return;
      h.leaveTimer = setTimeout(() => {
        if (h.refs > 0) return;
        hubs.delete(name);
        void h.room.leave();
      }, LEAVE_DELAY_MS);
    },
  };
}

export class Redialer {
  private emptySince = 0;
  private lastTry = 0;
  private wait: number;
  private channel: Channel;
  private expectPeers: () => boolean;
  private base: number;
  private max: number;

  constructor(channel: Channel, expectPeers: () => boolean, base = 8000, max = 30000) {
    this.channel = channel;
    this.expectPeers = expectPeers;
    this.base = base;
    this.max = max;
    this.wait = base;
  }

  check(now = Date.now()) {
    if (this.channel.peers().length > 0) {
      this.emptySince = 0;
      this.wait = this.base;
      return;
    }
    if (!this.emptySince) this.emptySince = now;
    if (now - this.emptySince < this.wait || now - this.lastTry < this.wait || !this.expectPeers()) return;
    this.lastTry = now;
    this.wait = Math.min(this.wait * 2, this.max);
    void this.channel.rejoin();
  }
}
