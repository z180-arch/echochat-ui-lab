# EchoChat

> 念念不忘，必有回响。

EchoChat Lite is a **local-first AI character companion**: chat, long-term memory, relationship, moments, and worldbook. Zero-build PWA (HTML / CSS / ES modules). Data stays on the device except messages sent to the API the user configures.

**Current authoritative state:** [`docs/baseline/V1_1_RC_CURRENT_STATE.md`](docs/baseline/V1_1_RC_CURRENT_STATE.md)

---

## Current status: V1.1 RC

Product baseline: `403e721` (`fix: tighten CJK memory retrieval matching`).

GitHub `main` is the live line. Vercel deploys automatically from `main`. Production is V1.1 RC.

Shipped and accepted: Character Chromium, Context Builder, user persona injection, turn-relevant memory retrieval, conservative memory write, relationship brief/events, Profile/worldbook home, truthful 「想起了」 chip, ambient policy, motion primitives. Real SiliconFlow send path, 390, 1440, and regression **PASS**.

Do not treat Foundation / Stage 0–13 language anywhere as unfinished work.

---

## Local run

```bash
git clone https://github.com/z180-arch/echochat-ui-lab.git
cd echochat-ui-lab
python3 -m http.server 8080
# http://localhost:8080
```

If port 8080 is taken, use another port (e.g. `8765`).

Configure the model in-app: **我的 → API 与模型**. Do not commit API keys. Do not put keys in `config.js`, `.env`, docs, or tests.

OpenAI-compatible providers (SiliconFlow / DeepSeek / Moonshot / 智谱 / custom). Default endpoint and model are the V1 contract lock — see the current-state doc.

---

## Tests

```bash
node tests/migration_atomicity_test.mjs
node tests/foundation_test.mjs
node tests/storage_cutover_test.mjs
node tests/core_product_test.mjs
node tests/reconstruction_test.mjs
node tests/core_loop_test.mjs
node tests/reply_clean_test.mjs
node tests/chat_send_test.mjs
node tests/theme_tokens_test.mjs
node tests/ambient_policy_test.mjs
node tests/v1_1_context_test.mjs
```

Syntax: `node --check` on files under `src/`. CI runs the same suites on push / pull_request.

---

## Protected contract

**Freeze the contract, not the implementation.**

Do not change unless an explicit work package says so:

- Storage / data compatibility and existing user data
- API contract (`send` / `streamChat` / `buildRequest`, default endpoint and model)
- Working chat loop
- Migration compatibility

Allowed when a real work package requires it: domain logic, Context Builder, memory retrieve/write, relationship, worldbook, UI, tests. Do not refactor for cleanliness.

Local-first does not mean “nothing ever leaves the device.” Completions go to the user’s provider. See [DATA_OWNERSHIP.md](docs/architecture/DATA_OWNERSHIP.md).

Storage/API key inventory: [V1_BASELINE.md](docs/baseline/V1_BASELINE.md).

---

## How to continue (agents)

1. Read [`docs/baseline/V1_1_RC_CURRENT_STATE.md`](docs/baseline/V1_1_RC_CURRENT_STATE.md).
2. Treat **code + tests** as the final behavior source.
3. Pick the next item from production observation and evidence — not from an old stage list.

```text
V1.1 RC → observe production → evidence → small work package
  → implement → regression → browser → commit → push → Vercel → validate
```

There is no Master Roadmap. There is no Stage 0–13 queue.

---

## Docs that remain

| File | Role |
|------|------|
| [V1.1 RC Current State](docs/baseline/V1_1_RC_CURRENT_STATE.md) | **Authoritative product state** |
| [V1 Baseline](docs/baseline/V1_BASELINE.md) | Frozen storage / API contract |
| [DATA_OWNERSHIP](docs/architecture/DATA_OWNERSHIP.md) | Local-first vs API |
| [PLUGIN_POLICY](docs/architecture/PLUGIN_POLICY.md) | Plugin boundary if plugins are ever authorized (not a backlog item) |
| [design.md](docs/design.md) | Morning Mint / motion language (shipped; not a plan) |

Governance: [LICENSE](LICENSE), [COPYRIGHT.md](COPYRIGHT.md), [TRADEMARKS.md](TRADEMARKS.md), [CONTRIBUTING.md](CONTRIBUTING.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## Stack (short)

Vanilla ES modules, native CSS tokens, localStorage + IndexedDB/Dexie, OpenAI-compatible SSE, PWA, zero build, Node tests with no framework.

---

*EchoChat Lite · V1.1 RC · 2026*
