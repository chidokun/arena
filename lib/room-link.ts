export type RoomLink = { slug: string; id: string; url: string; rest: string };

export type RoomLinkOpts = {
  // Tên miền được nhận (host, có cả cổng): tên miền thật và tên miền đang mở, để chạy thử ở máy vẫn dùng được.
  hosts: readonly string[];
  // Đường dẫn con của site (PAGES_BASE_PATH), nếu có.
  base?: string;
  // Game có trang trong bản build.
  known: (slug: string) => boolean;
};

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const ID_RE = /^[a-z0-9_-]{1,64}$/;
// Dấu câu dính sau link khi gõ ("vào đây nhé: https://…/?id=abc.") không thuộc link.
const TRAIL_RE = /[.,;:!?…)\]}»"'”’]+$/u;

/** Tìm link phòng Arena đầu tiên trong tin nhắn; link lạ vẫn hiện như chữ thường. `rest` là phần chữ còn lại. */
export function parseRoomLink(text: string, { hosts, base = "", known }: RoomLinkOpts): RoomLink | null {
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0].replace(TRAIL_RE, "");
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (!hosts.includes(u.host)) continue;
    const path = base && u.pathname.startsWith(base + "/") ? u.pathname.slice(base.length) : u.pathname;
    const slug = /^\/games\/([a-z0-9-]+)\/room\/?$/.exec(path)?.[1];
    const id = (u.searchParams.get("id") ?? "").trim().toLowerCase();
    if (!slug || !known(slug) || !ID_RE.test(id)) continue;
    const at = m.index ?? 0;
    const rest = (text.slice(0, at) + text.slice(at + m[0].length)).replace(/\s+/g, " ").trim();
    return { slug, id, url: raw, rest };
  }
  return null;
}
