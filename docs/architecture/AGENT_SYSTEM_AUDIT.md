# EchoChat Agent System Audit

**Date:** 2026-09-15  
**Branch:** `main` @ `e10dca9`  
**Phase:** review only for this file. Code/doc P0 fixes are tracked in `CURRENT_STATE_AUDIT.md`.

EchoChat is expected to be maintained by Cursor, Claude Code, Codex, Gemini, and similar coding agents. Agent-maintainability is a first-class metric. This audit asks whether the **repo** rules help an agent fix a bug without rewriting the product.

---

## Inventory

### In this repository

| Item | Path | Role |
|------|------|------|
| Agent working agreement | `AGENTS.md` | Source of truth order, pre-change checklist, scope freeze, git safety, entries, references |
| Cursor skill | `.cursor/skills/echo-references/SKILL.md` | Hallmark (UI, component-scope) + awesome-llm-apps (patterns only) |
| Human contributing guide | `CONTRIBUTING.md` | PR process; not an agent runbook |
| Product facts | `docs/CURRENT_STATE.md`, `ARCHITECTURE.md`, `DEVELOPMENT_STATUS.md` | What is shipped |
| Host decision | `docs/architecture/PRODUCT_BASE.md` | Do not migrate onto a foreign chat/agent host |
| Plugin limit | `docs/architecture/PLUGIN_POLICY.md` | `extraPrompt` only |
| Doc map | `docs/README.md` | What to read when |

There is **no** `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/*.mdc`, `docs/adr/`, or `CONTEXT.md` in this repo.

Cursor also loads `AGENTS.md` as an always-applied workspace rule (duplicate of the file, not a second policy).

### Not in this repository (environment)

The developer machine may have **global** skills (superpowers, Cloudflare, story-writing, Figma, etc.). Those are outside EchoChat. They can still fire on EchoChat work and pull agents off Product Core. This repo cannot and should not delete them. EchoChat rules must be strong enough to win when they conflict.

---

## AGENTS.md

### What it does well

- Short. An agent can hold it.
- Source of truth is **code + tests**, then a small doc set. That matches reality.
- Pre-change steps are operational (`git status`, read files you will touch, run covering tests). Not “read every Markdown file”.
- Scope freeze is the right freeze: Memory schema, retrieval, `assembleTurnContext`, Provider architecture, Dexie schema / `echodownload_*` keys.
- Git: no `git add .`, no commit unless asked, don’t commit leftover `landing.html` / `.claude/` / `.superpowers/`.
- Product identity: Product Core is the host; Hallmark is component-scope on Morning Mint; do not import foreign agent frameworks.

### Problems

| Issue | Severity | Notes |
|-------|----------|--------|
| Does not list **must-confirm** actions | Possible Improvement | Deleting user data, data migrations, LICENSE changes, deleting core companion features, changing product identity. Today these are only implied by “don’t change schema unless asked”. |
| Freeze can be misread as “never touch `memory.js`” | Possible Improvement | The freeze is schema/retrieval, not “no import-path fix”. P-01 in the architecture audit is exactly that misread risk. |
| Duplicate debt lists live in four docs | Possible Improvement | `CURRENT_STATE`, `DEVELOPMENT_STATUS`, `PRODUCT_BASE`, and this audit. Agents reconcile them. |
| “Do not commit leftover `landing.html`” | Outdated path | File is already absent. `sw.js` still exempts `/landing.html`. Harmless. |
| No pointer to `DATA_OWNERSHIP.md` | **Resolved this pass** | Storage/plugin sections were rewritten to match Dexie + extra-notes. |

### Over-wide / conflicting / repetitive?

- **Not over-wide.** It does not demand a design review for a one-line bugfix.
- **Not internally conflicting.** Freeze + “don’t infer V1 names” + “don’t redesign UI” are consistent.
- **Mild repetition** with `PRODUCT_BASE.md` / `README.md` (host decision, entries). Acceptable; those files serve humans and agents differently.
- **Does not force meaningless confirmation** for normal bugfixes. Good.

### Verdict

Keep `AGENTS.md` as the thin working agreement. Do **not** inflate it into an architecture book. After P0 doc fixes, add a short “must confirm with the user” list (data wipe, schema/key/migration, license, product-identity change, deleting companion loops). That is an Architecture Improvement Proposal item, not a rewrite of the agent contract.

---

## Skills

### Repo skill: `echo-references`

```text
Trigger (description): "At the start of EchoChat work, consult Hallmark … and awesome-llm-apps"
Body: 15 lines. In-app UI stays component-scope on Morning Mint. Do not import those agent stacks.
```

| Check | Result |
|-------|--------|
| Trigger too wide? | **Yes, mildly.** “At the start of EchoChat work” fires on storage/provider bugs that do not need Hallmark. The **body** already narrows to UI / companion-loop. |
| Irrelevant auto-trigger? | Low cost (tiny file). Risk is an agent *fetching* Hallmark/awesome-llm-apps mid storage fix. |
| Duplicate? | Overlaps `AGENTS.md` “Agent references” section. |
| Conflicts? | No. Both say do not import foreign agent frameworks. |

**Possible Improvement:** change the description to “When changing in-app UI (`src/ui`, `src/styles`, `src/main.js` views) or the companion chat loop”. Do not expand the skill.

### No other EchoChat skills

There is no duplicate Memory skill, no SQLite skill, no “always rewrite with React” skill in-repo. That is healthy.

