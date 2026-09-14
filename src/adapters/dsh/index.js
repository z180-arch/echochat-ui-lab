/**
 * Future DeepSeek Harness adapter seat.
 * Current product uses LocalPluginRuntime only.
 *
 * @typedef {Object} PluginRuntimeAdapter
 * @property {(plugin: object) => void|Promise<void>} register
 * @property {(pluginId: string) => void} unregister
 * @property {() => object[]} getPlugins
 */

/**
 * @returns {PluginRuntimeAdapter}
 */
export function createDshPluginRuntime() {
  throw new Error("DSH plugin runtime is reserved and not implemented");
}
