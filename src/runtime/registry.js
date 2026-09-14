/**
 * In-process plugin registry. No sandbox, marketplace, or dependency resolver.
 */

class PluginRegistry {
  constructor() {
    this._plugins = new Map();
  }

  register(plugin) {
    const id = plugin?.id;
    if (!id || typeof id !== "string") throw new Error("plugin.id is required");
    if (this._plugins.has(id)) throw new Error(`plugin already registered: ${id}`);
    this._plugins.set(id, plugin);
    return plugin;
  }

  unregister(pluginId) {
    this._plugins.delete(pluginId);
  }

  get(pluginId) {
    return this._plugins.get(pluginId) || null;
  }

  getPlugins() {
    return [...this._plugins.values()];
  }

  clear() {
    this._plugins.clear();
  }
}

const registry = new PluginRegistry();

export function getPluginRegistry() {
  return registry;
}

export function resetPluginRegistry() {
  registry.clear();
}
