/**
 * Single composition root for a chat turn.
 *
 * Character, memory, relationship, worldbook, moments, and lived-gap
 * already live in domain modules. This file is the one place that
 * gathers them into EchoContext and the system prompt.
 *
 * Plugins may append session.extraPrompt. They are not a second
 * architecture and must not persist domain writes here.
 */

import { getRoleId, getPersona } from "./persona.js";
import { retrieveMemoriesForTurn, noteRetrieveChat, isGapIdle } from "./memory.js";
import { buildWorldbookBlock } from "./worldbook.js";
import { getAffinity } from "./relations.js";
import { messageStore } from "./message-store.js";
import { listMoments } from "./moments.js";
import { assembleBehaviorContext } from "./context-builder.js";
import { presentUserMemoryFact } from "./behavior.js";
import { createEchoContext, applyPluginContext } from "../runtime/index.js";

function overlapKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s，。！？,.!?;；、"'“”‘’\-—]/g, "");
}

function uniqueMemories(memories) {
  const out = [];
  const seen = new Set();
  for (const m of memories || []) {
    const key = overlapKey(presentUserMemoryFact(m && m.content));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

function worldWithoutCopiedUserFacts(worldBlock, memories) {
  if (!worldBlock) return null;
  const headerMatch = String(worldBlock).match(/^(---\n[^\n]+\n)/);
  const header = headerMatch ? headerMatch[1] : "---\nWorld Information:\n";
  const body = headerMatch ? String(worldBlock).slice(headerMatch[0].length) : String(worldBlock);
  const factKeys = (memories || [])
    .map((m) => overlapKey(presentUserMemoryFact(m.content)))
    .filter((k) => k.length >= 6);
  const chunks = body
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
  const kept = chunks.filter((chunk) => {
    const n = overlapKey(chunk);
    if (n.length < 6) return true;
    return !factKeys.some((fk) => n === fk || n.includes(fk));
  });
  if (!kept.length) return null;
  return header + kept.join("\n\n");
}

/**
 * @param {object} chat
 * @param {{ query?: string }} [opts]
 */
export function assembleTurnContext(chat, opts = {}) {
  const roleId = getRoleId(chat);
  const persona = getPersona(chat);
  const query = opts.query != null ? String(opts.query) : "";
  noteRetrieveChat(chat?.id);
  const affinity = roleId ? getAffinity(roleId, { moments: listMoments(roleId) }) : null;
  const retrieveOpts = { lastChatAt: affinity?.lastChatAt };
  const memories = uniqueMemories(roleId ? retrieveMemoriesForTurn(roleId, query, undefined, retrieveOpts) : []);
  const assembled = assembleBehaviorContext({
    chat,
    memories,
    affinity,
    gapReturn: isGapIdle(retrieveOpts),
  });
  const history = chat?.id ? messageStore.peekMessages(chat.id) : [];
  const world = worldWithoutCopiedUserFacts(
    buildWorldbookBlock(chat, history, roleId, persona) || null,
    memories
  );
  const moments = roleId ? listMoments(roleId) : null;

  const context = applyPluginContext(
    createEchoContext({
      character: chat,
      conversation: chat,
      memory: memories,
      relationship: affinity,
      world,
      moments,
      session: { chatId: chat?.id, query, extraPrompt: "" },
    })
  );

  const parts = [];
  if (assembled.behavior) parts.push(assembled.behavior);
  if (world) parts.push(world);
  const extraPrompt = context?.session?.extraPrompt;
  if (extraPrompt && String(extraPrompt).trim()) {
    parts.push(`---\nAdditional notes (not user memory):\n${String(extraPrompt).trim()}`);
  }

  return {
    context,
    slots: assembled.slots,
    userPersona: assembled.userPersona,
    prompt: parts.join("\n\n"),
  };
}
