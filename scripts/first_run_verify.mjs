/**
 * First-run empty states, create character, memory/moments cues.
 * Usage: node scripts/first_run_verify.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9496);
const HTTP_PORT = Number(process.env.APP_PORT || 8896);
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
const USER_DATA = join(tmpdir(), `echochat-first-run-${Date.now()}`);
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
  const exceptions = [];
  const logs = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    if (msg.method === "Runtime.exceptionThrown") {
      exceptions.push(msg.params?.exceptionDetails?.exception?.description || JSON.stringify(msg.params));
    }
    if (msg.method === "Runtime.consoleAPICalled") {
      logs.push((msg.params?.args || []).map((a) => a.value || a.description || "").join(" "));
    }
    if (msg.method === "Network.loadingFailed") {
      logs.push("NETFAIL " + JSON.stringify(msg.params));
    }
    if (msg.method === "Network.responseReceived" && msg.params?.response?.status >= 400) {
      logs.push("HTTP " + msg.params.response.status + " " + msg.params.response.url);
    }
  });
  const send = (method, params = {}) => {
    const id = nextId++;
    const p = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    ws.send(JSON.stringify({ id, method, params }));
    return p;
  };
  send._exceptions = exceptions;
  send._logs = logs;
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
  const diag = await evalExpr(
    send,
    `({
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      htmlLen: document.documentElement ? document.documentElement.outerHTML.length : 0,
      errors: window.__errors || [],
      pre: (document.querySelector('pre')||{}).textContent || '',
      hasApp: !!window.EchoApp,
      scripts: [...document.scripts].map((s) => s.src || s.getAttribute('src') || s.type),
      bodyHtml: (document.body && document.body.innerHTML || '').slice(0, 280),
      body: (document.body && document.body.innerText || '').slice(0, 400),
      resources: performance.getEntriesByType('resource').map((e) => e.name + ':' + e.responseStatus).slice(0, 30)
    })`
  );
  throw new Error(
    "EchoApp not ready " +
      JSON.stringify({
        ...diag,
        exceptions: send._exceptions || [],
        logs: (send._logs || []).slice(0, 20),
      })
  );
}

const LANDING = `(() => {
  const cta = (document.querySelector('.welcome-cta')?.textContent || '').trim();
  const ghost = [...document.querySelectorAll('.welcome-actions .btn')].map((b) => (b.textContent || '').trim());
  return {
    landing: !!document.querySelector('.landing'),
    cta,
    ghost,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
  };
})()`;

const AFTER_EMPTY = `(() => {
  const overlay = document.querySelector('.modal-overlay');
  const title = (overlay?.querySelector('.modal-title')?.textContent || '').trim();
  return { bringOpen: !!overlay && title === '把 TA 带进来' };
})()`;

const CREATE = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  const { createFromTemplate } = await import('/src/domain/persona.js');
  const { storage, KEYS } = await import('/src/core/storage.js');
  document.querySelectorAll('.modal-overlay').forEach((m) => m.remove());
  const chat = await createFromTemplate({ name: '林夏', persona: '温和', firstMessage: '' });
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  window.EchoApp.view = 'app';
  window.EchoApp.render();
  return { roleId: chat.roleId, chatId: chat.id };
})())()`;

const EMPTY_CHAT = `(() => {
  const starters = [...document.querySelectorAll('.chat-starters .chip-btn')].map((b) => (b.textContent || '').trim());
  const empty = (document.querySelector('.chat-empty-t')?.textContent || '').trim();
  const thread = !!document.querySelector('.chat-header-actions .chip-btn');
  const input = document.getElementById('chat-input');
  return {
    empty,
    starters,
    threadChip: thread,
    hasInput: !!input,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
  };
})()`;

const FILL = `(() => {
  window.EchoApp.fillComposer('你好，今天过得怎么样');
  return document.getElementById('chat-input')?.value || '';
})()`;

const MEMORY = `(() => (async () => {
  const { quietRememberUserText } = await import('/src/domain/memory-candidates.js');
  const { addMoment } = await import('/src/domain/moments.js');
  const { recordChatTurn, getAffinity } = await import('/src/domain/relations.js');
  const { messageStore } = await import('/src/domain/message-store.js');
  const ids = window.__echoIds;
  await messageStore.addMessage(ids.chatId, { role: 'me', text: '我最近开始学习摄影', status: 'sent' });
  const kept = quietRememberUserText(ids.roleId, '我最近开始学习摄影');
  recordChatTurn(ids.roleId, '林夏');
  addMoment({ roleId: ids.roleId, roleName: '林夏', content: '一起去了咖啡馆', source: 'manual' });
  window.EchoApp.render();
  const aff = getAffinity(ids.roleId);
  const keptMark = !!document.querySelector('.msg-kept');
  const meet = (document.querySelector('.recall-chip')?.textContent || '').trim();
  window.EchoApp.openContinuitySheet(ids.roleId, ids.chatId);
  const sheet = (document.querySelector('.modal-title')?.textContent || '').trim();
  const lead = (document.querySelector('.modal-body .recon-lead')?.textContent || '').trim();
  document.querySelectorAll('.modal-overlay').forEach((m) => m.remove());
  window.EchoApp.switchTab('moments');
  const momentsTitle = (document.querySelector('.moments-pane .list-title')?.textContent || '').trim();
  const momentCard = (document.querySelector('.moment-content')?.textContent || '').trim();
  window.EchoApp.switchTab('companion');
  window.EchoApp.toggleProfile();
  const peek = (document.querySelector('.profile-together .profile-peek, .profile-together')?.innerText || '').trim();
  const you = (document.querySelector('.profile-you')?.innerText || '').trim();
  return {
    kept: !!kept,
    keptMark,
    meet,
    turns: aff.turns,
    sheet,
    leadHasNotChat: /不是聊天记录/.test(lead),
    momentsTitle,
    momentCard,
    peek,
    peekHasMoment: /咖啡馆/.test(peek),
    peekHasMemory: /摄影/.test(peek),
    memMeta: you,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
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
    "--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND,MAP fonts.gstatic.com ~NOTFOUND",
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
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*fonts.googleapis.com*", "*fonts.gstatic.com*"] });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: `${BASE}?c=${Date.now()}` });
  await sleep(1500);
  await waitApp(send);

  const land = await evalExpr(send, LANDING);
  record("landing cta", land.landing && land.cta === "把 TA 带进来" && !land.ghost.includes("开始聊天") && !land.overflowX ? "PASS" : "FAIL", JSON.stringify(land));

  await evalExpr(send, `window.EchoApp.enterAppEmpty(); true`);
  await sleep(450);
  const after = await evalExpr(send, AFTER_EMPTY);
  record("empty start opens create", after.bringOpen ? "PASS" : "FAIL", JSON.stringify(after));

  const ids = await evalExpr(send, CREATE);
  record("create first character", ids?.roleId && ids?.chatId ? "PASS" : "FAIL", JSON.stringify(ids));
  await evalExpr(send, `window.__echoIds = ${JSON.stringify(ids)}`);

  const chat = await evalExpr(send, EMPTY_CHAT);
  record(
    "empty chat starters",
    /还没有和/.test(chat.empty) && chat.starters.length >= 2 && chat.hasInput && !chat.threadChip && !chat.overflowX
      ? "PASS"
      : "FAIL",
    JSON.stringify(chat)
  );

  const filled = await evalExpr(send, FILL);
  record("starter fills composer", filled === "你好，今天过得怎么样" ? "PASS" : "FAIL", filled);

  const mem = await evalExpr(send, MEMORY);
  record("quiet remember kept", mem.kept && mem.keptMark ? "PASS" : "FAIL", JSON.stringify(mem));
  record("first-meet chip", /刚刚认识/.test(mem.meet) ? "PASS" : "FAIL", mem.meet);
  record("continuity not chat log", mem.sheet === "记忆与痕迹" && mem.leadHasNotChat ? "PASS" : "FAIL", JSON.stringify(mem));
  record("moment visible in traces", mem.momentsTitle === "我们" && /咖啡馆/.test(mem.momentCard) ? "PASS" : "FAIL", JSON.stringify(mem));
  record(
    "traces peek is not memory",
    mem.peekHasMoment && !mem.peekHasMemory && /关于你/.test(mem.memMeta) ? "PASS" : "FAIL",
    JSON.stringify({ peek: mem.peek, memMeta: mem.memMeta })
  );
  record("mobile no overflow", !mem.overflowX ? "PASS" : "FAIL");

  ws.close();
} catch (e) {
  record("browser harness", "FAIL", e.message);
} finally {
  chrome.kill();
  server.kill();
}

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n==== FIRST RUN ====`);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
