"use client";

import { useAudioPrefs } from "./engine";

/** Nút bật / tắt nhạc nền và tiếng hiệu ứng — tuỳ chọn riêng của máy này, chung cho mọi game. */
export function AudioToggles() {
  const a = useAudioPrefs();
  return (
    <>
      <button
        type="button"
        className={`btn btn-sm ${a.music ? "btn-sun" : ""}`}
        onClick={() => a.setMusic(!a.music)}
        aria-pressed={a.music}
        title="Nhạc nền — chỉ áp dụng trên máy bạn"
      >
        {a.music ? "🎵" : "🔇"} Nhạc: {a.music ? "bật" : "tắt"}
      </button>
      <button
        type="button"
        className={`btn btn-sm ${a.sound ? "btn-sun" : ""}`}
        onClick={() => a.setSound(!a.sound)}
        aria-pressed={a.sound}
        title="Tiếng khi thao tác trong game — chỉ áp dụng trên máy bạn"
      >
        {a.sound ? "🔊" : "🔈"} Tiếng: {a.sound ? "bật" : "tắt"}
      </button>
    </>
  );
}
