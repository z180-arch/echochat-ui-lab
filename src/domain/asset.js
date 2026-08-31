/**
 * EchoChat Asset Domain (Phase 6)
 *
 * 统一管理二进制资产（头像、图片、附件）。
 * Asset Metadata + Binary Storage 分离。
 *
 * V1 模型：blob 直接存储在 IndexedDB，无 metadata
 * Phase 6 模型：Asset Metadata（Dexie assets 表）+ Binary（IndexedDB blobs store）
 *
 * 未来支持：
 * - IndexedDB（当前）
 * - OPFS
 * - Desktop File System
 * - Cloud Object Storage
 * 通过 Adapter 解耦。
 */

import { idb } from "../infrastructure/idb.js";
import { dexieAssetAdapter } from "../infrastructure/dexie-adapter.js";
import { isDbAvailable } from "../infrastructure/dexie-db.js";
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
//  Asset CRUD
// ============================================================

/**
 * 存储资产
 * @param {Blob} blob
 * @param {Object} [metadata]
 * @param {string} [metadata.type] - 资产类型
 * @param {string} [metadata.characterId] - 关联角色
 * @param {string} [metadata.momentId] - 关联动态
 * @param {string} [metadata.name] - 文件名
 * @returns {Promise<Object>} {id, metadata, url}
 */
export async function storeAsset(blob, metadata = {}) {
  const assetId = metadata.id || `asset_${uid()}`;

  // 1. 存储二进制到 IndexedDB
  await idb.putBlob(blob, assetId);

  // 2. 存储 metadata 到 Dexie（如果可用）
  const assetMeta = {
    id: assetId,
    type: metadata.type || ASSET_TYPES.ATTACHMENT,
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
      await dexieAssetAdapter.storeMetadata(assetId, assetMeta);
    } catch (e) {
      console.warn("[Asset] Dexie metadata store failed:", e.message);
    }
  }

  // 3. 生成 object URL
  const url = URL.createObjectURL(blob);

  return { id: assetId, metadata: assetMeta, url };
}

/**
 * 获取资产 blob
 * @param {string} id
 * @returns {Promise<Blob|null>}
 */
export async function getAssetBlob(id) {
  return idb.getBlob(id);
}

/**
 * 获取资产 object URL
 * @param {string} id
 * @returns {Promise<string|null>}
 */
export async function getAssetUrl(id) {
  const blob = await idb.getBlob(id);
  return blob ? URL.createObjectURL(blob) : null;
}

/**
 * 获取资产 metadata
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getAssetMetadata(id) {
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
  const blob = await idb.getBlob(id);
  if (!blob) return null;
  return {
    id,
    type: ASSET_TYPES.ATTACHMENT,
    size: blob.size,
    mimeType: blob.type,
    createdAt: null,
  };
}

/**
 * 删除资产
 * @param {string} id
 */
export async function deleteAsset(id) {
  // 1. 删除二进制
  await idb.deleteBlob(id);

  // 2. 删除 metadata
  const available = await isDbAvailable();
  if (available) {
    try {
      await dexieAssetAdapter.delete(id);
    } catch (e) {
      console.warn("[Asset] Dexie metadata delete failed:", e.message);
    }
  }
}

/**
 * 获取资产大小
 * @param {string} id
 * @returns {Promise<number>}
 */
export async function getAssetSize(id) {
  const blob = await idb.getBlob(id);
  return blob?.size || 0;
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
  const available = await isDbAvailable();
  if (!available) return { deleted: 0, freed: 0 };

  // TODO: 完整实现需要查询所有 Character/Moment/Message 的 asset 引用
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
  const blob = await idb.getBlob(id);
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
