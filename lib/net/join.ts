/**
 * Tiến độ vào phòng: trong lúc bắt tay với những người đã ở trong phòng, cho biết đã nối được với bao nhiêu người.
 */
import type { Profile } from "../identity";

/** Một người đã biết là đang ở trong phòng, lúc mình còn đang vào: đã nối trực tiếp (P2P) được với họ chưa. */
export type JoinPeer = Pick<Profile, "name" | "avatar" | "color"> & { uid: string; linked: boolean };

export type JoinProgress = {
  /** Những người khác trong phòng mà mình biết tới (qua sảnh, hoặc qua gossip của phòng), chủ phòng đứng đầu. */
  people: JoinPeer[];
  /** Đã nhận được trạng thái phòng — chỉ còn chờ một nhịp cho đủ người. */
  synced: boolean;
  /** Số máy bắt tay được nhưng không nối thông (mạng chặn P2P). */
  unreachable: number;
};

type Presence = Profile & { uid: string; peer: string; room?: string; left?: boolean };

/**
 * Gộp người trong phòng thấy được từ sảnh (`room` trùng) và từ bản ghi hiện diện của phòng,
 * đánh dấu ai đã nối trực tiếp. Trystero dùng chung một `selfId` cho mọi kênh nên peer ở sảnh cũng là peer ở phòng.
 */
export function joinProgress(o: {
  me: string;
  room: string;
  host?: string;
  lobby: Presence[];
  members: Presence[];
  peers: string[];
  kicked?: string[];
  synced: boolean;
  unreachable: number;
}): JoinProgress {
  const peers = new Set(o.peers);
  const people = new Map<string, JoinPeer>();
  const add = (u: Presence) => {
    if (u.uid === o.me || u.left || o.kicked?.includes(u.uid)) return;
    const linked = peers.has(u.peer) || !!people.get(u.uid)?.linked;
    people.set(u.uid, { uid: u.uid, name: u.name, avatar: u.avatar, color: u.color, linked });
  };
  for (const u of o.lobby) if (u.room === o.room) add(u);
  for (const p of o.members) add(p);
  const list = [...people.values()].sort((a, b) => Number(b.uid === o.host) - Number(a.uid === o.host) || a.name.localeCompare(b.name));
  return { people: list, synced: o.synced, unreachable: o.unreachable };
}
