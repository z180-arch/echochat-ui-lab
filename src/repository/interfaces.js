/**
 * EchoChat Repository Interfaces
 *
 * 定义所有 Repository 的契约。使用 JSDoc @typedef 描述接口。
 * 核心 Domain 只依赖这些接口，不依赖具体存储实现。
 *
 * 原则：
 * - 每个 Repository 管理一个聚合根
 * - Repository 只负责 CRUD + 查询 + 分页 + 事务边界
 * - Repository 不负责业务逻辑、AI prompt、UI 状态
 * - Repository 不成为 God Object
 */

// ============================================================
//  通用类型
// ============================================================

/**
 * @typedef {Object} PaginatedResult
 * @property {Array} items - 当前页数据
 * @property {number} total - 总数
 * @property {number} page - 当前页 (1-based)
 * @property {number} pageSize - 每页大小
 * @property {boolean} hasMore - 是否有更多
 */

/**
 * @typedef {Object} Transaction
 * @property {function(): Promise<void>} commit
 * @property {function(): Promise<void>} rollback
 */

// ============================================================
//  CharacterRepository
// ============================================================

/**
 * @interface CharacterRepository
 * @description 管理 Character 聚合根。Character 是 EchoChat 的核心一级实体。
 */
class CharacterRepositoryInterface {
  /** @param {string} id @returns {Promise<Object|null>} */
  async findById(id) {}
  /** @param {Object} [options] @param {string} [options.source] @param {boolean} [options.includeGuides] @returns {Promise<Array>} */
  async findAll(options) {}
  /** @param {Object} character @returns {Promise<Object>} */
  async create(character) {}
  /** @param {string} id @param {Object} updates @returns {Promise<Object>} */
  async update(id, updates) {}
  /** @param {string} id @returns {Promise<void>} */
  async softDelete(id) {}
  /** @param {string} id @returns {Promise<void>} */
  async restore(id) {}
  /** @param {string} id @returns {Promise<void>} */
  async permanentDelete(id) {}
  /** @param {string} id @returns {Promise<number>} */
  async countChats(id) {}
}

// ============================================================
//  ConversationRepository
// ============================================================

/**
 * @interface ConversationRepository
 * @description 管理 Conversation（聊天会话）。一个 Character 可以有多个 Conversation。
 */
class ConversationRepositoryInterface {
  /** @param {string} id @returns {Promise<Object|null>} */
  async findById(id) {}
  /** @param {string} characterId @param {Object} [options] @returns {Promise<Array>} */
  async findByCharacterId(characterId, options) {}
  /** @param {Object} conversation @returns {Promise<Object>} */
  async create(conversation) {}
  /** @param {string} id @param {Object} updates @returns {Promise<Object>} */
  async update(id, updates) {}
  /** @param {string} id @returns {Promise<void>} */
  async archive(id) {}
  /** @param {string} id @returns {Promise<void>} */
  async unarchive(id) {}
  /** @param {string} id @returns {Promise<void>} */
  async delete(id) {}
  /** @param {string} characterId @returns {Promise<number>} */
  async countByCharacterId(characterId) {}
}

// ============================================================
//  MessageRepository
// ============================================================

/**
 * @interface MessageRepository
 * @description 管理 Message。Message 独立于 Conversation 存储，支持分页、搜索、分支。
 */
class MessageRepositoryInterface {
  /** @param {string} id @returns {Promise<Object|null>} */
  async findById(id) {}
  /**
   * @param {string} conversationId
   * @param {Object} [options]
   * @param {number} [options.page=1]
   * @param {number} [options.pageSize=50]
   * @param {string} [options.before] - 只返回此时间之前的消息
   * @param {string} [options.after] - 只返回此时间之后的消息
   * @returns {Promise<PaginatedResult>}
   */
  async findByConversationId(conversationId, options) {}
  /** @param {Object} message @returns {Promise<Object>} */
  async create(message) {}
  /** @param {string} id @param {Object} updates @returns {Promise<Object>} */
  async update(id, updates) {}
  /** @param {string} id @returns {Promise<void>} */
  async delete(id) {}
  /** @param {string} conversationId @returns {Promise<number>} */
  async countByConversationId(conversationId) {}
  /**
   * @param {string} conversationId
   * @param {string} query
   * @param {Object} [options]
   * @returns {Promise<Array>}
   */
  async search(conversationId, query, options) {}
  /** @param {string} conversationId @returns {Promise<Object|null>} */
  async findLatest(conversationId) {}
  /** @param {string} parentMessageId @returns {Promise<Array>} */
  async findBranches(parentMessageId) {}
}

