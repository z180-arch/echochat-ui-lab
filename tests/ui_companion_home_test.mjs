/**
 * Companion Home is a lived space, not a character database sheet.
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

const pane = views.slice(views.indexOf("function renderProfilePane"), views.indexOf("function momentDayLabel"));
const more = views.slice(views.indexOf("export function renderProfileMoreContent"), views.indexOf("export function renderCharacterShareCard"));

test("home uses real conversation, moment, memory, worldbook, and relationship", () => {
  assert.match(pane, /listActiveConversations/);
  assert.match(pane, /listMoments/);
  assert.match(pane, /getMemoryList/);
  assert.match(pane, /peekWorldbook/);
  assert.match(pane, /getAffinity/);
  assert.match(pane, /reunionLine/);
  assert.doesNotMatch(pane, /affinity\.(score|level|hearts)/);
});

test("preferences and export are folded into more, not home rows", () => {
  assert.doesNotMatch(pane, /相处偏好/);
  assert.doesNotMatch(pane, /导出角色卡/);
  assert.match(more, /相处偏好/);
  assert.match(more, /导出角色卡/);
});

test("home is not a stack of labeled admin cards", () => {
  assert.match(pane, /companion-home/);
  assert.doesNotMatch(pane, /记忆条数/);
  assert.doesNotMatch(pane, /条设定/);
  assert.doesNotMatch(pane, /embedding|retrieval score|vector|confidence/);
  assert.match(layouts, /\.companion-home \.profile-peek\s*\{[^}]*border:\s*none/);
});

console.log(`\nUI companion home: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
