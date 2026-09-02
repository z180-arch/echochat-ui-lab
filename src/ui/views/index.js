// ============================================================
//  EchoChat · Views
//  陪伴优先：角色 Inbox → 聊天 → 相处中
// ============================================================

import { store } from "../../core/store.js";
import { esc, formatDateTime, relativeTime, renderMarkdown } from "../../core/utils.js";
import {
  Icons,
  Avatar,
  CharacterAvatar,
  CharacterCard,
  StageChip,
  MemoryRow,
  RelationshipBrief,
  EmptyState,
  IconButton,
  TypingIndicator,
  LogoMark,
} from "../components/index.js";
import { getRoleId, getRoleAvatar } from "../../domain/persona.js";
import { getMemoryList, getLastMemoryRetrieve } from "../../domain/memory.js";
import { listMoments } from "../../domain/moments.js";
import { getAffinity } from "../../domain/relations.js";
import { isSending, getStreamingChatId } from "../../domain/chat.js";
import { needsApiSetup } from "../../domain/provider.js";
import { THEME_PRESETS, findThemePreset, isCustomTheme } from "../theme.js";
import { peekMessages } from "../../domain/message-store.js";
import { listCharactersForHub, listActiveConversations, resolveAvatarSrc } from "../../domain/character-hub.js";
import { getCharacterSlots } from "../../domain/context-builder.js";
import { listBooks } from "../../domain/worldbook.js";

function isWide() {
  return typeof window !== "undefined" && window.innerWidth >= 1024;
}

function companionStage(affinity, hasTalk) {
  if (affinity?.hasHistory) return affinity.stageLabel;
  if (hasTalk) return "刚刚认识";
  return "还没有聊过";
}

// ============================================================
// Landing — 一句 slogan + 创建 / 开聊
// ============================================================
const LANDING_SLOGAN = "念念不忘，必有回响";

export function renderLanding() {
  const slogan = LANDING_SLOGAN.split("")
    .map((ch) => `<span class="lead-char">${ch === " " ? "&nbsp;" : esc(ch)}</span>`)
    .join("");
  return `
  <div class="landing">
    <div class="welcome-screen">
      <div class="welcome-mark">${LogoMark({ size: 64 })}</div>
      <h1>EchoChat</h1>
      <p class="welcome-lead">${slogan}</p>
      <div class="welcome-actions">
        <button class="btn btn-primary welcome-cta" onclick="window.EchoApp.openBring()">创建角色</button>
        <button class="btn btn-ghost" onclick="window.EchoApp.enterAppEmpty()">开始聊天</button>
      </div>
    </div>
  </div>`;
}

// slogan 逐字浮现：DOM 就绪后由 main.js 在 landing 渲染后调用
export function animateLanding() {
  if (typeof document === "undefined") return;
  const chars = document.querySelectorAll(".welcome-lead .lead-char");
  const title = document.querySelector(".welcome-screen h1");
  const actions = document.querySelector(".welcome-actions");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    chars.forEach((c) => c.classList.add("on"));
    title?.classList.add("on");
    actions?.classList.add("on");
    return;
  }
  requestAnimationFrame(() => {
    title?.classList.add("on");
    chars.forEach((c, i) => setTimeout(() => c.classList.add("on"), 140 + i * 48));
    setTimeout(() => actions?.classList.add("on"), 160 + chars.length * 48);
  });
}

// Onboarding view retired — reconstruction is the first path.
export function renderOnboarding() {
  return renderLanding();
}

export function setOnboardGender() {}
export function selectOnboardTemplate() {}
export function getOnboardSelection() {
  return null;
}
export function resetOnboarding() {}

