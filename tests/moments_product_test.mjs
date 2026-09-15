/**
 * Moments product: persist, list, order, dedupe, lifecycle, summary-dynamic gate.
 */
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcHref(relativePath) {
  return pathToFileURL(join(__dirname, "..", relativePath)).href;
}
function srcFile(relativePath) {
  return join(__dirname, "..", relativePath);
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
const { events, EVT } = await import(srcHref("src/core/events.js"));
const { addMoment, listMoments, deleteMoment, deleteMomentsForRole, deleteMomentsForChat, ingestSummaryDynamic, saveMoments, resetMomentsRuntime } = await import(srcHref("src/domain/moments.js"));
const { applyAutoSummaryResult } = await import(srcHref("src/domain/memory-candidates.js"));
const { createFromTemplate } = await import(srcHref("src/domain/persona.js"));
const { Character } = await import(srcHref("src/domain/character.js"));
const { deleteConversation } = await import(srcHref("src/domain/conversation.js"));

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
  saveMoments({ version: 2, moments: [] });
}

console.log("\n=== Moments product ===");

test("create / persist / list / newest first", () => {
  resetAll();
  addMoment({ roleId: "role_a", roleName: "林夏", content: "较早的散步", source: "manual", createdAt: 1000 });
  addMoment({ roleId: "role_a", roleName: "林夏", content: "后来去了咖啡馆", source: "manual", createdAt: 2000 });
  const list = listMoments("role_a");
  assert.equal(list.length, 2);
  assert.equal(list[0].content, "后来去了咖啡馆");
  assert.equal(list[1].content, "较早的散步");
});

test("character association isolates lists", () => {
  resetAll();
  addMoment({ roleId: "role_a", roleName: "A", content: "A 的公园", source: "manual" });
  addMoment({ roleId: "role_b", roleName: "B", content: "B 的夜班", source: "manual" });
  assert.equal(listMoments("role_a").length, 1);
  assert.equal(listMoments("role_a")[0].content, "A 的公园");
  assert.equal(listMoments("role_b")[0].content, "B 的夜班");
});

test("duplicate content / sourceKey / relatedMemoryId do not multiply", () => {
  resetAll();
  const first = addMoment({
    roleId: "role_a",
    roleName: "林夏",
    content: "一起去了那家咖啡馆",
    source: "auto_summary",
    sourceKey: "auto:role_a:k",
    chatId: "chat_1",
  });
  const again = addMoment({
    roleId: "role_a",
    roleName: "林夏",
    content: "一起去了那家咖啡馆",
    source: "reconstruction",
    chatId: "chat_2",
  });
  const byKey = addMoment({
    roleId: "role_a",
    roleName: "林夏",
    content: "另一句",
    source: "auto_summary",
    sourceKey: "auto:role_a:k",
  });
  const mem1 = addMoment({
    roleId: "role_a",
    roleName: "林夏",
    content: "记下了。用户在上海工作",
    source: "memory",
    relatedMemoryId: "mem_1",
  });
  const mem2 = addMoment({
    roleId: "role_a",
    roleName: "林夏",
    content: "记下了。用户在上海工作（复述）",
    source: "memory",
    relatedMemoryId: "mem_1",
  });
  assert.equal(first.id, again.id);
  assert.equal(first.id, byKey.id);
  assert.equal(mem1.id, mem2.id);
  assert.equal(listMoments("role_a").length, 2);
});

test("conversation delete only drops chat-scoped moments", () => {
  resetAll();
  addMoment({
    roleId: "role_a",
    roleName: "林夏",
    content: "这条跟着相处线",
    source: "auto_summary",
    chatId: "chat_gone",
  });
  addMoment({
    roleId: "role_a",
    roleName: "林夏",
    content: "这条跟着角色",
    source: "reconstruction",
  });
  assert.equal(deleteMomentsForChat("chat_gone"), 1);
  const left = listMoments("role_a");
  assert.equal(left.length, 1);
  assert.equal(left[0].content, "这条跟着角色");
});

