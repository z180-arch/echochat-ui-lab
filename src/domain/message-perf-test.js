/**
 * EchoChat Message Performance Test
 *
 * Phase 3 性能基线测试。在浏览器控制台运行：
 *   import("/src/domain/message-perf-test.js").then(m => m.runPerformanceTest())
 *
 * 测试规模：100 / 500 / 1000 / 5000 消息
 * 指标：插入时间、读取时间、分页时间、搜索时间、内存使用
 */

import { messageStore } from "./message-store.js";
import { dexieAdapter } from "../infrastructure/dexie-adapter.js";
import { getDb, TABLES } from "../infrastructure/dexie-db.js";

const TEST_CHAT_ID = "perf-test-chat";

function measure(label, fn) {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  return { result, elapsed };
}

async function measureAsync(label, fn) {
  const start = performance.now();
  const result = await fn();
  const elapsed = performance.now() - start;
  return { result, elapsed };
}

function generateMessage(i, role = "user") {
  return {
    id: `perf-msg-${i}-${Date.now()}`,
    conversationId: TEST_CHAT_ID,
    role,
    content: `This is test message number ${i}. ` + "x".repeat(50),
    createdAt: Date.now() + i,
    status: "sent",
  };
}

async function cleanup() {
  const db = await getDb();
  await db.messages.where("conversationId").equals(TEST_CHAT_ID).delete();
}

export async function runPerformanceTest() {
  const results = [];
  const sizes = [100, 500, 1000, 5000];

  console.log("=== EchoChat Message Performance Test ===\n");

  for (const size of sizes) {
    console.log(`\n--- Testing ${size} messages ---`);
    await cleanup();

    // 1. 批量插入
    const messages = Array.from({ length: size }, (_, i) =>
      generateMessage(i, i % 2 === 0 ? "user" : "assistant")
    );

    const insertResult = await measureAsync("bulk insert", async () => {
      await dexieAdapter.message.bulkCreate(messages);
    });
    console.log(`  Bulk insert ${size}: ${insertResult.elapsed.toFixed(2)}ms (${(size / insertResult.elapsed * 1000).toFixed(0)} msg/s)`);

    // 2. 全量读取
    const readAllResult = await measureAsync("read all", async () => {
      return dexieAdapter.message.findByConversationId(TEST_CHAT_ID, { pageSize: size });
    });
    console.log(`  Read all ${size}: ${readAllResult.elapsed.toFixed(2)}ms`);

    // 3. 分页读取（第一页 50 条）
    const pageResult = await measureAsync("read page 1 (50)", async () => {
      return dexieAdapter.message.findByConversationId(TEST_CHAT_ID, { page: 1, pageSize: 50 });
    });
    console.log(`  Read page 1 (50): ${pageResult.elapsed.toFixed(2)}ms`);

    // 4. 分页读取（中间页）
    const midPage = Math.max(1, Math.floor(size / 100));
    const midPageResult = await measureAsync(`read page ${midPage} (50)`, async () => {
      return dexieAdapter.message.findByConversationId(TEST_CHAT_ID, { page: midPage, pageSize: 50 });
    });
    console.log(`  Read page ${midPage} (50): ${midPageResult.elapsed.toFixed(2)}ms`);

    // 5. 搜索
    const searchResult = await measureAsync("search", async () => {
      return dexieAdapter.message.search(TEST_CHAT_ID, `number ${Math.floor(size / 2)}`);
    });
    console.log(`  Search: ${searchResult.elapsed.toFixed(2)}ms (found ${searchResult.result.length})`);

    // 6. 单条插入
    const singleInsert = await measureAsync("single insert", async () => {
      await dexieAdapter.message.create(generateMessage(size + 1, "user"));
    });
    console.log(`  Single insert: ${singleInsert.elapsed.toFixed(2)}ms`);

    // 7. 内存使用
    const memory = performance.memory
      ? `${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`
      : "N/A (non-Chrome)";
    console.log(`  Memory: ${memory}`);

    results.push({
      size,
      insertMs: insertResult.elapsed,
      readAllMs: readAllResult.elapsed,
      page1Ms: pageResult.elapsed,
      midPageMs: midPageResult.elapsed,
      searchMs: searchResult.elapsed,
      singleInsertMs: singleInsert.elapsed,
      memory,
    });
  }

  await cleanup();

  // 汇总表
  console.log("\n=== Performance Summary ===");
  console.table(results);

  // 对比 localStorage（估算）
  console.log("\n=== Comparison with localStorage (estimated) ===");
  console.log("| Size | Dexie insert | localStorage insert (est) |");
  console.log("|------|-------------|--------------------------|");
  for (const r of results) {
    // localStorage 每次插入需要序列化整个 state，复杂度 O(n^2)
    const localStorageEst = r.size * r.size * 0.001; // 粗略估算
    console.log(`| ${r.size} | ${r.insertMs.toFixed(1)}ms | ~${localStorageEst.toFixed(0)}ms |`);
  }

  return results;
}

if (typeof window !== "undefined") {
  window.runMessagePerfTest = runPerformanceTest;
}
