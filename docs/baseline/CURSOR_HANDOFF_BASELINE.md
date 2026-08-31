# EchoChat Cursor Handoff Baseline

> 文档日期：2026-08-31
> 状态：Phase 0-6 Foundation Complete
> 下一步：Independent Foundation Gate Review → Cursor 接管

## 1. 当前稳定架构

### 1.1 架构分层

```
UI (src/ui/)
  ↓
Application / Domain (src/domain/)
  ↓
Repository (src/repository/)
  ↓
Storage Adapter (src/infrastructure/)
  ↓
Platform Storage
  ├── Web: Dexie / IndexedDB
  ├── Legacy: localStorage
  └── Future: Desktop → SQLite, Mobile → SQLite
```

### 1.2 当前数据存储

| 数据类型 | 存储位置 | 状态 |
|----------|----------|------|
| Chats / Conversations | localStorage (store) | Legacy，Phase 4 后续迁移 |
| Messages | localStorage + Dexie（双写） | 过渡，Phase 3.3 切换读取 |
| Characters | localStorage (推导) + Dexie | 过渡，Phase 5 完成 |
| Memories | localStorage (store.longTermMemory) | Legacy，Phase 7 |
| Relationships | localStorage (relations_v1) | Legacy，Phase 9 |
| Moments | localStorage (moments_v1) | Legacy，Phase 11 |
| Worldbook | localStorage (worldbook_v1) | Legacy，Phase 8 |
| Assets / Blobs | IndexedDB (idb.js) | 稳定 |
| Asset Metadata | Dexie (assets 表) | Phase 6 新增 |
| Settings | localStorage (store.settings) | 稳定 |
| Migration metadata | localStorage (meta_v2) | 稳定 |

### 1.3 关键文件

```
src/
├── core/
│   ├── store.js          # V1 全局状态（localStorage 持久化）
│   ├── storage.js        # Migration + localStorage 封装
│   ├── events.js         # 事件总线
│   ├── version.js        # APP_VERSION = "1.0.0"
│   └── utils.js
├── domain/
│   ├── chat.js           # 聊天逻辑（已改用 messageStore）
│   ├── message-store.js  # 消息存储抽象（双写过渡）
│   ├── character.js      # Character 领域（通过 Repository）
│   ├── conversation.js   # Conversation 领域
│   ├── asset.js          # Asset 领域（通过 Repository）
│   ├── persona.js        # V1 角色模板
│   ├── provider.js       # AI Provider（V1 Legacy）
│   ├── memory.js         # Memory（V1 Legacy，Phase 7 重构）
│   ├── moments.js        # Moments（V1 Legacy，Phase 11 重构）
│   └── relations.js      # Relations（V1 Legacy，Phase 9 重构）
├── repository/
│   ├── interfaces.js     # 12 个 Repository 接口定义
│   ├── legacy-adapter.js # Legacy Storage Adapter
│   ├── character.js      # CharacterRepository（Dexie + Legacy）
│   ├── conversation.js   # ConversationRepository
│   ├── message.js        # MessageRepository
│   ├── memory.js         # MemoryRepository
│   ├── relationship.js   # RelationshipRepository
│   ├── moment.js         # MomentRepository
│   ├── worldbook.js      # WorldbookRepository
│   ├── asset.js          # AssetRepository（Dexie + IndexedDB）
│   ├── settings.js       # SettingsRepository
│   └── index.js
├── infrastructure/
│   ├── dexie-db.js       # Dexie 数据库实例 + 13 表 schema
│   ├── dexie-adapter.js  # Dexie Adapter（12 实体 CRUD）
│   ├── dexie-migration.js # localStorage→Dexie 迁移
│   ├── dexie-verify.js   # 浏览器端验证脚本
│   ├── idb.js            # IndexedDB blob 存储
│   └── vendor/
│       └── dexie.mjs     # Dexie v4.0.10（本地 vendor）
├── ui/
│   └── views/index.js    # V1 UI（600+ 行，待重构）
├── main.js               # 应用入口
└── sw.js                 # Service Worker（PWA 更新系统）
```

## 2. Phase 0-6 完成内容

