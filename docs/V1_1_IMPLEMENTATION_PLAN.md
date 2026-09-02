# EchoChat V1.1 — Implementation Plan

**Status:** HISTORICAL. V1.1 RC implemented and accepted at `403e721`.  
**Written as planning against:** `9f2a6b2`  
**Do not implement this plan again.** Current state: [`docs/baseline/V1_1_RC_CURRENT_STATE.md`](baseline/V1_1_RC_CURRENT_STATE.md).

---

This is the join of product strategy and design — one sequence, not two roadmaps.

---

## Direction (locked)

```text
Character Continuity
  = Context Builder slots
  + Memory retrieve-for-this-turn
  + Relationship brief
  + Character Chromium (visual)
  + Atmosphere policy (quiet chat)
```

Website is part of the **design language**, not the first engineering slice.

---

## Implementation order

Chosen order (not the generic “foundation → website → app” template):

```text
1. Design Foundation (tokens + motion primitives + Ambient policy)
        ↓
2. Application Character Chromium (Hub / Chat / Profile / Moments)
        ↓
3. Product loop (Context Builder → Memory retrieve/write → Relationship brief)
        ↓
4. Profile as character home (Memory / Relationship / Worldbook editor)
        ↓
5. Companion chat cues (stage chip, optional 想起了)
        ↓
6. Motion polish (sheets, list→chat, reduced-motion scope)
        ↓
7. Marketing website (shared tokens, real screenshots)
        ↓
8. Later: character accent, website-only extras
```

Why this order:

- Atmosphere policy is a **constraint**, not a feature — do it first so Chat does not get prettier and heavier.
- Users feel Continuity in chrome **before** they feel smarter memory. Chromium can ship with little domain risk.
- Product loop must land before “想起了” or the chip would be a lie.
- Website without real screenshots becomes fiction. It waits.

---

## P0

Must ship in the first V1.1 development wave. Compatible with current runtime.

### A. Design foundation (no visual rewrite)

| Item | Files likely | Done when |
|---|---|---|
| Name motion primitives in CSS | `src/styles/motion.css`, `tokens.css` | `.motion-enter`, `.motion-sheet`, `.motion-press`, `.motion-msg`, `--ease-drawer` exist and are used by existing sheets/buttons |
| Ambient policy | `src/ui/ambient.js`, theme/settings | Chat route forces Off. Mobile default Off or Weak. Welcome/splash may stay Medium. Hidden tab pauses canvas |
| Semantic token if needed | `tokens.css` | `--color-surface-chat` used by chat pane |

**Do not:** add tsParticles, grain on chat, WebGL.

### B. Character Chromium

| Surface | Change | Keep |
|---|---|---|
| Hub | Card = avatar ring + name + last line + stage chip | List IA |
| Chat header | Avatar + name + stage; identity never disappears | Composer, streaming, 2000 cap |
| Profile | Same avatar scale language; person, not settings dump | Existing fields |
| Moments | Same avatar on cards | Like/comment |

**Do not:** Live2D, per-character wallpaper, mood orbs.

### C. Product loop (from architecture benchmark)

1. **Context Builder slots** in `buildSystemPrompt` / `buildBehaviorContext`: identity, scenario, examples, speaking style if present; omit empties. Inject active **user persona** if present.
2. **Memory retrieve-for-this-turn**: query current message (+ recent lines) against stored facts; then importance/recency. Still `injectMax`. No embeddings.
3. **Conservative write**: keep confirm candidates; stop treating modulo-20 auto-summary as the main write path.
4. **Relationship brief**: keep counters; add last event or short brief string; inject next to `toneHint`.

**Do not:** change SiliconFlow URL or Qwen model. Do not add RAG.

### P0 pages

| Page | Action |
|---|---|
| Welcome | Keep copy/Ripple. Honor Ambient. |
| Hub | Chromium |
| Chat | Chromium + Ambient off + builder/memory/relationship behind the scenes |
| Profile | Chromium + group memory/relationship |
| Moments | Chromium attribution |
| Me / Settings | User persona field if injection is live; appearance presets unchanged |
| Worldbook settings | Still stub unless time remains — prefer P1 editor |

### P0 components to abstract (reuse, not new library)

```text
CharacterAvatar (size + ring)
StageChip
CharacterCard
MemoryRow
RelationshipBrief
```

Markup functions in `src/ui/components/` are enough.

---

## P1

| Item | Depends on | Note |
|---|---|---|
| Worldbook entry editor | Existing matcher | Morning Mint forms; 1200 cap stays |
| “想起了” chip in chat | Retrieve-for-turn actually working | Hide when no hit |
| View Transitions list↔chat | Chromium on both | Progressive enhancement |
| Scoped reduced-motion | Foundation | Stop `*` killing 150ms color |
| Marketing website | Real screenshots of Chromium app | Separate from PWA shell; same tokens |
| Website hero type reveal | Website | One shot; line/word; a11y label |
| Proactive domain | Product decision | Wire **or** delete; do not leave dead API |

Website desktop: hero, one character story, Memory/Relationship/Moments scenes, product frames, CTA.  
Website mobile: vertical stack, particles off/weak, no app rail.

---

## P2

- `--character-accent` ring only
- Session memory brief paragraph
- Character state 3–4 fields (mood/energy) if product still wants it after briefs work
- Website cursor field
- Motion Mini **website only** if CSS is insufficient
- Edge-swipe back
- Export card fills ST slots (personality/scenario/examples)

---

## NOT NOW

Plugins, markets, Live2D/VRM/ACP, GSAP, Lottie, tsParticles, Three/shaders, Lenis, kinetic app titles, particle chat, affect sliders, extra theme packs, embeddings.

---

## Work packages (next development round)

Suggested slices so a coding agent can execute without re-researching:

| WP | Scope | Risk |
|---|---|---|
| WP0 | Ambient policy + motion primitive CSS | Low |
| WP1 | CharacterAvatar / StageChip / cards on 4 surfaces | Low–med (layout) |
| WP2 | Context Builder slots + user persona inject | Med (prompt quality) |
| WP3 | Memory retrieval ranking + write policy | Med (behavior) |
| WP4 | Relationship brief storage + inject + chip | Med |
| WP5 | Profile information architecture | Low |
| WP6 | Tests: prompt composition, retrieval, relations | Required |
| WP7 | Browser 390 / 1440: Hub, Chat, Profile, Moments | Required |
| WP8 | Website (later PR) | Isolated |

WP0–WP7 are V1.1 app. WP8 is V1.1-adjacent marketing.

---

## Test plan (when coding starts)

- Existing Node suites must stay green.
- New tests: `buildSystemPrompt` omits empty slots; retrieval prefers overlapping facts; relationship brief appears in behavior context; no API key in snapshots.
- Browser: Ambient off in chat; reduced-motion hides canvas; stage chip readable in light/dark; sheets still scroll on 390; desktop 1440 three-pane intact.

---

## Recommendation

```text
PRODUCT:     PLAN V1.1 (architecture upgrades unchanged)
DESIGN:      PLAN V1.1 (Character Chromium + quiet motion + Ambient policy)
WEBSITE:     P1 after app screenshots
DEPENDENCIES: none
CODE THIS ROUND: none
NEXT ROUND:  WP0 → WP7, then stop for review before WP8
```
