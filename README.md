# EchoChat UI Lab

> 让角色记住你，让关系继续发展。念念不忘，必有回响。

EchoChat 是一个本地优先的 AI 角色对话应用，支持长期记忆、关系养成、角色动态、世界书等功能。本仓库为 EchoChat 成熟产品级重构版本，采用模块化 ES Module 架构，零构建依赖，可直接部署。

## ✨ 功能特性

- **角色对话**：流式回复、停止生成、重试/重生成、消息编辑
- **长期记忆**：自动摘要 + 手动记忆，角色记住你说过的事
- **关系养成**：亲密度系统、连续聊天天数、语气随关系变化
- **角色动态**：角色自动发布生活动态，支持点赞评论
- **世界书**：关键词触发设定注入，支持 SillyTavern 格式导入
- **多主题**：亮色/暗色 + 6 种主题色预设
- **响应式**：移动端单栏 + 底部导航，桌面端四栏布局
- **本地优先**：所有数据存储在浏览器 localStorage，不经过服务器
- **数据迁移**：v1→v2 自动迁移，旧备份可导入

## 🚀 快速开始

### 本地运行

```bash
# 克隆仓库
git clone https://github.com/z180-arch/echochat-ui-lab.git
cd echat-ui-lab

# 启动本地服务器（任意静态服务器均可）
python3 -m http.server 8080

# 打开浏览器
open http://localhost:8080
```

### 配置 API

1. 复制 `config.js`，填入你的 API Key
2. 或在应用内「我的 → 设置 → API 与模型」中配置
3. 支持 SiliconFlow / DeepSeek / OpenAI / Moonshot / 智谱 / 自定义接口

### 部署

零构建依赖，可直接部署到：
- Cloudflare Pages
- Vercel
- Netlify
- GitHub Pages
- 任意静态文件服务器

## 📁 项目结构

```
echat-ui-lab/
├── index.html              # 应用入口
├── config.js               # 运行时配置（API预设/角色模板）
├── sw.js                   # Service Worker（离线缓存）
├── manifest.webmanifest    # PWA 清单
├── src/
│   ├── main.js             # 应用入口、路由、事件绑定
│   ├── core/               # 核心基础设施
│   │   ├── utils.js        # 工具函数（uid/esc/markdown/时间）
│   │   ├── events.js       # 事件总线
│   │   ├── storage.js      # 存储层 + schema 迁移
│   │   └── store.js        # 响应式状态管理
│   ├── infrastructure/     # 基础设施
│   │   ├── idb.js          # IndexedDB 封装
│   │   └── asset.js        # 资源解析
│   ├── domain/             # 领域逻辑
│   │   ├── persona.js      # 角色管理（稳定 roleId）
│   │   ├── provider.js     # API Provider（OpenAI-compatible）
│   │   ├── chat.js         # 聊天控制器
│   │   ├── memory.js       # 长期记忆 + 自动摘要
│   │   ├── worldbook.js    # 世界书
│   │   ├── moments.js      # 动态流
│   │   └── relations.js    # 关系养成
│   ├── ui/
│   │   ├── components/     # 可复用组件
│   │   └── views/          # 页面视图
│   └── styles/             # 样式系统
│       ├── tokens.css      # 设计变量
│       ├── base.css        # 基础重置
│       ├── components.css  # 组件样式
│       ├── layouts.css     # 布局样式
│       └── responsive.css  # 响应式
├── assets/avatars/         # 角色头像
├── tests/run.js            # 单元测试套件
├── docs/                   # 项目文档
└── AI_REVIEW_BUILD.html    # UI 评审构建（22个可切换状态）
```

## 📚 文档

| 文档 | 说明 |
|---|---|
| [AI_FULL_REBUILD_REPORT.md](docs/AI_FULL_REBUILD_REPORT.md) | 重构最终报告（22节，含变更矩阵） |
| [AI_FULL_REBUILD_AUDIT.md](docs/AI_FULL_REBUILD_AUDIT.md) | 全量源码审计文档 |
| [AI_REVIEW_BUILD.html](AI_REVIEW_BUILD.html) | UI 评审构建（浏览器直接打开，22个状态） |

## 🛠 技术栈

- **语言**：Vanilla JavaScript (ES Modules)
- **样式**：原生 CSS + Design Tokens + CSS Variables
- **存储**：localStorage + IndexedDB
- **API**：OpenAI-compatible（流式 SSE）
- **PWA**：Service Worker + Web App Manifest
- **构建**：零构建依赖

## 🔄 数据迁移

- **Schema v1**：baseline 格式，roleKey = hash(persona)
- **Schema v2**：rebuild 格式，稳定 roleId
- 首次访问自动检测并执行 v1→v2 迁移
- 旧备份导入时自动识别版本并迁移

## 🧪 测试

在浏览器控制台运行：

```javascript
import("./tests/run.js")
```

覆盖 7 个模块，50+ 断言：Utils / Events / Store / Persona / Memory / Relations / 数据一致性。

## 📄 License

MIT License - 详见 [LICENSE](LICENSE)

## 🤝 相关仓库

- 原始版本：[z180-arch/echochat](https://github.com/z180-arch/echochat)

---

*重构版本 v2.0 · 2026-08-31*
