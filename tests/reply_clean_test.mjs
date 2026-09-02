/**
 * Assistant reply cleaning: strip stage/emotion tags, keep real parentheticals.
 */
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { cleanAssistantReply } = await import(
  pathToFileURL(join(__dirname, "..", "src/domain/reply-clean.js")).href
);

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
    console.log(`  ❌ ${name}: ${e.error || e.message}`);
  }
}

console.log("\n--- Reply clean ---");

test("strips （笑眯眯）", () => {
  assert.equal(cleanAssistantReply("你好呀（笑眯眯）"), "你好呀");
});

test("strips [Cute(Convincing)/撒娇]", () => {
  assert.equal(cleanAssistantReply("今晚过来嘛[Cute(Convincing)/撒娇]"), "今晚过来嘛");
});

test("strips obvious *action* stage direction", () => {
  assert.equal(cleanAssistantReply("*微笑* 那就这样吧"), "那就这样吧");
});

test("strips 【走到窗边】 stage direction", () => {
  assert.equal(cleanAssistantReply("【走到窗边】外面在下雨。"), "外面在下雨。");
});

test("keeps normal Chinese parenthetical", () => {
  assert.equal(cleanAssistantReply("明天（大概七点）见"), "明天（大概七点）见");
});

test("keeps question in parentheses", () => {
  assert.equal(cleanAssistantReply("你还记得吗（上次那家店）"), "你还记得吗（上次那家店）");
});

test("keeps halfwidth informational parens", () => {
  assert.equal(cleanAssistantReply("价格是 20 元 (不含税)"), "价格是 20 元 (不含税)");
});

test("does not invent text or drop the sentence", () => {
  const src = "我知道了。那就按你说的来。";
  assert.equal(cleanAssistantReply(src), src);
});

test("empty / whitespace after strip becomes empty", () => {
  assert.equal(cleanAssistantReply("（笑眯眯）"), "");
  assert.equal(cleanAssistantReply("[Cute(Convincing)/撒娇]"), "");
});

test("does not touch markdown links", () => {
  assert.equal(cleanAssistantReply("看这个 [文档](https://example.com)"), "看这个 [文档](https://example.com)");
});

console.log(`\nReply Clean: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
