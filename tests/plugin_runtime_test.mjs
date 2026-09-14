/**
 * Minimal plugin runtime: EchoContext, registry, local runtime, DSH stub.
 * Does not change Character / Memory / Relationship / Worldbook / storage schemas.
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

const {
  createEchoContext,
  applyPluginContext,
  getPluginRegistry,
  resetPluginRegistry,
  getLocalPluginRuntime,
  createPluginContext,
  createDshPluginRuntime,
} = await import(srcHref("src/runtime/index.js"));
const { builtinPlugins } = await import(srcHref("src/plugins/index.js"));
const { getPublicProviderInfo } = await import(srcHref("src/adapters/provider/index.js"));
const { UI_SURFACES } = await import(srcHref("src/adapters/ui/index.js"));
const { buildSystemPrompt } = await import(srcHref("src/domain/chat.js"));
const { store } = await import(srcHref("src/core/store.js"));

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

console.log("\n=== Plugin Runtime (minimal) ===");

test("EchoContext keeps existing domain-shaped fields", () => {
  const ctx = createEchoContext({
    character: { id: "role_1", name: "A", identity: "店员" },
    conversation: { id: "c1" },
    memory: [{ content: "喜欢冰美式" }],
    relationship: { score: 1, brief: "第一次见面" },
    world: "便利店",
    moments: [{ content: "夜班" }],
    session: { chatId: "c1", query: "在吗" },
  });
  assert.equal(ctx.character.name, "A");
  assert.equal(ctx.conversation.id, "c1");
  assert.equal(ctx.memory[0].content, "喜欢冰美式");
  assert.equal(ctx.relationship.brief, "第一次见面");
  assert.equal(ctx.world, "便利店");
  assert.equal(ctx.moments[0].content, "夜班");
  assert.equal(ctx.session.query, "在吗");
});

test("registry register / unregister / getPlugins", () => {
  resetPluginRegistry();
  const registry = getPluginRegistry();
  const plugin = { id: "p1", name: "P1", version: "0.0.1" };
  registry.register(plugin);
  assert.equal(registry.getPlugins().length, 1);
  assert.equal(registry.getPlugins()[0].id, "p1");
  registry.unregister("p1");
  assert.equal(registry.getPlugins().length, 0);
});

test("duplicate plugin id is rejected", () => {
  resetPluginRegistry();
  const registry = getPluginRegistry();
  registry.register({ id: "dup", name: "A", version: "1" });
  assert.throws(() => registry.register({ id: "dup", name: "B", version: "2" }));
});

await testAsync("LocalPluginRuntime setup runs; API key is not on plugin context", async () => {
  resetPluginRegistry();
  let seen = null;
  const runtime = getLocalPluginRuntime();
  await runtime.register({
    id: "safe",
    name: "Safe",
    version: "1",
    setup(ctx) {
      seen = ctx;
    },
  });
  assert.ok(seen);
  assert.equal(seen.pluginId, "safe");
  assert.equal("apiKey" in seen, false);
  assert.equal("storage" in seen, false);
  assert.equal("store" in seen, false);
  assert.equal(typeof seen.events?.on, "function");
  assert.equal(runtime.getPlugins().some((p) => p.id === "safe"), true);
  runtime.unregister("safe");
  assert.equal(runtime.getPlugins().some((p) => p.id === "safe"), false);
});

test("extendContext can append extraPrompt without rewriting memory objects", () => {
  resetPluginRegistry();
  const memory = [{ content: "原记忆", importance: 8 }];
  getPluginRegistry().register({
    id: "ext",
    name: "Ext",
    version: "1",
    extendContext(ctx) {
      return {
        ...ctx,
        session: { ...ctx.session, extraPrompt: "PLUGIN_MARK" },
      };
    },
  });
  const next = applyPluginContext(
    createEchoContext({
      memory,
      session: { chatId: "c", extraPrompt: "" },
    })
  );
  assert.equal(next.session.extraPrompt, "PLUGIN_MARK");
  assert.equal(next.memory[0].content, "原记忆");
  assert.equal(next.memory, memory);
});

test("async extendContext is skipped in the sync prompt pipeline", () => {
  resetPluginRegistry();
  getPluginRegistry().register({
    id: "async-ext",
    name: "Async",
    version: "1",
    extendContext() {
      return Promise.resolve({ session: { extraPrompt: "ASYNC_SHOULD_NOT_APPEAR" } });
    },
  });
  const next = applyPluginContext(createEchoContext({ session: { extraPrompt: "" } }));
  assert.notEqual(next.session?.extraPrompt, "ASYNC_SHOULD_NOT_APPEAR");
});

test("buildSystemPrompt appends plugin extraPrompt and keeps character text", () => {
  resetPluginRegistry();
  getPluginRegistry().register({
    id: "prompt-ext",
    name: "PromptExt",
    version: "1",
    extendContext(ctx) {
      return { ...ctx, session: { ...ctx.session, extraPrompt: "PLUGIN_MARK" } };
    },
  });
  const chat = {
    id: "c_plugin",
    roleId: "role_plugin",
    name: "店员",
    config: { persona: "温柔店员" },
  };
  const prompt = buildSystemPrompt(chat, { query: "你好" });
  assert.ok(prompt.includes("温柔店员"));
  assert.ok(prompt.includes("PLUGIN_MARK"));
  resetPluginRegistry();
  const clean = buildSystemPrompt(chat, { query: "你好" });
  assert.ok(clean.includes("温柔店员"));
  assert.ok(!clean.includes("PLUGIN_MARK"));
});

test("createPluginContext does not expose settings.apiKey", () => {
  store.updateSettings({ apiKey: "sk-secret-test-key" });
  const ctx = createPluginContext({ id: "no-key", name: "NoKey", version: "1" });
  const blob = JSON.stringify(ctx);
  assert.ok(!blob.includes("sk-secret-test-key"));
  assert.equal(ctx.apiKey, undefined);
  store.updateSettings({ apiKey: "" });
});

test("provider adapter never returns apiKey", () => {
  store.updateSettings({ apiKey: "sk-secret-adapter", baseUrl: "https://example.test", model: "m" });
  const info = getPublicProviderInfo();
  assert.equal(info.model, "m");
  assert.equal(info.baseUrl, "https://example.test");
  assert.equal("apiKey" in info, false);
  store.updateSettings({ apiKey: "", baseUrl: "", model: "" });
});

test("UI adapter points at EchoChat surfaces, not a Chatbox fork", () => {
  assert.equal(UI_SURFACES.shell, "echochat");
  assert.ok(UI_SURFACES.chat);
  assert.ok(UI_SURFACES.sidebar);
  assert.ok(UI_SURFACES.settings);
  assert.ok(UI_SURFACES.character);
  assert.ok(UI_SURFACES.memory);
});

test("builtin plugin list is empty (reserved)", () => {
  assert.ok(Array.isArray(builtinPlugins));
  assert.equal(builtinPlugins.length, 0);
});

test("DSH plugin runtime is reserved and not implemented", () => {
  assert.throws(() => createDshPluginRuntime(), /not implemented/i);
});

resetPluginRegistry();

console.log("\n=== Plugin Runtime Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log("All plugin runtime tests passed.");
