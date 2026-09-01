// Migration Atomicity — Production Integration Test
// 直接 import 并执行 production src/core/storage.js 的真实 runMigrations()
// 不复制核心实现

import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Mock localStorage ----
const store = {};
const localStorageMock = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; },
  get length() { return Object.keys(store).length; },
  key: (i) => Object.keys(store)[i],
};
global.localStorage = localStorageMock;

// ---- Import production storage.js ----
// Use pathToFileURL so absolute Windows paths (D:\...) import correctly under Node ESM
const storage = await import(pathToFileURL(join(__dirname, "../src/core/storage.js")).href);
const { runMigrations, KEYS, SCHEMA_VERSION } = storage;

// ---- Test helpers ----
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return "m" + Math.abs(h).toString(36);
}

function setupV1Data() {
  localStorageMock.clear();
  const persona = "白若，性格温柔清冷";
  const oldKey = hashStr(persona);
  const v1State = {
    chats: [{
      id: "chat1",
      name: "白若",
      config: { persona },
      messages: [{ role: "me", text: "你好" }, { role: "her", text: "你好呀" }],
    }],
    longTermMemory: { [oldKey]: ["她喜欢喝茶"] },
  };
  const v1Worldbook = {
    books: [{ scope: "character", roleKey: oldKey, content: "白若的设定" }],
  };
  const v1Moments = {
    moments: [{ roleKey: oldKey, content: "今天喝了茶" }],
  };
  const v1Relations = {
    roles: { [oldKey]: { intimacy: 5, chatCount: 3 } },
  };
  localStorageMock.setItem(KEYS.STATE, JSON.stringify(v1State));
  localStorageMock.setItem(KEYS.WORLDBOOK, JSON.stringify(v1Worldbook));
  localStorageMock.setItem(KEYS.MOMENTS, JSON.stringify(v1Moments));
  localStorageMock.setItem(KEYS.RELATIONS, JSON.stringify(v1Relations));
  // meta: schemaVersion = 1
  localStorageMock.setItem(KEYS.META, JSON.stringify({ schemaVersion: 1 }));
  return { oldKey, v1State, v1Worldbook, v1Moments, v1Relations };
}

function getMeta() {
  const raw = localStorageMock.getItem(KEYS.META);
  return raw ? JSON.parse(raw) : null;
}

function getStaging() {
  const raw = localStorageMock.getItem(KEYS.MIGRATION_STAGING);
  return raw ? JSON.parse(raw) : null;
}

function getState() {
  const raw = localStorageMock.getItem(KEYS.STATE);
  return raw ? JSON.parse(raw) : null;
}

// 模拟某个 key 写入失败
function mockSetItemFailure(failKeyName) {
  const original = localStorageMock.setItem;
  localStorageMock.setItem = function (k, v) {
    if (k === failKeyName) throw new Error(`Simulated failure on ${failKeyName}`);
    original.call(this, k, v);
  };
  return () => { localStorageMock.setItem = original; };
}

// ============================================================
//  Test 1: 正常 v1 → v2
// ============================================================
console.log("\n=== Test 1: 正常 v1 → v2 ===");
{
  const { oldKey } = setupV1Data();
  const result = runMigrations();

  assert(result.success === true, "迁移成功");
  assert(result.migrated === true, "标记为已迁移");
  assert(getMeta().schemaVersion === 2, "schemaVersion = 2");
  assert(getStaging() === null, "staging 已清理");

  const state = getState();
  assert(state.chats[0].roleId !== undefined, "chat 获得 roleId");
  const newRoleId = state.chats[0].roleId;

  assert(state.longTermMemory[newRoleId] !== undefined, "长期记忆迁移到 roleId");
  assert(state.longTermMemory[oldKey] === undefined, "旧 roleKey 记忆已移除");

  const wb = JSON.parse(localStorageMock.getItem(KEYS.WORLDBOOK));
  assert(wb.books[0].roleId === newRoleId, "worldbook roleId 正确");

  const mo = JSON.parse(localStorageMock.getItem(KEYS.MOMENTS));
  assert(mo.moments[0].roleId === newRoleId, "moments roleId 正确");

  const rel = JSON.parse(localStorageMock.getItem(KEYS.RELATIONS));
  assert(rel.roles[newRoleId] !== undefined, "relations roleId 正确");
}

