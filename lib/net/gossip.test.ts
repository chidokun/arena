import assert from "node:assert/strict";
import { test } from "node:test";
import { Gossip, Liveness, type Wire, type WireKind } from "./gossip.ts";

/** Mạng giả lập đồng bộ: `links` quy định cặp nào nối trực tiếp được với nhau. */
function network(ids: string[], links: [string, string][]) {
  const handlers = new Map<string, Map<WireKind, (d: unknown, from: string) => void>>();
  const joins = new Map<string, (p: string) => void>();
  const adj = new Map(ids.map((id) => [id, new Set<string>()]));
  const queue: (() => void)[] = [];
  const wires = new Map<string, Wire>();
  for (const id of ids) {
    handlers.set(id, new Map());
    wires.set(id, {
      peers: () => [...adj.get(id)!],
      send(kind, data, to) {
        const targets = to == null ? [...adj.get(id)!] : Array.isArray(to) ? to : [to];
        const copy = JSON.parse(JSON.stringify(data));
        for (const t of targets) if (adj.get(id)!.has(t)) queue.push(() => handlers.get(t)!.get(kind)?.(copy, id));
      },
      on(kind, fn) {
        handlers.get(id)!.set(kind, fn);
      },
      onPeerJoin(fn) {
        joins.set(id, fn);
      },
    });
  }
  const connect = (a: string, b: string) => {
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
    joins.get(a)?.(b);
    joins.get(b)?.(a);
  };
  const flush = () => {
    let n = 0;
    while (queue.length && n++ < 100000) queue.shift()!();
  };
  return { wires, connect, flush, links };
}

test("hội tụ qua peer trung gian khi lưới không đủ cặp", () => {
  const ids = ["a", "b", "c", "d"];
  const net = network(ids, []);
  const g = Object.fromEntries(ids.map((id) => [id, new Gossip(id, net.wires.get(id)!, { fanout: 2 })]));
  // Chuỗi a - b - c - d: a và d không bao giờ nối trực tiếp.
  net.connect("a", "b");
  net.connect("b", "c");
  net.connect("c", "d");
  net.flush();
  g.a.set("x", 1);
  g.d.set("y", 2, false);
  for (let i = 0; i < 10; i++) {
    for (const id of ids) g[id].tick();
    net.flush();
  }
  for (const id of ids) {
    assert.equal(g[id].get("x"), 1, `${id} thiếu x`);
    assert.equal(g[id].get("y"), 2, `${id} thiếu y`);
  }
});

test("ghi đồng thời: mọi peer chọn cùng một bản thắng", () => {
  const ids = ["a", "b", "c"];
  const net = network(ids, []);
  const g = Object.fromEntries(ids.map((id) => [id, new Gossip(id, net.wires.get(id)!)]));
  g.a.set("k", "from-a", false);
  g.c.set("k", "from-c", false);
  net.connect("a", "b");
  net.connect("b", "c");
  for (let i = 0; i < 6; i++) {
    for (const id of ids) g[id].tick();
    net.flush();
  }
  const vals = ids.map((id) => g[id].get("k"));
  assert.ok(vals.every((v) => v === vals[0]), JSON.stringify(vals));
});

test("ghi sau khi đã thấy bản của người khác thì luôn thắng (Lamport)", () => {
  const net = network(["a", "b"], []);
  const a = new Gossip("a", net.wires.get("a")!);
  const b = new Gossip("b", net.wires.get("b")!);
  net.connect("a", "b");
  for (let i = 0; i < 5; i++) a.set("k", i);
  net.flush();
  b.set("k", "b-wins");
  net.flush();
  assert.equal(a.get("k"), "b-wins");
});

test("prune: bản cũ không quay lại qua anti-entropy", () => {
  const net = network(["a", "b"], []);
  const a = new Gossip("a", net.wires.get("a")!);
  const b = new Gossip("b", net.wires.get("b")!);
  a.set("old", 1, false);
  net.connect("a", "b");
  net.flush();
  assert.equal(b.get("old"), 1);
  b.prune("old");
  a.tick();
  net.flush();
  assert.equal(b.get("old"), undefined);
});

test("rumor đi tới mọi peer đúng một lần", () => {
  const ids = ["a", "b", "c", "d"];
  const net = network(ids, []);
  const g = Object.fromEntries(ids.map((id) => [id, new Gossip(id, net.wires.get(id)!)]));
  const got: Record<string, number> = {};
  for (const id of ids) g[id].onRumor(() => (got[id] = (got[id] ?? 0) + 1));
  net.connect("a", "b");
  net.connect("b", "c");
  net.connect("c", "d");
  net.connect("a", "d");
  net.flush();
  g.a.broadcast("chat", { text: "xin chào" });
  net.flush();
  assert.deepEqual(got, { b: 1, c: 1, d: 1 });
});

test("rumor gửi lại (replay) được đánh dấu, tin vừa phát thì không", () => {
  const ids = ["a", "b"];
  const net = network(ids, []);
  const g = Object.fromEntries(ids.map((id) => [id, new Gossip(id, net.wires.get(id)!)]));
  const got: [string, boolean][] = [];
  g.b.onRumor((r, _from, replayed) => got.push([r.id, replayed]));
  net.connect("a", "b");
  net.flush();
  const live = g.a.broadcast("chat", { text: "mới" });
  g.a.replay([{ id: "x:1", t: "chat", p: { text: "cũ" } }], "b");
  net.flush();
  assert.deepEqual(got, [
    [live.id, false],
    ["x:1", true],
  ]);
});

test("liveness: im lặng quá hạn thì chết, rời thì chết ngay", () => {
  let now = 1_000_000;
  const l = new Liveness(5000, () => now);
  l.observe("u", Date.now());
  assert.ok(l.alive("u"));
  now += 4000;
  l.observe("u", Date.now() + 1);
  now += 4000;
  assert.ok(l.alive("u"));
  now += 2000;
  assert.ok(!l.alive("u"));
  l.observe("v", Date.now());
  l.observe("v", Date.now() + 5, true);
  assert.ok(!l.alive("v"));
});
