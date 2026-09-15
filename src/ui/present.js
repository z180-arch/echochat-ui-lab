// ============================================================
//  Presentation-only companion stage + composer chrome.
//  Does not read or write relationship / affinity stores.
// ============================================================

export function presentCompanionStage(affinity, hasTalk) {
  if (affinity?.hasHistory) {
    return {
      label: String(affinity.stageLabel || "").trim() || "刚刚认识",
      stage: affinity.stage || "none",
      hasHistory: true,
      knownDays: Number(affinity.knownDays) || 0,
    };
  }
  if (hasTalk) {
    return {
      label: "刚刚认识",
      stage: affinity?.stage || "none",
      hasHistory: false,
      knownDays: 0,
    };
  }
  return {
    label: "还没有聊过",
    stage: "none",
    hasHistory: false,
    knownDays: 0,
  };
}

export function hubSecondaryLine(presented) {
  if (!presented) return "还没有聊过";
  if (presented.hasHistory && presented.knownDays) {
    return `${presented.label} · 认识第${presented.knownDays}天`;
  }
  return presented.label || "还没有聊过";
}

/** Days since last real timestamp. 0 if missing or in the future. */
export function daysAway(lastAt, now = Date.now()) {
  const t = Number(lastAt) || 0;
  if (!t) return 0;
  const days = Math.floor((now - t) / 86400000);
  return days > 0 ? days : 0;
}

/** Reunion copy from a real last-seen time. Empty if they talked today. Never invents events. */
export function reunionLine(lastAt, now = Date.now()) {
  const days = daysAway(lastAt, now);
  if (days < 1) return "";
  if (days === 1) return "隔了一天";
  if (days < 7) return "有几天没聊了";
  if (days < 30) return "好久不见";
  return "很久没见了";
}

export function clipPreview(text, max = 28) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const cap = Number(max) || 28;
  return s.length > cap ? `${s.slice(0, cap)}…` : s;
}

/**
 * One companion ritual chip. Presentation only.
 * Priority: memory recall → reunion (from lastAt) → first-meet.
 */
export function companionRitual({
  recallPreview = "",
  lastAt = 0,
  hasMessages = false,
  meetEarly = false,
  sending = false,
} = {}) {
  if (sending) return { kind: "", text: "" };
  const recall = String(recallPreview || "").trim();
  if (recall) return { kind: "recall", text: `想起了 ${recall}` };
  const reunion = reunionLine(lastAt);
  if (reunion && hasMessages) return { kind: "reunion", text: reunion };
  if (meetEarly) return { kind: "meet", text: "刚刚认识 · 打开相处中" };
  return { kind: "", text: "" };
}

export const MEET_STARTER_HELLO = "你好，今天过得怎么样";
export const MEET_STARTER_WHO = "跟我说说你是谁";

/** Opening prompts from character definition only. Never auto-sends. */
export function meetStarterPrompts(slots = {}) {
  const out = [MEET_STARTER_HELLO, MEET_STARTER_WHO];
  const likes = clipPreview(slots.likes, 10);
  if (likes) out.push(`你喜欢${likes}吗`);
  const scenario = clipPreview(slots.scenario, 16);
  if (scenario && out.length < 4) out.push(`我们从「${scenario}」开始`);
  return out.slice(0, 4);
}

/** Greeting written on the character card, not a remembered event. */
export function definedGreeting(chat) {
  return String(chat?.config?.firstMessage || "").trim();
}

/**
 * Resume strip from real last talk / moment / memory / stage.
 * Hidden unless they have been away at least a day.
 */
