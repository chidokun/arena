// Thiết kế hệ thống: cả phòng nhận cùng một đề, mỗi người tự dựng sơ đồ từ các component có sẵn rồi chốt. Hết giờ (hoặc
// mọi người đã chốt) thì mọi máy tự chạy load test giả lập — tất định từ đề + thiết kế nên máy nào cũng ra cùng kết quả,
// không phải gửi kết quả qua mạng.

export type Kind = "lb" | "gateway" | "app" | "cache" | "db" | "replica" | "queue" | "worker" | "storage" | "cdn" | "external";
export type NodeKind = Kind | "users";

export const KINDS: readonly Kind[] = ["lb", "gateway", "app", "cache", "db", "replica", "queue", "worker", "storage", "cdn", "external"];

export type Variant = { name: string; tps: number; price: number; hit?: number; cap?: number };

export type KindInfo = { name: string; short: string; emoji: string; role: string; rule: string; variants: readonly [Variant, Variant, Variant] };

export const CATALOG: Record<Kind, KindInfo> = {
  lb: {
    name: "Load Balancer",
    short: "LB",
    emoji: "⚖️",
    role: "Phân phối traffic đến các nhánh xử lý",
    rule: "Chia đều mọi request cho các nhánh còn hoạt động, không phân biệt loại request — nhánh nào sau LB cũng phải xử lý được mọi loại request đi qua LB.",
    variants: [
      { name: "Basic", tps: 3000, price: 4 },
      { name: "Standard", tps: 8000, price: 9 },
      { name: "Premium", tps: 20000, price: 18 },
    ],
  },
  gateway: {
    name: "API Gateway",
    short: "Gateway",
    emoji: "🚪",
    role: "Tiếp nhận và chuyển tiếp request",
    rule: "Định tuyến theo loại request: mỗi loại chỉ gửi tới các nhánh xử lý được loại đó, chia đều giữa các nhánh hợp lệ. Gửi được tệp tĩnh thẳng tới Object Storage.",
    variants: [
      { name: "Basic", tps: 1500, price: 6 },
      { name: "Standard", tps: 4000, price: 13 },
      { name: "Enterprise", tps: 10000, price: 26 },
    ],
  },
  app: {
    name: "Application Server",
    short: "App",
    emoji: "🖥️",
    role: "Xử lý nghiệp vụ",
    rule: "Đọc: ưu tiên Cache, rồi Read Replica, rồi Database. Ghi: Database. Xử lý nền: Message Queue. Tải tệp lên: Object Storage. Gọi ngoài: External Service. Nhiều đích cùng loại thì chia đều.",
    variants: [
      { name: "Small", tps: 500, price: 10 },
      { name: "Medium", tps: 1200, price: 22 },
      { name: "Large", tps: 2500, price: 40 },
    ],
  },
  cache: {
    name: "Cache",
    short: "Cache",
    emoji: "⚡",
    role: "Phục vụ dữ liệu đã lưu, giảm tải phía sau",
    rule: "Chỉ nhận thao tác đọc. Phần trúng cache (hit) trả về ngay; phần trượt (miss) đi tiếp — ưu tiên Read Replica rồi tới Database. Cache nào cũng phải có đường cho cache miss.",
    variants: [
      { name: "Small", tps: 2000, price: 6, hit: 0.6 },
      { name: "Medium", tps: 5000, price: 12, hit: 0.75 },
      { name: "Large", tps: 12000, price: 25, hit: 0.9 },
    ],
  },
  db: {
    name: "Database",
    short: "DB",
    emoji: "🗄️",
    role: "Xử lý thao tác đọc và ghi",
    rule: "Database chính: nhận cả đọc lẫn ghi. Nối sang Read Replica để nhân bản dữ liệu — mỗi thao tác ghi vào Database cũng thành một lượt tải trên mỗi Replica của nó.",
    variants: [
      { name: "Small", tps: 400, price: 15 },
      { name: "Medium", tps: 1000, price: 32 },
      { name: "Large", tps: 2500, price: 70 },
    ],
  },
  replica: {
    name: "Read Replica",
    short: "Replica",
    emoji: "📚",
    role: "Xử lý thao tác đọc",
    rule: "Chỉ xử lý thao tác đọc. Phải được nối nhân bản từ Database chính, và chịu thêm tải nhân bản bằng số thao tác ghi vào Database đó.",
    variants: [
      { name: "Small", tps: 400, price: 9 },
      { name: "Medium", tps: 1000, price: 19 },
      { name: "Large", tps: 2500, price: 42 },
    ],
  },
  queue: {
    name: "Message Queue",
    short: "Queue",
    emoji: "📬",
    role: "Lưu các tác vụ chờ xử lý",
    rule: "Nhận tác vụ nền với tốc độ tối đa bằng TPS. Tác vụ nằm chờ tới khi Worker lấy ra; số tác vụ tồn vượt sức chứa là thất bại.",
    variants: [
      { name: "Basic", tps: 1000, price: 5, cap: 5000 },
      { name: "Standard", tps: 3000, price: 10, cap: 20000 },
      { name: "Pro", tps: 8000, price: 20, cap: 80000 },
    ],
  },
  worker: {
    name: "Worker",
    short: "Worker",
    emoji: "👷",
    role: "Lấy tác vụ từ queue và xử lý",
    rule: "Lấy tác vụ từ Message Queue, xử lý tối đa bằng TPS (không bao giờ quá tải — tác vụ chưa kịp xử lý nằm lại trong queue). Tác vụ cần ghi tiếp thì Worker phải nối tới đích tương ứng; đích gián đoạn thì Worker tạm dừng.",
    variants: [
      { name: "Small", tps: 200, price: 5 },
      { name: "Medium", tps: 500, price: 11 },
      { name: "Large", tps: 1200, price: 24 },
    ],
  },
  storage: {
    name: "Object Storage",
    short: "Storage",
    emoji: "🪣",
    role: "Lưu trữ và phục vụ tệp",
    rule: "Phục vụ tệp tĩnh, nhận tệp tải lên và lưu kết quả xử lý nền.",
    variants: [
      { name: "Basic", tps: 800, price: 5 },
      { name: "Standard", tps: 2000, price: 10 },
      { name: "Pro", tps: 5000, price: 22 },
    ],
  },
  cdn: {
    name: "CDN",
    short: "CDN",
    emoji: "🌐",
    role: "Phục vụ nội dung đã cache",
    rule: "Chỉ phục vụ tệp tĩnh: phần hit trả về ngay, phần miss lấy từ Object Storage.",
    variants: [
      { name: "Basic", tps: 3000, price: 6, hit: 0.7 },
      { name: "Standard", tps: 8000, price: 14, hit: 0.85 },
      { name: "Global", tps: 20000, price: 30, hit: 0.95 },
    ],
  },
  external: {
    name: "External Service",
    short: "External",
    emoji: "🔌",
    role: "Mô phỏng dịch vụ bên ngoài",
    rule: "Dịch vụ bên ngoài như cổng thanh toán, email, đẩy thông báo. Giới hạn TPS theo gói; nhiều bản thì chia đều.",
    variants: [
      { name: "Basic", tps: 200, price: 4 },
      { name: "Pro", tps: 600, price: 10 },
      { name: "Business", tps: 1500, price: 22 },
    ],
  },
};

export const USERS = { name: "Users", short: "Users", emoji: "👥", role: "Người dùng gửi request vào hệ thống" } as const;

// Ai nối được tới ai. DB → Replica là đường nhân bản, không phải đường đi của request.
export const LINKS: Record<NodeKind, readonly Kind[]> = {
  users: ["lb", "gateway", "app", "cdn", "storage"],
  lb: ["lb", "gateway", "app"],
  gateway: ["lb", "app", "storage"],
  app: ["cache", "replica", "db", "queue", "storage", "external"],
  cache: ["replica", "db"],
  db: ["replica"],
  replica: [],
  queue: ["worker"],
  worker: ["db", "storage", "external"],
  storage: [],
  cdn: ["storage"],
  external: [],
};

// Users có một cửa vào cho request động và một cho tệp tĩnh (như api.… và cdn.…): muốn nhiều App thì phải có LB / Gateway.
const FRONT_DYNAMIC: readonly Kind[] = ["lb", "gateway", "app"];
const FRONT_STATIC: readonly Kind[] = ["cdn", "storage"];

