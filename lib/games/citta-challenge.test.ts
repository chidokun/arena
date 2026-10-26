import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BASIS_MISSING,
  BASIS_PUBLIC,
  claimProofsOf,
  comboOf,
  grade,
  loadBank,
  MODE_KEYS,
  MODE_TOPICS,
  MODES,
  normAnswers,
  normOptions,
  normVerdict,
  PAIRS,
  pickDes,
  pickerAt,
  poolOf,
  proofsOf,
  ROUND_HALVES,
  ROUNDS,
  standings,
  type De,
} from "./citta-challenge.ts";
import { GLOSSARY } from "./citta-challenge-glossary.ts";

const banks = Object.fromEntries(await Promise.all(MODE_KEYS.map(async (m) => [m, await loadBank(m)] as const)));

const bestFor = (de: De, cards: number[]) => {
  const c = comboOf(cards);
  return {
    answers: de.items.map((it) => ({ a: it.key[c], e: proofsOf(it, cards)[0] })),
    verdict: { v: de.verdicts[c], e: claimProofsOf(de, cards)[0] },
  };
};

test("mỗi mode có 100 đề, id không trùng, số mục đúng theo mode", () => {
  for (const m of MODE_KEYS) {
    const bank = banks[m];
    assert.equal(bank.length, 100);
    assert.equal(new Set(bank.map((d) => d.id)).size, 100);
    for (const de of bank) {
      assert.equal(de.items.length, MODES[m].items, de.id);
      assert.equal(de.cards.length, 4, de.id);
      assert.equal(de.verdicts.length, PAIRS.length, de.id);
      assert.ok(de.topics.length && de.topics.every((t) => MODE_TOPICS[m].includes(t)), de.id);
    }
  }
});

test("mọi tổ hợp hai thẻ đều đạt được trọn 5 điểm bằng các căn cứ người chơi chọn được", () => {
  for (const m of MODE_KEYS)
    for (const de of banks[m])
      for (const pair of PAIRS) {
        const cards = [...pair];
        const offered = [...cards, BASIS_PUBLIC, BASIS_MISSING];
        const best = bestFor(de, cards);
        for (const a of best.answers) assert.ok(offered.includes(a.e), `${de.id} ${pair}`);
        assert.ok(offered.includes(best.verdict.e), `${de.id} ${pair}`);
        assert.equal(grade(de, m, cards, best.answers, best.verdict).halves, ROUND_HALVES, `${de.id} ${pair}`);
      }
});

test("chấm điểm NM-001 theo bảng tổ hợp: thiếu thẻ nội dung thì “Chưa đủ dữ kiện” mới đúng", () => {
  const de = banks.nm.find((d) => d.id === "NM-001")!;
  const tham = de.items[0].options.indexOf("Tham — lobha");
  const none = de.items[0].options.length - 1;
  // T1 + T3: chưa có nội dung A.
  assert.equal(grade(de, "nm", [0, 2], [{ a: none, e: BASIS_MISSING }], { v: 1, e: BASIS_MISSING }).halves, 10);
  assert.equal(grade(de, "nm", [0, 2], [{ a: tham, e: 0 }], undefined).halves, 0);
  // T2 + T4: thẻ làm rõ và nội dung A đều là bằng chứng hợp lệ.
  assert.deepEqual(proofsOf(de.items[0], [3, 1]).sort(), [1, 3]);
  const g = grade(de, "nm", [3, 1], [{ a: tham, e: 3 }], { v: 2, e: 1 });
  assert.equal(g.halves, 10);
  // Đúng đáp án nhưng căn cứ là mốc B (gây nhiễu): 1 điểm; đúng đánh giá sai lý do: 1 điểm.
  assert.equal(grade(de, "nm", [0, 3], [{ a: tham, e: 0 }], { v: 2, e: BASIS_PUBLIC }).halves, 2 + 2);
  assert.equal(grade(de, "nm", [0, 3], undefined, undefined).halves, 0);
});

