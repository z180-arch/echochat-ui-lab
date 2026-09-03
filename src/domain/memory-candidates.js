/**
 * Memory candidates from existing conversations.
 * Heuristic extraction + user review. Writes only through addMemory.
 */

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { peekMessages } from "./message-store.js";
import { addMemory, getMemoryList } from "./memory.js";
import { addMoment, parseSummaryAndMoment } from "./moments.js";
import { getRoleName } from "./persona.js";
import { recordRelationshipEvent } from "./relations.js";

const FACT_RE = /我(喜欢|讨厌|爱吃|爱|是|在|住|有|想|会|要|叫)|今天|明天|昨天|工作|上学|生日/;
const ABOUT_USER_RE = /你(喜欢|讨厌|是|在|住|有)/;
const SKIP_RE = /^(嗨|哈喽|你好|在吗|嗯+|哦+|好的|ok|hi|hey|我在)[。.!！？?\s]*$/i;
const EMOTION_ONLY_RE = /^(好烦|好累|哈哈哈+|呵呵+|开心|难过|生气|嗯嗯+|哦哦+|唉+)[。.!！？?\s]*$/;
// `(?<![不])可能` keeps lines like「不可能…」; bare 可能 / 也许 / … still drop.
const SPECULATION_RE = /也许|似乎|大概|应该是|说不定|(?<![不])可能/;
const PLOT_START_RE = /^(她|他|角色)/;
const USER_HANDLE_RE = /用户|你|我/;

/** Runtime-only pending review batches. Not persisted. */
const pendingByRole = new Map();

