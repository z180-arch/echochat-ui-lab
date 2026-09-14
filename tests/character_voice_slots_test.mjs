/**
 * Character likes / dislikes / rules stay on Character, not Memory or Worldbook.
 */
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcHref(relativePath) {
  return pathToFileURL(join(__dirname, "..", relativePath)).href;
}

const localStorageMock = (() => {
  let s = {};
  return {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => {
      s[k] = String(v);
    },
    removeItem: (k) => {
      delete s[k];
    },
    clear: () => {
      s = {};
    },
  };
})();

global.window = {
  ECHOCHAT_CONFIG: {},
  localStorage: localStorageMock,
  addEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
};
global.localStorage = localStorageMock;
global.performance = { now: () => Date.now() };
global.URL = { createObjectURL: () => "blob:mock", revokeObjectURL: () => {} };

const { getCharacterSlots } = await import(srcHref("src/domain/context-builder.js"));
const { buildBehaviorContext } = await import(srcHref("src/domain/behavior.js"));
const { parseCharacterCard, buildCharacterCard } = await import(srcHref("src/domain/persona.js"));
const { getMemoryList } = await import(srcHref("src/domain/memory.js"));

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed += 1;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

console.log("\n=== Character voice slots ===\n");

test("likes dislikes and rules inject without touching memory or worldbook", () => {
  const chat = {
    id: "c-slots",
    roleId: "role_slots",
    name: "林晚",
    config: {
      persona: "夜间值班的店员",
      scenario: "便利店打烊后",
      mesExample: "用户: 还在吗\n角色: 灯还亮着。",
      likes: "安静的雨声",
      dislikes: "被催着说话",
      rules: "不要替用户做决定。",
    },
  };
  const slots = getCharacterSlots(chat);
  assert.equal(slots.likes, "安静的雨声");
  assert.equal(slots.dislikes, "被催着说话");
  assert.equal(slots.rules, "不要替用户做决定。");
  const ctx = buildBehaviorContext({ persona: slots.identity, slots });
  assert.ok(ctx.includes("安静的雨声"));
  assert.ok(ctx.includes("被催着说话"));
  assert.ok(ctx.includes("不要替用户做决定"));
  assert.ok(ctx.includes("not world lore"));
  assert.equal(getMemoryList("role_slots").length, 0);
});

test("empty extras stay out of the prompt", () => {
  const chat = { id: "c0", config: { persona: "店员", likes: "", dislikes: "", rules: "" } };
  const slots = getCharacterSlots(chat);
  const ctx = buildBehaviorContext({ persona: slots.identity, slots });
  assert.ok(!/The character likes/i.test(ctx));
  assert.ok(!/How to be with this character/i.test(ctx));
});

test("character card round-trips extras and keeps character_book separate", () => {
  const parsed = parseCharacterCard({
    spec: "chara_card_v2",
    data: {
      name: "林晚",
      description: "店员",
      scenario: "夜里",
      mes_example: "hi",
      system_prompt: "说话短一点",
      character_book: { entries: [{ keys: ["店"], content: "店在巷尾" }] },
      extensions: { echochat: { likes: "黑咖啡", dislikes: "催促" } },
    },
  });
  assert.equal(parsed.likes, "黑咖啡");
  assert.equal(parsed.dislikes, "催促");
  assert.equal(parsed.rules, "说话短一点");
  assert.ok(parsed.worldbook);
  const card = buildCharacterCard({
    roleId: "role_x",
    name: "林晚",
    config: { persona: "店员", likes: "黑咖啡", dislikes: "催促", rules: "说话短一点" },
  });
  assert.equal(card.data.extensions.echochat.likes, "黑咖啡");
  assert.equal(card.data.extensions.echochat.dislikes, "催促");
  assert.equal(card.data.extensions.echochat.rules, "说话短一点");
  assert.equal(card.data.system_prompt, "说话短一点");
});

test("tavern v2 maps description/personality/examples without mixing worldbook", () => {
  const parsed = parseCharacterCard({
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "林晚",
      description: "咖啡店店员，以前在上海上学。",
      personality: "说话短，偶尔停顿。",
      scenario: "打烊后的店里",
      mes_example: "用户: 还在吗\n角色: 灯还亮着。",
      system_prompt: "不要替用户做决定。",
      character_book: { entries: [{ keys: ["店"], content: "店在巷尾" }] },
      extensions: { echochat: { likes: "热可可", dislikes: "香菜" } },
    },
  });
  assert.equal(parsed.persona, "咖啡店店员，以前在上海上学。");
  assert.equal(parsed.speakingStyle, "说话短，偶尔停顿。");
  assert.equal(parsed.scenario, "打烊后的店里");
  assert.ok(parsed.mesExample.includes("灯还亮着"));
  assert.equal(parsed.likes, "热可可");
  assert.equal(parsed.dislikes, "香菜");
  assert.equal(parsed.rules, "不要替用户做决定。");
  assert.equal(parsed.worldbook.entries[0].content, "店在巷尾");
});

console.log(`\nCharacter voice slots: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
