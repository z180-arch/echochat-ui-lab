/**
 * Context integration: character, memory, relationship, worldbook, lived
 * continuity, and plugin notes must coexist with clear ownership.
 * Does not change storage schema or retrieval.
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
if (typeof globalThis.performance?.now !== "function") {
  globalThis.performance = { now: () => Date.now() };
}
if (typeof global.URL.createObjectURL !== "function") {
  global.URL.createObjectURL = () => "blob:mock";
  global.URL.revokeObjectURL = () => {};
}

const { store } = await import(srcHref("src/core/store.js"));
const { addMemory, getMemoryList } = await import(srcHref("src/domain/memory.js"));
const { assembleTurnContext } = await import(srcHref("src/domain/turn-context.js"));
const { recordChatTurn, recordRelationshipEvent, getAffinity } = await import(
  srcHref("src/domain/relations.js")
);
const { saveWorldbook } = await import(srcHref("src/domain/worldbook.js"));
const { getPluginRegistry, resetPluginRegistry } = await import(srcHref("src/runtime/index.js"));
const { FROZEN_USER_MEMORY_HEADER } = await import(srcHref("src/domain/behavior.js"));
const { isQuietDurableFact } = await import(srcHref("src/domain/memory-candidates.js"));
const { estimateTokens } = await import(srcHref("src/core/utils.js"));

const ROLE_ID = "role_ctx";
const PHOTO = "我最近开始学习摄影";
const WORLD_FILM = "林夏喜欢胶片摄影，常用手动对焦。";
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
  resetPluginRegistry();
}

function chat() {
  return {
    id: "chat_ctx",
    roleId: ROLE_ID,
    name: "林夏",
    config: { persona: "你是林夏，温和、自然、有一点调侃感。" },
  };
}

function seedWorld(content, { constant = true, keys = ["摄影"] } = {}) {
  saveWorldbook({
    version: 2,
    activeGlobalBookId: "global",
    books: [
      {
        id: "global",
        name: "全局世界书",
        scope: "global",
        roleId: null,
        roleKey: null,
        entries: [
          {
            id: "w1",
            name: "胶片",
            keys,
            content,
            enabled: true,
            constant,
            depth: 10,
            priority: 100,
          },
        ],
      },
    ],
  });
}

console.log("\n=== Context Integration ===");

test("frozen memory header is unchanged", () => {
  assert.ok(FROZEN_USER_MEMORY_HEADER.includes("Known about the user (not about you)"));
  assert.ok(FROZEN_USER_MEMORY_HEADER.includes("Leave it in the background unless this turn is clearly about it"));
});

test("Case 1 Memory only: user-owned fact, no world slot", () => {
  resetAll();
  addMemory(ROLE_ID, PHOTO, 7, "auto");
  const prompt = assembleTurnContext(chat(), { query: "对了，我最近学摄影还挺上头的。" }).prompt;
  assert.ok(prompt.includes(FROZEN_USER_MEMORY_HEADER));
  assert.ok(prompt.includes("用户最近开始学习摄影"));
  assert.ok(!/World Information/.test(prompt));
});

test("Case 2 Relationship only: relation is not a user biography", () => {
  resetAll();
  recordChatTurn(ROLE_ID, "林夏");
  recordRelationshipEvent(ROLE_ID, { type: "note", text: "一起熬过夜班" });
  const prompt = assembleTurnContext(chat(), { query: "你好。" }).prompt;
  assert.ok(/Relationship with the user/.test(prompt));
  assert.ok(/not the user's biography/i.test(prompt));
  assert.ok(prompt.includes("一起熬过夜班"));
  assert.ok(!prompt.includes(FROZEN_USER_MEMORY_HEADER));
});

test("Case 3 Worldbook only: lore is not a user fact", () => {
  resetAll();
  seedWorld(WORLD_FILM);
  const prompt = assembleTurnContext(chat(), { query: "今天天气怎么样？" }).prompt;
  assert.ok(/World Information/.test(prompt));
  assert.ok(/not facts about the user/i.test(prompt));
  assert.ok(prompt.includes(WORLD_FILM));
  assert.ok(!prompt.includes(FROZEN_USER_MEMORY_HEADER));
});

test("Case 4 Memory + Worldbook: who owns photography stays split", () => {
  resetAll();
  addMemory(ROLE_ID, PHOTO, 7, "auto");
  seedWorld(WORLD_FILM);
  const prompt = assembleTurnContext(chat(), { query: "我周末想出去拍点东西。" }).prompt;
  const memAt = prompt.indexOf("用户最近开始学习摄影");
  const worldAt = prompt.indexOf(WORLD_FILM);
  assert.ok(memAt >= 0 && worldAt >= 0);
  assert.ok(prompt.includes(FROZEN_USER_MEMORY_HEADER));
  assert.ok(/not facts about the user/i.test(prompt));
  assert.ok(memAt < worldAt, "user memory is assembled before worldbook");
});

test("Case 5 Memory + Relationship both survive", () => {
  resetAll();
  addMemory(ROLE_ID, PHOTO, 7, "auto");
  recordChatTurn(ROLE_ID, "林夏");
  recordRelationshipEvent(ROLE_ID, { type: "note", text: "一起熬过夜班" });
  const prompt = assembleTurnContext(chat(), { query: "对了，我最近学摄影还挺上头的。" }).prompt;
  assert.ok(prompt.includes("用户最近开始学习摄影"));
  assert.ok(prompt.includes("一起熬过夜班"));
  assert.ok(/Relationship with the user/.test(prompt));
});

test("Case 6 long-term fact and a distinct recent fact are both listed once", () => {
  resetAll();
  addMemory(ROLE_ID, PHOTO, 7, "auto");
  addMemory(ROLE_ID, "我周末准备出门拍照", 7, "auto");
  const prompt = assembleTurnContext(chat(), { query: "我周末想出去拍点东西。" }).prompt;
  const a = (prompt.match(/用户最近开始学习摄影/g) || []).length;
  const b = (prompt.match(/用户周末准备出门拍照/g) || []).length;
  assert.equal(a, 1);
  assert.equal(b, 1);
});

test("Error E: identical worldbook copy of a user fact is dropped", () => {
  resetAll();
  addMemory(ROLE_ID, PHOTO, 7, "auto");
  seedWorld("用户最近开始学习摄影");
  const prompt = assembleTurnContext(chat(), { query: "我周末想出去拍点东西。" }).prompt;
  assert.ok(prompt.includes("用户最近开始学习摄影"));
  assert.ok(!/World Information/.test(prompt), "duplicate world chunk must not remain");
});

test("Case 7 full context: character, memory, relation, world, gap, plugin", () => {
  resetAll();
  store.updateSettings({ userPersona: "说话简洁，不喜欢被说教。" });
  addMemory(ROLE_ID, PHOTO, 7, "auto");
  recordChatTurn(ROLE_ID, "林夏", Date.now() - 3 * DAY_MS);
  recordRelationshipEvent(ROLE_ID, { type: "note", text: "上次聊到出门" });
  seedWorld(WORLD_FILM);
  getPluginRegistry().register({
    id: "note",
    name: "Note",
    version: "1",
    extendContext(ctx) {
      return { ...ctx, session: { ...ctx.session, extraPrompt: "PLUGIN_MARK" } };
    },
  });
  const prompt = assembleTurnContext(chat(), { query: "最近怎么样？" }).prompt;
  assert.ok(prompt.includes("你是林夏"));
  assert.ok(prompt.includes("About how the user wants to be seen"));
  assert.ok(prompt.includes("不喜欢被说教"));
  assert.ok(prompt.includes("用户最近开始学习摄影"));
  assert.ok(/Relationship with the user/.test(prompt));
  assert.ok(prompt.includes(WORLD_FILM));
  assert.ok(/continue the lived thread/.test(prompt));
  assert.ok(prompt.includes("PLUGIN_MARK"));
  assert.ok(/not user memory/i.test(prompt));
  const idxChar = prompt.indexOf("你是林夏");
  const idxPersona = prompt.indexOf("About how the user wants to be seen");
  const idxMem = prompt.indexOf("Known about the user");
  const idxRel = prompt.indexOf("Relationship with the user");
  const idxLived = prompt.indexOf("continue the lived thread");
  const idxWorld = prompt.indexOf("World Information");
  const idxPlug = prompt.indexOf("PLUGIN_MARK");
  assert.ok(idxChar < idxPersona && idxPersona < idxMem);
  assert.ok(idxMem < idxRel && idxRel < idxLived && idxLived < idxWorld && idxWorld < idxPlug);
  resetPluginRegistry();
});

test("plugin extraPrompt is not written to memory or relationship", () => {
  resetAll();
  getPluginRegistry().register({
    id: "note",
    name: "Note",
    version: "1",
    extendContext(ctx) {
      return { ...ctx, session: { ...ctx.session, extraPrompt: "PLUGIN_TEST_CONTEXT" } };
    },
  });
  const prompt = assembleTurnContext(chat(), { query: "你好。" }).prompt;
  assert.ok(prompt.includes("PLUGIN_TEST_CONTEXT"));
  assert.ok(/Additional notes \(not user memory\)/.test(prompt));
  assert.equal(getMemoryList(ROLE_ID).length, 0);
  const affinity = getAffinity(ROLE_ID);
  assert.ok(!JSON.stringify(affinity || {}).includes("PLUGIN_TEST_CONTEXT"));
  resetPluginRegistry();
});

test("a weekend outing is not auto-promoted to long-term memory", () => {
  assert.equal(isQuietDurableFact("我周末准备去公园拍照"), false);
  assert.equal(isQuietDurableFact("今天有点累。"), false);
});

test("guitar and exam facts retrieve on-topic and stay quiet off-topic", () => {
  resetAll();
  addMemory(ROLE_ID, "我最近开始学习吉他", 7, "auto");
  const on = assembleTurnContext(chat(), { query: "我最近开始学习吉他。" }).prompt;
  const weak = assembleTurnContext(chat(), { query: "我周末准备出门。" }).prompt;
  const unrelated = assembleTurnContext(chat(), { query: "今天有点累。" }).prompt;
  assert.ok(on.includes("用户最近开始学习吉他"));
  assert.ok(!weak.includes("用户最近开始学习吉他"));
  assert.ok(!unrelated.includes("用户最近开始学习吉他"));
  resetAll();
  addMemory(ROLE_ID, "我最近在准备一个重要考试", 7, "auto");
  const exam = assembleTurnContext(chat(), { query: "我最近在准备一个重要考试。" }).prompt;
  const tired = assembleTurnContext(chat(), { query: "今天有点累。" }).prompt;
  assert.ok(exam.includes("用户最近在准备一个重要考试"));
  assert.ok(!tired.includes("用户最近在准备一个重要考试"));
});

test("full-stack prompt budget has labeled slots and no duplicated user fact", () => {
  resetAll();
  store.updateSettings({ userPersona: "说话简洁，不喜欢被说教。" });
  addMemory(ROLE_ID, PHOTO, 7, "auto");
  recordChatTurn(ROLE_ID, "林夏", Date.now() - 3 * DAY_MS);
  recordRelationshipEvent(ROLE_ID, { type: "note", text: "上次聊到出门" });
  seedWorld(WORLD_FILM);
  getPluginRegistry().register({
    id: "note",
    name: "Note",
    version: "1",
    extendContext(ctx) {
      return { ...ctx, session: { ...ctx.session, extraPrompt: "PLUGIN_TEST_CONTEXT" } };
    },
  });
  const prompt = assembleTurnContext(chat(), { query: "最近怎么样？" }).prompt;
  const photoHits = prompt.split("用户最近开始学习摄影").length - 1;
  assert.equal(photoHits, 1);
  const filmHits = prompt.split(WORLD_FILM).length - 1;
  assert.equal(filmHits, 1);
  assert.ok(prompt.includes("PLUGIN_TEST_CONTEXT"));
  assert.ok(estimateTokens(prompt) < 800);
  console.log(
    `  budget chars=${prompt.length} tokens≈${estimateTokens(prompt)} photoHits=${photoHits} filmHits=${filmHits}`
  );
  resetPluginRegistry();
});

console.log("\n=== Context Integration Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log("All context integration tests passed.");
