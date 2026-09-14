# EchoChat Design System

**Status:** Shipped. Morning Mint / Ripple is **frozen**.  
**Not** the marketing landing. Tokens live in `src/styles/tokens.css` and `src/styles/motion.css`.

Do not restyle the application shell. New in-app UI is **component-scope**: reuse existing tokens, chips, cards, sheets.

Do not introduce: a new theme kit, a new animation system, a component library, or a particle-demo chat background.

---

## One sentence

EchoChat should look like a quiet companion you return to — not a dashboard, not a marketing site wearing a chat window.

Website (`/`) and app (`/app/`) **share language, not layout**.

---

## Color (Morning Mint)

| Token | Light |
|-------|--------|
| `--color-bg` / `--color-surface-chat` | `#FAFCFB` |
| `--color-surface` | `#ffffff` |
| `--color-text` | `#243238` |
| `--color-text-secondary` | `#5A6C72` |
| `--color-primary` | `#7CB8E8` |
| `--color-mint` | `#9DD9C2` |
| `--color-border` | `#E3ECE9` |

User appearance presets (sky / lavender / rose / sage / cloud) are **tints**, not a second brand. Default first-run stays Morning Mint. Dark theme keeps mint/sky; do not invert into cyber purple.

Forbidden: purple AI gradients, neon, Inter/Roboto as brand type, emoji-as-icon language. Body text on mint must stay ≥ 4.5:1.

---

## Type

`--font-family`: Noto Sans SC / PingFang SC / Microsoft YaHei / system-ui.

| Role | Token | Size |
|------|-------|------|
| Display | `--font-display` | 28px |
| Title | `--font-title` | 20px |
| Section | `--font-section` | 17px |
| Body | `--font-body` | 15px |
| Caption | `--font-caption` | 13px |
| Label / micro | `--font-label` / `--font-micro` | 12 / 11 |

Weights 400 / 500 / 600. Do not shrink chat body below 15px.

---

## Spacing

4pt grid: `--space-1` 4px through `--space-10` 40px.

Shell: rail 72 · list 320 · profile 340 · bottom nav 56 + safe area. Touch targets 44px.

---

## Cards

Radius `--radius-md` (12) for content, `--radius-lg` (16) for sheets, `--radius-pill` for chips. Border `1px solid var(--color-border)`. Shadow `--shadow-sm` default. Reuse hub cards, `.share-card`, profile panels — do not invent a third card language.

---

## Motion

`--dur-fast` 150ms · `--dur-normal` 250ms · `--dur-slow` 350ms. Ease `--ease-out`. Prefer opacity + transform. Chat/send/nav: almost none. Honor `prefers-reduced-motion`. No bounce.

Ambient particles stay off or weak in Chat. They are not the product.

---

## Components to reuse

`src/ui/components/index.js`: buttons, sheets, toasts, avatars, chips.  
Starters (`.chat-starters .chip-btn`) fill the composer only — never auto-send.

Do not add Shoelace, DaisyUI, shadcn, Radix, or Tailwind as runtime.

---

## Character on screen

Hub is a person list. Chat header keeps name + stage. Profile is “this is a person,” not a settings clone. Not now: Live2D, per-character shaders, XP hearts.
