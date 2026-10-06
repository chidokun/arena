"use client";

import { useEffect, useRef, useState } from "react";

/** Lần bấm thứ hai phải cách lần đầu ít nhất bấy nhiêu — nháy đúp (hoặc chạm hai lần do rung tay) không tính là xác nhận. */
const SETTLE_MS = 400;

/**
 * Nút cần bấm hai lần cho hành động khó hoàn tác (kick, xin thua) — thay cho confirm() chặn luồng.
 * Bấm lần đầu nút đổi sang lời xác nhận; bấm lần nữa (sau một nhịp, trong vòng vài giây) mới thực hiện.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel,
  className,
  role,
}: {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel: React.ReactNode;
  className?: string;
  role?: string;
}) {
  const [armed, setArmed] = useState(false);
  const armedAt = useRef(0);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      role={role}
      className={className}
      aria-live="polite"
      data-armed={armed || undefined}
      onClick={(e) => {
        if (!armed) {
          armedAt.current = e.timeStamp;
          setArmed(true);
        } else if (e.timeStamp - armedAt.current >= SETTLE_MS) {
          setArmed(false);
          onConfirm();
        }
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