export const isReplication = (from: NodeKind, to: NodeKind) => from === "db" && to === "replica";

export type FlowKind = "read" | "write" | "job" | "static" | "upload" | "call";
export const FLOW_KINDS: readonly FlowKind[] = ["read", "write", "job", "static", "upload", "call"];
export type Sink = "db" | "storage" | "external";
export const SINKS: readonly Sink[] = ["db", "storage", "external"];

export const FLOWS: Record<FlowKind, { name: string; emoji: string; path: string; done: string }> = {
  read: { name: "Đọc dữ liệu", emoji: "📖", path: "App Server → Cache / Read Replica / Database", done: "nhận dữ liệu từ Cache (hit), Read Replica hoặc Database" },
  write: { name: "Ghi dữ liệu", emoji: "✍️", path: "App Server → Database", done: "ghi thành công vào Database chính" },
  job: { name: "Xử lý nền", emoji: "⚙️", path: "App Server → Message Queue → Worker", done: "Worker xử lý xong tác vụ" },
  static: { name: "Tải tệp tĩnh", emoji: "🖼️", path: "CDN / Object Storage", done: "CDN (hit) hoặc Object Storage trả tệp" },
  upload: { name: "Tải tệp lên", emoji: "📤", path: "App Server → Object Storage", done: "lưu thành công vào Object Storage" },
  call: { name: "Gọi dịch vụ ngoài", emoji: "🔌", path: "App Server → External Service", done: "External Service xử lý xong" },
};

export const SINK_NAMES: Record<Sink, string> = { db: "Database", storage: "Object Storage", external: "External Service" };

export type Flow = {
  kind: FlowKind;
  name: string;
  pct: number;
  // Bắt buộc đi qua API Gateway (không áp dụng cho tệp tĩnh).
  gate?: boolean;
  // Tệp tĩnh bắt buộc phục vụ qua CDN.
  cdn?: boolean;
  // Thao tác đọc bắt buộc đi qua Cache.
  cache?: boolean;
  // Tác vụ nền: Worker phải ghi / gửi tiếp tới đây mới xong; không có thì xong ngay tại Worker.
  sink?: Sink;
};

export type Incident = "app-down" | "db-slow" | "link-cut" | "cache-flush" | "cache-drop" | "skew" | "write-surge" | "worker-down" | "ext-down";

export const INCIDENTS: Record<Incident, { name: string; emoji: string; text: string }> = {
  "app-down": { name: "App Server ngừng hoạt động", emoji: "💥", text: "App Server đang nhận nhiều traffic nhất ngừng hoạt động; LB và Gateway tự chuyển traffic sang các App còn lại." },
  "db-slow": { name: "Giảm năng lực xử lý", emoji: "🐢", text: "Mọi Database chính giảm 40% TPS (như đang chạy backup)." },
  "link-cut": { name: "Mất kết nối", emoji: "✂️", text: "Đường nối vào App Server mang nhiều traffic nhất bị đứt; traffic phải đi đường khác." },
  "cache-flush": { name: "Cache bị xoá", emoji: "🧹", text: "Mọi Cache mất sạch dữ liệu: hit rate về 0 rồi hồi dần lại trong 4 giây." },
  "cache-drop": { name: "Cache hit giảm", emoji: "📉", text: "Hit rate của mọi Cache và CDN giảm 30 điểm phần trăm." },
  skew: { name: "Traffic lệch nhánh", emoji: "↗️", text: "LB và API Gateway dồn gấp đôi traffic vào nhánh được đặt sớm nhất." },
  "write-surge": { name: "Tăng tỷ lệ ghi", emoji: "📝", text: "Tỷ lệ các luồng Ghi dữ liệu tăng gấp đôi, các luồng khác giảm tương ứng." },
  "worker-down": { name: "Worker ngừng hoạt động", emoji: "😴", text: "Mỗi Queue mất Worker có TPS lớn nhất; tác vụ dồn lại trong hàng chờ." },
  "ext-down": { name: "External Service gián đoạn", emoji: "🔥", text: "External Service đang nhận nhiều traffic nhất ngừng phản hồi; Worker gọi nó phải tạm dừng." },
};
export const INCIDENT_KEYS = Object.keys(INCIDENTS) as Incident[];

export type DesignTime = 0 | 120 | 300;
export const TIMES: readonly DesignTime[] = [120, 300, 0];
export const timeLabel = (t: DesignTime) => (t ? `${t / 60} phút` : "Không giới hạn");

export type Problem = {
  title: string;
  desc: string;
  time: DesignTime;
  target: number;
  budget: number;
  kinds: Kind[];
  flows: Flow[];
  incidents: Incident[];
};

// Đề của ván đang chơi. Từ `t0` mọi người đọc đề và xác nhận (`read`); đủ cả thì chủ phòng đặt `go` — lúc mở bàn thiết kế
// sau cảnh chuẩn bị — và hạn chốt `end` (0 = không giới hạn thời gian thiết kế).
export type SxRound = { p: Problem; t0: number; end: number; read?: string[]; go?: number };

export type Node = { id: number; k: Kind; v: number; x: number; y: number };
export type Design = { nodes: Node[]; edges: [number, number][] };

export const USERS_ID = 0;
export const CANVAS = { w: 960, h: 600 } as const;
export const NODE = { w: 120, h: 56 } as const;
export const USERS_POS = { x: 16, y: (CANVAS.h - NODE.h) / 2 } as const;
export const MAX_NODES = 40;
export const MAX_EDGES = 120;
export const MAX_FLOWS = 5;
export const COUNTDOWN_MS = 3000;

// Mỗi mức tải: `window` giây nhận request, sự cố (nếu có) xảy ra từ giây `incFrom` tới `incTo`, rồi ngừng nhận và Queue
// có tối đa `drain` giây để xử lý hết tác vụ. Mức thứ `steps` đúng bằng traffic mục tiêu.
export const SIM = { window: 10, incFrom: 4, incTo: 7, drain: 5, steps: 20, maxLevels: 100 } as const;
export const levelStep = (p: Pick<Problem, "target">) => p.target / SIM.steps;

export const emptyDesign = (): Design => ({ nodes: [], edges: [] });

export const variantOf = (n: Pick<Node, "k" | "v">) => CATALOG[n.k].variants[n.v];

export const designCost = (d: Design) => d.nodes.reduce((s, n) => s + variantOf(n).price, 0);

export function fmt(n: number) {
  const r = Math.round(n);
  const s = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return r < 0 ? `-${s}` : s;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

// "App #1", "App #2"… đánh số theo thứ tự đặt.
export function nodeLabels(d: Design): Map<number, string> {
  const out = new Map<number, string>([[USERS_ID, USERS.name]]);
  const count = new Map<Kind, number>();
  for (const n of [...d.nodes].sort((a, b) => a.id - b.id)) {
    const k = (count.get(n.k) ?? 0) + 1;
    count.set(n.k, k);
    out.set(n.id, `${CATALOG[n.k].short} #${k}`);
  }
  return out;
}

const kindAt = (d: Design, id: number): NodeKind | undefined => (id === USERS_ID ? "users" : d.nodes.find((n) => n.id === id)?.k);

function reaches(d: Design, from: number, to: number) {
  const seen = new Set<number>();
  const stack = [from];
  while (stack.length) {
    const x = stack.pop()!;
    if (x === to) return true;
    if (seen.has(x)) continue;
    seen.add(x);
    for (const [a, b] of d.edges) if (a === x) stack.push(b);
  }
  return false;
}

/** Lý do không nối được a → b, hoặc "" nếu nối được. */
export function linkIssue(d: Design, a: number, b: number): string {
  const ka = kindAt(d, a);
  const kb = kindAt(d, b);
  if (!ka || !kb) return "Component không tồn tại";
  if (a === b) return "Không nối component với chính nó";
  if (kb === "users") return "Không nối ngược về Users";
  const name = (k: NodeKind) => (k === "users" ? USERS.name : CATALOG[k].name);
  if (!LINKS[ka].includes(kb)) return `${name(ka)} không nối được tới ${name(kb)}`;
  if (d.edges.some(([x, y]) => x === a && y === b)) return "Đã có đường nối này";
  if (ka === "users") {
    const group = FRONT_DYNAMIC.includes(kb) ? FRONT_DYNAMIC : FRONT_STATIC;
    if (d.edges.some(([x, y]) => x === USERS_ID && group.includes(kindAt(d, y) as Kind)))
      return group === FRONT_DYNAMIC ? "Users chỉ có một cửa vào cho request: dùng LB hoặc API Gateway để chia cho nhiều App" : "Users chỉ có một cửa vào cho tệp tĩnh (CDN hoặc Object Storage)";
  }
  if (reaches(d, b, a)) return "Đường nối này tạo vòng lặp";
  return "";
}

// ---------------------------------------------------------------------------------------------------------------------
// Chuẩn hoá dữ liệu lấy từ mạng (đề do chủ phòng soạn, thiết kế do người chơi gửi).

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "");
const int = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt);

