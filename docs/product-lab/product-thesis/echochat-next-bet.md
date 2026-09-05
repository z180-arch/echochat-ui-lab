# EchoChat Next Bet

**Date:** 2026-09-05  
**Status:** Agent judgment (Primary Product + Engineering)  
**Scope:** Next product phase only — not forever strategy

---

## Primary User

**D — Hybrid: quiet UX + deep continuity under the hood**

More precisely:

> The **Quiet companion seeker** is who we serve on the surface.  
> The **continuity mechanisms of power-user tools** are what we steal into the system — without exposing their control panels.

D is **not** “A + B as two audiences.”  
D is **one audience (A)** served by **invisible systems that B-class products make users configure by hand.**

---

## Secondary User

**C — Privacy-first localist** (filter / trust amplifier, not the product)

Local-first PWA and user-owned API keys already speak to C.  
C explains *why EchoChat can do continuity without cloud companion lock-in*.  
C does **not** define *what to build next* — privacy alone is not a retention loop.

---

## Not Our User

**B — Roleplay / character power user** (this phase)

They already have SillyTavern and RisuAI.  
Winning B requires prompt DSLs, lorebook editors as primary UI, embedding pipelines, extension markets, and complexity as status.  
That path kills Morning Mint and turns EchoChat into a weaker ST.

Also not primary this phase:

- Dashboard / “AI OS” users
- Multiplayer / social network users
- People who only want a prettier ChatGPT shell

---

## Product Thesis

**EchoChat is a quiet, local-first companion whose character feels continuous across days — because memory and relationship state evolve under the hood, not because the user manages a second brain.**

Conversation is the **interface**. Continuity is the **product**.

What is currently generic: a competent chat shell + six domains that exist but do not yet *feel* like one lived bond.

What EchoChat can uniquely own (if we execute):

```text
Morning Mint quietness
+ local-first trust
+ turn-relevant memory
+ living relationship state
→ “this character still knows us” without settings theater
```

What EchoChat must refuse to become:

- SillyTavern with nicer CSS
- Replika-style cloud emotional lock-in
- A memory management app that makes users curate facts all day
- A Moments/social feed that pretends to be a companion

---

## Why This User

### 1. User attractiveness

Quiet companion seekers are the only audience where **retention = felt continuity**.  
They return tomorrow because the bond continued — not because they configured HypaMemory presets.

They match Morning Mint (安静、陪伴、回响).  
They are under-served by power tools (too technical) and commercial companions (cloud, sameness, weak local ownership).

### 2. Existing advantage

Code already wires a continuity pipeline every send (`src/domain/chat.js`):

```text
retrieveMemoriesForTurn
+ getAffinity (brief / events / stage / tone)
+ assembleBehaviorContext / buildBehaviorContext
+ buildWorldbookBlock
→ chatCompletion
+ recordChatTurn / maybeAutoSummary
```

Domains present (not empty): Character, Conversation, Memory, Relationship, Moments, Worldbook, Context Builder, Reconstruction.

Foundation for D exists. Quality of **coupling and felt effect** does not.

### 3. Competitive gap

| Product | Satisfies whom | Continuity mechanism | EchoChat opening |
|---------|----------------|----------------------|------------------|
| Character.AI | mass chat / personas | cloud history + persona | weak local ownership; continuity opaque |
| Replika / Nomi / Kindroid | emotional companion | cloud memory + relationship framing | trust / local / customization gaps |
| Chai | casual chat | engagement loops | shallow continuity |
| SillyTavern | B power users | lorebook + prompt stack + extensions | not quiet; high skill floor |
| RisuAI | B+ | Supa/Hypa memory + lorebook + ordering | deep systems, technical UX |

**Opening:** products that feel like A but run continuity systems closer to B — without making the user become an engineer.

Open-source companion research (ZifaMem, Nūr, Soul Protocol, feltstate) converges on the same thesis: **facts-only memory is insufficient; relationship / affect / lifecycle state is the missing layer.** EchoChat already has a primitive of that layer (`brief`, `events`, affinity stages) — underused as a product wedge.

### 4. Differentiation (what D actually means)

**Must exist inside the system, must not be the product surface for ordinary users:**

| Invisible | Why |
|-----------|-----|
| Memory salience / retrieve-for-turn scoring | Users feel “you remembered,” not “I ranked importance” |
| Relationship brief + event timeline evolution | Bond changes without a stats dashboard as the main screen |
| Context / prompt assembly order | Power-user craft; Quiet users should never see slot math |
| Worldbook / lore keyword matching | Supporting retrieval, not primary IA |
| Conservative memory candidate writes | Avoid noisy “remember everything” |
| Character state slots (scenario, style, examples) | Authoring power without ST-style editor-first UX |
| Proactive gating heuristics | Later; must stay rare and earned |

