// ============================================================
//  EchoChat Rebuild · Core Utilities
//  纯函数工具集，无副作用，无依赖
// ============================================================

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const escAttr = (s) =>
  esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const rand = (a, b) => a + Math.random() * (b - a);

export const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return "m" + Math.abs(h).toString(36);
};

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const debounce = (fn, ms = 200) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

export const throttle = (fn, ms = 100) => {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
};

export const formatTime = (ts) => {
  const d = new Date(ts || Date.now());
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

export const formatDateTime = (ts) => {
  const time = formatTime(ts);
  const msgDay = todayStr(ts);
  const today = todayStr();
  const diff = dayDiff(msgDay, today);
  if (diff === 0) return time;
  if (diff === 1) return `昨天 ${time}`;
  const d = new Date(ts || Date.now());
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (d.getFullYear() !== new Date().getFullYear()) {
    return `${d.getFullYear()}-${mo}-${day} ${time}`;
  }
  return `${mo}-${day} ${time}`;
};

export const relativeTime = (ts) => {
  const diff = Date.now() - (ts || 0);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天前`;
  return formatDateTime(ts);
};

export const todayStr = (ts) => {
  const d = new Date(ts != null ? ts : Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const dayDiff = (a, b) => {
  const ta = Date.parse(a + "T00:00:00");
  const tb = Date.parse(b + "T00:00:00");
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 999;
  return Math.round((tb - ta) / 86400000);
};

// 轻量 Markdown 渲染（行内 + 代码块 + 列表）
export function renderMarkdown(text, opts = {}) {
  if (!text) return "";
  let t = String(text);
  // 代码块
  t = t.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="md-pre"><code class="md-code">${esc(code.trim())}</code></pre>`;
  });
  // 行内代码
  t = t.replace(/`([^`]+)`/g, '<code class="md-inline">$1</code>');
  // 粗体/斜体
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // 链接
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // 换行
  t = t.replace(/\n/g, "<br>");
  return t;
}

export function estimateTokens(text) {
  if (!text) return 0;
  // 中文约 1.5 字/token，英文约 4 字符/token
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const other = text.length - chinese;
  return Math.round(chinese / 1.5 + other / 4);
}

export function downloadFile(filename, content, mime = "application/json") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function compressImage(file, maxSide = 512, quality = 0.82) {
  return new Promise((resolve) => {
    if (!file || (file.type || "").includes("svg")) {
      resolve(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      const scale = Math.min(1, maxSide / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      try {
        canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => resolve(b || file), "image/jpeg", quality);
      } catch (e) {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}
