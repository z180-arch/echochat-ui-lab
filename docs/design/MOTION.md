# EchoChat Motion Language

Implementation: `src/styles/motion.css`, duration tokens in `src/styles/tokens.css`.  
Policy: `src/ui/ambient-policy.js` (Chat ambient off/weak).

Motion exists to explain **state change** and **continuity**. It does not decorate.

---

## Bands

| Band | Duration | Tokens | Use | Frequency |
|------|----------|--------|-----|-----------|
| Micro | 100–180ms | `--dur-fast` 150ms | hover, :active press, focus (ring is instant, never faded) | tens/day |
| Standard | 180–320ms | `--dur-normal` 250ms | sheet/drawer, tab crossfade, mobile chat slide, overlay scrim | occasional |
| Expressive | 320–600ms | `--dur-slow` 350ms, `--dur-expressive` 480ms | companion home overlay, reunion strip enter, first-meet empty | rare |
| Cinematic | 600ms+ | `--dur-cinematic` 720ms | long-gap reunion, first-run welcome letter only | very rare |

Semantic first. A reunion after 30 days may use expressive even if a stylesheet default is standard. A send button used 100 times a day stays micro or none.

---

## Easing

- `--ease-out` — default UI
- `--ease-in` — exits
- `--ease-in-out` — paired moves
- `--ease-drawer` — sheets

Never browser default `ease`. Never bounce/overshoot on chrome (`like-bounce` on Moments is a known exception to remove if it reads as gamey). Never `transition: all`.

Animate **opacity** and **transform** only.

---

## Surface recipes

| Interaction | Recipe |
|-------------|--------|
| Button press | `transform: scale(0.97)` on `:active`, `--dur-fast` |
| Primary ripple | existing `.btn-primary::after` — keep; not on every control |
| Sheet / modal | `--ease-drawer` translateY; overlay opacity |
| Tab change | 250ms opacity + 6px translateY on pane, not on the tap itself |
| Chat open (mobile) | 250ms translateX 12% → 0 |
| New message | `msg-rise` 350ms — skip if reduced-motion |
| Send | 400ms scale pulse on the button only |
| Companion overlay | standard drawer; no cinematic unless reunion copy is showing |
| Ambient canvas | off in Chat; hide entirely under reduced-motion |

---

## Continuity vs emotional

- **Continuity:** resume strip appear, tab crossfade, overlay open — standard.
- **Emotional:** reunion after ≥7 days, first-run welcome — expressive / cinematic.
- **Never emotional:** settings, forms, CRUD, worldbook editor, API fields.

---

## Reduced motion

`@media (prefers-reduced-motion: reduce)` must:

- Keep hierarchy and press feedback (opacity or none)
- Drop ambient canvas, welcome stagger, bubble rise, tab fly-in
- Keep focus rings instant

If you add a new animation, add it to the reduced-motion kill list in `motion.css` and `base.css`.

---

## GSAP

Not default. Allowed only when CSS cannot express a continuity transition (shared-element companion → chat, sequenced reunion). Current shipped code: **no GSAP**. Do not add the library for microinteractions.

---

## Anti-patterns

- Animating layout properties (`top`, `height`, `padding`)
- Looping decorative motion in Chat
- Staggered card-rise on every list
- Celebration toasts
- Cinematic on settings
