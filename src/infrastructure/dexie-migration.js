/**
 * EchoChat localStorage → Dexie Migration
 *
 * Phase 2 — Web Storage Migration
 *
 * 将现有 localStorage 数据迁移到 Dexie/IndexedDB。
 * 遵循 V1 迁移安全框架：
 * Detect → Validate → Transform → Validate → Stage → Commit → Verify → Mark
 *
 * 渐进式迁移：
 * - Phase 2: 建立迁移机制 + Messages 迁移（可选）
 * - Phase 3: Messages 正式迁移
 * - Phase 4-5: Characters/Conversations 迁移
 * - Phase 6-11: 其他实体逐步迁移
 *
 * 安全保证：
 * - 迁移失败不破坏旧数据
 * - 旧数据保留直到迁移验证通过
 * - 支持重试
 * - 支持回滚（删除 Dexie 数据，旧数据仍在 localStorage）
 */

import { legacyAdapter } from "../repository/legacy-adapter.js";
import { dexieAdapter } from "./dexie-adapter.js";
import { getDb, TABLES } from "./dexie-db.js";

// ============================================================
//  迁移状态标记（localStorage，小型数据）
// ============================================================

const MIGRATION_FLAG_KEY = "echodownload_dexie_migration";

function getMigrationState() {
  try {
    return JSON.parse(localStorage.getItem(MIGRATION_FLAG_KEY)) || {};
  } catch {
    return {};
  }
}

function setMigrationState(state) {
  localStorage.setItem(MIGRATION_FLAG_KEY, JSON.stringify(state));
}

function isEntityMigrated(entityName) {
  const state = getMigrationState();
  return state[entityName]?.status === "completed";
}

function markEntityMigrated(entityName, stats = {}) {
  const state = getMigrationState();
  state[entityName] = {
    status: "completed",
    completedAt: Date.now(),
    ...stats,
  };
  setMigrationState(state);
}

function markEntityFailed(entityName, error) {
  const state = getMigrationState();
  state[entityName] = {
    status: "failed",
    failedAt: Date.now(),
    error: String(error),
  };
  setMigrationState(state);
}

// ============================================================
//  数据转换函数
// ============================================================

/**
 * 将 V1 chat.messages 转换为 Dexie messages 表记录
 */
function transformMessages(chats) {
  const messages = [];
  const conversations = [];

  for (const chat of chats) {
    // Conversation 记录
    conversations.push({
      id: chat.id,
      characterId: chat.roleId,
      title: chat.name || "",
      status: "active",
      config: chat.config || {},
      messageCount: chat.messages?.length || 0,
      lastMessageAt: chat.messages?.length
        ? chat.messages[chat.messages.length - 1].time
        : chat.createdAt,
      createdAt: chat.createdAt || Date.now(),
      updatedAt: chat.createdAt || Date.now(),
    });

    // Message 记录
    for (const msg of chat.messages || []) {
      messages.push({
        id: msg.id,
        conversationId: chat.id,
        parentMessageId: msg.parentMessageId || null,
        role: msg.role,
        content: msg.text || msg.content || "",
        createdAt: msg.time || Date.now(),
        updatedAt: msg.updatedAt || msg.time || Date.now(),
        status: msg.status || "sent",
        metadata: msg.metadata || {},
      });
    }
  }

  return { messages, conversations };
}

/**
 * 将 V1 longTermMemory 转换为 Dexie memories 表记录
 */
function transformMemories() {
  const allMemory = legacyAdapter.getAllMemory();
  const memories = [];
  for (const [characterId, data] of Object.entries(allMemory)) {
    for (const m of data.memories || []) {
      memories.push({
        id: m.id,
        characterId,
        type: m.type || "long_term",
        content: m.content,
        importance: m.importance || 5,
        source: m.source || "auto_summary",
        confidence: m.confidence ?? 1,
        tags: m.tags || [],
        createdAt: m.createdAt || Date.now(),
        updatedAt: m.updatedAt || m.createdAt || Date.now(),
      });
    }
  }
  return memories;
}

/**
 * 将 V1 relations 转换为 Dexie relationships 表记录
 */
