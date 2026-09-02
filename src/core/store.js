// ============================================================
//  EchoChat Rebuild · Store (Canonical State)
//  唯一事实来源 + 订阅通知 + 自动持久化
//  解决：全局可变 state + 手动 save() + 手动 render() 的问题
// ============================================================

import { events, EVT } from "./events.js";
import { storage, KEYS } from "./storage.js";
import { uid } from "./utils.js";

const CFG = window.ECHOCHAT_CONFIG || {};

function defaultApiSeed() {
  const list = Array.isArray(CFG.apiPresets) ? CFG.apiPresets : [];
  const def = list.find((p) => p && p.id === "siliconflow") || list[0] || null;
  return {
    baseUrl: (def && def.baseUrl) || CFG.defaultBaseUrl || "https://api.siliconflow.cn/v1",
    apiKey: (def && def.apiKey) || "",
    model: (def && def.model) || CFG.defaultModel || "Qwen/Qwen2.5-7B-Instruct",
    apiPresetId: (def && def.id) || "siliconflow",
  };
}

function normalizeUiTab(tab) {
  if (tab === "messages" || tab === "characters" || tab === "chats") return "companion";
  if (tab === "companion" || tab === "moments" || tab === "me") return tab;
  return "companion";
}

function normalizeUi(ui) {
  return { ...ui, activeTab: normalizeUiTab(ui?.activeTab) };
}

function defaultState() {
  const api = defaultApiSeed();
  return {
    schemaVersion: 2,
    settings: {
      baseUrl: api.baseUrl,
      apiKey: api.apiKey,
      model: api.model,
      apiPresetId: api.apiPresetId,
      temperature: 1.0,
      myName: "我",
      myAvatar: "",
      bg: "",
      theme: "light", // light | dark | auto
      themePreset: "mint", // mint | sky | lavender | rose | sage | cloud
      customColors: { primary: "", mint: "", bubbleMe: "", bubbleHer: "" },
      particleIntensity: "medium", // off | weak | medium | strong
      accentColor: "",
      bubbleStyle: "rounded", // rounded | square | minimal
      fontSize: "medium", // small | medium | large
      readReceipts: true,
      autoSummary: true,
      ttsEnabled: false,
      sttEnabled: true,
      voice: "",
      voiceRate: 1.0,
      voiceLang: "zh-CN",
      emojiEnabled: true,
      emojiIntensity: 50,
    },
    global: {
      persona: CFG.globalPersona || "",
    },
    userPersonaPresets: [],
    longTermMemory: {}, // {roleId: {roleName, memories:[{id,content,importance,createdAt,source}]}}
    memoryCfg: {
      maxPerRole: 20,
      injectMax: 10,
      autoSummary: { enabled: true, everyTurns: 20, maxLength: 200 },
    },
    chats: [], // [{id, roleId, name, avatar, createdAt, config:{persona,myAvatar,model,temperature}, messages:[{id,role,text,time,status}]}]
    currentChatId: null,
    ui: {
      activeTab: "companion", // companion | moments | me  (messages/characters → companion)
      sidebarOpen: true,
      profileOpen: false,
      searchQuery: "",
      momentsFilter: "all",
      selectedCharacterId: null,
    },
  };
}

class Store {
  constructor() {
    this._state = this._load();
    this._listeners = new Set();
    this._batchDepth = 0;
    this._pendingNotify = false;
  }

  _load() {
    try {
      const saved = storage.get(KEYS.STATE, null);
      if (!saved) return defaultState();
      const def = defaultState();
      // 深度合并，确保新增字段有默认值
      return {
        ...def,
        ...saved,
        settings: {
          ...def.settings,
          ...(saved.settings || {}),
          customColors: { ...def.settings.customColors, ...((saved.settings || {}).customColors || {}) },
        },
        global: { ...def.global, ...(saved.global || {}) },
        memoryCfg: { ...def.memoryCfg, ...(saved.memoryCfg || {}), autoSummary: { ...def.memoryCfg.autoSummary, ...((saved.memoryCfg || {}).autoSummary || {}) } },
        ui: normalizeUi( { ...def.ui, ...(saved.ui || {}) } ),
        chats: Array.isArray(saved.chats) ? saved.chats : [],
        longTermMemory: saved.longTermMemory && typeof saved.longTermMemory === "object" ? saved.longTermMemory : {},
        userPersonaPresets: Array.isArray(saved.userPersonaPresets) ? saved.userPersonaPresets : [],
        currentChatId: saved.currentChatId || saved.current || null, // 兼容旧字段名
      };
    } catch (e) {
      console.error("[Store] load failed, using defaults:", e);
      return defaultState();
    }
  }

  _persist() {
    storage.set(KEYS.STATE, this._state);
  }

