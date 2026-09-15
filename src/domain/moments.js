// ============================================================
//  EchoChat Rebuild · Moments (从 baseline 迁移为 ES Module)
//  角色动态流 CRUD + 点赞/评论 + 摘要解析
//  改进：支持 roleId（稳定 ID）
// ============================================================

import { storage, KEYS } from "../core/storage.js";
import { recordRelationshipEvent } from "./relations.js";
import { events, EVT } from "../core/events.js";
import { uid, todayStr } from "../core/utils.js";
import { getStorageHooks } from "../repository/storage-hooks.js";
import {
  parseJsonSafe,
  isEntityMigrated,
  reconcileAndCommit,
  markEntityFailed,
  mergeById,
} from "../repository/persistence.js";

const MAX_MOMENTS = 200;
const CONTENT_SOFT_CAP = 80;
const MOMENT_SOURCES = ["manual", "auto_summary", "memory", "candidate", "reconstruction", "lived"];
const JUNK_DYNAMIC_RE =
  /^(嗨|哈喽|你好|在吗|嗯+|哦+|好的|ok|hi|hey|我在|好烦|好累|哈哈哈+|呵呵+|开心|难过|生气|嗯嗯+|哦哦+|唉+)[。.!！？?\s]*$/i;
const MEMORY_RESTATE_RE = /想起你说过|你说过|用户说过|用户在/;
const LIVED_SCENE_RE = /一起|去了|吃了|聊到|见到|走过|待了|看了|熬了|度过|那天|晚上|咖啡馆|公园|下雨|散步|过夜/;

function defaultStore() {
  return { version: 2, moments: [] };
}

const ENTITY = "moments";
let cache = null;
let persistChain = Promise.resolve();
let usingCanonical = false;
let mutationGen = 0;

export function normalizeMomentText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s，。！？,.!?;；、"'“”‘’\-—]/g, "");
}

function normalizeMoment(partial) {
  const p = partial || {};
  return {
    id: p.id || uid(),
    roleId: p.roleId || p.roleKey || "",
    roleKey: p.roleKey || "",
    roleName: String(p.roleName || "角色"),
    content: String(p.content || "").trim().slice(0, CONTENT_SOFT_CAP),
    image: p.image == null ? null : p.image,
    createdAt: Number(p.createdAt) || Date.now(),
    likes: Math.max(0, Number(p.likes) || 0),
    likedByUser: !!p.likedByUser,
    likeNames: Array.isArray(p.likeNames) ? p.likeNames.map(String) : [],
    comments: Array.isArray(p.comments)
      ? p.comments
          .map((c) => ({
            id: c.id || uid(),
            from: c.from === "her" ? "her" : "me",
            text: String(c.text || "").trim(),
            createdAt: Number(c.createdAt) || Date.now(),
          }))
          .filter((c) => c.text)
      : [],
    source: MOMENT_SOURCES.includes(p.source) ? p.source : "auto_summary",
    relatedMemoryId: p.relatedMemoryId != null ? String(p.relatedMemoryId) : null,
    chatId: p.chatId ? String(p.chatId) : null,
    sourceKey: p.sourceKey ? String(p.sourceKey) : null,
  };
}

function toDexieMoment(m) {
  const n = normalizeMoment(m);
  return {
    ...n,
    characterId: n.roleId,
    authorType: m.authorType || "character",
    visibility: m.visibility || "public",
    media: n.image ? [n.image] : [],
    likeCount: n.likes,
    commentCount: (n.comments || []).length,
    updatedAt: Number(m.updatedAt) || n.createdAt,
  };
}

function fromDexieMoment(row) {
  if (!row) return null;
  return normalizeMoment({
    ...row,
    roleId: row.roleId || row.characterId || "",
    likes: row.likes != null ? row.likes : row.likeCount,
    image: row.image != null ? row.image : Array.isArray(row.media) ? row.media[0] : null,
    comments: Array.isArray(row.comments) ? row.comments : [],
  });
}

function looksLossyMomentRow(row) {
  return !!(row && row.characterId && row.roleId == null && row.source == null && row.chatId == null && row.sourceKey == null);
}

function parseLegacyMoments() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEYS.MOMENTS) : null;
    const d = parseJsonSafe(raw, null);
    if (!d || !Array.isArray(d.moments)) return defaultStore();
    return {
      version: 2,
      moments: d.moments.map((m) => normalizeMoment(m)).filter((m) => m.content && m.roleId),
    };
  } catch {
    return defaultStore();
  }
}

