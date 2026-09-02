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
import { createFromTemplate, getSystemTemplates, buildCharacterCard, importCharacter, getRoleId } from "./domain/persona.js";
import { rememberMessage, addMemory, deleteMemory } from "./domain/memory.js";
import { listMoments, toggleLike, addComment } from "./domain/moments.js";
import { listBooks, addEntry, deleteEntry } from "./domain/worldbook.js";
import { getApiPresets, findPreset } from "./domain/provider.js";
import { continueCharacter as continueCharacterHub, startConversationForCharacter } from "./domain/character-hub.js";
import { Character } from "./domain/character.js";
import {
  renderLanding,
  renderOnboarding,
  renderAppShell,
  resetOnboarding,
  animateLanding,
} from "./ui/views/index.js";
import { showToast, openModal, closeModal, openConfirm, Icons, SettingRow, Segmented, Avatar } from "./ui/components/index.js";
import { Ambient } from "./ui/ambient.js";
import { resolveAmbientPolicy } from "./ui/ambient-policy.js";
import {
  THEME_PRESETS,
  PARTICLE_LEVELS,
  findThemePreset,
  activeThemeColors,
  isCustomTheme,
  applyTheme as applyThemeVars,
  watchSystemTheme,
} from "./ui/theme.js";
import { needsApiSetup } from "./domain/provider.js";
import { MAX_USER_MESSAGE_CHARS } from "./domain/reply-clean.js";
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
  _pendingSend: "",
  _tabAnim: false,
  _meScrollTop: 0,
  _lastRenderedView: null,
  _sendPulse: false,
  _chatDraft: "",

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

    // 3. 应用主题 + 背景氛围层
    Ambient.mount();
    this.applyTheme();
    watchSystemTheme(() => this.render());

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
    document.getElementById("splash-screen")?.remove();
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

    // 保存「我的」页滚动位置：innerHTML 替换会把它清零
    const meScroll = document.getElementById("me-scroll");
    if (meScroll) this._meScrollTop = meScroll.scrollTop;
    const chatInput = document.getElementById("chat-input");
    if (chatInput) this._chatDraft = chatInput.value;

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

    const enteringApp = this.view === "app" && this._lastRenderedView !== "app";
    this._lastRenderedView = this.view;

    this.syncAmbient();

    if (this.view === "app") {
      if (enteringApp) app.querySelector(".app-shell")?.classList.add("app-enter");
      if (this._tabAnim) {
        this._tabAnim = false;
        const shell = app.querySelector(".app-shell");
        shell?.classList.add("tab-enter");
        setTimeout(() => shell?.classList.remove("tab-enter"), 400);
      }
      this.afterRenderApp();
    } else {
      animateLanding();
    }

    this.bindRippleButtons();
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

    // 「我的」页回到离开时的位置，避免每次重渲染都跳回顶部
    const meScroll = document.getElementById("me-scroll");
    if (meScroll && this._meScrollTop) meScroll.scrollTop = this._meScrollTop;

    // 侧栏指示器跟随当前 Tab
    const rail = document.querySelector(".nav-rail");
    const indicator = rail?.querySelector(".nav-rail-indicator");
    const activeItem = rail?.querySelector(".nav-item-active");
    if (indicator && activeItem) {
      indicator.style.transform = `translateY(${activeItem.offsetTop}px)`;
    } else if (indicator) {
      indicator.style.opacity = "0";
    }

    if (this._sendPulse) {
      this._sendPulse = false;
      const btn = document.querySelector(".chat-send-btn");
      if (btn) {
        btn.classList.add("sent");
        setTimeout(() => btn.classList.remove("sent"), 420);
      }
    }

    this.bindMessageGestures();

    const input = document.getElementById("chat-input");
    if (input) {
      if (this._chatDraft) input.value = this._chatDraft;
      this.autoGrowInput(input);
      this.updateChatCount(input);
    }
  },

  bindRippleButtons() {
    document.querySelectorAll(".btn-primary").forEach((btn) => {
      if (btn.dataset.rippleBound) return;
      btn.dataset.rippleBound = "1";
      btn.addEventListener("pointerdown", (e) => {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty("--ripple-x", `${((e.clientX - r.left) / r.width) * 100}%`);
        btn.style.setProperty("--ripple-y", `${((e.clientY - r.top) / r.height) * 100}%`);
        btn.classList.add("ripple");
        setTimeout(() => btn.classList.remove("ripple"), 420);
      });
    });
  },

  // 移动端长按气泡呼出操作条（桌面端用 hover）
  bindMessageGestures() {
    if (window.innerWidth >= 768) return;
    document.querySelectorAll(".msg").forEach((msg) => {
      if (msg.dataset.gestureBound) return;
      msg.dataset.gestureBound = "1";
      let timer = null;
      const clear = () => {
        if (timer) clearTimeout(timer);
        timer = null;
      };
      msg.addEventListener(
        "touchstart",
        () => {
          clear();
          timer = setTimeout(() => {
            document.querySelectorAll(".msg.show-actions").forEach((m) => {
              if (m !== msg) m.classList.remove("show-actions");
            });
            msg.classList.add("show-actions");
          }, 480);
        },
        { passive: true }
      );
      msg.addEventListener("touchend", clear, { passive: true });
      msg.addEventListener("touchmove", clear, { passive: true });
    });
  },

  toggleMessageActions(btn) {
    const msg = btn.closest(".msg");
    if (!msg) return;
    document.querySelectorAll(".msg.show-actions").forEach((m) => {
      if (m !== msg) m.classList.remove("show-actions");
    });
    msg.classList.toggle("show-actions");
  },

  applyTheme() {
    applyThemeVars();
    this.syncAmbient();
  },

  syncAmbient() {
    const state = store.getState();
    const chatOpen =
      this.view === "app" && state.ui.activeTab === "companion" && !!state.currentChatId;
    const saveData =
      typeof navigator !== "undefined" && !!(navigator.connection && navigator.connection.saveData);
    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const policy = resolveAmbientPolicy({
      view: this.view,
      activeTab: state.ui.activeTab,
      chatOpen,
      userIntensity: state.settings.particleIntensity,
      viewportWidth: typeof window !== "undefined" ? window.innerWidth : 1024,
      prefersReducedMotion,
      saveData,
    });
    Ambient.setIntensity(policy.intensity);
    Ambient.setMode(policy.mode);
  },

  bindGlobalEvents() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
      }
    });
    let wide = typeof window !== "undefined" && window.innerWidth >= 1024;
    let compact = typeof window !== "undefined" && window.innerWidth < 768;
    window.addEventListener("resize", () => {
      const now = window.innerWidth >= 1024;
      const nowCompact = window.innerWidth < 768;
      if (now !== wide) {
        wide = now;
        this.render();
      } else if (nowCompact !== compact) {
        compact = nowCompact;
        this.syncAmbient();
      }
    });
    this.bindVisualViewport();
  },

  bindVisualViewport() {
    if (this._vvBound || typeof window === "undefined" || !window.visualViewport) return;
    this._vvBound = true;
    const sync = () => {
      const vv = window.visualViewport;
      const mobile = window.innerWidth < 768;
      if (!mobile) {
        document.documentElement.style.removeProperty("--app-height");
        document.documentElement.style.removeProperty("--vv-top");
        return;
      }
      document.documentElement.style.setProperty("--app-height", `${Math.round(vv.height)}px`);
      document.documentElement.style.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`);
    };
    window.visualViewport.addEventListener("resize", sync);
    window.visualViewport.addEventListener("scroll", sync);
    sync();
  },

  // ============================================================
  //  全局 API（供 HTML onclick 调用）
  // ============================================================

  // Landing — reconstruction is the primary path
  startOnboarding() {
    this.openReconstruction();
  },
  enterAppEmpty() {
    this._leaveLanding(() => {
      storage.setRaw(KEYS.ONBOARD_DONE, "1");
      this.view = "app";
      store.selectChat(null);
      store.setActiveTab("companion");
      this.render();
    });
  },

  // 落地页淡出后再切视图，避免硬切换
  _leaveLanding(next) {
    const landing = document.querySelector(".landing");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (this.view !== "landing" || !landing || reduced || landing.classList.contains("landing-exit")) {
      next();
      return;
    }
    landing.classList.add("landing-exit");
    setTimeout(next, 300);
  },
  showMore() {
    showToast({ message: "把聊天记录粘过来，就能认出 TA。", type: "info" });
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
  async selectTemplate(name) {
    const tpl = getSystemTemplates().find((t) => t.name === name);
    if (!tpl) return;
    try {
      const chat = await createFromTemplate(tpl);
      document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
      storage.setRaw(KEYS.ONBOARD_DONE, "1");
      this.view = "app";
      if (chat?.id) {
        store.selectChat(chat.id);
        store.setActiveTab("companion");
      }
      this.render();
      showToast({ message: `「${tpl.name}」已加入，可以开始聊了`, type: "success" });
    } catch (err) {
      showToast({ message: "创建失败", type: "error" });
    }
  },

  setOnboardGender() {},
  selectOnboardTemplate() {},
  skipOnboarding() {
    this.enterAppEmpty();
  },
  finishOnboarding() {
    this.openReconstruction();
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
    if (store.getState().ui.activeTab !== tab) this._tabAnim = true;
    if (tab !== "me") this._meScrollTop = 0;
    store.setActiveTab(tab);
    if (window.innerWidth < 768) {
      store.setProfileOpen(false);
    }
  },
  selectCharacter(id) {
    store.setSelectedCharacter(id);
    this.continueCharacter(id);
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
        store.setActiveTab("companion");
        this.view = "app";
        this.render();
        this.continueCharacter(result.characterId);
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
  _charDraftAvatar: null,
  editCharacter(characterId) {
    this._charDraftAvatar = null;
    this._paintCharacterEdit(characterId);
  },
  editCharacterFromChat() {
    const chat = store.getCurrentChat();
    const roleId = chat ? getRoleId(chat) : null;
    if (roleId) this.editCharacter(roleId);
  },
  _paintCharacterEdit(characterId) {
    const chat = store.getState().chats.find((c) => c.roleId === characterId);
    const name = document.getElementById("edit-char-name")?.value ?? chat?.name ?? "";
    const persona = chat?.config?.persona || "";
    const personaStr =
      document.getElementById("edit-char-identity")?.value ??
      (typeof persona === "string" ? persona : persona.persona || "");
    const scenario =
      document.getElementById("edit-char-scenario")?.value ?? chat?.config?.scenario ?? "";
    const examples =
      document.getElementById("edit-char-examples")?.value ?? chat?.config?.mesExample ?? "";
    const speaking =
      document.getElementById("edit-char-style")?.value ??
      (typeof chat?.config?.speakingStyle === "string" ? chat.config.speakingStyle : chat?.config?.speakingStyle?.notes || "");
    const avatar = this._charDraftAvatar || chat?.avatar;
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    openModal({
      title: "编辑角色",
      width: "440px",
      content: `
        ${this._avatarPickerMarkup(`char:${characterId}`, avatar, name)}
        <label class="field-label">名字</label>
        <input class="input" id="edit-char-name" value="${esc(name)}" />
        <label class="field-label">TA 是谁</label>
        <textarea class="input" id="edit-char-identity" rows="5" style="min-height:100px;">${esc(personaStr)}</textarea>
        <label class="field-label">情景（可选）</label>
        <textarea class="input" id="edit-char-scenario" rows="2">${esc(scenario)}</textarea>
        <label class="field-label">语气 / 说话方式（可选）</label>
        <textarea class="input" id="edit-char-style" rows="2">${esc(speaking)}</textarea>
        <label class="field-label">对话示例（可选）</label>
        <textarea class="input" id="edit-char-examples" rows="2">${esc(examples)}</textarea>
      `,
      footer: `
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="window.EchoApp.saveCharacterEdit('${characterId}')">保存</button>
      `,
    });
    this.bindRippleButtons();
  },
  saveCharacterEdit(characterId) {
    const name = document.getElementById("edit-char-name")?.value?.trim();
    const identity = document.getElementById("edit-char-identity")?.value || "";
    const scenario = document.getElementById("edit-char-scenario")?.value || "";
    const mesExample = document.getElementById("edit-char-examples")?.value || "";
    const speakingStyle = document.getElementById("edit-char-style")?.value || "";
    const avatar = this._charDraftAvatar;
    this._charDraftAvatar = null;
    Character.updateCharacter(characterId, {
      name: name || undefined,
      identity,
      personality: { description: identity, scenario, mesExample },
      speakingStyle: speakingStyle ? { notes: speakingStyle } : {},
      ...(avatar ? { avatar } : {}),
    }).then(() => {
      const chats = store.getState().chats.filter((c) => c.roleId === characterId);
      chats.forEach((c) => {
        store.updateChat(c.id, {
          name: name || c.name,
          ...(avatar ? { avatar } : {}),
          config: { ...c.config, persona: identity, scenario, mesExample, speakingStyle },
        });
      });
      document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
      this.render();
      showToast({ message: "角色已更新", type: "success" });
    });
  },

  _userDraftAvatar: null,
  openUserProfile() {
    this._userDraftAvatar = null;
    this._paintUserProfile();
  },
  _paintUserProfile() {
    const s = store.getState().settings;
    const name = document.getElementById("user-name")?.value ?? s.myName ?? "我";
    const userPersona = document.getElementById("user-persona")?.value ?? s.userPersona ?? "";
    const avatar = this._userDraftAvatar || s.myAvatar || "assets/avatars/user-default.svg";
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    openModal({
      title: "编辑资料",
      width: "420px",
      content: `
        ${this._avatarPickerMarkup("user", avatar, name)}
        <label class="field-label">昵称</label>
        <input class="input" id="user-name" value="${esc(name)}" placeholder="你的名字" maxlength="24" />
        <label class="field-label">我是谁（可选）</label>
        <textarea class="input" id="user-persona" rows="4" placeholder="角色会用这段来理解你。空着就不注入。">${esc(userPersona)}</textarea>
      `,
      footer: `
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="window.EchoApp.saveUserProfile()">保存</button>
      `,
    });
    this.bindRippleButtons();
  },
  saveUserProfile() {
    const name = document.getElementById("user-name")?.value?.trim();
    if (!name) {
      showToast({ message: "名字不能为空", type: "warning" });
      return;
    }
    const patch = { myName: name };
    if (this._userDraftAvatar) patch.myAvatar = this._userDraftAvatar;
    const userPersona = document.getElementById("user-persona")?.value ?? "";
    patch.userPersona = userPersona;
    this._userDraftAvatar = null;
    store.updateSettings(patch);
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    this.render();
    showToast({ message: "资料已保存", type: "success" });
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
    this.openBring();
  },
  openBring() {
    if (this.view === "landing") {
      this._leaveLanding(() => {
        storage.setRaw(KEYS.ONBOARD_DONE, "1");
        this.view = "app";
        this.render();
        this._paintBringModal();
      });
      return;
    }
    this._paintBringModal();
  },
  _paintBringModal() {
    const card = (icon, title, desc, onClick, featured) => `
      <button type="button" class="create-card ${featured ? "create-card-featured" : ""}" onclick="this.closest('.modal-overlay').remove();${onClick}">
        <span class="create-card-ic">${icon}</span>
        <span>
          <span class="create-card-title">${title}</span>
          <span class="create-card-desc">${desc}</span>
        </span>
      </button>`;
    openModal({
      title: "创建角色",
      width: "480px",
      content: `
        <p class="create-sub">从聊天记录、角色卡或一句话，把 TA 带进来。</p>
        <div class="create-cards">
          ${card(Icons.message, "导入聊天记录", "微信 / QQ 等导出的记录，或粘贴纯文本", "window.EchoApp.openReconstruction()", true)}
          ${card(Icons.upload, "导入角色卡", "SillyTavern 角色卡 JSON", "window.EchoApp.importCharacterCard()")}
          ${card(Icons.sparkles, "创建新人设", "填写名字与头像，可用一句话补全人设", "window.EchoApp.openCreateBlank()")}
          ${card(Icons.users, "从内置角色开始", "挑一个现成的性格，直接体验对话", "window.EchoApp.openTemplatePicker()")}
        </div>
        ${this._apiHintMarkup()}
      `,
      footer: `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">取消</button>`,
    });
  },
  // 创建角色不再要求先配 API，只在这里留一条可跳过的提示
  _apiHintMarkup() {
    if (!needsApiSetup()) return "";
    return `<div class="api-hint">
      <span>模型未配置 · 可先创建角色，发送消息前再连接</span>
      <button type="button" class="link-btn" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openSettings('api')">去配置</button>
    </div>`;
  },
  openTemplatePicker() {
    const templates = getSystemTemplates();
    openModal({
      title: "内置角色",
      width: "480px",
      content: `
        <p class="create-sub">挑一个现成的性格开始。之后随时可以改人设、换头像。</p>
        <div class="create-cards">
          ${templates
            .slice(0, 10)
            .map(
              (t) => `
            <button type="button" class="create-card" onclick="this.closest('.modal-overlay').remove();window.EchoApp.selectTemplate('${esc(t.name)}')">
              <span class="create-card-ic">${t.emoji || Icons.users}</span>
              <span>
                <span class="create-card-title">${esc(t.name)}</span>
                <span class="create-card-desc">${esc(t.tag || "")}${t.firstMessage ? ` · ${esc(t.firstMessage.slice(0, 24))}` : ""}</span>
              </span>
            </button>`
            )
            .join("")}
        </div>
      `,
      footer: `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openBring()">返回</button>`,
    });
  },
  _blankAvatar: null,
  openCreateBlank() {
    this._blankAvatar = null;
    this._paintCreateBlank();
  },
  _paintCreateBlank() {
    const name = document.getElementById("blank-char-name")?.value || "";
    const desc = document.getElementById("blank-char-desc")?.value || "";
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    openModal({
      title: "创建新人设",
      width: "440px",
      content: `
        <p class="create-sub">先填写 TA 的名字和头像；再用一句话描述性格与关系。</p>
        ${this._avatarPickerMarkup("blank", this._blankAvatar, name || "新角色")}
        <label class="field-label">名字</label>
        <input class="input" id="blank-char-name" placeholder="给 TA 起个名字" maxlength="32" value="${esc(name)}" />
        <label class="field-label">一句话描述（可选）</label>
        <textarea class="input" id="blank-char-desc" rows="3" placeholder="例如：她是咖啡店店员，不爱说话但会记得我的喜好。" style="min-height:88px;">${esc(desc)}</textarea>
      `,
      footer: `
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openBring()">返回</button>
        <button class="btn btn-primary" onclick="window.EchoApp.createBlankCharacter()">创建角色</button>
      `,
    });
    this.bindRippleButtons();
  },
  _avatarPickerMarkup(target, src, name) {
    const id = `avatar-pick-${target}`;
    return `<div class="avatar-picker">
      <label class="avatar-picker-btn" for="${id}">
        ${Avatar({ src, size: "lg", circle: true, alt: name || "头像", name })}
      </label>
      <span class="avatar-picker-hint">点击上传头像</span>
      <span class="avatar-picker-sub">支持 JPG、PNG，仅保存在本机</span>
      <input type="file" id="${id}" accept="image/jpeg,image/png,image/webp,image/gif" hidden onchange="window.EchoApp.pickAvatar(event,'${target}')" />
    </div>`;
  },
  pickAvatar(ev, target) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast({ message: "请选择图片文件", type: "warning" });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      showToast({ message: "图片请小于 4MB", type: "warning" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      if (target === "blank") {
        this._blankAvatar = url;
        this._paintCreateBlank();
      } else if (target === "user") {
        this._userDraftAvatar = url;
        this._paintUserProfile();
      } else if (target.startsWith("char:")) {
        this._charDraftAvatar = url;
        this._paintCharacterEdit(target.slice(5));
      }
    };
    reader.readAsDataURL(file);
  },
  async createBlankCharacter() {
    const name = document.getElementById("blank-char-name")?.value?.trim();
    const desc = document.getElementById("blank-char-desc")?.value?.trim() || "";
    if (!name) {
      showToast({ message: "先写个名字", type: "warning" });
      return;
    }
    try {
      const chat = await createFromTemplate({
        name,
        persona: desc || `${name}。`,
        firstMessage: "",
        avatar: this._blankAvatar || "assets/avatars/default.svg",
      });
      this._blankAvatar = null;
      document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
      storage.setRaw(KEYS.ONBOARD_DONE, "1");
      this.view = "app";
      if (chat?.id) {
        store.selectChat(chat.id);
        store.setActiveTab("companion");
      }
      this.render();
      showToast({ message: `「${name}」已创建，可以开始聊了`, type: "success" });
    } catch (err) {
      showToast({ message: "创建失败", type: "error" });
    }
  },
  openConversationSwitcher() {
    const chat = store.getCurrentChat();
    const roleId = chat?.roleId;
    if (!roleId) return;
    import("./domain/character-hub.js").then(({ listActiveConversations }) => {
      const convos = listActiveConversations(roleId);
      openModal({
        title: "相处线",
        width: "420px",
        content: `
          <p class="recon-lead">同一位 ${esc(chat.name || "TA")} 的不同聊天主题。记忆和关系共享。</p>
          ${convos.map((c) => `
            <button type="button" class="bring-opt ${c.id === chat.id ? "bring-opt-on" : ""}" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openConversation('${c.id}')">
              <span class="bring-opt-title">${esc(c.name || "日常相处")}</span>
              <span class="bring-opt-desc">${esc((c.lastPreview || "还没有聊过").slice(0, 48))}</span>
            </button>
          `).join("")}
        `,
        footer: `
          <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">关闭</button>
          <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove();window.EchoApp.startNewConversation('${roleId}')">新的相处线</button>
        `,
      });
    });
  },
  selectChat(id) {
    store.selectChat(id);
    store.setProfileOpen(window.innerWidth >= 1024);
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
    if (text.length > MAX_USER_MESSAGE_CHARS) {
      showToast({ message: `单条最多 ${MAX_USER_MESSAGE_CHARS} 字，请删短后再发`, type: "info" });
      this.updateChatCount(input);
      return;
    }
    input.value = "";
    this._chatDraft = "";
    this.autoGrowInput(input);
    this.updateChatCount(input);
    // 模型未配置时不报错，先收下这句话，连接完成后自动发出去
    if (needsApiSetup(store.getCurrentChat())) {
      this._pendingSend = text;
      this.openApiConnect();
      return;
    }
    this._sendPulse = true;
    return sendMessage(text);
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
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  },
  updateChatCount(el) {
    const cap = document.getElementById("chat-count");
    if (!cap) return;
    const n = el?.value?.length || 0;
    const over = n > MAX_USER_MESSAGE_CHARS;
    cap.hidden = false;
    cap.textContent = `${n} / ${MAX_USER_MESSAGE_CHARS}`;
    cap.classList.toggle("is-over", over);
  },
  onChatInput(el) {
    this.autoGrowInput(el);
    this._chatDraft = el?.value || "";
    this.updateChatCount(el);
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
  toggleMomentLike(id, btn) {
    // 心跳动画依赖当前 DOM 节点，先播再让 store 触发重渲染
    const heart = btn?.querySelector("svg");
    if (heart) {
      heart.classList.remove("like-pop");
      void heart.offsetWidth;
      heart.classList.add("like-pop");
    }
    toggleLike(id, "我");
  },
  commentMoment(id) {
    const input = document.getElementById(`cmt-${id}`);
    const text = input?.value?.trim();
    if (!text) {
      showToast({ message: "写一句评论", type: "info" });
      input?.focus();
      return;
    }
    if (input) input.value = "";
    addComment(id, "me", text);
    showToast({ message: "评论已发布", type: "success" });
  },
  addWorldbookEntry() {
    const keys = document.getElementById("wb-keys")?.value || "";
    const content = String(document.getElementById("wb-content")?.value || "").trim();
    if (!content) {
      showToast({ message: "先写一点设定", type: "warning" });
      return;
    }
    addEntry("global", {
      name: keys.split(",")[0]?.trim() || "条目",
      keys,
      content: content.slice(0, 1200),
    });
    this._paintSettings("worldbook");
    showToast({ message: "条目已添加", type: "success" });
  },
  deleteWorldbookEntry(bookId, entryId) {
    deleteEntry(bookId, entryId);
    this._paintSettings("worldbook");
  },

  // ============================================================
  //  设置：按分区打开，每层都能返回「我的」
  // ============================================================
  _apiMoreOpen: false,

  openSettings(section) {
    const sec = section || "api";
    if (sec === "api") {
      const presetId = store.getState().settings.apiPresetId;
      if (presetId && presetId !== "siliconflow") this._apiMoreOpen = true;
    }
    this._paintSettings(sec);
  },

  _paintSettings(section) {
    if (section === "api") this._apiSurface = "settings";
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const titles = {
      api: "API 与模型",
      memory: "记忆",
      appearance: "外观",
      backup: "备份",
      worldbook: "世界书",
      voice: "语音",
    };
    const s = store.getState();
    let content = "";
    let footer = `
      <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">返回</button>
      <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">完成</button>`;
    let width = "520px";

    if (section === "api") {
      content = this._apiSetupMarkup();
      footer = `
        <button class="btn btn-ghost" onclick="window.EchoApp.testApiConnection()">测试连接</button>
        <button class="btn btn-primary" onclick="window.EchoApp.saveSettings()">保存</button>`;
    } else if (section === "memory") {
      content = `
        <label class="field-label">每位角色最多记忆条数 · <span id="mem-max-val">${s.memoryCfg.maxPerRole}</span></label>
        <input type="range" class="slider" id="set-mem-max" min="10" max="100" step="5" value="${s.memoryCfg.maxPerRole}"
          oninput="document.getElementById('mem-max-val').textContent=this.value" />
        <p class="create-sub" style="margin-top:12px">超出后最旧的记忆会被归档，注入对话时优先取重要度高的。</p>
        <label class="field-label">每次对话最多注入 · <span id="mem-inject-val">${s.memoryCfg.injectMax}</span> 条</label>
        <input type="range" class="slider" id="set-mem-inject" min="3" max="30" step="1" value="${s.memoryCfg.injectMax}"
          oninput="document.getElementById('mem-inject-val').textContent=this.value" />`;
      footer = `
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">返回</button>
        <button class="btn btn-primary" onclick="window.EchoApp.saveMemorySettings()">保存</button>`;
    } else if (section === "appearance") {
      content = this._appearanceMarkup();
      footer = `<button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">完成</button>`;
    } else if (section === "backup") {
      content = `
        <div class="settings-group-body">
          ${SettingRow({ icon: Icons.download, title: "导出全部数据", desc: "JSON 全量备份，含对话、记忆、设置", onClick: "window.EchoApp.exportAll()" })}
          ${SettingRow({ icon: Icons.upload, title: "导入备份", desc: "从 JSON 备份文件恢复", onClick: "window.EchoApp.importAll()" })}
          ${SettingRow({ icon: Icons.trash, title: "清空所有对话", desc: "删除全部聊天记录，保留设置与记忆", onClick: "window.EchoApp.clearAllChats()" })}
          ${SettingRow({ icon: Icons.warning, title: "重置应用", desc: "清除所有数据并恢复初始状态", onClick: "window.EchoApp.resetApp()" })}
        </div>`;
      footer = `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">返回</button>`;
    } else if (section === "worldbook") {
      const books = listBooks();
      const global = books.find((b) => b.id === "global") || books[0];
      const entries = (global?.entries || []).slice(0, 24);
      content = `
        <p class="create-sub">提到关键词时，条目会注入当前对话。每条最多 1200 字。不改匹配规则。</p>
        <label class="field-label">关键词（逗号分隔）</label>
        <input class="input" id="wb-keys" placeholder="雨天, 咖啡馆" />
        <label class="field-label">设定</label>
        <textarea class="input" id="wb-content" rows="4" maxlength="1200" placeholder="只有提到关键词时才会用到。"></textarea>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="window.EchoApp.addWorldbookEntry()">添加条目</button>
        <div class="wb-list" style="margin-top:16px">
          ${entries.length
            ? entries
                .map(
                  (e) => `<div class="mem-line memory-row">
              <span class="memory-row-text"><b>${esc(e.name || (e.keys || []).join("、") || "条目")}</b>${
                    (e.keys || []).length ? ` · ${esc((e.keys || []).join("、"))}` : ""
                  }</span>
              <button type="button" class="memory-row-del" onclick="window.EchoApp.deleteWorldbookEntry('${global.id}','${e.id}')" aria-label="删除条目">${Icons.close}</button>
            </div>`
                )
                .join("")
            : `<p class="profile-muted">还没有条目。</p>`}
        </div>`;
      footer = `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">返回</button>`;
    } else if (section === "voice") {
      content = `
        <div class="settings-group-body">
          ${SettingRow({
            icon: Icons.volume,
            title: "朗读回复",
            desc: s.settings.ttsEnabled ? "已开启" : "已关闭",
            onClick: "window.EchoApp.toggleTTS();window.EchoApp.openSettings('voice')",
          })}
          ${SettingRow({ icon: Icons.mic, title: "语音输入", desc: "开发中", onClick: "window.EchoApp.toggleSTT()" })}
        </div>`;
      footer = `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">返回</button>`;
    }

    openModal({ title: titles[section] || "设置", content, footer, width });
    this.bindRippleButtons();
  },

  // API 配置块：默认只露出推荐服务商 + Key + 模型，其余收在「更多配置」里
  _apiSetupMarkup() {
    const s = store.getState().settings;
    const presets = getApiPresets();
    const ready = !needsApiSetup();
    const recommended = presets.find((p) => p.id === "siliconflow");
    const others = presets.filter((p) => p.id !== "siliconflow");
    const active = presets.find((p) => p.id === s.apiPresetId) || recommended;
    const stepsMarkup = (p) =>
      p?.keySteps?.length
        ? `<div class="key-steps">
            <strong>如何获取 API Key · ${esc(p.name)}</strong>
            <ol>${p.keySteps.map((st) => `<li>${esc(st)}</li>`).join("")}</ol>
            ${p.keyUrl ? `<a class="link-btn" href="${esc(p.keyUrl)}" target="_blank" rel="noreferrer noopener">前往获取</a>` : ""}
          </div>`
        : "";

    return `
      <div class="api-block ${ready ? "api-block-ready" : ""}">
        <div class="api-block-head">
          <h4>${esc(active?.name || "模型配置")}</h4>
          <span class="api-status">${ready ? "已就绪" : "未配置"}</span>
        </div>
        ${recommended && s.apiPresetId === "siliconflow"
          ? `<div class="api-hero">
              <div class="preset-card on">
                <span class="pn">${esc(recommended.name)}</span>
                <span class="pt">${esc(recommended.tag || "")}</span>
                <span class="pnote">${esc(recommended.note || "")}</span>
              </div>
            </div>
            ${stepsMarkup(recommended)}`
          : stepsMarkup(active)}
        <label class="field-label">API Key</label>
        <input class="input" id="set-apikey" type="password" value="${esc(s.apiKey)}" placeholder="sk-..." autocomplete="off" />
        <label class="field-label">模型</label>
        <input class="input" id="set-model" value="${esc(s.model)}" placeholder="例如 Qwen/Qwen2.5-7B-Instruct" />
        <button type="button" class="api-more-toggle" onclick="window.EchoApp.toggleApiMore()" aria-expanded="${this._apiMoreOpen}">
          <span>更多配置</span>
          <span class="sub">其他服务商 · 接口地址 · 温度</span>
        </button>
        <div class="api-more ${this._apiMoreOpen ? "open" : ""}">
          <label class="field-label">其他服务商</label>
          <div class="preset-grid">
            ${others
              .map(
                (p) => `<button type="button" class="preset-card ${s.apiPresetId === p.id ? "on" : ""}" onclick="window.EchoApp.applyPreset('${p.id}')">
                  <span class="pn">${esc(p.name)}</span>
                  <span class="pt">${esc(p.tag || "")}</span>
                  <span class="pnote">${esc(p.note || "")}</span>
                </button>`
              )
              .join("")}
          </div>
          <label class="field-label">接口地址</label>
          <input class="input" id="set-baseurl" value="${esc(s.baseUrl)}" placeholder="https://api.example.com/v1" />
          <label class="field-label">温度 · <span id="temp-val">${s.temperature}</span></label>
          <input type="range" class="slider" id="set-temp" min="0" max="2" step="0.1" value="${s.temperature}"
            oninput="document.getElementById('temp-val').textContent=this.value" />
        </div>
      </div>`;
  },

  _appearanceMarkup() {
    const s = store.getState().settings;
    const colors = activeThemeColors(s);
    const custom = isCustomTheme(s);
    const modes = [
      ["light", "亮色"],
      ["dark", "暗色"],
      ["auto", "跟随系统"],
    ];
    return `
      <label class="field-label">明暗模式</label>
      <div class="theme-chip-row">
        ${modes
          .map(([v, label]) => `<button type="button" class="chip ${s.theme === v ? "chip-active" : ""}" onclick="window.EchoApp.setTheme('${v}')">${label}</button>`)
          .join("")}
      </div>
      <label class="field-label">颜色预设</label>
      <div class="theme-grid">
        ${THEME_PRESETS.map(
          (p) => `<button type="button" class="theme-swatch ${!custom && s.themePreset === p.id ? "on" : ""}" onclick="window.EchoApp.setThemePreset('${p.id}')">
            <div class="theme-swatch-head">
              <span class="theme-dot" style="background:${p.primary}"></span>
              <span class="tn">${esc(p.name)}${p.id === "mint" ? "（默认）" : ""}</span>
            </div>
            <div class="theme-bubbles"><span style="background:${p.primarySoft}"></span><span style="background:${p.mintSoft}"></span></div>
          </button>`
        ).join("")}
      </div>
      <label class="field-label">自定义配色</label>
      <div class="color-row"><label>主色</label><input type="color" value="${colors.primary}" oninput="window.EchoApp.setCustomColor('primary',this.value)" /></div>
      <div class="color-row"><label>气泡「我」</label><input type="color" value="${colors.bubbleMe}" oninput="window.EchoApp.setCustomColor('bubbleMe',this.value)" /></div>
      <div class="color-row"><label>气泡「TA」</label><input type="color" value="${colors.bubbleHer}" oninput="window.EchoApp.setCustomColor('bubbleHer',this.value)" /></div>
      <div class="color-row"><label>辅助色</label><input type="color" value="${colors.mint}" oninput="window.EchoApp.setCustomColor('mint',this.value)" /></div>
      <label class="field-label">背景氛围强度</label>
      <div class="theme-chip-row">
        ${PARTICLE_LEVELS.map(
          (lv) => `<button type="button" class="chip ${s.particleIntensity === lv.id ? "chip-active" : ""}" onclick="window.EchoApp.setParticleIntensity('${lv.id}')">${lv.label}</button>`
        ).join("")}
      </div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="window.EchoApp.resetTheme()">重置为薄荷回响</button>
      <div class="theme-preview">
        <div class="tp-row"><span class="tp-b" style="background:${colors.bubbleHer}">你好呀</span></div>
        <div class="tp-row" style="justify-content:flex-end"><span class="tp-b" style="background:${colors.bubbleMe}">在的</span></div>
        <span class="tp-btn" style="background:${colors.primary}">发送</span>
      </div>`;
  },

  toggleApiMore() {
    this._apiMoreOpen = !this._apiMoreOpen;
    this._captureApiFields();
    this._paintSettings("api");
  },
  _captureApiFields() {
    const baseUrl = document.getElementById("set-baseurl")?.value;
    const apiKey = document.getElementById("set-apikey")?.value;
    const model = document.getElementById("set-model")?.value;
    const temp = document.getElementById("set-temp")?.value;
    const patch = {};
    if (baseUrl != null) patch.baseUrl = baseUrl;
    if (apiKey != null) patch.apiKey = apiKey;
    if (model != null) patch.model = model;
    if (temp != null) patch.temperature = parseFloat(temp);
    if (Object.keys(patch).length) store.updateSettings(patch);
  },
  async testApiConnection() {
    this._captureApiFields();
    const s = store.getState().settings;
    if (!s.apiKey?.trim()) {
      showToast({ message: "请先填写 API Key", type: "warning" });
      return;
    }
    showToast({ message: "正在测试连接…", type: "info", duration: 1500 });
    try {
      const resp = await fetch(s.baseUrl.replace(/\/+$/, "") + "/models", {
        headers: { Authorization: `Bearer ${s.apiKey}` },
      });
      showToast({
        message: resp.ok ? "连接成功" : `连接失败（${resp.status}）`,
        type: resp.ok ? "success" : "error",
      });
    } catch (e) {
      showToast({ message: "连接失败，请检查接口地址与网络", type: "error" });
    }
  },
  saveMemorySettings() {
    const maxPerRole = parseInt(document.getElementById("set-mem-max")?.value || "20", 10);
    const injectMax = parseInt(document.getElementById("set-mem-inject")?.value || "10", 10);
    store.set((s) => ({ ...s, memoryCfg: { ...s.memoryCfg, maxPerRole, injectMax } }));
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    showToast({ message: "记忆设置已保存", type: "success" });
  },
  setThemePreset(id) {
    store.updateSettings({ themePreset: id, customColors: { primary: "", mint: "", bubbleMe: "", bubbleHer: "" } });
    this.applyTheme();
    this._paintSettings("appearance");
    showToast({ message: `已切换至「${findThemePreset(id).name}」`, type: "success" });
  },
  setCustomColor(key, value) {
    const current = store.getState().settings.customColors || {};
    store.updateSettings({ customColors: { ...current, [key]: value } });
    this.applyTheme();
  },
  setParticleIntensity(level) {
    store.updateSettings({ particleIntensity: level });
    this.applyTheme();
    this._paintSettings("appearance");
  },
  resetTheme() {
    store.updateSettings({
      themePreset: "mint",
      customColors: { primary: "", mint: "", bubbleMe: "", bubbleHer: "" },
    });
    this.applyTheme();
    this._paintSettings("appearance");
    showToast({ message: "已重置为薄荷回响", type: "success" });
  },

  // 发送前引导连接模型：保存后自动把刚才那句话发出去
  openApiConnect() {
    this._apiSurface = "connect";
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    const chat = store.getCurrentChat();
    const name = chat?.name || "TA";
    openModal({
      title: "连接模型",
      width: "520px",
      content: `<p class="create-sub">配置好后即可和 ${esc(name)} 对话。密钥只存在这台设备上。</p>${this._apiSetupMarkup()}`,
      footer: `
        <button class="btn btn-ghost" onclick="window.EchoApp.cancelApiConnect()">稍后</button>
        <button class="btn btn-primary" onclick="window.EchoApp.confirmApiConnect()">保存并发送</button>`,
    });
    this.bindRippleButtons();
  },
  cancelApiConnect() {
    const pending = this._pendingSend;
    this._pendingSend = "";
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    if (pending) {
      const input = document.getElementById("chat-input");
      if (input) {
        input.value = pending;
        this.autoGrowInput(input);
      }
    }
  },
  confirmApiConnect() {
    this._captureApiFields();
    if (needsApiSetup(store.getCurrentChat())) {
      showToast({ message: "请填写接口地址、API Key 和模型", type: "warning" });
      return;
    }
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    const pending = this._pendingSend;
    this._pendingSend = "";
    this.render();
    if (pending) {
      this._sendPulse = true;
      sendMessage(pending);
    } else {
      showToast({ message: "模型已连接", type: "success" });
    }
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
    if (!preset) return;
    const keepKey = document.getElementById("set-apikey")?.value ?? store.getState().settings.apiKey;
    store.updateSettings({
      apiPresetId: id,
      baseUrl: preset.baseUrl,
      model: preset.model,
      apiKey: preset.apiKey || keepKey,
    });
    this._apiMoreOpen = true;
    showToast({ message: `已切换到 ${preset.name}`, type: "success" });
    if (this._apiSurface === "connect") this.openApiConnect();
    else this._paintSettings("api");
  },
  saveSettings() {
    this._captureApiFields();
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    this.render();
    showToast({ message: "设置已保存", type: "success" });
  },
  setTheme(theme) {
    store.updateSettings({ theme });
    this.applyTheme();
    if (document.querySelector(".theme-grid")) this._paintSettings("appearance");
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

  _recon: { overlay: null, step: "paste", pasteText: "", draft: null, error: "", sourceChatId: null, importMode: "file" },

  _newReconState(patch) {
    return {
      overlay: null,
      step: "paste",
      pasteText: "",
      draft: null,
      error: "",
      sourceChatId: null,
      importMode: "file",
      ...patch,
    };
  },

  openReconstruction() {
    closeModal(this._recon?.overlay);
    this._recon = this._newReconState();
    this._paintReconstruction();
  },
  reconstructionSetMode(mode) {
    this._captureReconstructionPaste();
    this._recon.importMode = mode;
    this._recon.error = "";
    this._paintReconstruction();
  },
  _captureReconstructionPaste() {
    const el = document.getElementById("recon-paste");
    if (el) this._recon.pasteText = el.value;
  },
  reconstructionPickFile(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    readFileAsText(file)
      .then((text) => {
        this._recon.pasteText = text;
        this._recon.importMode = "text";
        this._recon.error = "";
        this._paintReconstruction();
        showToast({ message: "聊天记录已导入", type: "success" });
      })
      .catch(() => showToast({ message: "无法读取文件", type: "error" }));
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
    this._recon = this._newReconState({ step: "review", draft: built.draft, sourceChatId: chatId });
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
    this._recon = this._newReconState();
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
    this._captureReconstructionPaste();
    const text = this._recon.pasteText;
    const built = buildReconstructionDraft(text);
    if (!built.ok) {
      this._recon.error =
        built.error === "empty"
          ? "请先选择文件或粘贴聊天记录。"
          : "没有识别到「名字: 内容」格式的对话。角色卡 JSON 请走导入角色卡。";
      this._recon.step = "paste";
      this._paintReconstruction();
      return;
    }
    // 先亮一帧「解析中」，让这一步有过程感而不是瞬间跳转
    this._recon.step = "parsing";
    this._recon.error = "";
    this._paintReconstruction();
    setTimeout(() => {
      this._recon.draft = built.draft;
      this._recon.step = "review";
      this._paintReconstruction();
    }, 620);
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
        this._recon.importMode = "text";
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
    this._recon.importMode = "text";
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
      const charName = this._recon.draft?.name || "TA";
      const insufficient = result.insufficient;
      // 成功页停留一下再进对话，让「认出了谁」这件事被看见
      const wizardOverlay = this._recon.overlay;
      this._recon.overlay = openModal({
        title: "",
        width: "380px",
        content: `<div class="success-ripple">
          <div class="sr-logo" aria-hidden="true"></div>
          <h4>从对话里认出了 ${esc(charName)}</h4>
          <p>正在进入聊天…</p>
        </div>`,
      });
      closeModal(wizardOverlay);
      storage.setRaw(KEYS.ONBOARD_DONE, "1");
      this.view = "app";
      store.setSelectedCharacter(result.characterId);
      this.continueCharacter(result.characterId);
      this.render();
      setTimeout(() => {
        this._closeReconstruction();
        showToast({
          message: insufficient ? `${charName} 已创建，部分设定仍需补充` : `从对话里认出了 ${charName}`,
          type: "success",
        });
      }, 1100);
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
