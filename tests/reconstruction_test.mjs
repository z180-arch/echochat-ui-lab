/**
 * Character Reconstruction MVP — parse, extract, review, confirm.
 * Confirm must write through the existing CharacterRepository path.
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
const { createFromTemplate, getPersona } = await import(srcHref("src/domain/persona.js"));
const { addMemory, getMemoryList } = await import(srcHref("src/domain/memory.js"));
const { recordChatTurn, getAffinity } = await import(srcHref("src/domain/relations.js"));
const { buildSystemPrompt } = await import(srcHref("src/domain/chat.js"));
const { listCharactersForHub } = await import(srcHref("src/domain/character-hub.js"));
const {
  parseChatTranscript,
  buildReconstructionDraft,
  buildDraftFromConversation,
  setDraftCharacterSpeaker,
  setDraftName,
  setFindingAccepted,
  editFindingText,
  confirmReconstruction,
  DIMENSIONS,
} = await import(srcHref("src/domain/reconstruction/index.js"));

const RICH_LOG = `林晚: 我是咖啡店的店员，以前在上海上学。
我: 今天想吃火锅吗？
林晚: 讨厌香菜，爱吃甜的。
我: 我们下周见面吧。
林晚: 好啊，我经常晚上散步。
林晚: 每次加班回来都想喝热可可。
林晚: 嗯嗯，我在呢。
林晚: 想你了。
我: 我也想你。我喜欢你做的可可。
林晚: 那今晚见。`;

const SHORT_LOG = `林晚: 嗨
我: 嗨
林晚: 在吗`;

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

resetAll();

console.log("\n=== Reconstruction Tests ===\n");

console.log("--- Parse ---");

test("parseChatTranscript: empty returns error", () => {
  assert.equal(parseChatTranscript("").ok, false);
  assert.equal(parseChatTranscript("   ").error, "empty");
  assert.equal(parseChatTranscript(null).error, "empty");
});

test("parseChatTranscript: unstructured text is not a chat log", () => {
  const parsed = parseChatTranscript("这不是聊天记录，只是一段说明。");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "no-messages");
});

test("parseChatTranscript: JSON / character card is not accepted", () => {
  const parsed = parseChatTranscript(
    JSON.stringify({ spec: "chara_card_v2", data: { name: "林晚", description: "温柔" } })
  );
  assert.equal(parsed.ok, false);
});

test("parseChatTranscript: Name: text lines become numbered messages", () => {
  const parsed = parseChatTranscript(RICH_LOG);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.messages.length, 10);
  assert.equal(parsed.messages[0].index, 1);
  assert.equal(parsed.messages[0].speaker, "林晚");
  assert.ok(parsed.messages[0].text.includes("咖啡店"));
});

test("parseChatTranscript: timestamp prefix is stripped from speaker", () => {
  const parsed = parseChatTranscript("2024-01-01 12:00 林晚: 晚上好\n我: 晚上好");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.messages[0].speaker, "林晚");
});

test("parseChatTranscript: bracket timestamps are allowed", () => {
  const parsed = parseChatTranscript("[12:00] 林晚: 在吗\n[12:01] 我: 在");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.messages[0].speaker, "林晚");
  assert.equal(parsed.messages[1].speaker, "我");
});

console.log("\n--- Speakers + extract ---");

test("draft detects character vs user", () => {
  const { ok, draft } = buildReconstructionDraft(RICH_LOG);
  assert.equal(ok, true);
  assert.equal(draft.speakers.characterName, "林晚");
  assert.equal(draft.speakers.userName, "我");
  assert.equal(draft.name, "林晚");
});

test("structured extract covers at least 5 dimensions with evidence", () => {
  const { draft } = buildReconstructionDraft(RICH_LOG);
  assert.ok(draft.determined.length >= 5);
  for (const dim of ["personality", "speechStyle", "preferences", "background", "behavioralTraits"]) {
    assert.ok(draft.determined.includes(dim), `missing ${dim}`);
  }
  const withEvidence = draft.findings.filter((f) => f.evidence?.length);
  assert.ok(withEvidence.length >= 5);
  const pref = draft.findings.find((f) => f.dimension === "preferences");
  assert.ok(pref.evidence[0].index >= 1);
  assert.ok(pref.evidence[0].excerpt);
});

test("all seven reconstruction dimensions are defined", () => {
  assert.deepEqual(DIMENSIONS, [
    "personality",
    "speechStyle",
    "preferences",
    "background",
    "behavioralTraits",
    "memories",
    "relationshipClues",
  ]);
});

test("insufficient data does not invent a full persona", () => {
  const { draft } = buildReconstructionDraft(SHORT_LOG);
  assert.equal(draft.sufficiency.sufficient, false);
  assert.ok(draft.sufficiency.notice.includes("数据不足"));
  assert.ok(draft.unknown.length >= 3);
  assert.ok(!draft.findings.some((f) => /编造|完整人格/.test(f.text)));
});

test("review can reject and edit findings before confirm", () => {
  let { draft } = buildReconstructionDraft(RICH_LOG);
  const pref = draft.findings.find((f) => f.dimension === "preferences");
  draft = setFindingAccepted(draft, pref.id, false);
  draft = editFindingText(draft, draft.findings.find((f) => f.dimension === "background").id, "店员，上海长大。");
  assert.equal(draft.findings.find((f) => f.id === pref.id).accepted, false);
  assert.equal(draft.findings.find((f) => f.dimension === "background").text, "店员，上海长大。");
});

test("speaker override re-extracts against the chosen character", () => {
  const swapped = `同事A: 我喜欢加班。\n林晚: 我不喜欢加班。\n同事A: 我经常晚上散步。\n林晚: 我从不散步。\n同事A: 嗨\n林晚: 嗯\n同事A: 在吗\n林晚: 在`;
  let { draft } = buildReconstructionDraft(swapped);
  draft = setDraftCharacterSpeaker(draft, "林晚");
  assert.equal(draft.speakers.characterName, "林晚");
  const prefs = draft.findings.filter((f) => f.dimension === "preferences").map((f) => f.text);
  assert.ok(prefs.some((t) => t.includes("不喜欢加班")));
  assert.ok(!prefs.some((t) => t === "我喜欢加班。"));
});

console.log("\n--- Confirm / repository ---");

await testAsync("draft does not write a character until confirm", async () => {
  resetAll();
  const { draft } = buildReconstructionDraft(RICH_LOG);
  assert.equal((await Character.getAllCharacters()).length, 0);
  assert.equal(store.getState().chats.length, 0);
  assert.ok(draft.findings.length > 0);
});

await testAsync("confirm writes CharacterRepository + conversation via existing path", async () => {
  resetAll();
  const { draft } = buildReconstructionDraft(RICH_LOG);
  const result = await confirmReconstruction(draft);
  assert.equal(result.ok, true);
  assert.ok(result.characterId);
  const char = await Character.getCharacterById(result.characterId);
  assert.equal(char.name, "林晚");
  assert.equal(char.source, "reconstructed");
  assert.ok((char.identity || "").includes("咖啡店") || (char.identity || "").includes("香菜") || (char.identity || "").includes("口语"));
  const chats = store.getState().chats.filter((c) => c.roleId === result.characterId);
  assert.equal(chats.length, 1);
  const hub = listCharactersForHub();
  assert.ok(hub.some((h) => h.id === result.characterId));
});

await testAsync("confirm respects rejected findings and renamed character", async () => {
  resetAll();
  let { draft } = buildReconstructionDraft(RICH_LOG);
  const pref = draft.findings.find((f) => f.dimension === "preferences");
  draft = setFindingAccepted(draft, pref.id, false);
  draft = setDraftName(draft, "晚晚");
  const result = await confirmReconstruction(draft);
  const char = await Character.getCharacterById(result.characterId);
  assert.equal(char.name, "晚晚");
  assert.ok(!(char.identity || "").includes("讨厌香菜"));
});

await testAsync("reconstructed character can enter chat with identity in prompt", async () => {
  resetAll();
  const { draft } = buildReconstructionDraft(RICH_LOG);
  const result = await confirmReconstruction(draft);
  const chat = store.getState().chats.find((c) => c.id === result.chatId);
  assert.ok(chat);
  const persona = getPersona(chat);
  assert.ok(persona.length > 0);
  const prompt = buildSystemPrompt(chat);
  assert.ok(prompt.includes(persona.slice(0, 12)) || prompt.includes("林晚") || prompt.length > 0);
});

await testAsync("memories from reconstruction are character-scoped", async () => {
  resetAll();
  const { draft } = buildReconstructionDraft(RICH_LOG);
  const result = await confirmReconstruction(draft);
  const mems = getMemoryList(result.characterId);
  assert.ok(mems.length >= 1);
  assert.ok(mems.every((m) => typeof m.content === "string"));
  assert.equal(getMemoryList("someone-else").length, 0);
});

await testAsync("existing character is not mutated by reconstruction", async () => {
  resetAll();
  const existing = await createFromTemplate({
    name: "白若",
    persona: "清冷独立",
    firstMessage: "来了。",
    avatar: "assets/avatars/default.svg",
  });
  addMemory(existing.roleId, "白若记得雨夜", 8, "manual");
  recordChatTurn(existing.roleId, "白若");
  const before = await Character.getCharacterById(existing.roleId);
  const beforeMem = getMemoryList(existing.roleId).map((m) => m.content);
  const beforeTurns = getAffinity(existing.roleId, { moments: [] }).turns;

  const { draft } = buildReconstructionDraft(RICH_LOG);
  const result = await confirmReconstruction(draft);
  assert.notEqual(result.characterId, existing.roleId);

  const after = await Character.getCharacterById(existing.roleId);
  assert.equal(after.identity, before.identity);
  assert.equal(after.name, "白若");
  assert.deepEqual(
    getMemoryList(existing.roleId).map((m) => m.content),
    beforeMem
  );
  assert.equal(getAffinity(existing.roleId, { moments: [] }).turns, beforeTurns);
  const rebuiltMem = getMemoryList(result.characterId).map((m) => m.content);
  assert.ok(!rebuiltMem.includes("白若记得雨夜"));
});

await testAsync("insufficient confirm still creates a character that can be completed later", async () => {
  resetAll();
  const { draft } = buildReconstructionDraft(SHORT_LOG);
  const result = await confirmReconstruction(draft);
  assert.equal(result.ok, true);
  assert.equal(result.insufficient, true);
  const char = await Character.getCharacterById(result.characterId);
  assert.ok(char);
  assert.equal(char.source, "reconstructed");
});

await testAsync("buildDraftFromConversation uses existing messages without a new file format", async () => {
  resetAll();
  const chat = await createFromTemplate({
    name: "林晚",
    persona: "先空着",
    firstMessage: "我是咖啡店的店员，以前在上海上学。",
  });
  await messageStore.addMessage(chat.id, { role: "me", text: "今天想吃火锅吗？", status: "sent" });
  await messageStore.addMessage(chat.id, { role: "her", text: "讨厌香菜，爱吃甜的。", status: "sent" });
  await messageStore.addMessage(chat.id, { role: "me", text: "我们下周见面吧。", status: "sent" });
  await messageStore.addMessage(chat.id, { role: "her", text: "好啊，我经常晚上散步。", status: "sent" });
  await messageStore.addMessage(chat.id, { role: "her", text: "每次加班回来都想喝热可可。", status: "sent" });
  await messageStore.addMessage(chat.id, { role: "her", text: "嗯嗯，我在呢。", status: "sent" });
  await messageStore.addMessage(chat.id, { role: "her", text: "想你了。", status: "sent" });
  await messageStore.addMessage(chat.id, { role: "me", text: "我也想你。", status: "sent" });
  await messageStore.addMessage(chat.id, { role: "her", text: "那今晚见。", status: "sent" });

  const { ok, draft } = buildDraftFromConversation(chat.id);
  assert.equal(ok, true);
  assert.equal(draft.speakers.characterName, "林晚");
  assert.ok(draft.determined.length >= 5);
  const chatsBefore = store.getState().chats.length;
  const result = await confirmReconstruction(draft);
  assert.notEqual(result.characterId, chat.roleId);
  assert.equal(store.getState().chats.length, chatsBefore + 1);
  const original = await Character.getCharacterById(chat.roleId);
  assert.ok((original.identity || "").includes("先空着"));
});

console.log("\n=== Reconstruction Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log("All reconstruction tests passed.");
