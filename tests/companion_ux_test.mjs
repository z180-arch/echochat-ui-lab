/**
 * Companion product UX — presentation only.
 * Reunion / ritual chips never invent lived events.
 */
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcHref(relativePath) {
  return pathToFileURL(join(__dirname, "..", relativePath)).href;
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
  reunionLine,
  daysAway,
  companionRitual,
  clipPreview,
  meetStarterPrompts,
  MEET_STARTER_HELLO,
  MEET_STARTER_WHO,
  definedGreeting,
  livedResume,
  hubResumeLine,
} = await import(srcHref("src/ui/present.js"));
const { renderCharacterShareCard } = await import(srcHref("src/ui/views/index.js"));

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

const DAY = 86400000;
const now = Date.parse("2026-09-15T00:00:00Z");

test("reunion starts after four hours, then names the gap", () => {
  assert.equal(reunionLine(now, now), "");
  assert.equal(reunionLine(now - 0.5 * DAY, now), "你回来了");
  assert.equal(reunionLine(now - 1 * DAY, now), "隔了一天");
  assert.equal(reunionLine(now - 2 * DAY, now), "有几天没聊了");
  assert.equal(reunionLine(now - 3 * DAY, now), "有几天没聊了");
  assert.equal(reunionLine(now - 10 * DAY, now), "好久不见");
  assert.equal(reunionLine(now - 40 * DAY, now), "很久没见了");
  assert.equal(reunionLine(0, now), "");
  assert.equal(daysAway(now - 10 * DAY, now), 10);
});

test("ritual priority: recall beats reunion beats first-meet", () => {
  const lastAt = now - 10 * DAY;
  assert.equal(
    companionRitual({
      recallPreview: "冰美式",
      lastAt,
      hasMessages: true,
      meetEarly: true,
      sending: false,
      now,
    }).kind,
    "recall"
  );
  assert.equal(
    companionRitual({
      lastAt,
      hasMessages: true,
      meetEarly: true,
      sending: false,
      now,
    }).kind,
    "reunion"
  );
  assert.equal(
    companionRitual({
      lastAt: now,
      hasMessages: true,
      meetEarly: true,
      sending: false,
      now,
    }).text,
    "刚刚认识 · 打开相处中"
  );
  assert.equal(companionRitual({ sending: true, meetEarly: true, lastAt, hasMessages: true, now }).kind, "");
});

test("clipPreview does not invent text", () => {
  assert.equal(clipPreview(""), "");
  assert.equal(clipPreview("短"), "短");
  assert.ok(clipPreview("这是一句比较长的上次对话预览内容", 8).endsWith("…"));
});

test("meet starters fill composer prompts from definition only", () => {
  const basic = meetStarterPrompts({});
  assert.equal(basic[0], MEET_STARTER_HELLO);
  assert.equal(basic[1], MEET_STARTER_WHO);
  assert.equal(basic.length, 2);
  const withLikes = meetStarterPrompts({ likes: "冰美式", scenario: "打烊后的店" });
  assert.ok(withLikes[2].includes("冰美式"));
  assert.ok(withLikes.some((t) => t.includes("打烊后的店")));
  assert.ok(withLikes.length <= 4);
});

test("definedGreeting reads character card, not memory", () => {
  assert.equal(definedGreeting({ config: { firstMessage: "我在。" } }), "我在。");
  assert.equal(definedGreeting({ config: {} }), "");
  assert.equal(definedGreeting(null), "");
});

test("livedResume uses only real last talk / moment / memory / stage", () => {
  const hidden = livedResume({ lastPreview: "上次", lastAt: now, now });
  assert.equal(hidden.show, false);
  const day = livedResume({
    lastPreview: "一起去了咖啡馆",
    lastAt: now - DAY,
    latestMoment: "雨夜便利店",
    latestMemory: "学摄影",
    stageLabel: "刚刚认识",
    now,
  });
  assert.equal(day.show, true);
  assert.equal(day.reunion, "隔了一天");
  assert.ok(day.lines.some((l) => l.kind === "last" && l.text.includes("上次我们聊到") && l.text.includes("一起去了咖啡馆")));
  assert.ok(day.lines.some((l) => l.kind === "moment" && l.text.includes("雨夜便利店")));
  assert.ok(day.lines.some((l) => l.kind === "memory" && l.text.includes("学摄影")));
  assert.ok(day.lines.every((l) => l.text.length > 0));
  const emptyAway = livedResume({ lastAt: now - DAY, now });
  assert.equal(emptyAway.show, true);
  assert.equal(emptyAway.lines[0].text, "隔了一天");
});

test("hubResumeLine prefixes reunion onto last preview", () => {
  assert.equal(hubResumeLine("拍了两张", now - DAY, now), "隔了一天 · 拍了两张");
  assert.equal(hubResumeLine("拍了两张", now, now), "拍了两张");
  assert.equal(hubResumeLine("", now - DAY, now), "");
});

test("share card is character definition, not memory", () => {
  const html = renderCharacterShareCard({
    data: {
      name: "林夏",
      description: "温和的店员",
      personality: "少话",
      first_mes: "不该出现在预览里的聊天",
      extensions: { echochat: { likes: "冰美式" } },
    },
  });
  assert.ok(html.includes("林夏"));
  assert.ok(html.includes("温和的店员"));
  assert.ok(html.includes("这是人设，不含你们的记忆。"));
  assert.ok(html.includes("Character Card V2 · 可导出分享"));
  assert.ok(!html.includes("不该出现在预览里的聊天"));
});

console.log(`\nCompanion UX: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