// ============================================================
//  Test 2: Validate 失败（转换后 chats 不是数组）
// ============================================================
console.log("\n=== Test 2: Validate 失败（转换后 chats 不是数组）===");
{
  setupV1Data();
  // 注入 chats 为字符串，migrations[1] 中 Array.isArray 为 false 使用空数组，
  // 但 state.chats 仍为字符串，Validate 阶段应检测并拒绝
  localStorageMock.setItem(KEYS.STATE, JSON.stringify({ chats: "not-an-array" }));
  const originalState = localStorageMock.getItem(KEYS.STATE);

  const result = runMigrations();

  assert(result.success === false, "Validate 检测到 chats 不是数组，迁移失败");
  assert(getMeta().schemaVersion === 1, "schemaVersion 保持 1");
  assert(getStaging() === null, "Validate 在 staging 之前，staging 未创建");
  assert(localStorageMock.getItem(KEYS.STATE) === originalState, "旧数据未被修改");
}

// ============================================================
//  Test 3: Validate 失败（转换后数据格式无效）
// ============================================================
console.log("\n=== Test 3: Validate 失败（无效 JSON 源数据）===");
{
  setupV1Data();
  // 注入损坏的 JSON，safeParse 返回 null，null 通过验证（null 不写入）
  localStorageMock.setItem(KEYS.WORLDBOOK, "corrupt json{{{");

  const result = runMigrations();
  assert(result.success === true, "损坏的 JSON 被 safeParse 处理为 null，迁移成功");
  assert(getMeta().schemaVersion === 2, "schemaVersion = 2");
  // worldbook 为 null，不写入，保持旧值（损坏的 JSON）
  assert(getStaging() === null, "staging 已清理");
}

// ============================================================
//  Test 4: 第 1 个 key (STATE) commit 失败 + recovery
// ============================================================
console.log("\n=== Test 4: 第 1 个 key (STATE) commit 失败 + recovery ===");
{
  const { oldKey, v1State } = setupV1Data();
  const originalState = JSON.stringify(v1State);

  // 模拟 STATE 写入失败
  const restore = mockSetItemFailure(KEYS.STATE);
  const result1 = runMigrations();
  restore();

  assert(result1.success === false, "第一次迁移失败（STATE 写入失败）");
  assert(getMeta().schemaVersion === 1, "schemaVersion 保持 1");
  assert(getStaging() !== null, "staging 已保留（完整 snapshot）");
  assert(localStorageMock.getItem(KEYS.STATE) === originalState, "STATE 仍是旧数据（未被覆盖）");

  // 第二次启动：从 staging 恢复
  const result2 = runMigrations();
  assert(result2.success === true, "第二次启动从 staging 恢复成功");
  assert(result2.recovered === true, "标记为 recovered");
  assert(getMeta().schemaVersion === 2, "恢复后 schemaVersion = 2");
  assert(getStaging() === null, "恢复后 staging 已清理");

  const state = getState();
  assert(state.chats[0].roleId !== undefined, "恢复后 STATE 包含新 roleId");
}

