/**
 * Moments feed groups by calendar day with a timeline rail.
 * Empty copy stays for the next product unit.
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
const { addMoment, saveMoments, resetMomentsRuntime } = await import(srcHref("src/domain/moments.js"));
const { renderMomentsFeedHtml } = await import(srcHref("src/ui/views/index.js"));

const views = readFileSync(srcFile("src/ui/views/index.js"), "utf8");
const layouts = readFileSync(srcFile("src/styles/layouts.css"), "utf8");
const motion = readFileSync(srcFile("src/styles/motion.css"), "utf8");

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

function resetAll() {
  localStorage.clear();
  store.reset();
  resetMomentsRuntime();
  saveMoments({ version: 2, moments: [] });
}

test("feed markup groups by day and keeps source off the time line", () => {
  assert.match(views, /function groupMomentsByDay/);
  assert.match(views, /class="moment-day"/);
  assert.match(views, /class="moment-day-label"/);
  assert.match(views, /class="moment-src-tag"/);
  assert.match(views, /class="moment-who-row"/);
  const ctx = views.slice(views.indexOf("function momentContextLine"), views.indexOf("function renderMomentsPane"));
  assert.doesNotMatch(ctx, /momentSourceLabel/);
  assert.match(views, /title: "还没有瞬间"/);
});

test("timeline rail reuses mint tokens, not a second overlay kit", () => {
  assert.match(layouts, /\.moment-day::before\s*\{[^}]*--color-mint/);
  assert.match(layouts, /\.moment-entry\.lived-card::before\s*\{[^}]*--color-mint/);
  assert.match(layouts, /\.moment-src-tag\s*\{[^}]*--color-primary-soft/);
  assert.match(layouts, /\.moment-day-rail\s*\{/);
  assert.match(motion, /prefers-reduced-motion: reduce[\s\S]*\.tab-enter \.moment-entry/);
});

test("two calendar days render as two labeled groups", () => {
  resetAll();
  const now = Date.now();
  const chat = store.createChat({ roleId: "role_a", name: "夜班后", persona: "温和" });
  addMoment({
    roleId: "role_a",
    roleName: "林夏",
    content: "今天下午一起去了咖啡馆",
    source: "lived",
    createdAt: now,
  });
  addMoment({
    roleId: "role_a",
    roleName: "林夏",
    content: "昨天晚上走过那条小路",
    source: "auto_summary",
    chatId: chat.id,
    createdAt: now - 86400000,
  });
  const html = renderMomentsFeedHtml({ filterRoleId: "all" });
  assert.match(html, /class="moments-feed"/);
  assert.equal((html.match(/class="moment-day"/g) || []).length, 2);
  assert.match(html, />今天</);
  assert.match(html, />昨天</);
  assert.match(html, /moment-src-tag">一起</);
  assert.match(html, /moment-src-tag">那天</);
  assert.match(html, /林夏/);
  assert.match(html, /夜班后/);
  assert.doesNotMatch(html, /还没有瞬间/);
});

console.log(`\nUI moments timeline: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
