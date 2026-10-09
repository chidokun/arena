"use client";

import { useEffect, useRef, useState } from "react";
import { canUndo, ERASER, H, isFill, MAX_POINTS, PALETTE, SIZES, visibleOps, W, type Op, type Stroke } from "@/lib/games/draw-guess";
import type { DrawGuessRoom } from "@/lib/net/draw-guess-room";

export type Tool = { kind: "pen" | "eraser" | "fill"; color: number; size: number };

/** Gửi phần điểm mới của nét đang vẽ dở bấy nhiêu ms một lần. */
const INK_MS = 50;
/** Hai điểm liền nhau của một nét cách nhau ít nhất chừng này (đơn vị logic). */
const MIN_STEP = 2;
/** Độ lệch màu tối đa (tổng ba kênh) vẫn coi là cùng vùng khi đổ màu — nuốt được mép răng cưa của nét. */
const FILL_TOLERANCE = 120;

function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke, scale: number) {
  const p = s.p;
  const width = SIZES[s.z] * scale;
  ctx.strokeStyle = ctx.fillStyle = PALETTE[s.c];
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (p.length === 2) {
    ctx.arc(p[0] * scale, p[1] * scale, width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.moveTo(p[0] * scale, p[1] * scale);
  // Đường cong qua trung điểm các cặp điểm liền nhau cho nét mượt.
  for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i] * scale, p[i + 1] * scale, ((p[i] + p[i + 2]) / 2) * scale, ((p[i + 1] + p[i + 3]) / 2) * scale);
  ctx.lineTo(p[p.length - 2] * scale, p[p.length - 1] * scale);
  ctx.stroke();
}