// ============================================================
//  Test 5: 第 2 个 key (WORLDBOOK) commit 失败 + recovery
// ============================================================
console.log("\n=== Test 5: 第 2 个 key (WORLDBOOK) commit 失败 + recovery ===");
{
  const { oldKey } = setupV1Data();
  const originalWb = localStorageMock.getItem(KEYS.WORLDBOOK);

  const restore = mockSetItemFailure(KEYS.WORLDBOOK);
  const result1 = runMigrations();
  restore();

  assert(result1.success === false, "第一次迁移失败（WORLDBOOK 写入失败）");
  assert(getMeta().schemaVersion === 1, "schemaVersion 保持 1");
  assert(getStaging() !== null, "staging 已保留");
  // STATE 已写入新数据，WORLDBOOK 仍是旧数据
  const state = getState();
  assert(state.chats[0].roleId !== undefined, "STATE 已写入新数据（部分提交）");
  assert(localStorageMock.getItem(KEYS.WORLDBOOK) === originalWb, "WORLDBOOK 仍是旧数据");

  // 第二次启动：从 staging 恢复（重新提交所有 key）
  const result2 = runMigrations();
  assert(result2.success === true, "第二次启动从 staging 恢复成功");
  assert(getMeta().schemaVersion === 2, "恢复后 schemaVersion = 2");
  assert(getStaging() === null, "staging 已清理");

  const wb = JSON.parse(localStorageMock.getItem(KEYS.WORLDBOOK));
  assert(wb.books[0].roleId !== undefined, "恢复后 WORLDBOOK 包含新 roleId");
}

// ============================================================
//  Test 6: 第 3 个 key (MOMENTS) commit 失败 + recovery
// ============================================================
console.log("\n=== Test 6: 第 3 个 key (MOMENTS) commit 失败 + recovery ===");
{
  setupV1Data();
  const originalMo = localStorageMock.getItem(KEYS.MOMENTS);

  const restore = mockSetItemFailure(KEYS.MOMENTS);
  const result1 = runMigrations();
  restore();

  assert(result1.success === false, "第一次迁移失败（MOMENTS 写入失败）");
  assert(getMeta().schemaVersion === 1, "schemaVersion 保持 1");
  assert(getStaging() !== null, "staging 已保留");
  assert(localStorageMock.getItem(KEYS.MOMENTS) === originalMo, "MOMENTS 仍是旧数据");

  const result2 = runMigrations();
  assert(result2.success === true, "第二次启动恢复成功");
  assert(getMeta().schemaVersion === 2, "恢复后 schemaVersion = 2");
  assert(getStaging() === null, "staging 已清理");

  const mo = JSON.parse(localStorageMock.getItem(KEYS.MOMENTS));
  assert(mo.moments[0].roleId !== undefined, "恢复后 MOMENTS 包含新 roleId");
}

// ============================================================
//  Test 7: 第 4 个 key (RELATIONS) commit 失败 + recovery
// ============================================================
console.log("\n=== Test 7: 第 4 个 key (RELATIONS) commit 失败 + recovery ===");
{
  setupV1Data();
  const originalRel = localStorageMock.getItem(KEYS.RELATIONS);

  const restore = mockSetItemFailure(KEYS.RELATIONS);
  const result1 = runMigrations();
  restore();

  assert(result1.success === false, "第一次迁移失败（RELATIONS 写入失败）");
  assert(getMeta().schemaVersion === 1, "schemaVersion 保持 1");
  assert(getStaging() !== null, "staging 已保留");
  assert(localStorageMock.getItem(KEYS.RELATIONS) === originalRel, "RELATIONS 仍是旧数据");

  const result2 = runMigrations();
  assert(result2.success === true, "第二次启动恢复成功");
  assert(getMeta().schemaVersion === 2, "恢复后 schemaVersion = 2");
  assert(getStaging() === null, "staging 已清理");

  const rel = JSON.parse(localStorageMock.getItem(KEYS.RELATIONS));
  const roleIds = Object.keys(rel.roles);
  assert(roleIds.length === 1 && roleIds[0].startsWith("role_"), "恢复后 RELATIONS 包含新 roleId");
}

