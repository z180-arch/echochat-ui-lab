/**
 * Storage backend hooks for Repository / messageStore.
 *
 * Production uses Dexie adapters. Tests may replace backends with an
 * in-memory fake so Node (no IndexedDB) can exercise the Dexie-first
 * read path without inventing a second architecture.
 */

import { dexieAdapter, dexieCharacterAdapter } from "../infrastructure/dexie-adapter.js";
import { isDbAvailable } from "../infrastructure/dexie-db.js";

function productionHooks() {
  return {
    isAvailable: isDbAvailable,
    message: dexieAdapter.message,
    conversation: dexieAdapter.conversation,
    character: dexieCharacterAdapter,
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