export const TARGET_MIN = 100;
export const TARGET_MAX = 20000;
export const BUDGET_MIN = 10;
export const BUDGET_MAX = 5000;

export function needMask(f: Flow) {
  return (f.gate ? 1 : 0) | (f.cdn ? 2 : 0) | (f.cache ? 4 : 0);
}

/** Các loại component đề bắt buộc phải cho phép để mọi luồng có đường đi. */
export function neededKinds(flows: readonly Flow[]): Set<Kind> {
  const s = new Set<Kind>();
  for (const f of flows) {
    if (f.gate) s.add("gateway");
    if (f.kind === "static") {
      s.add("storage");
      if (f.cdn) s.add("cdn");
      continue;
    }
    s.add("app");
    if (f.kind === "read") {
      s.add("db");
      if (f.cache) s.add("cache");
    }
    if (f.kind === "write") s.add("db");
    if (f.kind === "job") {
      s.add("queue");
      s.add("worker");
      if (f.sink) s.add(f.sink);
    }
    if (f.kind === "upload") s.add("storage");
    if (f.kind === "call") s.add("external");
  }
  return s;
}

function normFlow(raw: unknown): Flow | null {
  const o = (raw ?? {}) as Partial<Flow>;
  if (!FLOW_KINDS.includes(o.kind as FlowKind)) return null;
  const kind = o.kind as FlowKind;
  const f: Flow = { kind, name: str(o.name, 40) || FLOWS[kind].name, pct: int(o.pct, 0, 100, 0) };
  if (o.gate === true && kind !== "static") f.gate = true;
  if (o.cdn === true && kind === "static") f.cdn = true;
  if (o.cache === true && kind === "read") f.cache = true;
  if (kind === "job" && SINKS.includes(o.sink as Sink)) f.sink = o.sink;
  return f;
}

/** Lỗi khiến đề chưa dùng được (để ô soạn đề báo cho chủ phòng). */
export function flowIssues(flows: readonly Flow[]): string[] {
  const out: string[] = [];
  if (!flows.length) out.push("Cần ít nhất một luồng nghiệp vụ.");
  if (flows.length > MAX_FLOWS) out.push(`Tối đa ${MAX_FLOWS} luồng nghiệp vụ.`);
  if (flows.some((f) => f.pct < 1)) out.push("Mỗi luồng cần tỷ lệ ít nhất 1%.");
  const sum = flows.reduce((s, f) => s + f.pct, 0);
  if (flows.length && sum !== 100) out.push(`Tổng tỷ lệ các luồng phải bằng 100% (đang là ${sum}%).`);
  return out;
}

export function normProblem(raw: unknown): Problem {
  const o = (raw ?? {}) as Partial<Record<keyof Problem, unknown>>;
  const parsed = Array.isArray(o.flows) ? o.flows.slice(0, MAX_FLOWS).map(normFlow) : [];
  const flows = parsed.length && parsed.every((f) => f) && !flowIssues(parsed as Flow[]).length ? (parsed as Flow[]) : PRESETS[0].flows.map((f) => ({ ...f }));
  const need = neededKinds(flows);
  const asked = Array.isArray(o.kinds) ? o.kinds : KINDS;
  const kinds = KINDS.filter((k) => need.has(k) || asked.includes(k));
  const incidents = Array.isArray(o.incidents) ? INCIDENT_KEYS.filter((k) => (o.incidents as unknown[]).includes(k)) : [];
  return {
    title: str(o.title, 60) || "Đề chưa đặt tên",
    desc: text(o.desc, 600),
    time: TIMES.includes(o.time as DesignTime) ? (o.time as DesignTime) : 300,
    target: Math.round(int(o.target, TARGET_MIN, TARGET_MAX, 1000) / 100) * 100,
    budget: int(o.budget, BUDGET_MIN, BUDGET_MAX, 100),
    kinds,
    flows,
    incidents,
  };
}

/** Thiết kế nhận từ mạng: bỏ component đề không cho dùng, đường nối sai luật, trùng, tạo vòng lặp. */
export function normDesign(raw: unknown, p: Pick<Problem, "kinds">): Design {
  const o = (raw ?? {}) as { nodes?: unknown; edges?: unknown };
  const d = emptyDesign();
  const ids = new Set<number>();
  for (const r of Array.isArray(o.nodes) ? o.nodes : []) {
    if (d.nodes.length >= MAX_NODES) break;
    const n = (r ?? {}) as Partial<Node>;
    const id = n.id;
    if (typeof id !== "number" || !Number.isInteger(id) || id < 1 || id > 99999 || ids.has(id)) continue;
    if (!p.kinds.includes(n.k as Kind) || !(n.v === 0 || n.v === 1 || n.v === 2)) continue;
    ids.add(id);
    d.nodes.push({ id, k: n.k as Kind, v: n.v, x: int(n.x, 0, CANVAS.w - NODE.w, 0), y: int(n.y, 0, CANVAS.h - NODE.h, 0) });
  }
  for (const e of Array.isArray(o.edges) ? o.edges : []) {
    if (d.edges.length >= MAX_EDGES) break;
    if (!Array.isArray(e) || typeof e[0] !== "number" || typeof e[1] !== "number") continue;
    if (!linkIssue(d, e[0], e[1])) d.edges.push([e[0], e[1]]);
  }
  return d;
}

// ---------------------------------------------------------------------------------------------------------------------
// Định tuyến. Đồ thị được dịch sang chỉ số (Users = 0, còn lại theo thứ tự id) để giả lập chạy nhanh.

type Net = {
  ids: number[];
  kind: NodeKind[];
  spec: (Variant | null)[];
  out: number[][];
  src: number[][];
  feeds: number[][];
  label: string[];
};

const EDGE = 4096;

function compile(d: Design): Net {
  const nodes = [...d.nodes].sort((a, b) => a.id - b.id);
  const labels = nodeLabels(d);
  const ids = [USERS_ID, ...nodes.map((n) => n.id)];
  const at = new Map(ids.map((id, i) => [id, i]));
  const net: Net = {
    ids,
    kind: ["users", ...nodes.map((n) => n.k)],
    spec: [null, ...nodes.map(variantOf)],
    out: ids.map(() => []),
    src: ids.map(() => []),
    feeds: ids.map(() => []),
    label: ids.map((id) => labels.get(id) ?? "?"),
  };
  for (const [a, b] of d.edges) {
    const i = at.get(a);
    const j = at.get(b);
    if (i === undefined || j === undefined) continue;
    if (isReplication(net.kind[i], net.kind[j])) net.src[j].push(i);
    else {
      net.out[i].push(j);
      net.feeds[j].push(i);
    }
  }
  for (const l of [...net.out, ...net.src, ...net.feeds]) l.sort((a, b) => a - b);
  return net;
}

const VIA: Partial<Record<NodeKind, number>> = { gateway: 1, cdn: 2, cache: 4 };
const viaBit = (k: NodeKind) => VIA[k] ?? 0;

const APP_TIERS: Record<FlowKind, readonly (readonly Kind[])[]> = {
  read: [["cache"], ["replica"], ["db"]],
  write: [["db"]],
  job: [["queue"]],
  static: [],
  upload: [["storage"]],
  call: [["external"]],
};

function tiersOf(k: NodeKind, fk: FlowKind): readonly (readonly Kind[])[] {
  if (k === "users") return fk === "static" ? [["cdn"], ["gateway", "lb", "storage"]] : [FRONT_DYNAMIC];
  if (k === "app") return APP_TIERS[fk];
  if (k === "cache") return [["replica"], ["db"]];
  if (k === "cdn") return [["storage"]];
  return [];
}

