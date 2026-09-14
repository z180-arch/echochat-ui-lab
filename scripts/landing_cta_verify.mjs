/**
 * Landing → /app/ path check. No storage writes on `/`.
 * Usage: node scripts/landing_cta_verify.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = Number(process.env.CDP_PORT || 9433);
const HTTP_PORT = Number(process.env.APP_PORT || 8833);
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) throw new Error("Chrome not found. Set CHROME_PATH.");
const USER_DATA = join(tmpdir(), `echochat-landing-${Date.now()}`);
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

const LANDING_SNAP = `(() => {
  const slogan = (document.querySelector('.signature-text')?.textContent || '').trim();
  const cta = document.getElementById('heroCta');
  const grain = document.querySelector('.ambient-grain');
  const rings = document.querySelectorAll('.hero-echo-ring').length;
  const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
  const errors = (window.__errors || []).length;
  return {
    slogan,
    href: cta?.getAttribute('href') || '',
    grain: !!grain,
    rings,
    overflow,
    errors,
    title: document.title,
  };
})()`;

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
  const { ws, send } = await cdpConnect(page.webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Runtime.enable");

  for (const [width, height, mobile] of [
    [1440, 900, false],
    [1024, 900, false],
    [390, 844, true],
  ]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/?lp=${Date.now()}&w=${width}` });
    await sleep(800);
    const snap = await evalExpr(send, LANDING_SNAP);
    record(`${width} · slogan`, snap.slogan === "念念不忘，必有回响" ? "PASS" : "FAIL", snap.slogan);
    record(`${width} · hero CTA`, snap.href === "/app/" ? "PASS" : "FAIL", snap.href);
    record(`${width} · atmosphere`, snap.grain && snap.rings === 3 ? "PASS" : "FAIL", JSON.stringify(snap));
    record(`${width} · no overflow`, !snap.overflow ? "PASS" : "FAIL");
    record(`${width} · no page errors`, snap.errors === 0 ? "PASS" : "FAIL", String(snap.errors));
  }

  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/?cta=${Date.now()}` });
  await sleep(600);
  await evalExpr(send, `document.getElementById('heroCta').click(); true`);
  for (let i = 0; i < 40; i++) {
    const ready = await evalExpr(send, "!!window.EchoApp");
    if (ready) break;
    await sleep(200);
  }
  const dest = await evalExpr(send, `({ href: location.href, app: !!window.EchoApp, errors: (window.__errors || []).length })`);
  record("CTA → /app/", /\/app\//.test(dest.href) ? "PASS" : "FAIL", dest.href);
  record("app boot", dest.app ? "PASS" : "FAIL");
  record("app console", dest.errors === 0 ? "PASS" : "FAIL", String(dest.errors));
  ws.close();
} finally {
  chrome.kill();
  server.kill();
}

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n==== LANDING PATH ====`);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
