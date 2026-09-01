// ============================================================
//  EchoChat Rebuild · Main Entry
//  应用初始化、路由、事件绑定、全局 API
// ============================================================

import { store } from "./core/store.js";
import { events, EVT } from "./core/events.js";
import { runMigrations, storage, KEYS } from "./core/storage.js";
import { uid, esc, downloadFile, readFileAsText } from "./core/utils.js";
import { APP_VERSION } from "./core/version.js";
import { sendMessage, stopGeneration, regenerate, editMessage, deleteMessage, copyMessage, isSending, buildSystemPrompt } from "./domain/chat.js";
import { createFromTemplate, getSystemTemplates, buildCharacterCard, importCharacter } from "./domain/persona.js";
import { rememberMessage, addMemory, deleteMemory } from "./domain/memory.js";
import { listMoments, toggleLike, addComment } from "./domain/moments.js";
import { getApiPresets, findPreset } from "./domain/provider.js";
import { continueCharacter as continueCharacterHub, startConversationForCharacter } from "./domain/character-hub.js";
import { Character } from "./domain/character.js";
import {
  renderLanding,
  renderOnboarding,
  renderAppShell,
  setOnboardGender,
  selectOnboardTemplate,
  getOnboardSelection,
  resetOnboarding,
} from "./ui/views/index.js";
import { showToast, openModal, closeModal, openConfirm, Icons, SettingRow, Segmented } from "./ui/components/index.js";
import { reconstructionModalMarkup } from "./ui/views/reconstruction.js";
import { memoryReviewMarkup } from "./ui/views/memory-review.js";
import {
  extractMemoryCandidates,
  setCandidateAccepted,
  editCandidateText,
  confirmMemoryCandidates,
} from "./domain/memory-candidates.js";
import {
  buildReconstructionDraft,
  buildDraftFromConversation,
  setDraftCharacterSpeaker,
  setDraftName,
  setFindingAccepted,
  editFindingText,
  confirmReconstruction,
} from "./domain/reconstruction/index.js";

