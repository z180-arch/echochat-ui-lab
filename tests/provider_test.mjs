/**
 * OpenAI-compatible provider: SSE, errors, timeout, abort, retry, config.
 * Production fetch is mocked; no live key in this file.
 */
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
function srcHref(relativePath) {
  return pathToFileURL(join(__dirname, "..", relativePath)).href;
}

const localStorageMock = (() => {
  let s = {};
  return {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => {
      s[k] = String(v);
    },
    removeItem: (k) => {
      delete s[k];
    },
    clear: () => {
      s = {};
    },
  };
})();

global.window = {
  ECHOCHAT_CONFIG: {},
  localStorage: localStorageMock,
  addEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
};
global.localStorage = localStorageMock;
if (typeof globalThis.performance?.now !== "function") {
  globalThis.performance = { now: () => Date.now() };
}

const { store } = await import(srcHref("src/core/store.js"));
const { createSseParser, decodeUtf8Stream } = await import(srcHref("src/domain/sse-parse.js"));
const {
  ProviderError,
  PROVIDER_ERROR_KIND,
  redactSecrets,
  errorFromHttpStatus,
} = await import(srcHref("src/domain/provider-error.js"));
const { streamChat, chatCompletion, buildMessages, completionsUrl } = await import(
  srcHref("src/domain/provider.js")
);
const { exportProductBackup } = await import(srcHref("src/domain/backup.js"));
const { sendMessage, isSending, stopGeneration } = await import(srcHref("src/domain/chat.js"));
const { messageStore } = await import(srcHref("src/domain/message-store.js"));
const { setReplyPaceForCharacter } = await import(srcHref("src/domain/reply-pace.js"));
const { installStorageTestHooks, resetStorageTestHooks } = await import(
  srcHref("src/repository/test-hooks.js")
);

let passed = 0;
let failed = 0;
const failures = [];

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed += 1;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function sseChunk(text, extra = {}) {
  const payload = JSON.stringify({ choices: [{ delta: { content: text } }], ...extra });
  return new TextEncoder().encode(`data: ${payload}\n\n`);
}

function readerFromChunks(chunks) {
  let i = 0;
  return {
    async read() {
      if (i >= chunks.length) return { done: true, value: undefined };
      const value = chunks[i];
      i += 1;
      return { done: false, value };
    },
    cancel: async () => {},
    releaseLock() {},
  };
}

function okStream(chunks, { headers } = {}) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name) => (headers && headers[String(name).toLowerCase()]) || null,
    },
    body: { getReader: () => readerFromChunks(chunks) },
  };
}

function failHttp(status, body, retryAfter) {
  return {
    ok: false,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === "retry-after" ? retryAfter : null) },
    text: async () => body,
  };
}

function resetAll() {
  localStorage.clear();
  store.reset();
  resetStorageTestHooks();
  installStorageTestHooks({
    isAvailable: async () => true,
    message: {
      async countByConversationId() {
        return 0;
      },
      async findByConversationId() {
        return { items: [] };
      },
      async create() {
        return {};
      },
      async update() {
        return {};
      },
      async delete() {},
    },
  });
  store.updateSettings({
    apiKey: "sk-test-key",
    baseUrl: "https://api.example.com/v1",
    model: "test-model",
  });
}

const chatStub = { id: "c1", config: {} };

console.log("\n=== Provider / SSE ===");

await testAsync("completionsUrl strips trailing slash", () => {
  assert.equal(completionsUrl("https://api.example.com/v1/"), "https://api.example.com/v1/chat/completions");
});

await testAsync("buildMessages keeps system separate from user", () => {
  const msgs = buildMessages(
    { messages: [] },
    "SYS",
    [
      { role: "me", text: "你好", status: "sent" },
      { role: "her", text: "在", status: "sent" },
    ]
  );
  assert.equal(msgs[0].role, "system");
  assert.equal(msgs[0].content, "SYS");
  assert.equal(msgs[1].role, "user");
  assert.equal(msgs[2].role, "assistant");
  assert.ok(!String(msgs[1].content).includes("SYS"));
});

await testAsync("redactSecrets strips keys from error text", () => {
  const out = redactSecrets("Bearer sk-testsecretkeyvaluefailedxxxx failed");
  assert.ok(!/sk-nnry/.test(out));
  assert.ok(out.includes("[redacted]"));
});

await testAsync("http 401 is authentication and not retryable", () => {
  const err = errorFromHttpStatus(401, JSON.stringify({ error: { message: "invalid api key sk-secret-aaaaaaa" } }));
  assert.equal(err.kind, PROVIDER_ERROR_KIND.authentication);
  assert.equal(err.retryable, false);
  assert.ok(!/sk-secret/.test(err.message));
});

