/**
 * Conversation thread switcher is a current-thread list, not a data sheet.
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

const { renderConversationThreadList } = await import(srcHref("src/ui/views/index.js"));

const views = readFileSync(srcFile("src/ui/views/index.js"), "utf8");
const main = readFileSync(srcFile("src/main.js"), "utf8");
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

test("switcher and preferences share the thread list", () => {
  assert.match(views, /export function renderConversationThreadList/);
  assert.match(main, /renderConversationThreadList\(\{ convos, currentId: chat\.id \}\)/);
  assert.match(views, /renderConversationThreadList\(\{ convos, currentId: chat\.id \}\)/);
  assert.match(main, /的相处/);
});

test("active thread, rename, and delete are visible actions", () => {
  const html = renderConversationThreadList({
    convos: [
      { id: "c1", threadTitle: "日常相处", lastPreview: "今晚还在吗", lastAt: Date.now() },
      { id: "c2", threadTitle: "雨夜便利店", lastPreview: "", lastAt: Date.now() - 86400000 },
    ],
    currentId: "c1",
  });
  assert.match(html, /正在聊/);
  assert.match(html, /日常相处/);
  assert.match(html, /雨夜便利店/);
  assert.match(html, /还没有聊过/);
  assert.match(html, /aria-label="改名"/);
  assert.match(html, /aria-label="删除这条相处线"/);
  assert.doesNotMatch(html, />改名</);
  assert.equal((html.match(/class="conv-row"/g) || []).length, 2);
});

test("chat header hides the thread chip until there is more than one chat", () => {
  assert.match(views, /showThreadChip = roleId && convos.length > 1/);
  assert.doesNotMatch(views, /threadChipLabel = convos.length > 1 \? currentThreadTitle : "相处线"/);
});

test("thread rows reuse mint/primary surfaces and 44px tools", () => {
  assert.match(layouts, /\.conv-item\.on\s*\{[^}]*--color-primary-soft/);
  assert.match(layouts, /\.conv-now\s*\{[^}]*--font-micro/);
  assert.match(layouts, /\.conv-tool\s*\{[^}]*--control-min/);
  assert.match(layouts, /\.conv-item\s*\{[^}]*min-height:\s*44px/);
});

console.log(`\nUI conversation list: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
