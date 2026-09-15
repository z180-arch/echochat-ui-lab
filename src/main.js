// ============================================================
//  EchoChat Rebuild · Main Entry
//  应用初始化、路由、事件绑定、全局 API
// ============================================================

import { store } from "./core/store.js";
import { events, EVT } from "./core/events.js";
import { runMigrations, storage, KEYS } from "./core/storage.js";
import { uid, esc, downloadFile, readFileAsText } from "./core/utils.js";
import { APP_VERSION } from "./core/version.js";
import { sendMessage, stopGeneration, retryLastMessage, regenerate, editMessage, readUserMessage, deleteMessageById, copyMessage, isSending, getStreamingPreview, buildSystemPrompt } from "./domain/chat.js";
import { createFromTemplate, getSystemTemplates, buildCharacterCard, importCharacter, getRoleId } from "./domain/persona.js";
import { rememberMessage, addMemory, deleteMemory } from "./domain/memory.js";
import { toggleLike, addComment, deleteMoment } from "./domain/moments.js";
import {
  listBooks,
  addEntry,
  updateEntry,
  deleteEntry,
  ensureCharacterBook,
  getBook,
  toggleEntryEnabled,
} from "./domain/worldbook.js";
import { getApiPresets, findPreset } from "./domain/provider.js";
import { speakAssistantMessage, speakText, stopSpeech } from "./domain/voice.js";
import { isSttSupported, isDictating, startDictation, stopDictation, joinDictation, sttErrorMessage, sttSupportNote } from "./domain/stt.js";
import { continueCharacter as continueCharacterHub, startConversationForCharacter, listCharactersForHub } from "./domain/character-hub.js";
import { Character } from "./domain/character.js";
import { peekMessages, peekHasOlder, loadOlderMessages } from "./domain/message-store.js";
import {
  renderLanding,
  renderOnboarding,
  renderAppShell,
  resetOnboarding,
  animateLanding,
  renderContinuitySheetContent,
  renderPreferencesSheetContent,
  renderProfileMoreContent,
  renderWorldbookEditorHtml,
  renderMessage,
  renderCharacterShareCard,
  renderConversationThreadList,
} from "./ui/views/index.js";
import {
  streamingMarkdown,
  shouldPaintNow,
  STREAM_PAINT_MIN_MS,
  followStreamScroll,
  findStreamingBubble,
  patchStreamingBubble,
  streamSignature,
} from "./ui/stream-paint.js";
import { showToast, openModal, closeModal, openConfirm, Icons, SettingRow, Segmented, Avatar, CharacterAvatar } from "./ui/components/index.js";
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
import { composerCountVisible, PROFILE_PERSIST_MIN_WIDTH, clipPreview } from "./ui/present.js";
import {
  getReplyPace,
  setReplyPaceForCharacter,
  REPLY_PACE_OPTIONS,
} from "./domain/reply-pace.js";
import { loadChatDraft, saveChatDraft, clearChatDraft } from "./domain/chat-draft.js";
import { reconstructionModalMarkup, importProgressMarkup } from "./ui/views/reconstruction.js";
import { memoryReviewMarkup } from "./ui/views/memory-review.js";
import {
  extractMemoryCandidates,
  setCandidateAccepted,
  editCandidateText,
  confirmMemoryCandidates,
  clonePendingForReview,
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
import { getLocalPluginRuntime } from "./runtime/index.js";
import { builtinPlugins } from "./plugins/index.js";
import { exportProductBackup, importProductBackup, resetProductData } from "./domain/backup.js";

// 应用状态
const App = {
  view: "landing", // landing | onboarding | app
  initialized: false,
  _pendingSend: "",
  _tabAnim: false,
  _meScrollTop: 0,
  _lastRenderedView: null,
  _sendPulse: false,
  _pinChatToBottom: false,
  _savedChatScroll: null,
  _chatDraft: "",
  _draftChatId: null,
  _streamPaintAt: 0,
  _streamPaintText: "",
  _streamPaintRaf: 0,
  _streamPaintTimer: 0,

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
    events.on(EVT.MESSAGE_RECEIVED, ({ message, chatId } = {}) => {
      if (chatId && store.getState().currentChatId !== chatId) return;
      speakAssistantMessage(message);
    });
    events.on(EVT.STREAM_ABORT, () => {
      stopSpeech();
      stopDictation();
    });
    events.on(EVT.CHAT_SELECTED, () => {
      stopSpeech();
      stopDictation();
      this.cancelStreamPaint();
    });
    events.on(EVT.MEMORY_CANDIDATES_READY, ({ roleId, chatId, count }) => {
      if (!count) return;
      showToast({
        message: count === 1 ? "有 1 件事可以记下" : `有 ${count} 件事可以记下`,
        type: "info",
        duration: 6000,
        action: {
          label: "查看",
          handler: () => this.openMemoryCandidates(roleId, chatId),
        },
      });
    });
    events.on(EVT.MEMORY_ADDED, ({ roleId, memory } = {}) => {
      if (memory?.source !== "auto") return;
      if (this._quietMemoryHint) return;
      this._quietMemoryHint = true;
      const chatId = store.getCurrentChat()?.id;
      showToast({
        message: "记下了一件关于你的事",
        type: "info",
        duration: 5000,
        action: {
          label: "看看",
          handler: () => this.openContinuitySheet(roleId, chatId),
        },
      });
    });
    events.on(EVT.MOMENT_ADDED, ({ roleId } = {}) => {
      if (this._momentHint) return;
      this._momentHint = true;
      showToast({
        message: "你们刚刚留下了一条相处痕迹",
        type: "info",
        duration: 5000,
        action: {
          label: "看看",
          handler: () => this.openMomentsFeed(roleId),
        },
      });
    });
    events.on("rerender", () => this.render());
    events.on(EVT.STREAM_DELTA, ({ chatId, text } = {}) => {
      if (store.getState().currentChatId !== chatId) return;
      if (this.paintStreamingDelta(chatId, text)) return;
      this.render();
    });
    events.on(EVT.STREAM_DONE, () => this.cancelStreamPaint());
    events.on(EVT.STREAM_ABORT, () => this.cancelStreamPaint());

    // 6. 全局事件委托
    this.bindGlobalEvents();
    this.initialized = true;

    // 6.5 Local plugin runtime (builtin extra-notes). DSH is a Planned adapter, not the host.
    this._pluginRuntime = getLocalPluginRuntime();
    this._pluginRuntime.start(builtinPlugins).catch((e) => {
      console.warn("[App] plugin runtime skipped:", e.message);
    });

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
      .register("/sw.js", { scope: "/app/" })
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
    const liveMsgs = document.getElementById("chat-messages");
    if (liveMsgs) {
      this._savedChatScroll = {
        chatId: this._draftChatId || store.getState().currentChatId,
        top: liveMsgs.scrollTop,
        nearBottom: liveMsgs.scrollHeight - liveMsgs.scrollTop - liveMsgs.clientHeight < 120,
      };
    }
    this._openProfileFolds = [...document.querySelectorAll("details.profile-fold[open]")].map(
      (d) => d.querySelector("summary")?.textContent.trim()
    );
    const chatInput = document.getElementById("chat-input");
    const draftId = this._draftChatId || store.getCurrentChat()?.id;
    if (chatInput && draftId) saveChatDraft(draftId, chatInput.value);

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

  cancelStreamPaint() {
    if (this._streamPaintRaf && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this._streamPaintRaf);
    }
    if (this._streamPaintTimer) clearTimeout(this._streamPaintTimer);
    this._streamPaintRaf = 0;
    this._streamPaintTimer = 0;
  },

  paintStreamingDelta(chatId, text) {
    const box = document.getElementById("chat-messages");
    if (!box || this.view !== "app") return false;
    const raw = text || getStreamingPreview(chatId) || "";
    if (!String(raw).trim()) return true;
    let bubble = findStreamingBubble(document);
    if (!bubble) {
      if (!this.appendStreamingRow(chatId, raw)) return false;
      bubble = findStreamingBubble(document);
      if (!bubble) return false;
      this._streamPaintAt = Date.now();
      this._streamPaintText = raw;
      followStreamScroll(box);
      return true;
    }
    this._streamPaintText = raw;
    if (this._streamPaintTimer || this._streamPaintRaf) return true;
    const wait = shouldPaintNow(this._streamPaintAt)
      ? 0
      : STREAM_PAINT_MIN_MS - (Date.now() - this._streamPaintAt);
    const flush = () => {
      this._streamPaintRaf = 0;
      this._streamPaintTimer = 0;
      this.flushStreamPaint();
    };
    if (wait > 0) {
      this._streamPaintTimer = setTimeout(flush, wait);
    } else if (typeof requestAnimationFrame === "function") {
      this._streamPaintRaf = requestAnimationFrame(flush);
    } else {
      flush();
    }
    return true;
  },

  flushStreamPaint() {
    const bubble = findStreamingBubble(document);
    if (!bubble) return;
    const raw = this._streamPaintText || "";
    this._streamPaintAt = Date.now();
    patchStreamingBubble(bubble, streamingMarkdown(raw), streamSignature(raw));
    followStreamScroll(document.getElementById("chat-messages"));
  },

  appendStreamingRow(chatId, raw) {
    const box = document.getElementById("chat-messages");
    const chat = store.getCurrentChat();
    if (!box || !chat || chat.id !== chatId) return false;
    const messages = peekMessages(chatId);
    let idx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].status === "streaming") {
        idx = i;
        break;
      }
    }
    if (idx < 0) return false;
    const html = renderMessage({ ...messages[idx], text: raw || messages[idx].text }, idx, chat, messages);
    if (!html) return false;
    box.insertAdjacentHTML("beforeend", html);
    this.bindMessageGestures();
    return !!findStreamingBubble(document);
  },

  afterRenderApp() {
    // 智能滚动：仅当用户接近底部时自动滚动到底部
    const msgBox = document.getElementById("chat-messages");
    if (msgBox) {
      const chatId = store.getState().currentChatId;
      const saved = this._savedChatScroll;
      const sameChat = saved && saved.chatId === chatId;
      const persisted = store.getChatScroll(chatId);
      if (this._pinChatToBottom) {
        msgBox.scrollTop = msgBox.scrollHeight;
      } else if (sameChat) {
        msgBox.scrollTop = saved.nearBottom ? msgBox.scrollHeight : saved.top;
      } else if (persisted && !persisted.nearBottom) {
        msgBox.scrollTop = persisted.top;
      } else {
        msgBox.scrollTop = msgBox.scrollHeight;
      }
      this._pinChatToBottom = false;
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
    this.bindChatWindow();

    document.querySelectorAll("details.profile-fold").forEach((d) => {
      const t = d.querySelector("summary")?.textContent.trim();
      if (t && this._openProfileFolds?.includes(t)) d.open = true;
    });

    const input = document.getElementById("chat-input");
    if (input) {
      const chat = store.getCurrentChat();
      this._draftChatId = chat?.id || null;
      input.value = chat ? loadChatDraft(chat.id) : "";
      this._chatDraft = input.value;
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

  bindChatWindow() {
    const box = document.getElementById("chat-messages");
    if (!box || box.dataset.windowBound) return;
    box.dataset.windowBound = "1";
    box.addEventListener(
      "scroll",
      () => {
        this.onChatWindowScroll(box);
      },
      { passive: true }
    );
  },

  onChatWindowScroll(box) {
    if (!box) return;
    const chat = store.getCurrentChat();
    if (!chat) return;
    if (this._scrollSaveTimer) clearTimeout(this._scrollSaveTimer);
    this._scrollSaveTimer = setTimeout(() => {
      const live = document.getElementById("chat-messages");
      const current = store.getCurrentChat();
      if (!live || !current) return;
      store.setChatScroll(current.id, {
        top: live.scrollTop,
        nearBottom: live.scrollHeight - live.scrollTop - live.clientHeight < 120,
      });
    }, 320);
    if (this._loadingOlder) return;
    if (box.scrollTop < 96 && peekHasOlder(chat.id)) {
      this._loadingOlder = true;
      const prevH = box.scrollHeight;
      const prevTop = box.scrollTop;
      loadOlderMessages(chat.id)
        .then((added) => {
          this._loadingOlder = false;
          if (!added) return;
          this.render();
          const next = document.getElementById("chat-messages");
          if (next) next.scrollTop = next.scrollHeight - prevH + prevTop;
        })
        .catch(() => {
          this._loadingOlder = false;
        });
    }
  },

  indexByMessageId(messageId) {
    const chat = store.getCurrentChat();
    if (!chat || !messageId) return -1;
    return peekMessages(chat.id).findIndex((m) => m.id === messageId);
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
      if (e.key !== "Escape") return;
      const overlays = document.querySelectorAll(".modal-overlay");
      if (overlays.length) {
        overlays.forEach((m) => m.remove());
        return;
      }
      const s = store.getState();
      if (s.ui.profileOpen && window.innerWidth < PROFILE_PERSIST_MIN_WIDTH) {
        store.setProfileOpen(false);
        return;
      }
      document.querySelectorAll(".msg.show-actions").forEach((m) => m.classList.remove("show-actions"));
    });
    document.addEventListener("click", (e) => {
      if (e.target.closest(".msg")) return;
      document.querySelectorAll(".msg.show-actions").forEach((m) => m.classList.remove("show-actions"));
    });
    let wide = typeof window !== "undefined" && window.innerWidth >= PROFILE_PERSIST_MIN_WIDTH;
    let compact = typeof window !== "undefined" && window.innerWidth < 768;
    window.addEventListener("resize", () => {
      const now = window.innerWidth >= PROFILE_PERSIST_MIN_WIDTH;
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
    window.addEventListener("pagehide", () => {
      stopSpeech();
      stopDictation();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopSpeech();
        stopDictation();
      }
    });
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
      if (!(store.getState().chats || []).filter((c) => !c.archivedAt).length) {
        this.openBring();
      }
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
    this.importAll();
  },
  previewTemplate(name) {
    const tpl = getSystemTemplates().find((t) => t.name === name);
    if (!tpl) return;
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    const hello = String(tpl.firstMessage || "").trim();
    const persona = String(tpl.persona || tpl.tag || "").trim();
    openModal({
      title: `认识 ${tpl.name}`,
      width: "400px",
      content: `
        <div class="share-card">
          ${CharacterAvatar({ src: tpl.avatar || "", size: "lg", alt: tpl.name, name: tpl.name })}
          <div class="share-card-name">${esc(tpl.name)}</div>
          <p class="share-card-note">这是人设开场，还没有你们的记忆。</p>
          ${persona ? `<p class="meet-identity">${esc(clipPreview(persona, 72))}</p>` : ""}
          ${hello ? `<blockquote class="meet-hello">${esc(hello)}</blockquote>` : ""}
        </div>`,
      footer: `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openTemplatePicker()">返回</button>
        <button class="btn btn-primary" onclick="window.EchoApp.selectTemplate('${esc(tpl.name)}')">开始相处</button>`,
    });
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
      queueMicrotask(() => document.getElementById("chat-input")?.focus());
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
  _persistLiveChatScroll() {
    const live = document.getElementById("chat-messages");
    const chatId = this._savedChatScroll?.chatId || store.getState().currentChatId;
    if (!live || !chatId) return;
    store.setChatScroll(chatId, {
      top: live.scrollTop,
      nearBottom: live.scrollHeight - live.scrollTop - live.clientHeight < 120,
    });
  },
  selectCharacter(id) {
    this._persistLiveChatScroll();
    store.setSelectedCharacter(id);
    this.continueCharacter(id);
  },
  backToCharacterList() {
    store.setSelectedCharacter(null);
  },
  continueCharacter(id) {
    this._persistLiveChatScroll();
    const chat = continueCharacterHub(id);
    if (chat?.id) {
      import("./domain/message-store.js")
        .then(({ messageStore }) => messageStore.hydrateChat(chat.id))
        .then(() => this.render())
        .catch(() => this.render());
    }
  },
  startNewConversation(id) {
    this._persistLiveChatScroll();
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
        document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
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
  previewCharacterCard(characterId) {
    const chat = store.getState().chats.find((c) => c.roleId === characterId) || store.getCurrentChat();
    if (!chat) {
      showToast({ message: "没有可预览的角色", type: "info" });
      return;
    }
    const card = buildCharacterCard(chat);
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    openModal({
      title: "角色预览",
      width: "400px",
      content: renderCharacterShareCard(card),
      footer: `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openProfileMoreSheet('${esc(characterId)}')">返回</button>
        <button class="btn btn-secondary" onclick="window.EchoApp.copyCharacterCard('${esc(characterId)}')">复制 JSON</button>
        <button class="btn btn-primary" onclick="window.EchoApp.exportCharacterCard('${esc(characterId)}');this.closest('.modal-overlay').remove()">导出角色卡</button>`,
    });
  },
  async copyCharacterCard(characterId) {
    const chat = store.getState().chats.find((c) => c.roleId === characterId) || store.getCurrentChat();
    if (!chat) {
      showToast({ message: "没有可复制的角色", type: "info" });
      return;
    }
    const text = JSON.stringify(buildCharacterCard(chat), null, 2);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      showToast({ message: "角色卡已复制，不含记忆", type: "success" });
    } catch {
      showToast({ message: "复制失败，试试导出文件", type: "warning" });
    }
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
    const current = store.getCurrentChat();
    const chat =
      (current && current.roleId === characterId ? current : null) ||
      store.getState().chats.find((c) => c.roleId === characterId);
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
    const likes = document.getElementById("edit-char-likes")?.value ?? chat?.config?.likes ?? "";
    const dislikes = document.getElementById("edit-char-dislikes")?.value ?? chat?.config?.dislikes ?? "";
    const rules = document.getElementById("edit-char-rules")?.value ?? chat?.config?.rules ?? "";
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
        <label class="field-label">喜欢（可选）</label>
        <textarea class="input" id="edit-char-likes" rows="2" placeholder="TA 喜欢什么。不是你的记忆。">${esc(likes)}</textarea>
        <label class="field-label">不喜欢（可选）</label>
        <textarea class="input" id="edit-char-dislikes" rows="2" placeholder="TA 会避开什么。">${esc(dislikes)}</textarea>
        <label class="field-label">相处规则（可选）</label>
        <textarea class="input" id="edit-char-rules" rows="2" placeholder="怎么和 TA 相处。不是世界书，也不是关于你的事实。">${esc(rules)}</textarea>
        <label class="field-label">回复速度</label>
        <p class="field-hint">控制这个角色回复消息时的呈现节奏</p>
        <div class="reply-pace-field" data-reply-pace-for="${esc(characterId)}">
          ${Segmented({
            options: REPLY_PACE_OPTIONS,
            value: getReplyPace(chat),
            onChange: `window.EchoApp.setCharacterReplyPace.bind(null, '${esc(characterId)}')`,
          })}
        </div>
        <button type="button" class="btn btn-ghost btn-sm sheet-action" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openCharacterWorldbook('${esc(characterId)}')">角色世界书</button>
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
    if (!name) {
      showToast({ message: "先写个名字", type: "warning" });
      return;
    }
    const identity = document.getElementById("edit-char-identity")?.value || "";
    const scenario = document.getElementById("edit-char-scenario")?.value || "";
    const mesExample = document.getElementById("edit-char-examples")?.value || "";
    const speakingStyle = document.getElementById("edit-char-style")?.value || "";
    const likes = document.getElementById("edit-char-likes")?.value || "";
    const dislikes = document.getElementById("edit-char-dislikes")?.value || "";
    const rules = document.getElementById("edit-char-rules")?.value || "";
    const avatar = this._charDraftAvatar;
    this._charDraftAvatar = null;
    Character.updateCharacter(characterId, {
      name,
      identity,
      personality: { description: identity, scenario, mesExample },
      speakingStyle: speakingStyle ? { notes: speakingStyle } : {},
      preferences: { likes, dislikes, rules },
      ...(avatar ? { avatar } : {}),
    })
      .then(() => {
        const chats = store.getState().chats.filter((c) => c.roleId === characterId);
        const previousName = chats
          .slice()
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0]?.name;
        chats.forEach((c) => {
          const rename = !c.name || c.name === previousName;
          store.updateChat(c.id, {
            ...(rename ? { name } : {}),
            ...(avatar ? { avatar } : {}),
            config: { ...c.config, persona: identity, scenario, mesExample, speakingStyle, likes, dislikes, rules },
          });
        });
        document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
        this.render();
        showToast({ message: "角色已更新", type: "success" });
      })
      .catch(() => {
        showToast({ message: "保存失败", type: "error" });
      });
  },
  setCharacterReplyPace(roleId, pace) {
    setReplyPaceForCharacter(roleId, pace);
    const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(roleId) : String(roleId).replace(/"/g, '\\"');
    document.querySelectorAll(`[data-reply-pace-for="${safeId}"] .segmented-btn`).forEach((btn) => {
      const opt = REPLY_PACE_OPTIONS.find((o) => o.label === btn.textContent.trim());
      btn.classList.toggle("segmented-btn-active", opt?.value === pace);
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
    const secondaryRow = (icon, title, onClick, keepOpen) => `
      <button type="button" class="create-secondary-btn" onclick="${keepOpen ? onClick : `this.closest('.modal-overlay').remove();${onClick}`}">
        <span class="create-card-ic">${icon}</span>
        <span class="create-card-title">${title}</span>
      </button>`;
    openModal({
      title: "创建角色",
      width: "440px",
      content: `
        <p class="create-sub">创造一个陪伴对象。给 TA 一个名字，开始相处。</p>
        <button type="button" class="create-primary-btn" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openCreateQuickStart()">
          <span class="create-card-ic">${Icons.sparkles}</span>
          <span class="create-card-title">从模板或空白开始</span>
        </button>
        <div class="create-group-label">已有资料</div>
        <div class="create-secondary-group">
          ${secondaryRow(Icons.message, "导入聊天记录", "window.EchoApp.openReconstruction()")}
          ${secondaryRow(Icons.upload, "导入角色卡", "window.EchoApp.importCharacterCard()", true)}
        </div>
        ${this._apiHintMarkup()}
      `,
      footer: `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">取消</button>`,
    });
  },
  openCreateQuickStart() {
    const pick = (icon, title, desc, onClick) => `
      <button type="button" class="create-secondary-btn" onclick="this.closest('.modal-overlay').remove();${onClick}">
        <span class="create-card-ic">${icon}</span>
        <span>
          <span class="create-card-title">${title}</span>
          ${desc ? `<span class="create-card-desc">${desc}</span>` : ""}
        </span>
      </button>`;
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    openModal({
      title: "从模板或空白开始",
      width: "440px",
      content: `
        <div class="create-secondary-group">
          ${pick(Icons.users, "选内置角色", "挑一个性格，预览后直接开聊", "window.EchoApp.openTemplatePicker()")}
          ${pick(Icons.sparkles, "空白创建", "看着 TA 成形：名字、头像和一句话", "window.EchoApp.openCreateBlank()")}
        </div>
      `,
      footer: `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openBring()">返回</button>`,
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
      title: "推荐性格",
      width: "440px",
      content: `
        <p class="create-sub">先看性格，再开始相处。人设可以以后再改。</p>
        <div class="create-secondary-group">
          ${templates
            .slice(0, 10)
            .map(
              (t) => `
            <button type="button" class="create-secondary-btn" onclick="this.closest('.modal-overlay').remove();window.EchoApp.previewTemplate('${esc(t.name)}')">
              <span class="create-card-ic">${Icons.users}</span>
              <span>
                <span class="create-card-title">${esc(t.name)}</span>
                ${t.tag ? `<span class="create-card-desc">${esc(t.tag)}</span>` : ""}
              </span>
            </button>`
            )
            .join("")}
        </div>
      `,
      footer: `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openCreateQuickStart()">返回</button>`,
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
    const scenario = document.getElementById("blank-char-scenario")?.value || "";
    const examples = document.getElementById("blank-char-examples")?.value || "";
    const likes = document.getElementById("blank-char-likes")?.value || "";
    const dislikes = document.getElementById("blank-char-dislikes")?.value || "";
    const rules = document.getElementById("blank-char-rules")?.value || "";
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    openModal({
      title: "创造陪伴",
      width: "440px",
      content: `
        <div class="create-presence">
          ${this._avatarPickerMarkup("blank", this._blankAvatar, name || "新角色")}
          <div class="create-presence-copy">
            <div class="create-presence-name" id="blank-preview-name">${esc(name.trim() || "还没有名字")}</div>
            <div class="create-presence-line" id="blank-preview-line">${esc(desc.trim() || "一句话，TA 就会站在这里。")}</div>
          </div>
        </div>
        <label class="field-label">名字</label>
        <input class="input" id="blank-char-name" placeholder="给 TA 起个名字" maxlength="32" value="${esc(name)}" oninput="window.EchoApp.previewBlankCharacter()" />
        <label class="field-label">一句话描述（可选）</label>
        <p class="field-hint">这是 TA 是谁。关于你的事会在聊天里慢慢记住，不必写在这里。</p>
        <textarea class="input" id="blank-char-desc" rows="3" placeholder="例如：她是咖啡店店员，不爱说话但会记得我的喜好。" style="min-height:88px;" oninput="window.EchoApp.previewBlankCharacter()">${esc(desc)}</textarea>
        <details class="profile-fold">
          <summary>情景、示例、相处规则（可选）</summary>
          <label class="field-label">初始背景</label>
          <textarea class="input" id="blank-char-scenario" rows="2" placeholder="你们现在在什么情景里。">${esc(scenario)}</textarea>
          <label class="field-label">说话示例</label>
          <textarea class="input" id="blank-char-examples" rows="2" placeholder="用户: …\n角色: …">${esc(examples)}</textarea>
          <label class="field-label">喜欢 / 不喜欢</label>
          <textarea class="input" id="blank-char-likes" rows="2" placeholder="TA 喜欢什么">${esc(likes)}</textarea>
          <textarea class="input" id="blank-char-dislikes" rows="2" placeholder="TA 不喜欢什么">${esc(dislikes)}</textarea>
          <label class="field-label">相处规则</label>
          <textarea class="input" id="blank-char-rules" rows="2" placeholder="怎么和 TA 相处。不是世界书。">${esc(rules)}</textarea>
        </details>
      `,
      footer: `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openCreateQuickStart()">返回</button>
        <button class="btn btn-primary" onclick="window.EchoApp.createBlankCharacter()">创建角色</button>`,
    });
    this.bindRippleButtons();
  },
  previewBlankCharacter() {
    const name = document.getElementById("blank-char-name")?.value || "";
    const desc = document.getElementById("blank-char-desc")?.value || "";
    const nameEl = document.getElementById("blank-preview-name");
    const lineEl = document.getElementById("blank-preview-line");
    const fallback = document.querySelector(".create-presence .avatar-fallback");
    if (nameEl) nameEl.textContent = name.trim() || "还没有名字";
    if (lineEl) lineEl.textContent = desc.trim() || "一句话，TA 就会站在这里。";
    if (fallback) fallback.textContent = (name.trim() || "?").slice(0, 1);
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
    const scenario = document.getElementById("blank-char-scenario")?.value?.trim() || "";
    const mesExample = document.getElementById("blank-char-examples")?.value?.trim() || "";
    const likes = document.getElementById("blank-char-likes")?.value?.trim() || "";
    const dislikes = document.getElementById("blank-char-dislikes")?.value?.trim() || "";
    const rules = document.getElementById("blank-char-rules")?.value?.trim() || "";
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
        scenario,
        mesExample,
        likes,
        dislikes,
        rules,
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
      queueMicrotask(() => document.getElementById("chat-input")?.focus());
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
        title: chat.name ? `${chat.name}的相处` : "相处线",
        width: "420px",
        content: `
          <p class="recon-lead">同一位角色的不同聊天。记忆和关系跟着 TA，不跟着某一条线。</p>
          ${renderConversationThreadList({ convos, currentId: chat.id })}
        `,
        footer: `
          <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">关闭</button>
          <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove();window.EchoApp.startNewConversation('${roleId}')">新的相处线</button>
        `,
      });
    });
  },
  openThreadRename(chatId) {
    const chat = store.getState().chats.find((c) => c.id === chatId);
    if (!chat) return;
    import("./domain/conversation.js").then(({ getThreadTitle }) => {
      const current = getThreadTitle(chat);
      document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
      openModal({
        title: "相处线名称",
        width: "400px",
        content: `
          <label class="field-label">给这条线起个好认的名字</label>
          <input class="input" id="thread-title-input" value="${esc(current)}" maxlength="40" />
        `,
        footer: `
          <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">取消</button>
          <button class="btn btn-primary" onclick="window.EchoApp.saveThreadRename('${chatId}')">保存</button>
        `,
      });
      queueMicrotask(() => document.getElementById("thread-title-input")?.focus());
    });
  },
  saveThreadRename(chatId) {
    const title = document.getElementById("thread-title-input")?.value || "";
    import("./domain/conversation.js").then(({ renameConversation }) => {
      if (!renameConversation(chatId, title)) return;
      document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
      this.render();
    });
  },
  selectChat(id) {
    this._persistLiveChatScroll();
    store.selectChat(id);
    store.setProfileOpen(window.innerWidth >= PROFILE_PERSIST_MIN_WIDTH);
    import("./domain/message-store.js")
      .then(({ messageStore }) => messageStore.hydrateChat(id))
      .then(() => this.render())
      .catch(() => {});
  },
  deleteChat(id) {
    const chat = store.getState().chats.find((c) => c.id === id);
    const siblings = (store.getState().chats || []).filter((c) => c.roleId === chat?.roleId && c.id !== id && !c.archivedAt);
    const lastThread = !!chat && siblings.length === 0;
    openConfirm({
      title: lastThread ? "删除角色" : "删除这条相处线",
      message: lastThread
        ? `这是「${chat?.name || "此角色"}」的最后一条相处线。删除后角色、对话、记忆和痕迹都会一起去掉，不能恢复。`
        : `确定删除与「${chat?.name || "此角色"}」的这条相处线吗？这条线里的聊天记录会永久删除，角色还在。`,
      confirmText: "删除",
      cancelText: "取消",
      variant: "danger",
      onConfirm: () => {
        const work = lastThread
          ? Character.permanentDeleteCharacter(chat.roleId)
          : import("./domain/conversation.js").then(({ deleteConversation }) => deleteConversation(id));
        work
          .then(() => {
            document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
            showToast({ message: lastThread ? "角色已删除" : "相处线已删除", type: "success" });
            this.render();
          })
          .catch(() => {
            store.deleteChat(id);
            this.render();
            showToast({ message: "相处线已删除", type: "success" });
          });
      },
    });
  },
  deleteCharacter(id) {
    const chat = store.getState().chats.find((c) => c.roleId === id);
    openConfirm({
      title: "删除角色",
      message: `确定删除「${chat?.name || "这个角色"}」吗？对话、记忆、关系和痕迹都会一起删掉，不能恢复。`,
      confirmText: "删除",
      cancelText: "取消",
      variant: "danger",
      onConfirm: () => {
        Character.permanentDeleteCharacter(id)
          .then(() => {
            document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
            showToast({ message: "角色已删除", type: "success" });
            this.render();
          })
          .catch(() => showToast({ message: "删除失败", type: "error" }));
      },
    });
  },
  backToList() {
    this._persistLiveChatScroll();
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
  fillComposer(text) {
    const input = document.getElementById("chat-input");
    if (!input) return;
    input.value = String(text || "");
    this.onChatInput(input);
    this.autoGrowInput(input);
    this.updateChatCount(input);
    input.focus();
  },
  sendMessage() {
    stopDictation();
    this._syncMicButton();
    const input = document.getElementById("chat-input");
    const text = input?.value?.trim();
    if (!text) return;
    if (isSending()) {
      showToast({ message: "上一条还在回复", type: "info" });
      return;
    }
    if (text.length > MAX_USER_MESSAGE_CHARS) {
      showToast({ message: `单条最多 ${MAX_USER_MESSAGE_CHARS} 字，请删短后再发`, type: "info" });
      this.updateChatCount(input);
      return;
    }
    input.value = "";
    this._chatDraft = "";
    const chat = store.getCurrentChat();
    if (chat?.id) clearChatDraft(chat.id);
    this.autoGrowInput(input);
    this.updateChatCount(input);
    // 模型未配置时不报错，先收下这句话，连接完成后自动发出去
    if (needsApiSetup(store.getCurrentChat())) {
      this._pendingSend = text;
      this.openApiConnect();
      return;
    }
    this._sendPulse = true;
    this._pinChatToBottom = true;
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
    const near = composerCountVisible(n, MAX_USER_MESSAGE_CHARS);
    cap.hidden = !near;
    cap.textContent = `${n} / ${MAX_USER_MESSAGE_CHARS}`;
    cap.classList.toggle("is-over", over);
    cap.classList.toggle("is-near", near && !over);
  },
  onChatInput(el) {
    this.autoGrowInput(el);
    this._chatDraft = el?.value || "";
    const chat = store.getCurrentChat();
    if (chat?.id) saveChatDraft(chat.id, this._chatDraft);
    this.updateChatCount(el);
  },
  copyMessage(index) {
    const chat = store.getCurrentChat();
    const msg = peekMessages(chat?.id)?.[index];
    if (msg) copyMessage(msg.text || "");
  },
  copyMessageById(messageId) {
    this.copyMessage(this.indexByMessageId(messageId));
  },
  copyCodeBlock(btn) {
    const code = btn?.closest(".md-pre")?.querySelector("code")?.textContent || "";
    if (code) copyMessage(code);
  },
  rememberMessage(index) {
    const chat = store.getCurrentChat();
    const msg = peekMessages(chat?.id)?.[index];
    if (msg) {
      rememberMessage(chat, msg);
      showToast({ message: "已加入记忆", type: "success" });
    }
  },
  rememberMessageById(messageId) {
    this.rememberMessage(this.indexByMessageId(messageId));
  },
  regenerateMessage(index) {
    this._pinChatToBottom = true;
    regenerate(index);
  },
  regenerateMessageById(messageId) {
    this.regenerateMessage(this.indexByMessageId(messageId));
  },
  retryLastMessage() {
    this._pinChatToBottom = true;
    return retryLastMessage();
  },
  editMessage(index) {
    const text = readUserMessage(index);
    if (!text) return;
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    openModal({
      title: "编辑消息",
      width: "440px",
      content: `<p class="profile-muted">改完后会按这句重新生成后面的回复。已经记住的事不会被删掉。</p>
        <textarea class="input" id="edit-msg-text" rows="5" maxlength="${MAX_USER_MESSAGE_CHARS}">${esc(text)}</textarea>`,
      footer: `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="window.EchoApp.commitEditedMessage(${index})">保存并重生成</button>`,
    });
  },
  editMessageById(messageId) {
    this.editMessage(this.indexByMessageId(messageId));
  },
  commitEditedMessage(index) {
    const next = document.getElementById("edit-msg-text")?.value || "";
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    if (!String(next).trim()) {
      showToast({ message: "先写点内容", type: "warning" });
      return;
    }
    this._pinChatToBottom = true;
    return editMessage(index, next);
  },
  deleteMessage(index) {
    const chat = store.getCurrentChat();
    if (!chat) return;
    const msg = peekMessages(chat.id)?.[index];
    if (!msg) return;
    const id = msg.id;
    openConfirm({
      title: "删除消息",
      message: "确定删除这条消息吗？此操作不可恢复，已经记住的事不会被删掉。",
      confirmText: "删除",
      cancelText: "取消",
      variant: "danger",
      onConfirm: () => {
        deleteMessageById(id);
        showToast({ message: "消息已删除", type: "success" });
      },
    });
  },
  deleteMessageById(messageId) {
    this.deleteMessage(this.indexByMessageId(messageId));
  },
  retryFromMessage() {
    return this.retryLastMessage();
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

  // 动态 / 相处痕迹
  setMomentsFilter(value) {
    store.setMomentsFilter(value);
  },
  openMomentsFeed(roleId) {
    store.setMomentsFilter(roleId || "all");
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    this.switchTab("moments");
  },
  deleteMomentEntry(id) {
    if (!id) return;
    deleteMoment(id);
    this.render();
  },
  setMomentsFilterAndRefresh(value, roleId, chatId) {
    store.setMomentsFilter(value);
    this._paintContinuitySheet(roleId, chatId);
  },
  openContinuitySheet(roleId, chatId) {
    store.setMomentsFilter(roleId || "all");
    this._paintContinuitySheet(roleId, chatId);
  },
  _paintContinuitySheet(roleId, chatId) {
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    openModal({
      title: "记忆与痕迹",
      width: "520px",
      content: renderContinuitySheetContent(roleId, chatId),
      footer: `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">关闭</button>`,
    });
  },
  openPreferencesSheet(roleId) {
    const chat =
      store.getState().chats.find((c) => c.roleId === roleId) || store.getCurrentChat();
    if (!chat) return;
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    openModal({
      title: "相处偏好",
      width: "480px",
      content: renderPreferencesSheetContent(chat),
      footer: `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">关闭</button>`,
    });
  },
  openProfileMoreSheet(roleId) {
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    openModal({
      title: "更多",
      width: "400px",
      content: renderProfileMoreContent(roleId),
      footer: `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">关闭</button>`,
    });
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
    showToast({ message: "已记下", type: "success" });
    this.render();
  },
  addWorldbookEntry(bookId) {
    const keys = document.getElementById("wb-keys")?.value || "";
    const content = String(document.getElementById("wb-content")?.value || "").trim();
    if (!content) {
      showToast({ message: "先写一点设定", type: "warning" });
      return;
    }
    const targetId = bookId || this._wbContext?.bookId || "global";
    addEntry(targetId, {
      name: String(keys).split(",")[0]?.trim() || "条目",
      keys,
      content: content.slice(0, 1200),
      enabled: document.getElementById("wb-enabled") ? document.getElementById("wb-enabled").checked : true,
      constant: !!document.getElementById("wb-constant")?.checked,
    });
    this._wbEditing = null;
    this._repaintWorldbook();
    showToast({ message: "条目已添加", type: "success" });
  },
  saveWorldbookEntry(bookId) {
    const entryId = document.getElementById("wb-edit-id")?.value;
    const keys = document.getElementById("wb-keys")?.value || "";
    const content = String(document.getElementById("wb-content")?.value || "").trim();
    if (!entryId || !content) {
      showToast({ message: "先写一点设定", type: "warning" });
      return;
    }
    updateEntry(bookId || this._wbContext?.bookId || "global", entryId, {
      name: String(keys).split(",")[0]?.trim() || "条目",
      keys,
      content: content.slice(0, 1200),
      enabled: document.getElementById("wb-enabled") ? document.getElementById("wb-enabled").checked : true,
      constant: !!document.getElementById("wb-constant")?.checked,
    });
    this._wbEditing = null;
    this._repaintWorldbook();
    showToast({ message: "条目已更新", type: "success" });
  },
  editWorldbookEntry(bookId, entryId) {
    this._wbEditing = { bookId, entryId };
    this._repaintWorldbook();
  },
  cancelWorldbookEdit() {
    this._wbEditing = null;
    this._repaintWorldbook();
  },
  toggleWorldbookEntry(bookId, entryId) {
    toggleEntryEnabled(bookId, entryId);
    this._repaintWorldbook();
  },
  deleteWorldbookEntry(bookId, entryId) {
    deleteEntry(bookId, entryId);
    if (this._wbEditing?.entryId === entryId) this._wbEditing = null;
    this._repaintWorldbook();
  },
  openCharacterWorldbook(roleId) {
    if (!roleId) return;
    const chat = store.getState().chats.find((c) => c.roleId === roleId);
    const book = ensureCharacterBook(roleId, chat?.name ? `${chat.name}的世界书` : "角色世界书");
    this._wbContext = { mode: "character", roleId, bookId: book.id };
    this._wbEditing = null;
    this._paintSettings("worldbook");
  },
  _repaintWorldbook() {
    this._paintSettings("worldbook");
  },

  // ============================================================
  //  设置：按分区打开，每层都能返回「我的」
  // ============================================================
  _apiMoreOpen: false,
  _wbContext: { mode: "global", roleId: null, bookId: "global" },
  _wbEditing: null,

  openSettings(section) {
    const sec = section || "api";
    if (sec === "api") {
      const presetId = store.getState().settings.apiPresetId;
      if (presetId && presetId !== "siliconflow") this._apiMoreOpen = true;
    }
    if (sec === "worldbook") {
      this._wbContext = { mode: "global", roleId: null, bookId: "global" };
      this._wbEditing = null;
    }
    this._paintSettings(sec);
  },

  _paintSettings(section) {
    if (section === "api") this._apiSurface = "settings";
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const titles = {
      api: "API 与模型",
      memory: "记忆条数",
      appearance: "外观",
      backup: "备份",
      worldbook: "世界书",
      notes: "额外叮嘱",
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
        <p class="profile-muted">这是上限，不是 TA 已经记住的内容。关于你的记忆在相处中打开。记忆不是角色设定，也不是世界书。</p>
        <label class="field-label">每位角色最多记忆条数 · <span id="mem-max-val">${s.memoryCfg.maxPerRole}</span></label>
        <input type="range" class="slider" id="set-mem-max" min="10" max="100" step="5" value="${s.memoryCfg.maxPerRole}"
          oninput="document.getElementById('mem-max-val').textContent=this.value" />
        <label class="field-label" style="margin-top:16px">每次对话最多注入 · <span id="mem-inject-val">${s.memoryCfg.injectMax}</span> 条</label>
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
          ${SettingRow({ icon: Icons.download, title: "导出全部数据", desc: "把对话、记忆、相处和设定收成一份文件", onClick: "window.EchoApp.exportAll()" })}
          ${SettingRow({ icon: Icons.upload, title: "导入备份", desc: "从备份文件恢复，可看进度、可取消", onClick: "window.EchoApp.importAll()" })}
          ${SettingRow({ icon: Icons.trash, title: "清空所有对话", desc: "删除全部聊天记录，保留设置与记忆", onClick: "window.EchoApp.clearAllChats()", tone: "danger" })}
          ${SettingRow({ icon: Icons.warning, title: "重置应用", desc: "清除所有数据并恢复初始状态", onClick: "window.EchoApp.resetApp()", tone: "danger" })}
        </div>`;
      footer = `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">返回</button>`;
    } else if (section === "notes") {
      content = `
        <label class="field-label">给所有角色的补充说明</label>
        <p class="field-hint">出现在这一轮的附加说明里，不会写进记忆或关系。</p>
        <textarea class="input" id="set-extra-notes" rows="5" maxlength="800" placeholder="例如：回复短一点，不要列清单。">${esc(s.settings.extraNotes || "")}</textarea>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="window.EchoApp.openPromptPreview()">查看当前 Prompt</button>`;
      footer = `
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">返回</button>
        <button class="btn btn-primary" onclick="window.EchoApp.saveExtraNotes()">保存</button>`;
    } else if (section === "worldbook") {
      const ctx = this._wbContext || { mode: "global", bookId: "global" };
      const book =
        ctx.mode === "character" && ctx.roleId
          ? ensureCharacterBook(
              ctx.roleId,
              (store.getState().chats.find((c) => c.roleId === ctx.roleId) || {}).name
            )
          : getBook(ctx.bookId || "global") || listBooks().find((b) => b.id === "global");
      const chat = ctx.roleId ? store.getState().chats.find((c) => c.roleId === ctx.roleId) : null;
      titles.worldbook = ctx.mode === "character" ? `${chat?.name || "角色"}的世界书` : "世界书";
      content = renderWorldbookEditorHtml({
        book,
        roleId: ctx.roleId,
        editing: this._wbEditing?.entryId || null,
        characters: listCharactersForHub(),
      });
      footer = `<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">返回</button>`;
    } else if (section === "voice") {
      const sttOn = !!s.settings.sttEnabled;
      const sttOk = isSttSupported();
      content = `
        <div class="settings-group-body">
          ${SettingRow({
            icon: Icons.volume,
            title: "朗读回复",
            desc: s.settings.ttsEnabled ? "已开启：回复完成后自动朗读" : "已关闭",
            onClick: "window.EchoApp.toggleTTS();window.EchoApp.openSettings('voice')",
          })}
          ${SettingRow({
            icon: Icons.stop,
            title: "停止朗读",
            desc: "立刻停下当前语音",
            onClick: "window.EchoApp.stopSpeech()",
          })}
          ${SettingRow({
            icon: Icons.mic,
            title: "语音输入",
            desc: sttOk
              ? (sttOn ? "已开启：点麦克风说话，文字进输入框" : "已关闭")
              : sttSupportNote(),
            onClick: sttOk ? "window.EchoApp.toggleSttEnabled();window.EchoApp.openSettings('voice')" : "",
            right: sttOk ? "" : "<span></span>",
          })}
          <p class="profile-muted" style="margin:12px 16px 4px">${esc(sttSupportNote())}</p>
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
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
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
      this._pinChatToBottom = true;
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
        resetProductData().then(() => {
          showToast({ message: "应用已重置", type: "success" });
          setTimeout(() => location.reload(), 800);
        });
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
  saveExtraNotes() {
    const extraNotes = String(document.getElementById("set-extra-notes")?.value || "").slice(0, 800);
    store.updateSettings({ extraNotes });
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    this.render();
    showToast({ message: extraNotes.trim() ? "叮嘱已保存" : "已清空叮嘱", type: "success" });
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
    const chat = store.getCurrentChat();
    const roleId = chat?.roleId;
    if (!roleId) {
      showToast({ message: "请先打开一个对话", type: "info" });
      return;
    }
    this.openPreferencesSheet(roleId);
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
    const next = !s.settings.ttsEnabled;
    store.updateSettings({ ttsEnabled: next });
    if (!next) stopSpeech();
    showToast({ message: next ? "朗读已开启" : "朗读已关闭", type: "info" });
  },
  stopSpeech() {
    stopSpeech();
  },
  speakMessage(messageIndex) {
    const chat = store.getCurrentChat();
    const msg = peekMessages(chat?.id)?.[messageIndex];
    if (!msg?.text || msg.role === "me") return;
    speakText(msg.text);
  },
  speakMessageById(messageId) {
    this.speakMessage(this.indexByMessageId(messageId));
  },
  toggleSTT() {
    if (isDictating()) {
      stopDictation();
      this._syncMicButton();
      return;
    }
    if (!isSttSupported()) {
      showToast({ message: "当前浏览器不支持语音输入，请用 Chrome 或 Edge", type: "info" });
      return;
    }
    if (!store.getState().settings.sttEnabled) {
      showToast({ message: "语音输入已关闭，可在「我的 → 语音」打开", type: "info" });
      return;
    }
    stopSpeech();
    const input = document.getElementById("chat-input");
    this._sttBase = input?.value || "";
    const started = startDictation({
      lang: store.getState().settings.voiceLang || "zh-CN",
      onInterim: (text) => this._applyDictation(text, false),
      onFinal: (text) => this._applyDictation(text, true),
      onError: (code) => {
        this._syncMicButton();
        const msg = sttErrorMessage(code);
        if (msg) showToast({ message: msg, type: "info" });
      },
      onEnd: () => this._syncMicButton(),
    });
    if (!started.ok) {
      showToast({
        message: started.reason === "unsupported"
          ? "当前浏览器不支持语音输入，请用 Chrome 或 Edge"
          : "没法开始语音输入",
        type: "info",
      });
      this._syncMicButton();
      return;
    }
    this._syncMicButton();
  },
  toggleSttEnabled() {
    const next = !store.getState().settings.sttEnabled;
    store.updateSettings({ sttEnabled: next });
    if (!next) stopDictation();
    this._syncMicButton();
    showToast({ message: next ? "语音输入已开启" : "语音输入已关闭", type: "info" });
  },
  _applyDictation(text, isFinal) {
    const input = document.getElementById("chat-input");
    if (!input) return;
    const next = joinDictation(this._sttBase || "", text).slice(0, MAX_USER_MESSAGE_CHARS);
    input.value = next;
    if (isFinal) this._sttBase = next;
    this.autoGrowInput(input);
    this.updateChatCount(input);
    this.onChatInput(input);
  },
  _syncMicButton() {
    const btn = document.querySelector(".chat-mic-btn");
    if (!btn) return;
    const on = isDictating();
    btn.classList.toggle("is-listening", on);
    btn.classList.toggle("icon-btn-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.title = on ? "停止语音输入" : "语音输入";
    btn.setAttribute("aria-label", on ? "停止语音输入" : "语音输入");
  },
  async exportAll() {
    try {
      const data = await exportProductBackup();
      downloadFile(`echochat-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data));
      showToast({ message: "已导出全部数据", type: "success" });
    } catch (err) {
      showToast({ message: "导出失败", type: "error" });
    }
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
        this._importAbort = new AbortController();
        const total = (data.state?.chats || []).reduce((n, c) => n + ((c.messages || []).length), 0);
        this._paintImportProgress({ done: 0, total, percent: 0 });
        await importProductBackup(data, "merge", {
          signal: this._importAbort.signal,
          onProgress: (p) => this._paintImportProgress(p),
        });
        closeModal(this._importOverlay);
        this._importOverlay = null;
        import("./domain/message-store.js")
          .then(({ messageStore }) => messageStore.bootstrapStorage(store.getState().currentChatId))
          .catch(() => {});
        showToast({ message: "导入成功", type: "success" });
        this.render();
      } catch (err) {
        closeModal(this._importOverlay);
        this._importOverlay = null;
        const aborted = err?.name === "AbortError" || /aborted/.test(String(err?.message || ""));
        showToast({ message: aborted ? "已取消导入" : "导入失败", type: aborted ? "info" : "error" });
      }
    };
    input.click();
  },
  _paintImportProgress(progress) {
    const p = progress || {};
    const overlay = this._importOverlay;
    if (overlay?.isConnected) {
      const strong = overlay.querySelector(".import-progress-copy strong");
      const span = overlay.querySelector(".import-progress-copy span");
      const fill = overlay.querySelector(".import-progress-fill");
      const bar = overlay.querySelector(".import-progress-track");
      const done = Number(p.done) || 0;
      const total = Number(p.total) || 0;
      const pct = Number(p.percent) || 0;
      if (strong) strong.textContent = `${done.toLocaleString()} / ${total.toLocaleString()}`;
      if (span) span.textContent = `${pct}%`;
      if (fill) fill.style.width = `${pct}%`;
      if (bar) bar.setAttribute("aria-valuenow", String(pct));
      return;
    }
    this._importOverlay = openModal(importProgressMarkup(p));
  },
  cancelBulkImport() {
    this._importAbort?.abort();
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
      this._importAbort = new AbortController();
      const total = (this._recon.draft.messages || []).length;
      this._paintImportProgress({ done: 0, total, percent: 0 });
      const result = await confirmReconstruction(this._recon.draft, {
        signal: this._importAbort.signal,
        onProgress: (p) => this._paintImportProgress(p),
      });
      if (!result.ok) {
        closeModal(this._importOverlay);
        this._importOverlay = null;
        if (result.aborted) {
          showToast({ message: "已取消写入", type: "info" });
          this._paintReconstruction();
          return;
        }
        this._recon.error = "创建失败，请检查记录后再试。";
        this._paintReconstruction();
        return;
      }
      const charName = this._recon.draft?.name || "TA";
      const insufficient = result.insufficient;
      const wizardOverlay = this._recon.overlay;
      closeModal(this._importOverlay);
      this._importOverlay = null;
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
        if (insufficient) {
          showToast({ message: `${charName} 已创建，部分设定仍需补充`, type: "success" });
        }
      }, 1100);
    } catch (err) {
      closeModal(this._importOverlay);
      this._importOverlay = null;
      showToast({ message: "创建失败", type: "error" });
    }
  },

  _mem: { overlay: null, characterId: null, chatId: null, candidates: [], notice: "", error: "" },

  openMemoryCandidates(characterId, chatId) {
    closeModal(this._mem?.overlay);
    const parked = clonePendingForReview(characterId);
    if (parked?.candidates?.length) {
      this._mem = {
        overlay: null,
        characterId,
        chatId: parked.chatId || chatId || null,
        candidates: parked.candidates,
        notice: "",
        error: "",
      };
    } else {
      const extracted = extractMemoryCandidates(characterId, chatId ? { chatId } : {});
      this._mem = {
        overlay: null,
        characterId,
        chatId: chatId || null,
        candidates: extracted.candidates || [],
        notice: extracted.notice || "",
        error: extracted.ok ? "" : "无法提取记忆",
      };
    }
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
