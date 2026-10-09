"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { START_COUNTDOWN_MS, type Member } from "@/lib/net/room";
import { Avatar } from "../Avatar";

/**
 * Các cảnh diễn dùng chung cho game: đếm ngược lúc mở ván, cảnh mở màn / chiến thắng / hoà, pháo giấy.
 * Chỉ diễn khi khoảnh khắc xảy ra ngay trước mắt — vào phòng / tải lại trang giữa chừng thì không diễn lại
 * (trừ khi truyền `onMount`, vd. đếm ngược có mốc kết thúc thật thì vào giữa chừng vẫn đếm phần còn lại).
 *
 * Kiểu dáng nằm trọn trong các class `cine-*` của globals.css, không mượn class của game nào.
 */

type Key = string | number;

export const CHEERS = ["🎉", "🏆", "✨", "🎊", "⭐"];
const PARTY_MS = 4800;
const END_MS = 7000;

/**
 * Gọi `start(key)` mỗi khi `key` đổi sang một giá trị mới khác 0 — giá trị lúc vừa gắn vào chỉ tính khi `onMount`.
 * `start` trả về hàm dọn dẹp, chạy khi `key` đổi tiếp hoặc khi gỡ ra.
 */
function useFreshKey(key: Key, onMount: boolean, start: (key: Key) => (() => void) | void) {
  const seen = useRef<Key>(onMount ? 0 : key);
  useEffect(() => {
    const prev = seen.current;
    seen.current = key;
    if (!key || key === prev) return;
    const stop = start(key);
    return () => {
      stop?.();
      // Gỡ ra rồi gắn lại (StrictMode) thì vẫn diễn lại khoảnh khắc này; đổi key thì key mới so với key cũ hơn nữa — vẫn là mới.
      seen.current = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `start` đọc giá trị của lần render có `key` mới
  }, [key]);
}

/**
 * Đếm ngược mở ván: khi `key` đổi sang một giá trị mới thì đếm `ms` (mặc định 3 giây) theo từng giây.
 * `endsAt` (mốc ván thật sự chạy) nếu có thì chỉ đếm phần còn lại, tối đa `ms`. Trả về số đang hiện; 0 là không đếm / đã xong.
 */
export function useCountdown(key: Key, { endsAt, ms = START_COUNTDOWN_MS, onMount = false }: { endsAt?: number; ms?: number; onMount?: boolean } = {}) {
  const [state, setState] = useState<{ key: Key; n: number }>({ key: 0, n: 0 });
  useFreshKey(key, onMount, (k) => {
    const now = Date.now();
    // Đếm theo mốc thời gian chứ không cộng dồn từng nhịp, để tab bị chậm vẫn mở bàn đúng giờ.
    const until = now + (endsAt == null ? ms : Math.min(ms, Math.max(0, endsAt - now)));
    const tick = () => {
      const n = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setState({ key: k, n });
      return n;
    };
    if (!tick()) return;
    const t = setInterval(() => {
      if (!tick()) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  });
  return state.key === key ? state.n : 0;
}

/**
 * Một khoảnh khắc diễn trong `ms` rồi tự tắt (cảnh mở màn, chữ "Chiếu tướng!"…): bật khi `key` đổi sang giá trị mới
 * (sau `delay` ms), tắt sớm khi `key` đổi tiếp hoặc khi gọi `close`.
 */
export function useMoment(key: Key, ms: number, { delay = 0, onMount = false }: { delay?: number; onMount?: boolean } = {}) {
  const [on, setOn] = useState<Key>(0);
  useFreshKey(key, onMount, (k) => {
    const show = () => setOn(k);
    const a = delay ? setTimeout(show, delay) : (show(), undefined);
    const b = setTimeout(() => setOn((v) => (v === k ? 0 : v)), delay + ms);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  });
  return { shown: !!key && on === key, close: () => setOn(0) };
}

/**
 * Cảnh hết ván: khi `key` đổi sang ván vừa xong thì diễn (sau `delay` ms — vd. để kịp nhìn đường thắng trên bàn) trong
 * `ms`, kèm pháo giấy. `cheer` false thì không bắn pháo giấy (người thua không bị bắn vào mặt).
 */
export function useEndScene(
  key: Key,
  { delay = 0, ms = END_MS, cheer = true, emojis = CHEERS, onMount = false }: { delay?: number; ms?: number; cheer?: boolean; emojis?: readonly string[]; onMount?: boolean } = {},
) {
  const [on, setOn] = useState<Key>(0);
  const [party, setParty] = useState<Bit[]>([]);
  useFreshKey(key, onMount, (k) => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, wait: number) => timers.push(setTimeout(fn, wait));
    later(() => {
      setOn(k);
      setParty(burst(k, emojis));
    }, delay);
    later(() => setParty([]), delay + PARTY_MS);
    later(() => setOn((v) => (v === k ? 0 : v)), delay + ms);
    return () => {
      timers.forEach(clearTimeout);
      setParty([]);
    };
  });
  return { shown: !!key && on === key, party: cheer && on === key ? party : [], close: () => setOn(0) };
}

// ---------- pháo giấy ----------

export type Bit = { key: string; left: number; delay: number; dur: number; rot: number; emoji: string };

/** Một loạt pháo giấy rơi từ mép trên, mỗi mảnh một emoji ngẫu nhiên trong `emojis`. */
export function burst(key: Key, emojis: readonly string[] = CHEERS, count = 40): Bit[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `${key}:${i}`,
    left: Math.random() * 96,
    delay: Math.random() * 700,
    dur: 2200 + Math.random() * 1600,
    rot: Math.round(Math.random() * 540 - 270),
    emoji: emojis[Math.floor(Math.random() * emojis.length)],
  }));
}

