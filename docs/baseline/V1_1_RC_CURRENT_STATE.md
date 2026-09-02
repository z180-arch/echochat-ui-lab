# EchoChat Lite — V1.1 RC Current State

> **This is the authoritative current-state document.**  
> Date: 2026-09-02  
> Commit: `403e721` (`fix: tighten CJK memory retrieval matching`)  
> Full hash: `403e72158a95eac33d065c07402701d39a710b99`  
> Status: **V1.1 RC — live on production**

Older Foundation / Stage 0–13 language in this repository is **historical**. Do not treat those stages as unfinished work. Do not start from the old Master Roadmap.

If another document disagrees with this file, **this file wins**.

---

## 1. Product state

| Item | Value |
|------|--------|
| Product | EchoChat Lite |
| Form | Zero-build PWA (HTML / CSS / ES modules) |
| Data | Local-first (browser storage). Chat completions leave the device via the user-configured API. |
| Kind | AI Character / Companion |
| Release | **V1.1 RC** |

V1.1 RC is not a Foundation project. Runtime, storage lock, Morning Mint UI, Character Hub, reconstruction, memory, relationship, context builder, and real SiliconFlow send path are already in production.

---

## 2. Git state

| Item | Value |
|------|--------|
| Repository | https://github.com/z180-arch/echochat-ui-lab |
| Branch | `main` |
| Baseline | `403e72158a95eac33d065c07402701d39a710b99` |
| Message | `fix: tighten CJK memory retrieval matching` |
| Remote | GitHub `origin/main` synchronized at this hash |

---

## 3. Production state

| Item | Value |
|------|--------|
| Host | Vercel |
| Trigger | Automatic deployment from `main` |
| Production | Reflects V1.1 RC at `403e721` |
| UI check | Production UI verified as the V1.1 version |

Do not treat Vercel as a separate release pipeline. A push to `main` may deploy. Manual Vercel changes are not part of this baseline.

---

## 4. Completed V1.1 architecture

These are **shipped**, not backlog:

| Capability | What it is |
|------------|------------|
| Character Continuity / Character Chromium | Shared `CharacterAvatar` ring + name + `StageChip` on Hub, Chat, Profile, Moments |
| Context Builder | Ordered prompt slots (`identity` / `scenario` / `examples` / `speakingStyle`); empty slots omitted |
| User Persona injection | `settings.userPersona` enters the final prompt only when set |
| Turn-relevant Memory retrieval | `retrieveMemoriesForTurn()` ranks by overlap; non-empty query injects only `overlap > 0` |
| Conservative Memory write | Auto-summary no longer dumps lines into long-term memory; persist is candidate confirm / 记住 |
| Relationship Brief / Events | Additive `brief` / `events` / `lastStage` on existing relation objects; first-meeting + stage-change events |
| Worldbook / Profile integration | Profile home: 关于 TA / 关系 / 记忆 / 世界书 / 瞬间 / 相处线 |
| Truthful 「想起了…」 chip | Shown only when retrieval `hadHit` is true for the current chat |
| Ambient policy | Chat forced off; Welcome may use medium; Hub/Moments/Me capped |
| Motion primitives | Named CSS motion classes; sheets / press / enter |
| Reduced-motion | Scoped so 150ms color transitions are not killed globally |

V1 runtime lock still holds: API endpoint / default model / storage schema / `send()` / `streamChat()` / `buildRequest()` were not redesigned for V1.1.

---

## 5. CJK memory retrieval fix (`403e721`)

Final product-code change of V1.1 RC:

| Rule | Detail |
|------|--------|
| Matching | CJK retrieval uses **bigrams**, not unigrams |
| Inject | A non-empty query injects memory only when `overlap > 0` |
| False positive | Shared single characters (e.g. `小` in `从小` vs `小数点` / `圆周率`) must not count as a hit |
| Tests | `tests/v1_1_context_test.mjs` covers miss + the 圆周率 false-friend case |
| Storage contract | **Unchanged** |
| Affinity formula | **Unchanged** (`turns * 0.1` + existing bonuses) |

Files: `src/domain/memory.js`, `tests/v1_1_context_test.mjs`.

---

## 6. Verification state (actual)

Recorded against `403e721` (implementation freeze plus this retrieval fix). Live SiliconFlow send path was verified in an isolated browser session. Key never written into the repository.

### V1.1 behavior

| Check | Result |
|-------|--------|
| Real API Send Path | **PASS** |
| Memory Retrieval | **PASS** |
| Conservative Memory Write | **PASS** |
| Relationship Brief / Events | **PASS** |
| 想起了 chip (hit and miss) | **PASS** |
| 390 mobile | **PASS** |
| 1440 desktop (three-pane after `9b591b6` markup fix) | **PASS** |
| Regression | **PASS** |

