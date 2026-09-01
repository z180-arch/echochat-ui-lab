// ============================================================
//  EchoChat Rebuild · Moments (从 baseline 迁移为 ES Module)
//  角色动态流 CRUD + 点赞/评论 + 摘要解析
//  改进：支持 roleId（稳定 ID）
// ============================================================

import { storage, KEYS } from "../core/storage.js";
import { uid, todayStr } from "../core/utils.js";

const MAX_MOMENTS = 200;
const CONTENT_SOFT_CAP = 80;

function defaultStore() {
  return { version: 2, moments: [] };
}

export function loadMoments() {
  try {
    const d = storage.get(KEYS.MOMENTS, null);
    if (!d) return defaultStore();
    if (!Array.isArray(d.moments)) d.moments = [];
    d.version = 2;
    return d;
  } catch (e) {
    return defaultStore();
  }
}

export function saveMoments(data) {
  const d = data || loadMoments();
  d.version = 2;
  if (!Array.isArray(d.moments)) d.moments = [];
  if (d.moments.length > MAX_MOMENTS) d.moments = d.moments.slice(-MAX_MOMENTS);
  return storage.set(KEYS.MOMENTS, d);
}

function normalizeMoment(partial) {
  const p = partial || {};
  return {
    id: p.id || uid(),
    roleId: p.roleId || p.roleKey || "",
    roleKey: p.roleKey || "",
    roleName: String(p.roleName || "角色"),
    content: String(p.content || "").trim().slice(0, CONTENT_SOFT_CAP),
    image: p.image == null ? null : p.image,
    createdAt: Number(p.createdAt) || Date.now(),
    likes: Math.max(0, Number(p.likes) || 0),
    likedByUser: !!p.likedByUser,
    likeNames: Array.isArray(p.likeNames) ? p.likeNames.map(String) : [],
    comments: Array.isArray(p.comments)
      ? p.comments
          .map((c) => ({
            id: c.id || uid(),
            from: c.from === "her" ? "her" : "me",
            text: String(c.text || "").trim(),
            createdAt: Number(c.createdAt) || Date.now(),
          }))
          .filter((c) => c.text)
      : [],
    source: ["manual", "auto_summary", "memory", "candidate", "reconstruction"].includes(p.source)
      ? p.source
      : "auto_summary",
    relatedMemoryId: p.relatedMemoryId != null ? String(p.relatedMemoryId) : null,
  };
}

export function listMoments(filterRoleId) {
  const all = loadMoments().moments.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (!filterRoleId || filterRoleId === "all") return all;
  return all.filter((m) => m.roleId === filterRoleId || m.roleKey === filterRoleId);
}

export function listRoleOptions() {
  const map = new Map();
  loadMoments().moments.forEach((m) => {
    const id = m.roleId || m.roleKey;
    if (!id) return;
    if (!map.has(id)) map.set(id, m.roleName || "角色");
  });
  return [...map.entries()].map(([roleId, roleName]) => ({ roleId, roleName }));
}

export function getMoment(id) {
  return loadMoments().moments.find((m) => m.id === id) || null;
}

export function addMoment(partial) {
  const m = normalizeMoment(partial);
  if (!m.content || !m.roleId) return null;
  const st = loadMoments();
  st.moments.push(m);
  saveMoments(st);
  return m;
}

export function updateMoment(id, patch) {
  const st = loadMoments();
  const i = st.moments.findIndex((m) => m.id === id);
  if (i < 0) return null;
  st.moments[i] = normalizeMoment(Object.assign({}, st.moments[i], patch, { id }));
  saveMoments(st);
  return st.moments[i];
}

export function deleteMoment(id) {
  const st = loadMoments();
  const n = st.moments.length;
  st.moments = st.moments.filter((m) => m.id !== id);
  if (st.moments.length === n) return false;
  saveMoments(st);
  return true;
}

export function toggleLike(id, userLabel) {
  const st = loadMoments();
  const m = st.moments.find((x) => x.id === id);
  if (!m) return null;
  const label = String(userLabel || "我");
  if (m.likedByUser) {
    m.likedByUser = false;
    m.likes = Math.max(0, (Number(m.likes) || 1) - 1);
    m.likeNames = (m.likeNames || []).filter((n) => n !== label);
  } else {
    m.likedByUser = true;
    m.likes = (Number(m.likes) || 0) + 1;
    m.likeNames = m.likeNames || [];
    if (!m.likeNames.includes(label)) m.likeNames.push(label);
  }
  saveMoments(st);
  return m;
}

export function addComment(id, from, text) {
  const st = loadMoments();
  const m = st.moments.find((x) => x.id === id);
  if (!m) return null;
  const t = String(text || "").trim();
  if (!t) return null;
  const c = {
    id: uid(),
    from: from === "her" ? "her" : "me",
    text: t.slice(0, 200),
    createdAt: Date.now(),
  };
  m.comments = m.comments || [];
  m.comments.push(c);
  saveMoments(st);
  return { moment: m, comment: c };
}

export function parseSummaryAndMoment(raw) {
  const text = String(raw || "").replace(/\[emotion:[a-z]+\]/gi, "").trim();
  if (!text) return { summary: "", moment: "" };
  const dyn =
    text.match(/【\s*动态\s*】\s*([\s\S]*)$/i) ||
    text.match(/\[moment\]\s*([\s\S]*)$/i) ||
    text.match(/动态[：:]\s*([^\n【\[]{2,80})/i);
  const sum =
    text.match(/【\s*摘要\s*】\s*([\s\S]*?)(?=【\s*动态\s*】|\[moment\]|$)/i) ||
    text.match(/\[summary\]\s*([\s\S]*?)(?=【\s*动态\s*】|\[moment\]|$)/i);
  let summary = sum ? sum[1].trim() : "";
  let moment = dyn ? dyn[1].trim() : "";
  if (!summary && !moment) summary = text;
  if (!summary && moment) summary = "";
  moment = moment.replace(/\n+/g, " ").trim().slice(0, CONTENT_SOFT_CAP);
  return { summary, moment };
}

export function exportMoments() {
  return JSON.stringify(loadMoments(), null, 2);
}

export function importMoments(raw, mode) {
  let incoming;
  try {
    incoming = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    return { ok: false, error: "parse" };
  }
  if (!incoming || typeof incoming !== "object") return { ok: false, error: "shape" };
  const list = Array.isArray(incoming.moments) ? incoming.moments : Array.isArray(incoming) ? incoming : null;
  if (!list) return { ok: false, error: "shape" };
  const replace = mode === "replace";
  const st = replace ? defaultStore() : loadMoments();
  const ids = new Set(st.moments.map((m) => m.id));
  list.forEach((item) => {
    const m = normalizeMoment(item);
    if (!m.content || !m.roleId) return;
    if (ids.has(m.id)) {
      if (replace) {
        const i = st.moments.findIndex((x) => x.id === m.id);
        if (i >= 0) st.moments[i] = m;
      }
      return;
    }
    ids.add(m.id);
    st.moments.push(m);
  });
  saveMoments(st);
  return { ok: true, count: st.moments.length };
}

export const EchoMoments = {
  defaultStore,
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
  normalizeMoment,
};
