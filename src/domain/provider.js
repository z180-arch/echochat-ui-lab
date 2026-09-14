// ============================================================
//  EchoChat Rebuild · API Provider
//  OpenAI-compatible adapter used by SiliconFlow / DeepSeek / Qwen / custom.
//  Streaming parser: src/domain/sse-parse.js (eventsource-parser MIT algorithm).
// ============================================================

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { estimateTokens } from "../core/utils.js";
import { createSseParser, decodeUtf8Stream } from "./sse-parse.js";
import {
  ProviderError,
  PROVIDER_ERROR_KIND,
  errorFromCaught,
  errorFromHttpStatus,
  errorFromSsePayload,
  redactSecrets,
} from "./provider-error.js";

const CFG = window.ECHOCHAT_CONFIG || {};
export const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_TRANSIENT_TRIES = 2;

export function getApiConfig(chat) {
  const s = store.getState();
  const chatCfg = chat?.config || {};
  return {
    baseUrl: chatCfg.baseUrl || s.settings.baseUrl,
    apiKey: chatCfg.apiKey || s.settings.apiKey,
    model: chatCfg.model || s.settings.model,
    temperature: chatCfg.temperature != null ? chatCfg.temperature : s.settings.temperature,
  };
}

export function needsApiSetup(chat) {
  const cfg = getApiConfig(chat);
  return !cfg.baseUrl?.trim() || !cfg.apiKey?.trim();
}

export function getApiPresets() {
  return Array.isArray(CFG.apiPresets) ? CFG.apiPresets.filter((p) => p && p.id) : [];
}

export function findPreset(id) {
  return getApiPresets().find((p) => p.id === id) || null;
}

export function completionsUrl(baseUrl) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base) {
    throw new ProviderError(PROVIDER_ERROR_KIND.invalid_request, "missing base URL");
  }
  return `${base}/chat/completions`;
}

function assertRequestConfig(cfg) {
  if (!cfg?.baseUrl?.trim() || !cfg?.apiKey?.trim()) {
    throw new ProviderError(PROVIDER_ERROR_KIND.invalid_request, "missing api config");
  }
  if (!String(cfg.model || "").trim()) {
    throw new ProviderError(PROVIDER_ERROR_KIND.invalid_request, "missing model");
  }
}

function authHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export function buildMessages(chat, systemPrompt, historyMessages) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  const maxMsgs = CFG.contextMaxMessages || 40;
  const history = (historyMessages || chat.messages || []).slice(-maxMsgs);
  history.forEach((m) => {
    if (m.status === "streaming" || m.status === "error") return;
    if (m.role === "me") {
      messages.push({ role: "user", content: m.text });
    } else if (m.role === "her" && (m.text || "").trim()) {
      messages.push({ role: "assistant", content: m.text });
    }
  });
  return messages;
}

function linkAbort(userSignal, timeoutMs) {
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort("timeout"), timeoutMs);
  const signals = [timeoutCtrl.signal];
  if (userSignal) signals.unshift(userSignal);
  let signal;
  if (typeof AbortSignal.any === "function") {
    signal = AbortSignal.any(signals);
  } else {
    const merged = new AbortController();
    signal = merged.signal;
    for (const s of signals) {
      if (s.aborted) merged.abort(s.reason);
      else s.addEventListener("abort", () => merged.abort(s.reason), { once: true });
    }
  }
  return {
    signal,
    timedOut: () => timeoutCtrl.signal.aborted && !(userSignal && userSignal.aborted),
    userAborted: () => !!(userSignal && userSignal.aborted),
    dispose: () => clearTimeout(timer),
  };
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      reject(err);
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      const err = new Error("aborted");
      err.name = "AbortError";
      reject(err);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function mapFetchError(err, gate) {
  if (gate.userAborted()) return new ProviderError(PROVIDER_ERROR_KIND.aborted, "aborted");
  if (gate.timedOut()) return new ProviderError(PROVIDER_ERROR_KIND.timeout, "timeout");
  return errorFromCaught(err);
}