type Ctx = {
  down: Set<number>;
  cut: Set<number>;
  skew: boolean;
  hit: (i: number) => number;
  mul: (i: number) => number;
};

function workersFit(net: Net, q: number, f: Flow) {
  const ws = net.out[q];
  return ws.length > 0 && (!f.sink || ws.every((w) => net.out[w].some((j) => net.kind[j] === f.sink)));
}

type Why = { path: number[]; text: string };

class Router {
  private memo = new Map<number, boolean>();
  private net: Net;
  private flows: readonly Flow[];
  private need: number[];
  private ctx: Ctx;

  constructor(net: Net, flows: readonly Flow[], ctx: Ctx) {
    this.net = net;
    this.flows = flows;
    this.need = flows.map(needMask);
    this.ctx = ctx;
  }

  pass(i: number, j: number) {
    return !this.ctx.down.has(j) && !this.ctx.cut.has(i * EDGE + j);
  }

  // Các đích request của luồng f rời khỏi i được gửi tới. LB không nhìn loại request: gửi cho mọi nhánh còn sống.
  next(i: number, f: number, mask: number): number[] {
    const { kind, out } = this.net;
    const k = kind[i];
    if (k === "lb") return out[i].filter((j) => this.pass(i, j));
    if (k === "gateway") return out[i].filter((j) => this.pass(i, j) && this.ok(j, f, mask | viaBit(kind[j])));
    for (const tier of tiersOf(k, this.flows[f].kind)) {
      const hit = out[i].filter((j) => tier.includes(kind[j] as Kind) && this.pass(i, j) && this.ok(j, f, mask | viaBit(kind[j])));
      if (hit.length) return hit;
    }
    return [];
  }

  /** Mọi request luồng f tới i (đã qua các vai trò trong `mask`) đều tới được điểm hoàn thành hợp lệ. */
  ok(i: number, f: number, mask: number): boolean {
    if (this.ctx.down.has(i)) return false;
    const key = (i * 8 + f) * 8 + mask;
    const seen = this.memo.get(key);
    if (seen !== undefined) return seen;
    const r = this.check(i, f, mask);
    this.memo.set(key, r);
    return r;
  }

  private check(i: number, f: number, mask: number): boolean {
    const k = this.net.kind[i];
    const fk = this.flows[f].kind;
    const done = (mask & this.need[f]) === this.need[f];
    switch (k) {
      case "users":
      case "gateway":
      case "app":
        return this.next(i, f, mask).length > 0;
      case "lb": {
        const live = this.next(i, f, mask);
        return live.length > 0 && live.every((j) => this.ok(j, f, mask | viaBit(this.net.kind[j])));
      }
      case "cache":
        return fk === "read" && done && this.next(i, f, mask).length > 0;
      case "cdn":
        return fk === "static" && done && this.next(i, f, mask).length > 0;
      case "db":
        return (fk === "read" || fk === "write") && done;
      case "replica":
        return fk === "read" && done && this.net.src[i].length > 0;
      case "storage":
        return (fk === "static" || fk === "upload") && done;
      case "external":
        return fk === "call" && done;
      case "queue":
        return fk === "job" && done && workersFit(this.net, i, this.flows[f]);
      default:
        return false;
    }
  }

  private missing(f: number, mask: number) {
    const lack = this.need[f] & ~mask;
    if (lack & 1) return "đường đi chưa qua API Gateway (bắt buộc với luồng này)";
    if (lack & 2) return "tệp chưa được phục vụ qua CDN (bắt buộc với luồng này)";
    return "thao tác đọc chưa đi qua Cache (bắt buộc với luồng này)";
  }

  /** Giải thích vì sao luồng f không đi trọn từ i: lần theo nhánh hỏng đầu tiên tới chỗ gãy. */
  explain(i: number, f: number, mask: number): Why {
    const { kind, out } = this.net;
    const fl = this.flows[f];
    const path = [i];
    let m = mask;
    for (let guard = 0; guard < 64; guard++) {
      const k = kind[i];
      const done = (m & this.need[f]) === this.need[f];
      const stop = (text: string): Why => ({ path, text });
      if (this.ctx.down.has(i)) return stop("đang ngừng hoạt động do sự cố");
      let cand: number[];
      if (k === "lb") {
        if (!out[i].length) return stop("chưa nối tới nhánh nào");
        cand = out[i].filter((j) => this.pass(i, j));
        if (!cand.length) return stop("không còn nhánh nào hoạt động");
        cand = cand.filter((j) => !this.ok(j, f, m | viaBit(kind[j])));
      } else if (k === "users" || k === "gateway" || k === "app" || k === "cache" || k === "cdn") {
        if (k === "cache" && fl.kind !== "read") return stop("Cache chỉ phục vụ thao tác đọc");
        if (k === "cdn" && fl.kind !== "static") return stop("CDN chỉ phục vụ tệp tĩnh");
        if ((k === "cache" || k === "cdn") && !done) return stop(this.missing(f, m));
        const tiers = k === "gateway" ? [LINKS.gateway] : tiersOf(k, fl.kind);
        cand = tiers.flatMap((t) => out[i].filter((j) => t.includes(kind[j] as Kind)));
        if (!cand.length) return stop(noRoute(k, fl));
        cand = cand.filter((j) => this.pass(i, j));
        if (!cand.length) return stop("mọi đường đi tiếp đang bị gián đoạn do sự cố");
      } else if (k === "queue") {
        if (fl.kind !== "job") return stop("Message Queue chỉ nhận tác vụ nền");
        if (!done) return stop(this.missing(f, m));
        if (!out[i].length) return stop("chưa có Worker lấy tác vụ");
        const w = out[i].find((x) => !out[x].some((j) => kind[j] === fl.sink));
        if (w !== undefined && fl.sink) {
          path.push(w);
          return stop(`chưa nối tới ${SINK_NAMES[fl.sink]} để xử lý xong tác vụ`);
        }
        return stop("không xử lý được tác vụ này");
      } else if (k === "replica") {
        if (fl.kind === "write") return stop("Read Replica không được xử lý thao tác ghi");
        if (fl.kind !== "read") return stop("Read Replica chỉ xử lý thao tác đọc");
        if (!done) return stop(this.missing(f, m));
        return stop("chưa được nối nhân bản từ Database chính");
      } else {
        if (!done) return stop(this.missing(f, m));
        return stop(`${CATALOG[k].name} không xử lý loại request này`);
      }
      if (!cand.length) return stop("không xử lý được luồng này");
      i = cand[0];
      m |= viaBit(kind[i]);
      path.push(i);
    }
    return { path, text: "không xử lý được luồng này" };
  }
}

function noRoute(k: NodeKind, f: Flow) {
  if (k === "users") return f.kind === "static" ? "chưa có cửa vào cho tệp tĩnh (nối Users tới CDN, Object Storage hoặc API Gateway)" : "chưa có cửa vào (nối Users tới Load Balancer, API Gateway hoặc App Server)";
  if (k === "gateway") return f.kind === "static" ? "chưa nối tới Object Storage" : "chưa nối tới nhánh nào xử lý được luồng này";
  if (k === "cache") return "cache miss chưa có đường tới Read Replica hoặc Database";
  if (k === "cdn") return "cache miss chưa có đường tới Object Storage";
  const what: Record<FlowKind, string> = {
    read: "chưa nối tới Cache, Read Replica hoặc Database",
    write: "chưa nối tới Database để ghi",
    job: "chưa nối tới Message Queue",
    static: "App Server không phục vụ tệp tĩnh — dùng CDN hoặc Object Storage",
    upload: "chưa nối tới Object Storage",
    call: "chưa nối tới External Service",
  };
  return what[f.kind];
}

function whyText(net: Net, w: Why) {
  const lb = w.path.slice(0, -1).some((i) => net.kind[i] === "lb");
  return `${w.path.map((i) => net.label[i]).join(" → ")}: ${w.text}${lb ? " (LB chia đều mọi loại request nên mọi nhánh sau LB đều phải xử lý được)" : ""}`;
}

type Acc = { load: Float64Array; edge: Map<number, number>; writes: Float64Array; enq: Map<number, Float64Array> };

