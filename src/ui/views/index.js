// ============================================================
//  EchoChat · Views
//  陪伴优先：角色 Inbox → 聊天 → 相处中
//
//  IA entry points (vNext):
//  Chat → Hub row | Moment author
//  Profile → Chat header
//  Memory → Continuity sheet | message「记住」| memory confirm modal
//  Moments → 痕迹 tab | Profile peek | Continuity sheet
//  Worldbook → Me 高级 (global) | Character profile / edit (character)
//  Create → openBring() only (Landing / Hub + / empty states)
//  Settings → Me chevron rows
// ============================================================

import { store } from "../../core/store.js";
import { esc, formatDateTime, relativeTime, renderMarkdown, todayStr, dayDiff } from "../../core/utils.js";
import {
  Icons,
  Avatar,
  CharacterAvatar,
  CharacterCard,
  StageChip,
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
import { getPendingCandidates, userTextIsKept } from "../../domain/memory-candidates.js";
import { listMoments, listRoleOptions, momentSourceLabel } from "../../domain/moments.js";
import { getAffinity } from "../../domain/relations.js";
import { isSending, getStreamingChatId, getStreamingPreview } from "../../domain/chat.js";
import { needsApiSetup } from "../../domain/provider.js";
import { THEME_PRESETS, findThemePreset, isCustomTheme } from "../theme.js";
import { peekMessages, peekHasOlder } from "../../domain/message-store.js";
import { visibleRange, VIRT_ESTIMATE_PX } from "../virtual-list.js";
import { listCharactersForHub, listActiveConversations, resolveAvatarSrc } from "../../domain/character-hub.js";
import { isDictating } from "../../domain/stt.js";
import { getCharacterSlots } from "../../domain/context-builder.js";
import { listBooks } from "../../domain/worldbook.js";
import {
  hubSecondaryLine,
  presentCompanionStage,
  transcriptGroupFlags,
  PROFILE_PERSIST_MIN_WIDTH,
  companionRitual,
  reunionLine,
  meetStarterPrompts,
  definedGreeting,
  livedResume,
  hubResumeLine,
  clipPreview,
} from "../present.js";

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
      <p class="welcome-sub">先创建一个角色，再开始聊天。</p>
      <div class="welcome-beats">
        <div class="welcome-beat"><strong>角色</strong><span>一个陪伴对象</span></div>
        <div class="welcome-beat"><strong>记忆</strong><span>关于你的长期事实</span></div>
        <div class="welcome-beat"><strong>相处</strong><span>关系会慢慢靠近</span></div>
      </div>
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
  const beats = document.querySelector(".welcome-beats");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    chars.forEach((c) => c.classList.add("on"));
    title?.classList.add("on");
    actions?.classList.add("on");
    beats?.classList.add("on");
    return;
  }
  requestAnimationFrame(() => {
    title?.classList.add("on");
    chars.forEach((c, i) => setTimeout(() => c.classList.add("on"), 140 + i * 48));
    setTimeout(() => {
      beats?.classList.add("on");
      actions?.classList.add("on");
    }, 160 + chars.length * 48);
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
    ${showMask ? `<button type="button" class="profile-mask" onclick="window.EchoApp.toggleProfile()" aria-label="关闭角色资料"></button>` : ""}
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
    <button class="nav-item ${activeTab === "moments" ? "nav-item-active" : ""}" onclick="window.EchoApp.switchTab('moments')" title="痕迹">
      ${Icons.moments}<span class="nav-item-label">痕迹</span>
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
      ${Icons.moments}<span>痕迹</span>
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
            desc: "先有一个角色，才能开始聊天。",
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
              lastLine: hubResumeLine(h.lastPreview, h.lastAt),
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
      desc: "从左边选一位，或先创建一个。",
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
  const showThreadChip = roleId && (convos.length > 1 || messages.length > 0);
  const reunion = reunionLine(chat.lastMessageAt);
  const latestMoment = roleId ? listMoments(roleId)[0] : null;
  const latestMemory = roleId ? getMemoryList(roleId, 1)[0] : null;
  const lastUserOrAny = messages.length ? String(messages[messages.length - 1].text || "") : "";
  const resume = livedResume({
    lastPreview: chat.lastPreview || lastUserOrAny,
    lastAt: chat.lastMessageAt,
    latestMoment: latestMoment?.content || "",
    latestMemory: latestMemory?.content || "",
    stageLabel: presented.label,
  });
  const ritual = companionRitual({
    recallPreview: showRecall ? recall.preview : "",
    lastAt: chat.lastMessageAt,
    hasMessages: messages.length > 0,
    meetEarly: !!(affinity?.hasHistory && affinity.turns > 0 && affinity.turns <= 2) && !resume.show,
    sending,
  });
  const slots = getCharacterSlots(chat);
  const greeting = definedGreeting(chat);
  const starters = meetStarterPrompts(slots);
  const currentThreadTitle = convos.find((c) => c.id === chat.id)?.threadTitle || "日常相处";
  const threadChipLabel = convos.length > 1 ? currentThreadTitle : "相处线";
  const ritualClick =
    ritual.kind === "recall"
      ? `window.EchoApp.openContinuitySheet('${esc(roleId)}','${chat.id}')`
      : "window.EchoApp.toggleProfile()";
  const resumeClick = roleId
    ? `window.EchoApp.openContinuitySheet('${esc(roleId)}','${chat.id}')`
    : "window.EchoApp.toggleProfile()";

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
              : `${StageChip({ label: stage, stage: presented.stage })}${
                  reunion
                    ? `<span class="chat-header-days">${esc(reunion)}</span>`
                    : presented.hasHistory && presented.knownDays >= 2
                      ? `<span class="chat-header-days">认识第${presented.knownDays}天</span>`
                      : ""
                }`
          }</div>
        </div>
      </div>
      <div class="chat-header-actions">
        ${showThreadChip
          ? `<button type="button" class="chip-btn" onclick="window.EchoApp.openConversationSwitcher()">${Icons.switch}<span>${esc(threadChipLabel)}</span></button>`
          : ""}
        ${IconButton({ icon: Icons.more, title: "相处中", onClick: "window.EchoApp.toggleProfile()" })}
      </div>
    </div>
    ${
      ritual.kind === "recall"
        ? `<button type="button" class="recall-chip recall-chip-recall" aria-live="polite" onclick="${ritualClick}">${esc(ritual.text)}</button>`
        : !sending && resume.show
        ? `<button type="button" class="resume-card" aria-live="polite" onclick="${resumeClick}">
            ${resume.lines
              .map((line) => `<span class="resume-line resume-line-${line.kind}">${esc(line.text)}</span>`)
              .join("")}
          </button>`
        : ritual.kind
        ? `<button type="button" class="recall-chip recall-chip-${ritual.kind}" aria-live="polite" onclick="${ritualClick}">${esc(ritual.text)}</button>`
        : ""
    }
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
            ${!affinity?.hasHistory && slots.identity ? `<p class="meet-identity">${esc(clipPreview(slots.identity, 72))}</p>` : ""}
            ${!affinity?.hasHistory && greeting ? `<blockquote class="meet-hello">${esc(greeting)}</blockquote>` : ""}
            <p>${reunion ? `${esc(reunion)}。直接说一句就好。` : "直接说一句就好。重要的事会被悄悄记住，之后还能被想起来。"}</p>
            ${!affinity?.hasHistory ? `<div class="chat-starters">
              ${starters
                .map(
                  (text) =>
                    `<button type="button" class="chip-btn" data-prompt="${esc(text)}" onclick="window.EchoApp.fillComposer(this.dataset.prompt)">${esc(text)}</button>`
                )
                .join("")}
            </div>` : ""}
          </div>`
        : renderVirtualMessages(chat, messages, sending)}
    </div>
    <div class="chat-input-area">
      <div class="chat-input-wrap${sending ? " is-sending" : ""}">
        ${IconButton({
          icon: Icons.mic,
          title: isDictating() ? "停止语音输入" : "语音输入",
          onClick: "window.EchoApp.toggleSTT()",
          className: `chat-mic-btn${isDictating() ? " is-listening" : ""}`,
          active: isDictating(),
        })}
        <textarea class="chat-input" id="chat-input" placeholder="和 ${esc(chat.name || "TA")} 说点什么…" rows="1" onkeydown="window.EchoApp.handleInputKey(event)" oninput="window.EchoApp.onChatInput(this)"></textarea>
        ${sending
          ? `<button class="chat-send-btn chat-send-stop" onclick="window.EchoApp.stopSend()" title="停止">${Icons.stop}</button>`
          : `<button class="chat-send-btn motion-press" onclick="window.EchoApp.sendMessage()" title="发送">${Icons.send}</button>`}
      </div>
      <div class="composer-count" id="chat-count" hidden></div>
    </div>
  </div>`;
}

