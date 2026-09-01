/**
 * EchoChat Message Store (Stage 1 — Dexie Read Cutover)
 *
 * Dual-write: localStorage (store.addMessage) + Dexie.
 * Canonical READ: Dexie via Message Repository / Dexie adapter.
 * Runtime cache: sync UI/chat reads after hydrate; not a localStorage dump.
 *
 * localStorage messages are kept (never discarded) until a later stage
 * removes legacy write.
 */

import { store } from "../core/store.js";
import { getStorageHooks } from "../repository/test-hooks.js";

const runtimeCache = new Map();
const previews = new Map();

export function resetRuntime() {
  runtimeCache.clear();
  previews.clear();
}

function setCache(chatId, messages) {
  runtimeCache.set(chatId, messages);
  const last = messages[messages.length - 1];
  if (last) previews.set(chatId, { text: last.text, time: last.time });
  else previews.delete(chatId);
}

function patchCache(chatId, updater) {
  const current = runtimeCache.has(chatId)
    ? runtimeCache.get(chatId)
    : store.getState().chats.find((c) => c.id === chatId)?.messages || [];
  setCache(chatId, updater(current));
}

/**
 * Sync UI read. After hydrate, this is the Dexie snapshot.
 * Before hydrate, falls back to the in-memory store copy so first paint
 * is not blank; hydrate then replaces cache from Dexie.
 */
export function peekMessages(chatId) {
  if (runtimeCache.has(chatId)) return runtimeCache.get(chatId);
  const chat = store.getState().chats.find((c) => c.id === chatId);
  return chat?.messages || [];
}

export function getCachedMessages(chatId) {
  return runtimeCache.get(chatId) || [];
}

export function getLastMessagePreview(chatId) {
  if (previews.has(chatId)) return previews.get(chatId);
  const msgs = peekMessages(chatId);
  const last = msgs[msgs.length - 1];
  return last ? { text: last.text, time: last.time } : null;
}

async function dexieReady() {
  try {
    return await getStorageHooks().isAvailable();
  } catch {
    return false;
  }
}

function toDexieMessage(msg, chatId) {
  return {
    id: msg.id,
    conversationId: chatId,
    parentMessageId: msg.parentMessageId || null,
    role: msg.role === "me" ? "user" : msg.role === "her" ? "assistant" : msg.role,
    content: msg.text || msg.content || "",
    createdAt: msg.time || Date.now(),
    updatedAt: msg.updatedAt || msg.time || Date.now(),
    status: msg.status || "sent",
    metadata: msg.metadata || {},
  };
}

function toV1Message(msg) {
  return {
    id: msg.id,
    role: msg.role === "user" ? "me" : msg.role === "assistant" ? "her" : msg.role,
    text: msg.content ?? msg.text ?? "",
    time: msg.createdAt ?? msg.time,
    status: msg.status,
    parentMessageId: msg.parentMessageId,
    metadata: msg.metadata,
  };
}

async function bumpConversationMeta(chatId, msg, deltaCount) {
  const hooks = getStorageHooks();
  try {
    const existing = await hooks.conversation.findById(chatId);
    if (!existing) return;
    const patch = { lastMessageAt: msg?.time || msg?.createdAt || Date.now() };
    if (typeof existing.messageCount === "number" && deltaCount) {
      patch.messageCount = Math.max(0, existing.messageCount + deltaCount);
    }
    await hooks.conversation.update(chatId, patch);
  } catch {
    // metadata is best-effort
  }
}

export async function migrateChatMessages(chatId) {
  const available = await dexieReady();
  if (!available) return { migrated: 0, skipped: true };

  const chat = store.getState().chats.find((c) => c.id === chatId);
  if (!chat) return { migrated: 0 };

  const hooks = getStorageHooks();
  const existingCount = await hooks.message.countByConversationId(chatId);
  if (existingCount > 0) {
    return { migrated: 0, alreadyMigrated: true, existingCount };
  }

  const list = chat.messages || [];
  if (list.length) {
    let lastTs = 0;
    const records = list.map((m) => {
      let t = m.time || Date.now();
      if (t <= lastTs) t = lastTs + 1;
      lastTs = t;
      return toDexieMessage({ ...m, time: t }, chatId);
    });
    await hooks.message.bulkCreate(records);
  }

  try {
    const existing = await hooks.conversation.findById(chatId);
    if (!existing) {
      await hooks.conversation.create({
        id: chatId,
        characterId: chat.roleId,
        title: chat.name || "",
        config: chat.config || {},
        messageCount: list.length,
        lastMessageAt: list.length ? list[list.length - 1].time : chat.createdAt,
        createdAt: chat.createdAt,
        archivedAt: chat.archivedAt || null,
        status: chat.archivedAt ? "archived" : "active",
      });
    }
  } catch (e) {
    console.warn("[MessageStore] conversation upsert during migrate failed:", e.message);
  }

  return { migrated: list.length };
}

