/**
 * Provider + chat lifecycle in a real browser with a mock fetch.
 * Usage: node scripts/provider_lifecycle_verify.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9488);
const HTTP_PORT = Number(process.env.APP_PORT || 8888);
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
const USER_DATA = join(tmpdir(), `echochat-provider-${Date.now()}`);
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

const INSTALL_MOCK = `(() => {
  window.__echoFetches = [];
  window.__echoFetchMode = 'ok';
  const enc = new TextEncoder();
  function sse(text) {
    const payload = JSON.stringify({ choices: [{ delta: { content: text } }] });
    return enc.encode('data: ' + payload + '\\n\\ndata: [DONE]\\n\\n');
  }
  window.fetch = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : {};
    window.__echoFetches.push({ url: String(url), model: body.model || '' });
    if (window.__echoFetchMode === '401') {
      return { ok: false, status: 401, headers: { get: () => null }, text: async () => JSON.stringify({ error: { message: 'bad' } }) };
    }
    if (window.__echoFetchMode === 'hang') {
      return await new Promise((_, reject) => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        if (opts.signal?.aborted) { reject(err); return; }
        opts.signal?.addEventListener('abort', () => reject(err));
      });
    }
    const bytes = sse('我在。');
    let sent = false;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader() {
          return {
            async read() {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: bytes };
            },
            cancel: async () => {},
          };
        },
      },
    };
  };
  return true;
})()`;

const SEED = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { store } = await import('/src/core/store.js');
  const { createFromTemplate } = await import('/src/domain/persona.js');
  const { setReplyPaceForCharacter } = await import('/src/domain/reply-pace.js');
  const { sendMessage } = await import('/src/domain/chat.js');
  const { storage, KEYS } = await import('/src/core/storage.js');
  store.updateSettings({ apiKey: 'sk-test-key', baseUrl: 'https://api.example.com/v1', model: 'mock-a' });
  const chat = await createFromTemplate({ name: '林夏', persona: '温和', firstMessage: '先打个招呼。' });
  setReplyPaceForCharacter(chat.roleId, 'instant');
  store.selectChat(chat.id);
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  window.EchoApp.view = 'app';
  window.EchoApp.render();
  await sendMessage('你好呀');
  const { messageStore } = await import('/src/domain/message-store.js');
  const msgs = messageStore.peekMessages(chat.id);
  return {
    chatId: chat.id,
    sending: (await import('/src/domain/chat.js')).isSending(),
    hasUser: msgs.some((m) => m.role === 'me' && m.text === '你好呀'),
    hasAssistant: msgs.some((m) => m.role === 'her' && m.text === '我在。'),
    model: window.__echoFetches.slice(-1)[0]?.model || '',
  };
})())()`;

const AFTER_RELOAD = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { messageStore } = await import('/src/domain/message-store.js');
  const { store } = await import('/src/core/store.js');
  const ids = window.__echoIds;
  await messageStore.hydrateChat(ids.chatId);
  const msgs = messageStore.peekMessages(ids.chatId);
  const { exportProductBackup } = await import('/src/domain/backup.js');
  const blob = await exportProductBackup();
  return {
    hasUser: msgs.some((m) => m.role === 'me' && m.text === '你好呀'),
    hasAssistant: msgs.some((m) => m.role === 'her' && m.text === '我在。'),
    streaming: msgs.filter((m) => m.status === 'streaming').length,
    keyInBackup: JSON.stringify(blob).includes('sk-test-key'),
    app: !!window.EchoApp,
    current: store.getState().currentChatId === ids.chatId,
  };
})())()`;

const FAIL_AND_ABORT = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { store } = await import('/src/core/store.js');
  const { sendMessage, stopGeneration, isSending } = await import('/src/domain/chat.js');
  const { messageStore } = await import('/src/domain/message-store.js');
  const { setReplyPaceForCharacter } = await import('/src/domain/reply-pace.js');
  const ids = window.__echoIds;
  store.selectChat(ids.chatId);
  const chat = store.getCurrentChat();
  setReplyPaceForCharacter(chat.roleId, 'instant');
  window.__echoFetchMode = '401';
  await sendMessage('失败这句');
  const afterFail = messageStore.peekMessages(ids.chatId);
  const failKept = afterFail.some((m) => m.role === 'me' && m.text === '失败这句');
  const sendingAfterFail = isSending();
  window.__echoFetchMode = 'hang';
  const pending = sendMessage('中止这句');
  await new Promise((r) => setTimeout(r, 40));
  stopGeneration();
  await pending;
  const sendingAfterAbort = isSending();
  window.__echoFetchMode = 'ok';
  store.updateSettings({ model: 'mock-b' });
  await sendMessage('再发一句');
  const afterOk = messageStore.peekMessages(ids.chatId);
  return {
    failKept,
    sendingAfterFail,
    sendingAfterAbort,
    abortUser: afterOk.some((m) => m.role === 'me' && m.text === '中止这句'),
    nextOk: afterOk.some((m) => m.role === 'me' && m.text === '再发一句') && afterOk.some((m) => m.text === '我在。'),
    lastModel: window.__echoFetches.slice(-1)[0]?.model || '',
    app: !!window.EchoApp,
  };
})())()`;

const INVALID = `(() => (async () => {
  const { store } = await import('/src/core/store.js');
  const { streamChat } = await import('/src/domain/provider.js');
  store.updateSettings({ apiKey: '', baseUrl: '', model: '' });
  let kind = '';
  try {
    await streamChat({ id: 'x' }, [{ role: 'user', content: 'hi' }]);
  } catch (e) {
    kind = e.kind || e.name || 'threw';
  }
  return { kind, app: !!window.EchoApp };
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
  await evalExpr(send, INSTALL_MOCK);

  const seeded = await evalExpr(send, SEED);
  record("normal stream complete", seeded.hasUser && seeded.hasAssistant && seeded.sending === false ? "PASS" : "FAIL", JSON.stringify(seeded));
  await evalExpr(send, `window.__echoIds = ${JSON.stringify({ chatId: seeded.chatId })}`);
  record("first request used configured model", seeded.model === "mock-a" ? "PASS" : "FAIL", seeded.model);

  await send("Page.reload", { ignoreCache: true });
  await waitApp(send);
  await evalExpr(send, `window.__echoIds = ${JSON.stringify({ chatId: seeded.chatId })}`);
  const reloaded = await evalExpr(send, AFTER_RELOAD);
  record("reload keeps messages", reloaded.hasUser && reloaded.hasAssistant && reloaded.streaming === 0 ? "PASS" : "FAIL", JSON.stringify(reloaded));
  record("backup omits api key", reloaded.keyInBackup === false ? "PASS" : "FAIL");

  await evalExpr(send, INSTALL_MOCK);
  const rest = await evalExpr(send, FAIL_AND_ABORT);
  record("provider failure keeps user", rest.failKept && rest.sendingAfterFail === false ? "PASS" : "FAIL", JSON.stringify(rest));
  record("abort recovers and can send again", rest.sendingAfterAbort === false && rest.abortUser && rest.nextOk ? "PASS" : "FAIL");
  record("model switch used next request", rest.lastModel === "mock-b" ? "PASS" : "FAIL", rest.lastModel);

  const invalid = await evalExpr(send, INVALID);
  record("invalid config errors without crashing", invalid.kind === "invalid_request" && invalid.app ? "PASS" : "FAIL", JSON.stringify(invalid));

  ws.close();
} catch (e) {
  record("browser harness", "FAIL", e.message);
} finally {
  chrome.kill();
  server.kill();
}

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n==== PROVIDER LIFECYCLE ====`);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
