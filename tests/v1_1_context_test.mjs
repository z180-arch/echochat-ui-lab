/**
 * V1.1 Context Builder, turn-relevant memory, relationship brief.
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
    get length() {
      return Object.keys(s).length;
    },
    key: (i) => Object.keys(s)[i],
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

const { store } = await import(srcHref("src/core/store.js"));
const { addMemory, retrieveMemoriesForTurn, getLastMemoryRetrieve } = await import(
  srcHref("src/domain/memory.js")
);
const { recordChatTurn, recordRelationshipEvent, getAffinity } = await import(
  srcHref("src/domain/relations.js")
);
const { buildBehaviorContext } = await import(srcHref("src/domain/behavior.js"));
const { getCharacterSlots, getActiveUserPersona } = await import(
  srcHref("src/domain/context-builder.js")
);
const { buildSystemPrompt } = await import(srcHref("src/domain/chat.js"));

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

function resetAll() {
  localStorage.clear();
  store.reset();
}

console.log("\n=== V1.1 Context / Memory / Relations ===");

test("empty character slots are omitted from the prompt", () => {
  resetAll();
  const chat = {
    id: "c1",
    roleId: "role_empty",
    name: "空",
    config: { persona: "温柔店员", scenario: "", mesExample: "", speakingStyle: "" },
  };
  const slots = getCharacterSlots(chat);
  assert.equal(slots.identity, "温柔店员");
  assert.equal(slots.scenario, "");
  const ctx = buildBehaviorContext({ persona: slots.identity, slots, memories: [], affinity: null });
  assert.ok(ctx.includes("温柔店员"));
  assert.ok(!/Scenario/i.test(ctx));
  assert.ok(!/Example dialogue/i.test(ctx));
  assert.ok(!/Speaking style/i.test(ctx));
});

test("filled slots appear; empties stay out", () => {
  const chat = {
    id: "c2",
    roleId: "role_slots",
    config: {
      persona: "身份句",
      scenario: "深夜便利店",
      mesExample: "用户: 在吗\n角色: 在的。",
      speakingStyle: "短句，不喊外号",
    },
  };
  const slots = getCharacterSlots(chat);
  const ctx = buildBehaviorContext({ persona: slots.identity, slots });
  assert.ok(ctx.includes("身份句"));
  assert.ok(ctx.includes("深夜便利店"));
  assert.ok(ctx.includes("短句，不喊外号"));
  assert.ok(ctx.includes("在吗"));
});

test("user persona injects only when present", () => {
  resetAll();
  assert.equal(getActiveUserPersona(), "");
  store.updateSettings({ userPersona: "我是夜班护士，说话直接。" });
  assert.ok(getActiveUserPersona().includes("夜班护士"));
  const ctx = buildBehaviorContext({
    persona: "角色",
    userPersona: getActiveUserPersona(),
  });
  assert.ok(ctx.includes("夜班护士"));
  store.updateSettings({ userPersona: "" });
  const empty = buildBehaviorContext({ persona: "角色", userPersona: getActiveUserPersona() });
  assert.ok(!empty.includes("夜班护士"));
});

test("retrieval prefers overlapping facts over unrelated high importance", () => {
  resetAll();
  addMemory("role_r", "用户讨厌香菜", 9, "manual");
  addMemory("role_r", "用户养了一只橘猫", 3, "manual");
  addMemory("role_r", "用户下周要出差", 8, "manual");
  const hit = retrieveMemoriesForTurn("role_r", "今晚吃香菜炒饭可以吗", 2);
  assert.ok(hit.some((m) => m.content.includes("香菜")));
  assert.equal(hit[0].content.includes("香菜"), true);
  const last = getLastMemoryRetrieve();
  assert.equal(last.hadHit, true);
  const miss = retrieveMemoriesForTurn("role_r", "量子力学作业", 2);
  assert.equal(getLastMemoryRetrieve().hadHit, false);
  void miss;
});

test("relationship brief appears next to tone", () => {
  resetAll();
  recordChatTurn("role_b", "B");
  recordRelationshipEvent("role_b", { type: "note", text: "一起熬过夜班" });
  const a = getAffinity("role_b", { moments: [] });
  assert.equal(a.brief, "一起熬过夜班");
  assert.equal(a.lastEvent, "一起熬过夜班");
  const ctx = buildBehaviorContext({
    persona: "同事",
    affinity: a,
  });
  assert.ok(ctx.includes("Brief:"));
  assert.ok(ctx.includes("一起熬过夜班"));
  assert.ok(ctx.includes("Tone:") || ctx.includes(a.toneHint));
});

test("first chat turn records a first-meeting event without changing affinity math", () => {
  resetAll();
  recordChatTurn("role_first", "F");
  const a = getAffinity("role_first", { moments: [] });
  assert.equal(a.turns, 1);
  assert.equal(a.stage, "warming");
  assert.ok(a.lastEvent.includes("第一次") || a.brief.includes("第一次"));
});

test("buildSystemPrompt includes slots, user persona, overlapping memory; no api key", () => {
  resetAll();
  const chat = {
    id: "c_prompt",
    roleId: "role_p",
    name: "预览",
    config: { persona: "安静的人", scenario: "旧书店", mesExample: "", speakingStyle: "" },
  };
  addMemory(chat.roleId, "用户只喝冰美式", 7, "manual");
  store.updateSettings({ userPersona: "我说话很慢。" });
  const prompt = buildSystemPrompt(chat, { query: "来一杯冰美式" });
  assert.ok(prompt.includes("安静的人"));
  assert.ok(prompt.includes("旧书店"));
  assert.ok(prompt.includes("冰美式"));
  assert.ok(prompt.includes("说话很慢"));
  assert.ok(!/sk-|api[_-]?key|siliconflow\.cn\/v1\/chat/i.test(prompt));
});

console.log("\n=== V1.1 Context Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log("All v1.1 context tests passed.");
