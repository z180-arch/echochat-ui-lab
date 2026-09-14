/**
 * STT dictation + conversation thread titles in a real browser.
 * Usage: node scripts/stt_conversation_verify.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9492);
const HTTP_PORT = Number(process.env.APP_PORT || 8892);
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
const USER_DATA = join(tmpdir(), `echochat-stt-conv-${Date.now()}`);
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
  const { storage, KEYS } = await import('/src/core/storage.js');
  const { store } = await import('/src/core/store.js');
  const a = await createFromTemplate({ name: '林夏', persona: '温和', firstMessage: '我在。' });
  store.updateSettings({ sttEnabled: true });
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  window.EchoApp.view = 'app';
  store.setActiveTab('messages');
  window.EchoApp.render();
  return { roleId: a.roleId, chatId: a.id };
})())()`;

const STT = `(() => {
  class FakeSpeechRecognition {
    constructor() {
      this.lang = '';
      this.interimResults = true;
      this.continuous = false;
      this.maxAlternatives = 1;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      window.__echoRec = this;
    }
    start() { window.__echoSttStarted = true; }
    stop() { this.onend && this.onend(); }
    abort() {}
  }
  window.SpeechRecognition = FakeSpeechRecognition;
  window.webkitSpeechRecognition = FakeSpeechRecognition;
  window.__echoSttStarted = false;
  const input = document.getElementById('chat-input');
  if (input) input.value = '';
  window.EchoApp.toggleSTT();
  const rec = window.__echoRec;
  rec.onresult({
    resultIndex: 0,
    results: [{ 0: { transcript: '你好呀', isFinal: true }, isFinal: true, length: 1 }],
  });
  const after = document.getElementById('chat-input')?.value || '';
  const mic = document.querySelector('.chat-mic-btn');
  return {
    started: !!window.__echoSttStarted,
    text: after,
    hasMic: !!mic,
    chip: !!document.querySelector('.chip-btn'),
  };
})()`;

const THREAD = `(() => (async () => {
  const { startConversationForCharacter, listActiveConversations } = await import('/src/domain/character-hub.js');
  const { getThreadTitle, renameConversation } = await import('/src/domain/conversation.js');
  const { store } = await import('/src/core/store.js');
  const ids = window.__echoIds;
  const next = await startConversationForCharacter(ids.roleId);
  const first = store.getState().chats.find((c) => c.id === ids.chatId);
  const okRename = renameConversation(next.id, '雨夜便利店');
  const updated = store.getState().chats.find((c) => c.id === next.id);
  const list = listActiveConversations(ids.roleId);
  window.EchoApp.render();
  return {
    nextName: next.name,
    nextTitle: next.config.threadTitle,
    firstTitle: getThreadTitle(first),
    renamed: updated.config.threadTitle,
    nameUnchanged: updated.name === '林夏',
    okRename,
    count: list.length,
    hint: (document.querySelector('.conv-hint')?.textContent || '').trim(),
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
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: `${BASE}?c=${Date.now()}` });
  await waitApp(send);

  const ids = await evalExpr(send, SEED);
  record("seed chat", ids?.roleId && ids?.chatId ? "PASS" : "FAIL", JSON.stringify(ids));
  await evalExpr(send, `window.__echoIds = ${JSON.stringify(ids)}`);

  const stt = await evalExpr(send, STT);
  record("stt fills composer", stt.started && stt.text === "你好呀" && stt.hasMic ? "PASS" : "FAIL", JSON.stringify(stt));
  record("thread chip visible on first chat", stt.chip ? "PASS" : "FAIL");

  const th = await evalExpr(send, THREAD);
  record(
    "new thread keeps character name",
    th.nextName === "林夏" && th.nextTitle === "相处线 2" && th.firstTitle === "日常相处" ? "PASS" : "FAIL",
    JSON.stringify(th)
  );
  record(
    "rename threadTitle",
    th.okRename && th.renamed === "雨夜便利店" && th.nameUnchanged ? "PASS" : "FAIL",
    JSON.stringify(th)
  );
  record("thread hint after second line", th.count === 2 && /雨夜便利店/.test(th.hint) ? "PASS" : "FAIL", JSON.stringify(th));

  ws.close();
} catch (e) {
  record("browser harness", "FAIL", e.message);
} finally {
  chrome.kill();
  server.kill();
}

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n==== STT + CONVERSATION ====`);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
