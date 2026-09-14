/**
 * Idempotent localStorage → Dexie satellite reconcile.
 *
 * Pattern (Dexie bulkPut + verify-before-complete, Apache-2.0 docs):
 * detect → parse → merge → write (transaction + bulkPut) → verify → mark
 *
 * Do not mark complete until dest read-back contains every source id.
 * If the flag says complete but Dexie is empty, treat as incomplete and retry.
 * After complete + Dexie populated, legacy localStorage is recovery only.
 */

export const MIGRATION_FLAG_KEY = "echodownload_dexie_migration";

export function getMigrationState() {
  try {
    if (typeof localStorage === "undefined") return {};
    return JSON.parse(localStorage.getItem(MIGRATION_FLAG_KEY)) || {};
  } catch {
    return {};
  }
}

export function setMigrationState(state) {
  try {
    localStorage.setItem(MIGRATION_FLAG_KEY, JSON.stringify(state || {}));
  } catch {
    // quota / private mode
  }
}

export function isEntityMigrated(entityName) {
  return getMigrationState()[entityName]?.status === "completed";
}

export function markEntityMigrated(entityName, stats = {}) {
  const state = getMigrationState();
  state[entityName] = {
    status: "completed",
    completedAt: Date.now(),
    ...stats,
  };
  setMigrationState(state);
}

export function markEntityFailed(entityName, error) {
  const state = getMigrationState();
  state[entityName] = {
    status: "failed",
    failedAt: Date.now(),
    error: String(error),
  };
  setMigrationState(state);
}

export function clearEntityMigrated(entityName) {
  const state = getMigrationState();
  delete state[entityName];
  setMigrationState(state);
}

export function clearMigrationFlags() {
  try {
    localStorage.removeItem(MIGRATION_FLAG_KEY);
  } catch {
    // ignore
  }
}

export function parseJsonSafe(raw, fallback = null) {
  if (raw == null || raw === "") return fallback;
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

export function mergeById(canonical, legacy, { getTime } = {}) {
  const timeOf = getTime || ((item) => Number(item?.updatedAt || item?.createdAt || 0));
  const map = new Map();
  for (const item of canonical || []) {
    if (!item || item.id == null) continue;
    map.set(String(item.id), item);
  }
  for (const item of legacy || []) {
    if (!item || item.id == null) continue;
    const id = String(item.id);
    const existing = map.get(id);
    if (!existing) {
      map.set(id, item);
      continue;
    }
    if (timeOf(item) > timeOf(existing)) map.set(id, item);
  }
  return [...map.values()];
}

/**
 * Decide what the canonical list should be.
 * A: dest empty, source populated → take source
 * B: both populated, not complete → merge (Dexie wins on equal timestamps)
 * C: dest populated and complete → dest only
 * D: source malformed/empty → dest or []
 * Retry: complete flag but dest empty → take source again
 */
export function decideCanonicalItems({
  canonicalItems = [],
  legacyItems = [],
  completed = false,
  lossy = false,
}) {
  const dest = Array.isArray(canonicalItems) ? canonicalItems.filter((x) => x && x.id != null) : [];
  const src = Array.isArray(legacyItems) ? legacyItems.filter((x) => x && x.id != null) : [];
  const destEmpty = dest.length === 0;
  const srcEmpty = src.length === 0;

  if (destEmpty && srcEmpty) {
    return { items: [], write: false, reason: "fresh" };
  }
  if (!destEmpty && completed && !lossy) {
    return { items: dest, write: false, reason: "dexie-only" };
  }
  if (destEmpty && !srcEmpty) {
    return { items: src, write: true, reason: "legacy-only" };
  }
  if (!destEmpty && srcEmpty) {
    return { items: dest, write: false, reason: "dexie-populated" };
  }
  return { items: mergeById(dest, src), write: true, reason: "reconcile" };
}

export function verifyIds(expected, actual) {
  const got = new Set((actual || []).map((item) => item && String(item.id)));
  return (expected || []).every((item) => item && got.has(String(item.id)));
}

export async function reconcileAndCommit({
  entityName,
  canonicalItems,
  legacyItems,
  replaceCanonical,
  loadCanonical,
  completed,
  lossy,
  extraVerify,
}) {
  const decision = decideCanonicalItems({
    canonicalItems,
    legacyItems,
    completed: !!completed,
    lossy: !!lossy,
  });
  let items = decision.items;
  if (decision.write) {
    await replaceCanonical(items);
    const readback = await loadCanonical();
    if (!verifyIds(items, readback)) {
      throw new Error(`${entityName} migrate verify failed`);
    }
    if (extraVerify && !extraVerify(items, readback)) {
      throw new Error(`${entityName} migrate extra verify failed`);
    }
    items = readback;
  }
  if (decision.reason !== "fresh") {
    markEntityMigrated(entityName, { count: items.length, reason: decision.reason });
  }
  return { items, reason: decision.reason, wrote: decision.write };
}
