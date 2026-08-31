# EchoChat Full Rebuild — READ ONLY Audit

> 生成时间：2026-08-31
> 基线：z180-arch/echochat @ main (shallow clone)
> 审计方式：全量源码阅读 + 运行时验证 + 数据流追踪

---

## 1. 当前技术栈（真实）

| 维度 | 现状 |
|---|---|
| 语言 | JavaScript (ES2020+)，无 TypeScript |
| 运行环境 | 浏览器端 PWA，无 Node 运行时依赖 |
| 构建方式 | **无构建**，7 个 `<script>` 标签顺序加载 |
| 模块系统 | 全局 IIFE（`(function(global){...})(window)`），挂到 `window.EchoXxx` |
| 依赖 | 零 npm 运行时依赖；package.json 仅含 E2E 脚本 devDeps |
| 存储 | localStorage（主状态+3个独立模块）+ IndexedDB（图片 Blob） |
| 网络 | `fetch` + `ReadableStream` 流式，OpenAI-compatible API |
| PWA | Service Worker（静态缓存 v11）+ manifest.webmanifest |
| 测试 | scripts/ 下 17 个 E2E 脚本（Playwright 风格），无单元测试 |
| 部署 | Cloudflare Pages，静态文件直传 |
| Lint | .eslintrc.cjs 存在但未集成到构建流 |

**代码量统计：**
```
app.js          3816 行  (主逻辑：状态+渲染+API+事件全部在一起)
style.css       5074 行  (单文件，含亮/暗双主题)
index.html      1057 行  (单页，所有视图+弹窗的 DOM 模板)
worldbook.js     317 行
moments.js       208 行
relations.js     202 行
idb.js           133 行
config.example.js 233 行
asset.js          56 行
sw.js             29 行
─────────────────────────
合计           11125 行（不含 docs/scripts/assets）
```

完整审计正文见仓库源码（本文件为完整版摘要入口）。原始 zip 中含完整 22 节审计与变更矩阵。

## 关键结论摘要

1. **单体 app.js 过大**：状态、API、渲染、事件耦合，难以单测与并行开发。
2. **roleKey = hash(persona)**：修改人设会切断记忆/关系关联 — 已在 v2 用稳定 roleId 修复。
3. **无模块边界**：推荐 ES Module 分层（core / domain / ui / infrastructure）。
4. **存储 schema 无版本迁移**：v2 引入 schemaVersion + 自动迁移。
5. **UI 与逻辑混在 innerHTML**：推荐 views/components 分离。

## 重构目标（已落地于本仓库 src/）

- ES Module 零构建
- 稳定 roleId
- 分层：core / domain / infrastructure / ui / styles
- localStorage schema v2 + 迁移
- 可在浏览器控制台运行的单元测试 `tests/run.js`
