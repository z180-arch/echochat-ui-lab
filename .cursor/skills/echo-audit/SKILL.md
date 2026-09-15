---
name: echo-audit
description: Summarize EchoChat current architecture, shipped state, recent git commits, and test entry when the user asks for status, where to start, or a health snapshot. Do not use when implementing a feature, fixing a bug, editing CSS, or writing tests.
---

# EchoChat status snapshot

Do not re-audit the whole repo. Read these only:

1. `git status` and `git log -8 --oneline`
2. [docs/CURRENT_STATE.md](../../../docs/CURRENT_STATE.md) — what is shipped
3. [docs/architecture/CURRENT_STATE_AUDIT.md](../../../docs/architecture/CURRENT_STATE_AUDIT.md) — last verified claims (skip if the task is unrelated)
4. Local verify is `npm test` only
5. Hosting: [docs/DEPLOYMENT.md](../../../docs/DEPLOYMENT.md) — Cloudflare Pages; do not propose GitHub Pages

Report: branch, dirty files, last commits, what is frozen (Memory schema, retrieval, `assembleTurnContext`, Provider, Dexie schema, `echodownload_*` keys). Do not propose SQLite, Tauri, Vector DB, or a rewrite.
