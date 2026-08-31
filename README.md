# EchoChat

> 念念不忘，必有回响。

**EchoChat is a local-first AI character chat application under active development.**

EchoChat 是一个本地优先的 AI 角色对话应用，支持角色对话、长期记忆、关系养成、角色动态和世界书。项目采用模块化 ES Module 架构，零构建依赖，可直接部署为静态站点或 PWA。

The project is currently in **active development**. APIs, storage architecture, UI, and platform targets may evolve as the project matures.

---

## Development Status

**当前阶段：Foundation Closure → Cursor Handoff**

EchoChat 已完成 Phase 0-6 Foundation 施工（Repository / Dexie / Message / Character / Conversation / Asset），正在进行 Cursor 接管前的最终整理。

```
Foundation Closure
        ↓
Independent Verification (STAGE 0)
        ↓
Storage Cutover (STAGE 1-3)
        ↓
Character Experience (STAGE 4)
        ↓
Character Reconstruction (STAGE 5)
        ↓
Memory / Relationship / Behavior (STAGE 6-9)
        ↓
Moments / Product Polish (STAGE 10-13)
```

**不是 Production Ready。不是 All Features Complete。** 基础设施已建立，产品功能正在逐步推进。

---

## 项目定位

- **Active Development** — 功能和架构持续演进中
- **Local-first** — 用户数据默认存储在用户设备本地
- **Privacy-oriented** — 不收集用户行为数据，不使用分析工具
- **AI Character Chat** — 面向 AI 角色对话场景设计
- **Cross-platform direction** — 面向多平台适配的架构方向
- **Evolving architecture** — 存储、API、UI 可能随版本调整

> **关于 Local-first**：用户数据默认存储在本地浏览器中。但 AI 对话功能需要将用户输入通过 API 请求发送给用户配置的 AI Provider。因此 "Local-first" 不等于 "所有数据永远不会离开设备"。详见 [数据所有权说明](docs/architecture/DATA_OWNERSHIP.md)。

---

## 功能特性

### 已实现（V1）
- **角色对话**：流式回复、停止生成、重试/重生成、消息编辑
- **长期记忆**：自动摘要 + 手动记忆，角色记住你说过的事
- **关系养成**：亲密度系统、连续聊天天数、语气随关系变化
- **角色动态**：角色自动发布生活动态，支持点赞评论
- **世界书**：关键词触发设定注入，支持 SillyTavern 格式导入
- **多主题**：亮色/暗色 + 主题色预设
- **响应式**：移动端单栏 + 底部导航，桌面端多栏布局
- **PWA**：可安装到桌面，支持离线访问静态资源
- **数据迁移**：v1→v2 自动迁移，带 staging recovery 机制

### 基础设施完成（UI 待接入）
- **Repository 层**：12 个 Repository 接口 + Legacy Adapter
- **Dexie 数据库**：13 表 schema + Adapter + Migration
- **Message 双写**：localStorage + Dexie，支持分页/搜索/分支
- **Character 一级实体**：Domain + Repository，级联删除策略
- **Conversation 多对话**：一角色多对话，Archive/Rename/Pin
- **Asset 系统**：Metadata + Binary 分离

### 未实现
- Character Reconstruction（从聊天记录重建角色）
- Memory 分层检索 / Context Builder
- Relationship Current State + Event History
- Behavior Engine
- Plugin System
- Cloud / Account / Sync
- Desktop / Mobile Native

---

## 快速开始

### 本地运行

```bash
git clone https://github.com/z180-arch/echochat-ui-lab.git
cd echat-ui-lab
python3 -m http.server 8080
# 打开 http://localhost:8080
```

### 配置 API

1. 复制 `config.js`，填入你的 API Key
2. 或在应用内「我的 → 设置 → API 与模型」中配置
3. 支持 OpenAI-compatible 接口（SiliconFlow / DeepSeek / Moonshot / 智谱 / 自定义）

### 部署

零构建依赖，可直接部署到任意静态文件托管：
- Cloudflare Pages
- Vercel
- Netlify
- GitHub Pages
- 任意静态文件服务器

---

## 项目结构

