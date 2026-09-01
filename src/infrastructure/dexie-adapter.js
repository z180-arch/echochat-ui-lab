/**
 * EchoChat Dexie Storage Adapter
 *
 * Phase 2 — Web Storage Migration
 *
 * 实现与 Legacy Adapter 相同的接口，但底层使用 Dexie/IndexedDB。
 * Repository 层可以无缝切换 Adapter，接口不变。
 *
 * 渐进式迁移策略：
 * - Phase 2: 建立 Dexie 数据库 + Adapter + 迁移机制
 * - Phase 3: Messages 迁移到 Dexie（双写过渡）
 * - Phase 4-5: Characters/Conversations 迁移
 * - Phase 6-11: 其他实体逐步迁移
 * - 最终: 移除 localStorage 结构化数据，仅保留小型设置
 */

import { getDb, TABLES } from "./dexie-db.js";

// ============================================================
//  通用 CRUD 辅助函数
// ============================================================

async function table(name) {
  const db = await getDb();
  return db.table(name);
}

async function getAll(name) {
  const t = await table(name);
  return t.toArray();
}

async function getById(name, id) {
  const t = await table(name);
  return t.get(id);
}

async function put(name, record) {
  const t = await table(name);
  await t.put(record);
  return record;
}

async function bulkPut(name, records) {
  const t = await table(name);
  await t.bulkPut(records);
  return records;
}

async function remove(name, id) {
  const t = await table(name);
  await t.delete(id);
}

async function count(name) {
  const t = await table(name);
  return t.count();
}

// ============================================================
//  Messages（Phase 3 核心，优先实现）
// ============================================================

export const dexieMessageAdapter = {
  async findById(id) {
    return getById(TABLES.MESSAGES, id);
  },

  async findByConversationId(conversationId, options = {}) {
    const { page = 1, pageSize = 50, before, after } = options;
    const t = await table(TABLES.MESSAGES);

    let coll = t.where("conversationId").equals(conversationId);

    if (before) {
      coll = coll.and((m) => m.createdAt < before);
    }
    if (after) {
      coll = coll.and((m) => m.createdAt > after);
    }

    const total = await coll.count();
    const chronological = await coll.sortBy("createdAt");
    if (page === 1 && pageSize >= total) {
      return {
        items: chronological,
        total,
        page,
        pageSize,
        hasMore: false,
      };
    }
    const newestFirst = chronological.slice().reverse();
    const start = (page - 1) * pageSize;
    const items = newestFirst.slice(start, start + pageSize).reverse();

    return {
      items,
      total,
      page,
      pageSize,
      hasMore: start + pageSize < total,
    };
  },

  async create(message) {
    const record = {
      id: message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId: message.conversationId,
      parentMessageId: message.parentMessageId || null,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt || Date.now(),
      updatedAt: message.updatedAt || Date.now(),
      status: message.status || "sent",
      metadata: message.metadata || {},
    };
    await put(TABLES.MESSAGES, record);
    return record;
  },

  async update(id, updates) {
    const existing = await getById(TABLES.MESSAGES, id);
    if (!existing) return null;
    const record = { ...existing, ...updates, updatedAt: Date.now() };
    await put(TABLES.MESSAGES, record);
    return record;
  },

  async delete(id) {
    await remove(TABLES.MESSAGES, id);
  },

  async countByConversationId(conversationId) {
    const t = await table(TABLES.MESSAGES);
    return t.where("conversationId").equals(conversationId).count();
  },

  async search(conversationId, query) {
    const t = await table(TABLES.MESSAGES);
    const lower = query.toLowerCase();
    const all = await t.where("conversationId").equals(conversationId).toArray();
    return all.filter((m) => (m.content || "").toLowerCase().includes(lower));
  },

  async findLatest(conversationId) {
    const t = await table(TABLES.MESSAGES);
    const msgs = await t
      .where("conversationId")
      .equals(conversationId)
      .reverse()
      .sortBy("createdAt");
    return msgs[0] || null;
  },

  async findBranches(parentMessageId) {
    const t = await table(TABLES.MESSAGES);
    return t.where("parentMessageId").equals(parentMessageId).toArray();
  },

  async bulkCreate(messages) {
    const records = messages.map((m) => ({
      id: m.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId: m.conversationId,
      parentMessageId: m.parentMessageId || null,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt || Date.now(),
      updatedAt: m.updatedAt || Date.now(),
      status: m.status || "sent",
      metadata: m.metadata || {},
    }));
    await bulkPut(TABLES.MESSAGES, records);
    return records;
  },

  async deleteByConversationId(conversationId) {
    const t = await table(TABLES.MESSAGES);
    return t.where("conversationId").equals(conversationId).delete();
  },
};

