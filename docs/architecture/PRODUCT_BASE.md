# EchoChat Product Base

**Date:** 2026-09-12  
**Status:** Chosen. This is the architecture decision after reconnaissance of Chatbox, DeepSeek Harness, SillyTavern, LobeChat, Letta, TavernAI, InternalBeyond, and EchoChat itself.

Source of truth remains running code under `src/`. This file records **why the product base is EchoChat domain**, not a proposed rewrite.

---

## Decision

**EchoChat stays the product base.**

Mature foreign projects were evaluated as *bases*, not as mood boards. None of them can carry Character + Relationship + Memory + Worldbook + Moments + Lived Continuity as a local-first PWA without destroying the product, the license, or both.

What we do **not** do:

- Fork Chatbox and port EchoChat onto it
- Boot DeepSeek Harness / Cordis as the application
- Replace Morning Mint with SillyTavern or a generic LLM client
- Stack `mature base → adapter → old EchoChat → adapter → UI`

What we do:

- Keep EchoChat domain as Product Core
- Assemble one **turn context** per chat turn (identity + memory + relationship + world + continuity + optional plugin append)
- Keep Landing as marketing, App as the only runtime that owns storage
- Leave Plugin Runtime as a last-stage hook, not a second operating system

---

## What is actually fragmented

The previous pass added a minimal `src/runtime/` contract. That made the tree *look* like five products:

```text
Landing HTML
  App shell (main.js)
    Chat controller
      Memory / Relations / Worldbook  (real domain)
      EchoContext + PluginRuntime     (interface layer)
      DSH adapter stub                (unused seat)
```

The real product pipeline was already in `buildSystemPrompt`: retrieve memories, relationship brief, worldbook, lived-gap instruction, then stream. Runtime wrapped that after the fact.

Landing is **intentionally** not on that pipeline. It must not init Dexie or `echodownload_*` keys. Sharing “product core” with `/` means shared brand and CTA, not a shared JS runtime.

---

## Candidates

### A — EchoChat Product Core (chosen)

**Base:** current zero-build PWA (`app/index.html` + `src/domain/` + Dexie + Morning Mint).

| Keep | Replace | Migrate-in | Adapter |
|------|---------|------------|---------|
| Character, Conversation, Memory, Relationship, Worldbook, Moments, Lived Continuity | Nothing as a foreign base | None in this pass | Keep the existing in-process plugin hook only |

**License:** PolyForm Noncommercial 1.0.0 (unchanged).

**Cost:** low. Unify the turn path that already exists.

**Risk:** dual persistence (Dexie + `echodownload_*`) remains; that is storage debt, not a reason to import Chatbox/IndexedDB from another app.

**Gain:** one composition root; no GPL/AGPL relicensing; PWA and companion IA survive.

### B — Chatbox Community Edition as base

