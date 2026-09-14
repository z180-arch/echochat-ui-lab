/**
 * Memory ON vs OFF attribution experiment.
 * Does not change product code. Credentials from env only; never logged.
 *
 * Memory ON injects stored facts through the same prompt slot the product uses.
 * Product retrieve is logged but not required, so weakly related queries can
 * still test model utilization vs current-input inference.
 */
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
function srcHref(relativePath) {
  return pathToFileURL(join(ROOT, relativePath)).href;
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
  ECHOCHAT_CONFIG: {
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
    contextMaxMessages: 40,
  },
  localStorage: localStorageMock,
  addEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
};
global.localStorage = localStorageMock;
if (typeof globalThis.performance?.now !== "function") {
  globalThis.performance = { now: () => Date.now() };
}
global.window.performance = globalThis.performance;
if (typeof global.URL.createObjectURL !== "function") {
  global.URL.createObjectURL = () => "blob:mock";
  global.URL.revokeObjectURL = () => {};
}

const { store } = await import(srcHref("src/core/store.js"));
const { addMemory, getMemoryList, retrieveMemoriesForTurn, noteRetrieveChat, isGapIdle } = await import(
  srcHref("src/domain/memory.js")
);
const { getRoleId, createFromTemplate } = await import(srcHref("src/domain/persona.js"));
const { assembleBehaviorContext } = await import(srcHref("src/domain/context-builder.js"));
const { buildWorldbookBlock, saveWorldbook } = await import(srcHref("src/domain/worldbook.js"));
const { assembleTurnContext } = await import(srcHref("src/domain/turn-context.js"));
const { getAffinity, recordChatTurn } = await import(srcHref("src/domain/relations.js"));
const { listMoments } = await import(srcHref("src/domain/moments.js"));
const { createEchoContext, applyPluginContext } = await import(srcHref("src/runtime/index.js"));
const { messageStore } = await import(srcHref("src/domain/message-store.js"));
const { buildMessages, chatCompletion } = await import(srcHref("src/domain/provider.js"));

const PHOTO = "我最近开始学习摄影";
const WORLD_FILM = "林夏喜欢胶片摄影，常用手动对焦。";
const API_KEY = String(process.env.ECHOCHAT_API_KEY || process.env.SILICONFLOW_API_KEY || "").trim();
const BASE_URL = String(process.env.ECHOCHAT_BASE_URL || "https://api.siliconflow.cn/v1").trim();
const MODEL = String(process.env.ECHOCHAT_MODEL || "Qwen/Qwen2.5-7B-Instruct").trim();

const LINXIA = {
  name: "林夏",
  persona:
    "你是林夏，温和、自然、有一点调侃感。说话像长期聊天的朋友，短句口语化。不会把系统信息当成数据库记录朗读，不要说「根据我的记忆」「根据之前保存的记忆」。知道的事就当作你本来知道，轻轻用，不要列档案。",
  firstMessage: "我在。今天想聊点什么？",
};
const COLD = {
  name: "岑",
  persona:
    "你是岑，冷淡、简洁、理性。少比喻，少感叹。不主动热情，也不把用户资料当报告宣读。知道的事实直接用，一句带过。",
  firstMessage: "说。",
};

function resetAll() {
  localStorage.clear();
  store.reset();
}

function mentionsPhoto(text) {
  return /摄影|拍照|照相|拍点|相机|镜头/.test(String(text || ""));
}

