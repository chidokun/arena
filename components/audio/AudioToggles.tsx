"use client";

import { useAudioPrefs } from "./engine";

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
        {a.music ? "🎵" : "🔇"} <span className="sd-tool-label">Nhạc: {a.music ? "bật" : "tắt"}</span>
      </button>
      <button
        type="button"
        className={`btn btn-sm ${a.sound ? "btn-sun" : ""}`}
        onClick={() => a.setSound(!a.sound)}
        aria-pressed={a.sound}
        title="Tiếng khi thao tác trong game — chỉ áp dụng trên máy bạn"
      >
        {a.sound ? "🔊" : "🔈"} <span className="sd-tool-label">Tiếng: {a.sound ? "bật" : "tắt"}</span>
      </button>
    </>
  );
}
