/**
 * RelationshipRepository + RelationshipEventRepository (Legacy Implementation)
 *
 * Phase 1 过渡实现：包装现有 localStorage RELATIONS。
 * Phase 9 将扩展为 Current State + Event History 模型。
 *
 * 当前 V1 中 relation 是单数值 affinity，无事件历史。
 * 此 Repository 提供统一接口，Phase 9 增加事件存储。
 */

import { legacyAdapter } from "./legacy-adapter.js";

function relationToV2(roleId, data) {
  return {
    id: `rel-${roleId}`,
    characterId: roleId,
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
  };
}

export const RelationshipRepository = {
  async findByCharacterId(characterId) {
    const data = legacyAdapter.getRelationByRoleId(characterId);
    if (!data) return null;
    return relationToV2(characterId, data);
  },

  async create(relationship) {
    const data = {
      roleName: relationship.roleName || "",
      chatTurns: 0,
      affinity: relationship.affinity || 0,
      trust: relationship.trust || 0,
      familiarity: relationship.familiarity || 0,
      intimacy: relationship.intimacy || 0,
      tension: relationship.tension || 0,
      streakDays: 0,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    legacyAdapter.updateRelation(relationship.characterId, data);
    return relationToV2(relationship.characterId, data);
  },

  async update(characterId, updates) {
    const data = legacyAdapter.getRelationByRoleId(characterId);
    if (!data) {
      return this.create({ characterId, ...updates });
    }
    const merged = { ...data, ...updates, updatedAt: Date.now() };
    legacyAdapter.updateRelation(characterId, merged);
    return relationToV2(characterId, merged);
  },

  async block(characterId) {
    return this.update(characterId, { status: "blocked" });
  },

  async unblock(characterId) {
    return this.update(characterId, { status: "active" });
  },

  async reset(characterId) {
    return this.update(characterId, {
      affinity: 0,
      trust: 0,
      familiarity: 0,
      intimacy: 0,
      tension: 0,
      chatTurns: 0,
      streakDays: 0,
    });
  },
};

// ============================================================
//  RelationshipEventRepository
//  Phase 9 实现。当前 Legacy 实现为空操作（V1 无事件存储）。
// ============================================================

export const RelationshipEventRepository = {
  /**
   * 追加关系事件。
   * Phase 9: 写入独立事件存储。
   * 当前: 更新 relation 的当前状态（无事件历史）。
   */
  async append(event) {
    // Phase 9: 写入 relationship_events 存储
    // 当前: 只更新当前状态，不记录历史
    if (event.affinityDelta) {
      const rel = await RelationshipRepository.findByCharacterId(event.characterId);
      if (rel) {
        await RelationshipRepository.update(event.characterId, {
          affinity: Math.max(0, Math.min(100, (rel.affinity || 0) + event.affinityDelta)),
          lastInteractionAt: event.timestamp || Date.now(),
        });
      }
    }
    return { ...event, id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  },

  async findByRelationshipId(relationshipId, options = {}) {
    // Phase 9: 从事件存储读取
    // 当前: 返回空数组（V1 无事件历史）
    return [];
  },

  async countByRelationshipId(relationshipId) {
    return 0;
  },

  async rebuildState(relationshipId) {
    // Phase 9: 从事件历史重建状态
    // 当前: 返回当前存储的状态
    const characterId = relationshipId.replace("rel-", "");
    return RelationshipRepository.findByCharacterId(characterId);
  },
};
