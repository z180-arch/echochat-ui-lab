/**
 * Product backup: app state plus satellite stores.
 * Additive JSON. Old backups that only have `state` still import.
 */

import { store } from "../core/store.js";
import { storage } from "../core/storage.js";
import { loadMoments, saveMoments, resetMomentsRuntime } from "./moments.js";
import { loadRelations, saveRelations, resetRelationsRuntime } from "./relations.js";
import { loadWorldbook, saveWorldbook, resetWorldbookRuntime } from "./worldbook.js";
import { exportMemorySnapshot, replaceMemorySnapshot, resetMemoriesRuntime, flushMemoriesPersist } from "./memory.js";
import { deleteDb, clearMigrationFlags } from "../repository/persistence.js";
import {
  resetRuntime as resetMessageRuntime,
  getMessages,
  bulkImportMessages,
  deleteAllMessages,
  UI_WINDOW,
} from "./message-store.js";
import { getStorageHooks } from "../repository/storage-hooks.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripSecretsFromState(state) {
  const next = clone(state) || {};
  if (next.settings && typeof next.settings === "object") {
    next.settings = { ...next.settings, apiKey: "" };
  }
  if (Array.isArray(next.chats)) {
    next.chats = next.chats.map((c) => {
      if (!c || !c.config) return c;
      const config = { ...c.config };
      delete config.apiKey;
      return { ...c, config };
    });
  }
  return next;
}

export async function exportProductBackup() {
  const packed = store.exportAll();
  const memories = clone(exportMemorySnapshot());
  const state = stripSecretsFromState(packed.state);
  state.longTermMemory = memories;
  const chats = [];
  for (const chat of state.chats || []) {
    if (!chat?.id) {
      chats.push(chat);
      continue;
    }
    try {
      const msgs = await getMessages(chat.id);
      chats.push({ ...chat, messages: msgs });
    } catch {
      chats.push(chat);
    }
  }
  state.chats = chats;
  return {
    format: "echochat-backup",
    version: 1,
    exportedAt: Date.now(),
    schemaVersion: packed.schemaVersion,
    state,
    memories,
    moments: clone(loadMoments()),
    relations: clone(loadRelations()),
    worldbook: clone(loadWorldbook()),
  };
}

function mergeById(existing, incoming, idKey = "id") {
  const cur = Array.isArray(existing) ? existing.slice() : [];
  const seen = new Set(cur.map((item) => item && item[idKey]));
  for (const item of incoming || []) {
    if (!item || seen.has(item[idKey])) continue;
    seen.add(item[idKey]);
    cur.push(item);
  }
  return cur;
}

export async function importProductBackup(data, mode = "merge", options = {}) {
  if (!data || typeof data !== "object") throw new Error("无效的备份文件");
  const incoming = clone(data);
  if (incoming.state) incoming.state = stripSecretsFromState(incoming.state);
  else incoming.settings = { ...(incoming.settings || {}), apiKey: "" };

  const bags = (incoming.state?.chats || []).map((c) => ({
    id: c.id,
    messages: Array.isArray(c.messages) ? c.messages : [],
  }));
  if (incoming.state?.chats) {
    incoming.state.chats = incoming.state.chats.map((c) => ({
      ...c,
      messages: (c.messages || []).slice(-UI_WINDOW),
    }));
  }

  const beforeIds = new Set((store.getState().chats || []).map((c) => c.id));
  store.importAll(incoming, mode);

  if (data.moments) {
    if (mode === "replace") saveMoments(data.moments);
    else {
      const cur = loadMoments();
      saveMoments({
        ...cur,
        ...data.moments,
        moments: mergeById(cur.moments, data.moments.moments),
      });
    }
  }
  if (data.relations) {
    if (mode === "replace") saveRelations(data.relations);
    else {
      const cur = loadRelations();
      saveRelations({
        ...cur,
        ...data.relations,
        checkIn: data.relations.checkIn || cur.checkIn,
        roles: { ...cur.roles, ...(data.relations.roles || {}) },
      });
    }
  }
  if (data.worldbook) {
    if (mode === "replace") saveWorldbook(data.worldbook);
    else {
      const cur = loadWorldbook();
      const books = (cur.books || []).slice();
      const byId = new Map(books.map((b) => [b.id, b]));
      for (const book of data.worldbook.books || []) {
        if (!book || !book.id) continue;
        const existing = byId.get(book.id);
        if (!existing) {
          books.push(book);
          continue;
        }
        existing.entries = mergeById(existing.entries, book.entries);
      }
      saveWorldbook({ ...cur, books });
    }
  }
  const memorySnap = data.memories || data.state?.longTermMemory;
  if (memorySnap) {
    replaceMemorySnapshot(memorySnap, mode === "replace" ? "replace" : "merge");
  }

  const toWrite = bags.filter((bag) => bag.id && (mode === "replace" || !beforeIds.has(bag.id)));
  const overallTotal = toWrite.reduce((n, bag) => n + bag.messages.length, 0);
  let overallDone = 0;
  const writtenIds = [];
  try {
    for (const bag of toWrite) {
      if (!bag.messages.length) continue;
      const result = await bulkImportMessages(bag.id, bag.messages, {
        replace: mode === "replace",
        signal: options.signal,
        chunkSize: options.chunkSize,
        onProgress: (p) => {
          options.onProgress?.(
            {
              done: overallDone + p.done,
              total: overallTotal,
              percent: overallTotal ? Math.round(((overallDone + p.done) / overallTotal) * 100) : 100,
            }
          );
        },
      });
      if (!result.ok) {
        const err = new Error(result.error || "import-failed");
        if (result.aborted) err.name = "AbortError";
        throw err;
      }
      writtenIds.push(bag.id);
      overallDone += bag.messages.length;
    }
  } catch (e) {
    for (const id of writtenIds) {
      try {
        await deleteAllMessages(id);
      } catch {
        // continue rollback
      }
    }
    throw e;
  }

  return flushMemoriesPersist();
}

export async function resetProductData() {
  resetMomentsRuntime();
  resetWorldbookRuntime();
  resetRelationsRuntime();
  resetMemoriesRuntime();
  try {
    resetMessageRuntime();
  } catch {
    // ignore
  }
  const hooks = getStorageHooks();
  const clears = [
    ["moment", () => hooks.moment?.replaceAll?.([])],
    ["worldbook", () => hooks.worldbook?.replaceSnapshot?.({ books: [], entries: [] })],
    ["relationship", () => hooks.relationship?.replaceSnapshot?.([])],
    ["memory", () => hooks.memory?.replaceAll?.([])],
  ];
  for (const [name, fn] of clears) {
    try {
      await fn();
    } catch (e) {
      console.warn(`[backup] ${name} canonical clear skipped:`, e && e.message ? e.message : e);
    }
  }
  storage.clearAll();
  clearMigrationFlags();
  store.reset();
  try {
    await deleteDb();
  } catch (e) {
    console.warn("[backup] IndexedDB reset skipped:", e && e.message ? e.message : e);
  }
}