**May be lightly visible later (optional honesty, not primary UI):**

- Soft memory review / correction (trust)
- Relationship stage as quiet signal (not gamified XP farm)

---

## EchoChat Advantage

1. **Pipeline already exists** — not greenfield continuity.
2. **Morning Mint** already commits to quiet companion, not toolbench.
3. **Local-first PWA** — continuity without surrendering the bond to a vendor.
4. **Character is first-class** — bond can attach to an entity, not only a chat thread.
5. **Refusal culture** already documented: no plugins-first, no Live2D, no vector-RAG-as-identity (design.md) — keeps us from B-chasing.

---

## Core Product Bet

### PRIMARY BET

**Lived Continuity = Memory × Relationship**

```text
PRIMARY BET:     Memory × Relationship (Lived Continuity)
SUPPORTING:      Character (container of the bond)
EXECUTION SURFACE: Conversation (where continuity is felt)
OPTIONAL EXPRESSION: Moments (only if it proves return loop)
BACKGROUND RETRIEVAL: Worldbook (keep; do not make primary)
```

### WHY NOW

Six domains are “implemented” but continuity is still **assembled text**, not a **proven felt loop**.  
Competitor and OSS evidence says the next leap is relationship-aware memory lifecycle — not another surface feature.  
EchoChat can prove this on existing storage + domain hooks with a small falsifiable experiment.

### WHAT WE SHOULD BUILD

- Stronger **turn continuity**: right memories + right relationship brief at the right time
- Relationship state that **changes from lived chat**, not only turn counters
- Quiet proof moments: after gap, character references what mattered without dump
- Minimal observability for us (tests / logs of retrieve + brief), not for power-user panels

### WHAT WE SHOULD NOT BUILD (this phase)

- SillyTavern / Risu-style memory control rooms
- Vector DB / pgvector / Rust rewrite
- Plugin marketplace
- Character market / Live2D / VRM
- Moments-as-social-network primary loop
- Worldbook editor as the hero feature
- Affect-slider farms / emotion dashboards as core UI

### WHAT SHOULD REMAIN INVISIBLE

Prompt assembly, salience math, worldbook match internals, candidate extraction heuristics, affinity formula details.

### WHAT USERS SHOULD ACTUALLY FEEL

> “After a week, this character still knows what we care about — and how close we are — without me managing a memory list.”

---

## Success Criteria

Falsifiable, not vibes-only:

1. **Gap recall:** After N days / idle gap, reply references a prior high-salience fact or relationship event without the user restating it (measured in scripted scenario tests).
2. **Tone continuity:** Affinity/brief changes produce observable tone shift in replies across stages (fixture tests).
3. **No settings theater:** Primary path requires zero memory/relationship configuration for the quiet user.
4. **No regression:** foundation + storage cutover + chat send suites stay green; storage contracts unchanged unless a written `decisions/` ADR exists.

## Risks

| Risk | Mitigation |
|------|------------|
| Continuity stays “prompt salad” | MVP with explicit fixtures that fail if retrieve/brief unused |
| Drift into B-tooling UI | Hard refuse: no Hypa-style management as primary surface |
| Relationship becomes gamification | Prefer brief/events over XP theater |
| Memory noise / wrong recalls | Conservative write; salience; user correction later |
| Over-scope six domains | Single primary bet; others support only |

## Evidence

**Code:** `chat.js` turn pipeline; `memory.js` retrieve-for-turn; `relations.js` affinity/brief/events; `behavior.js` + `context-builder.js` assembly; Moments/Worldbook present but secondary.

**Docs as constraints, not gospel:** `design.md` “Character Continuity” aligns directionally; this bet **narrows** it to Memory × Relationship and **rejects** equal investment across six domains. Roadmap has no authorized backlog — this thesis *is* the next authorized product judgment.

**OSS / competitive reading (ideas only, no code copy):**

- RisuAI: Supa (summarize) vs Hypa (retrieve) — proves dual mechanisms; UX is power-user; EchoChat should absorb *mechanism class*, not modal suites.
- SillyTavern: lorebook + prompt craft as long-chat backbone — reject as primary UX.
- ZifaMem / Nūr / Soul Protocol / feltstate: structured memory + relationship/affect lifecycle — conceptual confirmation that facts-only memory underperforms companion continuity.

---

## One-sentence decision

> **EchoChat 下一阶段必须赢下的是「安静陪伴者（通过不可见的 Memory × Relationship 连续性系统）」，因为他们才是 Morning Mint + local-first 真正能形成 30 天回访的人，而角色工作台用户已被 SillyTavern / Risu 锁死，EchoChat 不应去赢那一场。**