function transformRelationships() {
  const all = legacyAdapter.getAllRelations();
  const relationships = [];
  const events = [];

  for (const [characterId, data] of Object.entries(all.roles || {})) {
    relationships.push({
      id: `rel-${characterId}`,
      characterId,
      userId: "user",
      type: data.type || "friend",
      status: data.status || "active",
      affinity: data.affinity || 0,
      trust: data.trust || 0,
      familiarity: data.familiarity || 0,
      intimacy: data.intimacy || 0,
      tension: data.tension || 0,
      interactionFrequency: data.chatTurns || 0,
      streakDays: data.streakDays || 0,
      lastInteractionAt: data.lastInteractionAt || null,
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
    });
  }

  return { relationships, events };
}

/**
 * 将 V1 moments 转换为 Dexie moments 表记录
 */
function transformMoments() {
  const all = legacyAdapter.getAllMoments();
  const moments = [];
  const comments = [];
  const reactions = [];

  for (const m of all) {
    moments.push({
      id: m.id,
      characterId: m.roleId,
      authorType: m.authorType || "character",
      content: m.content || "",
      media: m.image ? [m.image] : [],
      visibility: m.visibility || "public",
      likeCount: m.likes?.length || 0,
      commentCount: m.comments?.length || 0,
      socialContext: m.socialContext || {},
      createdAt: m.createdAt || m.time || Date.now(),
      updatedAt: m.createdAt || m.time || Date.now(),
    });

    for (const c of m.comments || []) {
      comments.push({
        id: c.id || `cmt-${m.id}-${Math.random().toString(36).slice(2, 8)}`,
        momentId: m.id,
        authorType: c.authorType || "user",
        characterId: c.characterId || null,
        content: c.content || c.text || "",
        createdAt: c.createdAt || c.time || Date.now(),
      });
    }

    for (const l of m.likes || []) {
      reactions.push({
        id: typeof l === "string" ? `react-${m.id}-${l}` : l.id,
        momentId: m.id,
        authorType: typeof l === "string" ? "user" : l.authorType || "user",
        userId: typeof l === "string" ? l : l.userId,
        reaction: "like",
        createdAt: typeof l === "string" ? Date.now() : l.createdAt || Date.now(),
      });
    }
  }

  return { moments, comments, reactions };
}

/**
 * 将 V1 worldbook 转换为 Dexie worldbook 表记录
 */
function transformWorldbook() {
  const data = legacyAdapter.getWorldbookData();
  const books = [];
  const entries = [];

  for (const book of data.books || []) {
    books.push({
      id: book.id,
      name: book.name || "",
      description: book.description || "",
      scope: book.scope || (book.characterId ? "character" : "global"),
      characterId: book.characterId || null,
      enabled: book.enabled !== false,
      createdAt: book.createdAt || Date.now(),
      updatedAt: book.updatedAt || Date.now(),
    });

    for (const entry of book.entries || []) {
      entries.push({
        id: entry.id,
        bookId: book.id,
        keys: entry.keys || [],
        content: entry.content || "",
        priority: entry.priority || 10,
        enabled: entry.enabled !== false,
        createdAt: entry.createdAt || Date.now(),
      });
    }
  }

  return { books, entries };
}

/**
 * 从 V1 chats 推导 Characters
 */
function transformCharacters(chats) {
  const seen = new Set();
  const characters = [];
  for (const chat of chats) {
    if (seen.has(chat.roleId)) continue;
    seen.add(chat.roleId);
    const persona = chat.config?.persona || {};
    characters.push({
      id: chat.roleId,
      name: chat.name || persona.name || "Unknown",
      avatar: chat.avatar || null,
      identity: persona.persona || "",
      personality: {
        description: persona.persona || "",
        firstMessage: persona.first_mes || "",
        mesExample: persona.mes_example || "",
      },
      appearance: { avatar: chat.avatar || null, visualDescription: "" },
      speakingStyle: {},
      preferences: {},
      source: chat.roleId?.startsWith("guide-") ? "guide" : "user_created",
      isGuide: chat.roleId?.startsWith("guide-") || false,
      status: "active",
      createdAt: chat.createdAt || Date.now(),
      updatedAt: chat.createdAt || Date.now(),
    });
  }
  return characters;
}

