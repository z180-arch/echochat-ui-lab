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
import { uid } from "../core/utils.js";
import { getStorageHooks } from "../repository/test-hooks.js";
import { cleanAssistantReply } from "./reply-clean.js";

export const UI_WINDOW = 80;
export const OLDER_PAGE = 50;
export const IMPORT_CHUNK = 5000;

const runtimeCache = new Map();
const previews = new Map();
const olderFlags = new Map();

export function resetRuntime() {
  runtimeCache.clear();
  previews.clear();
  olderFlags.clear();
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

function messageMetadata(msg) {
  const meta = { ...(msg.metadata || {}) };
  if (msg.errorKind) {
    meta.errorKind = msg.errorKind;
    meta.errorText = msg.errorText || "";
  } else {
    delete meta.errorKind;
    delete meta.errorText;
  }
  return meta;
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
    metadata: messageMetadata(msg),
  };
}

function toV1Message(msg) {
  const meta = msg.metadata || {};
  return {
    id: msg.id,
    role: msg.role === "user" ? "me" : msg.role === "assistant" ? "her" : msg.role,
    text: msg.content ?? msg.text ?? "",
    time: msg.createdAt ?? msg.time,
    status: msg.status,
    parentMessageId: msg.parentMessageId,
    metadata: meta,
    errorKind: meta.errorKind,
    errorText: meta.errorText,
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
    const imported = await bulkImportMessages(chatId, list, {
      keepInStore: true,
      skipMeta: true,
    });
    if (!imported.ok) {
      throw new Error(imported.error || "migrate-import-failed");
    }
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

function isAbortError(e) {
  if (!e) return false;
  if (e.name === "AbortError") return true;
  if (e.inner && e.inner.name === "AbortError") return true;
  return /abort/i.test(String(e.message || e));
}

export function importProgress({ done = 0, total = 0 } = {}) {
  const t = Math.max(0, Number(total) || 0);
  const d = Math.min(Math.max(0, Number(done) || 0), t || Number(done) || 0);
  return {
    done: d,
    total: t,
    percent: t ? Math.round((d / t) * 100) : 100,
  };
}

function yieldToUi() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function normalizeImportTurns(turns) {
  const v1 = [];
  let lastTs = 0;
  for (const m of turns || []) {
    let t = Number(m.time || m.createdAt) || Date.now();
    if (t <= lastTs) t = lastTs + 1;
    lastTs = t;
    const role = m.role === "user" ? "me" : m.role === "assistant" ? "her" : m.role || "me";
    v1.push({
      id: m.id || uid(),
      role,
      text: m.text || m.content || "",
      time: t,
      status: m.status || "sent",
      parentMessageId: m.parentMessageId || null,
      metadata: m.metadata || {},
    });
  }
  return v1;
}

function applyImportedWindow(chatId, v1) {
  const tail = v1.slice(-UI_WINDOW);
  setCache(chatId, tail);
  olderFlags.set(chatId, v1.length > UI_WINDOW);
  try {
    store.updateChat(chatId, { messages: tail });
  } catch {
    // tests without this chat in store
  }
}

/**
 * Chunked bulk write. Domain reports progress via callback; UI paints it.
 * On abort/error Dexie rows for this conversation are deleted so a half
 * import cannot linger. keepInStore=true leaves the in-memory copy on
 * failure (migrate path).
 */
export async function bulkImportMessages(chatId, turns, options = {}) {
  const {
    signal,
    onProgress,
    chunkSize = IMPORT_CHUNK,
    replace = false,
    keepInStore = false,
    skipMeta = false,
  } = options;
  if (!chatId) return { ok: false, error: "no-chat", imported: 0 };
  const v1 = normalizeImportTurns(turns);
  const total = v1.length;
  if (!total) {
    onProgress?.(importProgress({ done: 0, total: 0 }));
    return { ok: true, imported: 0 };
  }

  if (replace) {
    await deleteAllMessages(chatId);
  }

  const report = (done) => onProgress?.(importProgress({ done, total }));
  report(0);

  try {
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    if (await dexieReady()) {
      const hooks = getStorageHooks();
      const records = v1.map((m) => toDexieMessage(m, chatId));
      const size = Math.max(1, Number(chunkSize) || IMPORT_CHUNK);
      if (typeof hooks.message.bulkCreateChunked === "function") {
        await hooks.message.bulkCreateChunked(records, {
          chunkSize: size,
          signal,
          mode: "add",
          onProgress: (p) => report(p.done),
        });
      } else {
        for (let i = 0; i < records.length; i += size) {
          if (signal?.aborted) {
            const err = new Error("aborted");
            err.name = "AbortError";
            throw err;
          }
          await hooks.message.bulkCreate(records.slice(i, i + size));
          report(Math.min(i + size, total));
          await yieldToUi();
        }
      }
      if (!skipMeta) await bumpConversationMeta(chatId, v1[v1.length - 1], total);
    } else if (!keepInStore) {
      store.set((s) => ({
        ...s,
        chats: s.chats.map((c) =>
          c.id === chatId
            ? { ...c, messages: replace ? v1 : [...(c.messages || []), ...v1] }
            : c
        ),
      }));
      report(total);
    } else {
      report(total);
    }

    if (await dexieReady()) applyImportedWindow(chatId, v1);
    else {
      const all = peekMessages(chatId);
      setCache(chatId, all.length ? all : v1);
      olderFlags.set(chatId, false);
    }
    report(total);
    return { ok: true, imported: total };
  } catch (e) {
    try {
      if (await dexieReady()) {
        await getStorageHooks().message.deleteByConversationId(chatId);
      }
    } catch {
      // best-effort Dexie rollback
    }
    if (!keepInStore) {
      try {
        store.updateChat(chatId, { messages: [] });
      } catch {
        // ignore
      }
      setCache(chatId, []);
      olderFlags.set(chatId, false);
    }
    const aborted = isAbortError(e);
    return {
      ok: false,
      error: aborted ? "aborted" : String(e?.message || e),
      imported: 0,
      aborted,
      cause: e,
    };
  }
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
      if (patch.metadata !== undefined || patch.errorKind !== undefined || patch.errorText !== undefined) {
        const cur = peekMessages(chatId).find((m) => m.id === messageId);
        dexiePatch.metadata = messageMetadata({ ...cur, ...patch });
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
export function peekHasOlder(chatId) {
  return !!olderFlags.get(chatId);
}

export function peekMessageById(chatId, messageId) {
  if (!chatId || !messageId) return null;
  return peekMessages(chatId).find((m) => m.id === messageId) || null;
}

function sliceNewest(messages, limit) {
  const all = Array.isArray(messages) ? messages : [];
  const cap = Math.max(1, Number(limit) || UI_WINDOW);
  if (all.length <= cap) return { items: all.slice(), hasOlder: false };
  return { items: all.slice(-cap), hasOlder: true };
}

async function readTail(chatId, { limit = UI_WINDOW, before, beforeId } = {}) {
  const hooks = getStorageHooks();
  if (await dexieReady()) {
    try {
      if (typeof hooks.message.findTail === "function") {
        const rows = await hooks.message.findTail(chatId, { limit, before, beforeId });
        return (rows || []).map(toV1Message);
      }
      const result = await hooks.message.findByConversationId(chatId, {
        page: 1,
        pageSize: limit,
        before,
      });
      return (result.items || []).map(toV1Message);
    } catch (e) {
      console.error("[MessageStore] tail read failed:", e);
    }
  }
  const chat = store.getState().chats.find((c) => c.id === chatId);
  let list = chat?.messages || [];
  if (before != null) {
    list = list.filter((m) => (m.time || 0) < before && m.id !== beforeId);
  }
  return sliceNewest(list, limit).items;
}

export async function loadOlderMessages(chatId) {
  if (!chatId || !olderFlags.get(chatId)) return 0;
  const current = peekMessages(chatId);
  const oldest = current[0];
  if (!oldest) {
    olderFlags.set(chatId, false);
    return 0;
  }
  const older = await readTail(chatId, {
    limit: OLDER_PAGE,
    before: oldest.time,
    beforeId: oldest.id,
  });
  const seen = new Set(current.map((m) => m.id));
  const prepend = older.filter((m) => m.id && !seen.has(m.id));
  if (!prepend.length) {
    olderFlags.set(chatId, false);
    return 0;
  }
  setCache(chatId, prepend.concat(current));
  if (prepend.length < OLDER_PAGE) olderFlags.set(chatId, false);
  return prepend.length;
}

/**
 * Canonical read: Dexie first. Does not use a full localStorage dump when Dexie has data.
 * Default (no pageSize) returns the full conversation so export/tests never silently truncate.
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
  const count = await getMessageCount(chatId);
  if (count > UI_WINDOW) {
    const msgs = await readTail(chatId, { limit: UI_WINDOW });
    setCache(chatId, msgs);
    olderFlags.set(chatId, count > msgs.length);
    // Do not shrink store.messages to the UI window. Dexie is canonical;
    // the store copy is the reload fallback if Dexie later fails.
  } else {
    await getMessages(chatId);
    olderFlags.set(chatId, false);
  }
  for (const m of peekMessages(chatId)) {
    if (m.role !== "her" || m.status !== "streaming") continue;
    const cleaned = cleanAssistantReply(m.text || "");
    if (!cleaned) await deleteMessage(chatId, m.id);
    else await updateMessage(chatId, m.id, { text: cleaned, status: "sent" });
  }
  return peekMessages(chatId);
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
  try {
    const { hydrateMoments } = await import("./moments.js");
    await hydrateMoments();
  } catch (e) {
    console.warn("[MessageStore] moments hydrate skipped:", e.message);
  }
  try {
    const { hydrateWorldbook } = await import("./worldbook.js");
    await hydrateWorldbook();
  } catch (e) {
    console.warn("[MessageStore] worldbook hydrate skipped:", e.message);
  }
  try {
    const { hydrateRelations } = await import("./relations.js");
    await hydrateRelations();
  } catch (e) {
    console.warn("[MessageStore] relations hydrate skipped:", e.message);
  }
  try {
    const { hydrateMemories } = await import("./memory.js");
    await hydrateMemories();
  } catch (e) {
    console.warn("[MessageStore] memory hydrate skipped:", e.message);
  }
}

export const messageStore = {
  addMessage,
  bulkImportMessages,
  importProgress,
  updateMessage,
  deleteMessage,
  getMessages,
  getMessageCount,
  searchMessages,
  getMessagesPaginated,
  loadOlderMessages,
  peekHasOlder,
  peekMessageById,
  UI_WINDOW,
  OLDER_PAGE,
  IMPORT_CHUNK,
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
