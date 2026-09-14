# EchoChat Lite — Architecture

Describes the **current** tree, not a proposed redesign. Source: `index.html`, `app/index.html`, `src/`, `sw.js`, `manifest.webmanifest`.

---

## Surfaces

```text
Landing (/)
    marketing page only
    no application storage init
        ↓  link /app/
Application (/app/)
    app/index.html
        ↓
    src/main.js  (shell, splash, in-app welcome | hub)
        ↓
    Character / Conversation / Memory / Worldbook / Relationship / Moments
        ↓
    repository layer (src/repository/)
        ↓
    storage
        localStorage (echodownload_* keys)
        IndexedDB Dexie (echochat)
        IndexedDB blobs (echodownload_assets)
```

Packaging later can ship the application without the marketing HTML. App code lives under `src/`; the HTML entry is `app/index.html`. `src/` stays at the repository root today.

---

## Product base

Chosen 2026-09-12: **EchoChat domain is the product base.** Chatbox, DeepSeek Harness, SillyTavern, LobeChat, and Letta were evaluated and rejected as replacements. Details: [architecture/PRODUCT_BASE.md](architecture/PRODUCT_BASE.md).

Turn assembly is one function: `assembleTurnContext` in `src/domain/turn-context.js`. `buildSystemPrompt` is a thin wrapper. Plugin `extraPrompt` is a last-stage hook, not a second runtime.

Prompt slots, in order, when present:

```text
Character identity / scenario / examples / style
About how the user wants to be seen
Known about the user (frozen Memory header — not about the character)
Relationship with the user (how you two relate — not biography)
Lived thread (gap-return only)
World Information (setting and lore — not user facts)
Additional notes (plugin extraPrompt — not user memory)
```

Identical worldbook copies of a user Memory line are dropped at assembly. Retrieval, storage, and the frozen Memory header are not retuned here.

Landing (`/`) does not load this pipeline. The application (`/app/`) does.

## Application layers

| Layer | Path | Role |
|-------|------|------|
| Shell | `src/main.js`, `src/ui/views/` | Bootstrap, orchestration, event wiring; in-app welcome vs companion shell |
| Domain | `src/domain/` | Character, chat, **turn context**, memory, worldbook, relations, moments, reconstruction, provider |
| Repository | `src/repository/` | Persistence ports; Dexie with legacy adapter |
| Infrastructure | `src/infrastructure/` | Dexie, IDB blobs, asset resolver |
| Core | `src/core/` | Events, store, storage keys, utils |
| UI | `src/ui/`, `src/styles/` | Morning Mint tokens, components, ambient policy |
| Runtime | `src/runtime/` | EchoContext + PluginRegistry + LocalPluginRuntime |
| Adapters | `src/adapters/` | UI / Provider facades; reserved `dsh/` stub |
| Plugins | `src/plugins/` | Empty builtin list (future local plugins) |

Observed dependency direction (from imports, 2026-09-12):

```text
main → ui / domain / core / runtime / plugins
ui → domain / core
domain → core / repository / runtime
        turn-context.js assembles character + memory + relationship + world + moments
        then optional plugin extraPrompt; chat.js streams that prompt
runtime → core (events); adapters/dsh is a stub (not a product base)
adapters/ui → existing ui/views
adapters/provider → domain/provider (strips apiKey)
repository → infrastructure / core
```

There is **no** `ui → Dexie/localStorage` and **no** `domain → ui` import edge. `src/main.js` is large by design (orchestrator), not a second domain layer.

In-app “landing” (`renderLanding` in `src/ui/views/index.js`) is the first-run welcome **inside the app**. It is not `/`.

---

## PWA boundary

The installable app is scoped to `/app/`. Marketing `/` is outside that scope.

`app/index.html` sets `<base href="/" />` so relative `src/`, `config.js`, and `assets/avatars/` still resolve at the origin root while the document URL is `/app/`. That assumes the site is served at the domain root.

---

## Data boundary

Landing must not load `src/main.js` or application storage modules.

Application storage key names are frozen for existing users. See [CURRENT_STATE.md](CURRENT_STATE.md).

---

## Related current docs

- [PRODUCT_BASE.md](architecture/PRODUCT_BASE.md) — why EchoChat remains the product base
- [DATA_OWNERSHIP.md](architecture/DATA_OWNERSHIP.md) — who owns user data vs code vs brand
- [PLUGIN_POLICY.md](architecture/PLUGIN_POLICY.md) — minimal in-process `extraPrompt` hook; not a marketplace or DSH runtime
- [design.md](design.md) — in-app Morning Mint / motion language (shipped, not a plan)
