/**
 * Real-model continuity validation harness.
 * Does not change product code. Uses EchoChat domain + current OpenAI-compatible provider.
 *
 * Credentials (never logged):
 *   ECHOCHAT_API_KEY, optional ECHOCHAT_BASE_URL, ECHOCHAT_MODEL
 *
 * System-layer inspection always runs. Live completions run only when a key is present.
 */
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalSecrets } from "./load_local_secrets.mjs";

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
// Keep Node's native Performance. Overwriting it with `{ now }` breaks undici fetch
// (`markResourceTiming is not a function`) after the first completion.
if (typeof globalThis.performance?.now !== "function") {
  globalThis.performance = { now: () => Date.now() };
}
global.window.performance = globalThis.performance;
if (typeof global.URL.createObjectURL !== "function") {
  global.URL.createObjectURL = () => "blob:mock";
  global.URL.revokeObjectURL = () => {};
}

const { store } = await import(srcHref("src/core/store.js"));
const { getMemoryList, retrieveMemoriesForTurn, getLastMemoryRetrieve, isGapIdle } = await import(
  srcHref("src/domain/memory.js")
);
const { quietRememberUserText, isQuietDurableFact, userTextIsKept } = await import(
  srcHref("src/domain/memory-candidates.js")
);
const { assembleTurnContext } = await import(srcHref("src/domain/turn-context.js"));
const { createFromTemplate } = await import(srcHref("src/domain/persona.js"));
const { recordChatTurn, getAffinity } = await import(srcHref("src/domain/relations.js"));
const { messageStore } = await import(srcHref("src/domain/message-store.js"));
const { buildMessages, chatCompletion, getApiConfig } = await import(srcHref("src/domain/provider.js"));

const PHOTO = "我最近开始学习摄影";
const secrets = loadLocalSecrets();
const API_KEY = String(process.env.ECHOCHAT_API_KEY || process.env.SILICONFLOW_API_KEY || secrets.apiKey || "").trim();
const BASE_URL = String(process.env.ECHOCHAT_BASE_URL || secrets.baseUrl || "https://api.siliconflow.cn/v1").trim();
const MODEL = String(process.env.ECHOCHAT_MODEL || secrets.model || "Qwen/Qwen2.5-7B-Instruct").trim();

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

function inspectTurn(chat, query, extra = {}) {
  const assembled = assembleTurnContext(chat, { query });
  const last = getLastMemoryRetrieve();
  const affinity = getAffinity(chat.roleId);
  const gap = isGapIdle({ lastChatAt: affinity?.lastChatAt, ...extra });
  const injected = Array.isArray(assembled.context?.memory) ? assembled.context.memory.map((m) => m.content) : [];
  const chip = !!(last.hadHit && last.chatId === chat.id && last.preview);
  return {
    query,
    quietWouldWrite: isQuietDurableFact(query),
    retrieved: injected,
    hadHit: !!last.hadHit,
    preview: last.preview || "",
    usedAnchors: !!last.usedAnchors,
    gapIdle: gap,
    chipWouldShow: chip,
    injected,
    promptHasPhoto: /摄影/.test(assembled.prompt),
    promptHasRememberedHeader: /Known about the user|remembered from past conversations/.test(assembled.prompt),
    promptHasLivedThread: /continue the lived thread/.test(assembled.prompt),
    personaHead: String(assembled.prompt || "").split("\n")[0].slice(0, 40),
    promptChars: assembled.prompt.length,
  };
}

function printInspect(label, info) {
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(info, null, 2));
}

