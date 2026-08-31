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

---

## 2. 当前架构图（真实，非理想）

```
┌─────────────────────────────────────────────────────────┐
│                    index.html (1057行)                   │
│  所有视图 DOM 硬编码：Landing / Onboarding / Shell /     │
│  Chat / Moments / Me / Settings Modal / WB Modal / ...   │
└────────────────────────┬────────────────────────────────┘
                         │ 7 个 <script> 顺序加载
┌────────────────────────▼────────────────────────────────┐
│                    全局命名空间                           │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌───────────┐  │
│  │ EchoIDB  │ │EchoAsset │ │EchoWorldb │ │EchoMoment │  │
│  │ (图片)   │ │ (资源解析)│ │ook(世界书) │ │  s(动态)  │  │
│  └──────────┘ └──────────┘ └───────────┘ └───────────┘  │
│  ┌──────────┐ ┌──────────────────────────────────────┐  │
│  │EchoRelati│ │         app.js (3816行)              │  │
│  │  ons(关系)│ │  ┌────────────────────────────────┐  │  │
│  └──────────┘  │  │ state (全局可变对象)            │  │  │
│                │  │ save() → localStorage          │  │  │
│                │  ├────────────────────────────────┤  │  │
│                │  │ 工具函数 (uid/esc/md/emoji...)  │  │  │
│                │  ├────────────────────────────────┤  │  │
│                │  │ 业务逻辑 (chat/send/stream/     │  │  │
│                │  │ memory/summary/worldbook/...)  │  │  │
│                │  ├────────────────────────────────┤  │  │
│                │  │ UI 渲染 (innerHTML 字符串拼接)  │  │  │
│                │  ├────────────────────────────────┤  │  │
│                │  │ 事件绑定 (195处 getElementById/ │  │  │
│                │  │ querySelector/addEventListener)│  │  │
│                │  └────────────────────────────────┘  │  │
│                └──────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                      存储层                              │
│  localStorage:                                          │
│    echodownload_lite_state_v1  (主状态: settings/       │
│      global/chats/current/longTermMemory/memoryCfg/     │
│      userPersonaPresets)                                │
│    echodownload_worldbook_v1    (世界书)                │
│    echodownload_moments_v1      (动态)                  │
│    echodownload_relations_v1    (关系)                  │
│    echodownload_onboard_done    (引导完成标记)          │
│    echodownload_ui_v2_seen      (UI v2 已见标记)        │
│    echodownload_ios_hint        (iOS 提示已显示)        │
│  IndexedDB:                                             │
│    echodownload_assets / blobs (图片 Blob, key=id)      │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 当前模块责任审计

### 3.1 app.js（3816行，核心问题模块）

| 职责 | 位置 | 问题 |
|---|---|---|
| 状态管理 | `state` 全局对象 + `save()` | 无响应式，修改后需手动调用 save() 和 renderXxx()；无变更追踪 |
| API 配置 | `apiConfig()`, `buildRequest()`, `toOpenAI()` | 与 chat.config 和 state.settings 双重来源，优先级逻辑分散 |
| 流式聊天 | `streamChat()`, `onDelta()`, `send()` | 发送/流式/停止/错误处理在一个函数中，约 80 行 try/catch |
| 消息渲染 | `renderMessages()`, `renderMarkdown()` | innerHTML 字符串拼接，每次全量重渲染；无 diff |
| 长期记忆 | `addMemory()`, `rememberMsg()`, `maybeAutoSummary()`, `buildMemoryBlock()` | 记忆触发逻辑与摘要 API 调用耦合；无独立模块 |
| 世界书集成 | `buildWorldbookBlock()` 调用 EchoWorldbook | 仅在 toOpenAI 时调用，UI 管理在 app.js |
| 角色管理 | `roleKeyOf()`, `chatPersona()`, `setChatPersona()` | roleKey = hashStr(persona)，修改人设导致 key 变化，记忆/关系/动态全部失联 |
| 引导流程 | `openWizard()`, `showWizStep()`, `renderWizTemplates()` | 与 Landing/Onboarding 两套漏斗并存（showFunnelLanding/showFunnelOnboardRole） |
| 设置 UI | `openSettings()`, `fillSettings()`, `renderApiPresetsUI()` | 设置弹窗内容与"我的"页面列表重复，同一功能多入口 |
| 事件绑定 | 文件底部约 200 行 addEventListener | 无统一事件委托，无生命周期管理，弹窗打开/关闭时手动绑定/解绑 |
| 工具函数 | `uid()`, `esc()`, `mdHighlight()`, `compressImageFile()` 等约 30 个 | 与业务逻辑混在一起，无独立 utils 模块 |

**耦合度：极高。** app.js 同时承担 state / service / repository / controller / view / event-bus 六种职责。

### 3.2 idb.js（133行）

| 项 | 内容 |
|---|---|
| 职责 | IndexedDB 极简封装，仅存图片 Blob |
| 输入 | `putBlob(id, blob)`, `getBlob(id)` |
| 输出 | Blob |
| 依赖 | 无 |
| 被谁调用 | asset.js, app.js (ingestImageFile/migrateDataUrlValue) |
| 高耦合 | 否，独立良好 |
| 副作用 | 内存 Map 缓存 + IndexedDB 双写；失败时降级到内存 |
| 问题 | 无版本迁移机制（DB_VER=1 写死）；无存储用量统计；无清理策略 |

### 3.3 asset.js（56行）

| 项 | 内容 |
|---|---|
| 职责 | 统一图片资源解析（builtin path / dataURL / IDB key → 可显示 URL） |
| 输入 | `resolveAsset(src)`, `setAvatarImg(imgEl, src)` |
| 输出 | URL 字符串 |
| 依赖 | EchoIDB |
| 被谁调用 | app.js (头像/背景渲染) |
| 高耦合 | 否 |
| 副作用 | URL.createObjectURL 缓存，需手动 revoke；`revokeAllAssetURLs` 存在但调用点不明 |
| 问题 | 无引用计数，切换会话时旧 URL 可能泄漏 |

### 3.4 worldbook.js（317行）

| 项 | 内容 |
|---|---|
| 职责 | 世界书 CRUD + 关键词匹配注入 + SillyTavern 格式导入 |
| 存储 | localStorage `echodownload_worldbook_v1` |
| 依赖 | 无 |
| 被谁调用 | app.js (buildWorldbookBlock, 世界书管理 UI) |
| 高耦合 | 中等——数据结构与 app.js 的 chat 角色绑定通过 roleKey |
| 副作用 | 每次操作 load→modify→save 全量读写 localStorage |
| 问题 | 无 schema version（version=1 写死）；无迁移；HARD_CAP=1200 字符硬编码；角色世界书通过 roleKey（hashStr(persona)）关联，人设变更后失联 |

### 3.5 moments.js（208行）

| 项 | 内容 |
|---|---|
| 职责 | 角色动态流 CRUD + 点赞/评论 + 摘要解析 |
| 存储 | localStorage `echodownload_moments_v1` |
| 依赖 | 无 |
| 被谁调用 | app.js (动态页面渲染, maybeAutoSummary 中 addMoment) |
| 高耦合 | 中等——通过 roleKey 关联角色 |
| 副作用 | 全量读写 localStorage；MAX_MOMENTS=200 硬截断 |
| 问题 | 无 schema version；`parseSummaryAndMoment` 用正则解析【摘要】【动态】标记，脆弱；动态与聊天记忆的关联通过 relatedMemoryId 但无实际联动 |

### 3.6 relations.js（202行）

| 项 | 内容 |
|---|---|
| 职责 | 关系养成：签到/聊天轮次/亲密度计算/主动消息触发 |
| 存储 | localStorage `echodownload_relations_v1` |
| 依赖 | 无（但 getAffinity 接受 momentsList 参数做交叉计算） |
| 被谁调用 | app.js (send 成功后 recordChatTurn, 渲染关系状态) |
| 高耦合 | 低——计算纯函数化较好 |
| 副作用 | 全量读写 localStorage |
| 问题 | 无 schema version；亲密度公式硬编码（turns*0.1 + likes*0.5 + comments*1 + checkBonus）；主动消息 rollProactive 有 30% 概率但生成逻辑在 app.js |

### 3.7 config.example.js（233行）

| 项 | 内容 |
|---|---|
| 职责 | 全局配置：能力开关/服务地址/API 预设/角色模板/主题预设 |
| 依赖 | 无 |
| 被谁调用 | app.js (CFG = window.ECHOCHAT_CONFIG) |
| 问题 | 角色模板名与实际显示名不一致（config 里叫"橘小喵"，UI 显示"橘子老师"）；apiPresets 模型名含 2026-08 时间戳注释，需定期更新 |

### 3.8 sw.js（29行）

| 项 | 内容 |
|---|---|
| 职责 | 静态资源缓存，网络优先策略 |
| 问题 | CACHE_VERSION=v11 硬编码；config.js 排除缓存但其他文件更新依赖版本号递增；无运行时缓存清理 |

---

## 4. 数据流审计

### 4.1 主状态流（当前真实路径）

```
用户操作 (点击/输入)
    │
    ▼
