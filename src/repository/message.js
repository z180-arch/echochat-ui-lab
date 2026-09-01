/**
 * MessageRepository
 *
 * Stage 1: Dexie-backed read path with localStorage fallback.
 * Writes dual-write (legacy chats.messages + Dexie) so existing data is never discarded.
 */

import { legacyAdapter } from "./legacy-adapter.js";
import { getStorageHooks } from "./test-hooks.js";

function messageToV2(msg, chatId) {
  const role =
    msg.role === "me" ? "user" : msg.role === "her" ? "assistant" : msg.role;
  return {
    id: msg.id,
    conversationId: chatId,
    parentMessageId: msg.parentMessageId || null,
    role,
    content: msg.text || msg.content || "",
    createdAt: msg.time || msg.createdAt || Date.now(),
    updatedAt: msg.updatedAt || msg.time || msg.createdAt || Date.now(),
    status: msg.status || "sent",
    metadata: msg.metadata || {},
  };
}

function v2ToLegacyMessage(v2) {
  return {
    id: v2.id,
    role: v2.role === "user" ? "me" : v2.role === "assistant" ? "her" : v2.role,
    text: v2.content,
    time: v2.createdAt,
    status: v2.status,
    parentMessageId: v2.parentMessageId,
    metadata: v2.metadata,
  };
}

function emptyPage(options = {}) {
  return {
    items: [],
    total: 0,
    page: options.page || 1,
    pageSize: options.pageSize || 50,
    hasMore: false,
  };
}

export const MessageRepository = {
  async findById(id) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        const found = await hooks.message.findById(id);
        if (found) return messageToV2(found, found.conversationId);
      }
    } catch (e) {
      // fallback
    }
    const chats = legacyAdapter.getAllChats();
    for (const chat of chats) {
      const msg = chat.messages?.find((m) => m.id === id);
      if (msg) return messageToV2(msg, chat.id);
    }
    return null;
  },

  async findByConversationId(conversationId, options = {}) {
    const { page = 1, pageSize = 50, before, after } = options;
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        const count = await hooks.message.countByConversationId(conversationId);
        if (count > 0) {
          const size = options.pageSize || count;
          const result = await hooks.message.findByConversationId(conversationId, {
            page,
            pageSize: size,
            before,
            after,
          });
          return {
            ...result,
            items: result.items.map((m) => messageToV2(m, conversationId)),
          };
        }
        const conv = await hooks.conversation.findById(conversationId);
        if (conv) return emptyPage({ page, pageSize });
      }
    } catch (e) {
      // fallback
    }

    const chat = legacyAdapter.getChatById(conversationId);
    if (!chat) return emptyPage({ page, pageSize });

    let messages = chat.messages || [];
    if (before) messages = messages.filter((m) => m.time < before);
    if (after) messages = messages.filter((m) => m.time > after);

    const total = messages.length;
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
    const v2 = {
      id: message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId: message.conversationId,
      parentMessageId: message.parentMessageId || null,
      role: message.role,
      content: message.content ?? message.text ?? "",
      createdAt: message.createdAt || message.time || Date.now(),
      updatedAt: message.updatedAt || Date.now(),
      status: message.status || "sent",
      metadata: message.metadata || {},
    };

    const chat = legacyAdapter.getChatById(v2.conversationId);
    if (chat) {
      const legacy = v2ToLegacyMessage(v2);
      chat.messages = chat.messages || [];
      if (!chat.messages.some((m) => m.id === legacy.id)) {
        chat.messages.push(legacy);
        legacyAdapter.updateChat(chat.id, chat);
      }
    }

    try {
      const hooks = getStorageHooks();
      if (await hooks.isAvailable()) {
        await hooks.message.create({
          id: v2.id,
          conversationId: v2.conversationId,
          parentMessageId: v2.parentMessageId,
          role:
            v2.role === "me" ? "user" : v2.role === "her" ? "assistant" : v2.role,
          content: v2.content,
          createdAt: v2.createdAt,
          updatedAt: v2.updatedAt,
          status: v2.status,
          metadata: v2.metadata,
        });
      }
    } catch (e) {
      console.warn("[MessageRepository] Dexie create failed:", e.message);
    }

    return messageToV2(
      { ...v2, text: v2.content, time: v2.createdAt },
      v2.conversationId
    );
  },

  async update(id, updates) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        const dexiePatch = { ...updates };
        if (updates.content !== undefined) dexiePatch.content = updates.content;
        if (updates.text !== undefined) dexiePatch.content = updates.text;
        if (updates.role !== undefined) {
          dexiePatch.role =
            updates.role === "me" ? "user" : updates.role === "her" ? "assistant" : updates.role;
        }
        const updated = await hooks.message.update(id, dexiePatch);
        if (updated) {
          const chats = legacyAdapter.getAllChats();
          for (const chat of chats) {
            const idx = chat.messages?.findIndex((m) => m.id === id);
            if (idx !== -1) {
              chat.messages[idx] = {
                ...chat.messages[idx],
                ...updates,
                text: updates.content || updates.text || chat.messages[idx].text,
              };
              chat.messages[idx].updatedAt = Date.now();
              legacyAdapter.updateChat(chat.id, chat);
              break;
            }
          }
          return messageToV2(updated, updated.conversationId);
        }
      }
    } catch (e) {
      // fallback
    }

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
    try {
      const hooks = getStorageHooks();
      if (await hooks.isAvailable()) {
        await hooks.message.delete(id);
      }
    } catch (e) {
      // continue legacy
    }
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
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        const count = await hooks.message.countByConversationId(conversationId);
        if (count > 0) return count;
        const conv = await hooks.conversation.findById(conversationId);
        if (conv) return 0;
      }
    } catch (e) {
      // fallback
    }
    const chat = legacyAdapter.getChatById(conversationId);
    return chat?.messages?.length || 0;
  },

  async search(conversationId, query, options = {}) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        const results = await hooks.message.search(conversationId, query, options);
        if (results.length > 0) {
          return results.map((m) => messageToV2(m, conversationId));
        }
      }
    } catch (e) {
      // fallback
    }
    const chat = legacyAdapter.getChatById(conversationId);
    if (!chat) return [];
    const lower = query.toLowerCase();
    return (chat.messages || [])
      .filter((m) => (m.text || "").toLowerCase().includes(lower))
      .map((m) => messageToV2(m, conversationId));
  },

  async findLatest(conversationId) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        const latest = await hooks.message.findLatest(conversationId);
        if (latest) return messageToV2(latest, conversationId);
      }
    } catch (e) {
      // fallback
    }
    const chat = legacyAdapter.getChatById(conversationId);
    if (!chat?.messages?.length) return null;
    const latest = chat.messages[chat.messages.length - 1];
    return messageToV2(latest, conversationId);
  },

  async findBranches(parentMessageId) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        const branches = await hooks.message.findBranches(parentMessageId);
        if (branches.length > 0) {
          return branches.map((m) => messageToV2(m, m.conversationId));
        }
      }
    } catch (e) {
      // fallback
    }
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
