# EchoChat Cursor Master Roadmap

> 文档版本：1.0  
> 创建日期：2026-08-31  
> 状态：**HISTORICAL — 不再是默认执行模型**
>
> V1.1 RC 已在 `403e721` 上线。不要按 Stage 0→13 自动往下做。当前状态与开发循环见 [`docs/baseline/V1_1_RC_CURRENT_STATE.md`](../baseline/V1_1_RC_CURRENT_STATE.md)。

---

## 0. Executive Summary

EchoChat Lite 当前**不是继续"大重构"的阶段**。

当前进入：

```
Foundation Closure
        ↓
Independent Verification
        ↓
Storage Cutover
        ↓
Character Experience
        ↓
Character Reconstruction
        ↓
Memory / Relationship
        ↓
Behavior / Context
        ↓
Moments
        ↓
Product Polish
```

**核心原则**：不允许因为长期架构文档已经设计了未来系统，就提前实现未来系统。

每个 Stage 完成后必须 **STOP**，等待独立审查，不得自动进入下一阶段。

---

## 1. 当前阶段定位

**当前阶段：Character Reconstruction MVP COMPLETE**

已完成：
- Phase 0-6 Foundation 施工（Repository / Dexie / Message / Character / Conversation / Asset）
- Foundation Gate Report：READY FOR CURSOR
- Stage 0 Foundation Verification
- Stage 1 Message Dexie Read Cutover
- Stage 2 Conversation Storage Migration
- Stage 3 Character Repository Cutover
- Stage 4 Character Hub / Detail（Core Product Completion Wave）
- Stage 5 Character Reconstruction MVP（纯文本 → 审查 → CharacterRepository）
- 181/181 自动化测试（含 Reconstruction 20）

未完成：
- Asset Domain 未接入 UI / orphan cleanup
- Memory 候选确认流水线 / Relationship Event History
- UI V3（当前不必须）

---

## 2. STAGE 0 — Foundation Verification

### Goal
证明当前 Foundation 真的可靠，不是"代码写出来了"。

### Scope
- 测试修复与跨环境验证
- CI 基础建设
- 核心浏览器流程手工验证
- Migration 安全验证
- Repository / Storage Boundary 验证

### Allowed Files
- `tests/`
- `.github/workflows/`
- `docs/baseline/`
- 测试相关的基础设施

### Forbidden Files
- `src/domain/`（除测试修复外）
- `src/ui/`
- `src/infrastructure/`（除测试修复外）

### Tasks

1. **修复测试硬编码路径** ✅（已完成）
   - foundation_test.mjs 使用 import.meta.url 解析路径
   - 确保 GitHub clone 到任何机器后都能运行

2. **建立 GitHub Actions 基础 CI**
   - Node.js 环境
   - 运行 migration_atomicity_test.mjs
   - 运行 foundation_test.mjs
   - 语法检查所有 .js 文件

3. **跑完整测试**
   - Migration：90 assertions
   - Foundation：24 tests
   - 总计：114 tests

4. **检查 Migration**
   - V1→V2 正常迁移
   - 损坏数据不破坏原始数据
   - 重复启动幂等
   - 中途失败可重试

5. **检查 Repository Boundary**
   - Domain 层不直接访问 localStorage/IndexedDB/Dexie
   - message-store.js 双写过渡为已知例外
   - moments.js / relations.js 为 Deferred Legacy

6. **检查 Storage Boundary**
   - 大型数据 → Dexie/IndexedDB
   - 小型配置 → localStorage
   - 二进制 → IndexedDB blobs

7. **核心浏览器流程手工验证**
   ```
   创建 Character
   ↓
   进入 Chat
   ↓
   发送消息
   ↓
   收到 AI 回复
   ↓
   刷新
   ↓
   重新打开
   ↓
   消息顺序正确
   ↓
   继续发送
   ↓
   关闭页面
   ↓
   重新打开
   ↓
   数据仍然正确
   ```