function renderVirtualMessages(chat, messages, sending) {
  const box = typeof document !== "undefined" ? document.getElementById("chat-messages") : null;
  const nearBottom =
    !box || box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const assumedBottom = !box || nearBottom;
  const est = VIRT_ESTIMATE_PX;
  const scrollTop = assumedBottom
    ? Math.max(0, messages.length * est)
    : box.scrollTop;
  const range = visibleRange({
    count: messages.length,
    scrollTop,
    viewportHeight: box?.clientHeight || 640,
    stickyTail: sending ? 1 : 0,
  });
  const older = peekHasOlder(chat.id)
    ? `<div class="msg-load-older" data-load-older="1" hidden></div>`
    : "";
  const padTop = range.padTop
    ? `<div class="msg-virt-pad" data-virt="top" style="height:${range.padTop}px" aria-hidden="true"></div>`
    : "";
  const padBottom = range.padBottom
    ? `<div class="msg-virt-pad" data-virt="bottom" style="height:${range.padBottom}px" aria-hidden="true"></div>`
    : "";
  const slice = messages.slice(range.start, range.end);
  return `${older}${padTop}${slice.map((m, j) => renderMessage(m, range.start + j, chat, messages)).join("")}${padBottom}`;
}

export function renderMessage(m, index, chat, messages = []) {
  const isMe = m.role === "me";
  const isStreaming = m.status === "streaming";
  const isError = m.status === "error";
  let raw = m.text || "";
  if (isStreaming && chat?.id) {
    raw = getStreamingPreview(chat.id) || raw;
  }
  if (isStreaming && !raw.trim()) return "";
  const flags = transcriptGroupFlags(messages, index);
  const text = renderMarkdown(raw);
  const herName = chat.name || "角色";
  const roleId = getRoleId(chat);
  const kept = isMe && m.status === "sent" && userTextIsKept(roleId, raw);
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
  <div class="msg ${isMe ? "msg-me" : "msg-her"} ${isStreaming ? "msg-streaming" : ""} ${isError ? "msg-error" : ""} ${groupClass}" data-msg-index="${index}" data-msg-id="${esc(m.id || "")}">
    ${avatar}
    <button type="button" class="msg-more-btn" aria-label="消息操作" onclick="window.EchoApp.toggleMessageActions(this)">${Icons.more}</button>
    <div class="msg-col">
      ${flags.showName ? `<div class="msg-name">${esc(herName)}</div>` : ""}
      <div class="msg-bubble">${text || ""}</div>
      ${flags.showTime ? `<div class="msg-time">${formatDateTime(m.time)}</div>` : ""}
      ${kept && roleId ? `<button type="button" class="msg-kept" onclick="window.EchoApp.openContinuitySheet('${esc(roleId)}','${chat.id}')">记下了</button>` : ""}
      ${isError ? `<div class="msg-status">${esc(m.errorText || "没发出去")}${!isSending() ? `<button type="button" class="msg-retry-btn" onclick="window.EchoApp.retryLastMessage()">重试</button>` : ""}</div>` : ""}
      <div class="msg-actions">
        <button class="msg-action-btn" onclick="window.EchoApp.copyMessageById('${esc(m.id || "")}')">复制</button>
        <button class="msg-action-btn" onclick="window.EchoApp.rememberMessageById('${esc(m.id || "")}')">记住</button>
        ${!isMe ? `<button class="msg-action-btn" onclick="window.EchoApp.speakMessageById('${esc(m.id || "")}')">朗读</button>` : ""}
        ${!isMe && !isError ? `<button class="msg-action-btn" onclick="window.EchoApp.regenerateMessageById('${esc(m.id || "")}')">重生成</button>` : ""}
        ${isMe ? `<button class="msg-action-btn" onclick="window.EchoApp.editMessageById('${esc(m.id || "")}')">编辑</button>` : ""}
        <button class="msg-action-btn msg-action-danger" onclick="window.EchoApp.deleteMessageById('${esc(m.id || "")}')">删除</button>
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
  const affinity = roleId ? getAffinity(roleId, { moments: roleMoments }) : null;
  const slots = getCharacterSlots(chat);
  const hasTalk = (peekMessages(chat.id) || []).length > 0;
  const worldPeek = roleId ? peekWorldbook(roleId) : [];
  const presented = presentCompanionStage(affinity, hasTalk);
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;

  const tracePeek = latestMoment
    ? `<button type="button" class="profile-peek" onclick="window.EchoApp.openMomentsFeed('${esc(roleId || "")}')">
        <div class="profile-peek-line"><span class="profile-peek-tag">瞬间</span>${esc(latestMoment.content.slice(0, 48))}${latestMoment.content.length > 48 ? "…" : ""}</div>
      </button>`
    : `<p class="profile-muted profile-peek-empty">一起经历过的片段会留在这里，不是聊天记录。</p>`;

  const memoryMeta = memories.length ? `${memories.length} 条关于你的事` : "还没有记下";
  const prefMeta = `${replyPaceLabel(chat)} · ${listActiveConversations(roleId).length} 条相处线`;
  const identity = String(slots.identity || "").trim();

  return `
  <aside class="profile-pane open">
    <div class="profile-scroll">
      <div class="profile-header">
        <button class="icon-btn profile-close" onclick="window.EchoApp.toggleProfile()" aria-label="关闭">${Icons.close}</button>
        ${CharacterAvatar({ src: getRoleAvatar(chat), size: "lg", className: "profile-avatar", alt: chat.name || "角色", name: chat.name || "角色" })}
        <div class="profile-name">${esc(chat.name || "角色")}</div>
        <div class="profile-status">${StageChip({ label: presented.label, stage: presented.stage })}</div>
        ${reunionLine(chat.lastMessageAt) ? `<p class="profile-muted">${esc(reunionLine(chat.lastMessageAt))}</p>` : ""}
        <p class="profile-kicker">关于 TA</p>
        ${identity
          ? `<p class="profile-lead">${esc(identity.slice(0, 120))}${identity.length > 120 ? "…" : ""}</p>`
          : `<p class="profile-muted profile-lead">还没写下 TA 是谁。</p>`}
      </div>
      <section class="profile-relate profile-section">
        <p class="profile-kicker">关系</p>
        ${RelationshipBrief({ affinity, hasTalk, compact: true })}
      </section>
      <section class="profile-together profile-section profile-section-peek">
        <button type="button" class="profile-kicker profile-kicker-link" onclick="window.EchoApp.openMomentsFeed('${esc(roleId || "")}')">一起经历过</button>
        ${tracePeek}
        ${roleId ? ProfileRow({
          title: "关于你的记忆",
          meta: memoryMeta,
          onClick: `window.EchoApp.openContinuitySheet('${esc(roleId)}','${chat.id}')`,
        }) : ""}
      </section>
      ${roleId ? `
      <section class="profile-support">
        <div class="profile-rows">
          ${ProfileRow({
            title: "角色世界书",
            meta: worldPeek.length ? `${worldPeek.length} 条设定` : "只属于 TA",
            onClick: `window.EchoApp.openCharacterWorldbook('${esc(roleId)}')`,
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
      </section>
      ` : ""}
    </div>
    <div class="profile-actions">
      ${mobile ? `<button type="button" class="btn btn-primary btn-block" onclick="window.EchoApp.toggleProfile()">继续聊天</button>` : ""}
      ${roleId ? `<button type="button" class="btn btn-ghost btn-sm" onclick="window.EchoApp.editCharacter('${roleId}')">编辑人设</button>` : ""}
    </div>
  </aside>`;
}

function momentDayLabel(ts) {
  const key = todayStr(ts);
  const today = todayStr();
  const diff = dayDiff(key, today);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  const d = new Date(Number(ts) || Date.now());
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  if (d.getFullYear() !== new Date().getFullYear()) {
    return `${d.getFullYear()}年${mo}月${day}日`;
  }
  return `${mo}月${day}日`;
}

function groupMomentsByDay(moments) {
  const groups = [];
  const seen = new Map();
  for (const m of moments) {
    const key = todayStr(m.createdAt);
    let group = seen.get(key);
    if (!group) {
      group = { key, label: momentDayLabel(m.createdAt), items: [] };
      seen.set(key, group);
      groups.push(group);
    }
    group.items.push(m);
  }
  return groups;
}

function momentContextLine(m) {
  if (!m.chatId) return "";
  const chat = (store.getState().chats || []).find((c) => c.id === m.chatId);
  return chat?.name || "";
}

function renderMomentsPane() {
  const filter = store.getState().ui.momentsFilter || "all";
  const hub = listCharactersForHub();
  const fromMoments = listRoleOptions();
  const names = new Map(fromMoments.map((r) => [r.roleId, r.roleName]));
  hub.forEach((h) => {
    if (!names.has(h.id)) names.set(h.id, h.name);
  });
  const options = [{ roleId: "all", roleName: "所有角色" }, ...[...names.entries()].map(([roleId, roleName]) => ({ roleId, roleName }))];
  return `
  <div class="moments-pane" id="moments-scroll">
    <div class="inbox-head">
      <div>
        <h1 class="list-title">痕迹</h1>
      </div>
      <select class="moments-filter" id="moments-filter" aria-label="筛选角色" onchange="window.EchoApp.setMomentsFilter(this.value)">
        ${options
          .map(
            (o) =>
              `<option value="${esc(o.roleId)}" ${o.roleId === filter ? "selected" : ""}>${esc(o.roleName)}</option>`
          )
          .join("")}
      </select>
    </div>
    ${renderMomentsFeedHtml({ filterRoleId: filter, emptyAction: "window.EchoApp.switchTab('companion')" })}
  </div>`;
}

export function renderMomentsFeedHtml({ filterRoleId = "all", emptyAction = "" } = {}) {
  const filter = filterRoleId || store.getState().ui.momentsFilter || "all";
  const all = listMoments("all");
  const moments = filter === "all" ? all : all.filter((m) => m.roleId === filter || m.roleName === filter);
  const hub = listCharactersForHub();
  const avatarByRole = Object.fromEntries(hub.map((h) => [h.id, h.avatar]));

  if (moments.length === 0) {
    return `<div class="moments-feed moments-empty">${EmptyState({
      icon: Icons.moments,
      title: "还没有一起经历过的事",
      desc: "相处里发生过的片段会按天留在这里，不是整段聊天记录。",
      actionText: emptyAction ? "去相处" : "",
      actionOnClick: emptyAction || "",
    })}</div>`;
  }

  return `<div class="moments-feed">${groupMomentsByDay(moments)
    .map((group) => {
      const items = group.items
        .map((m) => {
          const context = momentContextLine(m);
          const when = relativeTime(m.createdAt);
          const src = momentSourceLabel(m.source);
          return `
          <article class="moment-entry lived-card">
            <div class="moment-header">
              ${CharacterAvatar({ src: resolveAvatarSrc(avatarByRole[m.roleId] || m.avatar), size: "sm", alt: m.roleName, name: m.roleName })}
              <div class="moment-head-copy">
                <div class="moment-who-row">
                  <button type="button" class="moment-who" onclick="window.EchoApp.selectCharacter('${m.roleId || ""}')">${esc(m.roleName)}</button>
                  ${src ? `<span class="moment-src-tag">${esc(src)}</span>` : ""}
                </div>
                <div class="moment-when">${esc(when)}${context ? `<span class="moment-src"> · ${esc(context)}</span>` : ""}</div>
              </div>
              <button type="button" class="moment-del" onclick="window.EchoApp.deleteMomentEntry('${m.id}')" aria-label="删掉这条痕迹">${Icons.trash}</button>
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
                  .map((c) => `<div class="moment-comment"><b>${esc(c.who || c.author || (c.from === "her" ? m.roleName : "我"))}</b> ${esc(c.text || c.content || "")}</div>`)
                  .join("")}</div>`
              : ""}
            <div class="moment-comment-row">
              <input class="input" id="cmt-${m.id}" placeholder="写一句…"
                onkeydown="if(event.key==='Enter'){event.preventDefault();window.EchoApp.commentMoment('${m.id}')}" />
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.EchoApp.commentMoment('${m.id}')">发送</button>
            </div>
          </article>
        `;
        })
        .join("");
      return `<section class="moment-day" aria-label="${esc(group.label)}">
        <h2 class="moment-day-label">${esc(group.label)}</h2>
        <div class="moment-day-rail">${items}</div>
      </section>`;
    })
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
    return `<p class="profile-muted continuity-empty">聊过具体的事后，关于你的记忆会出现在这里。一起经历过的片段会进痕迹。</p>`;
  }

  return `<div class="continuity-journal lived-journal">${items
    .map((item) => {
      if (item.kind === "memory") {
        return `<div class="trace-line trace-line-memory">
        <span class="trace-tag">记忆</span>
        <span class="trace-body">${esc(item.content)}</span>
        ${roleId
          ? `<button type="button" class="memory-row-del" onclick="window.EchoApp.deleteCharacterMemory('${roleId}','${item.id}');window.EchoApp.openContinuitySheet('${esc(roleId)}','${chatId}')" aria-label="删除这条记忆">${Icons.trash}</button>`
          : `<span class="trace-when">${relativeTime(item.time)}</span>`}
      </div>`;
      }
      return `<div class="trace-line trace-line-moment">
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
  const pendingCount = roleId ? (getPendingCandidates(roleId)?.candidates?.length || 0) : 0;
  const affinity = roleId ? getAffinity(roleId, { moments: listMoments(roleId) }) : null;
  const presented = presentCompanionStage(affinity, !!affinity?.hasHistory);

  return `
    <p class="recon-lead">这里是 TA 记住的关于你的事，和你们一起经历过的片段。不是聊天记录。</p>
    <div class="continuity-legend">
      <div class="continuity-legend-card">
        <div class="continuity-legend-k">记忆</div>
        <p>关于你的长期事实</p>
      </div>
      <div class="continuity-legend-card">
        <div class="continuity-legend-k">瞬间</div>
        <p>你们一起经历过的片段</p>
      </div>
      <div class="continuity-legend-card">
        <div class="continuity-legend-k">相处</div>
        <p>关系怎么慢慢靠近</p>
      </div>
    </div>
    <div class="continuity-rel">${RelationshipBrief({ affinity, hasTalk: presented.hasHistory, compact: true })}</div>
    ${journal}
    ${pendingCount ? `<p class="profile-muted">有 ${pendingCount} 条待确认的记忆。</p>` : ""}
    <div class="sheet-actions-row">
      ${roleId ? `<button type="button" class="btn btn-ghost btn-sm sheet-action" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openMomentsFeed('${esc(roleId)}')">全部痕迹</button>` : ""}
      ${roleId ? `<button type="button" class="btn btn-secondary btn-sm sheet-action" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openMemoryCandidates('${esc(roleId)}','${chatId}')">从对话提取</button>` : ""}
    </div>
    <div class="continuity-context">
      <div class="continuity-context-label">会注入对话的设定</div>
      ${worldPeek.length
        ? worldPeek
            .slice(0, 4)
            .map(
              (w) =>
                `<div class="trace-line trace-line-context"><span class="trace-body">${esc(w.label)}${w.keys.length ? `<span class="profile-muted"> · ${esc(w.keys.slice(0, 3).join("、"))}</span>` : ""}</span></div>`
            )
            .join("")
        : `<p class="profile-muted">还没有只属于这个角色的设定。世界书不是记忆，也不是人设。</p>`}
      ${roleId ? `<button type="button" class="btn btn-ghost btn-sm sheet-action" onclick="this.closest('.modal-overlay').remove();window.EchoApp.openCharacterWorldbook('${esc(roleId)}')">管理角色世界书</button>` : ""}
    </div>`;
}

export function renderConversationThreadList({ convos = [], currentId = "" } = {}) {
  if (!convos.length) {
    return `<p class="profile-muted">还没有相处线。开一条新的就可以开始聊。</p>`;
  }
  return `<div class="conv-list">${convos
    .map((c) => {
      const on = c.id === currentId;
      const preview = String(c.lastPreview || "").trim();
      const when = c.lastAt ? relativeTime(c.lastAt) : "";
      const detail = preview ? clipPreview(preview, 42) : "还没有聊过";
      return `
        <div class="conv-row">
          <button type="button" class="conv-item ${on ? "on" : ""}" onclick="window.EchoApp.openConversation('${c.id}');this.closest('.modal-overlay')?.remove()">
            <span class="conv-item-head">
              <span class="n">${esc(c.threadTitle || "日常相处")}</span>
              ${on ? `<span class="conv-now">正在聊</span>` : ""}
            </span>
            <span class="d">${esc(detail)}${when ? `<span class="conv-when"> · ${esc(when)}</span>` : ""}</span>
          </button>
          <div class="conv-tools">
            ${IconButton({
              icon: Icons.edit,
              title: "改名",
              onClick: `window.EchoApp.openThreadRename('${c.id}')`,
              className: "conv-tool",
            })}
            ${IconButton({
              icon: Icons.trash,
              title: "删除这条相处线",
              onClick: `window.EchoApp.deleteChat('${c.id}')`,
              className: "conv-tool conv-tool-danger",
            })}
          </div>
        </div>`;
    })
    .join("")}</div>`;
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
      <p class="profile-muted">同一位角色的不同聊天。记忆和关系跟着角色走。</p>
      ${renderConversationThreadList({ convos, currentId: chat.id })}
      ${roleId ? `<button type="button" class="btn btn-secondary btn-sm sheet-action" onclick="window.EchoApp.startNewConversation('${esc(roleId)}');this.closest('.modal-overlay').remove()">开一条新的相处线</button>` : ""}
    </div>`;
}

