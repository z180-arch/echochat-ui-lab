/**
 * Appearance maps the current preset onto the existing CSS token set.
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

const { computeThemeVars, THEME_PRESETS, findThemePreset } = await import(srcHref("src/ui/theme.js"));

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

function colorsOf(id) {
  const p = findThemePreset(id);
  return { primary: p.primary, mint: p.mint, bubbleMe: p.primarySoft, bubbleHer: p.mintSoft };
}

console.log("\n--- Theme tokens ---");

test("computeThemeVars 覆盖背景/表面/文字/边框/输入/气泡", () => {
  const vars = computeThemeVars("light", colorsOf("mint"));
  for (const key of [
    "--color-bg",
    "--color-surface-chat",
    "--color-surface",
    "--color-surface-2",
    "--color-surface-elevated",
    "--color-text",
    "--color-text-secondary",
    "--color-border",
    "--color-input",
    "--color-bubble-me",
    "--color-bubble-her",
    "--color-primary",
  ]) {
    assert.ok(vars[key], missing(key));
  }
  assert.equal(vars["--color-surface-chat"], vars["--color-bg"]);
});

test("不同预设产生不同的背景 token", () => {
  const mint = computeThemeVars("light", colorsOf("mint"));
  const lav = computeThemeVars("light", colorsOf("lavender"));
  const rose = computeThemeVars("light", colorsOf("rose"));
  assert.notEqual(mint["--color-bg"], lav["--color-bg"]);
  assert.notEqual(lav["--color-bg"], rose["--color-bg"]);
  assert.ok(lav["--color-bg"].toLowerCase().includes("8b7cf6"));
  assert.ok(rose["--color-bg"].toLowerCase().includes("f472b6"));
});

test("暗色把表面铺到深色底，而不是沿用亮色白底", () => {
  const dark = computeThemeVars("dark", colorsOf("lavender"));
  assert.ok(dark["--color-bg"].includes("#0f1419"));
  assert.ok(dark["--color-surface"].includes("#1a2028"));
  assert.ok(dark["--color-bubble-me"].startsWith("rgba("));
});

test("6 个预设都有独立主色", () => {
  const ids = THEME_PRESETS.map((p) => p.id);
  assert.deepEqual(ids, ["mint", "sky", "lavender", "rose", "sage", "cloud"]);
  const primaries = new Set(THEME_PRESETS.map((p) => p.primary.toLowerCase()));
  assert.equal(primaries.size, 6);
});

function missing(key) {
  return `missing ${key}`;
}

console.log(`\nTheme tokens: ${passed} passed, ${failed} failed`);
if (failed) {
  for (const f of failures) console.error(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
