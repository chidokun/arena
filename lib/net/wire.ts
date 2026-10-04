/**
 * Lớp vận chuyển P2P dựa trên Trystero (WebRTC; tín hiệu bắt tay đi qua relay Nostr công khai — không có server riêng).
 * Mỗi "kênh" (sảnh, từng phòng) là một room Trystero. Kênh được đếm tham chiếu để React Strict Mode
 * hay việc chuyển trang nhanh không làm rời rồi vào lại room liên tục.
 */
import type { Wire, WireKind } from "./gossip";

export const APP_ID = "arena.nguyentuan.dev/v1";
const KINDS: WireKind[] = ["dig", "dlt", "req", "rum"];
const LEAVE_DELAY_MS = 1500;

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
  senders = new Map<WireKind, Send>();

  constructor(
    readonly name: string,
    readonly room: TrysteroRoom,
  ) {
    for (const kind of KINDS) {
      const action = room.makeAction(kind);
      this.senders.set(kind, action.send as unknown as Send);
      action.onMessage = (data, ctx) => {
        for (const fn of this.handlers.get(kind) ?? []) fn(data, ctx.peerId);
      };
    }
    room.onPeerJoin = (peer) => {
      this.peers.add(peer);
      for (const fn of this.joins) fn(peer);
    };
    room.onPeerLeave = (peer) => {
      this.peers.delete(peer);
      for (const fn of this.leaves) fn(peer);
    };
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
  onPeerLeave(fn: PeerFn): void;
  release(): void;
};

/** Mở (hoặc dùng lại) một kênh P2P. Gọi `release()` khi không dùng nữa. */
export async function openChannel(name: string): Promise<Channel> {
  const { joinRoom, selfId } = await import("trystero");
  let hub = hubs.get(name);
  if (!hub) {
    // Relay công khai đôi khi chết; nối nhiều hơn mặc định để hai bên chắc chắn gặp nhau ở ít nhất một relay.
    // Mỗi kênh một appId riêng: Trystero dùng chung kết nối WebRTC giữa các room cùng appId, và cơ chế đó
    // không ổn định khi vào phòng mới lúc đã nối sẵn ở sảnh. Tách ra thì mỗi kênh tự bắt tay độc lập.
    hub = new Hub(name, joinRoom({ appId: `${APP_ID}/${name}`, relayConfig: { redundancy: 7, warnOnRelayFailure: false } }, name));
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
    peers: () => [...h.peers],
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
