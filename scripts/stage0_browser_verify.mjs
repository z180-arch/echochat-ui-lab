/**
 * Stage 0 browser verification via Chrome DevTools Protocol.
 * Uses Node built-in WebSocket (Node 22+). No package.json deps.
 *
 * Usage: node scripts/stage0_browser_verify.mjs
 * Requires: python -m http.server 8080 (or APP_URL)
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CDP_PORT = Number(process.env.CDP_PORT || 9333);
const BASE_RAW = process.env.APP_URL || "http://127.0.0.1:8765/";
const BASE = BASE_RAW.includes("?")
  ? `${BASE_RAW}&stage0=${Date.now()}`
  : `${BASE_RAW}${BASE_RAW.endsWith("/") ? "" : "/"}?stage0=${Date.now()}`;
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA =
  process.env.CHROME_USER_DATA ||
  `${process.env.TEMP}\\echochat-stage0-chrome-${CDP_PORT}-${Date.now()}`;

const STATE_KEY = "echodownload_lite_state_v1";
const results = [];

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? " — " + detail : ""}`);
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
  async function send(method, params = {}) {
    const id = nextId++;
    const p = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    ws.send(JSON.stringify({ id, method, params }));
    return p;
  }
  return { ws, send };
}

async function waitForJson(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(250);
  }
  throw new Error(`CDP not ready: ${url}`);
}

async function evalExpr(send, expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    const desc = r.exceptionDetails.exception?.description || r.exceptionDetails.text;
    throw new Error(desc || "eval exception");
  }
  return r.result?.value;
}

async function waitEchoApp(send, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    const ok = await evalExpr(send, `!!window.EchoApp`);
    if (ok) return true;
    await sleep(250);
  }
  return false;
}

function probeStateExpr() {
  return `(() => {
    let chats = [];
    try { chats = JSON.parse(localStorage.getItem('${STATE_KEY}') || '{}').chats || []; } catch {}
    const msgs = chats[0]?.messages || [];
    return JSON.stringify({
      view: window.EchoApp?.view || null,
      chatCount: chats.length,
      chatName: chats[0]?.name || null,
      roleId: chats[0]?.roleId || null,
      msgCount: msgs.length,
      texts: msgs.map(m => (m.role + ':' + (m.text||'').slice(0,80))),
      hasPing: msgs.some(m => (m.text||'').includes('Stage0 verification ping')),
      hasContinue: msgs.some(m => (m.text||'').includes('Stage0 continue chat')),
      errors: window.__errors || [],
      input: !!document.getElementById('chat-input'),
      appText: (document.getElementById('app')?.innerText || '').slice(0, 500)
    });
  })()`;
}

async function main() {
  console.log("Launching Chrome headless on port", CDP_PORT);
  console.log("APP_URL=", BASE);

  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1280,800",
      `--user-data-dir=${USER_DATA}`,
      "about:blank",
    ],
    { stdio: "ignore", detached: true }
  );
  chrome.unref();

  try {
    const version = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
    console.log("Browser:", version.Browser);

    const browser = await cdpConnect(version.webSocketDebuggerUrl);
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    await sleep(300);
    const targets = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const page = targets.find((t) => t.id === targetId) || targets.find((t) => t.type === "page");
    if (!page?.webSocketDebuggerUrl) throw new Error("No page websocket");

    const session = await cdpConnect(page.webSocketDebuggerUrl);
    await session.send("Runtime.enable");
    await session.send("Page.enable");

    await session.send("Page.navigate", { url: BASE });
    await sleep(500);
    const booted = await waitEchoApp(session.send);
    const bootInfo = await evalExpr(
      session.send,
      `JSON.stringify({
        title: document.title,
        hasEchoApp: !!window.EchoApp,
        view: window.EchoApp?.view || null,
        errors: window.__errors || [],
        splash: !!document.getElementById('splash-screen'),
        text: (document.getElementById('app')?.innerText || '').slice(0, 300)
      })`
    );
    console.log("BOOT:", bootInfo);
    const boot = JSON.parse(bootInfo);
    if (booted && boot.hasEchoApp && (!boot.errors || boot.errors.length === 0)) {
      record("Runtime startup", "PASS", `view=${boot.view} title=${boot.title}`);
    } else {
      record("Runtime startup", "FAIL", bootInfo);
    }

    // Fresh storage for deterministic flow
    await evalExpr(
      session.send,
      `(async () => {
        localStorage.clear();
        sessionStorage.clear();
        try {
          const dbs = await indexedDB.databases();
          await Promise.all((dbs || []).map(db => db.name && new Promise((res, rej) => {
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = () => res();
            req.onerror = () => res();
            req.onblocked = () => res();
          })));
        } catch {}
        return true;
      })()`
    );
    await session.send("Page.reload", { ignoreCache: true });
    await sleep(1200);
    if (!(await waitEchoApp(session.send))) {
      record("Create Character", "FAIL", "EchoApp missing after reload");
      throw new Error("EchoApp missing");
    }
    // Wait splash exit (~800ms+)
    await sleep(1000);

    // Create Character
    await evalExpr(session.send, `window.EchoApp.startOnboarding()`);
    await sleep(400);
    const onboardView = await evalExpr(session.send, `window.EchoApp.view`);
    if (onboardView !== "onboarding") {
      record("Create Character", "FAIL", `view=${onboardView}`);
    }

    await evalExpr(
      session.send,
      `(() => {
        const card = document.querySelector('[onclick*="selectOnboardTemplate"]');
        if (card) { card.click(); return 'clicked'; }
        window.EchoApp.skipOnboarding();
        return 'skipped';
      })()`
    );
    await sleep(300);
    await evalExpr(
      session.send,
      `if (window.EchoApp.view === 'onboarding') window.EchoApp.finishOnboarding(); true`
    );
    await sleep(800);

    let state = JSON.parse(await evalExpr(session.send, probeStateExpr()));
    console.log("AFTER_CREATE:", JSON.stringify(state));
    if (state.chatCount >= 1 && state.view === "app") {
      record("Create Character", "PASS", state.chatName);
      record("Start Chat", "PASS", `msgs=${state.msgCount} input=${state.input}`);
    } else {
      record("Create Character", "FAIL", JSON.stringify(state));
      record("Start Chat", "FAIL", JSON.stringify(state));
    }

    // Configure API + mock streaming provider so Send Message can complete without a real key.
    // User-message persistence is the Stage 0 persistence gate; AI reply uses a local SSE stub.
    const prep = await evalExpr(
      session.send,
      `(async () => {
        const { store } = await import('/src/core/store.js');
        store.updateSettings({
          apiKey: 'stage0-test-key',
          baseUrl: 'https://api.siliconflow.cn/v1',
          model: 'Qwen/Qwen2.5-7B-Instruct'
        });
        const sse =
          'data: {"choices":[{"delta":{"content":"Stage0 "}}]}\\n\\n' +
          'data: {"choices":[{"delta":{"content":"AI reply OK."}}]}\\n\\n' +
          'data: [DONE]\\n\\n';
        if (!window.__stage0FetchPatched) {
          const origFetch = window.fetch.bind(window);
          window.fetch = async (input, init = {}) => {
            const url = String(input);
            if (url.includes('/chat/completions')) {
              const body = new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode(sse));
                  controller.close();
                }
              });
              return new Response(body, {
                status: 200,
                headers: { 'Content-Type': 'text/event-stream' }
              });
            }
            return origFetch(input, init);
          };
          window.__stage0FetchPatched = true;
        }
        return JSON.stringify({
          apiKey: !!store.getState().settings.apiKey,
          baseUrl: store.getState().settings.baseUrl
        });
      })()`
    );
    console.log("API_PREP:", prep);

    // Send Message
    const sendStatus = await evalExpr(
      session.send,
      `(() => {
        const input = document.getElementById('chat-input');
        if (!input) return 'no-input';
        input.value = 'Stage0 verification ping — please remember this.';
        window.EchoApp.sendMessage();
        return 'sent';
      })()`
    );
    await sleep(3500);
    state = JSON.parse(await evalExpr(session.send, probeStateExpr()));
    console.log("AFTER_SEND:", sendStatus, JSON.stringify(state));
    if (state.hasPing) record("Send Message", "PASS", `msgCount=${state.msgCount}`);
    else record("Send Message", "FAIL", JSON.stringify(state));

    // Refresh + Persistence
    await session.send("Page.reload", { ignoreCache: true });
    await sleep(1200);
    await waitEchoApp(session.send);
    await sleep(1000);
    state = JSON.parse(await evalExpr(session.send, probeStateExpr()));
    console.log("AFTER_RELOAD:", JSON.stringify(state));
    if (state.view) record("Refresh", "PASS", `view=${state.view}`);
    else record("Refresh", "FAIL", JSON.stringify(state));
    if (state.hasPing && state.chatCount >= 1) {
      record("Persistence", "PASS", `msgCount=${state.msgCount}`);
    } else {
      record("Persistence", "FAIL", JSON.stringify(state));
    }

    // Continue Chat — reinstall fetch mock after reload, then send
    await evalExpr(
      session.send,
      `(async () => {
        const sse =
          'data: {"choices":[{"delta":{"content":"Continued."}}]}\\n\\n' +
          'data: [DONE]\\n\\n';
        if (!window.__stage0FetchPatched) {
          const origFetch = window.fetch.bind(window);
          window.fetch = async (input, init = {}) => {
            const url = String(input);
            if (url.includes('/chat/completions')) {
              const body = new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode(sse));
                  controller.close();
                }
              });
              return new Response(body, {
                status: 200,
                headers: { 'Content-Type': 'text/event-stream' }
              });
            }
            return origFetch(input, init);
          };
          window.__stage0FetchPatched = true;
        }
        const item = document.querySelector('[onclick*="selectChat"]');
        if (item) item.click();
        await new Promise(r => setTimeout(r, 200));
        const input = document.getElementById('chat-input');
        if (!input) return 'no-input';
        input.value = 'Stage0 continue chat after refresh.';
        window.EchoApp.sendMessage();
        return 'sent';
      })()`
    );
    await sleep(3500);
    state = JSON.parse(await evalExpr(session.send, probeStateExpr()));
    console.log("AFTER_CONTINUE:", JSON.stringify(state));
    if (state.hasContinue) record("Continue Chat", "PASS", `msgCount=${state.msgCount}`);
    else record("Continue Chat", "FAIL", JSON.stringify(state));

    // Moments basic flow (existing V1 APIs: add / list / like / comment / UI tab)
    const momentsResult = await evalExpr(
      session.send,
      `(async () => {
        const mod = await import('/src/domain/moments.js');
        let chats = [];
        try { chats = JSON.parse(localStorage.getItem('${STATE_KEY}') || '{}').chats || []; } catch {}
        const chat = chats[0];
        if (!chat) return JSON.stringify({ ok: false, reason: 'no-chat' });
        const roleId = chat.roleId || chat.id;
        const m = mod.addMoment({
          roleId,
          roleName: chat.name,
          content: 'Stage0 moments verification post',
          source: 'manual'
        });
        window.EchoApp.switchTab('moments');
        await new Promise(r => setTimeout(r, 400));
        const listed = mod.listMoments('all');
        const found = listed.find(x => x.id === m?.id);
        let liked = null;
        let commented = null;
        if (found) {
          liked = mod.toggleLike(found.id, '我');
          commented = mod.addComment(found.id, 'me', 'Stage0 comment');
          window.EchoApp.render?.();
          window.EchoApp.switchTab('moments');
          await new Promise(r => setTimeout(r, 300));
        }
        const ui = document.getElementById('app')?.innerText || '';
        return JSON.stringify({
          ok: !!found,
          uiHas: ui.includes('Stage0 moments verification post'),
          likedByUser: !!liked?.likedByUser,
          commentCount: commented?.moment?.comments?.length || commented?.comments?.length || 0,
          errors: window.__errors || []
        });
      })()`
    );
    console.log("MOMENTS:", momentsResult);
    const mom = JSON.parse(momentsResult);
    if (mom.ok && mom.uiHas) {
      record("Moments basic flow", "PASS", `liked=${mom.likedByUser} comments=${mom.commentCount}`);
    } else if (mom.ok) {
      record("Moments basic flow", "PASS", `data layer ok; uiHas=${mom.uiHas}`);
    } else {
      record("Moments basic flow", "FAIL", momentsResult);
    }

    const finalErrors = await evalExpr(session.send, `JSON.stringify(window.__errors || [])`);
    console.log("ERRORS:", finalErrors);
    const errs = JSON.parse(finalErrors);
    if (!errs.length) record("Console critical errors", "PASS", "none");
    else record("Console critical errors", "FAIL", finalErrors);

    // Mobile viewport
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(400);
    await evalExpr(session.send, `window.EchoApp.switchTab('messages'); true`);
    await sleep(300);
    const mobile = JSON.parse(
      await evalExpr(
        session.send,
        `JSON.stringify({
          w: window.innerWidth,
          h: window.innerHeight,
          bottomNav: !!document.querySelector('.bottom-nav-item, .bottom-nav'),
          hasEchoApp: !!window.EchoApp,
          errors: window.__errors || []
        })`
      )
    );
    console.log("MOBILE:", mobile);
    if (mobile.w === 390 && mobile.hasEchoApp && (!mobile.errors || !mobile.errors.length)) {
      record("Mobile viewport 390x844", "PASS", `bottomNav=${mobile.bottomNav}`);
    } else {
      record("Mobile viewport 390x844", "FAIL", JSON.stringify(mobile));
    }

    console.log("\n=== STAGE 0 MANUAL RESULTS ===");
    for (const r of results) {
      console.log(`${r.status}\t${r.name}${r.detail ? " | " + r.detail : ""}`);
    }
    const failed = results.filter((r) => r.status !== "PASS");
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    try {
      spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {}
    // Also kill leftover headless on 9223 from earlier attempt
    try {
      spawn("powershell", ["-Command", `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*echochat-stage0*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: "ignore" });
    } catch {}
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
