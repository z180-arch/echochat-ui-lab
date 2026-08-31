/**
 * CharacterRepository (Legacy + Dexie Implementation)
 *
 * Phase 1 过渡实现：从现有 chats 中推导 Character 信息。
 * Phase 5 扩展为真正的 Character 一级实体存储（Dexie）。
 *
 * Repository 层可以同时访问 Dexie Adapter 和 Legacy Adapter。
 * Domain 层只通过 Repository 接口访问，不直接访问 storage。
 */
import { legacyAdapter } from "./legacy-adapter.js";
import { dexieCharacterAdapter } from "../infrastructure/dexie-adapter.js";
import { isDbAvailable } from "../infrastructure/dexie-db.js";

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
    chatCount: 1,
  };
}

export const CharacterRepository = {
  /**
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    // 优先从 Dexie 读取
    const available = await isDbAvailable();
    if (available) {
      try {
        const char = await dexieCharacterAdapter.findById(id);
        if (char) return char;
      } catch (e) {
        // fallback to legacy
      }
    }

    // Fallback: 从 chats 推导
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
    // 优先从 Dexie 读取
    const available = await isDbAvailable();
    if (available) {
      try {
        const chars = await dexieCharacterAdapter.findAll(options);
        if (chars.length > 0) return chars;
      } catch (e) {
        // fallback to legacy
      }
    }

    // Fallback: 从 chats 推导
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
   * 创建 Character（写入 Dexie，如果可用）
   */
  async create(character) {
    const available = await isDbAvailable();
    if (available) {
      try {
        await dexieCharacterAdapter.create(character);
      } catch (e) {
        console.warn("[CharacterRepository] Dexie create failed:", e.message);
      }
    }
    return character;
  },

  async update(id, updates) {
    // 1. 更新 Dexie（如果可用）
    const available = await isDbAvailable();
    if (available) {
      try {
        const updated = await dexieCharacterAdapter.update(id, updates);
        if (updated) return updated;
      } catch (e) {
        // fallback to legacy
      }
    }

    // 2. Fallback: 更新所有关联 chat 的 config
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
    // 1. 软删除 Dexie 中的 Character
    const available = await isDbAvailable();
    if (available) {
      try {
        await dexieCharacterAdapter.update(id, { status: "deleted", deletedAt: Date.now() });
      } catch (e) {
        // fallback
      }
    }

    // 2. 归档所有关联 chat
    const chats = legacyAdapter.getChatsByRoleId(id);
    for (const chat of chats) {
      legacyAdapter.updateChat(chat.id, (c) => ({ ...c, archivedAt: Date.now() }));
    }
  },

  async restore(id) {
    // 1. 恢复 Dexie 中的 Character
    const available = await isDbAvailable();
    if (available) {
      try {
        await dexieCharacterAdapter.update(id, { status: "active", deletedAt: null });
      } catch (e) {
        // fallback
      }
    }

    // 2. 恢复关联 chat
    const chats = legacyAdapter.getChatsByRoleId(id);
    for (const chat of chats) {
      legacyAdapter.updateChat(chat.id, (c) => ({ ...c, archivedAt: null }));
    }
  },

  async permanentDelete(id) {
    // 1. 从 Dexie 删除
    const available = await isDbAvailable();
    if (available) {
      try {
        await dexieCharacterAdapter.permanentDelete(id);
      } catch (e) {
        // fallback
      }
    }

    // 2. 删除所有关联 chat
    const chats = legacyAdapter.getChatsByRoleId(id);
    for (const chat of chats) {
      legacyAdapter.removeChat(chat.id);
    }

    // 3. 清理 memory
    const allMemory = legacyAdapter.getAllMemory();
    delete allMemory[id];
    legacyAdapter.setStateKey("longTermMemory", allMemory);

    // 4. 清理 relation
    const relations = legacyAdapter.getAllRelations();
    delete relations.roles[id];
    legacyAdapter.setAllRelations(relations);

    // 5. 清理 moments
    const moments = legacyAdapter.getAllMoments().filter((m) => m.roleId !== id);
    legacyAdapter.setAllMoments(moments);
  },

  async countChats(id) {
    return legacyAdapter.getChatsByRoleId(id).length;
  },
};
