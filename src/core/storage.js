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
  const currentVersion = meta.schemaVersion;

  if (currentVersion >= SCHEMA_VERSION) {
    return { migrated: false, from: currentVersion, to: SCHEMA_VERSION, success: true };
  }

  console.log(`[Migration] starting v${currentVersion} → v${SCHEMA_VERSION}`);
  const migrationLog = { startedAt: Date.now(), steps: [], errors: [] };

  // ---- Step 1: Detect & Validate Source ----
  const rawData = {
    state: localStorage.getItem(KEYS.STATE),
    worldbook: localStorage.getItem(KEYS.WORLDBOOK),
    moments: localStorage.getItem(KEYS.MOMENTS),
    relations: localStorage.getItem(KEYS.RELATIONS),
  };

  // 备份原始数据到内存（失败时可用于诊断，不写回以避免半迁移状态）
  const backup = { ...rawData };

  // 解析并验证源数据
  const data = {
    state: safeParse(rawData.state),
    worldbook: safeParse(rawData.worldbook),
    moments: safeParse(rawData.moments),
    relations: safeParse(rawData.relations),
  };

  // 验证 state 基本结构（如果存在）
  if (data.state && typeof data.state !== "object") {
    migrationLog.errors.push("invalid state format");
    return failMigration(currentVersion, migrationLog, "源数据 state 格式无效");
  }

  migrationLog.steps.push("source validated");

  // ---- Step 2: Transform ----
  let migratedData = { ...data };
  for (let v = currentVersion; v < SCHEMA_VERSION; v++) {
    if (migrations[v]) {
      try {
        const result = migrations[v](migratedData);
        if (!result) throw new Error(`migration v${v} returned null`);
        migratedData = result;
        migrationLog.steps.push(`transform v${v}→v${v + 1} ok`);
      } catch (e) {
        migrationLog.errors.push(`transform v${v} failed: ${e.message}`);
        console.error(`[Migration] transform v${v}→v${v + 1} failed:`, e);
        // 转换失败：不写入任何数据，保留原始数据
        return failMigration(currentVersion, migrationLog, `数据转换失败: ${e.message}`);
      }
    }
  }

  // ---- Step 3: Validate Transformed Result ----
  if (migratedData.state && typeof migratedData.state !== "object") {
    return failMigration(currentVersion, migrationLog, "转换后 state 格式无效");
  }
  // 验证 chats 数组结构
  if (migratedData.state?.chats && !Array.isArray(migratedData.state.chats)) {
    return failMigration(currentVersion, migrationLog, "转换后 chats 不是数组");
  }
  migrationLog.steps.push("transformed result validated");

  // ---- Step 4: Commit (写入所有数据) ----
  const writeResults = [];
  if (migratedData.state !== null) writeResults.push(safeSet(KEYS.STATE, migratedData.state));
  if (migratedData.worldbook !== null) writeResults.push(safeSet(KEYS.WORLDBOOK, migratedData.worldbook));
  if (migratedData.moments !== null) writeResults.push(safeSet(KEYS.MOMENTS, migratedData.moments));
  if (migratedData.relations !== null) writeResults.push(safeSet(KEYS.RELATIONS, migratedData.relations));

  // 迁移世界书/动态/关系中的 roleKey → roleId
  if (migratedData._roleIdMap) {
    try {
      migrateWorldbookRoleKeys(migratedData._roleIdMap);
      migrateMomentsRoleKeys(migratedData._roleIdMap);
      migrateRelationsRoleKeys(migratedData._roleIdMap);
      migrationLog.steps.push("roleKey migration ok");
    } catch (e) {
      migrationLog.errors.push(`roleKey migration failed: ${e.message}`);
      // 注意：此时主数据已写入，但 roleKey 迁移失败
      // 不标记 schema version，允许下次重试
      return failMigration(currentVersion, migrationLog, `roleKey 迁移失败: ${e.message}`);
    }
  }

  // 检查所有写入是否成功
  if (writeResults.some((r) => r === false)) {
    return failMigration(currentVersion, migrationLog, "部分数据写入失败（存储可能已满）");
  }
  migrationLog.steps.push("all data committed");

  // ---- Step 5: Mark Schema Version (只有完整成功后才升级) ----
  writeMeta({
    schemaVersion: SCHEMA_VERSION,
    migratedAt: Date.now(),
    migrationLog: { ...migrationLog, completedAt: Date.now() },
  });
  migrationLog.steps.push("schema version marked");

  events.emit(EVT.DATA_MIGRATED, { from: currentVersion, to: SCHEMA_VERSION });
  console.log(`[Migration] completed v${currentVersion} → v${SCHEMA_VERSION}`);

  return { migrated: true, from: currentVersion, to: SCHEMA_VERSION, success: true };
}

// 迁移失败处理：不标记成功，保留原始数据，允许安全重试
function failMigration(fromVersion, log, reason) {
  console.error(`[Migration] FAILED v${fromVersion}: ${reason}`);
  // 写入失败记录（但不升级 schema version，下次启动会重试）
  writeMeta({
    schemaVersion: fromVersion, // 保持原版本
    lastFailedAt: Date.now(),
    lastFailureReason: reason,
    failureLog: log,
  });
  events.emit(EVT.ERROR, { type: "migration", reason, fromVersion });
  return { migrated: false, from: fromVersion, to: SCHEMA_VERSION, success: false, reason };
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