/** Đổ màu vùng liền quanh (x, y) theo dòng quét. */
function floodFill(ctx: CanvasRenderingContext2D, px: number, py: number, hex: string) {
  const { width: w, height: h } = ctx.canvas;
  const x0 = Math.min(w - 1, Math.max(0, Math.floor(px)));
  const y0 = Math.min(h - 1, Math.max(0, Math.floor(py)));
  const img = ctx.getImageData(0, 0, w, h);
  const data = new Uint32Array(img.data.buffer);
  const n = parseInt(hex.slice(1), 16);
  // Điểm ảnh little-endian: A B G R.
  const fill = (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff);
  const target = data[y0 * w + x0];
  const tr = target & 0xff;
  const tg = (target >> 8) & 0xff;
  const tb = (target >> 16) & 0xff;
  const near = (c: number) => Math.abs((c & 0xff) - tr) + Math.abs(((c >> 8) & 0xff) - tg) + Math.abs(((c >> 16) & 0xff) - tb) <= FILL_TOLERANCE;
  if ((target | 0) === (fill | 0)) return;
  const done = new Uint8Array(w * h);
  const open = (i: number) => !done[i] && near(data[i]);
  const stack = [x0, y0];
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    const row = y * w;
    if (!open(row + x)) continue;
    let l = x;
    while (l > 0 && open(row + l - 1)) l--;
    let r = x;
    while (r < w - 1 && open(row + r + 1)) r++;
    for (let i = l; i <= r; i++) {
      data[row + i] = fill;
      done[row + i] = 1;
    }
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= h) continue;
      let inRun = false;
      for (let i = l; i <= r; i++) {
        const ok = open(ny * w + i);
        if (ok && !inRun) stack.push(i, ny);
        inRun = ok;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function clearWhite(ctx: CanvasRenderingContext2D) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

type Props = { ops: Op[]; turnKey: string; canDraw: boolean; tool: Tool };
/** Nét mình đang vẽ: thao tác thứ n của tranh, đã phát bao nhiêu điểm qua rumor. */
type Pen = { n: number; stroke: Stroke; sent: number };

/**
 * Bộ vẽ của một bảng: lớp dưới là các thao tác đã ghi (vẽ thêm từng thao tác mới, có hoàn tác thì vẽ lại từ đầu), lớp
 * trên là nét đang vẽ dở (của mình, hoặc của người vẽ nhận qua rumor) và vòng cỡ bút, vẽ lại theo khung hình.
 */
class Painter {
  private base: HTMLCanvasElement | null = null;
  private live: HTMLCanvasElement | null = null;
  private props: Props = { ops: [], turnKey: "", canDraw: false, tool: { kind: "pen", color: 1, size: 1 } };
  /** Lớp dưới đã vẽ tới đâu: lượt nào, bao nhiêu thao tác, ở cỡ nào. */
  private drawn = { key: "", count: 0, width: 0 };
  /** Nét mình đang vẽ. */
  private pen: Pen | null = null;
  /** Nét mình vừa vẽ xong nhưng lớp dưới chưa vẽ tới — vẫn giữ trên lớp trên để không nháy. */
  private pending: { n: number; stroke: Stroke }[] = [];
  private hover: [number, number] | null = null;
  private frame = 0;
  private session: DrawGuessRoom;

  constructor(session: DrawGuessRoom) {
    this.session = session;
  }

  update(next: Props) {
    this.props = next;
    if (!next.canDraw) {
      this.pen = null;
      this.hover = null;
    }
    this.paintBase(false);
  }

  attach(base: HTMLCanvasElement | null, live: HTMLCanvasElement | null) {
    this.base = base;
    this.live = live;
  }

  /** Canvas theo cỡ khung × mật độ điểm ảnh; đổi cỡ thì vẽ lại. */
  fit(wrap: HTMLElement) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(wrap.clientWidth * dpr));
    const h = Math.round((w * H) / W);
    for (const c of [this.base, this.live]) {
      if (!c || (c.width === w && c.height === h)) continue;
      c.width = w;
      c.height = h;
    }
    this.paintBase(true);
  }

  private paintBase(force: boolean) {
    const c = this.base;
    if (!c?.width) return;
    const { ops, turnKey } = this.props;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    const scale = c.width / W;
    const d = this.drawn;
    const fresh = ops.slice(d.count);
    const paint = (op: Op) => (isFill(op) ? floodFill(ctx, op.p[0] * scale, op.p[1] * scale, PALETTE[op.f]) : "c" in op ? paintStroke(ctx, op, scale) : clearWhite(ctx));
    if (force || d.key !== turnKey || d.width !== c.width || ops.length < d.count || fresh.some((op) => "u" in op)) {
      clearWhite(ctx);
      for (const op of visibleOps(ops)) paint(op);
    } else for (const op of fresh) paint(op);
    this.drawn = { key: turnKey, count: ops.length, width: c.width };
    this.pending = this.pending.filter((p) => p.n >= ops.length);
    this.scheduleLive();
  }

  scheduleLive = () => {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.paintLive());
  };

  private paintLive() {
    this.frame = 0;
    const c = this.live;
    if (!c?.width) return;
    const ctx = c.getContext("2d")!;
    const scale = c.width / W;
    ctx.clearRect(0, 0, c.width, c.height);
    const done = this.drawn.count;
    for (const [n, s] of this.session.liveInk()) if (n >= done) paintStroke(ctx, s, scale);
    for (const p of this.pending) if (p.n >= done) paintStroke(ctx, p.stroke, scale);
    if (this.pen) paintStroke(ctx, this.pen.stroke, scale);
    const { canDraw, tool } = this.props;
    const at = this.hover;
    if (canDraw && at && tool.kind !== "fill") {
      ctx.beginPath();
      ctx.arc(at[0] * scale, at[1] * scale, Math.max(2, (SIZES[tool.size] * scale) / 2), 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, scale);
      ctx.strokeStyle = tool.kind === "eraser" || PALETTE[tool.color] === "#ffffff" ? "#7d7d7d" : PALETTE[tool.color];
      ctx.stroke();
    }
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  /** Ảnh nhỏ của tranh hiện tại. */
  thumbnail() {
    const c = this.base;
    if (!c?.width) return null;
    const t = document.createElement("canvas");
    t.width = 480;
    t.height = 360;
    t.getContext("2d")!.drawImage(c, 0, 0, t.width, t.height);
    return t.toDataURL("image/jpeg", 0.85);
  }

  // ---------- người vẽ ----------

  flushInk() {
    const p = this.pen;
    if (!p || p.stroke.p.length / 2 <= p.sent) return;
    this.session.sendInk(p.n, p.sent, p.stroke.c, p.stroke.z, p.stroke.p.slice(p.sent * 2));
    p.sent = p.stroke.p.length / 2;
  }

  private commit() {
    const p = this.pen;
    if (!p) return;
    this.flushInk();
    this.pen = null;
    if (this.session.draw(p.stroke)) this.pending.push({ n: p.n, stroke: p.stroke });
    this.scheduleLive();
  }

  private toLogical(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.base!.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * W);
    const y = Math.round(((e.clientY - r.top) / r.height) * H);
    return [Math.min(W, Math.max(0, x)), Math.min(H, Math.max(0, y))];
  }

  down(e: React.PointerEvent<HTMLElement>) {
    const { canDraw, tool } = this.props;
    if (!canDraw || e.button > 0 || !this.base) return;
    e.preventDefault();
    try {
      // Giữ con trỏ khi kéo ra ngoài tranh; con trỏ đã nhả (hoặc sự kiện giả lập) thì không bắt được — bỏ qua.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    const [x, y] = this.toLogical(e);
    if (tool.kind === "fill") {
      this.session.draw({ f: tool.color, p: [x, y] });
      return;
    }
    this.pen = { n: this.session.opCount(), stroke: { c: tool.kind === "eraser" ? ERASER : tool.color, z: tool.size, p: [x, y] }, sent: 0 };
    this.scheduleLive();
  }

  move(e: React.PointerEvent<HTMLElement>) {
    if (!this.props.canDraw || !this.base) return;
    this.hover = e.pointerType === "mouse" ? this.toLogical(e) : null;
    if (this.pen) {
      const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const ev of coalesced.length ? coalesced : [e.nativeEvent]) {
        const pen: Pen | null = this.pen;
        if (!pen) break;
        const [x, y] = this.toLogical(ev);
        const s = pen.stroke.p;
        if (Math.hypot(x - s[s.length - 2], y - s[s.length - 1]) < MIN_STEP) continue;
        s.push(x, y);
        // Nét quá dài: chốt nét này, nối tiếp bằng nét mới từ điểm cuối.
        if (s.length >= MAX_POINTS * 2) {
          this.commit();
          this.pen = { n: this.session.opCount(), stroke: { c: pen.stroke.c, z: pen.stroke.z, p: [x, y] }, sent: 0 };
        }
      }
    }
    this.scheduleLive();
  }

  up() {
    this.commit();
  }

  leave() {
    this.hover = null;
    this.scheduleLive();
  }

  /** Phím tắt người vẽ: Ctrl/⌘+Z hoàn tác. Bỏ qua khi đang gõ chat. */
  key(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, select, [contenteditable]")) return;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z" && canUndo(this.props.ops)) {
      e.preventDefault();
      this.session.draw({ u: 1 });
    }
  }
}

