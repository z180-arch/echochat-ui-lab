// ============================================================
//  EchoChat Rebuild · Views
//  各页面视图渲染函数
// ============================================================

import { store } from "../../core/store.js";
import { events, EVT } from "../../core/events.js";
import { esc, formatDateTime, relativeTime, renderMarkdown } from "../../core/utils.js";
import { Icons, Avatar, EmptyState, Button, IconButton, TypingIndicator, showToast, openModal } from "../components/index.js";
import { getSystemTemplates, getRoleId, getRoleName, getRoleAvatar, getPersona } from "../../domain/persona.js";
import { getMemoryList, buildMemoryBlock } from "../../domain/memory.js";
import { listMoments, toggleLike, addComment } from "../../domain/moments.js";
import { getAffinity } from "../../domain/relations.js";
import { isSending, getStreamingChatId } from "../../domain/chat.js";

const CFG = window.ECHOCHAT_CONFIG || {};

// ============================================================
// Landing 页
// ============================================================
export function renderLanding() {
  const roles = getSystemTemplates();
  return `
  <div class="landing">
    <div class="landing-hero">
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
          <div class="nav-logo">E</div>
          <span style="font-size:20px;font-weight:700;">EchoChat</span>
        </div>
        <h1 class="landing-title">让角色记住你，<br>让关系继续发展。</h1>
        <p class="landing-subtitle" style="font-size:16px;color:var(--color-primary);font-weight:600;">念念不忘，必有回响</p>
        <p class="landing-desc">和角色持续对话。她会记住你说过的事，关系会慢慢靠近，动态里留下生活痕迹。人设、记忆与世界书都留在本机。</p>
        <div class="landing-cta-group">
          <button class="btn btn-primary" style="min-width:140px;" onclick="window.EchoApp.startOnboarding()">开始聊天</button>
          <button class="btn btn-secondary" onclick="window.EchoApp.showMore()">了解更多</button>
        </div>
        <div style="font-size:13px;color:var(--color-text-tertiary);cursor:pointer;" onclick="window.EchoApp.importBackup()">导入完整备份</div>
        <div class="landing-features" style="margin-top:32px;">
          ${[
            { icon: Icons.sparkles, title: "角色", desc: "不是通用聊天机器人" },
            { icon: Icons.message, title: "对话", desc: "持续、可读、流式回复" },
            { icon: Icons.brain, title: "记忆", desc: "她记得你说过的" },
            { icon: Icons.heart, title: "关系", desc: "认识几天，越来越熟悉" },
            { icon: Icons.moments, title: "动态", desc: "角色生活留下的痕迹" },
          ].map(f => `
            <div class="landing-feature">
              <div class="landing-feature-icon">${f.icon}</div>
              <div class="landing-feature-text"><h4>${f.title}</h4><p>${f.desc}</p></div>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="landing-preview">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          ${Avatar({ src: "assets/avatars/baiyueguang.svg", size: "md" })}
          <div>
            <div style="font-weight:600;">白若</div>
            <div style="font-size:12px;color:var(--color-text-secondary);display:flex;align-items:center;gap:4px;"><span class="status-dot"></span>在线 · 刚刚认识</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;flex:1;">
          <div class="msg msg-her" style="padding:0;">
            <div class="msg-bubble">嗯，你来了。今天……还好吗。</div>
          </div>
          <div class="msg msg-me" style="padding:0;justify-content:flex-end;">
            <div class="msg-bubble">挺好的，就是有点累。</div>
          </div>
          <div class="msg msg-her" style="padding:0;">
            <div class="msg-bubble">辛苦了。要不要说说发生了什么？我在呢。</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--color-text-tertiary);text-align:center;margin-top:8px;">对话与记忆只存在本机浏览器，不经过我们的服务器。</div>
      </div>
    </div>
    <div class="landing-roles">
      <h2 class="landing-roles-title">先认识这些声音</h2>
      <div class="landing-roles-grid">
        ${roles.slice(0, 8).map(r => `
          <div class="role-card" onclick="window.EchoApp.selectTemplate('${r.name}')">
            ${Avatar({ src: r.avatar, size: "md" })}
            <div class="role-card-name">${esc(r.name)}</div>
            <div class="role-card-tag">${esc(r.tag || "")}</div>
            <div class="role-card-preview">${esc(r.firstMessage?.slice(0, 40) || "")}…</div>
          </div>
        `).join("")}
      </div>
    </div>
  </div>`;
}

// ============================================================
// Onboarding 引导页
// ============================================================
let onboardState = { step: 1, gender: "female", selectedTemplate: null };

export function renderOnboarding() {
  const templates = getSystemTemplates(onboardState.gender);
  const selected = onboardState.selectedTemplate;
  return `
  <div class="onboarding">
    <div class="onboarding-progress"><div class="onboarding-progress-bar" style="width:${onboardState.step * 50}%"></div></div>
    <div class="onboarding-body">
      <h2 class="onboarding-title">选一个角色</h2>
      <p class="onboarding-desc">每个人设有独立记忆。点一张卡片，看看开场白。</p>
      <div class="segmented" style="margin-bottom:20px;">
        <button class="segmented-btn ${onboardState.gender === "female" ? "segmented-btn-active" : ""}" onclick="window.EchoApp.setOnboardGender('female')">女生</button>
        <button class="segmented-btn ${onboardState.gender === "male" ? "segmented-btn-active" : ""}" onclick="window.EchoApp.setOnboardGender('male')">男生</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
        ${templates.map(t => `
          <div class="role-card ${selected?.name === t.name ? "card-active" : ""}" style="padding:16px;" onclick="window.EchoApp.selectOnboardTemplate('${t.name}')">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
              ${Avatar({ src: t.avatar, size: "sm" })}
              <span style="font-weight:600;">${esc(t.name)}</span>
            </div>
            <div style="font-size:12px;color:var(--color-text-secondary);">${esc(t.tag || "")}</div>
          </div>
        `).join("")}
      </div>
      <div class="card" style="padding:16px;margin-bottom:20px;min-height:60px;">
        ${selected ? `<div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:4px;">开场白预览</div><div style="font-size:15px;">${esc(selected.firstMessage || "")}</div>` : `<div style="font-size:13px;color:var(--color-text-tertiary);">点选上方角色后显示</div>`}
      </div>
    </div>
    <div class="onboarding-footer">
      <button class="btn btn-ghost" onclick="window.EchoApp.skipOnboarding()">跳过·用默认</button>
      <button class="btn btn-primary" ${!selected ? "disabled" : ""} onclick="window.EchoApp.finishOnboarding()">下一步</button>
    </div>
  </div>`;
}

export function setOnboardGender(gender) {
  onboardState.gender = gender;
  onboardState.selectedTemplate = null;
  events.emit("rerender");
}

export function selectOnboardTemplate(name) {
  const all = getSystemTemplates();
  onboardState.selectedTemplate = all.find(t => t.name === name) || null;
  events.emit("rerender");
}

export function getOnboardSelection() {
  return onboardState.selectedTemplate;
}

export function resetOnboarding() {
  onboardState = { step: 1, gender: "female", selectedTemplate: null };
}

// ============================================================
// 主应用外壳（三栏布局）
// ============================================================
export function renderAppShell() {
  const state = store.getState();
  const activeTab = state.ui.activeTab;
  const currentChat = store.getCurrentChat();
  const chats = state.chats || [];
  const searchQuery = state.ui.searchQuery || "";
  const filteredChats = searchQuery
    ? chats.filter(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : chats;

  return `
  <div class="app-shell">
    ${renderNavRail(activeTab)}
    ${activeTab === "messages" ? renderListPane(filteredChats, currentChat, searchQuery) : ""}
    ${activeTab === "moments" ? renderMomentsPane() : ""}
    ${activeTab === "me" ? renderMePane() : ""}
    ${activeTab === "messages" && currentChat ? renderChatPane(currentChat) : (activeTab === "messages" ? renderEmptyChat() : "")}
    ${activeTab === "messages" && currentChat && state.ui.profileOpen ? renderProfilePane(currentChat) : ""}
    ${renderBottomNav(activeTab)}
  </div>`;
}

function renderNavRail(activeTab) {
  return `
  <nav class="nav-rail">
    <div class="nav-logo">E</div>
    <button class="nav-item ${activeTab === "messages" ? "nav-item-active" : ""}" onclick="window.EchoApp.switchTab('messages')" title="消息">
      ${Icons.message}<span class="nav-item-label">消息</span>
    </button>
    <button class="nav-item ${activeTab === "moments" ? "nav-item-active" : ""}" onclick="window.EchoApp.switchTab('moments')" title="动态">
      ${Icons.moments}<span class="nav-item-label">动态</span>
    </button>
    <div class="nav-spacer"></div>
    <button class="nav-item ${activeTab === "me" ? "nav-item-active" : ""}" onclick="window.EchoApp.switchTab('me')" title="我的">
      ${Icons.me}<span class="nav-item-label">我的</span>
    </button>
  </nav>`;
}

function renderBottomNav(activeTab) {
  return `
  <nav class="bottom-nav">
    <button class="bottom-nav-item ${activeTab === "messages" ? "bottom-nav-item-active" : ""}" onclick="window.EchoApp.switchTab('messages')">
      ${Icons.message}<span>消息</span>
    </button>
    <button class="bottom-nav-item ${activeTab === "moments" ? "bottom-nav-item-active" : ""}" onclick="window.EchoApp.switchTab('moments')">
      ${Icons.moments}<span>动态</span>
    </button>
    <button class="bottom-nav-item ${activeTab === "me" ? "bottom-nav-item-active" : ""}" onclick="window.EchoApp.switchTab('me')">
      ${Icons.me}<span>我的</span>
    </button>
  </nav>`;
}

function renderListPane(chats, currentChat, searchQuery) {
  return `
  <div class="list-pane">
    <div class="list-header">
      <span class="list-title">消息</span>
      <div style="display:flex;gap:8px;">
        ${IconButton({ icon: Icons.plus, title: "新建对话", onClick: "window.EchoApp.newChat()" })}
        ${IconButton({ icon: Icons.settings, title: "设置", onClick: "window.EchoApp.openSettings()" })}
      </div>
    </div>
    <div class="list-search">
      <div style="position:relative;">
        <input class="input" type="text" placeholder="搜索会话…" value="${esc(searchQuery)}" oninput="window.EchoApp.setSearch(this.value)" style="padding-left:36px;" />
        <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--color-text-tertiary);">${Icons.search}</span>
      </div>
    </div>
    <div class="list-body">
      ${chats.length === 0 ? EmptyState({ icon: Icons.message, title: "还没有对话", desc: "点击右上角 + 创建新对话", actionText: "新建对话", actionOnClick: "window.EchoApp.newChat()" }) :
        chats.map(c => `
          <div class="list-item ${currentChat?.id === c.id ? "list-item-active" : ""}" onclick="window.EchoApp.selectChat('${c.id}')">
            ${Avatar({ src: getRoleAvatar(c), size: "md" })}
            <div class="list-item-content">
              <div class="list-item-title">${esc(c.name || "未命名")}</div>
              <div class="list-item-subtitle">${esc(c.messages?.[c.messages.length - 1]?.text?.slice(0, 30) || "开始对话吧")}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px;color:var(--color-text-tertiary);">${c.messages?.length ? formatDateTime(c.messages[c.messages.length - 1].time) : ""}</div>
              <div style="margin-top:4px;display:flex;gap:4px;justify-content:flex-end;">
                <button class="icon-btn" style="width:28px;height:28px;" title="导出" onclick="event.stopPropagation();window.EchoApp.exportChat('${c.id}')">${Icons.download}</button>
                <button class="icon-btn" style="width:28px;height:28px;" title="删除" onclick="event.stopPropagation();window.EchoApp.deleteChat('${c.id}')">${Icons.trash}</button>
              </div>
            </div>
          </div>
        `).join("")}
    </div>
  </div>`;
}

function renderEmptyChat() {
  return `
  <div class="chat-pane" style="align-items:center;justify-content:center;">
    ${EmptyState({ icon: Icons.message, title: "选择一个对话", desc: "从左侧列表打开角色，继续聊天", actionText: "+ 新建对话", actionOnClick: "window.EchoApp.newChat()" })}
  </div>`;
}

function renderChatPane(chat) {
  const messages = chat.messages || [];
  const sending = isSending() && getStreamingChatId() === chat.id;
  const roleId = getRoleId(chat);
  const affinity = roleId ? getAffinity(roleId, { moments: listMoments(roleId) }) : null;

  return `
  <div class="chat-pane">
    <div class="chat-header">
      <button class="icon-btn" style="display:none;" id="back-btn" onclick="window.EchoApp.backToList()">${Icons.back}</button>
      <div class="chat-header-center" onclick="window.EchoApp.toggleProfile()">
        ${Avatar({ src: getRoleAvatar(chat), size: "sm" })}
        <div>
          <div class="chat-header-name">${esc(chat.name || "角色")}</div>
          <div class="chat-header-status"><span class="status-dot"></span>在线 · ${affinity ? `认识${affinity.knownDays}天 · ${affinity.toneHint}` : "刚刚认识"}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        ${IconButton({ icon: Icons.volume, title: "朗读设置", onClick: "window.EchoApp.toggleTTS()" })}
        ${IconButton({ icon: Icons.more, title: "更多", onClick: "window.EchoApp.toggleProfile()" })}
      </div>
    </div>
    <div class="chat-messages" id="chat-messages">
      ${messages.length === 0 ? EmptyState({ icon: Icons.sparkles, title: "开始对话吧", desc: "和角色聊聊，她会慢慢记住你" }) :
        messages.map((m, i) => renderMessage(m, i, chat)).join("")}
      ${sending ? `<div class="msg msg-her"><div class="msg-bubble">${TypingIndicator()}</div></div>` : ""}
    </div>
    <div class="chat-input-area">
      <div class="chat-input-wrap">
        ${IconButton({ icon: Icons.mic, title: "语音输入", onClick: "window.EchoApp.toggleSTT()", className: "chat-mic-btn" })}
        <textarea class="chat-input" id="chat-input" placeholder="说点什么…" rows="1" onkeydown="window.EchoApp.handleInputKey(event)" oninput="window.EchoApp.autoGrowInput(this)"></textarea>
        ${sending ?
          `<button class="chat-send-btn" style="background:var(--color-danger);" onclick="window.EchoApp.stopSend()" title="停止">${Icons.stop}</button>` :
          `<button class="chat-send-btn" onclick="window.EchoApp.sendMessage()" title="发送">${Icons.send}</button>`
        }
      </div>
    </div>
  </div>`;
}

function renderMessage(m, index, chat) {
  const isMe = m.role === "me";
  const isStreaming = m.status === "streaming";
  const isError = m.status === "error";
  const text = renderMarkdown(m.text || "");
  return `
  <div class="msg ${isMe ? "msg-me" : "msg-her"} ${isStreaming ? "msg-streaming" : ""} ${isError ? "msg-error" : ""}">
    ${!isMe ? Avatar({ src: getRoleAvatar(chat), size: "sm" }) : ""}
    <div style="max-width:75%;">
      <div class="msg-bubble">${text || (isStreaming ? "" : "")}</div>
      <div class="msg-time">${formatDateTime(m.time)}</div>
      <div class="msg-actions">
        <button class="msg-action-btn" onclick="window.EchoApp.copyMessage(${index})">复制</button>
        ${!isMe ? `<button class="msg-action-btn" onclick="window.EchoApp.rememberMessage(${index})">记住</button>` : ""}
        ${!isMe ? `<button class="msg-action-btn" onclick="window.EchoApp.regenerateMessage(${index})">重生成</button>` : ""}
        ${isMe ? `<button class="msg-action-btn" onclick="window.EchoApp.editMessage(${index})">编辑</button>` : ""}
        <button class="msg-action-btn" style="color:var(--color-danger);" onclick="window.EchoApp.deleteMessage(${index})">删除</button>
      </div>
    </div>
  </div>`;
}

function renderProfilePane(chat) {
  const roleId = getRoleId(chat);
  const memories = roleId ? getMemoryList(roleId, 5) : [];
  const moments = roleId ? listMoments(roleId).slice(0, 3) : [];
  const affinity = roleId ? getAffinity(roleId, { moments }) : null;
  const persona = getPersona(chat);

  return `
  <aside class="profile-pane open">
    <div class="profile-header">
      <button class="icon-btn" style="position:absolute;top:12px;right:12px;" onclick="window.EchoApp.toggleProfile()">${Icons.close}</button>
      ${Avatar({ src: getRoleAvatar(chat), size: "lg", className: "profile-avatar" })}
      <div class="profile-name">${esc(chat.name || "角色")}</div>
      <div class="profile-status">在线 · ${affinity ? `认识${affinity.knownDays}天` : "刚刚认识"}</div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">性格</div>
      <div class="profile-section-content" style="font-size:14px;line-height:1.6;">${esc(persona?.slice(0, 200) || "暂无设定")}${persona?.length > 200 ? "…" : ""}</div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">关系</div>
      <div class="profile-section-content">
        ${affinity ? `
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span>亲密度</span><span style="font-weight:600;color:var(--color-primary);">${affinity.score}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span>聊天轮次</span><span>${affinity.turns}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span>连续聊天</span><span>${affinity.streakDays}天</span>
          </div>
        ` : "暂无数据"}
      </div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">记忆</div>
      <div class="profile-section-content">
        ${memories.length === 0 ? `<div style="color:var(--color-text-tertiary);font-size:13px;">暂无记忆，多聊一会儿就会有了</div>` :
          memories.map(m => `<div style="padding:8px 0;border-bottom:1px solid var(--color-border);font-size:13px;">${esc(m.content)}</div>`).join("")}
      </div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">动态</div>
      <div class="profile-section-content">
        ${moments.length === 0 ? `<div style="color:var(--color-text-tertiary);font-size:13px;">暂无动态</div>` :
          moments.map(m => `<div style="padding:8px 0;border-bottom:1px solid var(--color-border);"><div style="font-size:13px;">${esc(m.content)}</div><div style="font-size:11px;color:var(--color-text-tertiary);margin-top:4px;">${relativeTime(m.createdAt)}</div></div>`).join("")}
      </div>
    </div>
    <div class="profile-section" style="margin-top:auto;">
      <button class="btn btn-secondary btn-block" onclick="window.EchoApp.openChatSettings()">打开聊天设置</button>
    </div>
  </aside>`;
}

// ============================================================
// 动态页
// ============================================================
function renderMomentsPane() {
  const moments = listMoments("all");
  return `
  <div class="moments-pane">
    <div class="list-header">
      <span class="list-title">动态</span>
      <select class="select" style="width:auto;padding:8px 12px;" onchange="window.EchoApp.setMomentsFilter(this.value)">
        <option value="all">全部</option>
        ${[...new Set(moments.map(m => m.roleName))].map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join("")}
      </select>
    </div>
    <div class="moments-feed">
      ${moments.length === 0 ? EmptyState({ icon: Icons.moments, title: "还没有动态", desc: "和角色多聊一会儿，这里会留下生活痕迹", actionText: "去消息里聊聊", actionOnClick: "window.EchoApp.switchTab('messages')" }) :
        moments.map(m => `
          <div class="moment-card">
            <div class="moment-header">
              ${Avatar({ src: "assets/avatars/default.svg", size: "sm", circle: true })}
              <div>
                <div style="font-weight:600;font-size:14px;">${esc(m.roleName)}</div>
                <div style="font-size:12px;color:var(--color-text-tertiary);">${relativeTime(m.createdAt)}</div>
              </div>
            </div>
            <div class="moment-content">${esc(m.content)}</div>
            <div class="moment-actions">
              <div class="moment-action ${m.likedByUser ? "moment-action-liked" : ""}" onclick="window.EchoApp.toggleMomentLike('${m.id}')">
                ${Icons.heart}<span>${m.likes || 0}</span>
              </div>
              <div class="moment-action" onclick="window.EchoApp.commentMoment('${m.id}')">
                ${Icons.comment}<span>${m.comments?.length || 0}</span>
              </div>
            </div>
          </div>
        `).join("")}
    </div>
  </div>`;
}

// ============================================================
// 我的/设置页
// ============================================================
function renderMePane() {
  const state = store.getState();
  return `
  <div class="me-pane">
    <div class="list-header">
      <span class="list-title">我的</span>
      <button class="btn btn-ghost btn-sm" onclick="window.EchoApp.openSettings()">设置</button>
    </div>
    <div class="me-content">
      <div class="me-profile">
        ${Avatar({ src: state.settings.myAvatar || "assets/avatars/user-default.svg", size: "lg", circle: true })}
        <div style="flex:1;">
          <div style="font-size:18px;font-weight:700;">我</div>
          <div style="font-size:13px;color:var(--color-text-secondary);">本地保存 · ${state.chats?.length || 0} 个对话</div>
        </div>
        <button class="icon-btn" onclick="window.EchoApp.uploadMyAvatar()" title="更换头像">${Icons.edit}</button>
      </div>

      <div class="me-settings-group">
        <div class="me-settings-group-title">核心设置</div>
        <div class="me-settings-list">
          ${[
            { icon: Icons.database, title: "API 与模型", desc: `${state.settings.model || "未配置"}`, action: "openSettings('api')" },
            { icon: Icons.book, title: "世界书", desc: "全局与角色设定注入", action: "openSettings('worldbook')" },
            { icon: Icons.brain, title: "长期记忆", desc: `最多每角色 ${state.memoryCfg.maxPerRole} 条`, action: "openSettings('memory')" },
            { icon: Icons.palette, title: "主题", desc: state.settings.theme === "dark" ? "暗色" : "亮色", action: "openSettings('appearance')" },
            { icon: Icons.download, title: "导出导入备份", desc: "JSON 格式全量备份", action: "openSettings('backup')" },
          ].map(item => `
            <div class="me-settings-item" onclick="window.EchoApp.${item.action}">
              <div class="me-settings-item-icon">${item.icon}</div>
              <div class="me-settings-item-content">
                <div class="me-settings-item-title">${item.title}</div>
                <div class="me-settings-item-desc">${item.desc}</div>
              </div>
              <span class="me-settings-item-arrow">${Icons.chevronRight}</span>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="me-settings-group">
        <div class="me-settings-group-title">更多工具</div>
        <div class="me-settings-list">
          ${[
            { icon: Icons.sparkles, title: "Prompt 结构预览", desc: "查看当前组装", action: "openPromptPreview()" },
            { icon: Icons.edit, title: "默认人设 / 预设库", desc: "全局人设与角色卡预设", action: "openSettings('persona')" },
            { icon: Icons.volume, title: "语音 TTS / STT", desc: "朗读与麦克风", action: "openSettings('voice')" },
            { icon: Icons.refresh, title: "重新查看引导", desc: "Landing 与新手流程", action: "resetOnboarding()" },
          ].map(item => `
            <div class="me-settings-item" onclick="window.EchoApp.${item.action}">
              <div class="me-settings-item-icon">${item.icon}</div>
              <div class="me-settings-item-content">
                <div class="me-settings-item-title">${item.title}</div>
                <div class="me-settings-item-desc">${item.desc}</div>
              </div>
              <span class="me-settings-item-arrow">${Icons.chevronRight}</span>
            </div>
          `).join("")}
        </div>
      </div>

      <div style="text-align:center;padding:20px 0;font-size:12px;color:var(--color-text-tertiary);">
        EchoChat Rebuild · 本地优先 · v2.0
      </div>
    </div>
  </div>`;
}
