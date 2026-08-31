/**
 * AssetRepository (Legacy Implementation)
 *
 * Phase 1 过渡实现：包装现有 IndexedDB blob 存储。
 * Phase 6 将扩展为 Asset Metadata + Binary Storage 分离，支持多种后端。
 */

import { legacyAdapter } from "./legacy-adapter.js";

export const AssetRepository = {
  /**
   * 存储 blob
   * @param {Blob} blob
   * @param {Object} [metadata]
   * @returns {Promise<Object>} {id, metadata}
   */
  async storeBlob(blob, metadata = {}) {
    const id = await legacyAdapter.storeBlob(blob);
    // Phase 6: 写入独立的 asset metadata 存储
    // 当前: metadata 暂不持久化（V1 只有 blob 存储）
    return { id, metadata: { ...metadata, size: blob.size, type: blob.type, createdAt: Date.now() } };
  },

  async getBlob(id) {
    return legacyAdapter.getBlob(id);
  },

  async getMetadata(id) {
    // Phase 6: 从 metadata 存储读取
    // 当前: 尝试从 blob 推断基本信息
    const blob = await legacyAdapter.getBlob(id);
    if (!blob) return null;
    return { id, size: blob.size, type: blob.type, createdAt: null };
  },

  async getObjectUrl(id) {
    return legacyAdapter.getBlobUrl(id);
  },

  async delete(id) {
    return legacyAdapter.deleteBlob(id);
  },

  async getSize(id) {
    const blob = await legacyAdapter.getBlob(id);
    return blob?.size || 0;
  },
};
