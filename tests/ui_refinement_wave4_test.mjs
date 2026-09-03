/**
 * Wave 4 — product UI surface completion. Presentation only.
 * Does not change Wave 1–3B frozen pages, storage, or chat loop.
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

const { PROFILE_PERSIST_MIN_WIDTH, compactDesktopListWidth } = await import(srcHref("src/ui/present.js"));
const { memoryReviewMarkup } = await import(srcHref("src/ui/views/memory-review.js"));

const mainSrc = readFileSync(srcFile("src/main.js"), "utf8");
const layouts = readFileSync(srcFile("src/styles/layouts.css"), "utf8");
const components = readFileSync(srcFile("src/styles/components.css"), "utf8");
const motion = readFileSync(srcFile("src/styles/motion.css"), "utf8");
const responsive = readFileSync(srcFile("src/styles/responsive.css"), "utf8");
const tokens = readFileSync(srcFile("src/styles/tokens.css"), "utf8");
const viewsSrc = readFileSync(srcFile("src/ui/views/index.js"), "utf8");

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

function block(css, query) {
  const re = new RegExp(`@media\\s*\\(${query}\\)\\s*\\{`);
  const start = css.search(re);
  assert.ok(start >= 0, `missing @media (${query})`);
  let i = css.indexOf("{", start);
  let depth = 0;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed @media (${query})`);
}

function sliceFn(src, name) {
  const start = src.search(new RegExp(`\\n\\s*${name}\\s*\\(`));
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

test("Import character card keeps the create modal until success", () => {
  const bring = sliceFn(mainSrc, "_paintBringModal");
  assert.ok(bring.includes("keepOpen"));
  assert.ok(bring.includes('importCharacterCard()", false, true)'));
  assert.ok(!/remove\(\);window\.EchoApp\.importCharacterCard/.test(bring));
  const importFn = sliceFn(mainSrc, "importCharacterCard");
  assert.ok(importFn.includes('querySelectorAll(".modal-overlay")'));
});

test("Template picker uses icon, not emoji", () => {
  const picker = sliceFn(mainSrc, "openTemplatePicker");
  assert.ok(picker.includes("Icons.users"));
  assert.ok(!picker.includes("t.emoji"));
});

test("Character edit validates name and reports save failure", () => {
  const save = sliceFn(mainSrc, "saveCharacterEdit");
  assert.ok(save.includes("先写个名字"));
  assert.ok(save.includes(".catch"));
  assert.ok(save.includes("保存失败"));
});

test("Worldbook settings copy is shared, not a character admin", () => {
  assert.ok(mainSrc.includes("对所有角色共用"));
  assert.ok(mainSrc.includes("写好关键词和设定后点添加"));
});

test("Voice input is not a fake tappable setting", () => {
  const start = mainSrc.indexOf('section === "voice"');
  const end = mainSrc.indexOf("openModal({ title: titles[section]", start);
  const voice = mainSrc.slice(start, end);
  assert.ok(voice.includes("即将支持"));
  assert.ok(!voice.includes("toggleSTT"));
  assert.ok(!voice.includes("开发中"));
});

test("Memory extract empty uses EmptyState and a close action", () => {
  const empty = memoryReviewMarkup({ candidates: [] });
  assert.ok(empty.content.includes("empty-title"));
  assert.ok(empty.content.includes("没有可提取的条目"));
  assert.ok(empty.content.includes("empty-desc"));
  assert.ok(!empty.content.includes("mem-post-moment"));
  assert.ok(empty.footer.includes("btn-primary"));
  assert.ok(empty.footer.includes("关闭"));
  assert.ok(!empty.footer.includes("写入记忆"));
  const filled = memoryReviewMarkup({
    candidates: [{ id: "1", accepted: true, duplicate: false, text: "记一件事", evidence: [] }],
  });
  assert.ok(filled.content.includes("写入这个角色的记忆"));
  assert.ok(filled.footer.includes("写入记忆"));
});

test("Reconstruction parse has no fake progress delay", () => {
  const parse = sliceFn(mainSrc, "reconstructionParse");
  assert.ok(!parse.includes("setTimeout"));
  assert.ok(!parse.includes("620"));
  assert.ok(parse.includes('step = "review"'));
});

test("Reconstruction file load does not duplicate success toast", () => {
  const pick = sliceFn(mainSrc, "reconstructionPickFile");
  assert.ok(!pick.includes("聊天记录已导入"));
});

test("Create cards snap to 16px padding and 13px secondary", () => {
  assert.ok(/\.create-card\s*\{[^}]*padding:\s*16px/.test(motion));
  assert.ok(/\.create-card-desc\s*\{[^}]*font-size:\s*13px/.test(motion));
  assert.ok(/\.mode-tab\s*\{[^}]*min-height:\s*44px/.test(motion));
});

test("Moments actions and memory delete meet 44px touch", () => {
  assert.ok(/\.moment-action\s*\{[^}]*min-height:\s*44px/.test(layouts));
  assert.ok(/\.moments-filter\s*\{[^}]*min-height:\s*44px/.test(layouts));
  assert.ok(/\.memory-row-del\s*\{[^}]*width:\s*44px/.test(components));
  assert.ok(/\.memory-row-del\s*\{[^}]*height:\s*44px/.test(components));
  assert.ok(/\.conv-item\s*\{[^}]*min-height:\s*44px/.test(layouts));
});

test("Morning Mint tokens are unchanged", () => {
  assert.match(tokens, /--color-bg:\s*#FAFCFB/);
  assert.match(tokens, /--color-text:\s*#243238/);
  assert.match(tokens, /--color-primary:\s*#7CB8E8/);
  assert.match(tokens, /--color-mint:\s*#9DD9C2/);
  assert.match(tokens, /Noto Sans SC/);
});

test("Wave 3A shell breakpoints stay frozen", () => {
  assert.equal(PROFILE_PERSIST_MIN_WIDTH, 1280);
  assert.equal(compactDesktopListWidth(1024), 260);
  assert.equal(compactDesktopListWidth(1280), 320);
  const mid = block(responsive, "min-width:\\s*1024px\\)\\s*and\\s*\\(max-width:\\s*1279px");
  assert.ok(/--list-width:\s*260px/.test(mid));
  assert.ok(/position:\s*fixed/.test(mid));
  const persist = block(responsive, "min-width:\\s*1280px");
  assert.ok(/display:\s*flex/.test(persist));
  assert.ok(/@media\s*\(max-width:\s*767px\)/.test(responsive));
  assert.ok(/@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1023px\)/.test(responsive));
});

test("Wave 3B hub/profile/settings markers stay in place", () => {
  assert.ok(/\.inbox-head\s*\{[^}]*padding:\s*var\(--space-5\)\s+var\(--space-4\)\s+var\(--space-3\)/.test(layouts));
  assert.ok(viewsSrc.includes("StageChip({ label: presented.label, stage: presented.stage })"));
  assert.ok(/\.settings-group-title\s*\{[^}]*--font-label/.test(components));
  assert.ok(!/\.settings-group-title\s*\{[^}]*text-transform:\s*uppercase/.test(components));
});

console.log(`\nUI Refinement Wave 4: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
