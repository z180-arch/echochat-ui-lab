/**
 * Local in-process plugin runtime.
 * Future DSH runtime should implement the same PluginRuntimeAdapter shape.
 */

import { createPluginContext } from "./plugin.js";
import { getPluginRegistry } from "./registry.js";

/**
 * @typedef {Object} PluginRuntimeAdapter
 * @property {(plugin: import("./plugin.js").EchoPlugin) => void|Promise<void>} register
 * @property {(pluginId: string) => void} unregister
 * @property {() => import("./plugin.js").EchoPlugin[]} getPlugins
 */

/**
 * @param {ReturnType<typeof getPluginRegistry>} [registry]
 * @returns {PluginRuntimeAdapter & { start: Function }}
 */
export function createLocalPluginRuntime(registry = getPluginRegistry()) {
  return {
    async register(plugin) {
      registry.register(plugin);
      try {
        if (typeof plugin.setup === "function") {
          await plugin.setup(createPluginContext(plugin));
        }
      } catch (err) {
        registry.unregister(plugin.id);
        throw err;
      }
    },
    unregister(pluginId) {
      registry.unregister(pluginId);
    },
    getPlugins() {
      return registry.getPlugins();
    },
    async start(plugins = []) {
      for (const plugin of plugins) {
        await this.register(plugin);
      }
      return this;
    },
  };
}

let singleton = null;

export function getLocalPluginRuntime() {
  if (!singleton) singleton = createLocalPluginRuntime();
  return singleton;
}

export function resetLocalPluginRuntime() {
  singleton = null;
}