// ============================================================
// Shell
// ============================================================
export function renderAppShell() {
  const state = store.getState();
  const activeTab = state.ui.activeTab;
  const currentChat = store.getCurrentChat();
  const searchQuery = state.ui.searchQuery || "";
  const wide = isWide();
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  const hideListMobile = activeTab === "companion" && !!currentChat;
  const showProfile = activeTab === "companion" && currentChat && (wide || state.ui.profileOpen);
  const hideBottom = mobile && activeTab === "companion" && !!currentChat;

  const showMask = !wide && showProfile;

  return `
  <div class="app-shell ${hideBottom ? "app-shell-chat" : ""}">
    ${renderNavRail(activeTab)}
    ${activeTab === "companion" ? renderCompanionInbox(searchQuery, currentChat, hideListMobile) : ""}
    ${activeTab === "moments" ? renderMomentsPane() : ""}
    ${activeTab === "me" ? renderMePane() : ""}
    ${activeTab === "companion" && currentChat ? renderChatPane(currentChat, false) : ""}
    ${activeTab === "companion" && !currentChat ? renderEmptyChat() : ""}
    ${showMask ? `<div class="profile-mask" onclick="window.EchoApp.toggleProfile()"></div>` : ""}
    ${showProfile ? renderProfilePane(currentChat) : ""}
    ${hideBottom ? "" : renderBottomNav(activeTab)}
  </div>`;
}

const TAB_ORDER = ["companion", "moments", "me"];

function renderNavRail(activeTab) {
  return `
  <nav class="nav-rail" aria-label="主导航">
    <div class="nav-logo" aria-hidden="true">${LogoMark({ size: 36 })}</div>
    <span class="nav-rail-indicator" aria-hidden="true"></span>
    <button class="nav-item ${activeTab === "companion" ? "nav-item-active" : ""}" onclick="window.EchoApp.switchTab('companion')" title="陪伴">
      ${Icons.message}<span class="nav-item-label">陪伴</span>
    </button>
    <button class="nav-item ${activeTab === "moments" ? "nav-item-active" : ""}" onclick="window.EchoApp.switchTab('moments')" title="瞬间">
      ${Icons.moments}<span class="nav-item-label">瞬间</span>
    </button>
    <div class="nav-spacer"></div>
    <button class="nav-item ${activeTab === "me" ? "nav-item-active" : ""}" onclick="window.EchoApp.switchTab('me')" title="我的">
      ${Icons.me}<span class="nav-item-label">我的</span>
    </button>
  </nav>`;
}

function renderBottomNav(activeTab) {
  const idx = Math.max(0, TAB_ORDER.indexOf(activeTab));
  const left = `${(idx + 0.5) * (100 / TAB_ORDER.length)}%`;
  return `
  <nav class="bottom-nav" aria-label="主导航" style="--tab-indicator-left:${left}">
    <span class="bottom-nav-indicator" aria-hidden="true"></span>
    <button class="bottom-nav-item ${activeTab === "companion" ? "bottom-nav-item-active" : ""}" onclick="window.EchoApp.switchTab('companion')">
      ${Icons.message}<span>陪伴</span>
    </button>
    <button class="bottom-nav-item ${activeTab === "moments" ? "bottom-nav-item-active" : ""}" onclick="window.EchoApp.switchTab('moments')">
      ${Icons.moments}<span>瞬间</span>
    </button>
    <button class="bottom-nav-item ${activeTab === "me" ? "bottom-nav-item-active" : ""}" onclick="window.EchoApp.switchTab('me')">
      ${Icons.me}<span>我的</span>
    </button>
  </nav>`;
}

