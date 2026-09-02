/**
 * Chat send: typing flag must clear, assistant text is cleaned, user length is enforced.
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

const { store } = await import(srcHref("src/core/store.js"));
const { installStorageTestHooks, resetStorageTestHooks } = await import(
  srcHref("src/repository/test-hooks.js")
);
const { messageStore } = await import(srcHref("src/domain/message-store.js"));
const { createFromTemplate } = await import(srcHref("src/domain/persona.js"));
const { sendMessage, stopGeneration, isSending } = await import(srcHref("src/domain/chat.js"));
const { MAX_USER_MESSAGE_CHARS } = await import(srcHref("src/domain/reply-clean.js"));

let passed = 0;
let failed = 0;
const failures = [];

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

function leftoverStreaming(chatId) {
  return messageStore.peekMessages(chatId).filter((m) => m.status === "streaming");
}

resetAll();
store.updateSettings({
  apiKey: "sk-test-key",
  baseUrl: "https://api.example.com/v1",
  model: "test-model",
});

console.log("\n=== Chat send / typing / clean ===\n");

await testAsync("normal complete: sending false, no streaming leftover, stage tags stripped", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "hi" });
  installFetchStream("你好呀（笑眯眯）[Cute(Convincing)/撒娇]");
  await sendMessage("在吗");
  assert.equal(isSending(), false);
  assert.equal(leftoverStreaming(chat.id).length, 0);
  const her = messageStore.peekMessages(chat.id).filter((m) => m.role === "her");
  const last = her[her.length - 1];
  assert.equal(last.text, "你好呀");
  assert.notEqual(last.status, "streaming");
});

await testAsync("does not rewrite the user message", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "hi" });
  installFetchStream("收到");
  await sendMessage("我（笑眯眯）只是打个招呼");
  const me = messageStore.peekMessages(chat.id).find((m) => m.role === "me");
  assert.equal(me.text, "我（笑眯眯）只是打个招呼");
});

await testAsync("empty reply: sending false, streaming placeholder removed", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "hi" });
  installFetchStream("（笑眯眯）");
  await sendMessage("嗨");
  assert.equal(isSending(), false);
  assert.equal(leftoverStreaming(chat.id).length, 0);
});

await testAsync("error: sending false, no streaming leftover", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "hi" });
  installFetchStream("", { status: 500 });
  await sendMessage("嗨");
  assert.equal(isSending(), false);
  assert.equal(leftoverStreaming(chat.id).length, 0);
});

await testAsync("cancel: sending false, no streaming leftover", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "hi" });
  installFetchStream("", { hangUntilAbort: true });
  const pending = sendMessage("嗨");
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(isSending(), true);
  stopGeneration();
  await pending;
  assert.equal(isSending(), false);
  assert.equal(leftoverStreaming(chat.id).length, 0);
});

await testAsync("over-length: does not persist or truncate", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "hi" });
  const before = messageStore.peekMessages(chat.id).length;
  const long = "啊".repeat(MAX_USER_MESSAGE_CHARS + 1);
  installFetchStream("不该出现");
  await sendMessage(long);
  const after = messageStore.peekMessages(chat.id);
  assert.equal(after.length, before);
  assert.ok(!after.some((m) => m.role === "me" && m.text.length === MAX_USER_MESSAGE_CHARS));
  assert.ok(!after.some((m) => m.text === "不该出现"));
});

console.log(`\nChat Send: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