### Phase 0 — Baseline Lock ✅
- `docs/baseline/V1_BASELINE.md`：架构/数据/测试/性能基线
- V1 可运行确认

### Phase 1 — Repository Boundary ✅
- 12 个 Repository 接口定义
- Legacy Storage Adapter（包装 localStorage + store + IndexedDB）
- Repository 职责边界：只做 CRUD+查询+分页+事务，不做业务逻辑

### Phase 2 — Web Storage / Dexie ✅
- Dexie v4.0.10 本地 vendor（244KB ESM）
- 数据库 schema：13 张表，索引优化
- Dexie Adapter：12 实体完整 CRUD + 分页 + 搜索 + 事务
- localStorage→Dexie 迁移机制：6 实体，回滚，重试
- PWA precache 更新

### Phase 3 — Message Independence ✅（双写过渡）
- `message-store.js`：消息存储抽象层
- 双写策略：先写 localStorage（同步），再写 Dexie（异步）
- chat.js 全部消息操作改用 messageStore
- 应用启动自动迁移旧消息（后台异步，不阻塞）
- 支持分页/搜索/分支/截断
- 性能测试脚本（100/500/1000/5000 消息）

### Phase 4 — Conversation Model ✅（Domain 层）
- `conversation.js`：Character → Conversation → Message
- 支持一个 Character 多个 Conversation
- Archive/Rename/Delete/Restore/Search/Pin/Export
- Delete Conversation ≠ Delete Character

### Phase 5 — Character First-Class Entity ✅（Domain 层）
- `character.js`：Character 聚合根
- 从 chats 推导（过渡）+ Dexie 存储（目标）
- 级联删除策略：软删除 → 回收站 → 永久删除
- Character 统计 + 迁移到 Dexie

### Phase 6 — Asset System ✅（基础设施）
- `asset.js`：统一资产管理
- Metadata (Dexie) + Binary (IndexedDB) 分离
- Avatar/Moment/Attachment 管理
- Base64 导入/导出（备份用）
- Orphaned asset cleanup 接口

## 3. 已知技术债

### 3.1 高优先级（Phase 7 前必须处理）
1. **Message 读取仍从 localStorage**：UI 层直接访问 `chat.messages[]`，长聊天性能差
   - 计划：Phase 3.3 切换读取到 Dexie，UI 改用分页
2. **Conversation 未迁移到 Dexie**：Domain 层完成，存储后端未切换
   - 计划：Phase 4 后续启用 ConversationRepository

### 3.2 中优先级（Phase 7-11 处理）
3. **Character fallback 推导**：character.js 仍从 chats 推导，Dexie 数据可能不同步
   - 计划：Phase 5 后续启用自动迁移，移除 fallback
4. **Asset Domain 未接入 UI**：基础设施完成，UI 仍用 base64/URL
   - 计划：Phase 6 后续 UI 接入
5. **moments.js / relations.js / memory.js 直接访问 storage**：V1 Legacy 模块
   - 计划：Phase 7/9/11 重构时通过 Repository 访问

### 3.3 低优先级（长期）
6. **UI 层 600+ 行单文件**：views/index.js 待拆分
7. **SVG sprite**：图标系统待优化
8. **CSS bundling**：当前零构建，未来可考虑
9. **TypeScript**：长期可考虑，当前不强制

## 4. Deferred Work（明确推迟）

| 工作项 | 推迟原因 | 计划 Phase |
|--------|----------|-----------|
| Memory Domain 重构 | 需要 Behavior Engine 配合 | Phase 7 |
| Worldbook Domain | 依赖 Memory Context Builder | Phase 8 |
| Relationship Domain | 需要 Event History 设计 | Phase 9 |
| Moments / Social | 依赖 Relationship + Character | Phase 10-11 |
| Behavior Engine | 依赖 Memory + Relationship | Phase 12-18 |
| Character Reconstruction | 需要 Import Engine | Phase 15 |
| Plugin System | 需要安全沙箱设计 | Phase 23 |
| Cloud / Account | 商业模式未确定 | Phase 24-26 |
| Community | 依赖 Cloud | Phase 25 |
| Desktop (Tauri) | Web 稳定后再考虑 | Phase 30 |
| Mobile Native | Web 稳定后再考虑 | Phase 31 |
| TypeScript 全量迁移 | 渐进式，不强制 | 长期 |

