/**
 * Lived Continuity — gap-return Success Definition fixtures (Task 1).
 * Gap-return test is expected RED until idle-gated anchor fallback lands.
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
const { addMemory } = await import(srcHref("src/domain/memory.js"));
const { recordChatTurn, recordRelationshipEvent, getAffinity, resetRelationsRuntime } = await import(
  srcHref("src/domain/relations.js")
);
const { buildBehaviorContext } = await import(srcHref("src/domain/behavior.js"));
const { buildSystemPrompt } = await import(srcHref("src/domain/chat.js"));

const ROLE_ID = "role_lc";
const FLIGHT_MEMORY = "用户很怕坐飞机，长途飞行会慌";
const GAP_RETURN_QUERY = "后天要出差，我有点慌";
const DAY_MS = 86400000;

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
  resetRelationsRuntime();
}

function continuitySignals(prompt) {
  const p = String(prompt || "");
  return {
    hasMemory: /怕坐飞机|飞行/.test(p),
    hasRelationship: /Relationship with the user|熟悉|亲近|第一次|Brief:|Stage:/.test(p),
  };
}

function gapReturnChat() {
  return {
    id: "chat_lc_gap",
    roleId: ROLE_ID,
    name: "安静同伴",
    config: { persona: "温柔安静的陪伴者", scenario: "", mesExample: "", speakingStyle: "" },
  };
}

function seedGapReturnRelationship(pastTs) {
  recordChatTurn(ROLE_ID, "安静同伴", pastTs - DAY_MS);
  recordChatTurn(ROLE_ID, "安静同伴", pastTs);
  recordRelationshipEvent(ROLE_ID, {
    type: "note",
    text: "上次聊到出差前的紧张",
    at: pastTs,
  });
  const affinity = getAffinity(ROLE_ID, { moments: [] });
  assert.notEqual(affinity.stage, "none", "seed: relationship stage must not be none");
  assert.ok(affinity.brief || affinity.lastEvent, "seed: brief or lastEvent required");
  assert.ok(Date.now() - affinity.lastChatAt >= 2 * DAY_MS, "seed: lastChatAt must be ≥2 days idle");
  return affinity;
}

console.log("\n=== Lived Continuity (gap-return Success Definition) ===");

test("gap-return prompt continues memory and relationship without user restating", () => {
  resetAll();
  const pastTs = Date.now() - 3 * DAY_MS;
  addMemory(ROLE_ID, FLIGHT_MEMORY, 8, "manual");
  seedGapReturnRelationship(pastTs);

  const chat = gapReturnChat();
  const prompt = buildSystemPrompt(chat, { query: GAP_RETURN_QUERY });
  const sig = continuitySignals(prompt);

  assert.equal(sig.hasMemory, true, "memory must shape the turn the model sees");
  assert.equal(sig.hasRelationship, true, "relationship must shape the turn the model sees");
});

test("continuity integrity: memory-only or relationship-only is insufficient", () => {
  resetAll();
  const memOnly = buildBehaviorContext({
    persona: "角色",
    memories: [{ content: FLIGHT_MEMORY }],
    affinity: null,
  });
  const relOnly = buildBehaviorContext({
    persona: "角色",
    memories: [],
    affinity: {
      toneHint: "更亲近、更熟络",
      stageLabel: "已经熟络",
      brief: "第一次开口",
      knownDays: 5,
    },
  });
  assert.equal(continuitySignals(memOnly).hasRelationship, false);
  assert.equal(continuitySignals(relOnly).hasMemory, false);
});

test("anti-contamination: active no-overlap must not inject flight-fear memory", () => {
  resetAll();
  addMemory(ROLE_ID, FLIGHT_MEMORY, 8, "manual");
  recordChatTurn(ROLE_ID, "安静同伴");
  const affinity = getAffinity(ROLE_ID, { moments: [] });
  assert.ok(Date.now() - affinity.lastChatAt < DAY_MS, "seed: lastChatAt must be recent (active)");

  const chat = gapReturnChat();
  const prompt = buildSystemPrompt(chat, { query: "量子力学作业怎么做" });
  const sig = continuitySignals(prompt);
  assert.equal(sig.hasMemory, false, "must not inject unrelated flight-fear memory on active no-overlap turn");
});

console.log("\n=== Lived Continuity Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log("All lived continuity tests passed.");
