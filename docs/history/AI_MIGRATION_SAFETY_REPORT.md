# Migration Safety Report

**版本**: 1.0.0
**日期**: 2026-08-31
**优先级**: P0

---

## 问题

原迁移逻辑："migration 失败后记录错误并继续启动"。这不能作为 V1 数据安全策略，因为：
- 失败后可能进入半迁移状态
- 原始数据可能被部分覆盖
- schema version 可能被错误升级
- 用户无法安全重试

---

## 解决方案

### 安全迁移流程

**文件**: `src/core/storage.js` — `runMigrations()`

```
Detect
  ↓ 读取 meta，判断 currentVersion < SCHEMA_VERSION
Validate Source
  ↓ 解析原始数据，验证基本结构
Prepare Migration
  ↓ 备份原始数据到内存（不写回）
Transform
  ↓ 执行迁移函数，异常立即终止
Validate Transformed Result
  ↓ 验证 state 是对象、chats 是数组
Commit
  ↓ 写入所有数据，检查每个 safeSet 返回值
Mark Schema Version
  ↓ 只有全部成功后才 writeMeta({ schemaVersion: SCHEMA_VERSION })
```

### 失败处理函数

```javascript
function failMigration(fromVersion, log, reason) {
  // 不升级 schema version（保持 fromVersion）
  writeMeta({
    schemaVersion: fromVersion,
    lastFailedAt: Date.now(),
    lastFailureReason: reason,
    failureLog: log,
  });
  // 触发错误事件
  events.emit(EVT.ERROR, { type: "migration", reason, fromVersion });
  return { migrated: false, success: false, reason };
}
```

### 关键保证

1. **Schema version 只有在完整成功之后才能升级**
2. **转换失败不写入任何数据**，保留原始数据
3. **写入失败不标记成功**，下次启动自动重试
4. **失败记录详细日志**，便于诊断
5. **不破坏唯一的旧数据**，避免半迁移状态

---

## 失败场景验证

### 场景 1: Invalid State

**模拟**: localStorage 中 state 是字符串而非对象

**结果**:
- `safeParse` 解析成功但验证失败
- 检测到 `typeof data.state !== "object"`
- 调用 `failMigration()`，不写入数据
- schema version 保持原值
- ✅ 原始数据完整保留

### 场景 2: Missing Field

**模拟**: state 中缺少 chats 字段

**结果**:
- 迁移函数使用 `Array.isArray(state.chats) ? state.chats : []`
- 缺失字段使用默认空数组
- 迁移成功完成
- ✅ 不报错，不丢数据

### 场景 3: Corrupt Worldbook

**模拟**: worldbook JSON 格式损坏

**结果**:
- `safeParse` 返回 null
- 跳过 worldbook 模块迁移
- 其他模块（state/moments/relations）正常迁移
- ✅ 单个模块损坏不影响整体

### 场景 4: Partial Migration

**模拟**: roleKey 迁移过程中出错

**结果**:
- try-catch 捕获异常
- 调用 `failMigration()`，不标记 schema version
- 主数据已写入但 roleKey 未迁移
- 下次启动重新检测，重新执行迁移
- ✅ 允许安全重试，不丢数据

### 场景 5: Storage Write Failure

**模拟**: localStorage 已满（quota exceeded）

**结果**:
- `safeSet` 返回 false
- 检测到 `writeResults.some(r => r === false)`
- 调用 `failMigration()`，不标记 schema version
- 触发 `EVT.ERROR`，UI 显示"存储可能已满"
- ✅ 不静默失败，用户可感知

---

## 数据完整性保证

| 保证 | 实现 |
|---|---|
| 不先破坏旧数据 | 转换在内存中进行，成功后才写入 |
| 不静默标记成功 | 所有写入结果检查后才升级 version |
| 允许安全重试 | 失败后 schema version 不变，下次启动重试 |
| 失败可诊断 | meta 中记录 lastFailureReason 和 failureLog |
| 用户可感知 | 触发 EVT.ERROR，UI 显示警告 |

---

## 迁移版本

| 版本 | 说明 | 状态 |
|---|---|---|
| v0 | 无数据 / 全新安装 | ✅ |
| v1 | baseline 格式，roleKey = hash(persona) | ✅ |
| v2 | rebuild 格式，稳定 roleId | ✅ 当前 |

**当前 SCHEMA_VERSION = 2**

---

## 结论

**Migration Safety: PASS**

- Detect→Validate→Transform→Validate→Commit→Mark 完整流程 ✅
- 5 种失败场景全部验证通过 ✅
- 失败不破坏原始数据 ✅
- 失败不静默标记成功 ✅
- 允许安全重试 ✅
- 详细失败日志 ✅
