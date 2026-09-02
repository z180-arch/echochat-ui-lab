# EchoChat Current State

> **Superseded.** Current product state is [`V1_1_RC_CURRENT_STATE.md`](./V1_1_RC_CURRENT_STATE.md) at commit `403e721`.
>
> 本文档是 2026-09-01 Core Product Loop 的历史快照。其中的 Stage 0–13、“下一步 STAGE 6”、以及「Context Builder / Relationship Event History 未实现」**不能**当作当前待办。V1.1 RC 已上线。
>
> 最后更新（本文快照）：2026-09-01  
> 当前 Commit（本文快照）：Core Product Completion Wave  
> 状态：**HISTORICAL** — 权威状态见 V1.1 RC Current State

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
| Message Store（双写 + Dexie 读） | ✅ 完成 | 100%（Stage 1 读取已切换；legacy 双写保留） |
| Character Domain | ✅ 完成 | 95%（Hub + Detail + 导入导出；Dexie 不可用时仍可从 chats 推导） |
| Conversation Domain | ✅ 完成 | 92%（Repository 读写 + 启动迁移；列表按 last message 排序，仍用 store.chats 双写副本） |
| Asset Domain | ✅ 完成 | 75%（头像路径解析 + blob: 回退；导入图仍多为 URL/dataURL，未强制迁 blob 表） |

---

## 3. Test Status

### 3.1 自动化测试（Batch 1 本地复验）

| 测试套件 | 测试数 | 本地结果 | CI |
|----------|--------|----------|-----|
| Migration Atomicity | 90 assertions | ✅ 90/90 PASS | 随 push |
| Foundation Test | 24 tests | ✅ 24/24 PASS | 随 push |
| Storage Cutover | 28 tests | ✅ 28/28 PASS | 随 push |
| Core Product | 19 tests | ✅ 19/19 PASS | 随 push |
| Reconstruction | 20 tests | ✅ 20/20 PASS | 随 push |
| Core Loop | 12 tests | ✅ 12/12 PASS | 随 push |
| **总计** | **193** | **✅ 193/193 PASS** | 随 push |

语法检查：`node --check` 覆盖 `src/**/*.js` — 本地 0 失败。
新增套件：`node tests/storage_cutover_test.mjs`（Windows 使用 `pathToFileURL`）。Node 无 IndexedDB，测试注入内存 Dexie 形 Adapter。

### 3.2 测试覆盖

| 领域 | 覆盖 |
|------|------|
| Migration 安全 | ✅ 15 scenarios |
| Message lifecycle | ✅ create/read/update/delete/100 messages + Dexie 优先读 / 分页不全切 / 迁移幂等 |
| Character CRUD | ✅ create/multi-conversation/soft-delete + Repository SoT + 启动迁移 |
| Conversation CRUD | ✅ create/rename/archive/delete + Dexie 双写 / 非破坏迁移 |
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
| "142/142 PASS" | 被 161/161 取代 | Core Product 套件 +19 |
| "161/161 PASS" | 被 181/181 取代 | Reconstruction +20 |
| "181/181 PASS" | 被 193/193 取代 | Core Loop +12 |
| "193/193 PASS" | ✅ 本波次本地复验 | + Memory candidates / relationship stage / moments-from-memory |
| "Browser core flow PASS" | ✅ Wave CDP | Hub + 记忆 + 角色 tab + 1280/390 |
| "Reconstruction browser PASS" | ✅ Recon CDP | 解析/审查/创建/隔离/进对话/刷新/390 |
| "Core loop browser PASS" | ✅ Loop CDP | 空关系 / 提取隔离 / 确认记忆+动态 / 刷新 / 390 |
| "Dexie 迁移完整" | ✅ Message/Conversation/Character 启动迁移已跑通 | Memory/Relationship/Moments 仍未迁 |
| "PWA 更新正常" | ⚠️ 未在本次验证 | 之前 V1 Closing Pass 验证过 |

### 3.5 Batch 1 Runtime / Manual Verification（2026-09-01）

