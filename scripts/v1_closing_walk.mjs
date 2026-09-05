/**
 * V1 closing pass: walk Landing → Hub → Chat → Profile → Moments → Me →
 * Appearance → Model settings on desktop 1440×900 and mobile 390×844.
 *
 *   node scripts/static_server.mjs . 8791
 *   node scripts/v1_closing_walk.mjs
 *
 * Real SiliconFlow chat runs only when SILICONFLOW_API_KEY is set in the
 * process environment. The key is never logged or written to disk.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9422);
const HTTP_PORT = Number(process.env.APP_PORT || 8794);
const BASE = `http://127.0.0.1:${HTTP_PORT}/app/`;
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA = `${process.env.TEMP}\\echochat-v1-walk-${Date.now()}`;
const OUT = join(ROOT, ".tmp-shots");
const API_KEY =
  process.env.SILICONFLOW_API_KEY ||
  process.env.SILICONFLOW_KEY ||
  process.env.SF_API_KEY ||
  process.env.ECHOCHAT_API_KEY ||
  "";

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

const LAYOUT_PROBE = `(() => {
  const vw = window.innerWidth;
  const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const modal = document.querySelector('.modal');
  const body = document.querySelector('.modal-body');
  const footer = document.querySelector('.modal-footer');
  const f = footer?.getBoundingClientRect();
  const m = modal?.getBoundingClientRect();
  return {
    pageOverflow: docW > vw + 2,
    docW, vw,
    modalOverflow: modal ? modal.scrollWidth > modal.clientWidth + 2 : false,
    footerInView: f ? f.bottom <= window.innerHeight + 2 && f.top >= 0 : true,
    modalFits: m ? m.bottom <= window.innerHeight + 2 && m.width <= vw + 2 : true,
    bodyScrolls: body ? body.scrollHeight - body.clientHeight > 8 : false,
    bg: getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
    surface: getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim(),
    bubbleMe: getComputedStyle(document.documentElement).getPropertyValue('--color-bubble-me').trim(),
    count: document.getElementById('chat-count')?.textContent || '',
  };
})()`;

const SAMPLE = `林晚: 我是咖啡店的店员，不太爱说话。
我: 今天想吃火锅吗？
林晚: 可以，但不要香菜。`;

async function waitApp(send) {
  for (let i = 0; i < 50; i++) {
    if (await evalExpr(send, "!!window.EchoApp")) return;
    await sleep(200);
  }
  throw new Error("EchoApp never appeared");
}

async function seedChat(send) {
  await evalExpr(send, `document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())`);
  await evalExpr(send, `window.EchoApp.openReconstruction()`);
  await sleep(400);
  await evalExpr(send, `window.EchoApp.reconstructionSetMode('text')`);
  await evalExpr(
    send,
    `(()=>{const t=document.getElementById('recon-paste');t.value=${JSON.stringify(SAMPLE)};t.dispatchEvent(new Event('input'));return true})()`
  );
  await evalExpr(send, `window.EchoApp.reconstructionParse()`);
  for (let i = 0; i < 40; i++) {
    if (await evalExpr(send, `!!document.getElementById('recon-name')`)) break;
    await sleep(150);
  }
  await evalExpr(send, `window.EchoApp.reconstructionConfirm()`);
  for (let i = 0; i < 40; i++) {
    if (await evalExpr(send, `!!document.querySelector('.chat-pane .chat-header')`)) break;
    await sleep(150);
  }
  for (let i = 0; i < 25; i++) {
    if (!(await evalExpr(send, `!!document.querySelector('.success-ripple')`))) break;
    await sleep(200);
  }
}

async function run(send, label, width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await evalExpr(send, `localStorage.clear()`).catch(() => {});
  await send("Page.navigate", { url: `${BASE}?v=${Date.now()}` });
  await waitApp(send);
  await sleep(1600);

  const landing = await evalExpr(send, `!!document.querySelector('.landing')`);
  record(`${label} · Landing`, landing ? "PASS" : "FAIL");
  await shot(send, `${label}-landing`);

  await seedChat(send);
  const chat = await evalExpr(
    send,
    `(()=>({header:!!document.querySelector('.chat-header'), count:document.getElementById('chat-count')?.textContent||'', msgs:document.querySelectorAll('.msg').length}))()`
  );
  record(
    `${label} · Chat + 字数 0 / 2000`,
    chat.header && chat.count.includes("2000") ? "PASS" : "FAIL",
    JSON.stringify(chat)
  );
  await shot(send, `${label}-chat`);

  await evalExpr(send, `window.EchoApp.toggleProfile()`);
  await sleep(400);
  const profile = await evalExpr(send, `!!document.querySelector('.profile-pane.open, .profile-pane:not(.hidden-mobile)') || !!document.querySelector('.profile-name')`);
  record(`${label} · Profile`, profile ? "PASS" : "FAIL");
  await shot(send, `${label}-profile`);
  await evalExpr(send, `document.querySelector('.profile-close')?.click(); window.EchoApp.toggleProfile?.()`).catch(() => {});

  await evalExpr(send, `window.EchoApp.switchTab('moments')`);
  await sleep(400);
  const moments = await evalExpr(send, `!!document.querySelector('.moments-pane')`);
  record(`${label} · Moments`, moments ? "PASS" : "FAIL");
  await shot(send, `${label}-moments`);

  await evalExpr(send, `window.EchoApp.switchTab('me')`);
  await sleep(400);
  const me = await evalExpr(send, `!!document.querySelector('.me-profile')`);
  record(`${label} · Me`, me ? "PASS" : "FAIL");
  await shot(send, `${label}-me`);

  const mintBg = await evalExpr(send, `getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()`);
  await evalExpr(send, `window.EchoApp.openSettings('appearance')`);
  await sleep(400);
  await shot(send, `${label}-appearance`);
  await evalExpr(send, `window.EchoApp.setThemePreset('lavender')`);
  await sleep(350);
  const afterLav = await evalExpr(send, LAYOUT_PROBE);
  record(
    `${label} · Appearance 铺到背景/表面`,
    afterLav.bg !== mintBg && afterLav.bg.includes("color-mix") && afterLav.surface.includes("color-mix") ? "PASS" : "FAIL",
    `bg changed=${afterLav.bg !== mintBg}`
  );
  await shot(send, `${label}-appearance-lavender`);
  await evalExpr(send, `window.EchoApp.setThemePreset('mint'); document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())`);
  await sleep(250);

  await evalExpr(send, `window.EchoApp.openSettings('api')`);
  await sleep(400);
  const apiClosed = await evalExpr(send, LAYOUT_PROBE);
  record(
    `${label} · Model Settings 无横向溢出且页脚可见`,
    !apiClosed.pageOverflow && !apiClosed.modalOverflow && apiClosed.footerInView && apiClosed.modalFits ? "PASS" : "FAIL",
    JSON.stringify({
      pageOverflow: apiClosed.pageOverflow,
      modalOverflow: apiClosed.modalOverflow,
      footerInView: apiClosed.footerInView,
      modalFits: apiClosed.modalFits,
    })
  );
  await shot(send, `${label}-model`);
  await evalExpr(send, `window.EchoApp.toggleApiMore()`);
  await sleep(400);
  const apiOpen = await evalExpr(send, LAYOUT_PROBE);
  record(
    `${label} · 展开更多配置后仍可滚动且页脚可见`,
    !apiOpen.pageOverflow && !apiOpen.modalOverflow && apiOpen.footerInView ? "PASS" : "FAIL",
    JSON.stringify({
      pageOverflow: apiOpen.pageOverflow,
      modalOverflow: apiOpen.modalOverflow,
      footerInView: apiOpen.footerInView,
      bodyScrolls: apiOpen.bodyScrolls,
    })
  );
  await shot(send, `${label}-model-more`);
  await evalExpr(send, `document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())`);

  await evalExpr(send, `window.EchoApp.switchTab('companion')`);
  await sleep(300);
  const hub = await evalExpr(send, `!!document.querySelector('.list-pane')`);
  record(`${label} · Character Hub`, hub ? "PASS" : "FAIL");
  await shot(send, `${label}-hub`);

  if (API_KEY) {
    await evalExpr(
      send,
      `(async()=>{
        const { store } = await import('/src/core/store.js');
        store.updateSettings({
          apiKey: ${JSON.stringify(API_KEY)},
          baseUrl: 'https://api.siliconflow.cn/v1',
          model: 'Qwen/Qwen2.5-7B-Instruct',
          apiPresetId: 'siliconflow'
        });
        return true;
      })()`
    );
    await evalExpr(send, `window.EchoApp.selectCharacter ? true : true`);
    const opened = await evalExpr(
      send,
      `(()=>{const row=document.querySelector('.inbox-item, .list-item, [onclick*=\"selectCharacter\"]'); if(row) row.click(); return !!document.getElementById('chat-input');})()`
    );
    if (!opened) {
      await evalExpr(send, `window.EchoApp.continueCharacter ? window.EchoApp.continueCharacter() : window.EchoApp.switchTab('companion')`);
    }
    await sleep(400);
    const sendA = await evalExpr(
      send,
      `(async()=>{
        const el=document.getElementById('chat-input');
        if(!el) return {ok:false, reason:'no-input'};
        el.value='你好，今天过得怎么样？';
        window.EchoApp.onChatInput(el);
        await window.EchoApp.sendMessage();
        return {ok:true};
      })()`
    );
    let done = null;
    for (let i = 0; i < 80; i++) {
      await sleep(250);
      done = await evalExpr(
        send,
        `(()=>{
          const hers=[...document.querySelectorAll('.msg-her .msg-bubble')].map(b=>b.innerText.trim()).filter(Boolean);
          return {
            typing: document.querySelectorAll('.typing-indicator').length,
            streaming: document.querySelectorAll('.msg-streaming').length,
            last: hers[hers.length-1] || '',
            hers: hers.length
          };
        })()`
      );
      if (done.hers >= 1 && done.typing === 0 && done.streaming === 0 && done.last) break;
    }
    record(
      `${label} · 真实 API Test A`,
      sendA.ok && done && done.last && done.typing === 0 && done.streaming === 0 ? "PASS" : "FAIL",
      `hers=${done?.hers} typing=${done?.typing}`
    );
    await shot(send, `${label}-chat-real`);
  } else {
    record(`${label} · 真实 API Test A`, "BLOCKED", "SILICONFLOW_API_KEY missing");
  }
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
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--headless=new",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" }
);

try {
  const list = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no CDP page target");
  const { ws, send } = await cdpConnect(page.webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Runtime.enable");

  await run(send, "desktop", 1440, 900, false);
  await run(send, "mobile", 390, 844, true);

  ws.close();
} finally {
  chrome.kill();
  server.kill();
}

const failed = results.filter((r) => r.status === "FAIL").length;
const blocked = results.filter((r) => r.status === "BLOCKED").length;
console.log(`\nV1 walk: ${results.length - failed - blocked} passed, ${failed} failed, ${blocked} blocked`);
if (consoleErrors.length) {
  console.log("console errors:", consoleErrors.slice(0, 8).join(" | "));
}
if (failed) process.exit(1);
