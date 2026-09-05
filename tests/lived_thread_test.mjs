/**
 * Lived Thread — gap-return replies must continue shared life, not ignore dumps.
 * Cooperative stub: follows explicit this-turn instructions; ignores unlabeled fact lists.
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
const { recordChatTurn, recordRelationshipEvent, getAffinity } = await import(
  srcHref("src/domain/relations.js")
);
const { buildBehaviorContext } = await import(srcHref("src/domain/behavior.js"));
const { buildSystemPrompt } = await import(srcHref("src/domain/chat.js"));

const ROLE_ID = "role_lt";
const FLIGHT_MEMORY = "用户很怕坐飞机，长途飞行会慌";
const GAP_RETURN_QUERY = "后天要出差，我有点慌";
const DAY_MS = 86400000;
const LIVED_TURN = /This turn: continue the lived thread/;

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

function gapReturnChat() {
  return {
    id: "chat_lt_gap",
    roleId: ROLE_ID,
    name: "安静同伴",
    config: { persona: "温柔安静的陪伴者", scenario: "", mesExample: "", speakingStyle: "" },
  };
}

function seedGapReturn(pastTs) {
  addMemory(ROLE_ID, FLIGHT_MEMORY, 8, "manual");
  recordChatTurn(ROLE_ID, "安静同伴", pastTs - DAY_MS);
  recordChatTurn(ROLE_ID, "安静同伴", pastTs);
  recordRelationshipEvent(ROLE_ID, {
    type: "note",
    text: "上次聊到出差前的紧张",
    at: pastTs,
  });
  const affinity = getAffinity(ROLE_ID, { moments: [] });
  assert.ok(Date.now() - affinity.lastChatAt >= 2 * DAY_MS);
  return affinity;
}

/**
 * Cooperative model: uses remembered facts only when this turn is an explicit lived-thread instruction.
 * Dump-only system prompts get a generic surface answer.
 */
function cooperativeCompanionReply(systemPrompt, userText) {
  const prompt = String(systemPrompt || "");
  const hasLivedTurn = LIVED_TURN.test(prompt);
  const hasFlight = /怕坐飞机|飞行会慌/.test(prompt);
  if (hasLivedTurn && hasFlight) {
    return "后天出差的话，你一上飞机就会慌，我们按你能接受的节奏准备。";
  }
  return "后天出差注意休息。";
}

function replyShowsLivedFlight(reply) {
  return /飞机|飞行/.test(String(reply || ""));
}

console.log("\n=== Lived Thread (gap-return behavior contract) ===");

test("dump-only memory×relationship is not enough for a cooperative reply", () => {
  const dump = buildBehaviorContext({
    persona: "温柔安静的陪伴者",
    memories: [{ content: FLIGHT_MEMORY }],
    affinity: {
      toneHint: "略亲近",
      stageLabel: "渐渐熟悉",
      brief: "上次聊到出差前的紧张",
      knownDays: 5,
    },
  });
  assert.ok(/怕坐飞机/.test(dump), "fixture: dump still contains the fact");
  assert.ok(/Relationship with the user/.test(dump), "fixture: dump still contains relationship");
  assert.equal(LIVED_TURN.test(dump), false, "fixture: dump has no this-turn instruction");
  const reply = cooperativeCompanionReply(dump, GAP_RETURN_QUERY);
  assert.equal(replyShowsLivedFlight(reply), false, "unlabeled dump must not force a lived reply");
});

test("gap-return prompt binds this turn to the lived thread", () => {
  resetAll();
  seedGapReturn(Date.now() - 3 * DAY_MS);
  const prompt = buildSystemPrompt(gapReturnChat(), { query: GAP_RETURN_QUERY });
  assert.ok(/怕坐飞机|飞行/.test(prompt), "memory must still be in the prompt");
  assert.ok(/Relationship with the user/.test(prompt), "relationship must still be in the prompt");
  assert.equal(LIVED_TURN.test(prompt), true, "gap-return must instruct this turn to continue the lived thread");
  const reply = cooperativeCompanionReply(prompt, GAP_RETURN_QUERY);
  assert.equal(replyShowsLivedFlight(reply), true, "cooperative reply must show the lived flight fear");
});

test("lived-thread instruction requires both axes on gap-return", () => {
  resetAll();
  const memOnly = buildBehaviorContext({
    persona: "角色",
    memories: [{ content: FLIGHT_MEMORY }],
    affinity: null,
    gapReturn: true,
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
    gapReturn: true,
  });
  assert.equal(LIVED_TURN.test(memOnly), false);
  assert.equal(LIVED_TURN.test(relOnly), false);
});

test("active conversation does not add lived-thread instruction", () => {
  resetAll();
  addMemory(ROLE_ID, FLIGHT_MEMORY, 8, "manual");
  recordChatTurn(ROLE_ID, "安静同伴");
  const prompt = buildSystemPrompt(gapReturnChat(), { query: "量子力学作业怎么做" });
  assert.equal(LIVED_TURN.test(prompt), false);
  assert.equal(/怕坐飞机|飞行/.test(prompt), false);
});

console.log("\n=== Lived Thread Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log("All lived thread tests passed.");
