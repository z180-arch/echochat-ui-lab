/**
 * Wave 2 chat transcript checks at 390 and 1440. Isolated Chrome profile.
 * Usage: node scripts/wave2_ui_verify.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9419);
const HTTP_PORT = Number(process.env.APP_PORT || 8799);
const BASE = `http://127.0.0.1:${HTTP_PORT}/`;
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA = `${process.env.TEMP}\\echochat-wave2-${Date.now()}`;
const OUT = join(ROOT, ".tmp-shots");
const LONG_CJK = "这是一段很长的中文回复，用来确认气泡会正常换行而不会把页面撑出横向滚动。".repeat(4);

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
  const ws = new WebSocket(wsUrl);
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
  const { addMemory, retrieveMemoriesForTurn, noteRetrieveChat } = await import('/src/domain/memory.js');
  store.reset();
  store.updateSettings({ apiKey: 'sk-test-key', baseUrl: 'https://api.example.com/v1', model: 'x' });
  const chat = await createFromTemplate({ name: '林晚', persona: '温柔的咖啡店员', firstMessage: '第一段' });
  await messageStore.addMessage(chat.id, { role: 'her', text: '第二段', status: 'sent' });
  await messageStore.addMessage(chat.id, { role: 'me', text: '我在听', status: 'sent' });
  await messageStore.addMessage(chat.id, { role: 'her', text: ${JSON.stringify(LONG_CJK)}, status: 'sent' });
  await messageStore.addMessage(chat.id, { role: 'me', text: '没发出的那句', status: 'sent' });
  await messageStore.addMessage(chat.id, { role: 'her', text: '', status: 'error' });
  addMemory(chat.roleId, '喜欢美式咖啡', 8, 'manual');
  noteRetrieveChat(chat.id);
  retrieveMemoriesForTurn(chat.roleId, '美式咖啡');
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  window.EchoApp.view = 'app';
  window.EchoApp.render();
  return { chatId: chat.id, roleId: chat.roleId };
})())()`;

const PROBE = `(() => {
  const rows = [...document.querySelectorAll('.msg')];
  const detail = rows.map((el) => {
    const r = el.getBoundingClientRect();
    const more = el.querySelector('.msg-more-btn')?.getBoundingClientRect();
    const bubble = el.querySelector('.msg-bubble')?.getBoundingClientRect();
    return {
      me: el.classList.contains('msg-me'),
      her: el.classList.contains('msg-her'),
      error: el.classList.contains('msg-error'),
      start: el.classList.contains('msg-group-start'),
      cont: el.classList.contains('msg-group-cont'),
      end: el.classList.contains('msg-group-end'),
      avatar: !!el.querySelector('.msg-avatar-btn'),
      slot: !!el.querySelector('.msg-avatar-slot'),
      name: (el.querySelector('.msg-name')?.textContent || '').trim(),
      time: (el.querySelector('.msg-time')?.textContent || '').trim(),
      retry: !!el.querySelector('.msg-retry-btn'),
      status: (el.querySelector('.msg-status')?.textContent || '').replace(/\\s+/g, ' ').trim(),
      left: Math.round(r.left),
      bubbleLeft: bubble ? Math.round(bubble.left) : null,
      moreW: more ? Math.round(more.width) : 0,
      moreH: more ? Math.round(more.height) : 0,
      bubbleText: (el.querySelector('.msg-bubble')?.innerText || '').slice(0, 12),
    };
  });
  const hers = detail.filter((d) => d.her && !d.error);
  const firstHer = hers[0];
  const secondHer = hers[1];
  const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
  const composer = !!document.getElementById('chat-input');
  const composerBottom = document.querySelector('.chat-input-area')?.getBoundingClientRect()?.bottom;
  const recall = document.querySelector('.recall-chip');
  return {
    count: rows.length,
    detail,
    groupedAi: !!(firstHer?.avatar && firstHer?.name && !firstHer?.time && secondHer && !secondHer.avatar && secondHer.slot && !secondHer.name && secondHer.time),
    userQuiet: detail.filter((d) => d.me).every((d) => !d.avatar && !d.slot && !d.name),
    errorInline: detail.some((d) => d.error && d.retry && d.status.includes('没发出去')),
    more44: detail.every((d) => d.moreW >= 44 && d.moreH >= 44),
    recallStrip: !!(recall && !recall.classList.contains('msg') && /想起了/.test(recall.textContent || '')),
    composingHeader: !/正在整理思绪/.test(document.querySelector('.chat-messages')?.innerText || ''),
    headerStatus: document.querySelector('.chat-header-status')?.innerText || '',
    overflowX,
    composer,
    composerVisible: composerBottom != null && composerBottom <= window.innerHeight + 2,
    longCjk: detail.some((d) => (d.bubbleText || '').length >= 8),
  };
})()`;

async function run(send, label, width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await send("Page.navigate", { url: `${BASE}?w2=${Date.now()}` });
  for (let i = 0; i < 50; i++) {
    if (await evalExpr(send, "!!window.EchoApp")) break;
    await sleep(200);
  }
  await evalExpr(send, `window.EchoApp._storageReady || Promise.resolve()`);
  await evalExpr(send, SEED);
  await sleep(500);
  const probe = await evalExpr(send, PROBE);
  record(`${label} · grouping AI`, probe.groupedAi ? "PASS" : "FAIL", JSON.stringify(probe.detail.slice(0, 4)));
  record(`${label} · user quiet`, probe.userQuiet ? "PASS" : "FAIL");
  record(`${label} · failed retry inline`, probe.errorInline ? "PASS" : "FAIL");
  record(`${label} · more 44px`, probe.more44 ? "PASS" : "FAIL", JSON.stringify(probe.detail.map((d) => [d.moreW, d.moreH])));
  record(`${label} · recall strip`, probe.recallStrip ? "PASS" : "FAIL");
  record(`${label} · no transcript loading`, probe.composingHeader ? "PASS" : "FAIL", probe.headerStatus);
  record(`${label} · long CJK no overflow`, !probe.overflowX && probe.longCjk ? "PASS" : "FAIL", `overflow=${probe.overflowX}`);
  record(`${label} · composer`, probe.composer && probe.composerVisible ? "PASS" : "FAIL");

  const first = await evalExpr(send, `document.querySelector('.msg-her .msg-bubble')`);
  if (first) {
    const before = await evalExpr(
      send,
      `(()=>{const b=document.querySelector('.msg-her .msg-bubble'); const r=b.getBoundingClientRect(); return {w:Math.round(r.width), left:Math.round(r.left)};})()`
    );
    await evalExpr(send, `document.querySelector('.msg-her')?.classList.add('show-actions'); true`);
    const after = await evalExpr(
      send,
      `(()=>{const b=document.querySelector('.msg-her .msg-bubble'); const r=b.getBoundingClientRect(); return {w:Math.round(r.width), left:Math.round(r.left)};})()`
    );
    record(
      `${label} · action no bubble shift`,
      before.w === after.w && before.left === after.left ? "PASS" : "FAIL",
      JSON.stringify({ before, after })
    );
    await evalExpr(send, `document.querySelector('.msg-her')?.classList.remove('show-actions'); true`);
  } else {
    record(`${label} · action no bubble shift`, "FAIL", "no bubble");
  }

  await evalExpr(send, `document.querySelector('.msg-more-btn')?.click(); true`);
  const opened = await evalExpr(send, `!!document.querySelector('.msg.show-actions .msg-actions')`);
  record(`${label} · more click`, opened ? "PASS" : "FAIL");

  await evalExpr(
    send,
    `(()=>{const msg=document.querySelector('.msg'); msg.dispatchEvent(new Event('touchstart', {bubbles:true})); return true})()`
  );
  await sleep(560);
  const longPress = await evalExpr(send, `!!document.querySelector('.msg.show-actions')`);
  record(`${label} · long press`, longPress ? "PASS" : "FAIL");

  await shot(send, `${label}-chat`);
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
  await run(send, "1440", 1440, 900, false);
  await run(send, "390", 390, 844, true);
  ws.close();
} finally {
  chrome.kill();
  server.kill();
}

const fails = results.filter((r) => r.status !== "PASS");
console.log("\n==== WAVE 2 BROWSER ====");
console.log(`${results.length - fails.length}/${results.length} passed`);
if (fails.length) process.exit(1);