// ============================================================
//  MemoryRepository
// ============================================================

/**
 * @interface MemoryRepository
 * @description 管理 Memory。区分短期/长期/关系/角色/社交记忆。
 */
class MemoryRepositoryInterface {
  /** @param {string} id @returns {Promise<Object|null>} */
  async findById(id) {}
  /** @param {string} characterId @param {Object} [options] @param {string} [options.type] @param {number} [options.limit] @returns {Promise<Array>} */
  async findByCharacterId(characterId, options) {}
  /**
   * 检索相关记忆（用于 Context Builder）
   * @param {string} characterId
   * @param {Object} query
   * @param {number} [query.tokenBudget]
   * @param {string[]} [query.types]
   * @returns {Promise<Array>}
   */
  async findRelevant(characterId, query) {}
  /** @param {Object} memory @returns {Promise<Object>} */
  async create(memory) {}
  /** @param {string} id @param {Object} updates @returns {Promise<Object>} */
  async update(id, updates) {}
  /** @param {string} id @returns {Promise<void>} */
  async delete(id) {}
  /** @param {string} characterId @param {string} content @returns {Promise<Object|null>} - 找到的重复记忆 */
  async findDuplicate(characterId, content) {}
  /** @param {string} characterId @returns {Promise<number>} */
  async countByCharacterId(characterId) {}
}

// ============================================================
//  RelationshipRepository
// ============================================================

/**
 * @interface RelationshipRepository
 * @description 管理 Relationship 当前状态。采用 Current State + Event History 模型。
 */
class RelationshipRepositoryInterface {
  /** @param {string} characterId @returns {Promise<Object|null>} */
  async findByCharacterId(characterId) {}
  /** @param {Object} relationship @returns {Promise<Object>} */
  async create(relationship) {}
  /** @param {string} characterId @param {Object} updates @returns {Promise<Object>} */
  async update(characterId, updates) {}
  /** @param {string} characterId @returns {Promise<void>} */
  async block(characterId) {}
  /** @param {string} characterId @returns {Promise<void>} */
  async unblock(characterId) {}
  /** @param {string} characterId @returns {Promise<void>} */
  async reset(characterId) {}
}

// ============================================================
//  RelationshipEventRepository
// ============================================================

/**
 * @interface RelationshipEventRepository
 * @description 管理 RelationshipEvent 历史。追加写，用于追溯关系变化。
 */
class RelationshipEventRepositoryInterface {
  /** @param {Object} event @returns {Promise<Object>} */
  async append(event) {}
  /** @param {string} relationshipId @param {Object} [options] @param {number} [options.limit] @param {string} [options.since] @returns {Promise<Array>} */
  async findByRelationshipId(relationshipId, options) {}
  /** @param {string} relationshipId @returns {Promise<number>} */
  async countByRelationshipId(relationshipId) {}
  /** @param {string} relationshipId @returns {Promise<Object>} - 从事件重建的状态 */
  async rebuildState(relationshipId) {}
}

// ============================================================
//  MomentRepository
// ============================================================

/**
 * @interface MomentRepository
 * @description 管理 Moment（角色动态/朋友圈）。
 */
class MomentRepositoryInterface {
  /** @param {string} id @returns {Promise<Object|null>} */
  async findById(id) {}
  /** @param {Object} [options] @param {string} [options.characterId] @param {number} [options.page] @param {number} [options.pageSize] @returns {Promise<PaginatedResult>} */
  async findAll(options) {}
  /** @param {Object} moment @returns {Promise<Object>} */
  async create(moment) {}
  /** @param {string} id @param {Object} updates @returns {Promise<Object>} */
  async update(id, updates) {}
  /** @param {string} id @returns {Promise<void>} */
  async delete(id) {}
}

// ============================================================
//  MomentCommentRepository
// ============================================================

/**
 * @interface MomentCommentRepository
 * @description 管理 Moment 评论。
 */
class MomentCommentRepositoryInterface {
  /** @param {string} momentId @returns {Promise<Array>} */
  async findByMomentId(momentId) {}
  /** @param {Object} comment @returns {Promise<Object>} */
  async create(comment) {}
  /** @param {string} id @returns {Promise<void>} */
  async delete(id) {}
}

// ============================================================
//  MomentReactionRepository
// ============================================================

/**
 * @interface MomentReactionRepository
 * @description 管理 Moment 点赞/反应。
 */