// 应用状态
const App = {
  view: "landing", // landing | onboarding | app
  initialized: false,

  // 初始化
  async init() {
    // 0. 启动 Logo 动画（与数据加载并行，至少 800ms）
    this.startSplashAnimation();

    // 1. 运行数据迁移（安全迁移：失败不破坏原始数据）
    try {
      const result = runMigrations();
      if (result.migrated) {
        console.log(`[App] Data migrated v${result.from} → v${result.to}`);
      }
    } catch (e) {
      console.error("[App] Migration failed:", e);
      events.emit(EVT.TOAST, { message: "数据迁移遇到问题，已保留原始数据", type: "warning" });
    }

    // 1.5 Stage 1-3: migrate Message/Conversation/Character into Dexie, then hydrate runtime cache
    const storageReady = import("./domain/message-store.js")
      .then(({ messageStore }) => messageStore.bootstrapStorage(store.getState().currentChatId))
      .then(() => {
        events.emit("rerender");
      })
      .catch((e) => console.warn("[App] Dexie storage bootstrap skipped:", e.message));
    this._storageReady = storageReady;

    // 2. 注册 Service Worker + 监听更新
    this.registerServiceWorker();

    // 3. 应用主题
    this.applyTheme();

    // 4. 判断初始视图
    const onboardDone = storage.getRaw(KEYS.ONBOARD_DONE);
    const hasChats = store.getState().chats?.length > 0;
    this.view = onboardDone || hasChats ? "app" : "landing";

    // 5. 订阅状态变化，自动重渲染
    store.subscribe(() => this.render());
    events.on(EVT.STATE_CHANGE, () => this.render());
    events.on(EVT.TOAST, (payload) => showToast(payload));
    events.on("rerender", () => this.render());

    // 6. 全局事件委托
    this.bindGlobalEvents();
    this.initialized = true;

    // 7. 等待 splash 动画完成后渲染（若 Dexie hydrate 仍在进行则再等一会）
    setTimeout(async () => {
      try {
        await this._storageReady;
      } catch (e) {
        console.warn("[App] storage ready failed:", e.message);
      }
      this.finishSplashAnimation();
      this.render();
    }, 800);
  },

  // Logo 启动动画
  startSplashAnimation() {
    const splash = document.getElementById("splash-screen");
    if (!splash) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) splash.classList.add("splash-reduced");
    splash.classList.add("splash-active");
  },
  finishSplashAnimation() {
    const splash = document.getElementById("splash-screen");
    if (!splash) return;
    splash.classList.add("splash-exit");
    setTimeout(() => splash.remove(), 400);
  },

  // Service Worker 注册 + 更新检测
  registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        console.log(`[SW] registered, app version: ${APP_VERSION}`);
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              this.showUpdatePrompt();
            }
          });
        });
        setInterval(() => reg.update().catch(() => {}), 3600000);
      })
      .catch((err) => console.warn("[SW] registration failed:", err));

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      console.log("[SW] controller changed");
    });
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_UPDATED") {
        console.log(`[SW] updated to v${event.data.version}`);
      }
    });
  },

  // 显示更新提示
  showUpdatePrompt() {
    openConfirm({
      title: "发现新版本",
      message: "EchoChat 已更新到新版本，是否立即刷新？你的所有数据都会保留。",
      confirmText: "立即更新",
      cancelText: "稍后再说",
      variant: "primary",
      onConfirm: () => {
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage("SKIP_WAITING");
        }
        setTimeout(() => location.reload(), 300);
      },
    });
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
    // 智能滚动：仅当用户接近底部时自动滚动到底部
    const msgBox = document.getElementById("chat-messages");
    if (msgBox) {
      const nearBottom = msgBox.scrollHeight - msgBox.scrollTop - msgBox.clientHeight < 120;
      if (nearBottom || msgBox.scrollTop === 0) {
        msgBox.scrollTop = msgBox.scrollHeight;
      }
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
        import("./domain/message-store.js")
          .then(({ messageStore }) => messageStore.bootstrapStorage(store.getState().currentChatId))
          .catch(() => {});
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
  resetOnboarding() {
    resetOnboarding();
    storage.remove(KEYS.ONBOARD_DONE);
    this.view = "landing";
    this.render();
    showToast({ message: "已返回引导页", type: "info" });
  },

  // App 导航
  switchTab(tab) {
    store.setActiveTab(tab);
    if (window.innerWidth < 768) {
      store.setProfileOpen(false);
    }
  },
  selectCharacter(id) {
    store.setSelectedCharacter(id);
    store.setActiveTab("characters");
  },
  backToCharacterList() {
    store.setSelectedCharacter(null);
  },
  continueCharacter(id) {
    const chat = continueCharacterHub(id);
    if (chat?.id) {
      import("./domain/message-store.js")
        .then(({ messageStore }) => messageStore.hydrateChat(chat.id))
        .then(() => this.render())
        .catch(() => this.render());
    }
  },
  startNewConversation(id) {
    startConversationForCharacter(id).then((chat) => {
      if (chat?.id) {
        import("./domain/message-store.js")
          .then(({ messageStore }) => messageStore.hydrateChat(chat.id))
          .then(() => this.render())
          .catch(() => this.render());
      }
    });
  },
  openConversation(id) {
    this.selectChat(id);
    store.setActiveTab("messages");
  },
  importCharacterCard() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await readFileAsText(file);
        const result = await importCharacter(text);
        if (!result.ok) {
          showToast({ message: "无法解析角色卡", type: "error" });
          return;
        }
        store.setSelectedCharacter(result.characterId);
        store.setActiveTab("characters");
        this.view = "app";
        this.render();
        showToast({ message: "角色已导入", type: "success" });
      } catch (err) {
        showToast({ message: "导入失败", type: "error" });
      }
    };
    input.click();
  },
  exportCharacterCard(characterId) {
    const chat = store.getState().chats.find((c) => c.roleId === characterId) || store.getCurrentChat();
    if (!chat) {
      showToast({ message: "没有可导出的角色", type: "info" });
      return;
    }
    const card = buildCharacterCard(chat);
    downloadFile(`${chat.name || "character"}.json`, JSON.stringify(card, null, 2));
    showToast({ message: "角色卡已导出", type: "success" });
  },
  editCharacter(characterId) {
    const chat = store.getState().chats.find((c) => c.roleId === characterId);
    const name = chat?.name || "";
    const persona = chat?.config?.persona || "";
    const personaStr = typeof persona === "string" ? persona : (persona.persona || "");
    openModal({
      title: "编辑角色",
      content: `
        <div style="display:flex;flex-direction:column;gap:12px;">
          <label style="font-size:13px;font-weight:600;">名字</label>
          <input class="input" id="edit-char-name" value="${esc(name)}" />
          <label style="font-size:13px;font-weight:600;">她是谁</label>
          <textarea class="input" id="edit-char-identity" rows="6" style="min-height:120px;">${esc(personaStr)}</textarea>
        </div>
      `,
      footer: `
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="window.EchoApp.saveCharacterEdit('${characterId}')">保存</button>
      `,
    });
  },
  saveCharacterEdit(characterId) {
    const name = document.getElementById("edit-char-name")?.value?.trim();
    const identity = document.getElementById("edit-char-identity")?.value || "";
    Character.updateCharacter(characterId, {
      name: name || undefined,
      identity,
      personality: { description: identity },
    }).then(() => {
      const chats = store.getState().chats.filter((c) => c.roleId === characterId);
      chats.forEach((c) => {
        store.updateChat(c.id, {
          name: name || c.name,
          config: { ...c.config, persona: identity },
        });
      });
      document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
      showToast({ message: "角色已更新", type: "success" });
    });
  },
  addCharacterMemory(characterId) {
    const input = document.getElementById("hub-memory-input");
    const text = input?.value?.trim();
    if (!text) return;
    addMemory(characterId, text, 6, "manual");
    if (input) input.value = "";
    showToast({ message: "已记下", type: "success" });
  },
  deleteCharacterMemory(characterId, memoryId) {
    deleteMemory(characterId, memoryId);
  },
  newChat() {
    this.startOnboarding();
  },
  selectChat(id) {
    store.selectChat(id);
    store.setProfileOpen(false);
    import("./domain/message-store.js")
      .then(({ messageStore }) => messageStore.hydrateChat(id))
      .then(() => this.render())
      .catch(() => {});
  },
  deleteChat(id) {
    const chat = store.getState().chats.find((c) => c.id === id);
    openConfirm({
      title: "删除对话",
      message: `确定删除与「${chat?.name || "此角色"}」的对话吗？所有聊天记录将被永久删除，此操作不可恢复。`,
      confirmText: "删除",
      cancelText: "取消",
      variant: "danger",
      onConfirm: () => {
        import("./domain/conversation.js")
          .then(({ deleteConversation }) => deleteConversation(id))
          .then(() => showToast({ message: "对话已删除", type: "success" }))
          .catch(() => {
            store.deleteChat(id);
            showToast({ message: "对话已删除", type: "success" });
          });
      },
    });
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
    import("./domain/message-store.js").then(({ peekMessages }) => {
      const msg = peekMessages(chat?.id)?.[index];
      if (msg) copyMessage(msg.text);
    });
  },
  rememberMessage(index) {
    const chat = store.getCurrentChat();
    import("./domain/message-store.js").then(({ peekMessages }) => {
      const msg = peekMessages(chat?.id)?.[index];
      if (msg) {
        rememberMessage(chat, msg);
        showToast({ message: "已加入记忆", type: "success" });
      }
    });
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
    openConfirm({
      title: "删除消息",
      message: "确定删除这条消息吗？此操作不可恢复。",
      confirmText: "删除",
      cancelText: "取消",
      variant: "danger",
      onConfirm: () => {
        deleteMessage(index);
        showToast({ message: "消息已删除", type: "success" });
      },
    });
  },
  retryFromMessage(index) {
    const chat = store.getCurrentChat();
    if (!chat) return;
    import("./domain/message-store.js").then(async ({ peekMessages, truncateMessages }) => {
      const msgs = peekMessages(chat.id);
      let userText = null;
      for (let i = index - 1; i >= 0; i--) {
        if (msgs[i]?.role === "me") {
          userText = msgs[i].text;
          break;
        }
      }
      if (!userText) {
        showToast({ message: "无法重试，请重新发送", type: "info" });
        return;
      }
      await truncateMessages(chat.id, index);
      sendMessage(userText);
    });
  },
  exportChat(id) {
    const chat = store.getState().chats.find((c) => c.id === id);
    if (!chat) return;
    import("./domain/message-store.js").then(({ peekMessages }) => {
      const messages = peekMessages(id);
      let md = `# ${chat.name} · 聊天记录\n\n`;
      messages.forEach((m) => {
        const who = m.role === "me" ? "我" : chat.name;
        md += `**${who}**：${m.text}\n\n`;
      });
      downloadFile(`${chat.name || "chat"}.md`, md, "text/markdown");
      showToast({ message: "已导出", type: "success" });
    });
  },

  // 动态
  setMomentsFilter(value) {
    store.setMomentsFilter(value);
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
      <div class="settings-modal">
        <div class="settings-group">
          <div class="settings-group-title">API 与模型</div>
          <div class="settings-group-body">
            <div class="setting-row" style="cursor:default;flex-direction:column;align-items:stretch;gap:8px;">
              <div style="font-size:13px;font-weight:600;color:var(--color-text-secondary);">API 预设</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${presets.map((p) => `
                  <button class="chip ${s.settings.apiPresetId === p.id ? "chip-active" : ""}" onclick="window.EchoApp.applyPreset('${p.id}')">${esc(p.name)}</button>
                `).join("")}
              </div>
            </div>
            <div class="setting-row" style="cursor:default;flex-direction:column;align-items:stretch;gap:8px;">
              <label style="font-size:13px;font-weight:600;color:var(--color-text-secondary);">接口地址</label>
              <input class="input" id="set-baseurl" value="${esc(s.settings.baseUrl)}" placeholder="https://api.example.com/v1" />
            </div>
            <div class="setting-row" style="cursor:default;flex-direction:column;align-items:stretch;gap:8px;">
              <label style="font-size:13px;font-weight:600;color:var(--color-text-secondary);">API Key</label>
              <input class="input" id="set-apikey" type="password" value="${esc(s.settings.apiKey)}" placeholder="sk-..." autocomplete="off" />
            </div>
            <div class="setting-row" style="cursor:default;flex-direction:column;align-items:stretch;gap:8px;">
              <label style="font-size:13px;font-weight:600;color:var(--color-text-secondary);">模型</label>
              <input class="input" id="set-model" value="${esc(s.settings.model)}" placeholder="model-name" />
            </div>
            <div class="setting-row" style="cursor:default;flex-direction:column;align-items:stretch;gap:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <label style="font-size:13px;font-weight:600;color:var(--color-text-secondary);">温度</label>
                <span id="temp-val" style="font-size:13px;font-weight:600;color:var(--color-primary);">${s.settings.temperature}</span>
              </div>
              <input type="range" class="slider" id="set-temp" min="0" max="2" step="0.1" value="${s.settings.temperature}" oninput="document.getElementById('temp-val').textContent=this.value" />
            </div>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-title">外观</div>
          <div class="settings-group-body">
            <div class="setting-row" style="cursor:default;">
              <div class="setting-row-icon">${Icons.palette}</div>
              <div class="setting-row-content">
                <div class="setting-row-title">主题模式</div>
                <div class="setting-row-desc">选择亮色或暗色界面</div>
              </div>
              <div class="setting-row-right">
                <div style="display:flex;gap:6px;">
                  <button class="chip ${s.settings.theme === "light" ? "chip-active" : ""}" onclick="window.EchoApp.setTheme('light')">亮色</button>
                  <button class="chip ${s.settings.theme === "dark" ? "chip-active" : ""}" onclick="window.EchoApp.setTheme('dark')">暗色</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-title">数据管理</div>
          <div class="settings-group-body">
            ${SettingRow({ icon: Icons.download, title: "导出全部数据", desc: "JSON 格式全量备份，包含对话、记忆、设置", onClick: "window.EchoApp.exportAll()" })}
            ${SettingRow({ icon: Icons.upload, title: "导入备份", desc: "从 JSON 备份文件恢复数据", onClick: "window.EchoApp.importAll()" })}
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-title" style="color:var(--color-error);">危险操作</div>
          <div class="settings-group-body">
            ${SettingRow({ icon: Icons.trash, title: "清空所有对话", desc: "删除全部聊天记录，保留设置与记忆", onClick: "window.EchoApp.clearAllChats()" })}
            ${SettingRow({ icon: Icons.warning, title: "重置应用", desc: "清除所有数据并恢复初始状态", onClick: "window.EchoApp.resetApp()" })}
          </div>
        </div>
      </div>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">取消</button>
      <button class="btn btn-primary" onclick="window.EchoApp.saveSettings()">保存设置</button>
    `;
    openModal({ title: "设置", content, footer, width: "520px" });
  },
  clearAllChats() {
    openConfirm({
      title: "清空所有对话",
      message: "确定要删除全部聊天记录吗？此操作不可恢复，角色记忆和设置将保留。",
      confirmText: "清空对话",
      cancelText: "取消",
      variant: "danger",
      onConfirm: () => {
        const ids = (store.getState().chats || []).map((c) => c.id);
        import("./domain/conversation.js")
          .then(async ({ deleteConversation }) => {
            for (const id of ids) {
              await deleteConversation(id);
            }
          })
          .finally(() => {
            store.set((s) => ({ ...s, chats: [], currentChatId: null }));
            showToast({ message: "所有对话已清空", type: "success" });
          });
      },
    });
  },
  resetApp() {
    openConfirm({
      title: "重置应用",
      message: "确定要重置 EchoChat 吗？所有对话、记忆、设置和个人配置将被永久删除，此操作不可恢复。建议先导出备份。",
      confirmText: "全部重置",
      cancelText: "取消",
      variant: "danger",
      onConfirm: () => {
        storage.clearAll();
        store.reset();
        showToast({ message: "应用已重置", type: "success" });
        setTimeout(() => location.reload(), 800);
      },
    });
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
    const persona = buildSystemPrompt(chat) || "";
    openModal({
      title: "Prompt 结构预览",
      content: `<div style="font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-all;">${esc(persona.slice(0, 4000) || "（空）")}</div>`,
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
        import("./domain/message-store.js")
          .then(({ messageStore }) => messageStore.bootstrapStorage(store.getState().currentChatId))
          .catch(() => {});
        showToast({ message: "导入成功", type: "success" });
      } catch (err) {
        showToast({ message: "导入失败", type: "error" });
      }
    };
    input.click();
  },

  _recon: { overlay: null, step: "paste", pasteText: "", draft: null, error: "", sourceChatId: null },

  openReconstruction() {
    closeModal(this._recon?.overlay);
    this._recon = { overlay: null, step: "paste", pasteText: "", draft: null, error: "", sourceChatId: null };
    this._paintReconstruction();
  },
  openReconstructionFromChat(chatId) {
    closeModal(this._recon?.overlay);
    const built = buildDraftFromConversation(chatId);
    if (!built.ok) {
      showToast({
        message: built.error === "no-messages" ? "这段对话还没有可解析的消息" : "无法从这段对话重建",
        type: "info",
      });
      return;
    }
    this._recon = {
      overlay: null,
      step: "review",
      pasteText: "",
      draft: built.draft,
      error: "",
      sourceChatId: chatId,
    };
    this._paintReconstruction();
  },
  _paintReconstruction() {
    const spec = reconstructionModalMarkup(this._recon);
    if (this._recon.overlay?.isConnected) {
      const title = this._recon.overlay.querySelector(".modal-title");
      const body = this._recon.overlay.querySelector(".modal-body");
      const footer = this._recon.overlay.querySelector(".modal-footer");
      const modal = this._recon.overlay.querySelector(".modal");
      if (title) title.textContent = spec.title;
      if (body) body.innerHTML = spec.content;
      if (footer) footer.innerHTML = spec.footer;
      if (modal && spec.width) modal.style.maxWidth = spec.width;
      return;
    }
    this._recon.overlay = openModal(spec);
  },
  _closeReconstruction() {
    closeModal(this._recon.overlay);
    this._recon = { overlay: null, step: "paste", pasteText: "", draft: null, error: "", sourceChatId: null };
  },
  _captureReconstructionEdits() {
    if (!this._recon.draft) return;
    const nameEl = document.getElementById("recon-name");
    if (nameEl) this._recon.draft = setDraftName(this._recon.draft, nameEl.value);
    for (const f of this._recon.draft.findings || []) {
      const el = document.getElementById(`recon-text-${f.id}`);
      if (el) this._recon.draft = editFindingText(this._recon.draft, f.id, el.value);
    }
  },
  reconstructionParse() {
    const el = document.getElementById("recon-paste");
    const text = el ? el.value : this._recon.pasteText;
    this._recon.pasteText = text;
    const built = buildReconstructionDraft(text);
    if (!built.ok) {
      this._recon.error =
        built.error === "empty" ? "请先粘贴聊天记录。" : "没有识别到「名字: 内容」格式的对话。角色卡 JSON 请走导入角色卡。";
      this._recon.step = "paste";
      this._paintReconstruction();
      return;
    }
    this._recon.draft = built.draft;
    this._recon.error = "";
    this._recon.step = "review";
    this._paintReconstruction();
  },
  reconstructionLoadFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,text/plain";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        this._recon.pasteText = await readFileAsText(file);
        this._recon.step = "paste";
        this._recon.error = "";
        this._paintReconstruction();
      } catch (err) {
        showToast({ message: "无法读取文件", type: "error" });
      }
    };
    input.click();
  },
  reconstructionSetSpeaker(name) {
    this._captureReconstructionEdits();
    this._recon.draft = setDraftCharacterSpeaker(this._recon.draft, name);
    this._paintReconstruction();
  },
  reconstructionSetName(name) {
    this._recon.draft = setDraftName(this._recon.draft, name);
  },
  reconstructionToggleFinding(id, accepted) {
    this._recon.draft = setFindingAccepted(this._recon.draft, id, accepted);
  },
  reconstructionEditFinding(id, text) {
    this._recon.draft = editFindingText(this._recon.draft, id, text);
  },
  reconstructionBack() {
    this._captureReconstructionEdits();
    this._recon.step = "paste";
    this._recon.error = "";
    this._paintReconstruction();
  },
  async reconstructionConfirm() {
    this._captureReconstructionEdits();
    if (!this._recon.draft) return;
    try {
      const result = await confirmReconstruction(this._recon.draft);
      if (!result.ok) {
        this._recon.error = "创建失败，请检查记录后再试。";
        this._paintReconstruction();
        return;
      }
      this._closeReconstruction();
      storage.setRaw(KEYS.ONBOARD_DONE, "1");
      this.view = "app";
      store.setSelectedCharacter(result.characterId);
      store.setActiveTab("characters");
      this.render();
      showToast({
        message: result.insufficient ? "角色已创建。部分设定仍需你补充。" : "角色已从聊天记录重建",
        type: "success",
      });
    } catch (err) {
      showToast({ message: "创建失败", type: "error" });
    }
  },

  _mem: { overlay: null, characterId: null, chatId: null, candidates: [], notice: "", error: "" },

  openMemoryCandidates(characterId, chatId) {
    closeModal(this._mem?.overlay);
    const extracted = extractMemoryCandidates(characterId, chatId ? { chatId } : {});
    this._mem = {
      overlay: null,
      characterId,
      chatId: chatId || null,
      candidates: extracted.candidates || [],
      notice: extracted.notice || "",
      error: extracted.ok ? "" : "无法提取记忆",
    };
    const spec = memoryReviewMarkup(this._mem);
    this._mem.overlay = openModal(spec);
  },
  _paintMemoryReview() {
    const spec = memoryReviewMarkup(this._mem);
    if (!this._mem.overlay?.isConnected) {
      this._mem.overlay = openModal(spec);
      return;
    }
    const title = this._mem.overlay.querySelector(".modal-title");
    const body = this._mem.overlay.querySelector(".modal-body");
    const footer = this._mem.overlay.querySelector(".modal-footer");
    if (title) title.textContent = spec.title;
    if (body) body.innerHTML = spec.content;
    if (footer) footer.innerHTML = spec.footer;
  },
  _captureMemoryEdits() {
    this._mem.candidates = (this._mem.candidates || []).map((c) => {
      const el = document.getElementById(`mem-text-${c.id}`);
      return el ? { ...c, text: el.value } : c;
    });
  },
  memoryCandidateToggle(id, accepted) {
    this._mem.candidates = setCandidateAccepted(this._mem.candidates, id, accepted);
  },
  memoryCandidateEdit(id, text) {
    this._mem.candidates = editCandidateText(this._mem.candidates, id, text);
  },
  memoryCandidateConfirm() {
    this._captureMemoryEdits();
    const postMoment = !!document.getElementById("mem-post-moment")?.checked;
    const result = confirmMemoryCandidates(this._mem.characterId, this._mem.candidates, { postMoment });
    closeModal(this._mem.overlay);
    this._mem = { overlay: null, characterId: null, chatId: null, candidates: [], notice: "", error: "" };
    this.render();
    if (!result.ok) {
      showToast({ message: "写入失败", type: "error" });
      return;
    }
    const bits = [];
    if (result.added) bits.push(`记下 ${result.added} 条`);
    if (result.skipped) bits.push(`跳过 ${result.skipped} 条`);
    if (result.momentId) bits.push("已发动态");
    showToast({ message: bits.join(" · ") || "没有新的记忆", type: result.added ? "success" : "info" });
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
