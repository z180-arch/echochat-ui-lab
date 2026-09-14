/**
 * Moments feed + character worldbook surfaces.
 * Usage: node scripts/moments_worldbook_ui_verify.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9440);
const HTTP_PORT = Number(process.env.APP_PORT || 8840);
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
const USER_DATA = join(tmpdir(), `echochat-moments-wb-${Date.now()}`);
const WSImpl = globalThis.WebSocket || (await import("undici")).WebSocket;

const results = [];
function record(name, status, detail = "") {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? " — " + detail : ""}`);
}

async function waitForJson(url, attempts = 80) {
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
  const { addMoment } = await import('/src/domain/moments.js');
  const { addEntry, ensureCharacterBook, buildWorldbookBlock } = await import('/src/domain/worldbook.js');
  const { assembleTurnContext } = await import('/src/domain/turn-context.js');
  store.reset();
  store.updateSettings({ apiKey: '', baseUrl: 'https://api.example.com/v1', model: 'x' });
  const a = await createFromTemplate({ name: '林夏', persona: '温和', firstMessage: '我在。' });
  const b = await createFromTemplate({ name: '岑', persona: '冷淡', firstMessage: '说。' });
  addMoment({ roleId: a.roleId, roleName: '林夏', content: '一起去了那家咖啡馆', source: 'manual', createdAt: Date.now() });
  const bookA = ensureCharacterBook(a.roleId, '林夏的世界书');
  addEntry(bookA.id, { name: '港湾', keys: ['港湾'], content: 'A-only lore', enabled: true, constant: true });
  addEntry('global', { name: '雨', keys: ['雨'], content: 'global lore', enabled: true, constant: true });
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  window.EchoApp.view = 'app';
  store.setActiveTab('moments');
  window.EchoApp.render();
  const pane = !!document.querySelector('.moments-pane');
  const feed = (document.querySelector('.moment-content')?.textContent || '').trim();
  const tab = !!document.querySelector('.bottom-nav-item, .nav-item');
  window.EchoApp.openCharacterWorldbook(a.roleId);
  const title = (document.querySelector('.modal-title')?.textContent || '').trim();
  const hasToggle = !!document.querySelector('.wb-toggle');
  const chatA = store.getState().chats.find((c) => c.roleId === a.roleId);
  const chatB = store.getState().chats.find((c) => c.roleId === b.roleId);
  const promptA = assembleTurnContext(chatA, { query: '港湾' }).prompt;
  const promptB = assembleTurnContext(chatB, { query: '港湾' }).prompt;
  const blockB = buildWorldbookBlock(chatB, [], b.roleId, '岑');
  document.querySelectorAll('.modal-overlay').forEach((m) => m.remove());
  const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
  return {
    pane,
    feed,
    tab,
    title,
    hasToggle,
    aHasA: promptA.includes('A-only lore'),
    aHasGlobal: promptA.includes('global lore'),
    bHasA: promptB.includes('A-only lore'),
    bBlockHasA: !!(blockB && blockB.includes('A-only lore')),
    overflow,
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

  for (const [width, height, mobile] of [
    [1440, 900, false],
    [390, 844, true],
  ]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await send("Page.navigate", { url: `${BASE}?c=${Date.now()}&w=${width}` });
    for (let i = 0; i < 40; i++) {
      if (await evalExpr(send, "!!window.EchoApp")) break;
      await sleep(200);
    }
    const snap = await evalExpr(send, FLOW);
    record(`${width} · moments pane`, snap.pane ? "PASS" : "FAIL");
    record(`${width} · feed content`, /咖啡馆/.test(snap.feed) ? "PASS" : "FAIL", snap.feed);
    record(`${width} · character worldbook`, /世界书/.test(snap.title) && snap.hasToggle ? "PASS" : "FAIL", snap.title);
    record(`${width} · A lore in A`, snap.aHasA && snap.aHasGlobal ? "PASS" : "FAIL");
    record(`${width} · A lore not in B`, !snap.bHasA && !snap.bBlockHasA ? "PASS" : "FAIL");
    record(`${width} · no overflow`, !snap.overflow ? "PASS" : "FAIL");
  }
  ws.close();
} finally {
  chrome.kill();
  server.kill();
}

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n==== MOMENTS + WORLDBOOK UI ====`);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
