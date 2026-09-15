<!-- Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 -->
<!-- Genre: editorial · Tone: soft companion · Theme: evolved Morning Mint · App family: Presence Workbench -->

# Design — EchoChat

A locked design system for this product. Every UI change reads this file before emitting code. Do not regenerate a per-page theme. Amend this file when the system itself needs to grow.

**Authority.** If an external design skill (Hallmark, Taste, Open Design, GSAP, Cinematic UI, UI/UX Pro Max, PencilPlaybook, landing generators) conflicts with this file, **this file wins**. Skills supply intelligence. They do not replace EchoChat product logic.

Skill availability is environment-dependent. EchoChat design authority is repository-dependent. Which skills exist, where they are installed, licenses, and whether they may be declared **Used**: [docs/design/SKILL_REGISTRY.md](docs/design/SKILL_REGISTRY.md). How to load them: [docs/design/AGENT_DESIGN_PROTOCOL.md](docs/design/AGENT_DESIGN_PROTOCOL.md).

Installing or upgrading a design skill is **infrastructure**. It is not a reason to reopen validated UI (commits `9708023`, `a33be33`) unless browser evidence or an explicit design conflict says otherwise.

---

## Product purpose

EchoChat is a local-first AI companion. The product relationship is one experience:

Character → Conversation → Relationship → Memory → Moments → Worldbook → Lived Continuity

The user must feel: *this is a space I share with a character who stays, remembers, and has been through things with me.*

EchoChat is not: a ChatGPT clone, a generic messenger, an Agent OS, a SaaS dashboard, Notion, a RAG demo, a plugin marketplace, a glassmorphism showcase, or a marketing site wearing a chat window.

Website (`/`) and app (`/app/`) **share language, not layout**. Do not restyle the app to match the landing. Do not restyle the landing as an app shell.

---

## Genre

editorial — quiet paper, typographic hierarchy, restrained accent.

Atmosphere is companion presence, not playful carnival and not brutalist terminal.

## Macrostructure family

- **App pages:** Presence Workbench. Desktop = inbox rail + conversation + companion home. Mobile = one surface at a time, with Companion as home.
- **App first-run (in-app welcome):** Letter, not a 3-feature card row.
- **Marketing `/`:** may use a Hallmark marketing macrostructure. Must not export that rhythm into `/app/`.

## Theme

Evolved Morning Mint. Keep the mint/sky memory. Do not invent a second brand.

Canonical CSS tokens live in `src/styles/tokens.css`. Existing `--color-*` names stay. Hex values on the core mint tokens stay unless this file is amended **and** `tests/ui_refinement_wave3b_test.mjs` / `wave4` token assertions are updated in the same change.

OKLCH is the *design* record. Implementation may keep hex that matches these values.

| Role | Token | Light value | Use |
|------|--------|-------------|-----|
| Paper / base | `--color-bg` `--color-surface-chat` | `#FAFCFB` ≈ oklch(98.4% 0.006 165) | App paper. Chat environment. |
| Surface | `--color-surface` | `#ffffff` | Sheets, composer, header chrome. |
| Surface 2 | `--color-surface-2` | `#F3F7F6` | Recessed wells (search). Not a card skin for every block. |
| Elevated | `--color-surface-elevated` | `#ffffff` | Overlay panes. Separate with border + scrim, not glow. |
| Ink | `--color-text` | `#243238` ≈ oklch(32% 0.022 220) | Titles, names, message body. |
| Muted | `--color-text-secondary` | `#5A6C72` | Supporting copy. |
| Tertiary | `--color-text-tertiary` | `#6B7C82` | Kickers, timestamps, inactive nav. |
| Accent (action) | `--color-primary` | `#7CB8E8` ≈ oklch(75% 0.078 240) | Primary buttons, focus, active interactive. Not large fills. |
| Mint (presence) | `--color-mint` | `#9DD9C2` ≈ oklch(83% 0.068 165) | Companion presence, user bubble tint, relationship cue. |
| Border | `--color-border` | `#E3ECE9` | Hairlines. Prefer one hairline over a card. |
| Relationship | `--color-relationship` | alias of mint-soft | Prose cue, never a meter. |
| Memory | `--color-memory` | alias of primary-soft | Source tags only. |
| Moments | `--color-moments` | alias of mint-soft | Day labels / trace tags, not gallery chrome. |
| Warning | `--color-warning` | `#E8C96A` | Recoverable issues. |
| Destructive | `--color-danger` | `#E57373` | Delete / reset. Never as brand accent. |

