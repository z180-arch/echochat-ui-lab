/**
 * Persistence ports for domain.
 *
 * Domain hydrators and backup may call these. They must not import
 * `src/infrastructure` directly.
 */

export {
  parseJsonSafe,
  isEntityMigrated,
  reconcileAndCommit,
  markEntityFailed,
  markEntityMigrated,
  mergeById,
  clearMigrationFlags,
} from "../infrastructure/satellite-reconcile.js";

export { deleteDb } from "../infrastructure/dexie-db.js";
