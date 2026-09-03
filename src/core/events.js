// ============================================================
//  EchoChat Rebuild · Event Bus
//  轻量发布订阅，解耦 UI 与领域逻辑
// ============================================================

class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const set = this._listeners.get(event);
    if (set) set.delete(handler);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (e) {
        console.error(`[EventBus] handler error for "${event}":`, e);
      }
    }
  }

  once(event, handler) {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  clear() {
    this._listeners.clear();
  }
}

export const events = new EventBus();

// 预定义事件常量
export const EVT = {
  STATE_CHANGE: "state:change",
  CHAT_CREATED: "chat:created",
  CHAT_DELETED: "chat:deleted",
  CHAT_SELECTED: "chat:selected",
  MESSAGE_SENT: "message:sent",
  MESSAGE_RECEIVED: "message:received",
  STREAM_START: "stream:start",
  STREAM_DELTA: "stream:delta",
  STREAM_DONE: "stream:done",
  STREAM_ERROR: "stream:error",
  STREAM_ABORT: "stream:abort",
  MEMORY_ADDED: "memory:added",
  MEMORY_CANDIDATES_READY: "memory:candidates-ready",
  MOMENT_ADDED: "moment:added",
  RELATION_UPDATE: "relation:update",
  SETTINGS_CHANGE: "settings:change",
  THEME_CHANGE: "theme:change",
  TAB_CHANGE: "tab:change",
  MODAL_OPEN: "modal:open",
  MODAL_CLOSE: "modal:close",
  TOAST: "toast",
  ERROR: "error",
  DATA_MIGRATED: "data:migrated",
};
