// ============================================================
//  EchoChat Rebuild · Chat Controller
//  聊天业务逻辑：发送/流式/停止/重试/消息操作
//  解决：send() 80行混杂、状态不明确、错误处理不统一的问题
// ============================================================

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { getRoleId, getPersona, getRoleName } from "./persona.js";
import { buildMessages, streamChat, needsApiSetup } from "./provider.js";
import { retrieveMemoriesForTurn, noteRetrieveChat, maybeAutoSummary } from "./memory.js";
import { buildWorldbookBlock } from "./worldbook.js";
import { recordChatTurn, getAffinity } from "./relations.js";
import { messageStore } from "./message-store.js";
import { listMoments } from "./moments.js";
import { assembleBehaviorContext } from "./context-builder.js";
import { cleanAssistantReply, MAX_USER_MESSAGE_CHARS } from "./reply-clean.js";
import { getReplyPace, presentationDelayMs, waitPresentationDelay } from "./reply-pace.js";

let abortCtrl = null;
let sending = false;
let streamingChatId = null;

export function isSending() {
  return sending;
}

export function getStreamingChatId() {
  return streamingChatId;
}

function finishStreamingPlaceholders(chatId) {
  if (!chatId) return;
  const msgs = messageStore.peekMessages(chatId);
  for (const m of msgs) {
    if (m.role !== "her" || m.status !== "streaming") continue;
    const cleaned = cleanAssistantReply(m.text || "");
    if (!cleaned) messageStore.deleteMessage(chatId, m.id);
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
  abortCtrl = null;
  finishStreamingPlaceholders(chatId);
  events.emit(EVT.STREAM_DONE, { chatId });
  events.emit("rerender");
}

// 构建系统提示词（slots + 本轮相关记忆 + 关系 brief + 世界书）
export function buildSystemPrompt(chat, opts = {}) {
  const roleId = getRoleId(chat);
  const persona = getPersona(chat);
  const query = opts.query != null ? String(opts.query) : "";
  noteRetrieveChat(chat?.id);
  const memories = roleId ? retrieveMemoriesForTurn(roleId, query) : [];
  const affinity = roleId ? getAffinity(roleId, { moments: listMoments(roleId) }) : null;
  const { behavior } = assembleBehaviorContext({ chat, memories, affinity });

  const parts = [];
  if (behavior) parts.push(behavior);

  const history = messageStore.peekMessages(chat.id);
  const wbBlock = buildWorldbookBlock(chat, history, roleId, persona);
  if (wbBlock) parts.push(wbBlock);

  return parts.join("\n\n");
}

// 发送消息
export async function sendMessage(text) {
  const chat = store.getCurrentChat();
  if (!chat || sending) return;
  const trimmed = String(text || "").trim();
  if (!trimmed) return;
  if (trimmed.length > MAX_USER_MESSAGE_CHARS) return;

  // Persist the user message first so a missing API key never drops it.
  const userMsg = await messageStore.addMessage(chat.id, { role: "me", text: trimmed, status: "sent" });
  events.emit(EVT.MESSAGE_SENT, { chatId: chat.id, message: userMsg });

  if (needsApiSetup(chat)) {
    await messageStore.addMessage(chat.id, {
      role: "her",
      text: "发送失败：请先配置 API 接口地址与 Key。你的消息已保存。",
      status: "error",
    });
    events.emit(EVT.TOAST, {
      message: "请先配置 API 接口地址与 Key",
      type: "error",
      action: { label: "打开设置", handler: () => events.emit(EVT.MODAL_OPEN, "settings") },
    });
    return;
  }

  sending = true;
  streamingChatId = chat.id;
  abortCtrl = new AbortController();
  events.emit(EVT.STREAM_START, { chatId: chat.id });

  const tempMsg = await messageStore.addMessage(chat.id, {
    role: "her",
    text: "",
    status: "streaming",
  });
  events.emit("rerender");

  let streamed = "";
  try {
    throwIfAborted();

    const systemPrompt = buildSystemPrompt(chat, { query: trimmed });
    const messages = buildMessages(chat, systemPrompt, messageStore.peekMessages(chat.id));
    throwIfAborted();

    const reply = await streamChat(chat, messages, abortCtrl.signal, (full) => {
      streamed = full;
    });

    const cleaned = cleanAssistantReply(reply || streamed || "");
    if (cleaned) {
      const delayMs = presentationDelayMs(getReplyPace(chat), cleaned);
      await waitPresentationDelay(delayMs, {
        signal: abortCtrl?.signal,
        chatId: chat.id,
      });
      messageStore.updateMessage(chat.id, tempMsg.id, {
        text: cleaned,
        status: "sent",
      });
      events.emit(EVT.MESSAGE_RECEIVED, { chatId: chat.id, message: tempMsg });

      const roleId = getRoleId(chat);
      if (roleId) {
        recordChatTurn(roleId, getRoleName(chat));
        events.emit(EVT.RELATION_UPDATE, { roleId });
      }

      maybeAutoSummary(store.getCurrentChat() || chat);
    } else {
      messageStore.deleteMessage(chat.id, tempMsg.id);
    }
  } catch (e) {
    if (e.name === "AbortError") {
      events.emit(EVT.STREAM_ABORT, { chatId: chat.id });
      events.emit(EVT.TOAST, { message: "已停止生成", type: "info" });
    } else {
      events.emit(EVT.STREAM_ERROR, { chatId: chat.id, error: e });
      events.emit(EVT.TOAST, {
        message: String(e.message || "请求失败"),
        type: "error",
        action: { label: "重试", handler: () => retryLastMessage() },
      });
    }
    const current = store.getCurrentChat();
    const id = current?.id || chat.id;
    const msgs = messageStore.peekMessages(id);
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg?.status === "streaming") {
      const cleaned = cleanAssistantReply(streamed || lastMsg.text || "");
      if (!cleaned) {
        messageStore.deleteMessage(id, lastMsg.id);
      } else {
        messageStore.updateMessage(id, lastMsg.id, {
          text: cleaned,
          status: e.name === "AbortError" ? "stopped" : "error",
        });
      }
    }
  } finally {
    endSend(chat.id);
  }
}

