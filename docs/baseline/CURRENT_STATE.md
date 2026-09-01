# EchoChat Current State

> 最后更新：2026-09-01
> 当前 Commit：`647b7df` → Stage 0 完成后见最新 commit
> 状态：**STAGE 0 — Foundation Verification COMPLETE**

---

## 1. Repository Status

| 项目 | 状态 |
|------|------|
| 仓库 | https://github.com/z180-arch/echochat-ui-lab |
| 分支 | main |
| Baseline Commit（Stage 0 起点） | `647b7df` |
| 构建系统 | 无（零构建，原生 ES Modules） |
| package.json | 不存在（有意为之；测试用 Node 直接运行 `.mjs`） |
| CI | ✅ GitHub Actions `.github/workflows/ci.yml`（push / pull_request） |
| 许可证 | PolyForm Noncommercial 1.0.0 |

### 1.1 Stage 0 开发环境（已验证）

| 项目 | 值 |
|------|------|
| OS | Windows 10 (10.0.19045) |
| Node.js | v24.15.0 |
| npm | 11.12.1（未用于安装依赖；仓库无 lockfile/依赖） |
| 包管理 | 无（零依赖） |
| 开发服务器 | `python -m http.server <port>`（本机 8080 被 Steam CEF 占用，验证使用 **8765**） |
| 浏览器验证 | Chromium/Chrome headless via CDP（1280×800 + 390×844） |

---

## 2. Code Status

### 2.1 代码规模

| 目录 | 文件数 | 行数 | 说明 |
|------|--------|------|------|
| src/core/ | 5 | ~1200 | V1 核心（store/storage/events/utils/version） |
| src/domain/ | 11 | ~2500 | 领域逻辑（含 Phase 3-6 新增） |
| src/repository/ | 11 | ~1800 | Phase 1 新增，Repository 层 |
| src/infrastructure/ | 7 | ~2800 | Phase 2 新增，Dexie + IndexedDB |
| src/ui/ | 2 | ~700 | V1 UI（600+ 行单文件） |
| src/main.js | 1 | ~650 | 应用入口 |
| **总计** | **37** | **~9650** | 不含 Dexie vendor（5912 行） |

### 2.2 新增代码（Phase 0-6）

| 模块 | 状态 | 完成度 |
|------|------|--------|
| Repository 接口 | ✅ 完成 | 100% |
| Legacy Adapter | ✅ 完成 | 100% |
| Dexie 数据库 schema | ✅ 完成 | 100% |
| Dexie Adapter | ✅ 完成 | 100% |
| Dexie Migration | ✅ 完成 | 100% |
| Message Store（双写） | ✅ 完成 | 75%（读取未切换） |
| Character Domain | ✅ 完成 | 70%（fallback 待移除） |
| Conversation Domain | ✅ 完成 | 60%（存储未切换） |
| Asset Domain | ✅ 完成 | 65%（UI 未接入） |

---

## 3. Test Status

### 3.1 自动化测试（Stage 0 本地复验）

| 测试套件 | 测试数 | 本地结果 | CI |
|----------|--------|----------|-----|
| Migration Atomicity | 90 assertions | ✅ 90/90 PASS | 随 push 运行 |
| Foundation Test | 24 tests | ✅ 24/24 PASS | 随 push 运行 |
| **总计** | **114** | **✅ 114/114 PASS** | 见 Actions |

语法检查：`node --check` 覆盖 `src/**/*.js` — 本地 0 失败。

### 3.2 测试覆盖

| 领域 | 覆盖 |
|------|------|
| Migration 安全 | ✅ 15 scenarios |
| Message lifecycle | ✅ create/read/update/delete/100 messages |
| Character CRUD | ✅ create/multi-conversation/soft-delete |
| Conversation CRUD | ✅ create/rename/archive/delete |
| Architecture Boundary | ✅ Domain 不直接访问 storage |
| Data Integrity | ✅ 引用关系/孤儿检查 |

### 3.3 未覆盖

