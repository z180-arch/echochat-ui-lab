# EchoChat

> 念念不忘，必有回响。

**EchoChat is a local-first AI character chat application under active development.**

EchoChat 是一个本地优先的 AI 角色对话应用，支持角色对话、长期记忆、关系养成、角色动态和世界书。项目采用模块化 ES Module 架构，零构建依赖，可直接部署为静态站点或 PWA。

The project is currently in **active development**. APIs, storage architecture, UI, and platform targets may evolve as the project matures.

## 项目定位

- **Active Development** — 功能和架构持续演进中
- **Local-first** — 用户数据默认存储在用户设备本地
- **Privacy-oriented** — 不收集用户行为数据，不使用分析工具
- **AI Character Chat** — 面向 AI 角色对话场景设计
- **Cross-platform direction** — 面向多平台适配的架构方向
- **Evolving architecture** — 存储、API、UI 可能随版本调整

> **关于 Local-first**：用户数据默认存储在本地浏览器中。但 AI 对话功能需要将用户输入通过 API 请求发送给用户配置的 AI Provider。因此 "Local-first" 不等于 "所有数据永远不会离开设备"。详见 [数据所有权说明](docs/architecture/DATA_OWNERSHIP.md)。

## 功能特性

- **角色对话**：流式回复、停止生成、重试/重生成、消息编辑
- **长期记忆**：自动摘要 + 手动记忆，角色记住你说过的事
- **关系养成**：亲密度系统、连续聊天天数、语气随关系变化
- **角色动态**：角色自动发布生活动态，支持点赞评论
- **世界书**：关键词触发设定注入，支持 SillyTavern 格式导入
- **多主题**：亮色/暗色 + 主题色预设
- **响应式**：移动端单栏 + 底部导航，桌面端多栏布局
- **PWA**：可安装到桌面，支持离线访问静态资源
- **数据迁移**：v1→v2 自动迁移，带 staging recovery 机制

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

## 项目结构

```
echat-ui-lab/
├── index.html              # 应用入口
├── config.js               # 运行时配置
├── sw.js                   # Service Worker（离线缓存）
├── manifest.webmanifest    # PWA 清单
├── src/
│   ├── main.js             # 应用入口、路由
│   ├── core/               # 核心基础设施
│   │   ├── utils.js        # 工具函数
│   │   ├── events.js       # 事件总线
│   │   ├── storage.js      # 存储层 + schema 迁移
│   │   └── store.js        # 响应式状态管理
│   ├── infrastructure/     # 基础设施
│   ├── domain/             # 领域逻辑
│   │   ├── persona.js      # 角色管理
│   │   ├── provider.js     # API Provider
│   │   ├── chat.js         # 聊天控制器
│   │   ├── memory.js       # 长期记忆
│   │   ├── worldbook.js    # 世界书
│   │   ├── moments.js      # 动态流
│   │   └── relations.js    # 关系养成
│   ├── ui/                 # UI 组件和视图
│   └── styles/             # 样式系统
├── tests/                  # 测试
├── docs/                   # 项目文档
└── AI_REVIEW_BUILD.html    # UI 评审构建
```

## 文档

### 开发文档

| 文档 | 说明 |
|---|---|
| [数据所有权](docs/architecture/DATA_OWNERSHIP.md) | 用户数据、项目代码、品牌资产的所有权边界 |
| [插件架构原则](docs/architecture/PLUGIN_POLICY.md) | 未来插件系统的权限模型和沙箱原则 |
| [许可证政策](docs/LICENSING_POLICY.md) | 许可证选择原则和未来调整方向 |

### 项目报告

| 文档 | 说明 |
|---|---|
| [重构报告](docs/AI_FULL_REBUILD_REPORT.md) | 成熟产品级重构最终报告 |
| [源码审计](docs/AI_FULL_REBUILD_AUDIT.md) | 全量源码审计文档 |
| [V1 Closing Pass](docs/AI_V1_CLOSING_PASS_REPORT.md) | V1 候选版本收口报告 |

## 技术栈

- **语言**：Vanilla JavaScript (ES Modules)
- **样式**：原生 CSS + Design Tokens + CSS Variables
- **存储**：localStorage + IndexedDB
- **API**：OpenAI-compatible（流式 SSE）
- **PWA**：Service Worker + Web App Manifest
- **构建**：零构建依赖

## 数据迁移

- **Schema v1**：baseline 格式，roleKey = hash(persona)
- **Schema v2**：rebuild 格式，稳定 roleId
- 首次访问自动检测并执行 v1→v2 迁移
- 迁移采用 Write-Ahead Staging Record 机制，支持失败恢复和安全重试
- 旧备份导入时自动识别版本并迁移

## 测试

Node.js 原生运行，直接 import production 代码：

```bash
node tests/migration_atomicity_test.mjs
```

浏览器控制台运行：

```javascript
import("./tests/run.js")
```

## 治理

| 文件 | 说明 |
|---|---|
| [LICENSE](LICENSE) | 源代码许可证（PolyForm Noncommercial 1.0.0） |
| [COPYRIGHT.md](COPYRIGHT.md) | 版权声明和资产分类 |
| [TRADEMARKS.md](TRADEMARKS.md) | 品牌使用政策 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南和 Contributor Terms |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | 第三方依赖声明 |

## 许可证

EchoChat 源代码采用 **PolyForm Noncommercial License 1.0.0**。

允许个人学习、本地运行、非商业研究、Fork、Bug 修复和提交贡献。
未经授权禁止商业再发行、移除版权声明或使用官方品牌。

详见 [LICENSE](LICENSE) 和 [许可证政策](docs/LICENSING_POLICY.md)。

**EchoChat 官方品牌（名称、Logo、视觉识别）不随源码许可证授权。** 详见 [TRADEMARKS.md](TRADEMARKS.md)。

## 相关仓库

- 原始版本：[z180-arch/echochat](https://github.com/z180-arch/echochat)

---

*EchoChat · Active Development · 2026*
