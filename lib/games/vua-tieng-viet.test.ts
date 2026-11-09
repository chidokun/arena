import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BANK,
  clueMatch,
  CROWN,
  crownKinds,
  DEFAULT_OPTIONS,
  findPath,
  firstOfRound,
  gridFinds,
  itemOf,
  letterOrder,
  lettersOf,
  makePlan,
  mark,
  maxScore,
  normOptions,
  normSub,
  optionOrder,
  orderAnswers,
  PACKS,
  placeOf,
  rng,
  roundOf,
  scrambleAnswers,
  scrambleTiers,
  standings,
  TB,
  tieSurvivors,
  tokenOrder,
  tokensOf,
  totalOf,
  validPath,
  type Item,
  type Rounds,
} from "./vua-tieng-viet.ts";

const item = (id: string) => {
  const x = itemOf(id);
  assert.ok(x, id);
  return x as Item;
};

test("ngân hàng: mã không trùng, đủ câu cho gói Dài", () => {
  const all = Object.values(BANK).flat();
  assert.equal(new Set(all.map((x) => x.id)).size, all.length);
  assert.ok(BANK.r0.length >= 60);
  assert.ok(BANK.r1.length >= 10 + 3 + 40);
  assert.ok(BANK.r2.length >= 30);
  assert.ok(BANK.r3.length >= 30);
  assert.ok(BANK.r4a.length >= 15);
  assert.ok(BANK.r4b.length >= 10);
  for (const x of all) assert.equal(JSON.stringify(x), JSON.stringify(x).normalize("NFC"), `${x.id}: chưa dựng sẵn dấu (NFC)`);
});

test("ngân hàng ghép từ: đủ câu mỗi cấp, đáp án phụ cùng bộ chữ, thẻ bày không đọc sẵn ra đáp án", () => {
  for (const lv of [1, 2, 3, 4]) assert.ok(BANK.r0.filter((x) => x.lv === lv).length >= 10, `cấp ${lv} thiếu câu`);
  for (const w of BANK.r0) {
    const letters = lettersOf(w.a);
    assert.ok(letters.length >= 4, w.id);
    assert.ok(w.why.trim(), w.id);
    const bag = (s: string) => lettersOf(s).sort().join("");
    for (const a of w.acc ?? []) assert.equal(bag(a), bag(w.a), `${w.id}: đáp án phụ “${a}” khác bộ chữ`);
    assert.equal(new Set(scrambleAnswers(w)).size, scrambleAnswers(w).length, `${w.id}: đáp án trùng`);
    for (const seed of [1, 2, 3, 99, 12345]) {
      const ord = letterOrder(seed, w);
      assert.deepEqual([...ord].sort((a, b) => a - b), letters.map((_, i) => i), w.id);
      assert.ok(!scrambleAnswers(w).includes(ord.map((i) => letters[i]).join("")), `${w.id}: bày sẵn đúng đáp án`);
    }
  }
  const all = Object.values(BANK).flat();
  const answers = new Set(BANK.r2.flatMap((c) => [c.a, ...(c.acc ?? [])].map((x) => x.toLowerCase())));
  for (const w of BANK.r0) for (const a of [w.a, ...(w.acc ?? [])]) assert.ok(!answers.has(a.toLowerCase()), `${w.id}: “${a}” trùng đáp án vòng Giải nghĩa`);
  assert.ok(all.length > BANK.r0.length);
});

test("ngân hàng trắc nghiệm: 4 phương án khác nhau", () => {
  for (const q of BANK.r1) {
    assert.equal(q.o.length, 4, q.id);
    assert.equal(new Set(q.o.map((s) => s.toLowerCase())).size, 4, q.id);
    assert.ok(q.q.trim() && q.why.trim(), q.id);
  }
});

test("ngân hàng giải nghĩa: 3 gợi ý, gợi ý không chứa sẵn đáp án ở mức 1", () => {
  for (const c of BANK.r2) {
    assert.equal(c.h.length, 3, c.id);
    assert.ok(clueMatch(c, c.a), c.id);
    assert.ok(!c.h[0].toLowerCase().includes(c.a), `${c.id}: gợi ý 1 lộ đáp án`);
  }
});

