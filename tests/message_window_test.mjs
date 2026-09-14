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
const {
  hydrateChat,
  peekMessages,
  peekHasOlder,
  loadOlderMessages,
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

console.log(`\nMessage window: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
