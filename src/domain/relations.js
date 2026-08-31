// ============================================================
//  EchoChat Rebuild · Relationship / Affinity
//  亲密度、连续聊天天数、语气变化
// ============================================================

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { todayStr, dayDiff } from "../core/utils.js";

function ensureObj(v) {
  return v && typeof v === "object" ? v : {};
}

export function loadRelations() {
  return ensureObj(store.getState().relations);
}

export function saveRelations(map) {
  store.set((s) => ({ ...s, relations: ensureObj(map) }));
}

function getOrCreate(roleId) {
  const map = loadRelations();
  if (!map[roleId]) {
    map[roleId] = {
      affinity: 0,
      streak: 0,
      lastChatDate: "",
      totalTurns: 0,
      lastProactiveAt: 0,
    };
  }
  return map[roleId];
}

export function recordCheckIn(roleId) {
  if (!roleId) return;
  const map = { ...loadRelations() };
  const r = { ...getOrCreate(roleId) };
  const today = todayStr();
  if (r.lastChatDate === today) {
    // already checked in
  } else if (r.lastChatDate && dayDiff(r.lastChatDate, today) === 1) {
    r.streak = (r.streak || 0) + 1;
  } else {
    r.streak = 1;
  }
  r.lastChatDate = today;
  map[roleId] = r;
  saveRelations(map);
  events.emit(EVT.RELATION_UPDATE, { roleId, relation: r });
}

export function recordChatTurn(roleId, opts = {}) {
  if (!roleId) return;
  const map = { ...loadRelations() };
  const r = { ...getOrCreate(roleId) };
  r.totalTurns = (r.totalTurns || 0) + 1;
  const delta = opts.delta ?? 1;
  r.affinity = Math.min(100, Math.max(0, (r.affinity || 0) + delta));
  map[roleId] = r;
  saveRelations(map);
  recordCheckIn(roleId);
  events.emit(EVT.RELATION_UPDATE, { roleId, relation: r });
}

export function getAffinity(roleId) {
  const r = loadRelations()[roleId] || {};
  return {
    affinity: r.affinity || 0,
    streak: r.streak || 0,
    lastChatDate: r.lastChatDate || "",
    totalTurns: r.totalTurns || 0,
    lastProactiveAt: r.lastProactiveAt || 0,
  };
}

export function markProactiveSent(roleId) {
  const map = { ...loadRelations() };
  const r = { ...getOrCreate(roleId) };
  r.lastProactiveAt = Date.now();
  map[roleId] = r;
  saveRelations(map);
}

export function shouldConsiderProactive(roleId) {
  const r = getAffinity(roleId);
  if ((r.affinity || 0) < 20) return false;
  const since = Date.now() - (r.lastProactiveAt || 0);
  return since > 6 * 3600 * 1000; // 6h
}

export function rollProactive(roleId) {
  if (!shouldConsiderProactive(roleId)) return false;
  return Math.random() < 0.15;
}

export function importRelations(obj) {
  if (!obj || typeof obj !== "object") return;
  saveRelations({ ...loadRelations(), ...obj });
}

export const EchoRelations = {
  loadRelations,
  saveRelations,
  recordCheckIn,
  recordChatTurn,
  getAffinity,
  markProactiveSent,
  shouldConsiderProactive,
  rollProactive,
  importRelations,
};
