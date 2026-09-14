// ============================================================
//  EchoChat Rebuild · Chat Controller
//  聊天业务逻辑：发送/流式/停止/重试/消息操作
//  解决：send() 80行混杂、状态不明确、错误处理不统一的问题
// ============================================================

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { getRoleId, getRoleName } from "./persona.js";
import { buildMessages, streamChat, needsApiSetup, redactSecrets } from "./provider.js";
import { maybeAutoSummary } from "./memory.js";
import { recordChatTurn } from "./relations.js";
import { messageStore } from "./message-store.js";
import { assembleTurnContext } from "./turn-context.js";
import { quietRememberUserText } from "./memory-candidates.js";
import { captureLivedMoment } from "./moments.js";
import { cleanAssistantReply, MAX_USER_MESSAGE_CHARS } from "./reply-clean.js";
import { getReplyPace, presentationDelayMs, waitPresentationDelay } from "./reply-pace.js";
import { stopSpeech } from "./voice.js";
import { stopDictation } from "./stt.js";
import { userFacingProviderMessage } from "./provider-error.js";

let abortCtrl = null;
let sending = false;
let streamingChatId = null;
let streamPreview = "";

export function isSending() {
  return sending;
}

export function getStreamingChatId() {
  return streamingChatId;
}

export function getStreamingPreview(chatId) {
  if (!sending || !streamPreview) return "";
  if (chatId && chatId !== streamingChatId) return "";
  return streamPreview;
}

function lastUserIndex(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === "me") return i;
  }
  return -1;
}

function userIndexBefore(msgs, index) {
  for (let i = index - 1; i >= 0; i--) {
    if (msgs[i]?.role === "me") return i;
  }
  return -1;
}

function chatById(chatId) {
  return (store.getState().chats || []).find((c) => c.id === chatId) || null;
}

function messageStillThere(chatId, msgId) {
  if (!chatId || !msgId) return false;
  return messageStore.peekMessages(chatId).some((m) => m.id === msgId);
}

function keepFailedAssistantRow(chatId, msgId, err) {
  if (!chatId || !msgId) return;
  const errorKind = err?.kind || "unknown";
  const errorText = userFacingProviderMessage(err);
  messageStore.updateMessage(chatId, msgId, {
    text: "",
    status: "error",
    errorKind,
    errorText,
    metadata: { errorKind, errorText },
  });
}

function finishStreamingPlaceholders(chatId) {
  if (!chatId) return;
  const msgs = messageStore.peekMessages(chatId);
  for (const m of msgs) {
    if (m.role !== "her" || m.status !== "streaming") continue;
    const cleaned = cleanAssistantReply(m.text || "");
    if (!cleaned) keepFailedAssistantRow(chatId, m.id);
    else messageStore.updateMessage(chatId, m.id, { text: cleaned, status: "sent" });
  }
}

function throwIfAborted() {
  if (abortCtrl?.signal?.aborted) {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }
}

function endSend(chatId) {
  sending = false;
  streamingChatId = null;
  streamPreview = "";
  abortCtrl = null;
  finishStreamingPlaceholders(chatId);
  events.emit(EVT.STREAM_DONE, { chatId });
  events.emit("rerender");
}

function rememberPreviousReply(meta, text) {
  const prev = Array.isArray(meta?.previousReplies) ? meta.previousReplies.slice(-4) : [];
  const body = String(text || "").trim();
  if (body) prev.push({ text: body, at: Date.now() });
  return { ...(meta || {}), previousReplies: prev, errorKind: null, errorText: null };
}

async function dropTrailingFailedAssistants(chatId) {
  const msgs = messageStore.peekMessages(chatId);
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === "her" && (m.status === "error" || m.status === "streaming" || !(m.text || "").trim())) {
      await messageStore.deleteMessage(chatId, m.id);
      continue;
    }
    break;
  }
}

async function markSetupError(chatId) {
  await dropTrailingFailedAssistants(chatId);
  await messageStore.addMessage(chatId, {
    role: "her",
    text: "",
    status: "error",
    errorKind: "invalid_request",
    errorText: "请先配置 API 接口地址与 Key。你的消息已保存。",
    metadata: {
      errorKind: "invalid_request",
      errorText: "请先配置 API 接口地址与 Key。你的消息已保存。",
    },
  });
  events.emit(EVT.TOAST, {
    message: "请先配置 API 接口地址与 Key",
    type: "error",
    action: { label: "打开设置", handler: () => events.emit(EVT.MODAL_OPEN, "settings") },
  });
}