User appearance presets (sky / lavender / rose / sage / cloud) are **tints**, not a second brand. First-run stays Morning Mint. Dark theme keeps mint/sky; do not invert into cyber purple.

**Accent budget.** One chromatic accent in a view besides mint-as-presence. No purple-blue AI gradients. No large mint fills. No glow as decoration.

---

## Typography

`--font-family`: `"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif`.

Do not introduce Inter, Roboto, Geist, or a display serif as brand type for `/app/`. Chinese-first. Headings are roman (`font-style: normal`). Italic only inside running body copy.

| Role | Token | Size | Weight | Where |
|------|--------|------|--------|--------|
| Display | `--font-display` | 28px | 600 | In-app welcome title only |
| Heading | `--font-title` | 20px | 600 | Pane titles (陪伴, 痕迹, 我的), companion name |
| Section | `--font-section` | 17px | 600 | Empty titles, chat empty heading |
| Body / conversational | `--font-body` | 15px | 400 | Chat bubbles, identity lead. Never below 15px in chat. |
| Caption | `--font-caption` | 13px | 400 | Supporting, settings values |
| Label / kicker | `--font-label` / `--font-micro` | 12 / 11 | 500–600 | Section kickers, timestamps, nav labels |

Line-height: tight 1.3 titles · normal 1.5 UI · relaxed 1.7 conversation and identity lead.

One visual dominant per view. Companion Home: the person + current thread. Chat: the latest exchange. Moments: the day group. Me: the person, then controls.

---

## Shape

| Token | Value | Use |
|-------|--------|-----|
| `--radius-sm` | 8px | Inner controls |
| `--radius-md` | 12px | Inputs, chips, small surfaces |
| `--radius-lg` | 16px | Sheets, modals |
| `--radius-xl` | 20px | Rare large sheets |
| `--radius-pill` | 999px | Chips, primary send, first-run CTA only |

**Cards are not the default grouping device.** Group with whitespace, type, and a single hairline. A card is allowed when the object is itself a thing (a character in the inbox, a moment entry, a share card). Forbidden: wrapping every settings group, every profile section, and every empty region in a bordered rounded rectangle.

Buttons: primary = filled accent; secondary = quiet surface; ghost = text. Not every button is a pill.

Dividers: `1px solid var(--color-border)`. One per grouping, not around every row *and* the group.

---

## Depth

Default separation is **paper shift + hairline**, not shadow.

| Token | Use |
|-------|-----|
| none | Most app surfaces sit on `--color-bg` |
| `--shadow-sm` | Inbox character rows, overlay sheets only |
| `--shadow-md` / `--shadow-lg` | Modals |
| `--shadow-xl` | Compact-desktop companion overlay |
| `--shadow-glow` | **Do not use** in app chrome |

No generic glassmorphism. `--color-glass` and `--overlay-blur` exist for overlay scrims only. Overlay: dim + blur the world behind; the sheet itself is opaque elevated paper.

---

## Density

4pt scale: `--space-1` 4px through `--space-10` 40px.

| Density | Pages |
|---------|--------|
| Compact | Chat transcript, inbox list, settings rows (44px touch) |
| Comfortable | Companion Home, Moments timeline, Me identity |
| Spacious | In-app welcome, true empty states |

Touch targets 44px. Shell: rail 72 · list 320 (260 at 1024–1279) · profile 340 · bottom nav 56 + safe area. Persist companion home at `1280px` (`PROFILE_PERSIST_MIN_WIDTH`). Do not change those breakpoints without updating wave 3A/4 tests in the same change.

---

## Motion

Full language: [docs/design/MOTION.md](docs/design/MOTION.md).

| Band | Duration tokens | Use |
|------|-----------------|-----|
| Micro | `--dur-fast` 150ms | hover, press, focus |
| Standard | `--dur-normal` 250ms | sheets, tab crossfade, chat slide |
| Expressive | `--dur-slow` 350ms · `--dur-expressive` 480ms | companion overlay, reunion strip enter |
| Cinematic | `--dur-cinematic` 720ms | **rare**. Reunion after a long gap, first-run welcome only |

Ease: `--ease-out` / `--ease-in` / `--ease-in-out` / `--ease-drawer`. Animate `opacity` and `transform` only. Never `transition: all`. Honor `prefers-reduced-motion: reduce`: keep state feedback, drop decorative motion, hide ambient canvas.

