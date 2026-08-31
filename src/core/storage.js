// ============================================================
//  EchoChat Rebuild · Storage Layer
//  统一 localStorage 封装 + Schema Version + Migration
//  解决：7个独立存储、0版本管理、0迁移机制 的问题
// ============================================================

import { events, EVT } from "./events.js";

const SCHEMA_VERSION = 2; // v1 = baseline 格式, v2 = rebuild 格式（稳定 roleId）

// 存储键定义
export const KEYS = {
  STATE: "echodownload_lite_state_v1", // 保持旧 key 名以兼容
  WORLDBOOK: "echodownload_worldbook_v1",
  MOMENTS: "echodownload_moments_v1",
  RELATIONS: "echodownload_relations_v1",
  META: "echodownload_meta_v2", // 新版本元数据（schema version, 迁移记录）
  ONBOARD_DONE: "echodownload_onboard_done",
  IOS_HINT: "echodownload_ios_hint",
};

// 迁移注册表：每个迁移函数接收旧数据，返回新数据
const migrations = {
  // v1 → v2: 为所有角色建立稳定 roleId，建立 roleKey→roleId 映射
  1: (data) => {
    const state = data.state || {};
    const chats = Array.isArray(state.chats) ? state.chats : [];

    // 为每个 chat 建立稳定 roleId（如果没有）
    const roleIdMap = {}; // old roleKey(hash persona) → new roleId
    chats.forEach((chat) => {
      if (!chat.roleId) {
        const persona = (chat.config && chat.config.persona) || "";
        const oldKey = persona ? hashStr(persona) : chat.id;
        if (!roleIdMap[oldKey]) {
          roleIdMap[oldKey] = "role_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        }
        chat.roleId = roleIdMap[oldKey];
      }
    });

    // 迁移长期记忆：roleKey → roleId
    const oldMemory = state.longTermMemory || {};
    const newMemory = {};
    Object.keys(oldMemory).forEach((oldKey) => {
      const newId = roleIdMap[oldKey] || "role_" + oldKey;
      newMemory[newId] = oldMemory[oldKey];
    });
    state.longTermMemory = newMemory;

    // 存储映射关系供其他模块使用
    data._roleIdMap = roleIdMap;

    return data;
  },
};

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return "m" + Math.abs(h).toString(36);
}

function readMeta() {
  try {
    const raw = localStorage.getItem(KEYS.META);
    return raw ? JSON.parse(raw) : { schemaVersion: 0, migratedAt: null };
  } catch (e) {
    return { schemaVersion: 0, migratedAt: null };
  }
}

function writeMeta(meta) {
  try {
    localStorage.setItem(KEYS.META, JSON.stringify(meta));
  } catch (e) {
    console.warn("[Storage] failed to write meta:", e);
  }
}

export function getSchemaVersion() {
  return readMeta().schemaVersion;
}

export function needsMigration() {
  return getSchemaVersion() < SCHEMA_VERSION;
}

export function runMigrations() {
  const meta = readMeta();
  let currentVersion = meta.schemaVersion;

  if (currentVersion >= SCHEMA_VERSION) return { migrated: false, from: currentVersion, to: SCHEMA_VERSION };

  // 读取所有数据
  const data = {
    state: safeParse(localStorage.getItem(KEYS.STATE)),
    worldbook: safeParse(localStorage.getItem(KEYS.WORLDBOOK)),
    moments: safeParse(localStorage.getItem(KEYS.MOMENTS)),
    relations: safeParse(localStorage.getItem(KEYS.RELATIONS)),
  };

  let migratedData = data;
  for (let v = currentVersion; v < SCHEMA_VERSION; v++) {
    if (migrations[v]) {
      try {
        migratedData = migrations[v](migratedData) || migratedData;
      } catch (e) {
        console.error(`[Storage] migration v${v}→v${v + 1} failed:`, e);
        // 迁移失败不阻断，记录后继续
      }
    }
  }

  // 应用迁移后的数据
  if (migratedData.state) safeSet(KEYS.STATE, migratedData.state);
  if (migratedData.worldbook) safeSet(KEYS.WORLDBOOK, migratedData.worldbook);
  if (migratedData.moments) safeSet(KEYS.MOMENTS, migratedData.moments);
  if (migratedData.relations) safeSet(KEYS.RELATIONS, migratedData.relations);

  // 迁移世界书/动态/关系中的 roleKey → roleId
  if (migratedData._roleIdMap) {
    migrateWorldbookRoleKeys(migratedData._roleIdMap);
    migrateMomentsRoleKeys(migratedData._roleIdMap);
    migrateRelationsRoleKeys(migratedData._roleIdMap);
  }

  writeMeta({ schemaVersion: SCHEMA_VERSION, migratedAt: Date.now() });
  events.emit(EVT.DATA_MIGRATED, { from: currentVersion, to: SCHEMA_VERSION });

  return { migrated: true, from: currentVersion, to: SCHEMA_VERSION };
}

function migrateWorldbookRoleKeys(roleIdMap) {
  try {
    const wb = safeParse(localStorage.getItem(KEYS.WORLDBOOK));
    if (!wb || !Array.isArray(wb.books)) return;
    wb.books.forEach((book) => {
      if (book.scope === "character" && book.roleKey && roleIdMap[book.roleKey]) {
        book.roleId = roleIdMap[book.roleKey];
      }
    });
    safeSet(KEYS.WORLDBOOK, wb);
  } catch (e) {
    console.warn("[Storage] worldbook roleKey migration failed:", e);
  }
}

function migrateMomentsRoleKeys(roleIdMap) {
  try {
    const mo = safeParse(localStorage.getItem(KEYS.MOMENTS));
    if (!mo || !Array.isArray(mo.moments)) return;
    mo.moments.forEach((m) => {
      if (m.roleKey && roleIdMap[m.roleKey]) {
        m.roleId = roleIdMap[m.roleKey];
      }
    });
    safeSet(KEYS.MOMENTS, mo);
  } catch (e) {
    console.warn("[Storage] moments roleKey migration failed:", e);
  }
}

function migrateRelationsRoleKeys(roleIdMap) {
  try {
    const rel = safeParse(localStorage.getItem(KEYS.RELATIONS));
    if (!rel || !rel.roles) return;
    const newRoles = {};
    Object.keys(rel.roles).forEach((oldKey) => {
      const newId = roleIdMap[oldKey] || oldKey;
      newRoles[newId] = rel.roles[oldKey];
    });
    rel.roles = newRoles;
    safeSet(KEYS.RELATIONS, rel);
  } catch (e) {
    console.warn("[Storage] relations roleKey migration failed:", e);
  }
}

function safeParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`[Storage] failed to set ${key}:`, e);
    events.emit(EVT.ERROR, { type: "storage", key, error: e });
    return false;
  }
}

function safeGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`[Storage] failed to remove ${key}:`, e);
  }
}

// 通用存储接口
export const storage = {
  get: safeGet,
  set: safeSet,
  remove: safeRemove,
  getRaw: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setRaw: (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  },
  keys: () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      keys.push(localStorage.key(i));
    }
    return keys;
  },
  estimate: async () => {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        return await navigator.storage.estimate();
      } catch (e) {
        return null;
      }
    }
    return null;
  },
  clearAll: () => {
    Object.values(KEYS).forEach((k) => safeRemove(k));
  },
};

export { SCHEMA_VERSION };
