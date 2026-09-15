/**
 * Companion interaction grammar — first verb, witnessing, reunion, outreach.
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
const { installStorageTestHooks, resetStorageTestHooks } = await import(
  srcHref("src/repository/storage-hooks.js")
);
const { messageStore } = await import(srcHref("src/domain/message-store.js"));
const { createFromTemplate } = await import(srcHref("src/domain/persona.js"));
const { captureLivedMoment, listMoments, resetMomentsRuntime } = await import(
  srcHref("src/domain/moments.js")
);
const { quietRememberUserText } = await import(srcHref("src/domain/memory-candidates.js"));
const { recordChatTurn, resetRelationsRuntime } = await import(srcHref("src/domain/relations.js"));
const { considerOutreach, composeOutreachLine } = await import(srcHref("src/domain/outreach.js"));
const { getLastWitness, witnessLine, resetWitnessForTests } = await import(
  srcHref("src/domain/witness.js")
);
const { hoursAway, reunionLine } = await import(srcHref("src/ui/present.js"));

const views = readFileSync(srcFile("src/ui/views/index.js"), "utf8");
const mainSrc = readFileSync(srcFile("src/main.js"), "utf8");

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

const DAY = 86400000;
const now = Date.parse("2026-09-16T00:00:00Z");

function resetAll() {
  localStorage.clear();
  store.reset();
  resetMomentsRuntime();
  resetRelationsRuntime();
  resetWitnessForTests();
}

console.log("\n=== Companion grammar ===\n");

test("app boot does not parser-block on Google Fonts", () => {
  const html = readFileSync(srcFile("app/index.html"), "utf8").replace(/<noscript>[\s\S]*?<\/noscript>/gi, "");
  const tags = html.match(/<link[^>]*fonts\.googleapis\.com[^>]*>/g) || [];
  assert.ok(tags.length, "expected a Google Fonts link");
  for (const tag of tags) {
    if (/stylesheet/i.test(tag)) assert.match(tag, /media="print"/);
  }
});

test("first verb is encounter, not create-and-chat", () => {
  assert.match(views, /把 TA 带进来/);
  assert.match(views, /welcome-letter/);
  assert.doesNotMatch(views, /welcome-cta">创建角色/);
  assert.doesNotMatch(views, /开始聊天</);
  assert.doesNotMatch(views, /选一个角色开始聊/);
  assert.match(views, /还没有人在这儿/);
  assert.match(mainSrc, /title: "把 TA 带进来"/);
});

test("nav says 我们, not 痕迹 as the user-facing tab", () => {
  assert.match(views, /nav-item-label">我们/);
  assert.match(views, /list-title">我们/);
  assert.doesNotMatch(views, /nav-item-label">痕迹/);
});

test("message primary action is 记下, utilities sit in more", () => {
  assert.match(views, /msg-action-primary/);
  assert.match(views, /记下了" : "记下"/);
  assert.match(views, /class="msg-more"/);
  assert.match(views, /aria-label="更多操作"/);
});

test("reunion starts after four hours from a real timestamp", () => {
  assert.equal(hoursAway(now, now), 0);
  assert.equal(reunionLine(now, now), "");
  assert.equal(reunionLine(now - 3 * 3600000, now), "");
  assert.equal(reunionLine(now - 4 * 3600000, now), "你回来了");
  assert.equal(reunionLine(now - DAY, now), "隔了一天");
});

test("shared scenes can become moments; greetings still do not", () => {
  resetAll();
  assert.equal(captureLivedMoment("role_g", "今天天气真好"), null);
  assert.equal(captureLivedMoment("role_g", "你好啊"), null);
  const m = captureLivedMoment("role_g", "昨晚我们一起去了咖啡馆", { roleName: "林晚" });
  assert.ok(m);
  assert.equal(listMoments("role_g").length, 1);
});

test("quiet remember writes a witness line, not a toast string in main", () => {
  resetAll();
  const mem = quietRememberUserText("role_w", "我最近开始学习摄影");
  assert.ok(mem);
  const w = getLastWitness({ roleId: "role_w" });
  assert.ok(w);
  assert.equal(w.kind, "memory");
  assert.match(witnessLine(w), /记下了/);
  assert.doesNotMatch(mainSrc, /你们刚刚留下了一条相处痕迹/);
});

test("outreach copy stays silent without a real last talk or moment", () => {
  assert.equal(composeOutreachLine({ lastPreview: "" }, null), "");
  assert.match(composeOutreachLine({ lastPreview: "冰美式还行吗" }, null), /冰美式/);
});

function installFastStorage() {
  installStorageTestHooks({ isAvailable: async () => false });
}

await testAsync("outreach persists a real last-talk line when gates pass", async () => {
  resetAll();
  installFastStorage();
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "" });
  await messageStore.addMessage(chat.id, { role: "me", text: "下周想去看展览", status: "sent" });
  const ts = now - 2 * DAY;
  for (let i = 0; i < 60; i++) recordChatTurn(chat.roleId, "林晚", ts);
  const sent = await considerOutreach({ now, rng: () => 0, persist: true, outreachEnabled: true });
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /展览/);
  const msgs = messageStore.peekMessages(chat.id);
  const last = msgs[msgs.length - 1];
  assert.equal(last.role, "her");
  assert.equal(last.metadata.outreach, true);
  const again = await considerOutreach({ now, rng: () => 0, persist: true, outreachEnabled: true });
  assert.equal(again.length, 0);
  resetStorageTestHooks();
});

await testAsync("outreach respects the off switch", async () => {
  resetAll();
  installFastStorage();
  const chat = await createFromTemplate({ name: "林晚", persona: "p", firstMessage: "" });
  await messageStore.addMessage(chat.id, { role: "me", text: "我明天出差", status: "sent" });
  const ts = now - 2 * DAY;
  for (let i = 0; i < 60; i++) recordChatTurn(chat.roleId, "林晚", ts);
  const sent = await considerOutreach({ now, rng: () => 0, persist: true, outreachEnabled: false });
  assert.equal(sent.length, 0);
  resetStorageTestHooks();
});

console.log(`\nCompanion grammar: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
