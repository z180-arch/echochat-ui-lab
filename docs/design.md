# EchoChat Design System

**Status:** HISTORICAL design research. V1.1 RC shipped at `403e721`.  
**Written at:** V1 Runtime `9f2a6b2` · Morning Mint frozen  
**Date:** 2026-09-02  
**Do not treat this file as unimplemented work.** Current state: [`docs/baseline/V1_1_RC_CURRENT_STATE.md`](baseline/V1_1_RC_CURRENT_STATE.md).

---

This document is the Design / Frontend / Motion layer. It **inherits** the V1.1 product strategy. It does not replace it.

---

## 0. What this round inherits

### Product strategy (do not redo)

Source of truth in this repo:

- `docs/OPEN_SOURCE_ARCHITECTURE_BENCHMARK.md` — architecture, companion loop, licenses, V1.1 upgrades
- `docs/baseline/CURRENT_STATE.md` — current product surfaces
- `docs/baseline/V1_BASELINE.md` — runtime/storage lock
- `docs/roadmap/ECHOCHAT_CURSOR_MASTER_ROADMAP.md` — Morning Mint freeze
- Existing UI Freeze: Morning Mint + Logo A Ripple (`docs/design/OPENDESIGN_PROMPT_polish-motion.md`)

Requested files **not present** in the repository (ignored, not reconstructed):

```text
docs/V1_1_PRE_IMPLEMENTATION_BRIEF.md
docs/PRODUCT_SURFACE_AND_DISTRIBUTION_BENCHMARK.md
docs/UI_UX_BENCHMARK.md
docs/MOTION_AND_INTERACTION_BENCHMARK.md
docs/VISUAL_ATMOSPHERE_BENCHMARK.md
```

Inherited product conclusions that design must serve:

```text
V1.1 product core = Character Continuity
via Context Builder slots
+ turn-relevant Memory
+ Relationship brief/events
+ Worldbook matcher already exists (editor later)
```

Do not build: plugins, character markets, Live2D/VRM, vector RAG, memU stack, affect-slider farms, ST prompt DSLs.

### Design freeze that this round also inherits

- Brand: **Morning Mint** + **Ripple**
- Primary `#7CB8E8` · Mint `#9DD9C2` · BG `#FAFCFB` · Text `#243238`
- Keywords: 安静、陪伴、回响、清透、克制
- Forbidden: purple AI gradients, neon, cyber-dark default, Inter/Roboto as brand type, emoji-as-icon language
- Welcome copy frozen: 标题 EchoChat · 一句「念念不忘，必有回响」 · 主按钮「创建角色」 · 次按钮「开始聊天」

---

## 1. Unified direction

```text
Product Strategy          Design System           Technical Reality
Character Continuity  +   Morning Mint / Ripple  +  CSS tokens + PWA
Memory retrieve-for-turn  Character presence        existing Ambient canvas
Relationship as brief     Quiet companion motion    zero new dependencies
                          Website ≠ App
                                    ↓
                    V1.1 Product + Design Direction
```

**One sentence:** EchoChat should look like a quiet companion you return to, not like a dashboard, not like a particle demo, and not like a marketing site wearing a chat window.

### Brand → surfaces

```text
EchoChat Brand (Morning Mint + Ripple)
        ↓
Shared Visual Language
  tokens · type · ripple mark · mint/sky pair · quiet motion
        ↓
 ┌─────────────────────┐
 ↓                     ↓
Website                Application
Discovery              Companion
Storytelling           Continuity
Marketing              Daily use
More motion budget     Less motion, more readability
Atmosphere allowed     Atmosphere mostly off in Chat
```

Website and App **share language, not layout**. Mobile Website is a vertical story. Mobile Application is a companion shell with bottom nav, sheets, and a sticky composer. Do not scale one into the other.

---

## 2. Visual philosophy

| Principle | Meaning for EchoChat |
|---|---|
| Character is the visual center | Avatar + name + stage must persist across Hub / Chat / Profile / Moments. Not a generic chat list. |
| Continuity over novelty | Design shows that the same person remembers you. Chrome stays stable so content can change. |
| Quiet temperature | Mint and sky are cool-warm, not neon. Emotion is in spacing and type, not glow stacks. |
| Frequency decides motion | Chat/send/nav happen all day → almost no animation. Welcome/first character → may delight. |
| Product-grade, not Dribbble | Every atmosphere effect needs a low-end and `prefers-reduced-motion` path. |
| Tokens before effects | If it cannot be a CSS variable or a named primitive, it is not in the system yet. |

