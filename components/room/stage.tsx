"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Chế độ trình chiếu của phòng: chỉ còn bàn chơi giữa màn hình, phủ lên thanh đầu trang, chat, người trong phòng…
 * Game hỗ trợ bằng cách bọc khối bàn chơi (bàn + sticker bay) trong `StageArea`: RoomLayout thấy có StageArea thì hiện
 * nút Trình chiếu. Mỗi game tự chỉnh cỡ bàn lúc trình chiếu qua `fit`, nên chưa bọc thì chưa có nút.
 */
type Stage = { on: boolean; exit: () => void; mount: () => () => void };

export const StageCtx = createContext<Stage | null>(null);

/** Do RoomLayout gọi: `available` — bàn chơi có bọc trong StageArea không; `ctx` — cấp xuống qua `StageCtx`. */
export function useStageHost() {
  const [count, setCount] = useState(0);
  const [on, setOn] = useState(false);
  const mount = useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => n - 1);
  }, []);
  const exit = useCallback(() => setOn(false), []);
  const available = count > 0;
  const active = on && available;
  // Khoá cuộn trang phía dưới; đặt trước khi vẽ để không thấy thanh cuộn nháy.
  useLayoutEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    html.dataset.stage = "";
    return () => {
      delete html.dataset.stage;
    };
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOn(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [active]);
  const ctx = useMemo<Stage>(() => ({ on: active, exit, mount }), [active, exit, mount]);
  return { ctx, available, enter: () => setOn(true) };
}

/**
 * Khối bàn chơi được trình chiếu. Bình thường chỉ là một `div` mang `className`; lúc trình chiếu thì nổi phủ cả màn hình.
 * Bàn nằm trong ô `container-type: size` chiếm phần còn trống, nên `fit` tính cỡ bàn theo `cqw` / `cqh` của ô (khối mang
 * `fit` vẫn `relative` để sticker bay đúng chỗ). `flanks`: hai người chơi chỉ hiện lúc trình chiếu — màn hình ngang thì đứng
 * hai bên bàn, màn hình dọc thì một trên một dưới. Các `div` bọc luôn đứng yên trong cây nên bật / tắt không dựng lại bàn
 * chơi (giữ nét vẽ, trạng thái…). Bàn phải vừa ô — phần tràn bị cắt.
 */
export function StageArea({ className, fit = "w-full", flanks, children }: { className?: string; fit?: string; flanks?: [ReactNode, ReactNode]; children: ReactNode }) {
  const stage = useContext(StageCtx);
  const mount = stage?.mount;
  useEffect(() => mount?.(), [mount]);
  const on = !!stage?.on;
  const exitRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (on) exitRef.current?.focus();
  }, [on]);
  return (
    <div className={on ? "stage" : "contents"} role={on ? "dialog" : undefined} aria-modal={on || undefined} aria-label={on ? "Trình chiếu bàn chơi" : undefined}>
      {on && (
        <button ref={exitRef} type="button" className="btn btn-sm stage-exit" onClick={stage.exit}>
          ← Quay lại
        </button>
      )}
      <div className={on ? `stage-body${flanks ? " has-flanks" : ""}` : "contents"}>
        {on && flanks && <div className="stage-flank is-a">{flanks[0]}</div>}
        <div className={on ? "stage-cell" : "contents"}>
          <div className={on ? `relative ${fit}` : className}>{children}</div>
        </div>
        {on && flanks && <div className="stage-flank is-b">{flanks[1]}</div>}
      </div>
    </div>
  );
}
