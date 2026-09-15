// ============================================================
//  EchoChat Rebuild · Relations (从 baseline 迁移为 ES Module)
//  关系养成：签到/聊天轮次/亲密度计算/主动消息触发
//  改进：支持 roleId（稳定 ID）
// ============================================================

import { storage, KEYS } from "../core/storage.js";
import { todayStr, dayDiff } from "../core/utils.js";
import { getStorageHooks } from "../repository/storage-hooks.js";
import {
  parseJsonSafe,
  isEntityMigrated,
  markEntityMigrated,
  markEntityFailed,
} from "../repository/persistence.js";

const AFFINITY_THRESHOLD = 5;
const PROACTIVE_CHANCE = 0.3;
const DAY_MS = 86400000;
const ENTITY = "relationships";
const META_ID = "__echo_rel_meta";

let cache = null;
let persistChain = Promise.resolve();
let usingCanonical = false;
let mutationGen = 0;

function defaultStore() {
  return { version: 2, checkIn: { lastDate: "", streak: 0 }, roles: {} };
}

function ensureShape(data) {
  const d = data && typeof data === "object" ? data : defaultStore();
  if (!d.checkIn || typeof d.checkIn !== "object") d.checkIn = { lastDate: "", streak: 0 };
  if (!d.roles || typeof d.roles !== "object") d.roles = {};
  d.version = 2;
  return d;
}

function snapshotIsPopulated(data) {
  const d = ensureShape(data);
  if (Object.keys(d.roles).length) return true;
  if (d.checkIn.lastDate || Number(d.checkIn.streak) > 0) return true;
  return false;
}

function toDexieRows(data) {
  const d = ensureShape(data);
  const rows = Object.entries(d.roles).map(([roleId, role]) => ({
    id: `rel-${roleId}`,
    characterId: roleId,
    status: "active",
    userId: "user",
    roleName: role.roleName,
    firstSeenAt: role.firstSeenAt,
    lastChatAt: role.lastChatAt,
    lastChatDay: role.lastChatDay,
    streakDays: role.streakDays,
    chatTurns: role.chatTurns,
    lastProactiveAt: role.lastProactiveAt,
    brief: role.brief,
    events: Array.isArray(role.events) ? role.events : [],
    lastStage: role.lastStage,
    updatedAt: Number(role.lastChatAt || role.firstSeenAt || Date.now()),
    createdAt: Number(role.firstSeenAt || Date.now()),
  }));
  rows.push({
    id: META_ID,
    characterId: META_ID,
    status: "meta",
    checkIn: d.checkIn,
    version: 2,
    updatedAt: Date.now(),
    createdAt: Date.now(),
  });
  return rows;
}

function fromDexieRows(rows) {
  const d = defaultStore();
  for (const row of rows || []) {
    if (!row) continue;
    if (row.id === META_ID || row.characterId === META_ID || row.status === "meta") {
      if (row.checkIn && typeof row.checkIn === "object") d.checkIn = row.checkIn;
      continue;
    }
    const roleId = row.characterId || String(row.id || "").replace(/^rel-/, "");
    if (!roleId || roleId === META_ID) continue;
    d.roles[roleId] = {
      roleName: row.roleName || "角色",
      firstSeenAt: row.firstSeenAt || row.createdAt || Date.now(),
      lastChatAt: row.lastChatAt || 0,
      lastChatDay: row.lastChatDay || "",
      streakDays: row.streakDays || 0,
      chatTurns: row.chatTurns || row.interactionFrequency || 0,
      lastProactiveAt: row.lastProactiveAt || 0,
      brief: typeof row.brief === "string" ? row.brief : "",
      events: Array.isArray(row.events) ? row.events : [],
      lastStage: row.lastStage || "none",
    };
  }
  return ensureShape(d);
}

function looksLossyRelationRows(rows) {
  const roles = (rows || []).filter((r) => r && r.id !== META_ID && r.status !== "meta");
  if (!roles.length) return false;
  return roles.every((r) => r.events == null && r.brief == null && r.chatTurns == null);
}

function mergeRelations(canonical, legacy) {
  const c = ensureShape(canonical);
  const l = ensureShape(legacy);
  const roles = { ...l.roles };
  for (const [id, role] of Object.entries(c.roles)) {
    const other = roles[id];
    if (!other) {
      roles[id] = role;
      continue;
    }
    const cTurns = Number(role.chatTurns) || 0;
    const lTurns = Number(other.chatTurns) || 0;
    const pick = cTurns >= lTurns ? role : other;
    const otherOne = pick === role ? other : role;
    const seen = new Set((pick.events || []).map((e) => `${e.type}|${e.at}|${e.text}`));
    const events = (pick.events || []).slice();
    (otherOne.events || []).forEach((e) => {
      const key = `${e.type}|${e.at}|${e.text}`;
      if (!seen.has(key)) {
        seen.add(key);
        events.push(e);
      }
    });
    roles[id] = {
      ...otherOne,
      ...pick,
      events,
      brief: pick.brief || otherOne.brief || "",
    };
  }
  const cDate = c.checkIn.lastDate || "";
  const lDate = l.checkIn.lastDate || "";
  return ensureShape({
    version: 2,
    roles,
    checkIn: cDate >= lDate ? c.checkIn : l.checkIn,
  });
}