| 检查项 | 结果 | 备注 |
|--------|------|------|
| 应用启动 | PASS | Landing 正常；无阻塞启动错误 |
| 主 UI 加载 | PASS | EchoApp 就绪 |
| Console 致命错误 | PASS | `window.__errors` 为空 |
| Create Character | PASS | Onboarding → 橘小喵；Character 写入 Dexie |
| Start Chat | PASS | 进入对话，开场白可见 |
| Send Message | PASS | 用户消息 + stub AI 回复 |
| Dexie canonical read | PASS | `getMessages` 与 Dexie 表一致（3）；顺序正确 |
| Refresh | PASS | 刷新后仍为 app 视图 |
| Persistence | PASS | 刷新后 Dexie 与 UI 均保留 ping + AI 回复 |
| Continue Chat | PASS | 刷新后继续发送成功（5 条） |
| Long conversation 50+ | PASS | 55 条；Dexie 全量读 1.6ms；插入含双写 1399.9ms |
| New empty conversation | PASS | 同角色第二条对话为空；旧对话仍在 |
| Desktop 1280×800 | PASS | CDP headless |
| Mobile 390×844 | PASS | bottom nav 可见 |

验证脚本：`scripts/batch1_browser_verify.mjs`、`scripts/wave_browser_verify.mjs`、`scripts/reconstruction_browser_verify.mjs`、`scripts/core_loop_browser_verify.mjs`。Stage 0 脚本仍保留：`scripts/stage0_browser_verify.mjs`。

---

## 4. Storage Status

### 4.1 数据分类

| 数据类型 | 存储位置 | 状态 |
|----------|----------|------|
| Chats / Conversations | localStorage (store) **+ Dexie conversations**（双写） | Dual-write |
| Messages | localStorage + Dexie（双写）；**运行时读 Dexie** | Dexie read |
| Characters | Dexie canonical + chats 推导 fallback（仅 Dexie 不可用或未迁移） | Dexie SoT |
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
| localStorage→Dexie（Message） | ✅ 启动时自动迁移；读路径 Dexie 优先 |
| localStorage→Dexie（Character） | ✅ 启动时自动迁移（幂等，不删 chats） |
| localStorage→Dexie（Conversation） | ✅ 启动时自动迁移（幂等，不删 chats/messages） |
| localStorage→Dexie（Memory/Relationship/Moments） | ❌ 未实现（Phase 7-11） |

---

## 5. Message Status

**阶段：Dual-write，Dexie canonical read（Stage 1）**

| 路径 | 状态 |
|------|------|
| 写入 | ✅ messageStore → localStorage + Dexie（双写；Dexie await） |
| 读取 | ✅ Dexie 优先（`getMessages` / `peekMessages`）；未迁移时 fallback localStorage |
| UI | ✅ 不再以 `chat.messages[]` dump 作为权威读路径；`peekMessages` + list preview |
| 分页 | ✅ messageStore 支持；长会话默认全量 Dexie 读（pageSize=count），避免静默截断 50 条 |
| 搜索 | ✅ messageStore 支持，UI 未使用 |
| 分支 | ✅ messageStore 支持，UI 未使用 |
| 自动迁移 | ✅ 应用启动 `bootstrapStorage` |

**性能（浏览器真实 Dexie，2026-09-01）**：
- 100 msgs：bulk insert 15.9ms，全量读 5.7ms，page(50) 4.8ms
- 500 msgs：bulk insert 108.2ms，全量读 9.3ms，page(50) 10.3ms
- 1000 msgs：bulk insert 214.8ms，全量读 19.7ms，page(50) 19.6ms
- 55 msgs 双写插入（含 localStorage）1399.9ms；随后 Dexie 全量读 1.6ms

未对 page(50) 做索引级提前截断（全量 sort 再 slice）。1000 条读 <20ms，不提前优化。

**下一步**：STAGE 4 — Character Experience / Hub（存储 cutover 已完成）。Legacy message 写入尚未移除（有意保留）。

---

## 6. Conversation Status

**阶段：Dexie + localStorage 双写（Stage 2）**

