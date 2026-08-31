/**
 * EchoChat Legacy Storage Adapter
 *
 * 包装现有的 localStorage + store + IndexedDB，为 Repository 层提供统一访问。
 * 这是 Phase 1 的过渡层：Repository 通过此 Adapter 访问旧存储，
 * Phase 2 将替换为 Dexie Adapter，而 Repository 接口不变。
 *
 * 原则：
 * - Adapter 只做数据读写，不做业务逻辑
 * - Adapter 不暴露 localStorage/IndexedDB 细节给 Repository
 * - Repository 只依赖 Adapter 的方法，不依赖具体存储技术
 */

import { store } from "../core/store.js";
import { KEYS, safeGet, safeSet } from "../core/storage.js";
import { idb } from "../infrastructure/idb.js";

// ============================================================
//  State 访问（包装 store.js）
// ============================================================

/**
 * 读取整个 state
 * @returns {Object}
 */
export function getState() {
  return store.getState();
}

/**
 * 读取 state 中的某个 key
 * @param {string} key
 * @returns {any}
 */
export function getStateKey(key) {
  return store.get(key);
}

/**
 * 更新 state 中的某个 key（自动持久化）
 * @param {string} key
 * @param {any} value
 */
export function setStateKey(key, value) {
  store.set(key, value);
}

/**
 * 订阅 state 变化
 * @param {Function} listener
 * @returns {Function} unsubscribe
 */
export function subscribeState(listener) {
  return store.subscribe(listener);
}

// ============================================================
//  localStorage 直接访问（包装 storage.js）
// ============================================================

/**
 * 读取 localStorage key
 * @param {string} keyName - KEYS 中的名称
 * @returns {any}
 */
export function readKey(keyName) {
  return safeGet(KEYS[keyName]);
}

/**
 * 写入 localStorage key
 * @param {string} keyName
 * @param {any} value
 */
export function writeKey(keyName, value) {
  safeSet(KEYS[keyName], value);
}

// ============================================================
//  Chats 访问（state.chats）
// ============================================================

/**
 * 获取所有 chats
 * @returns {Array}
 */
export function getAllChats() {
  return getStateKey("chats") || [];
}

/**
 * 按 ID 获取 chat
 * @param {string} id
 * @returns {Object|undefined}
 */
export function getChatById(id) {
  return getAllChats().find((c) => c.id === id);
}

/**
 * 按 roleId 获取 chats
 * @param {string} roleId
 * @returns {Array}
 */
export function getChatsByRoleId(roleId) {
  return getAllChats().filter((c) => c.roleId === roleId);
}

/**
 * 更新整个 chats 数组
 * @param {Array} chats
 */
export function setAllChats(chats) {
  setStateKey("chats", chats);
}

/**
 * 更新单个 chat
 * @param {string} id
 * @param {Object|Function} updater - 新对象或更新函数
 */
export function updateChat(id, updater) {
  const chats = getAllChats();
  const idx = chats.findIndex((c) => c.id === id);
  if (idx === -1) return;
  chats[idx] = typeof updater === "function" ? updater(chats[idx]) : { ...chats[idx], ...updater };
  setAllChats(chats);
}

/**
 * 添加 chat
 * @param {Object} chat
 */
export function addChat(chat) {
  const chats = getAllChats();
  chats.push(chat);
  setAllChats(chats);
}

/**
 * 删除 chat
 * @param {string} id
 */
export function removeChat(id) {
  setAllChats(getAllChats().filter((c) => c.id !== id));
}

// ============================================================
//  Memory 访问（state.longTermMemory）
// ============================================================

/**
 * 获取所有 memory（按 roleId 分组）
 * @returns {Object}
 */
export function getAllMemory() {
  return getStateKey("longTermMemory") || {};
}

/**
 * 按 roleId 获取 memories
 * @param {string} roleId
 * @returns {Array}
 */
export function getMemoriesByRoleId(roleId) {
  const all = getAllMemory();
  return all[roleId]?.memories || [];
}

/**
 * 更新某个 roleId 的 memories
 * @param {string} roleId
 * @param {Array} memories
 */
export function setMemoriesByRoleId(roleId, memories) {
  const all = getAllMemory();
  if (!all[roleId]) {
    all[roleId] = { roleName: "", memories: [] };
  }
  all[roleId].memories = memories;
  setStateKey("longTermMemory", all);
}

// ============================================================
//  Relations 访问（localStorage RELATIONS key）
// ============================================================