// ============================================================
//  Test 8: commit 中断后的下一次启动恢复（staging 存在，部分正式 key 已更新）
// ============================================================
console.log("\n=== Test 8: commit 中断后恢复，数据一致性验证 ===");
{
  const { oldKey } = setupV1Data();

  // 模拟：STATE 和 WORLDBOOK 写入成功，MOMENTS 失败
  const restore = mockSetItemFailure(KEYS.MOMENTS);
  runMigrations();
  restore();

  // 此时：STATE=新, WORLDBOOK=新, MOMENTS=旧, RELATIONS=旧, staging=完整新 snapshot
  const stateBefore = getState();
  assert(stateBefore.chats[0].roleId !== undefined, "中断后 STATE 是新数据");

  // 第二次启动恢复
  const result = runMigrations();
  assert(result.success === true, "恢复成功");
  assert(result.recovered === true, "通过 staging recovery 路径");

  // 验证所有 4 个 key 数据一致（都包含新 roleId）
  const state = getState();
  const newRoleId = state.chats[0].roleId;
  const wb = JSON.parse(localStorageMock.getItem(KEYS.WORLDBOOK));
  const mo = JSON.parse(localStorageMock.getItem(KEYS.MOMENTS));
  const rel = JSON.parse(localStorageMock.getItem(KEYS.RELATIONS));

  assert(wb.books[0].roleId === newRoleId, "WORLDBOOK roleId 与 STATE 一致");
  assert(mo.moments[0].roleId === newRoleId, "MOMENTS roleId 与 STATE 一致");
  assert(rel.roles[newRoleId] !== undefined, "RELATIONS roleId 与 STATE 一致");
}

// ============================================================
//  Test 9: 恢复后 schemaVersion 正确 + staging 清理
// ============================================================
console.log("\n=== Test 9: 恢复后 schemaVersion 正确 + staging 清理 ===");
{
  setupV1Data();
  const restore = mockSetItemFailure(KEYS.STATE);
  runMigrations();
  restore();

  assert(getMeta().schemaVersion === 1, "失败后 schemaVersion = 1");
  assert(getStaging() !== null, "失败后 staging 存在");

  runMigrations(); // recovery

  assert(getMeta().schemaVersion === 2, "恢复后 schemaVersion = 2");
  assert(getStaging() === null, "恢复后 staging 已清理");
  assert(getMeta().recoveredFromStaging === true, "meta 记录 recoveredFromStaging");
}

// ============================================================
//  Test 10: v2 幂等（已是 v2 不重复迁移）
// ============================================================
console.log("\n=== Test 10: v2 幂等 ===");
{
  setupV1Data();
  // 第一次迁移
  const r1 = runMigrations();
  assert(r1.success === true && r1.migrated === true, "第一次迁移成功");

  // 第二次调用（已是 v2）
  const r2 = runMigrations();
  assert(r2.success === true, "第二次调用成功");
  assert(r2.migrated === false, "已是 v2，不执行迁移");
  assert(getMeta().schemaVersion === 2, "schemaVersion 保持 2");
  assert(getStaging() === null, "staging 为空");

  // 数据不变
  const state = getState();
  const roleId1 = state.chats[0].roleId;
  // 再次调用
  runMigrations();
  const state2 = getState();
  assert(state2.chats[0].roleId === roleId1, "多次调用后 roleId 不变（幂等）");
}

// ============================================================
//  Test 11: staging 写入失败（旧数据完全未动）
// ============================================================
console.log("\n=== Test 11: staging 写入失败（旧数据完全未动）===");
{
  const { v1State } = setupV1Data();
  const originalState = JSON.stringify(v1State);
  const originalWb = localStorageMock.getItem(KEYS.WORLDBOOK);

  const restore = mockSetItemFailure(KEYS.MIGRATION_STAGING);
  const result = runMigrations();
  restore();

  assert(result.success === false, "staging 写入失败，迁移失败");
  assert(getMeta().schemaVersion === 1, "schemaVersion 保持 1");
  assert(localStorageMock.getItem(KEYS.STATE) === originalState, "STATE 未被修改");
  assert(localStorageMock.getItem(KEYS.WORLDBOOK) === originalWb, "WORLDBOOK 未被修改");
  assert(getStaging() === null, "staging 不存在");
}

