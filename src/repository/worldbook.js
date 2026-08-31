/**
 * WorldbookRepository (Legacy Implementation)
 *
 * Phase 1 过渡实现：包装现有 localStorage WORLDBOOK。
 * Phase 8 将扩展为独立的 Book/Entry 存储，支持触发匹配。
 */

import { legacyAdapter } from "./legacy-adapter.js";

export const WorldbookRepository = {
  async findAllBooks() {
    const data = legacyAdapter.getWorldbookData();
    return data.books || [];
  },

  async findBookById(bookId) {
    const books = await this.findAllBooks();
    return books.find((b) => b.id === bookId) || null;
  },

  async findBooksByCharacterId(characterId) {
    const books = await this.findAllBooks();
    return books.filter((b) => b.characterId === characterId || b.scope === "global");
  },

  async createBook(book) {
    const data = legacyAdapter.getWorldbookData();
    const b = {
      id: book.id || `wb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: book.name || "New Worldbook",
      description: book.description || "",
      scope: book.scope || "global",
      characterId: book.characterId || null,
      entries: book.entries || [],
      enabled: book.enabled !== false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    data.books = data.books || [];
    data.books.push(b);
    legacyAdapter.setWorldbookData(data);
    return b;
  },

  async updateBook(bookId, updates) {
    const data = legacyAdapter.getWorldbookData();
    const idx = data.books?.findIndex((b) => b.id === bookId);
    if (idx === -1) return null;
    data.books[idx] = { ...data.books[idx], ...updates, updatedAt: Date.now() };
    legacyAdapter.setWorldbookData(data);
    return data.books[idx];
  },

  async deleteBook(bookId) {
    const data = legacyAdapter.getWorldbookData();
    data.books = (data.books || []).filter((b) => b.id !== bookId);
    if (data.activeGlobalBookId === bookId) data.activeGlobalBookId = null;
    legacyAdapter.setWorldbookData(data);
  },

  async addEntry(bookId, entry) {
    const data = legacyAdapter.getWorldbookData();
    const book = data.books?.find((b) => b.id === bookId);
    if (!book) throw new Error("Worldbook not found");
    const e = {
      id: entry.id || `wbe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      keys: entry.keys || [],
      content: entry.content || "",
      priority: entry.priority || 10,
      enabled: entry.enabled !== false,
      createdAt: Date.now(),
    };
    book.entries = book.entries || [];
    book.entries.push(e);
    book.updatedAt = Date.now();
    legacyAdapter.setWorldbookData(data);
    return e;
  },

  async updateEntry(bookId, entryId, updates) {
    const data = legacyAdapter.getWorldbookData();
    const book = data.books?.find((b) => b.id === bookId);
    if (!book) return null;
    const idx = book.entries?.findIndex((e) => e.id === entryId);
    if (idx === -1) return null;
    book.entries[idx] = { ...book.entries[idx], ...updates };
    book.updatedAt = Date.now();
    legacyAdapter.setWorldbookData(data);
    return book.entries[idx];
  },

  async deleteEntry(bookId, entryId) {
    const data = legacyAdapter.getWorldbookData();
    const book = data.books?.find((b) => b.id === bookId);
    if (!book) return;
    book.entries = (book.entries || []).filter((e) => e.id !== entryId);
    book.updatedAt = Date.now();
    legacyAdapter.setWorldbookData(data);
  },

  /**
   * 根据触发词匹配活跃条目
   * 当前 Legacy 实现：简单关键词包含匹配。
   * Phase 8: 优先级 + 上下文预算 + 正则匹配。
   */
  async matchEntries(characterId, text, options = {}) {
    const books = await this.findBooksByCharacterId(characterId);
    const matches = [];
    const lower = text.toLowerCase();
    for (const book of books) {
      if (!book.enabled) continue;
      for (const entry of book.entries || []) {
        if (!entry.enabled) continue;
        const hit = (entry.keys || []).some((k) =>
          lower.includes(String(k).toLowerCase())
        );
        if (hit) {
          matches.push({ ...entry, bookId: book.id, bookName: book.name });
        }
      }
    }
    return matches.sort((a, b) => (b.priority || 10) - (a.priority || 10));
  },
};