// 停止生成
export function stopGeneration() {
  if (abortCtrl) {
    abortCtrl.abort();
  }
}

// 重试最后一条消息
export async function retryLastMessage() {
  const chat = store.getCurrentChat();
  if (!chat || sending) return;

  const msgs = messageStore.peekMessages(chat.id);
  let lastUserIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "me") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) return;

  const userText = msgs[lastUserIdx].text;

  // 删除最后一条用户消息之后的所有消息（双写：localStorage + Dexie）
  await messageStore.truncateMessages(chat.id, lastUserIdx);

  // 重新发送
  sendMessage(userText);
}

// 重新生成 AI 回复
export async function regenerate(messageIndex) {
  const chat = store.getCurrentChat();
  if (!chat || sending) return;

  const msgs = messageStore.peekMessages(chat.id);
  let userText = null;
  for (let i = messageIndex - 1; i >= 0; i--) {
    if (msgs[i]?.role === "me") {
      userText = msgs[i].text;
      break;
    }
  }
  if (!userText) return;

  // 删除从该条开始的所有消息（双写）
  await messageStore.truncateMessages(chat.id, messageIndex);

  sendMessage(userText);
}

// 编辑消息（删除后重新输入）
export async function editMessage(messageIndex) {
  const chat = store.getCurrentChat();
  if (!chat) return;
  const msgs = messageStore.peekMessages(chat.id);
  const msg = msgs[messageIndex];
  if (!msg || msg.role !== "me") return;

  // 删除从该条开始的所有消息（双写）
  await messageStore.truncateMessages(chat.id, messageIndex);

  return msg.text;
}

// 删除消息
export function deleteMessage(messageIndex) {
  const chat = store.getCurrentChat();
  if (!chat) return;
  const msgs = messageStore.peekMessages(chat.id);
  const msgId = msgs[messageIndex]?.id;
  if (msgId) messageStore.deleteMessage(chat.id, msgId);
}

// 复制消息
export async function copyMessage(text) {
  try {
    await navigator.clipboard.writeText(text);
    events.emit(EVT.TOAST, { message: "已复制", type: "success" });
  } catch (e) {
    events.emit(EVT.TOAST, { message: "复制失败", type: "error" });
  }
}

export const Chat = {
  isSending,
  getStreamingChatId,
  sendMessage,
  stopGeneration,
  retryLastMessage,
  regenerate,
  editMessage,
  deleteMessage,
  copyMessage,
  buildSystemPrompt,
};