test("điểm từng mode: Ứng dụng 1,5/0,5 mỗi mục, Chuyên sâu 1/0,5 mỗi mục", () => {
  const ud = banks.ud[0];
  const udCards = [0, 2];
  const udBest = bestFor(ud, udCards);
  assert.equal(grade(ud, "ud", udCards, [udBest.answers[0], { ...udBest.answers[1], e: -1 }], undefined).halves, 3 + 1);
  const cs = banks.cs[0];
  const csBest = bestFor(cs, [1, 2]);
  assert.equal(grade(cs, "cs", [1, 2], csBest.answers.map((a, i) => (i ? a : { ...a, e: -1 })), undefined).halves, 1 + 2 + 2);
});

test("quyền mở thẻ luân phiên: 6 vòng ai cũng mở bằng nhau", () => {
  for (const n of [1, 2, 3, 4]) {
    const count = Array(n).fill(0);
    for (let r = 0; r < ROUNDS; r++) for (let k = 0; k < 2; k++) count[pickerAt(r, k, n)]++;
    assert.ok(count.every((c) => c === count[0]), `${n} người: ${count}`);
  }
  // Bốn người A–B–C–D: vòng 1 A, B; vòng 2 C, D; vòng 3 A, B.
  assert.deepEqual([0, 1, 2].flatMap((r) => [pickerAt(r, 0, 4), pickerAt(r, 1, 4)]), [0, 1, 2, 3, 0, 1]);
});

test("rút đề: đủ 6 đề khác nhau trong chủ đề, ưu tiên đề chưa chơi", () => {
  const rand = () => 0.42;
  const bank = banks.cs;
  const ids = pickDes(bank, ["qt"], [], rand)!;
  assert.equal(ids.length, ROUNDS);
  assert.equal(new Set(ids).size, ROUNDS);
  assert.ok(ids.every((id) => bank.find((d) => d.id === id)!.topics.includes("qt")));
  const pool = poolOf(bank, ["qt"]).map((d) => d.id);
  const used = pool.slice(0, pool.length - 3);
  const next = pickDes(bank, ["qt"], used, rand)!;
  assert.deepEqual(next.slice(0, 3).sort(), pool.slice(-3).sort());
  assert.equal(pickDes(bank.slice(0, 5), ["tt", "bt", "th"], [], rand), null);
});

test("chuẩn hoá tuỳ chọn và câu trả lời", () => {
  assert.deepEqual(normOptions({}), { mode: "nm", topics: ["tt", "bt", "th"], timer: false });
  assert.deepEqual(normOptions({ mode: "cs", topics: ["pl", "zz"], timer: true }), { mode: "cs", topics: ["pl"], timer: true });
  assert.deepEqual(normOptions({ mode: "nm", topics: ["pl"] }).topics, ["tt", "bt", "th"]);
  assert.deepEqual(normAnswers([{ a: 2, e: 9 }, "x"], 3), [
    { a: 2, e: -1 },
    { a: -1, e: -1 },
    { a: -1, e: -1 },
  ]);
  assert.deepEqual(normVerdict({ v: 3, e: 4 }), { v: 3, e: 4 });
  assert.deepEqual(normVerdict({ v: 7 }), { v: -1, e: -1 });
});

test("xếp hạng theo tổng điểm rồi số vòng trọn điểm, còn bằng thì đồng hạng", () => {
  const rows = standings([
    { uid: "a", rounds: [10, 4, 2] },
    { uid: "b", rounds: [6, 6, 6] },
    { uid: "c", rounds: [10, 8] },
    { uid: "d", rounds: [10, 8] },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.uid, r.rank]),
    [
      ["c", 1],
      ["d", 1],
      ["b", 3],
      ["a", 4],
    ],
  );
});

test("thẻ dữ kiện không chép nguyên định nghĩa trong bảng kiến thức", () => {
  const defs = GLOSSARY.flatMap((t) => [t.plain, t.trait]).filter((x): x is string => !!x && x.length > 20).map((x) => x.replace(/\.$/, ""));
  for (const m of ["nm", "ud"] as const)
    for (const de of banks[m]) for (const c of de.cards) assert.ok(!defs.some((d) => c.text.includes(d)), `${de.id} ${c.label}: ${c.text}`);
});

test("bảng kiến thức có đủ nhóm và đặc tính", () => {
  assert.equal(GLOSSARY.length, 52);
  assert.ok(GLOSSARY.every((t) => t.term && t.group && t.trait));
});