async function canonicalAvailable() {
  try {
    const hooks = getStorageHooks();
    return !!(hooks.moment && typeof hooks.moment.findAllRecords === "function" && (await hooks.isAvailable()));
  } catch {
    return false;
  }
}

async function loadCanonicalMoments() {
  const rows = await getStorageHooks().moment.findAllRecords();
  return (rows || []).map(fromDexieMoment).filter((m) => m && m.id && m.roleId);
}

async function replaceCanonicalMoments(moments) {
  await getStorageHooks().moment.replaceAll((moments || []).map(toDexieMoment));
}

async function flushPersist() {
  const snapshot = cache || defaultStore();
  if (await canonicalAvailable()) {
    await replaceCanonicalMoments(snapshot.moments || []);
    usingCanonical = true;
    return;
  }
  storage.set(KEYS.MOMENTS, snapshot);
}

function schedulePersist() {
  persistChain = persistChain.then(flushPersist).catch((err) => {
    console.warn("[moments] persist failed:", err && err.message ? err.message : err);
    try {
      storage.set(KEYS.MOMENTS, cache || defaultStore());
    } catch {
      // ignore
    }
  });
  return persistChain;
}

export function loadMoments() {
  if (cache) return cache;
  cache = parseLegacyMoments();
  return cache;
}

export function saveMoments(data) {
  const d = data || loadMoments();
  d.version = 2;
  if (!Array.isArray(d.moments)) d.moments = [];
  if (d.moments.length > MAX_MOMENTS) d.moments = d.moments.slice(-MAX_MOMENTS);
  cache = d;
  mutationGen += 1;
  if (usingCanonical) schedulePersist();
  else storage.set(KEYS.MOMENTS, d);
  return true;
}

export function resetMomentsRuntime() {
  cache = null;
  usingCanonical = false;
  mutationGen = 0;
  persistChain = Promise.resolve();
}

export function flushMomentsPersist() {
  return persistChain;
}

export async function hydrateMoments() {
  const startGen = mutationGen;
  const legacy = parseLegacyMoments().moments;
  if (!(await canonicalAvailable())) {
    cache = { version: 2, moments: legacy };
    usingCanonical = false;
    return { reason: "no-dexie", count: legacy.length, wrote: false };
  }
  try {
    const rows = await getStorageHooks().moment.findAllRecords();
    const lossy = (rows || []).length > 0 && (rows || []).every(looksLossyMomentRow);
    const canonical = (rows || []).map(fromDexieMoment).filter((m) => m && m.id && m.roleId);
    const result = await reconcileAndCommit({
      entityName: ENTITY,
      canonicalItems: canonical,
      legacyItems: legacy,
      completed: isEntityMigrated(ENTITY),
      lossy,
      replaceCanonical: replaceCanonicalMoments,
      loadCanonical: loadCanonicalMoments,
    });
    let items = result.items;
    if (mutationGen !== startGen && cache) {
      items = mergeById(items, cache.moments);
      await replaceCanonicalMoments(items);
    }
    cache = { version: 2, moments: items };
    usingCanonical = true;
    return { ...result, items, count: items.length };
  } catch (e) {
    markEntityFailed(ENTITY, e);
    console.warn("[moments] hydrate failed:", e && e.message ? e.message : e);
    cache = cache || { version: 2, moments: legacy };
    usingCanonical = false;
    return { reason: "failed", error: String(e && e.message ? e.message : e), count: (cache.moments || []).length, wrote: false };
  }
}

function isSameMoment(existing, incoming) {
  if (!existing || !incoming) return false;
  if (existing.id && incoming.id && existing.id === incoming.id) return true;
  if (existing.roleId !== incoming.roleId && existing.roleKey !== incoming.roleId) return false;
  if (incoming.relatedMemoryId && existing.relatedMemoryId === incoming.relatedMemoryId) return true;
  if (incoming.sourceKey && existing.sourceKey === incoming.sourceKey) return true;
  const a = normalizeMomentText(existing.content);
  const b = normalizeMomentText(incoming.content);
  return a.length >= 4 && a === b;
}

function findDuplicate(list, incoming) {
  return (list || []).find((m) => isSameMoment(m, incoming)) || null;
}

export function listMoments(filterRoleId) {
  const all = loadMoments().moments.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (!filterRoleId || filterRoleId === "all") return all;
  return all.filter((m) => m.roleId === filterRoleId || m.roleKey === filterRoleId);
}

export function listRoleOptions() {
  const map = new Map();
  loadMoments().moments.forEach((m) => {
    const id = m.roleId || m.roleKey;
    if (!id) return;
    if (!map.has(id)) map.set(id, m.roleName || "角色");
  });
  return [...map.entries()].map(([roleId, roleName]) => ({ roleId, roleName }));
}