### Environment skills (not owned by this repo)

Wide global skills (brainstorming, writing-plans → `docs/superpowers/plans/`, story-*, Cloudflare Workers, etc.) can:

- Demand a plan file EchoChat does not use.
- Demand TDD rituals that fight “run the tests that cover that area”.
- Treat EchoChat as a generic SaaS.

**Mitigation is AGENTS.md + PRODUCT_BASE**, not vendoring more skills. Do not add an EchoChat “using-superpowers” copy.

---

## Documentation loading

### Forced reads

`AGENTS.md` source-of-truth list (6 items + PRODUCT_BASE) is reasonable for **architecture** work. For a one-file bugfix it only requires reading **files you will touch**. That is not over-loading.

Cursor always-applied workspace rule **is** the full `AGENTS.md`. That is one extra copy of a short file, not a dump of `docs/`.

### Duplicate / stale docs

| Doc | Status |
|-----|--------|
| `docs/CURRENT_STATE.md` | Current, with two factual gaps (satellite dual-write; migrate flag key). |
| `docs/ARCHITECTURE.md` | Current layers; import matrix is stricter than the code (P-01). |
| `docs/DEVELOPMENT_STATUS.md` | Current snapshot. P0 there is STT honesty / model ownership slips — different from architecture P0. |
| `docs/architecture/PRODUCT_BASE.md` | Current host decision. Still useful. |
| `docs/architecture/PLUGIN_POLICY.md` | Current. Matches code. |
| `docs/architecture/DATA_OWNERSHIP.md` | **Current** after P-03 (Dexie-canonical + extra-notes). |
| `docs/ROADMAP.md` | Thin pointer. Fine. |
| `docs/README.md` | Map. Should link this audit after it ships. |
| Stage / V1 / Phase comments in source | Leftover language (`character.js` “Phase 5”, `dexie-migration.js` “Phase 2”). `AGENTS.md` already says do not infer architecture from those names. |

### Abandoned docs

No `docs/audit/`, no `docs/reports/`, no Stage 0–13 queue. `ROADMAP.md` correctly says there isn’t one.

`landing.html` is gone; comments remain in `sw.js`, `CURRENT_STATE.md`, `AGENTS.md`.

---

## Can an agent work safely today?

| Task | Can an agent do it without a human standing over it? | Blocker |
|------|------------------------------------------------------|---------|
| Bugfix in `provider.js` / `chat.js` | **Yes** | Tests exist. Freeze does not apply. |
| Small UI copy/component on Morning Mint | **Yes** | echo-references + design.md. |
| Test maintenance | **Yes** | `npm test` is the only local entry. |
| In-architecture optimization (import path, missing import) | **Mostly yes** | Freeze text may scare the agent off `memory.js` even for non-schema edits. |
| Dexie schema / Memory retrieval / assembleTurnContext | **Must not, unless the task says so** | Correct freeze. |
| Delete user data, migrate keys, change LICENSE, change product identity | **Must confirm** | Not spelled out as a confirm list. |
| Mass refactor / stack swap | **Blocked, correctly** | PRODUCT_BASE + AGENTS scope. |

### Failure modes observed during this audit

1. **Wrong storage story** if the agent trusts `DATA_OWNERSHIP.md`.
2. **Hallmark tourism** on non-UI tasks because of the echo-references trigger string.
3. **Global skills** proposing `docs/superpowers/plans/` or a CharacterIdentity split. Repo docs must keep winning.
4. **Unused broken `AssetRepository`** looks like a ready-made port. An agent may “finish” it and persist nothing.

---

## Recommendations (do not implement from this file alone)

Already classified in `CURRENT_STATE_AUDIT.md`:

- Fix `DATA_OWNERSHIP.md` (Confirmed, P0).
- Fix CURRENT_STATE key/dual-write wording (Confirmed, P0).
- Close domain→infrastructure and repository→domain (Confirmed, P0).
- Fix broken migration helpers and asset blob arity (Confirmed, P0).

Agent-system only (Possible Improvement / proposal):

1. Add a five-line **must-confirm** list to `AGENTS.md`.
2. One sentence in `AGENTS.md`: freeze is schema/retrieval/keys, not “never edit `memory.js`”.
3. Narrow `echo-references` trigger to UI / companion-loop work.
4. Link `CURRENT_STATE_AUDIT.md` from `docs/README.md`.
5. Do **not** add more always-on skills.

Do not create: agent OS skills, MCP marketplace skills, “migrate to SQLite” skills, or a second AGENTS.md for each tool.

---

## Implemented Changes

**Date:** 2026-09-15 (implementation pass)

| Change | Why |
|--------|-----|
| `AGENTS.md` must-confirm list + freeze clarification | Agents were missing an explicit confirm list; freeze could be misread as “never edit `memory.js`”. Bugfixes no longer require confirmation. |
| `AGENTS.md` source-of-truth trimmed | One-file bugfix reads files you touch, not the whole docs set. |
| `echo-references` trigger narrowed | Hallmark no longer matches “all EchoChat work”. |
| Added `echo-audit`, `echo-architecture`, `echo-storage`, `echo-context`, `echo-test`, `echo-change-review` | Narrow workflow skills. Not always-on. |
| `docs/README.md` points at the skill set | Index for humans and agents. |

Still out of repo: global superpowers / story / Cloudflare skills. EchoChat `AGENTS.md` wins on conflict.
