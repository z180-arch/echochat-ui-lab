/**
 * speechSynthesis TTS unit tests (mocked engine).
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

const spoken = [];
class FakeUtterance {
  constructor(text) {
    this.text = text;
    this.lang = "";
    this.rate = 1;
    this.onend = null;
  }
}
globalThis.SpeechSynthesisUtterance = FakeUtterance;
globalThis.speechSynthesis = {
  speaking: false,
  speak(u) {
    spoken.push(u.text);
    this.speaking = true;
    this._current = u;
  },
  cancel() {
    this.speaking = false;
    this._current = null;
  },
};

const { store } = await import(srcHref("src/core/store.js"));
const { speakText, speakAssistantMessage, stopSpeech, isSpeechSupported } = await import(
  srcHref("src/domain/voice.js")
);

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

console.log("\n=== Voice TTS ===");

test("speechSynthesis is detected", () => {
  assert.equal(isSpeechSupported(), true);
});

test("speakText plays and stopSpeech cancels", () => {
  spoken.length = 0;
  assert.equal(speakText("你好呀"), true);
  assert.deepEqual(spoken, ["你好呀"]);
  stopSpeech();
  assert.equal(globalThis.speechSynthesis.speaking, false);
});

test("autoplay respects ttsEnabled", () => {
  spoken.length = 0;
  store.updateSettings({ ttsEnabled: false });
  assert.equal(speakAssistantMessage({ text: "不该朗读" }), false);
  assert.equal(spoken.length, 0);
  store.updateSettings({ ttsEnabled: true });
  assert.equal(speakAssistantMessage({ text: "该朗读" }), true);
  assert.deepEqual(spoken, ["该朗读"]);
});

console.log(`\nVoice: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
