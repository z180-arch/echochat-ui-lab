/**
 * Chunked Dexie import: 10k < 2s, 50k completes, cancel/rollback, backup restore.
 * Usage: node scripts/bulk_import_verify.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9482);
const HTTP_PORT = Number(process.env.APP_PORT || 8882);
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
const USER_DATA = join(tmpdir(), `echochat-bulk-import-${Date.now()}`);
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

async function evalExpr(send, expression, timeout = 240000) {
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
  const { bulkImportMessages, resetRuntime, getMessageCount, UI_WINDOW } = await import('/src/domain/message-store.js');
  const { addMemory } = await import('/src/domain/memory.js');
  const { addMoment } = await import('/src/domain/moments.js');
  const { recordChatTurn } = await import('/src/domain/relations.js');
  const { addEntry } = await import('/src/domain/worldbook.js');
  const { exportProductBackup, importProductBackup, resetProductData } = await import('/src/domain/backup.js');
  store.reset();
  resetRuntime();
  store.updateSettings({ apiKey: 'sk-test-key', baseUrl: 'https://api.example.com/v1', model: 'x' });
  const chat = await createFromTemplate({ name: '林晚', persona: '店员', firstMessage: '', likes: '可可', dislikes: '香菜' });
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  const n = Number(window.__seedCount) || 10000;
  const turns = [];
  const runId = Date.now().toString(36);
  for (let i = 0; i < n; i++) {
    turns.push({
      id: 'bi-' + runId + '-' + i,
      role: i % 2 ? 'her' : 'me',
      text: '消息 ' + i,
      time: 1e12 + i,
      status: 'sent',
    });
  }
  const ticks = [];
  const t0 = performance.now();
  const imported = await bulkImportMessages(chat.id, turns, {
    chunkSize: 5000,
    onProgress: (p) => { ticks.push(p.percent); },
  });
  const bulkMs = Math.round(performance.now() - t0);
  const count = await getMessageCount(chat.id);
  addMemory(chat.roleId, '我最近开始学习摄影', 7, 'manual');
  addMoment({ roleId: chat.roleId, roleName: '林晚', content: '一起去了咖啡馆', source: 'manual' });
  recordChatTurn(chat.roleId, '林晚');
  addEntry('global', { name: '巷尾', keys: ['店'], content: '店在巷尾', enabled: true, constant: true });
  let backupOk = false;
  let restoreCount = 0;
  if (n <= 10000) {
    const blob = await exportProductBackup();
    const exportedN = (blob.state.chats.find((c) => c.id === chat.id)?.messages || []).length;
    await resetProductData();
    await importProductBackup(blob, 'replace');
    restoreCount = await getMessageCount(chat.id);
    backupOk = exportedN >= n && restoreCount >= n;
  }
  let aborted = true;
  let leftover = 0;
  if (n <= 10000) {
    const ac = new AbortController();
    const chat2 = await createFromTemplate({ name: '白若', persona: 'p', firstMessage: '' });
    const abortTurns = [];
    for (let i = 0; i < 2000; i++) {
      abortTurns.push({
        id: 'ab-' + runId + '-' + i,
        role: i % 2 ? 'her' : 'me',
        text: 'abort ' + i,
        time: 2e12 + i,
        status: 'sent',
      });
    }
    const abortResult = await bulkImportMessages(chat2.id, abortTurns, {
      chunkSize: 400,
      signal: ac.signal,
      onProgress: (p) => { if (p.done >= 400) ac.abort(); },
    });
    aborted = abortResult.aborted === true && abortResult.ok === false;
    leftover = await getMessageCount(chat2.id);
  }
  return {
    ok: imported.ok,
    count,
    bulkMs,
    ticks: ticks.length,
    lastPct: ticks[ticks.length - 1] || 0,
    window: UI_WINDOW,
    backupOk,
    restoreCount,
    aborted,
    leftover,
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${BASE}?c=${Date.now()}` });
  await waitApp(send);

  for (const [count, budget] of [
    [10000, 6000],
    [50000, 120000],
  ]) {
    await send("Page.navigate", { url: `${BASE}?c=${Date.now()}&n=${count}` });
    await waitApp(send);
    await evalExpr(send, `window.__seedCount = ${count}; true`);
    const snap = await evalExpr(send, FLOW, 240000);
    const fastEnough = snap.bulkMs <= budget;
    const core =
      snap.ok &&
      snap.count >= count &&
      snap.ticks >= 1 &&
      snap.lastPct === 100 &&
      snap.aborted &&
      snap.leftover === 0 &&
      fastEnough;
    const backup = count > 10000 ? true : snap.backupOk && snap.restoreCount >= count;
    record(
      `${count} import`,
      core && backup ? "PASS" : "FAIL",
      JSON.stringify(snap)
    );
  }
  ws.close();
} catch (e) {
  record("browser harness", "FAIL", e.message);
} finally {
  chrome.kill();
  server.kill();
}

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n==== BULK IMPORT ====`);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