export function livedResume({
  lastPreview = "",
  lastAt = 0,
  latestMoment = "",
  latestMemory = "",
  stageLabel = "",
  now = Date.now(),
} = {}) {
  const days = daysAway(lastAt, now);
  const reunion = reunionLine(lastAt, now);
  const lines = [];
  if (reunion) lines.push({ kind: "gap", text: reunion });
  const last = clipPreview(lastPreview, 32);
  if (last) lines.push({ kind: "last", text: `上次我们聊到 · ${last}` });
  const moment = clipPreview(latestMoment, 32);
  if (moment) lines.push({ kind: "moment", text: moment });
  const mem = clipPreview(latestMemory, 28);
  if (mem) lines.push({ kind: "memory", text: `还记得 · ${mem}` });
  const stage = String(stageLabel || "").trim();
  if (stage && stage !== "还没有聊过") lines.push({ kind: "rel", text: stage });
  return { days, reunion, lines, show: days >= 1 && lines.length > 0 };
}

export function hubResumeLine(lastPreview, lastAt, now = Date.now()) {
  const last = clipPreview(lastPreview, 28);
  const reunion = reunionLine(lastAt, now);
  if (reunion && last) return `${reunion} · ${last}`;
  return last;
}

export function hubShowsStageChip(presence, stageLabel) {
  const p = String(presence || "");
  const s = String(stageLabel || "").trim();
  if (!s) return false;
  return p !== s && !p.includes(s);
}

export function relationshipEmptyCopy(presented) {
  if (!presented || presented.label === "还没有聊过") {
    return "还没有聊过。开口第一句，关系从这里开始。";
  }
  return "刚刚认识。多聊，关系会自己靠近——没有数值可以调。";
}

export const COMPOSER_COUNT_NEAR_RATIO = 0.9;
export const PROFILE_PERSIST_MIN_WIDTH = 1280;
export const COMPACT_DESKTOP_MIN_WIDTH = 1024;
export const COMPACT_DESKTOP_LIST_WIDTH = 260;
export const DEFAULT_LIST_WIDTH = 320;
export const CHAT_COLUMN_MIN_WIDTH = 360;

export function compactDesktopListWidth(viewport) {
  const w = Number(viewport);
  if (w >= 1440) return 340;
  if (w >= PROFILE_PERSIST_MIN_WIDTH) return DEFAULT_LIST_WIDTH;
  if (w >= COMPACT_DESKTOP_MIN_WIDTH) return COMPACT_DESKTOP_LIST_WIDTH;
  return DEFAULT_LIST_WIDTH;
}

export function chatColumnMinWidth() {
  return CHAT_COLUMN_MIN_WIDTH;
}

export function composerCountVisible(n, max = 2000) {
  const count = Number(n) || 0;
  const cap = Number(max) || 2000;
  return count >= Math.floor(cap * COMPOSER_COUNT_NEAR_RATIO) || count > cap;
}

export function sameSender(previous, current) {
  if (!previous || !current) return false;
  return previous.role === current.role;
}

export function isVisibleTranscriptMessage(m) {
  if (!m) return false;
  if (m.status === "streaming" && !String(m.text || "").trim()) return false;
  return true;
}

function nearestVisible(messages, from, step) {
  for (let i = from; i >= 0 && i < messages.length; i += step) {
    if (isVisibleTranscriptMessage(messages[i])) return messages[i];
  }
  return null;
}

export function transcriptGroupFlags(messages, index) {
  const list = messages || [];
  const current = list[index];
  const isMe = current?.role === "me";
  if (!isVisibleTranscriptMessage(current)) {
    return {
      isGroupStart: false,
      isGroupEnd: false,
      showAvatar: false,
      showName: false,
      showTime: false,
      showUserAvatar: false,
    };
  }
  const prev = nearestVisible(list, index - 1, -1);
  const next = nearestVisible(list, index + 1, 1);
  const groupedWithPrev = sameSender(prev, current);
  const groupedWithNext = sameSender(current, next);
  return {
    isGroupStart: !groupedWithPrev,
    isGroupEnd: !groupedWithNext,
    showAvatar: !isMe && !groupedWithPrev,
    showName: !isMe && !groupedWithPrev,
    showTime: !groupedWithNext,
    showUserAvatar: false,
  };
}
