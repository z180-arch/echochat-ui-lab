/**
 * EchoChat Character Domain (Phase 5)
 *
 * Character 是 EchoChat 的核心一级实体。
 * Character ≠ Conversation，一个 Character 可以有多个 Conversation。
 *
 * V1 模型：Character 信息散落在 chat.config.persona 中
 * Phase 5 模型：Character 独立实体，Conversation 通过 characterId 关联
 *
 * 渐进式迁移：
 * - 现有 chat 继续工作（Character 信息从 chat 推导）
 * - 新增 Character 实体存储（Dexie characters 表）
 * - UI 逐步支持 Character List 和 Character 管理
 * - 最终：Character 独立于 Conversation 存在
 */

import { store } from "../core/store.js";
import { events, EVT } from "../core/events.js";
import { uid } from "../core/utils.js";
import { CharacterRepository } from "../repository/character.js";
import { legacyAdapter } from "../repository/legacy-adapter.js";

// ============================================================
//  Character 实体定义
// ============================================================

/**
 * Character 实体
 * @typedef {Object} Character
 * @property {string} id - 稳定 UUID
 * @property {string} name - 角色名称
 * @property {string|null} avatar - 头像
 * @property {string} identity - 人设描述
 * @property {Object} personality - 人格
 * @property {Object} appearance - 外貌
 * @property {Object} speakingStyle - 说话风格
 * @property {Object} preferences - 偏好
 * @property {string} source - user_created | imported | reconstructed | guide
 * @property {boolean} isGuide - 是否引导角色
 * @property {string} status - active | archived | deleted
 * @property {number} createdAt
 * @property {number} updatedAt
 */

// ============================================================
//  从 V1 chat 推导 Character
// ============================================================

/**
 * 从 chat 推导 Character 对象（过渡用）
 * @param {Object} chat
 * @returns {Object}
 */
export function deriveCharacterFromChat(chat) {
  const persona = chat.config?.persona || {};
  return {
    id: chat.roleId,
    name: chat.name || persona.name || "Unknown",
    avatar: chat.avatar || null,
    identity: persona.persona || "",
    personality: {
      description: persona.persona || "",
      firstMessage: persona.first_mes || "",
      mesExample: persona.mes_example || "",
      scenario: persona.scenario || "",
    },
    appearance: {
      avatar: chat.avatar || null,
      visualDescription: "",
    },
    speakingStyle: {},
    preferences: {},
    source: chat.roleId?.startsWith("guide-") ? "guide" : "user_created",
    isGuide: chat.roleId?.startsWith("guide-") || false,
    status: "active",
    createdAt: chat.createdAt || Date.now(),
    updatedAt: chat.createdAt || Date.now(),
  };
}

// ============================================================
//  Character CRUD
// ============================================================

/**
 * 获取所有 Character（从 chats 推导，过渡用）
 * @param {Object} [options]
 * @param {boolean} [options.includeGuides=false]
 * @returns {Promise<Array>}
 */
export async function getAllCharacters(options = {}) {
  try {
    return await CharacterRepository.findAll(options);
  } catch (e) {
    console.warn("[Character] Repository findAll failed:", e.message);
    return [];
  }
}

/**
 * 按 ID 获取 Character
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getCharacterById(id) {
  try {
    return await CharacterRepository.findById(id);
  } catch (e) {
    console.warn("[Character] Repository findById failed:", e.message);
    return null;
  }
}

/**
 * 创建新 Character
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function createCharacter(data) {
  const character = {
    id: data.id || `char_${uid()}`,
    name: data.name || "新角色",
    avatar: data.avatar || null,
    identity: data.identity || data.persona || "",
    personality: data.personality || {
      description: data.persona || "",
      firstMessage: data.firstMessage || "",
    },
    appearance: data.appearance || { avatar: data.avatar || null },
    speakingStyle: data.speakingStyle || {},
    preferences: data.preferences || {},
    source: data.source || "user_created",
    isGuide: data.isGuide || false,
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 通过 Repository 写入（内部处理 Dexie + Legacy）
  try {
    await CharacterRepository.create(character);
  } catch (e) {
    console.warn("[Character] Repository create failed:", e.message);
  }

  events.emit("character_created", character);
  return character;
}

/**
 * 更新 Character
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<Object|null>}
 */
export async function updateCharacter(id, updates) {
  try {
    const updated = await CharacterRepository.update(id, updates);
    if (updated) {
      events.emit("character_updated", updated);
      return updated;
    }
  } catch (e) {
    console.warn("[Character] Repository update failed:", e.message);
  }
  return getCharacterById(id);
}

// ============================================================
//  Character 删除与级联策略
// ============================================================

