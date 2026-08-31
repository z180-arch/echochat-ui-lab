// ============================================================
//  EchoChat Rebuild · Asset Resolver (从 baseline 迁移为 ES Module)
//  统一图片资源解析：builtin path / dataURL / IDB key → 可显示 URL
// ============================================================

import { getBlob, blobToDataURL } from "./idb.js";

const urlCache = new Map(); // key → objectURL

export function isBuiltinAsset(src) {
  const s = String(src || "");
  return s.startsWith("assets/") || s.startsWith("./assets/");
}

export function isUserAssetKey(src) {
  const s = String(src || "");
  return s.startsWith("avatar_") || s.startsWith("bg_") || s.startsWith("img_");
}

export async function resolveAsset(src) {
  if (src == null || src === "") return null;
  const s = String(src);
  if (s.startsWith("data:")) return s;
  if (/^https?:\/\//i.test(s) || s.startsWith("./") || s.startsWith("assets/")) return s;
  if (urlCache.has(s)) return urlCache.get(s);
  try {
    const blob = await getBlob(s);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(s, url);
    return url;
  } catch (e) {
    return null;
  }
}

export async function setAvatarImg(imgEl, src) {
  if (!imgEl) return;
  const fallback = "assets/avatars/default.svg";
  const resolved = await resolveAsset(src || fallback);
  imgEl.dataset.objectSrc = src || "";
  imgEl.src = resolved || fallback;
}

export function revokeAssetURL(src) {
  const s = String(src || "");
  if (!s || !urlCache.has(s)) return;
  try {
    URL.revokeObjectURL(urlCache.get(s));
  } catch (e) {}
  urlCache.delete(s);
}

export function revokeAllAssetURLs() {
  urlCache.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {}
  });
  urlCache.clear();
}

export const EchoAsset = {
  resolveAsset,
  setAvatarImg,
  revokeAssetURL,
  revokeAllAssetURLs,
  isBuiltinAsset,
  isUserAssetKey,
};
