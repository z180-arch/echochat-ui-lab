// ============================================================
//  EchoChat Rebuild · Long-term Memory
//  长期记忆管理 + 自动摘要 + 记忆注入
//  Persist: Dexie `memories` via bulkPut + satellite-reconcile
//  (same crash-safe detect/merge/write/verify/mark as other satellites).
//  Retrieval / quiet remember / prompt header are unchanged.
// ============================================================

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { uid } from "../core/utils.js";
import { getRoleId, getPersona, getRoleName } from "./persona.js";
import { chatCompletion } from "./provider.js";
import { peekMessages } from "./message-store.js";
import { getStorageHooks } from "../repository/test-hooks.js";
import {
  isEntityMigrated,
  reconcileAndCommit,
  markEntityFailed,
  mergeById,
} from "../repository/persistence.js";

const ENTITY = "memories";
let cache = {};
let persistChain = Promise.resolve();
let usingCanonical = false;
let mutationGen = 0;
let persistGen = 0;
let summaryRunning = false;

function emptyBucket() {
  return { roleName: "", memories: [] };
}

function normalizeMemory(partial, roleId) {
  const p = partial || {};
  return {
    id: p.id || uid(),
    content: String(p.content || "").trim(),
    importance: Number(p.importance) || 5,
    createdAt: Number(p.createdAt) || Date.now(),
    source: p.source || "auto",
    characterId: roleId || p.characterId || p.roleId || "",
    roleName: p.roleName || "",
  };
}

function flattenSnapshot(snap) {
  const items = [];
  for (const [roleId, bucket] of Object.entries(snap || {})) {
    if (!roleId || !bucket || !Array.isArray(bucket.memories)) continue;
    for (const m of bucket.memories) {
      const n = normalizeMemory({ ...m, roleName: bucket.roleName }, roleId);
      if (!n.id || !n.content || !n.characterId) continue;
      items.push(n);
    }
  }
  return items;
}

function groupSnapshot(items) {
  const snap = {};
  for (const m of items || []) {
    const roleId = m.characterId || m.roleId;
    if (!roleId) continue;
    if (!snap[roleId]) snap[roleId] = { roleName: m.roleName || "", memories: [] };
    if (m.roleName && !snap[roleId].roleName) snap[roleId].roleName = m.roleName;
    snap[roleId].memories.push({
      id: m.id,
      content: m.content,
      importance: m.importance,
      createdAt: m.createdAt,
      source: m.source,
    });
  }
  return snap;
}

function toDexieMemory(m) {
  const n = normalizeMemory(m, m.characterId);
  return {
    id: n.id,
    characterId: n.characterId,
    type: "long_term",
    content: n.content,
    importance: n.importance,
    source: n.source,
    confidence: 1,
    tags: [],
    roleName: n.roleName || "",
    createdAt: n.createdAt,
    updatedAt: n.createdAt,
  };
}

function fromDexieMemory(row) {
  if (!row) return null;
  return normalizeMemory(
    {
      id: row.id,
      content: row.content,
      importance: row.importance,
      createdAt: row.createdAt,
      source: row.source,
      roleName: row.roleName,
    },
    row.characterId
  );
}

function parseLegacyMemories() {
  try {
    return groupSnapshot(flattenSnapshot(store.getState().longTermMemory || {}));
  } catch {
    return {};
  }
}

async function canonicalAvailable() {
  try {
    const hooks = getStorageHooks();
    return !!(hooks.memory && typeof hooks.memory.findAllRecords === "function" && (await hooks.isAvailable()));
  } catch {
    return false;
  }
}

async function loadCanonicalMemories() {
  const rows = await getStorageHooks().memory.findAllRecords();
  return (rows || []).map(fromDexieMemory).filter((m) => m && m.id && m.characterId && m.content);
}

async function replaceCanonicalMemories(items) {
  await getStorageHooks().memory.replaceAll((items || []).map(toDexieMemory));
}

