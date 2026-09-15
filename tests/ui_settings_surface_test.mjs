/**
 * Settings rows share 我的 language: icon wells, hover, real buttons.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcFile(relativePath) {
  return join(__dirname, "..", relativePath);
}

const components = readFileSync(srcFile("src/styles/components.css"), "utf8");
const ui = readFileSync(srcFile("src/ui/components/index.js"), "utf8");
const main = readFileSync(srcFile("src/main.js"), "utf8");

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

test("setting-row icon well matches 我的 mint wells", () => {
  assert.match(components, /\.setting-row-icon\s*\{[^}]*border-radius:\s*var\(--radius-md\)/);
  assert.match(components, /\.setting-row-icon\s*\{[^}]*background:\s*var\(--color-primary-soft\)/);
  assert.match(components, /\.setting-row-icon\s*\{[^}]*color:\s*var\(--color-primary\)/);
});

test("clickable setting rows are buttons with hover and focus", () => {
  assert.match(ui, /const tag = clickable \? "button" : "div"/);
  assert.match(components, /button\.setting-row:hover/);
  assert.match(components, /\.setting-row:focus-visible/);
  assert.match(components, /\.setting-row\s*\{[^}]*padding:\s*var\(--space-4\)/);
  assert.match(components, /\.setting-row\s*\{[^}]*min-height:\s*44px/);
});

test("destructive backup actions use danger tone without shouting the whole list", () => {
  assert.match(main, /title: "清空所有对话"[\s\S]{0,120}tone: "danger"/);
  assert.match(main, /title: "重置应用"[\s\S]{0,120}tone: "danger"/);
  assert.match(components, /\.setting-row-danger \.setting-row-icon/);
  assert.doesNotMatch(components, /\.settings-group-title[^{]*\{[^}]*text-transform:\s*uppercase/);
});

console.log(`\nUI settings surface: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
