/**
 * MemoryRepository (Legacy Implementation)
 *
 * Phase 1 过渡实现：包装现有 state.longTermMemory。
 * Phase 7 将扩展为多类型 Memory（短期/长期/关系/角色/社交）。
 */

import { legacyAdapter } from "./legacy-adapter.js";

function memoryToV2(m, characterId) {
  return {
    id: m.id,
    characterId,
    type: m.type || "long_term",
    content: m.content,
    importance: m.importance || 5,
    source: m.source || "auto_summary",
    confidence: m.confidence ?? 1,
    createdAt: m.createdAt || Date.now(),
    updatedAt: m.updatedAt || m.createdAt || Date.now(),
    tags: m.tags || [],
  };
}

export const MemoryRepository = {
  async findById(id) {
    const all = legacyAdapter.getAllMemory();
    for (const [characterId, data] of Object.entries(all)) {
      const m = data.memories?.find((x) => x.id === id);
      if (m) return memoryToV2(m, characterId);
    }
    return null;
  },

  async findByCharacterId(characterId, options = {}) {
    let memories = legacyAdapter.getMemoriesByRoleId(characterId);
    if (options.type) {
      memories = memories.filter((m) => (m.type || "long_term") === options.type);
    }
    if (options.limit) {
      memories = memories.slice(0, options.limit);
    }
    return memories.map((m) => memoryToV2(m, characterId));
  },

  /**
   * 检索相关记忆（Context Builder 用）
   * 当前 Legacy 实现：按 importance 排序取 top N。
   * Phase 7：语义检索 + token budget。
   */
  async findRelevant(characterId, query = {}) {
    const memories = legacyAdapter.getMemoriesByRoleId(characterId);
    const limit = query.limit || 10;
    return [...memories]
      .sort((a, b) => (b.importance || 5) - (a.importance || 5))
      .slice(0, limit)
      .map((m) => memoryToV2(m, characterId));
  },

  async create(memory) {
    const memories = legacyAdapter.getMemoriesByRoleId(memory.characterId);
    const m = {
      id: memory.id || `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: memory.content,
      importance: memory.importance || 5,
      source: memory.source || "manual",
      type: memory.type || "long_term",
      confidence: memory.confidence ?? 1,
      createdAt: Date.now(),
      tags: memory.tags || [],
    };
    memories.push(m);
    legacyAdapter.setMemoriesByRoleId(memory.characterId, memories);
    return memoryToV2(m, memory.characterId);
  },

  async update(id, updates) {
    const all = legacyAdapter.getAllMemory();
    for (const [characterId, data] of Object.entries(all)) {
      const idx = data.memories?.findIndex((m) => m.id === id);
      if (idx !== -1) {
        data.memories[idx] = { ...data.memories[idx], ...updates, updatedAt: Date.now() };
        legacyAdapter.setStateKey("longTermMemory", all);
        return memoryToV2(data.memories[idx], characterId);
      }
    }
    return null;
  },

  async delete(id) {
    const all = legacyAdapter.getAllMemory();
    for (const [characterId, data] of Object.entries(all)) {
      const before = data.memories?.length || 0;
      data.memories = (data.memories || []).filter((m) => m.id !== id);
      if (data.memories.length !== before) {
        legacyAdapter.setStateKey("longTermMemory", all);
        return;
      }
    }
  },

  async findDuplicate(characterId, content) {
    const memories = legacyAdapter.getMemoriesByRoleId(characterId);
    return memories.find((m) => m.content === content) || null;
  },

  async countByCharacterId(characterId) {
    return legacyAdapter.getMemoriesByRoleId(characterId).length;
  },
};
