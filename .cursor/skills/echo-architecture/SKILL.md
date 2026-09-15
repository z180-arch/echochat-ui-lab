---
name: echo-architecture
description: Enforce EchoChat layer edges when adding modules or changing imports across ui, domain, repository, and infrastructure. Use when creating files, moving modules, or wiring a new import path. Do not use for CSS, copy, or a bugfix that stays inside one file.
---

# EchoChat layers

Allowed:

```text
main / ui → domain / core
domain → core / repository / runtime
repository → infrastructure / core
runtime → core
```

Forbidden (tests in `tests/architecture_boundary_test.mjs` and `tests/foundation_test.mjs`):

- `src/domain` → `src/infrastructure` or `src/ui`
- `src/ui` → Dexie / `infrastructure` / `idb`
- `src/repository` → `src/domain`
- `src/domain/provider.js` → `src/ui`

Domain persist goes through `src/repository/persistence.js` and `getStorageHooks()` in `src/repository/storage-hooks.js`.

Do not invent CharacterIdentity splits, a second prompt pipeline, or a plugin marketplace.
