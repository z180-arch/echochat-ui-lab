# EchoChat UX / Visual Audit

**Date:** 2026-09-15  
**Evidence:** `src/ui/views/index.js`, `src/ui/components/index.js`, `src/styles/{tokens,layouts,components,motion,responsive}.css`, `src/ui/present.js`, mobile captures of `/app/` first-run, 痕迹 empty, 我的, Companion Home, Chat.  
**Not in scope:** architecture rewrite. Frozen layers recorded only in `FUTURE_ARCHITECTURE.md`.

Recent commits already shipped companion home IA, memory-as-about-you, moments day timeline, reunion-from-real-data, and settings row language. This audit does **not** redo that work. It names what still fails DESIGN.md.

---

## 1. Current UI — largest problems

1. **Companion Home identity is a centered poster.** `.profile-header { text-align: center }` + auto-margin avatar. Reads as a character sheet, not “our space”. File: `src/styles/layouts.css` `.profile-header`. User impact: first glance is a profile, not the current conversation.
2. **Companion Home still stacks equal kickers.** 正在聊 / 最近 / 我们 / 关于你 / 这个世界 are peer sections. PRIMARY is not visually dominant. File: `renderProfilePane`. User impact: no single next action besides the overlay button.
3. **Relationship is a mint filled card.** `.profile-relate` uses mint-soft fill + mint hairline + radius. The only “special” block is a card — the card-stacking tell. User impact: relationship looks like a widget, not prose context.
4. **Chat her-bubbles use card shadow.** `.msg-her .msg-bubble { box-shadow: var(--shadow-sm) }` + white fill. WeChat clone. File: `src/styles/components.css`. User impact: “pretty messenger”, not companion paper.
5. **Resume strip is a floating card.** `.resume-card` border + shadow. Competes with the transcript. File: `layouts.css`.
6. **Continuity sheet opens with three legend cards.** `.continuity-legend` 3-column equal cards (记忆 / 瞬间 / 相处). Classic AI feature row. File: `renderContinuitySheetContent`. User impact: Memory looks like a product tour.
7. **我的 identity is an iOS grouped card.** `.me-profile` surface + border + radius; settings groups are inset lists. File: `layouts.css` + `renderMePane`. User impact: Settings clone, not EchoChat.
8. **In-app welcome uses a 3-equal-card beat row.** `.welcome-beats` grid of bordered cards. Hallmark structural fingerprint. File: `renderLanding` + `layouts.css`. User impact: first-run feels like a marketing template inside the app.
9. **Navigation treats three destinations as equal app features.** Bottom nav active = `--color-primary` fill language; rail has a competing soft-fill in layouts (overridden in motion). User impact: 陪伴 / 痕迹 / 我的 feel like three products.
10. **Empty Moments still uses a circular icon well.** Generic empty-state glyph, not a blank diary page. File: `.empty-icon`. Copy is already good; the chrome is not.

---

## 2. Page-level

| Surface | Current | Problem | Direction | P |
|---------|---------|---------|-----------|---|
| Companion Home | Centered avatar, stacked kickers, mint relationship card | Character sheet / dashboard | Left identity row; thread = PRIMARY; 我们+最近 = SECONDARY prose; world = SUPPORTING | P0 |
| Chat | WeChat bubbles, shadowed her, resume card | ChatGPT/WeChat hybrid | Paper transcript, no her-shadow, flattened resume | P0 |
| Navigation | Equal 3-tab | Feature list | 陪伴 = home; ink active; mint indicator only | P0 |
| Memory sheet | 3 legend cards + journal | Feature explainer | One sentence + journal | P1 |
| Moments | Day timeline (good) + social action bar + circular empty | Gallery/social | Keep days; quiet actions; diary empty | P1 |
| Relationship | Mint card + brief | Widget | Prose only | P1 |
| 我的 / Settings | iOS grouped | Admin | Editorial identity; typographic groups | P1 |
| In-app welcome | 3 beat cards | Template | Vertical type beats, not cards | P2 (app first-run — do after P0 core) |
| Marketing `/` | Separate from app | Out of this audit’s P0 | Do not copy into app | P2 |

