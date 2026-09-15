/**
 * Chunked bulk import: progress, cancel, rollback. No half-imported rows.
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
global.performance = { now: () => Date.now() };
global.URL = { createObjectURL: () => "blob:mock", revokeObjectURL: () => {} };

const { store } = await import(srcHref("src/core/store.js"));
const { installStorageTestHooks, resetStorageTestHooks } = await import(
  srcHref("src/repository/storage-hooks.js")
);
const { messageStore, bulkImportMessages, importProgress, resetRuntime, UI_WINDOW } = await import(
  srcHref("src/domain/message-store.js")
);
const { exportProductBackup, importProductBackup } = await import(srcHref("src/domain/backup.js"));

function createBackend(options = {}) {
  const messages = new Map();
  const conversations = new Map();
  let bulkCalls = 0;
  const failOnBulk = options.failOnBulk || 0;
  const message = {
    async findById(id) {
      return messages.get(id) || null;
    },
    async findByConversationId(conversationId, opts = {}) {
      let items = [...messages.values()].filter((m) => m.conversationId === conversationId);
      items.sort((a, b) => a.createdAt - b.createdAt);
      const pageSize = opts.pageSize || items.length || 50;
      return { items, total: items.length, page: 1, pageSize, hasMore: false };
    },
    async findTail(conversationId, opts = {}) {
      const limit = opts.limit || 80;
      const items = [...messages.values()]
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => a.createdAt - b.createdAt);
      return items.slice(-limit);
    },
    async create(msg) {
      const record = {
        id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    async update() {
      return null;
    },
    async delete(id) {
      messages.delete(id);
    },
    async countByConversationId(conversationId) {
      return [...messages.values()].filter((m) => m.conversationId === conversationId).length;
    },
    async search() {
      return [];
    },
    async findLatest() {
      return null;
    },
    async findBranches() {
      return [];
    },
    async bulkCreate(arr) {
      bulkCalls += 1;
      if (failOnBulk && bulkCalls === failOnBulk) throw new Error("bulk-fail");
      const out = [];
      for (const m of arr) out.push(await this.create(m));
      return out;
    },
    async bulkCreateChunked(arr, opts = {}) {
      const size = Math.max(1, Number(opts.chunkSize) || 80);
      const total = arr.length;
      for (let i = 0; i < arr.length; i += size) {
        if (opts.signal?.aborted) {
          const err = new Error("aborted");
          err.name = "AbortError";
          throw err;
        }
        await this.bulkCreate(arr.slice(i, i + size));
        opts.onProgress?.({
          done: Math.min(i + size, total),
          total,
          percent: Math.round((Math.min(i + size, total) / total) * 100),
        });
      }
      return arr;
    },
    async deleteByConversationId(conversationId) {
      for (const [id, m] of messages) {
        if (m.conversationId === conversationId) messages.delete(id);
      }
    },
    _count: () => messages.size,
    _bulkCalls: () => bulkCalls,
  };
  const conversation = {
    async findById(id) {
      return conversations.get(id) || null;
    },
    async create(conv) {
      const record = { id: conv.id, ...conv };
      conversations.set(record.id, record);
      return record;
    },
    async update(id, updates) {
      const existing = conversations.get(id);
      if (!existing) return null;
      const record = { ...existing, ...updates };
      conversations.set(id, record);
      return record;
    },
  };
  return {
    isAvailable: async () => true,
    message,
    conversation,
  };
}

function reset(backend) {
  localStorageMock.clear();
  store.reset();
  resetRuntime();
  resetStorageTestHooks();
  installStorageTestHooks(backend || createBackend());
}

function turns(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t-${i}`,
    role: i % 2 ? "her" : "me",
    text: `消息 ${i}`,
    time: 1e12 + i,
    status: "sent",
  }));
}

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

console.log("\n=== Message import ===\n");

await testAsync("progress reports done / total / percent", async () => {
  reset();
  const chat = store.createChat({ name: "林晚", persona: "p", firstMessage: "" });
  const ticks = [];
  const result = await bulkImportMessages(chat.id, turns(250), {
    chunkSize: 80,
    onProgress: (p) => ticks.push({ ...p }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.imported, 250);
  assert.ok(ticks.length >= 2);
  const last = ticks[ticks.length - 1];
  assert.equal(last.done, 250);
  assert.equal(last.total, 250);
  assert.equal(last.percent, 100);
  assert.ok(ticks.some((t) => t.done > 0 && t.done < 250 && t.percent > 0 && t.percent < 100));
  const p = importProgress({ done: 50, total: 200 });
  assert.equal(p.percent, 25);
});

await testAsync("Dexie holds all rows while UI window stays at tail", async () => {
  const backend = createBackend();
  reset(backend);
  const chat = store.createChat({ name: "林晚", persona: "p", firstMessage: "" });
  await bulkImportMessages(chat.id, turns(200), { chunkSize: 50 });
  assert.equal(await backend.message.countByConversationId(chat.id), 200);
  assert.ok(messageStore.peekMessages(chat.id).length <= UI_WINDOW);
  assert.equal(messageStore.peekHasOlder(chat.id), true);
  assert.ok(backend.message._bulkCalls() >= 2);
});

await testAsync("cancel rolls back so no half-imported conversation remains", async () => {
  const backend = createBackend();
  reset(backend);
  const chat = store.createChat({ name: "林晚", persona: "p", firstMessage: "" });
  const ac = new AbortController();
  const result = await bulkImportMessages(chat.id, turns(120), {
    chunkSize: 40,
    signal: ac.signal,
    onProgress: (p) => {
      if (p.done >= 40) ac.abort();
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.aborted, true);
  assert.equal(await backend.message.countByConversationId(chat.id), 0);
  assert.equal(messageStore.peekMessages(chat.id).length, 0);
});

await testAsync("error recovery deletes partial Dexie rows", async () => {
  const backend = createBackend({ failOnBulk: 2 });
  reset(backend);
  const chat = store.createChat({ name: "林晚", persona: "p", firstMessage: "" });
  const result = await bulkImportMessages(chat.id, turns(90), { chunkSize: 30 });
  assert.equal(result.ok, false);
  assert.equal(await backend.message.countByConversationId(chat.id), 0);
});

await testAsync("backup restore round-trips 200 messages plus satellites", async () => {
  const backend = createBackend();
  reset(backend);
  const chat = store.createChat({ name: "林晚", persona: "p", firstMessage: "" });
  await bulkImportMessages(chat.id, turns(200), { chunkSize: 50 });
  const blob = await exportProductBackup();
  const exported = blob.state.chats.find((c) => c.id === chat.id);
  assert.ok((exported.messages || []).length >= 200);
  store.reset();
  resetRuntime();
  const backend2 = createBackend();
  installStorageTestHooks(backend2);
  await importProductBackup(blob, "replace");
  assert.equal(await backend2.message.countByConversationId(chat.id), 200);
});

console.log(`\nMessage import: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
