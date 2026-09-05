> **HISTORICAL DOCUMENT**
> This document describes an earlier project state.
> It is NOT an authoritative description of the current implementation.
> See README.md and docs/CURRENT_STATE.md for the current state.

# EchoChat Landing → OpenDesign Craft Prompt

**Status:** Approved design decisions locked; paste-ready prompt below.  
**Date:** 2026-09-04  
**Scope:** Prompt only — do not change app `src/` or implement in this step.

## Locked decisions

| Decision | Choice |
|---|---|
| Craft source | OpenDesign homepage ceiling (`opendesign-homepage.html`) — techniques only |
| Theme / type | **Sea Fog Signal** — new palette + Syne / Outfit / Noto Sans SC |
| Page scope | Full visual rebuild; copy / info hierarchy roughly preserved |
| Hero centerpiece | 3D wordmark **Echo** + particles + blur + hybrid slow-fall icons; phone mockup demoted |
| Sticker motif | Hybrid: product metaphors + abstract geometry |
| Prompt style | Craft checklist + frozen tokens (Approach 2) |

---

## Paste-ready prompt for OpenDesign

> Copy everything inside the fence below into OpenDesign. Attach or place beside it: `landing.html` (edit target) and `opendesign-homepage.html` (craft reference only).

```
# OpenDesign 全权执行指令｜EchoChat Landing → OpenDesign 工艺上限 × Sea Fog Signal

你现在是 EchoChat 落地页的视觉 / 动效 / 前端实现负责人。
本任务禁止向用户提问、禁止出选择题、禁止停下来等确认。
所有未写死的细节，按下方原则自行拍板，写进文末「本次已拍板决策」，然后直接改完交付。

请调用你能用到的全部能力：WebGL / Three.js（或等价）、Canvas 粒子、backdrop-filter、滚动驱动叙事、光标视差、图标/贴纸缓落、多设备预览（390 / 768 / 1280+）、prefers-reduced-motion、中文排版。不要只改 CSS 颜色就交差。

---

## 0. 唯一改动对象与参照

### 改动对象（唯一）
`landing.html`（EchoChat 落地页）

### 工艺参照（只借手法，不借品牌）
`opendesign-homepage.html`（OpenDesign 官网镜像）

从参照中必须对齐的工艺上限（视觉身份除外）：
1. 实时 3D 字标英雄（参照里是 “Open Design” 几何字标；这里必须做成 **Echo**）
2. 全屏 / 分层氛围（粒子或等价 GPU 场）
3. 背景与玻璃层的虚化深度（blur + saturate，雾面层次）
4. 图标 / 贴纸缓落与散落拼贴（含轻微旋转、深度差、滚动联动）
5. 光标反应式视差
6. 滚动驱动的大字叙事与区块入场编排
7. 加载进度 / 入场时序（可简化，但首屏不能「瞬间弹齐」）

### 硬性禁止
1. 禁止改 EchoChat 应用源码（`src/` 等）。只动 `landing.html`（可内联 CSS/JS；可引入轻量 Three.js / R3F 等价；优先可本地预览的单文件或同目录资产）。
2. 禁止把 OpenDesign 品牌搬过来：不要 OpenDesign 文案、酸绿 `#C0FE04`、TikTok Sans、Geist Mono、Departure Mono、等宽 HUD 坐标条、主题[A]/声音开关等 OD 产品壳。
3. 禁止保留现有落地页原样：Playfair Display + Noto Serif 主标题气质、Morning Mint 瓷青原色板（`#F6F9F8` / `#21736A` / `#4DB393` 等）不得作为最终身份。
4. 禁止紫靛 AI 渐变默认皮、禁止奶油底 `#F4F1EA` + 陶土强调 + 衬线大标题的「AI 高级感」套路。
5. 禁止 Inter / Roboto / Arial 作为主表达字体。
6. 禁止首屏继续以手机聊天 mockup 为主角（见 §3）。
7. 禁止重写产品卖点文案（允许为排版微调断行 / 删减冗余空节点，但语义与 CTA 不变）。

---

## 1. 冻结视觉令牌 — Sea Fog Signal（不可换主色相 / 字体家族）

在 `:root` 建立并全站使用以下变量（允许透明度与径向渐变层次，不允许换 hex 主色）：