export function renderProfileMoreContent(roleId) {
  return `
    <div class="sheet-section">
      <button type="button" class="btn btn-secondary btn-block" onclick="this.closest('.modal-overlay').remove();window.EchoApp.previewCharacterCard('${esc(roleId)}')">预览角色卡</button>
      <button type="button" class="btn btn-ghost btn-block" onclick="window.EchoApp.exportCharacterCard('${esc(roleId)}');this.closest('.modal-overlay').remove()">导出角色卡</button>
      <button type="button" class="btn btn-danger btn-block sheet-action" onclick="window.EchoApp.deleteCharacter('${esc(roleId)}')">删除角色</button>
    </div>`;
}

export function renderCharacterShareCard(card) {
  const d = card?.data || {};
  const name = d.name || "角色";
  const desc = String(d.description || "").trim();
  const personality = String(d.personality || "").trim();
  const scenario = String(d.scenario || "").trim();
  const likes = String(d.extensions?.echochat?.likes || "").trim();
  const avatar = d.extensions?.echochat?.avatar || "";
  return `
    <div class="share-card">
      ${CharacterAvatar({ src: avatar, size: "lg", alt: name, name })}
      <div class="share-card-name">${esc(name)}</div>
      <p class="share-card-note">这是人设，不含你们的记忆。</p>
      <p class="share-card-spec">Character Card V2 · 可导出分享</p>
      ${desc ? `<p class="share-card-body">${esc(desc)}</p>` : `<p class="profile-muted">还没有一句话描述。</p>`}
      ${personality ? `<p class="profile-muted">说话方式 · ${esc(personality)}</p>` : ""}
      ${scenario ? `<p class="profile-muted">情景 · ${esc(scenario)}</p>` : ""}
      ${likes ? `<p class="profile-muted">喜欢 · ${esc(likes)}</p>` : ""}
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
        <div class="me-settings-group-title">对话</div>
        <div class="me-settings-list">
          ${meRow({ icon: Icons.database, title: "API 与模型", value: apiSummary(state.settings), action: "openSettings('api')" })}
          ${meRow({ icon: Icons.brain, title: "记忆条数", value: `每位 ${state.memoryCfg.maxPerRole} 条`, action: "openSettings('memory')" })}
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
          ${meRow({ icon: Icons.book, title: "世界书", value: "全局设定", action: "openSettings('worldbook')" })}
          ${meRow({ icon: Icons.sparkles, title: "额外叮嘱", value: state.settings.extraNotes ? "已填写" : "可选", action: "openSettings('notes')" })}
          ${meRow({ icon: Icons.refresh, title: "重新看引导", value: "", action: "resetOnboarding()" })}
        </div>
      </div>
    </div>
  </div>`;
}

