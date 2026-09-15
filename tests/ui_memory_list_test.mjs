/**
 * Memory list presentation: user facts with source and time, not a dump.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcHref(relativePath) {
  return pathToFileURL(join(__dirname, "..", relativePath)).href;
}
function srcFile(relativePath) {
  return join(__dirname, "..", relativePath);
}

global.window = {
  ECHOCHAT_CONFIG: {},
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
};

const { MemoryRow, memorySourceLabel } = await import(srcHref("src/ui/components/index.js"));

const views = readFileSync(srcFile("src/ui/views/index.js"), "utf8");
const components = readFileSync(srcFile("src/styles/components.css"), "utf8");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

test("source labels stay on the presentation layer", () => {
  assert.equal(memorySourceLabel("manual"), "写下的");
  assert.equal(memorySourceLabel("candidate"), "从对话");
  assert.equal(memorySourceLabel("auto"), "相处里");
  assert.equal(memorySourceLabel("reconstruction"), "重逢时");
});

test("memory row shows fact, source, time, and delete", () => {
  const html = MemoryRow({
    content: "用户讨厌香菜",
    source: "manual",
    time: "刚刚",
    onDelete: "window.EchoApp.deleteCharacterMemory('r','m')",
  });
  assert.match(html, /用户讨厌香菜/);
  assert.match(html, /写下的/);
  assert.match(html, /刚刚/);
  assert.match(html, /aria-label="删除这条记忆"/);
});

test("continuity journal is about-you then shared traces", () => {
  const journal = views.slice(views.indexOf("function renderContinuityJournal"), views.indexOf("export function renderContinuitySheetContent"));
  const about = journal.indexOf("关于你");
  const together = journal.indexOf("一起经历过");
  assert.ok(about >= 0 && together > about);
  assert.match(journal, /MemoryRow\(/);
  assert.match(journal, /memory-src-tag|source: m\.source/);
  assert.doesNotMatch(journal, /trace-line-memory/);
});

test("memory cards reuse primary-soft tags", () => {
  assert.match(components, /\.memory-src-tag\s*\{[^}]*--color-primary-soft/);
  assert.match(components, /\.memory-list \.memory-row\s*\{[^}]*--color-surface/);
});

console.log(`\nUI memory list: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
