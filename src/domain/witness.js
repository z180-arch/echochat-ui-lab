/**
 * Witnessing — a kept fact or lived moment became continuity.
 * Runtime only. Does not invent Memory / Moments rows.
 */

import { events, EVT } from "../core/events.js";

const TTL_MS = 120000;
let last = null;

export function noteWitness({ roleId, chatId, kind, preview } = {}) {
  const p = String(preview || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!roleId || !kind) return null;
  last = {
    roleId,
    chatId: chatId || null,
    kind,
    preview: p.slice(0, 36),
    at: Date.now(),
  };
  events.emit(EVT.CONTINUITY_WITNESSED, last);
  return last;
}

export function getLastWitness({ roleId, chatId, now = Date.now() } = {}) {
  if (!last) return null;
  if (now - last.at > TTL_MS) return null;
  if (roleId && last.roleId !== roleId) return null;
  if (chatId && last.chatId && last.chatId !== chatId) return null;
  return last;
}

export function witnessLine(w) {
  if (!w) return "";
  if (w.kind === "moment") return w.preview ? `这件事留下了 · ${w.preview}` : "这件事留下了";
  if (w.kind === "review") return "有件事想确认是不是该记住";
  return w.preview ? `记下了 · ${w.preview}` : "记下了一件关于你的事";
}

export function resetWitnessForTests() {
  last = null;
}
