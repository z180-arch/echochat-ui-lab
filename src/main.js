// ============================================================
//  EchoChat Rebuild · App Entry
// ============================================================

import { store } from "./core/store.js";
import { events, EVT } from "./core/events.js";
import { renderApp } from "./ui/views/index.js";

function applyTheme() {
  const g = store.getState().global || {};
  document.documentElement.setAttribute("data-theme", g.theme === "dark" ? "dark" : "light");
  if (g.themePreset) {
    document.documentElement.setAttribute("data-theme-preset", g.themePreset);
  }
}

function boot() {
  applyTheme();
  events.on(EVT.THEME_CHANGE, applyTheme);
  events.on(EVT.STATE_CHANGE, () => {
    renderApp(document.getElementById("app"));
  });
  renderApp(document.getElementById("app"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