function newAcc(net: Net): Acc {
  const n = net.ids.length;
  return { load: new Float64Array(n), edge: new Map(), writes: new Float64Array(n), enq: new Map() };
}

const bump = (m: Map<number, number>, k: number, v: number) => m.set(k, (m.get(k) ?? 0) + v);

function propagate(net: Net, flows: readonly Flow[], router: Router, ctx: Ctx, rates: readonly number[], acc: Acc) {
  const split = (i: number, ts: number[], f: number, mask: number, rate: number, skew: boolean) => {
    if (!ts.length || rate <= 0) return;
    const lean = skew && ts.length > 1;
    const total = ts.length + (lean ? 1 : 0);
    ts.forEach((j, n) => {
      const r = (rate * (lean && n === 0 ? 2 : 1)) / total;
      bump(acc.edge, i * EDGE + j, r);
      push(j, f, mask | viaBit(net.kind[j]), r);
    });
  };
  const push = (i: number, f: number, mask: number, rate: number) => {
    if (rate <= 0) return;
    if (i) acc.load[i] += rate;
    const k = net.kind[i];
    if (k === "users" || k === "app" || k === "lb" || k === "gateway") split(i, router.next(i, f, mask), f, mask, rate, ctx.skew && (k === "lb" || k === "gateway"));
    else if (k === "cache" || k === "cdn") split(i, router.next(i, f, mask), f, mask, rate * (1 - ctx.hit(i)), false);
    else if (k === "db" && flows[f].kind === "write") acc.writes[i] += rate;
    else if (k === "queue") {
      let q = acc.enq.get(i);
      if (!q) acc.enq.set(i, (q = new Float64Array(flows.length)));
      q[f] += rate;
    }
  };
  rates.forEach((r, f) => push(0, f, 0, r));
}

const EPS = 1e-6;

// Worker kéo tác vụ khỏi Queue theo sức của mình; nối nhiều Queue thì chia đều sức cho từng Queue. Đích phía sau gián đoạn
// thì Worker tạm dừng, tác vụ nằm lại trong hàng.
function drainQueues(net: Net, flows: readonly Flow[], ctx: Ctx, acc: Acc, backlog: Map<number, Float64Array>) {
  net.kind.forEach((k, q) => {
    if (k !== "queue") return;
    let b = backlog.get(q);
    if (!b) backlog.set(q, (b = new Float64Array(flows.length)));
    const add = acc.enq.get(q);
    if (add) add.forEach((x, f) => (b[f] += x));
    const total = b.reduce((s, x) => s + x, 0);
    if (total <= EPS) {
      b.fill(0);
      return;
    }
    const sinks = new Set(flows.flatMap((fl, f) => (b[f] > EPS && fl.sink ? [fl.sink] : [])));
    const live = net.out[q].filter((w) => !ctx.down.has(w) && [...sinks].every((s) => net.out[w].some((j) => net.kind[j] === s && !ctx.down.has(j))));
    const capOf = (w: number) => (net.spec[w]!.tps * ctx.mul(w)) / net.feeds[w].filter((x) => net.kind[x] === "queue").length;
    const mu = live.reduce((s, w) => s + capOf(w), 0);
    const done = Math.min(total, mu);
    if (done <= 0) return;
    const ratio = done / total;
    for (const w of live) {
      const share = capOf(w) / mu;
      acc.load[w] += done * share;
      bump(acc.edge, q * EDGE + w, done * share);
      flows.forEach((fl, f) => {
        if (b[f] <= EPS || !fl.sink) return;
        const ts = net.out[w].filter((j) => net.kind[j] === fl.sink && !ctx.down.has(j));
        const amt = (b[f] * ratio * share) / ts.length;
        for (const j of ts) {
          acc.load[j] += amt;
          bump(acc.edge, w * EDGE + j, amt);
          if (fl.sink === "db") acc.writes[j] += amt;
        }
      });
    }
    for (let f = 0; f < b.length; f++) b[f] -= b[f] * ratio;
    if (b.reduce((s, x) => s + x, 0) <= EPS) b.fill(0);
  });
}

function replicate(net: Net, acc: Acc) {
  net.kind.forEach((k, r) => {
    if (k !== "replica") return;
    for (const db of net.src[r]) {
      acc.load[r] += acc.writes[db];
      bump(acc.edge, db * EDGE + r, acc.writes[db]);
    }
  });
}

function calmCtx(net: Net): Ctx {
  return { down: new Set(), cut: new Set(), skew: false, hit: (i) => net.spec[i]?.hit ?? 0, mul: () => 1 };
}

function hasCycle(d: Design) {
  const out = new Map<number, number[]>();
  for (const [a, b] of d.edges) out.set(a, [...(out.get(a) ?? []), b]);
  const state = new Map<number, number>();
  const visit = (x: number): boolean => {
    const s = state.get(x);
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(x, 1);
    for (const y of out.get(x) ?? []) if (visit(y)) return true;
    state.set(x, 2);
    return false;
  };
  return [USERS_ID, ...d.nodes.map((n) => n.id)].some(visit);
}

// ---------------------------------------------------------------------------------------------------------------------
// Kiểm tra tính hợp lệ (không chạy tải) — người chơi xem được trong lúc thiết kế.

export type Issue = { text: string; flow?: number; nodes?: number[] };
export type Report = { ok: boolean; errors: Issue[]; idle: Issue[]; cost: number };

export function inspect(p: Pick<Problem, "flows">, d: Design): Report {
  const cost = designCost(d);
  if (hasCycle(d)) return { ok: false, errors: [{ text: "Thiết kế có vòng lặp — request sẽ quay vòng mãi không có điểm dừng." }], idle: [], cost };
  const net = compile(d);
  const ctx = calmCtx(net);
  const router = new Router(net, p.flows, ctx);
  const errors: Issue[] = [];
  p.flows.forEach((f, k) => {
    if (router.ok(0, k, 0)) return;
    const w = router.explain(0, k, 0);
    errors.push({ flow: k, nodes: w.path.map((i) => net.ids[i]), text: whyText(net, w) });
  });
  const idle: Issue[] = [];
  if (!errors.length) {
    const acc = newAcc(net);
    propagate(net, p.flows, router, ctx, p.flows.map((f) => f.pct), acc);
    drainQueues(net, p.flows, ctx, acc, new Map());
    net.kind.forEach((k, i) => {
      if (!i || acc.load[i] > EPS) return;
      let hint = "không nằm trên đường đi của luồng nào";
      if (!net.feeds[i].length && !net.src[i].length) hint = "chưa được nối vào hệ thống";
      else if (k === "replica" && !net.src[i].length) hint = "chưa được nối nhân bản từ Database chính";
      else if (k === "cache" && !net.out[i].length) hint = "chưa có đường cho cache miss";
      else if (k === "queue" && !net.out[i].length) hint = "chưa có Worker";
      idle.push({ nodes: [net.ids[i]], text: `${net.label[i]} ${hint} — không nhận traffic nhưng vẫn tính tiền` });
    });
  }
  return { ok: !errors.length, errors, idle, cost };
}

// ---------------------------------------------------------------------------------------------------------------------
// Load test giả lập.

export type FailWhy = "overload" | "path" | "backlog" | "drain";
export type Failure = { level: number; tps: number; t: number; why: FailWhy; text: string; node?: number; flow?: number };
// `peak` theo thứ tự `SimResult.ids`; đường nối theo khoá "a>b" (id thiết kế).
export type LevelLoad = { tps: number; peak: number[]; edges: Record<string, number>; backlog: number; down: number[]; cut: [number, number] | null };
export type SimResult = { valid: boolean; errors: Issue[]; ids: number[]; maxTps: number; step: number; levels: LevelLoad[]; fail?: Failure; capped: boolean; cost: number };

const argmax = (list: number[], score: (i: number) => number) => list.reduce((best, i) => (best < 0 || score(i) > score(best) ? i : best), -1);

function surge(p: Problem, base: number[]) {
  const w = p.flows.reduce((s, f, k) => s + (f.kind === "write" ? base[k] : 0), 0);
  if (w <= 0) return base;
  const up = Math.min(1, w * 2);
  return p.flows.map((f, k) => (f.kind === "write" ? (base[k] * up) / w : w >= 1 ? 0 : (base[k] * (1 - up)) / (1 - w)));
}

