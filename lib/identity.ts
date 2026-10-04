/**
 * Danh tính người chơi, hoàn toàn phía trình duyệt.
 * - uid: mỗi tab một uid (sessionStorage) để tải lại trang vẫn là "mình" — chủ phòng tải lại vẫn giữ quyền.
 *   Tab nhân bản sao chép cả sessionStorage nên dùng BroadcastChannel phát hiện trùng và cấp uid mới.
 * - hồ sơ (tên, avatar, màu): localStorage, dùng chung mọi tab.
 */

export type Profile = { name: string; avatar: string; color: string };

export const AVATARS = ["🦊", "🐼", "🐯", "🐸", "🐵", "🐧", "🦁", "🐨", "🐰", "🐙", "🦄", "🐲", "🐻", "🐱", "🐶", "🦉", "🐳", "🦖"];
export const COLORS = ["#ff5a5f", "#ff9f1c", "#f7c948", "#2ec4b6", "#3a86ff", "#8338ec", "#ff4fa3", "#06d6a0"];

const ANIMALS = ["Cáo", "Gấu", "Hổ", "Ếch", "Khỉ", "Cánh Cụt", "Sư Tử", "Thỏ", "Bạch Tuộc", "Kỳ Lân", "Rồng", "Mèo", "Cún", "Cú", "Cá Voi", "Khủng Long"];
const TRAITS = ["Lém Lỉnh", "Siêu Tốc", "Bất Bại", "Tinh Nghịch", "Thần Sầu", "Mộng Mơ", "Gan Lì", "Nhanh Trí", "Vui Vẻ", "Lì Đòn", "Bí Ẩn", "Hào Hoa"];

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function randomProfile(): Profile {
  return { name: `${pick(ANIMALS)} ${pick(TRAITS)}`, avatar: pick(AVATARS), color: pick(COLORS) };
}

export function randomId(len = 10) {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

export function cleanName(s: string) {
  return s.replace(/\s+/g, " ").trim().slice(0, 24);
}

const PROFILE_KEY = "arena:profile";
const UID_KEY = "arena:uid";

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function loadProfile(): { profile: Profile; fresh: boolean } {
  const raw = safe(() => localStorage.getItem(PROFILE_KEY), null);
  if (raw) {
    const p = safe(() => JSON.parse(raw) as Profile, null);
    if (p && typeof p.name === "string" && p.name && typeof p.avatar === "string" && typeof p.color === "string") {
      return { profile: { name: cleanName(p.name), avatar: p.avatar, color: p.color }, fresh: false };
    }
  }
  const profile = randomProfile();
  saveProfile(profile);
  return { profile, fresh: true };
}

export function saveProfile(p: Profile) {
  safe(() => localStorage.setItem(PROFILE_KEY, JSON.stringify(p)), undefined);
}

let uidPromise: Promise<string> | null = null;

/** Lấy uid của tab; nếu tab khác đang giữ cùng uid (tab nhân bản) thì đổi uid mới. */
export function resolveUid(): Promise<string> {
  uidPromise ??= claimUid();
  return uidPromise;
}

async function claimUid(): Promise<string> {
  let uid = safe(() => sessionStorage.getItem(UID_KEY), null) ?? "";
  if (!uid) {
    uid = randomId();
    safe(() => sessionStorage.setItem(UID_KEY, uid), undefined);
  }
  if (typeof BroadcastChannel === "undefined") return uid;
  const ch = new BroadcastChannel("arena:uid");
  const taken = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 120);
    ch.onmessage = (e) => {
      if (e.data?.taken === uid) {
        clearTimeout(t);
        resolve(true);
      }
    };
    ch.postMessage({ ask: uid });
  });
  if (taken) {
    uid = randomId();
    safe(() => sessionStorage.setItem(UID_KEY, uid), undefined);
  }
  const mine = uid;
  ch.onmessage = (e) => {
    if (e.data?.ask === mine) ch.postMessage({ taken: mine });
  };
  return uid;
}
