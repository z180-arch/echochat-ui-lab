# Agent working agreement

This file is for Codex / Cursor / Claude / Gemini and similar agents. It is not product copy.

## Source of truth

In this order:

1. Current source under `src/`, `app/index.html`, `index.html`, `sw.js`, `manifest.webmanifest`
2. Current tests under `tests/` and CI in `.github/workflows/ci.yml`
3. [README.md](README.md)
4. [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md)
5. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

These beat [docs/history/](docs/history/), old research, and old handoff notes.

## Before changes

1. `git status` and `git branch --show-current`
2. Read the files you will touch
3. Run the tests that cover that area

## Scope

Do not do unrelated refactors, UI redesigns, API replacements, or storage schema / key / migration changes unless the user asked for that.

Do not infer current architecture from V1 / V1.1 historical documents.
Do not resurrect superseded IA or landing designs from `docs/history/` or uncommitted `landing.html`.

## Git

Do not `git add .` or `git add -A`.
Do not commit unless the user explicitly asked.
Do not commit leftover `landing.html`, `.claude/`, `.superpowers/`, `.tmp-extract/`, or `assets/landing/` unless the task says to.

## Entries

```text
/      → marketing landing
/app/  → application
```
