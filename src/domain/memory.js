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

let summaryRunning = false;

export function getMemory(roleId) {
  const s = store.getState();
  return s.longTermMemory[roleId] || { roleName: "", memories: [] };
}

export function getMemoryList(roleId, limit) {
  const mem = getMemory(roleId);
  const list = mem.memories.slice().sort((a, b) => (b.importance || 0) - (a.importance || 0));
  return limit ? list.slice(0, limit) : list;
}

export function addMemory(roleId, text, opts = {}) {
  if (!roleId || !text) return null;
  const item = {
    id: uid(),
    text: String(text).trim(),
    importance: opts.importance ?? 5,
    source: opts.source || "manual",
    createdAt: Date.now(),
  };
  store.set((s) => {
    const ltm = { ...s.longTermMemory };
    const cur = ltm[roleId] || { roleName: opts.roleName || "", memories: [] };
    ltm[roleId] = {
      ...cur,
      roleName: opts.roleName || cur.roleName || "",
      memories: [...cur.memories, item],
    };
    return { ...s, longTermMemory: ltm };
  });
  events.emit(EVT.MEMORY_ADDED, { roleId, item });
  return item;
}

export function deleteMemory(roleId, memId) {
  store.set((s) => {
    const ltm = { ...s.longTermMemory };
    const cur = ltm[roleId];
    if (!cur) return s;
    ltm[roleId] = { ...cur, memories: cur.memories.filter((m) => m.id !== memId) };
    return { ...s, longTermMemory: ltm };
  });
}

export function clearMemory(roleId) {
  store.set((s) => {
    const ltm = { ...s.longTermMemory };
    delete ltm[roleId];
    return { ...s, longTermMemory: ltm };
  });
}

export function updateMemoryImportance(roleId, memId, importance) {
  store.set((s) => {
    const ltm = { ...s.longTermMemory };
    const cur = ltm[roleId];
    if (!cur) return s;
    ltm[roleId] = {
      ...cur,
      memories: cur.memories.map((m) => (m.id === memId ? { ...m, importance } : m)),
    };
    return { ...s, longTermMemory: ltm };
  });
}

export function buildMemoryBlock(roleId, maxItems = 12) {
  const list = getMemoryList(roleId, maxItems);
  if (!list.length) return "";
  const lines = list.map((m) => `- ${m.text}`);
  return "【长期记忆】\n" + lines.join("\n");
}

export function rememberMessage(chat, text) {
  const roleId = getRoleId(chat);
  if (!roleId || !text) return;
  // 简单启发式：较长或含关键词的用户消息可记
  if (text.length < 20) return;
  addMemory(roleId, text.slice(0, 200), {
    importance: 4,
    source: "auto",
    roleName: getRoleName(chat),
  });
}

export async function maybeAutoSummary(chat) {
  if (summaryRunning || !chat) return;
  const roleId = getRoleId(chat);
  if (!roleId) return;
  const msgs = chat.messages || [];
  if (msgs.length < 20) return;
  // 每约 20 条尝试一次
  if (msgs.length % 20 !== 0) return;

  summaryRunning = true;
  try {
    const recent = msgs.slice(-16);
    const transcript = recent
      .map((m) => `${m.role === "user" ? "用户" : "角色"}: ${m.text || ""}`)
      .join("\n");
    const system =
      "你是记忆摘要助手。根据对话摘出 3-5 条值得长期记住的要点，以及可选的一条角色生活动态。" +
      "输出格式：\nSUMMARY:\n- 要点1\n- 要点2\nMOMENT:\n动态内容（可空）";
    const content = await chatCompletion(chat, [
      { role: "system", content: system },
      { role: "user", content: transcript },
    ]);
    const { summaries, moment } = parseSummaryAndMoment(content || "");
    for (const t of summaries) {
      addMemory(roleId, t, {
        importance: 6,
        source: "auto_summary",
        roleName: getRoleName(chat),
      });
    }
    if (moment) {
      addMoment(roleId, moment, {
        roleName: getRoleName(chat),
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
  updateMemoryImportance,
  buildMemoryBlock,
  rememberMessage,
  maybeAutoSummary,
};
