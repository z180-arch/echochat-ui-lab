/**
 * MessageRepository (Legacy Implementation)
 *
 * Phase 1 过渡实现：从 chat.messages 数组中读取。
 * Phase 3 将替换为独立的 Message 存储（Dexie/IndexedDB），支持分页、搜索、分支。
 *
 * 当前 V1 中 messages 内嵌在 chat 对象中，此 Repository 提供统一接口，
 * 未来替换底层存储时接口不变。
 */

import { legacyAdapter } from "./legacy-adapter.js";

function messageToV2(msg, chatId) {
  return {
    id: msg.id,
    conversationId: chatId,
    parentMessageId: msg.parentMessageId || null,
    role: msg.role,
    content: msg.text || msg.content || "",
    createdAt: msg.time || Date.now(),
    updatedAt: msg.updatedAt || msg.time || Date.now(),
    status: msg.status || "sent",
    metadata: msg.metadata || {},
  };
}

function v2ToMessage(v2) {
  return {
    id: v2.id,
    role: v2.role,
    text: v2.content,
    time: v2.createdAt,
    status: v2.status,
    parentMessageId: v2.parentMessageId,
    metadata: v2.metadata,
  };
}

export const MessageRepository = {
  async findById(id) {
    const chats = legacyAdapter.getAllChats();
    for (const chat of chats) {
      const msg = chat.messages?.find((m) => m.id === id);
      if (msg) return messageToV2(msg, chat.id);
    }
    return null;
  },

  /**
   * 分页获取 conversation 的消息
   * 当前 Legacy 实现：全量加载后内存分页。
   * Phase 3 Dexie 实现：数据库级分页。
   */
  async findByConversationId(conversationId, options = {}) {
    const { page = 1, pageSize = 50, before, after } = options;
    const chat = legacyAdapter.getChatById(conversationId);
    if (!chat) return { items: [], total: 0, page, pageSize, hasMore: false };

    let messages = chat.messages || [];

    if (before) {
      messages = messages.filter((m) => m.time < before);
    }
    if (after) {
      messages = messages.filter((m) => m.time > after);
    }

    const total = messages.length;
    // 按时间倒序分页（最新的在前面），但返回时按时间正序
    const sorted = [...messages].sort((a, b) => b.time - a.time);
    const start = (page - 1) * pageSize;
    const pageItems = sorted.slice(start, start + pageSize).reverse();

    return {
      items: pageItems.map((m) => messageToV2(m, conversationId)),
      total,
      page,
      pageSize,
      hasMore: start + pageSize < total,
    };
  },

  async create(message) {
    const chat = legacyAdapter.getChatById(message.conversationId);
    if (!chat) throw new Error(`Conversation not found: ${message.conversationId}`);

    const msg = v2ToMessage(message);
    if (!msg.id) msg.id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!msg.time) msg.time = Date.now();

    chat.messages = chat.messages || [];
    chat.messages.push(msg);
    legacyAdapter.updateChat(chat.id, chat);

    return messageToV2(msg, chat.id);
  },

  async update(id, updates) {
    const chats = legacyAdapter.getAllChats();
    for (const chat of chats) {
      const idx = chat.messages?.findIndex((m) => m.id === id);
      if (idx !== -1) {
        chat.messages[idx] = { ...chat.messages[idx], ...updates };
        if (updates.content) chat.messages[idx].text = updates.content;
        chat.messages[idx].updatedAt = Date.now();
        legacyAdapter.updateChat(chat.id, chat);
        return messageToV2(chat.messages[idx], chat.id);
      }
    }
    return null;
  },

  async delete(id) {
    const chats = legacyAdapter.getAllChats();
    for (const chat of chats) {
      const before = chat.messages?.length || 0;
      chat.messages = (chat.messages || []).filter((m) => m.id !== id);
      if (chat.messages.length !== before) {
        legacyAdapter.updateChat(chat.id, chat);
        return;
      }
    }
  },

  async countByConversationId(conversationId) {
    const chat = legacyAdapter.getChatById(conversationId);
    return chat?.messages?.length || 0;
  },

  async search(conversationId, query, options = {}) {
    const chat = legacyAdapter.getChatById(conversationId);
    if (!chat) return [];
    const lower = query.toLowerCase();
    return (chat.messages || [])
      .filter((m) => (m.text || "").toLowerCase().includes(lower))
      .map((m) => messageToV2(m, conversationId));
  },

  async findLatest(conversationId) {
    const chat = legacyAdapter.getChatById(conversationId);
    if (!chat?.messages?.length) return null;
    const latest = chat.messages[chat.messages.length - 1];
    return messageToV2(latest, conversationId);
  },

  async findBranches(parentMessageId) {
    const chats = legacyAdapter.getAllChats();
    const branches = [];
    for (const chat of chats) {
      for (const msg of chat.messages || []) {
        if (msg.parentMessageId === parentMessageId) {
          branches.push(messageToV2(msg, chat.id));
        }
      }
    }
    return branches;
  },
};
