/**
 * Lived Continuity Write Path MVP — summary candidates, pending, confirm.
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
const { events, EVT } = await import(srcHref("src/core/events.js"));
const { installStorageTestHooks, resetStorageTestHooks } = await import(
  srcHref("src/repository/test-hooks.js")
);
const { messageStore } = await import(srcHref("src/domain/message-store.js"));
const { createFromTemplate } = await import(srcHref("src/domain/persona.js"));
const { addMemory, getMemoryList, maybeAutoSummary } = await import(srcHref("src/domain/memory.js"));
const { getAffinity } = await import(srcHref("src/domain/relations.js"));
const { listMoments } = await import(srcHref("src/domain/moments.js"));
const { memoryReviewMarkup } = await import(srcHref("src/ui/views/memory-review.js"));
const { renderContinuitySheetContent } = await import(srcHref("src/ui/views/index.js"));
const {
  extractMemoryCandidates,
  candidatesFromSummary,
  confirmMemoryCandidates,
  setPendingCandidates,
  getPendingCandidates,
  clearPendingCandidates,
  resetPendingForTests,
  clonePendingForReview,
  applyAutoSummaryResult,
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
        content: msg.content ?? msg.text ?? "",
        createdAt: msg.createdAt || Date.now(),
      };
      messages.set(record.id, record);
      return record;
    },
    async update() {
      return null;
    },
    async delete() {},
  };
  const conversation = {
    async findById(id) {
      return conversations.get(id) || null;
    },
    async findByCharacterId(characterId) {
      return [...conversations.values()].filter((c) => c.characterId === characterId);
    },
    async create(c) {
      const record = { ...c, id: c.id || `conv-${Date.now()}` };
      conversations.set(record.id, record);
      return record;
    },
    async update() {
      return null;
    },
  };
  const character = {
    async findById(id) {
      return characters.get(id) || null;
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
  resetPendingForTests();
  if (typeof messageStore.resetRuntime === "function") messageStore.resetRuntime();
  resetStorageTestHooks();
  installStorageTestHooks(createMemoryBackends());
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
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
console.log("\n=== Continuity Write Path ===\n");

test("summary → candidates: max 5, default unchecked, 摘要 evidence", () => {
  resetAll();
  const summary = [
    "用户在上海工作",
    "用户讨厌香菜",
    "用户喜欢晚上散步",
    "用户下周要面试",
    "用户和家人同住",
    "用户养了一只猫",
  ].join("\n");
  const list = candidatesFromSummary(summary, "role_x");
  assert.equal(list.length, 5);
  assert.ok(list.every((c) => c.accepted === false));
  assert.ok(list.every((c) => c.evidence?.[0]?.source === "summary"));
});

test("quality filter drops filler, emotion, speculation, plot recap", () => {
  resetAll();
  const summary = [
    "你好",
    "好烦",
    "用户可能住在北京",
    "她笑了笑走到窗边",
    "用户在上海工作",
  ].join("\n");
  const list = candidatesFromSummary(summary, "role_x");
  assert.equal(list.length, 1);
  assert.ok(list[0].text.includes("上海"));
});

test("duplicate filtering vs existing memories", () => {
  resetAll();
  addMemory("role_dup", "用户在上海工作", 6, "manual");
  const list = candidatesFromSummary("用户在上海工作\n用户讨厌香菜", "role_dup");
  assert.equal(list.length, 2);
  assert.equal(list[0].duplicate, true);
  assert.equal(list[1].duplicate, false);
  assert.equal(list[0].accepted, false);
});

test("duplicate-only summary does not park pending or emit ready", () => {
  resetAll();
  addMemory("role_dup_only", "用户在上海工作", 6, "manual");
  let hits = 0;
  const off = events.on(EVT.MEMORY_CANDIDATES_READY, () => {
    hits += 1;
  });
  const { count } = applyAutoSummaryResult("role_dup_only", "【摘要】\n用户在上海工作", { chatId: "c1" });
  off();
  assert.equal(count, 0);
  assert.equal(hits, 0);
  assert.equal(getPendingCandidates("role_dup_only"), null);
});

test("不可能 is not treated as speculation", () => {
  resetAll();
  const list = candidatesFromSummary("用户说不可能再吃香菜\n用户可能住在北京", "role_x");
  assert.equal(list.length, 1);
  assert.ok(list[0].text.includes("不可能"));
});

test("pending replace overwrites previous batch", () => {
  resetAll();
  setPendingCandidates("role_p", [{ id: "s1", text: "旧", accepted: false, duplicate: false, evidence: [] }], "c1");
  setPendingCandidates("role_p", [{ id: "s2", text: "新", accepted: false, duplicate: false, evidence: [] }], "c2");
  const pending = getPendingCandidates("role_p");
  assert.equal(pending.candidates.length, 1);
  assert.equal(pending.candidates[0].text, "新");
  assert.equal(pending.chatId, "c2");
});

test("cancel preserves pending (clone does not clear)", () => {
  resetAll();
  const parked = [{ id: "s1", text: "用户在上海工作", accepted: false, duplicate: false, evidence: [] }];
  setPendingCandidates("role_p", parked, "c1");
  const clone = clonePendingForReview("role_p");
  clone.candidates[0].text = "edited in modal";
  const still = getPendingCandidates("role_p");
  assert.equal(still.candidates[0].text, "用户在上海工作");
});

test("clonePendingForReview refreshes duplicates after remember", () => {
  resetAll();
  setPendingCandidates(
    "role_p",
    [{ id: "s1", text: "用户讨厌香菜", accepted: false, duplicate: false, evidence: [] }],
    "c1"
  );
  addMemory("role_p", "用户讨厌香菜", 6, "manual");
  const clone = clonePendingForReview("role_p");
  assert.equal(clone.candidates[0].duplicate, true);
  assert.equal(clone.candidates[0].accepted, false);
});

test("confirm writes memory; zero accepted writes nothing and keeps pending", () => {
  resetAll();
  const candidates = candidatesFromSummary("用户在上海工作", "role_c");
  setPendingCandidates("role_c", candidates, "chat1");
  const none = confirmMemoryCandidates("role_c", candidates, { postMoment: false });
  assert.equal(none.added, 0);
  assert.equal(getMemoryList("role_c").length, 0);
  assert.ok(getPendingCandidates("role_c"));

  const accepted = candidates.map((c) => ({ ...c, accepted: true }));
  const yes = confirmMemoryCandidates("role_c", accepted, { postMoment: false });
  assert.equal(yes.added, 1);
  assert.equal(getMemoryList("role_c").length, 1);
  assert.equal(getPendingCandidates("role_c"), null);
});

test("confirmed memory creates one relationship event without fact body", () => {
  resetAll();
  const candidates = candidatesFromSummary("用户在上海工作\n用户讨厌香菜", "role_e").map((c) => ({
    ...c,
    accepted: !c.duplicate,
  }));
  const result = confirmMemoryCandidates("role_e", candidates, { postMoment: false });
  assert.ok(result.added >= 1);
  const aff = getAffinity("role_e");
  const memoryEvents = (aff.events || []).filter((e) => e.type === "memory");
  assert.equal(memoryEvents.length, 1);
  assert.equal(memoryEvents[0].text, "记下了一件关于你的事");
  assert.ok(!String(aff.brief).includes("上海"));
});

test("optional Moment only after confirmed memory", () => {
  resetAll();
  const candidates = candidatesFromSummary("用户在上海工作", "role_m").map((c) => ({ ...c, accepted: true }));
  const off = confirmMemoryCandidates("role_m", candidates, { postMoment: false });
  assert.equal(listMoments("role_m").length, 0);
  assert.ok(!off.momentId);

  resetAll();
  const again = candidatesFromSummary("用户讨厌香菜", "role_m2").map((c) => ({ ...c, accepted: true }));
  const on = confirmMemoryCandidates("role_m2", again, { postMoment: true });
  assert.ok(on.momentId);
  assert.equal(listMoments("role_m2").length, 1);
  assert.ok(listMoments("role_m2")[0].content.startsWith("记下了。"));
});

test("applyAutoSummaryResult does not create Moment from 【动态】", () => {
  resetAll();
  const raw = `【摘要】
用户在上海工作
【动态】
今天又想起你说过讨厌香菜。`;
  const before = listMoments("role_a").length;
  const { count } = applyAutoSummaryResult("role_a", raw, { chatId: "chat_a" });
  assert.equal(count, 1);
  assert.equal(listMoments("role_a").length, before);
  assert.equal(getMemoryList("role_a").length, 0);
  assert.equal(getPendingCandidates("role_a").candidates.length, 1);
});

test("junk / empty summary fails closed — no pending", () => {
  resetAll();
  assert.equal(applyAutoSummaryResult("role_z", "【摘要】\n好烦\n【动态】嗨").count, 0);
  assert.equal(getPendingCandidates("role_z"), null);
});

test("MEMORY_CANDIDATES_READY fires only when count > 0", () => {
  resetAll();
  let hits = 0;
  const off = events.on(EVT.MEMORY_CANDIDATES_READY, () => {
    hits += 1;
  });
  applyAutoSummaryResult("role_z", "【摘要】\n好烦");
  applyAutoSummaryResult("role_z", "【摘要】\n用户在上海工作");
  off();
  assert.equal(hits, 1);
});

await testAsync("heuristic extract still works when no pending", async () => {
  resetAll();
  const chat = await seedChat();
  const { ok, candidates } = extractMemoryCandidates(chat.roleId, { chatId: chat.id });
  assert.equal(ok, true);
  assert.ok(candidates.some((c) => /香菜|上海|散步/.test(c.text)));
});

await testAsync("maybeAutoSummary API failure leaves memories and moments unchanged", async () => {
  resetAll();
  const chat = await seedChat();
  store.set((s) => ({
    ...s,
    memoryCfg: { ...s.memoryCfg, autoSummary: { ...s.memoryCfg.autoSummary, everyTurns: 1 } },
  }));
  const memBefore = getMemoryList(chat.roleId).length;
  const momBefore = listMoments(chat.roleId).length;
  await maybeAutoSummary(chat, {
    complete: async () => {
      throw new Error("network");
    },
  });
  assert.equal(getMemoryList(chat.roleId).length, memBefore);
  assert.equal(listMoments(chat.roleId).length, momBefore);
  assert.equal(getPendingCandidates(chat.roleId), null);
});

test("review markup: moment checkbox default off; summary evidence label", () => {
  const filled = memoryReviewMarkup({
    candidates: [
      {
        id: "s1",
        accepted: false,
        duplicate: false,
        text: "用户在上海工作",
        evidence: [{ index: 0, excerpt: "用户在上海工作", source: "summary" }],
      },
    ],
  });
  assert.ok(filled.content.includes('id="mem-post-moment"'));
  assert.ok(!/id="mem-post-moment"[^>]*checked/.test(filled.content));
  assert.ok(filled.content.includes("同时在痕迹里记一笔"));
  assert.ok(filled.content.includes("摘要「"));
  assert.ok(filled.footer.includes("disabled"));
});

test("continuity sheet shows pending hint", () => {
  resetAll();
  setPendingCandidates(
    "role_hint",
    [{ id: "s1", text: "用户在上海工作", accepted: false, duplicate: false, evidence: [] }],
    "c1"
  );
  const html = renderContinuitySheetContent("role_hint", "c1");
  assert.ok(html.includes("待确认"));
  assert.ok(html.includes("从对话提取"));
});

console.log(`\nContinuity Write Path: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
