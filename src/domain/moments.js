// ============================================================
//  EchoChat Rebuild · Character Moments
//  角色动态流：发布 / 点赞 / 评论 / 导入导出
// ============================================================

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { uid } from "../core/utils.js";
import { getRoleId, getRoleName, getRoleAvatar } from "./persona.js";

const KEY = "moments";

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

export function loadMoments() {
  return ensureArray(store.getState().moments);
}

export function saveMoments(list) {
  store.set((s) => ({ ...s, moments: ensureArray(list) }));
}

export function listMoments(limit) {
  const list = loadMoments().slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return limit ? list.slice(0, limit) : list;
}

export function listRoleOptions() {
  const chats = store.getState().chats || [];
  const seen = new Set();
  const out = [];
  for (const c of chats) {
    const id = getRoleId(c);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ roleId: id, name: getRoleName(c), avatar: getRoleAvatar(c) });
  }
  return out;
}

export function getMoment(id) {
  return loadMoments().find((m) => m.id === id) || null;
}

export function addMoment(roleId, content, opts = {}) {
  if (!roleId || !content) return null;
  const item = {
    id: uid(),
    roleId,
    roleName: opts.roleName || "",
    avatar: opts.avatar || "",
    content: String(content).trim(),
    likes: 0,
    liked: false,
    comments: [],
    source: opts.source || "manual",
    createdAt: Date.now(),
  };
  const list = [item, ...loadMoments()];
  saveMoments(list);
  events.emit(EVT.MOMENT_ADDED, { roleId, content: item.content });
  return item;
}

export function updateMoment(id, patch) {
  const list = loadMoments().map((m) => (m.id === id ? { ...m, ...patch } : m));
  saveMoments(list);
}

export function deleteMoment(id) {
  saveMoments(loadMoments().filter((m) => m.id !== id));
}

export function toggleLike(id) {
  const m = getMoment(id);
  if (!m) return;
  const liked = !m.liked;
  updateMoment(id, {
    liked,
    likes: Math.max(0, (m.likes || 0) + (liked ? 1 : -1)),
  });
}

export function addComment(id, text) {
  const m = getMoment(id);
  if (!m || !text) return;
  const comments = [...(m.comments || []), { id: uid(), text: String(text).trim(), createdAt: Date.now() }];
  updateMoment(id, { comments });
}

export function parseSummaryAndMoment(text) {
  const summaries = [];
  let moment = "";
  const lines = String(text || "").split(/\n/);
  let mode = "";
  for (const line of lines) {
    const t = line.trim();
    if (/^SUMMARY[:：]/i.test(t)) {
      mode = "s";
      continue;
    }
    if (/^MOMENT[:：]/i.test(t)) {
      mode = "m";
      continue;
    }
    if (mode === "s" && t.startsWith("-")) {
      summaries.push(t.replace(/^-\s*/, ""));
    } else if (mode === "m" && t) {
      moment += (moment ? "\n" : "") + t;
    }
  }
  return { summaries, moment: moment.trim() };
}

export function exportMoments() {
  return JSON.stringify({ version: 1, moments: loadMoments() }, null, 2);
}

export function importMoments(json) {
  try {
    const obj = typeof json === "string" ? JSON.parse(json) : json;
    const list = ensureArray(obj.moments || obj);
    saveMoments([...list, ...loadMoments()]);
    return list.length;
  } catch (e) {
    return 0;
  }
}

export const EchoMoments = {
  loadMoments,
  saveMoments,
  listMoments,
  listRoleOptions,
  getMoment,
  addMoment,
  updateMoment,
  deleteMoment,
  toggleLike,
  addComment,
  parseSummaryAndMoment,
  exportMoments,
  importMoments,
};
