"use client";

import { useMemo, useRef, useState } from "react";
import { CANVAS, CATALOG, fmt, isReplication, LINKS, linkIssue, NODE, nodeLabels, USERS, USERS_ID, USERS_POS, variantOf, type Design, type NodeKind } from "@/lib/games/system-design";

export type Sel = { node: number } | { edge: [number, number] } | null;

// Tải ở một mức của load test: tải đỉnh từng component, lưu lượng từng đường nối, component gây thất bại và đối tượng sự cố.
export type Heat = { input: number; load: Map<number, number>; edges: Record<string, number>; fail?: number; down?: number[]; cut?: [number, number] | null };

type Edit = {
  onChange: (d: Design, commit: boolean) => void;
  onDelete: () => void;
  sel: Sel;
  onSel: (s: Sel) => void;
};

type Box = { id: number; k: NodeKind; x: number; y: number };

type Wire = { from: number; x: number; y: number; tap: boolean; sx: number; sy: number };

const GRID = 4;
const snap = (v: number) => Math.round(v / GRID) * GRID;
const clampX = (x: number) => Math.min(CANVAS.w - NODE.w, Math.max(0, x));
const clampY = (y: number) => Math.min(CANVAS.h - NODE.h, Math.max(0, y));

const outOf = (b: Box) => ({ x: b.x + NODE.w, y: b.y + NODE.h / 2 });
const inOf = (b: Box) => ({ x: b.x, y: b.y + NODE.h / 2 });

