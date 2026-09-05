# MVP Experiment — Lived Continuity (Memory × Relationship)

**Status:** Draft for review (not implemented)  
**Thesis:** [../product-thesis/echochat-next-bet.md](../product-thesis/echochat-next-bet.md)  
**Concept:** [../product-thesis/echochat-product-concept.md](../product-thesis/echochat-product-concept.md)

---

## What is the smallest version that proves the thesis?

A **scripted multi-day continuity scenario** in product + tests:

1. User tells character a salient personal fact (e.g. fear of flying / upcoming trip).  
2. Relationship accumulates turns; brief/event records something bond-relevant.  
3. Time gap is simulated.  
4. User returns with a related prompt that does **not** restate the fact.  
5. Reply (or assembled context under test) must include the fact **and** relationship tone consistent with stage/brief.

If either memory retrieve or relationship brief is missing from the turn assembly, the test fails.

No new UI chrome required for the proof.

---

## What does the user actually do?

Talk normally in chat. Optionally leave and return.  
They do **not** open memory settings, lorebook editors, or affinity dashboards.

---

## What does the AI do?

Speak in character; use injected memories + relationship brief; avoid dumping the entire memory list.

---

## What state persists?

- Character-scoped memories (existing)  
- Relationship role record: brief, events, stages, chatTurns (existing)  
- Conversation messages (existing)

No new storage database names or key renames in MVP unless an ADR in `docs/product-lab/decisions/` says otherwise.

---

## What changes over time?

- Memory list grows conservatively (candidates / summary).  
- Relationship brief/events update from lived turns.  
- After gap, retrieve prefers salient + recent-enough bond context.

---

## What can we observe?

- `retrieveMemoriesForTurn` hits in scenario fixtures  
- Affinity brief present in `buildBehaviorContext` output  
- Gap-return fixture: expected token/substring present in assembled behavior block (and optionally in mocked completion)

---

## What would prove this idea is wrong?

1. Gap-return never needs memory×relationship — raw recent messages alone always win human preference.  
2. Improving retrieve+brief does not change reply quality in fixtures.  
3. Users only stay if we add B-style control panels.  
4. Quiet users experience continuity as creepy/wrong recalls more than as trust.

If (1)–(2), abandon or shrink the bet. If (3), reconsider audience (likely wrong). If (4), prioritize correction UX before more automatic write.

---

## Out of scope for this MVP

Moments feed redesign, worldbook editor, vector embeddings, proactive messaging as hero, UI redesign, architecture layering refactors.
