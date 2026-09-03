// ============================================================
//  EchoChat · Views
//  陪伴优先：角色 Inbox → 聊天 → 相处中
//
//  IA entry points (vNext):
//  Chat → Hub row | Moment author
//  Profile → Chat header
//  Memory → Continuity sheet | message「记住」| memory confirm modal
//  Moments → Continuity sheet (no top-nav tab)
//  Worldbook → Me 高级 | Continuity sheet link
//  Create → openBring() only (Landing / Hub + / empty states)
//  Settings → Me chevron rows
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
  LogoMark,
  Segmented,
  ProfileRow,
} from "../components/index.js";
import { getReplyPace, REPLY_PACE_OPTIONS } from "../../domain/reply-pace.js";
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
import { hubSecondaryLine, presentCompanionStage, transcriptGroupFlags, PROFILE_PERSIST_MIN_WIDTH } from "../present.js";

function isWide() {
  return typeof window !== "undefined" && window.innerWidth >= PROFILE_PERSIST_MIN_WIDTH;
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
    ${activeTab === "me" ? renderMePane() : ""}
    ${activeTab === "companion" && currentChat ? renderChatPane(currentChat, false) : ""}
    ${activeTab === "companion" && !currentChat ? renderEmptyChat() : ""}
    ${showMask ? `<div class="profile-mask" onclick="window.EchoApp.toggleProfile()"></div>` : ""}
    ${showProfile ? renderProfilePane(currentChat) : ""}
    ${hideBottom ? "" : renderBottomNav(activeTab)}
  </div>`;
}

const TAB_ORDER = ["companion", "me"];

function renderNavRail(activeTab) {
  return `
  <nav class="nav-rail" aria-label="主导航">
    <div class="nav-logo" aria-hidden="true">${LogoMark({ size: 36 })}</div>
    <span class="nav-rail-indicator" aria-hidden="true"></span>
    <button class="nav-item ${activeTab === "companion" ? "nav-item-active" : ""}" onclick="window.EchoApp.switchTab('companion')" title="陪伴">
      ${Icons.message}<span class="nav-item-label">陪伴</span>
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
            const hasTalk = !!h.lastPreview || (affinity?.hasHistory);
            const presented = presentCompanionStage(affinity, hasTalk);
            return CharacterCard({
              name: h.name,
              avatar: resolveAvatarSrc(h.avatar),
              presence: hubSecondaryLine(presented),
              lastLine: h.lastPreview || "",
              time: h.lastAt ? relativeTime(h.lastAt) : "",
              stage: presented.stage,
              stageLabel: presented.label,
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
  const presented = presentCompanionStage(affinity, messages.length > 0);
  const stage = presented.label;

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
          <div class="chat-header-status" ${sending ? `aria-live="polite"` : ""}>${
            sending
              ? `<span class="chat-composing">正在整理思绪</span>`
              : StageChip({ label: stage, stage: presented.stage })
          }</div>
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
        : messages.map((m, i) => renderMessage(m, i, chat, messages)).join("")}
    </div>
    <div class="chat-input-area">
      <div class="chat-input-wrap">
        ${IconButton({ icon: Icons.mic, title: "语音输入", onClick: "window.EchoApp.toggleSTT()", className: "chat-mic-btn" })}
        <textarea class="chat-input" id="chat-input" placeholder="和 ${esc(chat.name || "TA")} 说点什么…" rows="1" onkeydown="window.EchoApp.handleInputKey(event)" oninput="window.EchoApp.onChatInput(this)"></textarea>
        ${sending
          ? `<button class="chat-send-btn chat-send-stop" onclick="window.EchoApp.stopSend()" title="停止">${Icons.stop}</button>`
          : `<button class="chat-send-btn motion-press" onclick="window.EchoApp.sendMessage()" title="发送">${Icons.send}</button>`}
      </div>
      <div class="composer-count" id="chat-count" hidden></div>
    </div>
  </div>`;
}

function renderMessage(m, index, chat, messages = []) {
  const isMe = m.role === "me";
  const isStreaming = m.status === "streaming";
  const isError = m.status === "error";
  const raw = m.text || "";
  if (isStreaming && !raw.trim()) return "";
  const flags = transcriptGroupFlags(messages, index);
  const text = renderMarkdown(raw);
  const settings = store.getState().settings;
  const myName = settings.myName || "我";
  const herName = chat.name || "角色";
  const avatar = flags.showAvatar
    ? `<button type="button" class="msg-avatar-btn" onclick="window.EchoApp.editCharacterFromChat()" aria-label="编辑角色资料">
        ${CharacterAvatar({ src: getRoleAvatar(chat), size: "sm", alt: herName, name: herName })}
      </button>`
    : isMe
      ? ""
      : `<span class="msg-avatar-slot" aria-hidden="true"></span>`;
  const groupClass = [
    flags.isGroupStart ? "msg-group-start" : "",
    flags.isGroupEnd ? "msg-group-end" : "",
    !flags.isGroupStart ? "msg-group-cont" : "",
  ].filter(Boolean).join(" ");
  return `
  <div class="msg ${isMe ? "msg-me" : "msg-her"} ${isStreaming ? "msg-streaming" : ""} ${isError ? "msg-error" : ""} ${groupClass}" data-msg-index="${index}">
    ${avatar}
    <button type="button" class="msg-more-btn" aria-label="消息操作" onclick="window.EchoApp.toggleMessageActions(this)">${Icons.more}</button>
    <div class="msg-col">
      ${flags.showName ? `<div class="msg-name">${esc(herName)}</div>` : ""}
      <div class="msg-bubble">${text || ""}</div>
      ${flags.showTime ? `<div class="msg-time">${formatDateTime(m.time)}</div>` : ""}
      ${isError ? `<div class="msg-status">没发出去<button type="button" class="msg-retry-btn" onclick="window.EchoApp.retryLastMessage()">重试</button></div>` : ""}
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

function replyPaceLabel(chat) {
  const pace = getReplyPace(chat);
  const opt = REPLY_PACE_OPTIONS.find((o) => o.value === pace);
  return opt ? opt.label : "自然";
}

function renderProfilePane(chat) {
  const roleId = getRoleId(chat);
  const memories = roleId ? getMemoryList(roleId, 8) : [];
  const roleMoments = roleId ? listMoments(roleId) : [];
  const latestMoment = roleMoments[0] || null;
  const latestMemory = memories[0] || null;
  const affinity = roleId ? getAffinity(roleId, { moments: roleMoments }) : null;
  const slots = getCharacterSlots(chat);
  const hasTalk = (peekMessages(chat.id) || []).length > 0;
  const worldPeek = roleId ? peekWorldbook(roleId) : [];
  const presented = presentCompanionStage(affinity, hasTalk);
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;

  const tracePeek = latestMoment || latestMemory
    ? `<button type="button" class="profile-peek" onclick="window.EchoApp.openContinuitySheet('${esc(roleId)}','${chat.id}')">
        ${latestMoment ? `<div class="profile-peek-line"><span class="profile-peek-tag">瞬间</span>${esc(latestMoment.content.slice(0, 48))}${latestMoment.content.length > 48 ? "…" : ""}</div>` : ""}
        ${latestMemory ? `<div class="profile-peek-line"><span class="profile-peek-tag">记忆</span>${esc(latestMemory.content.slice(0, 48))}${latestMemory.content.length > 48 ? "…" : ""}</div>` : ""}
      </button>`
    : `<p class="profile-muted profile-peek-empty">多聊几句，痕迹会在这里出现。</p>`;

  const memoryMeta = memories.length ? `${memories.length} 条记忆` : worldPeek.length ? `${worldPeek.length} 条设定` : "";
  const prefMeta = `${replyPaceLabel(chat)} · ${listActiveConversations(roleId).length} 条相处线`;

  return `
  <aside class="profile-pane open">
    <div class="profile-header">
      <button class="icon-btn profile-close" onclick="window.EchoApp.toggleProfile()" aria-label="关闭">${Icons.close}</button>
      ${CharacterAvatar({ src: getRoleAvatar(chat), size: "lg", className: "profile-avatar", alt: chat.name || "角色", name: chat.name || "角色" })}
      <div class="profile-name">${esc(chat.name || "角色")}</div>
      <div class="profile-status">${StageChip({ label: presented.label, stage: presented.stage })}</div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">关于 TA</div>
      <div class="profile-section-content">
        ${slots.identity
          ? `<div class="persona-clip">${esc(slots.identity.slice(0, 120))}${slots.identity.length > 120 ? "…" : ""}</div>`
          : `<p class="profile-muted">暂无设定</p>`}
      </div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">关系</div>
      <div class="profile-section-content">
        ${RelationshipBrief({ affinity, hasTalk, compact: true })}
      </div>
    </div>
    <div class="profile-actions">
      ${mobile ? `<button type="button" class="btn btn-primary btn-block" onclick="window.EchoApp.toggleProfile()">继续聊天</button>` : ""}
      ${roleId ? `<button type="button" class="btn btn-ghost btn-sm" onclick="window.EchoApp.editCharacter('${roleId}')">编辑人设</button>` : ""}
    </div>
    <div class="profile-section profile-section-peek">
      <div class="profile-section-title">相处痕迹</div>
      <div class="profile-section-content">${tracePeek}</div>
    </div>
    ${roleId ? `
    <div class="profile-rows">
      ${ProfileRow({
        title: "记忆与世界",
        meta: memoryMeta,
        onClick: `window.EchoApp.openContinuitySheet('${esc(roleId)}','${chat.id}')`,
      })}
      ${ProfileRow({
        title: "相处偏好",
        meta: prefMeta,
        onClick: `window.EchoApp.openPreferencesSheet('${esc(roleId)}')`,
      })}
      ${ProfileRow({
        title: "更多",
        meta: "导出角色卡",
        onClick: `window.EchoApp.openProfileMoreSheet('${esc(roleId)}')`,
      })}
    </div>
    ` : ""}
  </aside>`;
}

export function renderMomentsFeedHtml({ filterRoleId = "all", emptyAction = "" } = {}) {
  const filter = filterRoleId || store.getState().ui.momentsFilter || "all";
  const all = listMoments("all");
  const moments = filter === "all" ? all : all.filter((m) => m.roleId === filter || m.roleName === filter);
  const hub = listCharactersForHub();
  const avatarByRole = Object.fromEntries(hub.map((h) => [h.id, h.avatar]));

  if (moments.length === 0) {
    return EmptyState({
      icon: Icons.moments,
      title: "还没有瞬间",
      desc: "和角色多聊一会儿，确认记忆后会出现在这里。",
      actionText: emptyAction ? "去相处" : "",
      actionOnClick: emptyAction || "",
    });
  }

  return `<div class="moments-feed">${moments
    .map(
      (m) => `
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
        `
    )
    .join("")}</div>`;
}

function renderContinuityJournal(roleId, chatId) {
  const memories = roleId ? getMemoryList(roleId, 20) : [];
  const moments = roleId ? listMoments(roleId) : [];
  const items = [
    ...memories.map((m) => ({
      kind: "memory",
      content: m.content,
      time: Number(m.createdAt) || 0,
      id: m.id,
    })),
    ...moments.map((m) => ({
      kind: "moment",
      content: m.content,
      time: Number(m.createdAt) || 0,
      id: m.id,
    })),
  ].sort((a, b) => b.time - a.time);

  if (items.length === 0) {
    return `<p class="profile-muted continuity-empty">多聊几句，确认记忆后，痕迹会在这里出现。</p>`;
  }

  return `<div class="continuity-journal">${items
    .map((item) => {
      if (item.kind === "memory") {
        return MemoryRow({
          content: item.content,
          onDelete: roleId
            ? `window.EchoApp.deleteCharacterMemory('${roleId}','${item.id}');window.EchoApp.openContinuitySheet('${esc(roleId)}','${chatId}')`
            : "",
        });
      }
      return `<div class="trace-line">
        <span class="trace-tag">瞬间</span>
        <span class="trace-body">${esc(item.content)}</span>
        <span class="trace-when">${relativeTime(item.time)}</span>
      </div>`;
    })
    .join("")}</div>`;
}

export function renderContinuitySheetContent(roleId, chatId) {
  const worldPeek = roleId ? peekWorldbook(roleId) : [];
  const journal = renderContinuityJournal(roleId, chatId);

  return `
    ${journal}
    ${roleId ? `<button type="button" class="btn btn-secondary btn-sm sheet-action" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openMemoryCandidates('${esc(roleId)}','${chatId}')">从对话提取</button>` : ""}
    ${worldPeek.length
      ? `<div class="continuity-context">
          <div class="continuity-context-label">会注入对话的设定</div>
          ${worldPeek
            .slice(0, 4)
            .map(
              (w) =>
                `<div class="trace-line trace-line-context"><span class="trace-body">${esc(w.label)}${w.keys.length ? `<span class="profile-muted"> · ${esc(w.keys.slice(0, 3).join("、"))}</span>` : ""}</span></div>`
            )
            .join("")}
          <button type="button" class="btn btn-ghost btn-sm sheet-action" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openSettings('worldbook')">管理设定</button>
        </div>`
      : ""}`;
}

export function renderPreferencesSheetContent(chat) {
  const roleId = getRoleId(chat);
  const convos = roleId ? listActiveConversations(roleId) : [];
  return `
    <div class="sheet-section">
      <div class="sheet-section-title">回复速度</div>
      <div class="reply-pace-field" data-reply-pace-for="${esc(roleId)}">
        ${Segmented({
          options: REPLY_PACE_OPTIONS,
          value: getReplyPace(chat),
          onChange: `window.EchoApp.setCharacterReplyPace.bind(null, '${esc(roleId)}')`,
        })}
      </div>
    </div>
    <div class="sheet-section">
      <div class="sheet-section-title">相处线</div>
      ${convos
        .map(
          (c) => `
          <button type="button" class="conv-item ${c.id === chat.id ? "on" : ""}" onclick="window.EchoApp.openConversation('${c.id}');this.closest('.modal-overlay').remove()">
            <div class="n">${esc(c.name || "日常相处")}</div>
            <div class="d">${esc((c.lastPreview || "还没有聊过").slice(0, 42))}</div>
          </button>
        `
        )
        .join("")}
      ${roleId ? `<button type="button" class="btn btn-secondary btn-sm sheet-action" onclick="window.EchoApp.startNewConversation('${esc(roleId)}');this.closest('.modal-overlay').remove()">开一条新的相处线</button>` : ""}
    </div>`;
}

export function renderProfileMoreContent(roleId) {
  return `
    <div class="sheet-section">
      <button type="button" class="btn btn-secondary btn-block" onclick="window.EchoApp.exportCharacterCard('${esc(roleId)}');this.closest('.modal-overlay').remove()">导出角色卡</button>
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

  function meRow({ icon, title, value, action }) {
    return `<button type="button" class="me-settings-item" onclick="window.EchoApp.${action}">
      <div class="me-settings-item-icon">${icon}</div>
      <div class="me-settings-item-title">${title}</div>
      <div class="me-settings-item-value">${esc(value)}</div>
      <span class="me-settings-item-arrow">${Icons.chevronRight}</span>
    </button>`;
  }

  return `
  <div class="me-pane" id="me-scroll">
    <div class="inbox-head">
      <div>
        <h1 class="list-title">我的</h1>
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
        <div class="me-settings-group-title">连接</div>
        <div class="me-settings-list">
          ${meRow({ icon: Icons.database, title: "API 与模型", value: apiSummary(state.settings), action: "openSettings('api')" })}
          ${meRow({ icon: Icons.brain, title: "记忆", value: `每位 ${state.memoryCfg.maxPerRole} 条`, action: "openSettings('memory')" })}
        </div>
      </div>

      <div class="me-settings-group">
        <div class="me-settings-group-title">体验</div>
        <div class="me-settings-list">
          ${meRow({ icon: Icons.palette, title: "外观", value: appearanceSummary(state.settings), action: "openSettings('appearance')" })}
          ${meRow({ icon: Icons.volume, title: "语音", value: state.settings.ttsEnabled ? "朗读已开" : "朗读关", action: "openSettings('voice')" })}
        </div>
      </div>

      <div class="me-settings-group">
        <div class="me-settings-group-title">数据</div>
        <div class="me-settings-list">
          ${meRow({ icon: Icons.download, title: "备份", value: "导出或导入", action: "openSettings('backup')" })}
        </div>
      </div>

      <div class="me-settings-group">
        <div class="me-settings-group-title">高级</div>
        <div class="me-settings-list">
          ${meRow({ icon: Icons.book, title: "世界书", value: "关键词设定", action: "openSettings('worldbook')" })}
          ${meRow({ icon: Icons.sparkles, title: "Prompt 预览", value: "当前组装", action: "openPromptPreview()" })}
          ${meRow({ icon: Icons.refresh, title: "重新看引导", value: "", action: "resetOnboarding()" })}
        </div>
      </div>
    </div>
  </div>`;
}
