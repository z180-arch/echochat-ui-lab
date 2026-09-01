/**
 * Core companion loop — memory candidates, relationship stage, moments from memory.
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
const { createFromTemplate, getPersona } = await import(srcHref("src/domain/persona.js"));
const { addMemory, getMemoryList, rememberMessage } = await import(srcHref("src/domain/memory.js"));
const { recordChatTurn, getAffinity } = await import(srcHref("src/domain/relations.js"));
const { listMoments } = await import(srcHref("src/domain/moments.js"));
const { buildBehaviorContext } = await import(srcHref("src/domain/behavior.js"));
const { buildSystemPrompt } = await import(srcHref("src/domain/chat.js"));
const {
  extractMemoryCandidates,
  setCandidateAccepted,
  editCandidateText,
  confirmMemoryCandidates,
} = await import(srcHref("src/domain/memory-candidates.js"));

function createMemoryBackends() {
  const messages = new Map();
  const conversations = new Map();
  const characters = new Map();
  const message = {
    async findById(id) {
      return messages.get(id) || null;
    },
    async findByConversationId(conversationId) {
      let items = [...messages.values()].filter((m) => m.conversationId === conversationId);
      items.sort((a, b) => a.createdAt - b.createdAt);
      return { items, total: items.length, page: 1, pageSize: 50, hasMore: false };
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
        parentMessageId: null,
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
  return { isAvailable: async () => true, message, conversation, character };
}

function resetAll() {
  localStorage.clear();
  store.reset();
  if (typeof messageStore.resetRuntime === "function") messageStore.resetRuntime();
  resetStorageTestHooks();
  installStorageTestHooks(createMemoryBackends());
}

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

async function seedChat() {
  const chat = await createFromTemplate({
    name: "林晚",
    persona: "咖啡店店员",
    firstMessage: "我在。",
  });
  await messageStore.addMessage(chat.id, { role: "me", text: "我喜欢晚上散步，讨厌香菜。", status: "sent" });
  await messageStore.addMessage(chat.id, { role: "her", text: "记下了。下次不放香菜。", status: "sent" });
  await messageStore.addMessage(chat.id, { role: "me", text: "我在上海工作。", status: "sent" });
  await messageStore.addMessage(chat.id, { role: "her", text: "嗯。", status: "sent" });
  await messageStore.addMessage(chat.id, { role: "me", text: "嗨", status: "sent" });
  return chat;
}

resetAll();

console.log("\n=== Core Loop Tests ===\n");

console.log("--- Memory candidates ---");

await testAsync("extractMemoryCandidates: user facts with evidence, skips greetings", async () => {
  resetAll();
  const chat = await seedChat();
  const { ok, candidates, notice } = extractMemoryCandidates(chat.roleId, { chatId: chat.id });
  assert.equal(ok, true);
  assert.equal(notice, null);
  assert.ok(candidates.length >= 2);
  const texts = candidates.map((c) => c.text);
  assert.ok(texts.some((t) => t.includes("散步") || t.includes("香菜")));
  assert.ok(texts.some((t) => t.includes("上海")));
  assert.ok(!texts.some((t) => t === "嗨"));
  assert.ok(candidates.every((c) => c.evidence?.length && c.accepted === true));
});

await testAsync("extract does not write until confirm", async () => {
  resetAll();
  const chat = await seedChat();
  extractMemoryCandidates(chat.roleId);
  assert.equal(getMemoryList(chat.roleId).length, 0);
});

await testAsync("confirm writes accepted memories to the same character", async () => {
  resetAll();
  const chat = await seedChat();
  let { candidates } = extractMemoryCandidates(chat.roleId);
  const first = candidates[0];
  candidates = setCandidateAccepted(candidates, first.id, false);
  candidates = editCandidateText(candidates, candidates[1].id, "用户在上海工作。");
  const result = confirmMemoryCandidates(chat.roleId, candidates);
  assert.equal(result.ok, true);
  const mems = getMemoryList(chat.roleId).map((m) => m.content);
  assert.ok(!mems.includes(first.text));
  assert.ok(mems.includes("用户在上海工作。"));
  assert.ok(mems.every((m) => typeof m === "string"));
});

await testAsync("duplicates against existing memories are not re-added", async () => {
  resetAll();
  const chat = await seedChat();
  addMemory(chat.roleId, "我喜欢晚上散步，讨厌香菜。", 8, "manual");
  const { candidates } = extractMemoryCandidates(chat.roleId);
  const result = confirmMemoryCandidates(chat.roleId, candidates);
  const walk = getMemoryList(chat.roleId).filter((m) => /散步/.test(m.content));
  assert.equal(walk.length, 1);
  assert.ok(result.skipped >= 1 || candidates.some((c) => c.duplicate));
});

await testAsync("memory candidates stay character-scoped", async () => {
  resetAll();
  const a = await seedChat();
  const b = await createFromTemplate({ name: "白若", persona: "清冷", firstMessage: "来了。" });
  await messageStore.addMessage(b.id, { role: "me", text: "我只喝冰美式。", status: "sent" });
  const fromA = extractMemoryCandidates(a.roleId).candidates.map((c) => c.text).join(" ");
  const fromB = extractMemoryCandidates(b.roleId).candidates.map((c) => c.text).join(" ");
  assert.ok(fromA.includes("香菜") || fromA.includes("上海"));
  assert.ok(!fromA.includes("冰美式"));
  assert.ok(fromB.includes("冰美式"));
  assert.ok(!fromB.includes("香菜"));
  confirmMemoryCandidates(a.roleId, extractMemoryCandidates(a.roleId).candidates);
  assert.equal(getMemoryList(b.roleId).length, 0);
  assert.ok(getMemoryList(a.roleId).length >= 1);
});

await testAsync("empty conversation yields no invented memories", async () => {
  resetAll();
  const chat = await createFromTemplate({ name: "空", persona: "p", firstMessage: "hi" });
  const { candidates, notice } = extractMemoryCandidates(chat.roleId);
  const userFacts = candidates.filter((c) => !/hi/i.test(c.text) || c.text.length > 8);
  assert.ok(notice || candidates.length === 0 || userFacts.length <= 1);
});

test("rememberMessage stores user bubbles as memory", () => {
  resetAll();
  rememberMessage({ roleId: "role_x", config: {} }, { text: "我明天要加班。" });
  assert.ok(getMemoryList("role_x").some((m) => m.content.includes("加班")));
});

console.log("\n--- Relationship stage ---");

test("getAffinity: no history is an empty relationship, not 认识1天", () => {
  resetAll();
  const a = getAffinity("role_never", { moments: [] });
  assert.equal(a.hasHistory, false);
  assert.equal(a.stage, "none");
  assert.ok(a.stageLabel);
});

test("getAffinity: turns produce a named stage, character-scoped", () => {
  resetAll();
  recordChatTurn("role_a", "A");
  for (let i = 0; i < 12; i++) recordChatTurn("role_a", "A");
  recordChatTurn("role_b", "B");
  const a = getAffinity("role_a", { moments: [] });
  const b = getAffinity("role_b", { moments: [] });
  assert.equal(a.hasHistory, true);
  assert.equal(a.turns, 13);
  assert.ok(["warming", "familiar", "close"].includes(a.stage));
  assert.ok(a.stageLabel);
  assert.equal(b.turns, 1);
  assert.notEqual(a.stage, b.stage);
});

test("behavior includes relationship stage and stays on this character", () => {
  const ctx = buildBehaviorContext({
    persona: "温柔店员",
    memories: [{ content: "用户讨厌香菜" }],
    affinity: { toneHint: "更亲近、更熟络", knownDays: 12, score: 21, stage: "close", stageLabel: "已经熟络", hasHistory: true },
  });
  assert.ok(ctx.includes("温柔店员"));
  assert.ok(ctx.includes("香菜"));
  assert.ok(ctx.includes("已经熟络") || ctx.includes("亲近"));
  assert.ok(!ctx.includes("别人的记忆"));
});

console.log("\n--- Moments from confirmed memory ---");

await testAsync("confirming memories can post a character-scoped moment", async () => {
  resetAll();
  const chat = await seedChat();
  const { candidates } = extractMemoryCandidates(chat.roleId);
  const result = confirmMemoryCandidates(chat.roleId, candidates, { postMoment: true });
  assert.equal(result.ok, true);
  const mine = listMoments(chat.roleId);
  assert.equal(mine.length, 1);
  assert.ok(mine[0].relatedMemoryId);
  assert.equal(listMoments("someone-else").length, 0);
});

await testAsync("confirmed memory is visible in the next prompt for that character only", async () => {
  resetAll();
  const chat = await seedChat();
  confirmMemoryCandidates(chat.roleId, extractMemoryCandidates(chat.roleId).candidates);
  const prompt = buildSystemPrompt(chat);
  const persona = getPersona(chat);
  assert.ok(prompt.includes(persona.slice(0, 4)) || prompt.includes("店员"));
  assert.ok(/香菜|上海|散步/.test(prompt));
  const other = await createFromTemplate({ name: "白若", persona: "清冷", firstMessage: "来了。" });
  const otherPrompt = buildSystemPrompt(other);
  assert.ok(!/香菜/.test(otherPrompt));
});

console.log("\n=== Core Loop Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log("All core loop tests passed.");
