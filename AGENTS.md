# Agent working agreement

This file is for Codex / Cursor / Claude / Gemini and similar agents. It is not product copy.

## Source of truth

1. Current source under `src/`, `app/index.html`, `index.html`, `sw.js`, `manifest.webmanifest`
2. Current tests under `tests/` and CI in `.github/workflows/ci.yml`
3. [README.md](README.md)
4. [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md)
5. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
6. [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md)

**Runtime foundation:** EchoChat Product Core. See [docs/architecture/PRODUCT_BASE.md](docs/architecture/PRODUCT_BASE.md). Foreign chat/agent projects are reference only.

## Before changes

1. `git status` and `git branch --show-current`
2. Read the files you will touch
3. Run the tests that cover that area (`npm test` for Node suites)

## Scope

Do not do unrelated refactors, UI redesigns, API replacements, or storage schema / key / migration changes unless the user asked.

Do not infer architecture from old V1 / V1.1 names or git history snapshots.

Do not change Memory schema, retrieval, `assembleTurnContext`, Provider architecture, or Dexie schema unless the task says so.

## Git

Do not `git add .` or `git add -A`.
Do not commit unless the user explicitly asked.
Do not commit leftover `landing.html`, `.claude/`, `.superpowers/`, `.tmp-extract/`, `backups/`, or `assets/landing/` unless the task says to.

## Entries

```text
/      → marketing landing
/app/  → application
```

## Agent references

- [Hallmark](https://github.com/Nutlope/hallmark) (MIT): anti-slop UI. In-app work stays **component-scope** on Morning Mint.
- [awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps): companion/chat patterns. Do **not** import those agent frameworks.
