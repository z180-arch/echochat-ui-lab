/**
 * EchoChat Repository Layer
 *
 * 统一入口。所有 Repository 通过此模块导出。
 * 核心 Domain 只依赖此模块，不依赖具体存储实现。
 *
 * Phase 1: Legacy Adapter (localStorage + IndexedDB)
 * Phase 2: Dexie Adapter (IndexedDB) — Repository 接口不变
 * Phase 9+: Platform-specific Adapters — Repository 接口不变
 */

import { CharacterRepository } from "./character.js";
import { ConversationRepository } from "./conversation.js";
import { MessageRepository } from "./message.js";
import { MemoryRepository } from "./memory.js";
import { RelationshipRepository, RelationshipEventRepository } from "./relationship.js";
import { MomentRepository, MomentCommentRepository, MomentReactionRepository } from "./moment.js";
import { WorldbookRepository } from "./worldbook.js";
import { AssetRepository } from "./asset.js";
import { SettingsRepository } from "./settings.js";

export const repositories = {
  character: CharacterRepository,
  conversation: ConversationRepository,
  message: MessageRepository,
  memory: MemoryRepository,
  relationship: RelationshipRepository,
  relationshipEvent: RelationshipEventRepository,
  moment: MomentRepository,
  momentComment: MomentCommentRepository,
  momentReaction: MomentReactionRepository,
  worldbook: WorldbookRepository,
  asset: AssetRepository,
  settings: SettingsRepository,
};

export {
  CharacterRepository,
  ConversationRepository,
  MessageRepository,
  MemoryRepository,
  RelationshipRepository,
  RelationshipEventRepository,
  MomentRepository,
  MomentCommentRepository,
  MomentReactionRepository,
  WorldbookRepository,
  AssetRepository,
  SettingsRepository,
};

/**
 * Repository 清单（12 个）
 *
 * 1. CharacterRepository       — Character 聚合根
 * 2. ConversationRepository    — 聊天会话
 * 3. MessageRepository         — 消息（独立存储，分页/搜索/分支）
 * 4. MemoryRepository          — 记忆（多类型，相关检索）
 * 5. RelationshipRepository    — 关系当前状态
 * 6. RelationshipEventRepository — 关系事件历史
 * 7. MomentRepository          — 角色动态
 * 8. MomentCommentRepository   — 动态评论
 * 9. MomentReactionRepository  — 动态点赞/反应
 * 10. WorldbookRepository      — 世界知识/规则/触发
 * 11. AssetRepository          — 二进制资产
 * 12. SettingsRepository       — 应用设置
 *
 * 职责边界：
 * - 每个 Repository 管理一个聚合根
 * - Repository 只做 CRUD + 查询 + 分页 + 事务边界
 * - Repository 不做业务逻辑、AI prompt、UI 状态
 * - 跨聚合根编排由 Application Use Case 负责
 * - Repository 不成为 God Object
 */
