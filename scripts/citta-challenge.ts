// Dựng bộ đề Tâm Đấu từ ba file markdown biên soạn (Nhập môn, Ứng dụng, Chuyên sâu) thành `lib/games/citta-challenge-<mode>.ts`
// và bảng kiến thức `lib/games/citta-challenge-glossary.ts`.
//   node scripts/citta-challenge.ts <Nhap-Mon.md> <Ung-Dung.md> <Chuyen-Sau.md>
// Kiểm tra luôn bảng chấm sáu tổ hợp: mọi đáp án phải nằm trong phương án, mọi đáp án cụ thể phải có bằng chứng đã mở.
// Chủ đề của đề suy từ nhóm tâm sở mà bộ Chuyên sâu xếp cho khái niệm đó (hồ sơ "Tâm C cần kiểm tra").
import { readFileSync, writeFileSync } from "node:fs";
import { CLUES, PARTNERS, SCENES } from "./citta-challenge-edits.ts";

const MODES = ["nm", "ud", "cs"] as const;
const VERDICTS = ["Hợp lý", "Thiếu bằng chứng/điều kiện", "Nhầm khái niệm/quy tắc", "Nhầm khoảnh khắc/đối tượng"];
// Thứ tự cột của bảng chấm: T1+T2, T1+T3, T1+T4, T2+T3, T2+T4, T3+T4.
const PAIRS = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];
const PUBLIC = "Câu chuyện công khai và quy tắc kiến thức";

type Item = { q: string; options: string[]; key: number[]; full: number; proof: number[]; why: string; ground: string; missing: string };
type De = {
  id: string;
  title: string;
  topic: string;
  topics: string[];
  story: string;
  cards: { label: string; text: string }[];
  items: Item[];
  claim: string;
  verdicts: number[];
  reason: string;
  note: string;
};

const clean = (s: string) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

function fail(id: string, msg: string): never {
  throw new Error(`${id}: ${msg}`);
}

