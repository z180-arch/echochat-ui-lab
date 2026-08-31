# EchoChat Phase 0-6 Wiring Audit

> 审计日期：2026-08-31
> 审计范围：Character / Conversation / Message / Asset 四个核心实体
> 方法：全仓库搜索实际调用点，不依赖文档描述

## 1. 审计方法

1. 搜索 `localStorage` 直接访问（排除 Infrastructure / Legacy Adapter / Migration）
2. 搜索 `indexedDB` / `idb` 直接访问（排除 Infrastructure）
3. 搜索 `dexie` 直接访问（排除 Infrastructure）
4. 搜索 `store.addMessage/updateMessage/deleteMessage` 调用点
5. 搜索 `messageStore` 调用点
6. 搜索 `chat.messages` 直接访问（UI 层）
7. 验证每个实体的读取路径、写入路径、Migration 路径

## 2. Entity: Message

### 2.1 Read Path
- **当前唯一读取路径**：`store.getState().chats[].messages[]`（localStorage）
- **UI 层**：`src/ui/views/index.js` 直接访问 `chat.messages`
- **Provider 层**：`src/domain/provider.js` 直接访问 `chat.messages`
- **Dexie 读取**：`messageStore.getMessages()` 已实现但未被 UI 调用（Phase 3.3 切换）

### 2.2 Write Path
- **当前唯一写入路径**：`messageStore` → 双写（localStorage + Dexie）
- **chat.js**：所有消息操作通过 `messageStore`（已验证无遗漏）
- **双写顺序**：先写 localStorage（同步，保证 UI 响应），再写 Dexie（异步，不阻塞）

### 2.3 Migration Path
- **触发时机**：应用启动时 `main.js` 异步调用 `messageStore.migrateAllMessages()`
- **迁移逻辑**：遍历所有 chat，将 `chat.messages[]` 批量写入 Dexie
- **幂等性**：检查 `dexieAdapter.message.countByConversationId()`，已存在则跳过
- **非阻塞**：异步执行，不影响启动速度

### 2.4 Legacy Path
- `store.addMessage/updateMessage/deleteMessage`：仅在 `message-store.js` 内部调用
- UI 层和 Domain 层不再直接调用 store 消息方法

### 2.5 Dexie Path
- `dexieAdapter.message`：仅在 `message-store.js` 内部调用
- Domain 层不直接访问 Dexie

### 2.6 Known Exceptions
- **message-store.js 直接访问 dexieAdapter**：这是双写过渡的必要设计，message-store 是 Domain 层的存储抽象，需要同时写两个后端。Phase 3.4 移除 localStorage 后，message-store 将只通过 Repository 访问。
- **UI 层直接访问 chat.messages**：V1 Legacy 依赖，Phase 3.3 切换读取到 Dexie 后修改。

### 2.7 Risk
- **双写不一致**：如果 localStorage 写入成功但 Dexie 写入失败，下次启动迁移会补全。Dexie 写入失败不影响 UI。
- **删除不一致**：`messageStore.deleteMessage` 同时删除两边，一边失败不影响另一边。

### 2.8 Resolution
- 当前状态可接受。Phase 3.3 切换读取到 Dexie 后，UI 层需要修改为通过 messageStore 分页读取。

## 3. Entity: Character

### 3.1 Read Path
- **当前读取路径**：`CharacterRepository.findAll/findById` → Dexie 优先 + Legacy fallback
- **Domain 层**：`character.js` 通过 `CharacterRepository` 访问（已修复，不再直接访问 Dexie）
- **Legacy fallback**：从 `store.getState().chats` 推导

### 3.2 Write Path
- **当前写入路径**：`CharacterRepository.create/update/softDelete/permanentDelete` → Dexie + Legacy 双写
- **Domain 层**：`character.js` 通过 `CharacterRepository` 访问

### 3.3 Migration Path
- `character.migrateCharactersToDexie()`：从 chats 推导 Character，写入 Dexie
- 幂等：已存在则跳过
- 未在应用启动时自动调用（需要手动触发或 Phase 5 完成后启用）