function runLevel(net: Net, p: Problem, tps: number, calm: Router): { load: LevelLoad; fail?: Omit<Failure, "level" | "tps"> } {
  const n = net.ids.length;
  const base = p.flows.map((f) => f.pct / 100);
  const calmCx = calmCtx(net);
  const ref = newAcc(net);
  propagate(net, p.flows, calm, calmCx, base.map((s) => s * tps), ref);
  const inc = new Set(p.incidents);
  const all = (k: NodeKind) => net.kind.flatMap((x, i) => (x === k ? [i] : []));

  // Đối tượng của sự cố chọn theo tải lúc yên ổn ở chính mức này (bằng nhau thì component đặt sớm hơn).
  const down = new Set<number>();
  if (inc.has("app-down")) {
    const a = argmax(all("app"), (i) => ref.load[i]);
    if (a >= 0) down.add(a);
  }
  if (inc.has("ext-down")) {
    const e = argmax(all("external"), (i) => ref.load[i]);
    if (e >= 0) down.add(e);
  }
  if (inc.has("worker-down"))
    for (const q of all("queue")) {
      const w = argmax(net.out[q], (i) => net.spec[i]!.tps);
      if (w >= 0) down.add(w);
    }
  const cut = new Set<number>();
  if (inc.has("link-cut")) {
    const into = net.out.flatMap((ts, i) => ts.filter((j) => net.kind[j] === "app").map((j) => i * EDGE + j));
    const e = argmax(into, (key) => ref.edge.get(key) ?? 0);
    if (e >= 0) cut.add(e);
  }
  let t = 0;
  const flush = inc.has("cache-flush");
  const drop = inc.has("cache-drop");
  const slow = inc.has("db-slow");
  const stormCx: Ctx = {
    down,
    cut,
    skew: inc.has("skew"),
    hit: (i) => {
      let h = net.spec[i]?.hit ?? 0;
      if (flush && net.kind[i] === "cache") h *= (t - SIM.incFrom) / (SIM.incTo - SIM.incFrom + 1);
      if (drop) h = Math.max(0, h - 0.3);
      return h;
    },
    mul: (i) => (slow && net.kind[i] === "db" ? 0.6 : 1),
  };
  const storm = new Router(net, p.flows, stormCx);
  const surged = inc.has("write-surge") ? surge(p, base) : base;

  const peak = new Float64Array(n);
  const edges = new Map<number, number>();
  const backlog = new Map<number, Float64Array>();
  let deepest = 0;
  const cutPair = (): [number, number] | null => {
    const key = [...cut][0];
    return key === undefined ? null : [net.ids[Math.floor(key / EDGE)], net.ids[key % EDGE]];
  };
  const record = (): LevelLoad => {
    const ek: Record<string, number> = {};
    for (const [key, v] of edges) ek[`${net.ids[Math.floor(key / EDGE)]}>${net.ids[key % EDGE]}`] = round1(v);
    return { tps, peak: Array.from(peak.slice(1), round1), edges: ek, backlog: round1(deepest), down: inc.size ? [...down].map((i) => net.ids[i]) : [], cut: cutPair() };
  };
  const fail = (f: Omit<Failure, "level" | "tps">) => ({ load: record(), fail: f });

  for (t = 1; t <= SIM.window + SIM.drain; t++) {
    const on = t <= SIM.window;
    const hot = on && inc.size > 0 && t >= SIM.incFrom && t <= SIM.incTo;
    const ctx = hot ? stormCx : calmCx;
    const router = hot ? storm : calm;
    const shares = hot ? surged : base;
    if (on)
      for (let f = 0; f < p.flows.length; f++) {
        if (shares[f] <= 0 || router.ok(0, f, 0)) continue;
        const w = router.explain(0, f, 0);
        return fail({ t, why: "path", flow: f, node: net.ids[w.path[w.path.length - 1]], text: `Luồng “${p.flows[f].name}” không còn đường xử lý hoàn chỉnh — ${whyText(net, w)}` });
      }
    const acc = newAcc(net);
    propagate(net, p.flows, router, ctx, shares.map((s) => (on ? s * tps : 0)), acc);
    drainQueues(net, p.flows, ctx, acc, backlog);
    replicate(net, acc);
    for (let i = 1; i < n; i++) peak[i] = Math.max(peak[i], acc.load[i]);
    for (const [key, v] of acc.edge) edges.set(key, Math.max(edges.get(key) ?? 0, v));
    const queued = [...backlog.values()].reduce((s, b) => s + b.reduce((x, y) => x + y, 0), 0);
    deepest = Math.max(deepest, queued);

    let worst = -1;
    let ratio = 1;
    for (let i = 1; i < n; i++) {
      if (net.kind[i] === "worker") continue;
      const lim = net.spec[i]!.tps * ctx.mul(i);
      const x = acc.load[i] / lim;
      if (acc.load[i] > lim * (1 + 1e-9) && x > ratio) {
        ratio = x;
        worst = i;
      }
    }
    if (worst >= 0) {
      const lim = net.spec[worst]!.tps * ctx.mul(worst);
      const queue = net.kind[worst] === "queue";
      const slowed = ctx.mul(worst) < 1 ? " (đang bị giảm 40% TPS do sự cố)" : "";
      return fail({
        t,
        why: "overload",
        node: net.ids[worst],
        text: `${net.label[worst]} quá tải: ${queue ? "nhận" : "phải xử lý"} ${fmt(acc.load[worst])} / ${fmt(lim)} ${queue ? "tác vụ/giây" : "TPS"}${slowed}`,
      });
    }
    for (const [q, b] of backlog) {
      const left = b.reduce((x, y) => x + y, 0);
      const cap = net.spec[q]!.cap ?? 0;
      if (left > cap + EPS) return fail({ t, why: "backlog", node: net.ids[q], text: `${net.label[q]} vượt sức chứa: tồn ${fmt(left)} / ${fmt(cap)} tác vụ` });
    }
    if (!on && queued <= EPS) break;
  }
  for (const [q, b] of backlog) {
    const left = b.reduce((x, y) => x + y, 0);
    if (left > EPS) return fail({ t: SIM.window + SIM.drain, why: "drain", node: net.ids[q], text: `${net.label[q]} còn ${fmt(Math.max(1, left))} tác vụ chưa xử lý sau ${SIM.drain} giây hoàn tất` });
  }
  return { load: record() };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function simulate(p: Problem, d: Design, { stopAt = Infinity }: { stopAt?: number } = {}): SimResult {
  const step = levelStep(p);
  const report = inspect(p, d);
  const ids = [...d.nodes].sort((a, b) => a.id - b.id).map((n) => n.id);
  const base = { ids, step, cost: report.cost, levels: [] as LevelLoad[] };
  if (!report.ok) return { ...base, valid: false, errors: report.errors, maxTps: 0, capped: false };
  const net = compile(d);
  const calm = new Router(net, p.flows, calmCtx(net));
  let maxTps = 0;
  for (let level = 1; level <= SIM.maxLevels; level++) {
    const tps = step * level;
    const r = runLevel(net, p, tps, calm);
    base.levels.push(r.load);
    if (r.fail) return { ...base, valid: true, errors: [], maxTps, capped: false, fail: { ...r.fail, level, tps } };
    maxTps = tps;
    if (tps >= stopAt) break;
  }
  return { ...base, valid: true, errors: [], maxTps, capped: maxTps >= step * SIM.maxLevels };
}

// ---------------------------------------------------------------------------------------------------------------------
// Xếp hạng.

export type SxStatus = "pass" | "fail" | "invalid" | "out";
export type Entry = { uid: string; design: Design | null; out?: boolean; auto?: boolean };
export type Standing = { uid: string; status: SxStatus; tps: number; cost: number; traffic: boolean; budget: boolean; rank: number; auto: boolean; sim: SimResult | null };

const ORDER: Record<SxStatus, number> = { pass: 0, fail: 1, invalid: 2, out: 3 };

/** Chỉ thiết kế hợp lệ, vượt quality gate mới có hạng: TPS cao hơn đứng trên, bằng TPS thì rẻ hơn đứng trên. */
export function standings(p: Problem, entries: readonly Entry[]): Standing[] {
  const rows: Standing[] = entries.map((e) => {
    if (e.out || !e.design) return { uid: e.uid, status: "out", tps: 0, cost: e.design ? designCost(e.design) : 0, traffic: false, budget: false, rank: 0, auto: !!e.auto, sim: null };
    const sim = simulate(p, e.design);
    const traffic = sim.valid && sim.maxTps >= p.target;
    const budget = sim.cost <= p.budget;
    return { uid: e.uid, status: !sim.valid ? "invalid" : traffic && budget ? "pass" : "fail", tps: sim.maxTps, cost: sim.cost, traffic, budget, rank: 0, auto: !!e.auto, sim };
  });
  rows.sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.tps - a.tps || a.cost - b.cost || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  rows.forEach((r, n) => {
    if (r.status !== "pass") return;
    const prev = rows[n - 1];
    r.rank = prev && prev.status === "pass" && prev.tps === r.tps && prev.cost === r.cost ? prev.rank : n + 1;
  });
  return rows;
}

export const winnersOf = (rows: readonly Standing[]) => rows.filter((r) => r.rank === 1).map((r) => r.uid);

// ---------------------------------------------------------------------------------------------------------------------
// Đề mẫu, máy tự thiết kế tham khảo (để gợi ý budget) và tự sinh đề.

export type Preset = { key: string; title: string; desc: string; target: number; flows: Flow[] };

export const PRESETS: readonly Preset[] = [
  {
    key: "shortener",
    title: "Dịch vụ rút gọn link",
    desc: "Người dùng dán link dài để lấy link ngắn rồi chia sẻ khắp mạng xã hội. Mỗi lượt bấm link ngắn phải tra ra link gốc thật nhanh; link mới được tạo ít hơn nhiều so với lượt mở.",
    target: 1000,
    flows: [
      { kind: "read", name: "Mở link ngắn", pct: 85 },
      { kind: "write", name: "Tạo link ngắn", pct: 15 },
    ],
  },
  {
    key: "social",
    title: "Bảng tin mạng xã hội",
    desc: "Ứng dụng chia sẻ ảnh cho giới trẻ: lướt bảng tin, xem ảnh, đăng bài mới. Ảnh được xem nhiều hơn đăng rất nhiều.",
    target: 1500,
    flows: [
      { kind: "read", name: "Xem bảng tin", pct: 55 },
      { kind: "static", name: "Xem ảnh", pct: 30 },
      { kind: "write", name: "Đăng bài", pct: 10 },
      { kind: "upload", name: "Tải ảnh lên", pct: 5 },
    ],
  },
  {
    key: "flash-sale",
    title: "Flash sale 12.12",
    desc: "Sàn thương mại điện tử mở bán giờ vàng: lượt xem sản phẩm tăng vọt, đơn hàng phải ghi chính xác, thanh toán qua cổng bên ngoài và email xác nhận được gửi sau ở nền.",
    target: 1000,
    flows: [
      { kind: "read", name: "Xem sản phẩm", pct: 65 },
      { kind: "write", name: "Đặt hàng", pct: 15 },
      { kind: "call", name: "Thanh toán", pct: 10 },
      { kind: "job", name: "Gửi email xác nhận", pct: 10, sink: "external" },
    ],
  },
  {
    key: "wallet",
    title: "Ví điện tử",
    desc: "Mọi request phải qua API Gateway để xác thực. Người dùng xem số dư, chuyển tiền và nhận thông báo đẩy về điện thoại.",
    target: 800,
    flows: [
      { kind: "read", name: "Xem số dư", pct: 50, gate: true },
      { kind: "write", name: "Chuyển tiền", pct: 30, gate: true },
      { kind: "job", name: "Gửi thông báo", pct: 20, gate: true, sink: "external" },
    ],
  },
  {
    key: "short-video",
    title: "Nền tảng video ngắn",
    desc: "Video phát qua CDN, bình luận đọc từ database, video mới tải lên được nén ở nền rồi lưu lại vào kho.",
    target: 2000,
    flows: [
      { kind: "static", name: "Xem video", pct: 60, cdn: true },
      { kind: "read", name: "Đọc bình luận", pct: 25 },
      { kind: "upload", name: "Tải video lên", pct: 5 },
      { kind: "job", name: "Nén video", pct: 10, sink: "storage" },
    ],
  },
  {
    key: "cinema",
    title: "Đặt vé xem phim",
    desc: "Cuối tuần phim bom tấn ra rạp: khách xem lịch chiếu, giữ ghế và thanh toán qua ví điện tử.",
    target: 1000,
    flows: [
      { kind: "read", name: "Xem lịch chiếu", pct: 70 },
      { kind: "write", name: "Giữ ghế", pct: 20 },
      { kind: "call", name: "Thanh toán", pct: 10 },
    ],
  },
  {
    key: "news",
    title: "Báo điện tử",
    desc: "Tin nóng được chia sẻ liên tục: bài viết phải đọc qua cache, ảnh trong bài tải qua CDN hoặc kho ảnh, bạn đọc để lại bình luận.",
    target: 2000,
    flows: [
      { kind: "read", name: "Đọc bài viết", pct: 45, cache: true },
      { kind: "static", name: "Tải ảnh bài viết", pct: 50 },
      { kind: "write", name: "Bình luận", pct: 5 },
    ],
  },
  {
    key: "leaderboard",
    title: "Bảng xếp hạng game",
    desc: "Giải đấu online: hàng nghìn trận kết thúc mỗi giây, điểm được cập nhật ở nền, người chơi liên tục mở bảng xếp hạng.",
    target: 1000,
    flows: [
      { kind: "read", name: "Xem bảng xếp hạng", pct: 60 },
      { kind: "job", name: "Cập nhật điểm", pct: 40, sink: "db" },
    ],
  },
  {
    key: "ride",
    title: "Ứng dụng gọi xe",
    desc: "Giờ cao điểm trời mưa: khách tìm xe, đặt chuyến, thanh toán; tài xế nhận thông báo qua dịch vụ đẩy tin bên ngoài.",
    target: 1000,
    flows: [
      { kind: "read", name: "Tìm xe gần", pct: 50 },
      { kind: "write", name: "Đặt chuyến", pct: 20 },
      { kind: "call", name: "Thanh toán", pct: 10 },
      { kind: "job", name: "Báo tài xế", pct: 20, sink: "external" },
    ],
  },
  {
    key: "judge",
    title: "Chấm bài lập trình",
    desc: "Kỳ thi lập trình online: thí sinh tải đề, nộp bài và xem kết quả liên tục; bài nộp được chấm ở nền rồi lưu điểm.",
    target: 800,
    flows: [
      { kind: "static", name: "Tải đề", pct: 10 },
      { kind: "read", name: "Xem kết quả", pct: 60 },
      { kind: "job", name: "Chấm bài", pct: 30, sink: "db" },
    ],
  },
];

type Pool = [v: number, n: number];
type Plan = { front: "lb" | "gateway" | null; fv: number; app: Pool; cache: Pool; db: Pool; rep: Pool; queue: Pool; worker: Pool; storage: Pool; cdn: Pool; ext: Pool };

// Thiết kế tham khảo xếp theo cột từ trái sang phải: cửa vào, App, Cache / Queue, Database / Worker, phần đuôi.
const COLUMNS: readonly (readonly Kind[])[] = [["lb", "gateway", "cdn"], ["app"], ["cache", "queue"], ["db", "worker"], ["replica", "storage", "external"]];
const COLUMN_X = [168, 320, 472, 624, 776];

function build(p: Problem, plan: Plan): Design {
  const has = (k: FlowKind) => p.flows.some((f) => f.kind === k);
  const sinks = new Set(p.flows.flatMap((f) => (f.kind === "job" && f.sink ? [f.sink] : [])));
  const writes = has("write") || sinks.has("db");
  const reads = has("read");
  const d = emptyDesign();
  const add = (k: Kind, [v, n]: Pool) => {
    const list: number[] = [];
    for (let i = 0; i < n; i++) {
      const id = d.nodes.length + 1;
      d.nodes.push({ id, k, v, x: 0, y: 0 });
      list.push(id);
    }
    return list;
  };
  const link = (a: number[], b: number[]) => {
    for (const x of a) for (const y of b) if (!linkIssue(d, x, y)) d.edges.push([x, y]);
  };
  const front = plan.front ? add(plan.front, [plan.fv, 1]) : [];
  const cdn = add("cdn", plan.cdn);
  const apps = add("app", plan.app);
  const cache = add("cache", plan.cache);
  const queue = add("queue", plan.queue);
  const dbs = add("db", plan.db);
  const workers = add("worker", plan.worker);
  const reps = add("replica", plan.rep);
  const storage = add("storage", plan.storage);
  const ext = add("external", plan.ext);

  link([USERS_ID], front.length ? front : apps.slice(0, 1));
  link(front, apps);
  if (has("static")) {
    if (cdn.length) {
      link([USERS_ID], cdn);
      link(cdn, storage);
    } else link([USERS_ID], storage.slice(0, 1));
  }
  if (reads && cache.length) {
    link(apps, cache);
    link(cache, reps.length ? reps : dbs);
  } else if (reads && reps.length) link(apps, reps);
  if (writes || (reads && !cache.length && !reps.length)) link(apps, dbs);
  link(dbs, reps);
  link(apps, queue);
  link(queue, workers);
  for (const s of sinks) link(workers, s === "db" ? dbs : s === "storage" ? storage : ext);
  if (has("upload")) link(apps, storage);
  if (has("call")) link(apps, ext);

  COLUMNS.forEach((ks, c) => {
    const list = d.nodes.filter((n) => ks.includes(n.k));
    const gap = Math.min(16, Math.max(2, (CANVAS.h - list.length * NODE.h) / (list.length + 1)));
    const top = Math.max(4, (CANVAS.h - list.length * NODE.h - (list.length - 1) * gap) / 2);
    list.forEach((n, r) => {
      n.x = COLUMN_X[c];
      n.y = Math.min(CANVAS.h - NODE.h, Math.round(top + r * (NODE.h + gap)));
    });
  });
  return d;
}

const grow = (pool: Pool, cap = 8) => {
  if (pool[1] > 0 && pool[0] < 2) pool[0]++;
  else if (pool[1] < cap) pool[1]++;
  else return false;
  return true;
};

/** Máy tự dựng một thiết kế đạt traffic mục tiêu bằng cách nâng dần chỗ thất bại (không cố tối ưu chi phí). */
export function autoDesign(p: Problem): { design: Design; sim: SimResult } {
  const has = (k: FlowKind) => p.flows.some((f) => f.kind === k);
  const allowed = (k: Kind) => p.kinds.includes(k);
  const sinks = new Set(p.flows.flatMap((f) => (f.kind === "job" && f.sink ? [f.sink] : [])));
  const inc = new Set(p.incidents);
  const dynamic = p.flows.some((f) => f.kind !== "static");
  const reads = has("read");
  const spare = (k: Incident) => (inc.has(k) ? 2 : 1);
  const plan: Plan = {
    front: p.flows.some((f) => f.gate) ? "gateway" : null,
    fv: 0,
    app: [0, dynamic ? Math.max(spare("app-down"), spare("link-cut")) : 0],
    cache: [0, reads && allowed("cache") ? 1 : 0],
    db: [0, reads || has("write") || sinks.has("db") ? 1 : 0],
    rep: [1, 0],
    queue: [0, has("job") ? 1 : 0],
    worker: [0, has("job") ? spare("worker-down") : 0],
    storage: [0, has("static") || has("upload") || sinks.has("storage") ? 1 : 0],
    cdn: [0, has("static") && allowed("cdn") ? 1 : 0],
    ext: [0, has("call") || sinks.has("external") ? spare("ext-down") : 0],
  };
  const ensureFront = () => {
    if (plan.front || plan.app[1] <= 1) return true;
    plan.front = allowed("lb") ? "lb" : allowed("gateway") ? "gateway" : null;
    if (!plan.front) plan.app[1] = 1;
    return !!plan.front;
  };
  ensureFront();
  let design = build(p, plan);
  let sim = simulate(p, design, { stopAt: p.target });
  for (let it = 0; it < 150 && sim.valid && sim.maxTps < p.target && sim.fail; it++) {
    const f = sim.fail;
    const k = design.nodes.find((n) => n.id === f.node)?.k;
    let moved = false;
    if (f.why === "path") {
      const fk = f.flow !== undefined ? p.flows[f.flow].kind : undefined;
      if (inc.has("ext-down") && fk === "call") moved = grow(plan.ext);
      else if (plan.app[1] < 8) {
        plan.app[1]++;
        moved = ensureFront();
      }
    } else if (f.why === "drain") moved = grow(plan.worker);
    else if (f.why === "backlog") moved = grow(plan.worker) || grow(plan.queue, 1);
    else if (k === "queue") moved = grow(plan.queue, 1);
    else if (k === "lb" || k === "gateway") moved = plan.fv < 2 && !!++plan.fv;
    else if (k === "app") {
      moved = grow(plan.app);
      if (plan.app[1] > 1) moved = ensureFront() && moved;
    } else if (k === "db") {
      if (plan.db[0] < 2) moved = !!++plan.db[0];
      else if (reads && allowed("replica") && plan.rep[1] < 4) moved = !!++plan.rep[1];
      else moved = grow(plan.db, 4);
    } else if (k === "replica") moved = grow(plan.rep, 6);
    else if (k === "cache") moved = grow(plan.cache, 3);
    else if (k === "cdn") moved = grow(plan.cdn, 1);
    else if (k === "storage") moved = grow(plan.storage, plan.cdn[1] ? 6 : 1);
    else if (k === "external") moved = grow(plan.ext, 6);
    if (!moved) break;
    design = build(p, plan);
    sim = simulate(p, design, { stopAt: p.target });
  }
  return { design, sim };
}

export const budgetFor = (cost: number) => Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, Math.ceil((cost * 1.2) / 5) * 5));