function curve(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.max(36, Math.abs(b.x - a.x) / 2);
  return `M${a.x} ${a.y} C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
}

const tone = (u: number) => (u > 1 + 1e-9 ? "is-over" : u >= 0.85 ? "is-hot" : u >= 0.6 ? "is-warm" : u > 0 ? "is-cool" : "is-idle");

export function SxCanvas({ design, edit, heat, marks, label }: { design: Design; edit?: Edit; heat?: Heat; marks?: number[]; label: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const labels = useMemo(() => nodeLabels(design), [design]);
  const boxes = useMemo<Box[]>(() => [{ id: USERS_ID, k: "users", ...USERS_POS }, ...design.nodes], [design.nodes]);
  const byId = useMemo(() => new Map(boxes.map((b) => [b.id, b])), [boxes]);
  const drag = useRef<{ id: number; dx: number; dy: number; sx: number; sy: number; moved?: Design } | null>(null);
  // Giữ cả trong ref: kéo nhanh thì pointermove / pointerup tới trước khi React kịp vẽ lại với state mới.
  const [wire, setWireState] = useState<Wire | null>(null);
  const wireRef = useRef<Wire | null>(null);
  const setWire = (w: Wire | null) => {
    wireRef.current = w;
    setWireState(w);
  };
  const targets = useMemo(() => (wire ? new Set(boxes.filter((b) => !linkIssue(design, wire.from, b.id)).map((b) => b.id)) : null), [wire, boxes, design]);

  const sel = edit?.sel;
  const selNode = sel && "node" in sel ? sel.node : undefined;
  const selEdge = sel && "edge" in sel ? sel.edge : undefined;
  const marked = new Set(marks ?? []);

  const point = (e: { clientX: number; clientY: number }) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const hit = (x: number, y: number) => [...boxes].reverse().find((b) => x >= b.x && x <= b.x + NODE.w && y >= b.y && y <= b.y + NODE.h);

  // Giữ con trỏ khi kéo ra ngoài component; con trỏ vừa nhả ngay thì trình duyệt ném lỗi — bỏ qua, chỉ mất phần kéo ra ngoài.
  const capture = (e: React.PointerEvent) => {
    try {
      svg.current?.setPointerCapture(e.pointerId);
    } catch {}
  };

  const connect = (from: number, to: number) => {
    if (!edit || linkIssue(design, from, to)) return false;
    edit.onChange({ ...design, edges: [...design.edges, [from, to]] }, true);
    edit.onSel({ node: to });
    return true;
  };

  const onNodeDown = (e: React.PointerEvent, b: Box) => {
    if (!edit) return;
    e.stopPropagation();
    const w = wireRef.current;
    if (w) {
      // Đang nối kiểu chạm: chạm component thứ hai là nối.
      if (b.id !== w.from) connect(w.from, b.id);
      setWire(null);
      return;
    }
    capture(e);
    const p = point(e);
    drag.current = { id: b.id, dx: p.x - b.x, dy: p.y - b.y, sx: p.x, sy: p.y };
    edit.onSel({ node: b.id });
  };

  const onPortDown = (e: React.PointerEvent, b: Box) => {
    if (!edit) return;
    e.stopPropagation();
    capture(e);
    const p = point(e);
    edit.onSel({ node: b.id });
    setWire({ from: b.id, x: p.x, y: p.y, tap: false, sx: p.x, sy: p.y });
  };

  const onMove = (e: React.PointerEvent) => {
    const p = point(e);
    const d = drag.current;
    if (d && edit && d.id !== USERS_ID) {
      if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) < 4) return;
      const x = clampX(snap(p.x - d.dx));
      const y = clampY(snap(p.y - d.dy));
      d.moved = { ...design, nodes: design.nodes.map((n) => (n.id === d.id ? { ...n, x, y } : n)) };
      edit.onChange(d.moved, false);
    } else if (wireRef.current) setWire({ ...wireRef.current, x: p.x, y: p.y });
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && edit) edit.onChange(d.moved, true);
    const wire = wireRef.current;
    if (!wire || wire.tap) return;
    const p = point(e);
    const moved = Math.hypot(p.x - wire.sx, p.y - wire.sy) >= 6;
    const to = hit(p.x, p.y);
    if (moved && to && to.id !== wire.from) {
      connect(wire.from, to.id);
      setWire(null);
    } else if (moved) setWire(null);
    // Chạm vào chấm rồi thả tại chỗ: chờ chạm component đích.
    else setWire({ ...wire, tap: true });
  };

  const onBlank = () => {
    setWire(null);
    edit?.onSel(null);
  };

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`}
      className={`sx-canvas ${edit ? "is-edit" : ""} ${wire ? "is-wiring" : ""}`}
      role="application"
      aria-label={label}
      tabIndex={edit ? 0 : undefined}
      onPointerMove={edit ? onMove : undefined}
      onPointerUp={edit ? onUp : undefined}
      onPointerCancel={() => {
        drag.current = null;
        setWire(null);
      }}
      onKeyDown={(e) => {
        if (!edit) return;
        if (e.key === "Escape") onBlank();
        if ((e.key === "Delete" || e.key === "Backspace") && sel) {
          e.preventDefault();
          edit.onDelete();
        }
      }}
    >
      <defs>
        <pattern id="sx-dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" className="sx-dot" />
        </pattern>
        {/* Cỡ cố định theo toạ độ sơ đồ: đường nối dày (nhiều traffic) không kéo mũi tên to theo. */}
        <marker id="sx-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="sx-arrow" />
        </marker>
      </defs>
      <rect width={CANVAS.w} height={CANVAS.h} fill="url(#sx-dots)" onPointerDown={edit ? onBlank : undefined} />

      {design.edges.map(([a, b]) => {
        const from = byId.get(a);
        const to = byId.get(b);
        if (!from || !to) return null;
        const key = `${a}>${b}`;
        const d = curve(outOf(from), inOf(to));
        const flow = heat?.edges[key] ?? 0;
        const repl = isReplication(from.k, to.k);
        const on = selEdge?.[0] === a && selEdge?.[1] === b;
        const cut = heat?.cut?.[0] === a && heat?.cut?.[1] === b;
        const width = heat ? 2 + Math.min(7, Math.sqrt(flow) / 6) : 2.5;
        return (
          <g key={key} className={`sx-edge ${repl ? "is-repl" : ""} ${on ? "is-sel" : ""} ${cut ? "is-cut" : ""} ${heat && !flow ? "is-idle" : ""}`}>
            <path d={d} className="sx-edge-line" strokeWidth={width} markerEnd="url(#sx-arrow)" />
            {edit && (
              <path
                d={d}
                className="sx-edge-hit"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setWire(null);
                  edit.onSel({ edge: [a, b] });
                }}
              />
            )}
            {heat && flow > 0 && (
              <text x={(outOf(from).x + inOf(to).x) / 2} y={(outOf(from).y + inOf(to).y) / 2 - 6} className="sx-edge-tag">
                {fmt(flow)}
              </text>
            )}
          </g>
        );
      })}

      {wire && (
        <path d={curve(outOf(byId.get(wire.from)!), { x: wire.x, y: wire.y })} className="sx-wire" markerEnd="url(#sx-arrow)" pointerEvents="none" />
      )}

      {boxes.map((b) => {
        const users = b.k === "users";
        const info = users ? USERS : CATALOG[b.k as keyof typeof CATALOG];
        const node = users ? undefined : design.nodes.find((n) => n.id === b.id);
        const v = node ? variantOf(node) : undefined;
        const load = heat?.load.get(b.id) ?? 0;
        const util = v && heat ? load / v.tps : 0;
        const down = heat?.down?.includes(b.id);
        const failed = heat?.fail === b.id;
        const canOut = LINKS[b.k].length > 0;
        const cls = [
          "sx-node",
          users ? "is-users" : `k-${b.k}`,
          heat && !users ? tone(b.k === "worker" ? Math.min(1, util) : util) : "",
          selNode === b.id ? "is-sel" : "",
          targets?.has(b.id) ? "is-target" : "",
          wire && !targets?.has(b.id) && wire.from !== b.id ? "is-dim" : "",
          marked.has(b.id) ? "is-mark" : "",
          failed ? "is-fail" : "",
          down ? "is-down" : "",
        ].join(" ");
        const line2 = users ? (heat ? `${fmt(heat.input)} TPS` : "Người dùng") : heat ? `${fmt(load)} / ${fmt(v!.tps)}` : `${fmt(v!.tps)} TPS`;
        return (
          <g key={b.id} transform={`translate(${b.x} ${b.y})`} className={cls} onPointerDown={edit ? (e) => onNodeDown(e, b) : undefined}>
            <rect width={NODE.w} height={NODE.h} rx="12" className="sx-node-box" />
            {heat && !users && <rect x="6" y={NODE.h - 7} width={(NODE.w - 12) * Math.min(1, util)} height="3" rx="1.5" className="sx-node-bar" />}
            <text x="9" y="24" className="sx-node-emoji">
              {info.emoji}
            </text>
            <text x="33" y="23" className="sx-node-name">
              {labels.get(b.id)}
            </text>
            <text x="10" y="43" className="sx-node-sub">
              {line2}
            </text>
            {!users && !heat && (
              <text x={NODE.w - 12} y="43" className="sx-node-price" textAnchor="end">
                ${v!.price}
              </text>
            )}
            {down && (
              <text x={NODE.w - 8} y="16" className="sx-node-flag" textAnchor="end">
                💥
              </text>
            )}
            {edit && canOut && (
              <g className="sx-port" onPointerDown={(e) => onPortDown(e, b)}>
                <circle cx={NODE.w} cy={NODE.h / 2} r="14" className="sx-port-hit" />
                <circle cx={NODE.w} cy={NODE.h / 2} r="6.5" className="sx-port-dot" />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
