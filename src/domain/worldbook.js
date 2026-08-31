// ============================================================
//  EchoChat Rebuild · Worldbook (从 baseline 迁移为 ES Module)
//  世界书 CRUD + 关键词匹配注入 + SillyTavern 格式导入
//  改进：支持 roleId（稳定 ID），保留 roleKey 兼容
// ============================================================

import { storage, KEYS } from "../core/storage.js";
import { uid } from "../core/utils.js";

const HARD_CAP = 1200;

function defaultWorldbook() {
  return {
    version: 2,
    books: [
      { id: "global", name: "全局世界书", scope: "global", roleId: null, roleKey: null, entries: [] },
    ],
    activeGlobalBookId: "global",
  };
}

function defaultEntry(partial) {
  return Object.assign(
    {
      id: "",
      name: "",
      keys: [],
      content: "",
      enabled: true,
      constant: false,
      depth: 10,
      priority: 100,
      caseSensitive: false,
      secondary_keys: [],
      regex: false,
      whole_word: false,
      position: "after_char",
    },
    partial || {}
  );
}

export function loadWorldbook() {
  try {
    const d = storage.get(KEYS.WORLDBOOK, null);
    if (!d) return defaultWorldbook();
    if (!Array.isArray(d.books)) d.books = defaultWorldbook().books;
    if (!d.activeGlobalBookId) d.activeGlobalBookId = "global";
    if (!d.books.some((b) => b.id === "global")) {
      d.books.unshift({ id: "global", name: "全局世界书", scope: "global", roleId: null, roleKey: null, entries: [] });
    }
    d.version = 2;
    return d;
  } catch (e) {
    return defaultWorldbook();
  }
}

export function saveWorldbook(data) {
  const d = data || loadWorldbook();
  d.version = 2;
  return storage.set(KEYS.WORLDBOOK, d);
}

export function listBooks() {
  return loadWorldbook().books.slice();
}

export function getBook(id) {
  return loadWorldbook().books.find((b) => b.id === id) || null;
}

export function addBook(name, scope, roleId) {
  const wb = loadWorldbook();
  const book = {
    id: uid(),
    name: name || (scope === "character" ? "角色世界书" : "世界书"),
    scope: scope === "character" ? "character" : "global",
    roleId: scope === "character" ? roleId || null : null,
    roleKey: null, // 兼容旧字段
    entries: [],
  };
  wb.books.push(book);
  saveWorldbook(wb);
  return book;
}

export function deleteBook(id) {
  if (id === "global") return false;
  const wb = loadWorldbook();
  const i = wb.books.findIndex((b) => b.id === id);
  if (i < 0) return false;
  wb.books.splice(i, 1);
  if (wb.activeGlobalBookId === id) wb.activeGlobalBookId = "global";
  saveWorldbook(wb);
  return true;
}

export function setActiveGlobalBook(id) {
  const wb = loadWorldbook();
  const b = wb.books.find((x) => x.id === id && x.scope === "global");
  if (!b) return false;
  wb.activeGlobalBookId = id;
  saveWorldbook(wb);
  return true;
}

export function addEntry(bookId, entry) {
  const wb = loadWorldbook();
  const book = wb.books.find((b) => b.id === bookId);
  if (!book) return null;
  const e = defaultEntry(entry);
  e.id = e.id || uid();
  if (!Array.isArray(e.keys)) e.keys = String(e.keys || "").split(",").map((k) => k.trim()).filter(Boolean);
  book.entries.push(e);
  saveWorldbook(wb);
  return e;
}

export function updateEntry(bookId, entryId, patch) {
  const wb = loadWorldbook();
  const book = wb.books.find((b) => b.id === bookId);
  if (!book) return null;
  const e = book.entries.find((x) => x.id === entryId);
  if (!e) return null;
  Object.assign(e, patch || {});
  if (patch && patch.keys != null && !Array.isArray(e.keys)) {
    e.keys = String(e.keys).split(",").map((k) => k.trim()).filter(Boolean);
  }
  saveWorldbook(wb);
  return e;
}

export function deleteEntry(bookId, entryId) {
  const wb = loadWorldbook();
  const book = wb.books.find((b) => b.id === bookId);
  if (!book) return false;
  const n = book.entries.length;
  book.entries = book.entries.filter((x) => x.id !== entryId);
  if (book.entries.length === n) return false;
  saveWorldbook(wb);
  return true;
}

export function exportWorldbook() {
  return JSON.stringify(loadWorldbook(), null, 2);
}

export function importWorldbook(json, mode) {
  let incoming;
  try {
    incoming = typeof json === "string" ? JSON.parse(json) : json;
  } catch (e) {
    return { ok: false, error: "parse" };
  }
  if (!incoming || !Array.isArray(incoming.books)) return { ok: false, error: "format" };
  const wb = loadWorldbook();
  if (mode === "replace") {
    const next = {
      version: 2,
      books: incoming.books.map(normalizeBook),
      activeGlobalBookId: incoming.activeGlobalBookId || "global",
    };
    if (!next.books.some((b) => b.id === "global")) {
      next.books.unshift({ id: "global", name: "全局世界书", scope: "global", roleId: null, roleKey: null, entries: [] });
    }
    saveWorldbook(next);
    return { ok: true, count: next.books.length };
  }
  incoming.books.forEach((b) => {
    const nb = normalizeBook(b);
    const idx = wb.books.findIndex((x) => x.id === nb.id);
    if (idx >= 0) wb.books[idx] = nb;
    else wb.books.push(nb);
  });
  if (incoming.activeGlobalBookId) wb.activeGlobalBookId = incoming.activeGlobalBookId;
  saveWorldbook(wb);
  return { ok: true, count: wb.books.length };
}

