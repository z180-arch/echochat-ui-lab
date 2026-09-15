# EchoChat

Local-first AI Companion PWA.

> 念念不忘，必有回响。

EchoChat is a character you live with in the browser. Chat, memory, moments, and relationship stay on the device except for messages sent to the API you configure.

It is **not** a generic chatbot wrapper, an agent framework, a RAG demo, or a character marketplace.

License: [PolyForm Noncommercial 1.0.0](LICENSE).

---

## Capabilities

- **Character continuity** — a first-class character, Card V2 import/export, more than one conversation thread
- **Memory** — user facts, quietly kept, retrieved for the current turn
- **Moments** — lived traces from conversation, not a chat log
- **Relationship** — how the two of you relate, without a numeric meter
- **Worldbook** — setting and lore, separate from user memory
- **Local-first storage** — Dexie + IndexedDB in the browser; no EchoChat server

---

## Architecture

```text
UI  →  Domain  →  Repository  →  Dexie / Provider  →  OpenAI-compatible API
```

`assembleTurnContext` is the only turn-context door. Plugins may append `extraPrompt`. They do not own the app.

```text
/        marketing landing
/app/    application PWA (src/main.js)
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/architecture/PRODUCT_BASE.md](docs/architecture/PRODUCT_BASE.md).

---

## Run locally

No application bundler. Serve the repository root as static files.

```bash
git clone https://github.com/z180-arch/echochat-ui-lab.git
cd echochat-ui-lab
python3 -m http.server 8080
```

- Landing: http://127.0.0.1:8080/
- App: http://127.0.0.1:8080/app/

Windows landing helper: `preview-landing.bat`. If port 8080 is taken, use another port.

---

## Provider

In the app: **我的 → API 与模型**.

OpenAI-compatible endpoints (SiliconFlow, DeepSeek, Qwen-compatible, Gemini / Groq / OpenRouter, or a custom base URL).

Do not commit API keys. Do not put keys in `config.js`, `.env`, docs, or tests. Optional local probe file `.echochat.local.json` is gitignored.

---

## Design

In-app UI is **Morning Mint** with quiet Ripple motion. Authority: [DESIGN.md](DESIGN.md). No new theme kit, animation engine, or component library.

See [DESIGN.md](DESIGN.md) and [docs/design/AGENT_DESIGN_PROTOCOL.md](docs/design/AGENT_DESIGN_PROTOCOL.md).

---

## Current status

Shipped companion loop on Product Core. Storage names and Memory/retrieval/`assembleTurnContext`/Provider/Dexie schema are frozen unless a dedicated task says otherwise.

Facts: [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md). Snapshot: [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md). Intent: [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Tests

```bash
npm test
```

This is the only local verification entry. `package.json` has no product dependencies. Browser checks run in CI only.

---

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md).

---

## Docs

| File | Role |
|------|------|
| [docs/README.md](docs/README.md) | Map |
| [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) | Shipped facts |
| [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md) | What to work on next |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers |
| [AGENTS.md](AGENTS.md) | Agent working agreement |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributions |

Governance: [LICENSE](LICENSE), [COPYRIGHT.md](COPYRIGHT.md), [TRADEMARKS.md](TRADEMARKS.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [THIRD_PARTY_SOURCES.md](THIRD_PARTY_SOURCES.md).
