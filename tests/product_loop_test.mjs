/**
 * Product loop: delete, new conversation slots, backup satellites, reconstruction transcript.
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
const { createFromTemplate, buildCharacterCard } = await import(srcHref("src/domain/persona.js"));
const { createConversationForCharacter, deleteConversation, getThreadTitle, renameConversation } = await import(
  srcHref("src/domain/conversation.js")
);
const { startConversationForCharacter } = await import(srcHref("src/domain/character-hub.js"));
const { Character } = await import(srcHref("src/domain/character.js"));
const { addMemory, getMemoryList, resetMemoriesRuntime } = await import(srcHref("src/domain/memory.js"));
const { recordRelationshipEvent, getAffinity, saveRelations, resetRelationsRuntime } = await import(srcHref("src/domain/relations.js"));
const { addMoment, listMoments, saveMoments, resetMomentsRuntime } = await import(srcHref("src/domain/moments.js"));
const { saveWorldbook, loadWorldbook, resetWorldbookRuntime } = await import(srcHref("src/domain/worldbook.js"));
const { exportProductBackup, importProductBackup } = await import(srcHref("src/domain/backup.js"));
const { confirmReconstruction, buildReconstructionDraft } = await import(
  srcHref("src/domain/reconstruction/index.js")
);
const { messageStore } = await import(srcHref("src/domain/message-store.js"));

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

function resetAll() {
  localStorage.clear();
  store.reset();
  resetMomentsRuntime();
  resetWorldbookRuntime();
  resetRelationsRuntime();
  resetMemoriesRuntime();
}

console.log("\n=== Product loop ===");

await testAsync("deleteConversation removes the chat and retargets the current one", async () => {
  resetAll();
  const a = store.createChat({ roleId: "role_del", name: "林夏", persona: "温和" });
  const b = store.createChat({ roleId: "role_del", name: "第二线", persona: "温和" });
  store.selectChat(b.id);
  await deleteConversation(b.id);
  const ids = store.getState().chats.map((c) => c.id);
  assert.ok(ids.includes(a.id));
  assert.ok(!ids.includes(b.id));
  assert.equal(store.getState().currentChatId, a.id);
});

await testAsync("permanentDeleteCharacter removes chats, memory, relation, moments", async () => {
  resetAll();
  const chat = await createFromTemplate({ name: "岑", persona: "冷淡", firstMessage: "说。" });
  addMemory(chat.roleId, "用户最近开始学习吉他", 7, "auto");
  recordRelationshipEvent(chat.roleId, { type: "note", text: "一起熬过夜班" });
  addMoment({ roleId: chat.roleId, roleName: "岑", content: "夜班结束", source: "manual" });
  await Character.permanentDeleteCharacter(chat.roleId);
  assert.equal(store.getState().chats.filter((c) => c.roleId === chat.roleId).length, 0);
  assert.equal(getMemoryList(chat.roleId).length, 0);
  assert.equal(listMoments(chat.roleId).length, 0);
  assert.ok(!getAffinity(chat.roleId).brief);
});

await testAsync("new conversation copies scenario, examples, and speaking style", async () => {
  resetAll();
  const chat = await createFromTemplate({
    name: "林夏",
    persona: "温和",
    firstMessage: "我在。",
    scenario: "雨夜便利店",
    mesExample: "我: 在吗\n林夏: 嗯，我在。",
    speakingStyle: "短句，口语",
  });
  const next = await startConversationForCharacter(chat.roleId);
  assert.notEqual(next.id, chat.id);
  assert.equal(next.name, "林夏");
  assert.equal(next.config.threadTitle, "相处线 2");
  assert.equal(getThreadTitle(chat), "日常相处");
  assert.equal(getThreadTitle(next), "相处线 2");
  assert.equal(next.config.scenario, "雨夜便利店");
  assert.equal(next.config.mesExample, "我: 在吗\n林夏: 嗯，我在。");
  assert.equal(next.config.speakingStyle, "短句，口语");
  const card = buildCharacterCard(chat);
  assert.equal(card.data.scenario, "雨夜便利店");
  assert.equal(card.data.mes_example, "我: 在吗\n林夏: 嗯，我在。");
  assert.ok(card.data.personality.includes("短句"));
});

await testAsync("createConversationForCharacter copies slots from the existing thread", async () => {
  resetAll();
  store.createChat({
    roleId: "role_copy",
    name: "林夏",
    persona: "温和",
    scenario: "海边",
    mesExample: "示例",
    speakingStyle: "轻声",
  });
  const next = createConversationForCharacter("role_copy", { title: "新对话" });
  assert.equal(next.name, "林夏");
  assert.equal(next.config.threadTitle, "新对话");
  assert.equal(next.config.scenario, "海边");
  assert.equal(next.config.mesExample, "示例");
  assert.equal(next.config.speakingStyle, "轻声");
});

await testAsync("renameConversation writes threadTitle without changing character name", async () => {
  resetAll();
  const chat = await createFromTemplate({ name: "林夏", persona: "温和", firstMessage: "我在。" });
  const next = createConversationForCharacter(chat.roleId, { title: "海边" });
  assert.equal(renameConversation(next.id, "雨夜便利店"), true);
  const updated = store.getState().chats.find((c) => c.id === next.id);
  assert.equal(updated.name, "林夏");
  assert.equal(updated.config.threadTitle, "雨夜便利店");
  assert.equal(getThreadTitle(updated), "雨夜便利店");
});

await testAsync("backup includes moments, relations, and worldbook", async () => {
  resetAll();
  const chat = store.createChat({ roleId: "role_bak", name: "林夏", persona: "温和" });
  addMoment({ roleId: chat.roleId, roleName: "林夏", content: "周末去公园", source: "manual" });
  recordRelationshipEvent(chat.roleId, { type: "note", text: "一起熬过夜班" });
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
            keys: ["摄影"],
            content: "林夏喜欢胶片摄影。",
            enabled: true,
            constant: true,
            depth: 10,
            priority: 100,
          },
        ],
      },
    ],
  });
  const blob = await exportProductBackup();
  assert.equal(blob.format, "echochat-backup");
  assert.ok(blob.state?.chats?.length >= 1);
  assert.ok((blob.moments?.moments || []).some((m) => m.content.includes("公园")));
  const relBefore = blob.relations.roles[chat.roleId];
  assert.ok(relBefore, "exported relations should include the character");
  assert.equal(relBefore.brief, "一起熬过夜班");
  assert.ok((blob.worldbook?.books || []).some((b) => (b.entries || []).some((e) => /胶片/.test(e.content))));

  saveMoments({ version: 2, moments: [] });
  saveRelations({ version: 2, checkIn: { lastDate: "", streak: 0 }, roles: {} });
  store.reset();
  await importProductBackup(blob, "replace");
  assert.ok(store.getState().chats.some((c) => c.roleId === chat.roleId));
  assert.ok(listMoments(chat.roleId).some((m) => m.content.includes("公园")));
  assert.equal(getAffinity(chat.roleId).brief, "一起熬过夜班");
  assert.ok(loadWorldbook().books.some((b) => (b.entries || []).some((e) => /胶片/.test(e.content))));
});

await testAsync("imported transcript becomes a continuable chat", async () => {
  resetAll();
  const log = `林晚: 我是咖啡店的店员。
我: 今天想吃火锅吗？
林晚: 讨厌香菜。
我: 那我们吃甜的。`;
  const { draft } = buildReconstructionDraft(log);
  const result = await confirmReconstruction(draft);
  assert.equal(result.ok, true);
  const msgs = messageStore.peekMessages(result.chatId);
  assert.ok(msgs.some((m) => m.role === "me" && m.text.includes("火锅")));
  assert.ok(msgs.some((m) => m.role === "her" && m.text.includes("香菜")));
  assert.ok(listMoments(result.characterId).length >= 1);
});

test("relationship brief is not overwritten by a memory event", () => {
  resetAll();
  recordRelationshipEvent("role_rel", { type: "note", text: "一起熬过夜班" });
  recordRelationshipEvent("role_rel", { type: "memory", text: "记下了一件关于你的事" });
  const aff = getAffinity("role_rel");
  assert.equal(aff.brief, "一起熬过夜班");
  assert.ok((aff.events || []).some((e) => e.type === "memory"));
});

console.log("\n=== Product loop results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log("All product loop tests passed.");
