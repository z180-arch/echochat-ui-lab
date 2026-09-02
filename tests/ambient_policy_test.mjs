/**
 * V1.1 WP0 — Ambient policy is deterministic and chat-quiet.
 */
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const href = pathToFileURL(join(__dirname, "..", "src/ui/ambient-policy.js")).href;
const { resolveAmbientPolicy } = await import(href);

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

console.log("\n--- Ambient policy ---");

test("Chat 强制关闭，即使用户选了 strong", () => {
  const p = resolveAmbientPolicy({
    view: "app",
    activeTab: "companion",
    chatOpen: true,
    userIntensity: "strong",
    viewportWidth: 1440,
  });
  assert.equal(p.mode, "off");
  assert.equal(p.intensity, "off");
  assert.equal(p.reason, "chat");
});

test("Welcome 允许 medium，strong 会被封顶", () => {
  const mid = resolveAmbientPolicy({
    view: "landing",
    userIntensity: "medium",
    viewportWidth: 1440,
  });
  assert.equal(mid.mode, "landing");
  assert.equal(mid.intensity, "medium");
  const cap = resolveAmbientPolicy({
    view: "landing",
    userIntensity: "strong",
    viewportWidth: 390,
  });
  assert.equal(cap.mode, "landing");
  assert.equal(cap.intensity, "medium");
});

test("Hub 桌面弱、手机关", () => {
  const desk = resolveAmbientPolicy({
    view: "app",
    activeTab: "companion",
    chatOpen: false,
    userIntensity: "medium",
    viewportWidth: 1440,
  });
  assert.equal(desk.mode, "app");
  assert.equal(desk.intensity, "weak");
  const phone = resolveAmbientPolicy({
    view: "app",
    activeTab: "companion",
    chatOpen: false,
    userIntensity: "medium",
    viewportWidth: 390,
  });
  assert.equal(phone.mode, "off");
  assert.equal(phone.intensity, "off");
});

test("Moments / Me 与 Hub 同一套 cap", () => {
  for (const tab of ["moments", "me"]) {
    const desk = resolveAmbientPolicy({
      view: "app",
      activeTab: tab,
      chatOpen: false,
      userIntensity: "strong",
      viewportWidth: 1280,
    });
    assert.equal(desk.intensity, "weak");
    const phone = resolveAmbientPolicy({
      view: "app",
      activeTab: tab,
      userIntensity: "strong",
      viewportWidth: 390,
    });
    assert.equal(phone.intensity, "off");
  }
});

test("用户 Off 全局保持 Off", () => {
  const p = resolveAmbientPolicy({
    view: "landing",
    userIntensity: "off",
    viewportWidth: 1440,
  });
  assert.equal(p.intensity, "off");
});

test("reduced-motion 与 save-data 关闭氛围", () => {
  assert.equal(
    resolveAmbientPolicy({ view: "landing", userIntensity: "medium", prefersReducedMotion: true }).mode,
    "off"
  );
  assert.equal(
    resolveAmbientPolicy({ view: "landing", userIntensity: "medium", saveData: true }).reason,
    "save-data"
  );
});

test("陪伴空列表不算 Chat", () => {
  const p = resolveAmbientPolicy({
    view: "app",
    activeTab: "companion",
    chatOpen: false,
    userIntensity: "weak",
    viewportWidth: 1440,
  });
  assert.equal(p.mode, "app");
  assert.equal(p.intensity, "weak");
});

console.log(`\nAmbient policy: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.error(`  ${f.name}: ${f.error}`));
  process.exit(1);
}