```
echat-ui-lab/
├── index.html              # 应用入口
├── config.js               # 运行时配置
├── sw.js                   # Service Worker（离线缓存 + 更新系统）
├── manifest.webmanifest    # PWA 清单
├── src/
│   ├── main.js             # 应用入口、路由
│   ├── core/               # 核心基础设施
│   │   ├── utils.js        # 工具函数
│   │   ├── events.js       # 事件总线
│   │   ├── storage.js      # 存储层 + schema 迁移
│   │   ├── store.js        # 响应式状态管理
│   │   └── version.js      # APP_VERSION 单一可信源
│   ├── infrastructure/     # 基础设施（Dexie / IndexedDB）
│   │   ├── dexie-db.js     # Dexie 数据库 schema
│   │   ├── dexie-adapter.js # Dexie Adapter
│   │   ├── dexie-migration.js # localStorage→Dexie 迁移
│   │   ├── idb.js          # IndexedDB blob 存储
│   │   └── vendor/dexie.mjs # Dexie v4.0.10
│   ├── repository/         # Repository 层（Phase 1）
│   │   ├── interfaces.js   # 12 个 Repository 接口
│   │   ├── legacy-adapter.js # Legacy Storage Adapter
│   │   └── *.js            # 各实体 Repository 实现
│   ├── domain/             # 领域逻辑
│   │   ├── chat.js         # 聊天控制器
│   │   ├── message-store.js # 消息存储抽象（双写过渡）
│   │   ├── character.js    # Character 领域
│   │   ├── conversation.js # Conversation 领域
│   │   ├── asset.js        # Asset 领域
│   │   ├── persona.js      # 角色模板
│   │   ├── provider.js     # API Provider
│   │   ├── memory.js       # 长期记忆（V1 Legacy）
│   │   ├── worldbook.js    # 世界书（V1 Legacy）
│   │   ├── moments.js      # 动态流（V1 Legacy）
│   │   └── relations.js    # 关系养成（V1 Legacy）
│   └── ui/                 # UI 组件和视图
├── tests/                  # 测试
│   ├── migration_atomicity_test.mjs # Migration 安全测试
│   └── foundation_test.mjs # Foundation 综合测试
├── docs/                   # 项目文档
│   ├── architecture/       # 架构文档
│   ├── roadmap/            # 开发路线
│   └── baseline/           # 基线文档
└── AI_REVIEW_BUILD.html    # UI 评审构建（历史文件）
```

---

## Development Roadmap

当前最高级开发路线：[`docs/roadmap/ECHOCHAT_CURSOR_MASTER_ROADMAP.md`](docs/roadmap/ECHOCHAT_CURSOR_MASTER_ROADMAP.md)

| Stage | 目标 | 状态 |
|-------|------|------|
| STAGE 0 | Foundation Verification | 🔄 进行中 |
| STAGE 1 | Message Storage Cutover | ⏳ 待开始 |
| STAGE 2 | Conversation Storage Cutover | ⏳ 待开始 |
| STAGE 3 | Character Storage Cutover + Asset Cleanup | ⏳ 待开始 |
| STAGE 4 | Character Experience / Hub | ⏳ 待开始 |
| STAGE 5 | Character Reconstruction MVP | ⏳ 待开始 |
| STAGE 6 | Memory | ⏳ 待开始 |
| STAGE 7 | Relationship | ⏳ 待开始 |
| STAGE 8 | Memory × Relationship × Behavior | ⏳ 待开始 |
| STAGE 9 | Context Builder | ⏳ 待开始 |
| STAGE 10 | Moments | ⏳ 待开始 |
| STAGE 11 | Product Loop Validation | ⏳ 待开始 |
| STAGE 12 | Privacy Baseline | ⏳ 待开始 |
| STAGE 13 | UI/UX Product Refinement | ⏳ 待开始 |

---

## Agent Handoff

**如果你是开发 Agent（Cursor），从这里开始：**

1. [`docs/baseline/CURSOR_HANDOFF_BASELINE.md`](docs/baseline/CURSOR_HANDOFF_BASELINE.md) — 接管第一份文件
2. [`docs/baseline/CURRENT_STATE.md`](docs/baseline/CURRENT_STATE.md) — 当前真实状态
3. [`docs/roadmap/ECHOCHAT_CURSOR_MASTER_ROADMAP.md`](docs/roadmap/ECHOCHAT_CURSOR_MASTER_ROADMAP.md) — 最高级开发路线