Decision format used below:

```text
Reference → Principle → EchoChat problem → Decision → Implementation → Impact
```

---

## 3. Color · Morning Mint as Theme Foundation

Morning Mint is the **brand default**, not one of six equal skins.

Existing `src/styles/tokens.css` + `src/ui/theme.js` already map appearance to CSS variables. That is the foundation. Do not replace it with Open Props, Tailwind, or a second palette.

### Semantic layers (extend, do not rename wildly)

| Layer | Tokens today | V1.1 addition |
|---|---|---|
| Canvas | `--color-bg` | keep |
| Surface | `--color-surface` / `-2` / `-3` / `-elevated` | `--color-surface-chat` (explicit chat column) |
| Text | `--color-text` / `-secondary` / `-tertiary` | keep; never put body text on mint at <4.5:1 |
| Brand | `--color-primary` `#7CB8E8`, `--color-mint` `#9DD9C2` | `--color-ripple` = primary→mint gradient stops |
| Chat | `--color-bubble-me` (mint-soft), `--color-bubble-her` | keep; her bubble stays paper, not colored |
| Accent | presets in theme.js | presets are **user appearance**, not brand |
| Character | none | `--character-accent` slot (optional, default mint). Do not ship a per-character theme editor in V1.1 |

### Light / dark

Dark already exists as `[data-theme="dark"]`. Keep mint/sky hues; do not invert into cyber purple. Dark chat must keep bubble contrast. Ambient canvas must read theme colors (already does via `theme.js` → `Ambient`).

### Future themes

Presets (sky / lavender / rose / sage / cloud) stay as **user tint**. Brand marketing and default first-run stay Morning Mint. Do not add more presets in V1.1. The system is ready when a new preset is only four hues + bubble mapping, not a new CSS file.

### Character-specific accents

**P2 / later.** A single `--character-accent` derived from a chosen chip or a sampled avatar color can tint the profile ring and Hub card edge. It must never recolor the whole app. Live2D aura, mesh, or shader “character energy” is **Do Not Build**.

---

## 4. Typography

**App stack (frozen):** `"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif`

Do not introduce Inter, Roboto, or a display serif for “premium AI.” A website may later add one Latin display face for the English word *EchoChat* only, still pairing with the same CJK stack. That is **P2**.

| Role | Token | App | Website |
|---|---|---|---|
| Display | `--font-display` 28px | Welcome title only | Hero only |
| Title | `--font-title` 20px | Pane titles | Section titles |
| Section | `--font-section` 17px | Profile blocks | Feature heads |
| Body | `--font-body` 15px | Chat, forms | Story copy |
| Caption | `--font-caption` 13px | Meta, memory lines | Captions |
| Label / micro | 12 / 11 | Nav, badges | Footer, legal |

Weights: 400 body · 500 UI · 600 titles. Avoid 700 except logo wordmark.

Mobile app: do not shrink body below 15px. Desktop chat column max ~760px (already in `responsive.css`) is correct — companion reading, not full-bleed Slack.

---

## 5. Spacing · layout · density

Keep the 4px grid (`--space-1` … `--space-10`).

| Surface | Density |
|---|---|
| Desktop App | Rail 72 · list 320 · profile 340. Productive, not sparse marketing. |
| Mobile App | One column. Bottom nav 56 + safe area. Chat hides nav. Touch 44px. |
| Tablet | Rail + list + chat; profile as drawer (already). |
| Desktop Website | Wide canvas, large vertical rhythm, screenshots in device frames. |
| Mobile Website | Single column, large type, stacked CTAs, no app rail. |

Do not put the three-pane app shell on the marketing site. Do not put marketing-sized heroes inside Settings.

---

## 6. Components (code-facing)

Existing primitives in `src/ui/components/index.js` + CSS: buttons, sheets, toasts, icons, LogoMark, inputs, cards, bubbles.

V1.1 should **name and reuse**, not invent a React library.

### App primitives to keep / tighten

