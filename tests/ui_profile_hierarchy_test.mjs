/**
 * Character detail reads as identity → relationship → shared history, not a data sheet.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcFile(relativePath) {
  return join(__dirname, "..", relativePath);
}

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

const pane = views.slice(views.indexOf("function renderProfilePane"), views.indexOf("function momentContextLine"));

test("profile source order is identity, relationship, continuity, support, actions", () => {
  const header = pane.indexOf("profile-header");
  const relate = pane.indexOf("profile-relate");
  const together = pane.indexOf("profile-together");
  const support = pane.indexOf("profile-support");
  const actions = pane.indexOf("profile-actions");
  assert.ok(header >= 0 && relate > header && together > relate && support > together && actions > support);
  assert.match(pane, /关于 TA/);
  assert.match(pane, /关系/);
  assert.match(pane, /一起经历过/);
  assert.ok(actions > pane.indexOf("导出角色卡"));
});

test("identity and relationship are not equal labeled data blocks", () => {
  assert.match(pane, /profile-kicker/);
  assert.match(pane, /profile-lead/);
  assert.doesNotMatch(pane, /profile-section-title">关于 TA/);
  assert.doesNotMatch(pane, /profile-section-title">关系/);
  assert.match(layouts, /\.profile-kicker\s*\{[^}]*--font-micro/);
  assert.match(layouts, /\.profile-relate\s*\{[^}]*--color-mint-soft/);
});

test("edit stays a secondary action, not a mid-panel tool row", () => {
  assert.match(pane, /profile-actions/);
  assert.ok(pane.indexOf("editCharacter") > pane.indexOf("profile-together"));
  assert.doesNotMatch(pane, /profile-tools/);
});

console.log(`\nUI profile hierarchy: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