export function getMoment(id) {
  return loadMoments().moments.find((m) => m.id === id) || null;
}

export function addMoment(partial) {
  const m = normalizeMoment(partial);
  if (!m.content || !m.roleId) return null;
  const st = loadMoments();
  const dup = findDuplicate(st.moments, m);
  if (dup) return dup;
  st.moments.push(m);
  saveMoments(st);
  events.emit(EVT.MOMENT_ADDED, { moment: m, roleId: m.roleId });
  return m;
}

export function updateMoment(id, patch) {
  const st = loadMoments();
  const i = st.moments.findIndex((m) => m.id === id);
  if (i < 0) return null;
  st.moments[i] = normalizeMoment(Object.assign({}, st.moments[i], patch, { id }));
  saveMoments(st);
  return st.moments[i];
}

export function deleteMoment(id) {
  const st = loadMoments();
  const n = st.moments.length;
  st.moments = st.moments.filter((m) => m.id !== id);
  if (st.moments.length === n) return false;
  saveMoments(st);
  return true;
}

export function deleteMomentsForRole(roleId) {
  if (!roleId) return 0;
  const st = loadMoments();
  const before = st.moments.length;
  st.moments = st.moments.filter((m) => m.roleId !== roleId && m.roleKey !== roleId);
  const removed = before - st.moments.length;
  if (removed) saveMoments(st);
  return removed;
}

export function deleteMomentsForChat(chatId) {
  if (!chatId) return 0;
  const st = loadMoments();
  const before = st.moments.length;
  st.moments = st.moments.filter((m) => m.chatId !== chatId);
  const removed = before - st.moments.length;
  if (removed) saveMoments(st);
  return removed;
}

export function momentSourceLabel(source) {
  if (source === "reconstruction") return "重逢";
  if (source === "memory" || source === "candidate") return "记下了";
  if (source === "auto_summary") return "那天";
  if (source === "lived") return "一起";
  if (source === "manual") return "我们";
  return "";
}

/**
 * LLM 【动态】 is a temporary summary fragment, not a structured event.
 * Only persist when it looks like a concrete shared scene and is not a memory restatement.
 */
export function shouldPersistSummaryDynamic(text, { existing = [], memories = [] } = {}) {
  const t = String(text || "").trim();
  if (t.length < 8 || t.length > CONTENT_SOFT_CAP) return { ok: false, reason: "length" };
  if (JUNK_DYNAMIC_RE.test(t)) return { ok: false, reason: "junk" };
  if (MEMORY_RESTATE_RE.test(t)) return { ok: false, reason: "memory-restatement" };
  if (!LIVED_SCENE_RE.test(t)) return { ok: false, reason: "llm-summary" };
  const key = normalizeMomentText(t);
  if ((existing || []).some((m) => normalizeMomentText(m.content) === key)) {
    return { ok: false, reason: "duplicate" };
  }
  if (
    (memories || []).some((m) => {
      const n = normalizeMomentText(m.content || m);
      return n.length >= 4 && (n === key || key.includes(n) || n.includes(key));
    })
  ) {
    return { ok: false, reason: "memory-overlap" };
  }
  return { ok: true };
}

export function ingestSummaryDynamic(roleId, raw, { roleName, chatId, memories } = {}) {
  if (!roleId) return { persisted: false, reason: "no-role" };
  const { moment } = parseSummaryAndMoment(raw);
  const gate = shouldPersistSummaryDynamic(moment, {
    existing: listMoments(roleId),
    memories: memories || [],
  });
  if (!gate.ok) return { persisted: false, reason: gate.reason, text: moment || "" };
  const added = addMoment({
    roleId,
    roleName: roleName || "角色",
    content: moment,
    source: "auto_summary",
    chatId: chatId || null,
    sourceKey: `auto:${roleId}:${normalizeMomentText(moment)}`,
  });
  return { persisted: !!added, reason: added ? "ok" : "duplicate", moment: added || null };
}

const LIVED_MOMENT_RE =
  /今天.{0,20}第一次|第一次(去|看|听|聽|吃|聊|见面)/;

export function livedMomentText(text) {
  const t = String(text || "")
    .trim()
    .replace(/\s+/g, " ");
  if (t.length < 6 || t.length > CONTENT_SOFT_CAP) return "";
  if (JUNK_DYNAMIC_RE.test(t)) return "";
  if (!LIVED_MOMENT_RE.test(t)) return "";
  return t.slice(0, CONTENT_SOFT_CAP);
}

