/**
 * EchoChat Asset Domain (Phase 6)
 *
 * 统一管理二进制资产（头像、图片、附件）。
 * Asset Metadata + Binary Storage 分离。
 *
 * V1 模型：blob 直接存储在 IndexedDB，无 metadata
 * Phase 6 模型：Asset Metadata（Dexie assets 表）+ Binary（IndexedDB blobs store）
 *
 * Domain 层通过 AssetRepository 访问，不直接访问 idb 或 Dexie。
 *
 * 未来支持：
 * - IndexedDB（当前）
 * - OPFS
 * - Desktop File System
 * - Cloud Object Storage
 * 通过 Adapter 解耦。
 */

import { AssetRepository } from "../repository/asset.js";
import { uid } from "../core/utils.js";

// ============================================================
//  Asset 类型
// ============================================================

export const ASSET_TYPES = {
  AVATAR: "avatar",
  PROFILE_IMAGE: "profile_image",
  GALLERY: "gallery",
  MOMENT_IMAGE: "moment_image",
  ATTACHMENT: "attachment",
  IMPORTED: "imported",
};

// ============================================================
//  Asset CRUD（通过 Repository）
// ============================================================

/**
 * 存储资产
 * @param {Blob} blob
 * @param {Object} [metadata]
 * @returns {Promise<Object>} {id, metadata, url}
 */
export async function storeAsset(blob, metadata = {}) {
  const result = await AssetRepository.storeBlob(blob, {
    ...metadata,
    id: metadata.id || `asset_${uid()}`,
  });

  // 生成 object URL（用于即时显示）
  const url = await AssetRepository.getObjectUrl(result.id);

  return { id: result.id, metadata: result.metadata, url };
}

/**
 * 获取资产 blob
 * @param {string} id
 * @returns {Promise<Blob|null>}
 */
export async function getAssetBlob(id) {
  return AssetRepository.getBlob(id);
}

/**
 * 获取资产 object URL
 * @param {string} id
 * @returns {Promise<string|null>}
 */
export async function getAssetUrl(id) {
  return AssetRepository.getObjectUrl(id);
}

/**
 * 获取资产 metadata
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getAssetMetadata(id) {
  return AssetRepository.getMetadata(id);
}

/**
 * 删除资产
 * @param {string} id
 */
export async function deleteAsset(id) {
  await AssetRepository.delete(id);
}

/**
 * 获取资产大小
 * @param {string} id
 * @returns {Promise<number>}
 */
export async function getAssetSize(id) {
  return AssetRepository.getSize(id);
}

// ============================================================
//  头像管理
// ============================================================

/**
 * 存储角色头像
 * @param {string} characterId
 * @param {Blob} blob
 * @returns {Promise<Object>}
 */
export async function storeAvatar(characterId, blob) {
  return storeAsset(blob, {
    type: ASSET_TYPES.AVATAR,
    characterId,
    name: "avatar",
  });
}

/**
 * 获取角色头像 URL
 * @param {string} characterId
 * @param {string} [avatarId] - 已知的 avatar asset ID
 * @returns {Promise<string|null>}
 */
export async function getAvatarUrl(characterId, avatarId) {
  if (avatarId) {
    return getAssetUrl(avatarId);
  }
  return null;
}

// ============================================================
//  动态图片管理
// ============================================================

/**
 * 存储动态图片
 * @param {string} momentId
 * @param {Blob} blob
 * @returns {Promise<Object>}
 */
export async function storeMomentImage(momentId, blob) {
  return storeAsset(blob, {
    type: ASSET_TYPES.MOMENT_IMAGE,
    momentId,
    name: `moment_${momentId}`,
  });
}

// ============================================================
//  附件管理
// ============================================================

/**
 * 存储消息附件
 * @param {string} messageId
 * @param {Blob} blob
 * @param {string} [name]
 * @returns {Promise<Object>}
 */
export async function storeAttachment(messageId, blob, name) {
  return storeAsset(blob, {
    type: ASSET_TYPES.ATTACHMENT,
    name: name || blob.name || "attachment",
  });
}

// ============================================================
//  资产清理
// ============================================================

/**
 * 清理孤立资产（没有被任何 Character/Moment/Message 引用的资产）
 * @returns {Promise<{deleted: number, freed: number}>}
 */
export async function cleanupOrphanedAssets() {
  // Phase 6: 基础实现，遍历所有 asset ID 并检查引用
  // 完整实现需要在 Phase 11 (Moments) 和 Phase 3 (Messages) 完成后
  // 当前只提供接口，实际清理在后续 Phase 实现
  return { deleted: 0, freed: 0 };
}

/**
 * 获取所有资产统计
 * @returns {Promise<{count: number, totalSize: number}>}
 */
export async function getAssetStats() {
  // IndexedDB 没有直接的 count 方法，需要遍历
  // 简化实现：返回 0，完整实现在后续 Phase
  return { count: 0, totalSize: 0 };
}

// ============================================================
//  导入/导出
// ============================================================

/**
 * 导出资产为 base64（用于备份）
 * @param {string} id
 * @returns {Promise<string|null>}
 */
export async function exportAssetAsBase64(id) {
  const blob = await AssetRepository.getBlob(id);
  if (!blob) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

/**
 * 从 base64 导入资产
 * @param {string} base64
 * @param {Object} metadata
 * @returns {Promise<Object>}
 */
export async function importAssetFromBase64(base64, metadata = {}) {
  const response = await fetch(base64);
  const blob = await response.blob();
  return storeAsset(blob, metadata);
}

// ============================================================
//  导出
// ============================================================

export const Asset = {
  ASSET_TYPES,
  storeAsset,
  getAssetBlob,
  getAssetUrl,
  getAssetMetadata,
  deleteAsset,
  getAssetSize,
  storeAvatar,
  getAvatarUrl,
  storeMomentImage,
  storeAttachment,
  cleanupOrphanedAssets,
  getAssetStats,
  exportAssetAsBase64,
  importAssetFromBase64,
};
