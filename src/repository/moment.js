/**
 * MomentRepository + MomentCommentRepository + MomentReactionRepository (Legacy Implementation)
 *
 * Phase 1 过渡实现：包装现有 localStorage MOMENTS。
 * Phase 11 将扩展为独立的 Moment/Comment/Reaction 存储。
 */

import { legacyAdapter } from "./legacy-adapter.js";

function momentToV2(m) {
  return {
    id: m.id,
    characterId: m.roleId,
    authorType: m.authorType || "character",
    content: m.content || "",
    media: m.image ? [m.image] : [],
    createdAt: m.createdAt || m.time || Date.now(),
    visibility: m.visibility || "public",
    likeCount: m.likes?.length || 0,
    commentCount: m.comments?.length || 0,
    socialContext: m.socialContext || {},
  };
}

export const MomentRepository = {
  async findById(id) {
    const m = legacyAdapter.getAllMoments().find((x) => x.id === id);
    return m ? momentToV2(m) : null;
  },

  async findAll(options = {}) {
    let moments = legacyAdapter.getAllMoments();
    if (options.characterId) {
      moments = moments.filter((m) => m.roleId === options.characterId);
    }
    moments = [...moments].sort((a, b) => (b.createdAt || b.time || 0) - (a.createdAt || a.time || 0));

    const page = options.page || 1;
    const pageSize = options.pageSize || 20;
    const total = moments.length;
    const start = (page - 1) * pageSize;
    const items = moments.slice(start, start + pageSize).map(momentToV2);

    return { items, total, page, pageSize, hasMore: start + pageSize < total };
  },

  async create(moment) {
    const m = {
      id: moment.id || `mom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roleId: moment.characterId,
      content: moment.content || "",
      image: moment.media?.[0] || null,
      likes: [],
      comments: [],
      createdAt: Date.now(),
      authorType: moment.authorType || "character",
      visibility: moment.visibility || "public",
    };
    const moments = legacyAdapter.getAllMoments();
    moments.push(m);
    legacyAdapter.setAllMoments(moments);
    return momentToV2(m);
  },

  async update(id, updates) {
    const moments = legacyAdapter.getAllMoments();
    const idx = moments.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    moments[idx] = { ...moments[idx], ...updates };
    if (updates.content) moments[idx].content = updates.content;
    legacyAdapter.setAllMoments(moments);
    return momentToV2(moments[idx]);
  },

  async delete(id) {
    const moments = legacyAdapter.getAllMoments().filter((m) => m.id !== id);
    legacyAdapter.setAllMoments(moments);
  },
};

// ============================================================
//  MomentCommentRepository
// ============================================================

export const MomentCommentRepository = {
  async findByMomentId(momentId) {
    const m = legacyAdapter.getAllMoments().find((x) => x.id === momentId);
    return (m?.comments || []).map((c, i) => ({
      id: c.id || `cmt-${i}`,
      momentId,
      authorType: c.authorType || "user",
      characterId: c.characterId || null,
      content: c.content || c.text || "",
      createdAt: c.createdAt || c.time || Date.now(),
    }));
  },

  async create(comment) {
    const moments = legacyAdapter.getAllMoments();
    const idx = moments.findIndex((m) => m.id === comment.momentId);
    if (idx === -1) throw new Error("Moment not found");
    const c = {
      id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: comment.content,
      authorType: comment.authorType || "user",
      characterId: comment.characterId || null,
      createdAt: Date.now(),
    };
    moments[idx].comments = moments[idx].comments || [];
    moments[idx].comments.push(c);
    legacyAdapter.setAllMoments(moments);
    return { ...c, momentId: comment.momentId };
  },

  async delete(id) {
    const moments = legacyAdapter.getAllMoments();
    for (const m of moments) {
      const before = m.comments?.length || 0;
      m.comments = (m.comments || []).filter((c) => c.id !== id);
      if (m.comments.length !== before) {
        legacyAdapter.setAllMoments(moments);
        return;
      }
    }
  },
};

// ============================================================
//  MomentReactionRepository
// ============================================================

export const MomentReactionRepository = {
  async findByMomentId(momentId) {
    const m = legacyAdapter.getAllMoments().find((x) => x.id === momentId);
    return (m?.likes || []).map((l) => ({
      id: typeof l === "string" ? l : l.id,
      momentId,
      authorType: typeof l === "string" ? "user" : l.authorType || "user",
      reaction: "like",
      createdAt: typeof l === "string" ? Date.now() : l.createdAt || Date.now(),
    }));
  },

  async toggle(reaction) {
    const moments = legacyAdapter.getAllMoments();
    const idx = moments.findIndex((m) => m.id === reaction.momentId);
    if (idx === -1) throw new Error("Moment not found");
    moments[idx].likes = moments[idx].likes || [];
    const likeIdx = moments[idx].likes.findIndex((l) =>
      typeof l === "string" ? l === reaction.userId : l.userId === reaction.userId
    );
    let liked;
    if (likeIdx === -1) {
      moments[idx].likes.push({ userId: reaction.userId, createdAt: Date.now() });
      liked = true;
    } else {
      moments[idx].likes.splice(likeIdx, 1);
      liked = false;
    }
    legacyAdapter.setAllMoments(moments);
    return { liked, count: moments[idx].likes.length };
  },

  async countByMomentId(momentId) {
    const m = legacyAdapter.getAllMoments().find((x) => x.id === momentId);
    return m?.likes?.length || 0;
  },
};
