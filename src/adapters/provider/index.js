/**
 * Provider adapter over EchoChat's existing OpenAI-compatible client.
 * Plugins and UI chrome must use getPublicProviderInfo — never apiKey.
 */

import { getApiConfig } from "../../domain/provider.js";

export { streamChat, buildMessages, needsApiSetup, getApiPresets, findPreset, ProviderError } from "../../domain/provider.js";

export function getPublicProviderInfo(chat) {
  const cfg = getApiConfig(chat);
  return {
    baseUrl: cfg.baseUrl || "",
    model: cfg.model || "",
    temperature: cfg.temperature,
  };
}
