/**
 * Production Dexie storage hooks for domain and repository.
 * Tests call installStorageTestHooks() with an in-memory fake.
 */
import { dexieAdapter, dexieCharacterAdapter, dexieMomentAdapter, dexieWorldbookAdapter } from "../infrastructure/dexie-adapter.js";
import { isDbAvailable } from "../infrastructure/dexie-db.js";

function productionHooks() {
  return {
    isAvailable: isDbAvailable,
    message: dexieAdapter.message,
    conversation: dexieAdapter.conversation,
    character: dexieCharacterAdapter,
    moment: dexieMomentAdapter,
    worldbook: dexieWorldbookAdapter,
    relationship: dexieAdapter.relationship,
    memory: dexieAdapter.memory,
  };
}

let hooks = productionHooks();

export function getStorageHooks() {
  return hooks;
}

export function installStorageTestHooks(partial) {
  hooks = { ...hooks, ...partial };
}

export function resetStorageTestHooks() {
  hooks = productionHooks();
}
