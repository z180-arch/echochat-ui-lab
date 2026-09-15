/**
 * Companion Home reads as identity → talking → recent → us → about you → world.
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

test("profile source order is identity, now, recent, us, about you, world, actions", () => {
  const header = pane.indexOf("profile-header");
  const now = pane.indexOf("profile-now");
  const together = pane.indexOf("profile-together");
  const relate = pane.indexOf("profile-relate");
  const you = pane.indexOf("profile-you");
  const support = pane.indexOf("profile-support");
  const actions = pane.indexOf("profile-actions");
  assert.ok(header >= 0 && now > header && together > now && relate > together && you > relate && support > you && actions > support);
  assert.match(pane, /正在聊/);
  assert.match(pane, />最近</);
  assert.match(pane, />我们</);
  assert.match(pane, />关于你</);
  assert.match(pane, />这个世界</);
  assert.ok(!pane.includes("导出角色卡"));
  assert.ok(views.includes("导出角色卡"));
});

test("identity is a lead, not an equal labeled data block", () => {
  assert.match(pane, /profile-lead/);
  assert.match(pane, /companion-identity/);
  assert.doesNotMatch(pane, /关于 TA/);
  assert.doesNotMatch(pane, /profile-section-title">关系/);
  assert.match(layouts, /\.profile-kicker\s*\{[^}]*--font-micro/);
  assert.match(layouts, /\.profile-header\s*\{[^}]*text-align:\s*left/);
  assert.match(layouts, /\.profile-relate\s*\{[^}]*--color-mint/);
  assert.match(layouts, /\.companion-home\s*\{/);
});

test("edit stays a secondary action, not a mid-panel tool row", () => {
  assert.match(pane, /profile-actions/);
  assert.ok(pane.indexOf("editCharacter") > pane.indexOf("profile-together"));
  assert.doesNotMatch(pane, /profile-tools/);
});

test("overlay continue chat uses persist breakpoint, not phone-only", () => {
  assert.match(pane, /PROFILE_PERSIST_MIN_WIDTH/);
  assert.match(pane, /继续聊天/);
  assert.match(pane, /开始聊天/);
});

console.log(`\nUI profile hierarchy: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
