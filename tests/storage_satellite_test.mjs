/**
 * Moments + Worldbook canonical Dexie cutover:
 * fresh, legacy-only, Dexie-only, both, duplicates, conflicts,
 * malformed legacy, retry, idempotence, reload, isolation,
 * cascade delete, backup, restore, reset.
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

const { KEYS } = await import(srcHref("src/core/storage.js"));
const { store } = await import(srcHref("src/core/store.js"));
const { installStorageTestHooks, resetStorageTestHooks } = await import(srcHref("src/repository/test-hooks.js"));
const {
  addMoment,
  listMoments,
  deleteMoment,
  hydrateMoments,
  resetMomentsRuntime,
  flushMomentsPersist,
} = await import(srcHref("src/domain/moments.js"));
const {
  addEntry,
  updateEntry,
  deleteEntry,
  ensureCharacterBook,
  getBookForCharacter,
  loadWorldbook,
  saveWorldbook,
  hydrateWorldbook,
  resetWorldbookRuntime,
  flushWorldbookPersist,
} = await import(srcHref("src/domain/worldbook.js"));
const { Character } = await import(srcHref("src/domain/character.js"));
const { deleteConversation } = await import(srcHref("src/domain/conversation.js"));
const { exportProductBackup, importProductBackup, resetProductData } = await import(srcHref("src/domain/backup.js"));
const { recordRelationshipEvent, getAffinity, hydrateRelations, resetRelationsRuntime, flushRelationsPersist } = await import(
  srcHref("src/domain/relations.js")
);
const { markEntityMigrated, clearMigrationFlags, isEntityMigrated } = await import(
  srcHref("src/infrastructure/satellite-reconcile.js")
);

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

function createSatelliteBackend() {
  const moments = new Map();
  let books = [];
  let entries = [];
  let relationships = [];
  return {
    isAvailable: async () => true,
    moment: {
      async findAllRecords() {
        return [...moments.values()].map((row) => ({ ...row }));
      },
      async replaceAll(records) {
        moments.clear();
        for (const row of records || []) {
          if (row && row.id) moments.set(row.id, { ...row });
        }
      },
      _dump: () => [...moments.values()],
    },
    worldbook: {
      async loadSnapshot() {
        return {
          books: books.map((b) => ({ ...b })),
          entries: entries.map((e) => ({ ...e })),
        };
      },
      async replaceSnapshot(snap = {}) {
        books = (snap.books || []).map((b) => ({ ...b }));
        entries = (snap.entries || []).map((e) => ({ ...e }));
      },
      _dump: () => ({ books, entries }),
    },
    relationship: {
      async loadSnapshot() {
        return relationships.map((r) => ({ ...r }));
      },
      async replaceSnapshot(rows) {
        relationships = (rows || []).map((r) => ({ ...r }));
      },
      _dump: () => relationships.slice(),
    },
    _moments: moments,
  };
}

function hookPartial(backend) {
  return {
    isAvailable: backend.isAvailable,
    moment: backend.moment,
    worldbook: backend.worldbook,
    relationship: backend.relationship,
  };
}

function seedLegacyMoment(partial) {
  const cur = JSON.parse(localStorage.getItem(KEYS.MOMENTS) || '{"version":2,"moments":[]}');
  cur.moments.push({
    id: partial.id,
    roleId: partial.roleId,
    roleName: partial.roleName || "角色",
    content: partial.content,
    source: partial.source || "manual",
    createdAt: partial.createdAt || 1000,
    likes: 0,
    likedByUser: false,
    likeNames: [],
    comments: [],
    chatId: partial.chatId || null,
    sourceKey: partial.sourceKey || null,
  });
  localStorage.setItem(KEYS.MOMENTS, JSON.stringify(cur));
}

function seedLegacyWorldbook(book) {
  const cur = JSON.parse(
    localStorage.getItem(KEYS.WORLDBOOK) ||
      '{"version":2,"activeGlobalBookId":"global","books":[{"id":"global","name":"全局世界书","scope":"global","roleId":null,"roleKey":null,"entries":[]}]}'
  );
  const idx = cur.books.findIndex((b) => b.id === book.id);
  if (idx >= 0) cur.books[idx] = book;
  else cur.books.push(book);
  localStorage.setItem(KEYS.WORLDBOOK, JSON.stringify(cur));
}

async function boot(backend) {
  installStorageTestHooks(hookPartial(backend));
  resetMomentsRuntime();
  resetWorldbookRuntime();
  resetRelationsRuntime();
  await hydrateMoments();
  await hydrateWorldbook();
  await hydrateRelations();
}

async function reload(backend) {
  await flushMomentsPersist();
  await flushWorldbookPersist();
  await flushRelationsPersist();
  resetMomentsRuntime();
  resetWorldbookRuntime();
  resetRelationsRuntime();
  installStorageTestHooks(hookPartial(backend));
  await hydrateMoments();
  await hydrateWorldbook();
  await hydrateRelations();
}

function resetAll() {
  localStorage.clear();
  clearMigrationFlags();
  store.reset();
  resetMomentsRuntime();
  resetWorldbookRuntime();
  resetRelationsRuntime();
  resetStorageTestHooks();
}

console.log("\n=== Storage satellite cutover ===");

await testAsync("fresh install", async () => {
  resetAll();
  const backend = createSatelliteBackend();
  await boot(backend);
  assert.equal(listMoments().length, 0);
  assert.ok(loadWorldbook().books.some((b) => b.id === "global"));
  assert.equal(backend.moment._dump().length, 0);
});

await testAsync("legacy-only migration", async () => {
  resetAll();
  seedLegacyMoment({ id: "m1", roleId: "role_a", content: "一起去了咖啡馆", createdAt: 2000 });
  seedLegacyWorldbook({
    id: "char_a",
    name: "A书",
    scope: "character",
    roleId: "role_a",
    roleKey: null,
    entries: [{ id: "e1", name: "港湾", keys: ["港湾"], content: "A lore", enabled: true, constant: true, depth: 10, priority: 100 }],
  });
  const backend = createSatelliteBackend();
  await boot(backend);
  assert.equal(listMoments("role_a").length, 1);
  assert.equal(listMoments("role_a")[0].content, "一起去了咖啡馆");
  assert.equal(listMoments("role_a")[0].source, "manual");
  assert.ok(getBookForCharacter("role_a"));
  assert.ok(getBookForCharacter("role_a").entries.some((e) => e.content === "A lore" && e.constant === true));
  assert.equal(backend.moment._dump().length, 1);
  assert.ok(isEntityMigrated("moments"));
  assert.ok(isEntityMigrated("worldbook"));
});

await testAsync("Dexie-only ignores stale legacy", async () => {
  resetAll();
  const backend = createSatelliteBackend();
  await backend.moment.replaceAll([
    {
      id: "m-dexie",
      characterId: "role_a",
      roleId: "role_a",
      roleName: "林夏",
      content: "Dexie 里的雨夜",
      source: "manual",
      createdAt: 3000,
      likes: 0,
      comments: [],
    },
  ]);
  await backend.worldbook.replaceSnapshot({
    books: [
      { id: "global", name: "全局世界书", scope: "global", characterId: null },
      { id: "char_a", name: "A", scope: "character", characterId: "role_a", roleId: "role_a" },
    ],
    entries: [{ id: "e-d", bookId: "char_a", name: "雨", keys: ["雨"], content: "dexie lore", enabled: true, constant: true, depth: 10, priority: 100 }],
  });
  markEntityMigrated("moments", { count: 1 });
  markEntityMigrated("worldbook", { count: 2 });
  seedLegacyMoment({ id: "m-stale", roleId: "role_a", content: "不该出现的旧痕迹" });
  seedLegacyWorldbook({
    id: "char_a",
    name: "A",
    scope: "character",
    roleId: "role_a",
    roleKey: null,
    entries: [{ id: "e-stale", name: "旧", keys: ["旧"], content: "stale lore", enabled: true, constant: true }],
  });
  await boot(backend);
  assert.equal(listMoments("role_a").length, 1);
  assert.equal(listMoments("role_a")[0].content, "Dexie 里的雨夜");
  assert.ok(!listMoments().some((m) => /不该出现/.test(m.content)));
  assert.ok(getBookForCharacter("role_a").entries.some((e) => e.content === "dexie lore"));
  assert.ok(!getBookForCharacter("role_a").entries.some((e) => e.content === "stale lore"));
});

await testAsync("both populated reconciles by id", async () => {
  resetAll();
  seedLegacyMoment({ id: "m-ls", roleId: "role_a", content: "来自 localStorage", createdAt: 1000 });
  seedLegacyMoment({ id: "m-shared", roleId: "role_a", content: "旧内容", createdAt: 1000 });
  const backend = createSatelliteBackend();
  await backend.moment.replaceAll([
    {
      id: "m-dexie",
      characterId: "role_a",
      roleId: "role_a",
      content: "来自 Dexie",
      source: "manual",
      createdAt: 2000,
      likes: 0,
      comments: [],
    },
    {
      id: "m-shared",
      characterId: "role_a",
      roleId: "role_a",
      content: "新内容",
      source: "manual",
      createdAt: 4000,
      likes: 0,
      comments: [],
    },
  ]);
  await boot(backend);
  const texts = new Set(listMoments("role_a").map((m) => m.content));
  assert.equal(listMoments("role_a").filter((m) => m.id === "m-shared").length, 1);
  assert.equal(texts.size, 3);
  assert.ok(texts.has("来自 Dexie"));
  assert.ok(texts.has("来自 localStorage"));
  assert.ok(texts.has("新内容"));
});

await testAsync("duplicate ids do not multiply on retry", async () => {
  resetAll();
  seedLegacyMoment({ id: "m1", roleId: "role_a", content: "同一条", createdAt: 1000 });
  const backend = createSatelliteBackend();
  await boot(backend);
  await hydrateMoments();
  await hydrateMoments();
  assert.equal(listMoments("role_a").length, 1);
  assert.equal(backend.moment._dump().length, 1);
});

await testAsync("malformed legacy does not crash", async () => {
  resetAll();
  localStorage.setItem(KEYS.MOMENTS, "not-json{{{");
  localStorage.setItem(KEYS.WORLDBOOK, "{bad");
  const backend = createSatelliteBackend();
  await boot(backend);
  assert.equal(listMoments().length, 0);
  assert.ok(loadWorldbook().books.some((b) => b.id === "global"));
});

await testAsync("completed flag with empty Dexie retries from legacy", async () => {
  resetAll();
  seedLegacyMoment({ id: "m-retry", roleId: "role_a", content: "崩溃后恢复", createdAt: 1000 });
  markEntityMigrated("moments", { count: 1 });
  const backend = createSatelliteBackend();
  await boot(backend);
  assert.equal(listMoments("role_a")[0].content, "崩溃后恢复");
  assert.equal(backend.moment._dump().length, 1);
});

await testAsync("reload persistence and runtime is Dexie not localStorage", async () => {
  resetAll();
  const backend = createSatelliteBackend();
  await boot(backend);
  addMoment({ roleId: "role_a", roleName: "林夏", content: "reload 还在", source: "manual" });
  addEntry("global", { name: "雨", keys: ["雨"], content: "global after hydrate", enabled: true, constant: true });
  await flushMomentsPersist();
  await flushWorldbookPersist();
  const lsMoments = localStorage.getItem(KEYS.MOMENTS);
  assert.ok(!lsMoments || !/reload 还在/.test(lsMoments), "post-cutover writes must not use runtime localStorage");
  await reload(backend);
  assert.ok(listMoments("role_a").some((m) => m.content === "reload 还在"));
  assert.ok(loadWorldbook().books.find((b) => b.id === "global").entries.some((e) => e.content === "global after hydrate"));
});

await testAsync("edit and delete persist across reload", async () => {
  resetAll();
  const backend = createSatelliteBackend();
  await boot(backend);
  const book = ensureCharacterBook("role_a", "A");
  const entry = addEntry(book.id, { name: "港湾", keys: ["港湾"], content: "v1", enabled: true, constant: true });
  const moment = addMoment({ roleId: "role_a", roleName: "A", content: "要删的痕迹", source: "manual" });
  updateEntry(book.id, entry.id, { content: "v2" });
  await reload(backend);
  assert.equal(getBookForCharacter("role_a").entries.find((e) => e.id === entry.id).content, "v2");
  deleteEntry(book.id, entry.id);
  deleteMoment(moment.id);
  await reload(backend);
  assert.equal(getBookForCharacter("role_a").entries.length, 0);
  assert.equal(listMoments("role_a").length, 0);
});

await testAsync("character worldbook isolation", async () => {
  resetAll();
  const backend = createSatelliteBackend();
  await boot(backend);
  const a = ensureCharacterBook("role_a", "A");
  const b = ensureCharacterBook("role_b", "B");
  addEntry(a.id, { name: "A", content: "A-only lore", enabled: true, constant: true, keys: ["a"] });
  addEntry(b.id, { name: "B", content: "B-only lore", enabled: true, constant: true, keys: ["b"] });
  await reload(backend);
  assert.ok(getBookForCharacter("role_a").entries.some((e) => e.content === "A-only lore"));
  assert.ok(!getBookForCharacter("role_a").entries.some((e) => e.content === "B-only lore"));
  assert.ok(getBookForCharacter("role_b").entries.some((e) => e.content === "B-only lore"));
});

await testAsync("character delete cascades moments and character worldbook only", async () => {
  resetAll();
  const backend = createSatelliteBackend();
  await boot(backend);
  const chatA = store.createChat({ roleId: "role_del", name: "删", persona: "p" });
  store.createChat({ roleId: "role_keep", name: "留", persona: "p" });
  addMoment({ roleId: "role_del", roleName: "删", content: "删掉的痕迹", source: "manual" });
  addMoment({ roleId: "role_keep", roleName: "留", content: "留下的痕迹", source: "manual" });
  recordRelationshipEvent("role_del", { type: "note", text: "一起熬过夜班" });
  recordRelationshipEvent("role_keep", { type: "note", text: "留下的关系" });
  addEntry("global", { name: "G", content: "keep global", enabled: true, constant: true, keys: ["g"] });
  const book = ensureCharacterBook("role_del", "删的书");
  addEntry(book.id, { name: "gone", content: "character lore gone", enabled: true, constant: true, keys: ["x"] });
  await Character.permanentDeleteCharacter(chatA.roleId);
  await reload(backend);
  assert.equal(listMoments("role_del").length, 0);
  assert.equal(listMoments("role_keep").length, 1);
  assert.ok(!getAffinity("role_del").brief);
  assert.equal(getAffinity("role_keep").brief, "留下的关系");
  assert.equal(getBookForCharacter("role_del"), null);
  assert.ok(loadWorldbook().books.find((b) => b.id === "global").entries.some((e) => e.content === "keep global"));
});

await testAsync("conversation delete only drops chat-scoped moments", async () => {
  resetAll();
  const backend = createSatelliteBackend();
  await boot(backend);
  const chat = store.createChat({ roleId: "role_a", name: "线", persona: "p" });
  addMoment({ roleId: "role_a", roleName: "A", content: "跟着线", source: "auto_summary", chatId: chat.id });
  addMoment({ roleId: "role_a", roleName: "A", content: "跟着角色", source: "reconstruction" });
  await deleteConversation(chat.id);
  await reload(backend);
  const left = listMoments("role_a");
  assert.equal(left.length, 1);
  assert.equal(left[0].content, "跟着角色");
});

await testAsync("backup restore reset", async () => {
  resetAll();
  const backend = createSatelliteBackend();
  await boot(backend);
  const chat = store.createChat({ roleId: "role_bak", name: "林夏", persona: "温和" });
  addMoment({ roleId: chat.roleId, roleName: "林夏", content: "周末去公园", source: "manual" });
  recordRelationshipEvent(chat.roleId, { type: "note", text: "一起熬过夜班" });
  addEntry("global", { name: "胶片", keys: ["摄影"], content: "林夏喜欢胶片摄影。", enabled: true, constant: true });
  await flushMomentsPersist();
  await flushWorldbookPersist();
  await flushRelationsPersist();
  const blob = await exportProductBackup();
  assert.ok((blob.moments?.moments || []).some((m) => /公园/.test(m.content)));
  assert.equal(blob.relations.roles[chat.roleId].brief, "一起熬过夜班");
  assert.ok((blob.worldbook?.books || []).some((b) => (b.entries || []).some((e) => /胶片/.test(e.content))));
  await resetProductData();
  installStorageTestHooks(hookPartial(backend));
  resetMomentsRuntime();
  resetWorldbookRuntime();
  resetRelationsRuntime();
  await hydrateMoments();
  await hydrateWorldbook();
  await hydrateRelations();
  assert.equal(listMoments().length, 0);
  await importProductBackup(blob, "replace");
  await flushMomentsPersist();
  await flushWorldbookPersist();
  await flushRelationsPersist();
  await reload(backend);
  assert.ok(listMoments(chat.roleId).some((m) => /公园/.test(m.content)));
  assert.equal(getAffinity(chat.roleId).brief, "一起熬过夜班");
  assert.ok(loadWorldbook().books.some((b) => (b.entries || []).some((e) => /胶片/.test(e.content))));
  await resetProductData();
  installStorageTestHooks(hookPartial(backend));
  resetMomentsRuntime();
  resetWorldbookRuntime();
  resetRelationsRuntime();
  await hydrateMoments();
  await hydrateWorldbook();
  await hydrateRelations();
  assert.equal(listMoments().length, 0);
  assert.ok(!getAffinity(chat.roleId).brief);
  assert.ok(!loadWorldbook().books.some((b) => (b.entries || []).some((e) => /胶片/.test(e.content))));
});

await testAsync("legacy relations migrate and persist on Dexie", async () => {
  resetAll();
  localStorage.setItem(
    KEYS.RELATIONS,
    JSON.stringify({
      version: 2,
      checkIn: { lastDate: "2026-09-14", streak: 3 },
      roles: {
        role_a: {
          roleName: "林夏",
          brief: "一起熬过夜班",
          events: [{ type: "note", text: "一起熬过夜班", at: 1 }],
          chatTurns: 4,
        },
      },
    })
  );
  const backend = createSatelliteBackend();
  await boot(backend);
  assert.equal(getAffinity("role_a").brief, "一起熬过夜班");
  recordRelationshipEvent("role_a", { type: "note", text: "后来去了咖啡馆" });
  await reload(backend);
  assert.equal(getAffinity("role_a").brief, "后来去了咖啡馆");
  const ls = localStorage.getItem(KEYS.RELATIONS);
  assert.ok(!ls || !/后来去了咖啡馆/.test(ls), "post-cutover relations must not use runtime localStorage");
});

resetStorageTestHooks();
resetMomentsRuntime();
resetWorldbookRuntime();
resetRelationsRuntime();

console.log(`\nStorage satellite: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