async function readErrorBody(resp) {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

async function consumeSse(resp, signal, onDelta) {
  if (!resp.body || typeof resp.body.getReader !== "function") {
    throw new ProviderError(PROVIDER_ERROR_KIND.provider, "empty stream");
  }
  const reader = resp.body.getReader();
  const utf8 = decodeUtf8Stream();
  let full = "";
  let usage = null;
  const parser = createSseParser((data) => {
    if (!data || data === "[DONE]") return;
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const sseErr = errorFromSsePayload(json);
    if (sseErr) throw sseErr;
    if (json.usage) usage = json.usage;
    const delta =
      json.choices?.[0]?.delta?.content ||
      json.choices?.[0]?.message?.content ||
      "";
    if (delta) {
      full += delta;
      if (onDelta) onDelta(full);
      events.emit(EVT.STREAM_DELTA, { chatId: consumeSse._chatId, text: full, delta });
    }
  });

  try {
    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(utf8.push(value));
    }
    parser.feed(utf8.end());
    parser.flush();
  } finally {
    try {
      reader.releaseLock?.();
    } catch {
      // ignore
    }
  }
  return { text: full, usage };
}

async function postChat(cfg, body, signal) {
  const url = completionsUrl(cfg.baseUrl);
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: authHeaders(cfg.apiKey),
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    throw e;
  }
  if (!resp.ok) {
    const text = await readErrorBody(resp);
    throw errorFromHttpStatus(resp.status, text, resp.headers?.get?.("retry-after"));
  }
  return resp;
}

async function withTransientRetry(run, userSignal) {
  let last;
  for (let attempt = 1; attempt <= MAX_TRANSIENT_TRIES; attempt += 1) {
    if (userSignal?.aborted) throw new ProviderError(PROVIDER_ERROR_KIND.aborted, "aborted");
    try {
      return await run();
    } catch (e) {
      const err = e instanceof ProviderError ? e : errorFromCaught(e);
      last = err;
      const retry = err.retryable && attempt < MAX_TRANSIENT_TRIES && !userSignal?.aborted;
      if (!retry) throw err;
      const wait = err.retryAfterMs || 400 * attempt;
      await sleep(wait, userSignal);
    }
  }
  throw last;
}

export async function streamChat(chat, messages, signal, onDelta, opts = {}) {
  const cfg = getApiConfig(chat);
  assertRequestConfig(cfg);
  const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  consumeSse._chatId = chat?.id;

  const body = {
    model: cfg.model,
    messages,
    temperature: Number(cfg.temperature) || 1.0,
    stream: true,
  };

  events.emit(EVT.STREAM_START, { chatId: chat?.id });

  const result = await withTransientRetry(async () => {
    const gate = linkAbort(signal, timeoutMs);
    try {
      const resp = await postChat(cfg, body, gate.signal);
      return await consumeSse(resp, gate.signal, onDelta);
    } catch (e) {
      throw mapFetchError(e, gate);
    } finally {
      gate.dispose();
    }
  }, signal);

  events.emit(EVT.STREAM_DONE, { chatId: chat?.id, text: result.text, usage: result.usage || null });
  return result.text;
}

export async function chatCompletion(chat, messages, opts = {}) {
  const cfg = getApiConfig(chat);
  assertRequestConfig(cfg);
  const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const body = {
    model: cfg.model,
    messages,
    temperature: opts.temperature != null ? opts.temperature : 0.7,
    stream: false,
    max_tokens: opts.maxTokens || 500,
  };

  const result = await withTransientRetry(async () => {
    const gate = linkAbort(opts.signal, timeoutMs);
    try {
      const resp = await postChat(cfg, body, gate.signal);
      const json = await resp.json();
      const sseErr = errorFromSsePayload(json);
      if (sseErr) throw sseErr;
      return json.choices?.[0]?.message?.content || "";
    } catch (e) {
      throw mapFetchError(e, gate);
    } finally {
      gate.dispose();
    }
  }, opts.signal);

  return result;
}

export function estimateRequestTokens(chat, systemPrompt) {
  const messages = buildMessages(chat, systemPrompt);
  let total = 0;
  messages.forEach((m) => {
    total += estimateTokens(m.content);
  });
  return total;
}

export { ProviderError, PROVIDER_ERROR_KIND, redactSecrets };

export const Provider = {
  getApiConfig,
  needsApiSetup,
  getApiPresets,
  findPreset,
  completionsUrl,
  buildMessages,
  streamChat,
  chatCompletion,
  estimateRequestTokens,
};
