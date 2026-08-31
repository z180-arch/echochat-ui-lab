// ============================================================
//  EchoChat Rebuild · Test Suite
//  核心模块单元测试（浏览器控制台运行）
//  用法：在浏览器控制台执行 import("./tests/run.js")
// ============================================================

import { store } from "../src/core/store.js";
import { events, EVT } from "../src/core/events.js";
import { uid, esc, hashStr, formatDateTime, relativeTime, renderMarkdown } from "../src/core/utils.js";
import { getRoleId, getPersona, getRoleName, createFromTemplate, getSystemTemplates } from "../src/domain/persona.js";
import { getMemoryList, addMemory, buildMemoryBlock, rememberMessage } from "../src/domain/memory.js";
import { getAffinity, recordChatTurn } from "../src/domain/relations.js";

const results = [];
let passed = 0;
let failed = 0;

function assert(name, condition, detail = "") {
  if (condition) {
    passed++;
    results.push({ name, status: "PASS", detail });
    console.log(`✅ ${name}`);
  } else {
    failed++;
    results.push({ name, status: "FAIL", detail });
    console.error(`❌ ${name}: ${detail}`);
  }
}

function assertEq(name, actual, expected) {
  assert(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ============================================================
//  1. Utils 测试
// ============================================================
console.group("📦 Utils");
assertEq("uid() 返回非空字符串", !!uid(), true);
assertEq("uid() 两次调用不同", uid() !== uid(), true);
assertEq("esc() 转义 HTML", esc("<script>"), "&lt;script&gt;");
assertEq("esc() 处理 null", esc(null), "");
assertEq("hashStr() 稳定输出", hashStr("hello") === hashStr("hello"), true);
assertEq("hashStr() 不同输入不同输出", hashStr("hello") !== hashStr("world"), true);
assertEq("formatDateTime() 返回字符串", typeof formatDateTime(Date.now()), "string");
assertEq("relativeTime() 返回字符串", typeof relativeTime(Date.now()), "string");
assertEq("renderMarkdown() 处理纯文本", renderMarkdown("hello"), "hello");
assertEq("renderMarkdown() 处理加粗", renderMarkdown("**bold**").includes("<strong>"), true);
assertEq("renderMarkdown() 处理代码", renderMarkdown("`code`").includes("md-inline"), true);
console.groupEnd();

// ============================================================
//  2. Events 测试
// ============================================================
console.group("📡 Events");
let eventFired = false;
const off = events.on("test:event", () => { eventFired = true; });
events.emit("test:event");
assertEq("事件触发", eventFired, true);
off();
eventFired = false;
events.emit("test:event");
assertEq("事件取消订阅后不触发", eventFired, false);

let payloadReceived = null;
events.once("test:once", (p) => { payloadReceived = p; });
events.emit("test:once", { value: 42 });
assertEq("once 事件接收 payload", payloadReceived?.value, 42);
payloadReceived = null;
events.emit("test:once", { value: 99 });
assertEq("once 只触发一次", payloadReceived, null);
console.groupEnd();

// ============================================================
//  3. Store 测试
// ============================================================
console.group("🗄️ Store");
const initialState = store.getState();
assertEq("store 有 chats 数组", Array.isArray(initialState.chats), true);
assertEq("store 有 settings 对象", typeof initialState.settings, "object");
assertEq("store 有 ui 对象", typeof initialState.ui, "object");
assertEq("store 有 longTermMemory 对象", typeof initialState.longTermMemory, "object");

// 测试订阅
let storeNotified = false;
const unsub = store.subscribe(() => { storeNotified = true; });
store.setActiveTab("moments");
assertEq("store 订阅触发", storeNotified, true);
unsub();

// 测试创建聊天
const chatCountBefore = store.getState().chats.length;
const newChat = store.createChat({
  name: "测试角色",
  persona: "测试人设",
  firstMessage: "你好",
});
assertEq("createChat 返回 chat", !!newChat, true);
assertEq("createChat 增加 chats 数量", store.getState().chats.length, chatCountBefore + 1);
assertEq("createChat 设置 currentChatId", store.getState().currentChatId, newChat.id);
assertEq("createChat 包含开场白", newChat.messages?.length, 1);

// 测试添加消息
const msgCountBefore = newChat.messages.length;
const msg = store.addMessage(newChat.id, { role: "me", text: "测试消息" });
assertEq("addMessage 返回消息", !!msg, true);
assertEq("addMessage 增加消息数", store.getCurrentChat().messages.length, msgCountBefore + 1);

// 测试更新消息
store.updateMessage(newChat.id, msg.id, { text: "更新后的消息" });
assertEq("updateMessage 更新文本", store.getCurrentChat().messages.find(m => m.id === msg.id).text, "更新后的消息");

// 测试删除消息
store.deleteMessage(newChat.id, msg.id);
assertEq("deleteMessage 删除消息", store.getCurrentChat().messages.find(m => m.id === msg.id), undefined);

// 测试删除聊天
store.deleteChat(newChat.id);
assertEq("deleteChat 删除聊天", store.getState().chats.find(c => c.id === newChat.id), undefined);

// 恢复 tab
store.setActiveTab("messages");
console.groupEnd();

// ============================================================
//  4. Persona 测试
// ============================================================
console.group("👤 Persona");
const templates = getSystemTemplates();
assertEq("getSystemTemplates 返回数组", Array.isArray(templates), true);
assertEq("getSystemTemplates 有模板", templates.length > 0, true);

const femaleTemplates = getSystemTemplates("female");
assertEq("female 模板存在", femaleTemplates.length > 0, true);

const testChat = { roleId: "role_test", name: "测试", config: { persona: "测试人设" } };
assertEq("getRoleId 返回 roleId", getRoleId(testChat), "role_test");
assertEq("getPersona 返回人设", getPersona(testChat), "测试人设");
assertEq("getRoleName 返回名字", getRoleName(testChat), "测试");
assertEq("getRoleId 处理 null", getRoleId(null), null);
assertEq("getPersona 处理 null", getPersona(null), "");
console.groupEnd();

// ============================================================
//  5. Memory 测试
// ============================================================
console.group("🧠 Memory");
const testRoleId = "role_test_memory";
const memBefore = getMemoryList(testRoleId).length;
const newMem = addMemory(testRoleId, "用户喜欢咖啡", 8, "test");
assertEq("addMemory 返回记忆", !!newMem, true);
assertEq("addMemory 增加记忆数", getMemoryList(testRoleId).length, memBefore + 1);
assertEq("记忆按重要性排序", getMemoryList(testRoleId)[0].importance >= getMemoryList(testRoleId)[getMemoryList(testRoleId).length - 1].importance, true);

const block = buildMemoryBlock(testRoleId);
assertEq("buildMemoryBlock 返回文本", typeof block, "string");
assertEq("buildMemoryBlock 包含记忆内容", block?.includes("用户喜欢咖啡"), true);

const emptyBlock = buildMemoryBlock("role_nonexistent");
assertEq("buildMemoryBlock 空角色返回 null", emptyBlock, null);
console.groupEnd();

// ============================================================
//  6. Relations 测试
// ============================================================
console.group("❤️ Relations");
const relRoleId = "role_test_rel";
recordChatTurn(relRoleId, "测试角色");
const affinity = getAffinity(relRoleId, { moments: [] });
assertEq("getAffinity 返回对象", typeof affinity, "object");
assertEq("getAffinity 有 score", typeof affinity.score, "number");
assertEq("getAffinity 有 turns", affinity.turns >= 1, true);
assertEq("getAffinity 有 knownDays", typeof affinity.knownDays, "number");
assertEq("getAffinity 有 toneHint", typeof affinity.toneHint, "string");
console.groupEnd();

// ============================================================
//  7. 数据一致性测试
// ============================================================
console.group("🔗 数据一致性");
const consistencyChat = store.createChat({
  name: "一致性测试",
  persona: "一致性人设",
  firstMessage: "你好",
});
const roleId = getRoleId(consistencyChat);
assertEq("chat 有稳定 roleId", !!roleId, true);

addMemory(roleId, "一致性记忆", 5);
assertEq("记忆绑定 roleId", getMemoryList(roleId).length > 0, true);

recordChatTurn(roleId, "一致性测试");
const aff = getAffinity(roleId, { moments: [] });
assertEq("关系绑定 roleId", aff.turns >= 1, true);

// 人设变更不影响 roleId
store.updateChat(consistencyChat.id, { config: { ...consistencyChat.config, persona: "新人设" } });
assertEq("人设变更后 roleId 不变", getRoleId(store.getCurrentChat()), roleId);
assertEq("人设变更后记忆仍在", getMemoryList(roleId).length > 0, true);

store.deleteChat(consistencyChat.id);
console.groupEnd();

// ============================================================
//  汇总
// ============================================================
console.log("\n" + "=".repeat(50));
console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项`);
console.log("=".repeat(50));

export { results, passed, failed };
