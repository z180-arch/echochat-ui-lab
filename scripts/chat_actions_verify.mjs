/**
 * Chat operations in the real shell: send, retry, regenerate, edit, delete, copy, stop, switch.
 * Usage: node scripts/chat_actions_verify.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9448);
const HTTP_PORT = Number(process.env.APP_PORT || 8848);
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
const USER_DATA = join(tmpdir(), `echochat-chat-actions-${Date.now()}`);
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

const FLOW = `(() => (async () => {
  await (window.EchoApp._storageReady || Promise.resolve());
  window.__copied = '';
  try {
    navigator.clipboard.writeText = async (t) => { window.__copied = String(t); };
  } catch {}
  const { createFromTemplate } = await import('/src/domain/persona.js');
  const { storage, KEYS } = await import('/src/core/storage.js');
  const { store } = await import('/src/core/store.js');
  const chatMod = await import('/src/domain/chat.js');
  const { messageStore } = await import('/src/domain/message-store.js');
  const { createConversationForCharacter } = await import('/src/domain/conversation.js');
  const { setReplyPaceForCharacter } = await import('/src/domain/reply-pace.js');
  store.reset();
  store.updateSettings({ apiKey: 'sk-test-key', baseUrl: 'https://api.example.com/v1', model: 'x' });
  const chat = await createFromTemplate({ name: '林晚', persona: 'p', firstMessage: '' });
  setReplyPaceForCharacter(chat.roleId, 'instant');
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  window.__chatFetchMode = 'ok';
  window.__chatFetchText = '第一回复';
  const orig = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/chat/completions')) {
      if (window.__chatFetchMode === 'hang') {
        return new Promise((_, reject) => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          if (opts?.signal?.aborted) { reject(err); return; }
          opts?.signal?.addEventListener('abort', () => reject(err), { once: true });
        });
      }
      if (window.__chatFetchMode === 'error') {
        return new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 });
      }
      const text = window.__chatFetchText ?? 'ok';
      const body = 'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\\n\\ndata: [DONE]\\n\\n';
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return orig(url, opts);
  };
  window.EchoApp.view = 'app';
  window.EchoApp.render();

  await chatMod.sendMessage('第一句');
  const afterSend = messageStore.peekMessages(chat.id);
  const her1 = afterSend.filter((m) => m.role === 'her').pop();

  window.__chatFetchText = '第二回复';
  const her1Idx = afterSend.findIndex((m) => m.id === her1.id);
  await chatMod.regenerate(her1Idx);
  const afterRegen = messageStore.peekMessages(chat.id);
  const her2 = afterRegen.filter((m) => m.role === 'her').pop();

  window.__chatFetchMode = 'error';
  await chatMod.sendMessage('失败这句');
  window.EchoApp.render();
  const errStatus = (document.querySelector('.msg-status')?.textContent || '').trim();
  const retryBtn = !!document.querySelector('.msg-retry-btn');
  window.__chatFetchMode = 'ok';
  window.__chatFetchText = '重试成功';
  await chatMod.retryLastMessage();
  const failUsers = messageStore.peekMessages(chat.id).filter((m) => m.text === '失败这句');

  const userIdx = messageStore.peekMessages(chat.id).findIndex((m) => m.text === '失败这句');
  window.__chatFetchText = '编辑后回复';
  await chatMod.editMessage(userIdx, '编辑后的话');
  const edited = messageStore.peekMessages(chat.id).find((m) => m.id === failUsers[0].id);
  const hersAfterEdit = messageStore.peekMessages(chat.id).filter((m) => m.role === 'her').map((m) => ({ text: m.text, status: m.status }));

  await chatMod.copyMessage('# 标题\\n\`\`\`js\\nconst a = 1;\\n\`\`\`');

  const delIdx = messageStore.peekMessages(chat.id).findLastIndex((m) => m.role === 'her');
  const delId = messageStore.peekMessages(chat.id)[delIdx].id;
  chatMod.deleteMessage(delIdx);
  const deletedGone = !messageStore.peekMessages(chat.id).some((m) => m.id === delId);

  window.__chatFetchMode = 'hang';
  const pending = chatMod.sendMessage('停下');
  let sending = false;
  for (let i = 0; i < 40; i++) {
    sending = chatMod.isSending();
    if (sending) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  chatMod.stopGeneration();
  await pending;

  const chatB = createConversationForCharacter(chat.roleId, { title: '另一条' });
  store.selectChat(chat.id);
  window.__chatFetchMode = 'ok';
  window.__chatFetchText = '给原线';
  const switched = chatMod.sendMessage('切换时发');
  await new Promise((r) => setTimeout(r, 20));
  store.selectChat(chatB.id);
  await switched;
  const originHas = messageStore.peekMessages(chat.id).some((m) => m.text === '给原线');
  const otherHas = messageStore.peekMessages(chatB.id).some((m) => m.text === '给原线');

  store.selectChat(chat.id);
  window.EchoApp.view = 'app';
  window.EchoApp.render();
  const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
  const hasComposer = !!document.getElementById('chat-input');
  const regenBtn = [...document.querySelectorAll('.msg-action-btn')].some((b) => (b.textContent || '').trim() === '重生成');

  return {
    first: her1?.text,
    regen: her2?.text,
    prev: (her2?.metadata?.previousReplies || []).some((p) => p.text === '第一回复'),
    errStatus,
    retryBtn,
    failUserCount: failUsers.length,
    editedText: edited?.text,
    lastAfterEdit: hersAfterEdit[hersAfterEdit.length - 1]?.text,
    hersAfterEdit,
    copied: window.__copied.includes('const a = 1'),
    deletedGone,
    sending,
    stopped: !chatMod.isSending(),
    originHas,
    otherHas,
    overflowX,
    hasComposer,
    regenBtn,
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
    [390, 844, true],
    [1024, 900, false],
    [1440, 900, false],
  ]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await send("Page.navigate", { url: `${BASE}?c=${Date.now()}&w=${width}` });
    await waitApp(send);
    const snap = await evalExpr(send, FLOW);
    record(`${width} · send`, snap.first === "第一回复" ? "PASS" : "FAIL", snap.first);
    record(`${width} · regenerate`, snap.regen === "第二回复" && snap.prev ? "PASS" : "FAIL", JSON.stringify({ regen: snap.regen, prev: snap.prev }));
    record(`${width} · retry`, snap.retryBtn && snap.failUserCount === 1 && /API Key|没发出去/.test(snap.errStatus) ? "PASS" : "FAIL", snap.errStatus);
    record(`${width} · edit`, snap.editedText === "编辑后的话" && snap.lastAfterEdit === "编辑后回复" ? "PASS" : "FAIL", JSON.stringify({ editedText: snap.editedText, lastAfterEdit: snap.lastAfterEdit, hersAfterEdit: snap.hersAfterEdit }));
    record(`${width} · copy`, snap.copied ? "PASS" : "FAIL", snap.copied);
    record(`${width} · delete`, snap.deletedGone ? "PASS" : "FAIL");
    record(`${width} · stop`, snap.sending && snap.stopped ? "PASS" : "FAIL");
    record(`${width} · switch`, snap.originHas && !snap.otherHas ? "PASS" : "FAIL");
    record(`${width} · shell`, snap.hasComposer && snap.regenBtn && !snap.overflowX ? "PASS" : "FAIL", JSON.stringify({ overflowX: snap.overflowX, regenBtn: snap.regenBtn }));
  }
  ws.close();
} catch (e) {
  record("browser harness", "FAIL", e.message);
} finally {
  chrome.kill();
  server.kill();
}

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n==== CHAT ACTIONS ====`);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
