// Per-conversation composer drafts. Isolated localStorage key, not Dexie.

import { storage, KEYS } from "../core/storage.js";
import { MAX_USER_MESSAGE_CHARS } from "./reply-clean.js";

function readAll() {
  try {
    const raw = storage.getRaw(KEYS.CHAT_DRAFTS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeAll(map) {
  storage.setRaw(KEYS.CHAT_DRAFTS, JSON.stringify(map));
}

export function loadChatDraft(chatId) {
  if (!chatId) return "";
  return String(readAll()[chatId] || "");
}

export function saveChatDraft(chatId, text) {
  if (!chatId) return;
  const all = readAll();
  const next = String(text || "");
  if (!next) delete all[chatId];
  else all[chatId] = next.slice(0, MAX_USER_MESSAGE_CHARS);
  writeAll(all);
}

export function clearChatDraft(chatId) {
  saveChatDraft(chatId, "");
}