function parseDe(block: string): De {
  const head = block.match(/^## ([A-Z]{2}-\d{3}) — (.+)$/m);
  if (!head) throw new Error(`Không đọc được tiêu đề: ${block.slice(0, 80)}`);
  const [, id, title] = head;
  const topic = clean(block.match(/^\*\*Chủ đề:\*\* (.+)$/m)?.[1] ?? fail(id, "thiếu chủ đề"));
  const story = clean(block.match(/\*\*Tình huống công khai\*\*\n\n([\s\S]+?)\n\n\*\*Bốn thẻ/)?.[1] ?? fail(id, "thiếu tình huống"));
  const cards = [...block.matchAll(/^- \*\*T(\d) — ([^:]+):\*\* (.+)$/gm)].map((x) => ({ n: Number(x[1]), label: clean(x[2]), text: clean(x[3]) }));
  if (cards.length !== 4 || cards.some((c, i) => c.n !== i + 1)) fail(id, "cần đúng bốn thẻ T1–T4");

  const asked = block.match(/\*\*Phần nhận diện\*\*\n\n([\s\S]+?)\n\n\*\*Nhận định cần kiểm tra\*\*/)?.[1] ?? fail(id, "thiếu phần nhận diện");
  const qs = [...asked.matchAll(/^\d\. \*\*M(\d): (.+?)\*\*\n {3}- (.+)$/gm)].map((x) => {
    // Phương án viết liền "A. …; B. …; C. …; D. …" — tách theo nhãn chữ cái để giữ dấu chấm phẩy bên trong.
    // Dòng kết thúc bằng dấu chấm của câu, không thuộc phương án cuối.
    const options = x[3].replace(/\.$/, "").split(/(?:^|; )[A-F]\. /).filter(Boolean).map(clean);
    return { q: clean(x[2]), options };
  });
  if (!qs.length) fail(id, "không có mục nhận diện");

  const claim = clean(block.match(/\*\*Nhận định cần kiểm tra\*\*\n\n> (.+)$/m)?.[1] ?? fail(id, "thiếu nhận định"));

  const table = block.match(/\| Hai thẻ \|.*\n\| ---.*\n((?:\|.*\n)+)/)?.[1] ?? fail(id, "thiếu bảng chấm");
  const rows = table
    .trim()
    .split("\n")
    .map((r) => r.split("|").slice(1, -1).map(clean));
  if (rows.length !== 6) fail(id, "bảng chấm cần sáu tổ hợp");
  rows.forEach((r, k) => {
    const want = `T${PAIRS[k][0] + 1} + T${PAIRS[k][1] + 1}`;
    if (r[0] !== want) fail(id, `dòng ${k + 1} là "${r[0]}", cần "${want}"`);
    if (r.length !== qs.length + 2) fail(id, `dòng ${want} sai số cột`);
  });
  const verdicts = rows.map((r) => {
    const v = VERDICTS.indexOf(r[r.length - 1]);
    if (v < 0) fail(id, `đánh giá lạ "${r[r.length - 1]}"`);
    return v;
  });

  const solved = [...block.matchAll(/^- \*\*M(\d) khi đủ dữ kiện:\*\* (.+)\n {2}- \*\*Bằng chứng hợp lệ:\*\* (.+)\n {2}- \*\*Khi chưa đủ:\*\* (.+)$/gm)];
  if (solved.length !== qs.length) fail(id, "thiếu lời giải từng mục");

  const items = qs.map(({ q, options }, i): Item => {
    const find = (text: string, where: string) => {
      // Vài phương án kết thúc bằng dấu chấm, lời giải có khi lặp hai dấu chấm.
      const k = options.findIndex((o) => o === text || o.replace(/\.$/, "") === text.replace(/\.+$/, ""));
      if (k < 0) fail(id, `M${i + 1} ${where}: "${text}" không có trong phương án`);
      return k;
    };
    const key = rows.map((r, k) => find(r[i + 1], `tổ hợp ${k + 1}`));
    const [, , fullRaw, proofRaw, missingRaw] = solved[i];
    const fullText = clean(fullRaw);
    const full = options.findIndex((o) => fullText.startsWith(o.replace(/\.$/, "")));
    if (full < 0) fail(id, `M${i + 1}: đáp án đủ dữ kiện không khớp phương án`);
    const why = clean(fullText.slice(options[full].replace(/\.$/, "").length).replace(/^\.+\s*/, ""));
    const proofText = clean(proofRaw);
    const proof = proofText.startsWith(PUBLIC)
      ? []
      : (proofText.match(/^((?:T\d(?:, | hoặc | và )?)+)\./)?.[1] ?? fail(id, `M${i + 1}: bằng chứng lạ "${proofText}"`)).match(/T\d/g)!.map((t) => Number(t[1]) - 1);
    const ground = clean(proofText.replace(/^[^.]+\.\s*/, ""));
    return { q, options, key, full, proof, why, ground, missing: clean(missingRaw) };
  });

  const reason = clean(block.match(/^\*\*Lý do kiểm tra nhận định:\*\* (.+)$/m)?.[1] ?? fail(id, "thiếu lý do nhận định"));
  const note = clean(block.match(/^\*\*Lưu ý phân biệt:\*\* (.+)$/m)?.[1] ?? "");
  return { id, title: clean(title), topic, topics: [], story, cards: cards.map(({ label, text }) => ({ label, text })), items, claim, verdicts, reason, note };
}

const NONE = "Chưa đủ dữ kiện";

// Đáp án cụ thể mà hai thẻ đã mở không chứa bằng chứng nào → chấm bằng chứng sẽ không có lựa chọn đúng.
function audit(de: De) {
  const issues: string[] = [];
  de.items.forEach((it, i) => {
    if (it.options[it.options.length - 1] !== NONE) issues.push(`M${i + 1}: phương án cuối không phải "${NONE}"`);
    it.key.forEach((k, c) => {
      const none = it.options[k] === NONE;
      if (none || !it.proof.length) return;
      if (!PAIRS[c].some((t) => it.proof.includes(t))) issues.push(`M${i + 1} T${PAIRS[c][0] + 1}+T${PAIRS[c][1] + 1}: đáp án cụ thể nhưng chưa mở thẻ bằng chứng`);
    });
  });
  return issues;
}

const files = process.argv.slice(2);
if (files.length !== 3) {
  console.error("Cách dùng: node scripts/citta-challenge.ts <Nhap-Mon.md> <Ung-Dung.md> <Chuyen-Sau.md>");
  process.exit(1);
}

const banks = files.map((file) => {
  const md = readFileSync(file, "utf8");
  const blocks = md.split(/\n---\n/).filter((b) => /^## [A-Z]{2}-\d{3} — /m.test(b));
  return blocks.map((b) => parseDe(b.slice(b.search(/^## [A-Z]{2}-\d{3} — /m))));
});
const [nm, ud, cs] = banks;

const answerOf = (it: Item) => it.options[it.full];
const pali = (term: string) => term.split(" — ")[1]?.trim() ?? term;
const profiles = cs.filter((d) => d.cards.some((c) => c.label === "Tâm C cần kiểm tra"));
// Tên Pāli khác giữa hai bộ (tuệ ở Nhập môn ↔ tuệ quyền ở Chuyên sâu).
const ALIAS: Record<string, string> = { paññā: "paññindriya" };
const profileOf = (term: string) => {
  const key = ALIAS[pali(term)] ?? pali(term);
  return profiles.find((d) => pali(d.topic) === key);
};
const GROUP_TOPIC: [RegExp, string][] = [
  [/^Biến hành|^Biệt cảnh/, "tt"],
  [/^Bất thiện/, "bt"],
  [/^Tịnh hảo|^Vô lượng|^Tiết chế|^Tuệ quyền/, "th"],
];
function topicOf(id: string, term: string) {
  const p = profileOf(term);
  const group = p ? answerOf(p.items[0]) : "";
  const hit = GROUP_TOPIC.find(([re]) => re.test(group));
  if (!hit) fail(id, `không xếp được chủ đề cho "${term}"`);
  return hit[1];
}
// Biên tập thẻ dữ kiện và phương án nhiễu theo scripts/citta-challenge-edits.ts. Chỉ đổi lời văn: thẻ nào là bằng chứng vẫn
// giữ nguyên nên bảng chấm không đổi.
const named = (tpl: string, name: string) => {
  const s = tpl.replaceAll("{name}", name);
  return s[0].toUpperCase() + s.slice(1);
};
const conceptOfDef = new Map(nm.map((d) => [d.items[0].why.replace(/\.$/, ""), answerOf(d.items[0])]));
const nth = new Map<string, number>();
// Lời văn cũ của thẻ nội dung đã viết lại → mã đề Nhập môn, để thay cả bản chép ở Ứng dụng.
const rewritten = new Map<string, string>();
for (const d of nm) {
  const it = d.items[0];
  const concept = answerOf(it);
  const clues = CLUES[concept] ?? fail(d.id, `thiếu dấu hiệu cho "${concept}"`);
  const k = nth.get(concept) ?? 0;
  nth.set(concept, k + 1);
  const name = d.story.split(" ")[0];
  let atB = "";
  for (const c of d.cards) {
    if (c.label === "Làm rõ ở A") c.text = named(clues[k % clues.length], name);
    else if (c.label === "Mốc B — không phải A") {
      const def = c.text.match(/Khía cạnh được mô tả ở B là: (.+)$/)?.[1].replace(/\.$/, "") ?? fail(d.id, "không đọc được thẻ mốc B");
      atB = conceptOfDef.get(def) ?? fail(d.id, `không nhận ra khái niệm ở mốc B: "${def}"`);
      c.text = `Sau A có một mốc B khác. Ở B: ${named(CLUES[atB][(k + 2) % CLUES[atB].length], name)}`;
    } else if (c.label === "Nội dung ở A" && SCENES[d.id]) {
      const text = named(SCENES[d.id], name);
      rewritten.set(c.text, d.id);
      for (const x of d.items) if (x.ground === c.text) x.ground = text;
      c.text = text;
    }
  }
  // Phương án nhiễu không phải khái niệm ở mốc B (và không xuất hiện trong khoá chấm) đổi thành khái niệm dễ nhầm.
  const partners = PARTNERS[concept] ?? fail(d.id, `thiếu khái niệm dễ nhầm cho "${concept}"`);
  if (it.options.includes(partners[0])) continue;
  const locked = new Set([it.full, it.options.length - 1, ...it.key]);
  const slot = it.options.findIndex((o, i) => !locked.has(i) && o !== atB);
  const partner = partners.find((p) => !it.options.includes(p));
  if (slot >= 0 && partner) it.options[slot] = partner;
}
for (const d of ud) {
  const two = /hai nhân vật độc lập/.test(d.story);
  for (const c of d.cards) {
    const at = c.label.match(/^Nội dung mục tiêu ([AB])$/)?.[1];
    const id = at && rewritten.get(c.text);
    if (!id) continue;
    const text = named(SCENES[id], two ? (at === "A" ? "P" : "Q") : "nhân vật");
    for (const it of d.items) if (it.ground === c.text) it.ground = text;
    c.text = text;
  }
}
// Còn thẻ nào chép nguyên định nghĩa đáp án thì báo để biên tập tiếp.
for (const d of [...nm, ...ud])
  for (const it of d.items) {
    const def = it.why.replace(/\.$/, "");
    if (def.length > 20 && d.cards.some((c) => c.text.includes(def))) console.warn(`⚠️  ${d.id}: thẻ dữ kiện vẫn chép định nghĩa “${def}”`);
  }

for (const d of nm) d.topics = [topicOf(d.id, answerOf(d.items[0]))];
for (const d of ud) d.topics = [...new Set(d.items.map((it) => topicOf(d.id, answerOf(it))))];
for (const d of cs) {
  const labels = d.cards.map((c) => c.label);
  d.topics = labels.includes("Tâm C cần kiểm tra") ? [topicOf(d.id, d.topic)] : labels.includes("Cảm thọ C") ? ["pl"] : ["qt"];
}

banks.forEach((list, m) => {
  let bad = 0;
  for (const de of list) {
    const issues = audit(de);
    if (issues.length) {
      bad++;
      console.warn(`⚠️  ${de.id}: ${issues.join("; ")}`);
    }
  }
  const out = `lib/games/citta-challenge-${MODES[m]}.ts`;
  writeFileSync(out, `// Sinh bởi scripts/citta-challenge.ts từ bộ đề biên soạn — đừng sửa tay.\nimport type { De } from "./citta-challenge.ts";\n\nexport const DE: De[] = ${JSON.stringify(list)};\n`);
  console.log(`${out}: ${list.length} đề${bad ? `, ${bad} đề có cảnh báo` : ""}`);
});

// Bảng kiến thức: mỗi tâm sở có hồ sơ ở Chuyên sâu (nhóm + đặc tính), kèm cách hiểu phổ thông từ Nhập môn nếu có.
const plain = new Map(nm.map((d) => [ALIAS[pali(answerOf(d.items[0]))] ?? pali(answerOf(d.items[0])), d.items[0].why]));
// Lưu ý chung của cả nhóm (lặp ở nhiều hồ sơ) không giúp phân biệt khái niệm nên bỏ.
const noteCount = new Map<string, number>();
for (const d of profiles) noteCount.set(d.note, (noteCount.get(d.note) ?? 0) + 1);
const glossary = profiles.map((d) => ({
  term: d.topic,
  topic: d.topics[0],
  group: answerOf(d.items[0]),
  trait: answerOf(d.items[1]),
  ...(plain.has(pali(d.topic)) ? { plain: plain.get(pali(d.topic)) } : {}),
  note: noteCount.get(d.note)! > 2 ? "" : d.note,
}));
writeFileSync(
  "lib/games/citta-challenge-glossary.ts",
  `// Sinh bởi scripts/citta-challenge.ts từ bộ đề biên soạn — đừng sửa tay.\nimport type { Term } from "./citta-challenge.ts";\n\nexport const GLOSSARY: Term[] = ${JSON.stringify(glossary, null, 1)};\n`,
);
console.log(`lib/games/citta-challenge-glossary.ts: ${glossary.length} khái niệm, ${plain.size} có cách hiểu phổ thông`);
