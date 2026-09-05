# EchoChat Product Lab

Independent **Product R&D workspace**. Not architecture truth. Not roadmap authority.

Official product/engineering facts still live in `docs/CURRENT_STATE.md`, `docs/ARCHITECTURE.md`, and code.

## Method

| Track | Purpose |
|-------|---------|
| Research | Questions, field notes, dead ends |
| Reading | Structured notes from products & papers |
| Competitive | Why users stay / leave commercial companions |
| Open Source | Repo + source reading (not star counts) |
| Product Experiments | Smallest falsifiable MVPs |
| Product Decisions | Explicit bets, refusals, contract challenges |
| Product Thesis | Who we win, what we bet, what we refuse |

## Open-source reading template

For each project worth keeping:

```text
Project / Repository / License
What it solves
Interesting mechanism
Interesting UX
Interesting architecture
What EchoChat could learn
What EchoChat should NOT copy
```

Default reuse policy: **borrow ideas and models, not code**, unless license + attribution are explicit in `decisions/`.

## Current bet

See [product-thesis/echochat-next-bet.md](product-thesis/echochat-next-bet.md).

Proven experiments:

- [Lived Continuity MVP](experiments/lived-continuity-mvp.md) — memory × relationship enter gap-return prompt
- [Lived Thread](experiments/lived-thread-behavior.md) — gap-return prompt binds **this turn** to the lived thread (cooperative-stub contract)
- [Quiet Remember](experiments/quiet-remember.md) — durable spoken facts persist without memory-review UI

Evidence layers: assembly and stub contract are CI-proven; quiet write is CI-proven; **real LLM behavior is not**. Optional probe: `node scripts/lived_thread_llm_probe.mjs` (skipped unless `ECHOCHAT_PROBE_*` env is set).

Latest decision: [decisions/2026-09-05-seal-continuity-machinery.md](decisions/2026-09-05-seal-continuity-machinery.md)

## Formal engineering artifacts

- Design spec: [../superpowers/specs/2026-09-05-lived-continuity-design.md](../superpowers/specs/2026-09-05-lived-continuity-design.md)
- Implementation plan: [../superpowers/plans/2026-09-05-lived-continuity.md](../superpowers/plans/2026-09-05-lived-continuity.md)
- Open-source matrix: [open-source/README.md](open-source/README.md)