Layout note: `9b591b6` removed an extra `</div>` in `renderChatPane` so desktop rail / list / chat / profile could lay out. That fix is in this baseline.

Model reply wording is non-deterministic. V1.1 acceptance does **not** treat a missed mention of a fact as a product defect when retrieval, prompt injection, and the chip are correct.

### Automated tests (verified at this baseline)

| Suite | Result |
|-------|--------|
| `tests/migration_atomicity_test.mjs` | 90/90 PASS |
| `tests/foundation_test.mjs` | 24/24 PASS |
| `tests/storage_cutover_test.mjs` | 28/28 PASS |
| `tests/core_product_test.mjs` | 19/19 PASS |
| `tests/reconstruction_test.mjs` | 20/20 PASS |
| `tests/core_loop_test.mjs` | 12/12 PASS |
| `tests/reply_clean_test.mjs` | 10/10 PASS |
| `tests/chat_send_test.mjs` | 6/6 PASS |
| `tests/theme_tokens_test.mjs` | 4/4 PASS |
| `tests/ambient_policy_test.mjs` | 7/7 PASS |
| `tests/v1_1_context_test.mjs` | 7/7 PASS |
| `node --check` on `src/**/*.js` | PASS |

CI (`.github/workflows/ci.yml`) runs the same Node suites on push / pull_request.

---

## 7. Development model (replaces Stage 0→13)

The old automatic roadmap is **not** the default execution model.

```text
V1.1 RC
  ↓
Production Observation
  ↓
Evidence / User Feedback
  ↓
Small Work Package
  ↓
Implementation
  ↓
Regression
  ↓
Browser Verification
  ↓
Commit
  ↓
Push
  ↓
Vercel
  ↓
Product Validation
```

The next item is **not** predetermined by Stage 4 / 6 / 7 / 9 labels.

Choose future work from:

1. Real user behavior
2. Product value
3. Current architecture evidence
4. UX evidence
5. Reliability
6. Maintenance cost

---

## 8. Architecture rule

**Freeze the Contract, not the Implementation.**

Protected unless an explicit work package says otherwise:

- Storage / data compatibility
- Existing user data
- API contract (endpoint, default model, `send` / `streamChat` / `buildRequest`)
- Working chat loop
- Migration compatibility

Allowed when genuinely required:

- Domain logic
- Context Builder
- Memory retrieval / write
- Relationship logic
- Worldbook integration
- UI / presentation
- Tests

Do not refactor merely for cleanliness.

---

## 9. Stale documents (do not execute)

These files describe earlier phases. They are **not** a to-do list for V1.1 RC:

| Document | Stale relative to `403e721` |
|----------|------------------------------|
| `README.md` | Still said Foundation Closure; listed Reconstruction / Context Builder / Relationship events as unimplemented |
| `docs/baseline/CURRENT_STATE.md` | Snapshot ~2026-09-01; Stage 6–9 still framed as next |
| `docs/baseline/CURSOR_HANDOFF_BASELINE.md` | Instructs STAGE 0 first; marks STAGE 1–6 as unfinished |
| `docs/roadmap/ECHOCHAT_CURSOR_MASTER_ROADMAP.md` | Declared ACTIVE Stage 0→13 route |
| `docs/baseline/V1_BASELINE.md` | V1 runtime/storage lock — still valid as **contract**, not as “current product surface” |
| `docs/design.md` | Planning/research at `9f2a6b2`; “no product code changed” is obsolete |
| `docs/V1_1_IMPLEMENTATION_PLAN.md` | “Planning only / do not implement” is obsolete — V1.1 RC shipped |
| `docs/OPEN_SOURCE_ARCHITECTURE_BENCHMARK.md` | Research only at `9f2a6b2`; not an execution queue |
| `docs/UI_V2_IMPLEMENTATION_BASELINE.md` | **Not in the repository** |
| `docs/UI_V2_IMPLEMENTATION_LOG.md` | **Not in the repository** |
| `docs/UI_V2_MODULE_REGISTRY.md` | **Not in the repository** |

Phase 0–6 gate reports under `docs/baseline/PHASE_0_6_*` and `docs/history/*` remain historical evidence.

Known remaining **non-V1.1** debt (not a roadmap mandate): Memory/Relationship/Moments still on localStorage (not Dexie); no vector RAG; no plugin/cloud/native; no formal Playwright E2E.

---

## 10. First file for a new agent

1. This file — `docs/baseline/V1_1_RC_CURRENT_STATE.md`
2. `docs/baseline/V1_BASELINE.md` — storage/API contract lock
3. `docs/architecture/DATA_OWNERSHIP.md` — local-first vs API
4. Code at `403e721`

Do not open the Master Roadmap to decide what to build next.
