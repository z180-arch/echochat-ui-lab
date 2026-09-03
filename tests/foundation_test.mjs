import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// 跨环境路径解析：基于测试文件位置，不依赖开发机器绝对路径
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
function srcPath(relativePath) {
  return join(PROJECT_ROOT, relativePath);
}

// 浏览器环境 Mock（Node 环境下运行测试需要）
const localStorageMock = (() => {
  let s = {};
  return {
    getItem: (k) => s[k] || null,
    setItem: (k, v) => { s[k] = String(v); },
    removeItem: (k) => { delete s[k]; },
    clear: () => { s = {}; },
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
global.URL = { createObjectURL: () => "blob:mock" };

const { storage, KEYS, runMigrations } = await import("../src/core/storage.js");
const { store } = await import("../src/core/store.js");
const { formatDateTime, todayStr } = await import("../src/core/utils.js");
const { saveChatDraft, loadChatDraft, clearChatDraft } = await import("../src/domain/chat-draft.js");
// ============================================================
//  测试工具
// ============================================================

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

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function resetState() {
  // 清空 localStorage
  Object.keys(KEYS).forEach((k) => storage.remove(KEYS[k]));
  localStorage.clear();
  // 重置 store
  store._state = {
    chats: [],
    currentChatId: null,
    longTermMemory: {},
    settings: { theme: "morning", apiKey: "", model: "", temperature: 1.0 },
    ui: { profileOpen: false, searchQuery: "", activeTab: "chats" },
  };
}

// ============================================================
//  1. Migration Safety Tests
// ============================================================

console.log("\n=== 1. Migration Safety ===");

test("V1→V2 migration: valid data migrates successfully", () => {
  resetState();
  // 设置 V1 数据
  storage.set(KEYS.STATE, {
    version: 1,
    chats: [{
      id: "chat1",
      roleId: "role_test",
      name: "Test",
      messages: [{ id: "m1", role: "me", text: "hello", time: 1000 }],
      config: { persona: { name: "Test" } },
      createdAt: 1000,
    }],
  });
  storage.set(KEYS.META, { schemaVersion: 1 });

  const result = runMigrations();
  assert.equal(result.migrated, true);
  assert.equal(result.to, 2);

  const meta = storage.get(KEYS.META);
  assert.equal(meta.schemaVersion, 2);
});

test("Migration: corrupted source does not mark success", () => {
  resetState();
  storage.set(KEYS.STATE, "corrupted data");
  storage.set(KEYS.META, { schemaVersion: 1 });

  const result = runMigrations();
  // 失败时不应标记 schemaVersion = 2
  const meta = storage.get(KEYS.META);
  assert.equal(meta.schemaVersion, 1);
});

test("Migration: idempotent on v2 data", () => {
  resetState();
  storage.set(KEYS.STATE, { version: 2, chats: [] });
  storage.set(KEYS.META, { schemaVersion: 2 });

  const result = runMigrations();
  assert.equal(result.migrated, false);
  assert.equal(result.from, 2);
  assert.equal(result.to, 2);
});

test("Migration: original data preserved after failure", () => {
  resetState();
  const original = { version: 1, chats: [{ id: "c1", roleId: "r1", name: "Orig" }] };
  storage.set(KEYS.STATE, original);
  storage.set(KEYS.META, { schemaVersion: 1 });

  // 模拟迁移失败：设置损坏的 worldbook
  storage.set(KEYS.WORLDBOOK, "corrupted");

  runMigrations();

  // 原始 state 数据应保留
  const state = storage.get(KEYS.STATE);
  assert.equal(state.chats[0].id, "c1");
  assert.equal(state.chats[0].name, "Orig");
});

// ============================================================
//  2. Message Store Tests (Legacy path)
// ============================================================

console.log("\n=== 2. Message Store (Legacy path) ===");

test("Message: create and read", () => {
  resetState();
  const chat = store.createChat({ roleId: "r1", name: "Test" });
  store.addMessage(chat.id, { role: "me", text: "hello", status: "sent" });

  const updated = store.getState().chats.find((c) => c.id === chat.id);
  assert.equal(updated.messages.length, 1);
  assert.equal(updated.messages[0].text, "hello");
  assert.equal(updated.messages[0].role, "me");
});

test("Message: update", () => {
  resetState();
  const chat = store.createChat({ roleId: "r1", name: "Test" });
  const msg = store.addMessage(chat.id, { role: "her", text: "hi", status: "streaming" });
  store.updateMessage(chat.id, msg.id, { text: "hello there", status: "sent" });

  const updated = store.getState().chats.find((c) => c.id === chat.id);
  assert.equal(updated.messages[0].text, "hello there");
  assert.equal(updated.messages[0].status, "sent");
});

test("Message: delete", () => {
  resetState();
  const chat = store.createChat({ roleId: "r1", name: "Test" });
  const msg1 = store.addMessage(chat.id, { role: "me", text: "first" });
  store.addMessage(chat.id, { role: "her", text: "second" });
  store.deleteMessage(chat.id, msg1.id);

  const updated = store.getState().chats.find((c) => c.id === chat.id);
  assert.equal(updated.messages.length, 1);
  assert.equal(updated.messages[0].text, "second");
});

test("Message: 100 messages performance", () => {
  resetState();
  const chat = store.createChat({ roleId: "r1", name: "Test" });
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    store.addMessage(chat.id, { role: i % 2 === 0 ? "me" : "her", text: `msg ${i}` });
  }
  const elapsed = performance.now() - start;

  const updated = store.getState().chats.find((c) => c.id === chat.id);
  assert.equal(updated.messages.length, 100);
  assert.ok(elapsed < 5000, `100 messages took ${elapsed.toFixed(0)}ms, expected < 5000ms`);
});

test("Message: order and timestamps preserved", () => {
  resetState();
  const chat = store.createChat({ roleId: "r1", name: "Test" });
  const times = [];
  for (let i = 0; i < 10; i++) {
    const msg = store.addMessage(chat.id, { role: "me", text: `msg ${i}` });
    times.push(msg.time);
  }

  const updated = store.getState().chats.find((c) => c.id === chat.id);
  for (let i = 0; i < 10; i++) {
    assert.equal(updated.messages[i].text, `msg ${i}`);
    assert.equal(updated.messages[i].time, times[i]);
  }
});

// ============================================================
//  3. Character / Conversation Tests
// ============================================================

console.log("\n=== 3. Character / Conversation ===");

test("Character: create from template", () => {
  resetState();
  const chat = store.createChat({
    roleId: "role_new",
    name: "Test Character",
    persona: "A test character",
  });

  assert.equal(chat.roleId, "role_new");
  assert.equal(chat.name, "Test Character");
  assert.ok(chat.id);
});

test("Character: multiple conversations per character", () => {
  resetState();
  // 创建第一个对话
  const chat1 = store.createChat({ roleId: "role_multi", name: "Conv 1" });
  // 创建第二个对话（同一角色）
  const chat2 = store.createChat({ roleId: "role_multi", name: "Conv 2" });

  const chats = store.getState().chats.filter((c) => c.roleId === "role_multi");
  assert.equal(chats.length, 2);
  assert.notEqual(chat1.id, chat2.id);
});

test("Conversation: delete does not delete character data", () => {
  resetState();
  const chat1 = store.createChat({ roleId: "role_del", name: "Conv 1" });
  const chat2 = store.createChat({ roleId: "role_del", name: "Conv 2" });
  store.addMessage(chat1.id, { role: "me", text: "message in conv 1" });

  // 删除第一个对话
  store.deleteChat(chat1.id);

  // 第二个对话应保留
  const remaining = store.getState().chats.filter((c) => c.roleId === "role_del");
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, chat2.id);
});

test("Conversation: rename", () => {
  resetState();
  const chat = store.createChat({ roleId: "r1", name: "Old Name" });
  store.updateChat(chat.id, { name: "New Name" });

  const updated = store.getState().chats.find((c) => c.id === chat.id);
  assert.equal(updated.name, "New Name");
});

test("Conversation: archive and restore", () => {
  resetState();
  const chat = store.createChat({ roleId: "r1", name: "Test" });
  store.updateChat(chat.id, { archivedAt: Date.now() });

  let updated = store.getState().chats.find((c) => c.id === chat.id);
  assert.ok(updated.archivedAt);

  store.updateChat(chat.id, { archivedAt: null });
  updated = store.getState().chats.find((c) => c.id === chat.id);
  assert.equal(updated.archivedAt, null);
});

test("Character: soft delete (archive all conversations)", () => {
  resetState();
  const chat1 = store.createChat({ roleId: "role_soft", name: "Conv 1" });
  const chat2 = store.createChat({ roleId: "role_soft", name: "Conv 2" });

  // 软删除：归档所有对话
  store.updateChat(chat1.id, { archivedAt: Date.now() });
  store.updateChat(chat2.id, { archivedAt: Date.now() });

  const chats = store.getState().chats.filter((c) => c.roleId === "role_soft");
  assert.equal(chats.length, 2);
  assert.ok(chats.every((c) => c.archivedAt));
});

// ============================================================
//  4. Architecture Boundary Tests
// ============================================================

console.log("\n=== 4. Architecture Boundary ===");

test("Domain layer: character.js does not import localStorage directly", () => {
  
  const content = readFileSync(srcPath("src/domain/character.js"), "utf-8");
  assert.ok(!content.includes("localStorage.getItem"), "character.js should not use localStorage.getItem");
  assert.ok(!content.includes("localStorage.setItem"), "character.js should not use localStorage.setItem");
});

test("Domain layer: asset.js does not import idb directly", () => {
  
  const content = readFileSync(srcPath("src/domain/asset.js"), "utf-8");
  assert.ok(!content.includes("idb.putBlob"), "asset.js should not use idb.putBlob directly");
  assert.ok(!content.includes("idb.getBlob"), "asset.js should not use idb.getBlob directly");
});

test("Repository layer: interfaces defined", () => {
  
  const content = readFileSync(srcPath("src/repository/interfaces.js"), "utf-8");
  assert.ok(content.includes("CharacterRepository"));
  assert.ok(content.includes("ConversationRepository"));
  assert.ok(content.includes("MessageRepository"));
  assert.ok(content.includes("AssetRepository"));
});

test("Infrastructure: Dexie schema defined", () => {
  
  const content = readFileSync(srcPath("src/infrastructure/dexie-db.js"), "utf-8");
  assert.ok(content.includes("characters"));
  assert.ok(content.includes("conversations"));
  assert.ok(content.includes("messages"));
  assert.ok(content.includes("assets"));
});

// ============================================================
//  5. Data Integrity Tests
// ============================================================

console.log("\n=== 5. Data Integrity ===");

test("Message references valid conversation", () => {
  resetState();
  const chat = store.createChat({ roleId: "r1", name: "Test" });
  store.addMessage(chat.id, { role: "me", text: "test" });

  const state = store.getState();
  for (const c of state.chats) {
    for (const m of c.messages || []) {
      assert.ok(m.id, "Message must have id");
      assert.ok(m.role, "Message must have role");
      assert.ok(m.text !== undefined, "Message must have text");
      assert.ok(m.time, "Message must have timestamp");
    }
  }
});

test("Conversation references valid character", () => {
  resetState();
  store.createChat({ roleId: "r1", name: "Test" });
  const state = store.getState();
  for (const c of state.chats) {
    assert.ok(c.roleId, "Conversation must have roleId");
    assert.ok(c.id, "Conversation must have id");
    assert.ok(c.name, "Conversation must have name");
  }
});

test("Delete conversation removes messages (no orphan)", () => {
  resetState();
  const chat = store.createChat({ roleId: "r1", name: "Test" });
  store.addMessage(chat.id, { role: "me", text: "to be deleted" });
  store.deleteChat(chat.id);

  const state = store.getState();
  const found = state.chats.find((c) => c.id === chat.id);
  assert.equal(found, undefined);
});

console.log("\n=== Datetime + composer drafts ===");

test("formatDateTime: today is HH:MM only", () => {
  const s = formatDateTime(Date.now());
  assert.ok(/^\d{2}:\d{2}$/.test(s), s);
});

test("formatDateTime: yesterday is prefixed", () => {
  const [y, mo, d] = todayStr().split("-").map(Number);
  const ts = new Date(y, mo - 1, d - 1, 19, 54).getTime();
  const s = formatDateTime(ts);
  assert.equal(s, "昨天 19:54");
});

test("chat draft is keyed by conversation id", () => {
  resetState();
  saveChatDraft("c1", "hello");
  saveChatDraft("c2", "other");
  assert.equal(loadChatDraft("c1"), "hello");
  clearChatDraft("c1");
  assert.equal(loadChatDraft("c1"), "");
  assert.equal(loadChatDraft("c2"), "other");
});

// ============================================================
//  6. Storage Boundary: Legacy modules (known exceptions)
// ============================================================

console.log("\n=== 6. Known Legacy Modules (Deferred) ===");

test("moments.js uses storage (deferred to Phase 11)", () => {
  
  const content = readFileSync(srcPath("src/domain/moments.js"), "utf-8");
  assert.ok(content.includes("storage.get"), "moments.js uses storage (known legacy, deferred)");
});

test("relations.js uses storage (deferred to Phase 9)", () => {
  
  const content = readFileSync(srcPath("src/domain/relations.js"), "utf-8");
  assert.ok(content.includes("storage.get"), "relations.js uses storage (known legacy, deferred)");
});

// ============================================================
//  汇总
// ============================================================

console.log("\n" + "=".repeat(50));
console.log(`Foundation Test Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
}
console.log("=".repeat(50));

process.exit(failed > 0 ? 1 : 0);