// ============================================================
//  Conversations
// ============================================================

export const dexieConversationAdapter = {
  async findById(id) {
    return getById(TABLES.CONVERSATIONS, id);
  },

  async findAll(options = {}) {
    const t = await table(TABLES.CONVERSATIONS);
    let coll = t.toCollection();
    if (options.includeArchived === false) {
      coll = coll.and((c) => c.status !== "archived" && !c.archivedAt);
    }
    return coll.sortBy("updatedAt");
  },

  async findByCharacterId(characterId, options = {}) {
    const t = await table(TABLES.CONVERSATIONS);
    let coll = t.where("characterId").equals(characterId);
    if (options.includeArchived === false) {
      coll = coll.and((c) => c.status !== "archived");
    }
    return coll.sortBy("updatedAt");
  },

  async create(conversation) {
    const record = {
      id: conversation.id || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      characterId: conversation.characterId,
      title: conversation.title || "",
      status: conversation.status || (conversation.archivedAt ? "archived" : "active"),
      config: conversation.config || {},
      messageCount: conversation.messageCount ?? 0,
      lastMessageAt: conversation.lastMessageAt || conversation.createdAt || Date.now(),
      createdAt: conversation.createdAt || Date.now(),
      updatedAt: conversation.updatedAt || Date.now(),
      archivedAt: conversation.archivedAt || null,
    };
    await put(TABLES.CONVERSATIONS, record);
    return record;
  },

  async update(id, updates) {
    const existing = await getById(TABLES.CONVERSATIONS, id);
    if (!existing) return null;
    const record = { ...existing, ...updates, updatedAt: Date.now() };
    await put(TABLES.CONVERSATIONS, record);
    return record;
  },

  async archive(id) {
    return this.update(id, { status: "archived", archivedAt: Date.now() });
  },

  async unarchive(id) {
    return this.update(id, { status: "active", archivedAt: null });
  },

  async delete(id) {
    await remove(TABLES.CONVERSATIONS, id);
  },

  async countByCharacterId(characterId) {
    const t = await table(TABLES.CONVERSATIONS);
    return t.where("characterId").equals(characterId).count();
  },
};

// ============================================================
//  Characters
// ============================================================

