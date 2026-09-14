/**
 * UI adapter for the current EchoChat Morning Mint shell.
 * Chatbox was reviewed as a product-shell reference only; no Chatbox source
 * was copied (GPL-3.0 vs EchoChat PolyForm Noncommercial).
 *
 * Swap this module if a future shell replaces src/ui/views — domain stays put.
 */

export { renderAppShell, renderLanding } from "../../ui/views/index.js";

export const UI_SURFACES = {
  shell: "echochat",
  sidebar: "companion-inbox",
  chat: "chat-pane",
  settings: "me-pane",
  character: "profile-pane",
  memory: "continuity-sheet",
  moments: "moments-pane",
  worldbook: "settings-worldbook",
  mobileNav: "bottom-nav",
};
