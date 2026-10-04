"use client";

import { useEffect, useState } from "react";

/** Nút cần bấm hai lần cho hành động khó hoàn tác (kick, xin thua) — thay cho confirm() chặn luồng. */
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
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