function assembleWithOptionalMemory(chat, query, forceMemories) {
  const roleId = getRoleId(chat);
  noteRetrieveChat(chat?.id);
  const affinity = roleId ? getAffinity(roleId, { moments: listMoments(roleId) }) : null;
  const retrieveOpts = { lastChatAt: affinity?.lastChatAt };
  const productRetrieved = roleId ? retrieveMemoriesForTurn(roleId, query, undefined, retrieveOpts) : [];
  const memories = forceMemories != null ? forceMemories : productRetrieved;
  const assembled = assembleBehaviorContext({
    chat,
    memories,
    affinity,
    gapReturn: isGapIdle(retrieveOpts),
  });
  const history = chat?.id ? messageStore.peekMessages(chat.id) : [];
  const world = buildWorldbookBlock(chat, history, roleId, "") || null;
  const context = applyPluginContext(
    createEchoContext({
      character: chat,
      conversation: chat,
      memory: memories,
      relationship: affinity,
      world,
      moments: roleId ? listMoments(roleId) : null,
      session: { chatId: chat?.id, query, extraPrompt: "" },
    })
  );
  const parts = [];
  if (assembled.behavior) parts.push(assembled.behavior);
  if (world) parts.push(world);
  const extraPrompt = context?.session?.extraPrompt;
  if (extraPrompt && String(extraPrompt).trim()) parts.push(String(extraPrompt).trim());
  return {
    prompt: parts.join("\n\n"),
    injected: Array.isArray(memories) ? memories.map((m) => m.content) : [],
    productRetrieved: productRetrieved.map((m) => m.content),
  };
}

async function runOnce({ label, persona, memoryOn, gap, userText }) {
  resetAll();
  store.updateSettings({ apiKey: API_KEY, baseUrl: BASE_URL, model: MODEL });
  const created = await createFromTemplate(persona);
  if (memoryOn) addMemory(created.roleId, PHOTO, 7, "auto");
  if (gap) recordChatTurn(created.roleId, persona.name, Date.now() - 3 * 86400000);
  const chat = store.createChat({
    roleId: created.roleId,
    name: persona.name,
    persona: persona.persona,
  });
  store.selectChat(chat.id);
  const forceMemories = memoryOn ? getMemoryList(created.roleId) : [];
  const assembled = assembleWithOptionalMemory(chat, userText, forceMemories);
  await messageStore.addMessage(chat.id, { role: "me", text: userText, status: "sent" });
  const history = messageStore.peekMessages(chat.id);
  const messages = buildMessages(chat, assembled.prompt, history);
  let text = "";
  let error = "";
  try {
    text = await chatCompletion(chat, messages, { temperature: 0.8, maxTokens: 220 });
  } catch (e) {
    error = String(e && e.message ? e.message : e).slice(0, 240);
  }
  const saved = getMemoryList(created.roleId).some((m) => /摄影/.test(m.content));
  const header = /Known about the user/.test(assembled.prompt);
  const lived = /continue the lived thread/.test(assembled.prompt);
  const presentedUserPhoto = /用户最近开始学习摄影/.test(assembled.prompt);
  console.log(`\n===== ${label} =====`);
  console.log(`Character: ${persona.name}`);
  console.log(`Memory: ${memoryOn ? "ON" : "OFF"} saved=${saved}`);
  console.log(`Gap idle: ${gap ? "yes" : "no"}`);
  console.log(`Input: ${userText}`);
  console.log(`Product retrieve would: ${JSON.stringify(assembled.productRetrieved)}`);
  console.log(`Injected for this run: ${JSON.stringify(assembled.injected)}`);
  console.log(`Remembered header: ${header ? "yes" : "no"}`);
  console.log(`Presented as user fact: ${presentedUserPhoto ? "yes" : "no"}`);
  console.log(`Lived thread: ${lived ? "yes" : "no"}`);
  console.log(`Mentions photography: ${mentionsPhoto(text) ? "yes" : "no"}`);
  if (error) console.log(`Error: ${error}`);
  console.log("Model output:");
  console.log(text || "(empty)");
}

function seedFilmWorld() {
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
            content: WORLD_FILM,
            enabled: true,
            constant: true,
            depth: 10,
            priority: 100,
          },
        ],
      },
    ],
  });
}

