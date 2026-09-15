/**
 * EchoChat Conversation Domain (Phase 4)
 *
 * 管理 Conversation（聊天会话）的创建和操作。
 * 支持一个 Character 多个 Conversation。
 *
 * V1 模型：一个 roleId（Character）对应一个 chat（Conversation）
 * Phase 4 模型：一个 Character 可以有多个 Conversation
 *
 * 渐进式迁移：
 * - 现有 chat 继续工作（1:1 关系）
 * - 新增 createConversationForCharacter 支持多 Conversation
 * - UI 逐步支持选择已有角色创建新对话
 */

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { uid } from "../core/utils.js";
import { getRoleId, getPersona, getRoleName } from "./persona.js";
import { messageStore } from "./message-store.js";
import { ConversationRepository } from "../repository/conversation.js";
import { getStorageHooks } from "../repository/storage-hooks.js";
import { deleteMomentsForChat } from "./moments.js";

// ============================================================
//  创建 Conversation
// ============================================================

export function getThreadTitle(chat, siblings) {
  if (!chat) return "日常相处";
  const custom = String(chat.config?.threadTitle || "").trim();
  if (custom) return custom;
  const list = (siblings || getConversationsByCharacter(chat.roleId || ""))
    .filter((c) => !c.archivedAt)
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
  if (list.length <= 1) return "日常相处";
  const idx = Math.max(0, list.findIndex((c) => c.id === chat.id));
  return idx <= 0 ? "日常相处" : `相处线 ${idx + 1}`;
}

export function nextThreadTitle(characterId) {
  const n = getConversationsByCharacter(characterId).filter((c) => !c.archivedAt).length + 1;
  return `相处线 ${n}`;
}

/**
 * 为指定 Character 创建新的 Conversation
 * @param {string} characterId - 角色 ID（roleId）
 * @param {Object} [config] - 会话配置
 * @param {string} [config.title] - 相处线标题（不覆盖角色名）
 * @param {string} [config.threadTitle] - 相处线标题
 * @param {string} [config.persona] - 覆盖角色人设
 * @param {string} [config.model] - AI 模型
 * @param {number} [config.temperature] - 温度
 * @returns {Object} 创建的 chat
 */
export function createConversationForCharacter(characterId, config = {}) {
  // 查找已有角色的配置
  const existingChat = store.getState().chats.find((c) => c.roleId === characterId);
  const basePersona = config.persona || existingChat?.config?.persona || "";
  const baseAvatar = config.avatar || existingChat?.avatar || "";
  const characterName = config.name || existingChat?.name || "新对话";
  const baseCfg = existingChat?.config || {};
  const explicitTitle = String(config.threadTitle || config.title || "").trim();
  const threadTitle =
    explicitTitle && explicitTitle !== characterName ? explicitTitle.slice(0, 40) : String(config.threadTitle || "").trim().slice(0, 40);

  const chat = store.createChat({
    roleId: characterId, // 复用已有角色 ID
    name: characterName,
    avatar: baseAvatar,
    persona: basePersona,
    model: config.model || baseCfg.model || "",
    temperature: config.temperature ?? baseCfg.temperature ?? 1.0,
    firstMessage: config.firstMessage || "",
    scenario: config.scenario || baseCfg.scenario || "",
    mesExample: config.mesExample || baseCfg.mesExample || "",
    speakingStyle: config.speakingStyle || baseCfg.speakingStyle || "",
    replyPace: config.replyPace || baseCfg.replyPace,
    threadTitle,
  });

  ConversationRepository.create({
    id: chat.id,
    characterId,
    title: chat.name,
    config: chat.config,
    createdAt: chat.createdAt,
  }).catch((e) => console.warn("[Conversation] Dexie create failed:", e.message));
  messageStore.migrateChatMessages(chat.id).catch(() => {});

  events.emit(EVT.CHAT_CREATED, chat);
  return chat;
}

/**
 * 从模板创建新角色 + 新对话（V1 兼容）
 */