function renderCompanionInbox(searchQuery, currentChat, hideListMobile) {
  const hub = listCharactersForHub().filter((h) => {
    if (!searchQuery) return true;
    return (h.name || "").toLowerCase().includes(searchQuery.toLowerCase());
  });
  const currentRole = currentChat ? getRoleId(currentChat) : null;

  return `
  <div class="list-pane ${hideListMobile ? "hidden-mobile" : ""}">
    <div class="inbox-head">
      <div>
        <h1 class="list-title">陪伴</h1>
        <p class="inbox-lead">和你长期相处的人</p>
      </div>
        ${IconButton({ icon: Icons.plus, title: "创建角色", onClick: "window.EchoApp.openBring()" })}
    </div>
    <div class="list-search">
      <div class="search-wrap">
        <span class="search-ic" aria-hidden="true">${Icons.search}</span>
        <input class="input input-search" type="search" placeholder="搜索角色" value="${esc(searchQuery)}" oninput="window.EchoApp.setSearch(this.value)" />
      </div>
    </div>
    <div class="list-body">
      ${hub.length === 0
        ? EmptyState({
            icon: Icons.message,
            title: "还没有你的角色",
            desc: "创建角色后，就可以开始相处。",
            actionText: "创建角色",
            actionOnClick: "window.EchoApp.openBring()",
          })
        : hub.map((h) => {
            const affinity = getAffinity(h.id, { moments: listMoments(h.id) });
            const preview = h.lastPreview || "";
            return CharacterCard({
              name: h.name,
              avatar: resolveAvatarSrc(h.avatar),
              preview,
              time: h.lastAt ? relativeTime(h.lastAt) : "",
              stage: affinity?.stage || "none",
              stageLabel: companionStage(affinity, !!preview),
              active: currentRole === h.id,
              onClick: `window.EchoApp.selectCharacter('${h.id}')`,
            });
          }).join("")}
    </div>
  </div>`;
}

function renderEmptyChat() {
  return `
  <div class="chat-pane hidden-mobile">
    ${EmptyState({
      icon: Icons.message,
      title: "选一个角色开始聊",
      desc: "从左侧列表进入，或先创建一个角色。",
      actionText: "创建角色",
      actionOnClick: "window.EchoApp.openBring()",
    })}
  </div>`;
}

function renderChatPane(chat, hideChatMobile) {
  const messages = peekMessages(chat.id);
  const sending = isSending() && getStreamingChatId() === chat.id;
  const roleId = getRoleId(chat);
  const affinity = roleId ? getAffinity(roleId, { moments: listMoments(roleId) }) : null;
  const convos = roleId ? listActiveConversations(roleId) : [];
  const empty = messages.length === 0;
  const stage = companionStage(affinity, messages.length > 0);

  const recall = getLastMemoryRetrieve();
  const showRecall = recall.hadHit && recall.chatId === chat.id && recall.preview;

  return `
  <div class="chat-pane ${hideChatMobile ? "hidden-mobile" : ""}">
    <div class="chat-header">
      <button class="icon-btn chat-back-btn" onclick="window.EchoApp.backToList()" aria-label="返回陪伴列表">${Icons.back}</button>
      <div class="chat-header-center" onclick="window.EchoApp.toggleProfile()" role="button" tabindex="0">
        ${CharacterAvatar({ src: getRoleAvatar(chat), size: "sm", alt: chat.name || "角色", name: chat.name || "角色" })}
        <div class="chat-header-copy">
          <div class="chat-header-name">${esc(chat.name || "角色")}</div>
          <div class="chat-header-status">${StageChip({ label: stage, stage: affinity?.stage || "none" })}</div>
        </div>
      </div>
      <div class="chat-header-actions">
        ${convos.length > 1
          ? `<button class="chip-btn" onclick="window.EchoApp.openConversationSwitcher()">${Icons.switch}<span>相处线</span></button>`
          : ""}
        ${IconButton({ icon: Icons.more, title: "相处中", onClick: "window.EchoApp.toggleProfile()" })}
      </div>
    </div>
    ${showRecall ? `<div class="recall-chip" aria-live="polite">想起了 ${esc(recall.preview)}</div>` : ""}
    ${convos.length > 1 ? `<button type="button" class="conv-hint" onclick="window.EchoApp.openConversationSwitcher()">当前 · ${esc(chat.name || "日常相处")}</button>` : ""}
    ${needsApiSetup(chat)
      ? `<div class="composer-hint">
          <span>连接模型后即可开始对话</span>
          <button type="button" class="link-btn" onclick="window.EchoApp.openApiConnect()">去配置</button>
        </div>`
      : ""}
    <div class="chat-messages" id="chat-messages">
      ${empty
        ? `<div class="chat-empty">
            ${CharacterAvatar({ src: getRoleAvatar(chat), size: "lg", alt: chat.name || "角色", name: chat.name || "角色" })}
            <div class="chat-empty-t">${messages.length || affinity?.hasHistory ? `继续和 ${esc(chat.name || "TA")} 相处` : `还没有和 ${esc(chat.name || "TA")} 聊过`}</div>
            <p>直接说一句就好。重要的事确认后，会成为你们的记忆。</p>
          </div>`
        : messages.map((m, i) => renderMessage(m, i, chat)).join("")}
    </div>
    <div class="chat-input-area">
      <div class="chat-input-wrap">
        ${IconButton({ icon: Icons.mic, title: "语音输入", onClick: "window.EchoApp.toggleSTT()", className: "chat-mic-btn" })}
        <textarea class="chat-input" id="chat-input" placeholder="和 ${esc(chat.name || "TA")} 说点什么…" rows="1" onkeydown="window.EchoApp.handleInputKey(event)" oninput="window.EchoApp.onChatInput(this)"></textarea>
        ${sending
          ? `<button class="chat-send-btn chat-send-stop" onclick="window.EchoApp.stopSend()" title="停止">${Icons.stop}</button>`
          : `<button class="chat-send-btn motion-press" onclick="window.EchoApp.sendMessage()" title="发送">${Icons.send}</button>`}
      </div>
      <div class="composer-count" id="chat-count">0 / 2000</div>
    </div>
  </div>`;
}

