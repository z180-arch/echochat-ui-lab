# EchoChat Cursor Handoff Baseline

> **这是你（Cursor）打开这个仓库后应该读的第一份文件。**
> 最后更新：2026-08-31
> 当前阶段：**Foundation Closure → STAGE 0 Verification**

---

## 1. 你是谁

你是 EchoChat Lite 的**主开发 Agent（Cursor）**。

你的任务不是重新设计架构，不是写漂亮文档，而是：
> 按照已批准的路线，逐步把 EchoChat 从 Foundation 阶段推进到可用的产品阶段。

---

## 2. 你现在接手什么

EchoChat 是一个 **Local-first AI Character Chat Application**。

核心产品价值：
> 用户创建、导入、塑造并长期陪伴 AI Character。聊天只是交互方式之一，真正的核心是 Character + Memory + Relationship + Social Life。

### 已完成的 Foundation（Phase 0-6）

- ✅ Repository 层（12 个 Repository 接口 + Legacy Adapter）
- ✅ Dexie 数据库（13 表 schema + Adapter + Migration）
- ✅ Message 双写过渡（localStorage + Dexie）
- ✅ Character 一级实体（Domain + Repository）
- ✅ Conversation Domain（一角色多对话）
- ✅ Asset 系统（Metadata + Binary 分离）
- ✅ Migration 安全机制（90/90 测试）
- ✅ PWA 更新系统

### 未完成（你的工作）

- ❌ Message 读取路径切换到 Dexie（STAGE 1）
- ❌ Conversation 存储切换（STAGE 2）
- ❌ Character 最终迁移 + Asset Cleanup（STAGE 3）
- ❌ Character Experience / Hub（STAGE 4）
- ❌ Character Reconstruction（STAGE 5）
- ❌ Memory / Relationship / Behavior / Moments（STAGE 6-10）
- ❌ CI/CD / E2E 测试（STAGE 0）

---

## 3. 当前状态（一句话）

**基础设施已建好，但 UI 仍在 V1 Legacy。你的第一个任务是验证 Foundation，然后逐步切换存储。**

详细状态见：[`docs/baseline/CURRENT_STATE.md`](./CURRENT_STATE.md)

---

## 4. 权威文档在哪里

| 文档 | 路径 | 什么时候读 |
|------|------|-----------|
| **Master Roadmap** | `docs/roadmap/ECHOCHAT_CURSOR_MASTER_ROADMAP.md` | **每天开工前读**，明确当前 Stage |
| **Current State** | `docs/baseline/CURRENT_STATE.md` | 了解真实代码状态 |
| **Foundation Gate** | `docs/baseline/PHASE_0_6_FOUNDATION_GATE_REPORT.md` | 了解 Foundation 验收结果 |
| **长期架构** | `docs/architecture/ECHOCHAT_LONG_TERM_ARCHITECTURE.md` | 需要做架构决策时参考 |
| **接线审计** | `docs/baseline/PHASE_0_6_WIRING_AUDIT.md` | 需要修改存储层时参考 |
| **性能基线** | `docs/baseline/PHASE_0_6_PERFORMANCE_BASELINE.md` | 需要做性能优化时参考 |

**规则**：Master Roadmap 是最高级执行路线。任何与它冲突的旧文档，以 Master Roadmap 为准。

---

## 5. 当前阶段

**STAGE 0 — Foundation Verification**

目标：证明当前 Foundation 真的可靠，不是"代码写出来了"。

你的第一个任务：
1. 确认测试可跨环境运行（已修复硬编码路径）
2. 建立 GitHub Actions CI
3. 跑完整测试（114 tests）
4. 核心浏览器流程手工验证
5. STOP → 等待审查

**不要跳过 STAGE 0 直接开始 STAGE 1。**

---

## 6. 下一步任务（唯一）

