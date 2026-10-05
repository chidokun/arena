import assert from "node:assert/strict";
import { test } from "node:test";
import { Keyring } from "./seal.ts";

test("hai bên mở được hộp của nhau, người thứ ba thì không", async () => {
  const host = await Keyring.create();
  const alice = await Keyring.create();
  const eve = await Keyring.create();
  const box = await host.seal(alice.pub, "s:1:alice", { role: "seer" });
  assert.deepEqual(await alice.open(host.pub, "s:1:alice", box), { role: "seer" });
  // Người gửi tự mở lại được hộp mình đóng.
  assert.deepEqual(await host.open(alice.pub, "s:1:alice", box), { role: "seer" });
  assert.equal(await eve.open(host.pub, "s:1:alice", box), null);
  // Bê hộp sang khoá bản ghi khác thì không mở được.
  assert.equal(await alice.open(host.pub, "s:1:bob", box), null);
});

test("hộp độn về cùng cỡ, mỗi lần đóng ra một hộp khác", async () => {
  const a = await Keyring.create();
  const b = await Keyring.create();
  const short = await a.seal(b.pub, "k", { role: "villager" }, 300);
  const long = await a.seal(b.pub, "k", { role: "wolf", pack: ["x", "y"], picks: { x: "z" } }, 300);
  assert.equal(short.length, long.length);
  assert.notEqual(await a.seal(b.pub, "k", 1), await a.seal(b.pub, "k", 1));
});

test("khôi phục khoá đã cất", async () => {
  let saved: string | null = null;
  const store = { get: () => saved, set: (v: string) => void (saved = v) };
  const first = await Keyring.create(store);
  const again = await Keyring.create(store);
  assert.equal(first.pub, again.pub);
  const other = await Keyring.create();
  const box = await other.seal(first.pub, "k", "hi");
  assert.equal(await again.open(other.pub, "k", box), "hi");
});