async function liveReply(chat, userText) {
  if (!API_KEY) return { skipped: true, text: "", error: "" };
  const inspect = inspectTurn(chat, userText);
  await messageStore.addMessage(chat.id, { role: "me", text: userText, status: "sent" });
  const assembled = assembleTurnContext(chat, { query: userText });
  const history = messageStore.peekMessages(chat.id);
  const messages = buildMessages(chat, assembled.prompt, history);
  let text = "";
  let error = "";
  try {
    text = await chatCompletion(chat, messages, { temperature: 0.8, maxTokens: 220 });
  } catch (e) {
    error = String(e && e.message ? e.message : e).slice(0, 240);
  }
  if (text) {
    await messageStore.addMessage(chat.id, { role: "her", text, status: "sent" });
  }
  const injected = Array.isArray(assembled.context?.memory)
    ? assembled.context.memory.map((m) => m.content)
    : [];
  return {
    skipped: false,
    character: chat.name,
    input: userText,
    retrieved: injected,
    injected: injected.length > 0,
    chip: inspect.chipWouldShow,
    rememberedHeader: /Known about the user|remembered from past conversations/.test(assembled.prompt),
    text: String(text || ""),
    error,
  };
}

function printLive(id, reply) {
  console.log(`\n===== ${id} =====`);
  console.log(`Character: ${reply.character}`);
  console.log(`Input: ${reply.input}`);
  console.log(`Retrieved: ${JSON.stringify(reply.retrieved)}`);
  console.log(`Injected: ${reply.injected ? "yes" : "no"}`);
  console.log(`Chip would show: ${reply.chip ? "yes" : "no"}`);
  console.log(`Remembered header in prompt: ${reply.rememberedHeader ? "yes" : "no"}`);
  if (reply.error) console.log(`Error: ${reply.error}`);
  console.log("Model output:");
  console.log(reply.text || "(empty)");
}

console.log("=== EchoChat real-model continuity baseline ===");
console.log(`provider_host=${BASE_URL.replace(/https?:\/\//, "").split("/")[0]}`);
console.log(`model=${MODEL}`);
console.log(`api_key=${API_KEY ? "present" : "missing"}`);

resetAll();
if (API_KEY) {
  store.updateSettings({ apiKey: API_KEY, baseUrl: BASE_URL, model: MODEL });
}

const linxia = await createFromTemplate(LINXIA);
store.selectChat(linxia.id);

const a0 = {
  durable: isQuietDurableFact(PHOTO),
  saved: quietRememberUserText(linxia.roleId, PHOTO),
  list: getMemoryList(linxia.roleId).map((m) => m.content),
  kept: userTextIsKept(linxia.roleId, PHOTO),
};
console.log("\n=== A0 extraction / persistence ===");
console.log(JSON.stringify({ durable: a0.durable, saved: !!a0.saved, list: a0.list, kept: a0.kept }, null, 2));

await messageStore.addMessage(linxia.id, { role: "me", text: PHOTO, status: "sent" });
printInspect("A2 我周末可能想出去转转", inspectTurn(linxia, "我周末可能想出去转转"));
printInspect("A3 我还在想周末去哪儿比较好", inspectTurn(linxia, "我还在想周末去哪儿比较好"));
printInspect("B 对了，我最近学摄影还挺上头的", inspectTurn(linxia, "对了，我最近学摄影还挺上头的"));
printInspect("C1 你觉得下雨天适合看什么电影？", inspectTurn(linxia, "你觉得下雨天适合看什么电影？"));
printInspect("C2 我明天早上得早点起床。", inspectTurn(linxia, "我明天早上得早点起床。"));
printInspect("C3 你好", inspectTurn(linxia, "你好"));
printInspect("C4 最近还好吗（未拉长间隔）", inspectTurn(linxia, "最近还好吗"));
printInspect("D 我周末想出去拍点东西。", inspectTurn(linxia, "我周末想出去拍点东西。"));

const cen = await createFromTemplate(COLD);
quietRememberUserText(cen.roleId, PHOTO);
store.selectChat(cen.id);
printInspect("E 岑 / 我周末想出去拍点东西", inspectTurn(cen, "我周末想出去拍点东西。"));

store.selectChat(linxia.id);
const again = store.createChat({
  roleId: linxia.roleId,
  name: "林夏",
  persona: LINXIA.persona,
});
store.selectChat(again.id);
printInspect("F new conversation same character / 拍点东西", inspectTurn(again, "我周末想出去拍点东西。"));
printInspect("F new conversation / 电影", inspectTurn(again, "你觉得下雨天适合看什么电影？"));