  _notify() {
    if (this._batchDepth > 0) {
      this._pendingNotify = true;
      return;
    }
    events.emit(EVT.STATE_CHANGE, this._state);
    this._listeners.forEach((fn) => {
      try {
        fn(this._state);
      } catch (e) {
        console.error("[Store] listener error:", e);
      }
    });
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  getState() {
    return this._state;
  }

  // 批量更新：多次 set 只触发一次通知和一次持久化
  batch(fn) {
    this._batchDepth++;
    try {
      fn();
    } finally {
      this._batchDepth--;
      if (this._batchDepth === 0 && this._pendingNotify) {
        this._pendingNotify = false;
        this._persist();
        this._notify();
      }
    }
  }

  set(updater) {
    if (typeof updater === "function") {
      this._state = updater(this._state);
    } else {
      this._state = { ...this._state, ...updater };
    }
    this._persist();
    this._notify();
  }

  // 便捷方法：设置
  updateSettings(patch) {
    this.set((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
    events.emit(EVT.SETTINGS_CHANGE, patch);
    if (patch.theme) events.emit(EVT.THEME_CHANGE, patch.theme);
  }

  // 便捷方法：聊天
  createChat(template) {
    const chat = {
      id: uid(),
      roleId: template.roleId || "role_" + uid(),
      name: template.name || "新对话",
      avatar: template.avatar || "",
      createdAt: Date.now(),
      config: {
        persona: template.persona || "",
        myAvatar: template.myAvatar || "",
        model: template.model || "",
        temperature: template.temperature != null ? template.temperature : 1.0,
      },
      messages: template.firstMessage
        ? [{ id: uid(), role: "her", text: template.firstMessage, time: Date.now(), status: "sent" }]
        : [],
    };
    this.set((s) => ({
      ...s,
      chats: [chat, ...s.chats],
      currentChatId: chat.id,
    }));
    events.emit(EVT.CHAT_CREATED, chat);
    return chat;
  }

  deleteChat(chatId) {
    this.set((s) => ({
      ...s,
      chats: s.chats.filter((c) => c.id !== chatId),
      currentChatId: s.currentChatId === chatId ? (s.chats[0]?.id || null) : s.currentChatId,
    }));
    events.emit(EVT.CHAT_DELETED, chatId);
  }

  selectChat(chatId) {
    this.set((s) => ({ ...s, currentChatId: chatId }));
    events.emit(EVT.CHAT_SELECTED, chatId);
  }

  getCurrentChat() {
    return this._state.chats.find((c) => c.id === this._state.currentChatId) || null;
  }

  updateChat(chatId, patch) {
    this.set((s) => ({
      ...s,
      chats: s.chats.map((c) => (c.id === chatId ? { ...c, ...patch } : c)),
    }));
  }

  addMessage(chatId, message) {
    const msg = { id: uid(), time: Date.now(), status: "sent", ...message };
    this.set((s) => ({
      ...s,
      chats: s.chats.map((c) =>
        c.id === chatId ? { ...c, messages: [...c.messages, msg] } : c
      ),
    }));
    return msg;
  }

  updateMessage(chatId, messageId, patch) {
    this.set((s) => ({
      ...s,
      chats: s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
            }
          : c
      ),
    }));
  }

  deleteMessage(chatId, messageId) {
    this.set((s) => ({
      ...s,
      chats: s.chats.map((c) =>
        c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== messageId) } : c
      ),
    }));
  }

  // 便捷方法：记忆
  addMemory(roleId, content, importance = 5) {
    this.set((s) => {
      const mem = s.longTermMemory[roleId] || { roleName: "", memories: [] };
      const memories = [
        ...mem.memories,
        { id: uid(), content, importance, createdAt: Date.now(), source: "auto" },
      ].slice(-s.memoryCfg.maxPerRole);
      return {
        ...s,
        longTermMemory: { ...s.longTermMemory, [roleId]: { ...mem, memories } },
      };
    });
    events.emit(EVT.MEMORY_ADDED, { roleId, content });
  }

  // 便捷方法：UI
  setActiveTab(tab) {
    const activeTab = normalizeUiTab(tab);
    this.set((s) => ({ ...s, ui: { ...s.ui, activeTab } }));
    events.emit(EVT.TAB_CHANGE, activeTab);
  }

  setProfileOpen(open) {
    this.set((s) => ({ ...s, ui: { ...s.ui, profileOpen: open } }));
  }

  setSearchQuery(q) {
    this.set((s) => ({ ...s, ui: { ...s.ui, searchQuery: q } }));
  }

  setSelectedCharacter(id) {
    this.set((s) => ({ ...s, ui: { ...s.ui, selectedCharacterId: id || null } }));
  }

  setMomentsFilter(filter) {
    this.set((s) => ({ ...s, ui: { ...s.ui, momentsFilter: filter || "all" } }));
  }

  // 导出全量数据（备份）
  exportAll() {
    return {
      schemaVersion: this._state.schemaVersion,
      exportedAt: Date.now(),
      state: this._state,
    };
  }

  // 导入全量数据（带验证）
  importAll(data, mode = "merge") {
    if (!data || typeof data !== "object") throw new Error("无效的备份文件");
    const incoming = data.state || data; // 兼容旧格式
    if (!incoming.chats) throw new Error("备份文件缺少聊天数据");

    if (mode === "replace") {
      this._state = { ...defaultState(), ...incoming };
    } else {
      // merge: 合并 chats，去重 by id
      const existingIds = new Set(this._state.chats.map((c) => c.id));
      const newChats = (incoming.chats || []).filter((c) => !existingIds.has(c.id));
      this._state = {
        ...this._state,
        chats: [...newChats, ...this._state.chats],
        longTermMemory: { ...this._state.longTermMemory, ...(incoming.longTermMemory || {}) },
        userPersonaPresets: [...this._state.userPersonaPresets, ...(incoming.userPersonaPresets || [])],
      };
    }
    this._persist();
    this._notify();
  }

  reset() {
    this._state = defaultState();
    this._persist();
    this._notify();
  }
}

export const store = new Store();
export { defaultState };
