/**
 * EchoChat Message Store (Phase 3 — Message Independence)
 *
 * 消息存储抽象层：优先使用 Dexie/IndexedDB，过渡期间双写 localStorage。
 *
 * 渐进式迁移策略：
 * - Phase 3.1: 双写（Dexie + localStorage），读取仍从 localStorage
 * - Phase 3.2: 自动迁移旧消息到 Dexie
 * - Phase 3.3: 读取优先 Dexie，fallback localStorage
 * - Phase 3.4: 移除 localStorage 消息存储
 *
 * 接口与 store.addMessage/updateMessage/deleteMessage 保持一致，
 * chat.js 和 UI 层可无缝切换。
 */

import { store } from "../core/store.js";
import { uid } from "../core/utils.js";
import { dexieAdapter } from "../infrastructure/dexie-adapter.js";
import { isDbAvailable } from "../infrastructure/dexie-db.js";

// ============================================================
//  迁移状态
// ============================================================

let dexieAvailable = null;
let migrationInProgress = false;

/**
 * 检查 Dexie 是否可用（缓存结果）
 */
async function ensureDexie() {
  if (dexieAvailable === null) {
    dexieAvailable = await isDbAvailable();
  }
  return dexieAvailable;
}

// ============================================================
//  消息格式转换
// ============================================================

/**
 * V1 消息格式 → Dexie 消息格式
 */
function toDexieMessage(msg, chatId) {
  return {
    id: msg.id,
    conversationId: chatId,
    parentMessageId: msg.parentMessageId || null,
    role: msg.role === "me" ? "user" : msg.role === "her" ? "assistant" : msg.role,
    content: msg.text || msg.content || "",
    createdAt: msg.time || Date.now(),
    updatedAt: msg.updatedAt || msg.time || Date.now(),
    status: msg.status || "sent",
    metadata: msg.metadata || {},
  };
}

/**
 * Dexie 消息格式 → V1 消息格式
 */
function toV1Message(msg) {
  return {
    id: msg.id,
    role: msg.role === "user" ? "me" : msg.role === "assistant" ? "her" : msg.role,
    text: msg.content,
    time: msg.createdAt,
    status: msg.status,
    parentMessageId: msg.parentMessageId,
    metadata: msg.metadata,
  };
}

// ============================================================
//  迁移
// ============================================================

/**
 * 迁移单个 chat 的消息到 Dexie
 * 幂等：已迁移的消息不会重复
 */
export async function migrateChatMessages(chatId) {
  const available = await ensureDexie();
  if (!available) return { migrated: 0, skipped: true };

  const chat = store.getState().chats.find((c) => c.id === chatId);
  if (!chat || !chat.messages?.length) return { migrated: 0 };

  // 检查 Dexie 中是否已有该 chat 的消息
  const existingCount = await dexieAdapter.message.countByConversationId(chatId);
  if (existingCount > 0) {
    return { migrated: 0, alreadyMigrated: true, existingCount };
  }

  // 批量写入 Dexie
  const dexieMessages = chat.messages.map((m) => toDexieMessage(m, chatId));
  await dexieAdapter.message.bulkCreate(dexieMessages);

  return { migrated: dexieMessages.length };
}

/**
 * 迁移所有 chat 的消息到 Dexie
 */
export async function migrateAllMessages() {
  if (migrationInProgress) return { skipped: true };
  migrationInProgress = true;

  try {
    const chats = store.getState().chats;
    const results = [];
    let totalMigrated = 0;

    for (const chat of chats) {
      try {
        const result = await migrateChatMessages(chat.id);
        results.push({ chatId: chat.id, ...result });
        totalMigrated += result.migrated || 0;
      } catch (e) {
        console.error(`[MessageStore] migrate ${chat.id} failed:`, e);
        results.push({ chatId: chat.id, error: String(e) });
      }
    }

    console.log(`[MessageStore] Migration complete: ${totalMigrated} messages`);
    return { totalMigrated, results };
  } finally {
    migrationInProgress = false;
  }
}

// ============================================================
//  消息操作（双写）
// ============================================================

/**
 * 添加消息
 * 双写：localStorage (store.addMessage) + Dexie
 */
export async function addMessage(chatId, message) {
  // 1. 写入 localStorage（保持 UI 立即响应）
  const msg = store.addMessage(chatId, message);

  // 2. 异步写入 Dexie（不阻塞 UI）
  ensureDexie().then((available) => {
    if (available) {
      dexieAdapter.message.create(toDexieMessage(msg, chatId)).catch((e) => {
        console.error("[MessageStore] Dexie addMessage failed:", e);
      });
    }
  });

  return msg;
}

/**
 * 更新消息
 * 双写：localStorage + Dexie
 */
export async function updateMessage(chatId, messageId, patch) {
  // 1. 更新 localStorage
  store.updateMessage(chatId, messageId, patch);

  // 2. 异步更新 Dexie
  ensureDexie().then((available) => {
    if (available) {
      const dexiePatch = {};
      if (patch.text !== undefined) dexiePatch.content = patch.text;
      if (patch.status !== undefined) dexiePatch.status = patch.status;
      if (patch.role !== undefined) {
        dexiePatch.role = patch.role === "me" ? "user" : patch.role === "her" ? "assistant" : patch.role;
      }
      if (Object.keys(dexiePatch).length > 0) {
        dexiePatch.updatedAt = Date.now();
        dexieAdapter.message.update(messageId, dexiePatch).catch((e) => {
          console.error("[MessageStore] Dexie updateMessage failed:", e);
        });
      }
    }
  });
}

