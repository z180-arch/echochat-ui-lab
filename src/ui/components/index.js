// ============================================================
//  EchoChat Rebuild · UI Components
//  可复用 UI 组件渲染函数
// ============================================================

import { esc, formatDateTime, relativeTime } from "../../core/utils.js";

// SVG 图标库
export const Icons = {
  message: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  moments: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
  me: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  comment: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  brain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z"/></svg>`,
  palette: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`,
  database: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  switch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="14" height="14" rx="2"/><path d="M4 6a2 2 0 0 1 2-2h10"/><path d="M4 10v10a2 2 0 0 0 2 2h10"/></svg>`,
};

let _logoUid = 0;
export function LogoMark({ size = 40 } = {}) {
  const id = `ecr${++_logoUid}`;
  return `<svg class="logo-ripple" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7CB8E8"/><stop offset="100%" stop-color="#9DD9C2"/></linearGradient></defs>
    <rect width="48" height="48" rx="12" fill="url(#${id})"/>
    <circle cx="14" cy="24" r="2.2" fill="#fff" opacity=".95"/>
    <path d="M17 20c5 0 5 8 0 8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".42"/>
    <path d="M17 17c8.5 0 8.5 14 0 14" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".68"/>
    <path d="M17 14c12 0 12 20 0 20" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/>
  </svg>`;
}

// 按钮组件
export function Button({ text, variant = "primary", size = "md", icon = "", onClick = "", className = "", disabled = false }) {
  const sizeClass = size === "sm" ? "btn-sm" : "";
  return `<button class="btn btn-${variant} ${sizeClass} ${className}" ${onClick ? `onclick="${onClick}"` : ""} ${disabled ? "disabled" : ""}>${icon}${text ? `<span>${esc(text)}</span>` : ""}</button>`;
}

// 图标按钮
export function IconButton({ icon, title = "", onClick = "", className = "", active = false }) {
  return `<button class="icon-btn ${active ? "icon-btn-active" : ""} ${className}" title="${esc(title)}" aria-label="${esc(title)}" ${onClick ? `onclick="${onClick}"` : ""}>${icon}</button>`;
}

const DEFAULT_AVATARS = new Set(["assets/avatars/default.svg", "assets/avatars/user-default.svg"]);

function initialOf(name) {
  const s = String(name || "").trim();
  return s ? s.slice(0, 1) : "?";
}

// 头像：没有自定义图时用「首字 + 品牌渐变」，比灰色占位图更贴合 Morning Mint
export function Avatar({ src, size = "md", circle = false, alt = "", className = "", name = "" }) {
  const sizeClass = `avatar-${size}`;
  const circleClass = circle ? "avatar-circle" : "";
  const label = name || alt;
  const useFallback = !src || DEFAULT_AVATARS.has(src);
  if (useFallback) {
    return `<span class="avatar avatar-fallback ${sizeClass} ${circleClass} ${className}" role="img" aria-label="${esc(label || "头像")}">${esc(initialOf(label))}</span>`;
  }
  return `<img class="avatar ${sizeClass} ${circleClass} ${className}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" />`;
}

/** Character Chromium — shared face language across Hub / Chat / Profile / Moments. */
export function CharacterAvatar({ src, size = "md", alt = "", name = "", className = "" }) {
  const sizeClass = `character-avatar-${size}`;
  return `<span class="character-avatar ${sizeClass} ${className}">${Avatar({
    src,
    size,
    circle: true,
    alt,
    name,
  })}</span>`;
}

export function StageChip({ label = "", stage = "none" }) {
  const text = String(label || "").trim();
  if (!text) return "";
  const safeStage = ["none", "warming", "familiar", "close"].includes(stage) ? stage : "none";
  return `<span class="stage-chip stage-tag stage-${safeStage}">${esc(text)}</span>`;
}

export function CharacterCard({
  name = "",
  avatar = "",
  presence = "",
  lastLine = "",
  time = "",
  stage = "none",
  stageLabel = "",
  active = false,
  onClick = "",
}) {
  return `<button type="button" class="list-item character-card motion-press ${active ? "list-item-active" : ""}" ${
    onClick ? `onclick="${onClick}"` : ""
  }>
    <span class="list-item-av">${CharacterAvatar({ src: avatar, size: "md", alt: name, name })}</span>
    <div class="list-item-content">
      <div class="list-item-top">
        <span class="list-item-title">${esc(name)}</span>
        <span class="list-item-time">${esc(time || "")}</span>
      </div>
      <div class="list-item-subtitle">${esc(presence || "还没有聊过")}</div>
      <div class="list-item-meta">${StageChip({ label: stageLabel, stage })}</div>
      ${lastLine ? `<div class="list-item-last">${esc(lastLine)}</div>` : ""}
    </div>
  </button>`;
}

export function MemoryRow({ content = "", onDelete = "" }) {
  if (!content) return "";
  return `<div class="mem-line memory-row">
    <span class="memory-row-text">${esc(content)}</span>
    ${onDelete ? `<button type="button" class="memory-row-del" onclick="${onDelete}" aria-label="删除这条记忆">${Icons.close}</button>` : ""}
  </div>`;
}

