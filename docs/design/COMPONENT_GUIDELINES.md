# Component Guidelines

Shared language, not identical silhouettes. Tokens: `src/styles/tokens.css`. Primitives: `src/ui/components/index.js`.

| Component | Shape | Depth | Motion | Notes |
|-----------|-------|-------|--------|-------|
| Button primary | pill or `--radius-md` | none | press + optional ripple | One per region |
| Button ghost / secondary | `--radius-md` | none | press | |
| Icon button | 44×44 | none | press | `aria-label` required |
| Input / textarea | `--radius-md` | hairline | focus ring instant | Chat composer is a cousin, not a form card |
| Modal / sheet | `--radius-lg` | overlay scrim + `--shadow-md` | standard drawer | Opaque paper, not glass |
| Drawer (companion overlay) | full-height pane | `--shadow-xl` + scrim | standard | |
| Card | only for objects (character row, moment, share card) | `--shadow-sm` max on inbox row | press on rows | Not for sections |
| Avatar | circle | optional 2px mint ring in chat header | none | Fallback = initial + mint/sky gradient |
| Badge / stage chip | pill | none | none | Relationship language, not XP |
| Tabs (bottom / rail) | none | hairline on bar | indicator `--dur-normal` | 陪伴 is home |
| Toast | `--radius-md` | `--shadow-md` | micro | Silent success preferred |
| Empty state | no card | no shadow | none | Title + one explanation + one action |
| Loading | skeleton | none | opacity | No spinner-as-brand |
| Error | inline | none | none | Retry on the message |
| Message (her) | `--radius-lg` 16px | **hairline only** | msg-rise unless reduced | Grouped |
| Message (me) | 16px | mint hairline, mint-soft fill | msg-rise | |
| Memory row | none | hairline between rows | none | Content + source + time + delete |
| Moment entry | comfortable block | hairline / day rail, not a gallery card | optional enter | Actions visually quiet |
| Character card (inbox) | list row | `--shadow-sm` optional | press | Object, so a row-card is allowed |
| Recall chip | pill | none | none | Real recall text only |

## States

Interactive chrome that ships in app must handle: default, hover (fine pointer), `:focus-visible`, `:active`, disabled. Loading / error / success where the control performs I/O (send, backup, memory confirm).

Do not force all eight states onto static text.

## Reuse

Do not add Shoelace, DaisyUI, shadcn, Radix, Tailwind, or a second icon set. Extend `Icons` in `components/index.js`.