recordChatTurn(linxia.roleId, "林夏", Date.now() - 3 * 86400000);
printInspect("F gap-return / 最近还好吗", inspectTurn(linxia, "最近还好吗"));

if (!API_KEY) {
  console.log("\n=== LIVE COMPLETIONS ===");
  console.log("SKIPPED: no ECHOCHAT_API_KEY / SILICONFLOW_API_KEY in this environment.");
  process.exit(0);
}

console.log("\n=== LIVE COMPLETIONS ===");
resetAll();
store.updateSettings({ apiKey: API_KEY, baseUrl: BASE_URL, model: MODEL });
const linxiaLive = await createFromTemplate(LINXIA);
const cenLive = await createFromTemplate(COLD);
quietRememberUserText(linxiaLive.roleId, PHOTO);
quietRememberUserText(cenLive.roleId, PHOTO);
const cfg = getApiConfig(linxiaLive);
console.log(`using_model=${cfg.model} host=${String(cfg.baseUrl).replace(/https?:\/\//, "").split("/")[0]}`);
console.log("api_key=present");
console.log(`saved_linxia=${getMemoryList(linxiaLive.roleId).some((m) => /摄影/.test(m.content))}`);
console.log(`saved_cen=${getMemoryList(cenLive.roleId).some((m) => /摄影/.test(m.content))}`);

const aConvo = store.createChat({ roleId: linxiaLive.roleId, name: "林夏", persona: LINXIA.persona });
store.selectChat(aConvo.id);
printLive("A2", await liveReply(aConvo, "我周末可能想出去转转。"));
printLive("A3", await liveReply(aConvo, "我还在想周末去哪儿比较好。"));

const bConvo = store.createChat({ roleId: linxiaLive.roleId, name: "林夏", persona: LINXIA.persona });
store.selectChat(bConvo.id);
printLive("B 林夏", await liveReply(bConvo, "对了，我最近学摄影还挺上头的。"));

const cConvo = store.createChat({ roleId: linxiaLive.roleId, name: "林夏", persona: LINXIA.persona });
store.selectChat(cConvo.id);
printLive("C1", await liveReply(cConvo, "你觉得下雨天适合看什么电影？"));
printLive("C2", await liveReply(cConvo, "我明天早上得早点起床。"));
printLive("C3", await liveReply(cConvo, "你好。"));
printLive("C4", await liveReply(cConvo, "最近还好吗？"));

const dConvo = store.createChat({ roleId: linxiaLive.roleId, name: "林夏", persona: LINXIA.persona });
store.selectChat(dConvo.id);
printLive("D 林夏", await liveReply(dConvo, "我周末想出去拍点东西。"));

const bCen = store.createChat({ roleId: cenLive.roleId, name: "岑", persona: COLD.persona });
store.selectChat(bCen.id);
printLive("B 岑", await liveReply(bCen, "对了，我最近学摄影还挺上头的。"));

const dCen = store.createChat({ roleId: cenLive.roleId, name: "岑", persona: COLD.persona });
store.selectChat(dCen.id);
printLive("D 岑", await liveReply(dCen, "我周末想出去拍点东西。"));

const fConvo = store.createChat({ roleId: linxiaLive.roleId, name: "林夏", persona: LINXIA.persona });
store.selectChat(fConvo.id);
printLive("F new convo", await liveReply(fConvo, "我周末想出去拍点东西。"));

recordChatTurn(linxiaLive.roleId, "林夏", Date.now() - 3 * 86400000);
recordChatTurn(cenLive.roleId, "岑", Date.now() - 3 * 86400000);
const fGapLinxia = store.createChat({ roleId: linxiaLive.roleId, name: "林夏", persona: LINXIA.persona });
store.selectChat(fGapLinxia.id);
printLive("F gap 林夏", await liveReply(fGapLinxia, "最近还好吗？"));
const fGapCen = store.createChat({ roleId: cenLive.roleId, name: "岑", persona: COLD.persona });
store.selectChat(fGapCen.id);
printLive("F gap 岑", await liveReply(fGapCen, "最近还好吗？"));
