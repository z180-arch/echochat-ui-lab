/**
 * Moments empty state explains what traces are, not "暂无内容".
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

const localStorageMock = (() => {
  let s = {};
  return {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => {
      s[k] = String(v);
    },
    removeItem: (k) => {
      delete s[k];
    },
    clear: () => {
      s = {};
    },
  };
})();

global.window = {
  ECHOCHAT_CONFIG: {},
  localStorage: localStorageMock,
  addEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
};
global.localStorage = localStorageMock;
if (typeof globalThis.performance?.now !== "function") {
  globalThis.performance = { now: () => Date.now() };
}

const { store } = await import(srcHref("src/core/store.js"));
const { saveMoments, resetMomentsRuntime } = await import(srcHref("src/domain/moments.js"));
const { renderMomentsFeedHtml } = await import(srcHref("src/ui/views/index.js"));

const views = readFileSync(srcFile("src/ui/views/index.js"), "utf8");
const layouts = readFileSync(srcFile("src/styles/layouts.css"), "utf8");

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

test("empty copy says what traces are and how they appear", () => {
  const feed = views.slice(views.indexOf("export function renderMomentsFeedHtml"), views.indexOf("return `<div class=\"moments-feed\">${groupMomentsByDay"));
  assert.match(feed, /还没有一起经历过的事/);
  assert.match(feed, /按天留在这里/);
  assert.match(feed, /不是整段聊天记录/);
  assert.match(feed, /去相处/);
  assert.doesNotMatch(feed, /暂无内容/);
  assert.doesNotMatch(feed, /还没有瞬间/);
});

test("empty sits in the moments feed and reuses mint surface", () => {
  assert.match(layouts, /\.moments-feed\.moments-empty\s*\{[^}]*display:\s*flex/);
  assert.match(layouts, /\.moments-empty \.empty-icon\s*\{[^}]*--color-mint-soft/);
});

test("empty markup is one title, one explanation, one action", () => {
  localStorage.clear();
  store.reset();
  resetMomentsRuntime();
  saveMoments({ version: 2, moments: [] });
  const html = renderMomentsFeedHtml({
    filterRoleId: "all",
    emptyAction: "window.EchoApp.switchTab('companion')",
  });
  assert.match(html, /class="moments-feed moments-empty"/);
  assert.equal((html.match(/empty-title/g) || []).length, 1);
  assert.equal((html.match(/empty-desc/g) || []).length, 1);
  assert.equal((html.match(/btn-primary/g) || []).length, 1);
  assert.match(html, /还没有一起经历过的事/);
  assert.match(html, /按天留在这里/);
  assert.match(html, /去相处/);
});

console.log(`\nUI moments empty: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