app.js 事件处理器 (addEventListener)
    │
    ▼
直接修改 state.xxx (全局可变对象)
    │
    ├──► save() → JSON.stringify(state) → localStorage
    │
    └──► 手动调用 renderXxx() 重新渲染 DOM
         │
         ▼
    innerHTML = 模板字符串 (全量替换)
```

**问题：**
- 无单向数据流，state 可被任何函数直接修改
- 渲染不是响应式的，忘记调用 renderXxx() 就会出现 UI 与数据不一致（实测：切换 tab 时中间/右侧面板不更新就是这个原因）
- save() 和 render() 是两个独立调用，存在"保存了但没渲染"或"渲染了但没保存"的时间窗口

### 4.2 聊天发送流

```
send()
  │
  ├─ 检查 API 配置 → needsApiSetup()
  ├─ push {role:"me", text, time} 到 chat.messages
  ├─ save() → localStorage
  ├─ renderMessages(chat) → 全量 innerHTML
  ├─ setStatus("对方正在输入…")
  ├─ setSendStopMode(true) → 显示停止按钮
  │
  ├─ toOpenAI(chat) → 构建请求消息数组
  │    ├─ system: globalPersona + chatPersona + memoryBlock + worldbookBlock
  │    ├─ history: 最近 contextMaxMessages(40) 条
  │    └─ 当前 user 消息
  │
  ├─ streamChat(chat, msgs, signal) → fetch + ReadableStream
  │    └─ onDelta(chat, full) → 追加到临时 DOM 气泡 (requestAnimationFrame 节流)
  │
  ├─ 完成: push {role:"her", text, time} → save() → renderMessages()
  │    ├─ EchoRelations.recordChatTurn(roleKey, name)
  │    ├─ 可选 TTS 朗读
  │    └─ maybeAutoSummary(chat) → 摘要 API → 记忆 + 动态
  │
  └─ 失败: renderMessages() 清临时气泡 → toast 错误 + 重试按钮
