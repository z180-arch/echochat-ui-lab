/**
 * Memory persist + chat core in a real browser.
 * Usage: node scripts/memory_chat_lifecycle_verify.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9480);
const HTTP_PORT = Number(process.env.APP_PORT || 8880);
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
const USER_DATA = join(tmpdir(), `echochat-mem-chat-${Date.now()}`);
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

async function waitApp(send) {
  for (let i = 0; i < 50; i++) {
    const ready = await evalExpr(
      send,
      `!!window.EchoApp && window.EchoApp._storageReady ? window.EchoApp._storageReady.then(() => true) : Promise.resolve(!!window.EchoApp)`
    );
    if (ready) return;
    await sleep(200);
  }
  throw new Error("EchoApp not ready");
}

const SEED = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { createFromTemplate } = await import('/src/domain/persona.js');
  const { addMemory, flushMemoriesPersist } = await import('/src/domain/memory.js');
  const { messageStore } = await import('/src/domain/message-store.js');
  const { storage, KEYS } = await import('/src/core/storage.js');
  const { store } = await import('/src/core/store.js');
  const a = await createFromTemplate({ name: '林夏', persona: '温和', firstMessage: '我在。' });
  await messageStore.addMessage(a.id, { role: 'me', text: '今天想吃火锅吗？', status: 'sent' });
  await messageStore.addMessage(a.id, { role: 'her', text: '讨厌香菜。', status: 'sent' });
  addMemory(a.roleId, '我最近开始学习吉他', 7, 'auto');
  addMemory(a.roleId, '我最近在准备一个重要考试', 7, 'auto');
  await flushMemoriesPersist();
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  window.EchoApp.view = 'app';
  window.EchoApp.render();
  return { roleId: a.roleId, chatId: a.id };
})())()`;

const CHECK = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { getMemoryList, retrieveMemoriesForTurn } = await import('/src/domain/memory.js');
  const { messageStore } = await import('/src/domain/message-store.js');
  const { assembleTurnContext } = await import('/src/domain/turn-context.js');
  const { store } = await import('/src/core/store.js');
  const ids = window.__echoIds;
  const list = getMemoryList(ids.roleId);
  const guitar = retrieveMemoriesForTurn(ids.roleId, '我最近开始学习吉他。');
  const tired = retrieveMemoriesForTurn(ids.roleId, '今天有点累。');
  const msgs = messageStore.peekMessages(ids.chatId);
  const chat = store.getState().chats.find((c) => c.id === ids.chatId);
  const prompt = assembleTurnContext(chat, { query: '我最近开始学习吉他。' }).prompt;
  return {
    memCount: list.length,
    guitar: guitar.some((m) => /吉他/.test(m.content)),
    quiet: !tired.some((m) => /吉他/.test(m.content)),
    order: msgs.filter((m) => m.role === 'me' || m.role === 'her').map((m) => m.text),
    promptHasGuitar: /吉他/.test(prompt),
    streamingLeft: msgs.filter((m) => m.status === 'streaming').length,
  };
})())()`;

const SWITCH = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { createConversationForCharacter } = await import('/src/domain/conversation.js');
  const { messageStore } = await import('/src/domain/message-store.js');
  const ids = window.__echoIds;
  const next = createConversationForCharacter(ids.roleId, { title: '第二线' });
  await messageStore.addMessage(next.id, { role: 'me', text: '第二条线', status: 'sent' });
  const a = messageStore.peekMessages(ids.chatId).map((m) => m.text);
  const b = messageStore.peekMessages(next.id).map((m) => m.text);
  return { nextId: next.id, aHasHotpot: a.some((t) => /火锅/.test(t)), bOnlySecond: b.includes('第二条线') && !b.some((t) => /火锅/.test(t)) };
})())()`;

const BACKUP = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { exportProductBackup, importProductBackup, resetProductData } = await import('/src/domain/backup.js');
  const { getMemoryList, hydrateMemories, resetMemoriesRuntime, flushMemoriesPersist } = await import('/src/domain/memory.js');
  const ids = window.__echoIds;
  const blob = await exportProductBackup();
  await resetProductData();
  resetMemoriesRuntime();
  await hydrateMemories();
  const afterReset = getMemoryList(ids.roleId).length;
  await importProductBackup(blob, 'replace');
  await flushMemoriesPersist();
  const afterRestore = getMemoryList(ids.roleId).length;
  await resetProductData();
  resetMemoriesRuntime();
  await hydrateMemories();
  return { afterReset, afterRestore, afterSecond: getMemoryList(ids.roleId).length, backupHasMem: !!(blob.memories && blob.memories[ids.roleId]) };
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

  const ids = await evalExpr(send, SEED);
  record("seed character messages memory", ids?.roleId && ids?.chatId ? "PASS" : "FAIL", JSON.stringify(ids));
  await evalExpr(send, `window.__echoIds = ${JSON.stringify(ids)}`);

  await send("Page.reload", { ignoreCache: true });
  await waitApp(send);
  await evalExpr(send, `window.__echoIds = ${JSON.stringify(ids)}`);
  const afterReload = await evalExpr(send, CHECK);
  record("reload keeps memories", afterReload.memCount === 2 ? "PASS" : "FAIL", JSON.stringify(afterReload));
  record("retrieval after reload", afterReload.guitar && afterReload.quiet && afterReload.promptHasGuitar ? "PASS" : "FAIL");
  record("message order after reload", afterReload.order.includes("今天想吃火锅吗？") && afterReload.order.includes("讨厌香菜。") ? "PASS" : "FAIL", JSON.stringify(afterReload.order));
  record("no leftover streaming", afterReload.streamingLeft === 0 ? "PASS" : "FAIL");

  const sw = await evalExpr(send, SWITCH);
  record("conversation switch isolation", sw.aHasHotpot && sw.bOnlySecond ? "PASS" : "FAIL", JSON.stringify(sw));

  const br = await evalExpr(send, BACKUP);
  record("backup includes memory", br.backupHasMem ? "PASS" : "FAIL", JSON.stringify(br));
  record("reset clears memory", br.afterReset === 0 ? "PASS" : "FAIL");
  record("restore memory", br.afterRestore === 2 ? "PASS" : "FAIL");
  record("second reset no resurrect", br.afterSecond === 0 ? "PASS" : "FAIL");

  ws.close();
} catch (e) {
  record("browser harness", "FAIL", e.message);
} finally {
  chrome.kill();
  server.kill();
}

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n==== MEMORY + CHAT LIFECYCLE ====`);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