| 测试类型 | 状态 | 原因 |
|----------|------|------|
| E2E (Playwright) | ❌ 未建立 | 需要浏览器自动化环境 |
| Visual Regression | ❌ 未建立 | 需要截图基线工具 |
| Dexie 浏览器端测试 | ⚠️ 脚本已提供 | dexie-verify.js，需手动运行 |
| 5000 消息性能 | ⚠️ 脚本已提供 | message-perf-test.js，需浏览器运行 |

### 3.4 Known Unverified Claims

| 声明 | 状态 | 说明 |
|------|------|------|
| "114/114 PASS" | ✅ Stage 0 本地复验 | Windows Node v24.15.0 |
| "Browser core flow PASS" | ✅ Stage 0 手工/CDP 复验 | Create→Chat→Send→Refresh→Persist→Continue + Moments |
| "Dexie 迁移完整" | ⚠️ 未单独深度验证 | 启动路径无阻塞错误；完整 Dexie 浏览器脚本未作为 Stage 0 阻断项 |
| "PWA 更新正常" | ⚠️ 未在本次验证 | 之前 V1 Closing Pass 验证过 |

### 3.5 Stage 0 Runtime / Manual Verification（2026-09-01）

| 检查项 | 结果 | 备注 |
|--------|------|------|
| 应用启动 | PASS | Landing 正常；无阻塞启动错误 |
| 主 UI 加载 | PASS | EchoApp 就绪 |
| Console 致命错误 | PASS | `window.__errors` 为空 |
| Create Character | PASS | Onboarding → 橘小喵 |
| Start Chat | PASS | 进入对话，开场白可见 |
| Send Message | PASS | 用户消息写入；AI 回复在验证中使用本地 SSE stub（无真实 API Key） |
| Refresh | PASS | 刷新后仍为 app 视图 |
| Persistence | PASS | 刷新后消息仍在（含用户消息与 stub AI 回复） |
| Continue Chat | PASS | 刷新后继续发送成功 |
| Moments 基础流 | PASS | 添加动态 / 点赞 / 评论 / UI 可见 |
| Desktop 1280×800 | PASS | CDP headless |
| Mobile 390×844 | PASS | bottom nav 可见 |

验证脚本：`scripts/stage0_browser_verify.mjs`（CDP，无额外 npm 依赖）。

---

## 4. Storage Status

### 4.1 数据分类

| 数据类型 | 存储位置 | 状态 |
|----------|----------|------|
| Chats / Conversations | localStorage (store) | Legacy |
| Messages | localStorage + Dexie（双写） | Dual-write |
| Characters | localStorage（推导）+ Dexie | Dual-read |
| Memories | localStorage (store.longTermMemory) | Legacy |
| Relationships | localStorage (relations_v1) | Legacy |
| Moments | localStorage (moments_v1) | Legacy |
| Worldbook | localStorage (worldbook_v1) | Legacy |
| Assets / Blobs | IndexedDB (idb.js) | 稳定 |
| Asset Metadata | Dexie (assets 表) | Phase 6 新增 |
| Settings | localStorage (store.settings) | 稳定 |
| Migration metadata | localStorage (meta_v2) | 稳定 |

### 4.2 Migration 状态

| Migration | 状态 |
|-----------|------|
| V1→V2（localStorage schema） | ✅ 完成，90/90 测试 |
| localStorage→Dexie（Message） | ⚠️ 机制完成，启动时自动迁移 |
| localStorage→Dexie（Character） | ⚠️ 机制完成，未自动启用 |
| localStorage→Dexie（Conversation） | ❌ 未实现 |
| localStorage→Dexie（Memory/Relationship/Moments） | ❌ 未实现（Phase 7-11） |

---

## 5. Message Status

**阶段：Dual-write，Legacy read**

| 路径 | 状态 |
|------|------|
| 写入 | ✅ messageStore → localStorage + Dexie（双写） |
| 读取 | ❌ UI 直接访问 chat.messages[]（localStorage） |
| 分页 | ✅ messageStore 支持，UI 未使用 |
| 搜索 | ✅ messageStore 支持，UI 未使用 |
| 分支 | ✅ messageStore 支持，UI 未使用 |
| 自动迁移 | ✅ 应用启动时后台迁移 |