test("ngân hàng xâu chuỗi: đáp án phụ dùng đúng bộ thẻ, thứ tự bày không trùng đáp án", () => {
  for (const o of [...BANK.r3, ...BANK.r4a]) {
    const tokens = tokensOf(o);
    assert.ok(tokens.length >= 4, o.id);
    const bag = (s: string) => s.split(" ").sort().join("|");
    for (const a of orderAnswers(o)) assert.equal(bag(a), bag(orderAnswers(o)[0]), `${o.id}: đáp án phụ khác bộ thẻ`);
    for (const seed of [1, 2, 3, 99, 12345]) {
      const ord = tokenOrder(seed, o);
      assert.deepEqual([...ord].sort((a, b) => a - b), tokens.map((_, i) => i), o.id);
      assert.ok(!orderAnswers(o).includes(ord.map((i) => tokens[i]).join(" ").toLowerCase()), `${o.id}: bày sẵn đúng đáp án`);
    }
  }
});

test("ngân hàng lưới: 16 ô, ít nhất 5 đáp án, đáp án nào cũng nối được", () => {
  for (const g of BANK.r4b) {
    assert.equal(g.cells.length, 16, g.id);
    assert.ok(g.words.length >= 5, g.id);
    for (const w of g.words) {
      const p = findPath(g, w);
      assert.ok(p && validPath(p), `${g.id}: không nối được “${w}”`);
    }
  }
});

test("chuẩn hoá tuỳ chọn: gói cố định bỏ qua số câu tự nhập, tuỳ chỉnh bị chặn trong khoảng", () => {
  assert.deepEqual(normOptions(undefined), DEFAULT_OPTIONS);
  assert.deepEqual(normOptions({ pack: "quick", counts: [9, 9, 9, 9, 9] }).counts, PACKS.quick.counts);
  assert.deepEqual(normOptions({ pack: "custom", counts: [0, 99, "3", null, 9] }).counts, [1, 12, 3, 3, 4]);
  // Cấu hình tuỳ chỉnh cũ (4 vòng) thêm số câu Ghép từ mặc định vào đầu.
  assert.deepEqual(normOptions({ pack: "custom", counts: [2, 3, 4, 1] }).counts, [6, 2, 3, 4, 1]);
  assert.equal(normOptions({ level: "x", topic: "y" }).level, "mixed");
  assert.equal(normOptions({ explain: false }).explain, false);
});

test("điểm tối đa gói Tiêu chuẩn là 3.950", () => {
  assert.equal(maxScore(PACKS.standard.counts), 3950);
  assert.deepEqual(crownKinds(1), ["b"]);
  assert.deepEqual(crownKinds(3), ["a", "b", "a"]);
});

test("vị trí câu trong ván", () => {
  const c = PACKS.standard.counts;
  assert.equal(totalOf(c), 21);
  assert.equal(roundOf(c, 0), 0);
  assert.equal(roundOf(c, 5), 0);
  assert.equal(roundOf(c, 6), 1);
  assert.equal(roundOf(c, 12), 2);
  assert.equal(roundOf(c, 19), CROWN);
  assert.equal(roundOf(c, 21), TB);
  assert.deepEqual(placeOf(c, 7), { r: 1, k: 1, n: 6 });
  assert.ok([0, 6, 12, 16, 19, 21].every((i) => firstOfRound(c, i)));
  assert.ok(!firstOfRound(c, 1) && !firstOfRound(c, 22));
});

test("lập đề: đủ số câu, đúng loại từng vòng, không trùng, không hai câu cùng nhóm", () => {
  for (const pack of ["quick", "standard", "long"] as const)
    for (let s = 1; s <= 30; s++) {
      const o = normOptions({ pack, topic: (["all", "spell", "vocab", "idiom", "lit"] as const)[s % 5], level: (["easy", "medium", "hard", "mixed"] as const)[s % 4] });
      const { qs, tbq } = makePlan(o, [], rng(s));
      assert.equal(qs.length, totalOf(o.counts));
      assert.equal(tbq.length, 3);
      const all = [...qs, ...tbq];
      assert.equal(new Set(all).size, all.length);
      const fams = all.map((id) => itemOf(id)!.fam).filter(Boolean);
      assert.equal(new Set(fams).size, fams.length, `nhóm trùng: ${fams}`);
      qs.forEach((id, i) => {
        const r = roundOf(o.counts, i);
        const k = item(id).kind;
        assert.equal(k, r === 0 ? "scramble" : r === 1 ? "mc" : r === 2 ? "clue" : r === 3 ? "order" : k === "grid" ? "grid" : "order");
        if (r === CROWN) assert.ok(id.startsWith("R4"));
      });
      // Ghép từ đúng cấp độ từng câu, tăng dần.
      const lvs = qs.slice(0, o.counts[0]).map((id) => item(id).lv);
      assert.deepEqual(lvs, scrambleTiers(o.counts[0], o.level));
      for (const id of tbq) assert.equal(item(id).kind, "mc");
    }
});

