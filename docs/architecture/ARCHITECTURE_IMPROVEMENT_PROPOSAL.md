# Architecture Improvement Proposal

**Date:** 2026-09-15  
**Status:** Proposal only. Do not implement from this file without an explicit task.  
**Basis:** `CURRENT_STATE_AUDIT.md`, `AGENT_SYSTEM_AUDIT.md`, and the P0 fixes already on `main`.

This is not a rewrite. It is a list of follow-ups that remain after the confirmed P0 defects were closed.

---

## What must stay

- Product identity: local-first Character Continuity companion, not an Agent OS.
- Host: EchoChat Product Core. No Chatbox / DSH / Agents SDK / SillyTavern runtime.
- Frozen unless a dedicated task says otherwise: Memory schema, retrieval, `assembleTurnContext`, Provider architecture, Dexie table schema, `echodownload_*` key names, Morning Mint.
- Storage: Dexie remains the default. SQLite WASM / OPFS is a research candidate only, after a Storage Spike with evidence.
- Context: extend `assembleTurnContext` with blocks / priority / budget / source tracking if needed. Do not replace it with a generic pipeline.

---

## After P0: remaining real friction

### 1. Message UI window vs Dexie history (P-07)

**Files:** `src/domain/message-store.js` (`UI_WINDOW` = 80), `src/core/store.js` (`KEYS.STATE`)

**Problem:** After hydrate, STATE keeps only the last 80 messages. If Dexie later fails, fallback history is truncated. That is a data-consistency **risk**, not a production incident.

**Do not do:** schema migration, SQLite, or dropping dual-write in one sweep.

**If authorized later:** add a recovery test that hydrates, truncates STATE, kills Dexie, and asserts the product either refuses silently-wrong history or reloads from a real backup. Only then change fallback policy.

### 2. Memory persist failure has no emergency copy (P-08)

**Files:** `src/domain/memory.js` `schedulePersist`

**Problem:** Moments/worldbook write localStorage on Dexie persist failure. Memory only logs. Retrieval/schema stay frozen; this is persist-policy only.

**If authorized later:** mirror the satellite emergency write **or** document that Memory is Dexie-or-bust after hydrate. Add a test. Do not expand retrieval aliases.

### 3. Repository diagram vs live satellites

**Files:** `src/repository/moment.js`, `worldbook.js`, `memory.js`, `relationship.js` (unused shells); live code in `src/domain/{moments,worldbook,memory,relations}.js` + `getStorageHooks()`

**Problem:** Architecture text describes a uniform Repository layer. Satellites hydrate themselves. Unused shells invite agents to “finish” a second persist path.

**If authorized later:** pick one — route satellites through the named Repositories, **or** delete the unused shells and say domain+hooks is the port. Not both in a cleanup PR.

### 4. `getStorageHooks` lives in `storage-hooks.js`

**Status:** Done this pass. File is `src/repository/storage-hooks.js`.

**Problem:** Filename tells agents the production persist port is a test helper.

**If authorized later:** rename to `storage-hooks.js` and update imports. Behavior unchanged.

### 5. `src/main.js` size

**Files:** `src/main.js` (~2647 lines), `src/ui/views/index.js`

**Problem:** Agent blast radius. Domain chat/context/provider are already extracted. No runtime failure.

**If authorized later:** extract one view’s handlers only when that view is being changed. Do not split the file “because it is large”.

### 6. Unused / half-wired surfaces

**Files:** `src/domain/asset.js` (now the blob port works, UI still uses data URLs), `src/infrastructure/asset.js`, proactive APIs in `relations.js`, `searchMessages` / `getMessagesPaginated`, empty onboard stubs, `src/adapters/dsh` throw seat.

**Problem:** Agents may productize dead APIs. DSH throw is intentional Planned.

**If authorized later:** delete true dead helpers **or** wire avatars to `AssetRepository` now that `storeBlob` works. One concern per change. Do not “cleanup all”.

### 7. `dexie-migration.js` bulk harness

**Files:** `src/infrastructure/dexie-migration.js` (`migrateAllToDexie` unused; still imports `legacyAdapter` — infrastructure → repository)

**Problem:** A second migration story beside the live satellite hydrators. Status APIs are fixed; the bulk path is still unused.

**If authorized later:** delete the unused harness **or** call it from a verified test. Do not run it in production bootstrap.

### 8. Agent contract tightening

**Files:** `AGENTS.md`, `.cursor/skills/echo-references/SKILL.md`

**Problem:** Freeze text can be misread as “never edit `memory.js`”. echo-references trigger is “at the start of EchoChat work”. Must-confirm list (user-data wipe, schema/keys/migration, LICENSE, deleting companion loops, changing product identity) is implied, not listed.

**If authorized later:** three small edits, no new skills, no `docs/superpowers/plans/`.

---

## Explicitly rejected as next work

| Idea | Why not now |
|------|-------------|
| Dexie → SQLite / OPFS | No measured storage failure. Needs a Storage Spike first. |
| Tauri / Capacitor / mobile | Core must stay platform-independent. No product demand in this pass. |
| Vector DB / embeddings | Recall/false-recall/latency/cost/device not measured. FTS/tags/time/importance/character-scope stay first. |
| CharacterIdentity / Profile / World / Continuity split | Current Character model has not blocked a feature. |
| Plugin marketplace / JS sandbox / MCP host / tool platform | Violates product identity. |
| React / bundler / new CSS kit | Zero-build PWA is the host. |
| Replace `assembleTurnContext` | One door is working and tested. |

---

## Suggested order if a next task is authorized

1. Agent-contract nits (`AGENTS.md` must-confirm + freeze clarification; narrower echo-references trigger). Lowest risk.
2. Rename `test-hooks.js` **or** decide unused Repository shells (pick one). **Rename done** (`storage-hooks.js`).
3. P-07 recovery test before any dual-write change.
4. P-08 Memory emergency persist only with a dedicated Memory persist task.
5. Storage Spike (optional, research) — only if P-07 becomes a real incident or size/perf evidence appears.

Do not start 3–5 as a bundled “architecture evolution” PR.
