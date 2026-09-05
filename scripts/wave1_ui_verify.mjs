/**
 * Wave 1 UI presentation checks at 390 and 1440. Isolated Chrome profile.
 * Usage: node scripts/wave1_ui_verify.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9418);
const HTTP_PORT = Number(process.env.APP_PORT || 8798);
const BASE = `http://127.0.0.1:${HTTP_PORT}/app/`;
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA = `${process.env.TEMP}\\echochat-wave1-${Date.now()}`;
const OUT = join(ROOT, ".tmp-shots");

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
  const { recordChatTurn } = await import('/src/domain/relations.js');
  store.reset();
  store.updateSettings({ apiKey: 'sk-test-key', baseUrl: 'https://api.example.com/v1', model: 'x' });
  const quiet = await createFromTemplate({ name: '未开口', persona: '还没聊过的人' });
  const greeting = await createFromTemplate({ name: '刚开口', persona: '刚认识', firstMessage: '你好呀' });
  const familiar = await createFromTemplate({ name: '渐渐熟', persona: '已经相处过', firstMessage: '又见面了' });
  recordChatTurn(familiar.roleId, familiar.name);
  recordChatTurn(familiar.roleId, familiar.name);
  recordChatTurn(familiar.roleId, familiar.name);
  recordChatTurn(familiar.roleId, familiar.name);
  recordChatTurn(familiar.roleId, familiar.name);
  recordChatTurn(familiar.roleId, familiar.name);
  recordChatTurn(familiar.roleId, familiar.name);
  recordChatTurn(familiar.roleId, familiar.name);
  recordChatTurn(familiar.roleId, familiar.name);
  recordChatTurn(familiar.roleId, familiar.name);
  recordChatTurn(familiar.roleId, familiar.name);
  recordChatTurn(familiar.roleId, familiar.name);
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  window.EchoApp.view = 'app';
  window.EchoApp.render();
  return { quiet: quiet.roleId, greeting: greeting.roleId, familiar: familiar.roleId };
})())()`;

function hubProbe() {
  return `(() => {
    const cards = [...document.querySelectorAll('.character-card')];
    return cards.map(c => {
      const name = c.querySelector('.list-item-title')?.textContent || '';
      const sub = c.querySelector('.list-item-subtitle')?.textContent || '';
      const chips = [...c.querySelectorAll('.stage-chip')].map(el => el.textContent);
      const last = c.querySelector('.list-item-last')?.textContent || '';
      return { name, sub, chips, last, dup: chips.includes(sub) };
    });
  })()`;
}

function profileProbe() {
  return `(() => {
    const header = document.querySelector('.profile-status')?.innerText || '';
    const rel = document.querySelector('.relationship-brief')?.innerText || '';
    const tools = document.querySelector('.profile-tools')?.innerText || '';
    const folds = [...document.querySelectorAll('.profile-fold summary')].map(s => s.textContent);
    const exportInTools = /导出/.test(tools);
    const editInTools = /编辑/.test(tools);
    const exportBtn = document.querySelector('.profile-fold button[onclick*="exportCharacterCard"]');
    const exportInMore = !!exportBtn;
    return { header, rel, tools, folds, exportInTools, editInTools, exportInMore };
  })()`;
}

function composerProbe() {
  return `(() => {
    const cap = document.getElementById('chat-count');
    return {
      hidden: !cap || cap.hidden || cap.getAttribute('hidden') !== null,
      text: cap?.textContent || '',
      over: cap?.classList.contains('is-over') || false,
      near: cap?.classList.contains('is-near') || false,
      hasInput: !!document.getElementById('chat-input'),
    };
  })()`;
}

async function run(send, label, width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await send("Page.navigate", { url: `${BASE}?w1=${Date.now()}` });
  for (let i = 0; i < 50; i++) {
    if (await evalExpr(send, "!!window.EchoApp")) break;
    await sleep(200);
  }
  await evalExpr(send, `window.EchoApp._storageReady || Promise.resolve()`);
  const ids = await evalExpr(send, SEED);
  await sleep(400);

  await evalExpr(send, `window.EchoApp.switchTab('companion'); window.EchoApp.backToList(); true`);
  await sleep(300);
  const hub = await evalExpr(send, hubProbe());
  const hubOk =
    Array.isArray(hub) &&
    hub.length >= 3 &&
    hub.every((c) => !c.dup && c.chips.length === 0 && c.sub) &&
    hub.some((c) => c.name === "未开口" && c.sub === "还没有聊过") &&
    hub.some((c) => c.name === "刚开口" && c.sub === "刚刚认识") &&
    hub.some((c) => c.name === "渐渐熟" && c.sub.includes("渐渐熟悉") && !c.sub.includes("刚刚认识"));
  record(`${label} · Hub`, hubOk ? "PASS" : "FAIL", JSON.stringify(hub));
  await shot(send, `${label}-hub`);

  await evalExpr(send, `window.EchoApp.selectCharacter(${JSON.stringify(ids.greeting)}); true`);
  await sleep(350);
  if (mobile) await evalExpr(send, `window.EchoApp.toggleProfile(); true`);
  await sleep(250);
  const profileTalk = await evalExpr(send, profileProbe());
  const profileTalkOk =
    profileTalk.header.includes("刚刚认识") &&
    profileTalk.rel.includes("刚刚认识") &&
    !profileTalk.rel.includes("还没有聊过") &&
    profileTalk.editInTools &&
    !profileTalk.exportInTools &&
    profileTalk.exportInMore;
  record(`${label} · Profile 刚开口`, profileTalkOk ? "PASS" : "FAIL", JSON.stringify(profileTalk));
  await shot(send, `${label}-profile-talk`);

  await evalExpr(send, `document.querySelector('.profile-close')?.click(); true`);
  await evalExpr(send, `window.EchoApp.selectCharacter(${JSON.stringify(ids.quiet)}); true`);
  await sleep(350);
  if (mobile) await evalExpr(send, `window.EchoApp.toggleProfile(); true`);
  await sleep(250);
  const profileQuiet = await evalExpr(send, profileProbe());
  const profileQuietOk =
    profileQuiet.header.includes("还没有聊过") &&
    profileQuiet.rel.includes("还没有聊过") &&
    profileQuiet.editInTools &&
    !profileQuiet.exportInTools &&
    profileQuiet.exportInMore;
  record(`${label} · Profile 未开口`, profileQuietOk ? "PASS" : "FAIL", JSON.stringify(profileQuiet));
  await shot(send, `${label}-profile-quiet`);

  await evalExpr(send, `document.querySelector('.profile-close')?.click(); true`);
  await evalExpr(send, `window.EchoApp.selectCharacter(${JSON.stringify(ids.familiar)}); true`);
  await sleep(350);
  if (mobile) await evalExpr(send, `window.EchoApp.toggleProfile(); true`);
  await sleep(250);
  const profileFam = await evalExpr(send, profileProbe());
  const profileFamOk =
    profileFam.header.includes("渐渐熟悉") &&
    profileFam.rel.includes("渐渐熟悉") &&
    !profileFam.rel.includes("还没有聊过") &&
    profileFam.editInTools &&
    !profileFam.exportInTools &&
    profileFam.exportInMore;
  record(`${label} · Profile 渐渐熟`, profileFamOk ? "PASS" : "FAIL", JSON.stringify(profileFam));
  await shot(send, `${label}-profile-familiar`);

  await evalExpr(send, `document.querySelector('.profile-close')?.click(); true`);
  await sleep(200);
  const emptyCount = await evalExpr(send, composerProbe());
  const emptyOk = emptyCount.hasInput && emptyCount.hidden;
  record(`${label} · Composer 空输入`, emptyOk ? "PASS" : "FAIL", JSON.stringify(emptyCount));

  await evalExpr(
    send,
    `(()=>{const el=document.getElementById('chat-input'); el.value='正常一句'; window.EchoApp.onChatInput(el); return true})()`
  );
  const midCount = await evalExpr(send, composerProbe());
  record(`${label} · Composer 正常输入`, midCount.hidden ? "PASS" : "FAIL", JSON.stringify(midCount));

  await evalExpr(
    send,
    `(()=>{const el=document.getElementById('chat-input'); el.value='啊'.repeat(1800); window.EchoApp.onChatInput(el); return true})()`
  );
  const nearCount = await evalExpr(send, composerProbe());
  const nearOk = !nearCount.hidden && nearCount.near && nearCount.text.includes("1800");
  record(`${label} · Composer 接近上限`, nearOk ? "PASS" : "FAIL", JSON.stringify(nearCount));

  await evalExpr(
    send,
    `(()=>{const el=document.getElementById('chat-input'); el.value='啊'.repeat(2001); window.EchoApp.onChatInput(el); return true})()`
  );
  const overCount = await evalExpr(send, composerProbe());
  const overOk = !overCount.hidden && overCount.over && overCount.text.includes("2001");
  record(`${label} · Composer 超限`, overOk ? "PASS" : "FAIL", JSON.stringify(overCount));
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
console.log("\n==== WAVE 1 BROWSER ====");
console.log(`${results.length - fails.length}/${results.length} passed`);
if (fails.length) process.exit(1);