test("lập đề: ưu tiên chủ đề và câu chưa chơi", () => {
  const o = normOptions({ pack: "standard", topic: "lit" });
  const { qs } = makePlan(o, [], rng(7));
  for (const id of qs.slice(6, 12)) assert.equal(item(id).tp, "lit");
  const used = BANK.r1.filter((q) => q.tp === "lit").slice(0, 25).map((q) => q.id);
  const next = makePlan(o, used, rng(8)).qs.slice(6, 12);
  for (const id of next) assert.ok(!used.includes(id), `${id} đã chơi mà vẫn được chọn`);
});

test("điểm Phản xạ: 100 + thưởng tốc độ, sai / hết giờ 0", () => {
  const q = item(BANK.r1[0].id);
  assert.deepEqual(mark(q, 1, { a: 0, t: 0 }), { ok: true, t: 0, hits: 1, pts: 150 });
  assert.equal(mark(q, 1, { a: 0, t: 7200 }).pts, 120);
  assert.equal(mark(q, 1, { a: 0, t: 12000 }).pts, 100);
  assert.equal(mark(q, 1, { a: 2, t: 100 }).pts, 0);
  assert.equal(mark(q, 1, { t: 12000 }).pts, 0);
  assert.equal(mark(q, 1, undefined).pts, 0);
  // Câu hỏi phụ không cộng điểm.
  assert.equal(mark(q, TB, { a: 0, t: 100 }).pts, 0);
  assert.ok(mark(q, TB, { a: 0, t: 100 }).ok);
});

test("điểm Giải nghĩa theo mốc gợi ý; so khớp có dấu, không phân biệt hoa thường", () => {
  const c = item("R2-001");
  assert.equal(mark(c, 2, { a: "Đoàn Kết", t: 6999 }).pts, 150);
  assert.equal(mark(c, 2, { a: "  đoàn   kết. ", t: 7000 }).pts, 110);
  assert.equal(mark(c, 2, { a: "đoàn kết", t: 14000 }).pts, 70);
  assert.equal(mark(c, 2, { a: "doan ket", t: 100 }).pts, 0);
  assert.equal(mark(c, 2, { a: "đoàn kết".normalize("NFD"), t: 100 }).pts, 150);
  const k = item("R2-002");
  assert.ok(mark(k, 2, { a: "nhẫn nại", t: 100 }).ok);
});

test("điểm Xâu chuỗi và Giải mã câu khó; đáp án phụ được chấp nhận", () => {
  const o = item("R3-001");
  if (o.kind !== "order") throw 0;
  const right = tokensOf(o).map((_, i) => i);
  assert.equal(mark(o, 3, { a: right, t: 0 }).pts, 250);
  assert.equal(mark(o, 3, { a: right, t: 12500 }).pts, 225);
  assert.equal(mark(o, 3, { a: [...right].reverse(), t: 0 }).pts, 0);
  assert.equal(mark(o, 3, { a: right.slice(1), t: 0 }).pts, 0);
  assert.equal(mark(o, 3, { a: [0, 0, 0, 0, 0, 0], t: 0 }).pts, 0);
  // Hai thẻ cùng chữ đổi chỗ cho nhau vẫn là cùng một câu.
  const swapped = [4, 1, 2, 3, 0, 5];
  assert.equal(mark(o, 3, { a: swapped, t: 0 }).pts, 250);
  const two = item("R3-011");
  if (two.kind !== "order") throw 0;
  const tk = tokensOf(two);
  const em = [tk.indexOf("em"), tk.indexOf("ngã"), tk.indexOf("chị"), tk.indexOf("nâng")];
  assert.ok(mark(two, 3, { a: em, t: 1 }).ok);
  const long = item("R4A-001");
  if (long.kind !== "order") throw 0;
  assert.equal(mark(long, CROWN, { a: tokensOf(long).map((_, i) => i), t: 0 }).pts, 400);
  assert.equal(mark(long, CROWN, { a: tokensOf(long).map((_, i) => i), t: 35000 }).pts, 300);
});

