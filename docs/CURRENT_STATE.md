# EchoChat Lite — Current State

This is the current project-state document. If another Markdown file disagrees with **code + tests**, the code wins. Historical snapshots live in [docs/history/](history/).

**Last reconciled:** 2026-09-14 (core context integration hardened; Live Utilization still needs `ECHOCHAT_API_KEY`)  
**Canonical line:** GitHub `main` (production via Vercel)

Entry split (`/` landing, `/app/` application) is shipped on `main`. Do not treat `docs/history/` snapshots as the live entry or storage layout.

---

## Project

**EchoChat Lite** is a pure-frontend PWA: an AI character / companion that stays local-first and privacy-oriented.

- Zero build (HTML, CSS, native ES modules)
- Chat completions leave the device only through the API the user configures
- No `package.json` / npm app build; Node is used for tests and CI

---

## Entry boundary

```text
/                 → marketing landing (index.html / landing-v3.html)
/app/             → EchoChat Lite application
/app/index.html   → application HTML entry
```

Landing does not initialize application storage. It does not read or write `localStorage` / IndexedDB / Dexie application keys.

The application continues to use existing storage keys and schemas. Changing the URL from `/` to `/app/` does not create new data keys.

---

## Current architecture (implemented)

| Area | Status in code |
|------|----------------|
| Character | Implemented as a first-class domain + Dexie `characters` table, with legacy fallback from chats |
| Conversation | Implemented; a character can have more than one conversation |
| Message | Dexie-backed message store with localStorage dual-write / fallback |
| Memory | Quiet auto-write of durable facts (incl. “开始学习…”); chat shows **记下了**; related talk can surface a **想起了** chip; retrieval + idle anchors unchanged; prompt serialization frozen as user-owned background facts |
| Worldbook | Implemented (global + character books); prompt slot is setting/lore, not user facts |
| Relationship | Implemented (affinity plus brief/events) |
| Moments | Implemented |
| Reconstruction | Implemented (import existing chat into a character) |
| In-app Welcome | Still exists inside the app for first-time users with no chats; this is not the marketing landing |
| Plugin runtime | Minimal in-process hook on `assembleTurnContext`. No marketplace / DSH / sandbox. Builtin plugins: none |
| Product base | EchoChat domain. Chatbox / DSH / SillyTavern / LobeChat / Letta were **not** adopted as a base ([PRODUCT_BASE.md](architecture/PRODUCT_BASE.md)) |

Do not treat old “Character is not first-class” language in history docs as current.

---

## Storage

Confirmed from `src/core/storage.js`, `src/infrastructure/dexie-db.js`, `src/infrastructure/idb.js`.

### localStorage keys (do not rename)

| Key | Role |
|-----|------|
| `echodownload_lite_state_v1` | App state |
| `echodownload_worldbook_v1` | Worldbook (legacy path) |
| `echodownload_moments_v1` | Moments (legacy path) |
| `echodownload_relations_v1` | Relationship (legacy path) |
| `echodownload_meta_v2` | Schema version / migration log |
| `echodownload_migration_staging_v2` | Migration staging |
| `echodownload_onboard_done` | In-app welcome completed |
| `echodownload_ios_hint` | iOS install hint dismissed |
| `echodownload_chat_drafts_v1` | Composer drafts |

The `echodownload_*` prefix is a **compatibility name**. It is not a reason to migrate keys.

localStorage schema version in code: `SCHEMA_VERSION = 2` (v1 → v2 roleId migration).

### IndexedDB

| Database | Role |
|----------|------|
| `echochat` (Dexie) | Characters, conversations, messages, memories, relationships, moments, worldbook, assets metadata, migration log |
| `echodownload_assets` | Binary blobs (avatars / images) |

Do not change these names or schemas unless a dedicated storage work package says so.

---

## PWA

From `manifest.webmanifest` and `src/main.js`:

```text
manifest.id        = /app/
manifest.start_url = /app/
manifest.scope     = /app/
SW file            = /sw.js
SW registration    = { scope: "/app/" }
```

The service worker is written to leave `/`, `/index.html`, `/landing-v3.html`, and `/landing.html` unintercepted.

---

## Testing

Runnable from the repo root with Node 20+. CI (`.github/workflows/ci.yml`) runs:

```text
node tests/migration_atomicity_test.mjs
node tests/foundation_test.mjs
node tests/storage_cutover_test.mjs
node tests/core_product_test.mjs
node tests/reconstruction_test.mjs
node tests/core_loop_test.mjs
node tests/reply_clean_test.mjs
node tests/chat_send_test.mjs
node tests/theme_tokens_test.mjs
node tests/ambient_policy_test.mjs
node tests/v1_1_context_test.mjs
node tests/memory_representation_test.mjs
node tests/context_integration_test.mjs
node tests/plugin_runtime_test.mjs
node tests/lived_continuity_test.mjs
node tests/lived_thread_test.mjs
node tests/quiet_remember_test.mjs
node tests/continuity_write_path_test.mjs
node tests/continuity_perception_test.mjs
node tests/retrieval_regression_test.mjs
node tests/ui_refinement_wave1_test.mjs
node tests/ui_refinement_wave2_test.mjs
node tests/ui_refinement_wave3a_test.mjs
node tests/ui_refinement_wave3b_test.mjs
node tests/ui_refinement_wave4_test.mjs
node --check on src/**/*.js
node scripts/wave3a_ui_verify.mjs
node scripts/wave3b_ui_verify.mjs
node scripts/wave4_ui_verify.mjs
node scripts/landing_cta_verify.mjs
node scripts/continuity_ui_verify.mjs
```

There is no `npm test`. Historical pass counts (114/114, 142/142, …) belong in [docs/history/](history/), not here.

Representative verification after entry split: landing/app/CTA/storage/PWA/SW/1440/390 **25/25**; storage cutover **28/28**.

---

## Deploy

GitHub `main` deploys on Vercel as a static site. A push to `main` may trigger Production Deployment.

Configure the model in-app: **我的 → API 与模型**. Do not commit API keys.