function normalizeBook(b) {
  return {
    id: b.id || uid(),
    name: b.name || "世界书",
    scope: b.scope === "character" ? "character" : "global",
    roleId: b.roleId || b.roleKey || null,
    roleKey: b.roleKey || null,
    entries: Array.isArray(b.entries)
      ? b.entries.map((e) =>
          defaultEntry({
            ...e,
            id: e.id || uid(),
            keys: Array.isArray(e.keys) ? e.keys : String(e.keys || "").split(",").map((k) => k.trim()).filter(Boolean),
          })
        )
      : [],
  };
}

export function normalizeCharacterBook(characterBook) {
  if (!characterBook || typeof characterBook !== "object") return null;
  const bookDepth = Number(characterBook.scan_depth);
  const defaultDepth = Number.isFinite(bookDepth) && bookDepth > 0 ? bookDepth : 10;
  const entriesSrc = Array.isArray(characterBook.entries) ? characterBook.entries : [];
  if (!entriesSrc.length) return { name: characterBook.name || "角色世界书", entries: [] };
  const entries = entriesSrc.map((e, i) => {
    const keys = Array.isArray(e.keys) ? e.keys.map(String) : String(e.keys || "").split(",").map((k) => k.trim()).filter(Boolean);
    const sec = Array.isArray(e.secondary_keys) ? e.secondary_keys.map(String) : [];
    const priority = Number(e.insertion_order != null ? e.insertion_order : e.priority);
    return defaultEntry({
      id: e.id != null ? String(e.id) : uid(),
      name: String(e.name || e.comment || "条目" + (i + 1)),
      keys,
      content: String(e.content || ""),
      enabled: e.enabled !== false,
      constant: !!e.constant,
      depth: defaultDepth,
      priority: Number.isFinite(priority) ? priority : 100,
      caseSensitive: !!e.case_sensitive,
      secondary_keys: sec,
      regex: !!e.use_regex || !!e.regex,
      whole_word: !!e.whole_word,
      position: e.position === "before_char" ? "before_char" : "after_char",
    });
  });
  return { name: characterBook.name || "角色世界书", entries };
}

export function buildWorldbookBlock(chat, messages, roleId, persona) {
  try {
    const wb = loadWorldbook();
    const candidates = [];
    const globalBook =
      wb.books.find((b) => b.id === wb.activeGlobalBookId && b.scope === "global") ||
      wb.books.find((b) => b.id === "global");
    if (globalBook) candidates.push(globalBook);
    wb.books.forEach((b) => {
      if (b.scope === "character" && (b.roleId === roleId || b.roleKey === roleId)) {
        candidates.push(b);
      }
    });
    const allEntries = [];
    candidates.forEach((book) => {
      (book.entries || []).forEach((e) => {
        if (e && e.enabled !== false) allEntries.push(e);
      });
    });
    if (!allEntries.length) return null;
    let maxDepth = 10;
    allEntries.forEach((e) => {
      const d = Number(e.depth);
      if (Number.isFinite(d) && d > maxDepth) maxDepth = d;
    });
    const msgs = Array.isArray(messages) ? messages : [];
    const recent = msgs.filter((m) => m && m.role !== "system").slice(-maxDepth);
    const scanParts = [];
    if (persona) scanParts.push(String(persona).slice(0, 200));
    recent.forEach((m) => scanParts.push(String(m.text || m.content || "")));
    const scanRaw = scanParts.join(" ");
    const hit = [];
    allEntries.forEach((e) => {
      if (e.constant) {
        hit.push(e);
        return;
      }
      const keys = Array.isArray(e.keys) ? e.keys : [];
      if (!keys.length) return;
      const hay = e.caseSensitive ? scanRaw : scanRaw.toLowerCase();
      for (let i = 0; i < keys.length; i++) {
        const k = String(keys[i] || "").trim();
        if (!k) continue;
        const needle = e.caseSensitive ? k : k.toLowerCase();
        if (hay.includes(needle)) {
          hit.push(e);
          return;
        }
      }
    });
    if (!hit.length) return null;
    hit.sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));
    let body = hit.map((e) => String(e.content || "").trim()).filter(Boolean).join("\n\n");
    if (!body) return null;
    let out = "---\nWorld Information:\n" + body;
    if (out.length > HARD_CAP) out = out.slice(0, HARD_CAP);
    return out;
  } catch (e) {
    return null;
  }
}

export function ensureCharacterBook(roleId, name) {
  const wb = loadWorldbook();
  let book = wb.books.find((b) => b.scope === "character" && (b.roleId === roleId || b.roleKey === roleId));
  if (book) return book;
  return addBook(name || "角色世界书", "character", roleId);
}

export function importLorebookForRole(roleId, lore, bookName) {
  if (!lore || !Array.isArray(lore.entries) || !lore.entries.length || !roleId) return null;
  const book = ensureCharacterBook(roleId, bookName || lore.name || "角色世界书");
  const wb = loadWorldbook();
  const b = wb.books.find((x) => x.id === book.id);
  if (!b) return null;
  lore.entries.forEach((e) => {
    const ne = defaultEntry({ ...e, id: uid() });
    b.entries.push(ne);
  });
  if (lore.name) b.name = lore.name;
  saveWorldbook(wb);
  return b;
}

export const EchoWorldbook = {
  defaultWorldbook,
  defaultEntry,
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
  exportWorldbook,
  importWorldbook,
  normalizeCharacterBook,
  buildWorldbookBlock,
  ensureCharacterBook,
  importLorebookForRole,
};
