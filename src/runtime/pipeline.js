import { getPluginRegistry } from "./registry.js";

function isThenable(value) {
  return value != null && typeof value.then === "function";
}

/**
 * Sync context pipeline. Async extendContext is reserved and skipped here
 * so buildSystemPrompt can stay synchronous.
 *
 * @param {import("./context.js").EchoContext} context
 * @returns {import("./context.js").EchoContext}
 */
export function applyPluginContext(context) {
  let next = context;
  for (const plugin of getPluginRegistry().getPlugins()) {
    if (typeof plugin.extendContext !== "function") continue;
    const result = plugin.extendContext(next);
    if (isThenable(result) || !result) continue;
    next = result;
  }
  return next;
}
