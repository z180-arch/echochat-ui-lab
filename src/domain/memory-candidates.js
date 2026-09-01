/**
 * Memory candidates from existing conversations.
 * Heuristic extraction + user review. Writes only through addMemory.
 */

import { store } from "../core/store.js";
import { peekMessages } from "./message-store.js";
import { addMemory, getMemoryList } from "./memory.js";
import { addMoment } from "./moments.js";
import { getRoleName } from "./persona.js";

const FACT_RE = /我(喜欢|讨厌|爱吃|爱|是|在|住|有|想|会|要|叫)|今天|明天|昨天|工作|上学|生日/;
const ABOUT_USER_RE = /你(喜欢|讨厌|是|在|住|有)/;
const SKIP_RE = /^(嗨|哈喽|你好|在吗|嗯+|哦+|好的|ok|hi|hey|我在)[。.!！？?\s]*$/i;

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
