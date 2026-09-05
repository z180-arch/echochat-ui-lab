/**
 * One-shot Dexie read/write timing in the running app (CDP).
 * Assumes python http.server 8765. Fresh profile.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CDP_PORT = 9335;
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA = `${process.env.TEMP}\\echochat-batch1-perf-${Date.now()}`;
const BASE = `http://127.0.0.1:8765/app/?perf=${Date.now()}`;

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
  return {
    send(method, params = {}) {
      const id = nextId++;
      const p = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      ws.send(JSON.stringify({ id, method, params }));
      return p;
    },
  };
}

async function evalExpr(send, expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval");
  return r.result?.value;
}

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${CDP_PORT}`,
  "--disable-gpu",
  "--no-first-run",
  `--user-data-dir=${USER_DATA}`,
  "about:blank",
], { stdio: "ignore", detached: true });
chrome.unref();

try {
  let version;
  for (let i = 0; i < 40; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
      break;
    } catch { await sleep(250); }
  }
  const browser = await cdpConnect(version.webSocketDebuggerUrl);
  const { targetId } = await browser.send("Target.createTarget", { url: BASE });
  await sleep(400);
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = targets.find((t) => t.id === targetId);
  const session = await cdpConnect(page.webSocketDebuggerUrl);
  await session.send("Runtime.enable");
  await session.send("Page.enable");
  await sleep(1500);
  for (let i = 0; i < 20; i++) {
    const ok = await evalExpr(session.send, `!!window.EchoApp`);
    if (ok) break;
    await sleep(250);
  }
  const out = await evalExpr(session.send, `(async () => {
    const { dexieAdapter } = await import('/src/infrastructure/dexie-adapter.js');
    const sizes = [100, 500, 1000];
    const rows = [];
    for (const n of sizes) {
      const chatId = 'perf-' + n + '-' + Date.now();
      const msgs = Array.from({ length: n }, (_, i) => ({
        id: chatId + '-m' + i,
        conversationId: chatId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'perf ' + i,
        createdAt: Date.now() + i,
        status: 'sent'
      }));
      const t0 = performance.now();
      await dexieAdapter.message.bulkCreate(msgs);
      const insertMs = performance.now() - t0;
      const t1 = performance.now();
      const page = await dexieAdapter.message.findByConversationId(chatId, { page: 1, pageSize: n });
      const readAllMs = performance.now() - t1;
      const t2 = performance.now();
      const p50 = await dexieAdapter.message.findByConversationId(chatId, { page: 1, pageSize: 50 });
      const pageMs = performance.now() - t2;
      rows.push({ n, insertMs, readAllMs, pageMs, got: page.items.length, pageGot: p50.items.length });
    }
    return JSON.stringify(rows);
  })()`);
  console.log(out);
} finally {
  try { spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
}
