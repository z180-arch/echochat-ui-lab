// ============================================================
//  EchoChat Rebuild · Worldbook (从 baseline 迁移为 ES Module)
//  世界书 CRUD + 关键词匹配注入 + SillyTavern 格式导入
//  改进：支持 roleId（稳定 ID），保留 roleKey 兼容
// ============================================================

import { storage, KEYS } from "../core/storage.js";
import { uid } from "../core/utils.js";
import { getStorageHooks } from "../repository/test-hooks.js";
import {
  parseJsonSafe,
  isEntityMigrated,
  markEntityMigrated,
  markEntityFailed,
  mergeById,
} from "../repository/persistence.js";

const HARD_CAP = 1200;
const ENTITY = "worldbook";
const META_ID = "__echo_wb_meta";

let cache = null;
let persistChain = Promise.resolve();
let usingCanonical = false;
let mutationGen = 0;

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

function ensureWorldbookShape(data) {
  const d = data && typeof data === "object" ? { ...data } : defaultWorldbook();
  d.books = Array.isArray(d.books) ? d.books.filter((b) => b && b.id && b.id !== META_ID && b.scope !== "meta") : [];
  d.books = d.books.map((b) => ({
    ...b,
    entries: Array.isArray(b.entries) ? b.entries.map((e) => defaultEntry(e)) : [],
  }));
  if (!d.books.some((b) => b.id === "global")) {
    d.books.unshift({ id: "global", name: "全局世界书", scope: "global", roleId: null, roleKey: null, entries: [] });
  }
  d.activeGlobalBookId = d.activeGlobalBookId || "global";
  d.version = 2;
  return d;
}

function snapshotIsPopulated(data) {
  const books = (data && data.books) || [];
  if (books.some((b) => b && b.scope === "character")) return true;
  if (books.some((b) => b && b.id && b.id !== "global")) return true;
  if (books.some((b) => (b.entries || []).length > 0)) return true;
  return false;
}

function mergeWorldbookSnapshots(canonical, legacy) {
  const c = ensureWorldbookShape(canonical);
  const l = ensureWorldbookShape(legacy);
  const map = new Map();
  for (const book of c.books) {
    map.set(book.id, { ...book, entries: (book.entries || []).slice() });
  }
  for (const book of l.books) {
    if (!book || !book.id) continue;
    const existing = map.get(book.id);
    if (!existing) {
      map.set(book.id, { ...book, entries: (book.entries || []).slice() });
      continue;
    }
    existing.entries = mergeById(existing.entries, book.entries);
    existing.roleId = existing.roleId || book.roleId || null;
    existing.roleKey = existing.roleKey || book.roleKey || null;
    if (book.name && !existing.name) existing.name = book.name;
  }
  return ensureWorldbookShape({
    version: 2,
    activeGlobalBookId: c.activeGlobalBookId || l.activeGlobalBookId || "global",
    books: [...map.values()],
  });
}

function toDexieSnapshot(data) {
  const d = ensureWorldbookShape(data);
  const books = d.books.map((b) => ({
    id: b.id,
    name: b.name || "世界书",
    description: b.description || "",
    scope: b.scope === "character" ? "character" : "global",
    characterId: b.scope === "character" ? b.roleId || b.roleKey || null : null,
    roleId: b.roleId || null,
    roleKey: b.roleKey || null,
    enabled: b.enabled !== false,
    createdAt: Number(b.createdAt) || Date.now(),
    updatedAt: Number(b.updatedAt) || Date.now(),
  }));
  books.push({
    id: META_ID,
    name: "meta",
    scope: "meta",
    characterId: null,
    activeGlobalBookId: d.activeGlobalBookId || "global",
    version: 2,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const entries = [];
  d.books.forEach((b) => {
    (b.entries || []).forEach((e) => {
      const row = defaultEntry(e);
      if (!row.id) row.id = uid();
      entries.push({
        ...row,
        bookId: b.id,
        createdAt: Number(e.createdAt) || Date.now(),
      });
    });
  });
  return { books, entries };
}

function fromDexieSnapshot({ books, entries }) {
  const meta = (books || []).find((b) => b && (b.id === META_ID || b.scope === "meta"));
  const domainBooks = (books || [])
    .filter((b) => b && b.id && b.id !== META_ID && b.scope !== "meta")
    .map((b) => ({
      id: b.id,
      name: b.name || "世界书",
      scope: b.scope === "character" ? "character" : "global",
      roleId: b.roleId || b.characterId || null,
      roleKey: b.roleKey || null,
      entries: [],
    }));
  const byId = new Map(domainBooks.map((b) => [b.id, b]));
  (entries || []).forEach((e) => {
    const book = byId.get(e.bookId);
    if (!book) return;
    book.entries.push(defaultEntry(e));
  });
  return ensureWorldbookShape({
    version: 2,
    activeGlobalBookId: (meta && meta.activeGlobalBookId) || "global",
    books: [...byId.values()],
  });
}

function looksLossyWorldbookRows(entries) {
  const list = entries || [];
  if (!list.length) return false;
  return list.every((e) => e && e.constant == null && e.depth == null);
}

function collectIds(data) {
  const ids = [];
  (data.books || []).forEach((b) => {
    if (b && b.id) ids.push(`b:${b.id}`);
    (b.entries || []).forEach((e) => {
      if (e && e.id) ids.push(`e:${e.id}`);
    });
  });
  return ids;
}

function verifyWorldbook(expected, actual) {
  const got = new Set(collectIds(actual));
  return collectIds(expected).every((id) => got.has(id));
}

function parseLegacyWorldbook() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEYS.WORLDBOOK) : null;
    const d = parseJsonSafe(raw, null);
    if (!d) return defaultWorldbook();
    return ensureWorldbookShape(d);
  } catch {
    return defaultWorldbook();
  }
}

