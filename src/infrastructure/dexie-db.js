/**
 * EchoChat Dexie Database
 *
 * Phase 2 — Web Storage Migration
 *
 * Dexie 是 IndexedDB 的包装库，提供：
 * - 事务支持
 * - 异步 API
 * - 索引查询
 * - 分页
 * - 版本化 schema 迁移
 *
 * 此文件定义数据库实例和 schema。
 * 大型数据进入 IndexedDB，小型设置继续使用 localStorage。
 *
 * Schema Version 1: 初始表结构
 * 未来 schema 变化通过 Dexie 的 version().upgrade() 机制处理。
 */

import { Dexie } from "./vendor/dexie.mjs";

// ============================================================
//  数据库实例
// ============================================================

export const db = new Dexie("echochat");

// ============================================================
//  Schema Version 1
// ============================================================
//
// 设计原则：
// - 每个聚合根一个表
// - 常用查询字段建立索引
// - 不预先过度规范化
// - 保留扩展空间（metadata 字段）
//
// 索引语法：
// - "id"          主键
// - "characterId" 普通索引
// - "[characterId+createdAt]" 复合索引
// - "&id"          唯一索引（主键自动唯一）

db.version(1).stores({
  // ========================================================
  //  Character（Phase 5 正式启用，当前为过渡）
  // ========================================================
  characters: "id, source, isGuide, status, createdAt, updatedAt",

  // ========================================================
  //  Conversation（聊天会话）
  // ========================================================
  conversations: "id, characterId, status, createdAt, updatedAt, lastMessageAt",

  // ========================================================
  //  Message（独立消息存储，Phase 3 核心）
  // ========================================================
  // 索引：
  // - id: 主键
  // - conversationId: 按会话查询
  // - [conversationId+createdAt]: 按会话+时间排序（分页用）
  // - parentMessageId: 分支查询
  // - role: 按角色筛选
  messages: "id, conversationId, [conversationId+createdAt], parentMessageId, role, status, createdAt",

  // ========================================================
  //  Memory（记忆，Phase 7 扩展多类型）
  // ========================================================
  memories: "id, characterId, [characterId+type], [characterId+importance], type, source, createdAt",

  // ========================================================
  //  Relationship（关系当前状态）
  // ========================================================
  relationships: "id, characterId, status, [characterId+status], updatedAt",

  // ========================================================
  //  RelationshipEvent（关系事件历史，Phase 9）
  // ========================================================
  relationship_events: "id, relationshipId, [relationshipId+createdAt], type, createdAt",

  // ========================================================
  //  Moment（角色动态）
  // ========================================================
  moments: "id, characterId, [characterId+createdAt], authorType, visibility, createdAt",

  // ========================================================
  //  MomentComment（动态评论）
  // ========================================================
  moment_comments: "id, momentId, [momentId+createdAt], authorType, createdAt",

  // ========================================================
  //  MomentReaction（动态点赞/反应）
  // ========================================================
  moment_reactions: "id, [momentId+authorType], momentId, authorType, createdAt",

  // ========================================================
  //  Worldbook（世界知识书籍）
  // ========================================================
  worldbook_books: "id, scope, characterId, enabled, [scope+characterId], createdAt",

  // ========================================================
  //  WorldbookEntry（世界知识条目）
  // ========================================================
  worldbook_entries: "id, bookId, [bookId+priority], priority, enabled",

  // ========================================================
  //  Asset（资产元数据，二进制仍在 IndexedDB blobs store）
  // ========================================================
  assets: "id, type, [type+createdAt], createdAt",

  // ========================================================
  //  MigrationLog（迁移日志，用于追踪和恢复）
  // ========================================================
  migration_log: "id, name, status, startedAt, completedAt, error",

  // ========================================================
  //  Settings（小型设置，可继续用 localStorage，此处为未来统一）
  // ========================================================
  // settings 表暂时不启用，继续使用 localStorage
  // settings: "key",
});

// ============================================================
//  数据库打开
// ============================================================

let dbReady = null;

/**
 * 打开数据库（懒加载，首次调用时打开）
 * @returns {Promise<Dexie>}
 */
export async function getDb() {
  if (!dbReady) {
    dbReady = db.open().catch((err) => {
      console.error("[Dexie] Failed to open database:", err);
      dbReady = null;
      throw err;
    });
  }
  return dbReady;
}

/**
 * 检查数据库是否可用
 * @returns {Promise<boolean>}
 */
export async function isDbAvailable() {
  try {
    await getDb();
    return true;
  } catch {
    return false;
  }
}

/**
 * 关闭数据库
 */
export function closeDb() {
  if (db.isOpen()) {
    db.close();
  }
  dbReady = null;
}

/**
 * 删除数据库（仅用于测试或完全重置，需用户确认）
 */
export async function deleteDb() {
  closeDb();
  await db.delete();
  dbReady = null;
}

// ============================================================
//  表名常量（防止拼写错误）
// ============================================================

export const TABLES = {
  CHARACTERS: "characters",
  CONVERSATIONS: "conversations",
  MESSAGES: "messages",
  MEMORIES: "memories",
  RELATIONSHIPS: "relationships",
  RELATIONSHIP_EVENTS: "relationship_events",
  MOMENTS: "moments",
  MOMENT_COMMENTS: "moment_comments",
  MOMENT_REACTIONS: "moment_reactions",
  WORLDBOOK_BOOKS: "worldbook_books",
  WORLDBOOK_ENTRIES: "worldbook_entries",
  ASSETS: "assets",
  MIGRATION_LOG: "migration_log",
};

// ============================================================
//  数据分类（Phase 2 要求）
// ============================================================

/**
 * 大型数据 → IndexedDB（Dexie）
 */
export const LARGE_DATA_TABLES = [
  TABLES.CHARACTERS,
  TABLES.CONVERSATIONS,
  TABLES.MESSAGES,
  TABLES.MEMORIES,
  TABLES.RELATIONSHIPS,
  TABLES.RELATIONSHIP_EVENTS,
  TABLES.MOMENTS,
  TABLES.MOMENT_COMMENTS,
  TABLES.MOMENT_REACTIONS,
  TABLES.WORLDBOOK_BOOKS,
  TABLES.WORLDBOOK_ENTRIES,
];

/**
 * 小型数据 → 继续使用 localStorage
 */
export const SMALL_DATA_KEYS = [
  "theme",
  "uiPreferences",
  "smallSettings",
  "migrationMetadata",
  "onboardDone",
  "iosHint",
];

/**
 * 敏感数据 → 单独评估（Phase 22）
 * - API Key: 当前在 localStorage settings 中
 * - 未来: Web Crypto 加密存储 / OS credential storage
 */
export const SENSITIVE_DATA_KEYS = ["apiKey"];
