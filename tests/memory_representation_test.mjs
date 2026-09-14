/**
 * Memory prompt representation: user-owned facts, not character biography.
 * Does not change storage or retrieval.
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
if (typeof globalThis.performance?.now !== "function") {
  globalThis.performance = { now: () => Date.now() };
}
if (typeof global.URL.createObjectURL !== "function") {
  global.URL.createObjectURL = () => "blob:mock";
  global.URL.revokeObjectURL = () => {};
}

const { store } = await import(srcHref("src/core/store.js"));
const { addMemory, getMemoryList } = await import(srcHref("src/domain/memory.js"));
const { buildBehaviorContext, presentUserMemoryFact } = await import(
  srcHref("src/domain/behavior.js")
);
const { assembleTurnContext } = await import(srcHref("src/domain/turn-context.js"));

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

function resetAll() {
  localStorage.clear();
  store.reset();
}

console.log("\n=== Memory Representation ===");

test("first-person stored text is presented as a user fact", () => {
  assert.equal(presentUserMemoryFact("我最近开始学习摄影"), "用户最近开始学习摄影");
  assert.equal(presentUserMemoryFact("用户讨厌香菜"), "用户讨厌香菜");
  assert.equal(presentUserMemoryFact("用户只喝冰美式"), "用户只喝冰美式");
});

test("prompt names the user and does not treat memory as must-use", () => {
  const ctx = buildBehaviorContext({
    persona: "林夏",
    memories: [{ content: "我最近开始学习摄影" }],
  });
  assert.ok(ctx.includes("用户最近开始学习摄影"));
  assert.ok(/Known about the user/.test(ctx));
  assert.ok(/not about you/i.test(ctx));
  assert.ok(!/must use|请使用|必须使用|always mention/i.test(ctx));
});

test("stored memory content stays first-person; only prompt is presented", () => {
  resetAll();
  addMemory("role_rep", "我最近开始学习摄影", 7, "auto");
  assert.equal(getMemoryList("role_rep")[0].content, "我最近开始学习摄影");
  const assembled = assembleTurnContext(
    { id: "c_rep", roleId: "role_rep", name: "林夏", config: { persona: "朋友" } },
    { query: "对了，我最近学摄影还挺上头的。" }
  );
  assert.ok(assembled.prompt.includes("用户最近开始学习摄影"));
  assert.equal(
    assembled.context.memory.some((m) => m.content === "我最近开始学习摄影"),
    true
  );
});

test("already user-prefixed facts are not double-prefixed", () => {
  const ctx = buildBehaviorContext({
    persona: "角色",
    memories: [{ content: "用户喜欢茶" }],
  });
  assert.ok(ctx.includes("用户喜欢茶"));
  assert.ok(!ctx.includes("用户用户喜欢茶"));
});

console.log("\n=== Memory Representation Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log("All memory representation tests passed.");
