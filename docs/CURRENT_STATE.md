# EchoChat — Current State

If another Markdown file disagrees with **code + tests**, the code wins.

**Last reconciled:** 2026-09-15  
**Canonical line:** GitHub `main` (Cloudflare Pages static deploy: https://echochat-f4j.pages.dev/)

---

## Product

EchoChat is a **local-first AI companion PWA**. A character stays with the user across chat, memory, moments, and relationship — not a generic chatbot wrapper, agent OS, RAG demo, or character marketplace.

- Zero-build: HTML, CSS, native ES modules
- Chat completions leave the device only through the API the user configures
- No application bundler. `package.json` exists only to run `npm test`
- License: PolyForm Noncommercial 1.0.0

**Runtime foundation is frozen:** EchoChat Product Core. Do not migrate onto Chatbox, DeepSeek Harness, OpenAI Agents SDK, SillyTavern, LobeChat, or similar hosts. See [architecture/PRODUCT_BASE.md](architecture/PRODUCT_BASE.md).

---

## Entries

```text
/                 → marketing landing (index.html, landing-v3.html)
/app/             → application (app/index.html → src/main.js)
```

Landing does not initialize application storage and does not read or write `localStorage` / IndexedDB / Dexie keys.

---

## Architecture (implemented)

```text
UI  →  Domain  →  Repository  →  Dexie / Provider  →  OpenAI-compatible API
```

`assembleTurnContext` (`src/domain/turn-context.js`) is the **only** turn-context door. Plugins may append `extraPrompt`. They are not a second runtime.

| Area | Status |
|------|--------|
| Character | First-class Dexie `characters` + conversation config slots (Card V2 import/export) |
| Conversation | One character, many threads; Dexie messages with tail window + virtual list |
| Memory | Dexie `memories` canonical. Quiet auto-write of user facts. Schema and retrieval **frozen** |
| Moments | Lived traces from conversation, not Memory |
| Relationship | Affinity + brief/events; copy uses 认识第N天 — not a numeric meter |
| Worldbook | Global + character books; lore/setting, not user facts |
| Context Builder | Ordered prompt slots into `assembleTurnContext` |
| Provider | OpenAI-compatible stream in `src/domain/provider.js`; settings in the app, not git |
| Plugin | Builtin `extra-notes` as last-stage `extraPrompt` |
| Reconstruction | Import an existing transcript into a character |
| Voice | TTS: `speechSynthesis`. STT: Web Speech into the composer (not the chat Provider) |
| Design | Morning Mint / Ripple **frozen**. Component-scope only |

Do not change Memory schema, retrieval, `assembleTurnContext`, Provider architecture, or Dexie schema unless a dedicated work package says so.

---

## Storage (names frozen)

Confirmed from `src/core/storage.js`, `src/infrastructure/dexie-db.js`, `src/infrastructure/idb.js`.

### localStorage (do not rename)

| Key | Role |
|-----|------|
| `echodownload_lite_state_v1` | App state |
| `echodownload_worldbook_v1` | Worldbook (legacy path) |
| `echodownload_moments_v1` | Moments (legacy path) |
| `echodownload_relations_v1` | Relationship (legacy path) |
| `echodownload_meta_v2` | Schema version / migration log |
| `echodownload_migration_staging_v2` | Migration staging |
| `echodownload_onboard_done` | In-app welcome completed |
| `echodownload_ios_hint` | Defined as `KEYS.IOS_HINT`; **not read or written** in current code |
| `echodownload_chat_drafts_v1` | Composer drafts |
| `echodownload_dexie_migration` | Per-entity Dexie hydrate/migrate flags (`satellite-reconcile.js`) |

`echodownload_*` is a **compatibility prefix**. It is not a reason to migrate keys. `SCHEMA_VERSION = 2` is the localStorage roleId migration, not the Dexie table version.

### IndexedDB

| Database | Role |
|----------|------|
| `echochat` (Dexie) | Characters, conversations, messages, memories, relationships, moments, worldbook, asset metadata, migration log |
| `echodownload_assets` | Binary blobs (avatars / images) |

Dexie is **canonical** for those entities after hydrate. `echodownload_lite_state_v1` still dual-writes settings, the chat list, and the **full** message fallback. The UI peeks the last `UI_WINDOW` (80) from the runtime cache; `hydrateChat` must not shrink the store copy. Moments / worldbook / relations / memory **stop refreshing** their legacy localStorage (or `store.longTermMemory`) keys once `usingCanonical` is true; those keys remain recovery copies, not live mirrors.

---

## PWA

```text
manifest.id        = /app/
manifest.start_url = /app/
manifest.scope     = /app/
SW file            = /sw.js
SW registration    = { scope: "/app/" }
```

The service worker leaves `/`, `/index.html`, `/landing-v3.html`, and `/landing.html` unintercepted.

---

## Design

In-app language is **Morning Mint** (`src/styles/tokens.css`) plus quiet Ripple motion (`src/styles/motion.css`). Spec: [design.md](design.md).

Do not add a new theme kit, animation system, component library, or particle-demo chat background.

---

## Shipped product loop

- Create / import Character (templates, blank, Card V2 JSON)
- Chat with streaming paint and a virtualized long transcript
- Quiet Memory of user facts; retrieve-for-turn (photography aliases only — frozen)
- Moments and Relationship as lived traces
- Continuity sheet (记忆与痕迹) from real data only
- First-run starters fill the composer; they do not auto-send
- Reunion / resume copy from `lastMessageAt`, last preview, moments, memory, stage

---

## Tests

Local and CI node entry:

```bash
npm test
```

No other local test command. Browser checks need Chrome and run in CI only (`scripts/*_verify.mjs` listed in `.github/workflows/ci.yml`).

Optional live model matrix (never logs the key):

```bash
node scripts/live_continuity_matrix.mjs
```

Credentials: env or gitignored `.echochat.local.json`. Do not commit keys.

Development snapshot: [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md).

---

## Deploy

`main` deploys on Vercel as a static site. Configure the model in-app: **我的 → API 与模型**.

---

## Technical debt (real)

1. Message dual-write (STATE fallback vs Dexie full history) is compatibility, not a missing chat shell. The UI window is cache-only; hydrate must not truncate STATE. Satellite entities are Dexie-only after hydrate.
2. `src/main.js` is a large orchestrator by design
3. Plugin layer must not grow into a marketplace or agent OS
4. Firefox has no Web Speech STT; iOS installed-PWA recognition is unreliable
5. Some OpenAI-compatible models still mis-own user facts (e.g. photography). Retrieval stays frozen; do not “fix” that with new aliases