async function flushPersist() {
  const gen = persistGen;
  const items = flattenSnapshot(cache);
  if (await canonicalAvailable()) {
    if (gen !== persistGen) return;
    await replaceCanonicalMemories(items);
    if (gen !== persistGen) return;
    usingCanonical = true;
  }
}

function schedulePersist() {
  persistChain = persistChain.then(flushPersist).catch((err) => {
    console.warn("[memory] persist failed:", err && err.message ? err.message : err);
    try {
      store.set((s) => ({ ...s, longTermMemory: { ...cache } }));
    } catch {
      // ignore
    }
    try {
      markEntityFailed(ENTITY, err);
    } catch {
      // ignore
    }
  });
  return persistChain;
}

function writeSnapshot(snap) {
  cache = snap || {};
  mutationGen += 1;
  if (usingCanonical) schedulePersist();
  else {
    store.set((s) => ({ ...s, longTermMemory: { ...cache } }));
  }
}

function writeRole(roleId, bucket) {
  const next = { ...exportMemorySnapshot(), [roleId]: bucket };
  writeSnapshot(next);
}

export function exportMemorySnapshot() {
  if (usingCanonical) return JSON.parse(JSON.stringify(cache));
  return JSON.parse(JSON.stringify(store.getState().longTermMemory || {}));
}

export function replaceMemorySnapshot(snap, mode = "replace") {
  const incoming = snap && typeof snap === "object" ? snap : {};
  if (mode === "merge") {
    const cur = exportMemorySnapshot();
    const merged = groupSnapshot(mergeById(flattenSnapshot(cur), flattenSnapshot(incoming)));
    writeSnapshot(merged);
    return merged;
  }
  writeSnapshot(groupSnapshot(flattenSnapshot(incoming)));
  return exportMemorySnapshot();
}

export function loadMemories() {
  if (usingCanonical) return cache;
  return parseLegacyMemories();
}

export function getMemory(roleId) {
  if (!roleId) return emptyBucket();
  if (usingCanonical) return cache[roleId] || emptyBucket();
  const fromStore = store.getState().longTermMemory[roleId];
  return fromStore && Array.isArray(fromStore.memories) ? fromStore : emptyBucket();
}

export function getMemoryList(roleId, limit) {
  const mem = getMemory(roleId);
  const list = mem.memories.slice().sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt);
  return limit ? list.slice(0, limit) : list;
}

export function addMemory(roleId, content, importance = 5, source = "auto") {
  if (!roleId || !content?.trim()) return null;
  const mem = { id: uid(), content: content.trim(), importance, createdAt: Date.now(), source };
  const existing = getMemory(roleId);
  const maxPerRole = store.getState().memoryCfg.maxPerRole;
  const memories = [...existing.memories, mem].slice(-maxPerRole);
  writeRole(roleId, { ...existing, memories });
  events.emit(EVT.MEMORY_ADDED, { roleId, memory: mem });
  return mem;
}

export function deleteMemory(roleId, memoryId) {
  const existing = getMemory(roleId);
  if (!existing.memories.some((m) => m.id === memoryId)) return;
  writeRole(roleId, {
    ...existing,
    memories: existing.memories.filter((m) => m.id !== memoryId),
  });
}

export function clearMemory(roleId) {
  if (!roleId) return;
  if (usingCanonical) {
    if (!cache[roleId]) return;
    const next = { ...cache };
    delete next[roleId];
    writeSnapshot(next);
    return;
  }
  const existing = store.getState().longTermMemory[roleId];
  if (!existing) return;
  store.set((s) => {
    const all = { ...s.longTermMemory };
    delete all[roleId];
    return { ...s, longTermMemory: all };
  });
}

export function resetMemoriesRuntime() {
  cache = {};
  usingCanonical = false;
  mutationGen = 0;
  persistGen += 1;
  persistChain = Promise.resolve();
}