export async function migrateAllMessages() {
  const chats = store.getState().chats || [];
  const results = [];
  let totalMigrated = 0;
  for (const chat of chats) {
    try {
      const result = await migrateChatMessages(chat.id);
      results.push({ chatId: chat.id, ...result });
      totalMigrated += result.migrated || 0;
    } catch (e) {
      console.error(`[MessageStore] migrate ${chat.id} failed:`, e);
      results.push({ chatId: chat.id, error: String(e) });
    }
  }
  console.log(`[MessageStore] Migration complete: ${totalMigrated} messages`);
  return { totalMigrated, results };
}

function nextCreatedAt(chatId, requested) {
  const last = peekMessages(chatId)[peekMessages(chatId).length - 1];
  const t = requested || Date.now();
  if (last && t <= last.time) return last.time + 1;
  return t;
}

export async function addMessage(chatId, message) {
  const time = nextCreatedAt(chatId, message.time);
  const msg = store.addMessage(chatId, { ...message, time });
  if (runtimeCache.has(chatId)) {
    patchCache(chatId, (list) => [...list, msg]);
  } else {
    setCache(chatId, store.getState().chats.find((c) => c.id === chatId)?.messages || [msg]);
  }

  try {
    if (await dexieReady()) {
      await getStorageHooks().message.create(toDexieMessage(msg, chatId));
      await bumpConversationMeta(chatId, msg, 1);
    }
  } catch (e) {
    console.error("[MessageStore] Dexie addMessage failed:", e);
  }
  return msg;
}

export async function updateMessage(chatId, messageId, patch) {
  store.updateMessage(chatId, messageId, patch);
  if (runtimeCache.has(chatId)) {
    patchCache(chatId, (list) =>
      list.map((m) => (m.id === messageId ? { ...m, ...patch } : m))
    );
  }

  try {
    if (await dexieReady()) {
      const dexiePatch = {};
      if (patch.text !== undefined) dexiePatch.content = patch.text;
      if (patch.status !== undefined) dexiePatch.status = patch.status;
      if (patch.role !== undefined) {
        dexiePatch.role =
          patch.role === "me" ? "user" : patch.role === "her" ? "assistant" : patch.role;
      }
      if (Object.keys(dexiePatch).length > 0) {
        dexiePatch.updatedAt = Date.now();
        await getStorageHooks().message.update(messageId, dexiePatch);
      }
    }
  } catch (e) {
    console.error("[MessageStore] Dexie updateMessage failed:", e);
  }
}

export async function deleteMessage(chatId, messageId) {
  store.deleteMessage(chatId, messageId);
  if (runtimeCache.has(chatId)) {
    patchCache(chatId, (list) => list.filter((m) => m.id !== messageId));
  }
  try {
    if (await dexieReady()) {
      await getStorageHooks().message.delete(messageId);
      const last = peekMessages(chatId)[peekMessages(chatId).length - 1];
      await bumpConversationMeta(chatId, last, -1);
    }
  } catch (e) {
    console.error("[MessageStore] Dexie deleteMessage failed:", e);
  }
}

/**
 * Canonical read: Dexie first. Does not use a full localStorage dump when Dexie has data.
 * Default (no pageSize) returns the full conversation so UI/chat never silently truncate.
 */
export async function getMessages(chatId, options = {}) {
  const hooks = getStorageHooks();
  const available = await dexieReady();

  if (available) {
    try {
      const count = await hooks.message.countByConversationId(chatId);
      if (count > 0) {
        const page = options.page || 1;
        const pageSize = options.pageSize || count;
        const result = await hooks.message.findByConversationId(chatId, {
          ...options,
          page,
          pageSize,
        });
        const v1 = result.items.map(toV1Message);
        if (!options.pageSize) setCache(chatId, v1);
        return v1;
      }
      const dexieConv = await hooks.conversation.findById(chatId);
      if (dexieConv) {
        setCache(chatId, []);
        return [];
      }
    } catch (e) {
      console.error("[MessageStore] Dexie getMessages failed:", e);
    }
  }

  const chat = store.getState().chats.find((c) => c.id === chatId);
  const msgs = chat?.messages || [];
  setCache(chatId, msgs);
  return msgs;
}

export async function getMessageCount(chatId) {
  const hooks = getStorageHooks();
  if (await dexieReady()) {
    try {
      const count = await hooks.message.countByConversationId(chatId);
      if (count > 0) return count;
      const conv = await hooks.conversation.findById(chatId);
      if (conv) return 0;
    } catch (e) {
      // fallback
    }
  }
  const chat = store.getState().chats.find((c) => c.id === chatId);
  return chat?.messages?.length || 0;
}

