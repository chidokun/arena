"use client";

import { useMemo, useRef, useState } from "react";
import {
  CANVAS,
  CATALOG,
  extentOf,
  fmt,
  isReplication,
  LINKS,
  linkIssue,
  NODE,
  nodeLabels,
  POS_MAX,
  USERS,
  USERS_ID,
  usersPos,
  variantOf,
  type Design,
  type Extent,
  type NodeKind,
} from "@/lib/games/system-design";

export type Sel = { node: number } | { edge: [number, number] } | null;

// Tải ở một mức của load test: tải đỉnh từng component, lưu lượng từng đường nối, component gây thất bại và đối tượng sự cố.
export type Heat = { input: number; load: Map<number, number>; edges: Record<string, number>; fail?: number; down?: number[]; cut?: [number, number] | null };

type Edit = {
  onChange: (d: Design, commit: boolean) => void;
  onDelete: () => void;
  sel: Sel;
  onSel: (s: Sel) => void;
};

// Hiệu ứng lúc phát lại load test (toạ độ sơ đồ): bóng báo sự cố bay lên, vụ nổ ở component quá tải, khói âm ỉ trên
// component đã gục.
export type Balloon = { key: string; x: number; y: number; text: string; delay: number; alert?: boolean };
export type Blast = { key: string; x: number; y: number };
export type Fx = { balloons: Balloon[]; blasts: Blast[]; smolder?: number };

// Khung nhìn do ngoài điều khiển (bàn phóng to): `box` là viewBox, kéo nền thì báo từng đoạn dời (px màn hình, so với lần
// báo trước) để ngoài dời khung nhìn theo.
export type Pan = { box: string; onPan: (dx: number, dy: number) => void };

// Cố định (không random lúc vẽ) để vụ nổ trông như nhau mỗi lần.
const DEBRIS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 + (i % 3) * 0.21;
  const d = 46 + ((i * 37) % 5) * 9;
  return { dx: Math.round(Math.cos(a) * d), dy: Math.round(Math.sin(a) * d - 10), rot: ((i * 97) % 360) - 180, size: 5 + (i % 3) * 2 };
});
const SMOKE = [
  { x: -14, dx: -26, dy: -70, r: 13, delay: 180 },
  { x: 10, dx: 22, dy: -82, r: 15, delay: 260 },
  { x: 0, dx: -6, dy: -96, r: 17, delay: 380 },
  { x: -22, dx: -40, dy: -54, r: 11, delay: 480 },
  { x: 20, dx: 38, dy: -60, r: 12, delay: 560 },
  { x: 4, dx: 8, dy: -110, r: 14, delay: 700 },
];

function BlastFx({ x, y }: { x: number; y: number }) {
  return (
    <g className="sx-blast" transform={`translate(${x} ${y})`} pointerEvents="none">
      {SMOKE.map((s, i) => (
        <circle key={`s${i}`} cx={s.x} r={s.r} className="sx-blast-smoke" style={{ ["--dx" as string]: `${s.dx}px`, ["--dy" as string]: `${s.dy}px`, animationDelay: `${s.delay}ms` }} />
      ))}
      <circle r="20" className="sx-blast-flash" />
      <circle r="24" className="sx-blast-ring" />
      {DEBRIS.map((d, i) => (
        <rect
          key={`d${i}`}
          x={-d.size / 2}
          y={-d.size / 2}
          width={d.size}
          height={d.size}
          rx="1.5"
          className={`sx-blast-bit ${i % 2 ? "is-hot" : ""}`}
          style={{ ["--dx" as string]: `${d.dx}px`, ["--dy" as string]: `${d.dy}px`, ["--rot" as string]: `${d.rot}deg` }}
        />
      ))}
      <text className="sx-blast-emoji" textAnchor="middle" dy="0.35em">
        💥
      </text>
    </g>
  );
}

type Box = { id: number; k: NodeKind; x: number; y: number };

type Wire = { from: number; x: number; y: number; tap: boolean; sx: number; sy: number };

const GRID = 4;
const snap = (v: number) => Math.round(v / GRID) * GRID;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const outOf = (b: Box) => ({ x: b.x + NODE.w, y: b.y + NODE.h / 2 });
const inOf = (b: Box) => ({ x: b.x, y: b.y + NODE.h / 2 });

