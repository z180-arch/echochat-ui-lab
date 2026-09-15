# Agent working agreement

This file is for Codex / Cursor / Claude / Gemini and similar agents. It is not product copy.

## Source of truth

**Code + tests win.** For a one-file bugfix, read the files you will touch. Do not load the whole `docs/` tree.

1. Current source under `src/`, `app/index.html`, `index.html`, `sw.js`, `manifest.webmanifest`
2. Tests under `tests/` — local entry is `npm test` only
3. [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) — shipped facts (read when unsure what exists)
4. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers (read when adding files or imports)

Host decision (only when changing plugins / product base): [docs/architecture/PRODUCT_BASE.md](docs/architecture/PRODUCT_BASE.md).

Doc map: [docs/README.md](docs/README.md).

## Before changes

1. `git status` and `git branch --show-current`
2. Read the files you will touch
3. Run the tests that cover that area (`npm test` for Node suites)

Do not reconstruct architecture from V1 / Phase comments or git history snapshots.

## Scope freeze

Do not change **Memory schema**, **retrieval aliases**, **`assembleTurnContext`**, **Provider architecture**, or **Dexie table schema / `echodownload_*` key names** unless the task says so.

That freeze is schema/retrieval/keys — not “never edit `memory.js`”. Import-path, persist-failure, and test fixes in those files are allowed.

Do not do unrelated refactors, UI redesigns, API replacements, or stack swaps.

## Must confirm with the user

Stop and ask before:

- Irreversible user-data delete or wipe
- Irreversible storage key / schema / Dexie migration
- LICENSE changes or adding GPL/AGPL copies
- Deleting Character / Conversation / Memory / Moments / Relationship / Worldbook / Continuity
- Changing product identity (companion → Agent OS, RAG demo, marketplace, ChatGPT clone)
- SQLite / Tauri / new platform runtime as the host

## Do not ask for

Bugfixes, tests, docs that match code, architecture import-boundary tests, renaming a misleading file, deleting **confirmed** unused modules, or independent commits when the task already requires them.

## Git

Do not `git add .` or `git add -A`.
Do not commit leftover `landing.html`, `.claude/`, `.superpowers/`, `.tmp-extract/`, `backups/`, or `assets/landing/` unless the task says to.
Commit only when the user asked, or when the current task explicitly requires per-problem commits.

## Entries

```text
/      → marketing landing
/app/  → application
```

## Layers

```text
ui / main.js → domain / core / runtime / plugins
domain → core / repository / runtime
repository → infrastructure / core
```

No `domain → infrastructure`, `domain → ui`, `ui → Dexie/idb`, `repository → domain`.

## Design (UI / UX / visual / motion)

Before any in-app UI change (`src/ui`, `src/styles`, chat chrome in `src/main.js`, first-run welcome):

1. Read [DESIGN.md](DESIGN.md) — design authority
2. Read [docs/design/AGENT_DESIGN_PROTOCOL.md](docs/design/AGENT_DESIGN_PROTOCOL.md) — how to work
3. Pick **one** Design Lead and at most 2–3 supporting skills (matrix in the protocol)
4. External skills must not override EchoChat product logic (companion continuity, no XP meters, no fake Memory/Moments)
5. If a named skill is not installed, do not claim you used it
6. Browser visual QA when tools exist; otherwise say what you could not verify
7. Responsive QA at 390–1440 and `prefers-reduced-motion`
8. DESIGN.md compliance + anti-slop before the commit
9. Reuse verified decisions in DESIGN.md; do not re-invent the visual system
10. Do not add features or fake data to fill a sparse page

Landing `/` may use Hallmark marketing macros. Do not restyle `/app/` to match the landing.

## Skills

Project skills live in `.cursor/skills/`. Triggers are narrow. Do not load Hallmark on a storage/provider bug.

| Skill | When |
|-------|------|
| `echo-references` | In-app UI (`src/ui`, `src/styles`) or companion chat chrome — after DESIGN.md |
| `echo-architecture` | New modules or cross-layer imports |
| `echo-storage` | Dexie, repository, migration, backup, restore |
| `echo-context` | `assembleTurnContext`, memory/worldbook/relationship **injection** |
| `echo-test` | Choosing/running/fixing `tests/*.mjs` |
| `echo-change-review` | After source changes, before the final commit |
| `echo-audit` | User asked for current state / git / test health only |
