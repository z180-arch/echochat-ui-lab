/**
 * Storage lifecycle in a real browser: persist across reload, isolation,
 * cascade delete, backup, restore, reset.
 * Usage: node scripts/storage_lifecycle_verify.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9460);
const HTTP_PORT = Number(process.env.APP_PORT || 8860);
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
const USER_DATA = join(tmpdir(), `echochat-storage-life-${Date.now()}`);
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
  const { addMoment, flushMomentsPersist } = await import('/src/domain/moments.js');
  const { addEntry, ensureCharacterBook, flushWorldbookPersist } = await import('/src/domain/worldbook.js');
  const { storage, KEYS } = await import('/src/core/storage.js');
  const { store } = await import('/src/core/store.js');
  const a = await createFromTemplate({ name: '林夏', persona: '温和', firstMessage: '我在。' });
  const b = await createFromTemplate({ name: '岑', persona: '冷淡', firstMessage: '说。' });
  addMoment({ roleId: a.roleId, roleName: '林夏', content: '一起去了那家咖啡馆', source: 'manual', chatId: a.id });
  addMoment({ roleId: a.roleId, roleName: '林夏', content: '角色级痕迹', source: 'reconstruction' });
  const bookA = ensureCharacterBook(a.roleId, '林夏的世界书');
  addEntry(bookA.id, { name: '港湾', keys: ['港湾'], content: 'A-only lore', enabled: true, constant: true });
  addEntry('global', { name: '雨', keys: ['雨'], content: 'global lore', enabled: true, constant: true });
  await flushMomentsPersist();
  await flushWorldbookPersist();
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  window.__echoIds = { a: a.roleId, b: b.roleId, chatA: a.id, bookA: bookA.id };
  window.EchoApp.view = 'app';
  store.setActiveTab('moments');
  window.EchoApp.render();
  return window.__echoIds;
})())()`;

const CHECK = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { listMoments } = await import('/src/domain/moments.js');
  const { getBookForCharacter, loadWorldbook, buildWorldbookBlock, updateEntry } = await import('/src/domain/worldbook.js');
  const { store } = await import('/src/core/store.js');
  const ids = window.__echoIds;
  const moments = listMoments(ids.a);
  const book = getBookForCharacter(ids.a);
  const other = getBookForCharacter(ids.b);
  const chatA = store.getState().chats.find((c) => c.roleId === ids.a);
  const chatB = store.getState().chats.find((c) => c.roleId === ids.b);
  const blockB = buildWorldbookBlock(chatB, [], ids.b, '岑');
  return {
    momentCount: moments.length,
    cafe: moments.some((m) => /咖啡馆/.test(m.content)),
    bookContent: (book?.entries || []).map((e) => e.content),
    otherHasA: !!(other && other.entries.some((e) => e.content === 'A-only lore')),
    global: (loadWorldbook().books.find((b) => b.id === 'global')?.entries || []).some((e) => e.content === 'global lore'),
    bHasA: !!(blockB && blockB.includes('A-only lore')),
    hasChatA: !!chatA,
  };
})())()`;

const EDIT = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { getBookForCharacter, updateEntry, flushWorldbookPersist } = await import('/src/domain/worldbook.js');
  const ids = window.__echoIds;
  const book = getBookForCharacter(ids.a);
  const e = book.entries.find((x) => x.content === 'A-only lore' || x.content === 'A-only lore v2');
  updateEntry(book.id, e.id, { content: 'A-only lore v2' });
  await flushWorldbookPersist();
  return true;
})())()`;

const DELETE_WB = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { getBookForCharacter, deleteEntry, flushWorldbookPersist } = await import('/src/domain/worldbook.js');
  const ids = window.__echoIds;
  const book = getBookForCharacter(ids.a);
  const e = (book.entries || [])[0];
  if (e) deleteEntry(book.id, e.id);
  await flushWorldbookPersist();
  return (getBookForCharacter(ids.a)?.entries || []).length;
})())()`;

const DELETE_REL = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { deleteConversation } = await import('/src/domain/conversation.js');
  const { listMoments, flushMomentsPersist } = await import('/src/domain/moments.js');
  const ids = window.__echoIds;
  await deleteConversation(ids.chatA);
  await flushMomentsPersist();
  const left = listMoments(ids.a);
  return { count: left.length, hasRole: left.some((m) => /角色级/.test(m.content)), hasChat: left.some((m) => /咖啡馆/.test(m.content)) };
})())()`;

const BACKUP_RESET = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { exportProductBackup, importProductBackup, resetProductData } = await import('/src/domain/backup.js');
  const { listMoments, hydrateMoments, resetMomentsRuntime, flushMomentsPersist } = await import('/src/domain/moments.js');
  const { loadWorldbook, hydrateWorldbook, resetWorldbookRuntime, flushWorldbookPersist } = await import('/src/domain/worldbook.js');
  const blob = await exportProductBackup();
  await resetProductData();
  resetMomentsRuntime();
  resetWorldbookRuntime();
  await hydrateMoments();
  await hydrateWorldbook();
  const afterReset = listMoments().length;
  await importProductBackup(blob, 'replace');
  await flushMomentsPersist();
  await flushWorldbookPersist();
  const afterRestore = listMoments().length;
  const hasGlobal = (loadWorldbook().books.find((b) => b.id === 'global')?.entries || []).some((e) => /global lore/.test(e.content));
  await resetProductData();
  resetMomentsRuntime();
  resetWorldbookRuntime();
  await hydrateMoments();
  await hydrateWorldbook();
  return { afterReset, afterRestore, hasGlobal, afterSecondReset: listMoments().length };
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
  record("seed character / moment / worldbook", ids?.a && ids?.b ? "PASS" : "FAIL", JSON.stringify(ids));
  await evalExpr(send, `window.__echoIds = ${JSON.stringify(ids)}`);

  await send("Page.reload", { ignoreCache: true });
  await waitApp(send);
  await evalExpr(send, `window.__echoIds = ${JSON.stringify(ids)}`);
  const afterReload = await evalExpr(send, CHECK);
  record("reload keeps moments", afterReload.cafe && afterReload.momentCount >= 2 ? "PASS" : "FAIL", JSON.stringify(afterReload));
  record("reload keeps character worldbook", (afterReload.bookContent || []).includes("A-only lore") ? "PASS" : "FAIL");
  record("reload keeps global worldbook", afterReload.global ? "PASS" : "FAIL");
  record("character isolation", !afterReload.otherHasA && !afterReload.bHasA ? "PASS" : "FAIL");

  await evalExpr(send, EDIT);
  await send("Page.reload", { ignoreCache: true });
  await waitApp(send);
  await evalExpr(send, `window.__echoIds = ${JSON.stringify(ids)}`);
  const afterEdit = await evalExpr(send, CHECK);
  record("edit worldbook survives reload", (afterEdit.bookContent || []).includes("A-only lore v2") ? "PASS" : "FAIL", JSON.stringify(afterEdit.bookContent));

  const leftEntries = await evalExpr(send, DELETE_WB);
  record("delete worldbook entry", leftEntries === 0 ? "PASS" : "FAIL", String(leftEntries));

  const rel = await evalExpr(send, DELETE_REL);
  record("delete relationship/conversation moments", rel.count === 1 && rel.hasRole && !rel.hasChat ? "PASS" : "FAIL", JSON.stringify(rel));

  const br = await evalExpr(send, BACKUP_RESET);
  record("reset clears moments", br.afterReset === 0 ? "PASS" : "FAIL", JSON.stringify(br));
  record("restore brings moments back", br.afterRestore >= 1 ? "PASS" : "FAIL");
  record("second reset does not resurrect", br.afterSecondReset === 0 ? "PASS" : "FAIL");

  ws.close();
} catch (e) {
  record("browser harness", "FAIL", e.message);
} finally {
  chrome.kill();
  server.kill();
}

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n==== STORAGE LIFECYCLE ====`);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
