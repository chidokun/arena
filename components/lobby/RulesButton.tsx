"use client";

import { useEffect, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import { RULES } from "@/lib/games/rules";
import { Dialog } from "../Dialog";

/** Đã tick "Không hiện lại" cho game này — chỉ áp dụng cho máy này. */
const hideKey = (slug: string) => `arena:rules:${slug}:hide`;
/** Bong bóng nhắc chỗ xem lại luật tự tắt sau chừng này. */
const HINT_MS = 8000;

function readHidden(slug: string) {
  try {
    return localStorage.getItem(hideKey(slug)) === "1";
  } catch {
    return false;
  }
}

function saveHidden(slug: string, hide: boolean) {
  try {
    if (hide) localStorage.setItem(hideKey(slug), "1");
    else localStorage.removeItem(hideKey(slug));
  } catch {}
}

/**
 * Nút "Xem luật chơi" cạnh nút Tạo phòng. Vào sảnh mà chưa tick "Không hiện lại" thì tự mở popup luật chơi; đóng popup
 * tự mở đó thì hiện bong bóng chỉ chỗ xem lại.
 */
export function RulesButton({ game }: { game: GameDef }) {
  // auto: popup tự mở lúc vào sảnh (lời chào + bong bóng khi đóng); manual: bấm nút mở lại.
  const [open, setOpen] = useState<"auto" | "manual" | null>(null);
  const [hide, setHide] = useState(false);
  const [hint, setHint] = useState(false);

  // Trang sảnh dựng sẵn lúc build, nên chỉ đọc lựa chọn đã nhớ sau khi vào trình duyệt; mở trễ một nhịp cho trang kịp hiện.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!readHidden(game.slug)) setOpen("auto");
    }, 350);
    return () => clearTimeout(t);
  }, [game.slug]);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(t);
  }, [hint]);

  const show = () => {
    setHint(false);
    setHide(readHidden(game.slug));
    setOpen("manual");
  };

  const close = () => {
    saveHidden(game.slug, hide);
    if (open === "auto") setHint(true);
    setOpen(null);
  };

  const rules = RULES[game.slug];
  return (
    <>
      <span className="relative flex-none">
        <button type="button" className="btn h-12 px-4 text-[15px]" onClick={show} aria-describedby={hint ? "rules-hint" : undefined}>
          <span aria-hidden="true">📖</span> Xem luật chơi
        </button>
        {hint && (
          <span id="rules-hint" role="status" className="rules-hint" onClick={() => setHint(false)}>
            Bấm vào để xem lại luật chơi
          </span>
        )}
      </span>

      <Dialog open={open !== null} onClose={close} title={open === "auto" ? `Chào mừng bạn đến với ${game.name}!` : `Luật chơi ${game.name}`} className="is-wide">
        <div className="-mx-5 max-h-[calc(100dvh-230px)] overflow-x-hidden overflow-y-auto px-5 sm:-mx-6 sm:px-6">
          <p className="flex items-start gap-3 rounded-2xl bg-sunken p-3.5 text-[15px] text-ink-2">
            <span className="text-3xl leading-none" aria-hidden="true">
              {game.emoji}
            </span>
            <span>{rules?.intro ?? game.description}</span>
          </p>
          {rules?.sections.map((s) => (
            <section key={s.title} className="mt-4">
              <h3 className="flex items-center gap-2 font-display text-[17px] font-extrabold">
                <span aria-hidden="true">{s.emoji}</span> {s.title}
              </h3>
              <ul className="rules-list mt-1.5 grid gap-1.5 text-[14.5px] text-ink-2">
                {s.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-rule pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-ink-2 select-none">
            <input type="checkbox" className="h-[18px] w-[18px] accent-[var(--pen)]" checked={hide} onChange={(e) => setHide(e.target.checked)} />
            Không hiện lại
          </label>
          <button type="button" className="btn btn-pen px-6" onClick={close}>
            Đã hiểu
          </button>
        </div>
      </Dialog>
    </>
  );
}
