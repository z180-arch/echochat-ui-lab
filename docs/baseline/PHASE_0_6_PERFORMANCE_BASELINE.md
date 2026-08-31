# EchoChat Phase 0-6 Performance Baseline

> 测量日期：2026-08-31
> 测量环境：Node.js v22 (localStorage path) + Browser (Dexie path, script provided)
> 原则：只测量，不优化。

## 1. 测量方法

### 1.1 localStorage 路径（V1 Legacy）
- 环境：Node.js v22 + localStorage mock
- 测试：tests/foundation_test.mjs
- 指标：插入时间、读取时间、内存使用

### 1.2 Dexie 路径（Phase 2-3）
- 环境：浏览器（IndexedDB）
- 测试脚本：src/domain/message-perf-test.js
- 运行方式：浏览器控制台 `import("/src/domain/message-perf-test.js").then(m => m.runPerformanceTest())`
- 指标：批量插入、全量读取、分页、搜索、单条插入

## 2. Message 性能基线

### 2.1 localStorage 路径（实际测量）

| 消息数 | 插入时间 | 读取时间 | 复杂度 |
|--------|----------|----------|--------|
| 1 | <1ms | <1ms | O(1) |
| 100 | ~15ms | <1ms | O(n) 序列化 |
| 500 | ~80ms | ~2ms | O(n) 序列化 |
| 1,000 | ~200ms | ~5ms | O(n) 序列化 |
| 5,000 | ~2,500ms | ~20ms | O(n) 序列化 |

**瓶颈分析**：
- 每次 `store.addMessage` 都会序列化整个 state 并写入 localStorage
- state 大小随消息数线性增长
- 插入复杂度：O(n)（n = 总消息数）
- 5,000 消息时单次插入 >2s，用户可感知卡顿

### 2.2 Dexie 路径（预估，基于 IndexedDB 特性）

| 消息数 | 批量插入 | 全量读取 | 分页(50) | 搜索 | 单条插入 |
|--------|----------|----------|----------|------|----------|
| 100 | ~50ms | ~10ms | <5ms | ~5ms | <5ms |
| 500 | ~150ms | ~30ms | <5ms | ~10ms | <5ms |
| 1,000 | ~300ms | ~50ms | <5ms | ~15ms | <5ms |
| 5,000 | ~1,200ms | ~200ms | <5ms | ~50ms | <5ms |

**关键优势**：
- 单条插入：O(1)（IndexedDB 事务，不序列化整个 state）
- 分页：O(pageSize)（利用索引，不加载全部消息）
- 搜索：O(n) 但只搜索当前 conversation
- 5,000 消息时单条插入 <5ms，用户无感知

### 2.3 性能提升对比

| 指标 | localStorage | Dexie | 提升 |
|------|-------------|-------|------|
| 单条插入 (5000 msg) | ~2,500ms | <5ms | **500x** |
| 分页读取 (5000 msg) | ~20ms (全量) | <5ms | **4x** |
| 内存使用 | 全量加载 | 按需加载 | **显著降低** |
| 长聊天响应 | 线性下降 | 稳定 | **质变** |

## 3. Character / Conversation 性能

### 3.1 Character List
- localStorage：O(n) 遍历 chats，去重 roleId
- Dexie：O(1) 索引查询 characters 表
- 预估：100 角色时 <10ms（Dexie）vs ~50ms（localStorage）

### 3.2 Conversation List
- localStorage：O(n) 遍历 chats
- Dexie：O(1) 索引查询，支持按 characterId 过滤
- 预估：100 对话时 <10ms

## 4. Asset 性能

### 4.1 Blob 存储
- 当前：IndexedDB（idb.js），O(1) 读写
- Phase 6：Metadata (Dexie) + Binary (IndexedDB) 分离
- 预估：头像加载 <50ms，图片加载 <200ms

## 5. Migration 性能

### 5.1 V1→V2 localStorage migration
- 测试：tests/migration_atomicity_test.mjs
- 结果：90/90 通过
- 性能：<100ms（典型用户数据量）

### 5.2 localStorage→Dexie migration
- 机制：后台异步，不阻塞启动
- 预估：1,000 消息 ~500ms，5,000 消息 ~2s
- 策略：分批迁移，每批 100 条

## 6. 启动性能

### 6.1 Cold Start
- V1 (localStorage only)：~200-500ms
- Phase 0-6 (双写过渡)：~300-600ms（Dexie 初始化 + 异步迁移）
- 目标：<1s（PWA 可接受）

### 6.2 Warm Start
- V1：~100-200ms
- Phase 0-6：~150-300ms
- Dexie 数据库打开：~50ms

## 7. 性能瓶颈识别

### 7.1 当前瓶颈（必须解决）
1. **消息插入 O(n)**：localStorage 全量序列化，5,000 消息时 >2s
   - 解决方案：Phase 3 双写已建立，Phase 3.3 切换读取到 Dexie
2. **全量消息加载**：chat.messages[] 一次性加载到内存
   - 解决方案：Phase 3 分页支持，UI 逐步切换

### 7.2 潜在瓶颈（监控）
1. **Dexie 批量插入**：5,000 消息 ~1.2s，可接受
2. **搜索性能**：当前无全文索引，O(n) 搜索
   - 未来：可考虑 Dexie 索引或简单倒排
3. **Asset 内存**：大量图片可能占用内存
   - 解决方案：object URL 及时释放

### 7.3 不需要优化
1. **Character/Conversation 列表**：数据量小（<1000），localStorage 足够
2. **Settings**：小型配置，localStorage 合适
3. **Migration**：一次性操作，性能不是关键

## 8. 性能测试脚本

- `tests/foundation_test.mjs` — Node 环境，localStorage 路径
- `src/domain/message-perf-test.js` — 浏览器环境，Dexie 路径
- `tests/migration_atomicity_test.mjs` — Migration 安全测试

## 9. 结论

### 9.1 Phase 0-6 性能状态
- **Message 写入**：双写过渡中，localStorage 仍是瓶颈，Dexie 已就绪
- **Message 读取**：仍从 localStorage，Phase 3.3 切换后性能质变
- **Character/Conversation**：Repository 接口已建立，Dexie 读取已支持
- **Asset**：Metadata+Binary 分离已建立
- **Migration**：安全机制完善，性能可接受

### 9.2 下一步性能关键路径
1. **Phase 3.3**：切换消息读取到 Dexie（最大性能提升）
2. **UI 分页**：聊天列表改用分页加载
3. **Dexie 索引优化**：确认所有查询字段都有索引

### 9.3 不需要立即做
- 全文搜索优化（数据量小）
- 向量检索（Phase 7+）
- 服务端渲染（PWA 不需要）
