/**
 * Wave 1 UI refinement — presentation only.
 * Hub stage dedupe, Profile stage copy, composer count visibility.
 */
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcHref(relativePath) {
  return pathToFileURL(join(__dirname, "..", relativePath)).href;
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

const {
  presentCompanionStage,
  hubSecondaryLine,
  hubShowsStageChip,
  relationshipEmptyCopy,
  composerCountVisible,
} = await import(srcHref("src/ui/present.js"));
const { CharacterCard, RelationshipBrief } = await import(srcHref("src/ui/components/index.js"));
const { MAX_USER_MESSAGE_CHARS } = await import(srcHref("src/domain/reply-clean.js"));

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

test("never talked → 还没有聊过", () => {
  const p = presentCompanionStage(null, false);
  assert.equal(p.label, "还没有聊过");
  assert.equal(hubSecondaryLine(p), "还没有聊过");
  assert.equal(relationshipEmptyCopy(p), "还没有聊过。开口第一句，关系从这里开始。");
});

test("hasTalk without affinity history → 刚刚认识, not 还没有聊过", () => {
  const p = presentCompanionStage({ hasHistory: false, stage: "none", stageLabel: "还没有聊过" }, true);
  assert.equal(p.label, "刚刚认识");
  assert.equal(hubSecondaryLine(p), "刚刚认识");
  const copy = relationshipEmptyCopy(p);
  assert.ok(copy.includes("刚刚认识"));
  assert.ok(!copy.includes("还没有聊过"));
});

test("hasHistory uses affinity stageLabel and days on one hub line", () => {
  const p = presentCompanionStage(
    { hasHistory: true, stage: "familiar", stageLabel: "渐渐熟悉", knownDays: 12 },
    true
  );
  assert.equal(p.label, "渐渐熟悉");
  assert.equal(hubSecondaryLine(p), "渐渐熟悉 · 12 天");
  assert.equal(hubShowsStageChip("渐渐熟悉 · 12 天", "渐渐熟悉"), false);
});

test("Hub chip is omitted when subtitle already carries the stage", () => {
  assert.equal(hubShowsStageChip("刚刚认识", "刚刚认识"), false);
  assert.equal(hubShowsStageChip("还没有聊过", "还没有聊过"), false);
});

test("CharacterCard does not repeat the same stage string", () => {
  const html = CharacterCard({
    name: "林晚",
    presence: "刚刚认识",
    stageLabel: "刚刚认识",
    stage: "warming",
    lastLine: "昨晚说了晚安",
  });
  assert.equal((html.match(/刚刚认识/g) || []).length, 1);
  assert.ok(!html.includes("stage-chip"));
  assert.ok(html.includes("林晚"));
  assert.ok(html.includes("昨晚说了晚安"));
});

test("CharacterCard with combined hub line still hides duplicate chip", () => {
  const html = CharacterCard({
    name: "林晚",
    presence: "渐渐熟悉 · 12 天",
    stageLabel: "渐渐熟悉",
    stage: "familiar",
  });
  assert.equal((html.match(/渐渐熟悉/g) || []).length, 1);
  assert.ok(!html.includes("stage-chip"));
});

test("RelationshipBrief hasTalk agrees with header label", () => {
  const html = RelationshipBrief({
    affinity: { hasHistory: false, stageLabel: "还没有聊过", stage: "none" },
    hasTalk: true,
  });
  assert.ok(html.includes("刚刚认识"));
  assert.ok(!html.includes("还没有聊过"));
});

test("RelationshipBrief never-talked keeps the empty copy", () => {
  const html = RelationshipBrief({ affinity: { hasHistory: false }, hasTalk: false });
  assert.ok(html.includes("还没有聊过"));
});

test("RelationshipBrief hasHistory keeps affinity stageLabel", () => {
  const html = RelationshipBrief({
    affinity: {
      hasHistory: true,
      stage: "familiar",
      stageLabel: "渐渐熟悉",
      toneHint: "略亲近",
      knownDays: 12,
      brief: "",
      lastEvent: "",
    },
    hasTalk: true,
  });
  assert.ok(html.includes("渐渐熟悉"));
  assert.ok(!html.includes("还没有聊过"));
});

test("composer count is quiet until near the cap", () => {
  assert.equal(composerCountVisible(0, MAX_USER_MESSAGE_CHARS), false);
  assert.equal(composerCountVisible(100, MAX_USER_MESSAGE_CHARS), false);
  assert.equal(composerCountVisible(1799, MAX_USER_MESSAGE_CHARS), false);
  assert.equal(composerCountVisible(1800, MAX_USER_MESSAGE_CHARS), true);
  assert.equal(composerCountVisible(2001, MAX_USER_MESSAGE_CHARS), true);
});

console.log(`\nUI Refinement Wave 1: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