async function canonicalAvailable() {
  try {
    const hooks = getStorageHooks();
    return !!(hooks.worldbook && typeof hooks.worldbook.loadSnapshot === "function" && (await hooks.isAvailable()));
  } catch {
    return false;
  }
}

async function loadCanonicalWorldbook() {
  const snap = await getStorageHooks().worldbook.loadSnapshot();
  return fromDexieSnapshot(snap || { books: [], entries: [] });
}

async function replaceCanonicalWorldbook(data) {
  await getStorageHooks().worldbook.replaceSnapshot(toDexieSnapshot(data));
}

async function flushPersist() {
  const snapshot = cache || defaultWorldbook();
  if (await canonicalAvailable()) {
    await replaceCanonicalWorldbook(snapshot);
    usingCanonical = true;
    return;
  }
  storage.set(KEYS.WORLDBOOK, snapshot);
}

function schedulePersist() {
  persistChain = persistChain.then(flushPersist).catch((err) => {
    console.warn("[worldbook] persist failed:", err && err.message ? err.message : err);
    try {
      storage.set(KEYS.WORLDBOOK, cache || defaultWorldbook());
    } catch {
      // ignore
    }
  });
  return persistChain;
}

export function loadWorldbook() {
  if (cache) return cache;
  cache = parseLegacyWorldbook();
  return cache;
}

export function saveWorldbook(data) {
  const d = ensureWorldbookShape(data || loadWorldbook());
  cache = d;
  mutationGen += 1;
  if (usingCanonical) schedulePersist();
  else storage.set(KEYS.WORLDBOOK, d);
  return true;
}

export function resetWorldbookRuntime() {
  cache = null;
  usingCanonical = false;
  mutationGen = 0;
  persistChain = Promise.resolve();
}

export function flushWorldbookPersist() {
  return persistChain;
}

export async function hydrateWorldbook() {
  const startGen = mutationGen;
  const legacy = parseLegacyWorldbook();
  if (!(await canonicalAvailable())) {
    cache = legacy;
    usingCanonical = false;
    return { reason: "no-dexie", count: (legacy.books || []).length, wrote: false };
  }
  try {
    const raw = await getStorageHooks().worldbook.loadSnapshot();
    const lossy = looksLossyWorldbookRows(raw && raw.entries);
    const canonical = fromDexieSnapshot(raw || { books: [], entries: [] });
    const destPop = snapshotIsPopulated(canonical);
    const srcPop = snapshotIsPopulated(legacy);
    const completed = isEntityMigrated(ENTITY);
    let next;
    let write = false;
    let reason = "fresh";
    if (!destPop && !srcPop) {
      next = defaultWorldbook();
      reason = "fresh";
    } else if (destPop && completed && !lossy) {
      next = canonical;
      reason = "dexie-only";
    } else if (!destPop && srcPop) {
      next = legacy;
      write = true;
      reason = "legacy-only";
    } else if (destPop && !srcPop) {
      next = canonical;
      reason = "dexie-populated";
    } else {
      next = mergeWorldbookSnapshots(canonical, legacy);
      write = true;
      reason = "reconcile";
    }
    next = ensureWorldbookShape(next);
    if (mutationGen !== startGen && cache) {
      next = mergeWorldbookSnapshots(next, cache);
      write = true;
    }
    if (write) {
      await replaceCanonicalWorldbook(next);
      const readback = await loadCanonicalWorldbook();
      if (!verifyWorldbook(next, readback)) throw new Error("worldbook migrate verify failed");
      next = ensureWorldbookShape(readback);
    }
    if (reason !== "fresh") {
      markEntityMigrated(ENTITY, { bookCount: next.books.length, reason });
    }
    cache = next;
    usingCanonical = true;
    return { reason, wrote: write, count: next.books.length };
  } catch (e) {
    markEntityFailed(ENTITY, e);
    console.warn("[worldbook] hydrate failed:", e && e.message ? e.message : e);
    cache = cache || legacy;
    usingCanonical = false;
    return { reason: "failed", error: String(e && e.message ? e.message : e), wrote: false };
  }
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
    let out = "---\nWorld Information (setting and lore, not facts about the user):\n" + body;
    if (out.length > HARD_CAP) out = out.slice(0, HARD_CAP);
    return out;
  } catch (e) {
    return null;
  }
}

export function getBookForCharacter(roleId) {
  if (!roleId) return null;
  return (
    loadWorldbook().books.find(
      (b) => b.scope === "character" && (b.roleId === roleId || b.roleKey === roleId)
    ) || null
  );
}

export function ensureCharacterBook(roleId, name) {
  const existing = getBookForCharacter(roleId);
  if (existing) return existing;
  return addBook(name || "角色世界书", "character", roleId);
}

export function deleteBooksForCharacter(roleId) {
  if (!roleId) return 0;
  const wb = loadWorldbook();
  const before = (wb.books || []).length;
  wb.books = (wb.books || []).filter(
    (b) => !(b.scope === "character" && (b.roleId === roleId || b.roleKey === roleId))
  );
  const removed = before - wb.books.length;
  if (removed) saveWorldbook(wb);
  return removed;
}

export function toggleEntryEnabled(bookId, entryId) {
  const book = getBook(bookId);
  const entry = book?.entries?.find((e) => e.id === entryId);
  if (!entry) return null;
  return updateEntry(bookId, entryId, { enabled: entry.enabled === false });
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
  getBookForCharacter,
  ensureCharacterBook,
  deleteBooksForCharacter,
  toggleEntryEnabled,
  importLorebookForRole,
  hydrateWorldbook,
  resetWorldbookRuntime,
  flushWorldbookPersist,
};
