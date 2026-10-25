import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoDesign,
  CATALOG,
  designCost,
  EXPERT_INCIDENTS,
  EXPERT_KINDS,
  EXPERT_PRESETS,
  inspect,
  KINDS,
  linkIssue,
  makeProblem,
  normDesign,
  normProblem,
  PRESETS,
  simulate,
  standings,
  USERS_ID,
  winnersOf,
  type Design,
  type Flow,
  type Incident,
  type Kind,
  type Problem,
} from "./system-design.ts";

const problem = (flows: Flow[], extra: Partial<Problem> = {}): Problem => normProblem({ title: "Đề thử", target: 1000, budget: 200, kinds: KINDS, flows, ...extra });

// Dựng nhanh thiết kế: `nodes` là [id, loại, variant], `edges` là [từ, tới] (0 = Users).
function design(nodes: [number, Kind, number][], edges: [number, number][]): Design {
  return { nodes: nodes.map(([id, k, v]) => ({ id, k, v, x: 200, y: 200 })), edges };
}

const READ: Flow[] = [{ kind: "read", name: "Đọc", pct: 100 }];

test("mỗi loại component có 3 variant, càng mạnh càng đắt", () => {
  for (const k of KINDS) {
    const vs = CATALOG[k].variants;
    assert.equal(vs.length, 3, k);
    for (let i = 1; i < 3; i++) {
      assert.ok(vs[i].tps > vs[i - 1].tps, `${k}: TPS tăng dần`);
      assert.ok(vs[i].price > vs[i - 1].price, `${k}: giá tăng dần`);
    }
  }
});

test("chỉ nối được các cổng tương thích, không trùng, không vòng lặp", () => {
  const d = design(
    [
      [1, "lb", 0],
      [2, "app", 0],
      [3, "db", 0],
      [4, "lb", 0],
      [5, "replica", 0],
      [6, "cdn", 0],
    ],
    [
      [USERS_ID, 1],
      [1, 2],
      [1, 4],
    ],
  );
  assert.equal(linkIssue(d, 2, 3), "");
  assert.equal(linkIssue(d, 3, 5), "", "DB → Replica là đường nhân bản");
  assert.match(linkIssue(d, 3, 2), /không nối được/);
  assert.match(linkIssue(d, 2, USERS_ID), /ngược về Users/);
  assert.match(linkIssue(d, 1, 2), /Đã có/);
  assert.match(linkIssue(d, 4, 1), /vòng lặp/);
  assert.match(linkIssue(d, USERS_ID, 2), /một cửa vào/, "Users chỉ có một cửa vào cho request động");
  assert.equal(linkIssue(d, USERS_ID, 6), "", "cửa vào tệp tĩnh tính riêng");
});

test("chuẩn hoá thiết kế từ mạng: bỏ component đề không cho, đường nối sai và vòng lặp", () => {
  const p = { kinds: ["lb", "app", "db"] as Kind[] };
  const d = normDesign(
    {
      nodes: [
        { id: 1, k: "lb", v: 0, x: -50, y: 9999 },
        { id: 2, k: "app", v: 1, x: 10, y: 10 },
        { id: 2, k: "db", v: 0, x: 0, y: 0 },
        { id: 3, k: "cache", v: 0, x: 0, y: 0 },
        { id: 4, k: "db", v: 7, x: 0, y: 0 },
        { id: 5, k: "lb", v: 0, x: 0, y: 0 },
      ],
      edges: [
        [0, 1],
        [1, 5],
        [5, 1],
        [1, 2],
        [2, 3],
        [2, 1],
        "x",
      ],
    },
    p,
  );
  assert.deepEqual(
    d.nodes.map((n) => n.id),
    [1, 2, 5],
  );
  assert.equal(d.nodes[0].x, 0);
  assert.ok(d.nodes[0].y < 600);
  assert.deepEqual(d.edges, [
    [0, 1],
    [1, 5],
    [1, 2],
  ]);
});

