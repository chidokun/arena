"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { CaroState } from "@/lib/games/caro";

const C = 32;

function Mark({ v, cx, cy, fresh }: { v: number; cx: number; cy: number; fresh: boolean }) {
  const r = C * 0.3;
  return v === 1 ? (
    <path
      className={fresh ? "mark-new" : undefined}
      d={`M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}`}
      stroke="var(--coral)"
      strokeWidth={5}
      strokeLinecap="round"
    />
  ) : (
    <circle className={fresh ? "mark-new" : undefined} cx={cx} cy={cy} r={r} fill="none" stroke="var(--sky)" strokeWidth={4.6} />
  );
}

export function MarkIcon({ v, size = 32, className }: { v: 1 | 2; size?: number; className?: string }) {
  return (
    <svg viewBox={`0 0 ${C} ${C}`} width={size} height={size} className={className} aria-label={v === 1 ? "X" : "O"}>
      <Mark v={v} cx={C / 2} cy={C / 2} fresh={false} />
    </svg>
  );
}

/** Bàn rộng hơn thế này thì chỉ vẽ một khung nhìn quanh các nước đã đánh. */
const MAX_VIEW = 25;
const MIN_VIEW = 15;
/** Đánh vào chừng này hàng ngoài cùng của khung thì khung nở ra phía đó. */
const EDGE = 3;
/** Nở tới khi quân vừa đánh cách mép mới chừng này ô, để vài nước sau không phải nở tiếp. */
const SPACE = 5;
/** Kéo quá chừng này pixel mới tính là kéo bàn, ít hơn vẫn là bấm đánh quân. */
const DRAG_PX = 6;
/** Hệ toạ độ cố định của SVG; khung nhìn đổi bằng `transform` của nhóm bên trong để CSS diễn được hiệu ứng. */
const S = 800;
/** Chờ quân mới đóng dấu xong (hiệu ứng `stamp` 320ms) rồi khung mới nở. */
const GROW_DELAY_MS = 350;
const GROW_MS = 450;
/** Giới hạn phóng so với khung gốc: 50% thấy gấp đôi số ô, 200% ô to gấp đôi. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
/** Lăn chuột: mỗi pixel `deltaY` đổi mức phóng theo hàm mũ hệ số này (một nấc chuột ~100px ≈ 14%). Chụm trên trackpad
 * gửi `deltaY` nhỏ hơn nhiều nên dùng hệ số lớn hơn. */
const WHEEL_K = 0.0015;
const PINCH_WHEEL_K = 0.01;
/** Ngưng lăn chừng này thì coi như buông tay: chốt khung và ẩn số %. */
const WHEEL_IDLE_MS = 350;
/** Mỗi nấc chuột nhảy một quãng, nên cho trượt ngắn qua để không thấy giật. */
const WHEEL_EASE = "transform 90ms ease-out";
/** Lúc đã phóng, quân vừa đánh luôn cách mép khung ít nhất chừng này ô. */
const KEEP = 2;

type View = { x: number; y: number; v: number };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const sameView = (a: View, b: View) => a.x === b.x && a.y === b.y && a.v === b.v;

