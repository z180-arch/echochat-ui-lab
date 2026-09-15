/**
 * In-app icon system stays Lucide-compatible inline SVG (zero-build, no npm icon package).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcFile(relativePath) {
  return join(__dirname, "..", relativePath);
}

const ui = readFileSync(srcFile("src/ui/components/index.js"), "utf8");
const views = readFileSync(srcFile("src/ui/views/index.js"), "utf8");
const pkg = readFileSync(srcFile("package.json"), "utf8");
const tokens = readFileSync(srcFile("src/styles/tokens.css"), "utf8");
const components = readFileSync(srcFile("src/styles/components.css"), "utf8");

const iconBlock = ui.slice(ui.indexOf("export const Icons"), ui.indexOf("let _logoUid"));

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

test("no npm icon package — keep zero-build inline set", () => {
  assert.doesNotMatch(pkg, /lucide|phosphor|@tabler\/icons/i);
  assert.match(iconBlock, /export const Icons/);
});

test("icons share stroke 2, ui-icon class, and Lucide join caps", () => {
  const svgs = [...iconBlock.matchAll(/<svg\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(svgs.length >= 30, `expected full icon set, got ${svgs.length}`);
  for (const svg of svgs) {
    assert.match(svg, /class="ui-icon"/);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /stroke-width="2"/);
    assert.match(svg, /fill="none"/);
    assert.match(svg, /stroke="currentColor"/);
  }
  assert.doesNotMatch(iconBlock, /stroke-width="1\.8"/);
  assert.doesNotMatch(iconBlock, /fill="currentColor"/);
});

test("stop is an outlined square, not a filled glyph", () => {
  assert.match(iconBlock, /stop:\s*`<svg[^>]+fill="none"[^>]*>\s*<rect x="6" y="6" width="12" height="12"/);
});

test("comment is a circle bubble, distinct from chat message square", () => {
  assert.match(iconBlock, /comment:\s*`<svg[^>]*>\s*<path d="M7\.9 20/);
  assert.match(iconBlock, /message:\s*`<svg[^>]*>\s*<path d="M21 15a2 2 0 0 1-2 2H7l-4 4/);
});

test("delete actions use trash; close stays on dismiss", () => {
  assert.match(ui, /aria-label="删除这条记忆">\$\{Icons\.trash\}/);
  assert.match(views, /aria-label="删掉这条痕迹">\$\{Icons\.trash\}/);
  assert.match(views, /aria-label="删除这条记忆">\$\{Icons\.trash\}/);
  assert.match(views, /aria-label="删除条目">\$\{Icons\.trash\}/);
  assert.doesNotMatch(views, /aria-label="删[^"]*">\$\{Icons\.close\}/);
  assert.match(ui, /icon: Icons\.close, title: "关闭"/);
  assert.match(views, /aria-label="关闭">\$\{Icons\.close\}/);
});

test("icon size tokens and ui-icon sizing exist", () => {
  assert.match(tokens, /--icon-size:\s*20px/);
  assert.match(tokens, /--icon-size-sm:\s*16px/);
  assert.match(components, /\.ui-icon[\s\S]{0,120}var\(--icon-size/);
});

console.log(`\nUI icon system: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
