// ============================================================
//  EchoChat Rebuild · Test Suite
//  用法：在浏览器控制台执行 import("./tests/run.js")
// ============================================================

import { uid, esc, hashStr, clamp, formatTime } from "../src/core/utils.js";
import { events, EVT } from "../src/core/events.js";
import { store } from "../src/core/store.js";
import { getRoleId, getPersona } from "../src/domain/persona.js";
import { addMemory, getMemoryList } from "../src/domain/memory.js";
import { getAffinity, recordChatTurn } from "../src/domain/relations.js";

let passed = 0;
let failed = 0;
const results = [];

function assert(name, cond) {
  if (cond) {
    passed++;
    results.push({ name, ok: true });
    console.log("✓", name);
  } else {
    failed++;
    results.push({ name, ok: false });
    console.error("✗", name);
  }
}

// Utils
assert("uid generates string", typeof uid() === "string" && uid().length > 5);
assert("esc escapes html", esc("<a>") === "&lt;a&gt;");
assert("hashStr stable", hashStr("abc") === hashStr("abc"));
assert("clamp", clamp(5, 0, 3) === 3 && clamp(-1, 0, 3) === 0);
assert("formatTime", /\d{2}:\d{2}/.test(formatTime(Date.now())));

// Events
{
  let hit = false;
  const off = events.on("test:evt", () => {
    hit = true;
  });
  events.emit("test:evt");
  assert("events on/emit", hit);
  off();
}

// Store
{
  const before = store.getState().chats.length;
  const chat = store.createChat({ name: "测试角色", persona: "测试人设" });
  assert("createChat", !!chat.id && store.getState().chats.length === before + 1);
  assert("getRoleId", !!getRoleId(chat));
  assert("getPersona", getPersona(chat) === "测试人设");
  store.selectChat(chat.id);
  assert("selectChat", store.getCurrentChat()?.id === chat.id);
}

// Memory
{
  const chat = store.getCurrentChat();
  const roleId = getRoleId(chat);
  addMemory(roleId, "记住：喜欢喝咖啡", { importance: 8 });
  const list = getMemoryList(roleId);
  assert("addMemory", list.some((m) => m.text.includes("咖啡")));
}

// Relations
{
  const chat = store.getCurrentChat();
  const roleId = getRoleId(chat);
  recordChatTurn(roleId, { delta: 2 });
  const aff = getAffinity(roleId);
  assert("recordChatTurn affinity", aff.affinity >= 2);
}

console.log("\n" + "=".repeat(50));
console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项`);
console.log("=".repeat(50));

export { results, passed, failed };