| Primitive | Rule |
|---|---|
| `LogoMark` / `.logo-ripple` | Brand signal in rail, splash, welcome. Not as a chat send icon. |
| Button | One primary per region. `:active` scale ~0.97. No ripple ink on every tap. |
| Sheet | Mobile settings / create / reconstruction. Sticky footer. visualViewport already required. |
| Modal | Desktop create/settings. Escape, overlay click, focus return. |
| Toast | 4–6s, do not cover sheets (V1 already). No bounce. |
| Avatar | Same size scale: 28 list · 36 chat header · 64–96 profile. Always a ring, not a raw circle dump. |
| Character card | Hub: avatar + name + last line + stage chip. Not a settings row. |
| Memory row | One line fact + source. Not a data table. |
| Relationship chip | Stage label, not a heart meter filling the header. |
| Moment card | Xiaohongshu-adjacent: media/text first, like/comment second. Not an admin log. |

### Do not add

Component libraries (Shoelace, DaisyUI, shadcn, Radix) as runtime. They fight zero-build and Morning Mint. **Reference only** for a11y patterns (dialog focus trap, sheet swipe).

---

## 7. Character presentation

```text
Reference: Companion products keep the person on screen; ST cards are data, Meuxe is a stage avatar.
Observation: Users bond with a face that stays, not with a prompt blob.
Principle: Character identity should remain visually present.
EchoChat problem: Character is a first-class entity, but Chat still feels like “a thread with an icon.”
Decision: One Character Chromium across Hub, Chat header, Profile, Moments.
Implementation: Shared avatar treatment, stage chip, name; Profile is the “this is a person” page; Chat never drops the header identity.
Impact: Continuity is visible even before memory retrieval is smarter.
```

**What “more than Prompt + Avatar + Chat” looks like visually (without new product features):**

- Hub is a **person list**, not an inbox dump
- Chat header shows name + stage (warming / familiar / close) quietly
- Profile groups Memory · Relationship · Worldbook as *about this person*, not as Settings clones
- Moments attributed with the same avatar language
- Empty chat still shows the character, not a generic illustration

**Not now:** 3D/Live2D, per-character wallpaper shaders, mood orbs, animated mouth.

---

## 8. Chat as companion (visual only)

Do not redo Chat IA. Change presence, not feature count.

| Detail | Do | Don't |
|---|---|---|
| Presence | Header avatar + name + stage | Full profile occupying the thread |
| Streaming | Existing typing tied to `status === "streaming"` | Extra bouncing dots after text is done |
| Rhythm | Message enter: 120–180ms opacity/translateY | Stagger every token |
| Memory | Optional one-line “想起了…” when a memory was actually injected (P1, after retrieve-for-turn exists) | Memory sidebar inside chat |
| Relationship | Stage chip; no XP bar | Gamified hearts |
| Moments | Deep link from a moment to chat, same chrome | Duplicate chat inside Moments |

WeChat-adjacent (supplement, not a clone): long-press actions on mobile, sticky composer, chat is the home of talking. Xiaohongshu-adjacent: Moments are content cards. Douyin-adjacent: **website** vertical sections only.

---

## 9. Application — Desktop

Shell (already correct, keep):

```text
nav-rail | list | chat | profile (when open)
```

| Region | Direction |
|---|---|
| Rail | Logo + Companion / Moments / Me. Hover labels ok. Keyboard: 1–3 or existing tab. |
| Hub / list | Character cards. Search. Density for scanning. Hover reveals continue / new chat. |
| Chat | Max width 760. Hover on bubbles for actions. Keyboard: Enter send, Esc stop. |
| Profile | Persistent column. Memory + relationship + worldbook as character knowledge, not a dump. |
| Settings | Desktop modal or pane. High density ok. |
| Hover | Allowed. Never the only way (mobile has no hover). |

Desktop is a **workplace for companionship**: keep three columns. Do not convert desktop into a marketing scroll.

---

## 10. Application — Mobile

Shell (already correct, keep):

```text
list / moments / me  + bottom nav
chat = full screen, nav hidden, back in header
profile = sheet/drawer
settings = sheet with sticky footer
```

| Topic | Direction |
|---|---|
| Bottom nav | Companion · Moments · Me. Hide in chat. |
| Gesture | Back is explicit ←. Optional edge-swipe later (P2). Overlay tap closes drawers. |
| Keyboard | Composer + visualViewport (V1). Do not restyle the OS keyboard. |
| Sheets | Round top, dim, no background scale circus. |
| Typography | 15px body, 44px targets. |
| Density | Taller rows than desktop. One primary action per card. |

