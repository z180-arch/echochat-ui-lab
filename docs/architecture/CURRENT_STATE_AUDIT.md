# EchoChat Current State Audit

**Date:** 2026-09-15  
**Branch:** `main` (audit started at `e10dca9`)  
**Rule:** code + tests win over Markdown. Historical claims are marked Confirmed / Resolved / Outdated / Needs Investigation.

This file is a research snapshot. It is not a rewrite plan.

### Remediation in this pass (P0 only)

| ID | Result | Commit |
|----|--------|--------|
| P-01 | Domain satellites/backup import `src/repository/persistence.js` instead of infrastructure | `fix(domain): stop importing infrastructure from domain modules` |
| P-02 | `CharacterRepository.permanentDelete` no longer imports domain | `fix(repository): remove domain cascade imports from character delete` |
| P-03 | `DATA_OWNERSHIP.md` matches Dexie-canonical storage and current plugins | `docs(ownership): align DATA_OWNERSHIP with Dexie-canonical storage` |
| P-04 | CURRENT_STATE records satellite Dexie-only persist + migrate flag key | `docs(current-state): record satellite Dexie-only persist and migrate flag key` |
| P-05 | Dexie migration status/rollback APIs import satellite flag helpers | `fix(migration): wire Dexie rollback status APIs to satellite flags` |
| P-06 | `storeBlob` writes `(id, blob)`; Dexie adapter has `updateMetadata` | `fix(assets): persist blobs under the repository-generated id` |

P-07 and P-08 remain open (P1). See `ARCHITECTURE_IMPROVEMENT_PROPOSAL.md`.

---

## How this audit was done

1. Read existing docs (`README`, `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT_STATUS.md`, `docs/ROADMAP.md`, `docs/architecture/PRODUCT_BASE.md`, `PLUGIN_POLICY.md`, `DATA_OWNERSHIP.md`, `THIRD_PARTY_SOURCES.md`). There is no `docs/audit/` or `docs/reports/` tree.
2. Verified claims against `src/`, `tests/`, `.github/workflows/ci.yml`.
3. Did not treat “a nicer architecture exists” as a defect.

### Historical claims (re-checked)

| Historical claim | Status | Evidence |
|------------------|--------|----------|
| `src/main.js` is overloaded | **Confirmed as size/friction; not a runtime defect** | 2647 lines, ~174 `App` methods. Docs already call this “large orchestrator by design”. Domain send/context/provider are extracted and tested. No failing test, no error log. |
| Domain crosses layer boundaries | **Confirmed** | Domain satellites import `src/infrastructure/satellite-reconcile.js`. `backup.js` imports `deleteDb`. See Dependency Analysis. |
| UI talks to Dexie | **Resolved** | Zero `src/ui` imports of Dexie / `infrastructure` / `idb`. |
| Domain imports UI | **Resolved** | Zero `src/domain` imports of `src/ui` or `src/styles`. |
| Dexie fallback exists | **Confirmed (intentional)** | Open failure logs and throws; per-entity paths fall back to store/localStorage. Tests in `storage_cutover_test.mjs` / `storage_satellite_test.mjs`. |
| Dual-write / split sources | **Confirmed (partially by design)** | Messages/settings always dual-write. Satellites **stop** writing localStorage after hydrate. CURRENT_STATE overclaims “dual-write remains for compatibility” for all entities. |
| localStorage still in use | **Confirmed** | Keys in `src/core/storage.js`. Satellites also `localStorage.getItem` before hydrate. |
| Dead code | **Confirmed (some)** | Unused `domain/asset.js` runtime path, unused `infrastructure/asset.js`, unused satellite Repository shells, DSH throw seat (intentional), `KEYS.IOS_HINT` never read/written. |
| `assembleTurnContext` is the only prompt door | **Confirmed** | `chat.js` → `buildSystemPrompt` → `assembleTurnContext`. Plugin `extraPrompt` is last-stage append. |
| Provider architecture is broken | **Outdated as a defect claim** | OpenAI-compatible stream in `src/domain/provider.js` with tests. Quirks exist; see Possible Improvement. |
| Test coverage is missing | **Outdated as a blanket claim** | 41 Node suites via `npm test`; CI also runs Chrome verify scripts. Gap: `App` / `main.js` orchestration is not executed in Node tests. |
| `DATA_OWNERSHIP.md` describes current storage | **Outdated** | Still says localStorage holds chats/characters/memory/relations/moments and “插件系统尚未实现”. |
| Plugin marketplace / Agent OS is current | **Outdated** | Current surface is builtin `extra-notes` + `LocalPluginRuntime`. |

---

## Current Architecture

### Product identity

EchoChat is a **local-first AI companion / character continuity PWA**.

