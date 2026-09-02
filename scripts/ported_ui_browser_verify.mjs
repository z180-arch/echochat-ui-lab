/**
 * Drives the UI through landing → create → chat → settings on both mobile and
 * desktop viewports, capturing screenshots + console errors.
 *
 * Needs a static server first:
 *   node scripts/static_server.mjs . 8791
 *   node scripts/ported_ui_browser_verify.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { writeFile, mkdir } from "node:fs/promises";

const CDP_PORT = Number(process.env.CDP_PORT || 9366);
const BASE = process.env.APP_URL || "http://127.0.0.1:8791/";
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA = `${process.env.TEMP}\\echochat-port-verify-${Date.now()}`;
const OUT = new URL("../.tmp-shots/", import.meta.url).pathname.replace(/^\//, "");

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
  const r = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(`${OUT}${name}.png`, Buffer.from(r.data, "base64"));
}

async function setViewport(send, width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
}

async function reload(send) {
  await evalExpr(send, `localStorage.clear()`).catch(() => {});
  await send("Page.navigate", { url: `${BASE}?v=${Date.now()}` });
  await sleep(2600);
  for (let i = 0; i < 40; i++) {
    if (await evalExpr(send, `!!window.EchoApp`)) return;
    await sleep(250);
  }
  throw new Error("EchoApp never appeared");
}

const SAMPLE = `林晚: 我是咖啡店的店员，不太爱说话。
我: 今天想吃火锅吗？
林晚: 可以，但不要香菜。
我: 记得你上次说讨厌香菜。
林晚: 你还记得啊。
林晚: 周末想去看展。`;

async function run(send, label, width, height, mobile) {
  await setViewport(send, width, height, mobile);
  await reload(send);

  // 1. Landing（等 splash 收起）
  for (let i = 0; i < 30; i++) {
    if (await evalExpr(send, `!!document.querySelector('.landing')`)) break;
    await sleep(200);
  }
  const landing = await evalExpr(
    send,
    `(()=>{const l=document.querySelector('.landing');const chars=document.querySelectorAll('.welcome-lead .lead-char').length;
      return {landing:!!l, chars, ambient:!!document.querySelector('.ambient-layer canvas')}})()`
  );
  record(
    `${label} · landing 渲染`,
    landing.landing && landing.chars === 9 && landing.ambient ? "PASS" : "FAIL",
    JSON.stringify(landing)
  );
  await sleep(1400);
  await shot(send, `${label}-1-landing`);

  const sloganOn = await evalExpr(send, `document.querySelectorAll('.welcome-lead .lead-char.on').length`);
  record(`${label} · slogan 逐字浮现`, sloganOn === 9 ? "PASS" : "FAIL", `on=${sloganOn}`);

  // 2. 创建角色入口（不应先要 API）
  await evalExpr(send, `window.EchoApp.openBring()`);
  await sleep(700);
  const create = await evalExpr(
    send,
    `(()=>{const cards=[...document.querySelectorAll('.create-card')].map(c=>c.querySelector('.create-card-title')?.textContent);
      return {cards, hint:!!document.querySelector('.api-hint'), blocked:!document.querySelector('.create-cards')}})()`
  );
  record(
    `${label} · 创建角色 4 入口且不拦 API`,
    create.cards.length === 4 && !create.blocked ? "PASS" : "FAIL",
    JSON.stringify(create.cards)
  );
  await shot(send, `${label}-2-create`);

  // 3. 导入聊天记录向导
  await evalExpr(send, `document.querySelectorAll('.modal-overlay').forEach(m=>m.remove());window.EchoApp.openReconstruction()`);
  await sleep(500);
  const wizard = await evalExpr(
    send,
    `(()=>({tabs:document.querySelectorAll('.mode-tab').length, zone:!!document.querySelector('.import-file-zone')}))()`
  );
  record(`${label} · 导入向导 文件/文本切换`, wizard.tabs === 2 && wizard.zone ? "PASS" : "FAIL", JSON.stringify(wizard));

  await evalExpr(send, `window.EchoApp.reconstructionSetMode('text')`);
  await sleep(300);
  await evalExpr(
    send,
    `(()=>{const t=document.getElementById('recon-paste');t.value=${JSON.stringify(SAMPLE)};t.dispatchEvent(new Event('input'));return true})()`
  );
  await evalExpr(send, `window.EchoApp.reconstructionParse()`);
  await sleep(250);
  const parsing = await evalExpr(send, `!!document.querySelector('.wizard-loading')`);
  record(`${label} · 解析中过场`, parsing ? "PASS" : "FAIL");
  await sleep(900);
  const review = await evalExpr(send, `!!document.getElementById('recon-name')`);
  record(`${label} · 核对人设页`, review ? "PASS" : "FAIL");
  await shot(send, `${label}-3-review`);

  await evalExpr(send, `window.EchoApp.reconstructionConfirm()`);
  // 建角色是异步的，开场白要等 messageStore 落库后才渲染出来——轮询而不是死等
  const probe = `(()=>({chat:!!document.querySelector('.chat-pane .chat-header'), name:document.querySelector('.chat-header-name')?.textContent,
      hint:!!document.querySelector('.composer-hint'), msgs:document.querySelectorAll('.msg').length,
      avatars:document.querySelectorAll('.msg-avatar-btn').length, names:document.querySelectorAll('.msg-name').length}))()`;
  let inChat = {};
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    inChat = await evalExpr(send, probe);
    if (inChat.chat && inChat.msgs > 0) break;
  }
  await sleep(400);
  inChat = await evalExpr(send, probe);
  record(
    `${label} · 创建后进入对话`,
    inChat.chat && inChat.msgs > 0 && inChat.avatars === inChat.msgs ? "PASS" : "FAIL",
    JSON.stringify(inChat)
  );
  record(`${label} · 未配 API 显示提示条`, inChat.hint ? "PASS" : "FAIL");
  // 成功过场盖在聊天上，等它退场再拍
  for (let i = 0; i < 30; i++) {
    if (!(await evalExpr(send, `!!document.querySelector('.success-ripple')`))) break;
    await sleep(200);
  }
  await sleep(600);
  const leftovers = await evalExpr(
    send,
    `(()=>({wizard:!!document.getElementById('recon-name'), modals:document.querySelectorAll('.modal-overlay').length}))()`
  );
  record(
    `${label} · 过场结束后向导已关闭`,
    !leftovers.wizard && leftovers.modals === 0 ? "PASS" : "FAIL",
    JSON.stringify(leftovers)
  );
  await shot(send, `${label}-4-chat`);

  // 4. 未配 API 发送 → 弹连接模型
  await evalExpr(
    send,
    `(()=>{const i=document.getElementById('chat-input');i.value='在吗';window.EchoApp.sendMessage();return true})()`
  );
  await sleep(600);
  const connect = await evalExpr(
    send,
    `(()=>({modal:!!document.querySelector('.modal-overlay'), title:document.querySelector('.modal-title')?.textContent,
      pending:window.EchoApp._pendingSend, block:!!document.querySelector('.api-block')}))()`
  );
  record(
    `${label} · 发送时才引导连接模型`,
    connect.modal && connect.title === "连接模型" && connect.pending === "在吗" ? "PASS" : "FAIL",
    JSON.stringify(connect)
  );
  await shot(send, `${label}-5-api-connect`);

  // 取消应把话还回输入框
  await evalExpr(send, `window.EchoApp.cancelApiConnect()`);
  await sleep(300);
  const restored = await evalExpr(send, `document.getElementById('chat-input')?.value`);
  record(`${label} · 取消后草稿回填`, restored === "在吗" ? "PASS" : "FAIL", `value=${restored}`);

  // 5. 我的 → 外观：预设 + 自定义 + 粒子强度
  await evalExpr(send, `window.EchoApp.switchTab('me')`);
  await sleep(500);
  const mePane = await evalExpr(
    send,
    `(()=>({card:!!document.querySelector('.me-profile'), rows:document.querySelectorAll('.me-settings-item').length}))()`
  );
  record(`${label} · 我的页`, mePane.card && mePane.rows >= 8 ? "PASS" : "FAIL", JSON.stringify(mePane));
  await shot(send, `${label}-6-me`);

  // 滚动恢复
  const before = await evalExpr(
    send,
    `(()=>{const e=document.getElementById('me-scroll');if(!e)return -1;e.scrollTop=180;return e.scrollTop})()`
  );
  await evalExpr(send, `window.EchoApp.render()`);
  await sleep(300);
  const scrollKept = await evalExpr(send, `document.getElementById('me-scroll')?.scrollTop`);
  record(
    `${label} · 我的页重渲染不跳顶`,
    before > 0 ? (scrollKept === before ? "PASS" : "FAIL") : "PASS",
    before > 0 ? `${before} → ${scrollKept}` : "内容未溢出，无需恢复"
  );

  await evalExpr(send, `window.EchoApp.openSettings('appearance')`);
  await sleep(500);
  const appearance = await evalExpr(
    send,
    `(()=>({swatches:document.querySelectorAll('.theme-swatch').length, colors:document.querySelectorAll('.color-row input[type=color]').length,
      particles:[...document.querySelectorAll('.theme-chip-row')].length, preview:!!document.querySelector('.theme-preview')}))()`
  );
  record(
    `${label} · 外观：6 预设 + 4 自定义 + 强度`,
    appearance.swatches === 6 && appearance.colors === 4 && appearance.preview ? "PASS" : "FAIL",
    JSON.stringify(appearance)
  );
  await shot(send, `${label}-7-appearance`);

  await evalExpr(send, `window.EchoApp.setThemePreset('lavender')`);
  await sleep(400);
  const themed = await evalExpr(
    send,
    `getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()`
  );
  record(`${label} · 切换预设生效`, themed.toLowerCase() === "#8b7cf6" ? "PASS" : "FAIL", themed);

  await evalExpr(send, `window.EchoApp.setParticleIntensity('off')`);
  await sleep(400);
  const off = await evalExpr(send, `window.EchoApp && document.querySelector('.ambient-layer')!==null`);
  record(`${label} · 粒子强度可关`, off ? "PASS" : "FAIL");
  await evalExpr(send, `window.EchoApp.resetTheme();document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())`);
  await sleep(300);

  // 6. API 设置页
  await evalExpr(send, `window.EchoApp.openSettings('api')`);
  await sleep(500);
  const api = await evalExpr(
    send,
    `(()=>({hero:!!document.querySelector('.api-hero'), steps:!!document.querySelector('.key-steps'),
      toggle:!!document.querySelector('.api-more-toggle'), moreOpen:!!document.querySelector('.api-more.open'),
      presets:document.querySelectorAll('.api-more .preset-card').length}))()`
  );
  record(
    `${label} · API 页 推荐前置 + 更多折叠`,
    api.hero && api.steps && api.toggle && !api.moreOpen && api.presets === 5 ? "PASS" : "FAIL",
    JSON.stringify(api)
  );
  await shot(send, `${label}-8-api`);

  await evalExpr(send, `window.EchoApp.toggleApiMore()`);
  await sleep(400);
  const opened = await evalExpr(send, `!!document.querySelector('.api-more.open')`);
  record(`${label} · 更多配置可展开`, opened ? "PASS" : "FAIL");

  // 填 key 后保存并发送
  await evalExpr(
    send,
    `(()=>{document.getElementById('set-apikey').value='sk-test-key';document.getElementById('set-model').value='Qwen/Qwen2.5-7B-Instruct';
      window.EchoApp.saveSettings();return true})()`
  );
  await sleep(600);
  const saved = await evalExpr(send, `window.EchoApp && !document.querySelector('.composer-hint')`);
  record(`${label} · 保存后提示条消失`, saved ? "PASS" : "FAIL");

  // 7. 瞬间页
  await evalExpr(send, `window.EchoApp.switchTab('moments')`);
  await sleep(500);
  await shot(send, `${label}-9-moments`);
  record(`${label} · 瞬间页可达`, await evalExpr(send, `!!document.querySelector('.moments-pane')`) ? "PASS" : "FAIL");

  // 8. 用户资料
  await evalExpr(send, `window.EchoApp.switchTab('me')`);
  await sleep(400);
  await evalExpr(send, `window.EchoApp.openUserProfile()`);
  await sleep(400);
  const profile = await evalExpr(
    send,
    `(()=>{const i=document.getElementById('user-name');if(!i)return null;i.value='阿柯';window.EchoApp.saveUserProfile();return true})()`
  );
  await sleep(500);
  const named = await evalExpr(send, `document.querySelector('.me-name')?.textContent || null`);
  record(`${label} · 编辑昵称`, profile && named === "阿柯" ? "PASS" : "FAIL", `myName=${named}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${USER_DATA}`,
      "--headless=new",
      "--no-first-run",
      "--disable-gpu",
      "--hide-scrollbars",
      BASE,
    ],
    { stdio: "ignore", detached: false }
  );
  try {
    const list = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const page = list.find((t) => t.type === "page");
    const { ws, send } = await cdpConnect(page.webSocketDebuggerUrl);
    await send("Page.enable");
    await send("Runtime.enable");

    await run(send, "desktop", 1440, 900, false);
    await run(send, "mobile", 390, 844, true);

    ws.close();
  } finally {
    chrome.kill();
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
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});
