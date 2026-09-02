// ============================================================
//  EchoChat Rebuild · API Provider
//  OpenAI-compatible API 封装，支持流式/停止/错误处理
//  Provider Interface 架构，便于未来扩展
// ============================================================

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { estimateTokens } from "../core/utils.js";

const CFG = window.ECHOCHAT_CONFIG || {};

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

// 构建 OpenAI 格式请求消息
export function buildMessages(chat, systemPrompt, historyMessages) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  const maxMsgs = CFG.contextMaxMessages || 40;
  const history = (historyMessages || chat.messages || []).slice(-maxMsgs);
  history.forEach((m) => {
    if (m.status === "streaming") return;
    if (m.role === "me") {
      messages.push({ role: "user", content: m.text });
    } else if (m.role === "her" && (m.text || "").trim()) {
      messages.push({ role: "assistant", content: m.text });
    }
  });
  return messages;
}

// 流式聊天
export async function streamChat(chat, messages, signal, onDelta) {
  const cfg = getApiConfig(chat);
  const url = cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions";

  const body = {
    model: cfg.model,
    messages,
    temperature: Number(cfg.temperature) || 1.0,
    stream: true,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    let errMsg = `请求失败 (${resp.status})`;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.error?.message || errJson.message || errMsg;
    } catch (e) {}
    throw new Error(errMsg);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  events.emit(EVT.STREAM_START, { chatId: chat.id });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || "";
        if (delta) {
          full += delta;
          if (onDelta) onDelta(full);
          events.emit(EVT.STREAM_DELTA, { chatId: chat.id, text: full, delta });
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  }

  events.emit(EVT.STREAM_DONE, { chatId: chat.id, text: full });
  return full;
}

// 非流式请求（用于摘要等）
export async function chatCompletion(chat, messages, opts = {}) {
  const cfg = getApiConfig(chat);
  const url = cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const body = {
    model: cfg.model,
    messages,
    temperature: opts.temperature != null ? opts.temperature : 0.7,
    stream: false,
    max_tokens: opts.maxTokens || 500,
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!resp.ok) throw new Error(`请求失败 (${resp.status})`);
  const json = await resp.json();
  return json.choices?.[0]?.message?.content || "";
}

// 估算请求 token
export function estimateRequestTokens(chat, systemPrompt) {
  const messages = buildMessages(chat, systemPrompt);
  let total = 0;
  messages.forEach((m) => {
    total += estimateTokens(m.content);
  });
  return total;
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
