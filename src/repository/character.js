/**
 * CharacterRepository (Legacy Implementation)
 *
 * Phase 1 过渡实现：从现有 chats 中推导 Character 信息。
 * Phase 5 将替换为真正的 Character 一级实体存储。
 *
 * 当前 V1 数据模型中，角色信息散落在 chat.config.persona 中，
 * roleId 是角色的唯一标识。此 Repository 提供统一的 Character 访问接口。
 */

import { legacyAdapter } from "./legacy-adapter.js";

/**
 * 从 chat 推导 Character 对象
 * @param {Object} chat
 * @returns {Object}
 */
function chatToCharacter(chat) {
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
    },
    appearance: {
      avatar: chat.avatar || null,
      visualDescription: "",
    },
    speakingStyle: {},
    preferences: {},
    source: chat.roleId?.startsWith("guide-") ? "guide" : "user_created",
    isGuide: chat.roleId?.startsWith("guide-") || false,
    createdAt: chat.createdAt || Date.now(),
    updatedAt: chat.createdAt || Date.now(),
    status: "active",
    chatCount: 1, // V1 中一个 roleId 可能对应多个 chat，但当前模型是 1:1
  };
}

export const CharacterRepository = {
  /**
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    const chats = legacyAdapter.getChatsByRoleId(id);
    if (chats.length === 0) return null;
    return chatToCharacter(chats[0]);
  },

  /**
   * @param {Object} [options]
   * @param {boolean} [options.includeGuides=false]
   * @returns {Promise<Array>}
   */
  async findAll(options = {}) {
    const chats = legacyAdapter.getAllChats();
    const seen = new Set();
    const characters = [];
    for (const chat of chats) {
      if (seen.has(chat.roleId)) continue;
      seen.add(chat.roleId);
      const char = chatToCharacter(chat);
      if (!options.includeGuides && char.isGuide) continue;
      characters.push(char);
    }
    return characters;
  },

  /**
   * Phase 5 实现。当前返回 null（V1 不支持独立创建 Character）。
   */
  async create(character) {
    // Phase 5: 写入独立 Character store
    // 当前 V1 通过创建 chat 间接创建角色
    return character;
  },

  async update(id, updates) {
    // Phase 5: 更新独立 Character store
    // 当前更新 chat.config.persona
    const chats = legacyAdapter.getChatsByRoleId(id);
    for (const chat of chats) {
      legacyAdapter.updateChat(chat.id, (c) => {
        c.config = c.config || {};
        c.config.persona = { ...c.config.persona, ...updates.personality };
        if (updates.name) c.name = updates.name;
        if (updates.avatar) c.avatar = updates.avatar;
        return c;
      });
    }
    return this.findById(id);
  },

  async softDelete(id) {
    // Phase 5: 软删除 Character
    // 当前删除所有关联 chat
    const chats = legacyAdapter.getChatsByRoleId(id);
    for (const chat of chats) {
      legacyAdapter.removeChat(chat.id);
    }
  },

  async restore(id) {
    // Phase 5: 从回收站恢复
  },

  async permanentDelete(id) {
    // Phase 5: 永久删除 + 级联清理
    await this.softDelete(id);
    // 清理 memory
    const allMemory = legacyAdapter.getAllMemory();
    delete allMemory[id];
    legacyAdapter.setStateKey("longTermMemory", allMemory);
    // 清理 relation
    const relations = legacyAdapter.getAllRelations();
    delete relations.roles[id];
    legacyAdapter.setAllRelations(relations);
    // 清理 moments
    const moments = legacyAdapter.getAllMoments().filter((m) => m.roleId !== id);
    legacyAdapter.setAllMoments(moments);
  },

  async countChats(id) {
    return legacyAdapter.getChatsByRoleId(id).length;
  },
};