### Manual Verification
- Desktop Chromium：1280×800
- Mobile viewport：390×844

### Exit Criteria
必须满足：
- ✅ CI PASS
- ✅ Migration PASS（90/90）
- ✅ Foundation tests PASS（24/24）
- ✅ Core Chat flow PASS（Desktop + Mobile）
- ✅ No unexplained regression

**完成之后才进入 Stage 1。**

---

## 3. STAGE 1 — Message Storage Cutover

### Goal
将 Message 的 read path 和 write path 逐步切换到 Dexie。

**P0 — Cursor 接管后的第一个真正开发阶段。**

### Scope
- `src/domain/message-store.js`
- `src/domain/chat.js`
- `src/ui/views/index.js`（消息渲染部分）
- `src/infrastructure/dexie-adapter.js`（Message 部分）

### Forbidden
- ❌ 修改 Character 产品模型
- ❌ 新建 Memory / Relationship / Behavior / Moments
- ❌ Cloud / Plugin / SQLite / Tauri
- ❌ React/Vue/大型框架迁移
- ❌ 全量 TypeScript 重写
- ❌ Monorepo
- ❌ Full Event Sourcing

### Implementation Strategy

**渐进式切换，每一步可验证：**

```
Step 1: Dual Write（已完成）
  写：localStorage + Dexie
  读：localStorage

Step 2: Dexie Read + Legacy Write
  写：localStorage + Dexie
  读：Dexie 优先，fallback localStorage

Step 3: Dexie Read + Dexie Write
  写：Dexie（localStorage 仅用于迁移兼容）
  读：Dexie

Step 4: Legacy Read Removed
  读：Dexie only
  写：Dexie + localStorage（迁移兼容）

Step 5: Legacy Write Removed
  读：Dexie only
  写：Dexie only
  localStorage 消息存储完全移除
```

### Key Changes
1. UI 层不再直接访问 `chat.messages[]`
2. 通过 `messageStore.getMessages(chatId, { page, pageSize })` 分页加载
3. 长聊天使用虚拟滚动或分页
4. 保留 localStorage fallback 直到 Step 4

### Tests
- Message lifecycle：create/read/update/delete/search/pagination
- 100 / 500 / 1000 / 5000 消息规模
- 数据一致性：Dexie vs localStorage
- 迁移完整性：旧消息全部迁移

### Manual Verification
```
创建 Character
+ 发送至少 50 条消息
+ 刷新
+ 关闭
+ 重新打开
+ 消息顺序/内容完全一致
```
至少在两个浏览器环境验证。

### Exit Criteria
- ✅ Dexie 成为 canonical read path
- ✅ 50+ 消息刷新后完全一致
- ✅ 1000 消息无明显性能退化
- ✅ 两个浏览器环境验证通过
- ✅ 之后才能移除 Message Legacy Read

---

## 4. STAGE 2 — Conversation Storage Cutover

### Goal
ConversationRepository 成为真实 canonical path。

### Scope
- `src/repository/conversation.js`
- `src/domain/conversation.js`
- `src/infrastructure/dexie-adapter.js`（Conversation 部分）
- `src/ui/views/index.js`（对话列表部分）

### Tasks
1. Conversation 数据迁移到 Dexie
2. Read 路径切换到 ConversationRepository
3. Write 路径切换到 ConversationRepository
4. Delete / Reload / Error recovery 验证
5. 支持一个 Character 多个 Conversation

### Exit Criteria
- ✅ Conversation 读写全部通过 Repository
- ✅ 多对话列表正常显示
- ✅ 删除对话不影响 Character
- ✅ 完整回归测试通过

---

## 5. STAGE 3 — Character Storage Cutover + Asset Cleanup

### Goal
Character 完成最终迁移，Asset 完成一致性检查。

### Scope
- `src/repository/character.js`
- `src/domain/character.js`
- `src/repository/asset.js`
- `src/domain/asset.js`