function renderMessage(m, index, chat) {
  const isMe = m.role === "me";
  const isStreaming = m.status === "streaming";
  const isError = m.status === "error";
  const raw = m.text || "";
  const showTyping = isStreaming && !raw.trim();
  const text = showTyping ? "" : renderMarkdown(raw);
  const settings = store.getState().settings;
  const myName = settings.myName || "我";
  const avatar = isMe
    ? `<button type="button" class="msg-avatar-btn" onclick="window.EchoApp.openUserProfile()" aria-label="编辑我的资料">
        ${Avatar({ src: settings.myAvatar || "assets/avatars/user-default.svg", size: "sm", circle: true, alt: myName })}
      </button>`
    : `<button type="button" class="msg-avatar-btn" onclick="window.EchoApp.editCharacterFromChat()" aria-label="编辑角色资料">
        ${CharacterAvatar({ src: getRoleAvatar(chat), size: "sm", alt: chat.name || "角色", name: chat.name || "角色" })}
      </button>`;
  return `
  <div class="msg ${isMe ? "msg-me" : "msg-her"} ${isStreaming ? "msg-streaming" : ""} ${isError ? "msg-error" : ""}" data-msg-index="${index}">
    ${avatar}
    <button type="button" class="msg-more-btn" aria-label="消息操作" onclick="window.EchoApp.toggleMessageActions(this)">${Icons.more}</button>
    <div class="msg-col">
      <div class="msg-name">${esc(isMe ? myName : chat.name || "TA")}</div>
      <div class="msg-bubble">${showTyping ? TypingIndicator() : text || ""}</div>
      <div class="msg-time">${formatDateTime(m.time)}</div>
      ${isError ? `<div class="msg-status">没发出去<button type="button" onclick="window.EchoApp.regenerateMessage(${index})">重试</button></div>` : ""}
      <div class="msg-actions">
        <button class="msg-action-btn" onclick="window.EchoApp.copyMessage(${index})">复制</button>
        <button class="msg-action-btn" onclick="window.EchoApp.rememberMessage(${index})">记住</button>
        ${!isMe ? `<button class="msg-action-btn" onclick="window.EchoApp.regenerateMessage(${index})">重生成</button>` : ""}
        ${isMe ? `<button class="msg-action-btn" onclick="window.EchoApp.editMessage(${index})">编辑</button>` : ""}
        <button class="msg-action-btn msg-action-danger" onclick="window.EchoApp.deleteMessage(${index})">删除</button>
      </div>
    </div>
  </div>`;
}