**关键问题**：长聊天（1000+ 消息）性能差，因为 UI 全量加载 chat.messages[]。

**下一步**：STAGE 1 — 切换读取到 Dexie。

---

## 6. Conversation Status

**阶段：Legacy only**

| 路径 | 状态 |
|------|------|
| 写入 | ❌ store.createChat/updateChat/deleteChat（localStorage） |
| 读取 | ❌ store.getState().chats（localStorage） |
| Dexie | ❌ ConversationRepository 已定义但未被调用 |
| 多对话 | ✅ Domain 层支持，UI 未支持 |
| Archive/Rename/Pin | ✅ Domain 层支持，UI 未使用 |

**下一步**：STAGE 2 — Conversation Storage Cutover。

---

## 7. Character Status

**阶段：Dual-read，Dexie write + Legacy write**

| 路径 | 状态 |
|------|------|
| 写入 | ✅ CharacterRepository → Dexie + Legacy（双写） |
| 读取 | ✅ CharacterRepository → Dexie 优先 + Legacy fallback |
| 级联删除 | ✅ soft delete → archive conversations |
| 永久删除 | ✅ 删除 chats/memory/relations/moments |
| 自动迁移 | ❌ 未在启动时启用 |
| fallback 推导 | ⚠️ 仍存在，从 chats 推导 |

**下一步**：STAGE 3 — Character Storage Cutover + 移除 fallback。

---

## 8. Asset Status

**阶段：Infrastructure complete, UI not integrated**

| 路径 | 状态 |
|------|------|
| 写入 | ✅ AssetRepository → IndexedDB (blob) + Dexie (metadata) |
| 读取 | ✅ AssetRepository → IndexedDB + Dexie |
| UI 接入 | ❌ V1 仍使用 base64 / URL |
| orphan cleanup | ⚠️ 接口已定义，未实现 |
| Avatar 管理 | ✅ Domain 层支持，UI 未使用 |
| Moment 图片 | ✅ Domain 层支持，UI 未使用 |

**下一步**：STAGE 3 — Asset Cleanup + UI 接入。

---

## 9. UI Status

**阶段：V1 Legacy，待逐步演进**

| 模块 | 状态 |
|------|------|
| Character List | ❌ 与 Conversation List 混合 |
| Character Detail | ❌ 不存在 |
| Chat | ✅ V1 功能完整 |
| Moments | ✅ V1 基础功能 |
| Memory | ⚠️ V1 简单实现 |
| Settings | ✅ V1 完整 |
| Onboarding | ✅ V1 完整 |
| PWA | ✅ V1 完整（更新系统） |

**UI 技术债**：
- `src/ui/views/index.js` 600+ 行单文件
- UI 直接访问 store.getState()，未完全通过 Domain 层
- 无 Character Hub / Character Detail 页面

---

## 10. Known Technical Debt

### 高优先级（STAGE 1-3 必须处理）

1. **Message 读取未切换到 Dexie**
   - 影响：长聊天性能差
   - 计划：STAGE 1

2. **Conversation 未迁移到 Dexie**
   - 影响：数据量增长后性能下降
   - 计划：STAGE 2

3. **Character fallback 推导仍存在**
   - 影响：数据可能不一致
   - 计划：STAGE 3

### 中优先级（STAGE 4-10 处理）

4. **Asset Domain 未接入 UI**
   - 计划：STAGE 3 后续

5. **moments.js / relations.js / memory.js 直接访问 storage**
   - 计划：STAGE 6-10 重构时通过 Repository

6. **UI 600+ 行单文件**
   - 计划：STAGE 4 逐步拆分

### 低优先级（长期）

7. **无 E2E / Visual Regression 测试**
   - Stage 0 提供了 CDP 手工验证脚本，正式 E2E 仍未建立

8. **SVG sprite / CSS bundling**
   - 不影响功能，暂不处理

