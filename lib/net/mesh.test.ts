import assert from "node:assert/strict";
import { test } from "node:test";
import { Mesh, pairWeight } from "./mesh.ts";

const LIMIT = { soft: 5, hard: 8 };

// Mỗi peer công bố danh sách hàng xóm; ở đây chỉ cần độ dài, trừ khi truyền sẵn danh sách.
function fixture(neighbors: Record<string, number | string[]> = {}) {
  let now = 1_000_000;
  const m = new Mesh(LIMIT, "me", () => now);
  m.useNeighbors((p) => {
    const v = neighbors[p];
    return typeof v === "number" ? Array.from({ length: v }, (_, i) => (i === 0 ? "me" : `${p}-n${i}`)) : v;
  });
  return { m, tick: (ms: number) => (now += ms) };
}

const set = (n: number, prefix = "c") => new Set(Array.from({ length: n }, (_, i) => `${prefix}${i}`));
const w = (p: string) => pairWeight("me", p);
// Id có cạnh tới "me" nặng hơn (hoặc nhẹ hơn) mọi cạnh trong `conn`.
function heavier(conn: Set<string>, than = true) {
  const edge = [...conn].map(w);
  for (let i = 0; ; i++) {
    const id = `x${i}`;
    if (than ? w(id) > Math.max(...edge) : w(id) < Math.min(...edge)) return id;
  }
}

test("dưới mức mềm: nhận mọi peer, kể cả peer đã đủ kết nối", () => {
  const { m } = fixture({ full: 8 });
  assert.ok(m.admit("full", set(4)));
});

test("từ mức mềm: chỉ nhận peer còn thiếu, chưa rõ số kết nối, hoặc có cạnh nhẹ hơn cạnh đang có", () => {
  const conn = set(5);
  const rich = heavier(conn);
  const light = heavier(conn, false);
  const { m } = fixture({ [rich]: 5, [light]: 6, poor: 2 });
  assert.ok(!m.admit(rich, conn));
  assert.ok(m.admit("poor", conn));
  assert.ok(m.admit("newbie", conn), "người mới chưa có bản ghi gossip vẫn được nhận");
  assert.ok(m.admit(light, conn), "cạnh nhẹ hơn thì đổi");
});

test("mức cứng: không nhận thêm ai, kể cả lượt bắt tay đang chờ", () => {
  const { m } = fixture();
  const conn = set(6);
  assert.ok(m.admit("a", conn));
  assert.ok(m.admit("b", conn));
  assert.ok(!m.admit("c", conn), "6 kết nối + 2 đang chờ = mức cứng");
  assert.ok(m.admit("a", conn), "peer đang chờ được hỏi lại vẫn qua");
});

test("lượt chờ hết hạn thì trả chỗ; nối xong thì không còn tính là chờ", () => {
  const { m, tick } = fixture();
  const conn = set(7);
  assert.ok(m.admit("a", conn));
  assert.ok(!m.admit("b", conn));
  tick(31_000);
  assert.ok(m.admit("b", conn));
  m.joined("b");
  conn.add("b");
  assert.ok(!m.admit("c", conn));
});

test("peer bị cắt không được nối lại trong một phút", () => {
  const { m, tick } = fixture();
  m.ban("x");
  assert.ok(!m.admit("x", set(0)));
  tick(61_000);
  assert.ok(m.admit("x", set(0)));
});

test("pickDrop: cắt cạnh nặng nhất của mình khi đã qua ân hạn và bên kia còn dư", () => {
  const conn = set(6);
  const { m, tick } = fixture(Object.fromEntries([...conn].map((p) => [p, 7])));
  for (const p of conn) m.joined(p);
  assert.equal(m.pickDrop(conn), null, "vừa nối, chưa qua ân hạn");
  tick(31_000);
  const worst = [...conn].sort((a, b) => w(b) - w(a))[0];
  assert.equal(m.pickDrop(conn), worst);
  assert.equal(m.pickDrop(set(5)), null, "chưa vượt mức mềm thì không cắt");
});

test("pickDrop: không cắt nếu bên kia chỉ còn đúng mức mềm hoặc chưa rõ", () => {
  const conn = set(7);
  const worst = [...conn].sort((a, b) => w(b) - w(a))[0];
  for (const n of [5, undefined]) {
    const { m, tick } = fixture(n === undefined ? {} : { [worst]: n });
    for (const p of conn) m.joined(p);
    tick(31_000);
    assert.equal(m.pickDrop(conn), null);
  }
});