export function RelationshipBrief({ affinity = null, lastEvent = "" }) {
  if (!affinity?.hasHistory) {
    return `<div class="relationship-brief">
      <p class="profile-muted">还没有聊过。开口第一句，关系从这里开始。</p>
    </div>`;
  }
  const event = String(lastEvent || affinity.lastEvent || "").trim();
  const brief = String(affinity.brief || "").trim();
  const days = affinity.knownDays ? ` · 相处 ${affinity.knownDays} 天` : "";
  return `<div class="relationship-brief">
    <div class="relationship-brief-head">${StageChip({ label: affinity.stageLabel, stage: affinity.stage })}</div>
    <p class="relationship-brief-copy">${esc(affinity.stageLabel || "")}。${esc(affinity.toneHint || "")}${esc(days)}。多聊，关系会自己靠近——没有数值可以调。</p>
    ${brief ? `<p class="relationship-brief-text">${esc(brief)}</p>` : ""}
    ${event ? `<p class="profile-muted">最近：${esc(event)}</p>` : ""}
  </div>`;
}

// 空状态
export function EmptyState({ icon = "", title = "", desc = "", actionText = "", actionOnClick = "" }) {
  return `<div class="empty-state">
    ${icon ? `<div class="empty-icon">${icon}</div>` : ""}
    ${title ? `<div class="empty-title">${esc(title)}</div>` : ""}
    ${desc ? `<div class="empty-desc">${esc(desc)}</div>` : ""}
    ${actionText ? `<button class="btn btn-primary" ${actionOnClick ? `onclick="${actionOnClick}"` : ""}>${esc(actionText)}</button>` : ""}
  </div>`;
}

// 加载骨架
export function Skeleton({ width = "100%", height = "16px", className = "" }) {
  return `<div class="skeleton ${className}" style="width:${width};height:${height};"></div>`;
}

// Typing 指示器
export function TypingIndicator() {
  return `<span class="chat-composing">正在整理思绪</span>`;
}

// Toast
let toastContainer = null;
export function showToast({ message, type = "info", action = null, duration = 3000 }) {
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
  }
  toastContainer.querySelectorAll(".toast").forEach((t) => t.remove());
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${esc(message)}</span>${action ? `<span class="toast-action">${esc(action.label)}</span>` : ""}`;
  if (action) {
    toast.querySelector(".toast-action").addEventListener("click", () => {
      action.handler?.();
      toast.remove();
    });
  }
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// Modal
export function openModal({ title, content, footer = "", width = "560px" }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal modal-split" style="--modal-width:${width}">
    ${title ? `<div class="modal-header"><span class="modal-title">${esc(title)}</span>${IconButton({ icon: Icons.close, title: "关闭", onClick: "this.closest('.modal-overlay').remove()" })}</div>` : ""}
    <div class="modal-body">${content}</div>
    ${footer ? `<div class="modal-footer">${footer}</div>` : ""}
  </div>`;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
  return overlay;
}

export function closeModal(overlay) {
  overlay?.remove();
}

// 设置行
export function SettingRow({ icon = "", title = "", desc = "", onClick = "", right = "" }) {
  return `<div class="setting-row" ${onClick ? `onclick="${onClick}" style="cursor:pointer;"` : ""}>
    ${icon ? `<div class="setting-row-icon">${icon}</div>` : ""}
    <div class="setting-row-content">
      ${title ? `<div class="setting-row-title">${esc(title)}</div>` : ""}
      ${desc ? `<div class="setting-row-desc">${esc(desc)}</div>` : ""}
    </div>
    ${right ? `<div class="setting-row-right">${right}</div>` : `<div class="setting-row-right">${Icons.chevronRight}</div>`}
  </div>`;
}

// 分段选择（轻量；onboarding 等处也可直接用 segmented-btn 类）
export function Segmented({ options = [], value = "", onChange = "" }) {
  return `<div class="segmented">
    ${options
      .map(
        (opt) => {
          const v = typeof opt === "string" ? opt : opt.value;
          const label = typeof opt === "string" ? opt : opt.label;
          const active = v === value ? "segmented-btn-active" : "";
          const handler = onChange ? `onclick="${onChange}('${esc(v)}')"` : "";
          return `<button type="button" class="segmented-btn ${active}" ${handler}>${esc(label)}</button>`;
        }
      )
      .join("")}
  </div>`;
}

// 确认弹窗
export function openConfirm({
  title = "确认",
  message = "",
  confirmText = "确定",
  cancelText = "取消",
  variant = "primary",
  onConfirm = null,
  onCancel = null,
} = {}) {
  const btnClass = variant === "danger" ? "btn-danger" : "btn-primary";
  const overlay = openModal({
    title,
    content: `<p style="margin:0;line-height:1.6;color:var(--color-text-secondary);">${esc(message)}</p>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-confirm="cancel">${esc(cancelText)}</button>
      <button type="button" class="btn ${btnClass}" data-confirm="ok">${esc(confirmText)}</button>
    `,
    width: "420px",
  });
  const cancelBtn = overlay.querySelector('[data-confirm="cancel"]');
  const okBtn = overlay.querySelector('[data-confirm="ok"]');
  cancelBtn?.addEventListener("click", () => {
    overlay.remove();
    onCancel?.();
  });
  okBtn?.addEventListener("click", () => {
    overlay.remove();
    onConfirm?.();
  });
  return overlay;
}