| 路径 | 状态 |
|------|------|
| 写入 | ✅ ConversationRepository → Dexie + legacy chats |
| 读取 | ✅ ConversationRepository Dexie 优先，fallback localStorage |
| Dexie | ✅ 启动时从 chats 非破坏迁移 |
| 多对话 | ✅ Domain + Repository；Hub 可开新对话 / 继续最近对话；消息列表按 last message 排序 |
| Archive/Rename/Pin | ✅ Domain 层支持，UI 未使用 |

**下一步**：STAGE 4 UI 不在本 batch。

---

## 7. Character Status

**阶段：Repository 为运行时 SoT + Character Hub（本波次）**

| 路径 | 状态 |
|------|------|
| 写入 | ✅ CharacterRepository → Dexie（+ 关联 chat 元数据双写于 update） |
| 读取 | ✅ CharacterRepository → Dexie 优先；Dexie 不可用或未迁移时从 chats 推导 |
| Hub | ✅ 独立「角色」tab：列表 / 详情 / 继续对话 / 新对话 / 编辑 |
| 导入导出 | ✅ SillyTavern v1/v2 JSON；缺字段默认值；损坏输入不写数据 |
| 级联删除 | ✅ soft delete → archive conversations |
| 永久删除 | ✅ 删除 chats/memory/relations/moments |
| 自动迁移 | ✅ 启动时 `migrateFromLegacy`（幂等，不删 chats） |
| fallback 推导 | ✅ 仅保留在 Repository 层；string persona 正确映射 identity |
| Reconstruction | ✅ 纯文本 `名字: 内容` → 结构化审查（证据 + 数据不足）→ `createFromTemplate` / CharacterRepository；`source: reconstructed` |

**下一步**：Stage 6 记忆候选确认等产品深化；UI V3 仍非必须。

---

## 8. Asset Status

**阶段：Infrastructure complete, UI not integrated**

| 路径 | 状态 |
|------|------|
| 写入 | ✅ AssetRepository → IndexedDB (blob) + Dexie (metadata) |
| 读取 | ✅ AssetRepository → IndexedDB + Dexie |
| UI 接入 | ⚠️ 头像使用路径 / dataURL；`blob:` 视为失效并回退 default.svg |
| orphan cleanup | ⚠️ 接口已定义，未实现 |
| Avatar 管理 | ✅ Domain 层支持，UI 未使用 |
| Moment 图片 | ✅ Domain 层支持，UI 未使用 |

**下一步**：STAGE 3 — Asset Cleanup + UI 接入。

---

## 9. UI Status

**阶段：V1 Legacy，待逐步演进**

| 模块 | 状态 |
|------|------|
| Character List | ✅ 独立「角色」tab（Morning Mint，未改视觉系统） |
| Character Detail | ✅ 身份 / 关系 / 对话 / 记忆 / 动态 |
| Chat | ✅ V1 功能完整 |
| Moments | ✅ 按 characterId 筛选；头像取自角色 |
| Memory | ✅ 角色隔离 + Hub 可见/可增删/从对话提取候选 + 注入 prompt |
| Settings | ✅ V1 完整 |
| Onboarding | ✅ V1 完整（含「从记录重建」） |
| Reconstruction | ✅ 粘贴/文本文件 → 审查弹窗 → 创建角色 |
| PWA | ✅ V1 完整（更新系统） |

**UI 技术债**：
- `src/ui/views/index.js` 仍为单文件（已增大）
- UI 仍部分读取 store.getState() 双写副本
- 向量记忆 / 关系事件史未做

---

## 10. Known Technical Debt

### 高优先级（STAGE 1-3 — 本 batch 已处理）

