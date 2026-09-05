# EchoChat Lite — Current State

This is the current project-state document. If another Markdown file disagrees with **code + tests**, the code wins. Historical snapshots live in [docs/history/](history/).

**Date of this snapshot:** 2026-09-05  
**Branch at writing:** `feat/landing-app-entry-split`  
**Entry-split commit:** `83108c7` (`feat: separate landing and app entry`)

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

`landing.html` in the working tree may still be leftover visual work from before the entry split. It is **not** the official `/` entry. Do not mix it into entry-split or packaging assumptions.

---

## Current architecture (implemented)

| Area | Status in code |
|------|----------------|
| Character | Implemented as a first-class domain + Dexie `characters` table, with legacy fallback from chats |
| Conversation | Implemented; a character can have more than one conversation |
| Message | Dexie-backed message store with localStorage dual-write / fallback |
| Memory | Implemented (retrieve-for-turn, conservative candidate write) |
| Worldbook | Implemented (global + character books) |
| Relationship | Implemented (affinity plus brief/events) |
| Moments | Implemented |
| Reconstruction | Implemented (import existing chat into a character) |
| In-app Welcome | Still exists inside the app for first-time users with no chats; this is not the marketing landing |

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
node tests/ui_refinement_wave1_test.mjs
node tests/ui_refinement_wave2_test.mjs
node tests/ui_refinement_wave3a_test.mjs
node tests/ui_refinement_wave3b_test.mjs
node tests/ui_refinement_wave4_test.mjs
node --check on src/**/*.js
node scripts/wave3a_ui_verify.mjs
node scripts/wave3b_ui_verify.mjs
node scripts/wave4_ui_verify.mjs
```

There is no `npm test`. Historical pass counts (114/114, 142/142, …) belong in [docs/history/](history/), not here.

Entry-split check (2026-09-05, isolated Chrome against local static server): landing/app/CTA/storage/PWA/SW/1440/390 **25/25**. Storage cutover suite **28/28**.

---

## Deploy

GitHub `main` deploys on Vercel as a static site. This branch is not `main` until merged.

Configure the model in-app: **我的 → API 与模型**. Do not commit API keys.
