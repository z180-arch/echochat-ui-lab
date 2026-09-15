---
name: echo-context
description: Guide assembleTurnContext, memory retrieve-for-turn, worldbook prompt injection, relationship and lived-thread context. Use when changing turn-context.js, context-builder.js, retrieval, extraPrompt, or continuity prompt slots. Do not use for Dexie persist-only, CSS, or provider SSE.
---

# EchoChat turn context

`assembleTurnContext` in `src/domain/turn-context.js` is the **only** prompt door. Do not add a second assembler or replace it with a generic pipeline.

Slots, when present: Character → user persona → Memory (frozen header) → Relationship → lived thread (gap-return only) → Worldbook (lore, not user facts) → Additional notes (`extraPrompt`).

- Retrieval aliases are **frozen**. Do not add photography-style synonyms to “fix” model ownership slips.
- Plugins may append `session.extraPrompt` only (`src/plugins/index.js`). They must not write Memory or see the API key.
- Tests: `tests/v1_1_context_test.mjs`, `tests/context_integration_test.mjs`, `tests/retrieval_regression_test.mjs`, `tests/lived_thread_test.mjs`.
