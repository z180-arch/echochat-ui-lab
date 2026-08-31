// ============================================================
//  EchoChat Rebuild · Chat Controller
//  聊天业务逻辑：发送/流式/停止/重试/消息操作
//  解决：send() 80行混杂、状态不明确、错误处理不统一的问题
// ============================================================

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { uid, sleep, rand } from "../core/utils.js";
import { getRoleId, getPersona, getRoleName } from "./persona.js";
import { buildMessages, streamChat, needsApiSetup } from "./provider.js";
import { buildMemoryBlock } from "./memory.js";
import { buildWorldbookBlock } from "./worldbook.js";
import { recordChatTurn } from "./relations.js";
import { maybeAutoSummary } from "./memory.js";

let abortCtrl = null;
let sending = false;
let streamingChatId = null;

export function isSending() {
  return sending;
}

export function getStreamingChatId() {
  return streamingChatId;
}

// 构建系统提示词（人设 + 记忆 + 世界书）
function buildSystemPrompt(chat) {
  const parts = [];
  const persona = getPersona(chat);
  if (persona) parts.push(persona);

  const roleId = getRoleId(chat);
  const memoryBlock = roleId ? buildMemoryBlock(roleId) : null;
  if (memoryBlock) parts.push(memoryBlock);

  const wbBlock = buildWorldbookBlock(chat, chat.messages, roleId, persona);
  if (wbBlock) parts.push(wbBlock);

  return parts.join("\n\n");
}

// 发送消息
export async function sendMessage(text) {
  const chat = store.getCurrentChat();
  if (!chat || sending || !text?.trim()) return;

  if (needsApiSetup(chat)) {
    events.emit(EVT.TOAST, {
      message: "请先配置 API 接口地址与 Key",
      type: "error",
      action: { label: "打开设置", handler: () => events.emit(EVT.MODAL_OPEN, "settings") },
    });
    return;
  }

  // 1. 添加用户消息
  const userMsg = store.addMessage(chat.id, { role: "me", text: text.trim(), status: "sent" });
  events.emit(EVT.MESSAGE_SENT, { chatId: chat.id, message: userMsg });

  // 2. 设置发送状态
  sending = true;
  streamingChatId = chat.id;
  abortCtrl = new AbortController();

  events.emit(EVT.STREAM_START, { chatId: chat.id });

  try {
    // 3. 心理停顿（亲密话语）
    if (isIntimate(text)) {
      await sleep(rand(1200, 2600));
      await sleep(1000);
    }

    // 4. 构建请求
    const systemPrompt = buildSystemPrompt(chat);
    const messages = buildMessages(chat, systemPrompt);

    // 5. 创建临时 AI 消息（流式中）
    const tempMsg = store.addMessage(chat.id, {
      role: "her",
      text: "",
      status: "streaming",
    });

    // 6. 流式请求
    const reply = await streamChat(chat, messages, abortCtrl.signal, (full) => {
      store.updateMessage(chat.id, tempMsg.id, { text: full, status: "streaming" });
    });

    // 7. 完成
    if (reply?.trim()) {
      store.updateMessage(chat.id, tempMsg.id, {
        text: reply.trim(),
        status: "sent",
      });
      events.emit(EVT.MESSAGE_RECEIVED, { chatId: chat.id, message: tempMsg });

      // 8. 记录关系
      const roleId = getRoleId(chat);
      if (roleId) {
        recordChatTurn(roleId, getRoleName(chat));
        events.emit(EVT.RELATION_UPDATE, { roleId });
      }

      // 9. 自动摘要（非阻塞）
      maybeAutoSummary(store.getCurrentChat() || chat);
    } else {
      store.deleteMessage(chat.id, tempMsg.id);
    }
  } catch (e) {
    // 错误处理
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
    // 清理临时消息
    const current = store.getCurrentChat();
    if (current) {
      const lastMsg = current.messages[current.messages.length - 1];
      if (lastMsg?.status === "streaming") {
        store.updateMessage(current.id, lastMsg.id, {
          status: e.name === "AbortError" ? "stopped" : "error",
        });
      }
    }
  } finally {
    sending = false;
    streamingChatId = null;
    abortCtrl = null;
    events.emit(EVT.STREAM_DONE, { chatId: chat.id });
  }
}

// 停止生成
export function stopGeneration() {
  if (abortCtrl) {
    abortCtrl.abort();
  }
}

// 重试最后一条消息
export function retryLastMessage() {
  const chat = store.getCurrentChat();
  if (!chat || sending) return;

  // 找到最后一条用户消息
  let lastUserIdx = -1;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === "me") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) return;

  const userText = chat.messages[lastUserIdx].text;

  // 删除最后一条用户消息之后的所有消息
  store.set((s) => ({
    ...s,
    chats: s.chats.map((c) =>
      c.id === chat.id ? { ...c, messages: c.messages.slice(0, lastUserIdx) } : c
    ),
  }));

  // 重新发送
  sendMessage(userText);
}

// 重新生成 AI 回复
export function regenerate(messageIndex) {
  const chat = store.getCurrentChat();
  if (!chat || sending) return;

  // 找到该消息之前的用户消息
  let userText = null;
  for (let i = messageIndex - 1; i >= 0; i--) {
    if (chat.messages[i].role === "me") {
      userText = chat.messages[i].text;
      break;
    }
  }
  if (!userText) return;

  // 删除从该条开始的所有消息
  store.set((s) => ({
    ...s,
    chats: s.chats.map((c) =>
      c.id === chat.id ? { ...c, messages: c.messages.slice(0, messageIndex) } : c
    ),
  }));

  sendMessage(userText);
}

// 编辑消息（删除后重新输入）
export function editMessage(messageIndex) {
  const chat = store.getCurrentChat();
  if (!chat) return;
  const msg = chat.messages[messageIndex];
  if (!msg || msg.role !== "me") return;

  store.set((s) => ({
    ...s,
    chats: s.chats.map((c) =>
      c.id === chat.id ? { ...c, messages: c.messages.slice(0, messageIndex) } : c
    ),
  }));

  return msg.text;
}

// 删除消息
export function deleteMessage(messageIndex) {
  const chat = store.getCurrentChat();
  if (!chat) return;
  const msgId = chat.messages[messageIndex]?.id;
  if (msgId) store.deleteMessage(chat.id, msgId);
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

const INTIMATE_WORDS = ["我爱你", "想你了", "抱抱", "亲亲", "喜欢你", "想念你", "爱你", "么么"];
function isIntimate(text) {
  return INTIMATE_WORDS.some((w) => text.includes(w));
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
