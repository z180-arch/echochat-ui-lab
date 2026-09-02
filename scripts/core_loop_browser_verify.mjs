/**
 * Core loop browser verification: memory candidates, relationship empty state, isolation.
 * Usage: $env:APP_URL='http://127.0.0.1:8772/'; $env:CDP_PORT='9337'; node scripts/core_loop_browser_verify.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CDP_PORT = Number(process.env.CDP_PORT || 9337);
const BASE_RAW = process.env.APP_URL || "http://127.0.0.1:8772/";
const BASE = BASE_RAW.includes("?")
  ? `${BASE_RAW}&loop=${Date.now()}`
  : `${BASE_RAW}${BASE_RAW.endsWith("/") ? "" : "/"}?loop=${Date.now()}`;
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA =
  process.env.CHROME_USER_DATA ||
  `${process.env.TEMP}\\echochat-loop-chrome-${CDP_PORT}-${Date.now()}`;

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

async function main() {
  console.log("Launching Chrome headless on port", CDP_PORT);
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
    const browser = await cdpConnect(version.webSocketDebuggerUrl);
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    await sleep(300);
    const targets = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const page = targets.find((t) => t.id === targetId) || targets.find((t) => t.type === "page");
    const session = await cdpConnect(page.webSocketDebuggerUrl);
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await session.send("Page.navigate", { url: BASE });
    if (!(await waitEchoApp(session.send))) throw new Error("EchoApp missing");
    record("Runtime startup", "PASS");

    await evalExpr(
      session.send,
      `(async () => {
        localStorage.clear();
        sessionStorage.clear();
        try {
          const dbs = await indexedDB.databases();
          await Promise.all((dbs || []).map((db) => db.name && new Promise((res) => {
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
    await waitEchoApp(session.send);
    await sleep(1000);

    await evalExpr(
      session.send,
      `(async () => {
        const { createFromTemplate } = await import('/src/domain/persona.js');
        const { storage, KEYS } = await import('/src/core/storage.js');
        await createFromTemplate({
          name: '橘小喵',
          persona: '傲娇，毒舌但心软。',
          firstMessage: '……你怎么突然找我。有事就说，没事我还要补觉。',
          avatar: 'assets/avatars/juzi.svg'
        });
        storage.setRaw(KEYS.ONBOARD_DONE, '1');
        window.EchoApp.view = 'app';
        window.EchoApp.render();
        return true;
      })()`
    );
    await sleep(900);
    await evalExpr(session.send, `window.EchoApp.switchTab('companion'); true`);
    await sleep(400);

    const emptyRel = JSON.parse(
      await evalExpr(
        session.send,
        `(async () => {
          const { listCharactersForHub } = await import('/src/domain/character-hub.js');
          const hub = listCharactersForHub();
          if (hub[0]) window.EchoApp.selectCharacter(hub[0].id);
          await new Promise(r => setTimeout(r, 300));
          const text = document.getElementById('app')?.innerText || '';
          return JSON.stringify({
            emptyRel: /还没有聊过/.test(text),
            extractBtn: /从对话提取/.test(text),
            name: hub[0]?.name || null
          });
        })()`
      )
    );
    if (emptyRel.emptyRel && emptyRel.extractBtn) record("Empty relationship + extract entry", "PASS", emptyRel.name);
    else record("Empty relationship + extract entry", "FAIL", JSON.stringify(emptyRel));

    const seeded = JSON.parse(
      await evalExpr(
        session.send,
        `(async () => {
          const { store } = await import('/src/core/store.js');
          const { messageStore } = await import('/src/domain/message-store.js');
          const { createFromTemplate } = await import('/src/domain/persona.js');
          const chat = store.getState().chats[0];
          await messageStore.addMessage(chat.id, { role: 'me', text: '我喜欢晚上散步，讨厌香菜。', status: 'sent' });
          await messageStore.addMessage(chat.id, { role: 'her', text: '记下了。', status: 'sent' });
          await messageStore.addMessage(chat.id, { role: 'me', text: '我在上海工作。', status: 'sent' });
          const other = await createFromTemplate({ name: '白若', persona: '清冷', firstMessage: '来了。' });
          await messageStore.addMessage(other.id, { role: 'me', text: '我只喝冰美式。', status: 'sent' });
          window.EchoApp.selectCharacter(chat.roleId);
          window.EchoApp.openMemoryCandidates(chat.roleId, chat.id);
          await new Promise(r => setTimeout(r, 300));
          const body = document.querySelector('.modal-body')?.innerText || '';
          return JSON.stringify({
            modal: !!document.querySelector('.modal-overlay'),
            hasSpice: /香菜/.test(body),
            noAmericano: !/冰美式/.test(body),
            roleId: chat.roleId,
            otherId: other.roleId
          });
        })()`
      )
    );
    console.log("EXTRACT:", JSON.stringify(seeded));
    if (seeded.modal && seeded.hasSpice && seeded.noAmericano) {
      record("Extract candidates isolated to character", "PASS");
    } else {
      record("Extract candidates isolated to character", "FAIL", JSON.stringify(seeded));
    }

    await evalExpr(session.send, `window.EchoApp.memoryCandidateConfirm()`);
    await sleep(500);

    const after = JSON.parse(
      await evalExpr(
        session.send,
        `(async () => {
          const { getMemoryList } = await import('/src/domain/memory.js');
          const { listMoments } = await import('/src/domain/moments.js');
          const data = ${JSON.stringify({ roleId: seeded.roleId, otherId: seeded.otherId })};
          window.EchoApp.selectCharacter(data.roleId);
          await new Promise(r => setTimeout(r, 250));
          const text = document.getElementById('app')?.innerText || '';
          return JSON.stringify({
            memA: getMemoryList(data.roleId).map(m => m.content),
            memB: getMemoryList(data.otherId).map(m => m.content),
            momentsA: listMoments(data.roleId).length,
            momentsB: listMoments(data.otherId).length,
            visible: /香菜|上海/.test(text),
            modalGone: !document.querySelector('.modal-overlay')
          });
        })()`
      )
    );
    console.log("AFTER:", JSON.stringify(after));
    if (
      after.memA.some((t) => /香菜|上海/.test(t)) &&
      after.memB.length === 0 &&
      after.momentsA >= 1 &&
      after.momentsB === 0 &&
      after.visible &&
      after.modalGone
    ) {
      record("Confirm memory + moment isolation", "PASS", `mem=${after.memA.length} moments=${after.momentsA}`);
    } else {
      record("Confirm memory + moment isolation", "FAIL", JSON.stringify(after));
    }

    await session.send("Page.reload", { ignoreCache: true });
    await sleep(1400);
    await waitEchoApp(session.send);
    await sleep(900);
    const reloaded = JSON.parse(
      await evalExpr(
        session.send,
        `(async () => {
          const { getMemoryList } = await import('/src/domain/memory.js');
          const { store } = await import('/src/core/store.js');
          const chats = store.getState().chats || [];
          let hasFact = false;
          let n = 0;
          for (const c of chats) {
            const mems = getMemoryList(c.roleId);
            if (mems.some((m) => /香菜|上海/.test(m.content))) {
              hasFact = true;
              n = mems.length;
            }
          }
          return JSON.stringify({ n, hasFact });
        })()`
      )
    );
    if (reloaded.hasFact) record("Reload persists extracted memory", "PASS", `n=${reloaded.n}`);
    else record("Reload persists extracted memory", "FAIL", JSON.stringify(reloaded));

    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(400);
    const mobile = JSON.parse(
      await evalExpr(
        session.send,
        `(async () => {
          window.EchoApp.switchTab('companion');
          const { store } = await import('/src/core/store.js');
          const id = store.getState().chats[0]?.roleId;
          if (id) window.EchoApp.selectCharacter(id);
          await new Promise(r => setTimeout(r, 250));
          window.EchoApp.openMemoryCandidates(id);
          await new Promise(r => setTimeout(r, 250));
          return JSON.stringify({
            w: window.innerWidth,
            modal: !!document.querySelector('.modal-overlay'),
            errors: window.__errors || []
          });
        })()`
      )
    );
    if (mobile.w === 390 && mobile.modal && !(mobile.errors || []).length) {
      record("Mobile memory extract 390x844", "PASS");
    } else {
      record("Mobile memory extract 390x844", "FAIL", JSON.stringify(mobile));
    }

    console.log("\n=== CORE LOOP BROWSER RESULTS ===");
    for (const r of results) console.log(`${r.status}\t${r.name}${r.detail ? " | " + r.detail : ""}`);
    process.exitCode = results.some((r) => r.status !== "PASS") ? 1 : 0;
  } finally {
    try {
      spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {}
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