function curve(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.max(36, Math.abs(b.x - a.x) / 2);
  return `M${a.x} ${a.y} C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
}

// Hạt traffic chạy nhanh hơn trên đường nối mang phần lớn traffic đầu vào.
const pace = (flow: number, input: number) => Math.round((1.3 - 0.95 * Math.min(1, flow / Math.max(1, input))) * 100) / 100;

const tone = (u: number) => (u > 1 + 1e-9 ? "is-over" : u >= 0.85 ? "is-hot" : u >= 0.6 ? "is-warm" : u > 0 ? "is-cool" : "is-idle");

// `live`: đang phát lại load test — traffic chạy trên đường nối, component căng tải rung lên.
export function SxCanvas({
  design,
  edit,
  heat,
  live,
  fx,
  marks,
  view,
  label,
}: {
  design: Design;
  edit?: Edit;
  heat?: Heat;
  live?: boolean;
  fx?: Fx;
  marks?: number[];
  view?: Pan;
  label: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const labels = useMemo(() => nodeLabels(design), [design]);
  const boxes = useMemo<Box[]>(() => [{ id: USERS_ID, k: "users", ...usersPos(design) }, ...design.nodes], [design]);
  const byId = useMemo(() => new Map(boxes.map((b) => [b.id, b])), [boxes]);
  // `lim`: khung kéo được — khung bao lúc bắt đầu kéo (sơ đồ cỡ cố định), hoặc không giới hạn khi khung nhìn dời được.
  const drag = useRef<{ id: number; dx: number; dy: number; sx: number; sy: number; lim: Extent; moved?: Design } | null>(null);
  const ext = useMemo(() => extentOf(design), [design]);
  // Đang kéo trên sơ đồ cỡ cố định: giữ khung nhìn như lúc bắt đầu, không co giãn theo component đang kéo.
  const [hold, setHold] = useState<Extent | null>(null);
  const panning = useRef<{ x: number; y: number; moved: boolean } | null>(null);
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
    const lim = view ? { x: -POS_MAX, y: -POS_MAX, w: POS_MAX * 2, h: POS_MAX * 2 } : ext;
    drag.current = { id: b.id, dx: p.x - b.x, dy: p.y - b.y, sx: p.x, sy: p.y, lim };
    if (!view) setHold(ext);
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

  // Có khung nhìn: kéo nền là dời khung nhìn, chạm nền (không kéo) mới là bỏ chọn.
  const onBgDown = (e: React.PointerEvent) => {
    if (!view) return onBlank();
    capture(e);
    panning.current = { x: e.clientX, y: e.clientY, moved: false };
  };

  const onMove = (e: React.PointerEvent) => {
    const pn = panning.current;
    if (pn) {
      const dx = e.clientX - pn.x;
      const dy = e.clientY - pn.y;
      if (!pn.moved && Math.hypot(dx, dy) < 4) return;
      panning.current = { x: e.clientX, y: e.clientY, moved: true };
      view?.onPan(dx, dy);
      return;
    }
    const p = point(e);
    const d = drag.current;
    if (d && edit) {
      if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) < 4) return;
      const x = clamp(snap(p.x - d.dx), d.lim.x, d.lim.x + d.lim.w - NODE.w);
      const y = clamp(snap(p.y - d.dy), d.lim.y, d.lim.y + d.lim.h - NODE.h);
      d.moved = d.id === USERS_ID ? { ...design, u: { x, y } } : { ...design, nodes: design.nodes.map((n) => (n.id === d.id ? { ...n, x, y } : n)) };
      edit.onChange(d.moved, false);
    } else if (wireRef.current) setWire({ ...wireRef.current, x: p.x, y: p.y });
  };

  const onUp = (e: React.PointerEvent) => {
    const pn = panning.current;
    if (pn) {
      panning.current = null;
      if (!pn.moved) onBlank();
      return;
    }
    const d = drag.current;
    drag.current = null;
    setHold(null);
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
      viewBox={view?.box ?? (({ x, y, w, h }) => `${x} ${y} ${w} ${h}`)(hold ?? ext)}
      className={`sx-canvas ${edit ? "is-edit" : ""} ${wire ? "is-wiring" : ""} ${live ? "is-live" : ""} ${view ? "is-pan" : ""}`}
      role="application"
      aria-label={label}
      tabIndex={edit ? 0 : undefined}
      onPointerMove={edit || view ? onMove : undefined}
      onPointerUp={edit || view ? onUp : undefined}
      onPointerCancel={() => {
        panning.current = null;
        drag.current = null;
        setHold(null);
        setWire(null);
      }}
      onKeyDown={(e) => {
        if (!edit) return;
        if (e.key === "Escape") {
          // Đang nối / đang chọn thì Esc chỉ bỏ thao tác đó, không thoát trình chiếu (phóng to).
          if (wire || sel) e.stopPropagation();
          onBlank();
        }
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
      {/* Trải rộng hơn khung vẽ: lúc phóng to khung nhìn dời / thu nhỏ ra ngoài khung vẽ thì vẫn là nền chấm (kéo để dời,
          bấm để bỏ chọn). */}
      <rect
        x={ext.x - CANVAS.w * 10}
        y={ext.y - CANVAS.h * 10}
        width={ext.w + CANVAS.w * 20}
        height={ext.h + CANVAS.h * 20}
        fill="url(#sx-dots)"
        className="sx-bg"
        onPointerDown={edit || view ? onBgDown : undefined}
      />

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
            {live && flow > 0 && !cut && (
              <path d={d} className="sx-edge-flow" strokeWidth={Math.max(2.5, width - 1.5)} style={{ animationDuration: `${pace(flow, heat!.input)}s` }} />
            )}
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

      {fx?.smolder !== undefined && byId.get(fx.smolder) && (
        <g className="sx-smolder" transform={`translate(${byId.get(fx.smolder)!.x + NODE.w / 2} ${byId.get(fx.smolder)!.y + 6})`} pointerEvents="none">
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={(i - 1) * 12} r={7 + i * 2} style={{ animationDelay: `${i * 520}ms` }} />
          ))}
        </g>
      )}
      {fx?.blasts.map((b) => <BlastFx key={b.key} x={b.x} y={b.y} />)}
      {fx?.balloons.map((b) => (
        <foreignObject key={b.key} x={b.x - 110} y={b.y - 84} width="220" height="84" className="sx-balloon-box" pointerEvents="none">
          <div className="sx-balloon-lane">
            <span className={`sx-balloon ${b.alert ? "is-alert" : ""}`} style={{ animationDelay: `${b.delay}ms` }}>
              {b.text}
            </span>
          </div>
        </foreignObject>
      ))}
    </svg>
  );
}
