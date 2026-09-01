/**
 * Storage Cutover regression tests (Batch 1: Message / Conversation / Character)
 *
 * Node has no IndexedDB. Tests inject an in-memory Dexie-shaped backend
 * via repository test hooks so the Dexie-first read path is actually exercised.
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
global.URL = { createObjectURL: () => "blob:mock" };

const { storage, KEYS } = await import(srcHref("src/core/storage.js"));
const { store } = await import(srcHref("src/core/store.js"));
const { installStorageTestHooks, resetStorageTestHooks } = await import(
  srcHref("src/repository/test-hooks.js")
);
const { MessageRepository } = await import(srcHref("src/repository/message.js"));
const { ConversationRepository } = await import(srcHref("src/repository/conversation.js"));
const { CharacterRepository } = await import(srcHref("src/repository/character.js"));
const { messageStore } = await import(srcHref("src/domain/message-store.js"));
const { Conversation } = await import(srcHref("src/domain/conversation.js"));
const { Character } = await import(srcHref("src/domain/character.js"));

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

function createMemoryBackends() {
  const messages = new Map();
  const conversations = new Map();
  const characters = new Map();

  const message = {
    async findById(id) {
      return messages.get(id) || null;
    },
    async findByConversationId(conversationId, options = {}) {
      const { page = 1, pageSize = 50, before, after } = options;
      let items = [...messages.values()].filter((m) => m.conversationId === conversationId);
      if (before) items = items.filter((m) => m.createdAt < before);
      if (after) items = items.filter((m) => m.createdAt > after);
      items.sort((a, b) => a.createdAt - b.createdAt);
      const total = items.length;
      if (page === 1 && pageSize >= total) {
        return { items, total, page, pageSize, hasMore: false };
      }
      const newestFirst = items.slice().reverse();
      const start = (page - 1) * pageSize;
      const pageItems = newestFirst.slice(start, start + pageSize).reverse();
      return {
        items: pageItems,
        total,
        page,
        pageSize,
        hasMore: start + pageSize < total,
      };
    },
    async create(msg) {
      const record = {
        id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conversationId: msg.conversationId,
        parentMessageId: msg.parentMessageId || null,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt || Date.now(),
        updatedAt: msg.updatedAt || Date.now(),
        status: msg.status || "sent",
        metadata: msg.metadata || {},
      };
      messages.set(record.id, record);
      return record;
    },
    async update(id, updates) {
      const existing = messages.get(id);
      if (!existing) return null;
      const record = { ...existing, ...updates, updatedAt: Date.now() };
      messages.set(id, record);
      return record;
    },
    async delete(id) {
      messages.delete(id);
    },
    async countByConversationId(conversationId) {
      return [...messages.values()].filter((m) => m.conversationId === conversationId).length;
    },
    async search(conversationId, query) {
      const lower = query.toLowerCase();
      return [...messages.values()].filter(
        (m) => m.conversationId === conversationId && (m.content || "").toLowerCase().includes(lower)
      );
    },
    async findLatest(conversationId) {
      const items = [...messages.values()]
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => b.createdAt - a.createdAt);
      return items[0] || null;
    },
    async findBranches(parentMessageId) {
      return [...messages.values()].filter((m) => m.parentMessageId === parentMessageId);
    },
    async bulkCreate(arr) {
      const out = [];
      for (const m of arr) out.push(await this.create(m));
      return out;
    },
    async deleteByConversationId(conversationId) {
      for (const [id, m] of messages) {
        if (m.conversationId === conversationId) messages.delete(id);
      }
    },
    _dump: () => [...messages.values()],
  };

  const conversation = {
    async findById(id) {
      return conversations.get(id) || null;
    },
    async findAll(options = {}) {
      let items = [...conversations.values()];
      if (options.includeArchived === false) {
        items = items.filter((c) => c.status !== "archived" && !c.archivedAt);
      }
      return items.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
    },
    async findByCharacterId(characterId, options = {}) {
      let items = [...conversations.values()].filter((c) => c.characterId === characterId);
      if (options.includeArchived === false) {
        items = items.filter((c) => c.status !== "archived" && !c.archivedAt);
      }
      return items;
    },
    async create(conv) {
      const record = {
        id: conv.id || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        characterId: conv.characterId,
        title: conv.title || "",
        status: conv.status || "active",
        config: conv.config || {},
        messageCount: conv.messageCount ?? 0,
        lastMessageAt: conv.lastMessageAt || conv.createdAt || Date.now(),
        createdAt: conv.createdAt || Date.now(),
        updatedAt: conv.updatedAt || Date.now(),
        archivedAt: conv.archivedAt || null,
      };
      conversations.set(record.id, record);
      return record;
    },
    async update(id, updates) {
      const existing = conversations.get(id);
      if (!existing) return null;
      const record = { ...existing, ...updates, updatedAt: Date.now() };
      conversations.set(id, record);
      return record;
    },
    async archive(id) {
      return this.update(id, { status: "archived", archivedAt: Date.now() });
    },
    async unarchive(id) {
      return this.update(id, { status: "active", archivedAt: null });
    },
    async delete(id) {
      conversations.delete(id);
    },
    async countByCharacterId(characterId) {
      return [...conversations.values()].filter((c) => c.characterId === characterId).length;
    },
    _dump: () => [...conversations.values()],
  };

  const character = {
    async findById(id) {
      return characters.get(id) || null;
    },
    async findAll(options = {}) {
      let items = [...characters.values()];
      if (!options.includeGuides) items = items.filter((c) => !c.isGuide);
      if (options.source) items = items.filter((c) => c.source === options.source);
      return items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    },
    async create(char) {
      const record = {
        id: char.id || `char-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: char.name || "",
        avatar: char.avatar || null,
        identity: char.identity || "",
        personality: char.personality || {},
        appearance: char.appearance || {},
        speakingStyle: char.speakingStyle || {},
        preferences: char.preferences || {},
        source: char.source || "user_created",
        isGuide: char.isGuide || false,
        status: char.status || "active",
        createdAt: char.createdAt || Date.now(),
        updatedAt: char.updatedAt || Date.now(),
      };
      characters.set(record.id, record);
      return record;
    },
    async update(id, updates) {
      const existing = characters.get(id);
      if (!existing) return null;
      const record = { ...existing, ...updates, updatedAt: Date.now() };
      characters.set(id, record);
      return record;
    },
    async permanentDelete(id) {
      characters.delete(id);
    },
    _dump: () => [...characters.values()],
  };

  return {
    isAvailable: async () => true,
    message,
    conversation,
    character,
    _messages: messages,
    _conversations: conversations,
    _characters: characters,
  };
}

function resetAppState() {
  Object.keys(KEYS).forEach((k) => storage.remove(KEYS[k]));
  localStorage.clear();
  store._state = {
    schemaVersion: 2,
    chats: [],
    currentChatId: null,
    longTermMemory: {},
    settings: { theme: "light", apiKey: "", model: "", temperature: 1.0 },
    ui: { profileOpen: false, searchQuery: "", activeTab: "messages" },
    global: { persona: "" },
    userPersonaPresets: [],
    memoryCfg: { maxPerRole: 20, injectMax: 10, autoSummary: { enabled: true, everyTurns: 20, maxLength: 200 } },
  };
  if (typeof messageStore.resetRuntime === "function") messageStore.resetRuntime();
}

function installBackend() {
  const backend = createMemoryBackends();
  installStorageTestHooks({
    isAvailable: backend.isAvailable,
    message: backend.message,
    conversation: backend.conversation,
    character: backend.character,
  });
  if (typeof messageStore.resetRuntime === "function") messageStore.resetRuntime();
  return backend;
}

// ============================================================
//  1. Message Dexie Read Cutover
// ============================================================

console.log("\n=== 1. Message Dexie Read Cutover ===");

await testAsync("getMessages prefers Dexie over localStorage when Dexie has data", async () => {
  resetAppState();
  const backend = installBackend();
  const chat = store.createChat({ roleId: "r1", name: "DexieRead" });
  await messageStore.addMessage(chat.id, { role: "me", text: "from-dual-write", status: "sent" });

  const storeChat = store.getState().chats.find((c) => c.id === chat.id);
  storeChat.messages[0].text = "CORRUPTED_LOCALSTORAGE";

  const msgs = await messageStore.getMessages(chat.id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].text, "from-dual-write");
  assert.notEqual(msgs[0].text, "CORRUPTED_LOCALSTORAGE");
  assert.ok(backend._messages.size >= 1);
});

await testAsync("getMessages returns all messages, not default page of 50", async () => {
  resetAppState();
  installBackend();
  const chat = store.createChat({ roleId: "r1", name: "Long" });
  for (let i = 0; i < 80; i++) {
    await messageStore.addMessage(chat.id, { role: i % 2 === 0 ? "me" : "her", text: `m${i}`, status: "sent" });
  }
  const msgs = await messageStore.getMessages(chat.id);
  assert.equal(msgs.length, 80);
  assert.equal(msgs[0].text, "m0");
  assert.equal(msgs[79].text, "m79");
});

await testAsync("message order is chronological after Dexie read", async () => {
  resetAppState();
  installBackend();
  const chat = store.createChat({ roleId: "r1", name: "Order" });
  const texts = [];
  for (let i = 0; i < 12; i++) {
    const msg = await messageStore.addMessage(chat.id, { role: "me", text: `ord-${i}`, status: "sent" });
    texts.push(msg.text);
  }
  const msgs = await messageStore.getMessages(chat.id);
  assert.equal(msgs.map((m) => m.text).join(","), texts.join(","));
  for (let i = 1; i < msgs.length; i++) {
    assert.ok(msgs[i].time >= msgs[i - 1].time, "timestamps non-decreasing");
  }
});

await testAsync("empty conversation stays empty (does not resurrect legacy dump)", async () => {
  resetAppState();
  const backend = installBackend();
  const chat = store.createChat({ roleId: "r1", name: "Empty" });
  await ConversationRepository.create({
    id: chat.id,
    characterId: chat.roleId,
    title: chat.name,
    config: chat.config,
  });
  const msgs = await messageStore.getMessages(chat.id);
  assert.equal(msgs.length, 0);
  assert.equal(backend._messages.size, 0);
});

await testAsync("unmigrated localStorage messages remain readable (fallback)", async () => {
  resetAppState();
  installBackend();
  const chat = store.createChat({ roleId: "r1", name: "LegacyOnly" });
  store.addMessage(chat.id, { role: "me", text: "only-in-legacy", status: "sent" });
  const msgs = await messageStore.getMessages(chat.id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].text, "only-in-legacy");
});

await testAsync("migrateChatMessages copies legacy into Dexie and is idempotent", async () => {
  resetAppState();
  const backend = installBackend();
  const chat = store.createChat({ roleId: "r1", name: "Migrate" });
  store.addMessage(chat.id, { role: "me", text: "legacy-a", status: "sent" });
  store.addMessage(chat.id, { role: "her", text: "legacy-b", status: "sent" });

  const first = await messageStore.migrateChatMessages(chat.id);
  assert.equal(first.migrated, 2);
  const second = await messageStore.migrateChatMessages(chat.id);
  assert.ok(second.alreadyMigrated || second.migrated === 0);
  assert.equal(backend._messages.size, 2);

  store.getState().chats.find((c) => c.id === chat.id).messages[0].text = "CORRUPT";
  const msgs = await messageStore.getMessages(chat.id);
  assert.equal(msgs.map((m) => m.text).join(","), "legacy-a,legacy-b");
});

await testAsync("dual-write keeps localStorage (does not discard legacy)", async () => {
  resetAppState();
  installBackend();
  const chat = store.createChat({ roleId: "r1", name: "KeepLegacy" });
  await messageStore.addMessage(chat.id, { role: "me", text: "kept", status: "sent" });
  const legacy = store.getState().chats.find((c) => c.id === chat.id);
  assert.equal(legacy.messages.length, 1);
  assert.equal(legacy.messages[0].text, "kept");
});

await testAsync("peekMessages uses Dexie cache after hydrate, not corrupted store", async () => {
  resetAppState();
  installBackend();
  const chat = store.createChat({ roleId: "r1", name: "Cache" });
  await messageStore.addMessage(chat.id, { role: "me", text: "canonical", status: "sent" });
  await messageStore.hydrateChat(chat.id);
  store.getState().chats.find((c) => c.id === chat.id).messages[0].text = "NOPE";
  const peeked = messageStore.peekMessages(chat.id);
  assert.equal(peeked.length, 1);
  assert.equal(peeked[0].text, "canonical");
});

await testAsync("update and delete persist on Dexie read path", async () => {
  resetAppState();
  installBackend();
  const chat = store.createChat({ roleId: "r1", name: "Mut" });
  const a = await messageStore.addMessage(chat.id, { role: "me", text: "one", status: "sent" });
  const b = await messageStore.addMessage(chat.id, { role: "her", text: "two", status: "sent" });
  await messageStore.updateMessage(chat.id, a.id, { text: "one-edit" });
  await messageStore.deleteMessage(chat.id, b.id);
  const msgs = await messageStore.getMessages(chat.id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].text, "one-edit");
});

await testAsync("truncation keeps prefix on both store and Dexie", async () => {
  resetAppState();
  installBackend();
  const chat = store.createChat({ roleId: "r1", name: "Trunc" });
  await messageStore.addMessage(chat.id, { role: "me", text: "keep", status: "sent" });
  await messageStore.addMessage(chat.id, { role: "her", text: "drop", status: "sent" });
  await messageStore.truncateMessages(chat.id, 1);
  const msgs = await messageStore.getMessages(chat.id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].text, "keep");
});

await testAsync("MessageRepository.findByConversationId is Dexie-backed", async () => {
  resetAppState();
  installBackend();
  const chat = store.createChat({ roleId: "r1", name: "Repo" });
  await messageStore.addMessage(chat.id, { role: "me", text: "via-store", status: "sent" });
  store.getState().chats.find((c) => c.id === chat.id).messages = [];
  const result = await MessageRepository.findByConversationId(chat.id, { page: 1, pageSize: 100 });
  assert.ok(result.total >= 1);
  const contents = result.items.map((m) => m.content || m.text);
  assert.ok(contents.some((t) => t === "via-store"));
});

await testAsync("short/medium/long Dexie reads stay off the localStorage dump", async () => {
  resetAppState();
  installBackend();
  const sizes = [20, 120, 400];
  const timings = [];
  for (const n of sizes) {
    const chat = store.createChat({ roleId: "r-perf", name: `n${n}` });
    for (let i = 0; i < n; i++) {
      await messageStore.addMessage(chat.id, { role: "me", text: `p${i}`, status: "sent" });
    }
    store.getState().chats.find((c) => c.id === chat.id).messages = [{ id: "x", role: "me", text: "DUMP", time: 1 }];
    const t0 = performance.now();
    const msgs = await messageStore.getMessages(chat.id);
    const elapsed = performance.now() - t0;
    timings.push({ n, elapsed, count: msgs.length });
    assert.equal(msgs.length, n);
    assert.equal(msgs[0].text, "p0");
    assert.equal(msgs[n - 1].text, `p${n - 1}`);
  }
  console.log("    perf", JSON.stringify(timings));
  assert.ok(timings.every((t) => t.elapsed < 2000), "Dexie-shaped reads should finish well under 2s in-memory");
});

await testAsync("Dexie unavailable falls back to localStorage without throwing", async () => {
  resetAppState();
  installStorageTestHooks({
    isAvailable: async () => false,
    message: {
      async countByConversationId() {
        throw new Error("should not be called");
      },
      async findByConversationId() {
        throw new Error("should not be called");
      },
    },
    conversation: { async findById() { return null; } },
    character: { async findById() { return null; }, async findAll() { return []; } },
  });
  if (typeof messageStore.resetRuntime === "function") messageStore.resetRuntime();
  const chat = store.createChat({ roleId: "r1", name: "NoDexie" });
  store.addMessage(chat.id, { role: "me", text: "fallback-ok", status: "sent" });
  const msgs = await messageStore.getMessages(chat.id);
  assert.equal(msgs[0].text, "fallback-ok");
});

await testAsync("last-message preview comes from Dexie after hydrateList", async () => {
  resetAppState();
  installBackend();
  const chat = store.createChat({ roleId: "r1", name: "Preview" });
  await messageStore.addMessage(chat.id, { role: "me", text: "preview-text", status: "sent" });
  await messageStore.hydrateList();
  store.getState().chats.find((c) => c.id === chat.id).messages = [];
  const preview = messageStore.getLastMessagePreview(chat.id);
  assert.equal(preview?.text, "preview-text");
});

// ============================================================
//  2. Conversation Storage Migration
// ============================================================

console.log("\n=== 2. Conversation Storage Migration ===");

await testAsync("ConversationRepository.create dual-writes Dexie + legacy", async () => {
  resetAppState();
  const backend = installBackend();
  const created = await ConversationRepository.create({
    id: "chat-c1",
    characterId: "role_c1",
    title: "Conv One",
    config: { persona: "p" },
  });
  assert.equal(created.id, "chat-c1");
  assert.equal(created.characterId, "role_c1");
  assert.ok(backend._conversations.has("chat-c1"));
  assert.ok(store.getState().chats.some((c) => c.id === "chat-c1"));
});

await testAsync("ConversationRepository read prefers Dexie", async () => {
  resetAppState();
  const backend = installBackend();
  await ConversationRepository.create({
    id: "chat-c2",
    characterId: "role_c2",
    title: "Original Title",
  });
  const local = store.getState().chats.find((c) => c.id === "chat-c2");
  local.name = "LEGACY_CORRUPT_TITLE";
  const rec = await ConversationRepository.findById("chat-c2");
  assert.equal(rec.title, "Original Title");
  assert.equal(backend._conversations.get("chat-c2").title, "Original Title");
});

await testAsync("existing localStorage conversations migrate non-destructively", async () => {
  resetAppState();
  const backend = installBackend();
  const chat = store.createChat({ roleId: "role_mig", name: "Pre-existing", persona: "hello" });
  store.addMessage(chat.id, { role: "me", text: "keep-me", status: "sent" });
  const result = await Conversation.migrateAllConversations();
  assert.ok(result.total >= 1);
  assert.ok(backend._conversations.has(chat.id));
  const still = store.getState().chats.find((c) => c.id === chat.id);
  assert.equal(still.name, "Pre-existing");
  assert.equal(still.messages[0].text, "keep-me");
  const again = await Conversation.migrateAllConversations();
  assert.ok(again.migrated === 0 || again.skipped);
});

await testAsync("conversation update/rename persists in repository", async () => {
  resetAppState();
  installBackend();
  await ConversationRepository.create({ id: "chat-rn", characterId: "r", title: "Old" });
  await ConversationRepository.update("chat-rn", { title: "New" });
  const rec = await ConversationRepository.findById("chat-rn");
  assert.equal(rec.title, "New");
});

await testAsync("delete conversation does not delete sibling conversation of same character", async () => {
  resetAppState();
  installBackend();
  await ConversationRepository.create({ id: "c-a", characterId: "shared", title: "A" });
  await ConversationRepository.create({ id: "c-b", characterId: "shared", title: "B" });
  await Conversation.deleteConversation("c-a");
  const remaining = await ConversationRepository.findByCharacterId("shared");
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, "c-b");
  assert.ok(store.getState().chats.every((c) => c.id !== "c-a"));
  assert.ok(store.getState().chats.some((c) => c.id === "c-b"));
});

await testAsync("legacy conversation remains recoverable if Dexie is down", async () => {
  resetAppState();
  const chat = store.createChat({ roleId: "r-fb", name: "Recover Me" });
  installStorageTestHooks({
    isAvailable: async () => false,
    message: { async countByConversationId() { return 0; }, async findByConversationId() { return { items: [], total: 0 }; } },
    conversation: { async findById() { return null; }, async findAll() { return []; }, async findByCharacterId() { return []; } },
    character: { async findById() { return null; }, async findAll() { return []; } },
  });
  const rec = await ConversationRepository.findById(chat.id);
  assert.ok(rec);
  assert.equal(rec.title, "Recover Me");
});

await testAsync("Conversation.findAll lists migrated + new conversations", async () => {
  resetAppState();
  installBackend();
  await ConversationRepository.create({ id: "l1", characterId: "r", title: "One" });
  await ConversationRepository.create({ id: "l2", characterId: "r", title: "Two" });
  const all = await ConversationRepository.findAll();
  assert.equal(all.length, 2);
});

// ============================================================
//  3. Character Repository Cutover
// ============================================================

console.log("\n=== 3. Character Repository Cutover ===");

await testAsync("CharacterRepository.create is Dexie source of truth", async () => {
  resetAppState();
  const backend = installBackend();
  await CharacterRepository.create({
    id: "char-1",
    name: "橘小喵",
    identity: "cat",
    personality: { description: "cat" },
  });
  const found = await CharacterRepository.findById("char-1");
  assert.equal(found.name, "橘小喵");
  assert.equal(backend._characters.get("char-1").name, "橘小喵");
});

await testAsync("Character.getCharacterById uses repository, not a second domain fallback", async () => {
  resetAppState();
  installBackend();
  await CharacterRepository.create({ id: "char-2", name: "RepoChar", identity: "x" });
  const found = await Character.getCharacterById("char-2");
  assert.equal(found.name, "RepoChar");
});

await testAsync("existing chats migrate into Character Dexie without deleting chats", async () => {
  resetAppState();
  const backend = installBackend();
  const chat = store.createChat({ roleId: "role_old", name: "Old Char", persona: "kind" });
  const result = await Character.migrateCharactersToDexie();
  assert.ok(result.total >= 1);
  assert.ok(backend._characters.has("role_old"));
  assert.ok(store.getState().chats.some((c) => c.id === chat.id));
  const again = await Character.migrateCharactersToDexie();
  assert.equal(again.migrated, 0);
});

await testAsync("character update persists on Dexie", async () => {
  resetAppState();
  installBackend();
  await CharacterRepository.create({ id: "char-u", name: "Before", identity: "a" });
  await Character.updateCharacter("char-u", { name: "After" });
  const found = await CharacterRepository.findById("char-u");
  assert.equal(found.name, "After");
});

await testAsync("Dexie-unavailable character fallback still derives from chats", async () => {
  resetAppState();
  store.createChat({ roleId: "role_fb", name: "Fallback Char", persona: "p" });
  installStorageTestHooks({
    isAvailable: async () => false,
    message: { async countByConversationId() { return 0; } },
    conversation: { async findById() { return null; } },
    character: {
      async findById() { throw new Error("dexie down"); },
      async findAll() { throw new Error("dexie down"); },
    },
  });
  const found = await CharacterRepository.findById("role_fb");
  assert.ok(found);
  assert.equal(found.name, "Fallback Char");
});

await testAsync("new character is selectable after createCharacter", async () => {
  resetAppState();
  installBackend();
  const created = await Character.createCharacter({ name: "New One", persona: "hello" });
  const all = await Character.getAllCharacters();
  assert.ok(all.some((c) => c.id === created.id && c.name === "New One"));
});

await testAsync("soft delete marks character deleted in repository", async () => {
  resetAppState();
  installBackend();
  await CharacterRepository.create({ id: "char-del", name: "Gone", identity: "x" });
  await CharacterRepository.softDelete("char-del");
  const found = await CharacterRepository.findById("char-del");
  assert.equal(found.status, "deleted");
});

resetStorageTestHooks();

console.log("\n" + "=".repeat(50));
console.log(`Storage Cutover Test Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
}
console.log("=".repeat(50));

process.exit(failed > 0 ? 1 : 0);
