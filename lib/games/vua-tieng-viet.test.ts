import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BANK,
  clueMatch,
  crownKinds,
  DEFAULT_OPTIONS,
  findPath,
  firstOfRound,
  gridFinds,
  itemOf,
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
  standings,
  tieSurvivors,
  tokenOrder,
  tokensOf,
  totalOf,
  validPath,
  type Item,
} from "./vua-tieng-viet.ts";

const item = (id: string) => {
  const x = itemOf(id);
  assert.ok(x, id);
  return x as Item;
};

test("ngân hàng: mã không trùng, đủ câu cho gói Dài", () => {
  const all = Object.values(BANK).flat();
  assert.equal(new Set(all.map((x) => x.id)).size, all.length);
  assert.ok(BANK.r1.length >= 10 + 3 + 40);
  assert.ok(BANK.r2.length >= 30);
  assert.ok(BANK.r3.length >= 30);
  assert.ok(BANK.r4a.length >= 15);
  assert.ok(BANK.r4b.length >= 10);
  for (const x of all) assert.equal(JSON.stringify(x), JSON.stringify(x).normalize("NFC"), `${x.id}: chưa dựng sẵn dấu (NFC)`);
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
  assert.deepEqual(normOptions({ pack: "quick", counts: [9, 9, 9, 9] }).counts, PACKS.quick.counts);
  assert.deepEqual(normOptions({ pack: "custom", counts: [0, 99, "3", null] }).counts, [1, 8, 3, 2]);
  assert.equal(normOptions({ level: "x", topic: "y" }).level, "mixed");
  assert.equal(normOptions({ explain: false }).explain, false);
});

test("điểm tối đa gói Tiêu chuẩn là 3.050", () => {
  assert.equal(maxScore(PACKS.standard.counts), 3050);
  assert.deepEqual(crownKinds(1), ["b"]);
  assert.deepEqual(crownKinds(3), ["a", "b", "a"]);
});

test("vị trí câu trong ván", () => {
  const c = PACKS.standard.counts;
  assert.equal(totalOf(c), 15);
  assert.equal(roundOf(c, 0), 0);
  assert.equal(roundOf(c, 5), 0);
  assert.equal(roundOf(c, 6), 1);
  assert.equal(roundOf(c, 13), 3);
  assert.equal(roundOf(c, 15), 4);
  assert.deepEqual(placeOf(c, 7), { r: 1, k: 1, n: 4 });
  assert.ok(firstOfRound(c, 0) && firstOfRound(c, 6) && firstOfRound(c, 10) && firstOfRound(c, 13) && firstOfRound(c, 15));
  assert.ok(!firstOfRound(c, 1) && !firstOfRound(c, 16));
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
        assert.equal(k, r === 0 ? "mc" : r === 1 ? "clue" : r === 2 ? "order" : k === "grid" ? "grid" : "order");
        if (r === 3) assert.ok(id.startsWith("R4"));
      });
      for (const id of tbq) assert.equal(item(id).kind, "mc");
    }
});

test("lập đề: ưu tiên chủ đề và câu chưa chơi", () => {
  const o = normOptions({ pack: "standard", topic: "lit" });
  const { qs } = makePlan(o, [], rng(7));
  for (const id of qs.slice(0, 6)) assert.equal(item(id).tp, "lit");
  const used = BANK.r1.filter((q) => q.tp === "lit").slice(0, 25).map((q) => q.id);
  const next = makePlan(o, used, rng(8)).qs.slice(0, 6);
  for (const id of next) assert.ok(!used.includes(id), `${id} đã chơi mà vẫn được chọn`);
});

test("điểm Phản xạ: 100 + thưởng tốc độ, sai / hết giờ 0", () => {
  const q = item(BANK.r1[0].id);
  assert.deepEqual(mark(q, 0, { a: 0, t: 0 }), { ok: true, t: 0, hits: 1, pts: 150 });
  assert.equal(mark(q, 0, { a: 0, t: 7200 }).pts, 120);
  assert.equal(mark(q, 0, { a: 0, t: 12000 }).pts, 100);
  assert.equal(mark(q, 0, { a: 2, t: 100 }).pts, 0);
  assert.equal(mark(q, 0, { t: 12000 }).pts, 0);
  assert.equal(mark(q, 0, undefined).pts, 0);
  // Câu hỏi phụ không cộng điểm.
  assert.equal(mark(q, 4, { a: 0, t: 100 }).pts, 0);
  assert.ok(mark(q, 4, { a: 0, t: 100 }).ok);
});