export function renderWorldbookEditorHtml({ book, roleId = null, editing = null, characters = [] } = {}) {
  const target = book || { id: "global", entries: [] };
  const entries = (target.entries || []).slice(0, 40);
  const isCharacter = target.scope === "character" || !!roleId;
  const editEntry = editing && (target.entries || []).find((e) => e.id === editing);
  const keysValue = editEntry ? (editEntry.keys || []).join(", ") : "";
  const contentValue = editEntry ? editEntry.content || "" : "";
  const constantChecked = editEntry ? !!editEntry.constant : false;
  const enabledChecked = editEntry ? editEntry.enabled !== false : true;
  const characterOptions = (characters || []).filter((c) => c && c.id);
  const scopeHint = isCharacter
    ? "只在和这个角色聊天时用到。关键词对上，或勾选「总是带上」，才会写进这一轮。"
    : "所有角色都可能用到。角色专属设定请到角色页管理。";

  return `
    ${!isCharacter && characterOptions.length
      ? `<label class="field-label">角色专属</label>
        <select class="input" onchange="if(this.value){window.EchoApp.openCharacterWorldbook(this.value)}">
          <option value="">打开某个角色的世界书…</option>
          ${characterOptions.map((c) => `<option value="${esc(c.id)}">${esc(c.name || "角色")}</option>`).join("")}
        </select>`
      : ""}
    <p class="field-hint">${esc(scopeHint)}</p>
    <label class="field-label">关键词（逗号分隔）</label>
    <input class="input" id="wb-keys" placeholder="雨天, 咖啡馆" value="${esc(keysValue)}" />
    <label class="field-label">设定</label>
    <textarea class="input" id="wb-content" rows="4" maxlength="1200" placeholder="只有提到关键词时才会用到。">${esc(contentValue)}</textarea>
    <div class="wb-flags">
      <label class="wb-flag"><input type="checkbox" id="wb-enabled" ${enabledChecked ? "checked" : ""} /> 启用</label>
      <label class="wb-flag"><input type="checkbox" id="wb-constant" ${constantChecked ? "checked" : ""} /> 总是带上</label>
    </div>
    ${editEntry
      ? `<input type="hidden" id="wb-edit-id" value="${esc(editEntry.id)}" />
         <button type="button" class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="window.EchoApp.saveWorldbookEntry('${esc(target.id)}')">保存修改</button>
         <button type="button" class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="window.EchoApp.cancelWorldbookEdit()">取消</button>`
      : `<button type="button" class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="window.EchoApp.addWorldbookEntry('${esc(target.id)}')">添加条目</button>`}
    <div class="wb-list" style="margin-top:16px">
      ${entries.length
        ? entries
            .map((e) => {
              const on = e.enabled !== false;
              const keys = (e.keys || []).join("、");
              const label = e.name || keys || "条目";
              return `<div class="mem-line memory-row">
                <button type="button" class="wb-toggle ${on ? "on" : ""}" onclick="window.EchoApp.toggleWorldbookEntry('${esc(target.id)}','${esc(e.id)}')" aria-label="${on ? "停用" : "启用"}">${on ? "开" : "关"}</button>
                <button type="button" class="memory-row-text wb-entry-open" onclick="window.EchoApp.editWorldbookEntry('${esc(target.id)}','${esc(e.id)}')">
                  <b>${esc(label)}</b>${keys ? ` · ${esc(keys)}` : ""}${e.constant ? " · 总是" : ""}
                </button>
                <button type="button" class="memory-row-del" onclick="window.EchoApp.deleteWorldbookEntry('${esc(target.id)}','${esc(e.id)}')" aria-label="删除条目">${Icons.trash}</button>
              </div>`;
            })
            .join("")
        : `<p class="profile-muted">${isCharacter ? "还没有只属于这个角色的条目。" : "还没有条目。写好关键词和设定后点添加。"}</p>`}
    </div>
    ${isCharacter
      ? `<button type="button" class="btn btn-ghost btn-sm sheet-action" onclick="window.EchoApp.openSettings('worldbook')">打开全局世界书</button>`
      : ""}`;
}