```css
:root {
  --bg: #EEF3F6;
  --bg-alt: #E2E9EF;
  --surface: rgba(255, 255, 255, 0.72);
  --surface-solid: #FFFFFF;
  --text: #121A22;
  --text-sub: #3A4A56;
  --text-muted: #6B7A86;
  --accent: #1F6F8B;
  --accent-hover: #185A70;
  --accent-soft: rgba(31, 111, 139, 0.14);
  --warm: #B8956C;
  --warm-soft: rgba(184, 149, 108, 0.12);
  --border: rgba(18, 26, 34, 0.10);
  --border-strong: rgba(31, 111, 139, 0.35);
  --shadow-md: 0 12px 32px rgba(18, 26, 34, 0.08);
  --shadow-lg: 0 24px 60px rgba(18, 26, 34, 0.10);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
  --font-display: "Syne", system-ui, sans-serif;
  --font-body: "Outfit", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
}
```

### 字体加载
- Display：Google Fonts `Syne`（至少 700、800；需要时开 `wdth` 变体）
- Body / UI：`Outfit` 300–600
- 中文：`Noto Sans SC` 400–700，与 Outfit 混排
- 3D「Echo」材质色跟 `--text` / `--accent`，禁止酸绿发光描边

### 气质关键词
清透雾面、深海信号、可信、回响、克制的温度。  
亮色舞台上的高工艺动效——不是暗黑赛博，不是薄荷医院风。

---

## 2. 文案与信息架构（大致保留）

保留现有落地页的信息顺序与核心文案语义：

1. Nav：EchoChat · 如何工作 / 记忆 / 关系 / 为什么选择 · CTA「开始创建」
2. Hero 文案层：
   - 签名句：`念念不忘，必有回响`
   - H1 语义：`创造一个真正记得你的 AI 角色`（可用 Syne + 中文混排重排行；「真正记得你的」可用 `--accent` 或极克制渐变，禁止衬线斜体 Playfair）
   - 副文：保留现有「普通 AI 聊天工具只记住最近几条消息…」长/短两版逻辑
   - 主 CTA：`开始创建角色` → `index.html`
   - 次 CTA：`查看产品体验` → `#how` 或下移后的 demo 锚点
   - Meta：数据本地存储 / 无需注册 / PWA 可安装
3. Proof strip：Local-first / 无需注册 / PWA / 角色可导入导出
4. How：四步（创建角色 → 开始聊天 → 形成记忆 → 关系生长）
5. Memory：长期记忆证明 + 时间线条目
6. Relationship：关系生长四步
7. Why：三张理由卡
8. Final CTA + Footer

允许：为配合 3D 舞台与滚动叙事，调整 DOM 栅格、间距、断点；合并过密卡片边框；去掉无交互意义的「卡片感」。  
不允许：改成 OD 官网的「作品网格 / 通行码 / 洛杉矶时钟」叙事。

---

## 3. 首屏构图（硬性）

首屏必须读作**一个构图**，不是仪表盘。

### 必须有
- **品牌级 3D 字标：`Echo`**（WebGL / Three.js 或同等质量）。这是首屏绝对主角。参照 OD 字标的体积感、轻微透视、光影、指针视差；几何可读、移动端降级策略见 §6。
- **背景虚化雾层**：多层径向雾 + 导航/局部表面 `backdrop-filter: blur(20–32px) saturate(1.2+)`。
- **粒子场**：低密度、慢速、海雾感（青灰粒子 + 少量暖沙色点）；不抢字、不闪烁。
- **图标 / 贴纸缓落（混合题材）**：
  - 产品隐喻（约 30–40%）：涟漪弧、记忆碎片、对话气泡剪影、细线关系纽带
  - 抽象几何（约 60–70%）：圆片、箔面矩形、柔边三角、半透明胶囊
  - 行为：缓慢下落 / 漂浮、轻微旋转、不同 z 深度；滚动时有视差；禁止 emoji 当主语言；颜色只用令牌内 accent / warm / text 透明度变体
- Hero 文案区：签名句 + H1 + 一句副文 + CTA 组（首屏不要塞 stats / 功能清单 / 证明条）

### 禁止 / 降级
- **禁止**手机聊天 mockup、浮动「记忆已保存」类贴纸卡片继续占据首屏右半。
- 原交互 demo（林晚对话 / prompt chips）**整体下移**到 How 之后或 Memory 之前的独立「产品体验」区块；桌面可保留轻 3D tilt，但那是第二视觉锚，不是 Hero。
- 首屏不要多枚实心主按钮；Nav CTA 保持幽灵/描边，Hero 保留唯一实心主 CTA。

### 品牌测试
去掉 Nav 后，首屏仍必须一眼是 Echo / EchoChat 世界（靠 3D Echo + 签名句），而不是通用 AI SaaS。

---

## 4. 整页工艺清单（逐项验收）

