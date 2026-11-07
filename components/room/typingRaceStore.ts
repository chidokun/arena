"use client";

import { useSyncExternalStore } from "react";
import { thin, type Mode, type Pt, type TrOptions, type TrRec } from "@/lib/games/typing-race";

// ——— Diễn biến ván: mốc (thời điểm, số ký tự) của từng người, chỉ giữ trong bộ nhớ của phiên phòng ———

type Hist = { seed: number; pts: Pt[][] };
const hists = new WeakMap<object, Hist>();

/** Ghi thêm mốc mới từ bản ghi tiến độ (`at` là lúc đạt `n`, tính từ lúc xuất phát — mọi máy thấy giống nhau). */
export function record(session: object, seed: number, recs: readonly (TrRec | null)[]): Pt[][] {
  let h = hists.get(session);
  if (!h || h.seed !== seed) {
    h = { seed, pts: [] };
    hists.set(session, h);
  }
  recs.forEach((r, k) => {
    const pts = (h.pts[k] ??= [[0, 0]]);
    const last = pts[pts.length - 1];
    if (r && r.n > last[1] && r.at >= last[0]) pts.push([r.at, r.n]);
  });
  return h.pts;
}

// Combo dài nhất của mình trong ván — khu vực gõ đóng lại lúc có kết quả nên gửi sang thẻ kết quả qua đây.
const combos = new WeakMap<object, { seed: number; best: number }>();
export const keepCombo = (session: object, seed: number, best: number) => combos.set(session, { seed, best });
export const bestCombo = (session: object, seed: number) => {
  const c = combos.get(session);
  return c?.seed === seed ? c.best : 0;
};

// ——— Lưu trên máy: thành tích (mở khoá dáng xe) và kỷ lục từng cấu hình (xe ma) ———

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
function subscribe(f: () => void) {
  subs.add(f);
  const onStorage = (e: StorageEvent) => e.key?.startsWith("arena:typing-race:") && f();
  window.addEventListener("storage", onStorage);
  return () => {
    subs.delete(f);
    window.removeEventListener("storage", onStorage);
  };
}

const cache = new Map<string, { raw: string | null; v: unknown }>();
function read<T>(key: string, parse: (x: unknown) => T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {}
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.v as T;
  let x: unknown = null;
  try {
    x = JSON.parse(raw ?? "null");
  } catch {}
  const v = parse(x);
  cache.set(key, { raw, v });
  return v;
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
  emit();
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

export type Stats = { races: number; wins: number; seen: number[] };
const STATS_KEY = "arena:typing-race:stats";
const NO_STATS: Stats = { races: 0, wins: 0, seen: [] };
const parseStats = (x: unknown): Stats => {
  const s = x as Partial<Stats> | null;
  if (!s || typeof s !== "object") return NO_STATS;
  return { races: num(s.races), wins: num(s.wins), seen: Array.isArray(s.seen) ? s.seen.filter((n) => typeof n === "number").slice(-60) : [] };
};
const readStats = () => read(STATS_KEY, parseStats);

export function useStats() {
  return useSyncExternalStore(subscribe, readStats, () => NO_STATS);
}

/** Đếm một ván đã chơi trọn, mỗi ván (theo seed) một lần dù tải lại trang. */
export function countRace(seed: number, won: boolean) {
  const s = readStats();
  if (s.seen.includes(seed)) return;
  write(STATS_KEY, { races: s.races + 1, wins: s.wins + (won ? 1 : 0), seen: [...s.seen, seed].slice(-60) });
}

export type Ghost = { fin?: number; n: number; pts: Pt[] };

/** Văn bản tự nhập thì mỗi lần một khác — không có kỷ lục. */
export const ghostKey = (o: TrOptions) => (o.source === "custom" ? null : `arena:typing-race:ghost:${o.mode}:${o.mode === "chars" ? o.length : o.minutes}:${o.lang}:${o.level}`);

const parseGhost = (x: unknown): Ghost | null => {
  const g = x as Partial<Ghost> | null;
  if (!g || typeof g !== "object" || !Array.isArray(g.pts)) return null;
  const pts = g.pts.filter((p): p is Pt => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Number.isFinite(v)));
  if (pts.length < 2) return null;
  return { n: num(g.n), pts, ...(typeof g.fin === "number" && g.fin > 0 ? { fin: g.fin } : {}) };
};

const NO_KEY = () => null;
export function useGhost(o: TrOptions) {
  const key = ghostKey(o);
  return useSyncExternalStore(subscribe, key ? () => read(key, parseGhost) : NO_KEY, NO_KEY);
}

export const readGhost = (o: TrOptions) => {
  const key = ghostKey(o);
  return key ? read(key, parseGhost) : null;
};

/** Theo ký tự: về đích nhanh hơn; theo thời gian: đi xa hơn. */
export const beats = (mode: Mode, run: { fin?: number; n: number }, best: Ghost | null) =>
  mode === "chars" ? run.fin != null && (!best || best.fin == null || run.fin < best.fin) : run.n > 0 && (!best || run.n > best.n);

export function saveGhost(o: TrOptions, run: Ghost) {
  const key = ghostKey(o);
  if (key) write(key, { ...run, pts: thin(run.pts, 160) });
}
