/**
 * Máy chủ TURN cho WebRTC. Trystero mặc định chỉ có STUN: đủ khi hai máy cùng mạng LAN, nhưng hai máy khác mạng
 * — nhất là điện thoại dùng 4G/5G (NAT nhà mạng, NAT đối xứng) — thường không đục được NAT, bắt tay xong vẫn
 * không thông kênh, mỗi bên chỉ thấy mỗi mình. TURN chuyển tiếp lưu lượng giúp hai bên trong trường hợp đó.
 *
 * Cấu hình lúc build (site tĩnh nên giá trị được nhúng thẳng vào bundle):
 * - NEXT_PUBLIC_TURN_URLS (cách nhau dấu phẩy) + NEXT_PUBLIC_TURN_USERNAME + NEXT_PUBLIC_TURN_CREDENTIAL:
 *   thông tin đăng nhập tĩnh (vd. ExpressTURN, coturn tự dựng).
 * - NEXT_PUBLIC_TURN_API: URL trả về mảng RTCIceServer dạng JSON, gọi một lần mỗi lần tải trang
 *   (vd. Metered: https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>).
 * Có thể dùng cả hai; không đặt gì thì chỉ có STUN như cũ.
 *
 * Thử TURN trên một máy: thêm `?relay` vào URL để ép mọi kết nối đi qua TURN (giữ trong tab đến khi đóng).
 */

export type IceServer = { urls: string | string[]; username?: string; credential?: string };

const API_TIMEOUT_MS = 4000;
const RELAY_KEY = "arena:relay";

function staticServers(): IceServer[] {
  const urls = (process.env.NEXT_PUBLIC_TURN_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    // Nhà cung cấp hay chỉ ghi "host:port" — thiếu scheme thì hiểu là TURN.
    .map((u) => (/^(turns?|stuns?):/i.test(u) ? u : `turn:${u}`));
  if (!urls.length) return [];
  return [{ urls, username: process.env.NEXT_PUBLIC_TURN_USERNAME, credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL }];
}

function isIceServer(x: unknown): x is IceServer {
  const s = x as IceServer;
  return !!s && (typeof s.urls === "string" || (Array.isArray(s.urls) && s.urls.every((u) => typeof u === "string")));
}

/** Chỉ giữ địa chỉ TURN: STUN đã có sẵn trong Trystero, thêm nữa chỉ làm chậm việc thu thập ứng viên ICE. */
function turnOnly(list: IceServer[]): IceServer[] {
  return list
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => /^turns?:/i.test(u)) }))
    .filter((s) => s.urls.length > 0);
}

async function fetchServers(url: string): Promise<IceServer[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: unknown = await res.json();
    const list = Array.isArray(data) ? data : (data as { iceServers?: unknown })?.iceServers;
    return Array.isArray(list) ? list.filter(isIceServer) : [];
  } catch (e) {
    console.warn("[arena] không lấy được thông tin TURN", e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

let serversPromise: Promise<IceServer[]> | null = null;

/** Danh sách máy chủ TURN (đã nhớ đệm cho cả trang). */
export function turnServers(): Promise<IceServer[]> {
  serversPromise ??= (async () => {
    const api = process.env.NEXT_PUBLIC_TURN_API;
    const fetched = api ? await fetchServers(api) : [];
    return turnOnly([...staticServers(), ...fetched]);
  })();
  return serversPromise;
}

/** `?relay` trên URL: ép đi qua TURN để kiểm tra cấu hình ngay trên một máy. */
export function forceRelay(): boolean {
  try {
    if (new URLSearchParams(location.search).has("relay")) sessionStorage.setItem(RELAY_KEY, "1");
    return sessionStorage.getItem(RELAY_KEY) === "1";
  } catch {
    return false;
  }
}