// Khung vuông ôm hết các quân cộng lề; dùng lúc mở bàn giữa ván (vào xem, tải lại trang).
function fitView({ size: N, board, last }: CaroState): View {
  if (N <= MAX_VIEW) return { x: 0, y: 0, v: N };
  let x0 = N;
  let y0 = N;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < board.length; i++) {
    if (!board[i]) continue;
    const x = i % N;
    const y = (i - x) / N;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (x1 < 0) {
    const o = (N - MIN_VIEW) >> 1;
    return { x: o, y: o, v: MIN_VIEW };
  }
  const want = Math.max(x1 - x0, y1 - y0) + 1 + 2 * (EDGE + 1);
  const v = clamp(want, MIN_VIEW, MAX_VIEW);
  const [cx, cy] = want <= MAX_VIEW ? [(x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2] : [(last % N) + 0.5, Math.floor(last / N) + 0.5];
  return { x: clamp(Math.round(cx - v / 2), 0, N - v), y: clamp(Math.round(cy - v / 2), 0, N - v), v };
}

// Một chiều của khung `[lo, lo + len)`: quân ở ô `c` sát mép thì đẩy mép đó ra. `side` cho biết đã nới phía nào.
function reach(lo: number, len: number, c: number) {
  const hi = lo + len - 1;
  if (c - lo < EDGE) return { lo: c - SPACE, hi, side: -1 };
  if (hi - c < EDGE) return { lo, hi: c + SPACE, side: 1 };
  return { lo, hi, side: 0 };
}

// Đặt lại một chiều cho dài đúng `v`: thiếu thì độn đều hai bên, thừa (khung đã chạm cỡ lớn nhất) thì giữ phía vừa nới.
function place({ lo, hi, side }: ReturnType<typeof reach>, v: number, N: number) {
  const w = hi - lo + 1;
  const start = w <= v ? lo - Math.floor((v - w) / 2) : side > 0 ? hi - v + 1 : lo;
  return clamp(start, 0, N - v);
}

// Khung đứng yên, chỉ nở (hoặc trượt, khi đã to hết cỡ) lúc quân vừa đánh rơi vào mấy hàng ngoài cùng.
function growView(view: View, N: number, last: number): View {
  if (N <= MAX_VIEW || last < 0) return view;
  const ax = reach(view.x, view.v, last % N);
  const ay = reach(view.y, view.v, Math.floor(last / N));
  if (!ax.side && !ay.side) return view;
  const v = clamp(Math.max(ax.hi - ax.lo, ay.hi - ay.lo) + 1, view.v, Math.min(MAX_VIEW, N));
  const next = { x: place(ax, v, N), y: place(ay, v, N), v };
  return sameView(next, view) ? view : next;
}

// Khung cỡ `v` cùng tâm với `at`, kẹp trong bàn.
function resize(at: View, v: number, N: number): View {
  const d = (at.v - v) / 2;
  return { x: clamp(Math.round(at.x + d), 0, N - v), y: clamp(Math.round(at.y + d), 0, N - v), v };
}

// Một chiều của khung `[lo, lo + v)`: dời vừa đủ để ô `c` cách hai mép ít nhất KEEP ô.
const keep = (lo: number, v: number, c: number, N: number) => clamp(Math.min(Math.max(lo, Math.ceil(c + 1 + KEEP - v)), c - KEEP), 0, N - v);

// Khung nhìn theo mức phóng: 100% là đúng khung gốc. Mức khác thì giữ tâm khung trước (lúc đổi mức, khung gốc nở hay thêm
// một nước) và chỉ dời khi quân vừa đánh sát mép, để bàn đang phóng to không giật theo từng nước.
function useZoomView(state: CaroState, base: View, z: number) {
  const [track, setTrack] = useState(() => ({ count: state.count, size: state.size, base, z: 1, view: base }));
  if (track.count === state.count && track.size === state.size && track.base === base && track.z === z) return track.view;
  const N = state.size;
  let view = base;
  if (z !== 1) {
    const go = state.count - track.count;
    view = resize(state.size === track.size && go >= 0 && go <= 1 ? track.view : base, base.v / z, N);
    if (state.last >= 0) view = { ...view, x: keep(view.x, view.v, state.last % N, N), y: keep(view.y, view.v, Math.floor(state.last / N), N) };
  }
  setTrack({ count: state.count, size: state.size, base, z, view });
  return view;
}

// Khung nhìn theo các nước: nối tiếp từ khung trước khi chỉ thêm đúng một nước, còn lại (ván mới, vào giữa ván) thì đo lại.
function useBaseView(state: CaroState) {
  const [track, setTrack] = useState(() => ({ count: state.count, size: state.size, view: fitView(state) }));
  if (track.count === state.count && track.size === state.size) return track.view;
  const view = state.size === track.size && state.count === track.count + 1 ? growView(track.view, state.size, state.last) : fitView(state);
  setTrack({ count: state.count, size: state.size, view });
  return view;
}

const cameraTransform = ({ x, y, v }: View) => {
  const k = S / (v * C);
  // Dịch rồi mới phóng: CSS nội suy từng hàm riêng nên mỗi điểm đi thẳng một đường trong lúc chuyển.
  return `translate(${-x * C * k}px, ${-y * C * k}px) scale(${k})`;
};

// Khung cỡ `v` sao cho điểm (gx, gy) của bàn (đơn vị ô) nằm đúng dưới điểm (fx, fy) của khung (tính theo phần bề ngang), kẹp trong bàn.
const anchor = (gx: number, gy: number, fx: number, fy: number, v: number, N: number): View => ({
  x: clamp(gx - fx * v, 0, N - v),
  y: clamp(gy - fy * v, 0, N - v),
  v,
});

// Kéo, chụm, lăn chạy thẳng trên DOM chứ không qua React, mỗi khung hình chỉ đổi đúng `transform` của nhóm camera;
// buông tay mới chốt khung vào state (`commit` trả khung ra cho bàn cất). `live` là khung đang thao tác dở.
function createCamera() {
  const el: { cam?: SVGGElement; hover?: SVGRectElement; badge?: HTMLDivElement } = {};
  let live: View | null = null;
  let next: { view: View; ease: string } | null = null;
  let frame = 0;
  const flush = () => {
    frame = 0;
    const g = el.cam;
    if (!next || !g) return;
    g.style.transition = next.ease;
    g.style.transform = cameraTransform(next.view);
    next = null;
  };
  return {
    attach(cam: SVGGElement, hover: SVGRectElement, badge: HTMLDivElement) {
      Object.assign(el, { cam, hover, badge });
    },
    live: () => live,
    begin(from: View) {
      live = from;
      el.hover?.setAttribute("visibility", "hidden");
    },
    move(view: View, ease = "none") {
      live = view;
      next = { view, ease };
      if (!frame) frame = requestAnimationFrame(flush);
    },
    badge(z: number | null) {
      const b = el.badge;
      if (!b) return;
      if (z === null) delete b.dataset.on;
      else {
        b.firstElementChild!.textContent = `${Math.round(z * 100)}%`;
        b.dataset.on = "";
      }
    },
    commit() {
      if (frame) cancelAnimationFrame(frame);
      flush();
      const v = live;
      live = null;
      return v;
    },
    // Đổi khung theo state (nước mới, bấm "về"): trượt có hiệu ứng, trừ khi đang thao tác tay.
    settle(view: View, delay: number) {
      const g = el.cam;
      if (live || !g) return;
      g.style.transition = `transform ${GROW_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}ms`;
      g.style.transform = cameraTransform(view);
    },
  };
}

type Gesture =
  | { kind: "drag"; id: number; px: number; py: number; from: View | null }
  | { kind: "pinch"; d0: number; z0: number; gx: number; gy: number };

export const CaroBoard = memo(function CaroBoard({
  state,
  canPlay,
  myMark,
  onPlay,
}: {
  state: CaroState;
  canPlay: boolean;
  myMark: number;
  onPlay: (x: number, y: number) => void;
}) {
  const N = state.size;
  const roam = N > MAX_VIEW;
  const base = useBaseView(state);
  // Bàn nhỏ đã thấy trọn ở 100% nên không thu nhỏ thêm; mức đã chọn vẫn giữ cho ván sau trên bàn lớn.
  const [zoom, setZoom] = useState(1);
  const minZoom = Math.max(ZOOM_MIN, base.v / N);
  const z = clamp(zoom, minZoom, ZOOM_MAX);
  const follow = useZoomView(state, base, z);
  // Khung tự kéo về khi có nước mới hay sang ván mới, để không ai lỡ mất nước của đối thủ.
  const moveKey = `${N}:${state.count}:${state.last}`;
  const [pan, setPan] = useState<(View & { key: string }) | null>(null);
  const panned = !!pan && pan.key === moveKey;
  const view = panned ? pan : follow;
  // Còn phần bàn nằm ngoài khung thì kéo được: bàn gần vô hạn, hoặc bàn nhỏ đang phóng to.
  const movable = view.v < N;
  const [jumpKey, setJumpKey] = useState("");

  const svgRef = useRef<SVGSVGElement>(null);
  const camRef = useRef<SVGGElement>(null);
  const hoverRef = useRef<SVGRectElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ base, N, view, moveKey, minZoom });
  useLayoutEffect(() => {
    latest.current = { base, N, view, moveKey, minZoom };
  });

  const [cam] = useState(createCamera);
  useLayoutEffect(() => cam.attach(camRef.current!, hoverRef.current!, badgeRef.current!), [cam]);
  // Buông tay: cất khung vừa thao tác làm mức phóng và chỗ đang xem (thấy trọn bàn thì thôi, coi như chưa kéo đi đâu).
  const finish = useRef((v: View | null) => {
    if (!v) return;
    const { base, N, moveKey } = latest.current;
    setZoom(base.v / v.v);
    setPan(v.v < N ? { ...v, key: moveKey } : null);
  });

  const settled = cameraTransform(view);
  const delay = jumpKey === moveKey ? 0 : GROW_DELAY_MS;
  const [initial] = useState(() => ({ transform: settled }));
  useLayoutEffect(() => cam.settle(latest.current.view, delay), [cam, settled, delay]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  // Chặn cú bấm đi kèm lần buông tay sau khi kéo / chụm, để không lỡ tay đánh quân.
  const swallow = useRef(false);

  // Lăn chuột trên bàn là phóng / thu quanh con trỏ; phải gắn tay (không thụ động) mới chặn được trang cuộn theo.
  // Trên cảm ứng, hai ngón là của bàn: chặn trình duyệt phóng cả trang hay cuộn trang.
  useEffect(() => {
    const svg = svgRef.current!;
    let idle = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (gesture.current) return;
      const { base, N, view, minZoom } = latest.current;
      const from = cam.live() ?? view;
      if (!cam.live()) cam.begin(from);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const k = e.ctrlKey && Math.abs(dy) < 50 ? PINCH_WHEEL_K : WHEEL_K;
      const z = clamp((base.v / from.v) * Math.exp(-dy * k), minZoom, ZOOM_MAX);
      const r = svg.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      cam.move(anchor(from.x + fx * from.v, from.y + fy * from.v, fx, fy, base.v / z, N), WHEEL_EASE);
      cam.badge(z);
      clearTimeout(idle);
      idle = window.setTimeout(() => {
        finish.current(cam.commit());
        cam.badge(null);
      }, WHEEL_IDLE_MS);
    };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    const onGesture = (e: Event) => e.preventDefault();
    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("touchstart", onTouch, { passive: false });
    svg.addEventListener("touchmove", onTouch, { passive: false });
    svg.addEventListener("gesturestart", onGesture);
    return () => {
      clearTimeout(idle);
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("touchstart", onTouch);
      svg.removeEventListener("touchmove", onTouch);
      svg.removeEventListener("gesturestart", onGesture);
    };
  }, [cam]);

  // Ô dưới điểm (cx, cy) trên màn hình, -1 nếu ra ngoài bàn.
  const cellAt = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = cam.live() ?? view;
    const gx = Math.floor(v.x + ((cx - r.left) / r.width) * v.v);
    const gy = Math.floor(v.y + ((cy - r.top) / r.height) * v.v);
    return gx < 0 || gy < 0 || gx >= N || gy >= N ? -1 : gy * N + gx;
  };
  const hover = (i: number) => {
    const h = hoverRef.current;
    const svg = svgRef.current;
    if (!h || !svg) return;
    const show = i >= 0 && canPlay && !state.board[i];
    h.setAttribute("visibility", show ? "visible" : "hidden");
    svg.style.cursor = show ? "pointer" : "";
    if (show) {
      h.setAttribute("x", String((i % N) * C));
      h.setAttribute("y", String(Math.floor(i / N) * C));
    }
  };
  useEffect(() => {
    hoverRef.current?.setAttribute("visibility", "hidden");
  }, [canPlay, state.count]);

  const startPinch = (svg: SVGSVGElement) => {
    const [a, b] = [...pointers.current.values()];
    const r = svg.getBoundingClientRect();
    const from = cam.live() ?? view;
    cam.begin(from);
    const fx = ((a.x + b.x) / 2 - r.left) / r.width;
    const fy = ((a.y + b.y) / 2 - r.top) / r.height;
    gesture.current = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: base.v / from.v, gx: from.x + fx * from.v, gy: from.y + fy * from.v };
    swallow.current = true;
    cam.badge(base.v / from.v);
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const ps = pointers.current;
    ps.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ps.size === 1) {
      swallow.current = false;
      gesture.current = { kind: "drag", id: e.pointerId, px: e.clientX, py: e.clientY, from: null };
    } else if (ps.size === 2 && e.pointerType === "touch") {
      for (const id of ps.keys()) e.currentTarget.setPointerCapture(id);
      startPinch(e.currentTarget);
    }
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const ps = pointers.current;
    const g = gesture.current;
    if (!ps.has(e.pointerId) || !g) {
      if (e.pointerType === "mouse") hover(cellAt(e.clientX, e.clientY));
      return;
    }
    ps.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = e.currentTarget.getBoundingClientRect();
    if (g.kind === "pinch") {
      const [a, b] = [...ps.values()];
      const zz = clamp(g.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0), minZoom, ZOOM_MAX);
      const fx = ((a.x + b.x) / 2 - r.left) / r.width;
      const fy = ((a.y + b.y) / 2 - r.top) / r.height;
      cam.move(anchor(g.gx, g.gy, fx, fy, base.v / zz, N));
      cam.badge(zz);
      return;
    }
    if (g.id !== e.pointerId) return;
    const dx = e.clientX - g.px;
    const dy = e.clientY - g.py;
    if (!g.from) {
      const from = cam.live() ?? view;
      if (from.v >= N || Math.hypot(dx, dy) < DRAG_PX) return;
      g.from = from;
      cam.begin(from);
      swallow.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.style.cursor = "";
    }
    const { from } = g;
    cam.move({ x: clamp(from.x - (dx / r.width) * from.v, 0, N - from.v), y: clamp(from.y - (dy / r.height) * from.v, 0, N - from.v), v: from.v });
  };
  const onPointerEnd = (e: PointerEvent<SVGSVGElement>) => {
    const ps = pointers.current;
    if (!ps.delete(e.pointerId)) return;
    const g = gesture.current;
    // Nhấc một ngón khỏi cú chụm thì chốt luôn; ngón còn lại không tính là kéo nữa.
    if (g?.kind === "pinch" ? ps.size < 2 : g?.id === e.pointerId) {
      gesture.current = null;
      finish.current(cam.commit());
      cam.badge(null);
    }
  };
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    if (swallow.current) {
      swallow.current = false;
      return;
    }
    if (!canPlay) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i >= 0 && !state.board[i]) onPlay(i % N, Math.floor(i / N));
  };

  // Vẽ trọn bàn một lần theo state: chỉ có nét kẻ và các quân đã đánh, ô trống không cần phần tử nào nên kéo / phóng nhẹ.
  // Mép thật của bàn thì bỏ nét kẻ; mép khung nhìn thì vẫn kẻ cho thấy bàn còn nối dài ra ngoài.
  const lines = useMemo(() => {
    const out = [];
    for (let g = 1; g < N; g++) {
      out.push(<line key={`v${g}`} x1={g * C} y1={0} x2={g * C} y2={N * C} />, <line key={`h${g}`} x1={0} y1={g * C} x2={N * C} y2={g * C} />);
    }
    return out;
  }, [N]);
  const win = new Set(state.line);
  const marks = [];
  for (let i = 0; i < state.board.length; i++) {
    const v = state.board[i];
    if (!v) continue;
    const x = (i % N) * C;
    const y = Math.floor(i / N) * C;
    marks.push(
      <g key={i}>
        {win.has(i) && <rect className="win-cell" x={x + 1.5} y={y + 1.5} width={C - 3} height={C - 3} rx={6} />}
        {i === state.last && !win.has(i) && <rect x={x + 2} y={y + 2} width={C - 4} height={C - 4} rx={6} fill="var(--sun-soft)" stroke="var(--sun)" strokeWidth={2} />}
        <Mark v={v} cx={x + C / 2} cy={y + C / 2} fresh={i === state.last} />
      </g>,
    );
  }
  const first = state.line[0];
  const last = state.line[state.line.length - 1];
  const px = (i: number) => (i % N) * C + C / 2;
  const py = (i: number) => Math.floor(i / N) * C + C / 2;
  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${S} ${S}`}
        className={`caro ${movable ? "roam" : ""}`}
        role="grid"
        aria-label={`Bàn cờ ${roam ? "gần vô hạn" : `${N}×${N}`}${canPlay ? ` — đến lượt bạn (${myMark === 1 ? "X" : "O"})` : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={(e) => e.pointerType === "mouse" && hover(-1)}
        onClick={onClick}
      >
        <rect width={S} height={S} rx={10} fill="var(--board)" />
        <g ref={camRef} style={initial}>
          <g stroke="var(--board-line)" strokeWidth={1.4}>
            {lines}
          </g>
          <rect ref={hoverRef} className="caro-hover" width={C} height={C} visibility="hidden" />
          {marks}
          {state.line.length > 0 && (
            <line x1={px(first)} y1={py(first)} x2={px(last)} y2={py(last)} stroke="var(--edge)" strokeWidth={4} strokeLinecap="round" opacity={0.75} />
          )}
        </g>
      </svg>
      <div ref={badgeRef} className="caro-zoom-badge" aria-hidden="true">
        <span />
      </div>
      {panned && (
        <button
          type="button"
          className="btn btn-sm absolute top-2 right-2 shadow-md"
          onClick={() => {
            setJumpKey(moveKey);
            setPan(null);
          }}
        >
          ⌖ Về chỗ đang đánh
        </button>
      )}
    </div>
  );
});
