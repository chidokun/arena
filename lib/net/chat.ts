/**
 * Phần dùng chung của chat trong phòng và chat công cộng: giới hạn, chèn tin, nhịp gửi.
 * Chat công cộng đi qua kênh sảnh (mọi người đang mở trang), nên còn kiểm tra chặt hơn khi nhận (`readPublicMsg`).
 */
import { isStickerId } from "../stickers.ts";
import type { Rumor } from "./gossip";
import type { ChatMsg } from "./room";

/** Số tin giữ trong máy. */
export const CHAT_LIMIT = 200;
/** Số tin gửi lại cho người mới vào. */
export const CHAT_REPLAY = 100;
/** Số tin lưu lại để tải lại trang (F5) vẫn còn. */
export const CHAT_PERSIST = 100;
/** Độ dài tối đa một tin. */
export const TEXT_MAX = 300;
/** Mỗi người tối đa CHAT_RATE tin / CHAT_RATE_WINDOW_MS (máy gửi tự giữ, máy nhận bỏ phần vượt). */
export const CHAT_RATE = 10;
export const CHAT_RATE_WINDOW_MS = 10_000;
/** Chat công cộng: tin cũ hơn mốc này bị bỏ (khi nhận, khi gửi lại cho người mới, khi khôi phục sau F5). */
export const PUBLIC_TTL_MS = 60 * 60_000;

/**
 * Tin công cộng trên đường truyền. Đồng hồ các máy có thể lệch nhau, nên không gửi giờ tuyệt đối mà gửi tuổi của tin
 * (`age`, ms tính từ lúc gửi theo đồng hồ máy đang chuyển tin): tin vừa phát có tuổi 0, tin gửi lại thì tuổi = bây giờ − giờ
 * nhận. Máy nhận quy về đồng hồ của mình: `at = bây giờ − age` — hạn 1 giờ và giờ hiển thị đều theo đồng hồ máy mình.
 */
export type PublicWire = Omit<ChatMsg, "id" | "at"> & { age: number };

/** Đóng gói tin (có `at` theo đồng hồ máy mình) để gửi đi. */
export function toPublicWire(m: ChatMsg, now = Date.now()): PublicWire {
  const w: PublicWire = { uid: m.uid, name: m.name, avatar: m.avatar, color: m.color, age: Math.max(0, now - m.at) };
  if (m.sticker) w.sticker = m.sticker;
  else w.text = m.text;
  return w;
}

/** Tin còn trong hạn (theo đồng hồ máy mình). */
export const isFresh = (m: ChatMsg, now = Date.now()) => now - m.at <= PUBLIC_TTL_MS;

/**
 * Dựng lại tin từ rumor: bỏ cờ đặc biệt (hệ thống, rao…), bỏ tin mạo danh (id rumor luôn bắt đầu bằng uid người phát),
 * bỏ tin quá hạn; quy giờ gửi về đồng hồ máy mình.
 */
export function readPublicMsg(r: Rumor, now = Date.now()): ChatMsg | null {
  const m = r.p as Partial<PublicWire> | null;
  if (!m || typeof m !== "object" || typeof m.uid !== "string" || !m.uid || !r.id.startsWith(`${m.uid}:`)) return null;
  if (typeof m.age !== "number" || !Number.isFinite(m.age) || m.age > PUBLIC_TTL_MS) return null;
  const str = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");
  const at = now - Math.max(0, m.age);
  const msg: ChatMsg = { id: r.id, uid: m.uid, name: str(m.name, 40), avatar: str(m.avatar, 16), color: str(m.color, 32), at };
  if (m.sticker !== undefined) {
    if (!isStickerId(m.sticker)) return null;
    msg.sticker = m.sticker;
  } else {
    const text = str(m.text, TEXT_MAX).trim();
    if (!text) return null;
    msg.text = text;
  }
  return msg;
}

/** Cửa sổ trượt: mỗi khoá được tối đa `max` lần trong `windowMs`. */
export class RateLimit {
  private hits = new Map<string, number[]>();
  private max: number;
  private windowMs: number;
  private now: () => number;

  constructor(max: number, windowMs: number, now: () => number = () => Date.now()) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Còn được phép thì ghi nhận một lần và trả về true. */
  take(key: string) {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(t);
    this.hits.set(key, list);
    return true;
  }

  /** Dọn khoá đã im lâu để bảng không phình. */
  sweep() {
    const t = this.now();
    for (const [k, list] of this.hits) if (!list.some((x) => t - x < this.windowMs)) this.hits.delete(k);
  }
}

/** Chèn tin theo giờ gửi, khử trùng lặp theo id, giữ `limit` tin mới nhất. Trả về danh sách mới, hoặc null nếu đã có. */
export function insertMsg(chat: ChatMsg[], msg: ChatMsg, limit = CHAT_LIMIT): ChatMsg[] | null {
  if (chat.some((c) => c.id === msg.id)) return null;
  return [...chat, msg].sort((a, b) => a.at - b.at).slice(-limit);
}
