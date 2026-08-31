// ============================================================
//  EchoChat Rebuild · Asset helpers
// ============================================================

export function resolveAvatar(path) {
  if (!path) return "assets/avatars/default.svg";
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  if (path.startsWith("assets/")) return path;
  return `assets/avatars/${path}`;
}

export function isDataUrl(s) {
  return typeof s === "string" && s.startsWith("data:");
}
