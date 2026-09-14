/**
 * Live continuity matrix: 摄影 / 考试 / 吉他
 * × Relevant / Weak / Unrelated / Explicit recall / Ownership.
 *
 * Retrieval is frozen. This script inspects current retrieve + optional live completions.
 * Credentials: env or gitignored `.echochat.local.json` via loadLocalSecrets. Never logs the key.
 *
 * Usage: node scripts/live_continuity_matrix.mjs
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
if (typeof globalThis.performance?.now !== "function") {
  globalThis.performance = { now: () => Date.now() };
}
global.window.performance = globalThis.performance;
if (typeof global.URL.createObjectURL !== "function") {
  global.URL.createObjectURL = () => "blob:mock";
  global.URL.revokeObjectURL = () => {};
}

const { store } = await import(srcHref("src/core/store.js"));
const { getMemoryList, getLastMemoryRetrieve } = await import(srcHref("src/domain/memory.js"));
const { quietRememberUserText, isQuietDurableFact } = await import(srcHref("src/domain/memory-candidates.js"));
const { assembleTurnContext } = await import(srcHref("src/domain/turn-context.js"));
const { createFromTemplate } = await import(srcHref("src/domain/persona.js"));
const { messageStore } = await import(srcHref("src/domain/message-store.js"));
const { buildMessages, chatCompletion, getApiConfig } = await import(srcHref("src/domain/provider.js"));
const secrets = loadLocalSecrets();
const API_KEY = String(process.env.ECHOCHAT_API_KEY || process.env.SILICONFLOW_API_KEY || secrets.apiKey || "").trim();
const BASE_URL = String(process.env.ECHOCHAT_BASE_URL || secrets.baseUrl || "https://api.siliconflow.cn/v1").trim();
const MODEL = String(process.env.ECHOCHAT_MODEL || secrets.model || "Qwen/Qwen2.5-7B-Instruct").trim();

const LINXIA = {
  name: "林夏",
  persona:
    "你是林夏，温和、自然、有一点调侃感。说话像长期聊天的朋友，短句口语化。不会把系统信息当成数据库记录朗读，不要说「根据我的记忆」。知道的事就当作你本来知道，轻轻用。用户的爱好和考试是用户的，不是你的。",
  firstMessage: "我在。今天想聊点什么？",
};

const FACTS = [
  {
    id: "摄影",
    text: "我最近开始学习摄影",
    cells: {
      Relevant: "我周末想出去拍点东西。",
      Weak: "构图还是不太会。",
      Unrelated: "你觉得下雨天适合看什么电影？",
      "Explicit recall": "你还记得我在学摄影吗？",
      Ownership: "是你在学摄影吧？",
    },
  },
  {
    id: "考试",
    text: "下周有一场很重要的考试",
    cells: {
      Relevant: "这次考试我还没复习完。",
      Weak: "下周有点紧张。",
      Unrelated: "你觉得下雨天适合看什么电影？",
      "Explicit recall": "你还记得我下周要考试吗？",
      Ownership: "考试的人是你吧？",
    },
  },
  {
    id: "吉他",
    text: "我最近开始学吉他",
    cells: {
      Relevant: "我吉他练得怎么样了？",
      Weak: "想弹点什么给自己听。",
      Unrelated: "你觉得下雨天适合看什么电影？",
      "Explicit recall": "你还记得我在学吉他吗？",
      Ownership: "吉他是你在学，不是我。",
    },
  },
];

function resetAll() {
  localStorage.clear();
  store.reset();
}

function inspectTurn(chat, query) {
  const assembled = assembleTurnContext(chat, { query });
  const last = getLastMemoryRetrieve();
  const injected = Array.isArray(assembled.context?.memory) ? assembled.context.memory.map((m) => m.content) : [];
  return {
    query,
    retrieved: injected,
    hadHit: !!last.hadHit,
    preview: last.preview || "",
    promptHasRememberedHeader: /Known about the user|remembered from past conversations/.test(assembled.prompt),
  };
}

async function liveReply(chat, userText) {
  if (!API_KEY) return { skipped: true, text: "", error: "" };
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
  if (text) await messageStore.addMessage(chat.id, { role: "her", text, status: "sent" });
  return { skipped: false, text, error };
}

console.log("=== EchoChat live continuity matrix ===");
console.log(`provider_host=${BASE_URL.replace(/https?:\/\//, "").split("/")[0]}`);
console.log(`model=${MODEL}`);
console.log(`api_key=${API_KEY ? "present" : "missing"}`);

resetAll();
if (API_KEY) store.updateSettings({ apiKey: API_KEY, baseUrl: BASE_URL, model: MODEL });

const rows = [];
for (const fact of FACTS) {
  resetAll();
  if (API_KEY) store.updateSettings({ apiKey: API_KEY, baseUrl: BASE_URL, model: MODEL });
  const chat = await createFromTemplate(LINXIA);
  store.selectChat(chat.id);
  const durable = isQuietDurableFact(fact.text);
  const saved = quietRememberUserText(chat.roleId, fact.text);
  const list = getMemoryList(chat.roleId).map((m) => m.content);
  console.log(`\n=== FACT ${fact.id} ===`);
  console.log(JSON.stringify({ durable, saved: !!saved, list }, null, 2));
  for (const [cell, query] of Object.entries(fact.cells)) {
    const inspect = inspectTurn(chat, query);
    const row = {
      fact: fact.id,
      cell,
      query,
      durable,
      hadHit: inspect.hadHit,
      retrieved: inspect.retrieved,
      rememberedHeader: inspect.promptHasRememberedHeader,
    };
    rows.push(row);
    console.log(`\n--- ${fact.id} / ${cell} ---`);
    console.log(JSON.stringify(inspect, null, 2));
  }
}

const inspectFail = [];
function expectHit(fact, cell, want) {
  const row = rows.find((r) => r.fact === fact && r.cell === cell);
  if (!row) inspectFail.push(`${fact}/${cell} missing`);
  else if (!!row.hadHit !== want) inspectFail.push(`${fact}/${cell} hadHit=${row.hadHit} expected ${want}`);
}

expectHit("摄影", "Relevant", true);
expectHit("摄影", "Unrelated", false);
expectHit("摄影", "Explicit recall", true);
expectHit("考试", "Relevant", true);
expectHit("考试", "Unrelated", false);
expectHit("考试", "Explicit recall", true);
expectHit("吉他", "Relevant", true);
expectHit("吉他", "Unrelated", false);
expectHit("吉他", "Explicit recall", true);

console.log("\n=== SYSTEM INSPECT CONTRACT ===");
if (inspectFail.length) {
  inspectFail.forEach((m) => console.log(`FAIL ${m}`));
} else {
  console.log("PASS frozen retrieval cells (Relevant / Unrelated / Explicit recall)");
}
console.log("NOTE Weak/Ownership hits are observational. RELATED_TOKEN_GROUPS is photography-only. Do not expand retrieval.");

if (!API_KEY) {
  console.log("\n=== LIVE COMPLETIONS ===");
  console.log("SKIPPED: no key in env or .echochat.local.json");
  if (inspectFail.length) process.exit(1);
  process.exit(0);
}

console.log("\n=== LIVE COMPLETIONS ===");
const cfg = getApiConfig(store.getState().chats[0] || { config: {} });
console.log(`using_model=${cfg.model || MODEL} host=${String(cfg.baseUrl || BASE_URL).replace(/https?:\/\//, "").split("/")[0]}`);
console.log("api_key=present");

for (const fact of FACTS) {
  resetAll();
  store.updateSettings({ apiKey: API_KEY, baseUrl: BASE_URL, model: MODEL });
  const base = await createFromTemplate(LINXIA);
  quietRememberUserText(base.roleId, fact.text);
  for (const [cell, query] of Object.entries(fact.cells)) {
    const convo = store.createChat({ roleId: base.roleId, name: "林夏", persona: LINXIA.persona });
    store.selectChat(convo.id);
    const reply = await liveReply(convo, query);
    console.log(`\n===== ${fact.id} / ${cell} =====`);
    console.log(`Input: ${query}`);
    if (reply.error) console.log(`Error: ${reply.error}`);
    console.log("Model output:");
    console.log(reply.text || "(empty)");
  }
}

if (inspectFail.length) process.exit(1);
