/**
 * AssetRepository (Legacy + Dexie Implementation)
 *
 * Phase 1 过渡实现：包装现有 IndexedDB blob 存储。
 * Phase 6 扩展为 Asset Metadata (Dexie) + Binary Storage (IndexedDB) 分离。
 *
 * Repository 层不直接访问 Dexie，通过 dexieAssetAdapter（Infrastructure 层）。
 * 这是过渡实现，未来会重构为统一的 StorageAdapter 接口。
 */
import { legacyAdapter } from "./legacy-adapter.js";
import { dexieAssetAdapter } from "../infrastructure/dexie-adapter.js";
import { isDbAvailable } from "../infrastructure/dexie-db.js";

export const AssetRepository = {
  /**
   * 存储 blob + metadata
   * @param {Blob} blob
   * @param {Object} [metadata]
   * @returns {Promise<Object>} {id, metadata}
   */
  async storeBlob(blob, metadata = {}) {
    const id = metadata.id || `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 1. 存储二进制到 IndexedDB（通过 Legacy Adapter）
    await legacyAdapter.storeBlob(blob, id);

    // 2. 存储 metadata 到 Dexie（如果可用）
    const assetMeta = {
      id,
      type: metadata.type || "attachment",
      characterId: metadata.characterId || null,
      momentId: metadata.momentId || null,
      name: metadata.name || "",
      size: blob.size,
      mimeType: blob.type,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const available = await isDbAvailable();
    if (available) {
      try {
        await dexieAssetAdapter.storeMetadata(id, assetMeta);
      } catch (e) {
        console.warn("[AssetRepository] Dexie metadata store failed:", e.message);
      }
    }

    return { id, metadata: assetMeta };
  },

  /**
   * 获取 blob
   * @param {string} id
   * @returns {Promise<Blob|null>}
   */
  async getBlob(id) {
    return legacyAdapter.getBlob(id);
  },

  /**
   * 获取 metadata
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getMetadata(id) {
    // 优先从 Dexie 读取
    const available = await isDbAvailable();
    if (available) {
      try {
        const meta = await dexieAssetAdapter.getMetadata(id);
        if (meta) return meta;
      } catch (e) {
        // fallback
      }
    }

    // Fallback: 从 blob 推断基本信息
    const blob = await legacyAdapter.getBlob(id);
    if (!blob) return null;
    return { id, size: blob.size, type: blob.type, createdAt: null };
  },

  /**
   * 获取 object URL
   * @param {string} id
   * @returns {Promise<string|null>}
   */
  async getObjectUrl(id) {
    const blob = await legacyAdapter.getBlob(id);
    return blob ? URL.createObjectURL(blob) : null;
  },

  /**
   * 删除资产（blob + metadata）
   * @param {string} id
   */
  async delete(id) {
    // 1. 删除二进制
    await legacyAdapter.deleteBlob(id);

    // 2. 删除 metadata
    const available = await isDbAvailable();
    if (available) {
      try {
        await dexieAssetAdapter.delete(id);
      } catch (e) {
        console.warn("[AssetRepository] Dexie metadata delete failed:", e.message);
      }
    }
  },

  /**
   * 获取资产大小
   * @param {string} id
   * @returns {Promise<number>}
   */
  async getSize(id) {
    const blob = await legacyAdapter.getBlob(id);
    return blob?.size || 0;
  },

  /**
   * 更新 metadata
   * @param {string} id
   * @param {Object} updates
   */
  async updateMetadata(id, updates) {
    const available = await isDbAvailable();
    if (available) {
      try {
        await dexieAssetAdapter.updateMetadata(id, updates);
      } catch (e) {
        console.warn("[AssetRepository] Dexie metadata update failed:", e.message);
      }
    }
  },
};