function peekWorldbook(roleId) {
  const rows = [];
  for (const book of listBooks()) {
    const mine = book.scope === "global" || book.roleId === roleId || book.roleKey === roleId;
    if (!mine) continue;
    for (const entry of book.entries || []) {
      if (entry.enabled === false) continue;
      const label = entry.name || (entry.keys || []).join("、") || "条目";
      rows.push({ label, keys: entry.keys || [] });
      if (rows.length >= 6) return rows;
    }
  }
  return rows;
}

function renderProfilePane(chat) {
  const roleId = getRoleId(chat);
  const memories = roleId ? getMemoryList(roleId, 8) : [];
  const moments = roleId ? listMoments(roleId).slice(0, 4) : [];
  const affinity = roleId ? getAffinity(roleId, { moments: listMoments(roleId) }) : null;
  const slots = getCharacterSlots(chat);
  const convos = roleId ? listActiveConversations(roleId) : [];
  const hasTalk = (peekMessages(chat.id) || []).length > 0;
  const worldPeek = roleId ? peekWorldbook(roleId) : [];

  return `
  <aside class="profile-pane open">
    <div class="profile-header">
      <button class="icon-btn profile-close" onclick="window.EchoApp.toggleProfile()" aria-label="关闭">${Icons.close}</button>
      ${CharacterAvatar({ src: getRoleAvatar(chat), size: "lg", className: "profile-avatar", alt: chat.name || "角色", name: chat.name || "角色" })}
      <div class="profile-name">${esc(chat.name || "角色")}</div>
      <div class="profile-status">${StageChip({ label: companionStage(affinity, hasTalk), stage: affinity?.stage || "none" })}${affinity?.hasHistory ? `<span>相处 ${affinity.knownDays} 天</span>` : ""}</div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">关于 TA</div>
      <div class="profile-section-content">
        ${slots.identity
          ? `<div class="persona-clip">${esc(slots.identity.slice(0, 220))}${slots.identity.length > 220 ? "…" : ""}</div>`
          : `<div class="profile-muted">暂无设定</div>`}
        ${slots.scenario ? `<p class="profile-slot"><span>情景</span>${esc(slots.scenario.slice(0, 160))}</p>` : ""}
        ${slots.speakingStyle ? `<p class="profile-slot"><span>语气</span>${esc(slots.speakingStyle.slice(0, 120))}</p>` : ""}
        ${slots.examples ? `<p class="profile-slot"><span>示例</span>${esc(slots.examples.slice(0, 120))}</p>` : ""}
      </div>
      ${roleId ? `
        <div class="profile-tools">
          <button class="btn btn-secondary btn-sm" onclick="window.EchoApp.editCharacter('${roleId}')">编辑</button>
          <button class="btn btn-ghost btn-sm" onclick="window.EchoApp.exportCharacterCard('${roleId}')">导出角色卡</button>
        </div>
      ` : ""}
    </div>
    <div class="profile-section">
      <div class="profile-section-title">关系</div>
      <div class="profile-section-content">
        ${RelationshipBrief({ affinity })}
      </div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">记忆</div>
      <div class="profile-section-content">
        ${memories.length === 0
          ? `<div class="profile-muted">还没有已确认的记忆。聊天里点「记住」，或从对话提取。</div>`
          : memories.map((m) => MemoryRow({
              content: m.content,
              onDelete: roleId ? `window.EchoApp.deleteCharacterMemory('${roleId}','${m.id}')` : "",
            })).join("")}
        ${roleId ? `<button class="btn btn-ghost btn-sm profile-extract" onclick="window.EchoApp.openMemoryCandidates('${roleId}','${chat.id}')">从对话提取</button>` : ""}
      </div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">世界书</div>
      <div class="profile-section-content">
        ${worldPeek.length === 0
          ? `<div class="profile-muted">还没有会注入对话的设定条目。</div>`
          : worldPeek.map((w) => `<div class="mem-line">${esc(w.label)}${w.keys.length ? `<span class="profile-muted"> · ${esc(w.keys.slice(0, 3).join("、"))}</span>` : ""}</div>`).join("")}
        <button class="btn btn-ghost btn-sm profile-extract" onclick="window.EchoApp.openSettings('worldbook')">管理条目</button>
      </div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">瞬间</div>
      <div class="profile-section-content">
        ${moments.length === 0
          ? `<div class="profile-muted">还没有瞬间。确认记忆后会出现在这里。</div>`
          : moments.map((m) => `<div class="mom-line">${esc(m.content)}<span>${relativeTime(m.createdAt)}</span></div>`).join("")}
      </div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">相处线</div>
      <div class="profile-section-content">
        <p class="profile-muted">同一位 ${esc(chat.name || "TA")} 的不同聊天主题。记忆与关系共享。</p>
        ${convos.map((c) => `
          <button type="button" class="conv-item ${c.id === chat.id ? "on" : ""}" onclick="window.EchoApp.openConversation('${c.id}')">
            <div class="n">${esc(c.name || "日常相处")}</div>
            <div class="d">${esc((c.lastPreview || "还没有聊过").slice(0, 42))}</div>
          </button>
        `).join("")}
        ${roleId ? `<button class="btn btn-ghost btn-sm" onclick="window.EchoApp.startNewConversation('${roleId}')">开一条新的相处线</button>` : ""}
      </div>
    </div>
  </aside>`;
}