```
STAGE 0 — Foundation Verification
  ↓
  1. 建立 .github/workflows/ci.yml
     - Node.js 环境
     - 运行 tests/migration_atomicity_test.mjs
     - 运行 tests/foundation_test.mjs
     - 语法检查所有 .js 文件
  ↓
  2. 本地跑完整测试，确认 114/114 PASS
  ↓
  3. 启动本地服务器，手工验证核心流程：
     创建角色 → 聊天 → 刷新 → 数据保留
  ↓
  4. 更新 docs/baseline/CURRENT_STATE.md
  ↓
  5. STOP. 提交，等待审查。
```

**不要同时做多个 Stage。不要"顺手"做 STAGE 1 的事情。**

---

## 7. 禁止事项（绝对不能做）

### 架构
- ❌ Full Rebuild / Full Rewrite
- ❌ 切换到 React / Vue / 大型框架
- ❌ 全量 TypeScript 重写
- ❌ Monorepo
- ❌ Full Event Sourcing
- ❌ SQLite WASM（Web 端）

### 产品
- ❌ Plugin System
- ❌ Cloud / Account / Sync
- ❌ Community / 社交平台
- ❌ Desktop Native（Tauri/Electron）
- ❌ Mobile Native
- ❌ 排行榜 / 竞争 / 社交竞争

### AI
- ❌ 复杂 Agent Framework
- ❌ 复杂 Multi-Agent
- ❌ 向量数据库 / Embedding 基础设施（STAGE 6 前）
- ❌ 复杂 RAG 平台

### 开发纪律
- ❌ "顺手重构"
- ❌ 因为发现未来问题就提前实现未来系统
- ❌ 把"代码写出来"定义成完成
- ❌ 超过 200 行的非必要修改不解释原因
- ❌ 发现架构问题直接重构（必须先报告）

---

## 8. 报告规则

以下事情**不能自主决定**，必须先报告：

```
Explain（解释要做什么）
→ Impact（影响是什么）
→ Alternative（有什么替代方案）
→ Recommendation（你的建议）
→ Wait（等待批准）
```

需要报告的事情：
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

## 9. 停止规则

### 什么时候必须 STOP

1. **每个 Stage 完成后**：必须 STOP，等待独立审查，不得自动进入下一阶段
2. **发现数据损坏风险**：立即 STOP，报告
3. **Migration 不安全**：立即 STOP，报告
4. **Privacy Boundary 被破坏**：立即 STOP，报告
5. **核心数据契约冲突**：立即 STOP，报告
6. **无法兼容旧数据**：立即 STOP，报告
7. **重大性能退化**：立即 STOP，报告
8. **需要改变已冻结的核心架构决策**：立即 STOP，报告

### 什么时候不能成为暂停理由

- ❌ 代码不够漂亮
- ❌ 文件可以拆得更细
- ❌ 命名可以更好
- ❌ 架构还有理论优化空间
- ❌ 某个成熟项目用了其他技术

---

## 10. 测试规则

### 完成的定义

```
Code（代码）
+ Test（自动化测试）
+ Manual Verification（手工验证）
+ Regression（回归测试）
= 完成
```

只有代码没有测试 = 没完成。
只有测试没有手工验证 = 没完成。

### 现有测试

```bash
# Migration 安全测试（90 assertions）
node tests/migration_atomicity_test.mjs

# Foundation 综合测试（24 tests）
node tests/foundation_test.mjs

# 语法检查
node --check src/your-file.js
```

### 新增代码必须有测试

- 数据模型变更 → Migration 测试
- Repository 新增 → Integration 测试
- 核心业务逻辑 → Unit 测试
- 不得用 mock 代替真实 production path

---

## 11. UI/UX 原则

### 设计方向
- **Morning Mint**（保留，不推翻）
- Quiet / Personal / Warm / Clean
- Character-centric / IM Familiarity
- Low Cognitive Load

### 避免
- ❌ AI Dashboard / 复杂数据面板
- ❌ 游戏属性栏 / 排行榜
- ❌ 过度玻璃拟态 / 过度渐变
- ❌ 社交媒体喧闹感
- ❌ TikTok 化 / Instagram 化

