/**
 * SettingsRepository (Legacy Implementation)
 *
 * 管理应用设置。小型配置可继续使用 localStorage。
 * 敏感数据（API Key）在 Phase 22 评估加密存储。
 */

import { legacyAdapter } from "./legacy-adapter.js";

export const SettingsRepository = {
  async getAll() {
    return { ...legacyAdapter.getAllSettings() };
  },

  async get(key) {
    return legacyAdapter.getSetting(key);
  },

  async set(key, value) {
    legacyAdapter.setSetting(key, value);
  },

  async setAll(settings) {
    legacyAdapter.setStateKey("settings", { ...settings });
  },

  async remove(key) {
    const settings = legacyAdapter.getAllSettings();
    delete settings[key];
    legacyAdapter.setStateKey("settings", settings);
  },
};