### Important
**不允许因为 Character Storage Cutover 顺手修改 Character 产品 UX。**
Storage 与 Product UX 必须分开提交。

### Tasks
1. Character 自动迁移（应用启动时）
2. 移除 character.js fallback 推导
3. CharacterRepository 成为唯一 canonical path
4. Asset 一致性检查：
   - orphan metadata（metadata 存在但 blob 丢失）
   - orphan blob（blob 存在但 metadata 丢失）
   - delete cascade
   - replacement
   - reload

### Exit Criteria
- ✅ Character 数据完全在 Dexie
- ✅ 无 fallback 推导
- ✅ Asset 无孤儿数据
- ✅ 完整回归测试通过

---

## 6. STAGE 4 — Character Experience / Hub

### Goal
让 Character 成为产品真正的核心资产，而不是仅存在于数据模型里。

**这是第一个真正的产品 UX 阶段。**

### Scope
- `src/ui/`（Character List / Character Detail）
- `src/domain/character.js`（展示逻辑）
- 新增 Character Hub 页面

### UI/UX Principles
- **Morning Mint 保留**，不推翻当前 Design Freeze
- 风格：Quiet / Personal / Warm / Clean / Character-centric / IM Familiarity / Low Cognitive Load
- 避免：游戏化 / 社交媒体化 / 复杂 Dashboard

### First Version
```
Character
    ↓
Character Detail
    ├── Chat
    ├── Moments（占位，未来实现）
    ├── Memories（占位，未来实现）
    └── Relationship（占位，未来实现）
```

先实现：
- Character List（独立于 Conversation List）
- Character Detail（头像、名称、基本身份、最近对话、关系摘要）
- Character Avatar
- Character Basic Identity
- Recent Conversation
- Recent Moments（占位）
- Relationship summary（基础）

### Character Page 必须回答
1. "这个角色是谁？"
2. "我和它现在是什么关系？"
3. "最近发生了什么？"
4. "我可以和它做什么？"

**不要堆：设置 / 按钮 / 统计 / 参数 / Debug 信息。**

### Exit Criteria
- ✅ Character List 独立于 Conversation List
- ✅ Character Detail 页面可用
- ✅ 从 Character 可进入 Chat
- ✅ 信息密度控制合理
- ✅ Morning Mint 风格一致

---

## 7. STAGE 5 — Character Reconstruction MVP

### Goal
EchoChat 最重要的差异化功能之一：从聊天记录重建 Character。

### Scope
- 新增 `src/domain/reconstruction/`
- Import / Parse / Extract / Review / Confirm 流程

### Input Format
**只做聊天记录文本一种输入格式。**

不要一开始支持：
- ❌ 微信
- ❌ WhatsApp
- ❌ Telegram
- ❌ SillyTavern
- ❌ Discord
- ❌ 各种 JSON / 导出格式

### Pipeline
```
Raw Messages
↓
Parse（标准化消息格式）
↓
Speaker Detection（识别说话人）
↓
Structured Extraction（AI 提取）
↓
User Review（用户审查/编辑）
↓
Confirm
↓
Character Data
```

### Must Be Structured
**禁止**：聊天记录 → AI → 一大段 Prompt

**必须**：结构化输出
- Personality
- Speech Style
- Preferences
- Background
- Behavioral Traits
- Important Memories
- Relationship Clues

### Two Required Mechanisms

#### 1. Evidence
AI 提取结果必须能够追溯到原始消息。
```
Trait: 喜欢晚上散步
Evidence: Message #47, Message #52
```
而不是只给 `Confidence: 87%`。

#### 2. Insufficient Data
如果样本不足：
- 不要强行生成完整人格
- 明确告诉用户："当前数据不足，只能确定 X 项。其他内容需要你补充。"

