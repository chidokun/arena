"use client";

import { memo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
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

// Khung nhìn theo các nước: nối tiếp từ khung trước khi chỉ thêm đúng một nước, còn lại (ván mới, vào giữa ván) thì đo lại.
function useBaseView(state: CaroState) {
  const [track, setTrack] = useState(() => ({ count: state.count, size: state.size, view: fitView(state) }));
  if (track.count === state.count && track.size === state.size) return track.view;
  const view = state.size === track.size && state.count === track.count + 1 ? growView(track.view, state.size, state.last) : fitView(state);
  setTrack({ count: state.count, size: state.size, view });
  return view;
}

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
  // Khung tự kéo về khi có nước mới hay sang ván mới, để không ai lỡ mất nước của đối thủ.
  const moveKey = `${state.count}:${state.last}`;
  const [pan, setPan] = useState<(View & { key: string }) | null>(null);
  const panned = !!pan && pan.key === moveKey;
  const view = panned ? pan : base;
  // Nhớ khung trước để lúc chuyển còn vẽ đủ phần đang trượt ra ngoài; bấm "về" thì chạy ngay, không chờ quân đóng dấu.
  const [shown, setShown] = useState({ view, from: view });
  if (!sameView(shown.view, view)) setShown({ view, from: shown.view });
  const [jumpKey, setJumpKey] = useState("");
  const drag = useRef<{ id: number; px: number; py: number; from: View; moved: boolean } | null>(null);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!roam || e.button !== 0) return;
    drag.current = { id: e.pointerId, px: e.clientX, py: e.clientY, from: view, moved: false };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_PX) return;
      // Chỉ giữ con trỏ khi đã chắc là kéo: giữ từ lúc nhấn thì cú bấm bị đổi đích sang cả bàn, ô không nhận được.
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const cell = e.currentTarget.getBoundingClientRect().width / d.from.v;
    const max = N - d.from.v;
    const x = clamp(Math.round(d.from.x - dx / cell), 0, max);
    const y = clamp(Math.round(d.from.y - dy / cell), 0, max);
    if (x !== view.x || y !== view.y || view.v !== d.from.v) setPan({ x, y, v: d.from.v, key: moveKey });
  };
  const onPointerEnd = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    // Để `moved` lại cho `onClickCapture` chặn cú bấm đi kèm lần thả tay sau khi kéo.
    if (!drag.current.moved) drag.current = null;
  };
  const onClickCapture = (e: MouseEvent) => {
    if (drag.current?.moved) e.stopPropagation();
    drag.current = null;
  };

  const { x: vx, y: vy, v: V } = view;
  // Vẽ phần hợp của khung cũ và khung mới để trong lúc chuyển không lộ chỗ trống.
  const { from } = shown;
  const rx0 = Math.min(vx, from.x);
  const ry0 = Math.min(vy, from.y);
  const rx1 = Math.max(vx + V, from.x + from.v);
  const ry1 = Math.max(vy + V, from.y + from.v);
  const win = new Set(state.line);
  const cells = [];
  for (let gy = ry0; gy < ry1; gy++) {
    for (let gx = rx0; gx < rx1; gx++) {
      const i = gy * N + gx;
      const x = gx * C;
      const y = gy * C;
      const v = state.board[i];
      cells.push(
        <g key={i}>
          {win.has(i) && <rect className="win-cell" x={x + 1.5} y={y + 1.5} width={C - 3} height={C - 3} rx={6} />}
          {i === state.last && !win.has(i) && <rect x={x + 2} y={y + 2} width={C - 4} height={C - 4} rx={6} fill="var(--sun-soft)" stroke="var(--sun)" strokeWidth={2} />}
          {v ? (
            <Mark v={v} cx={x + C / 2} cy={y + C / 2} fresh={i === state.last} />
          ) : (
            <rect className="cell" x={x} y={y} width={C} height={C} onClick={canPlay ? () => onPlay(gx, gy) : undefined}>
              <title>{`Cột ${gx + 1}, hàng ${gy + 1}`}</title>
            </rect>
          )}
        </g>,
      );
    }
  }
  // Mép thật của bàn thì bỏ nét kẻ; mép khung nhìn thì vẫn kẻ cho thấy bàn còn nối dài ra ngoài.
  const lines = [];
  for (let gx = rx0; gx <= rx1; gx++) if (gx !== 0 && gx !== N) lines.push(<line key={`v${gx}`} x1={gx * C} y1={ry0 * C} x2={gx * C} y2={ry1 * C} />);
  for (let gy = ry0; gy <= ry1; gy++) if (gy !== 0 && gy !== N) lines.push(<line key={`h${gy}`} x1={rx0 * C} y1={gy * C} x2={rx1 * C} y2={gy * C} />);
  const first = state.line[0];
  const last = state.line[state.line.length - 1];
  const px = (i: number) => (i % N) * C + C / 2;
  const py = (i: number) => Math.floor(i / N) * C + C / 2;
  // Dịch rồi mới phóng: CSS nội suy từng hàm riêng nên mỗi điểm đi thẳng một đường trong lúc chuyển.
  const k = S / (V * C);
  const camera = {
    transform: `translate(${-vx * C * k}px, ${-vy * C * k}px) scale(${k})`,
    transition: panned || !roam ? "none" : `transform ${GROW_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1) ${jumpKey === moveKey ? 0 : GROW_DELAY_MS}ms`,
  };
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${S} ${S}`}
        className={`caro ${canPlay ? "can-play" : ""} ${roam ? "roam" : ""}`}
        role="grid"
        aria-label={`Bàn cờ ${roam ? "gần vô hạn" : `${N}×${N}`}${canPlay ? ` — đến lượt bạn (${myMark === 1 ? "X" : "O"})` : ""}`}
        onPointerDown={roam ? onPointerDown : undefined}
        onPointerMove={roam ? onPointerMove : undefined}
        onPointerUp={roam ? onPointerEnd : undefined}
        onPointerCancel={roam ? onPointerEnd : undefined}
        onClickCapture={roam ? onClickCapture : undefined}
      >
        <rect width={S} height={S} rx={10} fill="var(--board)" />
        <g style={camera}>
          <g stroke="var(--board-line)" strokeWidth={1.4}>
            {lines}
          </g>
          {cells}
          {state.line.length > 0 && (
            <line x1={px(first)} y1={py(first)} x2={px(last)} y2={py(last)} stroke="var(--edge)" strokeWidth={4} strokeLinecap="round" opacity={0.75} />
          )}
        </g>
      </svg>
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
