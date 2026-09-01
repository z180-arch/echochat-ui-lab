/**
 * CharacterRepository
 *
 * Stage 3: Dexie is the runtime source of truth.
 * Legacy fallback from chats is kept only when Dexie is unavailable or
 * a character has not been migrated yet. Domain no longer derives a
 * second copy.
 */

import { legacyAdapter } from "./legacy-adapter.js";
import { getStorageHooks } from "./test-hooks.js";

function chatToCharacter(chat) {
  const raw = chat.config?.persona;
  const identity = typeof raw === "string" ? raw : (raw?.persona || raw?.description || "");
  return {
    id: chat.roleId,
    name: chat.name || raw?.name || "Unknown",
    avatar: chat.avatar || null,
    identity,
    personality: {
      description: identity,
      firstMessage: raw?.first_mes || "",
      mesExample: raw?.mes_example || "",
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
  async findById(id) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        const char = await hooks.character.findById(id);
        if (char) return char;
      }
    } catch (e) {
      // fallback to legacy
    }

    const chats = legacyAdapter.getChatsByRoleId(id);
    if (chats.length === 0) return null;
    return chatToCharacter(chats[0]);
  },

  async findAll(options = {}) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        const chars = await hooks.character.findAll(options);
        if (chars.length > 0) return chars;
      }
    } catch (e) {
      // fallback to legacy
    }

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

  async create(character) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        await hooks.character.create(character);
      }
    } catch (e) {
      console.warn("[CharacterRepository] Dexie create failed:", e.message);
    }
    return character;
  },

  async update(id, updates) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        const updated = await hooks.character.update(id, updates);
        if (updated) {
          const chats = legacyAdapter.getChatsByRoleId(id);
          for (const chat of chats) {
            legacyAdapter.updateChat(chat.id, (c) => {
              c.config = c.config || {};
              if (updates.personality) {
                c.config.persona = { ...c.config.persona, ...updates.personality };
              }
              if (updates.name) c.name = updates.name;
              if (updates.avatar) c.avatar = updates.avatar;
              return c;
            });
          }
          return updated;
        }
      }
    } catch (e) {
      // fallback to legacy
    }

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
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        await hooks.character.update(id, { status: "deleted", deletedAt: Date.now() });
      }
    } catch (e) {
      // fallback
    }

    const chats = legacyAdapter.getChatsByRoleId(id);
    for (const chat of chats) {
      legacyAdapter.updateChat(chat.id, (c) => ({ ...c, archivedAt: Date.now() }));
    }
  },

  async restore(id) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        await hooks.character.update(id, { status: "active", deletedAt: null });
      }
    } catch (e) {
      // fallback
    }

    const chats = legacyAdapter.getChatsByRoleId(id);
    for (const chat of chats) {
      legacyAdapter.updateChat(chat.id, (c) => ({ ...c, archivedAt: null }));
    }
  },

  async permanentDelete(id) {
    const hooks = getStorageHooks();
    try {
      if (await hooks.isAvailable()) {
        await hooks.character.permanentDelete(id);
      }
    } catch (e) {
      // fallback
    }

    const chats = legacyAdapter.getChatsByRoleId(id);
    for (const chat of chats) {
      legacyAdapter.removeChat(chat.id);
    }

    const allMemory = legacyAdapter.getAllMemory();
    delete allMemory[id];
    legacyAdapter.setStateKey("longTermMemory", allMemory);

    const relations = legacyAdapter.getAllRelations();
    delete relations.roles[id];
    legacyAdapter.setAllRelations(relations);

    const moments = legacyAdapter.getAllMoments().filter((m) => m.roleId !== id);
    legacyAdapter.setAllMoments(moments);
  },

  async countChats(id) {
    return legacyAdapter.getChatsByRoleId(id).length;
  },

  /**
   * Idempotent: copy Character records derived from legacy chats into Dexie.
   * Does not delete chats. Uses the Dexie adapter directly so repository
   * fallback cannot mask "not yet in Dexie".
   */
  async migrateFromLegacy() {
    const hooks = getStorageHooks();
    if (!(await hooks.isAvailable())) {
      return { migrated: 0, skipped: true, total: 0 };
    }
    const chats = legacyAdapter.getAllChats() || [];
    const seen = new Set();
    const characters = [];
    for (const chat of chats) {
      if (!chat.roleId || seen.has(chat.roleId)) continue;
      seen.add(chat.roleId);
      characters.push(chatToCharacter(chat));
    }
    let migrated = 0;
    for (const char of characters) {
      try {
        const existing = await hooks.character.findById(char.id);
        if (!existing) {
          await hooks.character.create(char);
          migrated++;
        }
      } catch (e) {
        console.warn("[CharacterRepository] migrate", char.id, e.message);
      }
    }
    return { migrated, total: characters.length };
  },
};
