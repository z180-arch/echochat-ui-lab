// ============================================================
//  EchoChat Rebuild · Long-term Memory
//  长期记忆管理 + 自动摘要 + 记忆注入
// ============================================================

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { uid } from "../core/utils.js";
import { getRoleId, getPersona, getRoleName } from "./persona.js";
import { chatCompletion } from "./provider.js";
import { parseSummaryAndMoment, addMoment } from "./moments.js";
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
  return [...tokens];
}

function overlapScore(content, tokens) {
  if (!tokens.length) return 0;
  const hay = String(content || "").toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (t && hay.includes(t)) hits += t.length > 1 ? 2 : 1;
  }
  return hits;
}

let lastRetrieve = { roleId: null, chatId: null, items: [], hadHit: false, preview: "" };

export function getLastMemoryRetrieve() {
  return lastRetrieve;
}

export function retrieveMemoriesForTurn(roleId, query, limit) {
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
    const overlap = q ? overlapScore(m.content, tokens) : 0;
    const recency = 1 / (1 + Math.max(0, now - (m.createdAt || 0)) / (14 * DAY_MS));
    const importance = Number(m.importance) || 0;
    const score = q ? overlap * 5 + importance * 0.35 + recency : importance + recency * 0.2;
    return { mem: m, overlap, score };
  });
  ranked.sort(
    (a, b) => b.score - a.score || (b.mem.importance || 0) - (a.mem.importance || 0) || (b.mem.createdAt || 0) - (a.mem.createdAt || 0)
  );
  const pool = q ? ranked.filter((r) => r.overlap > 0) : ranked;
  const items = pool.slice(0, injectMax).map((r) => r.mem);
  const hit = q ? pool[0] : null;
  const hadHit = !!(hit && items.some((m) => m.id === hit.mem.id));
  lastRetrieve = {
    roleId,
    chatId: lastRetrieve.chatId,
    items,
    hadHit,
    preview: hadHit ? String(hit.mem.content || "").slice(0, 28) : "",
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
export async function maybeAutoSummary(chat) {
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

    const prompt = `请从以下对话中提取重要信息，生成摘要和一条角色动态。

人设：${persona.slice(0, 200)}

对话：
${conversation}

请按以下格式输出：
【摘要】
（提取用户的重要信息、偏好、事件，每条一行，最多5条）

【动态】
（以角色口吻写一条朋友圈动态，20-80字，不带引号）`;

    const result = await chatCompletion(
      chat,
      [{ role: "user", content: prompt }],
      { temperature: 0.5, maxTokens: cfg.maxLength || 200 }
    );

    const { summary, moment } = parseSummaryAndMoment(result);

    // Conservative write: confirm-candidates remain the memory path.
    // Auto-summary no longer dumps extracted lines into long-term memory.
    void summary;

    if (moment) {
      addMoment({
        roleId,
        roleName: getRoleName(chat),
        content: moment,
        source: "auto_summary",
      });
      events.emit(EVT.MOMENT_ADDED, { roleId, content: moment });
    }
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
  buildMemoryBlock,
  rememberMessage,
  maybeAutoSummary,
};
