# Lived Continuity — Design Spec

**Date:** 2026-09-05  
**Status:** Ready for review (no production code changes until engineering plan is approved)  
**Product thesis:** [docs/product-lab/product-thesis/echochat-next-bet.md](../../product-lab/product-thesis/echochat-next-bet.md)  
**Concept:** [docs/product-lab/product-thesis/echochat-product-concept.md](../../product-lab/product-thesis/echochat-product-concept.md)  
**MVP sketch:** [docs/product-lab/experiments/lived-continuity-mvp.md](../../product-lab/experiments/lived-continuity-mvp.md)

---

## 1. Decision lock

| Field | Value |
|-------|-------|
| Primary human | Quiet companion seeker |
| Strategy | Quiet surface + invisible continuity |
| Primary bet | Lived Continuity = Memory × Relationship |
| Secondary | Privacy-first localist (trust filter) |
| Not this phase | Roleplay / character power user |
| Conversation | Interface |
| Character | Vessel |
| Worldbook | Background retrieval |
| Moments | Optional expression (out of MVP UI scope) |

---

## 2. Lived Continuity Success Definition (hard gate)

Engineering metrics (hit rate, stage labels, storage writes) are **insufficient** alone.

### User-perceivable core result

> After a cross-day (or simulated idle) return, the user does **not** need to restate important prior context. The character **naturally continues** prior relationship and events, and that continuity information **actually shapes the current reply / turn behavior**.

Every technical change in this work package must answer:

**“Does this make the character’s behavior more continuous right now?”**

Not merely:

**“Did we store or retrieve a memory?”**

### Acceptance tests must prove both layers

1. **Assembly layer:** Gap-return turn’s system/behavior context contains the salient memory **and** relationship continuity signal (brief/event/stage/tone as applicable).  
2. **Behavior layer:** With a deterministic fake provider (or substring assertion on assembled prompt that the model will see), the turn cannot succeed if either memory or relationship continuity is stripped.

If retrieval succeeds but is omitted from the prompt the model sees, the change **fails** the Success Definition.

---

## 3. Problem statement

EchoChat already runs a continuity pipeline per send (`buildSystemPrompt` in `src/domain/chat.js`):

```text
retrieveMemoriesForTurn → getAffinity → assembleBehaviorContext → worldbook → completion
→ recordChatTurn / maybeAutoSummary
```

What is missing for the Quiet Companion:

- A **falsifiable gap-return proof** that continuity still drives behavior when recent messages no longer contain the fact.  
- Relationship state that reflects **lived salient events**, not only turn counters.  
- Discipline: no new Memory/Relationship **feature pages** in phase 1.

---

## 4. Goals / Non-goals

### Goals

- Prove Lived Continuity under the Success Definition (tests first).  
- Strengthen Memory × Relationship coupling on the existing turn path.  
- Keep Morning Mint quiet UX; zero new continuity control rooms.  
- Preserve storage contracts (`echodownload_*`, Dexie `echochat`, asset DB names).

### Non-goals

- New Memory or Relationship primary UI.  
- Vector DB / embeddings / Workers / pgvector.  
- SillyTavern/Risu memory management surfaces.  
- Moments feed redesign; Worldbook editor as hero.  
- Architecture astronautics (no new application/ports layers).  
- Vendoring AGPL/GPL companion engines.

---

## 5. Approach

### Phase shape (product)

1. **Prove** gap-return continuity with automated fixtures (fail if either axis missing).  
2. **Tighten** write path: salient lived events update relationship brief/events in ways that later turns inject.  
3. **Tighten** retrieve path only as needed so gap-return queries still surface the fact without user restating.  
4. **Stop** when Success Definition is green; defer UI honesty (memory review) and proactive messaging.

### Invisible complexity (allowed)

Memory salience scoring, relationship brief updates, context assembly, worldbook match, conservative candidates — all behind chat.

### User-visible (phase 1)

Only improved reply continuity in normal chat. No new settings panes for this bet.

---

## 6. Architecture (within existing layers)

```text
UI (unchanged shell)
  → domain/chat.buildSystemPrompt / sendMessage
       → memory.retrieveMemoriesForTurn
       → relations.getAffinity (+ richer brief/events from lived salience)
       → behavior / context-builder assembly
       → worldbook (unchanged role)
  → repository / infrastructure (no schema rename)
```

No new top-level folders. Prefer small helpers next to existing domain modules if needed.

---

## 7. Data / contracts

- Prefer existing memory objects (`content`, `importance`, `createdAt`, `source`) and relations (`brief`, `events`, `chatTurns`, stages).  
- Do **not** rename localStorage keys or Dexie DB/schema in this package.  
- If a new field is truly required: write `docs/product-lab/decisions/` ADR first; keep backward compatible defaults.

---

## 8. Testing strategy

Primary new suite (name locked for the plan): `tests/lived_continuity_test.mjs`

Must include at least:

1. **Seed** character + salient memory + relationship event/brief from an earlier “day.”  
2. **Simulate gap** (time and/or empty recent transcript that does not restate the fact).  
3. **Return turn** with a related query that does not restate the fact.  
4. Assert `buildSystemPrompt` / behavior assembly includes memory content **and** relationship continuity signal.  
5. Assert stripping either axis fails a dedicated “continuity integrity” check.  
6. Regression: existing `v1_1_context_test`, `continuity_write_path_test`, `foundation_test`, `storage_cutover_test` stay green.

Optional later: mocked provider reply substring — only if assembly proof is insufficient for the Success Definition.

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Optimizing hit rate without behavior impact | Success Definition + integrity test |
| Creep into B-user UI | Explicit non-goal; PR review reject |
| Noisy automatic memory writes | Keep conservative candidates; prefer existing confirm path |
| Storage churn | Frozen keys/schema |

---

## 10. Open source posture

See `docs/product-lab/open-source/`. Borrow mechanism *classes* (summarize vs retrieve; relationship lifecycle). Do not copy code from AGPL/GPL projects.

---

## 11. Approval gate

Production behavior may change **only after**:

1. This spec is accepted.  
2. Engineering plan `docs/superpowers/plans/2026-09-05-lived-continuity.md` is accepted.  
3. Implementation proceeds task-by-task with tests first.