---

## 3. Component-level

| Component | File | Issue | Direction |
|-----------|------|-------|-----------|
| `EmptyState` | `components/index.js` + `.empty-icon` | 64px circular well | Keep API; visually quieter well |
| `RelationshipBrief` | `components/index.js` | Fine as prose; parent paints it as a card | Parent loses the card |
| Message bubble | `components.css` | Her shadow + dual borders | Hairline only |
| `me-profile` | `layouts.css` | Card | Editorial header |
| `welcome-beat` | `layouts.css` | Mini cards | Type stack |
| `continuity-legend-card` | `layouts.css` | 3-up cards | Delete pattern |
| Bottom nav | `layouts.css` | Equal feature tabs | Home-weighted, ink active |
| `recall-chip` | `components.css` | Pill is acceptable (chip object) | Keep |

---

## 4. Information architecture

Shipped IA is correct: Companion is the home; Moments and Me are not extra products; Memory / Worldbook / Relationship live inside a character; 更多 folds admin.

Remaining IA *presentation* bugs: equal kickers on Companion Home; equal tabs; Memory sheet teaches taxonomy with cards.

Do not add Memory or Worldbook to the tab bar.

---

## 5. Typography

Scale exists and is used. Failures: Companion Home name is centered display without a stronger PRIMARY thread line; Me page title “我的” then a card competes; chat body 15px is correct — do not shrink.

---

## 6. Color

Morning Mint tokens are coherent. Failures: mint used as a **filled relationship panel**; primary used as **nav identity**; her bubble white + shadow instead of paper.

Accent budget exceeded on Companion Home (mint card + stage chip + CTA).

---

## 7. Spacing / density

Inbox and chat are compact (correct). Companion Home overlay is comfortable but the centered header wastes vertical space before PRIMARY. Me page groups have too much card chrome for the density of controls.

---

## 8. Depth

Too much `--shadow-sm` on: her bubbles, resume card, welcome beats, legend cards, me-profile. Overlay companion pane correctly uses `--shadow-xl` at compact desktop.

---

## 9. Motion

Ripple system is already quiet. Issues: `transition: all` on `.tab` in `components.css`; like-bounce on moments; send-pulse scale is acceptable (micro). Reduced-motion already kills welcome stagger, ambient, bubble rise. Gap: `.tab { transition: all var(--motion) }` must be replaced with named properties.

---

## 10. Responsive

Breakpoints 768 / 1024 / 1280 are implemented and test-locked. No change this round. Visual QA still required at 390 after Companion Home left-align (name wrapping, close hit target).

---

## 11. Accessibility

Focus rings exist. Icon buttons labelled. Risk after redesign: companion identity row must keep the close control 44px; kickers-as-buttons already full-width.

---

## 12. Anti-AI-slop hits (current)

- Centered hero-like companion header
- Card stacking (me, welcome beats, legend, relationship)
- Her-bubble shadow
- Equal 3-column beats
- Title → card → card on 我的
- WeChat clone chat

Already **avoided** (do not regress): XP meters, fake memories, uppercase dashboard labels, purple AI gradient, particle chat demo, Inter.

---

## 13. EchoChat-only opportunities

- Reunion strip as the only “special” chrome in chat
- Companion Home as a room: face + current thread, everything else quieter
- Moments as a diary rail, not a feed
- Nav that implies “where we are in the life together”

---

## Priority

**P0** — Companion Home hierarchy · Chat paper · Navigation weighting  
**P1** — Memory legend · Moments empty/actions · Relationship card removal · Me/Settings chrome  
**P2** — In-app welcome beats · Marketing landing (after app core)

---

## What this round will not do

- Replace Morning Mint hex tokens
- Add GSAP
- Add nav destinations
- Invent Memory/Moments
- Thaw Dexie / assembleTurnContext / Provider