## 5. 禁止修改项（Cursor 接管后必须遵守）

### 5.1 绝对禁止
1. **Full Rebuild**：不得删除现有项目重新创建
2. **数据破坏**：不得通过 localStorage.clear() / indexedDB.deleteDatabase() 解决问题
3. **Migration 降级**：不得移除 V1→V2 migration 安全机制
4. **PWA 更新系统**：不得移除 APP_VERSION / SW 版本化机制
5. **Storage Boundary**：Domain 层不得直接访问 localStorage/IndexedDB/Dexie（message-store 过渡例外）
6. **用户数据**：不得在未授权情况下上传/修改/删除用户数据

### 5.2 需要审批
1. **数据模型变更**：任何 schema 变化必须经过 Migration 设计
2. **Repository 接口变更**：必须保持向后兼容
3. **Dexie schema 变更**：必须经过 versioned migration
4. **PWA 缓存策略变更**：必须验证更新流程

## 6. Repository Rules

### 6.1 Repository 职责
- ✅ CRUD 操作
- ✅ 查询 / 过滤 / 分页 / 搜索
- ✅ 事务边界
- ✅ 存储后端抽象（Dexie / Legacy / Future SQLite）
- ❌ 业务逻辑（AI prompt / 关系计算 / 行为决策）
- ❌ UI 状态管理
- ❌ 直接操作 DOM

### 6.2 Repository 命名
- 接口：`XxxRepository`（如 `CharacterRepository`）
- 方法：`findById / findAll / create / update / delete / count`
- 查询：`findByXxx / search / filter`

### 6.3 新增 Repository
1. 在 `repository/interfaces.js` 定义 JSDoc 接口
2. 在 `repository/xxx.js` 实现（Dexie + Legacy fallback）
3. 在 `repository/index.js` 导出
4. Domain 层通过 Repository 访问，不直接访问 storage

## 7. Storage Rules

### 7.1 数据分类
- **大型数据**（characters/messages/memories/etc.）→ IndexedDB / Dexie
- **小型配置**（theme/settings/migration metadata）→ localStorage
- **二进制**（avatars/images/attachments）→ IndexedDB blobs
- **敏感数据**（API Key）→ 单独评估，未来平台安全存储

### 7.2 双写过渡规则
1. 新数据同时写两个后端
2. 读取优先从新后端，fallback 旧后端
3. 启动时后台迁移旧数据
4. 迁移幂等：已存在则跳过
5. 旧后端删除前必须确认新后端数据完整

### 7.3 Dexie 使用规则
1. Dexie 只在 Infrastructure 层使用
2. Repository 层通过 dexieAdapter 访问
3. Domain 层不直接 import Dexie
4. schema 变更必须 versioned migration

## 8. Migration Rules

### 8.1 Migration 流程
```
Detect → Validate Source → Transform → Validate Result → Stage → Commit → Verify → Mark
```

### 8.2 失败处理
- 失败不标记 schemaVersion 升级
- 原始数据保留可恢复
- 下次启动可重试
- 不静默吞掉错误

### 8.3 版本管理
- `APP_VERSION`：应用版本（src/core/version.js）
- `DATA_SCHEMA_VERSION`：数据 schema 版本（localStorage meta_v2）
- `Dexie schema version`：数据库 schema 版本（dexie-db.js）
- 三者独立，不混用

## 9. Testing Rules

### 9.1 测试分层
- **Unit**：纯函数，无副作用
- **Integration**：Repository + Storage
- **Migration**：数据迁移安全
- **E2E**：真实浏览器用户流程
- **Performance**：性能基线
- **Architecture**：边界检查（Domain 不直接访问 storage）

### 9.2 现有测试
- `tests/migration_atomicity_test.mjs`：90 assertions，15 scenarios
- `tests/foundation_test.mjs`：24 tests，覆盖 Message/Character/Conversation/Asset/Migration/Integrity
- `src/domain/message-perf-test.js`：浏览器端性能测试
- `src/infrastructure/dexie-verify.js`：浏览器端 Dexie 验证

