/**
 * EchoChat Dexie Verification Script
 *
 * Phase 2 验证脚本。在浏览器控制台运行：
 *   import("/src/infrastructure/dexie-verify.js").then(m => m.runVerification())
 *
 * 验证内容：
 * 1. 数据库可以打开
 * 2. Schema 正确创建
 * 3. 基本 CRUD 操作正常
 * 4. 事务正常
 * 5. 分页查询正常
 */

import { getDb, TABLES, isDbAvailable } from "./dexie-db.js";
import { dexieAdapter } from "./dexie-adapter.js";

export async function runVerification() {
  const results = [];
  const log = (name, pass, detail = "") => {
    results.push({ name, pass, detail });
    console.log(`${pass ? "✅" : "❌"} ${name}${detail ? ": " + detail : ""}`);
  };

  try {
    // 1. 数据库可用
    const available = await isDbAvailable();
    log("Database available", available);

    const db = await getDb();

    // 2. Schema 验证
    const expectedTables = [
      TABLES.CHARACTERS,
      TABLES.CONVERSATIONS,
      TABLES.MESSAGES,
      TABLES.MEMORIES,
      TABLES.RELATIONSHIPS,
      TABLES.RELATIONSHIP_EVENTS,
      TABLES.MOMENTS,
      TABLES.MOMENT_COMMENTS,
      TABLES.MOMENT_REACTIONS,
      TABLES.WORLDBOOK_BOOKS,
      TABLES.WORLDBOOK_ENTRIES,
      TABLES.ASSETS,
      TABLES.MIGRATION_LOG,
    ];
    const actualTables = db.tables.map((t) => t.name);
    const allTablesExist = expectedTables.every((t) => actualTables.includes(t));
    log("Schema tables created", allTablesExist, `expected ${expectedTables.length}, got ${actualTables.length}`);

    // 3. Message CRUD
    const testConvId = "verify-conv-1";
    const testMsg = await dexieAdapter.message.create({
      conversationId: testConvId,
      role: "user",
      content: "Hello, this is a test message",
      createdAt: Date.now(),
    });
    log("Message create", !!testMsg.id, testMsg.id);

    const found = await dexieAdapter.message.findById(testMsg.id);
    log("Message findById", found?.content === testMsg.content);

    await dexieAdapter.message.update(testMsg.id, { content: "Updated content" });
    const updated = await dexieAdapter.message.findById(testMsg.id);
    log("Message update", updated?.content === "Updated content");

    const count = await dexieAdapter.message.countByConversationId(testConvId);
    log("Message count", count === 1, `count=${count}`);

    // 4. 分页查询
    for (let i = 0; i < 15; i++) {
      await dexieAdapter.message.create({
        conversationId: testConvId,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`,
        createdAt: Date.now() + i,
      });
    }
    const page1 = await dexieAdapter.message.findByConversationId(testConvId, { page: 1, pageSize: 10 });
    log("Message pagination page1", page1.items.length === 10, `items=${page1.items.length}, total=${page1.total}`);
    log("Message pagination hasMore", page1.hasMore === true);

    const page2 = await dexieAdapter.message.findByConversationId(testConvId, { page: 2, pageSize: 10 });
    log("Message pagination page2", page2.items.length === 6, `items=${page2.items.length}`);

    // 5. 搜索
    const searchResults = await dexieAdapter.message.search(testConvId, "Message 5");
    log("Message search", searchResults.length >= 1, `found=${searchResults.length}`);

    // 6. 事务
    try {
      await db.transaction("rw", db.messages, async () => {
        await db.messages.put({ id: "tx-test-1", conversationId: testConvId, role: "user", content: "tx test", createdAt: Date.now() });
        throw new Error("Intentional rollback");
      });
    } catch (e) {
      // expected
    }
    const txTest = await dexieAdapter.message.findById("tx-test-1");
    log("Transaction rollback", !txTest, "rolled back record not found");

    // 7. 清理测试数据
    await db.messages.where("conversationId").equals(testConvId).delete();
    const afterClean = await dexieAdapter.message.countByConversationId(testConvId);
    log("Cleanup", afterClean === 0, `remaining=${afterClean}`);

    // 总结
    const passed = results.filter((r) => r.pass).length;
    const total = results.length;
    console.log(`\n=== Verification: ${passed}/${total} passed ===`);

    return { results, passed, total };
  } catch (error) {
    console.error("Verification failed:", error);
    return { results, passed: 0, total: results.length, error: String(error) };
  }
}

// 自动运行（如果作为模块直接加载）
if (typeof window !== "undefined") {
  window.runDexieVerification = runVerification;
}
