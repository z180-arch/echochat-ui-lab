# Brand Launch Experience Report

**版本**: 1.0.0
**日期**: 2026-08-31
**优先级**: P1

---

## 设计方向

**Visual Direction**: Morning Mint
- **Calm**: 柔和渐变，低饱和度
- **Modern**: 简洁几何，无多余装饰
- **Emotional**: 角色 Logo 带表情，有温度
- **Premium**: 微妙阴影，流畅动画
- **Lightweight**: 纯 CSS + SVG，无图片依赖

---

## 实现

### 文件结构

| 文件 | 内容 |
|---|---|
| `index.html` | splash-screen DOM 结构 |
| `src/styles/base.css` | 动画样式 + 响应式 + reduced motion |
| `src/main.js` | startSplashAnimation() / finishSplashAnimation() |

### DOM 结构

```html
<div id="splash-screen" class="splash-screen">
  <div class="splash-bg"></div>
  <div class="splash-content">
    <div class="splash-logo">
      <svg>...</svg>  <!-- 渐变圆形角色图标 -->
    </div>
    <div class="splash-wordmark">EchoChat</div>
    <div class="splash-tagline">念念不忘，必有回响</div>
  </div>
</div>
```

### 动画时序

| 时间 | 动作 | 时长 | 缓动 |
|---|---|---|---|
| 0ms | 背景淡入 | 0.4s | ease |
| 100ms | Logo scale+opacity reveal | 0.6s | cubic-bezier(0.34, 1.56, 0.64, 1) |
| 400ms | Wordmark 淡入上移 | 0.5s | ease |
| 550ms | Tagline 淡入上移 | 0.5s | ease |
| 800ms | 开始退出过渡 | 0.4s | ease |

**总时长**: ~800ms（在 700-1200ms 范围内，不做成 3 秒以上品牌广告）

### 视觉规格

**亮色主题**:
- 背景: `linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 50%, #99f6e4 100%)`
- Logo 渐变: `#5eead4 → #14b8a6`
- Wordmark: `#0f766e`, 28px, 700
- Tagline: `#14b8a6`, 14px, letter-spacing 2px

**暗色主题**:
- 背景: `linear-gradient(135deg, #042f2e 0%, #134e4a 50%, #0f766e 100%)`
- Wordmark: `#5eead4`
- Tagline: `#2dd4bf`

### Reduced Motion 支持

```css
@media (prefers-reduced-motion: reduce) {
  .splash-screen.splash-reduced * {
    animation: none;
    opacity: 1;
    transform: none;
  }
}
```

- 检测到 `prefers-reduced-motion: reduce` 时添加 `.splash-reduced` 类
- 所有动画禁用，直接显示静态 Logo
- 仍有 0.4s 淡入淡出过渡（最小化动画）

---

## 分辨率验证

| 分辨率 | 设备 | Logo 居中 | 文字不溢出 | 安全区 | 过渡 | 结果 |
|---|---|---|---|---|---|---|
| 320×568 | iPhone SE | ✅ | ✅ | ✅ | ✅ | PASS |
| 360×640 | Android 小屏 | ✅ | ✅ | ✅ | ✅ | PASS |
| 375×667 | iPhone 8 | ✅ | ✅ | ✅ | ✅ | PASS |
| 390×844 | iPhone 14 | ✅ | ✅ | ✅ | ✅ | PASS |
| 430×932 | iPhone 14 Pro Max | ✅ | ✅ | ✅ | ✅ | PASS |
| 768×1024 | iPad Mini | ✅ | ✅ | ✅ | ✅ | PASS |
| 1024×768 | iPad | ✅ | ✅ | ✅ | ✅ | PASS |
| 1280×800 | 笔记本 | ✅ | ✅ | N/A | ✅ | PASS |
| 1440×900 | 桌面 | ✅ | ✅ | N/A | ✅ | PASS |
| 1600×900 | 宽屏 | ✅ | ✅ | N/A | ✅ | PASS |
| 1920×1080 | 全高清 | ✅ | ✅ | N/A | ✅ | PASS |

### PWA Standalone 验证

- ✅ `apple-mobile-web-app-capable` 已配置
- ✅ `theme-color` 匹配 splash 背景
- ✅ standalone 模式下 splash 正常显示
- ✅ 从 splash 到首屏过渡自然

---

## 与首屏衔接

- Splash 动画与数据加载并行（init 中先启动动画，再跑迁移）
- 800ms 后调用 `finishSplashAnimation()`，0.4s 淡出
- 淡出同时渲染首屏，无白屏闪烁
- 数据加载慢时 splash 保持，不显示空白

---

## 结论

**Brand Launch: PASS**

- Morning Mint 视觉方向 ✅
- 800ms 动画（700-1200ms 范围内）✅
- Logo reveal → wordmark → tagline 时序 ✅
- Reduced Motion 支持 ✅
- 11 个分辨率全部验证 ✅
- PWA standalone 适配 ✅
- 暗色主题适配 ✅
- 与首屏无缝衔接 ✅
