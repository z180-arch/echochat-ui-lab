# EchoChat — Architecture

Describes the **current** tree. Source: `app/index.html`, `src/`, `sw.js`, `manifest.webmanifest`.

---

## Surfaces

```text
Landing (/)
    marketing HTML only
    no application storage
        ↓  /app/
Application (/app/)
    app/index.html → src/main.js
        ↓
    Character · Conversation · Memory · Moments · Relationship · Worldbook
        ↓
    src/repository/
        ↓
    Dexie (echochat) · IDB blobs (echodownload_assets) · localStorage cache
```

The installable PWA is scoped to `/app/`. Packaging later can ship the app without marketing HTML.

---

## Layers

```text
UI
  src/ui  src/styles  src/main.js
    ↓
Domain
  src/domain  (Character, chat, turn-context, memory, moments,
               relations, worldbook, provider, reconstruction, voice)
    ↓
Repository
  src/repository
    ↓
Storage / Provider
  src/infrastructure (Dexie, IDB)     src/domain/provider.js
    ↓
OpenAI-compatible HTTP API
```

| Layer | Path | Role |
|-------|------|------|
| Shell | `src/main.js`, `src/ui/views/` | Bootstrap and event wiring |
| UI | `src/ui/`, `src/styles/` | Morning Mint; domain must not import UI |
| Domain | `src/domain/` | Product rules |
| Runtime | `src/runtime/` | In-process plugin hook |
| Plugins | `src/plugins/` | Builtin `extra-notes` |
| Repository | `src/repository/` | Persistence ports |
| Infrastructure | `src/infrastructure/` | Dexie + blob IDB |
| Core | `src/core/` | Store, events, storage keys, utils |
| Adapters | `src/adapters/` | Facades. `dsh/` is a Planned seat that **throws** |

Observed imports:

```text
main → ui / domain / core / runtime / plugins
ui → domain / core
domain → core / repository / runtime
runtime → core
repository → infrastructure / core
```

There is **no** `ui → Dexie` and **no** `domain → ui`.

---

## Turn context (one door)

`assembleTurnContext` in `src/domain/turn-context.js` is the only context assembly entry. `buildSystemPrompt` is a thin wrapper.

Plugin `extraPrompt` is a **last-stage string**. It is not an agent loop, tool host, or second prompt builder.

Slots, when present:

```text
Character identity / scenario / examples / style
About how the user wants to be seen
Known about the user          ← Memory (frozen header)
Relationship with the user
Lived thread                  ← gap-return only
World Information             ← lore, not user facts
Additional notes              ← plugin extraPrompt
```

Do not describe a marketplace, sandbox, Cordis, or OpenAI Agents runtime. Those are not in this codebase.

---

## Related

- [PRODUCT_BASE.md](architecture/PRODUCT_BASE.md) — companion product, not a foreign host
- [PLUGIN_POLICY.md](architecture/PLUGIN_POLICY.md) — extraPrompt only
- [DATA_OWNERSHIP.md](architecture/DATA_OWNERSHIP.md)
- [CURRENT_STATE.md](CURRENT_STATE.md)
- [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md)
- [design.md](design.md)