It is not a ChatGPT clone, RAG knowledge base, enterprise workspace, Agent OS, automation platform, productivity dashboard, or plugin marketplace.

Runtime foundation: **EchoChat Product Core** (frozen as host). See `PRODUCT_BASE.md`.

### Tech stack

| Piece | Current fact |
|-------|----------------|
| UI | Zero-build HTML + CSS + native ES modules. No React, no bundler, no Tailwind. |
| Entry | `/` marketing (`index.html`, `landing-v3.html`). `/app/` application (`app/index.html` → `src/main.js`). |
| State | In-memory store (`src/core/store.js`) persisted to `echodownload_lite_state_v1`. |
| Canonical entities | Dexie 4.0.10 vendored (`src/infrastructure/vendor/dexie.mjs`), DB name `echochat`, schema `db.version(1)`. |
| Blobs | Separate IDB `echodownload_assets`. |
| Provider | OpenAI-compatible HTTP + SSE in `src/domain/provider.js`. Settings live in the app, not git. |
| Tests | `package.json` has **no product dependencies**. `npm test` → `scripts/run_node_tests.mjs`. |
| PWA | `manifest.webmanifest` scope `/app/`; `sw.js` registered with `{ scope: "/app/" }`. |
| License | PolyForm Noncommercial 1.0.0. Out of scope for this task. |

### Directory structure (runtime)

```text
src/
  main.js              application shell / event wiring (~2647 lines)
  core/                store, events, storage keys, utils, version
  domain/              Character, chat, turn-context, memory, moments,
                       relations, worldbook, provider, reconstruction, voice
  ui/                  views, components, virtual list, stream paint, theme
  styles/              Morning Mint tokens + Ripple motion (frozen)
  repository/          persistence ports (some live, some unused shells)
  infrastructure/      Dexie, adapters, satellite reconcile, blob IDB
  runtime/             LocalPluginRuntime, registry, pipeline
  plugins/             builtin extra-notes
  adapters/            provider/ui facades; dsh throw-only Planned seat
app/index.html
index.html             marketing landing
landing-v3.html
sw.js
manifest.webmanifest
tests/                 41 Node suites
scripts/               node test runner + CI Chrome verifies
```

### State management

- `store` is the in-process app state (settings, chat list, UI window of messages, `longTermMemory` cache before memory hydrate).
- Every `store.set` writes `KEYS.STATE`.
- Domain modules keep their own runtime caches (message window, memory snapshot, moments, worldbook, relations) and persist through repository hooks / Dexie.
- `events` / `EVT` notify the shell to re-render. `main.js` subscribes and calls `render()`.

### Storage

Canonical after bootstrap (from `dexie-db.js` + hydrators):

- Dexie `echochat`: characters, conversations, messages, memories, relationships, moments, worldbook, asset **metadata**, migration log.
- IDB `echodownload_assets`: binary blobs.
- localStorage:
  - `echodownload_lite_state_v1` — app state (settings, chats list, last 80 messages per chat after hydrate).
  - `echodownload_worldbook_v1` / `_moments_v1` / `_relations_v1` — **legacy / pre-hydrate / emergency**, not live dual-write after `usingCanonical`.
  - `echodownload_meta_v2`, `echodownload_migration_staging_v2` — LS schema v1→v2.
  - `echodownload_onboard_done`, `echodownload_chat_drafts_v1`.
  - `echodownload_dexie_migration` — per-entity Dexie migrate flags (**missing from CURRENT_STATE key table**).
  - `echodownload_ios_hint` — defined as `KEYS.IOS_HINT`, **never read or written**.

`SCHEMA_VERSION = 2` is the **localStorage roleId** migration, not the Dexie table version (Dexie is `version(1)`).

### Provider

- `streamChat` / `chatCompletion` in `src/domain/provider.js`.
- Errors classified in `src/domain/provider-error.js`.
- `src/adapters/provider/index.js` strips secrets for public info; **production chat imports domain directly**.
- Transient retry: network + 429. HTTP 5xx is **not** retryable. Covered by tests as current behavior.

### Context

One door: `assembleTurnContext` (`src/domain/turn-context.js`).

Helpers, not competing assemblers:

- `context-builder.js` — slot extraction / `assembleBehaviorContext`.
- `runtime/context.js` — `createEchoContext` bag.
- `runtime/pipeline.js` — sync `extendContext` chain.
- Plugin `extraPrompt` appended as **Additional notes (not user memory)**.

Do not delete this door to invent a generic pipeline.

### Memory