### 4.1 3D Echo
- [ ] 字标内容为 `Echo`（不是 EchoChat，不是 OpenDesign）
- [ ] 有真实体积 / 挤出或高质 shading；禁止纯 CSS skew 假装 3D 作为唯一方案（CSS 3D 仅可作移动端降级）
- [ ] 指针移动产生克制视差（移动端可用陀螺或静态优质角度）
- [ ] 与 Sea Fog 光照一致：冷雾环境光 + accent 边缘光；禁止酸绿 neon

### 4.2 粒子
- [ ] Canvas 或 WebGL 粒子场覆盖舞台，pointer-events: none
- [ ] 密度随设备降级（手机更少）
- [ ] 与滚动有微弱联动（可选）

### 4.3 背景虚化
- [ ] 至少两层氛围径向雾（accent-soft / warm-soft）
- [ ] Nav、局部表面使用可见 blur；滚动后 Nav 背景浓度增加
- [ ] 虚化服务于深度，不造成文字发糊（正文在清晰层上）

### 4.4 图标缓落
- [ ] 首屏即可见 6–12 个缓落/漂浮元素；内页滚动时可持续存在或分区触发
- [ ] 混合题材比例符合 §3
- [ ] 不挡住 CTA 热区；小屏自动减数量

### 4.5 动效编排
- [ ] 入场：进度或分步显现（字标 → 文案 → 缓落元素），时长参考 OD 的从容感，不要弹跳狂欢
- [ ] 滚动：区块 reveal、How/Relationship 进度线、Memory 时间轴填色
- [ ] 微交互：按钮 150–220ms、链接下划线/淡色、CTA 按压缩放
- [ ] 整页至少 3 处「有存在感」的主线动效（3D 视差、缓落、滚动叙事）+ 若干微交互
- [ ] `prefers-reduced-motion: reduce`：静态优质首屏（3D 可冻帧）、无粒子、无缓落循环、reveal 变即时透明度

### 4.6 排版与布局
- [ ] Display 用 Syne；中文正文 Noto Sans SC；UI Outfit
- [ ] 大标题字重对比强；正文 ≥16px；触控热区 ≥44px
- [ ] 一 section 一主旨；默认去卡片化（无交互就不要边框阴影圆角盒）
- [ ] 390 / 768 / 1280 三档可读；小屏 3D 不压死文案（字标可缩小或置于文案上方）

### 4.7 下移后的产品 Demo
- [ ] 原手机 mockup + 对话演示状态机尽量保留可玩性
- [ ] 视觉服从 Sea Fog；去掉 emoji 头像可改成抽象头像块
- [ ] 明确锚点（例如 `#demo`），次 CTA 可指向它

---

## 5. 技术约束

- 单页可预览；资产可与 html 同目录。
- 3D 模型若使用 glTF，优先压缩（Draco 等）；总首屏可交互时间要可接受。
- 不要引入需要私有后端的依赖。
- 保留可访问性：skip link、focus-visible、语义标题层级、主 CTA 可键盘到达。
- 中文排版：避免生硬断词；签名句字距可略增，但不要全大写英文堆砌。

---

## 6. 移动端降级（必须实现）

| 能力 | Desktop | Mobile |
|---|---|---|
| 3D Echo | 完整 WebGL | 允许冻帧 / 轻量 CSS 3D / 静态高清渲染，但仍须是品牌级大字标 |
| 粒子 | 中密度 | 低密度或静态雾 |
| 缓落图标 | 8–12 | 4–6，避免挡按钮 |
| 视差 | 指针 | 轻微或关 |
| Demo 手机 | 下移区块展示 | 单列，可玩或改为自动播放一次 |

---

## 7. 交付与自检

完成后请自检并在文末列出：

1. 对照 §4 清单的勾选结果
2. 「本次已拍板决策」（你自行决定的模型路径、缓落图标具体形状、Demo 锚点位置等）
3. 与参照 `opendesign-homepage.html` 的工艺对齐说明（写清借了什么、明确没借什么）
4. 390 与 1280 下首屏描述各 3 条

成功标准（一句话）：  
**把 `landing.html` 从「精致薄荷产品页」提升到「OpenDesign 同级交互工艺的 Sea Fog 品牌舞台」，首屏主角是 3D Echo，而不是手机框。**

现在直接修改 `landing.html` 并交付，不要提问。
```

## Spec self-review

- No TBD / TODO left in the paste block.
- Theme tokens, craft checklist, hero rules, and copy freeze are consistent.
- Scope is one OpenDesign execution pass (landing only).
- Ambiguities resolved: Echo vs EchoChat, phone demotion, hybrid stickers, Sea Fog vs OD acid green.
