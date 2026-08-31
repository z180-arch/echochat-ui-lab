// ============================================================
//  EchoChat Rebuild · Views
// ============================================================

import { store } from "../../core/store.js";
import { events, EVT } from "../../core/events.js";
import { esc } from "../../core/utils.js";
import { sendMessage, stopGeneration, isSending } from "../../domain/chat.js";
import { createFromTemplate, getSystemTemplates, getRoleName, getRoleAvatar } from "../../domain/persona.js";
import { listMoments } from "../../domain/moments.js";
import { getAffinity } from "../../domain/relations.js";

export function renderApp(root) {
  if (!root) return;
  const state = store.getState();
  const tab = state.ui?.tab || "chats";
  const chat = store.getCurrentChat();

  root.innerHTML = `
    <div class="app-shell">
      <nav class="nav-rail">
        <button data-tab="chats" class="${tab === "chats" ? "active" : ""}">会话</button>
        <button data-tab="moments" class="${tab === "moments" ? "active" : ""}">动态</button>
        <button data-tab="me" class="${tab === "me" ? "active" : ""}">我的</button>
      </nav>
      <div class="main-area">
        ${tab === "chats" ? renderChats(state, chat) : ""}
        ${tab === "moments" ? renderMoments() : ""}
        ${tab === "me" ? renderMe(state) : ""}
      </div>
      <nav class="bottom-nav">
        <button data-tab="chats" class="${tab === "chats" ? "active" : ""}">会话</button>
        <button data-tab="moments" class="${tab === "moments" ? "active" : ""}">动态</button>
        <button data-tab="me" class="${tab === "me" ? "active" : ""}">我的</button>
      </nav>
    </div>
  `;

  root.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.onclick = () => {
      store.set((s) => ({ ...s, ui: { ...s.ui, tab: btn.dataset.tab } }));
      events.emit(EVT.TAB_CHANGE, btn.dataset.tab);
    };
  });

  bindChatEvents(root, chat);
}

function renderChats(state, chat) {
  const list = (state.chats || [])
    .map(
      (c) => `
    <div class="chat-item ${c.id === state.currentChatId ? "active" : ""}" data-id="${c.id}">
      <img src="${esc(getRoleAvatar(c))}" alt="" width="40" height="40" />
      <div class="chat-item-meta">
        <div class="name">${esc(getRoleName(c))}</div>
        <div class="preview text-secondary">${esc((c.messages || []).slice(-1)[0]?.text || "")}</div>
      </div>
    </div>`
    )
    .join("");

  const msgs = (chat?.messages || [])
    .map(
      (m) => `
    <div class="msg ${m.role}">
      <div class="msg-bubble">${esc(m.text || "")}${m.streaming ? " ▍" : ""}</div>
    </div>`
    )
    .join("");

  return `
    <div class="list-pane">
      <div class="list-header">
        <strong>会话</strong>
        <button id="btn-new-chat">新建</button>
      </div>
      <div class="chat-list">${list || "<div class=\"p-4 text-secondary\">暂无会话，点击新建</div>"}</div>
    </div>
    <div class="chat-pane ${chat ? "" : "hidden-mobile"}">
      ${
        chat
          ? `
        <div class="chat-topbar">
          <strong>${esc(getRoleName(chat))}</strong>
          <button id="btn-stop" ${isSending() ? "" : "disabled"}>停止</button>
        </div>
        <div class="chat-messages">${msgs}</div>
        <div class="chat-input-area">
          <textarea id="chat-input" rows="1" placeholder="输入消息…"></textarea>
          <button id="btn-send">发送</button>
        </div>`
          : `<div class="p-4 text-center text-secondary">选择或新建会话</div>`
      }
    </div>
  `;
}

function bindChatEvents(root, chat) {
  root.querySelectorAll(".chat-item").forEach((el) => {
    el.onclick = () => store.selectChat(el.dataset.id);
  });
  const btnNew = root.querySelector("#btn-new-chat");
  if (btnNew) {
    btnNew.onclick = () => {
      const tpls = getSystemTemplates();
      const tpl = tpls[0] || { name: "新角色", persona: "你是一个友善的助手。", avatar: "assets/avatars/default.svg", firstMessage: "你好～" };
      createFromTemplate(tpl);
    };
  }
  const input = root.querySelector("#chat-input");
  const btnSend = root.querySelector("#btn-send");
  const btnStop = root.querySelector("#btn-stop");
  if (btnSend && input && chat) {
    const doSend = () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      sendMessage(chat.id, text);
    };
    btnSend.onclick = doSend;
    input.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    };
  }
  if (btnStop) btnStop.onclick = () => stopGeneration();
}

function renderMoments() {
  const list = listMoments(50)
    .map(
      (m) => `
    <div class="moment-card p-4">
      <div class="text-secondary">${esc(m.roleName || m.roleId)}</div>
      <div>${esc(m.content)}</div>
      <div class="text-tertiary">♥ ${m.likes || 0}</div>
    </div>`
    )
    .join("");
  return `<div class="moments-feed">${list || "<div class=\"p-4 text-secondary\">暂无动态</div>"}</div>`;
}

function renderMe(state) {
  const g = state.global || {};
  return `
    <div class="me-content p-4">
      <h2>设置</h2>
      <label>Base URL <input id="cfg-base" value="${esc(g.baseUrl || "")}" /></label>
      <label>API Key <input id="cfg-key" type="password" value="${esc(g.apiKey || "")}" /></label>
      <label>Model <input id="cfg-model" value="${esc(g.model || "")}" /></label>
      <button id="btn-save-api">保存 API</button>
      <hr />
      <button id="btn-theme">切换主题</button>
    </div>
  `;
}

// re-bind me settings after render via event delegation on next tick
document.addEventListener("click", (e) => {
  if (e.target?.id === "btn-save-api") {
    const base = document.getElementById("cfg-base")?.value || "";
    const key = document.getElementById("cfg-key")?.value || "";
    const model = document.getElementById("cfg-model")?.value || "";
    store.set((s) => ({
      ...s,
      global: { ...s.global, baseUrl: base, apiKey: key, model },
    }));
    events.emit(EVT.TOAST, { type: "ok", text: "已保存" });
  }
  if (e.target?.id === "btn-theme") {
    store.set((s) => {
      const theme = s.global?.theme === "dark" ? "light" : "dark";
      return { ...s, global: { ...s.global, theme } };
    });
    events.emit(EVT.THEME_CHANGE);
  }
});
