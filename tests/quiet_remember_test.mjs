/**
 * Quiet remember — durable first-person facts persist without memory-review UI.
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
global.URL = { createObjectURL: () => "blob:mock", revokeObjectURL: () => {} };

const { store } = await import(srcHref("src/core/store.js"));
const { getMemoryList } = await import(srcHref("src/domain/memory.js"));
const { getAffinity } = await import(srcHref("src/domain/relations.js"));
const { quietRememberUserText, extractMemoryCandidates } = await import(
  srcHref("src/domain/memory-candidates.js")
);
const { buildSystemPrompt, sendMessage } = await import(srcHref("src/domain/chat.js"));
const { createFromTemplate } = await import(srcHref("src/domain/persona.js"));
const { recordChatTurn } = await import(srcHref("src/domain/relations.js"));

const ROLE_ID = "role_qr";
const FLIGHT = "我很怕坐飞机，长途飞行会慌";
const DAY_MS = 86400000;

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

console.log("\n=== Quiet remember (write path without review UI) ===");

test("durable first-person fact persists without confirm", () => {
  resetAll();
  const mem = quietRememberUserText(ROLE_ID, FLIGHT);
  assert.ok(mem);
  const list = getMemoryList(ROLE_ID);
  assert.equal(list.length, 1);
  assert.ok(list[0].content.includes("怕坐飞机"));
  assert.equal(list[0].source, "auto");
  assert.ok(list[0].importance >= 7);
  const aff = getAffinity(ROLE_ID);
  assert.equal(aff.brief, "记下了一件关于你的事");
});

test("greetings questions and vents do not persist", () => {
  resetAll();
  assert.equal(quietRememberUserText(ROLE_ID, "在吗"), null);
  assert.equal(quietRememberUserText(ROLE_ID, "量子力学作业怎么做"), null);
  assert.equal(quietRememberUserText(ROLE_ID, "哈哈哈"), null);
  assert.equal(quietRememberUserText(ROLE_ID, "好累"), null);
  assert.equal(getMemoryList(ROLE_ID).length, 0);
});

test("duplicate durable fact is not written twice", () => {
  resetAll();
  assert.ok(quietRememberUserText(ROLE_ID, FLIGHT));
  assert.equal(quietRememberUserText(ROLE_ID, FLIGHT), null);
  assert.equal(getMemoryList(ROLE_ID).length, 1);
});

test("heuristic extract still does not write until confirm", () => {
  resetAll();
  store.set((s) => ({
    ...s,
    chats: [{ id: "c1", roleId: ROLE_ID, archivedAt: null, name: "x" }],
  }));
  const extracted = extractMemoryCandidates(ROLE_ID);
  assert.equal(getMemoryList(ROLE_ID).length, 0);
  assert.ok(extracted.ok);
});

test("quiet write is enough for gap-return lived thread prompt", () => {
  resetAll();
  const pastTs = Date.now() - 3 * DAY_MS;
  recordChatTurn(ROLE_ID, "安静同伴", pastTs);
  quietRememberUserText(ROLE_ID, FLIGHT);
  const chat = {
    id: "chat_qr",
    roleId: ROLE_ID,
    name: "安静同伴",
    config: { persona: "温柔安静的陪伴者" },
  };
  const prompt = buildSystemPrompt(chat, { query: "后天要出差，我有点慌" });
  assert.ok(/怕坐飞机|飞行/.test(prompt));
  assert.ok(/This turn: continue the lived thread/.test(prompt));
});

await testAsync("sendMessage quietly remembers durable fact even without API key", async () => {
  resetAll();
  store.updateSettings({ apiKey: "", baseUrl: "https://api.example.com/v1" });
  const chat = await createFromTemplate({ name: "晚", persona: "p", firstMessage: "hi" });
  await sendMessage(FLIGHT);
  const list = getMemoryList(chat.roleId);
  assert.ok(list.some((m) => m.content.includes("怕坐飞机")), "spoken durable fact must be in memory");
});

console.log("\n=== Quiet remember results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log("All quiet remember tests passed.");