- Dexie `memories` canonical after hydrate.
- Quiet auto-write of user facts (`memory-candidates.js`).
- Retrieve-for-turn is **frozen** (photography aliases included). Schema/retrieval must not change unless a dedicated task says so.
- After hydrate, memory **does not** refresh `store.longTermMemory`. Persist failure logs a warning and does **not** fall back to store (unlike moments/worldbook/relations emergency LS write).

### UI

- Morning Mint + Ripple, frozen. Component-scope only.
- Shell is `src/main.js` + `src/ui/views/index.js`.
- Chat paint: virtual list + stream paint.
- Avatars: `FileReader` data URLs into store — **not** `AssetRepository` / blob IDB.

---

## Dependency Analysis

Documented allowed edges (`docs/ARCHITECTURE.md`):

```text
main → ui / domain / core / runtime / plugins
ui → domain / core
domain → core / repository / runtime
runtime → core
repository → infrastructure / core
```

Documented claims that still hold:

- **No** `ui → Dexie`
- **No** `domain → ui`

### Violations (code)

**1. `domain → infrastructure` (forbidden by the matrix)**

| File | Import |
|------|--------|
| `src/domain/backup.js` | `deleteDb` from `dexie-db.js`; `clearMigrationFlags` from `satellite-reconcile.js` |
| `src/domain/memory.js` | `isEntityMigrated`, `reconcileAndCommit`, `markEntityFailed`, `mergeById` |
| `src/domain/moments.js` | same family + `parseJsonSafe` |
| `src/domain/relations.js` | `parseJsonSafe`, `isEntityMigrated`, `markEntityMigrated`, `markEntityFailed` |
| `src/domain/worldbook.js` | same family + `mergeById` |

**2. `repository → domain` (upward)**

`src/repository/character.js` `permanentDelete` dynamically imports `domain/memory.js`, `domain/moments.js`, `domain/relations.js`. Domain `permanentDeleteCharacter` already ran that cascade. The extra imports close a cycle.

**3. `infrastructure → domain` and `infrastructure → repository`**

`src/infrastructure/dexie-migration.js` imports `legacyAdapter` and dynamically imports domain hydrate functions. `migrateAllToDexie` has **no production caller**.

### Clean layers

| Layer | Outbound |
|-------|----------|
| `src/ui` | domain + core only |
| `src/main.js` | ui / domain / core / runtime / plugins |
| `src/runtime` | core |
| `src/core` | self |

### Naming smell (not a cycle)

Domain modules import `getStorageHooks` from `src/repository/test-hooks.js`. That file **is** the production hook bag; tests replace it. The filename reads as test-only.

### Unused repository shells

`MomentRepository`, `WorldbookRepository`, `MemoryRepository`, `RelationshipRepository` are barrel-exported. Live satellites talk to Dexie via `getStorageHooks()` plus `satellite-reconcile`, not those classes. Architecture diagram overstates a uniform Repository layer.

---

## Data Flow

```text
User types in composer (main.js UI)
  → optional STT into composer (not the chat Provider)
  → domain/chat.sendMessage
      → messageStore.addMessage (user row)
          → store.addMessage (LS STATE, UI window)
          → Dexie messages.create (best-effort)
      → assembleTurnContext (only prompt door)
          → persona / retrieveMemoriesForTurn / worldbook
            / relationship / moments / lived-gap
          → assembleBehaviorContext
          → createEchoContext + applyPluginContext (extra-notes → extraPrompt)
      → provider.streamChat (OpenAI-compatible SSE)
      → stream-paint + virtual list
      → messageStore.updateMessage (assistant row)
      → quietRememberUserText (Memory, frozen retrieval)
      → captureLivedMoment (Moments, not Memory)
      → recordChatTurn (Relationship)
  → persist via Dexie hooks; STATE keeps last UI_WINDOW (80) messages
```

Bootstrap:

```text
main.js App.init
  → runMigrations()          localStorage SCHEMA_VERSION 1→2
  → messageStore.bootstrapStorage
      → hydrate messages / characters / conversations
      → hydrate moments / worldbook / relations / memory
  → LocalPluginRuntime.start(builtinPlugins)
  → render + event subscriptions
```

Backup / reset (`domain/backup.js`):

```text
clear domain runtime + Dexie tables via hooks
  → storage.clearAll()
  → clearMigrationFlags()
  → store.reset()
  → deleteDb()
```

---

## Existing Problems

Classification rule used here: **Confirmed Problem** requires at least one of: error logs, failing tests, architecture-rule violation in code, real user feedback, repeatable performance issue, data-consistency issue. “A cooler stack exists” is not Confirmed.

### Confirmed Problem