function parseLegacyRelations() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEYS.RELATIONS) : null;
    const d = parseJsonSafe(raw, null);
    if (!d) return defaultStore();
    return ensureShape(d);
  } catch {
    return defaultStore();
  }
}

async function canonicalAvailable() {
  try {
    const hooks = getStorageHooks();
    return !!(hooks.relationship && typeof hooks.relationship.loadSnapshot === "function" && (await hooks.isAvailable()));
  } catch {
    return false;
  }
}

async function loadCanonicalRelations() {
  const rows = await getStorageHooks().relationship.loadSnapshot();
  return fromDexieRows(rows || []);
}

async function replaceCanonicalRelations(data) {
  await getStorageHooks().relationship.replaceSnapshot(toDexieRows(data));
}

async function flushPersist() {
  const snapshot = cache || defaultStore();
  if (await canonicalAvailable()) {
    await replaceCanonicalRelations(snapshot);
    usingCanonical = true;
    return;
  }
  storage.set(KEYS.RELATIONS, snapshot);
}

function schedulePersist() {
  persistChain = persistChain.then(flushPersist).catch((err) => {
    console.warn("[relations] persist failed:", err && err.message ? err.message : err);
    try {
      storage.set(KEYS.RELATIONS, cache || defaultStore());
    } catch {
      // ignore
    }
  });
  return persistChain;
}

export function loadRelations() {
  if (cache) return cache;
  cache = parseLegacyRelations();
  return cache;
}

export function saveRelations(data) {
  const d = ensureShape(data || loadRelations());
  cache = d;
  mutationGen += 1;
  if (usingCanonical) schedulePersist();
  else storage.set(KEYS.RELATIONS, d);
  return true;
}

export function resetRelationsRuntime() {
  cache = null;
  usingCanonical = false;
  mutationGen = 0;
  persistChain = Promise.resolve();
}

export function flushRelationsPersist() {
  return persistChain;
}

export function deleteRelationsForRole(roleId) {
  if (!roleId) return false;
  const st = loadRelations();
  if (!st.roles[roleId]) return false;
  delete st.roles[roleId];
  saveRelations(st);
  return true;
}

export async function hydrateRelations() {
  const startGen = mutationGen;
  const legacy = parseLegacyRelations();
  if (!(await canonicalAvailable())) {
    cache = legacy;
    usingCanonical = false;
    return { reason: "no-dexie", wrote: false };
  }
  try {
    const rows = await getStorageHooks().relationship.loadSnapshot();
    const lossy = looksLossyRelationRows(rows);
    const canonical = fromDexieRows(rows || []);
    const destPop = snapshotIsPopulated(canonical);
    const srcPop = snapshotIsPopulated(legacy);
    const completed = isEntityMigrated(ENTITY);
    let next;
    let write = false;
    let reason = "fresh";
    if (!destPop && !srcPop) {
      next = defaultStore();
      reason = "fresh";
    } else if (destPop && completed && !lossy) {
      next = canonical;
      reason = "dexie-only";
    } else if (!destPop && srcPop) {
      next = legacy;
      write = true;
      reason = "legacy-only";
    } else if (destPop && !srcPop) {
      next = canonical;
      reason = "dexie-populated";
    } else {
      next = mergeRelations(canonical, legacy);
      write = true;
      reason = "reconcile";
    }
    next = ensureShape(next);
    if (mutationGen !== startGen && cache) {
      next = mergeRelations(next, cache);
      write = true;
    }
    if (write) {
      await replaceCanonicalRelations(next);
      const readback = await loadCanonicalRelations();
      const expectedIds = Object.keys(next.roles);
      const got = new Set(Object.keys(readback.roles));
      if (!expectedIds.every((id) => got.has(id))) throw new Error("relations migrate verify failed");
      next = ensureShape(readback);
    }
    if (reason !== "fresh") markEntityMigrated(ENTITY, { roleCount: Object.keys(next.roles).length, reason });
    cache = next;
    usingCanonical = true;
    return { reason, wrote: write, count: Object.keys(next.roles).length };
  } catch (e) {
    markEntityFailed(ENTITY, e);
    console.warn("[relations] hydrate failed:", e && e.message ? e.message : e);
    cache = cache || legacy;
    usingCanonical = false;
    return { reason: "failed", error: String(e && e.message ? e.message : e), wrote: false };
  }
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
  if (type !== "memory") role.brief = text;
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
  const now = opts?.now != null ? opts.now : Date.now();
  if (a.score <= AFFINITY_THRESHOLD) return { ok: false, reason: "affinity" };
  if (!a.lastChatAt) return { ok: false, reason: "never" };
  const gap = now - a.lastChatAt;
  if (gap < DAY_MS) return { ok: false, reason: "recent" };
  if (a.lastProactiveAt && now - a.lastProactiveAt < DAY_MS) {
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
  hydrateRelations,
  resetRelationsRuntime,
  flushRelationsPersist,
  deleteRelationsForRole,
  todayStr,
  dayDiff,
};
