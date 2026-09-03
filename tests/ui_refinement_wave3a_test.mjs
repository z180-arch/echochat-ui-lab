/**
 * Wave 3A — desktop shell 1024–1280. CSS-first, no chat/hub/profile content changes.
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

const {
  PROFILE_PERSIST_MIN_WIDTH,
  compactDesktopListWidth,
  chatColumnMinWidth,
  sameSender,
  transcriptGroupFlags,
  hubSecondaryLine,
  presentCompanionStage,
} = await import(srcHref("src/ui/present.js"));

const responsive = readFileSync(srcFile("src/styles/responsive.css"), "utf8");
const tokens = readFileSync(srcFile("src/styles/tokens.css"), "utf8");
const viewsSrc = readFileSync(srcFile("src/ui/views/index.js"), "utf8");
const motionSrc = readFileSync(srcFile("src/styles/motion.css"), "utf8");

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

test("1024 shell uses compact list and profile drawer", () => {
  assert.equal(compactDesktopListWidth(1024), 260);
  assert.equal(compactDesktopListWidth(1100), 260);
  assert.equal(compactDesktopListWidth(1200), 260);
  assert.equal(compactDesktopListWidth(1279), 260);
  const mid = block(responsive, "min-width:\\s*1024px\\)\\s*and\\s*\\(max-width:\\s*1279px");
  assert.ok(/--list-width:\s*260px/.test(mid));
  assert.ok(/\.profile-pane\.open/.test(mid));
  assert.ok(/position:\s*fixed/.test(mid));
});

test("1280 shell keeps persistent profile when chat stays comfortable", () => {
  assert.ok(PROFILE_PERSIST_MIN_WIDTH <= 1280);
  assert.equal(compactDesktopListWidth(1280), 320);
  const persist = block(responsive, "min-width:\\s*1280px");
  assert.ok(/\.profile-pane/.test(persist));
  assert.ok(/display:\s*flex/.test(persist));
});

test("1440 shell still widens list and profile", () => {
  const wide = block(responsive, "min-width:\\s*1440px");
  assert.ok(/--list-width:\s*340px/.test(wide));
  assert.ok(/--profile-width:\s*360px/.test(wide));
});

test("chat min width and 760 measure stay on desktop", () => {
  assert.equal(chatColumnMinWidth(), 360);
  assert.ok(/max-width:\s*760px/.test(responsive));
  const desk = block(responsive, "min-width:\\s*1024px");
  assert.ok(/min-width:\s*360px/.test(desk));
});

test("rail stays 72px", () => {
  assert.match(tokens, /--sidebar-width:\s*72px/);
});

test("1024 chat remainder is at least 360 with compact list", () => {
  const rail = 72;
  const list = compactDesktopListWidth(1024);
  const chat = 1024 - rail - list;
  assert.ok(list >= 260);
  assert.ok(chat >= 360, `chat remainder ${chat}`);
});

test("1280 four-column chat remainder is at least 360", () => {
  const chat = 1280 - 72 - 320 - 340;
  assert.ok(chat >= 360, `chat remainder ${chat}`);
});

test("profile drawer reuses renderProfilePane, no second renderer", () => {
  assert.equal((viewsSrc.match(/function renderProfilePane/g) || []).length, 1);
  assert.ok(!viewsSrc.includes("renderDesktopProfile"));
  assert.ok(!viewsSrc.includes("renderDrawerProfile"));
  assert.ok(viewsSrc.includes("PROFILE_PERSIST_MIN_WIDTH"));
  assert.ok(!/innerWidth\s*>=\s*1024/.test(viewsSrc));
});

test("mobile <768 and tablet 768–1023 queries remain", () => {
  assert.ok(/@media\s*\(max-width:\s*767px\)/.test(responsive));
  assert.ok(/@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1023px\)/.test(responsive));
  const tablet = block(responsive, "min-width:\\s*768px\\)\\s*and\\s*\\(max-width:\\s*1023px");
  assert.ok(/--list-width:\s*260px/.test(tablet));
  assert.ok(/position:\s*fixed/.test(tablet));
});

test("1024–1279 reuses profile-mask, 768–1023 mask rule untouched", () => {
  const tabletMask = block(motionSrc, "min-width:\\s*768px\\)\\s*and\\s*\\(max-width:\\s*1023px");
  assert.ok(/\.profile-mask/.test(tabletMask));
  assert.ok(/@media\s*\(min-width:\s*1024px\)\s*and\s*\(max-width:\s*1279px\)/.test(motionSrc + responsive));
});

test("Wave 1 stage presentation is unchanged", () => {
  const p = presentCompanionStage({ hasHistory: false }, true);
  assert.equal(hubSecondaryLine(p), "刚刚认识");
});

test("Wave 2 grouping is unchanged", () => {
  const list = [
    { role: "her", text: "a" },
    { role: "her", text: "b" },
    { role: "me", text: "c" },
  ];
  assert.equal(sameSender(list[0], list[1]), true);
  const a = transcriptGroupFlags(list, 0);
  const b = transcriptGroupFlags(list, 1);
  assert.equal(a.showAvatar, true);
  assert.equal(b.showAvatar, false);
  assert.equal(b.showTime, true);
});

console.log(`\nUI Refinement Wave 3A: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
