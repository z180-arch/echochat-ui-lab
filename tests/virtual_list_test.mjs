/**
 * Virtual list + tail window: only a viewport of nodes, history stays addressable by id.
 */
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcHref(relativePath) {
  return pathToFileURL(join(__dirname, "..", relativePath)).href;
}

const {
  visibleRange,
  mergeOlder,
  sliceTail,
  VIRT_THRESHOLD,
  VIRT_ESTIMATE_PX,
} = await import(srcHref("src/ui/virtual-list.js"));

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed += 1;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

console.log("\n=== Virtual list / message window ===\n");

test("short lists render every row", () => {
  const r = visibleRange({ count: 20, scrollTop: 0, viewportHeight: 400 });
  assert.equal(r.start, 0);
  assert.equal(r.end, 20);
  assert.equal(r.padTop, 0);
  assert.equal(r.padBottom, 0);
});

test("long lists only cover the viewport plus overscan", () => {
  const r = visibleRange({
    count: 10000,
    scrollTop: 0,
    viewportHeight: 600,
    estimateHeight: 72,
    overscan: 12,
  });
  assert.ok(r.end - r.start < 50, `window ${r.end - r.start} should be << 10000`);
  assert.equal(r.start, 0);
  assert.ok(r.padBottom > 10000);
});

test("bottom of a long list keeps the tail in view", () => {
  const n = 10000;
  const est = 72;
  const view = 600;
  const r = visibleRange({
    count: n,
    scrollTop: n * est - view,
    viewportHeight: view,
    estimateHeight: est,
    overscan: 12,
    stickyTail: 1,
  });
  assert.equal(r.end, n);
  assert.ok(r.start > n - 80, `start ${r.start} should be near the tail`);
  assert.ok(r.padTop > 0);
});

test("measured heights change pad sizes", () => {
  const heights = Array.from({ length: 80 }, () => 40);
  heights[0] = 400;
  const r = visibleRange({
    count: 80,
    scrollTop: 0,
    viewportHeight: 200,
    estimateHeight: 72,
    overscan: 2,
    heights,
  });
  assert.ok(r.end < 80);
  assert.equal(r.padTop, 0);
});

test("mergeOlder prepends unique ids only", () => {
  const cur = [{ id: "b" }, { id: "c" }];
  const older = [{ id: "a" }, { id: "b" }];
  const next = mergeOlder(cur, older);
  assert.deepEqual(next.map((m) => m.id), ["a", "b", "c"]);
});

test("sliceTail keeps the newest page", () => {
  const all = Array.from({ length: 200 }, (_, i) => ({ id: "m" + i }));
  const { items, hasOlder, total } = sliceTail(all, 80);
  assert.equal(total, 200);
  assert.equal(hasOlder, true);
  assert.equal(items.length, 80);
  assert.equal(items[0].id, "m120");
  assert.equal(items[79].id, "m199");
  assert.equal(sliceTail(all.slice(0, 10), 80).hasOlder, false);
});

test("threshold stays at 48 so normal chats skip spacers", () => {
  assert.equal(VIRT_THRESHOLD, 48);
  assert.equal(VIRT_ESTIMATE_PX, 72);
});

console.log(`\nVirtual list: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
