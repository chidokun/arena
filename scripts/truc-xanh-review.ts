// Dựng trang duyệt bộ tranh Trúc Xanh (review/truc-xanh-de.html, review/truc-xanh-kho.html) từ dữ liệu trong lib/games.
// Chạy lại mỗi khi sửa bộ tranh: node scripts/truc-xanh-review.ts
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ABSTRACT } from "../lib/games/truc-xanh-abstract.ts";
import { PICTURES, type Picture } from "../lib/games/truc-xanh-words.ts";

// Mỗi từ khoá nên có chừng này ảnh để mỗi ván bốc ngẫu nhiên một ảnh.
const WANT = 3;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function card(p: Picture, i: number) {
  const search = [p.w, ...(p.alt ?? []), p.hint ?? ""].join(" ").toLowerCase();
  const alt = p.alt?.length ? `<div class="alt">Cũng đúng: ${esc(p.alt.join(", "))}</div>` : "";
  const hint = p.hint ? `<div class="hint">💡 ${esc(p.hint)}</div>` : "";
  const warn = p.imgs.length < WANT ? `<div class="warn">⚠ Mới có ${p.imgs.length}/${WANT} ảnh</div>` : "";
  const pics = p.imgs
    .map(
      (u, k) =>
        `<figure><a class="pic" href="${esc(u)}" target="_blank" rel="noopener"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(u)}" alt="${esc(p.w)} ${k + 1}"></a><figcaption class="meta">${k + 1}</figcaption></figure>`,
    )
    .join("");
  return `<article class="card" data-s="${esc(search)}">
  <div class="head"><span class="no">#${i + 1}</span><h2>${esc(p.w)}</h2></div>
  ${alt}${hint}${warn}
  <div class="pics">${pics}</div>
</article>`;
}

function page(title: string, set: readonly Picture[]) {
  const imgs = set.reduce((n, p) => n + p.imgs.length, 0);
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trúc Xanh — bộ đề ${title}</title>
<style>
  :root { --bg:#f6f7f5; --card:#fff; --fg:#1d2420; --muted:#6b746f; --line:#e2e6e3; --accent:#1f7a4d; --hint:#fff6dc; --bad:#c0392b; }
  @media (prefers-color-scheme: dark) { :root { --bg:#121614; --card:#1b201d; --fg:#e7ece9; --muted:#9aa49f; --line:#2b322e; --accent:#4fc187; --hint:#3a3220; --bad:#ff6b5b; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { position:sticky; top:0; z-index:1; background:var(--bg); border-bottom:1px solid var(--line); padding:12px 16px; display:flex; flex-wrap:wrap; gap:8px 16px; align-items:center; }
  header h1 { font-size:18px; margin:0; }
  header .stat { color:var(--muted); font-size:13px; }
  header input { flex:1; min-width:180px; padding:7px 10px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--fg); font:inherit; }
  header label { font-size:13px; color:var(--muted); display:flex; gap:4px; align-items:center; }
  main { padding:16px; display:grid; gap:16px; grid-template-columns:repeat(auto-fill, minmax(min(100%, 520px), 1fr)); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:6px; }
  .card.broken { border-color:var(--bad); }
  .head { display:flex; gap:8px; align-items:baseline; }
  .no { font-weight:700; color:var(--accent); font-variant-numeric:tabular-nums; }
  h2 { font-size:17px; margin:0; }
  .alt { font-size:13px; color:var(--muted); }
  .hint { background:var(--hint); border-radius:8px; padding:6px 8px; font-size:14px; }
  .warn { color:var(--bad); font-weight:600; }
  .pics { display:grid; grid-template-columns:repeat(${WANT}, 1fr); gap:6px; margin-top:auto; }
  figure { margin:0; min-width:0; }
  .pic { display:block; aspect-ratio:4/3; background:var(--line); border-radius:8px; overflow:hidden; }
  .pic img { width:100%; height:100%; object-fit:cover; display:block; }
  .meta { font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums; min-height:1em; overflow-wrap:anywhere; }
  .meta.bad { color:var(--bad); font-weight:600; }
  .hidden { display:none; }
</style>
</head>
<body>
<header>
  <h1>Trúc Xanh — bộ đề ${title}</h1>
  <span class="stat" id="stat">${set.length} tranh · ${imgs} ảnh</span>
  <input id="q" type="search" placeholder="Lọc theo từ khoá…">
  <label><input id="onlyBad" type="checkbox"> Chỉ tranh có vấn đề</label>
</header>
<main id="list">
${set.map(card).join("\n")}
</main>
<script>
  const cards = [...document.querySelectorAll(".card")];
  const stat = document.getElementById("stat");
  let bad = 0;
  const flag = (card, meta, msg) => { card.classList.add("broken"); card.dataset.bad = "1"; meta.textContent = msg; meta.classList.add("bad"); };
  for (const card of cards) {
    if (card.querySelector(".warn")) card.dataset.bad = "1";
    for (const fig of card.querySelectorAll("figure")) {
      const img = fig.querySelector("img");
      const meta = fig.querySelector(".meta");
      const no = meta.textContent;
      const check = () => {
        const { naturalWidth: w, naturalHeight: h } = img;
        const r = w / h;
        meta.textContent = no + " · " + w + "×" + h + " · " + r.toFixed(2);
        if (r < 1.25 || r > 1.9) flag(card, meta, meta.textContent + " — ngoài 1,25–1,9");
      };
      if (img.complete && img.naturalWidth) check(); else img.addEventListener("load", check);
      img.addEventListener("error", () => { bad++; flag(card, meta, no + " · ⚠ Không tải được"); update(); });
    }
  }
  const q = document.getElementById("q"), onlyBad = document.getElementById("onlyBad");
  function update() {
    const s = q.value.trim().toLowerCase();
    let shown = 0;
    for (const c of cards) {
      const hide = (s && !c.dataset.s.includes(s)) || (onlyBad.checked && !c.dataset.bad);
      c.classList.toggle("hidden", hide);
      if (!hide) shown++;
    }
    stat.textContent = shown + " / " + cards.length + " tranh · ${imgs} ảnh" + (bad ? " · " + bad + " ảnh lỗi" : "");
  }
  q.addEventListener("input", update);
  onlyBad.addEventListener("change", update);
</script>
</body>
</html>
`;
}

writeFileSync(join(root, "review/truc-xanh-de.html"), page("Dễ", PICTURES));
writeFileSync(join(root, "review/truc-xanh-kho.html"), page("Khó", ABSTRACT));
console.log(`review/truc-xanh-de.html: ${PICTURES.length} tranh · review/truc-xanh-kho.html: ${ABSTRACT.length} tranh`);
