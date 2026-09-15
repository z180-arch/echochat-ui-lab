---
name: echo-change-review
description: After EchoChat source changes and before the final commit, check layer imports, tests, unintended files, and docs vs code. Use at the end of an implementation task. Do not use at task start, for planning, or for documentation-only edits.
---

# EchoChat change review

1. `git status` / `git diff` — no leftover `landing.html`, `.claude/`, `.superpowers/`, secrets, `git add .`
2. Imports still match `AGENTS.md` layers. If you added a file, `node tests/architecture_boundary_test.mjs`
3. Ran covering tests, then `npm test` for the problem commit
4. Did not change Memory schema, retrieval, `assembleTurnContext`, Provider architecture, Dexie schema, or `echodownload_*` keys unless the task said so
5. Docs only if they would otherwise contradict the code (`CURRENT_STATE.md` storage notes)

Character Continuity (Character → Conversation → Relationship → Memory → Moments → Worldbook → Continuity) must still assemble through `assembleTurnContext`.
