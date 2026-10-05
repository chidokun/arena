/**
 * Niêm phong bản ghi bí mật trong gossip store (ai trong phòng cũng nhận được mọi bản ghi).
 *
 * Mỗi tab có một cặp khoá ECDH P-256; khoá công khai đi kèm bản ghi hiện diện `p:<uid>`. Hai người dùng chung khoá
 * AES-GCM suy ra từ ECDH (khoá riêng của mình + khoá công khai của người kia) — chỉ hai người đó mở được hộp, và mở
 * được nghĩa là hộp do một trong hai người đóng. Khoá của bản ghi gossip được gắn làm dữ liệu xác thực kèm (AAD) nên
 * không bê hộp sang khoá khác được. Nội dung được độn khoảng trắng tới bội số cố định để độ dài không tiết lộ gì.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const CURVE = { name: "ECDH", namedCurve: "P-256" } as const;
const BLOCK = 512;

function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function unb64(s: string) {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Nơi cất khoá riêng (sessionStorage theo uid của tab); thiếu thì mỗi lần mở trang sinh khoá mới. */
export type KeyStore = { get(): string | null; set(v: string): void };

export class Keyring {
  /** Khoá công khai (base64, dạng raw). */
  readonly pub: string;
  private priv: CryptoKey;
  private shared = new Map<string, Promise<CryptoKey>>();

  private constructor(pub: string, priv: CryptoKey) {
    this.pub = pub;
    this.priv = priv;
  }

  static async create(store?: KeyStore): Promise<Keyring> {
    try {
      const saved = store?.get();
      if (saved) {
        const { pub, jwk } = JSON.parse(saved) as { pub: string; jwk: JsonWebKey };
        const priv = await crypto.subtle.importKey("jwk", jwk, CURVE, true, ["deriveKey"]);
        return new Keyring(pub, priv);
      }
    } catch {}
    const pair = await crypto.subtle.generateKey(CURVE, true, ["deriveKey"]);
    const pub = b64(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
    try {
      store?.set(JSON.stringify({ pub, jwk: await crypto.subtle.exportKey("jwk", pair.privateKey) }));
    } catch {}
    return new Keyring(pub, pair.privateKey);
  }

  private key(peer: string) {
    let k = this.shared.get(peer);
    if (!k) {
      k = (async () => {
        const theirs = await crypto.subtle.importKey("raw", unb64(peer), CURVE, false, []);
        return crypto.subtle.deriveKey({ name: "ECDH", public: theirs }, this.priv, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      })();
      // Khoá công khai hỏng thì lần sau thử lại từ đầu thay vì giữ mãi lời hứa bị từ chối.
      k.catch(() => this.shared.delete(peer));
      this.shared.set(peer, k);
    }
    return k;
  }

  /** Đóng hộp cho `peer` (khoá công khai), gắn với khoá bản ghi `aad`, độn tới ít nhất `size` byte. */
  async seal(peer: string, aad: string, data: unknown, size = 0): Promise<string> {
    const json = JSON.stringify(data);
    const len = enc.encode(json).length;
    const target = Math.ceil((Math.max(len, size) + 1) / BLOCK) * BLOCK;
    const body = enc.encode(json + " ".repeat(target - len));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, await this.key(peer), body);
    const out = new Uint8Array(iv.length + ct.byteLength);
    out.set(iv);
    out.set(new Uint8Array(ct), iv.length);
    return b64(out);
  }

  /** Mở hộp từ `peer`; null nếu không phải hộp của hai bên hoặc đã bị sửa. */
  async open<T>(peer: string, aad: string, box: string): Promise<T | null> {
    try {
      const raw = unb64(box);
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: raw.subarray(0, 12), additionalData: enc.encode(aad) },
        await this.key(peer),
        raw.subarray(12),
      );
      return JSON.parse(dec.decode(pt)) as T;
    } catch {
      return null;
    }
  }
}

/** Số byte của dữ liệu khi đóng hộp (để độn mọi hộp trong một lượt về cùng cỡ). */
export const sealedSize = (data: unknown) => enc.encode(JSON.stringify(data)).length;
