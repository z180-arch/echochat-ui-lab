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
import { getMemoryList } from "./memory.js";
import { buildWorldbookBlock } from "./worldbook.js";
import { recordChatTurn, getAffinity } from "./relations.js";
import { maybeAutoSummary } from "./memory.js";
import { messageStore } from "./message-store.js";
import { listMoments } from "./moments.js";
import { buildBehaviorContext } from "./behavior.js";

let abortCtrl = null;
let sending = false;
let streamingChatId = null;

export function isSending() {
  return sending;
}

export function getStreamingChatId() {
  return streamingChatId;
}

// 构建系统提示词（人设 + 记忆 + 关系语气 + 世界书）
export function buildSystemPrompt(chat) {
  const roleId = getRoleId(chat);
  const persona = getPersona(chat);
  const memories = roleId ? getMemoryList(roleId, store.getState().memoryCfg?.injectMax || 10) : [];
  const affinity = roleId ? getAffinity(roleId, { moments: listMoments(roleId) }) : null;
  const behavior = buildBehaviorContext({ persona, memories, affinity });

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
  if (!chat || sending || !text?.trim()) return;

  // Persist the user message first so a missing API key never drops it.
  const userMsg = await messageStore.addMessage(chat.id, { role: "me", text: text.trim(), status: "sent" });
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
    const messages = buildMessages(chat, systemPrompt, messageStore.peekMessages(chat.id));

    // 5. 创建临时 AI 消息（流式中）
    const tempMsg = await messageStore.addMessage(chat.id, {
      role: "her",
      text: "",
      status: "streaming",
    });

    // 6. 流式请求
    const reply = await streamChat(chat, messages, abortCtrl.signal, (full) => {
      messageStore.updateMessage(chat.id, tempMsg.id, { text: full, status: "streaming" });
    });

    // 7. 完成
    if (reply?.trim()) {
      messageStore.updateMessage(chat.id, tempMsg.id, {
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
      messageStore.deleteMessage(chat.id, tempMsg.id);
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
      const msgs = messageStore.peekMessages(current.id);
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg?.status === "streaming") {
        messageStore.updateMessage(current.id, lastMsg.id, {
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
