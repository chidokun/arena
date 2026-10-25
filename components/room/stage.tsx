"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

// Nút Trình chiếu chỉ hiện khi game bọc bàn trong `StageArea`: mỗi game phải tự chỉnh cỡ bàn lúc trình chiếu qua `fit`.
// `enter` để game tự mở trình chiếu từ nút của mình (vd. phóng to bàn thiết kế).
type Stage = { on: boolean; enter: () => void; exit: () => void; mount: () => () => void };

export const StageCtx = createContext<Stage | null>(null);

export function useStageHost() {
  const [count, setCount] = useState(0);
  const [on, setOn] = useState(false);
  const mount = useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => n - 1);
  }, []);
  const enter = useCallback(() => setOn(true), []);
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
  const ctx = useMemo<Stage>(() => ({ on: active, enter, exit, mount }), [active, enter, exit, mount]);
  return { ctx, available, enter };
}

export const useStaged = () => !!useContext(StageCtx)?.on;

// Xổ ra một lúc khi vào trình chiếu để người dùng thấy có gì.
const TOOLS_PEEK_MS = 1800;

function StageTools({ on, exit, tools }: { on: boolean; exit: () => void; tools?: ReactNode }) {
  const [open, setOpen] = useState(on);
  const [wasOn, setWasOn] = useState(on);
  if (on !== wasOn) {
    setWasOn(on);
    setOpen(on);
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hold = () => clearTimeout(timer.current);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const bodyId = useId();
  useEffect(() => {
    if (!on) return;
    toggleRef.current?.focus();
    timer.current = setTimeout(() => setOpen(false), TOOLS_PEEK_MS);
    return () => clearTimeout(timer.current);
  }, [on]);
  if (!on) return null;
  return (
    <div className={`stage-tools${open ? " is-open" : ""}`} role="toolbar" aria-label="Công cụ trình chiếu" onPointerEnter={hold} onFocus={hold}>
      <button
        ref={toggleRef}
        type="button"
        className="btn btn-sm stage-tools-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        title={open ? "Thu gọn thanh công cụ" : "Mở thanh công cụ"}
        onClick={() => {
          hold();
          setOpen(!open);
        }}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 3.5 10.5 8 6 12.5" />
        </svg>
        <span className="sr-only">{open ? "Thu gọn" : "Mở"} thanh công cụ</span>
      </button>
      <div id={bodyId} className="stage-tools-body" inert={!open}>
        <div className="stage-tools-row">
          <button type="button" className="btn btn-sm" onClick={exit}>
            ← Quay lại
          </button>
          {tools}
        </div>
      </div>
    </div>
  );
}

// Các `div` bọc luôn đứng yên trong cây để bật / tắt trình chiếu không dựng lại bàn chơi (giữ nét vẽ, trạng thái…).
// Khối mang `fit` vẫn `relative` để sticker bay đúng chỗ. Có cả `flanks` lẫn `head` thì màn hình rất rộng (từ 2:1) mới
// đưa người chơi ra hai bên, để bàn không bị bẹp.
export function StageArea({
  className,
  fit = "w-full",
  flanks,
  head,
  center,
  tools,
  scroll,
  children,
}: {
  className?: string;
  fit?: string;
  flanks?: [ReactNode, ReactNode];
  head?: ReactNode;
  center?: string;
  tools?: ReactNode;
  scroll?: boolean;
  children: ReactNode;
}) {
  const stage = useContext(StageCtx);
  const mount = stage?.mount;
  useEffect(() => mount?.(), [mount]);
  const on = !!stage?.on;
  return (
    <div className={on ? "stage" : "contents"} role={on ? "region" : undefined} aria-label={on ? "Trình chiếu bàn chơi" : undefined}>
      {stage && <StageTools on={on} exit={stage.exit} tools={tools} />}
      <div
        className={on ? `stage-body${flanks && head ? " has-both" : flanks ? " has-flanks" : head ? " has-head" : ""}` : "contents"}
        style={on && center ? { ["--stage-center" as string]: `calc(${center})` } : undefined}
      >
        {on && head && <div className="stage-head">{head}</div>}
        {on && flanks && <div className="stage-flank is-a">{flanks[0]}</div>}
        <div className={on ? `stage-cell${scroll ? " is-scroll" : ""}` : "contents"}>
          <div className={on ? `relative ${fit}` : className}>{children}</div>
        </div>
        {on && flanks && <div className="stage-flank is-b">{flanks[1]}</div>}
      </div>
    </div>
  );
}