test("điểm Săn từ: 75 mỗi từ khác nhau, tối đa 4 từ, thưởng khi đủ 4 sớm", () => {
  const g = item("R4B-001");
  if (g.kind !== "grid") throw 0;
  const p = (w: string) => findPath(g, w)!;
  const three = [
    { p: p("học hỏi"), t: 1000 },
    { p: p("học hỏi"), t: 2000 },
    { p: [0, 4], t: 2500 },
    { p: p("kiên trì"), t: 3000 },
    { p: p("sách vở"), t: 4000 },
  ];
  assert.deepEqual(mark(g, CROWN, { f: three, t: 35000 }), { ok: false, t: 35000, hits: 3, words: ["học hỏi", "kiên trì", "sách vở"], pts: 225 });
  const four = [...three, { p: p("chăm chỉ"), t: 17500 }, { p: p("thành công"), t: 18000 }];
  const m = mark(g, CROWN, { f: four, t: 18000 });
  assert.equal(m.hits, 4);
  assert.equal(m.pts, 300 + 50);
  // Nối chéo hoặc dùng lại ô không được tính.
  assert.equal(gridFinds(g, [{ p: [0, 5], t: 1 }, { p: [0, 1, 0], t: 1 }]).length, 0);
});

test("chuẩn hoá bản ghi từ mạng", () => {
  const q = item("R1-001");
  assert.deepEqual(normSub(q, { a: 9, t: -5 }, 12000), { t: 0 });
  assert.deepEqual(normSub(q, { a: 1, t: 99999 }, 12000), { a: 1, t: 12000 });
  assert.deepEqual(normSub(q, null, 12000), { t: 12000 });
  const g = item("R4B-002");
  assert.deepEqual(normSub(g, { f: [{ p: [0, 1], t: 5 }, { p: [0, 6], t: 5 }, "x"] }, 35000), { f: [{ p: [0, 1], t: 5 }], t: 35000 });
});

test("xếp hạng: tổng điểm → điểm Soán ngôi → số câu đúng; hoà thì đồng hạng", () => {
  const rows = standings([
    { uid: "a", rounds: [0, 100, 0, 0, 300], total: 400, hits: 2 },
    { uid: "b", rounds: [150, 150, 0, 0, 100], total: 400, hits: 3 },
    { uid: "c", rounds: [0, 200, 0, 0, 100], total: 300, hits: 2 },
    { uid: "d", rounds: [100, 100, 0, 0, 100], total: 300, hits: 2 },
  ]);
  assert.deepEqual(rows.map((r) => [r.uid, r.rank]), [["a", 1], ["b", 2], ["c", 3], ["d", 3]]);
  assert.ok(rows[0].king && !rows[1].king);
});

test("xếp hạng sau câu hỏi phụ: người thắng là Vua, người thua trong nhóm hoà xếp ngay sau", () => {
  const base = { rounds: [100, 100, 100, 100, 100] as Rounds, total: 500, hits: 5 };
  const list = [{ uid: "a", ...base }, { uid: "b", ...base }, { uid: "c", ...base }, { uid: "d", rounds: [0, 0, 0, 0, 0] as Rounds, total: 0, hits: 0 }];
  const rows = standings(list, ["b"]);
  assert.deepEqual(rows.map((r) => [r.uid, r.rank, !!r.king]), [["b", 1, true], ["a", 2, false], ["c", 2, false], ["d", 4, false]]);
  const co = standings(list, ["a", "c"]);
  assert.deepEqual(co.map((r) => [r.uid, r.rank, !!r.king]), [["a", 1, true], ["c", 1, true], ["b", 3, false], ["d", 4, false]]);
});

test("câu hỏi phụ: đúng thắng sai, cùng đúng thì nhanh hơn thắng, cùng sai thì đấu tiếp", () => {
  const q = item("R1-013");
  assert.deepEqual(tieSurvivors(q, ["a", "b"], { a: { a: 0, t: 5000 }, b: { a: 1, t: 100 } }), ["a"]);
  assert.deepEqual(tieSurvivors(q, ["a", "b", "c"], { a: { a: 0, t: 5000 }, b: { a: 0, t: 3000 }, c: { a: 0, t: 3000 } }), ["b", "c"]);
  assert.deepEqual(tieSurvivors(q, ["a", "b"], { a: { a: 2, t: 1 }, b: undefined }), ["a", "b"]);
});