```

**问题：**
- `send()` 函数约 80 行，包含验证/状态/渲染/API/后处理/错误处理全部逻辑
- 流式期间直接操作 DOM（`streamMdBubble` 全局变量），与 renderMessages 的全量重渲染冲突
- `maybeAutoSummary` 是 fire-and-forget，失败无提示
- roleKey = hashStr(persona)，如果用户修改人设，记忆/关系/动态的 roleKey 全部失效

### 4.3 数据存储分布

| 数据 | 存储位置 | Key | 版本化 | 迁移机制 |
|---|---|---|---|---|
| 主状态 (settings/global/chats/memory) | localStorage | `echodownload_lite_state_v1` | 无 | 零散内联（defaultPrompt→global.persona） |
| 世界书 | localStorage | `echodownload_worldbook_v1` | 无 (version=1 写死) | 无 |
| 动态 | localStorage | `echodownload_moments_v1` | 无 | 无 |
| 关系 | localStorage | `echodownload_relations_v1` | 无 | 无 |
| 图片 Blob | IndexedDB | `echodownload_assets` (DB_VER=1) | 无 | 无 |
| 引导标记 | localStorage | `echodownload_onboard_done` | 无 | 无 |
| UI v2 标记 | localStorage | `echodownload_ui_v2_seen` | 无 | 无 |
| iOS 提示 | localStorage | `echodownload_ios_hint` | 无 | 无 |

**核心问题：7 个独立存储，0 个统一 schema version，0 个统一迁移机制。**

---

## 5. 数据一致性审计

### 5.1 角色身份的根本问题

```
roleKey = hashStr(chat.config.persona)
```

- 人设文本是角色的唯一身份标识
- 修改人设 → roleKey 变化 → 长期记忆/关系/动态/角色世界书全部失联
- 两个角色如果人设文本相同 → roleKey 相同 → 记忆/关系混淆
- **这是架构级缺陷，必须在重构中解决：角色应有独立的稳定 ID**

### 5.2 Persona 双重来源

| 来源 | 位置 | 作用域 |
|---|---|---|
| `state.global.persona` | 全局设置 | 默认人设，新建对话时继承 |
| `chat.config.persona` | 每个对话 | 当前对话的人设，优先级高于全局 |
| `chat.prompt` | (历史字段) | 旧版人设字段，可能仍存在于旧数据 |

**问题：** 读取时 `chatPersona(chat)` 返回 `chat.config.persona || state.global.persona`，但写入时只有 `setChatPersona()` 修改 chat.config，全局人设修改不影响已有对话。无明确的"继承 vs 覆盖"语义。

### 5.3 UI 状态与数据不同步（实测确认）

**Bug 1：Tab 切换时中间/右侧面板不更新**
- 切换到"动态"或"我的"tab 时，`switchTab()` 只切换左二栏的 `.tab-pane` 显示/隐藏
- 中间聊天区（`#chat-pane`）和右侧资料面板（`#ec-profile-side`）仍然显示当前对话
- 原因：`switchTab()` 没有隐藏/重置聊天区和资料面板

