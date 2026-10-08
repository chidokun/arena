/**
 * Máy chủ TURN cho WebRTC. Trystero mặc định chỉ có STUN: đủ khi hai máy cùng mạng LAN, nhưng hai máy khác mạng
 * — nhất là điện thoại dùng 4G/5G (NAT nhà mạng, NAT đối xứng) — thường không đục được NAT, bắt tay xong vẫn
 * không thông kênh, mỗi bên chỉ thấy mỗi mình. TURN chuyển tiếp lưu lượng giúp hai bên trong trường hợp đó.
 *
 * Cấu hình lúc build (site tĩnh nên giá trị được nhúng thẳng vào bundle):
 * - NEXT_PUBLIC_TURN_API: URL trả về mảng RTCIceServer (hoặc `{ iceServers }`) dạng JSON — ở đây là Worker
 *   arena-turn-api (github.com/chidokun/arena-turn-api) cấp credential Cloudflare TURN ngắn hạn. Gọi khi tải
 *   trang và gọi lại định kỳ trước khi hết hạn.
 * - NEXT_PUBLIC_TURN_URLS (cách nhau dấu phẩy) + NEXT_PUBLIC_TURN_USERNAME + NEXT_PUBLIC_TURN_CREDENTIAL:
 *   thông tin đăng nhập tĩnh (vd. ExpressTURN, coturn tự dựng).
 * Dùng cả hai thì không phải chọn tay: trình duyệt xin relay ở mọi máy chủ rồi ICE tự chọn cặp ứng viên
 * thông được và tốt nhất. Máy chủ từ API đứng trước nên được ưu tiên; máy chủ tĩnh là dự phòng khi API lỗi
 * hoặc máy chủ kia hết quota. STUN công cộng (Google, Cloudflare) đã có sẵn trong Trystero.
 * Không đặt gì thì chỉ có STUN.
 *
 * Thử TURN trên một máy: thêm `?relay` vào URL để ép mọi kết nối đi qua TURN (giữ trong tab đến khi đóng).
 *
 * Tiết kiệm allocation: mỗi RTCPeerConnection xin một allocation TURN cho *mỗi* URL, mà Trystero luôn giữ sẵn
 * 20 kết nối chào hàng (offer pool) và làm mới chúng mỗi ~1 phút — nếu cấp TURN cho cả pool thì một tab ngốn
 * hàng chục allocation, gói miễn phí hết quota ngay ("486 Allocation Quota Reached") và TURN coi như không có.
 * Vì vậy chỉ phía trả lời offer mới xin TURN (`turnOnAnswer`): một cặp peer chỉ cần một bên có ứng viên relay
 * là đi được, kể cả khi bên kia sau NAT đối xứng. Mỗi máy chủ cũng chỉ giữ một URL UDP và một URL TCP/TLS.
 */

export type IceServer = { urls: string | string[]; username?: string; credential?: string };

const API_TIMEOUT_MS = 4000;
/** Credential từ Worker sống 24 giờ; xin lại sớm để tab mở lâu không cầm credential hết hạn. */
const API_REFRESH_MS = 6 * 3600_000;
/** Lấy credential lỗi thì thử lại sau khoảng này (trong lúc đó vẫn còn máy chủ tĩnh). */
const API_RETRY_MS = 60_000;
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

const isTcp = (u: string) => /^turns:/i.test(u) || /transport=tcp/i.test(u);

/** Ưu tiên cổng 443 (ít bị tường lửa chặn), rồi tới TLS (`turns:`) cho đường TCP. */
const rank = (u: string) => Number(/:443\b/.test(u)) * 2 + Number(/^turns:/i.test(u));

/**
 * Chỉ giữ địa chỉ TURN (STUN đã có sẵn trong Trystero), và mỗi máy chủ chỉ một URL UDP + một URL TCP/TLS:
 * nhà cung cấp hay trả về 4–6 URL, mỗi URL lại là một allocation riêng.
 */