/** Shared experience from the conversation. Not a durable Memory fact. */
export function captureLivedMoment(roleId, text, { chatId, roleName } = {}) {
  const content = livedMomentText(text);
  if (!roleId || !content) return null;
  const before = listMoments(roleId).length;
  const added = addMoment({
    roleId,
    roleName: roleName || "角色",
    content,
    source: "lived",
    chatId: chatId || null,
    sourceKey: `lived:${roleId}:${normalizeMomentText(content)}`,
  });
  if (added && listMoments(roleId).length > before) {
    recordRelationshipEvent(roleId, { type: "lived", text: content, roleName });
  }
  return added;
}

export function toggleLike(id, userLabel) {
  const st = loadMoments();
  const m = st.moments.find((x) => x.id === id);
  if (!m) return null;
  const label = String(userLabel || "我");
  if (m.likedByUser) {
    m.likedByUser = false;
    m.likes = Math.max(0, (Number(m.likes) || 1) - 1);
    m.likeNames = (m.likeNames || []).filter((n) => n !== label);
  } else {
    m.likedByUser = true;
    m.likes = (Number(m.likes) || 0) + 1;
    m.likeNames = m.likeNames || [];
    if (!m.likeNames.includes(label)) m.likeNames.push(label);
  }
  saveMoments(st);
  return m;
}

export function addComment(id, from, text) {
  const st = loadMoments();
  const m = st.moments.find((x) => x.id === id);
  if (!m) return null;
  const t = String(text || "").trim();
  if (!t) return null;
  const c = {
    id: uid(),
    from: from === "her" ? "her" : "me",
    text: t.slice(0, 200),
    createdAt: Date.now(),
  };
  m.comments = m.comments || [];
  m.comments.push(c);
  saveMoments(st);
  return { moment: m, comment: c };
}

export function parseSummaryAndMoment(raw) {
  const text = String(raw || "").replace(/\[emotion:[a-z]+\]/gi, "").trim();
  if (!text) return { summary: "", moment: "" };
  const dyn =
    text.match(/【\s*动态\s*】\s*([\s\S]*)$/i) ||
    text.match(/\[moment\]\s*([\s\S]*)$/i) ||
    text.match(/动态[：:]\s*([^\n【\[]{2,80})/i);
  const sum =
    text.match(/【\s*摘要\s*】\s*([\s\S]*?)(?=【\s*动态\s*】|\[moment\]|$)/i) ||
    text.match(/\[summary\]\s*([\s\S]*?)(?=【\s*动态\s*】|\[moment\]|$)/i);
  let summary = sum ? sum[1].trim() : "";
  let moment = dyn ? dyn[1].trim() : "";
  if (!summary && !moment) summary = text;
  if (!summary && moment) summary = "";
  moment = moment.replace(/\n+/g, " ").trim().slice(0, CONTENT_SOFT_CAP);
  return { summary, moment };
}

export function exportMoments() {
  return JSON.stringify(loadMoments(), null, 2);
}

export function importMoments(raw, mode) {
  let incoming;
  try {
    incoming = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    return { ok: false, error: "parse" };
  }
  if (!incoming || typeof incoming !== "object") return { ok: false, error: "shape" };
  const list = Array.isArray(incoming.moments) ? incoming.moments : Array.isArray(incoming) ? incoming : null;
  if (!list) return { ok: false, error: "shape" };
  const replace = mode === "replace";
  const st = replace ? defaultStore() : loadMoments();
  const ids = new Set(st.moments.map((m) => m.id));
  list.forEach((item) => {
    const m = normalizeMoment(item);
    if (!m.content || !m.roleId) return;
    if (ids.has(m.id)) {
      if (replace) {
        const i = st.moments.findIndex((x) => x.id === m.id);
        if (i >= 0) st.moments[i] = m;
      }
      return;
    }
    ids.add(m.id);
    st.moments.push(m);
  });
  saveMoments(st);
  return { ok: true, count: st.moments.length };
}

export const EchoMoments = {
  defaultStore,
  loadMoments,
  saveMoments,
  listMoments,
  listRoleOptions,
  getMoment,
  addMoment,
  updateMoment,
  deleteMoment,
  deleteMomentsForRole,
  deleteMomentsForChat,
  toggleLike,
  addComment,
  parseSummaryAndMoment,
  shouldPersistSummaryDynamic,
  ingestSummaryDynamic,
  captureLivedMoment,
  livedMomentText,
  momentSourceLabel,
  exportMoments,
  importMoments,
  hydrateMoments,
  resetMomentsRuntime,
  flushMomentsPersist,
  normalizeMoment,
};
