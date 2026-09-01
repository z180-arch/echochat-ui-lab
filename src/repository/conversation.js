/**
 * ConversationRepository
 *
 * Stage 2: Dexie-backed persistence with localStorage dual-write.
 * Existing chats are never discarded. Read prefers Dexie when present.
 */

import { legacyAdapter } from "./legacy-adapter.js";
import { getStorageHooks } from "./test-hooks.js";

function chatToConversation(chat) {
  return {
    id: chat.id,
    characterId: chat.roleId,
    title: chat.name || "",
    createdAt: chat.createdAt || Date.now(),
    updatedAt: chat.updatedAt || chat.createdAt || Date.now(),
    archivedAt: chat.archivedAt || null,
    status: chat.archivedAt ? "archived" : chat.status || "active",
    config: chat.config || {},
    messageCount: chat.messages?.length || chat.messageCount || 0,
    lastMessageAt: chat.messages?.length
      ? chat.messages[chat.messages.length - 1].time
      : chat.lastMessageAt || chat.createdAt,
  };
}

function dexieToConversation(rec) {
  return {
    id: rec.id,
    characterId: rec.characterId,
    title: rec.title || "",
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    archivedAt: rec.archivedAt || null,
    status: rec.status || (rec.archivedAt ? "archived" : "active"),
    config: rec.config || {},
    messageCount: rec.messageCount || 0,
    lastMessageAt: rec.lastMessageAt || rec.createdAt,
  };
}

export const ConversationRepository = {
  async findById(id) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        const rec = await hooks.conversation.findById(id);
        if (rec) return dexieToConversation(rec);
      }
    } catch (e) {
      // fallback
    }
    const chat = legacyAdapter.getChatById(id);
    return chat ? chatToConversation(chat) : null;
  },

  async findAll(options = {}) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        const recs = await hooks.conversation.findAll(options);
        if (recs && recs.length > 0) {
          return recs.map(dexieToConversation);
        }
      }
    } catch (e) {
      // fallback
    }
    let result = (legacyAdapter.getAllChats() || []).map(chatToConversation);
    if (options.includeArchived === false) {
      result = result.filter((c) => !c.archivedAt && c.status !== "archived");
    }
    return result;
  },

  async findByCharacterId(characterId, options = {}) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        const recs = await hooks.conversation.findByCharacterId(characterId, options);
        if (recs && recs.length > 0) return recs.map(dexieToConversation);
        const all = await hooks.conversation.findAll(options);
        if (all && all.length > 0) {
          return all
            .filter((c) => c.characterId === characterId)
            .map(dexieToConversation);
        }
      }
    } catch (e) {
      // fallback
    }
    let result = legacyAdapter.getChatsByRoleId(characterId).map(chatToConversation);
    if (options.includeArchived === false) {
      result = result.filter((c) => !c.archivedAt);
    }
    return result;
  },

  async create(conversation) {
    const id =
      conversation.id || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const existingLegacy = legacyAdapter.getChatById(id);
    if (!existingLegacy) {
      legacyAdapter.addChat({
        id,
        roleId: conversation.characterId,
        name: conversation.title || "",
        avatar: conversation.avatar || null,
        createdAt: conversation.createdAt || Date.now(),
        config: conversation.config || {},
        messages: conversation.messages || [],
        archivedAt: conversation.archivedAt || null,
      });
    }

    try {
      const hooks = getStorageHooks();
      if (await hooks.isAvailable()) {
        const existing = await hooks.conversation.findById(id);
        if (!existing) {
          await hooks.conversation.create({
            id,
            characterId: conversation.characterId,
            title: conversation.title || "",
            config: conversation.config || {},
            messageCount: conversation.messageCount ?? (conversation.messages?.length || 0),
            lastMessageAt: conversation.lastMessageAt,
            createdAt: conversation.createdAt,
            archivedAt: conversation.archivedAt || null,
            status: conversation.status || (conversation.archivedAt ? "archived" : "active"),
          });
        }
      }
    } catch (e) {
      console.warn("[ConversationRepository] Dexie create failed:", e.message);
    }

    return this.findById(id);
  },

  async update(id, updates) {
    legacyAdapter.updateChat(id, (chat) => {
      if (updates.title !== undefined) chat.name = updates.title;
      if (updates.config) chat.config = { ...chat.config, ...updates.config };
      if (updates.archivedAt !== undefined) chat.archivedAt = updates.archivedAt;
      chat.updatedAt = Date.now();
      return chat;
    });

    try {
      const hooks = getStorageHooks();
      if (await hooks.isAvailable()) {
        const dexiePatch = { ...updates };
        if (updates.title !== undefined) dexiePatch.title = updates.title;
        await hooks.conversation.update(id, dexiePatch);
      }
    } catch (e) {
      console.warn("[ConversationRepository] Dexie update failed:", e.message);
    }

    return this.findById(id);
  },

  async archive(id) {
    await this.update(id, { status: "archived", archivedAt: Date.now() });
  },

  async unarchive(id) {
    await this.update(id, { status: "active", archivedAt: null });
  },

  async delete(id) {
    try {
      const hooks = getStorageHooks();
      if (await hooks.isAvailable()) {
        if (typeof hooks.message.deleteByConversationId === "function") {
          await hooks.message.deleteByConversationId(id);
        }
        await hooks.conversation.delete(id);
      }
    } catch (e) {
      console.warn("[ConversationRepository] Dexie delete failed:", e.message);
    }
    legacyAdapter.removeChat(id);
  },

  async countByCharacterId(characterId) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        if (typeof hooks.conversation.countByCharacterId === "function") {
          const n = await hooks.conversation.countByCharacterId(characterId);
          if (n > 0) return n;
        }
      }
    } catch (e) {
      // fallback
    }
    return legacyAdapter.getChatsByRoleId(characterId).length;
  },
};
