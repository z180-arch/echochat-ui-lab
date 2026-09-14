/**
 * Planned DSH adapter seat. Not a runtime dependency.
 * Current product uses LocalPluginRuntime only. This function throws.
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