test("đề chuẩn hoá: tổng tỷ lệ phải 100%, tự cho phép các component luồng bắt buộc cần", () => {
  const bad = normProblem({ flows: [{ kind: "read", name: "x", pct: 30 }], kinds: [] });
  assert.equal(bad.flows.reduce((s, f) => s + f.pct, 0), 100, "tỷ lệ sai thì dùng luồng mặc định");
  const p = normProblem({ flows: [{ kind: "job", name: "Gửi mail", pct: 100, sink: "external", gate: true }], kinds: [] });
  for (const k of ["app", "queue", "worker", "external", "gateway"] as Kind[]) assert.ok(p.kinds.includes(k), k);
  assert.ok(!p.kinds.includes("cdn"));
  assert.equal(normProblem({ target: 1234 }).target, 1200);
});

test("kiểm tra hợp lệ chỉ ra chỗ gãy của từng luồng", () => {
  const p = problem([
    { kind: "read", name: "Đọc", pct: 80 },
    { kind: "write", name: "Ghi", pct: 20 },
  ]);
  const empty = inspect(p, design([], []));
  assert.equal(empty.errors.length, 2);
  assert.match(empty.errors[0].text, /cửa vào/);

  // Ghi chỉ có đường qua Replica → không hợp lệ.
  const onlyReplica = inspect(
    p,
    design(
      [
        [1, "app", 0],
        [2, "replica", 0],
        [3, "db", 0],
      ],
      [
        [0, 1],
        [1, 2],
        [3, 2],
      ],
    ),
  );
  assert.equal(onlyReplica.errors.length, 1);
  assert.equal(onlyReplica.errors[0].flow, 1);
  assert.match(onlyReplica.errors[0].text, /Database để ghi/);

  // Cache không có đường cho cache miss thì App phải đọc chỗ khác; Replica chưa nhân bản thì không phục vụ được.
  const noSource = inspect(
    problem(READ),
    design(
      [
        [1, "app", 0],
        [2, "replica", 0],
      ],
      [
        [0, 1],
        [1, 2],
      ],
    ),
  );
  assert.match(noSource.errors[0].text, /nhân bản/);
});