await testAsync("SSE split JSON across chunks", async () => {
  resetAll();
  const payload = JSON.stringify({ choices: [{ delta: { content: "你好" } }] });
  const line = `data: ${payload}\n\n`;
  const bytes = new TextEncoder().encode(line);
  const mid = Math.floor(bytes.length / 2);
  global.fetch = async () => okStream([bytes.slice(0, mid), bytes.slice(mid), new TextEncoder().encode("data: [DONE]\n\n")]);
  const text = await streamChat(chatStub, [{ role: "user", content: "hi" }], undefined, () => {});
  assert.equal(text, "你好");
});

await testAsync("SSE split UTF-8 codepoint", async () => {
  resetAll();
  const json = JSON.stringify({ choices: [{ delta: { content: "好" } }] });
  const line = `data: ${json}\n\n`;
  const bytes = new TextEncoder().encode(line);
  const cuts = [];
  for (const b of bytes) cuts.push(new Uint8Array([b]));
  global.fetch = async () => okStream(cuts);
  const text = await streamChat(chatStub, [{ role: "user", content: "hi" }]);
  assert.equal(text, "好");
});

await testAsync("multiple SSE events in one chunk plus DONE", async () => {
  resetAll();
  const a = JSON.stringify({ choices: [{ delta: { content: "你" } }] });
  const b = JSON.stringify({ choices: [{ delta: { content: "好" } }] });
  const blob = `data: ${a}\n\ndata: ${b}\n\ndata: [DONE]\n\n`;
  global.fetch = async () => okStream([new TextEncoder().encode(blob)]);
  const text = await streamChat(chatStub, [{ role: "user", content: "hi" }]);
  assert.equal(text, "你好");
});

await testAsync("malformed event is skipped then valid token kept", async () => {
  resetAll();
  const blob = `data: {not-json\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: "还在" } }] })}\n\n`;
  global.fetch = async () => okStream([new TextEncoder().encode(blob)]);
  const text = await streamChat(chatStub, [{ role: "user", content: "hi" }]);
  assert.equal(text, "还在");
});

await testAsync("provider error event becomes ProviderError", async () => {
  resetAll();
  const blob = `data: ${JSON.stringify({ error: { message: "model overloaded", type: "server_error" } })}\n\n`;
  global.fetch = async () => okStream([new TextEncoder().encode(blob)]);
  await assert.rejects(() => streamChat(chatStub, [{ role: "user", content: "hi" }]), (e) => {
    assert.equal(e.kind, PROVIDER_ERROR_KIND.provider);
    return true;
  });
});

await testAsync("connection close returns accumulated text", async () => {
  resetAll();
  global.fetch = async () => okStream([sseChunk("半段")]);
  const text = await streamChat(chatStub, [{ role: "user", content: "hi" }]);
  assert.equal(text, "半段");
});

