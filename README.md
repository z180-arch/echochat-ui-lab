# EchoChat Lite

> 念念不忘，必有回响。

Local-first AI character companion: chat, long-term memory, relationship, moments, and worldbook. Pure frontend PWA (HTML / CSS / ES modules). Data stays on the device except messages sent to the API the user configures.

---

## Current status

**Active development.** The live product is a working companion app plus a separate marketing landing.

Do not treat Foundation / Stage 0–13 language, or files under `docs/history/`, as unfinished work or as the current spec.

---

## What it is

- Pure frontend PWA (no app bundler, no `package.json` for the product)
- AI Character / AI Companion
- Local-first; user-owned data in the browser

---

## Current product model

| Area | State |
|------|--------|
| Character | Implemented |
| Conversation | Implemented |
| Memory | Implemented |
| Worldbook | Implemented |
| Relationship | Implemented |
| Moments | Implemented |

In progress / planned work is **not** a checked-in backlog. See [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Architecture

```text
/
└── Landing          index.html, landing-v3.html

/app/
└── Application      app/index.html → src/main.js

src/                 application source
sw.js                registered with scope /app/
manifest.webmanifest PWA id / start_url / scope = /app/
```

Landing does not access application storage. Existing localStorage / IndexedDB keys and schemas stay as they are.

---

## Data

Application data remains local (`echodownload_*` localStorage keys, Dexie database `echochat`, blob DB `echodownload_assets`). Those names are compatibility keys — do not rename them.

Landing does not initialize application storage.

---

## Development

No `npm install`. Serve the repo root as static files.

```bash
git clone https://github.com/z180-arch/echochat-ui-lab.git
cd echochat-ui-lab
python3 -m http.server 8080
```

- Landing: http://127.0.0.1:8080/
- App: http://127.0.0.1:8080/app/
- Windows helper for landing: `preview-landing.bat`

If port 8080 is taken, use another port.

Configure the model in the app: **我的 → API 与模型**. Do not commit API keys. Do not put keys in `config.js`, `.env`, docs, or tests.

OpenAI-compatible providers (SiliconFlow / DeepSeek / Moonshot / 智谱 / custom).

---

## Tests

CI runs the Node suites in `.github/workflows/ci.yml`. From the repo root, examples:

```bash
node tests/storage_cutover_test.mjs
node tests/foundation_test.mjs
node tests/core_loop_test.mjs
```

Browser UI checks (need Chrome): `scripts/wave3a_ui_verify.mjs`, `wave3b_ui_verify.mjs`, `wave4_ui_verify.mjs`. Those scripts open `/app/`.

There is no `npm test`.

---

## Verification (this branch)

Entry split (2026-09-05): landing / app / CTA / storage / PWA / SW / 1440 / 390 — **25/25**.  
Storage cutover: **28/28**.

Historical milestone counts belong in `docs/history/`.

---

## Documentation

| File | Role |
|------|------|
| [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) | Current product / storage / PWA / test facts |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Current layering and entry split |
| [docs/ROADMAP.md](docs/ROADMAP.md) | CURRENT / NEXT / LATER |
| [AGENTS.md](AGENTS.md) | Agent working agreement |
| [docs/history/](docs/history/) | Historical only — not the current spec |
| [docs/architecture/DATA_OWNERSHIP.md](docs/architecture/DATA_OWNERSHIP.md) | User data vs code vs brand |
| [docs/design.md](docs/design.md) | In-app Morning Mint language (shipped) |

Governance: [LICENSE](LICENSE), [COPYRIGHT.md](COPYRIGHT.md), [TRADEMARKS.md](TRADEMARKS.md), [CONTRIBUTING.md](CONTRIBUTING.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

`docs/history/` contains historical documents and must not be treated as the current implementation specification.

---

## AI / Agent Context

Before modifying code:

1. Read README.md.
2. Read docs/CURRENT_STATE.md.
3. Read docs/ARCHITECTURE.md.
4. Check git status.
5. Inspect current source before trusting historical docs.
6. Treat docs/history/ as historical context only.

Do not infer current architecture from old V1/V1.1 documents.  
Do not resurrect superseded IA or UI decisions.  
Do not modify product architecture merely because historical documents describe another design.

---

*EchoChat Lite · 2026*