export function flushMemoriesPersist() {
  return persistChain;
}

export async function hydrateMemories() {
  const startGen = mutationGen;
  const legacy = flattenSnapshot(parseLegacyMemories());
  if (!(await canonicalAvailable())) {
    cache = groupSnapshot(legacy);
    usingCanonical = false;
    return { reason: "no-dexie", count: legacy.length, wrote: false };
  }
  try {
    const canonical = await loadCanonicalMemories();
    const result = await reconcileAndCommit({
      entityName: ENTITY,
      canonicalItems: canonical,
      legacyItems: legacy,
      completed: isEntityMigrated(ENTITY),
      replaceCanonical: replaceCanonicalMemories,
      loadCanonical: loadCanonicalMemories,
    });
    let items = result.items;
    if (mutationGen !== startGen) {
      items = mergeById(items, flattenSnapshot(cache));
      await replaceCanonicalMemories(items);
    }
    cache = groupSnapshot(items);
    usingCanonical = true;
    return { ...result, count: items.length };
  } catch (e) {
    markEntityFailed(ENTITY, e);
    console.warn("[memory] hydrate failed:", e && e.message ? e.message : e);
    cache = groupSnapshot(legacy);
    usingCanonical = false;
    return { reason: "failed", error: String(e && e.message ? e.message : e), wrote: false };
  }
}