### Exit Criteria
- ✅ 纯文本聊天记录可导入
- ✅ 结构化提取（至少 5 个维度）
- ✅ Evidence 追溯机制
- ✅ Insufficient Data 处理
- ✅ User Review / Edit / Confirm 流程
- ✅ 生成的 Character 可进入 Chat

**Status: COMPLETE（本波次）。** 本地启发式提取（无 API Key 可用）；不声称线上模型抽取已验证。

---

## 8. STAGE 6 — Memory

### Goal
建立独立的 Memory 系统。

### Definition
- **Memory** = Character 记得发生过什么
- **Worldbook** = 世界/设定/触发知识
- 两者不能混为一个表。

### First Version — Keep It Simple
- Create / Read / Update / Delete / Search
- Relevant Retrieval（关键词匹配，不要向量）
- 自动提取候选 Memory → 用户确认 → 写入

### Don't Do (First Version)
- ❌ 向量数据库
- ❌ Embedding pipeline
- ❌ 复杂 AI memory graph
- ❌ 无限自动总结
- ❌ 多层神经检索

### Exit Criteria
- ✅ Memory CRUD 完整
- ✅ 相关 Memory 可检索
- ✅ 自动提取候选 + 用户确认
- ✅ Memory 与 Worldbook 分离
- ✅ Memory 正确绑定 characterId

**Status: MVP COMPLETE（本波次）。** 对话启发式候选 + 审查写入现有 `longTermMemory`；未迁 Dexie、无向量检索。自动摘要仍依赖 API（有 Key 时）。

---

## 9. STAGE 7 — Relationship

### Goal
建立 Relationship 一级 Domain。

### Model
**Current State + Event History**（禁止 Full Event Sourcing）

```
Relationship
├── affinity
├── trust
├── familiarity
├── currentMood
├── relationshipStage
├── status
└── updatedAt

RelationshipEvent
├── relationshipId
├── type
├── delta
├── reason
├── source
└── createdAt
```

### First Version Dimensions
- Affinity
- Trust
- Familiarity
- Current Mood
- Relationship Stage
- Recent Events

### Don't Do
- ❌ 排行榜
- ❌ 竞争
- ❌ 关系数值刷分
- ❌ 角色之间关系图谱
- ❌ 复杂 RPG 属性系统

### Exit Criteria
- ✅ Relationship Current State 存储
- ✅ Relationship Event History
- ✅ 聊天后状态变化
- ✅ 可追溯"为什么现在是这个值"
- ✅ 不影响现有聊天功能

---

## 10. STAGE 8 — Memory × Relationship × Behavior

### Goal
产品真正开始"活起来"。

### Pipeline
```
Character
 ↓
Memory
 ↓
Relationship
 ↓
Current State
 ↓
Behavior
 ↓
Context Builder
 ↓
AI Response
```

### Behavior First Version — Must Be Restrained
**只允许**：Override + Simple Linear Weight

**禁止一开始构建**：
- ❌ 复杂人格数学模型
- ❌ 非线性人格融合
- ❌ 黑箱行为模型
- ❌ 复杂规则 DSL

### Goal
不是"架构看起来高级"，而是：
> Character 的行为能被用户明显感知，而且能解释为什么发生。

### Exit Criteria
- ✅ Memory 影响 AI 回复
- ✅ Relationship 影响 AI 回复
- ✅ Behavior 变化可解释
- ✅ 用户能感知"角色在变化"
- ✅ 无明显人格崩坏

---

## 11. STAGE 9 — Context Builder

### Goal
Context Builder 成为独立边界，AI Provider 不能直接读取数据库。

### Architecture
```
Database
↓
Retrieval（Memory / Relationship / Worldbook）
↓
Context Budget（Token 限制）
↓
Relevant Context（优先级排序）
↓
Behavior Engine
↓
Prompt Builder
↓
AI Provider
```

### Must Have
- Token Budget
- Retrieval Limit
- Priority
- Conflict Resolution

