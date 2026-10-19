import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { isDevtoolsShortcut, PAUSED_MS, PROBE_MS, STUCK_MS, watchDevtools, type ProbeWorker } from "./devtools.ts";

const key = (code: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}, k = code) => ({
  key: k,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

test("nhận ra phím tắt mở DevTools trên Windows, Linux, macOS", () => {
  assert.ok(isDevtoolsShortcut(key("F12")));
  for (const c of ["KeyI", "KeyJ", "KeyC"]) {
    assert.ok(isDevtoolsShortcut(key(c, { ctrlKey: true, shiftKey: true })), `Ctrl+Shift+${c}`);
    // macOS: giữ ⌥ làm `key` thành ký tự khác (⌘⌥I → "ˆ"), nên phải so theo `code`.
    assert.ok(isDevtoolsShortcut(key(c, { metaKey: true, altKey: true }, "ˆ")), `⌘⌥${c}`);
  }
});

test("bỏ qua phím tắt thường dùng khi chơi", () => {
  assert.ok(!isDevtoolsShortcut(key("KeyC", { ctrlKey: true })));
  assert.ok(!isDevtoolsShortcut(key("KeyC", { metaKey: true })));
  assert.ok(!isDevtoolsShortcut(key("KeyI", { shiftKey: true })));
  assert.ok(!isDevtoolsShortcut(key("KeyU", { ctrlKey: true }))); // xem mã nguồn — không mở DevTools
  assert.ok(!isDevtoolsShortcut(key("KeyA", { ctrlKey: true, shiftKey: true })));
  assert.ok(!isDevtoolsShortcut(key("Enter")));
});

function rig(opts: { probe?: () => boolean } = {}) {
  mock.timers.enable({ apis: ["setInterval"] });
  let clock = 0;
  const asked: number[] = [];
  const worker: ProbeWorker = {
    onmessage: null,
    postMessage: (id: number) => void asked.push(id),
    terminate: () => {},
  };
  const opened: string[] = [];
  const target = new EventTarget();
  const stop = watchDevtools(
    { keys: () => true, probe: opts.probe ?? (() => true) },
    (how) => opened.push(how),
    { spawn: () => worker, now: () => clock, target },
  );
  return {
    asked,
    opened,
    target,
    tick(late = 0) {
      clock += PROBE_MS + late;
      mock.timers.tick(PROBE_MS);
    },
    reply(dt: number) {
      worker.onmessage?.({ data: { id: asked.at(-1), dt } } as MessageEvent);
    },
    stop() {
      stop();
      mock.timers.reset();
    },
  };
}

test("worker trả lời ngay: DevTools đóng, không báo", () => {
  const r = rig();
  for (let i = 0; i < 10; i++) {
    r.tick();
    r.reply(0.1);
  }
  assert.equal(r.asked.length, 10);
  assert.deepEqual(r.opened, []);
  r.stop();
});

test("worker dừng ở debugger rồi chạy tiếp: báo theo thời gian worker tự đo", () => {
  const r = rig();
  r.tick();
  r.reply(PAUSED_MS + 400);
  assert.deepEqual(r.opened, ["debugger"]);
  r.stop();
});

test("worker dừng mãi không trả lời: báo sau ngưỡng kẹt", () => {
  const r = rig();
  r.tick();
  for (let t = PROBE_MS; t <= STUCK_MS; t += PROBE_MS) r.tick();
  assert.deepEqual(r.opened, []);
  r.tick();
  assert.deepEqual(r.opened, ["debugger"]);
  r.stop();
});

test("trang chính bị nghẽn (lời đáp còn kẹt trong hàng đợi) thì không kết luận", () => {
  const r = rig();
  r.tick();
  r.tick(STUCK_MS);
  assert.deepEqual(r.opened, []);
  r.reply(0.1);
  r.tick();
  r.reply(0.1);
  assert.deepEqual(r.opened, []);
  r.stop();
});

test("ngoài ván không dò bằng worker, lời đáp muộn của lượt cũ bị bỏ qua", () => {
  let playing = true;
  const r = rig({ probe: () => playing });
  r.tick();
  playing = false;
  r.tick();
  r.reply(PAUSED_MS + 400);
  for (let i = 0; i < 5; i++) r.tick();
  assert.equal(r.asked.length, 1);
  assert.deepEqual(r.opened, []);
  r.stop();
});

test("phím tắt báo ngay", () => {
  const r = rig();
  const e = Object.assign(new Event("keydown"), { key: "F12", code: "F12", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
  r.target.dispatchEvent(e);
  assert.deepEqual(r.opened, ["shortcut"]);
  r.stop();
});
