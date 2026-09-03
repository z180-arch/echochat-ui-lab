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
const {
  getReplyPace,
  setReplyPaceForCharacter,
  presentationDelayMs,
  DEFAULT_REPLY_PACE,
} = await import(srcHref("src/domain/reply-pace.js"));
const { createConversationForCharacter } = await import(srcHref("src/domain/conversation.js"));

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

async function makeChat() {
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "hi" });
  setReplyPaceForCharacter(chat.roleId, "instant");
  return chat;
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
  const chat = await makeChat();
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
  const chat = await makeChat();
  installFetchStream("收到");
  await sendMessage("我（笑眯眯）只是打个招呼");
  const me = messageStore.peekMessages(chat.id).find((m) => m.role === "me");
  assert.equal(me.text, "我（笑眯眯）只是打个招呼");
});

await testAsync("empty reply: sending false, streaming placeholder removed", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await makeChat();
  installFetchStream("（笑眯眯）");
  await sendMessage("嗨");
  assert.equal(isSending(), false);
  assert.equal(leftoverStreaming(chat.id).length, 0);
});

await testAsync("error: sending false, no streaming leftover", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await makeChat();
  installFetchStream("", { status: 500 });
  await sendMessage("嗨");
  assert.equal(isSending(), false);
  assert.equal(leftoverStreaming(chat.id).length, 0);
});

await testAsync("cancel: sending false, no streaming leftover", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await makeChat();
  installFetchStream("", { hangUntilAbort: true });
  const pending = sendMessage("嗨");
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(isSending(), true);
  stopGeneration();
  await pending;
  assert.equal(isSending(), false);
  assert.equal(leftoverStreaming(chat.id).length, 0);
});

await testAsync("does not persist partial assistant text while generating", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await makeChat();
  let step = 0;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            step += 1;
            if (step === 1) {
              const payload = JSON.stringify({ choices: [{ delta: { content: "第一" } }] });
              return { done: false, value: new TextEncoder().encode(`data: ${payload}\n\n`) };
            }
            if (step === 2) {
              await new Promise((r) => setTimeout(r, 80));
              return { done: false, value: sseBytes("段") };
            }
            return { done: true, value: undefined };
          },
        };
      },
    },
  });
  const pending = sendMessage("嗨");
  for (let i = 0; i < 40 && !isSending(); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.equal(isSending(), true);
  await new Promise((r) => setTimeout(r, 20));
  const mid = messageStore.peekMessages(chat.id).filter((m) => m.role === "her");
  assert.ok(!mid.some((m) => (m.text || "").includes("第一")));
  await pending;
  assert.equal(isSending(), false);
  const last = messageStore.peekMessages(chat.id).filter((m) => m.role === "her").pop();
  assert.equal(last.text, "第一段");
  assert.notEqual(last.status, "streaming");
});

await testAsync("over-length: does not persist or truncate", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await makeChat();
  const before = messageStore.peekMessages(chat.id).length;
  const long = "啊".repeat(MAX_USER_MESSAGE_CHARS + 1);
  installFetchStream("不该出现");
  await sendMessage(long);
  const after = messageStore.peekMessages(chat.id);
  assert.equal(after.length, before);
  assert.ok(!after.some((m) => m.role === "me" && m.text.length === MAX_USER_MESSAGE_CHARS));
  assert.ok(!after.some((m) => m.text === "不该出现"));
});

await testAsync("missing replyPace defaults to natural", async () => {
  resetAll();
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "hi" });
  assert.equal(getReplyPace(chat), DEFAULT_REPLY_PACE);
  assert.equal(getReplyPace({ config: {} }), "natural");
  assert.equal(getReplyPace({ config: { replyPace: "nope" } }), "natural");
});

await testAsync("presentation delay is 0 for instant and capped for long replies", async () => {
  const stable = () => 0.5;
  assert.equal(presentationDelayMs("instant", "很长的回复内容".repeat(20), stable), 0);
  const shortNatural = presentationDelayMs("natural", "嗯", stable);
  const longNatural = presentationDelayMs("natural", "啊".repeat(400), stable);
  assert.ok(shortNatural >= 160 && shortNatural < 500, `short natural ${shortNatural}`);
  assert.ok(longNatural <= 1100, `long natural ${longNatural}`);
  assert.ok(longNatural > shortNatural);
  const longSlow = presentationDelayMs("slow", "啊".repeat(800), stable);
  assert.ok(longSlow <= 2600, `long slow ${longSlow}`);
  assert.ok(longSlow > longNatural);
});

await testAsync("natural waits until after generation before persisting assistant text", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "hi" });
  setReplyPaceForCharacter(chat.roleId, "natural");
  installFetchStream("完整一句");
  const pending = sendMessage("嗨");
  await new Promise((r) => setTimeout(r, 30));
  const mid = messageStore.peekMessages(chat.id).filter((m) => m.role === "her");
  assert.ok(!mid.some((m) => (m.text || "").includes("完整一句")));
  await pending;
  const last = messageStore.peekMessages(chat.id).filter((m) => m.role === "her").pop();
  assert.equal(last.text, "完整一句");
  assert.notEqual(last.status, "streaming");
});

await testAsync("switching chat during presentation delay still persists on the origin chat", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chatA = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "hi" });
  setReplyPaceForCharacter(chatA.roleId, "slow");
  const chatB = await createFromTemplate({ name: "小夏", persona: "q", firstMessage: "hey" });
  store.selectChat(chatA.id);
  installFetchStream("给林晚的话");
  const pending = sendMessage("嗨");
  await new Promise((r) => setTimeout(r, 40));
  store.selectChat(chatB.id);
  await pending;
  const lastA = messageStore.peekMessages(chatA.id).filter((m) => m.role === "her").pop();
  assert.equal(lastA.text, "给林晚的话");
  const bTexts = messageStore.peekMessages(chatB.id).map((m) => m.text);
  assert.ok(!bTexts.includes("给林晚的话"));
});

await testAsync("stop during presentation delay still inserts the complete reply", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-test-key", baseUrl: "https://api.example.com/v1" });
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "hi" });
  setReplyPaceForCharacter(chat.roleId, "slow");
  installFetchStream("已经生成完");
  const pending = sendMessage("嗨");
  await new Promise((r) => setTimeout(r, 40));
  stopGeneration();
  await pending;
  const last = messageStore.peekMessages(chat.id).filter((m) => m.role === "her").pop();
  assert.equal(last.text, "已经生成完");
  assert.notEqual(last.status, "streaming");
});

await testAsync("new conversation inherits character replyPace", async () => {
  resetAll();
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "hi" });
  setReplyPaceForCharacter(chat.roleId, "slow");
  const next = createConversationForCharacter(chat.roleId, { title: "另一条" });
  assert.equal(getReplyPace(next), "slow");
});

console.log(`\nChat Send: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
