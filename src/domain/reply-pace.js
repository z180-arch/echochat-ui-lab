// Character-scoped reply presentation pace.
// Controls post-generation wait only. Does not slow or block the API.

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { clamp } from "../core/utils.js";

export const REPLY_PACE_INSTANT = "instant";
export const REPLY_PACE_NATURAL = "natural";
export const REPLY_PACE_SLOW = "slow";
export const DEFAULT_REPLY_PACE = REPLY_PACE_NATURAL;

export const REPLY_PACE_OPTIONS = [
  { value: REPLY_PACE_INSTANT, label: "即时" },
  { value: REPLY_PACE_NATURAL, label: "自然" },
  { value: REPLY_PACE_SLOW, label: "慢速" },
];

export function normalizeReplyPace(value) {
  if (value === REPLY_PACE_INSTANT || value === REPLY_PACE_NATURAL || value === REPLY_PACE_SLOW) {
    return value;
  }
  return DEFAULT_REPLY_PACE;
}

export function getReplyPace(chat) {
  return normalizeReplyPace(chat?.config?.replyPace);
}

export function setReplyPaceForCharacter(roleId, pace) {
  if (!roleId) return;
  const normalized = normalizeReplyPace(pace);
  const chats = store.getState().chats.filter((c) => c.roleId === roleId);
  for (const chat of chats) {
    store.updateChat(chat.id, {
      config: { ...chat.config, replyPace: normalized },
    });
  }
}

/**
 * Post-generation wait in ms.
 * Short replies stay modest; long replies cap. Light jitter avoids a metronome.
 */
export function presentationDelayMs(pace, text, randFn = Math.random) {
  const mode = normalizeReplyPace(pace);
  if (mode === REPLY_PACE_INSTANT) return 0;
  const len = String(text || "").length;
  const jitter = 0.88 + randFn() * 0.24;
  const curve = Math.sqrt(len);
  if (mode === REPLY_PACE_SLOW) {
    return Math.round(clamp((620 + 78 * curve) * jitter, 480, 2600));
  }
  return Math.round(clamp((240 + 42 * curve) * jitter, 160, 1100));
}

function shouldSkipPresentation(chatId) {
  if (!chatId) return true;
  const s = store.getState();
  if (s.currentChatId !== chatId) return true;
  if (s.ui?.activeTab && s.ui.activeTab !== "companion") return true;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return true;
  return false;
}

export function waitPresentationDelay(ms, { signal, chatId } = {}) {
  const delay = Math.max(0, Number(ms) || 0);
  if (delay <= 0 || signal?.aborted || shouldSkipPresentation(chatId)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onSkipCheck = () => {
      if (signal?.aborted || shouldSkipPresentation(chatId)) finish();
    };
    const timer = setTimeout(finish, delay);
    signal?.addEventListener("abort", finish);
    const offs = [
      events.on(EVT.CHAT_SELECTED, onSkipCheck),
      events.on(EVT.TAB_CHANGE, onSkipCheck),
    ];
    const doc = typeof document !== "undefined" ? document : null;
    doc?.addEventListener("visibilitychange", onSkipCheck);
    doc?.addEventListener("pagehide", finish);
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      offs.forEach((off) => off());
      doc?.removeEventListener("visibilitychange", onSkipCheck);
      doc?.removeEventListener("pagehide", finish);
    }
  });
}