export async function searchMessages(chatId, query) {
  const hooks = getStorageHooks();
  if (await dexieReady()) {
    try {
      const results = await hooks.message.search(chatId, query);
      if (results.length > 0) return results.map(toV1Message);
    } catch (e) {
      // fallback
    }
  }
  const chat = store.getState().chats.find((c) => c.id === chatId);
  const lower = query.toLowerCase();
  return (chat?.messages || []).filter((m) => (m.text || "").toLowerCase().includes(lower));
}

export async function getMessagesPaginated(chatId, page = 1, pageSize = 50) {
  const hooks = getStorageHooks();
  if (await dexieReady()) {
    try {
      const count = await hooks.message.countByConversationId(chatId);
      if (count > 0) {
        const result = await hooks.message.findByConversationId(chatId, { page, pageSize });
        return {
          items: result.items.map(toV1Message),
          total: result.total,
          hasMore: result.hasMore,
          page,
          pageSize,
        };
      }
      const conv = await hooks.conversation.findById(chatId);
      if (conv) {
        return { items: [], total: 0, hasMore: false, page, pageSize };
      }
    } catch (e) {
      // fallback
    }
  }

  const chat = store.getState().chats.find((c) => c.id === chatId);
  const all = chat?.messages || [];
  const total = all.length;
  const start = Math.max(0, total - page * pageSize);
  const end = Math.min(total, start + pageSize);
  return {
    items: all.slice(start, end),
    total,
    hasMore: start > 0,
    page,
    pageSize,
  };
}

export async function truncateMessages(chatId, keepCount) {
  const msgs = peekMessages(chatId);
  const toDelete = msgs.slice(keepCount).map((m) => m.id);

  store.set((s) => ({
    ...s,
    chats: s.chats.map((c) =>
      c.id === chatId ? { ...c, messages: (c.messages || []).slice(0, keepCount) } : c
    ),
  }));
  setCache(chatId, msgs.slice(0, keepCount));

  if (await dexieReady()) {
    const hooks = getStorageHooks();
    for (const id of toDelete) {
      try {
        await hooks.message.delete(id);
      } catch {
        // continue
      }
    }
  }
}

export async function deleteAllMessages(chatId) {
  store.set((s) => ({
    ...s,
    chats: s.chats.map((c) => (c.id === chatId ? { ...c, messages: [] } : c)),
  }));
  setCache(chatId, []);

  if (await dexieReady()) {
    const hooks = getStorageHooks();
    try {
      if (typeof hooks.message.deleteByConversationId === "function") {
        await hooks.message.deleteByConversationId(chatId);
      } else {
        const messages = await hooks.message.findByConversationId(chatId, { pageSize: 10000 });
        for (const msg of messages.items) {
          await hooks.message.delete(msg.id);
        }
      }
    } catch (e) {
      console.error("[MessageStore] Dexie deleteAllMessages failed:", e);
    }
  }
}

export async function hydrateChat(chatId) {
  if (!chatId) return [];
  return getMessages(chatId);
}

export async function hydrateList() {
  const chats = store.getState().chats || [];
  if (!(await dexieReady())) {
    for (const c of chats) {
      const last = c.messages?.[c.messages.length - 1];
      if (last) previews.set(c.id, { text: last.text, time: last.time });
    }
    return;
  }
  const hooks = getStorageHooks();
  for (const c of chats) {
    try {
      const latest = await hooks.message.findLatest(c.id);
      if (latest) {
        previews.set(c.id, {
          text: latest.content || latest.text,
          time: latest.createdAt || latest.time,
        });
      }
    } catch {
      const last = c.messages?.[c.messages.length - 1];
      if (last) previews.set(c.id, { text: last.text, time: last.time });
    }
  }
}

export async function bootstrapStorage(currentChatId) {
  try {
    await migrateAllMessages();
  } catch (e) {
    console.warn("[MessageStore] message migrate skipped:", e.message);
  }
  try {
    const { Conversation } = await import("./conversation.js");
    if (typeof Conversation.migrateAllConversations === "function") {
      await Conversation.migrateAllConversations();
    }
  } catch (e) {
    console.warn("[MessageStore] conversation migrate skipped:", e.message);
  }
  try {
    const { Character } = await import("./character.js");
    if (typeof Character.migrateCharactersToDexie === "function") {
      await Character.migrateCharactersToDexie();
    }
  } catch (e) {
    console.warn("[MessageStore] character migrate skipped:", e.message);
  }
  try {
    await hydrateList();
    if (currentChatId) await hydrateChat(currentChatId);
  } catch (e) {
    console.warn("[MessageStore] hydrate skipped:", e.message);
  }
}

export const messageStore = {
  addMessage,
  updateMessage,
  deleteMessage,
  getMessages,
  getMessageCount,
  searchMessages,
  getMessagesPaginated,
  truncateMessages,
  deleteAllMessages,
  migrateChatMessages,
  migrateAllMessages,
  peekMessages,
  getCachedMessages,
  getLastMessagePreview,
  hydrateChat,
  hydrateList,
  bootstrapStorage,
  resetRuntime,
  isDexieAvailable: async () => dexieReady(),
};
