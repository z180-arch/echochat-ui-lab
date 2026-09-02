// ============================================================
//  EchoChat Rebuild · Relations (从 baseline 迁移为 ES Module)
//  关系养成：签到/聊天轮次/亲密度计算/主动消息触发
//  改进：支持 roleId（稳定 ID）
// ============================================================

import { storage, KEYS } from "../core/storage.js";
import { todayStr, dayDiff } from "../core/utils.js";

const AFFINITY_THRESHOLD = 5;
const PROACTIVE_CHANCE = 0.3;
const DAY_MS = 86400000;

function defaultStore() {
  return { version: 2, checkIn: { lastDate: "", streak: 0 }, roles: {} };
}

export function loadRelations() {
  try {
    const d = storage.get(KEYS.RELATIONS, null);
    if (!d) return defaultStore();
    if (!d.checkIn || typeof d.checkIn !== "object") d.checkIn = { lastDate: "", streak: 0 };
    if (!d.roles || typeof d.roles !== "object") d.roles = {};
    d.version = 2;
    return d;
  } catch (e) {
    return defaultStore();
  }
}

export function saveRelations(data) {
  const d = data || loadRelations();
  d.version = 2;
  return storage.set(KEYS.RELATIONS, d);
}

function ensureRole(st, roleId, roleName) {
  if (!roleId) return null;
  if (!st.roles[roleId]) {
    st.roles[roleId] = {
      roleName: roleName || "角色",
      firstSeenAt: Date.now(),
      lastChatAt: 0,
      lastChatDay: "",
      streakDays: 0,
      chatTurns: 0,
      lastProactiveAt: 0,
      brief: "",
      events: [],
      lastStage: "none",
    };
  } else if (roleName) {
    st.roles[roleId].roleName = roleName;
  }
  const role = st.roles[roleId];
  if (!Array.isArray(role.events)) role.events = [];
  if (typeof role.brief !== "string") role.brief = role.brief ? String(role.brief) : "";
  if (!role.lastStage) role.lastStage = "none";
  return role;
}

function pushEvent(role, type, text, ts) {
  if (!role || !text) return;
  if (!Array.isArray(role.events)) role.events = [];
  role.events.push({ type, text, at: ts != null ? ts : Date.now() });
  if (role.events.length > 12) role.events = role.events.slice(-12);
  role.brief = text;
}

export function recordRelationshipEvent(roleId, { type = "note", text, at, roleName } = {}) {
  if (!roleId || !String(text || "").trim()) return null;
  const st = loadRelations();
  const role = ensureRole(st, roleId, roleName);
  if (!role) return null;
  pushEvent(role, type, String(text).trim(), at != null ? at : Date.now());
  saveRelations(st);
  return role;
}

export function recordCheckIn(now) {
  const st = loadRelations();
  const today = todayStr(now);
  const last = st.checkIn.lastDate || "";
  if (last === today) return { streak: st.checkIn.streak, already: true };
  const diff = last ? dayDiff(last, today) : 999;
  if (diff === 1) st.checkIn.streak = (Number(st.checkIn.streak) || 0) + 1;
  else st.checkIn.streak = 1;
  st.checkIn.lastDate = today;
  saveRelations(st);
  return { streak: st.checkIn.streak, already: false };
}

export function recordChatTurn(roleId, roleName, now) {
  if (!roleId) return null;
  const st = loadRelations();
  const role = ensureRole(st, roleId, roleName);
  const ts = now != null ? now : Date.now();
  const today = todayStr(ts);
  const wasTurns = Number(role.chatTurns) || 0;
  const prevStage = role.lastStage || "none";
  role.chatTurns = wasTurns + 1;
  role.lastChatAt = ts;
  if (role.lastChatDay === today) {
    /* same day */
  } else if (role.lastChatDay && dayDiff(role.lastChatDay, today) === 1) {
    role.streakDays = (Number(role.streakDays) || 0) + 1;
  } else {
    role.streakDays = 1;
  }
  role.lastChatDay = today;
  if (!role.firstSeenAt) role.firstSeenAt = ts;
  if (wasTurns === 0) {
    pushEvent(role, "first_meeting", "第一次开口", ts);
  }
  saveRelations(st);
  const next = getAffinity(roleId);
  const saved = loadRelations();
  const updated = saved.roles[roleId];
  if (updated) {
    if (prevStage !== "none" && next.stage !== prevStage && next.stage !== "none") {
      pushEvent(updated, "stage", `关系变成「${next.stageLabel}」`, ts);
    }
    updated.lastStage = next.stage;
    saveRelations(saved);
  }
  return updated || role;
}

function momentEngagement(roleId, momentsList) {
  let likes = 0,
    comments = 0;
  (momentsList || []).forEach((m) => {
    if (!m || (m.roleId !== roleId && m.roleKey !== roleId)) return;
    likes += Number(m.likes) || 0;
    comments += (m.comments && m.comments.length) || 0;
  });
  return { likes, comments };
}

