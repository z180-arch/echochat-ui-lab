# Experiment — Lived Thread (behavior)

**Status:** Proven (2026-09-05)  
**Depends on:** [lived-continuity-mvp.md](lived-continuity-mvp.md) (Proven at assembly)  
**Decision:** [../decisions/2026-09-05-after-continuity-mvp.md](../decisions/2026-09-05-after-continuity-mvp.md)

---

## Product hypothesis

On gap-return, **listing** memory + relationship in the prompt is not the same as **this reply continuing a shared life**.

The smallest proof is a **turn instruction** that appears only when:

1. The role is idle (same ≥2 day gate as retrieve anchors)  
2. Turn-relevant memories are actually injected  
3. A relationship signal is present  

A **cooperative stub** (not a live API) simulates a model that:

- Follows an explicit “this turn / lived thread” instruction when remembered facts are in context  
- Ignores unlabeled fact dumps and answers only the surface utterance  

Falsifiers:

- Dump-only prompt still yields a continuity-bearing stub reply (instruction is unnecessary)  
- Coupled prompt still yields a generic stub reply (instruction is not a real contract)  
- Instruction fires on active no-overlap turns (contamination)

## User-perceivable claim

After a pause, the user does not restate the important fact. The reply is shaped by that fact **and** the existing bond tone — not a generic “出差注意休息.”

We cannot run a real model in CI. The stub is the contract the real model is asked to follow.

## Verification

Lived-thread suite (`tests/lived_thread_test.mjs`):

- Dump-only memory×relationship → cooperative stub gives a generic reply (does not mention the flight fear).
- Gap-return `buildSystemPrompt` includes `This turn: continue the lived thread` plus memory and relationship → stub reply mentions the lived flight fear.
- Instruction does not appear on memory-only or relationship-only gap-return assembly.
- Active no-overlap turns do not add the instruction or dump the flight memory.

Production change is assembly-only (`buildBehaviorContext` + `gapReturn` from existing `lastChatAt`). No retrieval, schema, or UI changes.


## Out of scope

Retrieval changes, relationship schema, UI, live LLM, vector DB.
