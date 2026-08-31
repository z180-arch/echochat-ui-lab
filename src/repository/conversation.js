/**
 * ConversationRepository (Legacy Implementation)
 *
 * Phase 1 过渡实现：包装现有 state.chats。
 * Phase 3-4 将替换为独立的 Conversation + Message 存储。
 */

import { legacyAdapter } from "./legacy-adapter.js";

function chatToConversation(chat) {
  return {
    id: chat.id,
    characterId: chat.roleId,
    title: chat.name || "",
    createdAt: chat.createdAt || Date.now(),
    updatedAt: chat.updatedAt || chat.createdAt || Date.now(),
    archivedAt: chat.archivedAt || null,
    config: chat.config || {},
    messageCount: chat.messages?.length || 0,
    lastMessageAt: chat.messages?.length
      ? chat.messages[chat.messages.length - 1].time
      : chat.createdAt,
  };
}

export const ConversationRepository = {
  async findById(id) {
    const chat = legacyAdapter.getChatById(id);
    return chat ? chatToConversation(chat) : null;
  },

  async findByCharacterId(characterId, options = {}) {
    const chats = legacyAdapter.getChatsByRoleId(characterId);
    let result = chats.map(chatToConversation);
    if (options.includeArchived === false) {
      result = result.filter((c) => !c.archivedAt);
    }
    return result;
  },

  async create(conversation) {
    const chat = {
      id: conversation.id || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roleId: conversation.characterId,
      name: conversation.title || "",
      avatar: conversation.avatar || null,
      createdAt: Date.now(),
      config: conversation.config || {},
      messages: [],
    };
    legacyAdapter.addChat(chat);
    return chatToConversation(chat);
  },

  async update(id, updates) {
    legacyAdapter.updateChat(id, (chat) => {
      if (updates.title) chat.name = updates.title;
      if (updates.config) chat.config = { ...chat.config, ...updates.config };
      chat.updatedAt = Date.now();
      return chat;
    });
    return this.findById(id);
  },

  async archive(id) {
    legacyAdapter.updateChat(id, (chat) => {
      chat.archivedAt = Date.now();
      return chat;
    });
  },

  async unarchive(id) {
    legacyAdapter.updateChat(id, (chat) => {
      delete chat.archivedAt;
      return chat;
    });
  },

  async delete(id) {
    legacyAdapter.removeChat(id);
  },

  async countByCharacterId(characterId) {
    return legacyAdapter.getChatsByRoleId(characterId).length;
  },
};
