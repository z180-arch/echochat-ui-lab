/**
 * Web Speech API STT unit tests (mocked engine). Independent of chat Provider.
 */
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcHref(relativePath) {
  return pathToFileURL(join(__dirname, "..", relativePath)).href;
}

class FakeSpeechRecognition {
  constructor() {
    this.lang = "";
    this.interimResults = false;
    this.continuous = false;
    this.maxAlternatives = 1;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    FakeSpeechRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
    this.onend?.();
  }
  abort() {
    this.aborted = true;
  }
  emit(transcript, isFinal = true) {
    this.onresult?.({
      resultIndex: 0,
      results: [{ 0: { transcript }, isFinal, length: 1 }],
    });
  }
}
FakeSpeechRecognition.instances = [];
globalThis.SpeechRecognition = FakeSpeechRecognition;

const {
  isSttSupported,
  isDictating,
  startDictation,
  stopDictation,
  joinDictation,
  sttErrorMessage,
  sttSupportNote,
} = await import(srcHref("src/domain/stt.js"));

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

console.log("\n=== Voice STT ===");

test("SpeechRecognition is detected", () => {
  assert.equal(isSttSupported(), true);
});

test("joinDictation: CJK has no extra space", () => {
  assert.equal(joinDictation("今天", "想喝茶"), "今天想喝茶");
  assert.equal(joinDictation("hello", "world"), "hello world");
  assert.equal(joinDictation("好", "。"), "好。");
});

test("startDictation delivers final transcript", () => {
  FakeSpeechRecognition.instances = [];
  const finals = [];
  const started = startDictation({
    lang: "zh-CN",
    onFinal: (t) => finals.push(t),
  });
  assert.equal(started.ok, true);
  assert.equal(isDictating(), true);
  const rec = FakeSpeechRecognition.instances[0];
  assert.equal(rec.lang, "zh-CN");
  rec.emit("你好呀", true);
  assert.deepEqual(finals, ["你好呀"]);
  stopDictation();
  assert.equal(isDictating(), false);
});

test("stopDictation does not fire leftover callbacks", () => {
  FakeSpeechRecognition.instances = [];
  let ended = false;
  startDictation({ onEnd: () => { ended = true; } });
  stopDictation();
  assert.equal(ended, false);
  assert.equal(isDictating(), false);
});

test("unsupported constructor is reported", () => {
  const prev = globalThis.SpeechRecognition;
  const prevWebkit = globalThis.webkitSpeechRecognition;
  try {
    globalThis.SpeechRecognition = undefined;
    globalThis.webkitSpeechRecognition = undefined;
    assert.equal(isSttSupported(), false);
    const res = startDictation();
    assert.equal(res.ok, false);
    assert.equal(res.reason, "unsupported");
  } finally {
    globalThis.SpeechRecognition = prev;
    globalThis.webkitSpeechRecognition = prevWebkit;
  }
});

test("error copy does not leak provider language", () => {
  assert.equal(sttErrorMessage("not-allowed"), "麦克风权限被拒绝");
  assert.equal(sttErrorMessage("aborted"), "");
  assert.ok(sttSupportNote().includes("聊天模型") || sttSupportNote().includes("浏览器"));
});

console.log(`\nSTT: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
