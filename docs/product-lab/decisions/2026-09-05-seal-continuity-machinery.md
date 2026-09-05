# Decision: Seal Lived Continuity machinery

**Date:** 2026-09-05  
**Probe:** No `ECHOCHAT_PROBE_*` / API key in this environment. Live LLM not run. No extra stub tests added to fake that layer.

## Sealed (do not keep optimizing)

The Quiet Companion **mechanical** loop is proven in CI:

```text
durable speech → quiet write → relationship signal
→ gap-return retrieve (idle-gated)
→ Memory × Relationship in this turn
→ Lived Thread instruction
```

**Not proven:** real LLM compliance, in-product felt continuity.

Further retrieval scoring, prompt stacking, relationship fields, or stub tests **do not increase product confidence**. Stop.

## Evidence layers (honest)

| Layer | Status |
|-------|--------|
| Technical loop | Proven |
| Cooperative stub | Proven (not a model) |
| Real LLM | Pending (opt-in `scripts/lived_thread_llm_probe.mjs`) |
| User-perceived continuity | Pending (needs real chat over days) |

## Next product question (not more prompt)

Quiet remember originally only captured **self-traits** (怕/喜欢/过敏). **Lived events** (明天出差、下周面试) are the actual 共同经历 and were dropped. That is the next write-path tightening — still silent, still conservative, still no review UI.

Primary Bet unchanged.