test("điểm Giải nghĩa theo mốc gợi ý; so khớp có dấu, không phân biệt hoa thường", () => {
  const c = item("R2-001");
  assert.equal(mark(c, 1, { a: "Đoàn Kết", t: 6999 }).pts, 150);
  assert.equal(mark(c, 1, { a: "  đoàn   kết. ", t: 7000 }).pts, 110);
  assert.equal(mark(c, 1, { a: "đoàn kết", t: 14000 }).pts, 70);
  assert.equal(mark(c, 1, { a: "doan ket", t: 100 }).pts, 0);
  assert.equal(mark(c, 1, { a: "đoàn kết".normalize("NFD"), t: 100 }).pts, 150);
  const k = item("R2-002");
  assert.ok(mark(k, 1, { a: "nhẫn nại", t: 100 }).ok);
});

test("điểm Xâu chuỗi và Giải mã câu khó; đáp án phụ được chấp nhận", () => {
  const o = item("R3-001");
  if (o.kind !== "order") throw 0;
  const right = tokensOf(o).map((_, i) => i);
  assert.equal(mark(o, 2, { a: right, t: 0 }).pts, 250);
  assert.equal(mark(o, 2, { a: right, t: 12500 }).pts, 225);
  assert.equal(mark(o, 2, { a: [...right].reverse(), t: 0 }).pts, 0);
  assert.equal(mark(o, 2, { a: right.slice(1), t: 0 }).pts, 0);
  assert.equal(mark(o, 2, { a: [0, 0, 0, 0, 0, 0], t: 0 }).pts, 0);
  // Hai thẻ cùng chữ đổi chỗ cho nhau vẫn là cùng một câu.
  const swapped = [4, 1, 2, 3, 0, 5];
  assert.equal(mark(o, 2, { a: swapped, t: 0 }).pts, 250);
  const two = item("R3-011");
  if (two.kind !== "order") throw 0;
  const tk = tokensOf(two);
  const em = [tk.indexOf("em"), tk.indexOf("ngã"), tk.indexOf("chị"), tk.indexOf("nâng")];
  assert.ok(mark(two, 2, { a: em, t: 1 }).ok);
  const long = item("R4A-001");
  if (long.kind !== "order") throw 0;
  assert.equal(mark(long, 3, { a: tokensOf(long).map((_, i) => i), t: 0 }).pts, 400);
  assert.equal(mark(long, 3, { a: tokensOf(long).map((_, i) => i), t: 35000 }).pts, 300);
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
  assert.deepEqual(mark(g, 3, { f: three, t: 35000 }), { ok: false, t: 35000, hits: 3, words: ["học hỏi", "kiên trì", "sách vở"], pts: 225 });
  const four = [...three, { p: p("chăm chỉ"), t: 17500 }, { p: p("thành công"), t: 18000 }];
  const m = mark(g, 3, { f: four, t: 18000 });
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
    { uid: "a", rounds: [100, 0, 0, 300], total: 400, hits: 2 },
    { uid: "b", rounds: [300, 0, 0, 100], total: 400, hits: 3 },
    { uid: "c", rounds: [200, 0, 0, 100], total: 300, hits: 2 },
    { uid: "d", rounds: [200, 0, 0, 100], total: 300, hits: 2 },
  ]);
  assert.deepEqual(rows.map((r) => [r.uid, r.rank]), [["a", 1], ["b", 2], ["c", 3], ["d", 3]]);
  assert.ok(rows[0].king && !rows[1].king);
});

test("xếp hạng sau câu hỏi phụ: người thắng là Vua, người thua trong nhóm hoà xếp ngay sau", () => {
  const base = { rounds: [100, 100, 100, 100] as [number, number, number, number], total: 400, hits: 4 };
  const list = [{ uid: "a", ...base }, { uid: "b", ...base }, { uid: "c", ...base }, { uid: "d", rounds: [0, 0, 0, 0] as [number, number, number, number], total: 0, hits: 0 }];
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
