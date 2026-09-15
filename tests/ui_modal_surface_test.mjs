/**
 * Modal / sheet / drawer overlay surfaces — Morning Mint, not a cheap white box.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcFile(relativePath) {
  return join(__dirname, "..", relativePath);
}

const tokens = readFileSync(srcFile("src/styles/tokens.css"), "utf8");
const components = readFileSync(srcFile("src/styles/components.css"), "utf8");
const responsive = readFileSync(srcFile("src/styles/responsive.css"), "utf8");
const motion = readFileSync(srcFile("src/styles/motion.css"), "utf8");
const ui = readFileSync(srcFile("src/ui/components/index.js"), "utf8");

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

function block(css, query) {
  const re = new RegExp(`@media\\s*\\(${query}\\)\\s*\\{`);
  const start = css.search(re);
  assert.ok(start >= 0, `missing @media (${query})`);
  let i = css.indexOf("{", start);
  let depth = 0;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed @media (${query})`);
}

function rule(css, selector) {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[^}]*\\}`);
  const m = css.match(re);
  assert.ok(m, `missing ${selector}`);
  return m[0];
}

test("overlay tokens exist for light and dark", () => {
  assert.match(tokens, /--color-overlay:\s*color-mix/);
  assert.match(tokens, /--overlay-blur:\s*16px/);
  assert.match(tokens, /\[data-theme="dark"\][\s\S]*--color-overlay:/);
});

test("modal overlay uses tokens, not raw black 50%", () => {
  const overlay = rule(components, ".modal-overlay");
  assert.match(overlay, /background:\s*var\(--color-overlay\)/);
  assert.match(overlay, /backdrop-filter:\s*blur\(var\(--overlay-blur\)\)/);
  assert.doesNotMatch(overlay, /rgba\(\s*0,\s*0,\s*0,\s*0\.5\s*\)/);
  assert.doesNotMatch(overlay, /blur\(\s*4px\s*\)/);
});

test("modal panel is elevated mint surface with overflow clip", () => {
  const modal = rule(components, ".modal");
  assert.match(modal, /--color-surface-elevated/);
  assert.match(modal, /--color-mint/);
  assert.match(modal, /overflow:\s*hidden/);
  assert.match(components, /\.modal-header[\s\S]{0,280}--color-mint/);
  assert.match(components, /\.modal-footer[\s\S]{0,280}--color-mint-soft/);
});

test("openModal is a dialog with sheet handle, heading, and Escape", () => {
  assert.match(ui, /export function openModal\(/);
  assert.match(ui, /role="dialog"/);
  assert.match(ui, /aria-modal="true"/);
  assert.match(ui, /modal-handle/);
  assert.match(ui, /<h2 class="modal-title"/);
  assert.match(ui, /e\.key === "Escape"/);
});

test("openConfirm uses modal-copy instead of inline styles", () => {
  const start = ui.indexOf("export function openConfirm");
  const end = ui.indexOf("export function", start + 10);
  const fn = ui.slice(start, end > start ? end : undefined);
  assert.match(fn, /class="modal-copy"/);
  assert.doesNotMatch(fn, /style="margin:0/);
});

test("mobile sheet reveals grab handle", () => {
  const mobile = block(responsive, "max-width:\\s*767px");
  assert.match(mobile, /\.modal-handle\s*\{[^}]*display:\s*block/);
});

test("drawer overlay shares the same overlay language", () => {
  const overlay = rule(components, ".drawer-overlay");
  assert.match(overlay, /var\(--color-overlay\)/);
  assert.match(overlay, /var\(--overlay-blur\)/);
  assert.match(components, /\.drawer\s*\{[^}]*--color-mint/);
});

test("icon-btn uses control-min and focus-visible", () => {
  const btn = rule(components, ".icon-btn");
  assert.match(btn, /var\(--control-min/);
  assert.match(components, /\.icon-btn:focus-visible/);
});

test("reduced motion disables overlay animations", () => {
  assert.match(motion, /prefers-reduced-motion: reduce[\s\S]*\.modal-overlay/);
  assert.match(motion, /prefers-reduced-motion: reduce[\s\S]*\.drawer-overlay/);
});

console.log(`\nUI modal surface: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
