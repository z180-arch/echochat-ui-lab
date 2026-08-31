// ============================================================
//  EchoChat Rebuild · API Provider
//  OpenAI-compatible API 封装，支持流式/停止/错误处理
// ============================================================

import { store } from "../core/store.js";
import { estimateTokens } from "../core/utils.js";

const CFG = window.ECHOCHAT_CONFIG || {};

export function getApiConfig(chat) {
  const g = store.getState().global || {};
  const c = (chat && chat.config) || {};
  return {
    baseUrl: (c.baseUrl || g.baseUrl || CFG.defaultBaseUrl || "").replace(/\/$/, ""),
    apiKey: c.apiKey || g.apiKey || "",
    model: c.model || g.model || CFG.defaultModel || "",
  };
}

export function needsApiSetup(chat) {
  const { baseUrl, apiKey, model } = getApiConfig(chat);
  return !baseUrl || !apiKey || !model;
}

export function getApiPresets() {
  return CFG.apiPresets || [];
}

export function findPreset(id) {
  return (CFG.apiPresets || []).find((p) => p.id === id) || null;
}

export function buildMessages(chat, systemPrompt) {
  const max = CFG.contextMaxMessages > 0 ? CFG.contextMaxMessages : 0;
  let msgs = (chat.messages || []).filter((m) => m.role === "user" || m.role === "assistant");
  if (max > 0 && msgs.length > max) msgs = msgs.slice(-max);
  const out = [];
  if (systemPrompt) out.push({ role: "system", content: systemPrompt });
  for (const m of msgs) {
    out.push({ role: m.role, content: m.text || m.content || "" });
  }
  return out;
}

export async function streamChat(chat, messages, signal, onDelta) {
  const { baseUrl, apiKey, model } = getApiConfig(chat);
  const url = `${baseUrl}/chat/completions`;
  const body = {
    model,
    messages,
    stream: true,
    temperature: 0.8,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const data = s.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || "";
        if (delta) {
          full += delta;
          if (onDelta) onDelta(delta, full);
        }
      } catch (e) {}
    }
  }
  return full;
}

export async function chatCompletion(chat, messages, opts = {}) {
  const { baseUrl, apiKey, model } = getApiConfig(chat);
  const url = `${baseUrl}/chat/completions`;
  const body = {
    model,
    messages,
    stream: false,
    temperature: opts.temperature ?? 0.7,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

export function estimateRequestTokens(chat, systemPrompt) {
  const msgs = buildMessages(chat, systemPrompt);
  return msgs.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

export const Provider = {
  getApiConfig,
  needsApiSetup,
  getApiPresets,
  findPreset,
  buildMessages,
  streamChat,
  chatCompletion,
  estimateRequestTokens,
};