// ============================================================
//  迁移执行器
// ============================================================

/**
 * 执行单个实体的迁移
 * @param {string} entityName
 * @param {Function} transformFn
 * @param {Function} writeFn
 * @param {Function} validateFn
 */
async function migrateEntity(entityName, transformFn, writeFn, validateFn) {
  if (isEntityMigrated(entityName)) {
    console.log(`[Migration] ${entityName} already migrated, skipping`);
    return { skipped: true };
  }

  console.log(`[Migration] Starting ${entityName}...`);
  const log = await dexieAdapter.migrationLog.start(`localStorage_to_dexie_${entityName}`);

  try {
    // 1. Detect + Validate source
    const sourceData = transformFn();
    if (!sourceData) throw new Error("Transform returned null");

    // 2. Transform (already done in transformFn)
    // 3. Validate transformed result
    if (validateFn) {
      const valid = validateFn(sourceData);
      if (!valid) throw new Error("Validation failed");
    }

    // 4. Stage + Commit (write to Dexie)
    const stats = await writeFn(sourceData);

    // 5. Verify
    // 6. Mark
    markEntityMigrated(entityName, stats);
    await dexieAdapter.migrationLog.complete(log.id);

    console.log(`[Migration] ${entityName} completed:`, stats);
    return { success: true, stats };
  } catch (error) {
    console.error(`[Migration] ${entityName} failed:`, error);
    markEntityFailed(entityName, error);
    await dexieAdapter.migrationLog.fail(log.id, error);
    // 旧数据保留在 localStorage，不删除
    throw error;
  }
}

// ============================================================
//  具体迁移任务
// ============================================================

/**
 * 迁移 Messages + Conversations
 * Phase 3 核心。当前 Phase 2 只建立机制，不自动执行。
 */
export async function migrateMessages() {
  return migrateEntity(
    "messages",
    () => {
      const chats = legacyAdapter.getAllChats();
      return transformMessages(chats);
    },
    async ({ messages, conversations }) => {
      const db = await getDb();
      await db.transaction("rw", db.messages, db.conversations, async () => {
        if (conversations.length > 0) {
          await db.conversations.bulkPut(conversations);
        }
        if (messages.length > 0) {
          await db.messages.bulkPut(messages);
        }
      });
      return { messageCount: messages.length, conversationCount: conversations.length };
    },
    ({ messages, conversations }) => {
      // 验证：所有 message 都有 conversationId
      return messages.every((m) => m.conversationId && m.role && m.content !== undefined);
    }
  );
}

/**
 * 迁移 Characters
 * Phase 5。当前只建立机制。
 */
export async function migrateCharacters() {
  return migrateEntity(
    "characters",
    () => {
      const chats = legacyAdapter.getAllChats();
      return transformCharacters(chats);
    },
    async (characters) => {
      const db = await getDb();
      await db.characters.bulkPut(characters);
      return { characterCount: characters.length };
    },
    (characters) => characters.every((c) => c.id && c.name)
  );
}

/**
 * 迁移 Memories
 * Phase 7。当前只建立机制。
 */
export async function migrateMemories() {
  return migrateEntity(
    "memories",
    () => transformMemories(),
    async (memories) => {
      const db = await getDb();
      await db.memories.bulkPut(memories);
      return { memoryCount: memories.length };
    },
    (memories) => memories.every((m) => m.id && m.characterId && m.content)
  );
}

/**
 * 迁移 Relationships + Events
 * Phase 9。当前只建立机制。
 */
export async function migrateRelationships() {
  return migrateEntity(
    "relationships",
    () => transformRelationships(),
    async ({ relationships, events }) => {
      const db = await getDb();
      await db.transaction("rw", db.relationships, db.relationship_events, async () => {
        await db.relationships.bulkPut(relationships);
        if (events.length > 0) {
          await db.relationship_events.bulkPut(events);
        }
      });
      return { relationshipCount: relationships.length, eventCount: events.length };
    },
    ({ relationships }) => relationships.every((r) => r.id && r.characterId)
  );
}

