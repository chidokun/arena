"use client";

import { useEffect, useRef, useState } from "react";
import {
  CELLS,
  flightAt,
  GROUND,
  landing,
  launch,
  MAX_YAW,
  ORIGIN,
  relaunch,
  SKY,
  STONE_R,
  TROI,
  yawOf,
  type Launch,
  type Snap,
  type Spot,
  type ThrowMode,
  type Verdict,
} from "@/lib/games/co-chep";
import { SKY_STONE } from "./CoChepCourt";

/**
 * Cảnh chọi đá — một màn riêng phủ toàn màn hình, vẽ bằng canvas phối cảnh giả 3D.
 *
 * Chọi từ Đất: camera đứng sau lưng người chọi nhìn lên sân. Kéo ngược về sau (xuống dưới) như kéo ná: kéo dài thì
 * chọi xa, kéo lệch trái thì đá bay lệch phải; chấm quỹ đạo chỉ hiện đoạn đầu. Buông tay là chọi.
 * Chọi qua lưng (đứng trên Trời): người chọi quay lưng lại sân, nhìn ra bầu trời — không thấy sân. Kéo lên trên để lấy
 * đà, buông tay thì camera quay lại cho xem đá rơi vào đâu.
 * Diễn lại (cú chọi của người khác): tự lấy đà rồi bay đúng đường bay người chọi đã thấy (dựng lại từ điểm chạm đất).
 *
 * Đồ hoạ là hình khối đơn giản, gom trong các hàm `paint*` để thay bằng ảnh sau.
 */

type V3 = { x: number; y: number; z: number };
type Cam = { C: V3; F: V3; R: V3; U: V3 };
type View = { cam: Cam; s: number; ox: number; oy: number };
type Pt = { x: number; y: number; k: number };

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

function camera(from: V3, at: V3): Cam {
  const F = norm(sub(at, from));
  const R = norm({ x: F.y, y: -F.x, z: 0 });
  const U = { x: R.y * F.z - R.z * F.y, y: R.z * F.x - R.x * F.z, z: R.x * F.y - R.y * F.x };
  return { C: from, F, R, U };
}

function raw(cam: Cam, p: V3) {
  const d = sub(p, cam.C);
  const depth = Math.max(1, dot(d, cam.F));
  return { x: dot(d, cam.R) / depth, y: -dot(d, cam.U) / depth, depth };
}

const P = (x: number, y: number, z = 0): V3 => ({ x, y, z });

