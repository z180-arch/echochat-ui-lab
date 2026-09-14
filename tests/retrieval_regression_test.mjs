/**
 * Retrieval precision/recall regression for lived photography memory.
 * Retrieval only — does not score model utilization.
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
const { retrieveMemoriesForTurn } = await import(srcHref("src/domain/memory.js"));
const { quietRememberUserText } = await import(srcHref("src/domain/memory-candidates.js"));

const ROLE_ID = "role_retrieval";
const PHOTO = "我最近开始学习摄影";

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

function resetSeed() {
  localStorage.clear();
  store.reset();
  quietRememberUserText(ROLE_ID, PHOTO);
}

function retrievedPhoto(query, opts) {
  const items = retrieveMemoriesForTurn(ROLE_ID, query, undefined, opts);
  return items.some((m) => String(m.content).includes("摄影"));
}

console.log("\n=== Retrieval Regression ===");

test("A1 weekend stroll does not retrieve photography", () => {
  resetSeed();
  assert.equal(retrievedPhoto("我周末可能想出去转转。"), false);
});

test("A2 weekend where-to-go does not retrieve photography", () => {
  resetSeed();
  assert.equal(retrievedPhoto("我还在想周末去哪儿比较好。"), false);
});

test("B explicit photography talk retrieves photography", () => {
  resetSeed();
  assert.equal(retrievedPhoto("对了，我最近学摄影还挺上头的。"), true);
});

test("C1 movies do not retrieve photography", () => {
  resetSeed();
  assert.equal(retrievedPhoto("你觉得下雨天适合看什么电影？"), false);
});

test("C2 waking early does not retrieve photography", () => {
  resetSeed();
  assert.equal(retrievedPhoto("我明天早上得早点起床。"), false);
});

test("C3 hello does not retrieve photography", () => {
  resetSeed();
  assert.equal(retrievedPhoto("你好。"), false);
});

test("C4 最近还好吗 does not retrieve photography on an active day", () => {
  resetSeed();
  assert.equal(retrievedPhoto("最近还好吗？"), false);
});

test("D shooting talk retrieves photography", () => {
  resetSeed();
  assert.equal(retrievedPhoto("我周末想出去拍点东西。"), true);
});

test("F same role still retrieves photography on shooting talk", () => {
  resetSeed();
  assert.equal(retrievedPhoto("我周末想出去拍点东西。"), true);
  assert.equal(retrievedPhoto("我周末想出去拍点东西。"), true);
});

test("F gap-idle greeting may still use continuity anchors", () => {
  resetSeed();
  assert.equal(retrievedPhoto("最近还好吗？", { idleDays: 3 }), true);
});

test("最近学摄影怎么样 still retrieves because 摄影 is content", () => {
  resetSeed();
  assert.equal(retrievedPhoto("最近学摄影怎么样？"), true);
});

console.log("\n=== Retrieval Regression Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log("All retrieval regression tests passed.");