/**
 * 删除 Character（软删除）
 *
 * Cascade Policy:
 * - Character: soft delete (status = "deleted")
 * - Conversations: archived (not deleted)
 * - Messages: retained (in archived conversations)
 * - Memories: soft delete
 * - Relationship: status = "deleted"
 * - Moments: soft delete
 * - Worldbook: character-specific books soft delete
 * - Assets: orphaned, cleaned up by GC
 *
 * 30 天 trash 窗口，可恢复。
 *
 * @param {string} id
 */
export async function deleteCharacter(id) {
  const character = await getCharacterById(id);
  if (!character) return;

  // 1. 软删除 Character
  await updateCharacter(id, { status: "deleted", deletedAt: Date.now() });

  // 2. 归档所有关联 Conversation
  const chats = store.getState().chats.filter((c) => c.roleId === id);
  for (const chat of chats) {
    store.updateChat(chat.id, { archivedAt: Date.now() });
  }

  // 3. 标记 Memories 为已删除（过渡：保留数据，标记状态）
  // Phase 7 实现完整 Memory 软删除

  // 4. 标记 Relationship 为已删除
  // Phase 9 实现

  // 5. 标记 Moments 为已删除
  // Phase 11 实现

  events.emit("character_deleted", { characterId: id, character });
  events.emit(EVT.TOAST, { message: `角色「${character.name}」已删除，可在 30 天内恢复`, type: "info" });
}

/**
 * 恢复 Character
 * @param {string} id
 */
export async function restoreCharacter(id) {
  await updateCharacter(id, { status: "active", deletedAt: null });

  // 恢复关联 Conversation
  const chats = store.getState().chats.filter((c) => c.roleId === id);
  for (const chat of chats) {
    store.updateChat(chat.id, { archivedAt: null });
  }

  events.emit("character_restored", { characterId: id });
  events.emit(EVT.TOAST, { message: "角色已恢复", type: "success" });
}

/**
 * 永久删除 Character（不可恢复）
 *
 * 级联删除所有关联数据：
 * - Character
 * - Conversations + Messages
 * - Memories
 * - Relationship + Events
 * - Moments + Comments + Reactions
 * - Worldbook (character-specific)
 * - Assets
 *
 * @param {string} id
 */
export async function permanentDeleteCharacter(id) {
  // 1. 删除所有关联 Conversation + Messages
  const chats = store.getState().chats.filter((c) => c.roleId === id);
  for (const chat of chats) {
    store.deleteChat(chat.id);
  }

  // 2. 删除 Memories
  const allMemory = store.getState().longTermMemory || {};
  delete allMemory[id];
  store.set((s) => ({ ...s, longTermMemory: allMemory }));

  // 3. 删除 Relationship（通过 Legacy Adapter）
  const relations = legacyAdapter.getAllRelations();
  delete relations.roles[id];
  legacyAdapter.setAllRelations(relations);

  // 4. 删除 Moments（通过 Legacy Adapter）
  const moments = legacyAdapter.getAllMoments().filter((m) => m.roleId !== id);
  legacyAdapter.setAllMoments(moments);

  // 5. 从 Dexie 删除（通过 Repository，如果可用）
  try {
    await CharacterRepository.permanentDelete(id);
  } catch (e) {
    console.warn("[Character] Repository permanentDelete failed:", e.message);
  }

  events.emit("character_permanently_deleted", { characterId: id });
}

// ============================================================
//  Character 统计
// ============================================================

/**
 * 获取 Character 统计信息
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getCharacterStats(id) {
  const chats = store.getState().chats.filter((c) => c.roleId === id);
  const totalMessages = chats.reduce((sum, c) => sum + (c.messages?.length || 0), 0);
  const memories = (store.getState().longTermMemory?.[id]?.memories || []).length;

  return {
    characterId: id,
    conversationCount: chats.length,
    totalMessages,
    memoryCount: memories,
    firstInteractionAt: chats[0]?.createdAt || null,
    lastInteractionAt: chats.reduce((latest, c) => {
      const last = c.messages?.[c.messages.length - 1]?.time || c.createdAt;
      return last > latest ? last : latest;
    }, 0),
  };
}

// ============================================================
//  迁移：从 chats 提取 Character 到 Dexie
// ============================================================

/**
 * 将所有 Character 从 chats 迁移到 Dexie characters 表
 * 幂等：已存在的 Character 不会重复创建
 */
export async function migrateCharactersToDexie() {
  return CharacterRepository.migrateFromLegacy();
}

// ============================================================
//  导出
// ============================================================

export const Character = {
  deriveCharacterFromChat,
  getAllCharacters,
  getCharacterById,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  restoreCharacter,
  permanentDeleteCharacter,
  getCharacterStats,
  migrateCharactersToDexie,
};