// 构建系统提示词：单一 turn context（角色 / 记忆 / 关系 / 世界书 / 可选插件）
export function buildSystemPrompt(chat, opts = {}) {
  return assembleTurnContext(chat, opts).prompt;
}

async function generateAssistant({ chatId, userText, recordEffects, reuseAssistant = null }) {
  const origin = chatById(chatId) || store.getCurrentChat();
  if (!origin || sending) return;
  if (needsApiSetup(origin)) {
    await markSetupError(chatId);
    return;
  }

  sending = true;
  streamingChatId = chatId;
  abortCtrl = new AbortController();
  stopSpeech();
  stopDictation();
  events.emit(EVT.STREAM_START, { chatId });

  const reuseId = reuseAssistant?.id && messageStillThere(chatId, reuseAssistant.id) ? reuseAssistant.id : null;
  const reuseMeta = reuseAssistant?.metadata || {};
  const nextMeta = rememberPreviousReply(reuseMeta, reuseAssistant?.text || "");
  let tempMsg;
  if (reuseId) {
    await messageStore.updateMessage(chatId, reuseId, {
      text: "",
      status: "streaming",
      errorKind: null,
      errorText: null,
      metadata: nextMeta,
    });
    tempMsg = { id: reuseId };
  } else {
    tempMsg = await messageStore.addMessage(chatId, {
      role: "her",
      text: "",
      status: "streaming",
      metadata: nextMeta,
    });
  }
  events.emit("rerender");

  let streamed = "";
  let completedReply = "";
  try {
    throwIfAborted();
    const live = chatById(chatId) || origin;
    const systemPrompt = buildSystemPrompt(live, { query: userText });
    const messages = buildMessages(live, systemPrompt, messageStore.peekMessages(chatId));
    throwIfAborted();

    const reply = await streamChat(live, messages, abortCtrl.signal, (full) => {
      streamed = full;
      streamPreview = full;
    });

    completedReply = cleanAssistantReply(reply || streamed || "");
    if (completedReply) {
      const delayMs = presentationDelayMs(getReplyPace(live), completedReply);
      await waitPresentationDelay(delayMs, {
        signal: abortCtrl?.signal,
        chatId,
      });
      if (!messageStillThere(chatId, tempMsg.id)) return;
      messageStore.updateMessage(chatId, tempMsg.id, {
        text: completedReply,
        status: "sent",
        errorKind: null,
        errorText: null,
        metadata: nextMeta,
      });
      events.emit(EVT.MESSAGE_RECEIVED, {
        chatId,
        message: { ...tempMsg, text: completedReply },
      });

      if (recordEffects) {
        const roleId = getRoleId(live);
        if (roleId) {
          recordChatTurn(roleId, getRoleName(live));
          events.emit(EVT.RELATION_UPDATE, { roleId });
        }
        maybeAutoSummary(chatById(chatId) || live);
      }
    } else if (messageStillThere(chatId, tempMsg.id)) {
      keepFailedAssistantRow(chatId, tempMsg.id);
    }
  } catch (e) {
    if (e.name === "AbortError") {
      events.emit(EVT.STREAM_ABORT, { chatId });
      events.emit(EVT.TOAST, { message: "已停止生成", type: "info" });
    } else {
      events.emit(EVT.STREAM_ERROR, { chatId, error: e });
      events.emit(EVT.TOAST, {
        message: redactSecrets(e.userMessage || e.message || "请求失败"),
        type: "error",
        action: { label: "重试", handler: () => retryLastMessage() },
      });
    }
    if (!messageStillThere(chatId, tempMsg.id)) return;
    const lastMsg = messageStore.peekMessages(chatId).find((m) => m.id === tempMsg.id);
    if (lastMsg?.status === "streaming") {
      if (e.name === "AbortError" && completedReply) {
        messageStore.updateMessage(chatId, lastMsg.id, {
          text: completedReply,
          status: "sent",
          metadata: nextMeta,
        });
        events.emit(EVT.MESSAGE_RECEIVED, { chatId, message: { ...lastMsg, text: completedReply } });
      } else if (e.name === "AbortError") {
        messageStore.deleteMessage(chatId, lastMsg.id);
      } else {
        keepFailedAssistantRow(chatId, lastMsg.id, e);
      }
    }
  } finally {
    endSend(chatId);
  }
}