await testAsync("abort during stream throws aborted and does not retry", async () => {
  resetAll();
  const ctrl = new AbortController();
  global.fetch = async (_url, opts) => {
    await new Promise((_, reject) => {
      opts.signal.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  };
  const pending = streamChat(chatStub, [{ role: "user", content: "hi" }], ctrl.signal);
  await new Promise((r) => setTimeout(r, 20));
  ctrl.abort();
  await assert.rejects(pending, (e) => {
    assert.equal(e.name, "AbortError");
    assert.equal(e.kind, PROVIDER_ERROR_KIND.aborted);
    return true;
  });
});

await testAsync("timeout does not hang", async () => {
  resetAll();
  global.fetch = async (_url, opts) =>
    new Promise((_, reject) => {
      opts.signal.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  const t0 = Date.now();
  await assert.rejects(
    () => streamChat(chatStub, [{ role: "user", content: "hi" }], undefined, undefined, { timeoutMs: 60 }),
    (e) => {
      assert.equal(e.kind, PROVIDER_ERROR_KIND.timeout);
      assert.equal(e.name, "ProviderError");
      return true;
    }
  );
  assert.ok(Date.now() - t0 < 2000);
});

await testAsync("invalid configuration throws before fetch", async () => {
  resetAll();
  store.updateSettings({ apiKey: "", baseUrl: "", model: "" });
  let called = 0;
  global.fetch = async () => {
    called += 1;
    return okStream([]);
  };
  await assert.rejects(() => streamChat(chatStub, [{ role: "user", content: "hi" }]), (e) => {
    assert.equal(e.kind, PROVIDER_ERROR_KIND.invalid_request);
    return true;
  });
  assert.equal(called, 0);
});

await testAsync("auth error does not retry", async () => {
  resetAll();
  let n = 0;
  global.fetch = async () => {
    n += 1;
    return failHttp(401, JSON.stringify({ error: { message: "nope" } }));
  };
  await assert.rejects(() => streamChat(chatStub, [{ role: "user", content: "hi" }]), (e) => e.kind === PROVIDER_ERROR_KIND.authentication);
  assert.equal(n, 1);
});

await testAsync("429 retries then succeeds", async () => {
  resetAll();
  let n = 0;
  global.fetch = async () => {
    n += 1;
    if (n === 1) return failHttp(429, JSON.stringify({ error: { message: "slow" } }), "0");
    return okStream([sseChunk("好了"), new TextEncoder().encode("data: [DONE]\n\n")]);
  };
  const text = await streamChat(chatStub, [{ role: "user", content: "hi" }]);
  assert.equal(text, "好了");
  assert.equal(n, 2);
});

await testAsync("network failure retries", async () => {
  resetAll();
  let n = 0;
  global.fetch = async () => {
    n += 1;
    if (n === 1) {
      const err = new Error("Failed to fetch");
      err.name = "TypeError";
      throw err;
    }
    return okStream([sseChunk("回")]);
  };
  const text = await streamChat(chatStub, [{ role: "user", content: "hi" }]);
  assert.equal(text, "回");
  assert.equal(n, 2);
});

await testAsync("model unavailable is not retried", async () => {
  resetAll();
  let n = 0;
  global.fetch = async () => {
    n += 1;
    return failHttp(404, JSON.stringify({ error: { message: "Model not found: nope" } }));
  };
  await assert.rejects(() => streamChat(chatStub, [{ role: "user", content: "hi" }]), (e) => e.kind === PROVIDER_ERROR_KIND.model_unavailable);
  assert.equal(n, 1);
});

await testAsync("switching model is used on the next request", async () => {
  resetAll();
  const seen = [];
  global.fetch = async (_url, opts) => {
    seen.push(JSON.parse(opts.body).model);
    return okStream([sseChunk("x")]);
  };
  await streamChat(chatStub, [{ role: "user", content: "a" }]);
  store.updateSettings({ model: "other-model" });
  await streamChat(chatStub, [{ role: "user", content: "b" }]);
  assert.deepEqual(seen, ["test-model", "other-model"]);
});

await testAsync("backup export strips apiKey", async () => {
  resetAll();
  store.updateSettings({ apiKey: "sk-should-not-export-xxxxxx" });
  const blob = await exportProductBackup();
  const dump = JSON.stringify(blob);
  assert.ok(!dump.includes("sk-should-not-export"));
  assert.equal(blob.state.settings.apiKey, "");
});

await testAsync("createSseParser holds incomplete lines", () => {
  const events = [];
  const p = createSseParser((d) => events.push(d));
  p.feed("data: hel");
  assert.equal(events.length, 0);
  p.feed("lo\n\n");
  assert.deepEqual(events, ["hello"]);
});

await testAsync("decodeUtf8Stream splits a CJK codepoint", () => {
  const dec = decodeUtf8Stream();
  const bytes = new TextEncoder().encode("好");
  const a = dec.push(bytes.slice(0, 1));
  const b = dec.push(bytes.slice(1));
  const c = dec.end();
  assert.equal(`${a}${b}${c}`, "好");
});

await testAsync("non-stream completion reads message content", async () => {
  resetAll();
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ choices: [{ message: { content: "摘要" } }] }),
  });
  const text = await chatCompletion(chatStub, [{ role: "user", content: "sum" }]);
  assert.equal(text, "摘要");
});

await testAsync("chat: user persists then provider 401 keeps the user turn", async () => {
  resetAll();
  const chat = store.createChat({ roleId: "role_p", name: "林晚", persona: "p", firstMessage: "hi" });
  store.selectChat(chat.id);
  setReplyPaceForCharacter(chat.roleId, "instant");
  global.fetch = async () => failHttp(401, JSON.stringify({ error: { message: "bad key" } }));
  await sendMessage("还在吗");
  assert.equal(isSending(), false);
  const msgs = messageStore.peekMessages(chat.id);
  assert.ok(msgs.some((m) => m.role === "me" && m.text === "还在吗"));
  const her = msgs.filter((m) => m.role === "her").pop();
  assert.equal(her.status, "error");
  assert.equal(her.text, "");
});

await testAsync("chat: abort mid-stream drops assistant placeholder", async () => {
  resetAll();
  const chat = store.createChat({ roleId: "role_p2", name: "林晚", persona: "p", firstMessage: "hi" });
  store.selectChat(chat.id);
  setReplyPaceForCharacter(chat.roleId, "instant");
  global.fetch = async (_url, opts) =>
    new Promise((_, reject) => {
      opts.signal.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  const pending = sendMessage("停一下");
  await new Promise((r) => setTimeout(r, 30));
  stopGeneration();
  await pending;
  assert.equal(isSending(), false);
  const msgs = messageStore.peekMessages(chat.id);
  assert.ok(msgs.some((m) => m.role === "me" && m.text === "停一下"));
  assert.equal(msgs.filter((m) => m.status === "streaming").length, 0);
  const her = msgs.filter((m) => m.role === "her" && m.text !== "hi");
  assert.ok(her.every((m) => m.status !== "streaming"));
});

resetStorageTestHooks();
console.log(`\nProvider: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