### 9.3 新增测试要求
- 数据模型变更必须添加 migration 测试
- Repository 新增必须添加 integration 测试
- 核心业务逻辑必须添加 unit 测试
- 不得用 mock 代替真实 production path

## 10. UI / Core Separation

### 10.1 当前状态
- UI 层：`src/ui/views/index.js`（600+ 行，V1 Legacy）
- Core 层：`src/domain/` + `src/repository/` + `src/infrastructure/`
- UI 直接访问 `store.getState()`，未完全通过 Domain 层

### 10.2 目标状态
```
UI → Domain (Use Cases) → Repository → Storage
```

### 10.3 渐进式迁移
1. 新功能必须通过 Domain 层
2. 旧功能逐步重构，不强制一次性迁移
3. UI 不直接访问 localStorage/IndexedDB/Dexie

## 11. Cursor 接管后的第一阶段建议

### 11.1 立即执行（Week 1-2）
1. **Phase 3.3**：切换消息读取到 Dexie
   - 修改 UI 层，通过 messageStore 分页加载消息
   - 验证 1000/5000 消息性能
   - 保留 localStorage fallback
2. **Phase 4 后续**：启用 ConversationRepository
   - 迁移 Conversation 数据到 Dexie
   - UI 支持多对话列表

### 11.2 短期执行（Week 3-4）
3. **Phase 5 后续**：启用 Character 自动迁移
   - 应用启动时迁移 Character 到 Dexie
   - 移除 character.js fallback 推导
4. **Phase 6 后续**：UI 接入 Asset Domain
   - 头像上传使用 Asset.storeAvatar
   - 实现 orphaned asset cleanup

### 11.3 中期执行（Month 2）
5. **Phase 7**：Memory Domain 重构
6. **Phase 8**：Worldbook Domain
7. **Phase 9**：Relationship Domain（Current State + Event History）

## 12. 当前不能做的事情

### 12.1 绝对不能
1. ❌ Full Rebuild
2. ❌ 破坏用户数据
3. ❌ 移除 Migration 安全机制
4. ❌ Domain 层直接访问 storage（除 message-store 过渡）
5. ❌ 为了"代码漂亮"重构整个项目
6. ❌ 提前实现 Cloud / Account / Community
7. ❌ 提前实现 Plugin System
8. ❌ 切换到 TypeScript（渐进式，不强制）
9. ❌ 切换到 React/Vue（当前 Vanilla JS 足够）
10. ❌ 切换到 Desktop/Mobile（Web 稳定后再考虑）

### 12.2 需要审批后才能
1. ⚠️ 数据模型变更（需要 Migration 设计）
2. ⚠️ Repository 接口变更（需要向后兼容）
3. ⚠️ Dexie schema 变更（需要 versioned migration）
4. ⚠️ PWA 缓存策略变更（需要验证更新流程）
5. ⚠️ 删除任何 V1 Legacy 代码（需要确认无依赖）

## 13. 关键决策记录

### 13.1 已确认的架构决策
1. **Relationship = Current State + Event History**（非 Full Event Sourcing）
2. **Web 数据库 = Dexie**（IndexedDB wrapper）
3. **Desktop 数据库 = SQLite**（Tauri，未来）
4. **Character = 一级实体**，Chat ≠ Character
5. **Message = 独立存储**，支持分页/搜索/分支
6. **渐进式迁移**：双写过渡，不破坏旧数据
7. **Privacy by Architecture**：AI Provider 永远不直接读数据库

### 13.2 待确认的决策
1. Memory 检索策略（关键词 vs 向量 vs 混合）
2. Cloud Sync 冲突解决策略（LWW vs CRDT）
3. Plugin 沙箱实现方案（iframe vs Web Worker）
4. Desktop 框架（Tauri vs Electron）

## 14. 联系方式

- 仓库：https://github.com/z180-arch/echochat-ui-lab
- 架构文档：`docs/architecture/ECHOCHAT_LONG_TERM_ARCHITECTURE.md`
- 基线文档：`docs/baseline/`
- 问题反馈：GitHub Issues

---

**本文档是 Cursor 接管 EchoChat 的唯一权威基线。**
**任何与本文档冲突的操作必须先更新本文档。**