// ============================================================
//  Test 12: staging 包含 backup（旧数据原始值可恢复）
// ============================================================
console.log("\n=== Test 12: staging 包含 backup（旧数据原始值可恢复）===");
{
  const { v1State, v1Worldbook, v1Moments, v1Relations } = setupV1Data();
  const originalState = JSON.stringify(v1State);
  const originalWb = JSON.stringify(v1Worldbook);
  const originalMo = JSON.stringify(v1Moments);
  const originalRel = JSON.stringify(v1Relations);

  // 模拟 STATE 写入失败，触发 staging 保留
  const restore = mockSetItemFailure(KEYS.STATE);
  runMigrations();
  restore();

  const staging = getStaging();
  assert(staging !== null, "staging 存在");
  assert(staging.backup !== undefined, "staging 包含 backup");
  assert(staging.snapshot !== undefined, "staging 包含 snapshot");
  assert(staging.backup.state === originalState, "backup.state 等于旧数据原始值");
  assert(staging.backup.worldbook === originalWb, "backup.worldbook 等于旧数据原始值");
  assert(staging.backup.moments === originalMo, "backup.moments 等于旧数据原始值");
  assert(staging.backup.relations === originalRel, "backup.relations 等于旧数据原始值");
}

// ============================================================
//  Test 13: commit 失败后从 backup 回滚恢复旧数据
// ============================================================
console.log("\n=== Test 13: commit 失败后从 backup 回滚恢复旧数据 ===");
{
  const { v1State } = setupV1Data();
  const originalState = JSON.stringify(v1State);

  // 模拟 WORLDBOOK 写入失败（STATE 已写入新数据）
  const restore = mockSetItemFailure(KEYS.WORLDBOOK);
  runMigrations();
  restore();

  // 此时 STATE 是新数据，WORLDBOOK 是旧数据
  const stateBeforeRollback = getState();
  assert(stateBeforeRollback.chats[0].roleId !== undefined, "中断后 STATE 是新数据");

  // 从 staging.backup 回滚
  const staging = getStaging();
  assert(staging.backup !== null, "staging 有 backup");

  // 手动回滚（模拟用户选择恢复旧数据）
  const b = staging.backup;
  localStorageMock.setItem(KEYS.STATE, b.state);
  localStorageMock.setItem(KEYS.WORLDBOOK, b.worldbook);
  localStorageMock.setItem(KEYS.MOMENTS, b.moments);
  localStorageMock.setItem(KEYS.RELATIONS, b.relations);

  // 验证回滚后旧数据恢复
  assert(localStorageMock.getItem(KEYS.STATE) === originalState, "回滚后 STATE 恢复为旧数据");
  assert(getState().chats[0].roleId === undefined, "回滚后 STATE 不含 roleId（v1 格式）");
}

// ============================================================
//  Test 14: 损坏的 staging 被检测并清理，重新迁移
// ============================================================
console.log("\n=== Test 14: 损坏的 staging 被检测并清理，重新迁移 ===");
{
  setupV1Data();
  // 注入损坏的 staging
  localStorageMock.setItem(KEYS.MIGRATION_STAGING, "corrupt{{{");

  const result = runMigrations();
  assert(result.success === true, "损坏的 staging 被清理，重新迁移成功");
  assert(getMeta().schemaVersion === 2, "schemaVersion = 2");
  assert(getStaging() === null, "损坏的 staging 已清理");
}

// ============================================================
//  Test 15: recovery 后 backup 和 staging 都被清理
// ============================================================
console.log("\n=== Test 15: recovery 成功后 staging 被清理 ===");
{
  setupV1Data();
  const restore = mockSetItemFailure(KEYS.MOMENTS);
  runMigrations(); // 失败，staging 保留
  restore();

  assert(getStaging() !== null, "失败后 staging 存在");

  runMigrations(); // recovery 成功

  assert(getMeta().schemaVersion === 2, "recovery 后 schemaVersion = 2");
  assert(getStaging() === null, "recovery 成功后 staging 被清理");
}

console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
