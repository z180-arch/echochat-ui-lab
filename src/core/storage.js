// ============================================================
//  EchoChat Rebuild · Storage + Schema Migration
// ============================================================

const PREFIX = "echochat_v2_";
export const KEYS = {
  STATE: PREFIX + "state",
  SCHEMA: PREFIX + "schema",
};

const CURRENT_SCHEMA = 2;

export function getSchemaVersion() {
  try {
    return parseInt(localStorage.getItem(KEYS.SCHEMA) || "1", 10) || 1;
  } catch (e) {
    return 1;
  }
}

export function needsMigration() {
  return getSchemaVersion() < CURRENT_SCHEMA;
}

function migrateV1toV2(raw) {
  // v1: roleKey = hash(persona); v2: stable roleId
  if (!raw || typeof raw !== "object") return raw;
  const chats = (raw.chats || []).map((c) => {
    if (c.roleId) return c;
    const roleId = c.config?.memRoleKey || c.roleKey || "role_" + (c.id || Date.now().toString(36));
    return { ...c, roleId };
  });
  return { ...raw, chats, schemaVersion: 2 };
}

export function runMigrations() {
  let ver = getSchemaVersion();
  let data = null;
  try {
    const s = localStorage.getItem(KEYS.STATE);
    data = s ? JSON.parse(s) : null;
  } catch (e) {
    data = null;
  }
  if (ver < 2) {
    data = migrateV1toV2(data || {});
    ver = 2;
  }
  try {
    localStorage.setItem(KEYS.SCHEMA, String(CURRENT_SCHEMA));
    if (data) localStorage.setItem(KEYS.STATE, JSON.stringify(data));
  } catch (e) {}
  return data;
}

export const storage = {
  load() {
    try {
      if (needsMigration()) return runMigrations();
      const s = localStorage.getItem(KEYS.STATE);
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  },
  save(state) {
    try {
      localStorage.setItem(KEYS.STATE, JSON.stringify(state));
      localStorage.setItem(KEYS.SCHEMA, String(CURRENT_SCHEMA));
    } catch (e) {
      console.warn("[storage] save failed", e);
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEYS.STATE);
      localStorage.removeItem(KEYS.SCHEMA);
    } catch (e) {}
  },
};
