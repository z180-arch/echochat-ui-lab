---
name: echo-storage
description: Guide Dexie, repository hooks, satellite hydrate, localStorage keys, migration, backup, and restore work in EchoChat. Use when changing src/repository, src/infrastructure, storage.js, message-store persist, backup.js, or echodownload_* keys. Do not use for CSS, landing, provider HTTP, or assembleTurnContext prompt text.
---

# EchoChat storage

Dexie `echochat` is canonical after hydrate. Do not migrate to SQLite.

- Keys: `src/core/storage.js`. Do not rename `echodownload_*` unless the user confirmed.
- Hooks: `getStorageHooks()` in `src/repository/` (production Dexie adapters; tests may replace).
- Satellites (moments / worldbook / relations / memory): Dexie-only after `usingCanonical`. Legacy LS is recovery, not a live mirror.
- Messages: Dexie full history; UI peeks `UI_WINDOW` (80). Do not shrink the store fallback on hydrate.
- Backup: `src/domain/backup.js` `exportProductBackup` / `importProductBackup` / `resetProductData`.
- Migration flags: `echodownload_dexie_migration` via `satellite-reconcile.js`. Status APIs in `dexie-migration.js`.

Frozen: Dexie table schema and key names unless the task says so.

Verify with `tests/storage_cutover_test.mjs`, `tests/storage_satellite_test.mjs`, `tests/memory_persist_test.mjs`, `tests/migration_atomicity_test.mjs`.