class MomentReactionRepositoryInterface {
  /** @param {string} momentId @returns {Promise<Array>} */
  async findByMomentId(momentId) {}
  /** @param {Object} reaction @returns {Promise<Object>} */
  async toggle(reaction) {}
  /** @param {string} momentId @returns {Promise<number>} */
  async countByMomentId(momentId) {}
}

// ============================================================
//  WorldbookRepository
// ============================================================

/**
 * @interface WorldbookRepository
 * @description 管理 Worldbook（世界知识/规则/触发条件）。独立于 Memory。
 */
class WorldbookRepositoryInterface {
  /** @returns {Promise<Array>} */
  async findAllBooks() {}
  /** @param {string} bookId @returns {Promise<Object|null>} */
  async findBookById(bookId) {}
  /** @param {string} characterId @returns {Promise<Array>} */
  async findBooksByCharacterId(characterId) {}
  /** @param {Object} book @returns {Promise<Object>} */
  async createBook(book) {}
  /** @param {string} bookId @param {Object} updates @returns {Promise<Object>} */
  async updateBook(bookId, updates) {}
  /** @param {string} bookId @returns {Promise<void>} */
  async deleteBook(bookId) {}
  /** @param {string} bookId @param {Object} entry @returns {Promise<Object>} */
  async addEntry(bookId, entry) {}
  /** @param {string} bookId @param {string} entryId @param {Object} updates @returns {Promise<Object>} */
  async updateEntry(bookId, entryId, updates) {}
  /** @param {string} bookId @param {string} entryId @returns {Promise<void>} */
  async deleteEntry(bookId, entryId) {}
  /**
   * 根据触发词匹配活跃条目
   * @param {string} characterId
   * @param {string} text
   * @param {Object} [options]
   * @returns {Promise<Array>}
   */
  async matchEntries(characterId, text, options) {}
}

// ============================================================
//  AssetRepository
// ============================================================

/**
 * @interface AssetRepository
 * @description 管理二进制资产（头像、图片、附件）。Metadata + Binary 分离。
 */
class AssetRepositoryInterface {
  /** @param {Blob} blob @param {Object} [metadata] @returns {Promise<Object>} - {id, metadata} */
  async storeBlob(blob, metadata) {}
  /** @param {string} id @returns {Promise<Blob|null>} */
  async getBlob(id) {}
  /** @param {string} id @returns {Promise<Object|null>} */
  async getMetadata(id) {}
  /** @param {string} id @returns {Promise<string>} - object URL */
  async getObjectUrl(id) {}
  /** @param {string} id @returns {Promise<void>} */
  async delete(id) {}
  /** @param {string} id @returns {Promise<number>} - bytes */
  async getSize(id) {}
}

// ============================================================
//  SettingsRepository
// ============================================================

/**
 * @interface SettingsRepository
 * @description 管理应用设置（小型配置，可继续使用 localStorage）。
 */
class SettingsRepositoryInterface {
  /** @returns {Promise<Object>} */
  async getAll() {}
  /** @param {string} key @returns {Promise<any>} */
  async get(key) {}
  /** @param {string} key @param {any} value @returns {Promise<void>} */
  async set(key, value) {}
  /** @param {Object} settings @returns {Promise<void>} */
  async setAll(settings) {}
  /** @param {string} key @returns {Promise<void>} */
  async remove(key) {}
}

// ============================================================
//  Repository 职责声明（防止 God Object）
// ============================================================

/**
 * Repository 负责：
 * - 领域对象 ↔ 存储记录的转换
 * - CRUD 操作
 * - 查询和过滤
 * - 分页
 * - 事务边界
 * - 索引使用
 * - 软删除 / 恢复
 *
 * Repository 不负责：
 * - 业务逻辑（如 affinity = turns * 0.1）
 * - AI prompt 构建
 * - UI 状态管理
 * - 领域不变量验证（那是 Domain 的职责）
 * - 事件发射（那是 Application/Domain 的职责）
 * - 跨聚合根编排（那是 Application Use Case 的职责）
 */

export {
  CharacterRepositoryInterface,
  ConversationRepositoryInterface,
  MessageRepositoryInterface,
  MemoryRepositoryInterface,
  RelationshipRepositoryInterface,
  RelationshipEventRepositoryInterface,
  MomentRepositoryInterface,
  MomentCommentRepositoryInterface,
  MomentReactionRepositoryInterface,
  WorldbookRepositoryInterface,
  AssetRepositoryInterface,
  SettingsRepositoryInterface,
};