export function getAffinity(roleId, opts) {
  const st = loadRelations();
  const role = (roleId && st.roles[roleId]) || null;
  const eng = momentEngagement(roleId, (opts && opts.moments) || []);
  const turns = role ? (Number(role.chatTurns) || 0) : 0;
  const checkBonus = Math.min(30, Number(st.checkIn.streak) || 0) * 0.2;
  const raw = turns * 0.1 + eng.likes * 0.5 + eng.comments * 1 + checkBonus;
  const score = Math.round(raw * 10) / 10;
  const streakDays = role ? (Number(role.streakDays) || 0) : 0;
  const knownDays =
    role && role.firstSeenAt ? Math.max(1, Math.floor((Date.now() - role.firstSeenAt) / DAY_MS) + 1) : 1;
  let toneHint = "自然平和";
  if (score >= 20) toneHint = "更亲近、更熟络";
  else if (score >= 10) toneHint = "略亲近";
  else if (score < 3) toneHint = "略疏离、礼貌";
  const hasHistory = !!(role && turns > 0);
  let stage = "none";
  let stageLabel = "还没有聊过";
  if (hasHistory) {
    if (score >= 20 || turns >= 40 || streakDays >= 7) {
      stage = "close";
      stageLabel = "已经熟络";
    } else if (score >= 8 || turns >= 12) {
      stage = "familiar";
      stageLabel = "渐渐熟悉";
    } else {
      stage = "warming";
      stageLabel = "刚刚认识";
    }
  }
  const events = role && Array.isArray(role.events) ? role.events : [];
  const last = events.length ? events[events.length - 1] : null;
  return {
    score,
    turns,
    likes: eng.likes,
    comments: eng.comments,
    checkInStreak: Number(st.checkIn.streak) || 0,
    checkBonus: Math.round(checkBonus * 10) / 10,
    streakDays,
    knownDays,
    lastChatAt: role ? Number(role.lastChatAt) || 0 : 0,
    lastProactiveAt: role ? Number(role.lastProactiveAt) || 0 : 0,
    toneHint,
    threshold: AFFINITY_THRESHOLD,
    hasHistory,
    stage,
    stageLabel,
    brief: role && role.brief ? String(role.brief) : "",
    lastEvent: last ? String(last.text || "") : "",
    events: events.slice(-5),
  };
}

export function markProactiveSent(roleId, now) {
  const st = loadRelations();
  const role = ensureRole(st, roleId, null);
  if (!role) return false;
  role.lastProactiveAt = now != null ? now : Date.now();
  saveRelations(st);
  return true;
}

export function shouldConsiderProactive(roleId, opts) {
  const a = getAffinity(roleId, opts);
  if (a.score <= AFFINITY_THRESHOLD) return { ok: false, reason: "affinity" };
  if (!a.lastChatAt) return { ok: false, reason: "never" };
  const gap = Date.now() - a.lastChatAt;
  if (gap < DAY_MS) return { ok: false, reason: "recent" };
  if (a.lastProactiveAt && Date.now() - a.lastProactiveAt < DAY_MS) {
    return { ok: false, reason: "cooldown" };
  }
  return { ok: true, affinity: a, gap };
}

export function rollProactive(roleId, opts, rng) {
  const gate = shouldConsiderProactive(roleId, opts);
  if (!gate.ok) return Object.assign({ roll: false }, gate);
  const r = typeof rng === "function" ? rng() : Math.random();
  return {
    ok: true,
    roll: r < PROACTIVE_CHANCE,
    r,
    chance: PROACTIVE_CHANCE,
    affinity: gate.affinity,
    gap: gate.gap,
  };
}

export function importRelations(raw, mode) {
  let incoming;
  try {
    incoming = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    return { ok: false, error: "parse" };
  }
  if (!incoming || typeof incoming !== "object") return { ok: false, error: "shape" };
  const replace = mode === "replace";
  const st = replace ? defaultStore() : loadRelations();
  if (incoming.checkIn && typeof incoming.checkIn === "object") {
    if (replace || !st.checkIn.lastDate) st.checkIn = Object.assign({}, st.checkIn, incoming.checkIn);
  }
  const roles = incoming.roles && typeof incoming.roles === "object" ? incoming.roles : {};
  Object.keys(roles).forEach((k) => {
    if (replace || !st.roles[k]) st.roles[k] = roles[k];
  });
  saveRelations(st);
  return { ok: true };
}

export const EchoRelations = {
  loadRelations,
  saveRelations,
  defaultStore,
  recordCheckIn,
  recordChatTurn,
  recordRelationshipEvent,
  getAffinity,
  shouldConsiderProactive,
  rollProactive,
  markProactiveSent,
  momentEngagement,
  importRelations,
  todayStr,
  dayDiff,
};
