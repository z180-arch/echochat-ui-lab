/**
 * Wave 3B — product UI visual tightening. Presentation only.
 * Does not change Wave 3A shell breakpoints or Wave 1/2 copy/grouping.
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
  hubSecondaryLine,
  presentCompanionStage,
  hubShowsStageChip,
  compactDesktopListWidth,
  PROFILE_PERSIST_MIN_WIDTH,
} = await import(srcHref("src/ui/present.js"));
const { EmptyState, CharacterCard } = await import(srcHref("src/ui/components/index.js"));

const layouts = readFileSync(srcFile("src/styles/layouts.css"), "utf8");
const components = readFileSync(srcFile("src/styles/components.css"), "utf8");
const responsive = readFileSync(srcFile("src/styles/responsive.css"), "utf8");
const viewsSrc = readFileSync(srcFile("src/ui/views/index.js"), "utf8");
const tokens = readFileSync(srcFile("src/styles/tokens.css"), "utf8");

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

test("Hub page padding snaps to 20/16/12", () => {
  assert.ok(/\.inbox-head\s*\{[^}]*padding:\s*var\(--space-5\)\s+var\(--space-4\)\s+var\(--space-3\)/.test(layouts));
  assert.ok(!/\.inbox-head\s*\{[^}]*padding:\s*22px/.test(layouts));
});

test("Hub row uses 12px padding and 72 min-height", () => {
  assert.ok(/\.list-item\s*\{[^}]*padding:\s*var\(--space-3\)/.test(components));
  assert.ok(/\.list-item\s*\{[^}]*min-height:\s*72px/.test(components));
  assert.ok(!/\.list-item\s*\{[^}]*padding:\s*12px 10px/.test(components));
});

test("Hub selected state stays quiet primary-soft", () => {
  assert.ok(/\.list-item-active\s*\{[^}]*--color-primary-soft/.test(components));
});

test("Wave 1 hub one secondary line is unchanged", () => {
  const p = presentCompanionStage({ hasHistory: false }, true);
  assert.equal(hubSecondaryLine(p), "刚刚认识");
  assert.equal(hubShowsStageChip("刚刚认识", "刚刚认识"), false);
  const html = CharacterCard({ name: "林晚", presence: "刚刚认识", stageLabel: "刚刚认识" });
  assert.equal((html.match(/刚刚认识/g) || []).length, 1);
});

test("Profile header is a single stage line", () => {
  assert.ok(viewsSrc.includes("StageChip({ label: presented.label, stage: presented.stage })"));
  const profileStart = viewsSrc.indexOf("function renderProfilePane");
  const profile = profileStart >= 0 ? viewsSrc.slice(profileStart) : "";
  assert.ok(!/profile-status`[^`]*相处 \$\{presented\.knownDays\}/.test(profile));
  assert.ok(!/profile-status[\s\S]{0,200}presented\.knownDays/.test(profile.split("profile-rows")[0] || ""));
});

test("Profile identity uses edit in actions, not duplicate tools block", () => {
  assert.ok(viewsSrc.includes("editCharacter("));
  assert.ok(viewsSrc.includes("profile-actions"));
  assert.ok(!viewsSrc.includes("profile-tools"));
});

test("Export lives in more sheet, not beside identity", () => {
  assert.ok(viewsSrc.includes("renderProfileMoreContent"));
  assert.ok(viewsSrc.includes("导出角色卡"));
  const pane = viewsSrc.slice(viewsSrc.indexOf("function renderProfilePane"), viewsSrc.indexOf("function momentContextLine"));
  const header = pane.slice(pane.indexOf("profile-header"), pane.indexOf("profile-relate"));
  assert.ok(header.length > 0);
  assert.ok(!header.includes("导出"));
});

test("Profile fold padding matches section 16px", () => {
  assert.ok(/\.profile-fold\s*\{[^}]*padding:\s*var\(--space-4\)/.test(layouts));
  assert.ok(/\.profile-section\s*\{[^}]*padding:\s*var\(--space-4\)/.test(layouts));
});

test("Settings group title is quiet, not uppercase dashboard", () => {
  assert.ok(/\.settings-group-title\s*\{[^}]*--font-label/.test(components));
  assert.ok(!/\.settings-group-title\s*\{[^}]*text-transform:\s*uppercase/.test(components));
  assert.ok(/\.me-settings-group-title\s*\{[^}]*--font-label/.test(layouts));
});

test("Settings rows share 44px touch and 16px padding", () => {
  assert.ok(/\.setting-row\s*\{[^}]*padding:\s*var\(--space-4\)/.test(components));
  assert.ok(/\.setting-row\s*\{[^}]*min-height:\s*44px/.test(components));
  assert.ok(/\.me-settings-item\s*\{[^}]*min-height:\s*44px/.test(layouts));
  assert.ok(/\.me-settings-item\s*\{[^}]*padding:\s*var\(--space-4\)/.test(layouts));
});

test("EmptyState is title, one explanation, one primary action", () => {
  const html = EmptyState({
    icon: "x",
    title: "还没有人在这儿",
    desc: "把一个会留下来的人带进来。不是创建一个 AI。",
    actionText: "把 TA 带进来",
    actionOnClick: "window.EchoApp.openBring()",
  });
  assert.ok(html.includes("empty-title"));
  assert.ok(html.includes("empty-desc"));
  assert.equal((html.match(/btn-primary/g) || []).length, 1);
  assert.ok(!html.includes("btn-secondary"));
  assert.ok(viewsSrc.includes('title: "还没有人在这儿"'));
  assert.ok(viewsSrc.includes('title: "还没有一起经历过的事"'));
});

test("Chat empty type matches empty-state hierarchy", () => {
  assert.ok(/\.chat-empty-t\s*\{[^}]*--font-section/.test(layouts));
  assert.ok(/\.empty-title\s*\{[^}]*--font-section/.test(components));
});

test("Morning Mint tokens are unchanged", () => {
  assert.match(tokens, /--color-bg:\s*#FAFCFB/);
  assert.match(tokens, /--color-text:\s*#243238/);
  assert.match(tokens, /--color-text-secondary:\s*#5A6C72/);
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

test("Settings CSS has no stray top-level brace before arrow", () => {
  const idx = layouts.indexOf(".me-settings-item-arrow");
  assert.ok(idx > 0);
  const before = layouts.slice(layouts.indexOf(".me-settings-item-desc"), idx);
  assert.equal((before.match(/\{/g) || []).length, (before.match(/\}/g) || []).length);
});

console.log(`\nUI Refinement Wave 3B: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
