// ============================================================
//  EchoChat Rebuild · Chat Controller
//  发送 / 流式 / 停止 / 重试 / 重生成 / 编辑
// ============================================================

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { uid } from "../core/utils.js";
import { getRoleId, getPersona, getRoleName } from "./persona.js";
import { buildMessages, streamChat, needsApiSetup } from "./provider.js";
import { buildMemoryBlock, rememberMessage, maybeAutoSummary } from "./memory.js";
import { recordChatTurn } from "./relations.js";
import { matchWorldbook } from "./worldbook.js";

let abortCtrl = null;
let streamingChatId = null;

export function isSending() {
  return !!abortCtrl;
}

export function getStreamingChatId() {
  return streamingChatId;
}

function buildSystemPrompt(chat) {
  const parts = [];
  const persona = getPersona(chat);
  if (persona) parts.push(persona);
  const roleId = getRoleId(chat);
  const mem = buildMemoryBlock(roleId);
  if (mem) parts.push(mem);
  const wb = matchWorldbook(chat);
  if (wb) parts.push(wb);
  const globalP = store.getState().global?.persona;
  if (globalP && globalP !== persona) parts.push("【用户侧】\n" + globalP);
  return parts.join("\n\n");
}

export async function sendMessage(chatId, text) {
  if (!text || !chatId || abortCtrl) return;
  const chat = store.getState().chats.find((c) => c.id === chatId);
  if (!chat) return;
  if (needsApiSetup(chat)) {
    events.emit(EVT.TOAST, { type: "error", text: "请先配置 API Key 与模型" });
    return;
  }

  const userMsg = { id: uid(), role: "user", text: String(text).trim(), createdAt: Date.now() };
  store.appendMessage(chatId, userMsg);
  events.emit(EVT.MESSAGE_SENT, { chatId, message: userMsg });
  rememberMessage(chat, userMsg.text);

  const assistantId = uid();
  const assistantMsg = { id: assistantId, role: "assistant", text: "", createdAt: Date.now(), streaming: true };
  store.appendMessage(chatId, assistantMsg);

  abortCtrl = new AbortController();
  streamingChatId = chatId;
  events.emit(EVT.STREAM_START, { chatId });

  try {
    const system = buildSystemPrompt(chat);
    const messages = buildMessages(
      { ...chat, messages: [...(chat.messages || []), userMsg] },
      system
    );
    const full = await streamChat(chat, messages, abortCtrl.signal, (delta, all) => {
      store.updateMessage(chatId, assistantId, { text: all });
      events.emit(EVT.STREAM_DELTA, { chatId, delta, text: all });
    });
    store.updateMessage(chatId, assistantId, { text: full || "…", streaming: false });
    events.emit(EVT.STREAM_DONE, { chatId, text: full });
    events.emit(EVT.MESSAGE_RECEIVED, { chatId, message: { id: assistantId, text: full } });
    recordChatTurn(getRoleId(chat));
    maybeAutoSummary({ ...chat, messages: [...(chat.messages || []), userMsg, { ...assistantMsg, text: full }] });
  } catch (e) {
    if (e.name === "AbortError") {
      events.emit(EVT.STREAM_ABORT, { chatId });
    } else {
      store.updateMessage(chatId, assistantId, {
        text: `（生成失败）${e.message || e}`,
        streaming: false,
        error: true,
      });
      events.emit(EVT.STREAM_ERROR, { chatId, error: e });
    }
  } finally {
    abortCtrl = null;
    streamingChatId = null;
  }
}

export function stopGeneration() {
  if (abortCtrl) {
    abortCtrl.abort();
    abortCtrl = null;
  }
}

export async function retryLastMessage(chatId) {
  const chat = store.getState().chats.find((c) => c.id === chatId);
  if (!chat || !chat.messages?.length) return;
  const msgs = chat.messages.slice();
  // 删除末尾 assistant，重新发最后一条 user
  while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  if (!lastUser) return;
  store.setChatMessages(chatId, msgs.filter((m) => m.id !== lastUser.id));
  await sendMessage(chatId, lastUser.text);
}

export async function regenerate(chatId) {
  return retryLastMessage(chatId);
}

export function editMessage(chatId, msgId, newText) {
  store.updateMessage(chatId, msgId, { text: newText });
}

export function deleteMessage(chatId, msgId) {
  const chat = store.getState().chats.find((c) => c.id === chatId);
  if (!chat) return;
  store.setChatMessages(
    chatId,
    (chat.messages || []).filter((m) => m.id !== msgId)
  );
}

export function copyMessage(text) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
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
};