/**
 * 获取所有 relations
 * @returns {Object}
 */
export function getAllRelations() {
  return readKey("RELATIONS") || { version: 1, checkIn: {}, roles: {} };
}

/**
 * 按 roleId 获取 relation
 * @param {string} roleId
 * @returns {Object|undefined}
 */
export function getRelationByRoleId(roleId) {
  return getAllRelations().roles[roleId];
}

/**
 * 更新整个 relations
 * @param {Object} relations
 */
export function setAllRelations(relations) {
  writeKey("RELATIONS", relations);
}

/**
 * 更新单个 role 的 relation
 * @param {string} roleId
 * @param {Object} relation
 */
export function updateRelation(roleId, relation) {
  const all = getAllRelations();
  all.roles[roleId] = relation;
  setAllRelations(all);
}

// ============================================================
//  Moments 访问（localStorage MOMENTS key）
// ============================================================

/**
 * 获取所有 moments
 * @returns {Array}
 */
export function getAllMoments() {
  return readKey("MOMENTS")?.moments || [];
}

/**
 * 更新整个 moments
 * @param {Array} moments
 */
export function setAllMoments(moments) {
  const data = readKey("MOMENTS") || { version: 1, moments: [] };
  data.moments = moments;
  writeKey("MOMENTS", data);
}

// ============================================================
//  Worldbook 访问（localStorage WORLDBOOK key）
// ============================================================

/**
 * 获取 worldbook 数据
 * @returns {Object}
 */
export function getWorldbookData() {
  return readKey("WORLDBOOK") || { version: 1, books: [], activeGlobalBookId: null };
}

/**
 * 更新 worldbook 数据
 * @param {Object} data
 */
export function setWorldbookData(data) {
  writeKey("WORLDBOOK", data);
}

// ============================================================
//  Settings 访问（state.settings）
// ============================================================

/**
 * 获取所有 settings
 * @returns {Object}
 */
export function getAllSettings() {
  return getStateKey("settings") || {};
}

/**
 * 获取单个 setting
 * @param {string} key
 * @returns {any}
 */
export function getSetting(key) {
  return getAllSettings()[key];
}

/**
 * 设置单个 setting
 * @param {string} key
 * @param {any} value
 */
export function setSetting(key, value) {
  const settings = getAllSettings();
  settings[key] = value;
  setStateKey("settings", settings);
}

// ============================================================
//  Asset / Blob 访问（IndexedDB）
// ============================================================

/**
 * 存储 blob
 * @param {Blob} blob
 * @returns {Promise<string>} id
 */
export async function storeBlob(blob) {
  return idb.putBlob(blob);
}

/**
 * 获取 blob
 * @param {string} id
 * @returns {Promise<Blob|null>}
 */
export async function getBlob(id) {
  return idb.getBlob(id);
}

/**
 * 删除 blob
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteBlob(id) {
  return idb.deleteBlob(id);
}

/**
 * 获取 blob 的 object URL
 * @param {string} id
 * @returns {Promise<string|null>}
 */
export async function getBlobUrl(id) {
  const blob = await getBlob(id);
  return blob ? URL.createObjectURL(blob) : null;
}

// ============================================================
//  元数据
// ============================================================

/**
 * 获取 schema 版本
 * @returns {number}
 */
export function getSchemaVersion() {
  return getStateKey("schemaVersion") || 1;
}

/**
 * 获取 app 版本
 * @returns {string}
 */
export function getAppVersion() {
  return "1.0.0";
}

// ============================================================
//  导出
// ============================================================

export const legacyAdapter = {
  // State
  getState,
  getStateKey,
  setStateKey,
  subscribeState,
  // localStorage
  readKey,
  writeKey,
  // Chats
  getAllChats,
  getChatById,
  getChatsByRoleId,
  setAllChats,
  updateChat,
  addChat,
  removeChat,
  // Memory
  getAllMemory,
  getMemoriesByRoleId,
  setMemoriesByRoleId,
  // Relations
  getAllRelations,
  getRelationByRoleId,
  setAllRelations,
  updateRelation,
  // Moments
  getAllMoments,
  setAllMoments,
  // Worldbook
  getWorldbookData,
  setWorldbookData,
  // Settings
  getAllSettings,
  getSetting,
  setSetting,
  // Assets
  storeBlob,
  getBlob,
  deleteBlob,
  getBlobUrl,
  // Meta
  getSchemaVersion,
  getAppVersion,
};