test("pickDrop: bên kia dư đúng một thì chỉ cắt khi đó cũng là cạnh nặng nhất của họ", () => {
  const conn = set(6);
  const worst = [...conn].sort((a, b) => w(b) - w(a))[0];
  const mine = pairWeight(worst, "me");
  const pick = (heavier: boolean) => {
    for (let i = 0; ; i++) if (pairWeight(worst, `q${i}`) > mine === heavier) return `q${i}`;
  };
  const lighter = Array.from({ length: 5 }, (_, i) => i).reduce<string[]>((acc) => {
    for (let i = 0; ; i++) {
      const q = `l${acc.length}-${i}`;
      if (pairWeight(worst, q) < mine) return [...acc, q];
    }
  }, []);
  for (const [list, want] of [
    [["me", ...lighter], worst],
    [["me", ...lighter.slice(1), pick(true)], null],
  ] as const) {
    const { m, tick } = fixture({ [worst]: [...list] });
    for (const p of conn) m.joined(p);
    tick(31_000);
    assert.equal(m.pickDrop(conn), want);
  }
});

// Mô phỏng sảnh: mỗi vòng ~5s mọi máy loan báo, hai bên cùng `admit` thì nối; số kết nối lan qua gossip trễ một vòng.
function simulate(n: number, rounds: number, late = 0) {
  let now = 0;
  const ids = Array.from({ length: n + late }, (_, i) => `p${String(i).padStart(3, "0")}`);
  const adj = new Map(ids.map((id) => [id, new Set<string>()]));
  const published = new Map<string, string[]>();
  const mesh = new Map(
    ids.map((id) => {
      const m = new Mesh(LIMIT, id, () => now);
      m.useNeighbors((p) => published.get(p));
      return [id, m];
    }),
  );
  let drops = 0;
  const dropsByRound: number[] = [];
  for (let r = 0; r < rounds; r++) {
    const active = ids.slice(0, r < rounds / 2 ? n : n + late);
    const pairs = active.flatMap((a) => active.filter((b) => a < b).map((b) => (Math.random() < 0.5 ? [a, b] : [b, a])));
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    for (const [a, b] of pairs) {
      if (adj.get(a)!.has(b) || !mesh.get(a)!.admit(b, adj.get(a)!) || !mesh.get(b)!.admit(a, adj.get(b)!)) continue;
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
      mesh.get(a)!.joined(b);
      mesh.get(b)!.joined(a);
    }
    let roundDrops = 0;
    for (const a of active) {
      const p = mesh.get(a)!.pickDrop(adj.get(a)!);
      if (!p) continue;
      mesh.get(a)!.ban(p);
      adj.get(a)!.delete(p);
      adj.get(p)!.delete(a);
      mesh.get(a)!.left(p);
      mesh.get(p)!.left(a);
      roundDrops++;
    }
    drops += roundDrops;
    dropsByRound.push(roundDrops);
    for (const a of active) published.set(a, [...adj.get(a)!]);
    now += 5000;
  }
  return { ids, adj, drops, dropsByRound };
}

function connected(ids: string[], adj: Map<string, Set<string>>) {
  const seen = new Set([ids[0]]);
  const queue = [ids[0]];
  while (queue.length)
    for (const b of adj.get(queue.shift()!)!)
      if (!seen.has(b)) {
        seen.add(b);
        queue.push(b);
      }
  return seen.size === ids.length;
}

test("mô phỏng 60 người (+10 vào sau): không ai vượt mức cứng, lưới liền khối, người vào sau có kết nối, lưới dịu dần", () => {
  for (let run = 0; run < 5; run++) {
    const { ids, adj, dropsByRound } = simulate(60, 120, 10);
    const degs = ids.map((id) => adj.get(id)!.size);
    assert.ok(Math.max(...degs) <= LIMIT.hard, `bậc lớn nhất ${Math.max(...degs)}`);
    assert.ok(connected(ids, adj), "lưới bị chia cắt");
    for (const id of ids.slice(60)) assert.ok(adj.get(id)!.size >= 3, `${id} vào sau chỉ có ${adj.get(id)!.size} kết nối`);
    // Ai cũng vào cùng lúc là trường hợp xấu nhất: lưới vẫn tự xáo một lúc, nhưng phải dịu dần chứ không xoay vòng mãi.
    const sum = (l: number[]) => l.reduce((a, b) => a + b, 0);
    const early = sum(dropsByRound.slice(8, 16));
    const tail = sum(dropsByRound.slice(-8));
    assert.ok(tail * 2 < early && tail <= 35, `cắt ${early} cạnh lúc đầu, ${tail} cạnh lúc cuối — lưới không dịu dần`);
  }
});