export function searchMemories(roleId, query) {
  const list = getMemoryList(roleId);
  const q = String(query || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter((m) => String(m.content || "").toLowerCase().includes(q));
}

const DAY_MS = 86400000;

export function tokenizeForRetrieve(text) {
  const s = String(text || "").toLowerCase();
  const tokens = new Set();
  const words = s.match(/[a-z0-9]{2,}/g) || [];
  words.forEach((w) => tokens.add(w));
  const cjk = s.replace(/[^\u4e00-\u9fff]/g, "");
  for (let i = 0; i + 1 < cjk.length; i += 1) {
    tokens.add(cjk.slice(i, i + 2));
  }
  expandRelatedTokens(tokens, s);
  return [...tokens];
}

/** Companion-owned aliases so related talk can find a stored fact. Not a general NLP stack. */
const RELATED_TOKEN_GROUPS = [["摄影", "拍照", "照相"]];

function expandRelatedTokens(tokens, raw) {
  const blob = `${raw || ""} ${[...tokens].join(" ")}`;
  for (const group of RELATED_TOKEN_GROUPS) {
    const mentioned = group.some((g) => blob.includes(g));
    const shooting = group.includes("摄影") && /拍[点些了张]|去拍|拍点|拍照/.test(blob);
    if (mentioned || shooting) group.forEach((g) => tokens.add(g));
  }
}

/** Low-information query tokens. They may appear in a stored fact (e.g. 最近)
 *  but matching *only* on them must not retrieve. Content tokens still decide hits.
 *  Weight is zero for the overlap filter — not a deleted vocabulary. */
const GENERIC_RETRIEVE_TOKENS = new Set([
  "最近",
  "今天",
  "今晚",
  "明天",
  "昨天",
  "前天",
  "后天",
  "现在",
  "刚才",
  "今年",
  "去年",
  "这周",
  "下周",
  "上周",
  "周末",
  "早上",
  "晚上",
  "你好",
  "在吗",
  "还好",
  "好吗",
  "什么",
  "怎么",
  "怎样",
  "如何",
  "这个",
  "那个",
  "一个",
  "一些",
  "开始",
]);

function isGenericRetrieveToken(token) {
  return GENERIC_RETRIEVE_TOKENS.has(token);
}

function overlapScore(content, tokens) {
  if (!tokens.length) return { overlap: 0, contentOverlap: 0 };
  const hay = String(content || "").toLowerCase();
  let overlap = 0;
  let contentOverlap = 0;
  for (const t of tokens) {
    if (!t || !hay.includes(t)) continue;
    const w = t.length > 1 ? 2 : 1;
    overlap += w;
    if (!isGenericRetrieveToken(t)) contentOverlap += w;
  }
  return { overlap, contentOverlap };
}

let lastRetrieve = { roleId: null, chatId: null, items: [], hadHit: false, preview: "" };

export function getLastMemoryRetrieve() {
  return lastRetrieve;
}

const IDLE_GAP_MS = 2 * DAY_MS;
const ANCHOR_IMPORTANCE_MIN = 7;
const ANCHOR_MAX = 2;
/** Best overlap at or below this counts as weak (single bigram ≈ 2). */
const WEAK_OVERLAP_MAX = 2;

export function isGapIdle(opts = {}) {
  if (opts.idleMs != null) return Number(opts.idleMs) >= IDLE_GAP_MS;
  if (opts.idleDays != null) return Number(opts.idleDays) >= 2;
  const lastChatAt = Number(opts.lastChatAt) || 0;
  if (!lastChatAt) return false;
  return Date.now() - lastChatAt >= IDLE_GAP_MS;
}

function continuityAnchors(all, now, max) {
  return all
    .filter((m) => (Number(m.importance) || 0) >= ANCHOR_IMPORTANCE_MIN)
    .map((m) => {
      const recency = 1 / (1 + Math.max(0, now - (m.createdAt || 0)) / (14 * DAY_MS));
      const importance = Number(m.importance) || 0;
      return { mem: m, score: importance + recency * 0.2 };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.mem.importance || 0) - (a.mem.importance || 0) ||
        (b.mem.createdAt || 0) - (a.mem.createdAt || 0)
    )
    .slice(0, max)
    .map((r) => r.mem);
}

export function retrieveMemoriesForTurn(roleId, query, limit, opts = {}) {
  const injectMax = limit || store.getState().memoryCfg?.injectMax || 10;
  const all = getMemory(roleId).memories || [];
  if (!roleId || !all.length) {
    lastRetrieve = { roleId: roleId || null, chatId: lastRetrieve.chatId, items: [], hadHit: false, preview: "" };
    return [];
  }
  const q = String(query || "").trim();
  const tokens = tokenizeForRetrieve(q);
  const now = Date.now();
  const ranked = all.map((m) => {
    const scored = q ? overlapScore(m.content, tokens) : { overlap: 0, contentOverlap: 0 };
    const overlap = scored.contentOverlap;
    const recency = 1 / (1 + Math.max(0, now - (m.createdAt || 0)) / (14 * DAY_MS));
    const importance = Number(m.importance) || 0;
    const score = q ? overlap * 5 + importance * 0.35 + recency : importance + recency * 0.2;
    return { mem: m, overlap, score };
  });
  ranked.sort(
    (a, b) => b.score - a.score || (b.mem.importance || 0) - (a.mem.importance || 0) || (b.mem.createdAt || 0) - (a.mem.createdAt || 0)
  );
  const pool = q ? ranked.filter((r) => r.overlap > 0) : ranked;
  const bestOverlap = pool.length ? pool[0].overlap : 0;
  const weakOrEmpty = !pool.length || bestOverlap <= WEAK_OVERLAP_MAX;

  // Gap/idle return only: when overlap is empty/weak, surface 1–2 high-importance anchors.
  // Active conversation keeps current behavior (no important-memory dump on miss).
  let items;
  let usedAnchors = false;
  if (q && weakOrEmpty && isGapIdle(opts)) {
    const anchors = continuityAnchors(all, now, Math.min(ANCHOR_MAX, injectMax));
    if (anchors.length) {
      items = anchors;
      usedAnchors = true;
    } else {
      items = pool.slice(0, injectMax).map((r) => r.mem);
    }
  } else {
    items = pool.slice(0, injectMax).map((r) => r.mem);
  }

  const hit = usedAnchors ? (items[0] ? { mem: items[0] } : null) : q ? pool[0] : null;
  const hadHit = !!(hit && items.some((m) => m.id === hit.mem.id));
  lastRetrieve = {
    roleId,
    chatId: lastRetrieve.chatId,
    items,
    hadHit,
    preview: hadHit ? String(hit.mem.content || "").slice(0, 28) : "",
    usedAnchors,
  };
  return items;
}

export function noteRetrieveChat(chatId) {
  lastRetrieve = { ...lastRetrieve, chatId: chatId || null };
}

export function updateMemoryImportance(roleId, memoryId, importance) {
  const existing = getMemory(roleId);
  if (!existing.memories.some((m) => m.id === memoryId)) return;
  writeRole(roleId, {
    ...existing,
    memories: existing.memories.map((m) => (m.id === memoryId ? { ...m, importance } : m)),
  });
}

// 构建记忆注入文本
export function buildMemoryBlock(roleId) {
  const mem = getMemory(roleId);
  if (!mem || !mem.memories.length) return null;
  const injectMax = store.getState().memoryCfg.injectMax || 10;
  const top = mem.memories
    .slice()
    .sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt)
    .slice(0, injectMax);
  if (!top.length) return null;
  const lines = top.map((m) => `- ${m.content}`);
  return `---\nAbout the user (remembered from past conversations):\n${lines.join("\n")}`;
}