// 发送消息
export async function sendMessage(text) {
  const chat = store.getCurrentChat();
  if (!chat || sending) return;
  const trimmed = String(text || "").trim();
  if (!trimmed) return;
  if (trimmed.length > MAX_USER_MESSAGE_CHARS) return;

  const userMsg = await messageStore.addMessage(chat.id, { role: "me", text: trimmed, status: "sent" });
  events.emit(EVT.MESSAGE_SENT, { chatId: chat.id, message: userMsg });
  const spokenRoleId = getRoleId(chat);
  if (spokenRoleId) {
    quietRememberUserText(spokenRoleId, trimmed);
    captureLivedMoment(spokenRoleId, trimmed, { chatId: chat.id, roleName: getRoleName(chat) });
  }

  return generateAssistant({ chatId: chat.id, userText: trimmed, recordEffects: true });
}

// 停止生成
export function stopGeneration() {
  stopSpeech();
  stopDictation();
  if (abortCtrl) {
    abortCtrl.abort();
  }
}

export async function retryLastMessage() {
  const chat = store.getCurrentChat();
  if (!chat || sending) return;
  const msgs = messageStore.peekMessages(chat.id);
  const userIdx = lastUserIndex(msgs);
  if (userIdx < 0) return;
  const userText = msgs[userIdx].text;
  const after = msgs.slice(userIdx + 1);
  const hasSuccess = after.some((m) => m.role === "her" && m.status === "sent" && (m.text || "").trim());
  if (hasSuccess) return;

  await dropTrailingFailedAssistants(chat.id);
  return generateAssistant({ chatId: chat.id, userText, recordEffects: true });
}

export async function regenerate(messageIndex) {
  const chat = store.getCurrentChat();
  if (!chat || sending) return;
  const msgs = messageStore.peekMessages(chat.id);
  const target = msgs[messageIndex];
  if (!target || target.role !== "her") return;
  const userIdx = userIndexBefore(msgs, messageIndex);
  if (userIdx < 0) return;
  const userText = msgs[userIdx].text;
  if (messageIndex < msgs.length - 1) {
    await messageStore.truncateMessages(chat.id, messageIndex + 1);
  }
  return generateAssistant({
    chatId: chat.id,
    userText,
    recordEffects: false,
    reuseAssistant: target,
  });
}

export function readUserMessage(messageIndex) {
  const chat = store.getCurrentChat();
  if (!chat) return "";
  const msg = messageStore.peekMessages(chat.id)[messageIndex];
  if (!msg || msg.role !== "me") return "";
  return msg.text || "";
}

export async function editMessage(messageIndex, nextText) {
  const chat = store.getCurrentChat();
  if (!chat || sending) return "";
  const msgs = messageStore.peekMessages(chat.id);
  const msg = msgs[messageIndex];
  if (!msg || msg.role !== "me") return "";
  const trimmed = String(nextText ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.length > MAX_USER_MESSAGE_CHARS) return "";

  const hadSuccess = msgs
    .slice(messageIndex + 1)
    .some((m) => m.role === "her" && m.status === "sent" && (m.text || "").trim());
  const textChanged = trimmed !== String(msg.text || "").trim();
  await messageStore.updateMessage(chat.id, msg.id, { text: trimmed, status: "sent" });
  await messageStore.truncateMessages(chat.id, messageIndex + 1);
  const roleId = getRoleId(chat);
  if (textChanged && roleId) quietRememberUserText(roleId, trimmed);
  await generateAssistant({
    chatId: chat.id,
    userText: trimmed,
    recordEffects: !hadSuccess,
  });
  return trimmed;
}

export function deleteMessage(messageIndex) {
  const chat = store.getCurrentChat();
  if (!chat) return;
  const msg = messageStore.peekMessages(chat.id)[messageIndex];
  if (msg?.id) deleteMessageById(msg.id);
}

export function deleteMessageById(messageId) {
  const chat = store.getCurrentChat();
  if (!chat || !messageId) return;
  const msgs = messageStore.peekMessages(chat.id);
  const msg = msgs.find((m) => m.id === messageId);
  if (!msg) return;
  const lastUser = [...msgs].reverse().find((m) => m.role === "me");
  if (
    sending &&
    streamingChatId === chat.id &&
    (msg.status === "streaming" || msg.id === lastUser?.id)
  ) {
    stopGeneration();
  }
  messageStore.deleteMessage(chat.id, messageId);
}

async function writeClipboard(value) {
  const text = String(value ?? "");
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to execCommand
  }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}

export async function copyMessage(text) {
  const ok = await writeClipboard(text);
  events.emit(EVT.TOAST, { message: ok ? "已复制" : "复制失败", type: ok ? "success" : "error" });
  return ok;
}

export const Chat = {
  isSending,
  getStreamingChatId,
  sendMessage,
  stopGeneration,
  retryLastMessage,
  regenerate,
  readUserMessage,
  editMessage,
  deleteMessage,
  deleteMessageById,
  copyMessage,
  buildSystemPrompt,
};