### Character 页面必须回答
1. "这个角色是谁？"
2. "我和它现在是什么关系？"
3. "最近发生了什么？"
4. "我可以和它做什么？"

**不要堆：设置 / 按钮 / 统计 / 参数 / Debug 信息。**

---

## 12. Storage Rules

### 数据分类
- **大型数据**（messages/memories/etc.）→ Dexie / IndexedDB
- **小型配置**（theme/settings）→ localStorage
- **二进制**（avatars/images）→ IndexedDB blobs
- **敏感数据**（API Key）→ 单独评估

### 双写过渡规则
1. 新数据同时写两个后端
2. 读取优先从新后端，fallback 旧后端
3. 启动时后台迁移旧数据
4. 迁移幂等：已存在则跳过
5. 旧后端删除前必须确认新后端数据完整

### Architecture Boundary
- Domain 层 → 只能通过 Repository 访问
- Repository 层 → 可以访问 Infrastructure Adapter
- Infrastructure 层 → 可以直接访问 localStorage/IndexedDB/Dexie
- UI 层 → 只能通过 Domain 层访问

**已知例外**：`message-store.js` 双写过渡，直接访问 dexieAdapter。STAGE 1 完成后移除。

---

## 13. Migration Rules

### Migration 流程
```
Detect → Validate Source → Transform → Validate Result → Stage → Commit → Verify → Mark
```

### 失败处理
- 失败不标记 schemaVersion 升级
- 原始数据保留可恢复
- 下次启动可重试
- 不静默吞掉错误

### 版本管理（三者独立，不混用）
- `APP_VERSION`：应用版本（src/core/version.js）
- `DATA_SCHEMA_VERSION`：数据 schema 版本
- `Dexie schema version`：数据库 schema 版本

---

## 14. Git 规则

### Commit Message 格式
```
feat(stage-1): switch message read path to dexie
fix(stage-0): fix foundation test path resolution
docs: update current state after stage 0
```

### 禁止使用
- ❌ `update` / `final` / `fix` / `test` / `misc`（重大提交）
- ❌ `feat: rebuild echochat`
- ❌ `feat: v3 architecture`
- ❌ 任何暗示 Full Rebuild 的 commit message

### 每个 Stage 完成后
1. 运行完整测试
2. 检查 git diff（确认没有意外修改）
3. 更新 CURRENT_STATE.md
4. Commit
5. Push
6. STOP

---

## 15. 你可以自主执行的事情

- ✅ 实现已经批准的功能（按 Master Roadmap）
- ✅ 补测试
- ✅ 修 Bug
- ✅ 局部重构（< 200 行，有解释）
- ✅ CSS/UI 微调
- ✅ Repository 实现
- ✅ Migration 实现
- ✅ 文档更新
- ✅ CI/CD 配置

---

## 16. 快速开始

```bash
# 1. 克隆仓库
git clone git@github.com:z180-arch/echochat-ui-lab.git
cd echat-ui-lab

# 2. 读文档
cat docs/baseline/CURSOR_HANDOFF_BASELINE.md  # 本文档
cat docs/roadmap/ECHOCHAT_CURSOR_MASTER_ROADMAP.md  # 路线
cat docs/baseline/CURRENT_STATE.md  # 当前状态

# 3. 跑测试
node tests/migration_atomicity_test.mjs
node tests/foundation_test.mjs

# 4. 启动本地服务器
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080

# 5. 开始 STAGE 0
```

---

## 17. 最后提醒

1. **一次只做一个 Stage**
2. **不要"顺手重构"**
3. **不要提前实现未来系统**
4. **完成 = Code + Test + Manual Verification + Regression**
5. **发现架构问题先报告，不要直接重构**
6. **每个 Stage 完成后 STOP，等待审查**
7. **Master Roadmap 是最高级路线，不要自己发明新路线**

---

**现在开始 STAGE 0。完成后 STOP，等待审查。**
