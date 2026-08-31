// ============================================================
//  EchoChat Rebuild · Worldbook
//  关键词触发设定注入，支持 SillyTavern 格式导入
// ============================================================

import { store } from "../core/store.js";
import { uid } from "../core/utils.js";

function books() {
  return store.getState().worldbooks || [];
}

export function loadWorldbook() {
  return books();
}

export function saveWorldbook(list) {
  store.set((s) => ({ ...s, worldbooks: list || [] }));
}

export function listBooks() {
  return books();
}

export function getBook(id) {
  return books().find((b) => b.id === id) || null;
}

export function addBook(name) {
  const book = {
    id: uid(),
    name: name || "新世界书",
    entries: [],
    createdAt: Date.now(),
  };
  saveWorldbook([book, ...books()]);
  return book;
}

export function deleteBook(id) {
  saveWorldbook(books().filter((b) => b.id !== id));
  const s = store.getState();
  if (s.activeWorldbookId === id) {
    store.set((st) => ({ ...st, activeWorldbookId: null }));
  }
}

export function setActiveGlobalBook(id) {
  store.set((s) => ({ ...s, activeWorldbookId: id }));
}

export function addEntry(bookId, entry) {
  const e = {
    id: uid(),
    keys: entry.keys || [],
    content: entry.content || "",
    enabled: entry.enabled !== false,
    priority: entry.priority ?? 10,
  };
  saveWorldbook(
    books().map((b) => (b.id === bookId ? { ...b, entries: [...(b.entries || []), e] } : b))
  );
  return e;
}

export function updateEntry(bookId, entryId, patch) {
  saveWorldbook(
    books().map((b) =>
      b.id === bookId
        ? {
            ...b,
            entries: (b.entries || []).map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
          }
        : b
    )
  );
}

export function deleteEntry(bookId, entryId) {
  saveWorldbook(
    books().map((b) =>
      b.id === bookId ? { ...b, entries: (b.entries || []).filter((e) => e.id !== entryId) } : b
    )
  );
}

export function matchWorldbook(chat) {
  const activeId = store.getState().activeWorldbookId;
  const book = activeId ? getBook(activeId) : null;
  if (!book || !book.entries?.length) return "";
  const recent = (chat.messages || []).slice(-6).map((m) => m.text || "").join("\n");
  const hits = [];
  for (const e of book.entries) {
    if (e.enabled === false) continue;
    const keys = e.keys || [];
    if (keys.some((k) => k && recent.includes(k))) {
      hits.push({ priority: e.priority ?? 10, content: e.content });
    }
  }
  hits.sort((a, b) => b.priority - a.priority);
  if (!hits.length) return "";
  return "【世界书】\n" + hits.map((h) => h.content).join("\n\n");
}

export function exportWorldbook(id) {
  const b = getBook(id);
  return b ? JSON.stringify(b, null, 2) : "";
}

export function importWorldbook(json) {
  try {
    const obj = typeof json === "string" ? JSON.parse(json) : json;
    // SillyTavern character_book or plain
    if (obj.entries && Array.isArray(obj.entries)) {
      const book = {
        id: uid(),
        name: obj.name || "导入世界书",
        entries: obj.entries.map((e) => ({
          id: uid(),
          keys: e.keys || e.key || [],
          content: e.content || e.entry || "",
          enabled: e.enabled !== false,
          priority: e.priority ?? e.order ?? 10,
        })),
        createdAt: Date.now(),
      };
      saveWorldbook([book, ...books()]);
      return book;
    }
    if (Array.isArray(obj)) {
      // list of entries
      const book = {
        id: uid(),
        name: "导入世界书",
        entries: obj.map((e) => ({
          id: uid(),
          keys: e.keys || [],
          content: e.content || "",
          enabled: true,
          priority: 10,
        })),
        createdAt: Date.now(),
      };
      saveWorldbook([book, ...books()]);
      return book;
    }
  } catch (e) {}
  return null;
}

export const Worldbook = {
  loadWorldbook,
  saveWorldbook,
  listBooks,
  getBook,
  addBook,
  deleteBook,
  setActiveGlobalBook,
  addEntry,
  updateEntry,
  deleteEntry,
  matchWorldbook,
  exportWorldbook,
  importWorldbook,
};