Chat send, list scroll, and tab taps used 100+ times a day: almost no motion.

GSAP is not the default. Use CSS unless a continuity transition cannot be expressed in CSS. Target: ~90% CSS, ~10% GSAP, currently **0% GSAP**.

---

## Background

App paper is `--color-bg`. Chat uses the same paper (`--color-surface-chat`). Ambient particles stay off or weak in Chat (`src/ui/ambient-policy.js`). They are not the product. No decorative blobs, mesh gradients, or floating orbs in `/app/`.

---

## Layout principles

1. **One primary.** First glance: who / where / next action.
2. **Continuity over features.** Navigation presents Companion, Traces, Me as one life, not three products.
3. **Left-align identity.** Centered poster headers are a tell. Companion Home identity is a left row: face + name + stage.
4. **Asymmetry by importance**, not by decoration. Primary thread gets type weight; supporting worldbook does not get an equal card.
5. **Empty states tell the truth.** No fake memories, fake moments, fake metrics.
6. **Do not add widgets to fill space.** If a page looks empty, fix hierarchy, not inventory.

---

## Product surfaces

### Companion Home (`aside.companion-home`)

Not character settings. Not a dashboard.

- **PRIMARY:** who this is, and the current thread (last line or first-meet empty copy). One dominant.
- **SECONDARY:** relationship-as-prose + latest moment. No mint filled card. No affinity bar, hearts, XP, scores.
- **SUPPORTING:** about you, worldbook, 更多. Quieter type, not equal sections.

Overlay (<1280): sticky `继续聊天` / `开始聊天`. Edit 人设 stays in the action footer. Preferences / export / delete stay in 更多.

### Chat

Not a ChatGPT transcript. Not WeChat with mint paint.

- Header: face + name + stage / reunion. Opening companion home is the header, not a second banner.
- Her messages: paper bubble, hairline, **no drop shadow**. Grouped; name and time on group edges only.
- My messages: mint-soft fill, quiet mint hairline.
- Resume / recall: one strip from **real** last talk / memory / moment. Flattened, not a floating card.
- Composer: conversation, not a form. Starters fill the composer; they never auto-send.

### Memory (About You)

Continuity sheet is a journal of facts about the user. Each row: content, source, time, delete. No database chrome. No invented facts. Legend is one sentence, not three cards.

### Moments (Things We Experienced)

Day-grouped traces from real conversation. Not a gallery, table, or social feed. Likes/comments may exist as quiet actions; they must not dominate. Empty: one title, one explanation, one action to 去相处.

### Relationship

Prose context. `认识第N天` is calendar language, not a score. Never render `affinity.score|level|hearts`.

### Navigation

Three destinations only: 陪伴 (home) · 痕迹 (continuity) · 我的 (self + settings).

- Mobile: bottom bar while not inside a chat. Hide it during chat (`app-shell-chat`).
- Desktop: 72px rail. Not a SaaS sidebar of tools.
- Active: ink + mint indicator. Not a filled primary pill on every tab.
- 陪伴 is the home destination; 痕迹 and 我的 are quieter siblings, not equal “features”.

Do not add Memory, Relationship, or Worldbook as top-level tabs. Those live inside a character.

### Settings / 我的

Belongs to EchoChat, not iOS Settings and not a browser admin.

- Identity header is editorial (face + name), not a bordered profile card.
- Groups: 相处 (API, 记忆条数) · 氛围 (外观, 语音) · 数据 · 高级.
- Rows: 44px, icon well using primary-soft, chevron. Destructive actions use danger tone on the row, not a red page.

### Empty / loading / error

EmptyState: icon (optional) + title + one explanation + at most one primary action. Loading: existing skeletons. Error: inline copy + retry on the message, not a toast wall.

---

## Responsive

Verify at 390 · 640 · 768 · 1024 · 1200 · 1280 · 1440.

| Width | Behavior |
|-------|----------|
| <768 | One pane. Bottom nav. Chat slides over inbox. Companion home is a drawer + scrim. |
| 768–1023 | Inbox + chat. Companion home overlay. |
| 1024–1279 | Rail + compact list (260) + chat. Companion home overlay. |
| ≥1280 | Rail + list + chat + persistent companion home. Close control hidden. |

`html`/`body` must not horizontally scroll. Display titles wrap (`overflow-wrap: anywhere`). Image/grid tracks `minmax(0, 1fr)`.

