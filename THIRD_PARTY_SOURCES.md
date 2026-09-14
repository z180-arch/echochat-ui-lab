# Third Party Sources

Copied source vs architecture **reference**. Runtime notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

**Runtime foundation:** EchoChat Product Core. Nothing in Reference is a host, fork base, or Current dependency.

---

## Current (actually used)

| Item | License | Role |
|------|---------|------|
| Dexie 4.0.10 (`src/infrastructure/vendor/dexie.mjs`) | Apache-2.0 | IndexedDB wrapper |
| SSE line algorithm in `src/domain/sse-parse.js` | Adapted from eventsource-parser (MIT) | OpenAI-compatible streams |
| Noto Sans SC | OFL 1.1 | App / landing type via Google Fonts |

---

## Research reference (no source copied)

Study these for UX or format. **Do not import their runtimes.**

| Project | License | Why we looked | Why not the host |
|---------|---------|---------------|------------------|
| [SillyTavern](https://github.com/SillyTavern/SillyTavern) | AGPL-3.0 | Character Card / lorebook **data** | AGPL; kitchen-sink Node UI |
| [TavernAI 1.2.8](https://github.com/TavernAI/TavernAI-v1) | MIT | World Info ancestor | Legacy; worldbook already covers the subset |
| [Chatbox](https://github.com/chatboxai/chatbox) | GPL-3.0 | Generic chat shell | GPL; not a companion domain |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | MIT | Plugin-host ideas | Agent OS / Cordis — not a PWA companion |
| [OpenAI Agents SDK](https://github.com/openai/openai-agents-js) | MIT | “Harness” pattern | Multi-agent + npm; would replace Product Core |
| [LobeChat](https://github.com/lobehub/lobe-chat) | Apache + extra limits | Docs / product packaging | Next.js agent client |
| [LibreChat](https://github.com/danny-avila/LibreChat) | MIT | Chat client IA | Server + Mongo clone |
| [Open WebUI](https://github.com/open-webui/open-webui) | BSD-derived + branding | Local LLM UX | RAG front-end |
| [Letta](https://github.com/letta-ai/letta) | Apache-2.0 | Memory OS | Server, not browser-local companion |
| [Hallmark](https://github.com/Nutlope/hallmark) | MIT | Anti-slop UI review | Catalog themes must not restyle `/app/` |
| [awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) | — | Companion/chat patterns | Do not vendor those agent stacks |
| [InternalBeyond](https://github.com/Sui-IB/InternalBeyond) | PolyForm NC + CC BY-NC-SA | Visual language | No assets copied |

SillyTavern **lorebook / character card JSON** is a data format EchoChat already imports. That is not a SillyTavern runtime.

---

## Do not introduce

- CrewAI, AutoGen, LangGraph, OpenAI Agents SDK, DSH/Cordis as the application host
- GPL / AGPL copies into this PolyForm NC repo
- A second CSS/JS UI framework (React, Tailwind, shadcn, …)
- Character marketplaces or remote plugin CDNs

`src/adapters/dsh/` is a **Planned** seat: `createDshPluginRuntime()` throws. EchoChat does not run on DSH.