Mobile Application ≠ Mobile Website. No hero, no feature storytelling, no particle-forward first screen after welcome.

---

## 11. Website — Desktop

The website is **not** the PWA shell. It is Discovery.

Recommended narrative (storytelling principle, not a page clone of Linear/Vercel/Arc):

```text
See (quiet hero: Ripple + 念念不忘，必有回响)
→ Understand (this is a companion, not a chatbot)
→ Meet a Character (one hero character, not a grid of 12)
→ Understand the loop (talk → remember → grow → moments)
→ See real product screens (Hub / Chat / Profile / Moments)
→ Want to use it
→ Enter product (CTA: 创建角色 / 打开应用)
```

| Block | Desktop Website |
|---|---|
| Nav | Logo, 产品, 角色, 打开应用. Thin, mint, not a mega-menu. |
| Hero | Full viewport, Ripple, frozen copy, two CTAs. Atmosphere **on**. |
| Character showcase | One character, large, with a short continuity story. |
| Feature story | Memory / Relationship / Moments as **scenes**, not icon grids. |
| Product screens | Framed screenshots of the real app. No fake dashboards. |
| CTA | Repeat 打开应用. Footer: privacy, local-first, license note. |
| Scroll | Section-based, not parallax theater. |
| Interactive demo | **P2.** Optional embedded welcome. Do not iframe the whole PWA until auth/perf is boring. |

### Scroll / motion on website

Hero entrance once per session. Section reveal: opacity + 12–20px translate, ~400ms, once. No scroll-jacking. No Lenis. Cursor-reactive particles: desktop website only, **P2**, never required.

---

## 12. Website — Mobile

Vertical storytelling, large type, stacked CTAs, screenshots full-bleed with padding.

| Block | Mobile Website |
|---|---|
| Nav | Logo + 打开. Hamburger only if more than 3 links. |
| Hero | Same copy, smaller Ripple, atmosphere weak. |
| Sections | One idea per screen-ish. No two-column feature walls. |
| Touch | Big CTA. No hover-only. |
| Motion | Shorter, fewer. Particles default **off** or **weak**. |
| Performance | No WebGL. No auto-playing Lottie. Screenshots compressed. |

Shared with Desktop Website: color, type, Ripple, copy, screenshot set. Not shared: column count, particle intensity, kinetic type amount.

---

## 13. Motion language

EchoChat motion is **ripple, not bounce; ease-out, not spring circus.**