test("thứ tự phương án tất định theo seed", () => {
  assert.deepEqual(optionOrder(5, "R1-001"), optionOrder(5, "R1-001"));
  assert.deepEqual([...optionOrder(5, "R1-001")].sort(), [0, 1, 2, 3]);
  const seen = new Set(Array.from({ length: 40 }, (_, s) => optionOrder(s, "R1-001").indexOf(0)));
  assert.ok(seen.size >= 3, "đáp án đúng nên rơi vào nhiều vị trí khác nhau");
});

test("cấp độ Ghép từ tăng dần qua vòng", () => {
  assert.deepEqual(scrambleTiers(6, "mixed"), [1, 1, 2, 2, 3, 4]);
  assert.deepEqual(scrambleTiers(3, "mixed"), [1, 2, 3]);
  assert.deepEqual(scrambleTiers(10, "medium"), [1, 1, 1, 2, 2, 2, 3, 3, 3, 4]);
  assert.deepEqual(scrambleTiers(6, "easy"), [1, 1, 1, 1, 2, 3]);
  assert.deepEqual(scrambleTiers(6, "hard"), [2, 2, 3, 3, 4, 4]);
  assert.deepEqual(scrambleTiers(1, "mixed"), [1]);
});

test("điểm Ghép từ: dùng hết chữ, đúng dấu, khoảng trắng không tính; 100 + thưởng tốc độ", () => {
  const w = item("GT-101");
  if (w.kind !== "scramble") throw 0;
  assert.equal(w.lv, 2);
  const L = lettersOf(w.a);
  assert.deepEqual(L, ["b", "ố", "c", "đ", "ồ", "n", "g"]);
  const right = L.map((_, i) => i);
  // Công thức 100 + ⌊50 × (T − t) / T⌋ với T = 15 giây.
  assert.deepEqual(mark(w, 0, { a: right, t: 0 }), { ok: true, t: 0, hits: 1, pts: 150 });
  assert.equal(mark(w, 0, { a: right, t: 3000 }).pts, 140);
  assert.equal(mark(w, 0, { a: right, t: 6000 }).pts, 130);
  assert.equal(mark(w, 0, { a: right, t: 9000 }).pts, 120);
  assert.equal(mark(w, 0, { a: right, t: 12000 }).pts, 110);
  assert.equal(mark(w, 0, { a: right, t: 15000 }).pts, 100);
  // Khoảng trắng chèn ở đâu cũng được, miễn thứ tự chữ đúng.
  assert.ok(mark(w, 0, { a: [0, 1, 2, -1, 3, 4, 5, 6], t: 0 }).ok);
  assert.ok(mark(w, 0, { a: [0, -1, 1, 2, 3, -1, 4, 5, 6], t: 0 }).ok);
  // Đổi chỗ “ố” và “ồ” là sai; thiếu chữ, dùng lại chữ, chỉ số lạ cũng sai.
  assert.equal(mark(w, 0, { a: [0, 4, 2, 3, 1, 5, 6], t: 0 }).pts, 0);
  assert.equal(mark(w, 0, { a: right.slice(1), t: 0 }).pts, 0);
  assert.equal(mark(w, 0, { a: [0, 0, 2, 3, 4, 5, 6], t: 0 }).pts, 0);
  assert.equal(mark(w, 0, { a: [...right, 7], t: 0 }).pts, 0);
  assert.equal(mark(w, 0, { t: 15000 }).pts, 0);
  // Đáp án phụ đã duyệt được chấp nhận.
  const n = item("GT-110");
  if (n.kind !== "scramble") throw 0;
  const NL = lettersOf(n.a);
  const tinh = lettersOf("tình").map((ch) => NL.lastIndexOf(ch));
  const rest = NL.map((_, i) => i).filter((i) => !tinh.includes(i));
  assert.ok(mark(n, 0, { a: [...tinh, -1, ...rest], t: 0 }).ok);
});

test("chuẩn hoá bản ghi Ghép từ từ mạng", () => {
  const w = item("GT-001");
  assert.deepEqual(normSub(w, { a: [0, -1, 2, -5, 1.5, "x", 3], t: 100 }, 15000), { a: [0, -1, 2, 3], t: 100 });
  assert.deepEqual(normSub(w, { a: "cây đa", t: 100 }, 15000), { t: 100 });
});
