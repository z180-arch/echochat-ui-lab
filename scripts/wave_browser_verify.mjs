/**
 * Core Product Wave browser verification via Chrome DevTools Protocol.
 * Extends Stage 0 core flow with Dexie read-path, conversation, and character checks.
 *
 * Usage: node scripts/batch1_browser_verify.mjs
 * Requires: python -m http.server 8765 (or APP_URL)
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CDP_PORT = Number(process.env.CDP_PORT || 9335);
const BASE_RAW = process.env.APP_URL || "http://127.0.0.1:8765/";
const BASE = BASE_RAW.includes("?")
  ? `${BASE_RAW}&batch1=${Date.now()}`
  : `${BASE_RAW}${BASE_RAW.endsWith("/") ? "" : "/"}?batch1=${Date.now()}`;
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA =
  process.env.CHROME_USER_DATA ||
  `${process.env.TEMP}\\echochat-wave-chrome-${CDP_PORT}-${Date.now()}`;

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

async function waitEchoApp(send, attempts = 48) {
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
    const uiMsgs = Array.from(document.querySelectorAll('.msg-bubble')).map(el => (el.innerText || '').slice(0, 80));
    return JSON.stringify({
      view: window.EchoApp?.view || null,
      chatCount: chats.length,
      chatName: chats[0]?.name || null,
      roleId: chats[0]?.roleId || null,
      chatId: chats[0]?.id || null,
      msgCount: msgs.length,
      texts: msgs.map(m => (m.role + ':' + (m.text||'').slice(0,80))),
      hasPing: msgs.some(m => (m.text||'').includes('Batch1 verification ping')) || uiMsgs.some(t => t.includes('Batch1 verification ping')),
      hasContinue: msgs.some(m => (m.text||'').includes('Batch1 continue chat')) || uiMsgs.some(t => t.includes('Batch1 continue chat')),
      uiMsgCount: uiMsgs.length,
      errors: window.__errors || [],
      input: !!document.getElementById('chat-input'),
      appText: (document.getElementById('app')?.innerText || '').slice(0, 500)
    });
  })()`;
}

const dexieProbe = ` (async () => {
  const { getDb, TABLES } = await import('/src/infrastructure/dexie-db.js');
  const { messageStore } = await import('/src/domain/message-store.js');
  const { CharacterRepository } = await import('/src/repository/character.js');
  const { ConversationRepository } = await import('/src/repository/conversation.js');
  const db = await getDb();
  let chats = [];
  try { chats = JSON.parse(localStorage.getItem('${STATE_KEY}') || '{}').chats || []; } catch {}
  const chatId = chats[0]?.id;
  const roleId = chats[0]?.roleId;
  const dexieCount = chatId ? await db.table('messages').where('conversationId').equals(chatId).count() : 0;
  const read = chatId ? await messageStore.getMessages(chatId) : [];
  const conv = chatId ? await ConversationRepository.findById(chatId) : null;
  const char = roleId ? await CharacterRepository.findById(roleId) : null;
  const peeked = chatId ? messageStore.peekMessages(chatId) : [];
  return JSON.stringify({
    dexieCount,
    readCount: read.length,
    peekCount: peeked.length,
    first: read[0]?.text?.slice(0, 60) || null,
    last: read[read.length - 1]?.text?.slice(0, 60) || null,
    convTitle: conv?.title || null,
    charName: char?.name || null,
    charId: char?.id || null,
    orderOk: read.every((m, i) => i === 0 || (m.time || 0) >= (read[i - 1].time || 0))
  });
})() `;

const installFetchStub = `(async () => {
  const { store } = await import('/src/core/store.js');
  store.updateSettings({
    apiKey: 'batch1-test-key',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct'
  });
  const sse =
    'data: {"choices":[{"delta":{"content":"Batch1 AI reply OK."}}]}\\n\\n' +
    'data: [DONE]\\n\\n';
  if (!window.__batch1FetchPatched) {
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
    window.__batch1FetchPatched = true;
  }
  return true;
})()`;

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
    if (booted) record("Runtime startup", "PASS");
    else record("Runtime startup", "FAIL", "EchoApp missing");

    await evalExpr(
      session.send,
      `(async () => {
        localStorage.clear();
        sessionStorage.clear();
        try {
          const dbs = await indexedDB.databases();
          await Promise.all((dbs || []).map(db => db.name && new Promise((res) => {
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
    await sleep(1400);
    if (!(await waitEchoApp(session.send))) throw new Error("EchoApp missing after reload");
    await sleep(1200);

    await evalExpr(session.send, `window.EchoApp.startOnboarding()`);
    await sleep(400);
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
    await sleep(1200);

    let state = JSON.parse(await evalExpr(session.send, probeStateExpr()));
    console.log("AFTER_CREATE:", JSON.stringify(state));
    if (state.chatCount >= 1 && state.view === "app") {
      record("Create Character", "PASS", state.chatName);
      record("Start Chat", "PASS", `msgs=${state.msgCount} input=${state.input}`);
    } else {
      record("Create Character", "FAIL", JSON.stringify(state));
      record("Start Chat", "FAIL", JSON.stringify(state));
    }

    await evalExpr(session.send, installFetchStub);

    const sendStatus = await evalExpr(
      session.send,
      `(() => {
        const input = document.getElementById('chat-input');
        if (!input) return 'no-input';
        input.value = 'Batch1 verification ping — please remember this.';
        window.EchoApp.sendMessage();
        return 'sent';
      })()`
    );
    await sleep(3500);
    state = JSON.parse(await evalExpr(session.send, probeStateExpr()));
    console.log("AFTER_SEND:", sendStatus, JSON.stringify(state));
    if (state.hasPing) record("Send Message", "PASS", `msgCount=${state.msgCount} ui=${state.uiMsgCount}`);
    else record("Send Message", "FAIL", JSON.stringify(state));

    let dexie = JSON.parse(await evalExpr(session.send, dexieProbe));
    console.log("DEXIE_AFTER_SEND:", JSON.stringify(dexie));
    if (dexie.dexieCount >= 1 && dexie.readCount === dexie.dexieCount && dexie.orderOk) {
      record("Dexie canonical read", "PASS", `dexie=${dexie.dexieCount} read=${dexie.readCount} peek=${dexie.peekCount}`);
    } else {
      record("Dexie canonical read", "FAIL", JSON.stringify(dexie));
    }
    if (dexie.charName && dexie.convTitle) {
      record("Character+Conversation Dexie", "PASS", `${dexie.charName} / ${dexie.convTitle}`);
    } else {
      record("Character+Conversation Dexie", "FAIL", JSON.stringify(dexie));
    }

    await session.send("Page.reload", { ignoreCache: true });
    await sleep(1400);
    await waitEchoApp(session.send);
    await sleep(1400);
    state = JSON.parse(await evalExpr(session.send, probeStateExpr()));
    dexie = JSON.parse(await evalExpr(session.send, dexieProbe));
    console.log("AFTER_RELOAD:", JSON.stringify(state));
    console.log("DEXIE_AFTER_RELOAD:", JSON.stringify(dexie));
    if (state.view) record("Refresh", "PASS", `view=${state.view}`);
    else record("Refresh", "FAIL", JSON.stringify(state));
    if ((state.hasPing || dexie.readCount >= 2) && state.chatCount >= 1) {
      record("Persistence", "PASS", `legacyMsgs=${state.msgCount} dexie=${dexie.dexieCount} ui=${state.uiMsgCount}`);
    } else {
      record("Persistence", "FAIL", JSON.stringify({ state, dexie }));
    }

    await evalExpr(session.send, installFetchStub);
    await evalExpr(
      session.send,
      `(async () => {
        const item = document.querySelector('[onclick*="selectChat"]');
        if (item) item.click();
        await new Promise(r => setTimeout(r, 400));
        const input = document.getElementById('chat-input');
        if (!input) return 'no-input';
        input.value = 'Batch1 continue chat after refresh.';
        window.EchoApp.sendMessage();
        return 'sent';
      })()`
    );
    await sleep(3500);
    state = JSON.parse(await evalExpr(session.send, probeStateExpr()));
    if (state.hasContinue || (document && false)) record("Continue Chat", "PASS", `msgCount=${state.msgCount}`);
    else if (state.hasContinue === false) {
      const d2 = JSON.parse(await evalExpr(session.send, dexieProbe));
      if ((d2.last || "").includes("Batch1 continue") || (d2.readCount || 0) > (dexie.readCount || 0)) {
        record("Continue Chat", "PASS", `dexieRead=${d2.readCount}`);
      } else {
        record("Continue Chat", "FAIL", JSON.stringify({ state, d2 }));
      }
    }

    const longRun = JSON.parse(
      await evalExpr(
        session.send,
        `(async () => {
          const { store } = await import('/src/core/store.js');
          const { messageStore } = await import('/src/domain/message-store.js');
          const chat = store.getCurrentChat() || store.getState().chats[0];
          if (!chat) return JSON.stringify({ ok: false, reason: 'no-chat' });
          const t0 = performance.now();
          for (let i = 0; i < 50; i++) {
            await messageStore.addMessage(chat.id, {
              role: i % 2 === 0 ? 'me' : 'her',
              text: 'Batch1 long ' + i,
              status: 'sent'
            });
          }
          const insertMs = performance.now() - t0;
          const t1 = performance.now();
          const all = await messageStore.getMessages(chat.id);
          const readMs = performance.now() - t1;
          const { getDb } = await import('/src/infrastructure/dexie-db.js');
          const db = await getDb();
          const dexieCount = await db.table('messages').where('conversationId').equals(chat.id).count();
          window.EchoApp.render();
          return JSON.stringify({
            ok: true,
            total: all.length,
            dexieCount,
            insertMs,
            readMs,
            last: all[all.length - 1]?.text,
            orderOk: all.every((m, i) => i === 0 || (m.time || 0) >= (all[i - 1].time || 0))
          });
        })()`
      )
    );
    console.log("LONG_CONV:", JSON.stringify(longRun));
    if (longRun.ok && longRun.total >= 50 && longRun.dexieCount === longRun.total && longRun.orderOk) {
      record("Long conversation 50+", "PASS", `n=${longRun.total} insert=${longRun.insertMs?.toFixed?.(1)}ms read=${longRun.readMs?.toFixed?.(1)}ms`);
    } else {
      record("Long conversation 50+", "FAIL", JSON.stringify(longRun));
    }

    const emptyNew = JSON.parse(
      await evalExpr(
        session.send,
        `(async () => {
          const { store } = await import('/src/core/store.js');
          const { ConversationRepository } = await import('/src/repository/conversation.js');
          const { messageStore } = await import('/src/domain/message-store.js');
          const existing = store.getState().chats[0];
          const created = await ConversationRepository.create({
            characterId: existing.roleId,
            title: 'Batch1 sibling convo'
          });
          const msgs = await messageStore.getMessages(created.id);
          const listed = await ConversationRepository.findByCharacterId(existing.roleId);
          return JSON.stringify({
            newId: created.id,
            empty: msgs.length === 0,
            siblingCount: listed.length,
            oldStillThere: listed.some(c => c.id === existing.id)
          });
        })()`
      )
    );
    console.log("EMPTY_NEW:", JSON.stringify(emptyNew));
    if (emptyNew.empty && emptyNew.siblingCount >= 2 && emptyNew.oldStillThere) {
      record("New/empty conversation + switch list", "PASS", `siblings=${emptyNew.siblingCount}`);
    } else {
      record("New/empty conversation + switch list", "FAIL", JSON.stringify(emptyNew));
    }

    const finalErrors = await evalExpr(session.send, `JSON.stringify(window.__errors || [])`);
    const errs = JSON.parse(finalErrors);
    if (!errs.length) record("Console critical errors", "PASS", "none");
    else record("Console critical errors", "FAIL", finalErrors);

    await evalExpr(session.send, `window.EchoApp.switchTab('characters'); true`);
    await sleep(400);
    const hubUi = JSON.parse(
      await evalExpr(
        session.send,
        `(async () => {
          const { listCharactersForHub } = await import('/src/domain/character-hub.js');
          const { addMemory, getMemoryList } = await import('/src/domain/memory.js');
          const { store } = await import('/src/core/store.js');
          const hub = listCharactersForHub();
          const roleId = hub[0]?.id || store.getState().chats[0]?.roleId;
          if (roleId) {
            addMemory(roleId, 'Wave hub memory about tea', 8, 'manual');
            window.EchoApp.selectCharacter(roleId);
            await new Promise(r => setTimeout(r, 300));
          }
          const text = document.getElementById('app')?.innerText || '';
          return JSON.stringify({
            hubCount: hub.length,
            hasRoleTab: !!document.querySelector('[onclick*="characters"]'),
            selected: store.getState().ui.selectedCharacterId,
            identityVisible: /她是谁|性格|继续对话/.test(text),
            memoryCount: roleId ? getMemoryList(roleId).length : 0,
            errors: window.__errors || []
          });
        })()`
      )
    );
    console.log("HUB:", JSON.stringify(hubUi));
    if (hubUi.hubCount >= 1 && hubUi.hasRoleTab && hubUi.identityVisible && hubUi.memoryCount >= 1) {
      record("Character Hub + memory", "PASS", JSON.stringify(hubUi));
    } else {
      record("Character Hub + memory", "FAIL", JSON.stringify(hubUi));
    }

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
          hasEchoApp: !!window.EchoApp,
          bottomNav: !!document.querySelector('.bottom-nav-item, .bottom-nav'),
          errors: window.__errors || []
        })`
      )
    );
    if (mobile.w === 390 && mobile.hasEchoApp && (!mobile.errors || !mobile.errors.length)) {
      record("Mobile viewport 390x844", "PASS", `bottomNav=${mobile.bottomNav}`);
    } else {
      record("Mobile viewport 390x844", "FAIL", JSON.stringify(mobile));
    }

    console.log("\n=== WAVE BROWSER RESULTS ===");
    for (const r of results) {
      console.log(`${r.status}\t${r.name}${r.detail ? " | " + r.detail : ""}`);
    }
    const failed = results.filter((r) => r.status !== "PASS");
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    try {
      spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {}
    try {
      spawn(
        "powershell",
        [
          "-Command",
          `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*echochat-wave*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
        ],
        { stdio: "ignore" }
      );
    } catch {}
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