/**
 * Tranh của lượt; người vẽ vẽ bằng chuột / bút / ngón tay. `capture`: mỗi khi khoá đổi thì chụp một ảnh nhỏ của tranh
 * (triển lãm cuối ván). Lớp phủ (chọn từ, lộ đáp án…) truyền qua `children`.
 */
export function DrawBoard({
  session,
  ops,
  turnKey,
  canDraw,
  tool,
  capture,
  children,
}: Props & {
  session: DrawGuessRoom;
  capture?: { key: string; onCapture: (url: string) => void };
  children?: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const [painter] = useState(() => new Painter(session));
  const captured = useRef("");

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    painter.attach(baseRef.current, liveRef.current);
    painter.fit(wrap);
    const ro = new ResizeObserver(() => painter.fit(wrap));
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      painter.stop();
      painter.attach(null, null);
    };
  }, [painter]);

  useEffect(() => painter.update({ ops, turnKey, canDraw, tool }), [painter, ops, turnKey, canDraw, tool]);
  useEffect(() => session.onInk(painter.scheduleLive), [session, painter]);

  // Chụp tranh khi khoá đổi (hiệu ứng này chạy sau khi lớp dưới đã vẽ tới thao tác cuối).
  useEffect(() => {
    if (!capture?.key || captured.current === capture.key) return;
    const url = painter.thumbnail();
    if (!url) return;
    captured.current = capture.key;
    capture.onCapture(url);
  }, [painter, capture]);

  useEffect(() => {
    if (!canDraw) return;
    const t = setInterval(() => painter.flushInk(), INK_MS);
    const onKey = (e: KeyboardEvent) => painter.key(e);
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [painter, canDraw]);

  return (
    <div
      ref={wrapRef}
      className={`dw-board ${canDraw ? "can-draw" : ""}`}
      onPointerDown={(e) => painter.down(e)}
      onPointerMove={(e) => painter.move(e)}
      onPointerUp={() => painter.up()}
      onPointerCancel={() => painter.up()}
      onPointerLeave={() => painter.leave()}
      onContextMenu={canDraw ? (e) => e.preventDefault() : undefined}
    >
      <canvas ref={baseRef} aria-hidden="true" />
      <canvas ref={liveRef} aria-hidden="true" />
      {children}
    </div>
  );
}