function renderMomentsPane() {
  const filter = store.getState().ui.momentsFilter || "all";
  const all = listMoments("all");
  const moments = filter === "all" ? all : all.filter((m) => m.roleId === filter || m.roleName === filter);
  const hub = listCharactersForHub();
  const avatarByRole = Object.fromEntries(hub.map((h) => [h.id, h.avatar]));
  return `
  <div class="moments-pane">
    <div class="inbox-head">
      <div>
        <h1 class="list-title">瞬间</h1>
        <p class="inbox-lead">从相处里留下来的痕迹</p>
      </div>
      <select class="select moments-filter" onchange="window.EchoApp.setMomentsFilter(this.value)">
        <option value="all" ${filter === "all" ? "selected" : ""}>全部</option>
        ${hub.map((h) => `<option value="${esc(h.id)}" ${filter === h.id ? "selected" : ""}>${esc(h.name)}</option>`).join("")}
      </select>
    </div>
    <div class="moments-feed">
      ${moments.length === 0
        ? EmptyState({
            icon: Icons.moments,
            title: "还没有瞬间",
            desc: "和角色多聊一会儿，确认记忆后会出现在这里。",
            actionText: "去相处",
            actionOnClick: "window.EchoApp.switchTab('companion')",
          })
        : moments.map((m) => `
          <article class="moment-entry">
            <div class="moment-header">
              ${CharacterAvatar({ src: resolveAvatarSrc(avatarByRole[m.roleId] || m.avatar), size: "sm", alt: m.roleName, name: m.roleName })}
              <div>
                <button type="button" class="moment-who" onclick="window.EchoApp.selectCharacter('${m.roleId || ""}')">${esc(m.roleName)}</button>
                <div class="moment-when">${relativeTime(m.createdAt)}</div>
              </div>
            </div>
            <div class="moment-content">${esc(m.content)}</div>
            <div class="moment-actions">
              <button type="button" class="moment-action ${m.likedByUser ? "moment-action-liked" : ""}" onclick="window.EchoApp.toggleMomentLike('${m.id}', this)">
                ${Icons.heart}<span>${m.likes || 0}</span>
              </button>
              <button type="button" class="moment-action" onclick="document.getElementById('cmt-${m.id}')?.focus()">
                ${Icons.comment}<span>${m.comments?.length || 0}</span>
              </button>
            </div>
            ${(m.comments || []).length
              ? `<div class="moment-comments">${m.comments
                  .map((c) => `<div class="moment-comment"><b>${esc(c.who || c.author || "我")}</b> ${esc(c.text || c.content || "")}</div>`)
                  .join("")}</div>`
              : ""}
            <div class="moment-comment-row">
              <input class="input" id="cmt-${m.id}" placeholder="写评论…"
                onkeydown="if(event.key==='Enter'){event.preventDefault();window.EchoApp.commentMoment('${m.id}')}" />
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.EchoApp.commentMoment('${m.id}')">发送</button>
            </div>
          </article>
        `).join("")}
    </div>
  </div>`;
}

