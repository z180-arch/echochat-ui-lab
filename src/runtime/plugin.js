/**
 * Minimal EchoPlugin contract.
 * Host EventBus is reused; plugins do not receive API keys or storage.
 */

import { events } from "../core/events.js";

/**
 * @typedef {Object} EchoPlugin
 * @property {string} id
 * @property {string} name
 * @property {string} version
 * @property {(context: EchoPluginContext) => void|Promise<void>} [setup]
 * @property {(context: import("./context.js").EchoContext) => import("./context.js").EchoContext|Promise<import("./context.js").EchoContext>} [extendContext]
 * @property {() => unknown[]} [registerCharacters]
 * @property {() => unknown[]} [registerWorlds]
 * @property {() => unknown[]} [registerTools]
 */

/**
 * @typedef {Object} EchoPluginContext
 * @property {string} pluginId
 * @property {{ on: Function, off: Function, emit: Function }} events
 */

/**
 * @param {Pick<EchoPlugin, "id">} plugin
 * @returns {EchoPluginContext}
 */
export function createPluginContext(plugin) {
  return {
    pluginId: plugin.id,
    events: {
      on: (event, handler) => events.on(event, handler),
      off: (event, handler) => events.off(event, handler),
      emit: (event, payload) => events.emit(event, payload),
    },
  };
}
