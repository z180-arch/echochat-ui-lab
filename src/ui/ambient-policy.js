/**
 * Ambient intensity policy (V1.1 WP0).
 * Pure function: Chat/Profile stay quiet; Welcome may keep atmosphere.
 * The canvas implementation stays in ambient.js — this only decides mode + cap.
 */

const RANK = { off: 0, weak: 1, medium: 2, strong: 3 };
const LEVELS = ["off", "weak", "medium", "strong"];

function clampLevel(level) {
  return RANK[level] != null ? level : "medium";
}

function minLevel(a, b) {
  const left = clampLevel(a);
  const right = clampLevel(b);
  return RANK[left] <= RANK[right] ? left : right;
}

/**
 * @param {object} input
 * @param {"landing"|"onboarding"|"app"} input.view
 * @param {"companion"|"moments"|"me"} [input.activeTab]
 * @param {boolean} [input.chatOpen]
 * @param {"off"|"weak"|"medium"|"strong"} [input.userIntensity]
 * @param {number} [input.viewportWidth]
 * @param {boolean} [input.prefersReducedMotion]
 * @param {boolean} [input.saveData]
 * @returns {{ mode: "off"|"landing"|"app", intensity: "off"|"weak"|"medium"|"strong", reason: string }}
 */
export function resolveAmbientPolicy(input = {}) {
  const view = input.view || "app";
  const user = clampLevel(input.userIntensity);
  const mobile = (Number(input.viewportWidth) || 1024) < 768;

  if (input.prefersReducedMotion) {
    return { mode: "off", intensity: "off", reason: "reduced-motion" };
  }
  if (input.saveData) {
    return { mode: "off", intensity: "off", reason: "save-data" };
  }

  if (view === "landing" || view === "onboarding") {
    return {
      mode: "landing",
      intensity: minLevel(user, "medium"),
      reason: "landing",
    };
  }

  if (input.activeTab === "companion" && input.chatOpen) {
    return { mode: "off", intensity: "off", reason: "chat" };
  }

  const appCap = mobile ? "off" : "weak";
  const intensity = minLevel(user, appCap);
  if (intensity === "off") {
    return { mode: "off", intensity: "off", reason: input.activeTab || "app" };
  }
  return { mode: "app", intensity, reason: input.activeTab || "hub" };
}

export { LEVELS, minLevel, clampLevel };