/** Pháo giấy toàn màn hình, nổi trên các cảnh diễn. */
export function Party({ bits }: { bits: Bit[] }) {
  if (!bits.length) return null;
  return (
    <div className="cine-party" aria-hidden="true">
      {bits.map((b) => (
        <span key={b.key} style={{ left: `${b.left}%`, animationDelay: `${b.delay}ms`, animationDuration: `${b.dur}ms`, ["--rot" as string]: `${b.rot}deg` }}>
          {b.emoji}
        </span>
      ))}
    </div>
  );
}

// ---------- khung cảnh ----------

/**
 * Nền của cảnh: `duel` đỏ–xanh đối đầu, `grape` tím, `red` đỏ thẫm, `gold` vàng rực (chiến thắng), `lilac` tím nhạt (hoà).
 */
export type Tone = "duel" | "grape" | "red" | "gold" | "lilac";

/** Lớp phủ toàn màn hình của một cảnh. Có `onClose` thì bấm vào đâu cũng đóng (kèm dòng nhắc `skip` ở đáy). */
export function Cine({ tone, label, onClose, skip = "Bấm để đóng", gap = 4, children }: { tone: Tone; label: string; onClose?: () => void; skip?: string; gap?: number; children: ReactNode }) {
  return (
    <div className={`cine is-${tone}${onClose ? " is-skippable" : ""}`} role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <div className="cine-body" style={{ gap: gap * 4 }}>
        {children}
      </div>
      {onClose && <p className="cine-skip">{skip}</p>}
    </div>
  );
}

/** Dòng chữ nhỏ in hoa ở đầu cảnh: tên game, ván… */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[15px] font-bold tracking-wide uppercase opacity-80">{children}</p>;
}

/**
 * Huy hiệu gắn góc avatar (quân X/O, màu quân, phe…): mặc định là viên tròn nền trắng; `plain` thì để nguyên hình
 * (vd. quân cờ tướng đã có sẵn đĩa tròn).
 */
export function Badge({ children, plain }: { children: ReactNode; plain?: boolean }) {
  return <span className={`cine-badge${plain ? " is-plain" : ""}`}>{children}</span>;
}

/** Viền màu quanh avatar (theo màu quân / phe) — truyền xuống `.cine-avatar` / `.cine-draw-avatar` qua biến CSS. */
const ringOf = (color?: string) => (color ? { ["--ring" as string]: color } : undefined);

/** Huy hiệu tuỳ chọn của một người trong cảnh. */
type Badged = { badge?: ReactNode; plainBadge?: boolean };

function Face({ p, size, className, ring, badge, plainBadge }: { p?: Member; size: number; className: string; ring?: string } & Badged) {
  return (
    <span className="relative" style={ringOf(ring)}>
      {p ? <Avatar p={p} size={size} className={className} /> : <span className={`avatar ${className}`} style={{ width: size, height: size }} />}
      {badge && <Badge plain={plainBadge}>{badge}</Badge>}
    </span>
  );
}

/** Một bên trong cảnh đối đầu: avatar (viền màu bên đó, kèm huy hiệu), tên, dòng phụ. Bên trái lao vào từ trái, bên phải từ phải. */
export function Fighter({ p, name, sub, ring, side, ...badge }: { p?: Member; name: string; sub?: ReactNode; ring?: string; side: "left" | "right" } & Badged) {
  return (
    <div className={`cine-fighter from-${side}`}>
      <Face p={p} size={88} className="cine-avatar" ring={ring} {...badge} />
      <b className="mt-3 max-w-[160px] truncate font-display text-xl font-extrabold">{name}</b>
      {sub && <span className="text-[13.5px] font-bold opacity-80">{sub}</span>}
    </div>
  );
}