**Bug 2：「打开聊天设置」按钮无响应**
- 右侧面板底部 `#ec-chat-settings-btn` 点击无反应
- 原因：`openChatSettings()` 函数存在（app.js:3592），但事件绑定可能缺失或选择器不匹配

**Bug 3：全局设置弹窗顶部文字截断**
- 弹窗 `.modal-body` 的 padding-top 不足，首行说明文字被裁切
- 原因：CSS 中 `.set-essential` 的 margin 与 modal header 的 padding 冲突

### 5.4 缓存与真实来源

| 数据 | 真实来源 | 缓存/副本 | 过期风险 |
|---|---|---|---|
| 聊天列表 | state.chats | DOM (#chat-list innerHTML) | 高——每次修改需手动 renderList() |
| 当前聊天消息 | chat.messages | DOM (#messages innerHTML) | 高——流式期间直接操作 DOM，save 后全量重渲染 |
| 角色头像 | chat.avatar | DOM img.src (通过 EchoAsset) | 中——asset URL 缓存可能泄漏 |
| 关系亲密度 | EchoRelations | DOM (#rel-stats) | 中——send 成功后更新，但其他地方修改不刷新 |
| 动态列表 | EchoMoments | DOM (#moments-feed) | 中——切换 tab 时 renderMoments() 但新增后不自动刷新 |

---

## 6. UI/UX 审计摘要

### 6.1 信息架构问题

1. **设置入口重复**："我的"页面有 API/世界书/记忆/主题/备份 5 个入口，全局设置弹窗里又有同样的 7 个折叠区，用户困惑
2. **Landing + Onboarding 双漏斗**：`showFunnelLanding()` 和 `openWizard()` 两套引导流程，功能重叠
3. **四栏布局空间紧张**：导航(60px)+列表(240px)+聊天(弹性)+资料(280px)，<1280px 时聊天区不足 500px
4. **资料面板信息密度低**：280px 宽度只显示头像/名字/性格(截断)/关系/记忆(暂无)/动态(暂无)/一个按钮

### 6.2 交互问题

1. 底部提示条遮挡输入框
2. 消息"..."按钮无 tooltip，功能不透明
3. 输入框有手动 resize 手柄（textarea 默认），应自动扩展
4. 时间戳只显示时间不显示日期
5. 会话列表删除/下载按钮常驻，应 hover 显示
6. 无消息发送中/失败/重试的明确状态
7. 无骨架屏/加载态，首次渲染白屏

### 6.3 视觉问题

1. CSS 变量以暗色主题为主，亮色主题通过 class 覆盖但不完整
2. 角色头像为简单 SVG 插画，风格不统一
3. 圆角值有 4-5 种（20px/14px/10px/999px/8px），无系统化 token
4. 无设计系统文档，组件样式散落在 5074 行 CSS 中

### 6.4 响应式问题

1. 只有一个断点 `min-width: 1024px`（SPLIT_MQ）
2. 移动端无底部导航，仍使用左侧窄导航
3. 无安全区适配（虽然 CSS 变量定义了 --safe-top/--safe-bottom 但使用不完整）
4. 弹窗在移动端未适配 Bottom Sheet 模式

---

## 7. 技术债清单

| # | 问题 | 严重度 | 影响范围 |
|---|---|---|---|
| T1 | app.js 3816行单文件，6种职责混杂 | 高 | 全部 |
| T2 | 无统一状态管理，UI 需手动刷新 | 高 | 全部视图 |
| T3 | roleKey = hash(persona)，人设变更导致数据失联 | 高 | 记忆/关系/动态/世界书 |
| T4 | 7个独立存储，0 schema version，0 迁移 | 高 | 数据层 |
| T5 | 195处直接 DOM 操作，无组件化 | 中 | UI 层 |
| T6 | innerHTML 全量重渲染，无 diff | 中 | 聊天性能 |
| T7 | 无单元测试，仅 E2E 脚本 | 中 | 质量保障 |
| T8 | CSS 5074行单文件，无设计 token 系统化 | 中 | 样式维护 |
| T9 | 无构建系统，7个 script 标签 | 低 | 加载性能 |
| T10 | 无错误边界，错误靠 try/catch + toast | 中 | 稳定性 |
| T11 | Service Worker 缓存版本手动管理 | 低 | 部署更新 |
| T12 | 事件绑定无生命周期管理 | 中 | 内存泄漏风险 |
| T13 | 摘要 API fire-and-forget，失败无感知 | 低 | 记忆功能 |
| T14 | 角色模板名 config 与 UI 不一致 | 低 | 内容一致性 |

---

## 8. 旧数据兼容矩阵

| 数据类型 | 旧格式 | 新格式需支持 | 迁移难度 |
|---|---|---|---|
| chat 对象 | {id, name, avatar, config:{persona,myAvatar,model,temperature}, messages:[{role,text,time}]} | 同左 + 稳定 roleId | 中 |
| settings | {baseUrl,apiKey,model,apiPresetId,temperature,myAvatar,bg,neon,theme} | 同左 | 低 |
| global | {persona, voiceConfig, emojiCfg} | 同左 | 低 |
| longTermMemory | {roleKey: {roleName, memories:[{content,importance,createdAt}]}} | roleKey→roleId 映射 | 高 |
| worldbook | {version, books:[{id,name,scope,roleKey,entries}], activeGlobalBookId} | roleKey→roleId | 中 |
| moments | {version, moments:[{id,roleKey,roleName,content,image,createdAt,likes,comments}]} | roleKey→roleId | 中 |
| relations | {version, checkIn, roles:{roleKey:{roleName,firstSeenAt,lastChatAt,...}}} | roleKey→roleId | 中 |
| 图片 Blob | IndexedDB {id, blob} | 不变 | 低 |
| 备份 JSON | 全量导出 (exportAllData) | 需兼容旧格式导入 | 中 |

**关键迁移任务：** 为所有角色建立稳定 ID（chat.id 或新的 personaId），建立 roleKey→roleId 映射表，在读取时自动迁移。

---

## 9. 审计结论

当前代码是一个**功能完整但架构不可持续**的项目：
- 功能覆盖全面（聊天/记忆/世界书/动态/关系/语音/备份/PWA）
- 但所有逻辑挤在 app.js 中，修改任何功能都需要理解 3816 行上下文
- 数据层碎片化，无版本管理，长期维护风险高
- UI 层无组件化，新增视图需要同时改 HTML + CSS + JS 三处
- 角色身份设计缺陷（hash persona）会在用户修改人设时导致数据丢失

**重构方向：**
1. 建立模块化 ES Modules 架构（保持 Vanilla JS，不引入框架）
2. 建立统一 Store（状态 + 订阅 + 持久化 + schema version + migration）
3. 角色稳定 ID 化，解决 roleKey 问题
4. 组件化 UI（模板函数 + 事件委托 + 生命周期）
5. 设计 token 系统化（CSS 变量 + 多主题）
6. 完整响应式（移动端底部导航 + Bottom Sheet + 安全区）
7. 保持 100% 旧数据兼容（自动迁移）
8. 保持 100% API 兼容（OpenAI-compatible）