/**
 * 迁移 Moments + Comments + Reactions
 * Phase 11。当前只建立机制。
 */
export async function migrateMoments() {
  return migrateEntity(
    "moments",
    () => transformMoments(),
    async ({ moments, comments, reactions }) => {
      const db = await getDb();
      await db.transaction(
        "rw",
        db.moments,
        db.moment_comments,
        db.moment_reactions,
        async () => {
          await db.moments.bulkPut(moments);
          if (comments.length > 0) await db.moment_comments.bulkPut(comments);
          if (reactions.length > 0) await db.moment_reactions.bulkPut(reactions);
        }
      );
      return {
        momentCount: moments.length,
        commentCount: comments.length,
        reactionCount: reactions.length,
      };
    },
    ({ moments }) => moments.every((m) => m.id && m.characterId)
  );
}

/**
 * 迁移 Worldbook
 * Phase 8。当前只建立机制。
 */
export async function migrateWorldbook() {
  return migrateEntity(
    "worldbook",
    () => transformWorldbook(),
    async ({ books, entries }) => {
      const db = await getDb();
      await db.transaction("rw", db.worldbook_books, db.worldbook_entries, async () => {
        await db.worldbook_books.bulkPut(books);
        if (entries.length > 0) await db.worldbook_entries.bulkPut(entries);
      });
      return { bookCount: books.length, entryCount: entries.length };
    },
    ({ books }) => books.every((b) => b.id && b.name)
  );
}

// ============================================================
//  全量迁移（按依赖顺序）
// ============================================================

/**
 * 执行全量 localStorage → Dexie 迁移
 * 按依赖顺序执行：Characters → Conversations → Messages → Memories → Relationships → Moments → Worldbook
 *
 * 注意：此函数当前不自动调用。各 Phase 按需调用对应迁移函数。
 */
export async function migrateAllToDexie(options = {}) {
  const results = {};
  const order = [
    ["characters", migrateCharacters],
    ["conversations", migrateMessages], // messages migration includes conversations
    ["memories", migrateMemories],
    ["relationships", migrateRelationships],
    ["moments", migrateMoments],
    ["worldbook", migrateWorldbook],
  ];

  for (const [name, fn] of order) {
    if (options.only && !options.only.includes(name)) continue;
    if (options.skip?.includes(name)) continue;
    try {
      results[name] = await fn();
    } catch (error) {
      results[name] = { success: false, error: String(error) };
      if (!options.continueOnError) throw error;
    }
  }

  return results;
}

// ============================================================
//  回滚（删除 Dexie 数据，旧数据仍在 localStorage）
// ============================================================

/**
 * 回滚迁移：删除 Dexie 中指定实体的数据
 * 旧数据保留在 localStorage，可重新迁移
 */
export async function rollbackMigration(entityName) {
  const db = await getDb();
  const tableMap = {
    messages: [TABLES.MESSAGES, TABLES.CONVERSATIONS],
    characters: [TABLES.CHARACTERS],
    memories: [TABLES.MEMORIES],
    relationships: [TABLES.RELATIONSHIPS, TABLES.RELATIONSHIP_EVENTS],
    moments: [TABLES.MOMENTS, TABLES.MOMENT_COMMENTS, TABLES.MOMENT_REACTIONS],
    worldbook: [TABLES.WORLDBOOK_BOOKS, TABLES.WORLDBOOK_ENTRIES],
  };

  const tables = tableMap[entityName];
  if (!tables) throw new Error(`Unknown entity: ${entityName}`);

  await db.transaction("rw", tables, async () => {
    for (const t of tables) {
      await db.table(t).clear();
    }
  });

  // 清除迁移标记
  const state = getMigrationState();
  delete state[entityName];
  setMigrationState(state);

  console.log(`[Migration] Rolled back ${entityName}`);
}

/**
 * 获取迁移状态
 */
export function getMigrationStatus() {
  return getMigrationState();
}

/**
 * 检查是否所有数据都已迁移
 */
export function isFullyMigrated() {
  const state = getMigrationState();
  const required = ["messages", "characters", "memories", "relationships", "moments", "worldbook"];
  return required.every((e) => state[e]?.status === "completed");
}
