// ============================================================
//  EchoChat Rebuild · Reactive Store
// ============================================================

import { storage } from "./storage.js";
import { events, EVT } from "./events.js";
import { uid } from "./utils.js";

const CFG = window.ECHOCHAT_CONFIG || {};

function defaultState() {
  return {
    schemaVersion: 2,
    chats: [],
    currentChatId: null,
    global: {
      persona: CFG.globalPersona || "",
      baseUrl: CFG.defaultBaseUrl || "",
      apiKey: "",
      model: CFG.defaultModel || "",
      theme: "light",
      themePreset: "mint",
    },
    longTermMemory: {},
    moments: [],
    relations: {},
    worldbooks: [],
    activeWorldbookId: null,
    userPersonaPresets: [],
    ui: { tab: "chats" },
  };
}

function loadInitial() {
  const saved = storage.load();
  if (!saved) return defaultState();
  return { ...defaultState(), ...saved, global: { ...defaultState().global, ...(saved.global || {}) } };
}

let state = loadInitial();
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {}
  });
  events.emit(EVT.STATE_CHANGE, state);
  storage.save(state);
}

export const store = {
  getState() {
    return state;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  set(updater) {
    state = typeof updater === "function" ? updater(state) : { ...state, ...updater };
    notify();
  },
  getCurrentChat() {
    return state.chats.find((c) => c.id === state.currentChatId) || null;
  },
  createChat(opts = {}) {
    const chat = {
      id: uid(),
      roleId: opts.roleId || "role_" + uid(),
      name: opts.name || "新角色",
      avatar: opts.avatar || "assets/avatars/default.svg",
      config: {
        persona: opts.persona || "",
        baseUrl: "",
        apiKey: "",
        model: "",
      },
      messages: opts.firstMessage
        ? [{ id: uid(), role: "assistant", text: opts.firstMessage, createdAt: Date.now() }]
        : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state = {
      ...state,
      chats: [chat, ...state.chats],
      currentChatId: chat.id,
    };
    notify();
    events.emit(EVT.CHAT_CREATED, chat);
    return chat;
  },
  updateChat(chatId, patch) {
    state = {
      ...state,
      chats: state.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              ...patch,
              config: patch.config ? { ...c.config, ...patch.config } : c.config,
              updatedAt: Date.now(),
            }
          : c
      ),
    };
    notify();
  },
  deleteChat(chatId) {
    state = {
      ...state,
      chats: state.chats.filter((c) => c.id !== chatId),
      currentChatId: state.currentChatId === chatId ? null : state.currentChatId,
    };
    notify();
    events.emit(EVT.CHAT_DELETED, { chatId });
  },
  selectChat(chatId) {
    state = { ...state, currentChatId: chatId };
    notify();
    events.emit(EVT.CHAT_SELECTED, { chatId });
  },
  appendMessage(chatId, msg) {
    state = {
      ...state,
      chats: state.chats.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...(c.messages || []), msg], updatedAt: Date.now() }
          : c
      ),
    };
    notify();
  },
  updateMessage(chatId, msgId, patch) {
    state = {
      ...state,
      chats: state.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: (c.messages || []).map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
            }
          : c
      ),
    };
    notify();
  },
  setChatMessages(chatId, messages) {
    state = {
      ...state,
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, messages, updatedAt: Date.now() } : c
      ),
    };
    notify();
  },
};
