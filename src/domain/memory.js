// ============================================================
//  EchoChat Rebuild · Long-term Memory
//  长期记忆管理 + 自动摘要 + 记忆注入
// ============================================================

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { uid } from "../core/utils.js";
import { getRoleId, getPersona, getRoleName } from "./persona.js";
import { chatCompletion } from "./provider.js";
import { peekMessages } from "./message-store.js";

let summaryRunning = false;

export function getMemory(roleId) {
  const s = store.getState();
  return s.longTermMemory[roleId] || { roleName: "", memories: [] };
}

export function getMemoryList(roleId, limit) {
  const mem = getMemory(roleId);
  const list = mem.memories.slice().sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt);
  return limit ? list.slice(0, limit) : list;
}

export function addMemory(roleId, content, importance = 5, source = "auto") {
  if (!roleId || !content?.trim()) return null;
  const mem = { id: uid(), content: content.trim(), importance, createdAt: Date.now(), source };
  store.set((s) => {
    const existing = s.longTermMemory[roleId] || { roleName: "", memories: [] };
    const memories = [...existing.memories, mem].slice(-s.memoryCfg.maxPerRole);
    return {
      ...s,
      longTermMemory: { ...s.longTermMemory, [roleId]: { ...existing, memories } },
    };
  });
  events.emit(EVT.MEMORY_ADDED, { roleId, memory: mem });
  return mem;
}

export function deleteMemory(roleId, memoryId) {
  store.set((s) => {
    const existing = s.longTermMemory[roleId];
    if (!existing) return s;
    return {
      ...s,
      longTermMemory: {
        ...s.longTermMemory,
        [roleId]: { ...existing, memories: existing.memories.filter((m) => m.id !== memoryId) },
      },
    };
  });
}

export function clearMemory(roleId) {
  store.set((s) => {
    const existing = s.longTermMemory[roleId];
    if (!existing) return s;
    return {
      ...s,
      longTermMemory: { ...s.longTermMemory, [roleId]: { ...existing, memories: [] } },
    };
  });
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
  store.set((s) => {
    const existing = s.longTermMemory[roleId];
    if (!existing) return s;
    return {
      ...s,
      longTermMemory: {
        ...s.longTermMemory,
        [roleId]: {
          ...existing,
          memories: existing.memories.map((m) => (m.id === memoryId ? { ...m, importance } : m)),
        },
      },
    };
  });
}

// 构建记忆注入文本
export function buildMemoryBlock(roleId) {
  const s = store.getState();
  const mem = s.longTermMemory[roleId];
  if (!mem || !mem.memories.length) return null;
  const injectMax = s.memoryCfg.injectMax || 10;
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
  applyAutoSummaryResult: async (roleId, raw, options) => {
    const { applyAutoSummaryResult } = await import("./memory-candidates.js");
    return applyAutoSummaryResult(roleId, raw, options);
  },
};
