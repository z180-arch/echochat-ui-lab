# Open Source Reading Matrix

**Purpose:** Find mechanisms worth borrowing for EchoChat Lived Continuity.  
**Policy:** Ideas and models only by default. AGPL/GPL copyleft → **do not vendor code** into EchoChat without an explicit `docs/product-lab/decisions/` ADR.

Scoring is directional (● high / ◐ medium / ○ low / — n/a), not a beauty contest.

| Project | Character | Memory | Relationship | World | Moments | Proactive | UX (quiet) | Interesting mechanism |
|---------|:--------:|:-----:|:------------:|:----:|:-------:|:---------:|:----------:|------------------------|
| SillyTavern | ● | ◐ | ○ | ● | — | ◐ | ○ | Lorebook + prompt stack + extensions |
| RisuAI | ● | ● | ○ | ● | — | ◐ | ○ | Supa summarize + Hypa retrieve + lore |
| ZifaMem | ◐ | ● | ● | — | — | — | ◐ | Emotional / relationship-centered memory lifecycle |
| Aelios | ○ | ● | ○ | — | — | — | ○ | Layered write schedule + recall proxy (cloud) |
| Constellation Engine | ◐ | ● | ◐ | — | — | — | ○ | Activation topology / consolidation (heavy) |
| Nūr | ◐ | ● | ● | — | — | — | ○ | Rupture/repair + identity + relational arc state |
| feltstate | ● | ● | ● | — | — | ● | ○ | Affect + gated proactivity + forgetting lifecycle |

## EchoChat borrow / reject (summary)

| Borrow (concept) | Reject |
|------------------|--------|
| Dual memory class: summarize vs retrieve (Risu) | HypaV3-style management modals as primary UX |
| Lore as background retrieval (ST/Risu) | Lorebook IDE as hero surface |
| Relationship-aware memory lifecycle (ZifaMem/Nūr) | Cloud Workers + Vectorize as required stack (Aelios) |
| Salience / consolidation gating (feltstate/Constellation) | Full cognitive runtime rewrite; AGPL vendoring |
| Conservative write + decay ideas | Emotion-slider farms; XP dashboards as core |

## License watchlist

| Project | License (as of research) | Copy implication |
|---------|--------------------------|------------------|
| SillyTavern/SillyTavern | AGPL-3.0 | Ideas only |
| kwaroran/RisuAI | GPL-3.0 | Ideas only |
| zifacorp/zifamem | Unspecified on GitHub API | Ideas only until clarified |
| wusaki0723/Aelios | AGPL-3.0 (README) | Ideas only; stack not EchoChat |
| CONSTELLATION-ENGINE | AGPL (README) | Ideas only |

Per-project notes: sibling files in this folder.
