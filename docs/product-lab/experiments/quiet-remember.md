# Experiment — Quiet Remember (write path)

**Status:** Proven (2026-09-05) — quiet write of durable first-person facts; review overlay not required for the flagship loop  
**Why this, not more retrieval / more prompt:** Lived Continuity and Lived Thread only fire if a durable fact is already in memory. Quiet companions will not open the candidate overlay. Stub LLM contracts do not fix an empty store.

## Hypothesis

A user can state a durable first-person fact in chat (`我很怕坐飞机…`) **or a dated lived event** (`我明天要出差`) and it is **quietly persisted** without memory-review UI. Greetings, questions, vents, and “下周再聊” do not persist.

This is the missing third evidence layer:

| Layer | Status |
|-------|--------|
| Assembly (facts in prompt) | Proven — Lived Continuity MVP |
| Turn instruction (stub contract) | Proven — Lived Thread; **not** real LLM |
| Quiet write (fact exists without a control room) | This experiment |
| Real LLM / in-product feel | Not claimed; optional env probe only |

## Falsifiers

- Durable fear/preference is not stored unless the user confirms candidates  
- “在吗 / 怎么做 / 哈哈哈” get stored  
- Review-confirm path still required for the flagship gap-return loop  

## Out of scope

Retrieval scoring, new UI, auto-accepting entire summary batches, live LLM in CI.