---

## Accessibility

- `:focus-visible` 2px solid `--color-primary`, offset 2px, never animated.
- Body text on mint ≥ 4.5:1. Caption on paper ≥ 4.5:1.
- Icon buttons have `aria-label`.
- Reduced motion supported in `src/styles/motion.css` and `src/styles/base.css`.
- Do not use emoji as the icon system. SVG in `src/ui/components/index.js`.

---

## Anti-AI-slop (checkable)

Fail the change if two or more are true without a written rationale in the review:

- Every region is a rounded card
- Purple-blue or mint→sky hero gradient
- Glass / blur / glow used as decoration
- Shadow on every surface
- Everything centered
- Every button is a pill
- Title → card → card → button on every page
- Dashboard grid of widgets
- Fake metrics, fake memories, fake moments
- Generic SaaS Inter layout
- ChatGPT-like system transcript chrome
- Heart meter / XP / affinity bar
- Decorative blobs or particle demo in Chat
- `transition: all`
- Italic display headings

Full review form: [docs/design/DESIGN_REVIEW_TEMPLATE.md](docs/design/DESIGN_REVIEW_TEMPLATE.md).

---

## Visual quality gate

Before calling a page done:

1. **Hierarchy** — first / second / third glance named
2. **Density** — not empty, not admin-dense
3. **Typography** — at least three roles visible
4. **Color** — accent only on action / presence
5. **Depth** — hairline first
6. **Composition** — not equal stacked cards
7. **Variance** — Companion Home ≠ Chat ≠ Moments ≠ Me, same tokens
8. **Motion** — semantic or none
9. **Personality** — hide the logo: still a long-lived companion?

---

## Agent UI modification protocol

1. Read this file + `docs/design/AGENT_DESIGN_PROTOCOL.md` + the files you will touch
2. Answer: page job, user state, next action, hierarchy problems, DESIGN.md gaps
3. Classify the task; pick **one** Design Lead and 0–3 supporting skills
4. Design reasoning before CSS
5. Smallest implementation that fixes hierarchy
6. Covering tests, then `npm test` for the problem commit
7. Browser visual QA when tools exist
8. DESIGN.md compliance + anti-slop
9. Commit one complete UI subgoal (`design:` / `fix(ui):` / `refactor(ui):`)
10. Amend this file only when the system itself changed

Skill matrix: see AGENT_DESIGN_PROTOCOL.md.

---

## Do / Don't

**Do**

- Reuse tokens, chips, sheets, avatars, EmptyState
- Left-align companion identity
- Use real last-talk / moment / memory data for reunion
- Keep Character Continuity assembling through `assembleTurnContext`
- Evolve Morning Mint; keep mint/sky memory

**Don't**

- Pick a Hallmark catalog theme for `/app/`
- Add Shoelace, DaisyUI, shadcn, Radix, Tailwind, GSAP, or a new animation engine as defaults
- Add Live2D, per-character shaders, XP hearts
- Invent Memory / Moments content for visuals
- Change Memory schema, retrieval, Provider, Dexie, or `echodownload_*` keys in a UI task
- Copy marketing landing layout into the app

---

## Design decision rationale

| Decision | Why | Rejected |
|----------|-----|----------|
| Keep Morning Mint hex tokens | Brand memory + wave 3B/4 tests lock hex | Full OKLCH rewrite this round |
| Keep 3 nav destinations | Continuity needs Traces and Me reachable; burying them inside a character hides lived history | 5-tab feature list; chat-only with overflow |
| Companion Home left identity | Centered poster reads as a character sheet | Keep centered avatar stack |
| Relationship as prose | Product forbids meters | Mint filled relationship card (historical) |
| Chat bubbles without her-shadow | Shadowed white bubbles = WeChat clone | Keep `--shadow-sm` on her messages |
| No GSAP yet | CSS covers micro/standard/expressive | Timeline engine for every transition |
| Cards only for objects | Card-stacking was the main remaining slop after the companion-home IA pass | Wrap every section |

---

## What makes EchoChat look like EchoChat

Quiet mint paper. One person in the room. Conversation on that paper, not in chrome cards. Relationship spoken as days-known and a sentence, not a bar. Traces grouped by day. Settings look like the same house, quieter. If you hide the word EchoChat, it should still not look like ChatGPT, Character.AI, Notion, or a SaaS console.