/** Hai bên (hoặc hai phe) đối đầu với chữ VS ở giữa. */
export function Duel({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="cine-duel">
      {left}
      <Vs />
      {right}
    </div>
  );
}

/** Chữ VS vàng đóng dấu. */
export function Vs() {
  return (
    <span className="cine-vs" aria-hidden="true">
      VS
    </span>
  );
}

export type CrowdItem = { uid: string; p?: Member; name: string; ring?: string } & Badged;

/** Nhiều người chơi: hàng avatar nảy lên lần lượt. */
export function Crowd({ people }: { people: CrowdItem[] }) {
  return (
    <ul className="cine-crowd">
      {people.map(({ uid, name, ...x }, i) => (
        <li key={uid} style={{ animationDelay: `${120 + i * 70}ms` }}>
          <Face size={60} className="cine-avatar" {...x} />
          <b className="max-w-[96px] truncate text-[13.5px] font-extrabold">{name}</b>
        </li>
      ))}
    </ul>
  );
}

/** Chữ to đóng dấu nghiêng giữa cảnh ("Khai cuộc!"). */
export function Stamp({ children }: { children: ReactNode }) {
  return <p className="cine-stamp">{children}</p>;
}

/** Lời nhắn ngắn dưới cảnh, hiện lên sau cùng. */
export function Tip({ children }: { children: ReactNode }) {
  return <p className="cine-tip">{children}</p>;
}

/**
 * Cảnh đếm ngược mở ván: dòng tên game / ván, những người chơi (`children`), số đếm lớn, tiêu đề và lời nhắn.
 * Không bấm bỏ qua được.
 */
export function CountdownCine({ eyebrow, n, title, tip, tone = "duel", children }: { eyebrow: ReactNode; n: number; title?: ReactNode; tip?: ReactNode; tone?: Tone; children?: ReactNode }) {
  return (
    <Cine tone={tone} label="Đếm ngược" gap={5}>
      <Eyebrow>{eyebrow}</Eyebrow>
      {children}
      <span key={n} className="cine-count" aria-live="assertive">
        {n}
      </span>
      {title && <p className="cine-title !text-[26px] sm:!text-[30px]">{title}</p>}
      {tip && <Tip>{tip}</Tip>}
    </Cine>
  );
}

export type Winner = { uid: string; p?: Member } & Badged;

/**
 * Cảnh chiến thắng (vàng rực): cúp, avatar những người thắng, tiêu đề, dòng lý do, phần riêng của game (`children`,
 * vd. điểm số), lời nhắn cuối (`note`) — bấm để đóng.
 */
export function WinCine({
  winners,
  title,
  sub,
  note,
  trophy = "🏆",
  children,
  onClose,
}: {
  winners: Winner[];
  title: ReactNode;
  sub?: ReactNode;
  note?: ReactNode;
  trophy?: string;
  children?: ReactNode;
  onClose: () => void;
}) {
  const size = winners.length > 3 ? 64 : winners.length > 1 ? 72 : 84;
  return (
    <Cine tone="gold" label="Chiến thắng" onClose={onClose}>
      <span className="cine-trophy" aria-hidden="true">
        {trophy}
      </span>
      <div className="flex flex-wrap justify-center gap-4">
        {winners.map(({ uid, ...w }) => (
          <Face key={uid} size={size} className="cine-win-avatar" {...w} />
        ))}
      </div>
      <p className="cine-title !text-[34px] sm:!text-[42px]">{title}</p>
      {sub && <p className="text-[17px] font-bold opacity-90">{sub}</p>}
      {children}
      {note && <p className="cine-next">{note}</p>}
    </Cine>
  );
}

export type DrawPerson = { uid: string; p?: Member; ring?: string };

/** Cảnh hoà / không ai thắng (tím nhạt), mỗi người một viền màu riêng nếu có — bấm để đóng. */
export function DrawCine({ people, title, sub, emoji = "🤝", onClose }: { people: DrawPerson[]; title: ReactNode; sub?: ReactNode; emoji?: string; onClose: () => void }) {
  return (
    <Cine tone="lilac" label="Hoà" onClose={onClose}>
      <span className="cine-trophy" aria-hidden="true">
        {emoji}
      </span>
      <div className="flex flex-wrap justify-center gap-3">
        {people.map((x) => (x.p ? <Face key={x.uid} p={x.p} size={64} className="cine-draw-avatar" ring={x.ring} /> : null))}
      </div>
      <p className="cine-title !text-[38px] sm:!text-[44px]">{title}</p>
      {sub && <p className="text-[17px] font-bold opacity-90">{sub}</p>}
    </Cine>
  );
}
