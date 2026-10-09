"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { docSo, kinhLine, waitingLine } from "@/lib/games/loto";
import type { LotoRoom } from "@/lib/net/loto-room";
import { burst, type Bit } from "./Cine";

const VOICE_KEY = "arena:loto-voice";

const hasSpeech = () => typeof window !== "undefined" && "speechSynthesis" in window;
/** Chỉ nhận giọng tiếng Việt (mã ngôn ngữ vi, vi-VN, vi_VN…). */
const isViet = (v: SpeechSynthesisVoice) => /^vi([-_]|$)/i.test(v.lang);
/** Giọng tự nhiên / cao cấp (Edge "Natural", Apple "Enhanced", "Premium") đọc hay hơn giọng cơ bản. */
const rank = (v: SpeechSynthesisVoice) => (/natural|neural|premium|enhanced|online/i.test(v.name) ? 1 : 0);

let bestVoice: SpeechSynthesisVoice | null = null;
let voicesRead = false;

/** Chọn giọng tiếng Việt tốt nhất của máy; giữ nguyên tham chiếu khi không đổi để useSyncExternalStore không vẽ lại. */
function readVoices() {
  voicesRead = true;
  const best = speechSynthesis.getVoices().filter(isViet).sort((a, b) => rank(b) - rank(a))[0] ?? null;
  if (best?.voiceURI !== bestVoice?.voiceURI) bestVoice = best;
}

function subscribeVoices(fn: () => void) {
  if (!hasSpeech()) return () => {};
  const changed = () => {
    readVoices();
    fn();
  };
  speechSynthesis.addEventListener("voiceschanged", changed);
  return () => speechSynthesis.removeEventListener("voiceschanged", changed);
}

function vietVoice() {
  if (!hasSpeech()) return null;
  if (!voicesRead) readVoices();
  return bestVoice;
}

/** Tên ngắn để hiện: "Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)" → "HoaiMy". */
const voiceLabel = (v: SpeechSynthesisVoice) =>
  v.name
    .split(/\s+[-(]/)[0]
    .replace(/^(Microsoft|Google|Apple)\s+/i, "")
    .replace(/\s+Online$/i, "");

function readVoicePref(): boolean | null {
  try {
    const v = localStorage.getItem(VOICE_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

/** Đọc bằng đúng giọng tiếng Việt đã chọn — không để trình duyệt tự lấy giọng của ngôn ngữ khác. `flush`: bỏ mọi câu đang đọc. */
function say(voice: SpeechSynthesisVoice, text: string, flush = false) {
  if (flush) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = "vi-VN";
  u.rate = 1.05;
  speechSynthesis.speak(u);
}

/**
 * Đọc số bằng giọng tiếng Việt của máy — bắt buộc tiếng Việt: máy không có giọng Việt thì không đọc (giao diện
 * hướng dẫn cài). Mặc định chỉ máy chủ phòng (người kêu số) đọc, để cả nhà ngồi chung một chỗ không bị mười chiếc
 * điện thoại đọc cùng lúc; ai chơi từ xa thì tự bật.
 */
export function useVoice(session: LotoRoom, isHost: boolean) {
  const voice = useSyncExternalStore(subscribeVoices, vietVoice, () => null);
  const [pref, setPref] = useState(readVoicePref);
  const on = !!voice && (pref ?? isHost);
  useEffect(() => {
    if (!on || !voice) return;
    return session.onCall((c) => {
      // Còn câu xếp hàng chưa đọc (tab chạy nền dồn lại) thì bỏ để giọng không trễ xa số trên màn hình; câu đang đọc
      // dở (vd. "… đang đợi rồi á nha!") thì cho đọc nốt rồi mới tới số mới.
      if (speechSynthesis.pending) speechSynthesis.cancel();
      say(voice, docSo(c.n));
      if (c.kinh.length) say(voice, kinhLine(c.kinh));
      else if (c.waiting.length) say(voice, waitingLine(c.waiting));
    });
  }, [session, on, voice]);
  const toggle = () => {
    const next = !on;
    setPref(next);
    try {
      localStorage.setItem(VOICE_KEY, next ? "1" : "0");
    } catch {}
    if (!voice) return;
    // Nói ngay trong cú bấm: Safari iOS chỉ mở khoá giọng đọc khi lần đọc đầu tiên đi kèm thao tác của người dùng.
    if (next) say(voice, "Bật đọc số", true);
    else speechSynthesis.cancel();
  };
  /** Đọc một câu ngay trong thao tác của người dùng (vd. bấm Bắt đầu) nếu đang bật đọc số. */
  const announce = (text: string) => {
    if (on && voice) say(voice, text, true);
  };
  return { available: !!voice, name: voice ? voiceLabel(voice) : "", on, toggle, announce };
}

const CONFETTI = ["🧧", "🎉", "🎊", "✨", "🌸", "🏮", "💰"];

/** Pháo giấy khi có người kinh — chỉ khi đang xem trực tiếp, tải lại trang không bắn lại. */
export function useConfetti(session: LotoRoom) {
  const [bits, setBits] = useState<Bit[]>([]);
  useEffect(
    () =>
      session.onCall((c) => {
        if (!c.kinh.length) return;
        const key = `${c.round}:${c.count}`;
        setBits(burst(key, CONFETTI, 24));
        setTimeout(() => setBits((b) => (b[0]?.key.startsWith(`${key}:`) ? [] : b)), 4800);
      }),
    [session],
  );
  return bits;
}

/** Phần tử còn nằm trong khung nhìn không (trừ thanh đầu trang dính 64px). */
export function useInView(ref: React.RefObject<Element | null>) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}