Existing tokens already match a production ease-out:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--dur-fast: 150ms;
--dur-normal: 250ms;
--dur-slow: 350ms;
```

Add `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` for sheets (Ionic-like). Do not use `ease-in` for UI. Do not `transition: all`.

### Frequency rule (app)

| How often | Examples | Motion |
|---|---|---|
| 100+/day | Send, keyboard, tab switch | None or color only |
| Tens/day | Hover, list select | ≤150ms color/opacity |
| Occasional | Modal, sheet, toast | 200–350ms ease-out |
| Rare | Welcome, first character, splash | May use Ripple / type reveal |

### Website vs App

| | Website | App |
|---|---|---|
| Hero entrance | Yes, once | Welcome only |
| Scroll reveal | Yes, once per section | No |
| Page transition | Optional View Transitions between marketing pages | List→chat: 200–280ms push on mobile |
| Kinetic type | Hero only | Welcome slogan only (already) |
| Ambient | On (gated) | Off in Chat; weak on Hub optional |

### App motion map

| Object | Language |
|---|---|
| Page / list→chat | Horizontal push (mobile). Desktop: no full-page fade. |
| Modal | Opacity + 8px rise. Transform origin center. |
| Sheet | TranslateY from bottom, drawer ease. |
| Toast | Enter from the same edge it exits. |
| Nav | Active color; no icon bounce. |
| Button | Press scale 0.97, 100–140ms. |
| Card | Hover lift desktop only (`translateY(-1px)` + shadow). |
| Tab | Color/weight, no sliding pill theater. |
| Chat message | 120–180ms opacity. Streaming cursor already exists. |
| Typing | Only while `streaming`. |
| Character | Ring breathe **only** on welcome/profile hero, 4s, paused in reduced motion. |
| Memory / relationship | Content update, not a celebration animation. |

### Typography motion

**Website:** One mask-up or word stagger on the hero. Prefer **line/word**, not character, except the existing welcome slogan. Blur→sharp is expensive; if used, blur ≤8px, duration ≤500ms, hero only.

**App:** No kinetic headings on Hub, Settings, Moments. Chat is reading. Existing `.lead-char` on welcome is enough.

Accessibility: split text must keep full string in `aria-label`; fragments `aria-hidden`.

### Motion primitives to extract in CSS (no new library)

```text
.motion-enter          opacity + translateY(8px)
.motion-sheet          translateY + overlay
.motion-toast          translate from edge
.motion-press          :active scale(0.97)
.motion-ripple         logo concentric (exists)
.motion-type-welcome   lead-char stagger (exists)
.motion-msg            bubble enter
```

Implementation: CSS + Web Animations API for interruptible sheets if needed. **No GSAP, no Lottie, no anime.js, no Motion runtime in V1.1.**

View Transitions API: **P1** for mobile list→chat avatar continuity. Progressive enhancement; unsupported browsers snap.

---

## 14. Atmosphere / particles

EchoChat **already has** `src/ui/ambient.js`: canvas particles + low-res caustic buffer, intensity `off|weak|medium|strong`, theme-colored, `prefers-reduced-motion` → layer hidden.

```text
Reference: Creative sites use ambient fields; companion apps need readable chat.
Principle: Atmosphere belongs to arrival, not to conversation.
EchoChat problem: A global canvas under #app can fight chat contrast and battery if left on Strong.
Decision: Keep the in-house canvas. Do not add tsParticles / WebGL / shaders. Constrain where it runs.
```

| Surface | Atmosphere |
|---|---|
| Splash / Welcome / Website hero | Weak–Medium. This is the brand room. |
| Hub / Moments / Me | Off or Weak. Default **Weak** desktop, **Off** mobile. |
| Chat | **Off.** Reading wins. |
| Profile | Off. Character photo is the atmosphere. |
| Website inner sections | CSS gradient mesh only, no extra canvas. |
| Cursor interaction | Not in App. Website desktop **P2** at most. |

**Grain / noise:** Optional 2–4% CSS overlay on website hero only. Not in chat.

**Character aura:** CSS ring + existing Ripple. Not particles bound to the avatar.

**WebGL / mesh shaders / floating 3D:** **Do Not Build.** Battery, complexity, zero-build conflict.

**tsParticles:** MIT, capable, generic look, extra payload. **Reference only. Do not depend.**

Fallbacks:

- `prefers-reduced-motion: reduce` → no canvas, no type stagger, static logo (already)
- Low-end / save-data: force Off
- Mobile: never default Strong
- Refine reduced-motion later: do not nuke *all* 150ms color transitions (current `*` override is blunt; P1 to scope it)

**How much atmosphere?** Enough that Welcome feels like water and air. Not enough that Chat looks like a demo. If you notice the particles while reading a reply, it is too much.

---

## 15. Theme system → code

```text
tokens.css          :root variables (source of visual truth)
theme.js            appearance → inline CSS variables + Ambient colors
[data-theme]        light / dark
[data-theme-preset] user tint
--character-accent  optional later
motion.css          primitives + ambient layer
prefers-reduced-motion
```

Do not introduce Style Dictionary / Tailwind / PostCSS for V1.1. Open Props is a **taxonomy reference**: named easings, shadows, z-index. Copy ideas into `tokens.css`, not the CDN.

Responsive tokens already: `--sidebar-width`, `--list-width`, `--bottom-nav-height`, `--safe-top/bottom`. Add `--motion-ok: 1` flipped by reduced-motion if JS needs a single gate (Ambient already checks the media query).

---

## 16. Responsive system

Breakpoints (keep):

```text
<768   mobile app
768–1023 tablet
≥1024  desktop app
≥1440  extra chat padding
```

Website can use the same cuts but different components. Test 390 and 1440 as V1 already does.

---

## 17. Accessibility

| Area | Rule |
|---|---|
| Contrast | Text on mint-soft / primary-soft must pass WCAG AA. Primary buttons use `--color-primary-fg`. |
| Focus | Visible ring. Do not `outline: none` without replacement. |
| Keyboard | Desktop chat and settings fully operable. |
| Touch | 44px. |
| Screen reader | Logo decorative `aria-hidden`; toasts `role="status"`; sheets labelled. |
| Reduced motion | Ambient off; type reveal skipped; spatial transitions optional snap. |
| Chat | Do not announce every streamed token. |

---

## 18. Performance

| Choice | Why |
|---|---|
| CSS transform/opacity only for UI motion | Compositor-friendly |
| One canvas, low-res caustic buffer (already) | Cheaper than full-res shaders |
| Pause canvas when tab hidden / chat focused | Battery |
| No Lottie JSON | Extra decode + frozen frames in View Transitions |
| No smooth-scroll library | Hijacks and jank |
| Screenshots for website, not live WebGL | Predictable LCP |
| Zero new npm for V1.1 | Matches PWA policy |

---

## 19. Open-source frontend research

Goal was not a library wishlist. Filter: technique → principle → cost → mobile → a11y → license → EchoChat fit.

### Native (use)

| Technique | Use |
|---|---|
| CSS custom properties | Already the design system |
| CSS animations / WAAPI | Sheets, welcome, toasts |
| `color-mix(in oklab, …)` | Already in motion.css |
| Canvas 2D | Existing Ambient |
| View Transitions API | P1 list↔chat |
| `prefers-reduced-motion` | Already |

### Reference only (do not add as dependency)

| Repository | License | Why reference | Why not depend |
|---|---|---|---|
| [argyleink/open-props](https://github.com/argyleink/open-props) | MIT | Token taxonomy, easings, shadows | EchoChat already has tokens; CDN would fight brand |
| [tsparticles/tsparticles](https://github.com/tsparticles/tsparticles) | MIT | Particle performance patterns | Generic look; we have Ambient; extra bundle |
| [juliangarnier/anime](https://github.com/juliangarnier/anime) | MIT | Timeline taste | CSS covers V1.1; new dep |
| [motiondivision/motion](https://github.com/motiondivision/motion) | MIT | Mini animate (~2.6kb), WAAPI wrapper | Useful later for website; not needed in app |
| [lukePeavey/SplitType](https://github.com/lukePeavey/SplitType) | ISC | Word/line split | Welcome already splits chars; a11y cost |
| [airbnb/lottie-web](https://github.com/airbnb/lottie-web) | MIT | After Effects pipeline | AE workflow, payload, overkill for Ripple SVG |
| MDN View Transitions / WAAPI | n/a | Native page morph | — |
| Emil Kowalski / animations.dev | education | Frequency + easing rules | — |
| every-layout / Utopia (fluid type) | education | Website fluid type later | App should stay token px for chat stability |
| Radix / shadcn / Shoelace | MIT (varies) | Dialog a11y, sheet patterns | React/WC runtime does not fit zero-build app |

### Do not use

| Item | Reason |
|---|---|
| GSAP (Webflow, closed source) | License can be terminated; copyleft-adjacent risk vs our PolyForm tree; overkill |
| Three.js / fragment shaders | Demo-grade, battery |
| Lenis / scrolljack | Fights mobile and a11y |
| Particle wallpaper packs | Visual demo |

### Potential dependency (not V1.1)

If a **marketing website** later needs interruptible timelines: **Motion Mini** (MIT, tiny, WAAPI). Re-evaluate then. App stays CSS.

**Copyleft reminder:** frontend MIT/ISC is generally safer than the AGPL companion apps studied last round. Still: **learn, don’t paste** large third-party files into the PWA.

---

## 20. Product strategy × design (the join)

| Product V1.1 (inherited) | How design visualizes it | What not to do |
|---|---|---|
| Character slots in Context Builder | Profile shows those slots as human sections (identity / scenario / voice). Chat header stays the person. | Don’t expose “system prompt” as a marketing badge. |
| Memory retrieve-for-this-turn | Memory list is a journal. Optional “想起了” chip in chat **only when retrieval actually fired**. | Don’t decorate a dump of top-10 facts. |
| Conservative memory write | Confirm sheet, not confetti. | Don’t auto-play celebration. |
| Relationship brief/events | Stage chip + a short “最近发生” line on Profile. Same chip in Chat header. | Don’t build an RPG meter. |
| Worldbook matcher | Profile/settings editor (P1). Keyword entries look like notes. | Don’t visualize recursion. |
| Moments | Content cards; same Character Chromium. | Don’t make Moments the memory engine. |
| Local-first | Website footer and Me/settings: data stays on device. Quiet, not a privacy manifesto wall. | Don’t scare-dark UI. |

If a visual idea does not help Continuity, Memory, Relationship, or arrival (Welcome/Website), it is out.

---

## 21. What enters which horizon

### P0 — V1.1 design that ships with the product loop

1. **Character Chromium** on Hub / Chat header / Profile / Moments (avatar scale, stage chip, name).
2. **Atmosphere policy** in existing Ambient: Chat = off; mobile default off/weak; keep reduced-motion.
3. **Motion primitives named in CSS** (enter, sheet, press, msg) using current easings. No new library.
4. **Profile as character home** (Memory / Relationship grouped as the person, not cloned Settings).
5. Token comments / 1–2 semantic variables (`--color-surface-chat`, `--ease-drawer`) if needed while doing the above.

These ride along **product P0** (Context Builder, memory retrieve, relationship brief). Design does not wait for a website.

### P1

- Worldbook editor UI (product hole, Morning Mint forms)
- User persona block in Me + quiet prompt injection (product + a small form)
- Optional “想起了” chip after retrieve-for-turn works
- View Transitions for mobile list→chat
- Scope `prefers-reduced-motion` so 150ms color changes survive
- Marketing **website design implementation** after real screenshots exist
- Website hero: one type reveal + existing Ambient at weak/medium

### P2 / later

- `--character-accent` ring
- Website cursor-reactive field
- Motion Mini on website only
- Fluid type on website
- Edge-swipe back
- Proactive message UI (only if product wires the domain)

### NOT NOW / Do not build

- tsParticles, GSAP, Lottie, WebGL, shader mesh
- Kinetic headings inside the app
- Particle chat backgrounds
- Live2D / VRM / ACP stage
- Component-library rewrite
- Extra theme packs
- Scroll-jacked marketing
- Character market visual
- Mood orb / affect sliders

### Keep as-is (good enough)

- Welcome copy and Ripple logo
- Chat bubble colors
- Desktop three-pane / mobile bottom nav
- Token palette and appearance presets
- Toast/sheet overflow fixes from V1
- Composer 2000 counter, streaming typing cleanup

### Website timing

**After** Character Chromium exists in the app so the site can show truth. Website is **P1**, not a gate for companion V1.1. In-app Welcome remains the current “landing.”

### App UI timing

**Now**, in the same V1.1 wave as the three architecture upgrades — visual continuity is how those upgrades are felt.

### Motion timing

Extract primitives **while** touching those pages. Do not a dedicated “motion festival” sprint.

### Particles timing

**Constrain now** (policy). Do not add new particle systems. Website may reuse Ambient.

---

## 22. Engineering path (when implementation starts)

```text
Design token (tokens.css)
  → theme.js writes computed vars
  → component CSS
  → motion primitive class
  → page (Hub / Chat / Profile / Moments / Welcome)
  → Ambient policy per route
```

Rules for implementers:

1. No product code in this research round (already honored).
2. Next round: still no new npm.
3. Do not break SiliconFlow / Qwen path.
4. Do not break V1 responsive chat/composer.
5. Prefer extending `motion.css` / `tokens.css` / views over new visual systems.

---

## 23. Decision log (this round)

| Topic | Verdict |
|---|---|
| Particles | Keep in-house Ambient. Welcome/Website only by default. Chat off. No tsParticles. |
| Kinetic type | Welcome + future website hero. Not app chrome. |
| Website vs App | Shared tokens and Ripple. Different IA and motion budget. |
| Mobile web vs mobile app | Story vs companion shell. Never unify into one layout. |
| New JS motion libs | None in V1.1. |
| Morning Mint | Frozen brand. Presets remain user tint. |
| Character visual | Chromium + Profile home. No 3D. |
| Chinese apps | WeChat composer/long-press; Xiaohongshu Moments cards; Douyin only as website vertical rhythm. |

This file is the design source of truth going forward. Implementation order lives in `docs/V1_1_IMPLEMENTATION_PLAN.md`.
