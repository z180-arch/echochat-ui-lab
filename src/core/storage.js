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
  MIGRATION_STAGING: "echodownload_migration_staging_v2", // 两阶段提交 staging
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
    // 已是最新版本，清理可能残留的 staging
    clearStaging();
    return { migrated: false, from: currentVersion, to: SCHEMA_VERSION, success: true };
  }

  const migrationLog = { startedAt: Date.now(), steps: [], errors: [] };

  // ---- Step 0: Recovery Check（检测上次中断的 staging commit）----
  const staging = readStaging();
  if (staging && staging.targetVersion === SCHEMA_VERSION && staging.snapshot) {
    console.log("[Migration] detected pending staging, attempting recovery commit");
    migrationLog.steps.push("recovery: pending staging detected");
    const recoverResult = commitSnapshot(staging.snapshot);
    if (recoverResult.success) {
      writeMeta({
        schemaVersion: SCHEMA_VERSION,
        migratedAt: Date.now(),
        recoveredFromStaging: true,
      });
      clearStaging();
      migrationLog.steps.push("recovery: commit succeeded");
      events.emit(EVT.DATA_MIGRATED, { from: currentVersion, to: SCHEMA_VERSION, recovered: true });
      console.log(`[Migration] recovered from staging v${currentVersion} → v${SCHEMA_VERSION}`);
      return { migrated: true, from: currentVersion, to: SCHEMA_VERSION, success: true, recovered: true };
    }
    migrationLog.errors.push(`recovery commit failed: ${JSON.stringify(recoverResult.results)}`);
    return failMigration(currentVersion, migrationLog, "staging recovery commit 失败，将在下次启动重试");
  }
  if (staging) {
    console.warn("[Migration] staging data invalid, removing and restarting migration");
    clearStaging();
  }

  console.log(`[Migration] starting v${currentVersion} → v${SCHEMA_VERSION}`);

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

  // ---- Step 2: Transform (全部在内存中完成，不修改 localStorage) ----
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
        return failMigration(currentVersion, migrationLog, `数据转换失败: ${e.message}`);
      }
    }
  }

  // 在内存 snapshot 中完成所有 roleKey → roleId 转换（不读写 localStorage，不吞异常）
  if (migratedData._roleIdMap) {
    try {
      migratedData.worldbook = transformWorldbookRoleKeysInMemory(
        migratedData.worldbook,
        migratedData._roleIdMap
      );
      migratedData.moments = transformMomentsRoleKeysInMemory(
        migratedData.moments,
        migratedData._roleIdMap
      );
      migratedData.relations = transformRelationsRoleKeysInMemory(
        migratedData.relations,
        migratedData._roleIdMap
      );
      migrationLog.steps.push("roleKey transform in-memory ok");
    } catch (e) {
      migrationLog.errors.push(`roleKey transform failed: ${e.message}`);
      console.error("[Migration] roleKey in-memory transform failed:", e);
      return failMigration(currentVersion, migrationLog, `roleKey 转换失败: ${e.message}`);
    }
  }

  // ---- Step 3: Validate Complete Snapshot (所有模块验证通过后才能 commit) ----
  if (migratedData.state && typeof migratedData.state !== "object") {
    return failMigration(currentVersion, migrationLog, "转换后 state 格式无效");
  }
  if (migratedData.state?.chats && !Array.isArray(migratedData.state.chats)) {
    return failMigration(currentVersion, migrationLog, "转换后 chats 不是数组");
  }
  if (migratedData.worldbook && typeof migratedData.worldbook !== "object") {
    return failMigration(currentVersion, migrationLog, "转换后 worldbook 格式无效");
  }
  if (migratedData.moments && typeof migratedData.moments !== "object") {
    return failMigration(currentVersion, migrationLog, "转换后 moments 格式无效");
  }
  if (migratedData.relations && typeof migratedData.relations !== "object") {
    return failMigration(currentVersion, migrationLog, "转换后 relations 格式无效");
  }
  migrationLog.steps.push("complete snapshot validated");

  // ---- Step 4: Two-Phase Commit ----
  // Phase 1 (Prepare): 完整 snapshot 写入单个 staging key
  // 此阶段失败时，正式 key 完全未动，旧数据完整
  const snapshot = {
    state: migratedData.state,
    worldbook: migratedData.worldbook,
    moments: migratedData.moments,
    relations: migratedData.relations,
  };
  if (!writeStaging(backup, snapshot)) {
    return failMigration(currentVersion, migrationLog, "staging 写入失败（存储可能已满），旧数据未受影响");
  }
  migrationLog.steps.push("staging prepared");

  // Phase 2 (Commit): 从 staging 逐个写入正式 key
  // 此阶段失败时，staging 保留完整 snapshot，下次启动可恢复
  const commitResult = commitSnapshot(snapshot);
  if (!commitResult.success) {
    migrationLog.errors.push(`commit failed: ${JSON.stringify(commitResult.results)}`);
    return failMigration(currentVersion, migrationLog, "正式数据写入失败，staging 已保留，下次启动自动恢复");
  }
  migrationLog.steps.push("all data committed from staging");

  // ---- Step 5: Mark Schema Version + Cleanup Staging ----
  writeMeta({
    schemaVersion: SCHEMA_VERSION,
    migratedAt: Date.now(),
    migrationLog: { ...migrationLog, completedAt: Date.now() },
  });
  clearStaging();
  migrationLog.steps.push("schema version marked, staging cleared");

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

