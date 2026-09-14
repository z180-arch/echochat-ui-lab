/**
 * Long transcripts: tail hydrate + virtual DOM. 1000 / 5000 / 10000.
 * Usage: node scripts/long_chat_verify.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9474);
const HTTP_PORT = Number(process.env.APP_PORT || 8874);
const BASE = `http://127.0.0.1:${HTTP_PORT}/app/`;
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) throw new Error("Chrome not found. Set CHROME_PATH.");
const USER_DATA = join(tmpdir(), `echochat-long-chat-${Date.now()}`);
const WSImpl = globalThis.WebSocket || (await import("undici")).WebSocket;

const results = [];
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

async function evalExpr(send, expression, timeout = 180000) {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "eval exception");
  }
  return r.result?.value;
}

async function waitApp(send) {
  for (let i = 0; i < 90; i++) {
    const ready = await evalExpr(
      send,
      `!!window.EchoApp && window.EchoApp._storageReady ? window.EchoApp._storageReady.then(() => true) : Promise.resolve(!!window.EchoApp)`,
      5000
    );
    if (ready) return;
    await sleep(200);
  }
  throw new Error("EchoApp not ready");
}

const FLOW = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { createFromTemplate } = await import('/src/domain/persona.js');
  const { storage, KEYS } = await import('/src/core/storage.js');
  const { store } = await import('/src/core/store.js');
  const { messageStore, resetRuntime, UI_WINDOW } = await import('/src/domain/message-store.js');
  const { dexieAdapter } = await import('/src/infrastructure/dexie-adapter.js');
  const { setReplyPaceForCharacter } = await import('/src/domain/reply-pace.js');
  store.reset();
  resetRuntime();
  store.updateSettings({ apiKey: 'sk-test-key', baseUrl: 'https://api.example.com/v1', model: 'x' });
  const chat = await createFromTemplate({ name: '林晚', persona: 'p', firstMessage: '' });
  setReplyPaceForCharacter(chat.roleId, 'instant');
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  const n = Number(window.__seedCount) || 1000;
  const quietRender = window.EchoApp.render.bind(window.EchoApp);
  window.EchoApp.render = function () {};
  const rows = [];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    rows.push({
      id: 'lc-' + i,
      conversationId: chat.id,
      role: i % 2 ? 'assistant' : 'user',
      content: i % 9 === 0 ? ('**强调** ' + i) : ('消息 ' + i),
      createdAt: 1e12 + i,
      status: 'sent',
    });
  }
  await dexieAdapter.message.bulkCreate(rows);
  const bulkMs = Math.round(performance.now() - t0);
  const tHydra = performance.now();
  await messageStore.hydrateChat(chat.id);
  const hydraMs = Math.round(performance.now() - tHydra);
  window.EchoApp.render = quietRender;
  window.EchoApp.view = 'app';
  const tPaint = performance.now();
  window.EchoApp.render();
  const firstPaintMs = Math.round(performance.now() - tPaint);
  const box = document.getElementById('chat-messages');
  const nodes = box ? [...box.querySelectorAll(':scope > .msg')] : [];
  const peeked = messageStore.peekMessages(chat.id).length;
  const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
  return {
    count: n,
    bulkMs,
    hydraMs,
    firstPaintMs,
    peeked,
    window: UI_WINDOW,
    dom: nodes.length,
    hasComposer: !!document.getElementById('chat-input'),
    overflowX,
    copyBtn: !!document.querySelector('.msg-action-btn'),
    hasOlder: messageStore.peekHasOlder(chat.id),
  };
})())()`;

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
    "--no-sandbox",
    "about:blank",
  ],
  { stdio: "ignore" }
);

try {
  const list = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const page = list.find((t) => t.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("no CDP page");
  const { ws, send } = await cdpConnect(page.webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Runtime.enable");

  const runs = [
    [390, 844, true, 1000],
    [1024, 900, false, 5000],
    [1440, 900, false, 10000],
  ];
  for (const [width, height, mobile, count] of runs) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await send("Page.navigate", { url: `${BASE}?c=${Date.now()}&w=${width}` });
    await waitApp(send);
    await evalExpr(send, `window.__seedCount = ${count}; true`);
    const snap = await evalExpr(send, FLOW);
    const ok =
      snap.peeked <= snap.window &&
      snap.dom > 0 &&
      snap.dom <= snap.window &&
      snap.hasOlder === true &&
      snap.copyBtn &&
      snap.hasComposer &&
      !snap.overflowX;
    record(`${width} · ${count} window`, ok ? "PASS" : "FAIL", JSON.stringify(snap));
  }
  ws.close();
} catch (e) {
  record("browser harness", "FAIL", e.message);
} finally {
  chrome.kill();
  server.kill();
}

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n==== LONG CHAT ====`);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
