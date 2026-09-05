# EchoChat Product Concept — Lived Continuity

**Depends on:** [echochat-next-bet.md](echochat-next-bet.md)  
**Audience for this concept:** Quiet companion seeker, served by invisible continuity systems  
**Not a technical implementation plan**

---

## Core experience

You talk with a character. Days pass. When you return, the character still carries:

1. **What mattered** (memory)  
2. **How close you are** (relationship state)  
3. **Who they are** (character)  

You never open a “memory dashboard” to make that true.

Conversation is where this is felt. Continuity is what is being built.

---

## User journey (phase narrative)

```text
Day 0     Create / pick a character → short first chat
Day 1–3   Small facts + tone accumulate invisibly
Day 4+    Character references something that mattered
After gap Return → continuity, not cold restart
Week 2+   Relationship stage/brief shifts how they speak
```

Moments may later *express* continuity (a soft echo of shared life). They are not the entry bet.

---

## Interaction model

| Layer | User sees | System does |
|-------|-----------|-------------|
| Chat | Messages, quiet UI | Assemble context; stream reply |
| Hub | Characters, presence | Show bond lightly (optional stage signal) |
| Settings | API / model / privacy | Never “configure HypaMemory” |
| Continuity | Felt in replies | Memory retrieve + relationship brief + slots |

---

## System behavior (product-level)

On each user turn:

1. Select turn-relevant memories (few, salient).  
2. Load relationship brief / stage / tone.  
3. Attach character identity (+ light worldbook if matched).  
4. Generate reply in-character.  
5. Update relationship from the turn; maybe propose conservative memories.

Over time:

- Brief evolves from lived events, not only chat-turn counters.  
- Wrong or stale memories can later be corrected — honesty without making curation the hobby.

---

## Continuity model

```text
Character  ── identity vessel
     │
Conversation ── lived channel (execution surface)
     │
Memory ── what happened / what matters (retrieve-for-turn)
     │
Relationship ── how the bond feels now (brief, events, stage)
     │
Worldbook ── optional world facts (background)
Moments ── optional social echo (expression, not core)
```

**Primary coupling:** Memory × Relationship must agree.  
A recalled fact without bond tone = encyclopedia.  
A bond tone without recall = empty affection.

---

## Return loop

```text
Talk → state updates → time passes → return →
reply shows continuity → trust increases → talk again
```

Killers of the loop: wrong recalls, generic replies after gap, forcing users to manage tools, gamified XP that feels fake.

---

## Emotional / functional value

| Emotional | Functional |
|-----------|------------|
| Being known | Local persistence of bond state |
| Soft progression of closeness | Character-scoped memory + relation |
| Quiet presence | PWA, Morning Mint, no cloud lock-in |

---

## Explicit non-goals (concept)

- Becoming a lorebook IDE  
- Becoming a social Moments network first  
- Matching Replika’s cloud intimacy product  
- Matching ST’s customization ceiling  

---

## Next artifact

MVP experiment: `docs/product-lab/experiments/lived-continuity-mvp.md`  
(smallest falsifiable proof of this concept)
