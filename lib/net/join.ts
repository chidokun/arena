import type { Profile } from "../identity";

export type JoinPeer = Pick<Profile, "name" | "avatar" | "color"> & { uid: string; linked: boolean };

export type JoinProgress = {
  people: JoinPeer[];
  synced: boolean;
  unreachable: number;
};

type Presence = Profile & { uid: string; peer: string; room?: string; left?: boolean };

// Trystero dùng chung một `selfId` cho mọi kênh nên peer ở sảnh cũng là peer ở phòng.
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