export function normalizeMemoryText(text) {
  return String(text || "")
    .replace(/^用户说过[：:]/, "")
    .toLowerCase()
    .replace(/[\s，。！？,.!?;；、"'“”‘’]/g, "");
}

function isDuplicateOf(content, normalizedList) {
  const n = normalizeMemoryText(content);
  if (!n || n.length < 2) return true;
  return normalizedList.some((e) => e === n || (n.length >= 6 && e.length >= 6 && (e.includes(n) || n.includes(e))));
}

function splitSummaryLines(summary) {
  return String(summary || "")
    .split(/\n+|；|;/)
    .map((line) => line.replace(/^[-•*\d.、]+\s*/, "").trim())
    .filter(Boolean);
}

function isLowQualitySummaryLine(text) {
  const t = String(text || "").trim();
  if (t.length < 6) return true;
  if (SKIP_RE.test(t)) return true;
  if (EMOTION_ONLY_RE.test(t)) return true;
  if (SPECULATION_RE.test(t)) return true;
  if (PLOT_START_RE.test(t) && !USER_HANDLE_RE.test(t)) return true;
  return false;
}

export function candidatesFromSummary(summary, characterId) {
  const existing = characterId ? getMemoryList(characterId).map((m) => normalizeMemoryText(m.content)) : [];
  const seen = [];
  const candidates = [];
  let n = 0;
  for (const line of splitSummaryLines(summary)) {
    if (isLowQualitySummaryLine(line)) continue;
    const duplicate = isDuplicateOf(line, [...existing, ...seen]);
    if (!duplicate) seen.push(normalizeMemoryText(line));
    candidates.push({
      id: `s${++n}`,
      text: line,
      accepted: false,
      duplicate,
      evidence: [{ index: 0, excerpt: line.slice(0, 80), source: "summary" }],
    });
    if (candidates.length >= 5) break;
  }
  return candidates;
}

export function setPendingCandidates(roleId, candidates, chatId) {
  if (!roleId) return null;
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) {
    pendingByRole.delete(roleId);
    return null;
  }
  const batch = {
    roleId,
    chatId: chatId || null,
    createdAt: Date.now(),
    candidates: list,
  };
  pendingByRole.set(roleId, batch);
  return batch;
}

export function getPendingCandidates(roleId) {
  if (!roleId) return null;
  return pendingByRole.get(roleId) || null;
}

export function clearPendingCandidates(roleId) {
  if (!roleId) return;
  pendingByRole.delete(roleId);
}

export function resetPendingForTests() {
  pendingByRole.clear();
}

export function clonePendingForReview(roleId) {
  const pending = getPendingCandidates(roleId);
  if (!pending?.candidates?.length) return null;
  const existing = getMemoryList(roleId).map((m) => normalizeMemoryText(m.content));
  const candidates = pending.candidates.map((c) => {
    const duplicate = !!c.duplicate || isDuplicateOf(c.text, existing);
    return {
      ...c,
      evidence: (c.evidence || []).map((e) => ({ ...e })),
      duplicate,
      accepted: duplicate ? false : !!c.accepted,
    };
  });
  return { roleId, chatId: pending.chatId, createdAt: pending.createdAt, candidates };
}

export function applyAutoSummaryResult(roleId, raw, { chatId } = {}) {
  if (!roleId) return { count: 0 };
  const { summary } = parseSummaryAndMoment(raw);
  const candidates = candidatesFromSummary(summary, roleId);
  const actionable = candidates.filter((c) => !c.duplicate);
  // Duplicate-only batches must not toast or block heuristic「从对话提取」.
  if (!actionable.length) return { count: 0 };
  setPendingCandidates(roleId, candidates, chatId);
  events.emit(EVT.MEMORY_CANDIDATES_READY, {
    roleId,
    chatId: chatId || null,
    count: actionable.length,
  });
  return { count: actionable.length };
}

export function extractMemoryCandidates(characterId, options = {}) {
  if (!characterId) return { ok: false, error: "no-character", candidates: [], notice: "没有角色" };
  const chats = (store.getState().chats || []).filter((c) => c.roleId === characterId && !c.archivedAt);
  const filtered = options.chatId ? chats.filter((c) => c.id === options.chatId) : chats;
  const existing = getMemoryList(characterId).map((m) => normalizeMemoryText(m.content));
  const seen = [];
  const candidates = [];
  let n = 0;

  for (const chat of filtered) {
    const history = peekMessages(chat.id) || [];
    history.forEach((m, i) => {
      const text = String(m.text || "").trim();
      if (!text || SKIP_RE.test(text)) return;
      const isUser = m.role === "me";
      const interesting = isUser && (text.length >= 7 || (FACT_RE.test(text) && text.length >= 6));
      const aboutUser = !isUser && ABOUT_USER_RE.test(text) && text.length >= 6;
      if (!interesting && !aboutUser) return;
      const duplicate = isDuplicateOf(text, [...existing, ...seen]);
      if (!duplicate) seen.push(normalizeMemoryText(text));
      candidates.push({
        id: `c${++n}`,
        text,
        accepted: !duplicate,
        duplicate,
        evidence: [{ chatId: chat.id, index: i + 1, excerpt: text.slice(0, 80) }],
      });
    });
  }

  const fresh = candidates.filter((c) => !c.duplicate);
  let notice = null;
  if (!candidates.length) notice = "这段对话里还没有能确定的记忆。聊一件具体的事，再提取。";
  else if (!fresh.length) notice = "这些内容已经记过了。";

  return { ok: true, error: null, candidates, notice };
}

export function setCandidateAccepted(candidates, id, accepted) {
  return (candidates || []).map((c) => (c.id === id ? { ...c, accepted: !!accepted } : c));
}

export function editCandidateText(candidates, id, text) {
  return (candidates || []).map((c) => (c.id === id ? { ...c, text: String(text || "") } : c));
}

export function confirmMemoryCandidates(characterId, candidates, options = {}) {
  if (!characterId) return { ok: false, error: "no-character", added: 0, skipped: 0 };
  const existing = getMemoryList(characterId).map((m) => normalizeMemoryText(m.content));
  let added = 0;
  let skipped = 0;
  const created = [];
  for (const c of candidates || []) {
    const text = String(c.text || "").trim();
    if (!c.accepted || !text || c.duplicate || isDuplicateOf(text, existing)) {
      skipped++;
      continue;
    }
    const mem = addMemory(characterId, text, 6, "candidate");
    if (!mem) {
      skipped++;
      continue;
    }
    added++;
    created.push(mem);
    existing.push(normalizeMemoryText(mem.content));
  }

  if (added > 0) {
    recordRelationshipEvent(characterId, { type: "memory", text: "记下了一件关于你的事" });
    clearPendingCandidates(characterId);
  }

  let moment = null;
  if (options.postMoment && created[0]) {
    const chat = store.getState().chats.find((x) => x.roleId === characterId);
    moment = addMoment({
      roleId: characterId,
      roleName: chat ? getRoleName(chat) : "角色",
      content: `记下了。${created[0].content}`.slice(0, 80),
      source: "memory",
      relatedMemoryId: created[0].id,
    });
  }

  return { ok: true, added, skipped, momentId: moment?.id || null };
}
