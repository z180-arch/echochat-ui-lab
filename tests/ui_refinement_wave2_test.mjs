/**
 * Wave 2 UI refinement — chat transcript presentation only.
 * Grouping, avatar/name/timestamp chrome, 44px more-button hit area.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcHref(relativePath) {
  return pathToFileURL(join(__dirname, "..", relativePath)).href;
}
function srcFile(relativePath) {
  return join(__dirname, "..", relativePath);
}

global.window = {
  ECHOCHAT_CONFIG: {},
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
};

const {
  sameSender,
  isVisibleTranscriptMessage,
  transcriptGroupFlags,
} = await import(srcHref("src/ui/present.js"));

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function msg(role, extra = {}) {
  return { role, text: extra.text ?? "hi", status: extra.status, time: extra.time ?? 1 };
}

test("sameSender is role-only and ignores time/content", () => {
  assert.equal(sameSender(msg("her"), msg("her", { text: "other", time: 99 })), true);
  assert.equal(sameSender(msg("her"), msg("me")), false);
  assert.equal(sameSender(null, msg("her")), false);
});

test("empty streaming placeholder is not a visible transcript row", () => {
  assert.equal(isVisibleTranscriptMessage(msg("her", { status: "streaming", text: "" })), false);
  assert.equal(isVisibleTranscriptMessage(msg("her", { status: "error", text: "" })), true);
  assert.equal(isVisibleTranscriptMessage(msg("her", { status: "streaming", text: "正在写" })), true);
});

test("State A: single AI shows avatar, name, timestamp", () => {
  const list = [msg("her")];
  const f = transcriptGroupFlags(list, 0);
  assert.equal(f.isGroupStart, true);
  assert.equal(f.isGroupEnd, true);
  assert.equal(f.showAvatar, true);
  assert.equal(f.showName, true);
  assert.equal(f.showTime, true);
  assert.equal(f.showUserAvatar, false);
});

test("State B: consecutive AI is one group — avatar/name first, time last", () => {
  const list = [msg("her", { text: "a" }), msg("her", { text: "b" })];
  const a = transcriptGroupFlags(list, 0);
  const b = transcriptGroupFlags(list, 1);
  assert.equal(a.showAvatar, true);
  assert.equal(a.showName, true);
  assert.equal(a.showTime, false);
  assert.equal(b.showAvatar, false);
  assert.equal(b.showName, false);
  assert.equal(b.showTime, true);
  assert.equal(b.isGroupStart, false);
});

test("State C: AI then User are two groups", () => {
  const list = [msg("her"), msg("me")];
  const ai = transcriptGroupFlags(list, 0);
  const user = transcriptGroupFlags(list, 1);
  assert.equal(ai.isGroupEnd, true);
  assert.equal(ai.showTime, true);
  assert.equal(user.isGroupStart, true);
  assert.equal(user.showAvatar, false);
  assert.equal(user.showName, false);
  assert.equal(user.showUserAvatar, false);
  assert.equal(user.showTime, true);
});

test("State D: AI → AI → User → AI forms three groups", () => {
  const list = [msg("her"), msg("her"), msg("me"), msg("her")];
  const flags = list.map((_, i) => transcriptGroupFlags(list, i));
  assert.equal(flags[0].showAvatar && flags[0].showName && !flags[0].showTime, true);
  assert.equal(!flags[1].showAvatar && !flags[1].showName && flags[1].showTime, true);
  assert.equal(flags[2].showUserAvatar, false);
  assert.equal(flags[2].showName, false);
  assert.equal(flags[3].showAvatar, true);
  assert.equal(flags[3].isGroupStart, true);
});

test("empty streaming AI does not steal timestamp from previous visible AI", () => {
  const list = [msg("her", { text: "done" }), msg("her", { status: "streaming", text: "" })];
  const f = transcriptGroupFlags(list, 0);
  assert.equal(f.showTime, true);
  assert.equal(f.isGroupEnd, true);
});

test("user messages never show avatar or name", () => {
  const list = [msg("me"), msg("me")];
  const a = transcriptGroupFlags(list, 0);
  const b = transcriptGroupFlags(list, 1);
  assert.equal(a.showUserAvatar, false);
  assert.equal(b.showUserAvatar, false);
  assert.equal(a.showAvatar, false);
  assert.equal(b.showAvatar, false);
  assert.equal(a.showName, false);
  assert.equal(b.showName, false);
  assert.equal(a.showTime, false);
  assert.equal(b.showTime, true);
});

test("error assistant row stays visible in grouping and can carry timestamp", () => {
  const list = [msg("me"), msg("her", { status: "error", text: "" })];
  const err = transcriptGroupFlags(list, 1);
  assert.equal(isVisibleTranscriptMessage(list[1]), true);
  assert.equal(err.showAvatar, true);
  assert.equal(err.showTime, true);
});

const viewsSrc = readFileSync(srcFile("src/ui/views/index.js"), "utf8");
const motionSrc = readFileSync(srcFile("src/styles/motion.css"), "utf8");
const componentsSrc = readFileSync(srcFile("src/styles/components.css"), "utf8");

test("retry remains an inline error action, not a more-menu item", () => {
  assert.ok(viewsSrc.includes("没发出去"));
  assert.ok(viewsSrc.includes("retryLastMessage"));
  assert.ok(viewsSrc.includes("msg-retry-btn"));
  const moreBlock = viewsSrc.slice(viewsSrc.indexOf("msg-actions"), viewsSrc.indexOf("msg-actions") + 800);
  assert.ok(!moreBlock.includes("retryLastMessage"));
});

test("recall remains an independent strip, not a message row", () => {
  assert.ok(viewsSrc.includes("recall-chip"));
  assert.ok(viewsSrc.includes("想起了"));
  assert.ok(componentsSrc.includes(".recall-chip"));
  assert.ok(!componentsSrc.includes(".recall-chip .msg-avatar"));
});

test("message more-button hit area is 44px", () => {
  assert.match(motionSrc, /\.msg-more-btn\s*\{[^}]*width:\s*44px/);
  assert.match(motionSrc, /\.msg-more-btn\s*\{[^}]*height:\s*44px/);
});

console.log(`\nUI Refinement Wave 2: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