export function turnOnly(list: IceServer[]): IceServer[] {
  return list
    .map((s) => {
      const turn = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => /^turns?:/i.test(u));
      const best = (xs: string[]) => xs.reduce<string | undefined>((a, u) => (a == null || rank(u) > rank(a) ? u : a), undefined);
      const urls = [best(turn.filter((u) => !isTcp(u))), best(turn.filter(isTcp))].filter((u): u is string => !!u);
      return { ...s, urls };
    })
    .filter((s) => s.urls.length > 0);
}

/**
 * RTCPeerConnection chỉ thêm máy chủ TURN khi nhận offer (tức là phía trả lời), ngay trước khi bắt đầu thu thập
 * ứng viên ICE. Kết nối chào hàng trong pool của Trystero vì vậy không chiếm allocation nào.
 */
export function turnOnAnswer(getTurn: () => IceServer[]): typeof RTCPeerConnection | undefined {
  if (typeof RTCPeerConnection === "undefined") return undefined;
  return class extends RTCPeerConnection {
    private turnAdded = false;

    override setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void>;
    override setRemoteDescription(
      desc: RTCSessionDescriptionInit,
      ok: VoidFunction,
      fail: RTCPeerConnectionErrorCallback,
    ): Promise<void>;
    override setRemoteDescription(desc: RTCSessionDescriptionInit, ok?: VoidFunction, fail?: RTCPeerConnectionErrorCallback) {
      const turn = getTurn();
      if (!this.turnAdded && turn.length && desc?.type === "offer" && !this.localDescription) {
        this.turnAdded = true;
        try {
          const cfg = this.getConfiguration();
          this.setConfiguration({ ...cfg, iceServers: [...(cfg.iceServers ?? []), ...turn] });
        } catch (e) {
          console.warn("[arena] không gắn được TURN vào kết nối", e);
        }
      }
      return ok && fail ? super.setRemoteDescription(desc, ok, fail) : super.setRemoteDescription(desc);
    }
  };
}

/** Danh sách máy chủ từ API, hoặc `null` khi lỗi. */
async function fetchServers(url: string): Promise<IceServer[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: unknown = await res.json();
    const list = Array.isArray(data) ? data : (data as { iceServers?: unknown })?.iceServers;
    return Array.isArray(list) ? list.filter(isIceServer) : [];
  } catch (e) {
    console.warn("[arena] không lấy được thông tin TURN", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let current: IceServer[] = [];
let serversPromise: Promise<IceServer[]> | null = null;

/** Lấy (lại) danh sách từ API rồi hẹn lần lấy sau: đều đặn khi thành công, sớm hơn khi lỗi. */
async function refresh(api: string | undefined, keep: IceServer[]): Promise<IceServer[]> {
  const fetched = api ? await fetchServers(api) : [];
  // Lỗi tạm thời thì giữ credential API cũ (vẫn còn hạn) thay vì chỉ còn máy chủ tĩnh.
  current = fetched ? turnOnly([...fetched, ...staticServers()]) : keep.length ? keep : turnOnly(staticServers());
  if (api) setTimeout(() => void refresh(api, current), fetched ? API_REFRESH_MS : API_RETRY_MS);
  return current;
}

/** Danh sách máy chủ TURN lúc mở trang (chờ lần lấy đầu tiên). */
export function turnServers(): Promise<IceServer[]> {
  serversPromise ??= refresh(process.env.NEXT_PUBLIC_TURN_API, []);
  return serversPromise;
}

/** Danh sách máy chủ TURN mới nhất (đã làm mới credential nếu có). */
export const currentTurn = () => current;

/** `?relay` trên URL: ép đi qua TURN để kiểm tra cấu hình ngay trên một máy. */
export function forceRelay(): boolean {
  try {
    if (new URLSearchParams(location.search).has("relay")) sessionStorage.setItem(RELAY_KEY, "1");
    return sessionStorage.getItem(RELAY_KEY) === "1";
  } catch {
    return false;
  }
}