export const dexieCharacterAdapter = {
  async findById(id) {
    return getById(TABLES.CHARACTERS, id);
  },

  async findAll(options = {}) {
    const t = await table(TABLES.CHARACTERS);
    let coll = t.toCollection();
    if (!options.includeGuides) {
      coll = coll.and((c) => !c.isGuide);
    }
    if (options.source) {
      coll = coll.and((c) => c.source === options.source);
    }
    return coll.sortBy("createdAt");
  },

  async create(character) {
    const record = {
      id: character.id || `char-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: character.name || "",
      avatar: character.avatar || null,
      identity: character.identity || "",
      personality: character.personality || {},
      appearance: character.appearance || {},
      speakingStyle: character.speakingStyle || {},
      preferences: character.preferences || {},
      source: character.source || "user_created",
      isGuide: character.isGuide || false,
      status: character.status || "active",
      createdAt: character.createdAt || Date.now(),
      updatedAt: character.updatedAt || Date.now(),
    };
    await put(TABLES.CHARACTERS, record);
    return record;
  },

  async update(id, updates) {
    const existing = await getById(TABLES.CHARACTERS, id);
    if (!existing) return null;
    const record = { ...existing, ...updates, updatedAt: Date.now() };
    await put(TABLES.CHARACTERS, record);
    return record;
  },

  async softDelete(id) {
    return this.update(id, { status: "deleted", deletedAt: Date.now() });
  },

  async restore(id) {
    return this.update(id, { status: "active", deletedAt: null });
  },

  async permanentDelete(id) {
    await remove(TABLES.CHARACTERS, id);
  },
};

// ============================================================
//  Memories
// ============================================================

export const dexieMemoryAdapter = {
  async findById(id) {
    return getById(TABLES.MEMORIES, id);
  },

  async findByCharacterId(characterId, options = {}) {
    const t = await table(TABLES.MEMORIES);
    let coll = t.where("characterId").equals(characterId);
    if (options.type) {
      coll = coll.and((m) => m.type === options.type);
    }
    let result = await coll.sortBy("createdAt");
    if (options.limit) result = result.slice(0, options.limit);
    return result;
  },

  async findRelevant(characterId, query = {}) {
    const t = await table(TABLES.MEMORIES);
    const memories = await t
      .where("characterId")
      .equals(characterId)
      .toArray();
    const limit = query.limit || 10;
    return memories
      .sort((a, b) => (b.importance || 5) - (a.importance || 5))
      .slice(0, limit);
  },

  async create(memory) {
    const record = {
      id: memory.id || `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      characterId: memory.characterId,
      type: memory.type || "long_term",
      content: memory.content,
      importance: memory.importance || 5,
      source: memory.source || "manual",
      confidence: memory.confidence ?? 1,
      tags: memory.tags || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await put(TABLES.MEMORIES, record);
    return record;
  },

  async update(id, updates) {
    const existing = await getById(TABLES.MEMORIES, id);
    if (!existing) return null;
    const record = { ...existing, ...updates, updatedAt: Date.now() };
    await put(TABLES.MEMORIES, record);
    return record;
  },

  async delete(id) {
    await remove(TABLES.MEMORIES, id);
  },

  async findDuplicate(characterId, content) {
    const t = await table(TABLES.MEMORIES);
    return t
      .where("characterId")
      .equals(characterId)
      .and((m) => m.content === content)
      .first();
  },

  async countByCharacterId(characterId) {
    const t = await table(TABLES.MEMORIES);
    return t.where("characterId").equals(characterId).count();
  },
};

// ============================================================
//  Relationships
// ============================================================

export const dexieRelationshipAdapter = {
  async findByCharacterId(characterId) {
    const t = await table(TABLES.RELATIONSHIPS);
    return t.where("characterId").equals(characterId).first();
  },

  async create(relationship) {
    const record = {
      id: relationship.id || `rel-${relationship.characterId}`,
      characterId: relationship.characterId,
      userId: relationship.userId || "user",
      type: relationship.type || "friend",
      status: relationship.status || "active",
      affinity: relationship.affinity || 0,
      trust: relationship.trust || 0,
      familiarity: relationship.familiarity || 0,
      intimacy: relationship.intimacy || 0,
      tension: relationship.tension || 0,
      interactionFrequency: relationship.interactionFrequency || 0,
      streakDays: relationship.streakDays || 0,
      lastInteractionAt: relationship.lastInteractionAt || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await put(TABLES.RELATIONSHIPS, record);
    return record;
  },

  async update(characterId, updates) {
    const existing = await this.findByCharacterId(characterId);
    if (!existing) {
      return this.create({ characterId, ...updates });
    }
    const record = { ...existing, ...updates, updatedAt: Date.now() };
    await put(TABLES.RELATIONSHIPS, record);
    return record;
  },

  async block(characterId) {
    return this.update(characterId, { status: "blocked" });
  },

  async unblock(characterId) {
    return this.update(characterId, { status: "active" });
  },

  async reset(characterId) {
    return this.update(characterId, {
      affinity: 0, trust: 0, familiarity: 0, intimacy: 0, tension: 0,
      interactionFrequency: 0, streakDays: 0,
    });
  },
};

// ============================================================
//  Relationship Events
// ============================================================

export const dexieRelationshipEventAdapter = {
  async append(event) {
    const record = {
      id: event.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      relationshipId: event.relationshipId,
      characterId: event.characterId,
      type: event.type,
      delta: event.delta || {},
      reason: event.reason || "",
      source: event.source || "app",
      createdAt: event.timestamp || Date.now(),
    };
    await put(TABLES.RELATIONSHIP_EVENTS, record);
    return record;
  },

  async findByRelationshipId(relationshipId, options = {}) {
    const t = await table(TABLES.RELATIONSHIP_EVENTS);
    let coll = t.where("relationshipId").equals(relationshipId);
    if (options.since) {
      coll = coll.and((e) => e.createdAt > options.since);
    }
    let result = await coll.sortBy("createdAt");
    if (options.limit) result = result.slice(-options.limit);
    return result;
  },

  async countByRelationshipId(relationshipId) {
    const t = await table(TABLES.RELATIONSHIP_EVENTS);
    return t.where("relationshipId").equals(relationshipId).count();
  },

  async rebuildState(relationshipId) {
    const events = await this.findByRelationshipId(relationshipId);
    const state = { affinity: 0, trust: 0, familiarity: 0, intimacy: 0, tension: 0 };
    for (const e of events) {
      if (e.delta) {
        for (const [k, v] of Object.entries(e.delta)) {
          if (typeof state[k] === "number") state[k] += v;
        }
      }
    }
    return state;
  },
};

// ============================================================
//  Moments
// ============================================================

export const dexieMomentAdapter = {
  async findById(id) {
    return getById(TABLES.MOMENTS, id);
  },

  async findAll(options = {}) {
    const t = await table(TABLES.MOMENTS);
    let coll;
    if (options.characterId) {
      coll = t.where("characterId").equals(options.characterId);
    } else {
      coll = t.toCollection();
    }
    const total = await coll.count();
    const sorted = await coll.sortBy("createdAt");
    const page = options.page || 1;
    const pageSize = options.pageSize || 20;
    const start = (page - 1) * pageSize;
    const items = sorted.slice(start, start + pageSize);
    return { items, total, page, pageSize, hasMore: start + pageSize < total };
  },

  async create(moment) {
    const record = {
      id: moment.id || `mom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      characterId: moment.characterId,
      authorType: moment.authorType || "character",
      content: moment.content || "",
      media: moment.media || [],
      visibility: moment.visibility || "public",
      likeCount: 0,
      commentCount: 0,
      socialContext: moment.socialContext || {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await put(TABLES.MOMENTS, record);
    return record;
  },

  async update(id, updates) {
    const existing = await getById(TABLES.MOMENTS, id);
    if (!existing) return null;
    const record = { ...existing, ...updates, updatedAt: Date.now() };
    await put(TABLES.MOMENTS, record);
    return record;
  },

  async delete(id) {
    await remove(TABLES.MOMENTS, id);
  },
};

// ============================================================
//  Moment Comments
// ============================================================

export const dexieMomentCommentAdapter = {
  async findByMomentId(momentId) {
    const t = await table(TABLES.MOMENT_COMMENTS);
    return t.where("momentId").equals(momentId).sortBy("createdAt");
  },

  async create(comment) {
    const record = {
      id: comment.id || `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      momentId: comment.momentId,
      authorType: comment.authorType || "user",
      characterId: comment.characterId || null,
      content: comment.content,
      createdAt: Date.now(),
    };
    await put(TABLES.MOMENT_COMMENTS, record);
    return record;
  },

  async delete(id) {
    await remove(TABLES.MOMENT_COMMENTS, id);
  },
};

// ============================================================
//  Moment Reactions
// ============================================================

export const dexieMomentReactionAdapter = {
  async findByMomentId(momentId) {
    const t = await table(TABLES.MOMENT_REACTIONS);
    return t.where("momentId").equals(momentId).toArray();
  },

  async toggle(reaction) {
    const t = await table(TABLES.MOMENT_REACTIONS);
    const existing = await t
      .where("[momentId+authorType]")
      .equals([reaction.momentId, reaction.authorType || "user"])
      .first();

    if (existing) {
      await t.delete(existing.id);
      return { liked: false, count: await this.countByMomentId(reaction.momentId) };
    } else {
      const record = {
        id: `react-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        momentId: reaction.momentId,
        authorType: reaction.authorType || "user",
        userId: reaction.userId || "user",
        reaction: reaction.reaction || "like",
        createdAt: Date.now(),
      };
      await put(TABLES.MOMENT_REACTIONS, record);
      return { liked: true, count: await this.countByMomentId(reaction.momentId) };
    }
  },

  async countByMomentId(momentId) {
    const t = await table(TABLES.MOMENT_REACTIONS);
    return t.where("momentId").equals(momentId).count();
  },
};

// ============================================================
//  Worldbook
// ============================================================

export const dexieWorldbookAdapter = {
  async findAllBooks() {
    return getAll(TABLES.WORLDBOOK_BOOKS);
  },

  async findBookById(bookId) {
    return getById(TABLES.WORLDBOOK_BOOKS, bookId);
  },

  async findBooksByCharacterId(characterId) {
    const t = await table(TABLES.WORLDBOOK_BOOKS);
    return t
      .where("[scope+characterId]")
      .anyOf([["global", null], ["character", characterId]])
      .toArray()
      .catch(async () => {
        // fallback: 全表扫描
        const all = await getAll(TABLES.WORLDBOOK_BOOKS);
        return all.filter((b) => b.scope === "global" || b.characterId === characterId);
      });
  },

  async createBook(book) {
    const record = {
      id: book.id || `wb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: book.name || "New Worldbook",
      description: book.description || "",
      scope: book.scope || "global",
      characterId: book.characterId || null,
      enabled: book.enabled !== false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await put(TABLES.WORLDBOOK_BOOKS, record);
    return record;
  },

  async updateBook(bookId, updates) {
    const existing = await getById(TABLES.WORLDBOOK_BOOKS, bookId);
    if (!existing) return null;
    const record = { ...existing, ...updates, updatedAt: Date.now() };
    await put(TABLES.WORLDBOOK_BOOKS, record);
    return record;
  },

  async deleteBook(bookId) {
    await remove(TABLES.WORLDBOOK_BOOKS, bookId);
    // 级联删除 entries
    const t = await table(TABLES.WORLDBOOK_ENTRIES);
    const entries = await t.where("bookId").equals(bookId).toArray();
    await t.bulkDelete(entries.map((e) => e.id));
  },

  async addEntry(bookId, entry) {
    const record = {
      id: entry.id || `wbe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bookId,
      keys: entry.keys || [],
      content: entry.content || "",
      priority: entry.priority || 10,
      enabled: entry.enabled !== false,
      createdAt: Date.now(),
    };
    await put(TABLES.WORLDBOOK_ENTRIES, record);
    return record;
  },

  async updateEntry(bookId, entryId, updates) {
    const existing = await getById(TABLES.WORLDBOOK_ENTRIES, entryId);
    if (!existing) return null;
    const record = { ...existing, ...updates };
    await put(TABLES.WORLDBOOK_ENTRIES, record);
    return record;
  },

  async deleteEntry(bookId, entryId) {
    await remove(TABLES.WORLDBOOK_ENTRIES, entryId);
  },

  async matchEntries(characterId, text) {
    const books = await this.findBooksByCharacterId(characterId);
    const bookIds = books.filter((b) => b.enabled).map((b) => b.id);
    if (bookIds.length === 0) return [];

    const t = await table(TABLES.WORLDBOOK_ENTRIES);
    const allEntries = await t
      .where("bookId")
      .anyOf(bookIds)
      .toArray();

    const lower = text.toLowerCase();
    const matches = allEntries.filter((e) => {
      if (!e.enabled) return false;
      return (e.keys || []).some((k) => lower.includes(String(k).toLowerCase()));
    });

    return matches.sort((a, b) => (b.priority || 10) - (a.priority || 10));
  },
};

// ============================================================
//  Assets（元数据，二进制仍在 IndexedDB blobs store）
// ============================================================

export const dexieAssetAdapter = {
  async storeMetadata(id, metadata) {
    const record = {
      id,
      type: metadata.type || "unknown",
      size: metadata.size || 0,
      createdAt: Date.now(),
      ...metadata,
    };
    await put(TABLES.ASSETS, record);
    return record;
  },

  async getMetadata(id) {
    return getById(TABLES.ASSETS, id);
  },

  async delete(id) {
    await remove(TABLES.ASSETS, id);
  },
};

// ============================================================
//  Migration Log
// ============================================================

export const dexieMigrationLogAdapter = {
  async start(name) {
    const record = {
      id: `mig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      status: "running",
      startedAt: Date.now(),
      completedAt: null,
      error: null,
    };
    await put(TABLES.MIGRATION_LOG, record);
    return record;
  },

  async complete(id) {
    const record = await getById(TABLES.MIGRATION_LOG, id);
    if (record) {
      record.status = "completed";
      record.completedAt = Date.now();
      await put(TABLES.MIGRATION_LOG, record);
    }
    return record;
  },

  async fail(id, error) {
    const record = await getById(TABLES.MIGRATION_LOG, id);
    if (record) {
      record.status = "failed";
      record.completedAt = Date.now();
      record.error = String(error);
      await put(TABLES.MIGRATION_LOG, record);
    }
    return record;
  },

  async isComplete(name) {
    const t = await table(TABLES.MIGRATION_LOG);
    const record = await t
      .where("name")
      .equals(name)
      .and((r) => r.status === "completed")
      .first();
    return !!record;
  },
};

// ============================================================
//  统一导出
// ============================================================

export const dexieAdapter = {
  message: dexieMessageAdapter,
  conversation: dexieConversationAdapter,
  character: dexieCharacterAdapter,
  memory: dexieMemoryAdapter,
  relationship: dexieRelationshipAdapter,
  relationshipEvent: dexieRelationshipEventAdapter,
  moment: dexieMomentAdapter,
  momentComment: dexieMomentCommentAdapter,
  momentReaction: dexieMomentReactionAdapter,
  worldbook: dexieWorldbookAdapter,
  asset: dexieAssetAdapter,
  migrationLog: dexieMigrationLogAdapter,
};
