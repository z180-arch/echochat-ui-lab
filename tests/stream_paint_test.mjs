/**
 * Streaming paint: history DOM stays still, markdown stays escaped,
 * throttle avoids per-token full markdown.
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
  closeOpenMarkdownFences,
  streamingMarkdown,
  shouldPaintNow,
  STREAM_PAINT_MIN_MS,
  nearBottom,
  patchStreamingBubble,
  streamSignature,
} = await import(srcHref("src/ui/stream-paint.js"));
const { renderMarkdown } = await import(srcHref("src/core/utils.js"));

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

console.log("\n=== Stream paint ===\n");

test("open fence is closed only for the streaming preview", () => {
  const open = closeOpenMarkdownFences("见：\n```js\nconst x = 1;");
  assert.ok(open.endsWith("```"));
  assert.equal(closeOpenMarkdownFences("```js\nconst x = 1;\n```"), "```js\nconst x = 1;\n```");
});

test("streaming markdown still escapes HTML and rejects javascript URLs", () => {
  const dirty = streamingMarkdown("hi <img src=x onerror=alert(1)> [x](javascript:alert(1))\n```js\n<script>x</script>\n");
  assert.ok(!dirty.includes("<img"));
  assert.ok(!dirty.includes("javascript:"));
  assert.ok(!dirty.includes("<script>x</script>"));
  assert.ok(dirty.includes("md-code"));
  assert.equal(streamingMarkdown("**bold**").includes("<strong>"), true);
});

test("completed markdown path is unchanged", () => {
  assert.equal(renderMarkdown("[x](javascript:alert(1))").includes("href="), false);
  assert.ok(renderMarkdown("```\ncode\n```").includes("md-pre"));
});

test("throttle waits STREAM_PAINT_MIN_MS", () => {
  assert.equal(STREAM_PAINT_MIN_MS, 48);
  assert.equal(shouldPaintNow(0, 10), true);
  assert.equal(shouldPaintNow(100, 120, 48), false);
  assert.equal(shouldPaintNow(100, 148, 48), true);
});

test("near-bottom uses a 120px latch", () => {
  assert.equal(nearBottom({ scrollHeight: 1000, scrollTop: 900, clientHeight: 80 }), true);
  assert.equal(nearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 80 }), false);
});

test("bubble patch is idempotent for the same signature", () => {
  const writes = [];
  const bubble = {
    innerHTML: "",
    attrs: {},
    getAttribute(k) {
      return this.attrs[k];
    },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
  };
  Object.defineProperty(bubble, "innerHTML", {
    get() {
      return this._html || "";
    },
    set(v) {
      this._html = v;
      writes.push(v);
    },
  });
  const html = streamingMarkdown("你好");
  const sig = streamSignature("你好");
  patchStreamingBubble(bubble, html, sig);
  patchStreamingBubble(bubble, html, sig);
  assert.equal(writes.length, 1);
  patchStreamingBubble(bubble, streamingMarkdown("你好呀"), streamSignature("你好呀"));
  assert.equal(writes.length, 2);
});

test("1000 markdown list renders are much heavier than one streaming patch", () => {
  const line = "这是一条普通消息，带一点 **强调** 和 `code`。";
  const tList = performance.now();
  let acc = "";
  for (let i = 0; i < 400; i++) acc += renderMarkdown(`${line} ${i}`);
  const listMs = performance.now() - tList;
  const tOne = performance.now();
  streamingMarkdown(`${line}\n\`\`\`js\nconst n = 1;\n\`\`\``);
  const oneMs = performance.now() - tOne;
  assert.ok(acc.length > 1000);
  console.log(`    list ${listMs.toFixed(1)}ms · one ${oneMs.toFixed(1)}ms`);
  assert.ok(oneMs <= listMs + 10, `one ${oneMs} should not exceed list ${listMs}`);
});

console.log(`\nStream paint: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