test("role delete and single delete", () => {
  resetAll();
  const a = addMoment({ roleId: "role_a", roleName: "A", content: "A1", source: "manual" });
  addMoment({ roleId: "role_b", roleName: "B", content: "B1", source: "manual" });
  assert.ok(deleteMoment(a.id));
  assert.equal(listMoments("role_a").length, 0);
  assert.equal(deleteMomentsForRole("role_b"), 1);
  assert.equal(listMoments("all").length, 0);
});

test("LLM 动态 restatement is not a permanent moment", () => {
  resetAll();
  const raw = `【摘要】
用户在上海工作
【动态】
今天又想起你说过讨厌香菜。`;
  const { count } = applyAutoSummaryResult("role_a", raw, { chatId: "chat_a" });
  assert.equal(count, 1);
  assert.equal(listMoments("role_a").length, 0);
});

test("lived-scene 动态 converts once", () => {
  resetAll();
  const raw = `【摘要】
用户在上海工作
【动态】
今天下午我们一起去了那家咖啡馆。`;
  const first = ingestSummaryDynamic("role_a", raw, { roleName: "林夏", chatId: "c1" });
  const second = ingestSummaryDynamic("role_a", raw, { roleName: "林夏", chatId: "c1" });
  assert.equal(first.persisted, true);
  assert.equal(second.persisted, false);
  assert.equal(listMoments("role_a").length, 1);
  assert.ok(listMoments("role_a")[0].content.includes("咖啡馆"));
  assert.equal(listMoments("role_a")[0].chatId, "c1");
});

await testAsync("character delete clears leftover moments", async () => {
  resetAll();
  const chat = await createFromTemplate({ name: "林夏", persona: "温和", firstMessage: "我在。" });
  addMoment({ roleId: chat.roleId, roleName: "林夏", content: "公园长椅", source: "manual" });
  addMoment({
    roleId: chat.roleId,
    roleName: "林夏",
    content: "这条线里的雨",
    source: "auto_summary",
    chatId: chat.id,
  });
  await Character.permanentDeleteCharacter(chat.roleId);
  assert.equal(listMoments(chat.roleId).length, 0);
});

await testAsync("deleting one conversation keeps character-level moments", async () => {
  resetAll();
  const a = await createFromTemplate({ name: "林夏", persona: "温和", firstMessage: "我在。" });
  const extra = store.createChat({ roleId: a.roleId, name: "第二线", persona: "温和" });
  addMoment({
    roleId: a.roleId,
    roleName: "林夏",
    content: "第二线的雨夜",
    source: "auto_summary",
    chatId: extra.id,
  });
  addMoment({
    roleId: a.roleId,
    roleName: "林夏",
    content: "从一段聊天记录里重新认识了林夏",
    source: "reconstruction",
    sourceKey: `reconstruction:${a.roleId}`,
  });
  await deleteConversation(extra.id);
  const left = listMoments(a.roleId);
  assert.equal(left.length, 1);
  assert.ok(left[0].content.includes("重新认识"));
});

test("moments tab is a real shell surface", () => {
  const views = readFileSync(srcFile("src/ui/views/index.js"), "utf8");
  const storeSrc = readFileSync(srcFile("src/core/store.js"), "utf8");
  assert.ok(views.includes('switchTab(\'moments\')'));
  assert.ok(views.includes("renderMomentsPane"));
  assert.ok(views.includes("还没有一起经历过的事"));
  assert.ok(views.includes("不是整段聊天记录"));
  assert.ok(storeSrc.includes('tab === "moments"'));
  assert.ok(!storeSrc.includes('tab === "chats" || tab === "moments"'));
});

test("addMoment emits MOMENT_ADDED only for a new row", () => {
  resetAll();
  let n = 0;
  const off = events.on(EVT.MOMENT_ADDED, () => {
    n += 1;
  });
  addMoment({ roleId: "role_a", roleName: "A", content: "公园长椅", source: "manual" });
  addMoment({ roleId: "role_a", roleName: "A", content: "公园长椅", source: "manual" });
  off();
  assert.equal(n, 1);
});

console.log(`\nMoments Product: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