| ID | Problem | Evidence | P0? |
|----|---------|----------|-----|
| P-01 | Domain imports infrastructure (layer rule broken) | Static imports listed above. Violates `ARCHITECTURE.md` allowed edges. | **Yes** — listed P0 example; fix is a port, not a schema change. |
| P-02 | Repository `permanentDelete` imports domain (cycle) | `src/repository/character.js` dynamic imports. Domain already cascades. | **Yes** — same class of boundary bug. |
| P-03 | `DATA_OWNERSHIP.md` storage + plugin sections are false | Doc says LS holds chats/characters/memory/relations/moments; “插件系统尚未实现”. Contradicts code and `PLUGIN_POLICY.md`. Agents will implement the wrong storage story. | **Yes** — agent-safety / architecture-rule mismatch. |
| P-04 | CURRENT_STATE dual-write + key table are incomplete | Satellites stop LS writes after hydrate. `echodownload_dexie_migration` omitted. | **Yes** — same doc/runtime split. |
| P-05 | `dexie-migration.js` rollback/status APIs throw `ReferenceError` | `getMigrationState` / `setMigrationState` used but not imported (`dexie-migration.js` ~453–472). Functions exist in `satellite-reconcile.js`. No production caller, but the API is broken if invoked. | **Yes** — “迁移不可验证” example; small fix. |
| P-06 | `AssetRepository.storeBlob` cannot persist blobs | `legacyAdapter.storeBlob(blob, id)` ignores `id` and calls `idb.putBlob(blob)`. `putBlob(id, blob)` no-ops when `blob` is undefined. `dexieAssetAdapter.updateMetadata` is missing; `AssetRepository.updateMetadata` will always warn. UI currently avoids this path (data URLs). Landmine for the next agent that “wires assets properly”. | **Yes** — data-integrity bug with code proof. |
| P-07 | After long-chat hydrate, STATE keeps only last 80 messages | `message-store.js` `UI_WINDOW`. If Dexie later fails, fallback is truncated. Data-consistency **risk**. No production incident. DEVELOPMENT_STATUS already says: tighten dual-write only if real desync shows up. | **No (P1)** — latent; changing it is a storage-behavior change. Do not migrate schema to “fix” it. |
| P-08 | Memory persist failure does not emergency-write store | `memory.js` `schedulePersist` catch only logs. Moments/worldbook do LS emergency write. | **No (P1)** — real asymmetry; do not change Memory persist policy in this pass without a dedicated task. Memory schema/retrieval is frozen. |

### Possible Improvement

- Split `main.js` by view only if a concrete feature cannot land safely. Size alone is not a rewrite trigger.
- Rename `repository/test-hooks.js` → `storage-hooks.js`.
- Point live satellites at named Repositories, **or** delete unused Repository shells so the diagram matches code. Do not do both in a cleanup sweep.
- Resume lightweight satellite LS dual-write **only if** Dexie-loss recovery is a product requirement.
- HTTP 5xx retry policy: decide and test; do not silently change Provider architecture.
- Empty completed reply currently becomes `errorKind: "unknown"`.
- Stop embedding avatar data URLs in STATE once blob storage works.
- Remove or wire `KEYS.IOS_HINT`. Do not rename live keys.
- `searchMessages` / `getMessagesPaginated` / proactive relation APIs / unused worldbook I/O helpers: delete or productize, don’t leave half-APIs.
- `rollbackFromStaging` in `storage.js` is defined and unused (LS v1→v2 path is otherwise tested).

### Future Idea

- SQLite WASM / OPFS. No evidence current Dexie is the bottleneck. Requires a Storage Spike (Web, Worker, OPFS, migration, backup, restore, performance) before any decision.
- Tauri / mobile / Capacitor. Core must stay platform-independent. Not current work.
- Vector DB / embeddings. Recall accuracy, false recall, latency, token cost, device capability must be measured first. FTS / tags / time / importance / character scope stay first.
- CharacterIdentity / CharacterProfile / CharacterWorld / CharacterContinuity split. Current Character model has not been shown to block features.
- Plugin marketplace, JS sandbox, MCP host, tool-calling platform. Product identity forbids these as defaults.
- Drop message dual-write entirely once Dexie-only recovery is proven.
- Ship `/app` without marketing HTML.

### Explicitly not problems

- Using Dexie instead of SQLite.
- Using vanilla ES modules instead of React.
- `assembleTurnContext` existing.
- `src/main.js` existing as an orchestrator.
- Builtin `extra-notes` plugin.
- Frozen Morning Mint.
- Frozen Memory retrieval aliases.

---

## What this audit will not do

- Rewrite Product Core onto Chatbox / DSH / OpenAI Agents SDK / SillyTavern.
- Change Memory schema, retrieval, `assembleTurnContext`, Provider architecture, or Dexie table schema.
- Rename `echodownload_*` keys.
- Touch `LICENSE`.
