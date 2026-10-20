// Giới hạn số kết nối WebRTC của một kênh (dùng cho sảnh). Dưới mức mềm thì nhận mọi peer; từ mức mềm tới mức cứng
// chỉ nhận peer còn thiếu kết nối (hoặc chưa rõ, như người vừa vào) để người mới không bị bỏ rơi khi ai cũng đã đủ.
// Gossip lo phần còn lại: dữ liệu đi tiếp qua peer trung gian.
//
// Chỉ vậy thì nhóm người vào cùng lúc nối kín với nhau thành cụm, ai cũng đủ nên không nối sang cụm khác: lưới bị chia
// cắt. Vì thế mỗi cặp có một trọng số ngẫu nhiên mà hai bên tính ra như nhau (băm hai id); đã đủ thì vẫn nhận peer có
// cạnh nhẹ hơn cạnh nặng nhất đang có. Vượt mức mềm thì cắt cạnh nặng nhất, nhưng chỉ khi nó cũng là cạnh nặng nhất của
// đầu bên kia (theo danh sách hàng xóm họ công bố qua gossip): mỗi máy chỉ có một cạnh nặng nhất nên không bị hai người
// cùng cắt một lúc mà tụt dưới mức mềm. Lưới tự xáo về dạng đồ thị ngẫu nhiên (liền khối) rồi đứng yên.

export type MeshLimit = { soft: number; hard: number };

export const LOBBY_MESH: MeshLimit = { soft: 5, hard: 8 };

// Dài hơn hạn offer/answer của Trystero (~23s) để một lần bắt tay không bị tính hai chỗ.
const PENDING_TTL_MS = 30000;
// Peer vừa bị cắt không được nối lại ngay, nếu không Trystero bắt tay lại ở lần loan báo kế tiếp (~5s).
const BAN_MS = 60000;
// Cho danh sách hàng xóm của cả hai bên kịp lan qua gossip trước khi xét cắt cạnh mới.
const GRACE_MS = 30000;

// FNV-1a trên cặp id đã sắp xếp: hai đầu cạnh ra cùng một số.
export function pairWeight(a: string, b: string) {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Mesh {
  readonly limit: MeshLimit;
  private self: string;
  private now: () => number;
  private weights = new Map<string, number>();
  private pending = new Map<string, number>();
  private banned = new Map<string, number>();
  private since = new Map<string, number>();
  private neighbors: (peer: string) => readonly string[] | undefined = () => undefined;

  constructor(limit: MeshLimit, self: string, now: () => number = () => Date.now()) {
    this.limit = limit;
    this.self = self;
    this.now = now;
  }

  private weight(peer: string) {
    let w = this.weights.get(peer);
    if (w === undefined) {
      if (this.weights.size > 4096) this.weights.clear();
      w = pairWeight(this.self, peer);
      this.weights.set(peer, w);
    }
    return w;
  }

  // Hàng xóm (peer id) mà mỗi peer công bố gần nhất; undefined nếu chưa biết.
  useNeighbors(fn: (peer: string) => readonly string[] | undefined) {
    this.neighbors = fn;
  }

  admit(peer: string, connected: ReadonlySet<string>) {
    if (connected.has(peer)) return true;
    const now = this.now();
    const until = this.banned.get(peer);
    if (until !== undefined) {
      if (now < until) return false;
      this.banned.delete(peer);
    }
    for (const [p, at] of this.pending) if (now - at > PENDING_TTL_MS) this.pending.delete(p);
    if (this.pending.has(peer)) return true;
    const count = connected.size + this.pending.size;
    if (count >= this.limit.hard) return false;
    if (count >= this.limit.soft) {
      const d = this.neighbors(peer)?.length;
      const w = this.weight(peer);
      if (d !== undefined && d >= this.limit.soft && ![...connected].some((c) => this.weight(c) > w)) return false;
    }
    this.pending.set(peer, now);
    return true;
  }

  joined(peer: string) {
    this.pending.delete(peer);
    this.since.set(peer, this.now());
  }

  left(peer: string) {
    this.pending.delete(peer);
    this.since.delete(peer);
  }

  failed(peer: string) {
    this.pending.delete(peer);
  }

  reset() {
    this.pending.clear();
    this.since.clear();
  }

  ban(peer: string) {
    this.banned.set(peer, this.now() + BAN_MS);
  }

  // Cạnh nặng trước. Còn dư đúng một thì chỉ xét cạnh nặng nhất: cạnh đó có thể đang bị đầu kia cắt cùng lúc, cắt thêm
  // cạnh khác là tụt dưới mức mềm.
  pickDrop(connected: Iterable<string>): string | null {
    const list = [...connected].sort((a, b) => this.weight(b) - this.weight(a));
    if (list.length <= this.limit.soft) return null;
    const now = this.now();
    for (const p of list.length > this.limit.soft + 1 ? list : list.slice(0, 1)) {
      if (now - (this.since.get(p) ?? 0) < GRACE_MS) continue;
      const theirs = this.neighbors(p);
      if (!theirs || theirs.length <= this.limit.soft) continue;
      if (theirs.length >= this.limit.soft + 2) return p;
      const w = this.weight(p);
      if (theirs.every((q) => q === this.self || pairWeight(p, q) < w)) return p;
    }
    return null;
  }
}
