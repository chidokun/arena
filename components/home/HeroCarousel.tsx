"use client";

import { useRef, useState, type ReactNode } from "react";

export type HeroSlide = { label: string; content: ReactNode };

/**
 * Băng chuyền đầu trang chủ: các cảnh xếp chồng cùng một ô lưới (khung cao bằng cảnh cao nhất, đổi cảnh không xô trang).
 * Nhịp đổi cảnh do thanh tiến trình CSS (`.hero-fill`) quyết định qua `onAnimationEnd` — tạm dừng thanh là dừng luôn
 * nhịp, không lệch giữa vạch chạy và lúc đổi cảnh. Dừng khi rê chuột / focus vào trong, hoặc bấm nút tạm dừng.
 */
export function HeroCarousel({ slides, interval = 3000 }: { slides: HeroSlide[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const touchX = useRef<number | null>(null);
  const paused = hovered || focused || stopped;
  const go = (i: number) => setIndex((i + slides.length) % slides.length);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Giới thiệu Arena"
      className="relative overflow-hidden"
      // Chỉ chuột thật mới tính là rê: chạm trên điện thoại cũng bắn mouseenter nhưng không bao giờ có mouseleave.
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
      // Chỉ dừng khi focus bằng bàn phím: bấm chấm chuyển cảnh cũng focus nút, không nên vì thế mà dừng hẳn.
      onFocus={(e) => e.target.matches(":focus-visible") && setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="grid">
        {slides.map((s, i) => {
          const active = i === index;
          return (
            <div
              key={s.label}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${slides.length}: ${s.label}`}
              aria-hidden={!active}
              inert={!active}
              className="[grid-area:1/1] transition-[opacity,translate] duration-500 ease-out motion-reduce:transition-none"
              style={{ opacity: active ? 1 : 0, translate: active ? "0" : i < index ? "-40px 0" : "40px 0" }}
            >
              {s.content}
            </div>
          );
        })}
      </div>

      <div className="mx-auto flex max-w-[1280px] items-center gap-2 px-4 pb-4 sm:px-6">
        {slides.map((s, i) => {
          const active = i === index;
          return (
            <button
              key={s.label}
              type="button"
              aria-label={`Xem cảnh: ${s.label}`}
              aria-current={active}
              onClick={() => go(i)}
              className="relative h-3 overflow-hidden rounded-full border-2 border-edge bg-surface transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: active ? 48 : 12 }}
            >
              {active && (
                <span
                  key={index}
                  className="hero-fill absolute inset-y-0 left-0 bg-pen"
                  style={{ ["--hero-ms" as string]: `${interval}ms`, animationPlayState: paused ? "paused" : "running" }}
                  onAnimationEnd={() => go(index + 1)}
                />
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setStopped((v) => !v)}
          aria-label={stopped ? "Tiếp tục tự chuyển cảnh" : "Tạm dừng tự chuyển cảnh"}
          className="ml-1 grid h-7 w-7 place-items-center rounded-full text-xs text-ink-3 hover:bg-sunken hover:text-ink"
        >
          {stopped ? "▶" : "❚❚"}
        </button>
      </div>
    </section>
  );
}