**当前唯一的 NEXT ACTION**：STAGE 0 — Foundation Verification（建立 CI + 跑测试 + 手工验证）

---

## 文档

### 架构文档

| 文档 | 说明 |
|------|------|
| [长期架构方案](docs/architecture/ECHOCHAT_LONG_TERM_ARCHITECTURE.md) | 2-3 年架构方向（参考用，非执行路线） |
| [数据所有权](docs/architecture/DATA_OWNERSHIP.md) | 用户数据、项目代码、品牌资产的所有权边界 |
| [插件架构原则](docs/architecture/PLUGIN_POLICY.md) | 未来插件系统的权限模型和沙箱原则 |

### 基线文档

| 文档 | 说明 |
|------|------|
| [Cursor Handoff](docs/baseline/CURSOR_HANDOFF_BASELINE.md) | Cursor 接管第一份文件 |
| [Current State](docs/baseline/CURRENT_STATE.md) | 当前真实代码状态 |
| [Foundation Gate Report](docs/baseline/PHASE_0_6_FOUNDATION_GATE_REPORT.md) | Phase 0-6 验收报告 |
| [Wiring Audit](docs/baseline/PHASE_0_6_WIRING_AUDIT.md) | 存储调用链审计 |
| [Performance Baseline](docs/baseline/PHASE_0_6_PERFORMANCE_BASELINE.md) | 性能测量数据 |
| [Browser Regression](docs/baseline/PHASE_0_6_BROWSER_REGRESSION.md) | 浏览器回归测试 |

---

## 技术栈

- **语言**：Vanilla JavaScript (ES Modules)
- **样式**：原生 CSS + Design Tokens + CSS Variables
- **存储**：localStorage + IndexedDB + Dexie（渐进式迁移中）
- **API**：OpenAI-compatible（流式 SSE）
- **PWA**：Service Worker + Web App Manifest
- **构建**：零构建依赖
- **测试**：Node.js 原生测试（无框架）

---

## 数据迁移

- **Schema v1**：baseline 格式，roleKey = hash(persona)
- **Schema v2**：rebuild 格式，稳定 roleId
- 首次访问自动检测并执行 v1→v2 迁移
- 迁移采用 Write-Ahead Staging Record 机制，支持失败恢复和安全重试
- 旧备份导入时自动识别版本并迁移
- localStorage→Dexie 迁移：应用启动时后台自动执行（Message）

---

## 测试

Node.js 原生运行，直接 import production 代码：

```bash
# Migration 安全测试（90 assertions）
node tests/migration_atomicity_test.mjs

# Foundation 综合测试（24 tests）
node tests/foundation_test.mjs

# 语法检查
node --check src/your-file.js
```

浏览器控制台运行：

```javascript
// Dexie 验证
import("./src/infrastructure/dexie-verify.js").then(m => m.verifyDexie());

// 消息性能测试
import("./src/domain/message-perf-test.js").then(m => m.runPerformanceTest());
```

---

## 治理

| 文件 | 说明 |
|------|------|
| [LICENSE](LICENSE) | 源代码许可证（PolyForm Noncommercial 1.0.0） |
| [COPYRIGHT.md](COPYRIGHT.md) | 版权声明和资产分类 |
| [TRADEMARKS.md](TRADEMARKS.md) | 品牌使用政策 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南和 Contributor Terms |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | 第三方依赖声明 |

---

## 许可证

EchoChat 源代码采用 **PolyForm Noncommercial License 1.0.0**。

允许个人学习、本地运行、非商业研究、Fork、Bug 修复和提交贡献。

未经授权禁止商业再发行、移除版权声明或使用官方品牌。

详见 [LICENSE](LICENSE)。

**EchoChat 官方品牌（名称、Logo、视觉识别）不随源码许可证授权。** 详见 [TRADEMARKS.md](TRADEMARKS.md)。

---

## 相关仓库

- 原始版本：[z180-arch/echochat](https://github.com/z180-arch/echochat)

---

*EchoChat · Active Development · 2026*