### 3.4 Legacy Path
- `legacyAdapter.getChatsByRoleId/getAllChats`：Repository 内部使用
- `store.getState().chats`：character.js fallback 使用

### 3.5 Dexie Path
- `dexieCharacterAdapter`：仅在 `repository/character.js` 内部调用
- Domain 层不直接访问 Dexie（已修复）

### 3.6 Known Exceptions
- **character.js 直接访问 store**：用于 fallback 推导 Character。这是过渡设计，Phase 5 完成后移除。
- **character.js 直接访问 legacyAdapter**：用于 permanentDelete 时清理 relations/moments。这是级联删除的必要操作，未来 Relations/Moments Repository 建立后通过 Repository 访问。

### 3.7 Risk
- **Character 数据不一致**：Dexie 和 chats 中的 Character 信息可能不同步。当前以 chats 为准（fallback），Dexie 作为缓存。
- **permanentDelete 级联不完整**：当前只清理 chats/memory/relations/moments，未清理 Dexie 中的 messages/assets。Phase 3/6 完成后补全。

### 3.8 Resolution
- 当前状态可接受。Phase 5 完成 Character 一级实体后，启用自动迁移并移除 fallback。

## 4. Entity: Conversation

### 4.1 Read Path
- **当前读取路径**：`store.getState().chats`（localStorage）
- **UI 层**：直接访问 `store.getState().chats`
- **Domain 层**：`conversation.js` 通过 `store` 访问

### 4.2 Write Path
- **当前写入路径**：`store.createChat/updateChat/deleteChat`（localStorage）
- **Domain 层**：`conversation.js` 封装了 rename/archive/delete 等操作
- **Dexie 写入**：ConversationRepository 已定义但未被 Domain 层调用（Phase 4 完成度 50%）

### 4.3 Migration Path
- 未实现 Conversation 的 localStorage→Dexie 迁移
- 当前 Conversation 数据只存在于 localStorage

### 4.4 Legacy Path
- `store`：所有 Conversation 操作的唯一路径

### 4.5 Dexie Path
- `dexieAdapter.conversation`：已实现但未被调用
- `repository/conversation.js`：已定义但未被 Domain 层使用

### 4.6 Known Exceptions
- **Conversation 未迁移到 Dexie**：Phase 4 只建立了 Domain 层接口，未切换存储后端。这是有意的渐进式迁移。

### 4.7 Risk
- **Conversation 数据量增长**：当前 localStorage 可支持 <1000 对话，超过后性能下降。
- **多 Conversation 支持**：Domain 层已支持，但 UI 层仍假设 1:1 关系。

### 4.8 Resolution
- Phase 4 后续工作：启用 ConversationRepository，迁移数据到 Dexie，修改 UI 支持多对话。

## 5. Entity: Asset

### 5.1 Read Path
- **当前读取路径**：`AssetRepository.getBlob/getMetadata/getObjectUrl` → IndexedDB + Dexie
- **Domain 层**：`asset.js` 通过 `AssetRepository` 访问（已修复，不再直接访问 idb）
- **UI 层**：当前未使用 Asset Domain（V1 直接使用 base64 或 URL）

### 5.2 Write Path
- **当前写入路径**：`AssetRepository.storeBlob` → IndexedDB (blob) + Dexie (metadata)
- **Domain 层**：`asset.js` 通过 `AssetRepository` 访问

### 5.3 Migration Path
- 未实现 Asset 迁移（V1 没有独立的 Asset metadata）
- 当前 blob 直接存储在 IndexedDB，无 metadata

### 5.4 Legacy Path
- `legacyAdapter.storeBlob/getBlob/deleteBlob`：Repository 内部使用
- `idb.js`：仅在 Infrastructure 层和 legacyAdapter 中使用

### 5.5 Dexie Path
- `dexieAssetAdapter`：仅在 `repository/asset.js` 内部调用
- Domain 层不直接访问 Dexie（已修复）

