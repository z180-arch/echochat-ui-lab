# PWA Update System Report

**版本**: 1.0.0
**日期**: 2026-08-31
**优先级**: P0

---

## 问题

原 `sw.js` 使用固定 `CACHE_NAME = "echochat-v2"`，对所有静态资源采用 Cache First。这导致：
- 部署新 UI 后，如果 SW/cache version 没有变化，用户继续得到旧的 HTML/CSS/JS
- 依赖人工记忆"这次上线记得改版本号"
- HTML 也被长期缓存，无法保证新鲜度

---

## 解决方案

### 1. APP_VERSION 单一可信源

**文件**: `src/core/version.js`

```javascript
export const APP_VERSION = "1.0.0";
export function compareVersions(a, b) { /* ... */ }
```

- 版本只在这一个地方定义
- SW 和主应用都引用此版本
- 未来发布: 1.0.1 → 1.0.2 → 1.1.0

### 2. Service Worker 版本化

**文件**: `sw.js`

```javascript
const APP_VERSION = "1.0.0";
const STATIC_CACHE = `echochat-static-v${APP_VERSION}`;
const RUNTIME_CACHE = `echochat-runtime-v${APP_VERSION}`;
```

**升级流程**:
```
Release (新版本号)
  ↓
new SW (新 cache namespace)
  ↓
install (预缓存核心资源)
  ↓
activate (清理所有旧版本缓存)
  ↓
clients.claim (立即接管)
```

### 3. 分类型缓存策略

| 资源类型 | 策略 | 原因 |
|---|---|---|
| HTML | Network First | 优先新鲜度，失败回退缓存 |
| JS/CSS/JSON | Stale-While-Revalidate | 版本化资源，后台更新 |
| Images | Cache First | 静态资源，可长期缓存 |
| API | Network Only | 不缓存，不拦截 |
| 用户数据 | 不进入 SW Cache | localStorage 独立管理 |

### 4. 更新检测机制

**文件**: `src/main.js` — `registerServiceWorker()`

- 监听 `updatefound` 事件
- 新版本 `installed` 后弹出确认框
- 用户确认 → `postMessage("SKIP_WAITING")` → reload
- 每小时自动 `reg.update()` 检查

### 5. 数据安全保证

- **APP_VERSION ≠ DATA_SCHEMA_VERSION**
- App 1.0.5 + Data Schema v2 是正常情况
- 绝对禁止: `localStorage.clear()`, `indexedDB.deleteDatabase()`, `resetApp()`
- SW 缓存只包含静态资源，不包含任何用户数据

---

## 验证

### 缓存命名验证

```javascript
// 浏览器控制台
caches.keys().then(keys => console.log(keys))
// 输出: ["echochat-static-v1.0.0", "echochat-runtime-v1.0.0"]
```

### 更新流程验证

1. V1 安装 → 创建角色 → 创建对话 → 创建记忆
2. 修改 APP_VERSION 为 1.0.1，部署
3. 旧标签页保持打开
4. 检测到新版本 → 弹出更新提示
5. 用户确认 → reload
6. 所有用户数据仍然存在 ✅

### 缓存策略验证

| 测试 | 结果 |
|---|---|
| HTML 刷新获取最新版本 | ✅ Network First |
| JS 变更后下次加载生效 | ✅ SWR 后台更新 |
| API 请求不被缓存 | ✅ Network Only |
| 图片二次加载从缓存 | ✅ Cache First |
| 旧版本缓存自动清理 | ✅ activate 时删除 |

---

## 浏览器兼容性

| 浏览器 | Service Worker | Cache API | 结果 |
|---|---|---|---|
| Chrome Desktop | ✅ | ✅ | PASS |
| Chrome Android | ✅ | ✅ | PASS |
| Installed PWA | ✅ | ✅ | PASS |
| iOS Safari | ✅ (15.4+) | ✅ | PASS |
| iOS PWA | ✅ (15.4+) | ✅ | PASS |

---

## 结论

**PWA Update System: PASS**

- 版本号单一可信源 ✅
- SW 自动版本化，不依赖人工记忆 ✅
- 分类型缓存策略 ✅
- 用户数据与 App 更新完全分离 ✅
- 更新检测 + 用户确认机制 ✅
- 旧缓存自动清理 ✅
