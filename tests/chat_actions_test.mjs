/**
 * Chat operations matrix: retry, regenerate, edit, delete, copy,
 * abort, provider error, and Memory / Relationship / Moments side effects.
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

const copied = [];
try {
  globalThis.navigator.clipboard = {
    writeText: async (text) => {
      copied.push(String(text));
    },
  };
} catch {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text) => {
          copied.push(String(text));
        },
      },
    },
  });
}

const { store } = await import(srcHref("src/core/store.js"));
const { installStorageTestHooks, resetStorageTestHooks } = await import(
  srcHref("src/repository/test-hooks.js")
);
const { messageStore } = await import(srcHref("src/domain/message-store.js"));
const { createFromTemplate } = await import(srcHref("src/domain/persona.js"));
const {
  sendMessage,
  stopGeneration,
  isSending,
  retryLastMessage,
  regenerate,
  editMessage,
  deleteMessage,
  copyMessage,
} = await import(srcHref("src/domain/chat.js"));
const { getMemoryList } = await import(srcHref("src/domain/memory.js"));
const { getAffinity } = await import(srcHref("src/domain/relations.js"));
const { addMoment, listMoments } = await import(srcHref("src/domain/moments.js"));
const { setReplyPaceForCharacter } = await import(srcHref("src/domain/reply-pace.js"));
const { createConversationForCharacter } = await import(srcHref("src/domain/conversation.js"));
const { renderMarkdown } = await import(srcHref("src/core/utils.js"));
const { userFacingProviderMessage, PROVIDER_ERROR_KIND } = await import(
  srcHref("src/domain/provider-error.js")
);

let passed = 0;
let failed = 0;
const failures = [];

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

function createMemoryBackends() {
  const messages = new Map();
  const conversations = new Map();
  const characters = new Map();
  return {
    message: {
      async findByConversationId(conversationId) {
        const items = [...messages.values()]
          .filter((m) => m.conversationId === conversationId)
          .sort((a, b) => a.createdAt - b.createdAt);
        return { items, total: items.length, page: 1, pageSize: 50, hasMore: false };
      },
      async create(msg) {
        const record = {
          id: msg.id || `msg-${Date.now()}`,
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
        const cur = messages.get(id);
        if (!cur) return null;
        const next = { ...cur, ...updates, updatedAt: Date.now() };
        messages.set(id, next);
        return next;
      },
      async delete(id) {
        messages.delete(id);
      },
      async countByConversationId() {
        return messages.size;
      },
    },
    conversation: {
      async findById(id) {
        return conversations.get(id) || null;
      },
      async create(c) {
        conversations.set(c.id, c);
        return c;
      },
      async update(id, patch) {
        const cur = conversations.get(id) || { id };
        conversations.set(id, { ...cur, ...patch });
        return conversations.get(id);
      },
    },
    character: {
      async findById(id) {
        return characters.get(id) || null;
      },
      async create(c) {
        characters.set(c.id, c);
        return c;
      },
    },
    isAvailable: async () => true,
  };
}

function resetAll() {
  localStorage.clear();
  store.reset();
  resetStorageTestHooks();
  installStorageTestHooks(createMemoryBackends());
  copied.length = 0;
}

function sseBytes(text) {
  const payload = JSON.stringify({ choices: [{ delta: { content: text } }] });
  return new TextEncoder().encode(`data: ${payload}\n\ndata: [DONE]\n\n`);
}

function installFetchStream(text, { status = 200, hangUntilAbort = false } = {}) {
  global.fetch = async (_url, opts) => {
    if (status !== 200) {
      return { ok: false, status, text: async () => "upstream fail" };
    }
    if (hangUntilAbort) {
      await new Promise((_, reject) => {
        const err = new Error("aborted");
        err.name = "AbortError";
        if (opts?.signal?.aborted) {
          reject(err);
          return;
        }
        opts?.signal?.addEventListener("abort", () => reject(err));
      });
    }
    const bytes = sseBytes(text);
    let sent = false;
    return {
      ok: true,
      status: 200,
      body: {
        getReader() {
          return {
            async read() {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: bytes };
            },
          };
        },
      },
    };
  };
}

async function makeChat() {
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "hi" });
  setReplyPaceForCharacter(chat.roleId, "instant");
  return chat;
}

function lastHer(chatId) {
  const hers = messageStore.peekMessages(chatId).filter((m) => m.role === "her");
  return hers[hers.length - 1];
}

function userTurns(chatId) {
  return messageStore.peekMessages(chatId).filter((m) => m.role === "me");
}

resetAll();
store.updateSettings({
  apiKey: "sk-test-key",
  baseUrl: "https://api.example.com/v1",
  model: "test-model",
});

console.log("\n=== Chat actions matrix ===\n");

await testAsync("retry reuses the same user message id", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await makeChat();
  installFetchStream("", { status: 401 });
  await sendMessage("嗨");
  const userId = userTurns(chat.id).find((m) => m.text === "嗨").id;
  const err = lastHer(chat.id);
  assert.equal(err.status, "error");
  assert.equal(err.errorKind, "authentication");
  assert.match(String(err.errorText || ""), /API Key/);
  installFetchStream("我在");
  await retryLastMessage();
  const me = userTurns(chat.id).filter((m) => m.text === "嗨");
  assert.equal(me.length, 1);
  assert.equal(me[0].id, userId);
  assert.equal(lastHer(chat.id).text, "我在");
  assert.notEqual(lastHer(chat.id).status, "error");
});

await testAsync("retry after failure records relationship once on success", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await makeChat();
  installFetchStream("", { status: 500 });
  await sendMessage("嗨");
  assert.equal(getAffinity(chat.roleId).turns, 0);
  installFetchStream("嗯");
  await retryLastMessage();
  assert.equal(getAffinity(chat.roleId).turns, 1);
});

await testAsync("retry does not duplicate a quiet memory", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await makeChat();
  const fact = "我最近开始学习摄影";
  installFetchStream("", { status: 429 });
  await sendMessage(fact);
  assert.equal(getMemoryList(chat.roleId).filter((m) => /摄影/.test(m.content)).length, 1);
  installFetchStream("记下了");
  await retryLastMessage();
  assert.equal(getMemoryList(chat.roleId).filter((m) => /摄影/.test(m.content)).length, 1);
  assert.equal(userTurns(chat.id).filter((m) => m.text === fact).length, 1);
});

await testAsync("regenerate does not add another user turn or lived write", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await makeChat();
  const fact = "我最近开始学习摄影";
  installFetchStream("第一版");
  await sendMessage(fact);
  addMoment({ roleId: chat.roleId, roleName: "林晚", content: "一起去了咖啡馆", source: "manual" });
  const turns = getAffinity(chat.roleId).turns;
  const memCount = getMemoryList(chat.roleId).length;
  const momentCount = listMoments(chat.roleId).length;
  const herIdx = messageStore.peekMessages(chat.id).findLastIndex((m) => m.role === "her" && m.text === "第一版");
  installFetchStream("第二版");
  await regenerate(herIdx);
  assert.equal(userTurns(chat.id).filter((m) => m.text === fact).length, 1);
  assert.equal(lastHer(chat.id).text, "第二版");
  assert.ok((lastHer(chat.id).metadata?.previousReplies || []).some((p) => p.text === "第一版"));
  assert.equal(getAffinity(chat.roleId).turns, turns);
  assert.equal(getMemoryList(chat.roleId).length, memCount);
  assert.equal(listMoments(chat.roleId).length, momentCount);
});

await testAsync("edit keeps the user message id and regenerates the reply", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await makeChat();
  installFetchStream("旧回复");
  await sendMessage("原话");
  const idx = messageStore.peekMessages(chat.id).findIndex((m) => m.role === "me" && m.text === "原话");
  const userId = messageStore.peekMessages(chat.id)[idx].id;
  const turns = getAffinity(chat.roleId).turns;
  installFetchStream("新回复");
  await editMessage(idx, "改过的话");
  const me = userTurns(chat.id).filter((m) => m.role === "me" && m.text !== "hi");
  const edited = messageStore.peekMessages(chat.id).find((m) => m.id === userId);
  assert.equal(edited.text, "改过的话");
  assert.equal(me.filter((m) => m.text === "原话").length, 0);
  assert.equal(lastHer(chat.id).text, "新回复");
  assert.equal(getAffinity(chat.roleId).turns, turns);
});

await testAsync("delete removes only that conversation row", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await makeChat();
  const fact = "我最近开始学习摄影";
  installFetchStream("收到");
  await sendMessage(fact);
  addMoment({ roleId: chat.roleId, roleName: "林晚", content: "雨天散步", source: "manual" });
  const memCount = getMemoryList(chat.roleId).length;
  const momentCount = listMoments(chat.roleId).length;
  const turns = getAffinity(chat.roleId).turns;
  const herIdx = messageStore.peekMessages(chat.id).findLastIndex((m) => m.text === "收到");
  deleteMessage(herIdx);
  assert.ok(!messageStore.peekMessages(chat.id).some((m) => m.text === "收到"));
  assert.ok(userTurns(chat.id).some((m) => m.text === fact));
  assert.equal(getMemoryList(chat.roleId).length, memCount);
  assert.equal(listMoments(chat.roleId).length, momentCount);
  assert.equal(getAffinity(chat.roleId).turns, turns);
});

await testAsync("copy uses the original markdown text", async () => {
  resetAll();
  const md = "看这段：\n```js\nconst x = 1;\n```";
  await copyMessage(md);
  assert.equal(copied[copied.length - 1], md);
  const html = renderMarkdown(md);
  assert.ok(html.includes("md-copy"));
  assert.ok(html.includes("const x = 1;"));
  assert.ok(!html.includes("<script"));
});

await testAsync("provider error does not record a chat turn", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await makeChat();
  installFetchStream("", { status: 503 });
  await sendMessage("嗨");
  assert.equal(getAffinity(chat.roleId).turns, 0);
  assert.equal(lastHer(chat.id).status, "error");
  assert.equal(lastHer(chat.id).errorKind, "provider");
});

await testAsync("abort does not keep a partial assistant or record a turn", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await makeChat();
  installFetchStream("", { hangUntilAbort: true });
  const pending = sendMessage("嗨");
  await new Promise((r) => setTimeout(r, 30));
  stopGeneration();
  await pending;
  assert.equal(isSending(), false);
  assert.equal(getAffinity(chat.roleId).turns, 0);
  assert.equal(messageStore.peekMessages(chat.id).filter((m) => m.status === "streaming").length, 0);
  assert.ok(!messageStore.peekMessages(chat.id).some((m) => m.role === "her" && (m.text || "").includes("嗨")));
});

await testAsync("switching conversation during generate still writes the origin chat", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chatA = await makeChat();
  const chatB = createConversationForCharacter(chatA.roleId, { title: "另一条" });
  store.selectChat(chatA.id);
  installFetchStream("给A的话");
  const pending = sendMessage("嗨");
  await new Promise((r) => setTimeout(r, 20));
  store.selectChat(chatB.id);
  await pending;
  assert.equal(lastHer(chatA.id).text, "给A的话");
  assert.ok(!messageStore.peekMessages(chatB.id).some((m) => m.text === "给A的话"));
});

test("provider error copy never includes secrets", () => {
  const msg = userFacingProviderMessage({
    kind: PROVIDER_ERROR_KIND.authentication,
    userMessage: "API Key 无效或已过期，请重新填写。",
  });
  assert.ok(!/sk-/.test(msg));
  assert.match(msg, /API Key/);
});

console.log(`\nChat Actions: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
