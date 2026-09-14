/**
 * Chat continuity perception: remember → kept mark → related recall chip.
 * Usage: node scripts/continuity_ui_verify.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9434);
const HTTP_PORT = Number(process.env.APP_PORT || 8834);
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
const USER_DATA = join(tmpdir(), `echochat-continuity-${Date.now()}`);
const WSImpl = globalThis.WebSocket || (await import("undici")).WebSocket;

const PHOTO = "我最近开始学习摄影";
const RECALL = "我周末想出去拍点东西";

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

async function evalExpr(send, expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "eval exception");
  }
  return r.result?.value;
}

const FLOW = `(() => (async () => {
  localStorage.clear();
  try {
    const dbs = await indexedDB.databases();
    await Promise.all((dbs || []).map((db) => db.name && new Promise((res) => {
      const req = indexedDB.deleteDatabase(db.name);
      req.onsuccess = () => res();
      req.onerror = () => res();
      req.onblocked = () => res();
    })));
  } catch {}
  const { createFromTemplate } = await import('/src/domain/persona.js');
  const { storage, KEYS } = await import('/src/core/storage.js');
  const { store } = await import('/src/core/store.js');
  const { sendMessage } = await import('/src/domain/chat.js');
  const { assembleTurnContext } = await import('/src/domain/turn-context.js');
  const { getMemoryList } = await import('/src/domain/memory.js');
  store.reset();
  store.updateSettings({ apiKey: '', baseUrl: 'https://api.example.com/v1', model: 'x' });
  const chat = await createFromTemplate({ name: '林晚', persona: '温柔的陪伴者', firstMessage: '你好' });
  store.selectChat(chat.id);
  store.setActiveTab('companion');
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  window.EchoApp.view = 'app';
  await sendMessage(${JSON.stringify(PHOTO)});
  window.EchoApp.render();
  const kept = document.querySelector('.msg-kept');
  assembleTurnContext(store.getCurrentChat(), { query: ${JSON.stringify(RECALL)} });
  window.EchoApp.render();
  const recall = document.querySelector('.recall-chip');
  const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
  return {
    kept: (kept?.textContent || '').trim(),
    recall: (recall?.textContent || '').trim(),
    memories: getMemoryList(chat.roleId).map((m) => m.content),
    overflow,
    errors: (window.__errors || []).length,
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
  const { ws, send } = await cdpConnect(page.webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Runtime.enable");

  for (const [width, height, mobile] of [
    [1440, 900, false],
    [1024, 900, false],
    [390, 844, true],
  ]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await send("Page.navigate", { url: `${BASE}?c=${Date.now()}&w=${width}` });
    for (let i = 0; i < 40; i++) {
      if (await evalExpr(send, "!!window.EchoApp")) break;
      await sleep(200);
    }
    const snap = await evalExpr(send, FLOW);
    record(`${width} · kept mark`, snap.kept === "记下了" ? "PASS" : "FAIL", snap.kept);
    record(`${width} · recall chip`, /摄影/.test(snap.recall) ? "PASS" : "FAIL", snap.recall);
    record(`${width} · persisted`, snap.memories.some((m) => /摄影/.test(m)) ? "PASS" : "FAIL", JSON.stringify(snap.memories));
    record(`${width} · no overflow`, !snap.overflow ? "PASS" : "FAIL");
    record(`${width} · no page errors`, snap.errors === 0 ? "PASS" : "FAIL", String(snap.errors));
  }
  ws.close();
} finally {
  chrome.kill();
  server.kill();
}

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n==== CONTINUITY PATH ====`);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
