/**
 * Lived moments come from conversation events, not Memory.
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
const { getMemoryList, resetMemoriesRuntime } = await import(srcHref("src/domain/memory.js"));
const { listMoments, captureLivedMoment, resetMomentsRuntime, momentSourceLabel } = await import(
  srcHref("src/domain/moments.js")
);
const { getAffinity, resetRelationsRuntime } = await import(srcHref("src/domain/relations.js"));
const { quietRememberUserText } = await import(srcHref("src/domain/memory-candidates.js"));
const { sendMessage } = await import(srcHref("src/domain/chat.js"));
const { createFromTemplate } = await import(srcHref("src/domain/persona.js"));

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
  resetMomentsRuntime();
  resetRelationsRuntime();
  resetMemoriesRuntime();
}

console.log("\n=== Lived moments ===\n");

test("guitar first-lesson is a moment, not a memory", () => {
  resetAll();
  const roleId = "role_lived";
  assert.equal(quietRememberUserText(roleId, "今天第一次去学吉他"), null);
  const moment = captureLivedMoment(roleId, "今天第一次去学吉他", { roleName: "林晚" });
  assert.ok(moment);
  assert.equal(moment.source, "lived");
  assert.equal(getMemoryList(roleId).length, 0);
  assert.equal(listMoments(roleId).length, 1);
  assert.equal(momentSourceLabel("lived"), "一起");
  const aff = getAffinity(roleId);
  assert.ok((aff.events || []).some((e) => e.type === "lived" && /吉他/.test(e.text)));
});

test("greetings do not become lived moments", () => {
  resetAll();
  assert.equal(captureLivedMoment("role_lived", "你好啊"), null);
  assert.equal(captureLivedMoment("role_lived", "今天天气真好"), null);
  assert.equal(listMoments("role_lived").length, 0);
});

test("duplicate lived moment is not written twice", () => {
  resetAll();
  const a = captureLivedMoment("role_lived", "今天第一次去看展览");
  const b = captureLivedMoment("role_lived", "今天第一次去看展览");
  assert.ok(a);
  assert.equal(listMoments("role_lived").length, 1);
  assert.equal(b?.id, a.id);
});

await testAsync("sendMessage records a lived moment from the user turn", async () => {
  resetAll();
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "" });
  await sendMessage("今天第一次去学吉他");
  const roleId = chat.roleId;
  assert.equal(getMemoryList(roleId).length, 0);
  assert.ok(listMoments(roleId).some((m) => /吉他/.test(m.content)));
});

console.log(`\nLived moments: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