9. **本机 8080 端口可能被 Steam CEF 占用**
   - 开发时改用其他端口（如 8765）

---

## 11. Current Product Capabilities

✅ **已实现并可用**：
- 创建角色（从模板）
- 聊天（流式响应）
- 消息持久化（localStorage）
- Memory（简单长期记忆）
- Moments（基础朋友圈）
- Relationship（基础好感度）
- Worldbook（基础设定）
- Settings（API Key / 主题 / 模型）
- PWA（安装 / 离线 / 更新）
- 数据导入导出
- Migration V1→V2

⚠️ **基础设施完成，UI 未接入**：
- Message 分页 / 搜索 / 分支
- Character 一级实体
- Conversation 多对话
- Asset 管理

❌ **未实现**：
- Character Reconstruction
- Memory 相关检索
- Relationship Event History
- Behavior Engine
- Context Builder
- Plugin System
- Cloud / Account / Sync
- Desktop / Mobile Native

---

## 12. Not Yet Implemented

以下功能**仅在架构文档中设计，代码未实现**：

- ❌ Character Reconstruction（从聊天记录重建角色）
- ❌ Memory 分层（Short-term / Long-term / Relationship / Social）
- ❌ Relationship Current State + Event History
- ❌ Behavior Engine
- ❌ Context Builder（AI 数据边界）
- ❌ Moments 与 Memory/Relationship 联动
- ❌ Plugin System
- ❌ Cloud / Account / Sync / Community
- ❌ Desktop (Tauri) / Mobile Native
- ❌ TypeScript
- ❌ 正式 E2E / Visual Regression（Stage 0 仅有 CDP 验证脚本）

---

## 13. Next Action

**STAGE 0 已完成。STOP。**

下一阶段（需独立审查批准后才开始）：

```
STAGE 1 — Message Dexie Read Cutover
```

**不要自动开始 Stage 1。**

---

## 14. Stage 0 Issues Log

### P0
- （无未关闭 P0）
- ✅ 已修复：`main.js` 导入 `SettingRow` / `openConfirm` / `Segmented`，但 `src/ui/components/index.js` 未导出 → **应用无法启动**。Stage 0 已补齐导出与基础 Settings CSS / icons。
- ✅ 已修复：`tests/migration_atomicity_test.mjs` 在 Windows 上用绝对路径 `import()` 失败（`ERR_UNSUPPORTED_ESM_URL_SCHEME`）。改为 `pathToFileURL`。

### P1
- 发送消息在未配置 API Key 时直接 return，**不会写入用户消息**（产品既有行为；手工验证需先配置 Key）。
- 本机默认文档端口 8080 可能被 Steam `steamwebhelper` 占用，导致打开错误页面。

### P2
- Moments 自动生成仍依赖 AI summary；基础 CRUD/点赞/评论可用。
- Message 仍为 dual-write + legacy read（已知，属 Stage 1）。

### Stage 0 Decision
**STAGE 0 PASS**

---

## 15. 权威文档索引

| 文档 | 路径 | 用途 |
|------|------|------|
| Master Roadmap | `docs/roadmap/ECHOCHAT_CURSOR_MASTER_ROADMAP.md` | Cursor 最高级开发路线 |
| Cursor Handoff | `docs/baseline/CURSOR_HANDOFF_BASELINE.md` | Cursor 接管第一份文件 |
| Foundation Gate | `docs/baseline/PHASE_0_6_FOUNDATION_GATE_REPORT.md` | Phase 0-6 验收报告 |
| 长期架构 | `docs/architecture/ECHOCHAT_LONG_TERM_ARCHITECTURE.md` | 2-3 年架构方向 |
| 接线审计 | `docs/baseline/PHASE_0_6_WIRING_AUDIT.md` | 存储调用链审计 |
| 性能基线 | `docs/baseline/PHASE_0_6_PERFORMANCE_BASELINE.md` | 性能测量数据 |

---

**本文档必须在每个 Stage 完成后更新。**
**如果实际状态与本文档不一致，以本文档为准进行修正。**
