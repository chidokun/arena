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
 *
 * Tiết kiệm allocation: mỗi RTCPeerConnection xin một allocation TURN cho *mỗi* URL, mà Trystero luôn giữ sẵn
 * 20 kết nối chào hàng (offer pool) và làm mới chúng mỗi ~1 phút — nếu cấp TURN cho cả pool thì một tab ngốn
 * hàng chục allocation, gói miễn phí hết quota ngay ("486 Allocation Quota Reached") và TURN coi như không có.
 * Vì vậy chỉ phía trả lời offer mới xin TURN (`turnOnAnswer`): một cặp peer chỉ cần một bên có ứng viên relay
 * là đi được, kể cả khi bên kia sau NAT đối xứng. Mỗi máy chủ cũng chỉ giữ một URL UDP và một URL TCP/TLS.
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
export function turnOnAnswer(turn: IceServer[]): typeof RTCPeerConnection | undefined {
  if (!turn.length || typeof RTCPeerConnection === "undefined") return undefined;
  return class extends RTCPeerConnection {
    private turnAdded = false;

    override setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void>;
    override setRemoteDescription(
      desc: RTCSessionDescriptionInit,
      ok: VoidFunction,
      fail: RTCPeerConnectionErrorCallback,
    ): Promise<void>;
    override setRemoteDescription(desc: RTCSessionDescriptionInit, ok?: VoidFunction, fail?: RTCPeerConnectionErrorCallback) {
      if (!this.turnAdded && desc?.type === "offer" && !this.localDescription) {
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
