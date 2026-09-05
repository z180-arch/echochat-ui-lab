# Decision: After Lived Continuity MVP

**Date:** 2026-09-05  
**Status:** Recorded (experiment proven)  
**Does not change:** Primary Bet (Memory × Relationship), audience (Quiet companion), storage contracts

---

## What MVP actually proved

Gap-return turns can put memory **and** relationship into `buildSystemPrompt`. Active no-overlap turns do not dump important memories.

That is **context availability**, not **felt continuity**.

## What MVP did not prove

A cooperative model still can (and often will) treat those blocks as optional background and answer the surface question only:

> “后天要出差，我有点慌” → “出差注意休息。”

The user never sees the prompt. If the reply does not continue the lived thread, the MVP is invisible.

## What we will not do next

- More retrieval scoring / embeddings  
- More relationship fields or auto-write expansion  
- Memory/Relationship UI  
- More storage tests for their own sake  
- Calling a live LLM in CI  

## Next experiment

**Lived Thread (behavior / assembly)**

Hypothesis:

> Continuity facts listed in the system prompt are not enough. On a gap-return, EchoChat must bind **this user turn** to memory × relationship as an actionable instruction. A cooperative model that follows explicit turn instructions (and ignores unlabeled dumps) then produces a continuity-bearing reply; dump-only prompts produce a generic reply.

If the hypothesis is wrong (coupling instruction does not change stub behavior, or we cannot state a stable contract), we do not add more prompt salad — we stop and reconsider whether assembly can ever carry the bet.

If it is right, Primary Bet **does not change**; the execution surface moves from “retrieve into prompt” to “make this turn continue the lived thread.”

## Result

Hypothesis **held** under the cooperative-stub contract. Primary Bet unchanged. Stop optimizing retrieve/relationship fields until a live-model or in-product observation contradicts this.
