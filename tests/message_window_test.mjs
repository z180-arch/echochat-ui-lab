/**
 * Opening a long chat hydrates only the newest window.
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
const { installStorageTestHooks, resetStorageTestHooks } = await import(srcHref("src/repository/test-hooks.js"));
const {
  hydrateChat,
  peekMessages,
  peekHasOlder,
  loadOlderMessages,
  getMessages,
  addMessage,
  UI_WINDOW,
  resetRuntime,
} = await import(srcHref("src/domain/message-store.js"));

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

console.log("\n=== Message window hydrate ===\n");

await testAsync("hydrateChat keeps only the newest UI_WINDOW from a 250-message store", async () => {
  localStorage.clear();
  store.reset();
  resetRuntime();
  const chat = store.createChat({ roleId: "r-win", name: "窗", persona: "p" });
  const quiet = () => {};
  store.subscribe(quiet);
  for (let i = 0; i < 250; i++) {
    store.addMessage(chat.id, {
      id: "m" + i,
      role: i % 2 ? "her" : "me",
      text: "t" + i,
      status: "sent",
      time: 1000 + i,
    });
  }
  const peeked = await hydrateChat(chat.id);
  assert.equal(peeked.length, UI_WINDOW);
  assert.equal(peeked[0].id, "m" + (250 - UI_WINDOW));
  assert.equal(peeked[peeked.length - 1].id, "m249");
  assert.equal(peekHasOlder(chat.id), true);
  const added = await loadOlderMessages(chat.id);
  assert.ok(added > 0);
  assert.equal(peekMessages(chat.id)[0].id, "m" + (250 - UI_WINDOW - added));
});

test("UI_WINDOW stays at 80", () => {
  assert.equal(UI_WINDOW, 80);
});

function createMessageBackend() {
  const messages = new Map();
  return {
    isAvailable: async () => true,
    message: {
      async create(msg) {
        const record = {
          id: msg.id,
          conversationId: msg.conversationId,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt || Date.now(),
          status: msg.status || "sent",
          metadata: msg.metadata || {},
        };
        messages.set(record.id, record);
        return record;
      },
      async countByConversationId(conversationId) {
        return [...messages.values()].filter((m) => m.conversationId === conversationId).length;
      },
      async findByConversationId(conversationId, options = {}) {
        const { page = 1, pageSize = 50 } = options;
        const items = [...messages.values()]
          .filter((m) => m.conversationId === conversationId)
          .sort((a, b) => a.createdAt - b.createdAt);
        const total = items.length;
        const newestFirst = items.slice().reverse();
        const start = (page - 1) * pageSize;
        const pageItems = newestFirst.slice(start, start + pageSize).reverse();
        return { items: pageItems, total, page, pageSize, hasMore: start + pageSize < total };
      },
      async findLatest(conversationId) {
        const items = [...messages.values()]
          .filter((m) => m.conversationId === conversationId)
          .sort((a, b) => b.createdAt - a.createdAt);
        return items[0] || null;
      },
      _dump: () => [...messages.values()],
    },
    conversation: {
      async findById() {
        return null;
      },
      async update() {},
    },
  };
}

await testAsync("hydrate UI window must not destroy store fallback if Dexie later fails", async () => {
  localStorage.clear();
  store.reset();
  resetRuntime();
  const backend = createMessageBackend();
  installStorageTestHooks(backend);
  const chat = store.createChat({ roleId: "r-p07", name: "长聊" });
  const n = UI_WINDOW + 40;
  for (let i = 0; i < n; i++) {
    await addMessage(chat.id, { id: "p07-" + i, role: "me", text: "t" + i, status: "sent", time: 1000 + i });
  }
  assert.equal(backend.message._dump().length, n);
  assert.equal(store.getState().chats.find((c) => c.id === chat.id).messages.length, n);

  const peeked = await hydrateChat(chat.id);
  assert.equal(peeked.length, UI_WINDOW);
  assert.equal(store.getState().chats.find((c) => c.id === chat.id).messages.length, n, "store fallback must keep full dual-write history");
  assert.equal(backend.message._dump().length, n);

  installStorageTestHooks({ ...backend, isAvailable: async () => false });
  resetRuntime();
  const recovered = await getMessages(chat.id);
  assert.equal(recovered.length, n, "Dexie-down reload must recover from store, not the 80-message window");
  assert.equal(recovered[0].text, "t0");
  resetStorageTestHooks();
  resetRuntime();
});

console.log(`\nMessage window: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