**Base:** Electron + React + TypeScript LLM client ([chatboxai/chatbox](https://github.com/chatboxai/chatbox)).

Solves: generic conversation list, composer, multi-provider settings, desktop/mobile packaging.

Does **not** solve: Character, Worldbook, Relationship, Moments, quiet memory, lived continuity, companion IA.

**License:** GPLv3. Copying CE source into this repo while keeping PolyForm NC is not allowed. Adopting Chatbox as the real base would mean **relicensing EchoChat to GPL** and becoming a Chatbox fork. The public CE also lags the commercial app.

**Cost:** rewrite packaging (npm, webpack, Electron). Throw away Morning Mint and zero-build PWA.

**Verdict:** Candidate D in spirit — reference only. Wrong product shape. License change is not justified by a generic chat shell.

### C — DeepSeek Harness / Cordis as base

**Base:** MIT agent harness ([deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)). Everything is a plugin: session log, tools, sandbox, agent loop, LLM seam.

Solves: plugin lifecycle, reversible effects, host/runtime separation — for **agents**.

Does **not** solve: companion chat, character cards, relationship, PWA-without-Node.

**License:** MIT (compatible). Still rejected: developer-preview APIs, Node/Electron profiles, sandboxes, tool loops. EchoChat is not an agent OS. Mounting DSH would replace the product with a Harness profile.

**Verdict:** study only. `createDshPluginRuntime()` stays a throwing reserved seat.

### D — Other mature projects

| Project | License | Why not a base |
|---------|---------|----------------|
| SillyTavern | AGPL-3.0 | Closest *domain* (cards, World Info). Wrong UX (hobbyist kitchen sink), Node server, would force AGPL + kill Morning Mint. EchoChat already imports ST-format lorebooks. |
| TavernAI 1.2.8 | MIT | Legacy ancestor of ST World Info. EchoChat worldbook already implements keyword + constant + depth + ST card import. Not worth vendoring 2022 jQuery UI. |
| LobeChat | Apache / LobeHub Community (redistribution of modified derivatives restricted) | Next.js + Postgres agent client. Not a companion. Packaging explosion. |
| LibreChat | MIT | MongoDB ChatGPT clone. |
| Open WebUI | BSD-derived with branding limits | RAG front-end, not companion. |
| Letta / MemGPT | Apache-2.0 | Agent memory OS / MemFS. Server or coding-agent harness. Not a browser-local companion. |
| InternalBeyond | PolyForm NC + CC BY-NC-SA assets | Atmosphere reference only. Not chat infrastructure. |
| TavernDesk | MIT | Native Windows SQLite tavern. Not a PWA. |

No Candidate D project is a better **product base** than EchoChat itself.

---

## What belongs in Product Core vs infrastructure

**Product assets (keep, do not replace):**

- Character schema and hub
- Relationship affinity / events / brief
- Memory retrieve + quiet lived facts
- Worldbook semantics (global + character, ST-format import)
- Moments
- EchoChat prompt slot order (identity, scenario, examples, style, user persona, memories, relationship, gap-return)
- Lived Continuity

**Generic infrastructure (do not maintain a second copy *if* a compatible mature piece is better):**

- Chat renderer, composer chrome, generic event bus, OpenAI-compatible SSE, Dexie wrapper

Chatbox/LobeChat/LibreChat *do* have better generic chat clients — and they come with React, a bundler, and a different IA. EchoChat already has a working companion shell. Replacing it is a product rewrite, not a migration.

Dexie is already the mature persistence library (Apache-2.0, vendored).

---

## Memory / Continuity

Mature “memory OS” projects (Letta, LobeChat pgvector, Mem0) assume a server or an agent loop.

EchoChat’s continuity is **character-scoped, local, quiet, and relationship-aware**. That pipeline already exists:

```text
user turn
  → persist message
  → quietRememberUserText
  → retrieveMemoriesForTurn + relationship + worldbook + gap-return
  → assembleTurnContext
  → provider stream
  → recordChatTurn
```

This pass makes `assembleTurnContext` the named composition root. It does **not** invent a new Memory UI or vendor Letta.

---

## Landing vs App

```text
/          marketing HTML (no storage init)
/app/      only process that loads src/main.js
             → domain turn context
             → Dexie / echodownload_* keys
```

They share brand (Morning Mint, slogan, CTA). They do **not** share a JS runtime. Coupling Landing to Dexie would be a regression.

---

## Storage

No key or schema change in this pass.

Frozen: `echodownload_*` localStorage keys, Dexie database `echochat`, blob db `echodownload_assets`. See [CURRENT_STATE.md](../CURRENT_STATE.md).

---

## License / third-party boundary

| Code in this repo from others | Status |
|-------------------------------|--------|
| Dexie 4.0.10 | Vendored, Apache-2.0, notices kept |
| Chatbox | **No source copied** |
| DSH / Cordis | **No source copied** |
| SillyTavern | **No source copied** (ST *format* import already existed) |
| LobeChat / LibreChat / Letta | **No source copied** |
| InternalBeyond | **No source copied** |

If a future task ever adopted a GPL/AGPL base, EchoChat would have to **relicense** — that would be an explicit product decision, not a silent vendor.

---

## Remaining architecture debt

1. Dual-write: in-memory `store.chats` vs Dexie message tables (compatibility, not a foreign-base problem)
2. `src/main.js` is a large orchestrator (by design today)
3. Plugin Runtime has no builtin plugins and must not grow a marketplace
4. Worldbook stores ST fields (`regex`, `whole_word`, `secondary_keys`) that matching does not fully honor yet — complete against tests if evidence says users need it; do not copy SillyTavern AGPL
5. First-session Memory is easy to miss in the UI (product gap, not missing infrastructure)

---

## Next investment

Make Memory / Continuity **visible after the first real chat**, on the existing domain. Do not start a Chatbox fork, DSH profile, or plugin OS.