1. **Message 读取已切换到 Dexie** ✅ Stage 1
2. **Conversation 已迁移到 Dexie（双写）** ✅ Stage 2
3. **Character Repository 为运行时 SoT；启动自动迁移** ✅ Stage 3
   - Domain 层二次 fallback 已移除
   - Repository 层在 Dexie 不可用时仍可从 chats 推导（安全网）

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
- 消息持久化（Dexie canonical read + localStorage 双写）
- Memory（CRUD / 关键词检索 / 对话候选审查 / 注入 prompt）
- Moments（基础朋友圈；确认记忆时可本地发动态）
- Relationship（轮次亲密度 + 可见阶段 + 注入行为）
- Worldbook（基础设定）
- Settings（API Key / 主题 / 模型）
- PWA（安装 / 离线 / 更新）
- 数据导入导出
- Migration V1→V2
- Character Reconstruction（纯文本聊天记录 → 结构化审查 → 现有 Character 合同）

⚠️ **基础设施完成，UI 未接入**：
- Message 分页 / 搜索 / 分支
- Character 一级实体
- Conversation 多对话
- Asset 管理

❌ **未实现**：
- Memory 相关检索的向量层（关键词检索已有）
- Relationship Event History
- Plugin System
- Cloud / Account / Sync
- Desktop / Mobile Native

---

## 12. Not Yet Implemented

以下功能**仅在架构文档中设计，代码未实现**：

- ✅ Character Reconstruction MVP（纯文本导入 / 证据 / 数据不足 / 审查确认 / 可进入对话）
- ✅ Memory 候选提取 + 用户确认（启发式；未迁 Dexie / 无向量）
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

**Core product loop is substantially coherent.** Morning Mint UI V2 remains sufficient.

有意推迟（后期 / 需更大架构或 UI）：

```
Memory 迁 Dexie / 向量检索
Relationship Event History
Asset blob 作为头像主存储
Plugin / Cloud
UI V3
```

---

## 14. Batch 1 Issues Log

### P0
- （无未关闭 P0）

### P1
- ~~发送消息在未配置 API Key 时直接 return，不会写入用户消息~~ **已修**：先持久化用户消息，再写入 status=error 的失败气泡。
- 本机默认文档端口 8080 可能被 Steam `steamwebhelper` 占用。
- Dual-write 仍把完整 `chats[].messages` 写入 localStorage。

### P2
- Moments 自动摘要仍依赖 AI；确认记忆时可本地发一条动态。
- Asset blob 表仍未作为头像主存储（路径 / dataURL 为主）。
- 无向量检索；Memory 为关键词 + importance。
- Relationship 无 Event History（阶段由现有 affinity 推导，已接到 prompt）。

### Reconstruction Wave Decision
**PASS.** Character Reconstruction 走现有 CharacterRepository / createFromTemplate，无平行角色系统。UI 为 Hub/Landing 入口 + 审查弹窗，不构成 V3 升级理由。

### Core Product Completion Wave Decision
**PASS.** 核心角色伴侣闭环在现有架构上已连贯：创建/导入/重建 → 对话 → 记忆候选确认 → 关系阶段 → 行为注入 → 动态。UI V2 仍足够，不升级 V3。

---

## 15. 权威文档索引

| 文档 | 路径 | 用途 |
|------|------|------|
| **V1.1 RC Current State** | `docs/baseline/V1_1_RC_CURRENT_STATE.md` | **当前权威状态** |
| Master Roadmap | `docs/roadmap/ECHOCHAT_CURSOR_MASTER_ROADMAP.md` | 历史 Stage 路线（不再作为默认执行模型） |
| Cursor Handoff | `docs/baseline/CURSOR_HANDOFF_BASELINE.md` | Cursor 接管第一份文件 |
| Foundation Gate | `docs/baseline/PHASE_0_6_FOUNDATION_GATE_REPORT.md` | Phase 0-6 验收报告 |
| 长期架构 | `docs/architecture/ECHOCHAT_LONG_TERM_ARCHITECTURE.md` | 2-3 年架构方向 |
| 接线审计 | `docs/baseline/PHASE_0_6_WIRING_AUDIT.md` | 存储调用链审计 |
| 性能基线 | `docs/baseline/PHASE_0_6_PERFORMANCE_BASELINE.md` | 性能测量数据 |

---

**本文档必须在每个 Stage 完成后更新。**
**如果实际状态与本文档不一致，以本文档为准进行修正。**