### Hard Rule
**AI Provider 永远不能直接读取数据库。**
只能收到 Context Builder 选择后的最小必要上下文。

### Exit Criteria
- ✅ Context Builder 独立模块
- ✅ AI 请求只包含最小必要上下文
- ✅ Token Budget 生效
- ✅ 无全量数据库发送

---

## 12. STAGE 10 — Moments

### Goal
让 Character 在用户没有主动聊天时仍然具有"存在感"。

### Definition
Moments 不是普通朋友圈。它的作用是：
> 让 Character 在用户没有主动聊天时仍然具有"存在感"。

### Integration
Moments 必须逐渐与 Memory / Relationship / Behavior 联动：
```
最近聊到某件事
↓
Memory
↓
Relationship
↓
Behavior
↓
Moment
```

### Don't Do (First Version)
- ❌ 社交网络
- ❌ 用户关注系统
- ❌ 推荐算法
- ❌ 热榜
- ❌ 社区
- ❌ 多角色关系图谱
- ❌ Feed ranking
- ❌ 社交竞争

### UX Principles
- 安静
- 文字优先
- 角色优先
- 关系优先
- 不是 TikTok 化 / Instagram 化 / 无限滚动刺激

### Exit Criteria
- ✅ Character 可发布 Moment
- ✅ 用户可互动（点赞/评论）
- ✅ 互动影响 Relationship
- ✅ 互动产生 Memory 候选
- ✅ Moment 与 Character 身份一致

---

## 13. STAGE 11 — Product Loop Validation

### Goal
停止继续扩展功能，验证核心循环。

### Core Loop
```
进入 EchoChat
↓
选择/创建 Character
↓
开始聊天
↓
Character 逐渐记住用户
↓
Relationship 发生变化
↓
Character 行为发生变化
↓
Character 发布 Moment
↓
用户看到 Moment
↓
用户重新进入 Chat
↓
Character 能引用之前发生的事情
↓
用户感觉"这是同一个角色"
```

### Core Question
> 用户是否真的感觉 Character 在持续存在，而不是每次打开都重新生成一个机器人？

如果答案是否定的：**停止加功能，优化核心循环。**

### Exit Criteria
- ✅ 核心循环完整跑通
- ✅ 用户可感知 Character 持续性
- ✅ Memory / Relationship / Behavior / Moments 联动
- ✅ 无明显断裂感

---

## 14. STAGE 12 — Privacy Baseline

### Goal
Cloud 之前提前做本地安全基础。

### Priority
API Key 本地安全存储。

可以研究 Web Crypto。

### Hard Rule
**不因为 Privacy Baseline 提前实现 Cloud。**
Cloud 暂时不做。

### Exit Criteria
- ✅ API Key 安全存储方案
- ✅ 本地加密可行性评估
- ✅ 隐私边界文档更新
- ❌ 无 Cloud 实现

---

## 15. STAGE 13 — UI/UX Product Refinement

### Goal
产品级 UI/UX 打磨。

### Approach
UI 不应该最后才装修。采用：
```
Foundation UI
↓
Character Identity
↓
Character Hub
↓
Reconstruction Review
↓
Memory Feedback
↓
Relationship Feedback
↓
Moments Behavior
↓
Product Polish
```

每个功能开发时同步设计它的用户界面。

### UI Design Core
关键词：Quiet / Personal / Warm / Clean / Character-centric / IM Familiarity / Low Cognitive Load

避免：AI Dashboard / 复杂数据面板 / 游戏属性栏 / 过度玻璃拟态 / 过度渐变 / 社交媒体喧闹感

### Empty States
必须逐步设计：
- No Character
- No Conversation
- No Memory
- No Moment
- No Relationship

每个 Empty State 都应该告诉用户：**下一步做什么。**

### Loading / Error
必须有：
- Loading
- AI thinking
- Network error
- Storage error
- Migration error
- Import error
- Empty result

不能让用户面对：undefined / null / 空白页面

---