/**
 * 删除消息
 * 双写：localStorage + Dexie
 */
export async function deleteMessage(chatId, messageId) {
  // 1. 从 localStorage 删除
  store.deleteMessage(chatId, messageId);

  // 2. 异步从 Dexie 删除
  ensureDexie().then((available) => {
    if (available) {
      dexieAdapter.message.delete(messageId).catch((e) => {
        console.error("[MessageStore] Dexie deleteMessage failed:", e);
      });
    }
  });
}

/**
 * 获取消息（优先 Dexie，fallback localStorage）
 * 当前 Phase 3.1: 仍从 localStorage 读取
 * Phase 3.3: 切换到 Dexie 读取
 */
export async function getMessages(chatId, options = {}) {
  const available = await ensureDexie();

  if (available) {
    // 检查 Dexie 中是否有数据
    const count = await dexieAdapter.message.countByConversationId(chatId);
    if (count > 0) {
      const result = await dexieAdapter.message.findByConversationId(chatId, options);
      return result.items.map(toV1Message);
    }
  }

  // Fallback: 从 localStorage 读取
  const chat = store.getState().chats.find((c) => c.id === chatId);
  return chat?.messages || [];
}

/**
 * 获取消息数量
 */
export async function getMessageCount(chatId) {
  const available = await ensureDexie();
  if (available) {
    const count = await dexieAdapter.message.countByConversationId(chatId);
    if (count > 0) return count;
  }
  const chat = store.getState().chats.find((c) => c.id === chatId);
  return chat?.messages?.length || 0;
}

/**
 * 搜索消息
 */
export async function searchMessages(chatId, query) {
  const available = await ensureDexie();
  if (available) {
    const results = await dexieAdapter.message.search(chatId, query);
    if (results.length > 0) return results.map(toV1Message);
  }
  const chat = store.getState().chats.find((c) => c.id === chatId);
  const lower = query.toLowerCase();
  return (chat?.messages || []).filter((m) =>
    (m.text || "").toLowerCase().includes(lower)
  );
}

/**
 * 分页获取消息（用于长聊天加载更多）
 */
export async function getMessagesPaginated(chatId, page = 1, pageSize = 50) {
  const available = await ensureDexie();
  if (available) {
    const count = await dexieAdapter.message.countByConversationId(chatId);
    if (count > 0) {
      const result = await dexieAdapter.message.findByConversationId(chatId, { page, pageSize });
      return {
        items: result.items.map(toV1Message),
        total: result.total,
        hasMore: result.hasMore,
        page,
        pageSize,
      };
    }
  }

  // Fallback: 内存分页
  const chat = store.getState().chats.find((c) => c.id === chatId);
  const all = chat?.messages || [];
  const total = all.length;
  const start = Math.max(0, total - page * pageSize);
  const end = Math.min(total, start + pageSize);
  return {
    items: all.slice(start, end),
    total,
    hasMore: start > 0,
    page,
    pageSize,
  };
}

// ============================================================
//  批量操作（用于 retry/regenerate 等场景）
// ============================================================

/**
 * 截断消息到指定索引
 * 用于 retryLastMessage / regenerate / editMessage
 */
export async function truncateMessages(chatId, keepCount) {
  const chat = store.getState().chats.find((c) => c.id === chatId);
  if (!chat) return;

  const toDelete = chat.messages.slice(keepCount).map((m) => m.id);

  // 1. localStorage 截断
  store.set((s) => ({
    ...s,
    chats: s.chats.map((c) =>
      c.id === chatId ? { ...c, messages: c.messages.slice(0, keepCount) } : c
    ),
  }));

  // 2. Dexie 删除
  const available = await ensureDexie();
  if (available) {
    for (const id of toDelete) {
      dexieAdapter.message.delete(id).catch(() => {});
    }
  }
}

/**
 * 删除整个 chat 的所有消息
 */
export async function deleteAllMessages(chatId) {
  // 1. localStorage
  store.set((s) => ({
    ...s,
    chats: s.chats.map((c) => (c.id === chatId ? { ...c, messages: [] } : c)),
  }));

  // 2. Dexie
  const available = await ensureDexie();
  if (available) {
    // Dexie adapter 没有批量删除，逐条删除
    // 注意：实际应用中应该用 db.transaction 批量删除
    const messages = await dexieAdapter.message.findByConversationId(chatId, { pageSize: 10000 });
    for (const msg of messages.items) {
      await dexieAdapter.message.delete(msg.id);
    }
  }
}

// ============================================================
//  导出
// ============================================================

export const messageStore = {
  addMessage,
  updateMessage,
  deleteMessage,
  getMessages,
  getMessageCount,
  searchMessages,
  getMessagesPaginated,
  truncateMessages,
  deleteAllMessages,
  migrateChatMessages,
  migrateAllMessages,
  isDexieAvailable: () => dexieAvailable,
};