export function createCharacterAndConversation(template) {
  const roleId = "role_" + uid();
  const chat = store.createChat({
    roleId,
    name: template.name,
    avatar: template.avatar,
    persona: template.persona,
    firstMessage: template.firstMessage,
  });
  ConversationRepository.create({
    id: chat.id,
    characterId: roleId,
    title: chat.name,
    config: chat.config,
    createdAt: chat.createdAt,
  }).catch((e) => console.warn("[Conversation] Dexie create failed:", e.message));
  messageStore.migrateChatMessages(chat.id).catch(() => {});
  return chat;
}

// ============================================================
//  Conversation 操作
// ============================================================

/**
 * 获取指定 Character 的所有 Conversation
 * @param {string} characterId
 * @returns {Array}
 */
export function getConversationsByCharacter(characterId) {
  return store.getState().chats.filter((c) => c.roleId === characterId);
}

/**
 * 获取所有 Character（去重）
 * @returns {Array} 角色列表（每个角色取最新的 conversation）
 */
export function getAllCharacters() {
  const chats = store.getState().chats;
  const seen = new Set();
  const characters = [];
  for (const chat of chats) {
    if (seen.has(chat.roleId)) continue;
    seen.add(chat.roleId);
    characters.push({
      roleId: chat.roleId,
      name: chat.name,
      avatar: chat.avatar,
      conversationCount: chats.filter((c) => c.roleId === chat.roleId).length,
      lastMessageAt: chat.messages?.length
        ? chat.messages[chat.messages.length - 1].time
        : chat.createdAt,
    });
  }
  return characters;
}

/**
 * 重命名 Conversation
 * @param {string} chatId
 * @param {string} newName
 */
export function renameConversation(chatId, newName) {
  const title = String(newName || "").trim().slice(0, 40);
  if (!title) {
    events.emit(EVT.TOAST, { message: "先写个名字", type: "warning" });
    return false;
  }
  const chat = store.getState().chats.find((c) => c.id === chatId);
  if (!chat) return false;
  const config = { ...(chat.config || {}), threadTitle: title };
  store.updateChat(chatId, { config });
  ConversationRepository.update(chatId, { config }).catch(() => {});
  events.emit(EVT.TOAST, { message: "相处线已改名", type: "success" });
  return true;
}

/**
 * 归档 Conversation
 * @param {string} chatId
 */
export function archiveConversation(chatId) {
  store.updateChat(chatId, { archivedAt: Date.now() });
  ConversationRepository.archive(chatId).catch(() => {});
  events.emit(EVT.TOAST, { message: "对话已归档", type: "success" });
}

/**
 * 取消归档
 * @param {string} chatId
 */
export function unarchiveConversation(chatId) {
  store.updateChat(chatId, { archivedAt: null });
  ConversationRepository.unarchive(chatId).catch(() => {});
  events.emit(EVT.TOAST, { message: "对话已恢复", type: "success" });
}

/**
 * 检查是否已归档
 * @param {string} chatId
 * @returns {boolean}
 */
export function isConversationArchived(chatId) {
  const chat = store.getState().chats.find((c) => c.id === chatId);
  return !!chat?.archivedAt;
}

/**
 * 置顶 Conversation
 * @param {string} chatId
 */
export function pinConversation(chatId) {
  store.updateChat(chatId, { pinned: true, pinnedAt: Date.now() });
  events.emit(EVT.TOAST, { message: "对话已置顶", type: "success" });
}

/**
 * 取消置顶
 * @param {string} chatId
 */
export function unpinConversation(chatId) {
  store.updateChat(chatId, { pinned: false, pinnedAt: null });
}

/**
 * 搜索 Conversation
 * @param {string} query
 * @returns {Array}
 */
export function searchConversations(query) {
  const lower = query.toLowerCase();
  return store.getState().chats.filter((c) => {
    if (c.archivedAt) return false;
    const nameMatch = (c.name || "").toLowerCase().includes(lower);
    const lastMsg = c.messages?.[c.messages.length - 1];
    const msgMatch = (lastMsg?.text || "").toLowerCase().includes(lower);
    return nameMatch || msgMatch;
  });
}

