// Trình duyệt không có API phát hiện DevTools nên dựa vào hai dấu hiệu: phím tắt mở DevTools, và câu lệnh `debugger`
// trong một Web Worker (DevTools đang mở thì trình duyệt dừng worker ở đó; chỉ worker bị dừng, trang game vẫn chạy).
// Worker tự đo thời gian quanh `debugger` nên trang chính bận cũng không làm sai số đo.
// Người cố tình tắt điểm dừng trước (Deactivate breakpoints) vẫn lách được — chặn hoàn toàn ở phía trình duyệt là không
// thể; đây chỉ là hàng rào cho người tò mò bật lên giữa ván. Tắt khi `next dev` vì lập trình viên mở DevTools suốt.

export type DevtoolsSignal = "shortcut" | "debugger";

const flag = process.env.NEXT_PUBLIC_ANTICHEAT;
export const ANTICHEAT = flag ? flag === "on" : process.env.NODE_ENV === "production";

export const PROBE_MS = 1000;
// `debugger` không dừng thì gần như tức thì; dừng thì ít nhất là lúc người dùng bấm tiếp / đóng DevTools.
export const PAUSED_MS = 100;
export const STUCK_MS = 3000;
// Nhịp hỏi trễ quá mức này là trang chính vừa bị nghẽn (hoặc tab nằm nền): lời đáp có thể còn kẹt trong hàng đợi.
const LATE_MS = 500;

// Viết trong chuỗi: bản build tối giản xoá câu `debugger` viết thẳng trong mã.
const WORKER_SRC = "onmessage=function(e){var t=performance.now();debugger;postMessage({id:e.data,dt:performance.now()-t})}";

export type ProbeWorker = Pick<Worker, "postMessage" | "terminate"> & { onmessage: ((e: MessageEvent) => void) | null };

function spawnWorker(): ProbeWorker | null {
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    return w;
  } catch {
    // CSP cấm worker từ blob, trình duyệt không có Worker…: chỉ còn dò phím tắt.
    return null;
  }
}

// So `code` thay vì `key`: trên macOS giữ ⌥ làm `key` thành ký tự khác.
export function isDevtoolsShortcut(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">) {
  if (e.key === "F12" || e.code === "F12") return true;
  const panel = e.code === "KeyI" || e.code === "KeyJ" || e.code === "KeyC";
  if (!panel) return false;
  return (e.ctrlKey && e.shiftKey && !e.metaKey) || (e.metaKey && e.altKey);
}

export type DevtoolsWatch = {
  keys: () => boolean;
  // Chỉ dò bằng worker lúc thật sự cần (đang đấu), để người mở DevTools ngoài ván không bị dừng worker liên tục.
  probe: () => boolean;
};

export function watchDevtools(
  armed: DevtoolsWatch,
  onOpen: (how: DevtoolsSignal) => void,
  deps: { spawn?: () => ProbeWorker | null; now?: () => number; target?: Pick<EventTarget, "addEventListener" | "removeEventListener"> } = {},
): () => void {
  const target = deps.target ?? (typeof window === "undefined" ? null : window);
  if (!target) return () => {};
  const spawn = deps.spawn ?? spawnWorker;
  const now = deps.now ?? (() => performance.now());

  let worker: ProbeWorker | null | undefined;
  let pending: { id: number; at: number } | null = null;
  let seq = 0;
  let lastTick = now();

  const onReply = (e: MessageEvent) => {
    const { id, dt } = (e.data ?? {}) as { id?: number; dt?: number };
    if (!pending || id !== pending.id) return;
    pending = null;
    if (Number(dt) > PAUSED_MS && armed.probe()) onOpen("debugger");
  };

  const tick = () => {
    const t = now();
    const onTime = t - lastTick < PROBE_MS + LATE_MS;
    lastTick = t;
    if (!armed.probe()) {
      // Thôi dò: lời đáp muộn của lượt cũ (nếu có) sẽ bị bỏ qua.
      pending = null;
      return;
    }
    if (worker === undefined) {
      worker = spawn();
      if (worker) worker.onmessage = onReply;
    }
    if (!worker) return;
    if (pending) {
      // Chưa trả lời mà trang chính vẫn chạy đều nhịp: worker đang dừng ở `debugger`.
      if (onTime && t - pending.at > STUCK_MS) {
        pending.at = t;
        onOpen("debugger");
      }
      return;
    }
    pending = { id: ++seq, at: t };
    worker.postMessage(pending.id);
  };

  const onKey = (e: Event) => {
    if (armed.keys() && isDevtoolsShortcut(e as KeyboardEvent)) onOpen("shortcut");
  };

  const timer = setInterval(tick, PROBE_MS);
  target.addEventListener("keydown", onKey, true);
  return () => {
    clearInterval(timer);
    target.removeEventListener("keydown", onKey, true);
    worker?.terminate();
  };
}
