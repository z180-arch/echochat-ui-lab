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

## Application layers

| Layer | Path | Role |
|-------|------|------|
| Shell | `src/main.js`, `src/ui/views/` | Routing between in-app welcome and the companion shell |
| Domain | `src/domain/` | Character, chat, memory, worldbook, relations, moments, reconstruction, provider |
| Repository | `src/repository/` | Persistence ports; Dexie with legacy adapter |
| Infrastructure | `src/infrastructure/` | Dexie, IDB blobs, asset resolver |
| Core | `src/core/` | Events, store, storage keys, utils |
| UI | `src/ui/`, `src/styles/` | Morning Mint tokens, components, ambient policy |

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

- [DATA_OWNERSHIP.md](architecture/DATA_OWNERSHIP.md) — who owns user data vs code vs brand
- [PLUGIN_POLICY.md](architecture/PLUGIN_POLICY.md) — plugins are **not** implemented; not a backlog item
- [design.md](design.md) — in-app Morning Mint / motion language (shipped, not a plan)