/** Chọn tỉ lệ để các điểm `pts` vừa khung (chừa lề). */
function fit(cam: Cam, pts: V3[], W: number, H: number, m: { t: number; b: number; l: number; r: number }): View {
  const rs = pts.map((p) => raw(cam, p));
  const x0 = Math.min(...rs.map((r) => r.x));
  const x1 = Math.max(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const y1 = Math.max(...rs.map((r) => r.y));
  const s = Math.min((W - m.l - m.r) / (x1 - x0), (H - m.t - m.b) / (y1 - y0));
  return { cam, s, ox: m.l + (W - m.l - m.r - s * (x1 - x0)) / 2 - s * x0, oy: m.t + (H - m.t - m.b - s * (y1 - y0)) / 2 - s * y0 };
}

const at = (v: View, p: V3): Pt => {
  const r = raw(v.cam, p);
  return { x: v.ox + v.s * r.x, y: v.oy + v.s * r.y, k: v.s / r.depth };
};

/** Camera đặt cao, nhìn dốc xuống sân (như nhìn từ sau lưng người chọi) — mọi cỡ màn hình dùng chung một góc. */
const CAMS = {
  front: camera(P(100, -330, 620), P(100, 250, 0)),
  back: camera(P(100, 760, 560), P(100, 230, 0)),
};
/** Khung cần thấy: cả sân, Trời và tay người chọi. */
const FRAME = [P(-10, -110), P(210, -110), P(-10, 600), P(210, 600), P(100, 600, 30)];

// ---------- màu ----------

type Palette = Record<"coral" | "sky" | "lime" | "grape" | "sun", string>;
const FALLBACK: Palette = { coral: "#ff5a5f", sky: "#2f7bff", lime: "#12b981", grape: "#9b5cf6", sun: "#ffc23d" };
function palette(): Palette {
  if (typeof document === "undefined") return FALLBACK;
  const css = getComputedStyle(document.documentElement);
  const get = (k: keyof Palette) => css.getPropertyValue(`--${k}`).trim() || FALLBACK[k];
  return { coral: get("coral"), sky: get("sky"), lime: get("lime"), grape: get("grape"), sun: get("sun") };
}
const TONE_KEYS = ["coral", "sky", "lime", "grape", "sun"] as const;

const DIRT = "#d8b98a";
const DIRT_DARK = "#c49e6c";
const CHALK = "rgba(255,253,245,0.95)";

// ---------- vẽ ----------

function paintBackdrop(ctx: CanvasRenderingContext2D, v: View, W: number, H: number, dir: 1 | -1) {
  const horizon = Math.max(0, Math.min(H, at(v, P(100, dir * 6000)).y));
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#7ec8ff");
  sky.addColorStop(1, "#d9f0ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);
  // Lũy tre xa xa.
  ctx.fillStyle = "#4f8a4a";
  for (let x = -20; x < W + 40; x += 26) {
    const h = 18 + ((x * 37) % 23);
    ctx.beginPath();
    ctx.ellipse(x, horizon, 20, h, 0, Math.PI, 0);
    ctx.fill();
  }
  const ground = ctx.createLinearGradient(0, horizon, 0, H);
  ground.addColorStop(0, "#9cc06a");
  ground.addColorStop(0.25, "#c9b27c");
  ground.addColorStop(1, "#c6a273");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, W, H - horizon);
}

function quad(ctx: CanvasRenderingContext2D, v: View, x0: number, x1: number, y0: number, y1: number) {
  const a = at(v, P(x0, y0));
  const b = at(v, P(x1, y0));
  const c = at(v, P(x1, y1));
  const d = at(v, P(x0, y1));
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

function skyPath(ctx: CanvasRenderingContext2D, v: View) {
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const a = (Math.PI * i) / 32;
    const p = at(v, P(SKY.cx + SKY.r * Math.cos(a), SKY.cy + SKY.r * Math.sin(a)));
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.closePath();
}

type CourtData = { snap: Snap; tones: string[]; avatars: string[]; target: number; me: number };

function paintCourt(ctx: CanvasRenderingContext2D, v: View, d: CourtData, time: number, focus?: Spot | null) {
  // Nền sân đất nện.
  ctx.fillStyle = DIRT;
  quad(ctx, v, -50, 250, -140, 620);
  ctx.fill();
  ctx.fillStyle = DIRT_DARK;
  quad(ctx, v, GROUND.x0, GROUND.x1, GROUND.y0, GROUND.y1);
  ctx.fill();

  // Trời: không có vạch bao, chỉ một quầng sáng.
  skyPath(ctx, v);
  ctx.fillStyle = "rgba(160,215,255,0.55)";
  ctx.fill();
  if (d.target === TROI) {
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.35 * Math.sin(time / 220);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
  }

  for (let c = 1; c <= 8; c++) {
    const r = CELLS[c];
    const owner = d.snap.owners[c];
    quad(ctx, v, r.x0, r.x1, r.y0, r.y1);
    if (owner) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = d.tones[owner - 1];
      ctx.fill();
      ctx.restore();
    }
    if (focus?.kind === "cell" && focus.cell === c) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#fff6c8";
      ctx.fill();
      ctx.restore();
    }
  }
  // Vạch phấn.
  ctx.strokeStyle = CHALK;
  ctx.lineJoin = "round";
  for (let c = 1; c <= 8; c++) {
    const r = CELLS[c];
    const m = at(v, P((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2));
    quad(ctx, v, r.x0, r.x1, r.y0, r.y1);
    ctx.lineWidth = Math.max(1.5, 6 * m.k);
    ctx.stroke();
  }
  if (d.target > 0 && d.target < TROI) {
    const r = CELLS[d.target];
    quad(ctx, v, r.x0 + 6, r.x1 - 6, r.y0 + 6, r.y1 - 6);
    const m = at(v, P((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2));
    ctx.save();
    ctx.strokeStyle = "#fff36b";
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time / 200);
    ctx.lineWidth = Math.max(2, 7 * m.k);
    ctx.setLineDash([14 * m.k, 10 * m.k]);
    ctx.lineDashOffset = -time / 30;
    ctx.stroke();
    ctx.restore();
  }
  // Số ô và nhà.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let c = 1; c <= 8; c++) {
    const r = CELLS[c];
    const m = at(v, P((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2));
    const owner = d.snap.owners[c];
    if (owner) {
      ctx.font = `${Math.round(46 * m.k)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.fillText(d.avatars[owner - 1] ?? "🏠", m.x, m.y);
      ctx.font = `${Math.round(20 * m.k)}px system-ui, "Apple Color Emoji", sans-serif`;
      const roof = at(v, P(r.x1 - 16, r.y1 - 14));
      ctx.fillText("🏠", roof.x, roof.y);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = `800 ${Math.round(40 * m.k)}px system-ui, sans-serif`;
      ctx.fillText(String(c), m.x, m.y);
    }
  }
  const sky = at(v, P(SKY.cx, SKY.cy + 70));
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = `800 ${Math.round(28 * sky.k)}px system-ui, sans-serif`;
  ctx.fillText("TRỜI", sky.x, sky.y);
  // Đá của những người khác đang nằm trên sân.
  d.snap.stones.forEach((c, k) => {
    if (!c || k === d.me) return;
    const pos = c === TROI ? P(SKY_STONE.x + (k - 2) * 16, SKY_STONE.y) : P((CELLS[c].x0 + CELLS[c].x1) / 2 + 22, (CELLS[c].y0 + CELLS[c].y1) / 2 - 18);
    paintStone(ctx, at(v, pos), d.tones[k]);
  });
}

function paintStone(ctx: CanvasRenderingContext2D, p: Pt, tone: string, lift = 0) {
  const r = Math.max(3.5, STONE_R * 1.25 * p.k);
  ctx.save();
  ctx.fillStyle = "#6b6f7a";
  ctx.strokeStyle = "#20232b";
  ctx.lineWidth = Math.max(1.2, r * 0.22);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - lift, r * 1.15, r * 0.9, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = tone;
  ctx.beginPath();
  ctx.arc(p.x - r * 0.25, p.y - lift - r * 0.2, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintShadow(ctx: CanvasRenderingContext2D, p: Pt, scale = 1) {
  const r = Math.max(3, STONE_R * 1.3 * p.k * scale);
  ctx.save();
  ctx.fillStyle = "rgba(40,25,10,0.35)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------- người chọi (video) ----------

const base = process.env.BASE_PATH ?? "";

/**
 * Hai video người chọi nền trong suốt (WebM VP9 có alpha; Safari / iOS không hiện alpha của WebM nên dùng bản HEVC
 * .mov có alpha). Khung đầu là tư thế cầm đá sẵn sàng — lúc ngắm video đứng yên ở đó, buông tay thì phát động tác ném.
 * Ảnh tĩnh `still` là người chọi quay mặt ra, đứng trên Trời lúc camera quay lại xem đá rơi.
 * Thay video / ảnh thì giữ cỡ khung và cập nhật các neo (px trong khung) cho khớp.
 */
const KID = {
  w: 360,
  h: 480,
  /** Số px trong khung ứng với 1 cm thật — để co theo phối cảnh. */
  k: 3.1,
  /** Chân người chọi (giữa hai bàn chân). */
  foot: { x: 170, y: 462 },
  front: { webm: `${base}/co-chep/throw-front.webm`, mov: `${base}/co-chep/throw-front.mov`, hand: { x: 256.8, y: 189.2 } },
  back: { webm: `${base}/co-chep/throw-back.webm`, mov: `${base}/co-chep/throw-back.mov`, hand: { x: 232, y: 65.2 } },
  still: `${base}/co-chep/kid-front.png`,
};

/** Trình duyệt chỉ có WebKit (Safari, mọi trình duyệt trên iOS) thì dùng bản .mov. */
function videoSrc(mode: ThrowMode) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const webkit = (/AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg\/|OPR\//.test(ua)) || /CriOS|FxiOS|EdgiOS/.test(ua);
  return webkit ? KID[mode].mov : KID[mode].webm;
}

/** Đặt video sao cho điểm neo `anchor` (px trong khung) nằm ở `at` trên màn, co `s` lần. */
function placeVideo(el: HTMLVideoElement | null, anchor: { x: number; y: number }, at: { x: number; y: number }, s: number, shown: boolean) {
  if (!el) return;
  el.style.transform = `translate(${at.x - anchor.x * s}px, ${at.y - anchor.y * s}px) scale(${s})`;
  el.style.opacity = shown ? "1" : "0";
}

/** Màn quay lưng (chọi qua lưng): trời xanh, mây, lũy tre, người chọi nhìn từ sau lưng — không thấy sân. */
function paintBlind(ctx: CanvasRenderingContext2D, W: number, H: number, time: number) {
  const horizon = H * 0.58;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#5fb4ff");
  sky.addColorStop(1, "#cfeaff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);
  ctx.fillStyle = "#ffe27a";
  ctx.beginPath();
  ctx.arc(W * 0.78, H * 0.16, Math.min(W, H) * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (const [cx, cy, s] of [
    [0.2, 0.18, 1],
    [0.55, 0.1, 0.8],
    [0.42, 0.3, 0.6],
  ]) {
    const x = ((cx * W + time / 40) % (W + 200)) - 100;
    const r = Math.min(W, H) * 0.05 * s;
    ctx.beginPath();
    ctx.arc(x, cy * H, r, 0, Math.PI * 2);
    ctx.arc(x + r, cy * H - r * 0.4, r * 1.2, 0, Math.PI * 2);
    ctx.arc(x + r * 2.1, cy * H, r * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#3f7a3c";
  for (let x = -20; x < W + 40; x += 30) {
    const h = 26 + ((x * 53) % 31);
    ctx.beginPath();
    ctx.ellipse(x, horizon, 24, h, 0, Math.PI, 0);
    ctx.fill();
  }
  const ground = ctx.createLinearGradient(0, horizon, 0, H);
  ground.addColorStop(0, "#8fb85c");
  ground.addColorStop(1, "#6f9a45");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, W, H - horizon);
}

/** Người chọi trong màn quay lưng: to, ở giữa đáy màn hình (`k` px mỗi cm, `hand` chỗ tay cầm đá ở khung đầu). */
function blindKid(W: number, H: number) {
  const k = Math.min(H * 0.0042, W * 0.006);
  const foot = { x: W / 2, y: H * 1.0 };
  return { k, hand: { x: foot.x + (KID.back.hand.x - KID.foot.x) * (k / KID.k), y: foot.y + (KID.back.hand.y - KID.foot.y) * (k / KID.k) } };
}

// ---------- kết quả ----------

const VERDICT: Record<Verdict, { text: (s: Spot, target: number) => string; good: boolean; emoji: string }> = {
  hit: { text: (s) => `Trúng ô ${s.kind === "cell" ? s.cell : ""}!`, good: true, emoji: "🎯" },
  troi: { text: () => "Lên Trời!", good: true, emoji: "☁️" },
  claim: { text: (s) => `Chiếm nhà ô ${s.kind === "cell" ? s.cell : ""}!`, good: true, emoji: "🏠" },
  burn: { text: (s) => `Cháy nhà ô ${s.kind === "cell" ? s.cell : ""}!`, good: false, emoji: "🔥" },
  house: { text: () => "Rơi vào nhà người khác!", good: false, emoji: "🚫" },
  stone: { text: () => "Ô đang có đá người khác!", good: false, emoji: "🪨" },
  miss: { text: (s, t) => (s.kind === "cell" ? `Lạc sang ô ${s.cell}${t ? ` — cần ô ${t === TROI ? "Trời" : t}` : ""}` : "Trượt rồi!"), good: false, emoji: "😵" },
  line: { text: () => "Chạm vạch!", good: false, emoji: "📏" },
  out: { text: () => "Ra ngoài!", good: false, emoji: "💨" },
};

// ---------- component ----------

export type ThrowShot = { lx: number; ly: number; x: number; y: number };

type Show = {
  /** Mốc bắt đầu (ms, performance.now). */
  t0: number;
  windup: number;
  whip: number;
  fly: number;
  slide: number;
  hold: number;
  l: Launch;
  shot: ThrowShot;
  pull: { x: number; y: number };
  result: { verdict: Verdict; spot: Spot };
};

export function CoChepThrow({
  mode,
  replay,
  name,
  avatar,
  tone,
  court,
  target,
  judgeShot,
  onThrow,
  onClose,
  onDone,
}: {
  mode: ThrowMode;
  /** Có thì diễn lại cú chọi đã có; không có thì mình đang chọi. */
  replay?: ThrowShot;
  name: string;
  avatar: string;
  /** Chỉ số màu của người chọi (0..4). */
  tone: number;
  court: Omit<CourtData, "tones" | "target">;
  /** Mục tiêu (1..8, 9 = Trời) khi chọi từ Đất; 0 khi chọi qua lưng. */
  target: number;
  judgeShot: (x: number, y: number) => { verdict: Verdict; spot: Spot };
  onThrow?: (shot: ThrowShot) => void;
  /** Đóng khi chưa chọi (xem sân trước). */
  onClose?: () => void;
  onDone: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [src] = useState(() => videoSrc(mode));
  const aim = useRef({ on: false, sx: 0, sy: 0, dx: 0, dy: 0, kb: false });
  const show = useRef<Show | null>(null);
  const [stage, setStage] = useState<"aim" | "fly" | "done">(replay ? "fly" : "aim");
  const [result, setResult] = useState<{ verdict: Verdict; spot: Spot } | null>(null);
  const [power, setPower] = useState(0);
  const onDoneRef = useRef(onDone);
  const fired = useRef(false);
  const done = useRef(() => {
    if (fired.current) return;
    fired.current = true;
    onDoneRef.current();
  });
  const data = useRef({ court, target: target });
  useEffect(() => {
    onDoneRef.current = onDone;
    data.current = { court, target: target };
  });

  const maxPull = () => {
    const el = canvas.current;
    // Điện thoại hẹp vẫn cần quãng kéo đủ dài để chỉnh lực cho tinh.
    return el ? Math.max(140, Math.min(el.clientWidth, el.clientHeight) * 0.3) : 200;
  };

  /** Lực và hướng hiện tại từ thao tác kéo; null nếu kéo sai chiều / quá ngắn. */
  const aimed = () => {
    const a = aim.current;
    const len = Math.hypot(a.dx, a.dy);
    const p = Math.min(1, len / maxPull());
    // Kéo như kéo ná: đá bay ngược hướng kéo. Hai màn đều nhìn theo +y nên công thức giống nhau.
    const hx = -a.dx;
    const hy = a.dy;
    const forward = mode === "front" ? hy > 0 : hy < 0;
    // Chạm / bấm nhẹ (rung tay vài px) không tính là chọi.
    if (!forward || len < 14) return null;
    const yaw = yawOf(mode, hx, hy);
    return { power: p, yaw: Math.max(-MAX_YAW, Math.min(MAX_YAW, yaw)) };
  };

  const begin = (l: Launch, shot: ThrowShot, pull: { x: number; y: number }, windup: number) => {
    const result = judgeShot(shot.x, shot.y);
    show.current = { t0: performance.now(), windup, whip: mode === "back" ? 760 : 0, fly: l.t * 1000, slide: 320, hold: 1700, l, shot, pull, result };
  };

  const release = () => {
    const a = aimed();
    aim.current.on = false;
    if (!a) {
      aim.current.dx = aim.current.dy = 0;
      setPower(0);
      return;
    }
    const l = launch(mode, a.power, a.yaw, [Math.random() * 2 - 1, Math.random() * 2 - 1]);
    const shot = landing(l);
    onThrow?.(shot);
    begin(l, shot, { x: aim.current.dx, y: aim.current.dy }, 0);
    setStage("fly");
  };

  // Diễn lại cú chọi của người khác.
  useEffect(() => {
    if (!replay) return;
    const l = relaunch(mode, replay.lx, replay.ly);
    // Lấy đà ngược hướng bay (trên màn: chọi từ Đất kéo xuống, chọi qua lưng kéo lên).
    const len = 60 + 80 * Math.min(1, Math.hypot(replay.lx - ORIGIN[mode].x, replay.ly - ORIGIN[mode].y) / 650);
    const side = Math.max(-0.5, Math.min(0.5, (replay.lx - ORIGIN[mode].x) / 300));
    const pull = mode === "front" ? { x: -side * len, y: len } : { x: side * len, y: -len };
    begin(l, replay, pull, 750);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- diễn một lần khi mở
  }, []);

  // Vòng vẽ: canvas dưới là cảnh (trời, sân), video người chọi ở giữa, canvas trên là viên đá, quỹ đạo, hiệu ứng.
  useEffect(() => {
    const el = canvas.current!;
    const top = overlay.current!;
    const ctx = el.getContext("2d")!;
    const fx = top.getContext("2d")!;
    const pal = palette();
    const tones = TONE_KEYS.map((k) => pal[k]);
    const still = new Image();
    still.src = KID.still;
    let raf = 0;
    let shownResult = false;
    let finished = false;
    let played = false;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dpr = window.devicePixelRatio || 1;
      const W = el.clientWidth;
      const H = el.clientHeight;
      for (const c of [el, top])
        if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
          c.width = Math.round(W * dpr);
          c.height = Math.round(H * dpr);
        }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fx.clearRect(0, 0, W, H);
      const { court, target } = data.current;
      const cd: CourtData = { ...court, tones, target };
      const myTone = tones[tone] ?? tones[0];
      const s = show.current;
      // Lề dưới chừa chỗ cho khung hướng dẫn (thanh lực + lời nhắc) để không che người chọi.
      const margin = { t: Math.max(70, H * 0.12), b: Math.max(96, H * 0.12), l: 16, r: 16 };
      const kidVideo = video.current;

      // Giai đoạn hiện tại.
      const e = s ? now - s.t0 : 0;
      const phase = !s ? "aim" : e < s.windup ? "windup" : e < s.windup + s.whip ? "whip" : e < s.windup + s.whip + s.fly ? "fly" : e < s.windup + s.whip + s.fly + s.slide ? "slide" : "hold";
      // Buông tay (hết lấy đà) thì phát động tác ném, một lần.
      if (!played && s && phase !== "windup") {
        played = true;
        void kidVideo?.play().catch(() => {});
      }
      const blind = mode === "back" && (phase === "aim" || phase === "windup" || (phase === "whip" && e - s!.windup < s!.whip / 2));

      if (blind) {
        paintBlind(ctx, W, H, now);
        const kid = blindKid(W, H);
        placeVideo(kidVideo, KID.back.hand, kid.hand, kid.k / KID.k, true);
        const a = aim.current;
        const max = maxPull();
        const pulled = phase === "aim" ? clampLen(a.dx, a.dy, max) : phase === "windup" ? scale(s!.pull, ease(e / s!.windup)) : null;
        // Đang ngắm: viên đá theo tay kéo; buông rồi thì đá đã nằm trong động tác ném của video.
        if (pulled) {
          const hand = { x: kid.hand.x + pulled.x * 0.6, y: kid.hand.y + pulled.y * 0.6 };
          paintStone(fx, { x: hand.x, y: hand.y, k: kid.k * 1.4 }, myTone);
        }
        if (phase === "aim") paintBackGuide(fx, aimed(), W, H);
        if (phase === "whip") whiteout(fx, W, H, (e - s!.windup) / (s!.whip / 2));
        return;
      }

      const pts = [...FRAME, P(ORIGIN[mode].x, ORIGIN[mode].y, ORIGIN[mode].z)];
      let v = fit(CAMS[mode], pts, W, H, margin);
      if (mode === "front") {
        // Video người chọi đặt theo tay, chân thò xuống dưới: lấn vào khung hướng dẫn thì thu khung hình lại cho vừa.
        const hand = at(v, ORIGIN.front);
        const kidK = at(v, P(ORIGIN.front.x - 30, ORIGIN.front.y - 10)).k * 0.8;
        const over = hand.y + (KID.h - KID.front.hand.y) * (kidK / KID.k) - (H - margin.b);
        if (over > 0) v = fit(CAMS[mode], pts, W, H, { ...margin, b: margin.b + over * 1.15 });
      }
      paintBackdrop(ctx, v, W, H, mode === "front" ? 1 : -1);
      const final = phase === "hold" || phase === "slide" ? s!.result.spot : null;
      paintCourt(ctx, v, cd, now, phase === "hold" ? final : null);

      const handAt = at(v, ORIGIN[mode]);
      if (mode === "front") {
        // Người chọi ở gần camera nên thu nhỏ một chút cho khỏi che sân; tay ở khung đầu trùng chỗ cầm đá.
        const kidK = at(v, P(ORIGIN.front.x - 30, ORIGIN.front.y - 10)).k * 0.8;
        placeVideo(kidVideo, KID.front.hand, handAt, kidK / KID.k, true);
      } else {
        // Camera đã quay lại: người chọi đứng trên Trời quay mặt ra (ảnh tĩnh).
        placeVideo(kidVideo, KID.back.hand, handAt, 1, false);
        const foot = at(v, P(ORIGIN.back.x - 40, ORIGIN.back.y + 20));
        const k = (foot.k * 0.75) / KID.k;
        if (still.complete && still.naturalWidth) ctx.drawImage(still, foot.x - KID.foot.x * k, foot.y - KID.foot.y * k, KID.w * k, KID.h * k);
      }
      const a = aim.current;

      if (phase === "aim" || phase === "windup") {
        const max = maxPull();
        const pulled = phase === "aim" ? clampLen(a.dx, a.dy, max) : scale(s!.pull, ease(e / s!.windup));
        const hand = { x: handAt.x + pulled.x, y: handAt.y + pulled.y };
        // Dây "ná": từ chỗ tay tới viên đá đang kéo.
        if (Math.hypot(pulled.x, pulled.y) > 4) {
          fx.save();
          fx.strokeStyle = "rgba(90,50,20,0.85)";
          fx.lineWidth = Math.max(2, 4 * handAt.k);
          fx.beginPath();
          fx.moveTo(handAt.x - 18 * handAt.k, handAt.y);
          fx.lineTo(hand.x, hand.y);
          fx.lineTo(handAt.x + 18 * handAt.k, handAt.y);
          fx.stroke();
          fx.restore();
        }
        if (phase === "aim") paintPreview(fx, v, aimed(), mode);
        paintStone(fx, { ...hand, k: handAt.k }, myTone);
        return;
      }

      if (phase === "whip") whiteout(fx, W, H, 1 - (e - s!.windup - s!.whip / 2) / (s!.whip / 2));
      const t = phase === "whip" ? 0 : Math.min(s!.l.t, (e - s!.windup - s!.whip) / 1000);
      if (phase === "whip" || phase === "fly") {
        const g = flightAt(s!.l, t);
        paintShadow(fx, at(v, P(g.x, g.y)), 1 - Math.min(0.5, g.z / 600));
        paintStone(fx, at(v, g), myTone);
        return;
      }
      // Trượt rồi nằm yên.
      const u = phase === "slide" ? ease((e - s!.windup - s!.whip - s!.fly) / s!.slide) : 1;
      const pos = P(s!.shot.lx + (s!.shot.x - s!.shot.lx) * u, s!.shot.ly + (s!.shot.y - s!.shot.ly) * u);
      const p = at(v, pos);
      paintShadow(fx, p);
      paintStone(fx, p, myTone);
      if (phase === "hold") {
        fx.save();
        fx.strokeStyle = VERDICT[s!.result.verdict].good ? "#2fe08f" : "#ff4d4d";
        fx.lineWidth = 3;
        fx.beginPath();
        fx.ellipse(p.x, p.y, 26 * p.k + 10, (26 * p.k + 10) * 0.5, 0, 0, Math.PI * 2);
        fx.stroke();
        fx.restore();
        if (!shownResult) {
          shownResult = true;
          setResult(s!.result);
        }
        if (!finished && e > s!.windup + s!.whip + s!.fly + s!.slide + s!.hold) {
          finished = true;
          setStage("done");
          done.current();
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vòng vẽ đọc mọi thứ qua ref
  }, []);

  // Kéo thả.
  const down = (e: React.PointerEvent) => {
    if (stage !== "aim" || replay) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    aim.current = { on: true, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, kb: false };
  };
  const move = (e: React.PointerEvent) => {
    const a = aim.current;
    if (!a.on) return;
    a.dx = e.clientX - a.sx;
    a.dy = e.clientY - a.sy;
    setPower(aimed()?.power ?? 0);
  };
  const up = () => {
    if (aim.current.on) release();
  };

  // Bàn phím: ← → chỉnh hướng, ↑ ↓ chỉnh lực, Enter / Space chọi; Esc đóng.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stage === "aim" && onClose) return onClose();
      if (stage !== "aim" || replay) return;
      const a = aim.current;
      const step = maxPull() / 40;
      const back = mode === "back" ? -1 : 1;
      if (!a.kb && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        a.kb = true;
        a.dx = 0;
        a.dy = back * maxPull() * 0.3;
      }
      if (e.key === "ArrowLeft") a.dx += step;
      else if (e.key === "ArrowRight") a.dx -= step;
      else if (e.key === "ArrowUp") a.dy += back * step;
      else if (e.key === "ArrowDown") a.dy -= back * step;
      else if ((e.key === "Enter" || e.key === " ") && a.kb) {
        e.preventDefault();
        release();
        a.kb = false;
        return;
      } else return;
      e.preventDefault();
      setPower(aimed()?.power ?? 0);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const v = result ? VERDICT[result.verdict] : null;
  const goal = mode === "back" ? "Chọi qua lưng — không được nhìn!" : target === TROI ? "Chọi đá lên Trời" : `Chọi đá vào ô ${target}`;
  return (
    <div className="cc-scene" role="dialog" aria-modal="true" aria-label={`${name}: ${goal}`} onClick={replay && stage !== "aim" ? () => done.current() : undefined}>
      <canvas ref={canvas} className="cc-canvas" aria-hidden="true" />
      <video ref={video} className="cc-kid" src={src} width={KID.w} height={KID.h} muted playsInline preload="auto" aria-hidden="true" />
      <canvas ref={overlay} className="cc-canvas is-top" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div className="cc-hud">
        <span className="cc-hud-who" style={{ ["--tone" as string]: `var(--${TONE_KEYS[tone] ?? "coral"})` }}>
          <span className="cc-hud-avatar">{avatar}</span>
          <b className="truncate">{name}</b>
        </span>
        <span className="cc-hud-goal">{goal}</span>
        {!replay && stage === "aim" && onClose && (
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Xem sân
          </button>
        )}
      </div>
      {!replay && stage === "aim" && (
        <div className="cc-hint" aria-live="polite">
          <div className="cc-power" aria-label={`Lực ${Math.round(power * 100)}%`}>
            <span style={{ width: `${Math.round(power * 100)}%` }} />
          </div>
          <p>{mode === "back" ? "Kéo lên trên để lấy đà, lệch trái/phải để đổi hướng — buông tay là chọi ra sau lưng." : "Kéo ngược về sau như kéo ná — kéo càng dài chọi càng xa. Buông tay là chọi!"}</p>
        </div>
      )}
      {v && result && (
        <div className={`cc-verdict ${v.good ? "is-good" : "is-bad"}`} aria-live="assertive">
          <span aria-hidden="true">{v.emoji}</span> {v.text(result.spot, target)}
        </div>
      )}
      {replay && stage !== "aim" && <p className="cc-skip">Bấm để bỏ qua</p>}
    </div>
  );
}

const ease = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
const scale = (p: { x: number; y: number }, u: number) => ({ x: p.x * u, y: p.y * u });
function clampLen(x: number, y: number, max: number) {
  const l = Math.hypot(x, y);
  return l > max ? { x: (x / l) * max, y: (y / l) * max } : { x, y };
}

function whiteout(ctx: CanvasRenderingContext2D, W: number, H: number, u: number) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, u));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Chấm quỹ đạo — chỉ đoạn đầu, phần còn lại phải tự đoán. */
function paintPreview(ctx: CanvasRenderingContext2D, v: View, a: { power: number; yaw: number } | null, mode: ThrowMode) {
  if (!a) return;
  const l = launch(mode, a.power, a.yaw);
  ctx.save();
  for (let i = 1; i <= 9; i++) {
    const g = flightAt(l, (l.t * 0.42 * i) / 9);
    const p = at(v, g);
    ctx.globalAlpha = 1 - i / 11;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(2, 3.2 * p.k * 2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Màn quay lưng: vòng lực và mũi tên chỉ hướng đá sẽ bay ra sau lưng. */
function paintBackGuide(ctx: CanvasRenderingContext2D, a: { power: number; yaw: number } | null, W: number, H: number) {
  const c = { x: W / 2, y: H * 0.3 };
  const R = Math.min(W, H) * 0.11;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (a) {
    // Mũi tên hướng xuống (ra sau lưng), lệch theo hướng ném; dài theo lực.
    const ang = Math.PI / 2 + a.yaw;
    const len = R * (0.35 + 0.65 * a.power);
    ctx.strokeStyle = a.power > 0.85 ? "#ff6b6b" : "#ffffff";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    const tip = { x: c.x + Math.cos(ang) * len, y: c.y + Math.sin(ang) * len };
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tip.x + Math.cos(ang + 2.5) * 14, tip.y + Math.sin(ang + 2.5) * 14);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(tip.x + Math.cos(ang - 2.5) * 14, tip.y + Math.sin(ang - 2.5) * 14);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "800 15px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🙈 Sân ở sau lưng bạn", c.x, c.y - R - 14);
  ctx.restore();
}
