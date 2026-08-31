// ============================================================
//  EchoChat · App Version (Single Source of Truth)
//  APP_VERSION ≠ DATA_SCHEMA_VERSION
//  App 升级不影响用户数据；数据 schema 升级走独立迁移流程
// ============================================================

export const APP_VERSION = "1.0.0";

// 版本比较：返回 -1 / 0 / 1
export function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

// 从 SW 或 manifest 读取当前运行版本
export function getRunningVersion() {
  return APP_VERSION;
}
