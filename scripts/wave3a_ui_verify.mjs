/**
 * Wave 3A desktop shell checks at 1024–1440, plus 390 mobile regression.
 * Isolated Chrome profile. Usage: node scripts/wave3a_ui_verify.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9420);
const HTTP_PORT = Number(process.env.APP_PORT || 8800);
const BASE = `http://127.0.0.1:${HTTP_PORT}/app/`;
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  throw new Error("Chrome not found. Set CHROME_PATH to a Chrome/Chromium binary.");
}
const USER_DATA = process.env.CHROME_USER_DATA || join(tmpdir(), `echochat-wave3a-${Date.now()}`);
const WSImpl = globalThis.WebSocket || (await import("undici")).WebSocket;
const OUT = join(ROOT, ".tmp-shots");
const LONG_CJK = "这是一段很长的中文回复，用来确认气泡会正常换行而不会把页面撑出横向滚动。".repeat(4);

const results = [];
const measures = [];

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? " — " + detail : ""}`);
}

async function waitForJson(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(250);
  }
  throw new Error(`CDP not ready: ${url}`);
}

async function cdpConnect(wsUrl) {
  const ws = new WSImpl(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => {
    const id = nextId++;
    const p = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    ws.send(JSON.stringify({ id, method, params }));
    return p;
  };
  return { ws, send };
}

async function evalExpr(send, expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "eval exception");
  }
  return r.result?.value;
}

async function shot(send, name) {
  await mkdir(OUT, { recursive: true });
  const r = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(OUT, `${name}.png`), Buffer.from(r.data, "base64"));
}

const SEED = `(() => (async () => {
  localStorage.clear();
  try {
    const dbs = await indexedDB.databases();
    await Promise.all((dbs || []).map(db => db.name && new Promise((res) => {
      const req = indexedDB.deleteDatabase(db.name);
      req.onsuccess = () => res();
      req.onerror = () => res();
      req.onblocked = () => res();
    })));
  } catch {}
  const { createFromTemplate } = await import('/src/domain/persona.js');
  const { storage, KEYS } = await import('/src/core/storage.js');
  const { store } = await import('/src/core/store.js');
  const { messageStore } = await import('/src/domain/message-store.js');
  store.reset();
  store.updateSettings({ apiKey: 'sk-test-key', baseUrl: 'https://api.example.com/v1', model: 'x' });
  const chat = await createFromTemplate({ name: '林晚', persona: '温柔的咖啡店员', firstMessage: '第一段' });
  await createFromTemplate({ name: '周宁', persona: '安静的书店店员', firstMessage: '你好' });
  store.selectChat(chat.id);
  store.setActiveTab('companion');
  store.setProfileOpen(window.innerWidth >= 1280);
  await messageStore.addMessage(chat.id, { role: 'her', text: '第二段', status: 'sent' });
  await messageStore.addMessage(chat.id, { role: 'me', text: '我在听', status: 'sent' });
  await messageStore.addMessage(chat.id, { role: 'her', text: ${JSON.stringify(LONG_CJK)}, status: 'sent' });
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  window.EchoApp.view = 'app';
  window.EchoApp.render();
  return { chatId: chat.id };
})())()`;

const SHELL = `(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      left: Math.round(r.left),
      display: cs.display,
      position: cs.position,
    };
  };
  const rail = document.querySelector('.nav-rail');
  const list = document.querySelector('.list-pane');
  const chat = document.querySelector('.chat-pane');
  const profile = document.querySelector('.profile-pane');
  const mask = document.querySelector('.profile-mask');
  const closeBtn = document.querySelector('.profile-close');
  const avatar = document.querySelector('.list-item-av .avatar, .list-item-av .character-avatar');
  const title = document.querySelector('.list-item-title');
  const subtitle = document.querySelector('.list-item-subtitle');
  const msgs = [...document.querySelectorAll('.msg')];
  const hers = msgs.filter((el) => el.classList.contains('msg-her') && !el.classList.contains('msg-error'));
  const firstHer = hers[0];
  const secondHer = hers[1];
  const transcript = document.querySelector('.chat-messages');
  const tcs = transcript ? getComputedStyle(transcript) : null;
  const overflowDoc = document.documentElement.scrollWidth > window.innerWidth + 2;
  const shell = document.querySelector('.app-shell');
  const overflowShell = !!(shell && shell.scrollWidth > shell.clientWidth + 2);
  const profileText = profile ? (profile.innerText || '') : '';
  return {
    vw: window.innerWidth,
    rail: box(rail),
    list: box(list),
    chat: box(chat),
    profile: box(profile),
    profileOpen: !!profile,
    mask: !!mask,
    closeDisplay: closeBtn ? getComputedStyle(closeBtn).display : 'none',
    avatarW: avatar ? Math.round(avatar.getBoundingClientRect().width) : 0,
    titleSize: title ? getComputedStyle(title).fontSize : '',
    subtitle: (subtitle?.textContent || '').trim(),
    hubChip: !!document.querySelector('.list-item-meta'),
    overflowX: overflowDoc || overflowShell,
    chatMin: chat ? getComputedStyle(chat).minWidth : '',
    transcriptMax: tcs ? tcs.maxWidth : '',
    groupedAi: !!(
      firstHer?.querySelector('.msg-avatar-btn') &&
      firstHer?.querySelector('.msg-name') &&
      secondHer &&
      !secondHer.querySelector('.msg-avatar-btn') &&
      secondHer.querySelector('.msg-avatar-slot')
    ),
    profileHas:
      /关于 TA/.test(profileText) &&
      /关系/.test(profileText) &&
      /林晚/.test(profileText),
    bottomNav: document.querySelector('.bottom-nav')
      ? getComputedStyle(document.querySelector('.bottom-nav')).display
      : 'none',
  };
})()`;

async function boot(send, width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await send("Page.navigate", { url: `${BASE}?w3a=${Date.now()}&w=${width}` });
  for (let i = 0; i < 50; i++) {
    if (await evalExpr(send, "!!window.EchoApp")) break;
    await sleep(200);
  }
  await evalExpr(send, `window.EchoApp._storageReady || Promise.resolve()`);
  await evalExpr(send, SEED);
  await sleep(400);
}

async function runDesktop(send, width, expect) {
  await boot(send, width, 900, false);
  const closed = await evalExpr(send, SHELL);
  measures.push({ width, phase: "rest", ...closed });
  const compact = width < 1280;
  const listMin = compact ? 258 : width >= 1440 ? 330 : 310;
  const listMax = compact ? 282 : width >= 1440 ? 350 : 330;
  const profileW = width >= 1440 ? [350, 370] : [330, 350];

  record(
    `${width} · no overflow`,
    !closed.overflowX ? "PASS" : "FAIL",
    `doc/shell overflow=${closed.overflowX}`
  );
  record(
    `${width} · rail 72`,
    closed.rail && closed.rail.display !== "none" && closed.rail.w >= 70 && closed.rail.w <= 74 ? "PASS" : "FAIL",
    JSON.stringify(closed.rail)
  );
  record(
    `${width} · list width`,
    closed.list && closed.list.w >= listMin && closed.list.w <= listMax ? "PASS" : "FAIL",
    `list=${closed.list?.w} expected ${listMin}-${listMax}`
  );
  record(
    `${width} · chat min 360`,
    closed.chat && closed.chat.w >= 360 ? "PASS" : "FAIL",
    `chat=${closed.chat?.w}`
  );
  record(
    `${width} · list avatar 48`,
    closed.avatarW >= 46 && closed.avatarW <= 50 ? "PASS" : "FAIL",
    `avatar=${closed.avatarW}`
  );
  record(
    `${width} · Wave 2 grouping`,
    closed.groupedAi ? "PASS" : "FAIL"
  );
  record(
    `${width} · transcript 760`,
    closed.transcriptMax === "760px" ? "PASS" : "FAIL",
    closed.transcriptMax
  );
  record(
    `${width} · Wave 1 hub line`,
    !!closed.subtitle && !closed.hubChip ? "PASS" : "FAIL",
    `subtitle=${closed.subtitle} chip=${closed.hubChip}`
  );

  if (expect === "drawer") {
    record(
      `${width} · profile not a column`,
      !closed.profileOpen ? "PASS" : "FAIL",
      `profileOpen=${closed.profileOpen} pos=${closed.profile?.position}`
    );
    await evalExpr(send, `window.EchoApp.toggleProfile(); true`);
    await sleep(200);
    const open = await evalExpr(send, SHELL);
    measures.push({ width, phase: "drawer", ...open });
    record(
      `${width} · profile drawer`,
      open.profileOpen && open.profile?.position === "fixed" && open.profile?.display === "flex" ? "PASS" : "FAIL",
      JSON.stringify(open.profile)
    );
    record(
      `${width} · drawer keeps chat`,
      open.chat && open.chat.w >= 360 && open.chat.display !== "none" ? "PASS" : "FAIL",
      `chat=${open.chat?.w}`
    );
    record(
      `${width} · drawer reuses profile content`,
      open.profileHas && open.closeDisplay !== "none" ? "PASS" : "FAIL",
      `close=${open.closeDisplay}`
    );
    record(
      `${width} · drawer close`,
      open.mask ? "PASS" : "FAIL",
      `mask=${open.mask}`
    );
    await evalExpr(send, `document.querySelector('.profile-close')?.click(); true`);
    await sleep(150);
    const after = await evalExpr(send, SHELL);
    record(
      `${width} · close control`,
      !after.profileOpen ? "PASS" : "FAIL"
    );
    await shot(send, `w3a-${width}-drawer`);
  } else {
    record(
      `${width} · persistent profile`,
      closed.profileOpen && closed.profile?.position !== "fixed" && closed.profile?.display === "flex" ? "PASS" : "FAIL",
      JSON.stringify(closed.profile)
    );
    record(
      `${width} · profile width`,
      closed.profile && closed.profile.w >= profileW[0] && closed.profile.w <= profileW[1] ? "PASS" : "FAIL",
      `profile=${closed.profile?.w}`
    );
    record(
      `${width} · close hidden`,
      closed.closeDisplay === "none" ? "PASS" : "FAIL",
      closed.closeDisplay
    );
    record(
      `${width} · profile content`,
      closed.profileHas ? "PASS" : "FAIL"
    );
    await shot(send, `w3a-${width}-persist`);
  }
}

async function runMobile(send) {
  await boot(send, 390, 844, true);
  const m = await evalExpr(send, SHELL);
  measures.push({ width: 390, phase: "mobile", ...m });
  record(
    `390 · no overflow`,
    !m.overflowX ? "PASS" : "FAIL"
  );
  record(
    `390 · rail hidden`,
    !m.rail || m.rail.display === "none" || m.rail.w === 0 ? "PASS" : "FAIL",
    JSON.stringify(m.rail)
  );
  record(
    `390 · Wave 2 grouping`,
    m.groupedAi ? "PASS" : "FAIL"
  );
  record(
    `390 · chat present`,
    m.chat && m.chat.display !== "none" ? "PASS" : "FAIL"
  );
  await shot(send, "w3a-390-chat");
}

const server = spawn(process.execPath, [join(ROOT, "scripts/static_server.mjs"), ROOT, String(HTTP_PORT)], {
  stdio: "ignore",
});
await sleep(400);
const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${USER_DATA}`,
    "--headless=new",
    "--no-first-run",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "about:blank",
  ],
  { stdio: "ignore" }
);

try {
  const list = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const page = list.find((t) => t.type === "page");
  const { ws, send } = await cdpConnect(page.webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Runtime.enable");
  await runDesktop(send, 1024, "drawer");
  await runDesktop(send, 1100, "drawer");
  await runDesktop(send, 1200, "drawer");
  await runDesktop(send, 1280, "persist");
  await runDesktop(send, 1440, "persist");
  await runMobile(send);
  ws.close();
} finally {
  chrome.kill();
  server.kill();
}

console.log("\n==== WAVE 3A MEASUREMENTS ====");
for (const m of measures) {
  console.log(
    JSON.stringify({
      width: m.width,
      phase: m.phase,
      rail: m.rail?.w,
      list: m.list?.w,
      chat: m.chat?.w,
      profile: m.profile?.w,
      profilePos: m.profile?.position,
      overflowX: m.overflowX,
    })
  );
}

const fails = results.filter((r) => r.status !== "PASS");
console.log("\n==== WAVE 3A BROWSER ====");
console.log(`${results.length - fails.length}/${results.length} passed`);
if (fails.length) {
  fails.forEach((f) => console.log(`FAIL ${f.name} ${f.detail}`));
  process.exit(1);
}
