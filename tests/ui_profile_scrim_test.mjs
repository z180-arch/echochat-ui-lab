/**
 * Character profile drawer scrim reuses modal overlay tokens.
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
const motion = readFileSync(srcFile("src/styles/motion.css"), "utf8");
const views = readFileSync(srcFile("src/ui/views/index.js"), "utf8");
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

test("profile-mask reuses overlay tokens, sits under the pane", () => {
  const mask = rule(components, ".profile-mask");
  assert.match(mask, /var\(--color-overlay\)/);
  assert.match(mask, /var\(--overlay-blur\)/);
  assert.match(mask, /display:\s*none/);
  assert.match(mask, /calc\(var\(--z-drawer\) - 1\)/);
  assert.doesNotMatch(mask, /rgba\(\s*36,\s*50,\s*56/);
});

test("drawer widths show the scrim; persistent desktop does not", () => {
  const mobile = block(motion, "max-width:\\s*767px");
  const tablet = block(motion, "min-width:\\s*768px\\)\\s*and\\s*\\(max-width:\\s*1023px");
  const compact = block(motion, "min-width:\\s*1024px\\)\\s*and\\s*\\(max-width:\\s*1279px");
  assert.match(mobile, /\.profile-mask\s*\{[^}]*display:\s*block/);
  assert.match(tablet, /\.profile-mask\s*\{[^}]*display:\s*block/);
  assert.match(compact, /\.profile-mask\s*\{[^}]*display:\s*block/);
  assert.doesNotMatch(motion, /rgba\(\s*36,\s*50,\s*56/);
});

test("scrim is a close control and Escape closes overlay drawers", () => {
  assert.match(views, /class="profile-mask"/);
  assert.match(views, /aria-label="关闭角色资料"/);
  assert.match(views, /<button type="button" class="profile-mask"/);
  assert.match(main, /s\.ui\.profileOpen && window\.innerWidth < PROFILE_PERSIST_MIN_WIDTH/);
  assert.match(motion, /prefers-reduced-motion: reduce[\s\S]*\.profile-mask/);
});

console.log(`\nUI profile scrim: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
