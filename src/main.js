// ============================================================
//  EchoChat Rebuild · Main Entry
//  应用初始化、路由、事件绑定、全局 API
// ============================================================

import { store } from "./core/store.js";
import { events, EVT } from "./core/events.js";
import { runMigrations, storage, KEYS } from "./core/storage.js";
import { uid, esc, downloadFile, readFileAsText } from "./core/utils.js";
import { sendMessage, stopGeneration, regenerate, editMessage, deleteMessage, copyMessage, isSending } from "./domain/chat.js";
import { createFromTemplate, getSystemTemplates, parseCharacterCard, buildCharacterCard } from "./domain/persona.js";
import { rememberMessage } from "./domain/memory.js";
import { listMoments, toggleLike, addComment } from "./domain/moments.js";
import { getApiPresets, findPreset, needsApiSetup } from "./domain/provider.js";
import {
  renderLanding,
  renderOnboarding,
  renderAppShell,
  setOnboardGender,
  selectOnboardTemplate,
  getOnboardSelection,
  resetOnboarding,
} from "./ui/views/index.js";
import { showToast, openModal, Icons } from "./ui/components/index.js";

// 应用状态
const App = {
  view: "landing", // landing | onboarding | app
  initialized: false,

  // 初始化
  async init() {
    // 1. 运行数据迁移
    try {
      const result = runMigrations();
      if (result.migrated) {
        console.log(`[App] Data migrated v${result.from} → v${result.to}`);
      }
    } catch (e) {
      console.error("[App] Migration failed:", e);
    }

    // 2. 应用主题
    this.applyTheme();

    // 3. 判断初始视图
    const onboardDone = storage.getRaw(KEYS.ONBOARD_DONE);
    const hasChats = store.getState().chats?.length > 0;
    this.view = onboardDone || hasChats ? "app" : "landing";

    // 4. 订阅状态变化，自动重渲染
    store.subscribe(() => this.render());
    events.on(EVT.STATE_CHANGE, () => this.render());
    events.on(EVT.TOAST, (payload) => showToast(payload));
    events.on("rerender", () => this.render());

    // 5. 全局事件委托
    this.bindGlobalEvents();

    this.initialized = true;
    this.render();
  },

  // 渲染路由
  render() {
    const app = document.getElementById("app");
    if (!app) return;

    let html = "";
    switch (this.view) {
      case "landing":
        html = renderLanding();
        break;
      case "onboarding":
        html = renderOnboarding();
        break;
      case "app":
      default:
        html = renderAppShell();
        break;
    }
    app.innerHTML = html;

    // 渲染后处理
    if (this.view === "app") {
      this.afterRenderApp();
    }
  },

  afterRenderApp() {
    // 自动滚动到底部
    const msgBox = document.getElementById("chat-messages");
    if (msgBox) {
      msgBox.scrollTop = msgBox.scrollHeight;
    }
    // 聚焦输入框
    const input = document.getElementById("chat-input");
    if (input && !isSending()) {
      // 不自动聚焦，避免移动端键盘弹出
    }
  },

  applyTheme() {
    const s = store.getState().settings;
    document.documentElement.setAttribute("data-theme", s.theme || "light");
    document.documentElement.setAttribute("data-theme-preset", "mint");
  },

  bindGlobalEvents() {
    // 键盘事件
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        // 关闭弹窗
        document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
      }
    });
  },

  // ============================================================
  //  全局 API（供 HTML onclick 调用）
  // ============================================================

  // Landing
  startOnboarding() {
    resetOnboarding();
    this.view = "onboarding";
    this.render();
  },
  showMore() {
    showToast({ message: "更多介绍即将上线", type: "info" });
  },
  importBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await readFileAsText(file);
        const data = JSON.parse(text);
        store.importAll(data, "merge");
        showToast({ message: "备份导入成功", type: "success" });
        this.view = "app";
        this.render();
      } catch (err) {
        showToast({ message: "导入失败：文件格式错误", type: "error" });
      }
    };
    input.click();
  },
  selectTemplate(name) {
    const all = getSystemTemplates();
    const tpl = all.find((t) => t.name === name);
    if (tpl) {
      createFromTemplate(tpl);
      storage.setRaw(KEYS.ONBOARD_DONE, "1");
      this.view = "app";
      this.render();
    }
  },

  // Onboarding
  setOnboardGender(gender) {
    setOnboardGender(gender);
  },
  selectOnboardTemplate(name) {
    selectOnboardTemplate(name);
  },
  skipOnboarding() {
    const all = getSystemTemplates("female");
    if (all[0]) createFromTemplate(all[0]);
    storage.setRaw(KEYS.ONBOARD_DONE, "1");
    this.view = "app";
    this.render();
  },
  finishOnboarding() {
    const tpl = getOnboardSelection();
    if (tpl) {
      createFromTemplate(tpl);
      storage.setRaw(KEYS.ONBOARD_DONE, "1");
      this.view = "app";
      this.render();
    }
  },

  // App 导航
  switchTab(tab) {
    store.setActiveTab(tab);
    // 移动端：切换 tab 时隐藏聊天详情
    if (window.innerWidth < 768) {
      store.setProfileOpen(false);
    }
  },
  newChat() {
    this.startOnboarding();
  },
  selectChat(id) {
    store.selectChat(id);
    store.setProfileOpen(false);
  },
  deleteChat(id) {
    if (confirm("确定删除这个对话吗？此操作不可恢复。")) {
      store.deleteChat(id);
      showToast({ message: "对话已删除", type: "success" });
    }
  },
  backToList() {
    // 移动端返回列表
    store.selectChat(null);
  },
  setSearch(q) {
    store.setSearchQuery(q);
  },
  toggleProfile() {
    const s = store.getState();
    store.setProfileOpen(!s.ui.profileOpen);
  },

  // 聊天
  sendMessage() {
    const input = document.getElementById("chat-input");
    const text = input?.value?.trim();
    if (!text) return;
    input.value = "";
    this.autoGrowInput(input);
    sendMessage(text);
  },
  stopSend() {
    stopGeneration();
  },
  handleInputKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  },
  autoGrowInput(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  },
  copyMessage(index) {
    const chat = store.getCurrentChat();
    if (chat?.messages[index]) {
      copyMessage(chat.messages[index].text);
    }
  },
  rememberMessage(index) {
    const chat = store.getCurrentChat();
    if (chat?.messages[index]) {
      rememberMessage(chat, chat.messages[index]);
      showToast({ message: "已加入记忆", type: "success" });
    }
  },
  regenerateMessage(index) {
    regenerate(index);
  },
  editMessage(index) {
    const text = editMessage(index);
    const input = document.getElementById("chat-input");
    if (input && text) {
      input.value = text;
      this.autoGrowInput(input);
      input.focus();
    }
  },
  deleteMessage(index) {
    if (confirm("确定删除这条消息吗？")) {
      deleteMessage(index);
    }
  },
  exportChat(id) {
    const chat = store.getState().chats.find((c) => c.id === id);
    if (!chat) return;
    let md = `# ${chat.name} · 聊天记录\n\n`;
    chat.messages.forEach((m) => {
      const who = m.role === "me" ? "我" : chat.name;
      md += `**${who}**：${m.text}\n\n`;
    });
    downloadFile(`${chat.name || "chat"}.md`, md, "text/markdown");
    showToast({ message: "已导出", type: "success" });
  },

  // 动态
  setMomentsFilter(name) {
    // 简单实现：前端过滤
    showToast({ message: `筛选：${name}`, type: "info" });
  },
  toggleMomentLike(id) {
    toggleLike(id, "我");
  },
  commentMoment(id) {
    const text = prompt("写评论…");
    if (text?.trim()) {
      addComment(id, "me", text);
      showToast({ message: "评论已发布", type: "success" });
    }
  },

  // 设置
  openSettings(section) {
    const s = store.getState();
    const presets = getApiPresets();
    const content = `
      <div style="display:flex;flex-direction:column;gap:20px;">
        <div>
          <label style="font-size:13px;font-weight:600;margin-bottom:8px;display:block;">API 预设</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${presets.map((p) => `
              <button class="chip ${s.settings.apiPresetId === p.id ? "chip-active" : ""}" onclick="window.EchoApp.applyPreset('${p.id}')">${esc(p.name)}</button>
            `).join("")}
          </div>
        </div>
        <div>
          <label style="font-size:13px;font-weight:600;margin-bottom:8px;display:block;">接口地址</label>
          <input class="input" id="set-baseurl" value="${esc(s.settings.baseUrl)}" />
        </div>
        <div>
          <label style="font-size:13px;font-weight:600;margin-bottom:8px;display:block;">API Key</label>
          <input class="input" id="set-apikey" type="password" value="${esc(s.settings.apiKey)}" placeholder="sk-..." />
        </div>
        <div>
          <label style="font-size:13px;font-weight:600;margin-bottom:8px;display:block;">模型</label>
          <input class="input" id="set-model" value="${esc(s.settings.model)}" />
        </div>
        <div>
          <label style="font-size:13px;font-weight:600;margin-bottom:8px;display:block;">温度：${s.settings.temperature}</label>
          <input type="range" class="slider" id="set-temp" min="0" max="2" step="0.1" value="${s.settings.temperature}" oninput="document.getElementById('temp-val').textContent=this.value" />
          <span id="temp-val">${s.settings.temperature}</span>
        </div>
        <div>
          <label style="font-size:13px;font-weight:600;margin-bottom:8px;display:block;">主题</label>
          <div style="display:flex;gap:8px;">
            <button class="chip ${s.settings.theme === "light" ? "chip-active" : ""}" onclick="window.EchoApp.setTheme('light')">亮色</button>
            <button class="chip ${s.settings.theme === "dark" ? "chip-active" : ""}" onclick="window.EchoApp.setTheme('dark')">暗色</button>
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-top:8px;">
          <button class="btn btn-secondary" onclick="window.EchoApp.exportAll()">导出全部数据</button>
          <button class="btn btn-secondary" onclick="window.EchoApp.importAll()">导入备份</button>
        </div>
      </div>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">取消</button>
      <button class="btn btn-primary" onclick="window.EchoApp.saveSettings()">保存设置</button>
    `;
    openModal({ title: "全局设置", content, footer });
  },
  applyPreset(id) {
    const preset = findPreset(id);
    if (preset) {
      store.updateSettings({
        apiPresetId: id,
        baseUrl: preset.baseUrl,
        model: preset.model,
        apiKey: preset.apiKey || store.getState().settings.apiKey,
      });
      this.applyTheme();
      showToast({ message: `已切换到 ${preset.name}`, type: "success" });
      // 重新渲染弹窗
      document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
      this.openSettings();
    }
  },
  saveSettings() {
    const baseUrl = document.getElementById("set-baseurl")?.value;
    const apiKey = document.getElementById("set-apikey")?.value;
    const model = document.getElementById("set-model")?.value;
    const temperature = parseFloat(document.getElementById("set-temp")?.value || "1");
    store.updateSettings({ baseUrl, apiKey, model, temperature });
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    showToast({ message: "设置已保存", type: "success" });
  },
  setTheme(theme) {
    store.updateSettings({ theme });
    this.applyTheme();
  },
  openChatSettings() {
    showToast({ message: "聊天设置开发中", type: "info" });
  },
  openPromptPreview() {
    const chat = store.getCurrentChat();
    if (!chat) {
      showToast({ message: "请先选择一个对话", type: "info" });
      return;
    }
    const persona = (chat.config?.persona || store.getState().global.persona || "").slice(0, 500);
    openModal({
      title: "Prompt 结构预览",
      content: `<div style="font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-all;">${esc(persona)}</div>`,
    });
  },
  uploadMyAvatar() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      // 简化：直接存 dataURL
      const reader = new FileReader();
      reader.onload = () => {
        store.updateSettings({ myAvatar: reader.result });
        showToast({ message: "头像已更新", type: "success" });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  },
  toggleTTS() {
    const s = store.getState();
    store.updateSettings({ ttsEnabled: !s.settings.ttsEnabled });
    showToast({ message: s.settings.ttsEnabled ? "朗读已关闭" : "朗读已开启", type: "info" });
  },
  toggleSTT() {
    showToast({ message: "语音输入开发中", type: "info" });
  },
  exportAll() {
    const data = store.exportAll();
    downloadFile(`echodownload-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
    showToast({ message: "已导出全部数据", type: "success" });
  },
  importAll() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await readFileAsText(file);
        const data = JSON.parse(text);
        store.importAll(data, "merge");
        showToast({ message: "导入成功", type: "success" });
      } catch (err) {
        showToast({ message: "导入失败", type: "error" });
      }
    };
    input.click();
  },
};

// 暴露到全局
window.EchoApp = App;

// 启动
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => App.init());
} else {
  App.init();
}

export default App;
