/**
 * Core Product Completion Wave — regression tests
 * Character hub, import/export, memory, relationship, behavior, send persist.
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
const { installStorageTestHooks, resetStorageTestHooks } = await import(
  srcHref("src/repository/test-hooks.js")
);
const { messageStore } = await import(srcHref("src/domain/message-store.js"));
const { Character } = await import(srcHref("src/domain/character.js"));
const { createConversationForCharacter } = await import(srcHref("src/domain/conversation.js"));
const {
  parseCharacterCard,
  importCharacter,
  buildCharacterCard,
  createFromTemplate,
  getPersona,
} = await import(srcHref("src/domain/persona.js"));
const { addMemory, getMemoryList, searchMemories, clearMemory } = await import(
  srcHref("src/domain/memory.js")
);
const { recordChatTurn, getAffinity } = await import(srcHref("src/domain/relations.js"));
const { addMoment, listMoments } = await import(srcHref("src/domain/moments.js"));
const { sendMessage, buildSystemPrompt } = await import(srcHref("src/domain/chat.js"));
const { buildBehaviorContext } = await import(srcHref("src/domain/behavior.js"));
const { listCharactersForHub, continueCharacter, resolveAvatarSrc } = await import(
  srcHref("src/domain/character-hub.js")
);

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
      let items = [...messages.values()].filter((m) => m.conversationId === conversationId);
      items.sort((a, b) => a.createdAt - b.createdAt);
      const total = items.length;
      const pageSize = options.pageSize || 50;
      return { items, total, page: 1, pageSize, hasMore: false };
    },
    async create(msg) {
      const record = {
        id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conversationId: msg.conversationId,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt || Date.now(),
        updatedAt: Date.now(),
        status: msg.status || "sent",
        metadata: msg.metadata || {},
        parentMessageId: msg.parentMessageId || null,
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
    async search() {
      return [];
    },
    async findLatest(conversationId) {
      const items = [...messages.values()]
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => b.createdAt - a.createdAt);
      return items[0] || null;
    },
    async findBranches() {
      return [];
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
  };
  const conversation = {
    async findById(id) {
      return conversations.get(id) || null;
    },
    async findAll() {
      return [...conversations.values()];
    },
    async findByCharacterId(characterId) {
      return [...conversations.values()].filter((c) => c.characterId === characterId);
    },
    async create(conv) {
      const record = {
        id: conv.id || `conv-${Date.now()}`,
        characterId: conv.characterId,
        title: conv.title || "",
        status: conv.status || "active",
        config: conv.config || {},
        createdAt: conv.createdAt || Date.now(),
        updatedAt: Date.now(),
        archivedAt: conv.archivedAt || null,
        messageCount: conv.messageCount ?? 0,
        lastMessageAt: conv.lastMessageAt || Date.now(),
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
  };
  const character = {
    async findById(id) {
      return characters.get(id) || null;
    },
    async findAll(options = {}) {
      let items = [...characters.values()];
      if (!options.includeGuides) items = items.filter((c) => !c.isGuide);
      return items;
    },
    async create(c) {
      const record = { ...c, id: c.id || `char-${Date.now()}` };
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
    async delete(id) {
      characters.delete(id);
    },
  };
  return {
    isAvailable: async () => true,
    message,
    conversation,
    character,
  };
}

function resetAll() {
  localStorage.clear();
  store.reset();
  resetStorageTestHooks();
  installStorageTestHooks(createMemoryBackends());
}

resetAll();

console.log("\n=== Core Product Tests ===\n");

console.log("--- Character import / export ---");

test("parseCharacterCard: malformed JSON returns null", () => {
  assert.equal(parseCharacterCard("{nope"), null);
});

test("parseCharacterCard: incomplete v2 gets defaults", () => {
  const p = parseCharacterCard({ spec: "chara_card_v2", data: {} });
  assert.equal(p.name, "导入角色");
  assert.equal(p.persona, "");
  assert.equal(p.firstMessage, "");
});

test("parseCharacterCard: v1 description maps to persona", () => {
  const p = parseCharacterCard({ name: "林晚", description: "温柔", first_mes: "你好" });
  assert.equal(p.name, "林晚");
  assert.equal(p.persona, "温柔");
  assert.equal(p.firstMessage, "你好");
});

test("parseCharacterCard: empty input returns null", () => {
  assert.equal(parseCharacterCard(null), null);
  assert.equal(parseCharacterCard(""), null);
});

await testAsync("importCharacter: persists character + conversation", async () => {
  resetAll();
  const result = await importCharacter({
    spec: "chara_card_v2",
    data: { name: "导入白若", description: "清冷", first_mes: "来了。" },
  });
  assert.equal(result.ok, true);
  assert.ok(result.characterId);
  const char = await Character.getCharacterById(result.characterId);
  assert.equal(char.name, "导入白若");
  assert.ok((char.identity || "").includes("清冷"));
  const chats = store.getState().chats.filter((c) => c.roleId === result.characterId);
  assert.equal(chats.length >= 1, true);
});

await testAsync("importCharacter: malformed is safe", async () => {
  resetAll();
  const result = await importCharacter("{bad");
  assert.equal(result.ok, false);
  assert.equal(store.getState().chats.length, 0);
});

await testAsync("export then reimport preserves identity", async () => {
  resetAll();
  const chat = await createFromTemplate({
    name: "橘小喵",
    persona: "毒舌猫",
    firstMessage: "有事说事",
    avatar: "assets/avatars/default.svg",
  });
  const card = buildCharacterCard(chat);
  assert.equal(card.spec, "chara_card_v2");
  const again = await importCharacter(card);
  assert.equal(again.ok, true);
  const char = await Character.getCharacterById(again.characterId);
  assert.equal(char.name, "橘小喵");
  assert.ok((char.identity || "").includes("毒舌猫"));
});

console.log("\n--- Character hub / conversations ---");

await testAsync("hub lists characters independently of conversation count", async () => {
  resetAll();
  const a = await createFromTemplate({ name: "A角", persona: "A人设", firstMessage: "hi" });
  createConversationForCharacter(a.roleId, { title: "第二对话" });
  const b = await createFromTemplate({ name: "B角", persona: "B人设", firstMessage: "hey" });
  const hub = listCharactersForHub();
  assert.equal(hub.length, 2);
  const itemA = hub.find((h) => h.id === a.roleId);
  assert.equal(itemA.conversationCount, 2);
  assert.equal(itemA.name, "A角");
  assert.ok(hub.find((h) => h.id === b.roleId));
});

await testAsync("continueCharacter opens latest conversation", async () => {
  resetAll();
  const a = await createFromTemplate({ name: "续聊", persona: "p", firstMessage: "开场" });
  const second = createConversationForCharacter(a.roleId, { title: "新会话" });
  await messageStore.addMessage(second.id, { role: "me", text: "later", status: "sent" });
  const opened = continueCharacter(a.roleId);
  assert.equal(opened.id, second.id);
  assert.equal(store.getState().currentChatId, second.id);
});

test("resolveAvatarSrc: empty and blob: fall back", () => {
  assert.equal(resolveAvatarSrc(""), "assets/avatars/default.svg");
  assert.equal(resolveAvatarSrc(null), "assets/avatars/default.svg");
  assert.equal(resolveAvatarSrc("blob:http://localhost/abc"), "assets/avatars/default.svg");
  assert.equal(resolveAvatarSrc("assets/avatars/x.svg"), "assets/avatars/x.svg");
});

test("getPersona: string persona on chat.config", () => {
  const chat = { config: { persona: "一段人设" } };
  assert.equal(getPersona(chat), "一段人设");
});

console.log("\n--- Memory isolation ---");

test("memory is character-scoped", () => {
  resetAll();
  addMemory("role_a", "A喜欢茶", 8, "manual");
  addMemory("role_b", "B喜欢咖啡", 8, "manual");
  const a = getMemoryList("role_a").map((m) => m.content);
  const b = getMemoryList("role_b").map((m) => m.content);
  assert.ok(a.includes("A喜欢茶"));
  assert.ok(!a.includes("B喜欢咖啡"));
  assert.ok(b.includes("B喜欢咖啡"));
  assert.ok(!b.includes("A喜欢茶"));
});

test("searchMemories matches keywords per character", () => {
  resetAll();
  addMemory("role_a", "喜欢晚上散步", 5, "manual");
  addMemory("role_a", "讨厌香菜", 5, "manual");
  addMemory("role_b", "晚上散步去河边", 5, "manual");
  const hits = searchMemories("role_a", "散步");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].content, "喜欢晚上散步");
  assert.equal(searchMemories("role_b", "香菜").length, 0);
});

test("memory persists across store reload shape", () => {
  resetAll();
  addMemory("role_x", "持久记忆", 7, "manual");
  const raw = localStorage.getItem("echodownload_lite_state_v1");
  assert.ok(raw.includes("持久记忆"));
  clearMemory("role_x");
  assert.equal(getMemoryList("role_x").length, 0);
});

console.log("\n--- Relationship isolation ---");

test("relationship state is character-scoped", () => {
  resetAll();
  recordChatTurn("role_a", "A");
  recordChatTurn("role_a", "A");
  recordChatTurn("role_b", "B");
  const a = getAffinity("role_a", { moments: [] });
  const b = getAffinity("role_b", { moments: [] });
  assert.equal(a.turns, 2);
  assert.equal(b.turns, 1);
});

console.log("\n--- Behavior context ---");

test("behavior includes persona, memory, relationship; no foreign memory", () => {
  const ctx = buildBehaviorContext({
    persona: "温柔",
    memories: [{ content: "用户喜欢茶" }],
    affinity: { toneHint: "更亲近、更熟络", knownDays: 12, score: 21 },
  });
  assert.ok(ctx.includes("温柔"));
  assert.ok(ctx.includes("用户喜欢茶"));
  assert.ok(ctx.includes("更亲近、更熟络"));
  assert.ok(!ctx.includes("用户喜欢咖啡"));
});

await testAsync("buildSystemPrompt stays on the current character", async () => {
  resetAll();
  const a = await createFromTemplate({ name: "A", persona: "A人设专属", firstMessage: "a" });
  const b = await createFromTemplate({ name: "B", persona: "B人设专属", firstMessage: "b" });
  addMemory(a.roleId, "A的秘密", 9, "manual");
  addMemory(b.roleId, "B的秘密", 9, "manual");
  recordChatTurn(a.roleId, "A");
  const promptA = buildSystemPrompt(store.getState().chats.find((c) => c.id === a.id));
  assert.ok(promptA.includes("A人设专属"));
  assert.ok(promptA.includes("A的秘密"));
  assert.ok(!promptA.includes("B的秘密"));
  assert.ok(!promptA.includes("B人设专属"));
});

console.log("\n--- Send persist without API key ---");

await testAsync("sendMessage persists user text when API key missing", async () => {
  resetAll();
  store.updateSettings({ apiKey: "", baseUrl: "https://api.siliconflow.cn/v1" });
  const chat = await createFromTemplate({ name: "无Key", persona: "p", firstMessage: "hi" });
  await sendMessage("这条不能丢");
  const msgs = messageStore.peekMessages(chat.id);
  const me = msgs.find((m) => m.role === "me" && m.text.includes("这条不能丢"));
  assert.ok(me, "user message must remain");
  const err = msgs.find((m) => m.status === "error");
  assert.ok(err, "failure must be represented");
});

console.log("\n--- Moments association ---");

test("moments stay on their character", () => {
  resetAll();
  addMoment({ roleId: "role_a", roleName: "A", content: "A的动态", source: "manual" });
  addMoment({ roleId: "role_b", roleName: "B", content: "B的动态", source: "manual" });
  const a = listMoments("role_a").map((m) => m.content);
  assert.ok(a.includes("A的动态"));
  assert.ok(!a.includes("B的动态"));
});

console.log("\n==================================================");
console.log(`Core Product Test Results: ${passed} passed, ${failed} failed`);
console.log("==================================================");
if (failures.length) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
