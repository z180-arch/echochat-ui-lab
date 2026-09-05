/**
 * Character Reconstruction MVP — browser verification via CDP.
 * Usage: python -m http.server 8771
 *        $env:APP_URL='http://127.0.0.1:8771/app/'; $env:CDP_PORT='9336'; node scripts/reconstruction_browser_verify.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CDP_PORT = Number(process.env.CDP_PORT || 9336);
const BASE_RAW = process.env.APP_URL || "http://127.0.0.1:8771/app/";
const BASE = BASE_RAW.includes("?")
  ? `${BASE_RAW}&recon=${Date.now()}`
  : `${BASE_RAW}${BASE_RAW.endsWith("/") ? "" : "/"}?recon=${Date.now()}`;
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA =
  process.env.CHROME_USER_DATA ||
  `${process.env.TEMP}\\echochat-recon-chrome-${CDP_PORT}-${Date.now()}`;

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

const RICH_LOG = `林晚: 我是咖啡店的店员，以前在上海上学。
我: 今天想吃火锅吗？
林晚: 讨厌香菜，爱吃甜的。
我: 我们下周见面吧。
林晚: 好啊，我经常晚上散步。
林晚: 每次加班回来都想喝热可可。
林晚: 嗯嗯，我在呢。
林晚: 想你了。
我: 我也想你。我喜欢你做的可可。
林晚: 那今晚见。`;

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
    if (!(await waitEchoApp(session.send))) throw new Error("EchoApp missing after reload");
    await sleep(1000);

    await evalExpr(session.send, `window.EchoApp.skipOnboarding(); true`);
    await sleep(800);

    const before = JSON.parse(
      await evalExpr(
        session.send,
        `(async () => {
          const { listCharactersForHub } = await import('/src/domain/character-hub.js');
          const hub = listCharactersForHub();
          return JSON.stringify({ hub: hub.map(h => h.name), count: hub.length });
        })()`
      )
    );
    if (before.count >= 1) record("Existing character before reconstruct", "PASS", before.hub.join(","));
    else record("Existing character before reconstruct", "FAIL", JSON.stringify(before));

    await evalExpr(session.send, `window.EchoApp.openReconstruction(); true`);
    await sleep(300);
    const jsonReject = JSON.parse(
      await evalExpr(
        session.send,
        `(() => {
          const el = document.getElementById('recon-paste');
          if (!el) return JSON.stringify({ ok: false, reason: 'no-paste' });
          el.value = JSON.stringify({ spec: 'chara_card_v2', data: { name: '假角色' } });
          window.EchoApp.reconstructionParse();
          const body = document.querySelector('.modal-body')?.innerText || '';
          return JSON.stringify({ ok: true, body: body.slice(0, 180), hasWarn: /没有识别|角色卡/.test(body) });
        })()`
      )
    );
    if (jsonReject.hasWarn) record("JSON card rejected in UI", "PASS");
    else record("JSON card rejected in UI", "FAIL", JSON.stringify(jsonReject));

    const parsed = JSON.parse(
      await evalExpr(
        session.send,
        `(() => {
          const log = ${JSON.stringify(RICH_LOG)};
          const el = document.getElementById('recon-paste') || (() => { window.EchoApp.openReconstruction(); return document.getElementById('recon-paste'); })();
          if (!el) return JSON.stringify({ ok: false, reason: 'no-paste' });
          el.value = log;
          window.EchoApp.reconstructionParse();
          const body = document.querySelector('.modal-body')?.innerText || '';
          return JSON.stringify({
            ok: true,
            hasName: !!document.getElementById('recon-name'),
            name: document.getElementById('recon-name')?.value || '',
            hasEvidence: /依据：/.test(body),
            hasPref: /香菜|偏好/.test(body)
          });
        })()`
      )
    );
    console.log("REVIEW:", JSON.stringify(parsed));
    if (parsed.hasName && parsed.name === "林晚" && parsed.hasEvidence) {
      record("Parse + review with evidence", "PASS", parsed.name);
    } else {
      record("Parse + review with evidence", "FAIL", JSON.stringify(parsed));
    }

    await evalExpr(session.send, `window.EchoApp.reconstructionConfirm()`);
    await sleep(400);

    const after = JSON.parse(
      await evalExpr(
        session.send,
        `(async () => {
          const { listCharactersForHub } = await import('/src/domain/character-hub.js');
          const { Character } = await import('/src/domain/character.js');
          const { store } = await import('/src/core/store.js');
          const hub = listCharactersForHub();
          const rebuilt = hub.find(h => h.name === '林晚');
          const char = rebuilt ? await Character.getCharacterById(rebuilt.id) : null;
          const text = document.getElementById('app')?.innerText || '';
          return JSON.stringify({
            hubCount: hub.length,
            names: hub.map(h => h.name),
            source: char?.source || null,
            identity: (char?.identity || '').slice(0, 80),
            selected: store.getState().ui.selectedCharacterId,
            detailVisible: /继续对话|她是谁/.test(text),
            modalGone: !document.querySelector('.modal-overlay')
          });
        })()`
      )
    );
    console.log("AFTER_CONFIRM:", JSON.stringify(after));
    if (after.hubCount >= 2 && after.names.includes("林晚") && after.source === "reconstructed" && after.modalGone) {
      record("Confirm creates reconstructed character", "PASS", after.names.join(","));
    } else {
      record("Confirm creates reconstructed character", "FAIL", JSON.stringify(after));
    }
    if (after.names.length >= 2 && after.names.some((n) => n !== "林晚")) {
      record("Existing character preserved", "PASS", after.names.join(","));
    } else {
      record("Existing character preserved", "FAIL", JSON.stringify(after));
    }

    const chatOk = JSON.parse(
      await evalExpr(
        session.send,
        `(async () => {
          const { listCharactersForHub } = await import('/src/domain/character-hub.js');
          const hub = listCharactersForHub();
          const rebuilt = hub.find(h => h.name === '林晚');
          if (!rebuilt) return JSON.stringify({ ok: false });
          window.EchoApp.continueCharacter(rebuilt.id);
          await new Promise(r => setTimeout(r, 500));
          return JSON.stringify({
            ok: !!document.getElementById('chat-input'),
            header: (document.querySelector('.chat-header-name')?.innerText || '').trim()
          });
        })()`
      )
    );
    if (chatOk.ok) record("Reconstructed character can enter chat", "PASS", chatOk.header);
    else record("Reconstructed character can enter chat", "FAIL", JSON.stringify(chatOk));

    await session.send("Page.reload", { ignoreCache: true });
    await sleep(1400);
    await waitEchoApp(session.send);
    await sleep(1000);
    const reloaded = JSON.parse(
      await evalExpr(
        session.send,
        `(async () => {
          const { listCharactersForHub } = await import('/src/domain/character-hub.js');
          const { Character } = await import('/src/domain/character.js');
          const hub = listCharactersForHub();
          const rebuilt = hub.find(h => h.name === '林晚');
          const char = rebuilt ? await Character.getCharacterById(rebuilt.id) : null;
          return JSON.stringify({
            hubCount: hub.length,
            source: char?.source || null,
            hasLinwan: !!rebuilt
          });
        })()`
      )
    );
    if (reloaded.hasLinwan && reloaded.source === "reconstructed") {
      record("Reload preserves reconstructed character", "PASS", `hub=${reloaded.hubCount}`);
    } else {
      record("Reload preserves reconstructed character", "FAIL", JSON.stringify(reloaded));
    }

    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(400);
    await evalExpr(session.send, `window.EchoApp.switchTab('characters'); window.EchoApp.openReconstruction(); true`);
    await sleep(400);
    const mobile = JSON.parse(
      await evalExpr(
        session.send,
        `JSON.stringify({
          w: window.innerWidth,
          paste: !!document.getElementById('recon-paste'),
          modal: !!document.querySelector('.modal-overlay'),
          errors: window.__errors || []
        })`
      )
    );
    if (mobile.w === 390 && mobile.paste && mobile.modal && !(mobile.errors || []).length) {
      record("Mobile reconstruction entry 390x844", "PASS");
    } else {
      record("Mobile reconstruction entry 390x844", "FAIL", JSON.stringify(mobile));
    }

    await evalExpr(session.send, `window.EchoApp._closeReconstruction(); true`);

    console.log("\n=== RECONSTRUCTION BROWSER RESULTS ===");
    for (const r of results) {
      console.log(`${r.status}\t${r.name}${r.detail ? " | " + r.detail : ""}`);
    }
    process.exitCode = results.some((r) => r.status !== "PASS") ? 1 : 0;
  } finally {
    try {
      spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {}
    try {
      spawn(
        "powershell",
        [
          "-Command",
          `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*echochat-recon*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
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
