/**
 * Wave 4 surface checks at 390 / 1024 / 1200 / 1280 / 1440,
 * plus Wave 2 grouping / Wave 3A shell / Wave 3B hub regressions.
 * Isolated Chrome profile. Usage: node scripts/wave4_ui_verify.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9422);
const HTTP_PORT = Number(process.env.APP_PORT || 8802);
const BASE = `http://127.0.0.1:${HTTP_PORT}/`;
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  throw new Error("Chrome not found. Set CHROME_PATH to a Chrome/Chromium binary.");
}
const USER_DATA = process.env.CHROME_USER_DATA || join(tmpdir(), `echochat-wave4-${Date.now()}`);
const WSImpl = globalThis.WebSocket || (await import("undici")).WebSocket;
const OUT = join(ROOT, ".tmp-shots");
const LONG_CJK = "这是一段很长的中文回复，用来确认气泡会正常换行而不会把页面撑出横向滚动。".repeat(4);

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
    if (msg.method === "Runtime.exceptionThrown") {
      const text = msg.params?.exceptionDetails?.text || msg.params?.exceptionDetails?.exception?.description || "exception";
      consoleErrors.push(text);
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
      const text = (msg.params.args || []).map((a) => a.value || a.description || "").join(" ");
      if (text) consoleErrors.push(text);
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
  const { messageStore } = await import('/src/domain/message-store.js');
  store.reset();
  store.updateSettings({ apiKey: 'sk-test-key', baseUrl: 'https://api.example.com/v1', model: 'x' });
  const chat = await createFromTemplate({ name: '林晚', persona: '温柔的咖啡店员', firstMessage: '第一段' });
  await createFromTemplate({ name: '周宁', persona: '安静的书店店员', firstMessage: '你好' });
  store.selectChat(chat.id);
  store.setActiveTab('companion');
  store.setProfileOpen(window.innerWidth >= 1280);
  await messageStore.addMessage(chat.id, { role: 'her', text: '第二段', status: 'sent' });
  await messageStore.addMessage(chat.id, { role: 'me', text: '我在听', status: 'sent' });
  await messageStore.addMessage(chat.id, { role: 'her', text: ${JSON.stringify(LONG_CJK)}, status: 'sent' });
  storage.setRaw(KEYS.ONBOARD_DONE, '1');
  window.EchoApp.view = 'app';
  window.EchoApp.render();
  return { chatId: chat.id };
})())()`;

const SNAP = `(() => {
  const overflowDoc = document.documentElement.scrollWidth > window.innerWidth + 2;
  const shell = document.querySelector('.app-shell');
  const overflowShell = !!(shell && shell.scrollWidth > shell.clientWidth + 2);
  const item = document.querySelector('.list-item');
  const inbox = document.querySelector('.inbox-head');
  const subtitle = document.querySelector('.list-item-subtitle');
  const profile = document.querySelector('.profile-pane');
  const status = document.querySelector('.profile-status');
  const tools = document.querySelector('.profile-tools');
  const folds = [...document.querySelectorAll('.profile-fold')];
  const more = folds.find((el) => /更多/.test(el.querySelector('summary')?.innerText || ''));
  const rail = document.querySelector('.nav-rail');
  const list = document.querySelector('.list-pane');
  const chat = document.querySelector('.chat-pane');
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(el).display, position: getComputedStyle(el).position };
  };
  return {
    vw: window.innerWidth,
    overflowX: overflowDoc || overflowShell,
    rail: box(rail),
    list: box(list),
    chat: box(chat),
    profile: box(profile),
    profileOpen: !!profile,
    inboxPadTop: inbox ? parseFloat(getComputedStyle(inbox).paddingTop) : 0,
    listH: item ? Math.round(item.getBoundingClientRect().height) : 0,
    avatarW: (() => {
      const av = document.querySelector('.list-item-av .character-avatar, .list-item-av .avatar');
      return av ? Math.round(av.getBoundingClientRect().width) : 0;
    })(),
    subtitle: (subtitle?.textContent || '').trim(),
    hubChip: !!document.querySelector('.list-item-meta'),
    groupedAi: (() => {
      const hers = [...document.querySelectorAll('.msg.msg-her:not(.msg-error)')];
      return !!(hers[0]?.querySelector('.msg-avatar-btn') && hers[1] && !hers[1].querySelector('.msg-avatar-btn'));
    })(),
    profileStatus: (status?.innerText || '').trim(),
    profileStatusHasDays: /相处/.test(status?.innerText || ''),
    exportInTools: !!(tools && /导出/.test(tools.innerText || '')),
    exportInMore: !!(more && /导出角色卡/.test(more.innerHTML || '')),
    profileHasHome: !!(profile && /关于 TA/.test(profile.innerText) && /关系/.test(profile.innerText)),
  };
})()`;

const ME_SNAP = `(() => {
  const overflowDoc = document.documentElement.scrollWidth > window.innerWidth + 2;
  const groups = [...document.querySelectorAll('.me-settings-group')];
  const rows = [...document.querySelectorAll('.me-settings-item')];
  const titles = groups.map((g) => (g.querySelector('.me-settings-group-title')?.textContent || '').trim());
  return {
    overflowX: overflowDoc,
    groupCount: groups.length,
    titles,
    rowMin: rows.length
      ? Math.min(...rows.map((r) => Math.round(r.getBoundingClientRect().height)))
      : 0,
    rowCount: rows.length,
    profileCard: !!document.querySelector('.me-profile'),
  };
})()`;

const EMPTY_SNAP = `(() => {
  const empty = document.querySelector('.empty-state');
  if (!empty) return { present: false };
  const titles = empty.querySelectorAll('.empty-title');
  const descs = empty.querySelectorAll('.empty-desc');
  const btns = empty.querySelectorAll('.btn');
  const overflowDoc = document.documentElement.scrollWidth > window.innerWidth + 2;
  return {
    present: true,
    overflowX: overflowDoc,
    title: (titles[0]?.textContent || '').trim(),
    desc: (descs[0]?.textContent || '').trim(),
    titleCount: titles.length,
    descCount: descs.length,
    btnCount: btns.length,
    primary: btns[0]?.classList.contains('btn-primary') || false,
  };
})()`;

const BRING_SNAP = `(() => {
  const overlay = document.querySelector('.modal-overlay');
  const cards = [...document.querySelectorAll('.create-card')];
  const importCard = cards.find((c) => /导入角色卡/.test(c.innerText || ''));
  const onclick = importCard?.getAttribute('onclick') || '';
  const titles = cards.map((c) => (c.querySelector('.create-card-title')?.textContent || '').trim());
  const iconsOk = cards.every((c) => {
    const ic = c.querySelector('.create-card-ic');
    return ic && ic.querySelector('svg');
  });
  const desc = cards[0]?.querySelector('.create-card-desc');
  const overflowDoc = document.documentElement.scrollWidth > window.innerWidth + 2;
  return {
    open: !!overlay,
    count: cards.length,
    titles,
    importKeeps: !!importCard && onclick.includes('importCharacterCard') && !onclick.includes('remove()'),
    iconsOk,
    descPx: desc ? parseFloat(getComputedStyle(desc).fontSize) : 0,
    overflowX: overflowDoc,
    cardMin: cards.length ? Math.min(...cards.map((c) => Math.round(c.getBoundingClientRect().height))) : 0,
  };
})()`;

const TEMPLATE_SNAP = `(() => {
  const cards = [...document.querySelectorAll('.create-card')];
  const iconsOk = cards.every((c) => {
    const ic = c.querySelector('.create-card-ic');
    return ic && ic.querySelector('svg');
  });
  return {
    count: cards.length,
    iconsOk,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
  };
})()`;

const WORLD_SNAP = `(() => {
  const body = document.querySelector('.modal-body');
  const text = body?.innerText || '';
  const empty = /还没有条目/.test(text);
  const shared = /对所有角色共用/.test(text);
  const next = /写好关键词和设定后点添加/.test(text);
  return {
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    shared,
    empty,
    next,
  };
})()`;

const VOICE_SNAP = `(() => {
  const rows = [...document.querySelectorAll('.setting-row')];
  const voice = rows.find((r) => /语音输入/.test(r.innerText || ''));
  const tts = rows.find((r) => /朗读回复/.test(r.innerText || ''));
  return {
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    voicePending: !!(voice && /即将支持/.test(voice.innerText || '')),
    voiceClickable: !!(voice && voice.getAttribute('onclick')),
    ttsClickable: !!(tts && tts.getAttribute('onclick')),
    voiceH: voice ? Math.round(voice.getBoundingClientRect().height) : 0,
  };
})()`;

const MEM_EMPTY_SNAP = `(() => {
  const empty = document.querySelector('.modal-overlay .empty-state');
  const footer = document.querySelector('.modal-overlay .modal-footer');
  return {
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    title: (empty?.querySelector('.empty-title')?.textContent || '').trim(),
    desc: (empty?.querySelector('.empty-desc')?.textContent || '').trim(),
    close: /关闭/.test(footer?.innerText || ''),
    write: /写入记忆/.test(footer?.innerText || ''),
  };
})()`;

async function boot(send, width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await send("Page.navigate", { url: `${BASE}?w4=${Date.now()}&w=${width}` });
  for (let i = 0; i < 50; i++) {
    if (await evalExpr(send, "!!window.EchoApp")) break;
    await sleep(200);
  }
  await evalExpr(send, `window.EchoApp._storageReady || Promise.resolve()`);
  await evalExpr(send, SEED);
  await sleep(400);
}

function checkShell(width, snap, expect) {
  record(`${width} · no overflow`, !snap.overflowX ? "PASS" : "FAIL", `overflow=${snap.overflowX}`);
  if (width >= 1024) {
    record(
      `${width} · rail 72`,
      snap.rail && snap.rail.display !== "none" && snap.rail.w >= 70 && snap.rail.w <= 74 ? "PASS" : "FAIL",
      JSON.stringify(snap.rail)
    );
    record(`${width} · chat min 360`, snap.chat && snap.chat.w >= 360 ? "PASS" : "FAIL", `chat=${snap.chat?.w}`);
  } else {
    record(
      `${width} · rail hidden`,
      !snap.rail || snap.rail.display === "none" || snap.rail.w === 0 ? "PASS" : "FAIL"
    );
  }
  if (expect === "drawer") {
    record(`${width} · profile drawer rest`, !snap.profileOpen ? "PASS" : "FAIL");
  } else if (expect === "persist") {
    record(
      `${width} · persistent profile`,
      snap.profileOpen && snap.profile?.position !== "fixed" ? "PASS" : "FAIL",
      JSON.stringify(snap.profile)
    );
  }
}

function checkHub(width, snap) {
  record(`${width} · hub pad 20`, snap.inboxPadTop === 20 ? "PASS" : "FAIL", `padTop=${snap.inboxPadTop}`);
  record(`${width} · hub row >=72`, snap.listH >= 72 ? "PASS" : "FAIL", `h=${snap.listH}`);
  record(`${width} · hub avatar 48`, snap.avatarW >= 46 && snap.avatarW <= 50 ? "PASS" : "FAIL", `av=${snap.avatarW}`);
  record(`${width} · hub one subtitle`, !!snap.subtitle && !snap.hubChip ? "PASS" : "FAIL", `sub=${snap.subtitle} chip=${snap.hubChip}`);
}

function checkProfile(width, snap) {
  record(`${width} · profile home order`, snap.profileHasHome ? "PASS" : "FAIL");
  record(
    `${width} · profile one stage`,
    !!snap.profileStatus && !snap.profileStatusHasDays ? "PASS" : "FAIL",
    snap.profileStatus
  );
  record(`${width} · export folded`, snap.exportInMore && !snap.exportInTools ? "PASS" : "FAIL");
}

async function runWidth(send, width, expect) {
  const mobile = width < 768;
  await boot(send, width, mobile ? 844 : 900, mobile);
  let snap = await evalExpr(send, SNAP);
  checkShell(width, snap, expect);
  record(`${width} · Wave 2 grouping`, snap.groupedAi ? "PASS" : "FAIL");

  if (expect === "drawer" || mobile) {
    await evalExpr(send, `window.EchoApp.toggleProfile(); true`);
    await sleep(200);
    snap = await evalExpr(send, SNAP);
    record(
      `${width} · drawer open`,
      snap.profileOpen && snap.profile?.position === "fixed" ? "PASS" : "FAIL",
      JSON.stringify(snap.profile)
    );
    if (!mobile) {
      record(`${width} · drawer keeps chat`, snap.chat && snap.chat.w >= 360 ? "PASS" : "FAIL", `chat=${snap.chat?.w}`);
    }
  }
  if (snap.profileOpen) checkProfile(width, snap);

  if (mobile) {
    await evalExpr(send, `window.EchoApp.toggleProfile(); window.EchoApp.backToList(); true`);
    await sleep(200);
    snap = await evalExpr(send, SNAP);
  }
  checkHub(width, snap);

  await evalExpr(send, `window.EchoApp.openBring(); true`);
  await sleep(200);
  const bring = await evalExpr(send, BRING_SNAP);
  record(
    `${width} · create modal`,
    bring.open && bring.count === 4 && bring.titles.includes("导入角色卡") ? "PASS" : "FAIL",
    JSON.stringify(bring.titles)
  );
  record(`${width} · import keeps modal`, bring.importKeeps ? "PASS" : "FAIL", JSON.stringify(bring));
  record(
    `${width} · create cards usable`,
    !bring.overflowX && bring.iconsOk && bring.cardMin >= 44 && bring.descPx >= 12.5 ? "PASS" : "FAIL",
    JSON.stringify(bring)
  );

  await evalExpr(send, `document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); window.EchoApp.openTemplatePicker(); true`);
  await sleep(200);
  const templates = await evalExpr(send, TEMPLATE_SNAP);
  record(
    `${width} · template icons`,
    templates.count > 0 && templates.iconsOk && !templates.overflowX ? "PASS" : "FAIL",
    JSON.stringify(templates)
  );

  await evalExpr(send, `document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); window.EchoApp.openSettings('worldbook'); true`);
  await sleep(200);
  const world = await evalExpr(send, WORLD_SNAP);
  record(
    `${width} · worldbook shared empty`,
    world.shared && world.empty && world.next && !world.overflowX ? "PASS" : "FAIL",
    JSON.stringify(world)
  );

  await evalExpr(send, `document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); window.EchoApp.openSettings('voice'); true`);
  await sleep(200);
  const voice = await evalExpr(send, VOICE_SNAP);
  record(
    `${width} · voice pending`,
    voice.voicePending && !voice.voiceClickable && voice.ttsClickable && voice.voiceH >= 44 && !voice.overflowX
      ? "PASS"
      : "FAIL",
    JSON.stringify(voice)
  );

  await evalExpr(
    send,
    `document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); window.EchoApp.openMemoryCandidates('no-such-character'); true`
  );
  await sleep(200);
  const mem = await evalExpr(send, MEM_EMPTY_SNAP);
  record(
    `${width} · memory empty`,
    mem.title === "没有可提取的条目" && mem.close && !mem.write && !mem.overflowX ? "PASS" : "FAIL",
    JSON.stringify(mem)
  );
  await evalExpr(send, `document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); true`);

  await evalExpr(send, `window.EchoApp.switchTab('me'); true`);
  await sleep(200);
  const me = await evalExpr(send, ME_SNAP);
  record(`${width} · me no overflow`, !me.overflowX ? "PASS" : "FAIL");
  record(
    `${width} · me grouped rows`,
    me.groupCount >= 2 && me.rowCount >= 6 && me.rowMin >= 44 && me.profileCard ? "PASS" : "FAIL",
    JSON.stringify(me)
  );
  record(
    `${width} · me section titles`,
    me.titles.includes("这台设备") && me.titles.includes("更多") ? "PASS" : "FAIL",
    me.titles.join(",")
  );

  await evalExpr(send, `window.EchoApp.switchTab('moments'); true`);
  await sleep(200);
  const empty = await evalExpr(send, EMPTY_SNAP);
  record(
    `${width} · empty structure`,
    empty.present && empty.titleCount === 1 && empty.descCount === 1 && empty.btnCount === 1 && empty.primary
      ? "PASS"
      : "FAIL",
    JSON.stringify(empty)
  );
  record(`${width} · empty no overflow`, !empty.overflowX ? "PASS" : "FAIL");
  await shot(send, `w4-${width}`);
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
    "--no-sandbox",
    "--disable-dev-shm-usage",
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
  await runWidth(send, 390, "mobile");
  await runWidth(send, 1024, "drawer");
  await runWidth(send, 1200, "drawer");
  await runWidth(send, 1280, "persist");
  await runWidth(send, 1440, "persist");
  record("console errors", consoleErrors.length === 0 ? "PASS" : "FAIL", consoleErrors.slice(0, 5).join(" | "));
  ws.close();
} finally {
  chrome.kill();
  server.kill();
}

const fails = results.filter((r) => r.status !== "PASS");
console.log("\n==== WAVE 4 BROWSER ====");
console.log(`${results.length - fails.length}/${results.length} passed`);
if (fails.length) {
  fails.forEach((f) => console.log(`FAIL ${f.name} ${f.detail}`));
  process.exit(1);
}