// 记住单条消息（手动）
export function rememberMessage(chat, message) {
  const roleId = getRoleId(chat);
  if (!roleId || !message?.text?.trim()) return;
  addMemory(roleId, message.text.trim(), 6, "manual");
}

// 自动摘要（每 N 轮触发一次）
export async function maybeAutoSummary(chat, opts = {}) {
  const s = store.getState();
  const cfg = s.memoryCfg.autoSummary;
  if (!cfg?.enabled || summaryRunning) return;
  const history = peekMessages(chat.id);
  const msgCount = history.length;
  if (msgCount < cfg.everyTurns || msgCount % cfg.everyTurns !== 0) return;

  summaryRunning = true;
  try {
    const roleId = getRoleId(chat);
    const persona = getPersona(chat);
    const recent = history.slice(-cfg.everyTurns * 2);
    const conversation = recent
      .map((m) => `${m.role === "me" ? "用户" : getRoleName(chat)}: ${m.text}`)
      .join("\n");

    const prompt = `请从以下对话中提取重要信息，生成摘要。

人设：${persona.slice(0, 200)}

对话：
${conversation}

请按以下格式输出：
【摘要】
（提取用户的重要信息、偏好、事件，每条一行，最多5条。只写能确认的事实，不要推测。）`;

    const complete = (opts && opts.complete) || chatCompletion;
    const result = await complete(
      chat,
      [{ role: "user", content: prompt }],
      { temperature: 0.5, maxTokens: cfg.maxLength || 200 }
    );

    const { applyAutoSummaryResult } = await import("./memory-candidates.js");
    applyAutoSummaryResult(roleId, result, { chatId: chat.id });
  } catch (e) {
    console.warn("[Memory] auto summary failed:", e);
  } finally {
    summaryRunning = false;
  }
}

export const Memory = {
  getMemory,
  getMemoryList,
  addMemory,
  deleteMemory,
  clearMemory,
  searchMemories,
  updateMemoryImportance,
  retrieveMemoriesForTurn,
  getLastMemoryRetrieve,
  isGapIdle,
  buildMemoryBlock,
  rememberMessage,
  maybeAutoSummary,
  hydrateMemories,
  resetMemoriesRuntime,
  flushMemoriesPersist,
  exportMemorySnapshot,
  replaceMemorySnapshot,
  applyAutoSummaryResult: async (roleId, raw, options) => {
    const { applyAutoSummaryResult } = await import("./memory-candidates.js");
    return applyAutoSummaryResult(roleId, raw, options);
  },
};
