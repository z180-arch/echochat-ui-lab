/**
 * Chat UI: typing must end, assistant stage tags stripped, over-length refused.
 * Usage: node scripts/chat_browser_verify.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9411);
const HTTP_PORT = Number(process.env.APP_PORT || 8793);
const BASE = `http://127.0.0.1:${HTTP_PORT}/`;
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA = `${process.env.TEMP}\\echochat-chat-verify-${Date.now()}`;
const OUT = join(ROOT, ".tmp-shots");

const results = [];
const consoleErrors = [];
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
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    }
    if (msg.method === "Runtime.exceptionThrown") {
      consoleErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
    }
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

const SETUP = `(() => (async () => {
  localStorage.clear();
  const { createFromTemplate } = await import('/src/domain/persona.js');
  const { storage, KEYS } = await import('/src/core/storage.js');
  const { store } = await import('/src/core/store.js');
  store.reset();
  store.updateSettings({ apiKey: 'sk-test-key', baseUrl: 'https://api.example.com/v1', model: 'x' });
  await createFromTemplate({ name: '林晚', persona: 'p', firstMessage: 'hi' });
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  const chatMod = await import('/src/domain/chat.js');
  window.__isSending = () => chatMod.isSending();
  window.EchoApp.view = 'app';
  window.EchoApp.render();
  const orig = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/chat/completions')) {
      if (window.__chatFetchMode === 'hang') {
        return new Promise((_, reject) => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          if (opts?.signal?.aborted) {
            reject(err);
            return;
          }
          opts?.signal?.addEventListener('abort', () => reject(err), { once: true });
        });
      }
      if (window.__chatFetchMode === 'error') {
        return new Response('fail', { status: 500 });
      }
      const text = window.__chatFetchText ?? '你好呀（笑眯眯）[Cute(Convincing)/撒娇]';
      const body = 'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\\n\\ndata: [DONE]\\n\\n';
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return orig(url, opts);
  };
  window.__chatFetchPatched = true;
  return true;
})())()`;

async function run(send, label, width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await send("Page.navigate", { url: `${BASE}?chat=${Date.now()}` });
  for (let i = 0; i < 50; i++) {
    if (await evalExpr(send, "!!window.EchoApp")) break;
    await sleep(200);
  }
  await evalExpr(send, `window.EchoApp._storageReady || Promise.resolve()`);
  await evalExpr(send, SETUP);
  for (let i = 0; i < 30; i++) {
    if (await evalExpr(send, `!!document.getElementById('chat-input') && !!window.__isSending`)) break;
    await sleep(150);
  }

  await evalExpr(send, `window.__chatFetchMode='ok'; window.__chatFetchText='你好呀（笑眯眯）[Cute(Convincing)/撒娇]';`);
  await evalExpr(
    send,
    `(async()=>{const el=document.getElementById('chat-input'); el.value='我（笑眯眯）在吗'; await window.EchoApp.sendMessage(); return true;})()`
  );
  const probe = await evalExpr(
    send,
    `(()=>{
      const hers=[...document.querySelectorAll('.msg-her .msg-bubble')].map(b=>b.innerText.trim());
      return {
        typing: document.querySelectorAll('.typing-indicator').length,
        sending: window.__isSending(),
        lastHer: hers[hers.length-1] || '',
        hers,
        me: document.querySelector('.msg-me .msg-bubble')?.innerText?.trim() || '',
        patched: typeof window.__isSending === 'function'
      };
    })()`
  );
  record(
    `${label} · 完成后三个点关闭且清洗舞台指示`,
    !probe.sending && probe.typing === 0 && probe.lastHer === "你好呀" ? "PASS" : "FAIL",
    JSON.stringify(probe)
  );
  record(`${label} · 不改用户消息`, probe.me.includes("我（笑眯眯）在吗") ? "PASS" : "FAIL", probe.me);
  await shot(send, `${label}-chat-clean`);

  await evalExpr(send, `window.__chatFetchMode='hang';`);
  await evalExpr(send, `document.getElementById('chat-input').value='取消我'; window.EchoApp.sendMessage(); true`);
  let mid = false;
  for (let i = 0; i < 50; i++) {
    mid = await evalExpr(send, `window.__isSending()`);
    if (mid) break;
    await sleep(50);
  }
  await evalExpr(send, `window.EchoApp.stopSend()`);
  await sleep(400);
  let afterCancel = {};
  for (let i = 0; i < 30; i++) {
    await sleep(120);
    afterCancel = await evalExpr(
      send,
      `({typing:document.querySelectorAll('.typing-indicator').length, sending:window.__isSending()})`
    );
    if (!afterCancel.sending && afterCancel.typing === 0) break;
  }
  record(
    `${label} · 取消后三个点关闭`,
    mid === true && !afterCancel.sending && afterCancel.typing === 0 ? "PASS" : "FAIL",
    JSON.stringify({ mid, ...afterCancel })
  );

  await evalExpr(
    send,
    `(()=>{const el=document.getElementById('chat-input'); el.value='啊'.repeat(2001); window.EchoApp.onChatInput(el); window.EchoApp.sendMessage(); return el.value.length;})()`
  );
  await sleep(400);
  const over = await evalExpr(
    send,
    `(()=>({kept:document.getElementById('chat-input')?.value?.length||0, over:document.querySelector('.composer-count.is-over')!=null, toast:(document.querySelector('.toast')?.textContent||''), sentLong:[...document.querySelectorAll('.msg-me .msg-bubble')].some(b=>b.innerText.trim().length>2000)}))()`
  );
  record(
    `${label} · 超字数不截断不发送`,
    over.kept === 2001 && over.over && !over.sentLong ? "PASS" : "FAIL",
    JSON.stringify(over)
  );
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
  const { ws, send } = await cdpConnect(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Runtime.enable");
  await run(send, "desktop", 1440, 900, false);
  await run(send, "mobile", 390, 844, true);
  ws.close();
} finally {
  chrome.kill();
  server.kill();
}

const fails = results.filter((r) => r.status !== "PASS");
console.log("\n==== SUMMARY ====");
console.log(`${results.length - fails.length}/${results.length} passed`);
if (consoleErrors.length) {
  console.log("\n---- CONSOLE ERRORS ----");
  [...new Set(consoleErrors)].forEach((e) => console.log(" ! " + e));
} else {
  console.log("no console errors");
}
process.exit(fails.length || consoleErrors.length ? 1 : 0);