/** Budget gợi ý: chi phí thiết kế tham khảo của máy cộng 20%; `null` nếu máy không dựng được thiết kế đạt mục tiêu. */
export function suggestBudget(p: Problem): number | null {
  const { sim } = autoDesign(p);
  return sim.valid && sim.maxTps >= p.target ? budgetFor(sim.cost) : null;
}

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Đề tự sinh: một đề mẫu, traffic mục tiêu nhân hệ số ngẫu nhiên, 0–2 sự cố hợp với các luồng, budget = gợi ý của máy. */
export function makeProblem(seed: number, presetKey?: string, time: DesignTime = 300): Problem {
  const rand = rng(seed);
  const preset = PRESETS.find((x) => x.key === presetKey) ?? PRESETS[Math.floor(rand() * PRESETS.length)];
  const flows = preset.flows.map((f) => ({ ...f }));
  const kinds = new Set(flows.map((f) => f.kind));
  const fits: Record<Incident, boolean> = {
    "app-down": kinds.size > 1 || !kinds.has("static"),
    "db-slow": kinds.has("read") || kinds.has("write"),
    "link-cut": kinds.size > 1 || !kinds.has("static"),
    "cache-flush": kinds.has("read"),
    "cache-drop": kinds.has("read") || kinds.has("static"),
    skew: true,
    "write-surge": kinds.has("write"),
    "worker-down": kinds.has("job"),
    "ext-down": flows.some((f) => f.kind === "call" || f.sink === "external"),
  };
  const pool = INCIDENT_KEYS.filter((k) => fits[k]);
  const roll = rand();
  const count = roll < 0.35 ? 0 : roll < 0.8 ? 1 : 2;
  const incidents: Incident[] = [];
  while (incidents.length < count && incidents.length < pool.length) {
    const k = pool[Math.floor(rand() * pool.length)];
    if (!incidents.includes(k)) incidents.push(k);
  }
  const factor = [0.5, 1, 1, 1.5, 2][Math.floor(rand() * 5)];
  let target = Math.max(TARGET_MIN, Math.round((preset.target * factor) / 100) * 100);
  const p = normProblem({ title: preset.title, desc: preset.desc, time, target, budget: 100, kinds: KINDS, flows, incidents });
  for (let tries = 0; tries < 4; tries++) {
    const { sim } = autoDesign(p);
    if (sim.valid && sim.maxTps >= p.target) return { ...p, budget: budgetFor(sim.cost) };
    target = Math.max(TARGET_MIN, Math.floor((sim.maxTps * 0.9) / 100) * 100);
    p.target = target;
  }
  return { ...p, budget: budgetFor(autoDesign(p).sim.cost) };
}