function apiSummary(settings) {
  if (needsApiSetup()) return "未配置";
  const provider = (settings.apiPresetId || "").replace(/^\w/, (c) => c.toUpperCase());
  const model = (settings.model || "").split("/").pop() || settings.model;
  return `${provider || "已配置"} · ${model || "模型"}`;
}

function appearanceSummary(settings) {
  if (settings.theme === "dark") return "暗色";
  if (settings.theme === "auto") return "跟随系统";
  if (isCustomTheme(settings)) return "自定义配色";
  return findThemePreset(settings.themePreset).name;
}

function renderMePane() {
  const state = store.getState();
  const characterCount = listCharactersForHub().length;
  const myName = state.settings.myName || "我";
  return `
  <div class="me-pane" id="me-scroll">
    <div class="inbox-head">
      <div>
        <h1 class="list-title">我的</h1>
        <p class="inbox-lead">都留在这台设备上</p>
      </div>
    </div>
    <div class="me-content">
      <button type="button" class="me-profile" onclick="window.EchoApp.openUserProfile()">
        ${Avatar({ src: state.settings.myAvatar || "assets/avatars/user-default.svg", size: "lg", circle: true, alt: myName })}
        <div class="me-profile-copy">
          <div class="me-name">${esc(myName)}</div>
          <div class="me-meta">${characterCount} 位角色 · 本地保存</div>
        </div>
        <span class="me-profile-edit">编辑资料</span>
      </button>

      <div class="me-settings-group">
        <div class="me-settings-group-title">这台设备</div>
        <div class="me-settings-list">
          ${[
            { icon: Icons.database, title: "API 与模型", desc: apiSummary(state.settings), action: "openSettings('api')" },
            { icon: Icons.brain, title: "记忆", desc: `每位最多 ${state.memoryCfg.maxPerRole} 条`, action: "openSettings('memory')" },
            { icon: Icons.palette, title: "外观", desc: appearanceSummary(state.settings), action: "openSettings('appearance')" },
            { icon: Icons.download, title: "备份", desc: "导出或导入全部数据", action: "openSettings('backup')" },
          ].map((item) => `
            <button type="button" class="me-settings-item" onclick="window.EchoApp.${item.action}">
              <div class="me-settings-item-icon">${item.icon}</div>
              <div class="me-settings-item-content">
                <div class="me-settings-item-title">${item.title}</div>
                <div class="me-settings-item-desc">${item.desc}</div>
              </div>
              <span class="me-settings-item-arrow">${Icons.chevronRight}</span>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="me-settings-group">
        <div class="me-settings-group-title">更多</div>
        <div class="me-settings-list">
          ${[
            { icon: Icons.book, title: "世界书", desc: "关键词设定注入", action: "openSettings('worldbook')" },
            { icon: Icons.volume, title: "语音", desc: state.settings.ttsEnabled ? "朗读已开" : "朗读与麦克风", action: "openSettings('voice')" },
            { icon: Icons.sparkles, title: "Prompt 预览", desc: "查看当前组装", action: "openPromptPreview()" },
            { icon: Icons.refresh, title: "重新看引导", desc: "回到欢迎页", action: "resetOnboarding()" },
          ].map((item) => `
            <button type="button" class="me-settings-item" onclick="window.EchoApp.${item.action}">
              <div class="me-settings-item-icon">${item.icon}</div>
              <div class="me-settings-item-content">
                <div class="me-settings-item-title">${item.title}</div>
                <div class="me-settings-item-desc">${item.desc}</div>
              </div>
              <span class="me-settings-item-arrow">${Icons.chevronRight}</span>
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  </div>`;
}