## 16. 严格禁止的事情

Cursor 后续**不得自主执行**：

### Architecture
- ❌ Full Rebuild
- ❌ Full Rewrite
- ❌ Full Event Sourcing
- ❌ Monorepo
- ❌ SQLite WASM（Web 端）
- ❌ 大型前端框架迁移（React/Vue/Angular）
- ❌ 全量 TypeScript 重写

### Product
- ❌ Plugin
- ❌ Cloud
- ❌ Community
- ❌ Desktop Native（Tauri/Electron）
- ❌ Mobile Native
- ❌ 多角色关系图谱
- ❌ 排行榜
- ❌ 社交竞争

### AI
- ❌ 复杂 Agent Framework
- ❌ 复杂 Multi-Agent
- ❌ 复杂 RAG 平台
- ❌ Embedding 基础设施过早建设

---

## 17. Cursor 权限边界

### Cursor 可以自主执行
- ✅ 实现已经批准的功能
- ✅ 补测试
- ✅ 修 Bug
- ✅ 局部重构
- ✅ CSS/UI 微调
- ✅ Repository 实现
- ✅ Migration 实现
- ✅ 文档更新

### 必须先报告
以下事情不能自主决定，必须：
```
Explain → Impact → Alternative → Recommendation → Wait
```

- ⚠️ 修改数据 Schema
- ⚠️ 修改 Repository Interface
- ⚠️ 修改 Migration Strategy
- ⚠️ 删除 Legacy Storage
- ⚠️ 修改数据删除策略
- ⚠️ 修改隐私模型
- ⚠️ 修改 API Contract
- ⚠️ 修改 Character 核心模型
- ⚠️ 修改 Message/Conversation 数据契约
- ⚠️ 引入新外部依赖
- ⚠️ 改变 UI Information Architecture

---

## 18. Phase Exit Criteria 模板

每个阶段必须包含：

```
Goal: 阶段目标
Scope: 允许修改的文件范围
Allowed Files: 具体文件列表
Forbidden Files: 禁止修改的文件
Implementation: 实现步骤
Tests: 自动化测试
Manual Verification: 手工验证流程
Regression: 回归测试
Exit Criteria: 进入下一阶段的必要条件
STOP CONDITION: 什么情况下必须停止
```

**任何 Phase 完成，不允许自动进入下一阶段。**
必须 STOP，等待用户/独立 Agent 审查。

---

## 19. Agent 工作纪律

### Rule 1
一次只解决一个阶段。

### Rule 2
不要"顺手重构"。

### Rule 3
不要因为发现未来问题就提前实现未来系统。

### Rule 4
不要把"代码写出来"定义成完成。
完成必须：
```
Code + Test + Manual Verification + Regression
```

### Rule 5
任何超过约 200 行的非必要修改，需要解释原因。

### Rule 6
如果发现架构问题：先报告，不要直接重构。

---

## 20. Independent Review 制度

```
Developer Agent
↓
Phase implementation
↓
Tests
↓
STOP
↓
Independent Review
↓
PASS
↓
Next Phase
```

**禁止**：
```
Agent 写代码
↓
Agent 自己写 PASS
↓
Agent 自己审核
↓
Agent 继续开发
```

---

## 21. 当前 NEXT ACTION

**Core product loop（Hub / Reconstruction / Memory 候选确认 / Relationship stage / Behavior / Moments）已可连贯使用。**

有意推迟：

```
Memory Dexie 迁移 / 向量检索
Relationship Event History
Plugin / Cloud / UI V3
```

---

## 22. 文档维护规则

1. 本文档是 Cursor 接管后的**最高级开发路线**
2. 任何与本文档冲突的旧文档，以本文档为准
3. Stage 完成后更新本文档状态
4. 不创建重复的路线文档
5. 架构决策记录在 `docs/architecture/`，不在本文档

---

**本文档结束。Cursor 从 STAGE 0 开始。**
