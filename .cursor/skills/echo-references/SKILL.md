---
name: echo-references
description: Apply Morning Mint component-scope UI rules when changing EchoChat in-app UI under src/ui, src/styles, or chat chrome in src/main.js. Use when editing views, tokens, motion, composer, or landing visual language. Do not use for storage, Dexie, provider HTTP, tests-only, or docs-only work.
---

# EchoChat UI references

Read **[DESIGN.md](../../../DESIGN.md)** first, then [docs/design/AGENT_DESIGN_PROTOCOL.md](../../../docs/design/AGENT_DESIGN_PROTOCOL.md).

In-app UI is **Morning Mint** (`src/styles/tokens.css`) plus quiet Ripple (`src/styles/motion.css`). No new theme kit, animation engine, or component library.

1. Reuse existing tokens, fields, chips, sheets. Do not pick a Hallmark catalog theme for `/app/`.
2. Landing `/` may use Hallmark if the task is a landing redesign. Do not restyle the app to match the landing layout.
3. Do not import CrewAI, AutoGen, LangGraph, or similar as the host.
4. External design skills are intelligence only; DESIGN.md is authority.

`assembleTurnContext` is the only context door. No GPL/AGPL copies.