/** Thanh công cụ của người vẽ: bảng màu, cỡ bút, bút / tẩy / đổ màu, hoàn tác, xoá tranh. */
export function Toolbar({ tool, setTool, session, ops }: { tool: Tool; setTool: React.Dispatch<React.SetStateAction<Tool>>; session: DrawGuessRoom; ops: Op[] }) {
  const empty = visibleOps(ops).length === 0;
  const kinds = [
    { kind: "pen", emoji: "✏️", label: "Bút" },
    { kind: "eraser", emoji: "🧽", label: "Tẩy" },
    { kind: "fill", emoji: "🪣", label: "Đổ màu" },
  ] as const;
  return (
    <div className="dw-tools card" role="toolbar" aria-label="Công cụ vẽ">
      <div className="dw-palette" role="group" aria-label="Màu">
        {PALETTE.map((hex, i) => (
          <button
            key={hex}
            type="button"
            className={`dw-swatch ${tool.color === i && tool.kind !== "eraser" ? "is-on" : ""}`}
            style={{ background: hex }}
            aria-label={`Màu ${hex}`}
            aria-pressed={tool.color === i && tool.kind !== "eraser"}
            onClick={() => setTool((t) => ({ ...t, color: i, kind: t.kind === "eraser" ? "pen" : t.kind }))}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex gap-1" role="group" aria-label="Cỡ nét">
          {SIZES.map((px, i) => (
            <button key={px} type="button" className={`dw-size ${tool.size === i ? "is-on" : ""}`} aria-label={`Cỡ nét ${i + 1}`} aria-pressed={tool.size === i} onClick={() => setTool((t) => ({ ...t, size: i }))}>
              <span style={{ width: 4 + i * 5, height: 4 + i * 5 }} />
            </button>
          ))}
        </div>
        <span className="mx-1 h-7 w-0.5 rounded bg-rule" aria-hidden="true" />
        {kinds.map((k) => (
          <button key={k.kind} type="button" className={`btn btn-sm !px-2.5 ${tool.kind === k.kind ? "btn-sun" : ""}`} aria-pressed={tool.kind === k.kind} onClick={() => setTool((t) => ({ ...t, kind: k.kind }))} title={k.label}>
            {k.emoji} <span className="hidden sm:inline">{k.label}</span>
          </button>
        ))}
        <span className="mx-1 h-7 w-0.5 rounded bg-rule" aria-hidden="true" />
        <button type="button" className="btn btn-sm !px-2.5" onClick={() => session.draw({ u: 1 })} disabled={!canUndo(ops)} title="Hoàn tác (Ctrl/⌘ + Z)">
          ↩️ <span className="hidden sm:inline">Hoàn tác</span>
        </button>
        <button type="button" className="btn btn-sm !px-2.5" onClick={() => session.draw({ x: 1 })} disabled={empty} title="Xoá cả tranh (hoàn tác được)">
          🗑️ <span className="hidden sm:inline">Xoá tranh</span>
        </button>
      </div>
    </div>
  );
}