async function runProduct({ label, persona, memoryOn, worldOn, userText }) {
  resetAll();
  store.updateSettings({ apiKey: API_KEY, baseUrl: BASE_URL, model: MODEL });
  const created = await createFromTemplate(persona);
  if (memoryOn) addMemory(created.roleId, PHOTO, 7, "auto");
  if (worldOn) seedFilmWorld();
  const chat = store.createChat({
    roleId: created.roleId,
    name: persona.name,
    persona: persona.persona,
  });
  store.selectChat(chat.id);
  await messageStore.addMessage(chat.id, { role: "me", text: userText, status: "sent" });
  const assembled = assembleTurnContext(chat, { query: userText });
  const messages = buildMessages(chat, assembled.prompt, messageStore.peekMessages(chat.id));
  let text = "";
  let error = "";
  try {
    text = await chatCompletion(chat, messages, { temperature: 0.8, maxTokens: 220 });
  } catch (e) {
    error = String(e && e.message ? e.message : e).slice(0, 240);
  }
  console.log(`\n===== ${label} =====`);
  console.log(`Character: ${persona.name}`);
  console.log(`Memory: ${memoryOn ? "ON" : "OFF"} World: ${worldOn ? "ON" : "OFF"}`);
  console.log(`Input: ${userText}`);
  console.log(`User fact in prompt: ${/用户最近开始学习摄影/.test(assembled.prompt) ? "yes" : "no"}`);
  console.log(`Film lore in prompt: ${assembled.prompt.includes(WORLD_FILM) ? "yes" : "no"}`);
  console.log(`World slot labeled: ${/not facts about the user/i.test(assembled.prompt) ? "yes" : "no"}`);
  console.log(`Mentions photography: ${mentionsPhoto(text) ? "yes" : "no"}`);
  if (error) console.log(`Error: ${error}`);
  console.log("Model output:");
  console.log(text || "(empty)");
}

if (!API_KEY) {
  console.log("Live attribution SKIPPED: no ECHOCHAT_API_KEY.");
  process.exit(0);
}

const cfgHost = BASE_URL.replace(/https?:\/\//, "").split("/")[0];
console.log("=== EchoChat memory attribution (ON vs OFF) ===");
console.log(`provider_host=${cfgHost}`);
console.log(`model=${MODEL}`);
console.log("api_key=present");
console.log("temperature=0.8 maxTokens=220");

await runOnce({ label: "T1 拍点东西 ON", persona: LINXIA, memoryOn: true, gap: false, userText: "我周末想出去拍点东西。" });
await runOnce({ label: "T1 拍点东西 OFF", persona: LINXIA, memoryOn: false, gap: false, userText: "我周末想出去拍点东西。" });
await runOnce({ label: "T2 准备出门 ON", persona: LINXIA, memoryOn: true, gap: false, userText: "我周末准备出门。" });
await runOnce({ label: "T2 准备出门 OFF", persona: LINXIA, memoryOn: false, gap: false, userText: "我周末准备出门。" });
await runOnce({ label: "T3 今天有点累 ON", persona: LINXIA, memoryOn: true, gap: false, userText: "今天有点累。" });
await runOnce({ label: "T3 今天有点累 OFF", persona: LINXIA, memoryOn: false, gap: false, userText: "今天有点累。" });
await runOnce({ label: "T4 gap 最近怎么样 林夏 ON", persona: LINXIA, memoryOn: true, gap: true, userText: "最近怎么样？" });
await runOnce({ label: "T4 gap 最近怎么样 林夏 OFF", persona: LINXIA, memoryOn: false, gap: true, userText: "最近怎么样？" });
await runOnce({ label: "T4 gap 最近怎么样 岑 ON", persona: COLD, memoryOn: true, gap: true, userText: "最近怎么样？" });
await runOnce({ label: "T4 gap 最近怎么样 岑 OFF", persona: COLD, memoryOn: false, gap: true, userText: "最近怎么样？" });
await runOnce({ label: "T5 你还记得我最近在忙什么吗 ON", persona: LINXIA, memoryOn: true, gap: false, userText: "你还记得我最近在忙什么吗？" });
await runOnce({ label: "T6 你最近在忙什么 ON", persona: LINXIA, memoryOn: true, gap: false, userText: "你最近在忙什么？" });
await runOnce({ label: "T6 你最近在忙什么 OFF", persona: LINXIA, memoryOn: false, gap: false, userText: "你最近在忙什么？" });
await runProduct({
  label: "T-MW Memory+World 拍点东西",
  persona: LINXIA,
  memoryOn: true,
  worldOn: true,
  userText: "我周末想出去拍点东西。",
});
await runProduct({
  label: "T-W World only 拍点东西",
  persona: LINXIA,
  memoryOn: false,
  worldOn: true,
  userText: "我周末想出去拍点东西。",
});
