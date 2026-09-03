// ============================================================
//  Presentation-only companion stage + composer chrome.
//  Does not read or write relationship / affinity stores.
// ============================================================

export function presentCompanionStage(affinity, hasTalk) {
  if (affinity?.hasHistory) {
    return {
      label: String(affinity.stageLabel || "").trim() || "刚刚认识",
      stage: affinity.stage || "none",
      hasHistory: true,
      knownDays: Number(affinity.knownDays) || 0,
    };
  }
  if (hasTalk) {
    return {
      label: "刚刚认识",
      stage: affinity?.stage || "none",
      hasHistory: false,
      knownDays: 0,
    };
  }
  return {
    label: "还没有聊过",
    stage: "none",
    hasHistory: false,
    knownDays: 0,
  };
}

export function hubSecondaryLine(presented) {
  if (!presented) return "还没有聊过";
  if (presented.hasHistory && presented.knownDays) {
    return `${presented.label} · ${presented.knownDays} 天`;
  }
  return presented.label || "还没有聊过";
}

export function hubShowsStageChip(presence, stageLabel) {
  const p = String(presence || "");
  const s = String(stageLabel || "").trim();
  if (!s) return false;
  return p !== s && !p.includes(s);
}

export function relationshipEmptyCopy(presented) {
  if (!presented || presented.label === "还没有聊过") {
    return "还没有聊过。开口第一句，关系从这里开始。";
  }
  return "刚刚认识。多聊，关系会自己靠近——没有数值可以调。";
}

export const COMPOSER_COUNT_NEAR_RATIO = 0.9;

export function composerCountVisible(n, max = 2000) {
  const count = Number(n) || 0;
  const cap = Number(max) || 2000;
  return count >= Math.floor(cap * COMPOSER_COUNT_NEAR_RATIO) || count > cap;
}