test("LB chia đều mọi request nên nhánh nào cũng phải xử lý được; Gateway định tuyến theo loại request", () => {
  const p = problem([
    { kind: "read", name: "Đọc", pct: 50 },
    { kind: "write", name: "Ghi", pct: 50 },
  ]);
  const split = (front: Kind) =>
    design(
      [
        [1, front, 0],
        [2, "app", 0],
        [3, "app", 0],
        [4, "replica", 0],
        [5, "db", 0],
      ],
      [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 4],
        [5, 4],
        [3, 5],
      ],
    );
  const lb = inspect(p, split("lb"));
  assert.ok(!lb.ok);
  assert.match(lb.errors[0].text, /LB #1 → App #1/);
  assert.match(lb.errors[0].text, /LB chia đều/);
  const gw = inspect(p, split("gateway"));
  assert.ok(gw.ok, gw.errors.map((e) => e.text).join("; "));
  const sim = simulate(p, split("gateway"));
  // Đọc chia đều cho cả hai App (App #2 đọc thẳng DB), ghi chỉ qua App #2: DB chịu 0,25λ + 0,5λ, Replica chịu 0,25λ đọc
  // cộng 0,5λ nhân bản → cả hai Small 400 nghẽn ở 533.
  assert.equal(sim.maxTps, 500);
  assert.match(sim.fail!.text, /Replica #1 quá tải: phải xử lý 413/);
});

test("đường đi bắt buộc qua API Gateway", () => {
  const p = problem([{ kind: "read", name: "Đọc", pct: 100, gate: true }]);
  const direct = design(
    [
      [1, "app", 0],
      [2, "db", 0],
    ],
    [
      [0, 1],
      [1, 2],
    ],
  );
  assert.match(inspect(p, direct).errors[0].text, /chưa qua API Gateway/);
  const viaGate = design(
    [
      [1, "gateway", 0],
      [2, "app", 0],
      [3, "db", 0],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  );
  assert.ok(inspect(p, viaGate).ok);
});

test("component không nhận traffic bị nhắc nhưng vẫn tính tiền", () => {
  const d = design(
    [
      [1, "app", 0],
      [2, "db", 0],
      [3, "cache", 0],
      [4, "worker", 0],
    ],
    [
      [0, 1],
      [1, 2],
    ],
  );
  const r = inspect(problem(READ), d);
  assert.ok(r.ok);
  assert.equal(r.idle.length, 2);
  assert.equal(r.cost, 10 + 15 + 6 + 5);
  assert.equal(designCost(d), r.cost);
});

test("TPS tối đa là mức tải cao nhất chưa có component nào quá tải", () => {
  const p = problem(READ);
  // App Small 500, DB Small 400 → DB nghẽn ở 400; mỗi mức tăng 50.
  const plain = simulate(
    p,
    design(
      [
        [1, "app", 0],
        [2, "db", 0],
      ],
      [
        [0, 1],
        [1, 2],
      ],
    ),
  );
  assert.equal(plain.step, 50);
  assert.equal(plain.maxTps, 400);
  assert.equal(plain.fail!.level, 9);
  assert.equal(plain.fail!.tps, 450);
  assert.equal(plain.fail!.why, "overload");
  assert.equal(plain.fail!.node, 2);

  // Cache 60% hit: DB chỉ còn 0,4λ → nghẽn ở 1.000; App Medium 1.200.
  const cached = simulate(
    p,
    design(
      [
        [1, "app", 1],
        [2, "cache", 0],
        [3, "db", 0],
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    ),
  );
  assert.equal(cached.maxTps, 1000);
  assert.equal(cached.fail!.node, 3);
});

test("Queue cho Worker gánh tới 1,5 lần sức trong khoảng đánh giá 10 giây + 5 giây hoàn tất", () => {
  const p = problem([{ kind: "job", name: "Nền", pct: 100 }]);
  const d = design(
    [
      [1, "app", 1],
      [2, "queue", 0],
      [3, "worker", 0],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  );
  const sim = simulate(p, d);
  assert.equal(sim.maxTps, 300);
  assert.equal(sim.fail!.why, "drain");
  assert.ok(sim.levels[5].backlog > 0, "tác vụ có dồn lại trong hàng");
});

test("Worker ghi tiếp tới đích; đích gián đoạn thì Worker tạm dừng thay vì làm mất tác vụ", () => {
  const job: Flow[] = [{ kind: "job", name: "Gửi mail", pct: 100, sink: "external" }];
  const d = design(
    [
      [1, "app", 2],
      [2, "queue", 1],
      [3, "worker", 2],
      [4, "external", 2],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  );
  // Worker 1.200/giây gánh được 1,5 lần nhờ Queue.
  const calm = simulate(problem(job), d);
  assert.equal(calm.maxTps, 1800);
  // External ngừng giây 4–7: Worker dừng, tồn 6(λ − 1.200) + 4λ tác vụ, phải xả hết trong 5 giây → λ ≤ 1.320.
  const outage = simulate(problem(job, { incidents: ["ext-down"] }), d);
  assert.equal(outage.maxTps, 1300);
  assert.equal(outage.fail!.why, "drain");
  const noSink = inspect(problem(job), design(
    [
      [1, "app", 1],
      [2, "queue", 1],
      [3, "worker", 2],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  ));
  assert.match(noSink.errors[0].text, /Worker #1: chưa nối tới External Service/);
});

test("sự cố: App sập thì cần App dự phòng, LB dồn traffic sang App còn lại", () => {
  const p = problem(READ, { incidents: ["app-down"] });
  const single = simulate(
    p,
    design(
      [
        [1, "app", 1],
        [2, "db", 2],
      ],
      [
        [0, 1],
        [1, 2],
      ],
    ),
  );
  assert.equal(single.maxTps, 0);
  assert.equal(single.fail!.why, "path");
  assert.deepEqual(single.levels[0].down, [1]);
  const pair = simulate(
    p,
    design(
      [
        [1, "lb", 0],
        [2, "app", 0],
        [3, "app", 0],
        [4, "db", 2],
      ],
      [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 4],
        [3, 4],
      ],
    ),
  );
  // Mỗi App Small 500; một chiếc sập thì chiếc còn lại gánh hết.
  assert.equal(pair.maxTps, 500);
});

test("sự cố làm giảm TPS đạt được của cùng một thiết kế", () => {
  const flows: Flow[] = [
    { kind: "read", name: "Đọc", pct: 80 },
    { kind: "write", name: "Ghi", pct: 20 },
  ];
  const d = design(
    [
      [1, "lb", 0],
      [2, "app", 1],
      [3, "app", 1],
      [4, "cache", 1],
      [5, "db", 1],
    ],
    [
      [0, 1],
      [1, 2],
      [1, 3],
      [2, 4],
      [3, 4],
      [4, 5],
      [2, 5],
      [3, 5],
    ],
  );
  const calm = simulate(problem(flows), d).maxTps;
  for (const inc of ["db-slow", "cache-flush", "cache-drop", "skew", "write-surge", "app-down", "link-cut"] as Incident[]) {
    const hit = simulate(problem(flows, { incidents: [inc] }), d).maxTps;
    assert.ok(hit < calm, `${inc}: ${hit} < ${calm}`);
  }
});

test("giả lập tất định: chạy lại ra đúng kết quả cũ", () => {
  const p = makeProblem(42, "flash-sale");
  const { design: d } = autoDesign(p);
  assert.equal(JSON.stringify(simulate(p, d)), JSON.stringify(simulate(p, d)));
});

test("xếp hạng: đạt quality gate trước, TPS cao hơn rồi rẻ hơn, bằng nhau thì đồng hạng", () => {
  const p = problem(READ, { target: 300, budget: 30 });
  const cheap = design(
    [
      [1, "app", 0],
      [2, "db", 0],
    ],
    [
      [0, 1],
      [1, 2],
    ],
  );
  const pricey = design(
    [
      [1, "app", 1],
      [2, "db", 0],
    ],
    [
      [0, 1],
      [1, 2],
    ],
  );
  const rows = standings(p, [
    { uid: "d", design: pricey },
    { uid: "a", design: cheap },
    { uid: "b", design: cheap },
    { uid: "c", design: design([], []) },
    { uid: "e", design: null, out: true },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.uid, r.status, r.rank]),
    [
      ["a", "pass", 1],
      ["b", "pass", 1],
      ["d", "fail", 0],
      ["c", "invalid", 0],
      ["e", "out", 0],
    ],
  );
  assert.equal(rows[2].traffic, true);
  assert.equal(rows[2].budget, false, "App Medium + DB Small = 37 > 30");
  assert.deepEqual(winnersOf(rows), ["a", "b"]);
  assert.deepEqual(winnersOf(standings(p, [{ uid: "c", design: design([], []) }])), []);
});

test("đề tự sinh luôn có thiết kế tham khảo đạt mục tiêu trong budget", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const p = makeProblem(seed * 7919);
    assert.equal(p.flows.reduce((s, f) => s + f.pct, 0), 100);
    const { sim } = autoDesign(p);
    assert.ok(sim.valid, `${seed}: ${p.title}`);
    assert.ok(sim.maxTps >= p.target, `${seed}: ${p.title} ${sim.maxTps} < ${p.target}`);
    assert.ok(sim.cost <= p.budget, `${seed}: ${p.title} ${sim.cost} > ${p.budget}`);
  }
  for (const preset of PRESETS) assert.equal(makeProblem(1, preset.key).title, preset.title);
});

// ---------------------------------------------------------------------------------------------------------------------
// Mode Chuyên gia.

const expert = (flows: Flow[], extra: Partial<Problem> = {}) => problem(flows, { mode: "expert", ...extra });

test("mode Cơ bản không có component, luồng, sự cố nâng cao; mode Chuyên gia thì có", () => {
  const raw = { kinds: KINDS, flows: [{ kind: "search", name: "Tìm", pct: 60 }, { kind: "write", name: "Ghi", pct: 40, acid: true }], incidents: ["bot", "app-down"] };
  const basic = normProblem(raw);
  assert.equal(basic.mode, "basic");
  assert.deepEqual(basic.flows, PRESETS[0].flows, "luồng tìm kiếm không hợp lệ ở Cơ bản → về đề mặc định");
  assert.ok(!basic.kinds.some((k) => EXPERT_KINDS.includes(k)));
  assert.deepEqual(basic.incidents, ["app-down"]);
  assert.equal(normProblem({ ...raw, flows: [{ kind: "write", name: "Ghi", pct: 100, acid: true }] }).flows[0].acid, undefined, "ACID chỉ có ở Chuyên gia");

  const pro = normProblem({ ...raw, mode: "expert" });
  assert.equal(pro.mode, "expert");
  assert.deepEqual(pro.flows.map((f) => [f.kind, !!f.acid]), [["search", false], ["write", true]]);
  assert.ok(EXPERT_KINDS.every((k) => pro.kinds.includes(k)));
  assert.ok(pro.kinds.includes("search") && pro.kinds.includes("db"), "luồng tìm kiếm cần Search Index và nguồn dữ liệu");
  assert.deepEqual(pro.incidents, ["app-down", "bot"]);
});

test("NoSQL không nhận ghi cần ACID; ghi không cần ACID ưu tiên vào NoSQL", () => {
  const p = expert([
    { kind: "write", name: "Đặt hàng", pct: 50, acid: true },
    { kind: "write", name: "Thả tim", pct: 50 },
  ]);
  const onlyNosql = design(
    [
      [1, "app", 2],
      [3, "nosql", 0],
    ],
    [
      [USERS_ID, 1],
      [1, 3],
    ],
  );
  const r = inspect(p, onlyNosql);
  assert.equal(r.ok, false);
  assert.match(r.errors[0].text, /ACID/);

  const both = design(
    [
      [1, "app", 2],
      [2, "db", 0],
      [3, "nosql", 0],
    ],
    [
      [USERS_ID, 1],
      [1, 2],
      [1, 3],
    ],
  );
  const sim = simulate(p, both);
  // Database Small (400) chỉ nhận nửa ACID; nửa còn lại vào NoSQL.
  assert.equal(sim.maxTps, 800);
  assert.equal(sim.fail?.node, 2);
});

test("Database chính sập: không có Standby thì mất dữ liệu, có Standby thì failover và Standby phải đủ cỡ", () => {
  const p = expert([{ kind: "write", name: "Chuyển khoản", pct: 100, acid: true }], { incidents: ["db-down"] });
  const bare = design(
    [
      [1, "app", 2],
      [2, "db", 1],
    ],
    [
      [USERS_ID, 1],
      [1, 2],
    ],
  );
  const lost = simulate(p, bare);
  assert.equal(lost.fail?.why, "path");
  assert.equal(lost.maxTps, 0);
  assert.match(lost.fail!.text, /Standby/);

  // Hai Database là hai shard giữ dữ liệu riêng: một cái sập thì không chuyển sang cái kia được.
  const shards = design(
    [
      [1, "app", 2],
      [2, "db", 1],
      [3, "db", 1],
    ],
    [
      [USERS_ID, 1],
      [1, 2],
      [1, 3],
    ],
  );
  assert.equal(simulate(p, shards).fail?.why, "path");

  const ha = (v: number) =>
    design(
      [
        [1, "app", 2],
        [2, "db", 1],
        [3, "standby", v],
      ],
      [
        [USERS_ID, 1],
        [1, 2],
        [2, 3],
      ],
    );
  const r = inspect(p, ha(1));
  assert.ok(r.ok);
  assert.deepEqual(r.idle, [], "Standby đã nối nhân bản không bị coi là thừa");
  assert.equal(simulate(p, ha(1)).maxTps, 1000);
  assert.equal(simulate(p, ha(0)).maxTps, 400, "Standby Small vừa không kịp nhân bản vừa không gánh nổi khi được nâng lên");
});

test("bot tấn công: không có WAF thì rác đi khắp hệ thống, WAF chặn rác nhưng vẫn gánh tải", () => {
  const p = expert(READ, { incidents: ["bot"] });
  const open = design(
    [
      [1, "app", 1],
      [2, "db", 2],
    ],
    [
      [USERS_ID, 1],
      [1, 2],
    ],
  );
  assert.equal(simulate(p, open).maxTps, 600, "App Medium 1.200 gánh gấp đôi traffic");
  const guarded = design(
    [
      [1, "app", 1],
      [2, "db", 2],
      [3, "waf", 0],
    ],
    [
      [USERS_ID, 3],
      [3, 1],
      [1, 2],
    ],
  );
  const sim = simulate(p, guarded);
  assert.equal(sim.maxTps, 1200);
  assert.equal(sim.levels[0].peak[2], 2 * sim.levels[0].tps, "WAF chịu cả traffic thật lẫn rác");
});

test("Search Index cần CDC từ nguồn, mỗi thao tác ghi thành 2 lượt đánh chỉ mục; chia nguồn để shard", () => {
  const p = expert([
    { kind: "search", name: "Tìm", pct: 50 },
    { kind: "write", name: "Ghi", pct: 50 },
  ]);
  const nodes: [number, Kind, number][] = [
    [1, "app", 2],
    [2, "nosql", 2],
    [3, "search", 1],
  ];
  const noCdc = inspect(
    p,
    design(nodes, [
      [USERS_ID, 1],
      [1, 2],
      [1, 3],
    ]),
  );
  assert.equal(noCdc.ok, false);
  assert.match(noCdc.errors[0].text, /CDC/);
  const one = design(nodes, [
    [USERS_ID, 1],
    [1, 2],
    [1, 3],
    [2, 3],
  ]);
  // Tải index = tìm kiếm T/2 + 2 × ghi T/2 = 1,5T ≤ 1.500.
  assert.equal(simulate(p, one).maxTps, 1000);

  const pair = (edges: [number, number][]) =>
    design(
      [
        [1, "app", 2],
        [2, "nosql", 2],
        [3, "search", 1],
        [4, "nosql", 2],
        [5, "search", 1],
      ],
      [[USERS_ID, 1], [1, 2], [1, 3], [1, 4], [1, 5], ...edges],
    );
  // Mỗi index đánh chỉ mục mọi nguồn nối tới nó: nối chéo thì không giảm tải ghi, mỗi nguồn một index mới thật sự shard.
  assert.equal(simulate(p, pair([[2, 3], [2, 5], [4, 3], [4, 5]])).maxTps, 1200);
  assert.equal(simulate(p, pair([[2, 3], [4, 5]])).maxTps, 2000);
});

test("đề Chuyên gia tự sinh: có sự cố nâng cao, thiết kế tham khảo đạt mục tiêu trong budget", () => {
  for (const [n, preset] of EXPERT_PRESETS.entries()) {
    for (const seed of [n * 31 + 1, n * 31 + 7]) {
      const p = makeProblem(seed * 7919, preset.key, 300, "expert");
      assert.equal(p.mode, "expert");
      assert.equal(p.title, preset.title);
      assert.ok(p.incidents.length >= 2 && p.incidents.some((k) => EXPERT_INCIDENTS.includes(k)), `${preset.key}: ${p.incidents}`);
      const { sim } = autoDesign(p);
      assert.ok(sim.valid && sim.maxTps >= p.target, `${preset.key}: ${sim.maxTps} < ${p.target}`);
      assert.ok(sim.cost <= p.budget, `${preset.key}: ${sim.cost} > ${p.budget}`);
      assert.ok(p.budget < Math.ceil(sim.cost * 1.2), "budget Chuyên gia sát hơn Cơ bản");
    }
  }
});

test("AI: luồng RAG bắt buộc qua Vector DB; Semantic Cache hit giảm tải lên mô hình", () => {
  const p = expert([{ kind: "infer", name: "Hỏi đáp", pct: 100, rag: true }]);
  const direct = design(
    [
      [1, "app", 2],
      [2, "llm", 2],
    ],
    [
      [USERS_ID, 1],
      [1, 2],
    ],
  );
  const r = inspect(p, direct);
  assert.equal(r.ok, false);
  assert.match(r.errors[0].text, /Vector DB/);

  const rag = (withCache: boolean) =>
    design(
      [
        [1, "app", 2],
        [2, "llm", 1],
        [3, "vector", 2],
        ...(withCache ? ([[4, "semcache", 0]] as [number, Kind, number][]) : []),
      ],
      withCache
        ? [
            [USERS_ID, 1],
            [1, 4],
            [4, 3],
            [3, 2],
          ]
        : [
            [USERS_ID, 1],
            [1, 3],
            [3, 2],
          ],
    );
  assert.equal(simulate(p, rag(false)).maxTps, 500, "LLM Tier 2 = 500 TPS");
  // Semantic Cache Small hit 30%: mô hình chỉ nhận 70% → 500 / 0,7 ≈ 714 → mức 700.
  assert.equal(simulate(p, rag(true)).maxTps, 700);
});

test("AI Agent gọi mô hình 3 lần và tool 1 lần cho mỗi tác vụ; thiếu tool là không hợp lệ", () => {
  const p = expert([{ kind: "agent", name: "Agent", pct: 100 }]);
  const noTool = design(
    [
      [1, "app", 2],
      [2, "agent", 2],
      [3, "gpu", 2],
    ],
    [
      [USERS_ID, 1],
      [1, 2],
      [2, 3],
    ],
  );
  const r = inspect(p, noTool);
  assert.equal(r.ok, false);
  assert.match(r.errors[0].text, /tool/);

  const full = design(
    [
      [1, "app", 2],
      [2, "agent", 2],
      [3, "gpu", 2],
      [4, "external", 2],
    ],
    [
      [USERS_ID, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ],
  );
  const sim = simulate(p, full);
  // GPU 8× = 1.100 TPS nhận 3 lượt mỗi tác vụ → tối đa ~366 → mức 350 (bước 50).
  assert.equal(sim.maxTps, 350);
  const lv = sim.levels[0];
  assert.equal(lv.peak[2], 3 * lv.tps);
  assert.equal(lv.peak[3], lv.tps);
});

test("AI: nhà cung cấp LLM sập thì cần mô hình dự phòng; prompt dài làm mô hình còn nửa TPS", () => {
  const p = expert([{ kind: "infer", name: "Chat", pct: 100 }], { incidents: ["llm-down"] });
  const one = design(
    [
      [1, "app", 2],
      [2, "llm", 2],
    ],
    [
      [USERS_ID, 1],
      [1, 2],
    ],
  );
  assert.equal(simulate(p, one).fail?.why, "path");
  const backup = design(
    [
      [1, "app", 2],
      [2, "llm", 2],
      [3, "gpu", 1],
    ],
    [
      [USERS_ID, 1],
      [1, 2],
      [1, 3],
    ],
  );
  // Lúc sự cố GPU 4× (500) gánh toàn bộ.
  assert.equal(simulate(p, backup).maxTps, 500);
  const long = expert([{ kind: "infer", name: "Chat", pct: 100 }], { incidents: ["long-prompt"] });
  assert.equal(simulate(long, one).maxTps, 750, "LLM Tier 3 1.500 TPS còn 750");
});
