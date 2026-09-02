/**
 * Context Builder — ordered prompt slots for the current character.
 * Omits empty slots. Does not change getPersona() string contract.
 */

import { store } from "../core/store.js";
import { getPersona } from "./persona.js";
import { buildBehaviorContext } from "./behavior.js";

function asText(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return String(value.notes || value.text || value.style || value.description || "").trim();
  }
  return String(value).trim();
}

export function getActiveUserPersona() {
  return String(store.getState().settings?.userPersona || "").trim();
}

export function getCharacterSlots(chat) {
  const identity = getPersona(chat);
  const cfg = chat?.config || {};
  const personaObj = typeof cfg.persona === "object" && cfg.persona ? cfg.persona : {};
  return {
    identity,
    scenario: asText(cfg.scenario || personaObj.scenario),
    examples: asText(cfg.mesExample || personaObj.mes_example || personaObj.mesExample),
    speakingStyle: asText(cfg.speakingStyle || personaObj.speakingStyle),
  };
}

export function assembleBehaviorContext({ chat, memories, affinity } = {}) {
  const slots = getCharacterSlots(chat);
  return {
    slots,
    userPersona: getActiveUserPersona(),
    behavior: buildBehaviorContext({
      persona: slots.identity,
      slots,
      userPersona: getActiveUserPersona(),
      memories,
      affinity,
    }),
  };
}
