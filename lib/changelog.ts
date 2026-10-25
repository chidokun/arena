// Nhật ký thay đổi (CHANGELOG.md) — mỗi ngày đúng một mục, phiên bản `yyyy.MM.dd.N`. Ngày đó phát hành thêm thì ghi điểm
// mới lên đầu mục và tăng N (`npm run changelog -- "…"` làm hộ). Build đọc file, chỉ gửi mục mới nhất xuống trình duyệt.

export type ChangelogEntry = {
  version: string;
  // yyyy-MM-dd, tách sẵn từ phiên bản.
  date: string;
  build: number;
  // Điểm mới nhất đứng đầu.
  notes: string[];
};

type Parsed = ChangelogEntry & { line: number };

export const CHANGELOG_FILE = "CHANGELOG.md";

const HEADING = /^##\s+(\d{4})\.(\d{2})\.(\d{2})\.([1-9]\d*)\s*$/;
const NOTE = /^[-*]\s+(\S.*)$/;
const VERSION = /^(\d{4})\.(\d{2})\.(\d{2})\.([1-9]\d*)$/;

const realDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

export function parseVersion(v: string): [number, number, number, number] | null {
  const m = VERSION.exec(v);
  if (!m) return null;
  const [y, mo, d, b] = m.slice(1).map(Number);
  return realDate(y, mo, d) ? [y, mo, d, b] : null;
}

// So từng số chứ không so chuỗi: chuỗi thì `.10` lại nhỏ hơn `.9`.
export function compareVersion(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) throw new Error(`Phiên bản không hợp lệ: ${pa ? b : a}`);
  for (let i = 0; i < 4; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

// Ném lỗi kèm số dòng để build dừng thay vì phát thông báo sai. Chữ trước mục đầu tiên (tiêu đề, hướng dẫn) bỏ qua.
function parseLines(text: string): Parsed[] {
  const entries: Parsed[] = [];
  const lines = text.split(/\r?\n/);
  const bad = (i: number, why: string) => new Error(`${CHANGELOG_FILE}:${i + 1}: ${why}`);
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      const m = HEADING.exec(line);
      if (!m) throw bad(i, `tiêu đề phải có dạng "## yyyy.MM.dd.N" (N từ 1), gặp "${line}"`);
      const [y, mo, d, b] = m.slice(1).map(Number);
      if (!realDate(y, mo, d)) throw bad(i, `ngày ${m[1]}-${m[2]}-${m[3]} không có thật`);
      entries.push({ version: line.slice(3).trim(), date: `${m[1]}-${m[2]}-${m[3]}`, build: b, notes: [], line: i });
      return;
    }
    const cur = entries.at(-1);
    if (!cur || !line.trim()) return;
    const note = NOTE.exec(line.trim());
    if (!note) throw bad(i, `trong một mục chỉ được ghi gạch đầu dòng "- …", gặp "${line.trim()}"`);
    cur.notes.push(note[1].trim());
  });

  entries.forEach((e, i) => {
    if (!e.notes.length) throw bad(e.line, `mục ${e.version} chưa có điểm nào`);
    const prev = entries[i - 1];
    if (prev?.date === e.date) throw bad(e.line, `ngày ${e.date} đã có mục ${prev.version} — mỗi ngày chỉ một mục, ghi thêm vào đó và tăng N`);
    if (prev && prev.date < e.date) throw bad(e.line, `mục ${e.version} phải nằm dưới mục cũ hơn ${prev.version} — mục mới nhất đặt trên cùng`);
  });
  return entries;
}

export function parseChangelog(text: string): ChangelogEntry[] {
  return parseLines(text).map(({ version, date, build, notes }) => ({ version, date, build, notes }));
}

// Các mục đã xếp giảm dần nên mục đầu là mới nhất.
export const latestEntry = (entries: ChangelogEntry[]): ChangelogEntry | null => entries[0] ?? null;

// Ngày phát hành tính theo giờ Việt Nam, không theo giờ máy chạy lệnh.
export function todayVN(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Ghi một điểm mới cho ngày `today` (yyyy-MM-dd): đã có mục hôm nay thì chèn lên đầu mục và tăng N, chưa có thì mở mục `.1`.
export function addNote(text: string, today: string, note: string): { text: string; version: string } {
  const clean = note.replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("Nội dung điểm mới đang trống");
  const entries = parseLines(text);
  const lines = text.split(/\r?\n/);
  const top = entries[0];
  const day = today.replaceAll("-", ".");
  if (top && top.date > today) throw new Error(`Mục trên cùng ${top.version} mới hơn hôm nay (${today}) — kiểm tra lại ngày`);
  if (top?.date === today) {
    const version = `${day}.${top.build + 1}`;
    lines.splice(top.line, 1, `## ${version}`, `- ${clean}`);
    return { text: lines.join("\n"), version };
  }
  const version = `${day}.1`;
  const block = [`## ${version}`, `- ${clean}`, ""];
  if (top) lines.splice(top.line, 0, ...block);
  else {
    while (lines.length && !lines.at(-1)!.trim()) lines.pop();
    lines.push(...(lines.length ? [""] : []), ...block);
  }
  return { text: lines.join("\n"), version };
}
