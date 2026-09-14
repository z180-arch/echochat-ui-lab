/**
 * Character vs global worldbook: UI-backed domain API and context isolation.
 */
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcHref(relativePath) {
  return pathToFileURL(join(__dirname, "..", relativePath)).href;
}
function srcFile(relativePath) {
  return join(__dirname, "..", relativePath);
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

const { store } = await import(srcHref("src/core/store.js"));
const { addMemory } = await import(srcHref("src/domain/memory.js"));
const { assembleTurnContext } = await import(srcHref("src/domain/turn-context.js"));
const {
  saveWorldbook,
  loadWorldbook,
  addEntry,
  updateEntry,
  deleteEntry,
  toggleEntryEnabled,
  ensureCharacterBook,
  getBookForCharacter,
  deleteBooksForCharacter,
  buildWorldbookBlock,
  resetWorldbookRuntime,
} = await import(srcHref("src/domain/worldbook.js"));
const { importCharacter } = await import(srcHref("src/domain/persona.js"));
const { Character } = await import(srcHref("src/domain/character.js"));
const { FROZEN_USER_MEMORY_HEADER } = await import(srcHref("src/domain/behavior.js"));

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
  resetWorldbookRuntime();
  saveWorldbook({
    version: 2,
    activeGlobalBookId: "global",
    books: [{ id: "global", name: "全局世界书", scope: "global", roleId: null, roleKey: null, entries: [] }],
  });
}

function chat(roleId, name = "角色") {
  return {
    id: `chat_${roleId}`,
    roleId,
    name,
    config: { persona: `你是${name}。` },
  };
}

console.log("\n=== Character worldbook ===");

test("global entry CRUD and disable", () => {
  resetAll();
  const e = addEntry("global", {
    name: "雨",
    keys: ["雨天"],
    content: "global lore",
    enabled: true,
    constant: true,
  });
  assert.ok(e.id);
  assert.ok(loadWorldbook().books.find((b) => b.id === "global").entries.some((x) => x.content === "global lore"));
  updateEntry("global", e.id, { content: "global lore 2" });
  toggleEntryEnabled("global", e.id);
  const off = loadWorldbook().books.find((b) => b.id === "global").entries.find((x) => x.id === e.id);
  assert.equal(off.enabled, false);
  assert.equal(deleteEntry("global", e.id), true);
});

test("character entry stays on that character", () => {
  resetAll();
  const bookA = ensureCharacterBook("role_a", "A的世界书");
  addEntry(bookA.id, {
    name: "A",
    keys: ["lore"],
    content: "A-only lore",
    enabled: true,
    constant: true,
  });
  assert.ok(getBookForCharacter("role_a"));
  assert.equal(getBookForCharacter("role_b"), null);
  const a = buildWorldbookBlock(chat("role_a", "A"), [], "role_a", "你是A");
  const b = buildWorldbookBlock(chat("role_b", "B"), [], "role_b", "你是B");
  assert.ok(a && a.includes("A-only lore"));
  assert.ok(!b || !b.includes("A-only lore"));
});

test("Case A: A lore in A context, not B", () => {
  resetAll();
  const bookA = ensureCharacterBook("role_a", "A");
  addEntry(bookA.id, { name: "A", content: "A-only lore", enabled: true, constant: true, keys: ["x"] });
  const promptA = assembleTurnContext(chat("role_a", "A"), { query: "你好" }).prompt;
  const promptB = assembleTurnContext(chat("role_b", "B"), { query: "你好" }).prompt;
  assert.ok(promptA.includes("A-only lore"));
  assert.ok(!promptB.includes("A-only lore"));
});

test("Case B: global + character lore both present for A", () => {
  resetAll();
  addEntry("global", { name: "G", content: "global lore", enabled: true, constant: true, keys: ["g"] });
  const bookA = ensureCharacterBook("role_a", "A");
  addEntry(bookA.id, { name: "A", content: "A lore", enabled: true, constant: true, keys: ["a"] });
  const prompt = assembleTurnContext(chat("role_a", "A"), { query: "你好" }).prompt;
  assert.ok(prompt.includes("global lore"));
  assert.ok(prompt.includes("A lore"));
});

test("Case C: identical worldbook copy of a user fact is dropped", () => {
  resetAll();
  addMemory("role_a", "我最近开始学习摄影", 7, "auto");
  const bookA = ensureCharacterBook("role_a", "A");
  addEntry(bookA.id, {
    name: "dup",
    content: "用户最近开始学习摄影",
    enabled: true,
    constant: true,
    keys: ["摄影"],
  });
  const prompt = assembleTurnContext(chat("role_a", "林夏"), { query: "我周末想出去拍点东西。" }).prompt;
  assert.ok(prompt.includes(FROZEN_USER_MEMORY_HEADER));
  assert.ok(prompt.includes("用户最近开始学习摄影"));
  assert.ok(!/World Information/.test(prompt));
});

test("disabled character entry is not injected", () => {
  resetAll();
  const bookA = ensureCharacterBook("role_a", "A");
  const e = addEntry(bookA.id, { name: "off", content: "hidden lore", enabled: true, constant: true, keys: ["h"] });
  toggleEntryEnabled(bookA.id, e.id);
  const prompt = assembleTurnContext(chat("role_a", "A"), { query: "你好" }).prompt;
  assert.ok(!prompt.includes("hidden lore"));
});

await testAsync("import character card lore becomes a character book", async () => {
  resetAll();
  const result = await importCharacter({
    spec: "chara_card_v2",
    data: {
      name: "进口角色",
      description: "温和",
      first_mes: "我在。",
      character_book: {
        name: "进口书",
        entries: [{ keys: ["港湾"], content: "只有这个角色知道的港湾", enabled: true, constant: true }],
      },
    },
  });
  assert.equal(result.ok, true);
  const book = getBookForCharacter(result.characterId);
  assert.ok(book);
  assert.ok((book.entries || []).some((e) => /港湾/.test(e.content)));
  const other = assembleTurnContext(chat("role_other", "别人"), { query: "港湾" }).prompt;
  assert.ok(!other.includes("只有这个角色知道的港湾"));
});

await testAsync("character delete removes character worldbook only", async () => {
  resetAll();
  addEntry("global", { name: "G", content: "keep global", enabled: true, constant: true, keys: ["g"] });
  const chatA = store.createChat({ roleId: "role_del_wb", name: "删", persona: "p" });
  const book = ensureCharacterBook(chatA.roleId, "删的书");
  addEntry(book.id, { name: "gone", content: "character lore gone", constant: true, enabled: true, keys: ["x"] });
  await Character.permanentDeleteCharacter(chatA.roleId);
  assert.equal(getBookForCharacter(chatA.roleId), null);
  assert.ok(loadWorldbook().books.some((b) => b.id === "global"));
  assert.ok(loadWorldbook().books.find((b) => b.id === "global").entries.some((e) => e.content === "keep global"));
  assert.equal(deleteBooksForCharacter(chatA.roleId), 0);
});

test("shared worldbook editor is reused for character books", () => {
  const views = readFileSync(srcFile("src/ui/views/index.js"), "utf8");
  const mainSrc = readFileSync(srcFile("src/main.js"), "utf8");
  assert.ok(views.includes("renderWorldbookEditorHtml"));
  assert.ok(views.includes("openCharacterWorldbook"));
  assert.ok(mainSrc.includes("openCharacterWorldbook"));
  assert.ok(mainSrc.includes("toggleWorldbookEntry"));
  assert.ok(mainSrc.includes("saveWorldbookEntry"));
});

console.log(`\nCharacter Worldbook: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
