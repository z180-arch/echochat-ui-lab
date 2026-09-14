/**
 * Continuity perception: quiet remember of lived facts, related recall,
 * and chat-side "kept" matching — no new Memory admin UI.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
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
const { getMemoryList, retrieveMemoriesForTurn, getLastMemoryRetrieve } = await import(
  srcHref("src/domain/memory.js")
);
const { quietRememberUserText, userTextIsKept, isQuietDurableFact } = await import(
  srcHref("src/domain/memory-candidates.js")
);
const { assembleTurnContext } = await import(srcHref("src/domain/turn-context.js"));
const { sendMessage } = await import(srcHref("src/domain/chat.js"));
const { createFromTemplate } = await import(srcHref("src/domain/persona.js"));

const ROLE_ID = "role_photo";
const PHOTO = "我最近开始学习摄影";
const RECALL = "我周末想出去拍点东西";

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

function resetAll() {
  localStorage.clear();
  store.reset();
}

console.log("\n=== Continuity Perception ===");

test("learning a craft is a quiet durable fact", () => {
  assert.equal(isQuietDurableFact(PHOTO), true);
  assert.equal(isQuietDurableFact("我在学摄影"), true);
  assert.equal(isQuietDurableFact("我想学摄影"), false);
  assert.equal(isQuietDurableFact(RECALL), false);
});

test("photography fact persists without review UI", () => {
  resetAll();
  const mem = quietRememberUserText(ROLE_ID, PHOTO);
  assert.ok(mem);
  assert.ok(getMemoryList(ROLE_ID).some((m) => m.content.includes("摄影")));
  assert.equal(userTextIsKept(ROLE_ID, PHOTO), true);
  assert.equal(userTextIsKept(ROLE_ID, "你好"), false);
});

test("related shooting talk retrieves the photography memory on the same day", () => {
  resetAll();
  quietRememberUserText(ROLE_ID, PHOTO);
  const items = retrieveMemoriesForTurn(ROLE_ID, RECALL);
  assert.ok(items.some((m) => String(m.content).includes("摄影")), "recall must inject photography");
  const last = getLastMemoryRetrieve();
  assert.equal(last.hadHit, true);
  assert.ok(/摄影/.test(last.preview));
});

test("assembleTurnContext includes photography on related query", () => {
  resetAll();
  quietRememberUserText(ROLE_ID, PHOTO);
  const chat = {
    id: "chat_photo",
    roleId: ROLE_ID,
    name: "晚",
    config: { persona: "安静的陪伴者" },
  };
  const assembled = assembleTurnContext(chat, { query: RECALL });
  assert.ok(assembled.prompt.includes("摄影"));
  assert.ok(!assembled.prompt.includes("This turn: continue the lived thread"));
});

test("unrelated greetings do not retrieve photography", () => {
  resetAll();
  quietRememberUserText(ROLE_ID, PHOTO);
  const items = retrieveMemoriesForTurn(ROLE_ID, "在吗");
  assert.equal(items.some((m) => String(m.content).includes("摄影")), false);
});

await testAsync("sendMessage quietly keeps photography and later context can recall it", async () => {
  resetAll();
  store.updateSettings({ apiKey: "", baseUrl: "https://api.example.com/v1" });
  const chat = await createFromTemplate({ name: "晚", persona: "安静的陪伴者", firstMessage: "hi" });
  await sendMessage(PHOTO);
  assert.equal(userTextIsKept(chat.roleId, PHOTO), true);
  const later = assembleTurnContext(chat, { query: RECALL });
  assert.ok(later.prompt.includes("摄影"));
});

test("chat surfaces kept mark and recall chip without a memory admin table", () => {
  const views = readFileSync(join(__dirname, "../src/ui/views/index.js"), "utf8");
  const css = readFileSync(join(__dirname, "../src/styles/components.css"), "utf8");
  assert.ok(views.includes("msg-kept"));
  assert.ok(views.includes("记下了"));
  assert.ok(views.includes("userTextIsKept"));
  assert.ok(views.includes("recall-chip"));
  assert.ok(css.includes(".msg-kept"));
  assert.ok(!views.includes("记忆 1"));
  assert.ok(!/MemoryRow/.test(views.split("function renderMessage")[1]?.slice(0, 1200) || ""));
});

console.log("\n=== Continuity Perception Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log("All continuity perception tests passed.");