// 从 snapshot 原子性地提交 4 个正式 key（返回每个 key 的写入结果）
function commitSnapshot(snapshot) {
  const results = {
    state: null,
    worldbook: null,
    moments: null,
    relations: null,
  };
  if (snapshot.state !== undefined && snapshot.state !== null) {
    results.state = safeSet(KEYS.STATE, snapshot.state);
  }
  if (snapshot.worldbook !== undefined && snapshot.worldbook !== null) {
    results.worldbook = safeSet(KEYS.WORLDBOOK, snapshot.worldbook);
  }
  if (snapshot.moments !== undefined && snapshot.moments !== null) {
    results.moments = safeSet(KEYS.MOMENTS, snapshot.moments);
  }
  if (snapshot.relations !== undefined && snapshot.relations !== null) {
    results.relations = safeSet(KEYS.RELATIONS, snapshot.relations);
  }
  const allOk = Object.values(results).every((r) => r === true || r === null);
  return { success: allOk, results };
}

// 读取 staging 数据（上次中断的迁移）
function readStaging() {
  try {
    const raw = localStorage.getItem(KEYS.MIGRATION_STAGING);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// 写入 staging record（包含旧数据 backup + 新数据 snapshot，单个 key 原子写入）
// backup: 旧数据原始字符串值，用于 rollback 恢复
// snapshot: 完整新数据，用于 commit/recovery 重放
function writeStaging(backup, snapshot) {
  return safeSet(KEYS.MIGRATION_STAGING, {
    targetVersion: SCHEMA_VERSION,
    createdAt: Date.now(),
    backup,
    snapshot,
  });
}

// 删除 staging
function clearStaging() {
  safeRemove(KEYS.MIGRATION_STAGING);
}

// 从 staging.backup 回滚旧数据（用于需要中止迁移时恢复）
function rollbackFromStaging(staging) {
  if (!staging || !staging.backup) return false;
  const b = staging.backup;
  let ok = true;
  // 恢复旧数据原始字符串值（不经过 JSON 序列化，保持原样）
  try {
    if (b.state !== undefined && b.state !== null) localStorage.setItem(KEYS.STATE, b.state);
    else localStorage.removeItem(KEYS.STATE);
  } catch (e) { ok = false; }
  try {
    if (b.worldbook !== undefined && b.worldbook !== null) localStorage.setItem(KEYS.WORLDBOOK, b.worldbook);
    else localStorage.removeItem(KEYS.WORLDBOOK);
  } catch (e) { ok = false; }
  try {
    if (b.moments !== undefined && b.moments !== null) localStorage.setItem(KEYS.MOMENTS, b.moments);
    else localStorage.removeItem(KEYS.MOMENTS);
  } catch (e) { ok = false; }
  try {
    if (b.relations !== undefined && b.relations !== null) localStorage.setItem(KEYS.RELATIONS, b.relations);
    else localStorage.removeItem(KEYS.RELATIONS);
  } catch (e) { ok = false; }
  return ok;
}

// 纯内存转换：worldbook 中 roleKey → roleId（不读写 localStorage，不吞异常）
function transformWorldbookRoleKeysInMemory(worldbook, roleIdMap) {
  if (!worldbook || !Array.isArray(worldbook.books)) return worldbook;
  worldbook.books.forEach((book) => {
    if (book.scope === "character" && book.roleKey && roleIdMap[book.roleKey]) {
      book.roleId = roleIdMap[book.roleKey];
    }
  });
  return worldbook;
}

// 纯内存转换：moments 中 roleKey → roleId
function transformMomentsRoleKeysInMemory(moments, roleIdMap) {
  if (!moments || !Array.isArray(moments.moments)) return moments;
  moments.moments.forEach((m) => {
    if (m.roleKey && roleIdMap[m.roleKey]) {
      m.roleId = roleIdMap[m.roleKey];
    }
  });
  return moments;
}

// 纯内存转换：relations 中 roleKey → roleId
function transformRelationsRoleKeysInMemory(relations, roleIdMap) {
  if (!relations || !relations.roles) return relations;
  const newRoles = {};
  Object.keys(relations.roles).forEach((oldKey) => {
    const newId = roleIdMap[oldKey] || oldKey;
    newRoles[newId] = relations.roles[oldKey];
  });
  relations.roles = newRoles;
  return relations;
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
