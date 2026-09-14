# EchoChat Product Base

**Reaffirmed:** 2026-09-15  
**Status:** Current. EchoChat Product Core is the runtime foundation. No migration.

EchoChat is a **Companion** product: a character the user lives with.

It is **not**:

- a chatbot wrapper around a single completion API
- an Agent OS / tool host / multi-agent runtime
- a RAG demo
- a character marketplace

Source of truth is running code under `src/`, `app/index.html`, `sw.js`. This file is the architecture fact, not a proposal.

---

## EchoChat Runtime Foundation

```text
EchoChat Product Core
├── /app                    application entry (PWA)
├── src/ui                  Morning Mint shell
├── src/domain              Character / Chat / Memory / Relationship /
│                           Worldbook / Moments / Continuity / Provider / Voice
├── src/core                store, events, storage keys
├── src/repository          persistence ports
├── src/infrastructure      Dexie + IDB blobs (Apache-2.0 Dexie vendored)
├── src/runtime             in-process plugin hook (extraPrompt)
├── src/plugins             local builtins (extra-notes)
└── Provider layer          OpenAI-compatible adapter in src/domain/provider.js
```

```text
UI
 → Application / Domain
 → Infrastructure
 → Dexie / Provider
```

Plugin runtime is an **extension layer** on `assembleTurnContext`, not the application host.

Landing `/` is marketing HTML. It does not load this runtime and must not init storage.

---

## Decision

**Current EchoChat Product Core is the official base. Do not migrate onto another project.**

Re-checked 2026-09-15 against current code (Dexie satellites, Memory canonical persist, OpenAI-compatible Provider / SSE, TTS/STT) and against Chatbox, DeepSeek Harness, OpenAI Agents SDK, SillyTavern, LobeChat, LibreChat, Open WebUI, Letta.

None of those can carry Character + Relationship + Memory + Worldbook + Moments + Continuity as a zero-build local-first PWA without:

- destroying the product shape, or
- relicensing away from PolyForm Noncommercial 1.0.0, or
- becoming a fork of someone else's chat/agent OS.

What we do **not** do:

- Fork Chatbox and port EchoChat onto it
- Boot DeepSeek Harness / Cordis / OpenAI Agents SDK as the application
- Replace Morning Mint with SillyTavern or a generic LLM client
- Stack `foreign base → adapter → EchoChat domain → adapter → UI`

---

## Classification (use these words only)

| Kind | Meaning |
|------|---------|
| **Current** | Loaded at runtime and required for the product |
| **Reference** | Studied. No runtime import. Not a dependency |
| **Adapter** | A seat or facade EchoChat owns. EchoChat is not built on the foreign project |
| **Planned** | Named, not implemented. Must not be described as current |

### Current

EchoChat Product Core as in the tree above. Vendored Dexie 4.0.10 (Apache-2.0).

### Reference

Chatbox CE, DeepSeek Harness, OpenAI Agents SDK, SillyTavern, TavernAI, LobeChat, LibreChat, Open WebUI, Letta, InternalBeyond.

### Adapter

- `src/adapters/provider/` — public info over EchoChat's own provider (no apiKey)
- `src/adapters/ui/` — names EchoChat surfaces
- `src/adapters/dsh/` — **Planned** seat; `createDshPluginRuntime()` throws. Not a DSH dependency

SillyTavern **lorebook / character card JSON** is a data format EchoChat already imports. That is not a SillyTavern runtime.

### Planned

DSH / Cordis / marketplace / sandbox. Not scheduled as a base change.

---

## Candidates (rejected as a base)

| Project | License vs PolyForm NC | Why not the base |
|---------|------------------------|------------------|
| Chatbox CE | GPLv3 — copyleft; cannot vendor into this repo | Generic LLM client. Wrong IA. Adopting it would relicense EchoChat to GPL and become a Chatbox fork. |
| DeepSeek Harness | MIT (compatible) | Agent OS / Cordis / sandbox. EchoChat is a companion PWA, not a Harness profile. |
| OpenAI Agents SDK (`openai-agents-js`) | MIT (compatible) | Multi-agent + tools + npm. Would replace companion domain with an agent loop. Zero-build PWA would be lost. |
| SillyTavern | AGPL-3.0 | Closest *domain* (cards, World Info). Node kitchen-sink UX. AGPL would kill PolyForm NC. Format import already exists. |
| LobeChat | Apache + community redistribution limits | Next.js + Postgres agent client. Not a companion. |
| LibreChat | MIT | Server + Mongo ChatGPT clone. |
| Open WebUI | BSD-derived with branding limits | RAG front-end, not companion. |
| Letta | Apache-2.0 | Server memory OS. Not browser-local companion. |
| TavernAI 1.2.8 | MIT | Legacy jQuery ancestor. Worldbook already covers the needed subset. |

Infrastructure we **already** took from a compatible mature library: **Dexie** (Apache-2.0, vendored). SSE line parsing follows eventsource-parser (MIT) as documented in `src/domain/sse-parse.js`. That is not a product-base swap.

---

## Code facts (2026-09-15)

```text
main.js
  → LocalPluginRuntime.start(builtinPlugins)
  → domain chat / memory / worldbook / relations / provider / voice
  → Dexie via repository hooks

createDshPluginRuntime()  → throws (unused)
Chatbox                    → no import
OpenAI Agents SDK          → no import
SillyTavern                → no runtime import (JSON format only)
```

---

## License boundary

EchoChat: **PolyForm Noncommercial 1.0.0**.

GPL / AGPL source must not be copied here. MIT / Apache / BSD may be reused with notices. See [THIRD_PARTY_SOURCES.md](../../THIRD_PARTY_SOURCES.md).

---

## Remaining debt (not a reason to change base)

1. Message dual-write (store cache vs Dexie) is compatibility, not a missing foreign chat shell
2. `src/main.js` is a large orchestrator by design
3. Plugin layer must not grow into a marketplace or agent OS
4. Firefox has no Web Speech STT; iOS installed-PWA recognition is unreliable
