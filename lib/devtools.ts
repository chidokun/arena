/**
 * Phát hiện công cụ nhà phát triển (DevTools) — chống gian lận lúc đang chơi (soi bộ nhớ, sửa trạng thái, đọc bí mật
 * gửi riêng…). Trình duyệt không có API cho việc này nên dựa vào hai dấu hiệu:
 *
 *   - phím tắt mở DevTools: F12, Ctrl+Shift+I/J/C (Windows, Linux), ⌘+⌥+I/J/C (macOS);
 *   - câu lệnh `debugger`: DevTools đang mở thì trình duyệt dừng ở đó, đo thời gian quanh lời gọi là biết — bắt được cả
 *     khi mở bằng chuột phải → "Kiểm tra" hay từ menu. DevTools đóng thì `debugger` không làm gì, đo ra ~0ms.
 *
 * Câu `debugger` dựng bằng `Function` vì bản build tối giản xoá câu `debugger` viết thẳng trong mã. Người cố tình tắt
 * điểm dừng trước (Deactivate breakpoints) vẫn lách được — chặn hoàn toàn ở phía trình duyệt là không thể; đây là hàng
 * rào cho người tò mò bật lên giữa ván.
 *
 * Bật ở bản build, tắt khi `next dev` (lập trình viên mở DevTools suốt); NEXT_PUBLIC_ANTICHEAT=on / off để ép bật / tắt.
 */

export type DevtoolsSignal = "shortcut" | "debugger";

const flag = process.env.NEXT_PUBLIC_ANTICHEAT;
export const ANTICHEAT = flag ? flag === "on" : process.env.NODE_ENV === "production";

const PROBE_MS = 1000;
// `debugger` không dừng thì lời gọi gần như tức thì; dừng thì ít nhất là lúc người dùng bấm tiếp / đóng DevTools.
const PAUSED_MS = 100;

/** Phím tắt mở DevTools. So `code` thay vì `key`: trên macOS giữ ⌥ làm `key` thành ký tự khác. */
export function isDevtoolsShortcut(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">) {
  if (e.key === "F12" || e.code === "F12") return true;
  const panel = e.code === "KeyI" || e.code === "KeyJ" || e.code === "KeyC";
  if (!panel) return false;
  return (e.ctrlKey && e.shiftKey && !e.metaKey) || (e.metaKey && e.altKey);
}

/**
 * Theo dõi DevTools khi `armed()` đúng (vd. mình đang ngồi ghế); `onOpen` gọi mỗi lần thấy dấu hiệu. Trả về hàm dừng.
 * Không chạy dò `debugger` lúc chưa cần để người xem mở DevTools không bị dừng trang liên tục.
 */
export function watchDevtools(armed: () => boolean, onOpen: (how: DevtoolsSignal) => void): () => void {
  if (typeof window === "undefined") return () => {};
  let probe: (() => void) | null = null;
  try {
    probe = Function("debugger") as () => void;
  } catch {
    // CSP cấm `Function` thì chỉ còn dò phím tắt.
  }

  const check = () => {
    if (!probe || !armed()) return;
    const t = performance.now();
    probe();
    if (performance.now() - t > PAUSED_MS) onOpen("debugger");
  };
  const onKey = (e: KeyboardEvent) => {
    if (armed() && isDevtoolsShortcut(e)) onOpen("shortcut");
  };

  const timer = setInterval(check, PROBE_MS);
  window.addEventListener("keydown", onKey, true);
  return () => {
    clearInterval(timer);
    window.removeEventListener("keydown", onKey, true);
  };
}
