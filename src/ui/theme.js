// ============================================================
//  EchoChat · Theme
//  颜色预设 / 自定义配色 / 明暗模式 / 背景氛围强度
//  统一出口：applyTheme() 把结果写成 :root 上的 CSS 变量
// ============================================================

import { store } from "../core/store.js";
import { Ambient } from "./ambient.js";

export const THEME_PRESETS = [
  { id: "mint", name: "薄荷回响", primary: "#7CB8E8", mint: "#9DD9C2", primarySoft: "#EEF7FD", mintSoft: "#EDF9F4" },
  { id: "sky", name: "晴空", primary: "#5B9CF6", mint: "#7EC8E8", primarySoft: "#E8F2FC", mintSoft: "#E5F4FA" },
  { id: "lavender", name: "薰衣草", primary: "#8B7CF6", mint: "#B4A7F8", primarySoft: "#F0EDFE", mintSoft: "#EDE9FE" },
  { id: "rose", name: "玫瑰", primary: "#F472B6", mint: "#F9A8D4", primarySoft: "#FCE7F3", mintSoft: "#FDF2F8" },
  { id: "sage", name: "鼠尾草", primary: "#6EB87A", mint: "#84CC84", primarySoft: "#E8F5EA", mintSoft: "#ECFDF0" },
  { id: "cloud", name: "云雾", primary: "#94A3B8", mint: "#B0BAC9", primarySoft: "#F1F5F9", mintSoft: "#F8FAFC" },
];

export const PARTICLE_LEVELS = [
  { id: "off", label: "关" },
  { id: "weak", label: "弱" },
  { id: "medium", label: "中" },
  { id: "strong", label: "强" },
];

export function findThemePreset(id) {
  return THEME_PRESETS.find((p) => p.id === id) || THEME_PRESETS[0];
}

export function hexToRgb(hex) {
  const m = String(hex || "").replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export function shadeHex(hex, amount) {
  const c = hexToRgb(hex);
  if (!c) return hex;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amount))));
  return "#" + [f(c.r), f(c.g), f(c.b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function rgba(hex, alpha) {
  const c = hexToRgb(hex);
  if (!c) return hex;
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

// 亮色气泡用浅色底 + 深色字；深色气泡（自定义主色）需要反白
function readableOn(hex) {
  const c = hexToRgb(hex);
  if (!c) return "#243238";
  const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return lum > 0.62 ? "#243238" : "#ffffff";
}

export function resolveThemeMode(theme) {
  if (theme === "dark") return "dark";
  if (theme === "auto") {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

// 当前生效的四个颜色：预设 + 用户自定义覆盖
export function activeThemeColors(settings) {
  const s = settings || store.getState().settings;
  const preset = findThemePreset(s.themePreset || "mint");
  const custom = s.customColors || {};
  return {
    primary: custom.primary || preset.primary,
    mint: custom.mint || preset.mint,
    bubbleMe: custom.bubbleMe || preset.primarySoft,
    bubbleHer: custom.bubbleHer || preset.mintSoft,
  };
}

export function isCustomTheme(settings) {
  const c = (settings || store.getState().settings).customColors || {};
  return !!(c.primary || c.mint || c.bubbleMe || c.bubbleHer);
}

export function applyTheme() {
  if (typeof document === "undefined") return;
  const s = store.getState().settings;
  const mode = resolveThemeMode(s.theme || "light");
  const colors = activeThemeColors(s);
  const root = document.documentElement;

  root.setAttribute("data-theme", mode);
  root.setAttribute("data-theme-preset", s.themePreset || "mint");

  const style = root.style;
  style.setProperty("--color-primary", colors.primary);
  style.setProperty("--color-primary-hover", shadeHex(colors.primary, mode === "dark" ? 0.12 : -0.08));
  style.setProperty("--color-accent", colors.primary);
  style.setProperty("--color-mint", colors.mint);

  if (mode === "dark") {
    style.setProperty("--color-primary-soft", rgba(colors.primary, 0.16));
    style.setProperty("--color-mint-soft", rgba(colors.mint, 0.14));
    style.setProperty("--color-bubble-me", rgba(colors.bubbleMe, 0.22));
    style.setProperty("--color-bubble-her", "#232b35");
    style.setProperty("--color-bubble-me-text", "#e8eef4");
    style.setProperty("--color-bubble-her-text", "#e8eef4");
  } else {
    style.setProperty("--color-primary-soft", colors.bubbleMe);
    style.setProperty("--color-mint-soft", colors.bubbleHer);
    style.setProperty("--color-bubble-me", colors.bubbleMe);
    style.setProperty("--color-bubble-her", colors.bubbleHer);
    style.setProperty("--color-bubble-me-text", readableOn(colors.bubbleMe));
    style.setProperty("--color-bubble-her-text", readableOn(colors.bubbleHer));
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "dark" ? "#0f1419" : "#FAFCFB");

  Ambient.setColors(colors.primary, colors.mint);
  Ambient.setIntensity(s.particleIntensity || "medium");
}

let autoModeBound = false;
export function watchSystemTheme(onChange) {
  if (autoModeBound || typeof window === "undefined") return;
  autoModeBound = true;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    if ((store.getState().settings.theme || "light") === "auto") {
      applyTheme();
      onChange?.();
    }
  };
  if (mq.addEventListener) mq.addEventListener("change", handler);
  else if (mq.addListener) mq.addListener(handler);
}