/**
 * 删除 Conversation（不删除 Character）
 * @param {string} chatId
 * @param {boolean} [confirm=false] - 是否需要确认
 */
export async function deleteConversation(chatId, confirm = false) {
  void confirm;
  const chat = store.getState().chats.find((c) => c.id === chatId);
  if (chat) {
    const remaining = store.getState().chats.filter((c) => c.roleId === chat.roleId && c.id !== chatId);
    if (remaining.length === 0) {
      console.log(`[Conversation] Deleting last conversation for character ${chat.roleId}`);
    }
    await messageStore.deleteAllMessages(chatId);
    deleteMomentsForChat(chatId);
  }
  await ConversationRepository.delete(chatId);
  store.deleteChat(chatId);
}

/**
 * 导出 Conversation
 * @param {string} chatId
 * @returns {Object} 导出数据
 */
export function exportConversation(chatId) {
  const chat = store.getState().chats.find((c) => c.id === chatId);
  if (!chat) return null;
  const messages = messageStore.peekMessages(chatId);

  return {
    format: "echodata-conversation",
    version: 1,
    exportedAt: new Date().toISOString(),
    character: {
      roleId: chat.roleId,
      name: chat.name,
      avatar: chat.avatar,
      persona: chat.config?.persona,
    },
    conversation: {
      id: chat.id,
      title: chat.name,
      createdAt: chat.createdAt,
      config: chat.config,
    },
    messages: (messages || []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.text,
      timestamp: m.time,
      status: m.status,
    })),
  };
}

/**
 * Copy conversation metadata from localStorage chats into Dexie.
 * Non-destructive: chats and messages stay in place.
 */
export async function migrateAllConversations() {
  const hooks = getStorageHooks();
  if (!(await hooks.isAvailable())) {
    return { migrated: 0, skipped: true, total: 0 };
  }
  const chats = store.getState().chats || [];
  let migrated = 0;
  for (const chat of chats) {
    try {
      const existing = await hooks.conversation.findById(chat.id);
      if (existing) continue;
      await hooks.conversation.create({
        id: chat.id,
        characterId: chat.roleId,
        title: chat.name || "",
        config: chat.config || {},
        messageCount: chat.messages?.length || 0,
        lastMessageAt: chat.messages?.length
          ? chat.messages[chat.messages.length - 1].time
          : chat.createdAt,
        createdAt: chat.createdAt,
        archivedAt: chat.archivedAt || null,
        status: chat.archivedAt ? "archived" : "active",
      });
      migrated++;
    } catch (e) {
      console.error(`[Conversation] migrate ${chat.id} failed:`, e);
    }
  }
  return { migrated, total: chats.length };
}

/**
 * 获取 Conversation 统计信息
 * @param {string} chatId
 * @returns {Object}
 */
export function getConversationStats(chatId) {
  const chat = store.getState().chats.find((c) => c.id === chatId);
  if (!chat) return null;

  const messages = messageStore.peekMessages(chatId);
  const userMsgs = messages.filter((m) => m.role === "me");
  const aiMsgs = messages.filter((m) => m.role === "her");

  return {
    messageCount: messages.length,
    userMessageCount: userMsgs.length,
    aiMessageCount: aiMsgs.length,
    firstMessageAt: messages[0]?.time || chat.createdAt,
    lastMessageAt: messages[messages.length - 1]?.time || chat.createdAt,
    avgMessageLength: messages.length
      ? Math.round(messages.reduce((sum, m) => sum + (m.text?.length || 0), 0) / messages.length)
      : 0,
  };
}

// ============================================================
//  导出
// ============================================================

export const Conversation = {
  createConversationForCharacter,
  createCharacterAndConversation,
  getConversationsByCharacter,
  getAllCharacters,
  getThreadTitle,
  nextThreadTitle,
  renameConversation,
  archiveConversation,
  unarchiveConversation,
  isConversationArchived,
  pinConversation,
  unpinConversation,
  searchConversations,
  deleteConversation,
  exportConversation,
  getConversationStats,
  migrateAllConversations,
};