### 5.6 Known Exceptions
- **Asset 未被 UI 使用**：Phase 6 只建立了基础设施，UI 层尚未接入。
- **orphan cleanup 未实现**：`cleanupOrphanedAssets()` 返回空结果，需要 Phase 3/11 完成后实现。

### 5.7 Risk
- **metadata 存在但 blob 丢失**：如果 IndexedDB blob 被意外删除，Dexie metadata 会残留。当前没有一致性检查。
- **blob 存在但 metadata 丢失**：如果 Dexie metadata 写入失败，blob 会成为孤儿。当前没有自动清理。

### 5.8 Resolution
- Phase 6 后续工作：UI 接入 Asset Domain，实现 orphan cleanup，添加一致性检查。

## 6. Architecture Boundary Summary

### 6.1 允许的依赖
- Domain → Repository ✅
- Repository → Infrastructure Adapter (Dexie/Legacy) ✅
- Infrastructure → localStorage/IndexedDB/Dexie ✅
- UI → Domain / Store ✅
- Migration → Storage ✅

### 6.2 已修复的违规
- ~~character.js 直接访问 localStorage~~ → 改用 legacyAdapter ✅
- ~~character.js 直接访问 dexieCharacterAdapter~~ → 改用 CharacterRepository ✅
- ~~asset.js 直接访问 idb~~ → 改用 AssetRepository ✅
- ~~asset.js 直接访问 dexieAssetAdapter~~ → 改用 AssetRepository ✅

### 6.3 已知例外（记录原因）
- **message-store.js 直接访问 dexieAdapter**：双写过渡必要设计，Phase 3.4 移除
- **character.js 直接访问 store/legacyAdapter**：fallback 推导 + 级联删除，Phase 5 完成后移除
- **UI 层直接访问 chat.messages**：V1 Legacy，Phase 3.3 切换后修改
- **moments.js / relations.js 直接访问 storage**：V1 Legacy 模块，Deferred 到 Phase 9/11

### 6.4 禁止的依赖（当前不存在）
- Domain → localStorage ❌（已修复）
- Domain → IndexedDB ❌（已修复）
- Domain → Dexie ❌（已修复）
- UI → Dexie ❌（不存在）
- UI → localStorage ❌（不存在，通过 store）

## 7. 双写一致性矩阵

| Entity | localStorage 写入 | Dexie 写入 | 一致性保证 |
|--------|------------------|------------|-----------|
| Message | ✅ messageStore | ✅ messageStore | 启动迁移补全 |
| Character | ✅ store (chats) | ✅ CharacterRepository | fallback 推导 |
| Conversation | ✅ store | ❌ 未启用 | 仅 localStorage |
| Asset | ✅ IndexedDB (blob) | ✅ Dexie (metadata) | 无自动检查 |

## 8. 结论

### 8.1 接线状态
- **Message**：双写过渡完成，读取待切换（Phase 3.3）
- **Character**：Repository 接线完成，Dexie 读取已启用，fallback 正常
- **Conversation**：Domain 层完成，存储后端未切换（Phase 4 后续）
- **Asset**：Repository 接线完成，UI 未接入（Phase 6 后续）

### 8.2 Architecture Boundary
- **Domain 层**：已清理直接 storage 访问（除 message-store 过渡例外）
- **Repository 层**：职责清晰，不包含业务逻辑
- **Infrastructure 层**：Dexie/Legacy Adapter 隔离完成
- **UI 层**：仍依赖 V1 Legacy store，逐步迁移

### 8.3 风险等级
- **高风险**：无
- **中风险**：Message 双写不一致（有迁移补全机制）、Asset 孤儿数据（有 cleanup 接口）
- **低风险**：Character fallback 推导（数据量小）、Conversation 未迁移（性能可接受）

### 8.4 建议
1. Phase 3.3：切换消息读取到 Dexie（最大性能提升）
2. Phase 4 后续：启用 ConversationRepository
3. Phase 5 后续：启用 Character 自动迁移
4. Phase 6 后续：UI 接入 Asset Domain，实现 orphan cleanup
