/**
 * Memory Dexie canonical persist + retrieval after reload.
 * Retrieval ranking is unchanged; this only asserts the storage cutover.
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

const { store } = await import(srcHref("src/core/store.js"));
const { installStorageTestHooks, resetStorageTestHooks } = await import(srcHref("src/repository/test-hooks.js"));
const {
  addMemory,
  getMemoryList,
  retrieveMemoriesForTurn,
  hydrateMemories,
  resetMemoriesRuntime,
  flushMemoriesPersist,
  clearMemory,
} = await import(srcHref("src/domain/memory.js"));
const { Character } = await import(srcHref("src/domain/character.js"));
const { deleteConversation } = await import(srcHref("src/domain/conversation.js"));
const { exportProductBackup, importProductBackup, resetProductData } = await import(srcHref("src/domain/backup.js"));
const { markEntityMigrated, clearMigrationFlags, isEntityMigrated } = await import(
  srcHref("src/infrastructure/satellite-reconcile.js")
);
const { assembleTurnContext } = await import(srcHref("src/domain/turn-context.js"));
const { FROZEN_USER_MEMORY_HEADER } = await import(srcHref("src/domain/behavior.js"));

let passed = 0;
let failed = 0;
const failures = [];

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed += 1;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function createMemoryBackend() {
  const memories = new Map();
  return {
    isAvailable: async () => true,
    memory: {
      async findAllRecords() {
        return [...memories.values()].map((row) => ({ ...row }));
      },
      async replaceAll(records) {
        memories.clear();
        for (const row of records || []) {
          if (row && row.id) memories.set(row.id, { ...row });
        }
      },
      _dump: () => [...memories.values()],
    },
  };
}

function hookPartial(backend) {
  return { isAvailable: backend.isAvailable, memory: backend.memory };
}

async function boot(backend) {
  installStorageTestHooks(hookPartial(backend));
  resetMemoriesRuntime();
  await hydrateMemories();
}

async function reload(backend) {
  await flushMemoriesPersist();
  resetMemoriesRuntime();
  installStorageTestHooks(hookPartial(backend));
  await hydrateMemories();
}

function resetAll() {
  localStorage.clear();
  clearMigrationFlags();
  store.reset();
  resetMemoriesRuntime();
  resetStorageTestHooks();
}

console.log("\n=== Memory canonical persist ===");

await testAsync("create persist reload retrieval", async () => {
  resetAll();
  const backend = createMemoryBackend();
  await boot(backend);
  addMemory("role_a", "我最近开始学习吉他", 7, "auto");
  addMemory("role_a", "我最近在准备一个重要考试", 7, "auto");
  await reload(backend);
  assert.equal(getMemoryList("role_a").length, 2);
  const hit = retrieveMemoriesForTurn("role_a", "我最近开始学习吉他。");
  assert.ok(hit.some((m) => /吉他/.test(m.content)));
  const quiet = retrieveMemoriesForTurn("role_a", "今天有点累。");
  assert.ok(!quiet.some((m) => /吉他/.test(m.content)));
});

await testAsync("legacy store migrates once", async () => {
  resetAll();
  store.set((s) => ({
    ...s,
    longTermMemory: {
      role_a: {
        roleName: "林夏",
        memories: [{ id: "m1", content: "我最近开始学习摄影", importance: 7, createdAt: 1000, source: "auto" }],
      },
    },
  }));
  const backend = createMemoryBackend();
  await boot(backend);
  assert.ok(getMemoryList("role_a").some((m) => /摄影/.test(m.content)));
  assert.equal(backend.memory._dump().length, 1);
  assert.ok(isEntityMigrated("memories"));
  await hydrateMemories();
  assert.equal(getMemoryList("role_a").length, 1);
});

await testAsync("Dexie-only ignores stale store dump", async () => {
  resetAll();
  const backend = createMemoryBackend();
  await backend.memory.replaceAll([
    {
      id: "m-dexie",
      characterId: "role_a",
      content: "我最近开始学习吉他",
      importance: 7,
      source: "auto",
      createdAt: 2000,
    },
  ]);
  markEntityMigrated("memories", { count: 1 });
  store.set((s) => ({
    ...s,
    longTermMemory: {
      role_a: {
        roleName: "林夏",
        memories: [{ id: "m-stale", content: "不该出现的旧记忆", importance: 9, createdAt: 1, source: "auto" }],
      },
    },
  }));
  await boot(backend);
  assert.equal(getMemoryList("role_a").length, 1);
  assert.ok(getMemoryList("role_a")[0].content.includes("吉他"));
});

await testAsync("completed empty Dexie retries from store", async () => {
  resetAll();
  store.set((s) => ({
    ...s,
    longTermMemory: {
      role_a: {
        memories: [{ id: "m-retry", content: "我最近在准备一个重要考试", importance: 7, createdAt: 1, source: "auto" }],
      },
    },
  }));
  markEntityMigrated("memories", { count: 1 });
  const backend = createMemoryBackend();
  await boot(backend);
  assert.ok(getMemoryList("role_a").some((m) => /考试/.test(m.content)));
});

await testAsync("character delete clears only that character memory", async () => {
  resetAll();
  const backend = createMemoryBackend();
  await boot(backend);
  const chat = store.createChat({ roleId: "role_del", name: "删", persona: "p" });
  store.createChat({ roleId: "role_keep", name: "留", persona: "p" });
  addMemory("role_del", "我最近开始学习吉他", 7, "auto");
  addMemory("role_keep", "我最近开始学习摄影", 7, "auto");
  await Character.permanentDeleteCharacter(chat.roleId);
  await reload(backend);
  assert.equal(getMemoryList("role_del").length, 0);
  assert.equal(getMemoryList("role_keep").length, 1);
});

await testAsync("conversation delete does not drop character memory", async () => {
  resetAll();
  const backend = createMemoryBackend();
  await boot(backend);
  const chat = store.createChat({ roleId: "role_a", name: "线", persona: "p" });
  addMemory("role_a", "我最近开始学习吉他", 7, "auto");
  await deleteConversation(chat.id);
  await reload(backend);
  assert.equal(getMemoryList("role_a").length, 1);
});

await testAsync("backup restore reset and retrieval", async () => {
  resetAll();
  const backend = createMemoryBackend();
  await boot(backend);
  addMemory("role_bak", "我最近开始学习摄影", 7, "auto");
  await flushMemoriesPersist();
  const blob = await exportProductBackup();
  assert.ok((blob.memories?.role_bak?.memories || []).some((m) => /摄影/.test(m.content)));
  await resetProductData();
  installStorageTestHooks(hookPartial(backend));
  resetMemoriesRuntime();
  await hydrateMemories();
  assert.equal(getMemoryList("role_bak").length, 0);
  await importProductBackup(blob, "replace");
  await flushMemoriesPersist();
  await reload(backend);
  assert.ok(getMemoryList("role_bak").some((m) => /摄影/.test(m.content)));
  const prompt = assembleTurnContext(
    { id: "c", roleId: "role_bak", name: "林夏", config: { persona: "温和" } },
    { query: "我周末想出去拍点东西。" }
  ).prompt;
  assert.ok(prompt.includes(FROZEN_USER_MEMORY_HEADER));
  assert.ok(prompt.includes("用户最近开始学习摄影"));
  await resetProductData();
  installStorageTestHooks(hookPartial(backend));
  resetMemoriesRuntime();
  await hydrateMemories();
  assert.equal(getMemoryList("role_bak").length, 0);
});

await testAsync("clearMemory is persistable", async () => {
  resetAll();
  const backend = createMemoryBackend();
  await boot(backend);
  addMemory("role_a", "我最近开始学习吉他", 7, "auto");
  clearMemory("role_a");
  await reload(backend);
  assert.equal(getMemoryList("role_a").length, 0);
});

resetStorageTestHooks();
resetMemoriesRuntime();

console.log(`\nMemory persist: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
